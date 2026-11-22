import { compareDecimals, evaluateDecision, evaluateNetworkDecision, numericThresholds, type RoutedDecision, type RoutedModel } from "./model.ts";

const boundaryChecks = [[-1, "below"], [0, "at"], [1, "above"]] as const;

function object(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${description}`);
  return value as Record<string, unknown>;
}

function evaluateCase(
  decision: RoutedDecision, inputs: Record<string, unknown>, caseId: string, literals?: Map<string, string>,
) {
  if ("caseInputs" in decision) {
    const values: Record<string, string> = Object.create(null);
    for (const [id, value] of Object.entries(inputs)) {
      const input = decision.caseInputs.find((entry) => entry.id === id);
      if (!input) throw new Error(`Invalid Case Input "${id}" in case "${caseId}"`);
      const literal = "type" in input ? (typeof value === "number" ? literals?.get(id) : undefined)
        : input.values.find((entry) => entry.id === value)?.id;
      if (literal === undefined) throw new Error(`Invalid Case Input value for "${id}" in case "${caseId}"`);
      values[id] = literal;
    }
    return { actual: evaluateNetworkDecision(decision.decision, values) };
  }
  if (Object.keys(inputs).some((key) => key !== decision.caseInput.id)) throw new Error(`Invalid Case Input in case "${caseId}"`);
  const input = decision.caseInput;
  const value = Object.hasOwn(inputs, input.id) ? inputs[input.id] : undefined;
  const numeric = "type" in input;
  let caseValue: string | null = null;
  if (value !== undefined) {
    if (numeric && typeof value === "number") {
      caseValue = literals?.get(input.id) ?? null;
    } else if (!numeric && typeof value === "string" && input.values.some(({ id }) => id === value)) {
      caseValue = value;
    }
    if (caseValue === null) throw new Error(`Invalid Case Input value in case "${caseId}"`);
  }
  const applicability = decision.decision.applicability;
  const boundary = numeric && caseValue !== null && "operator" in applicability
    ? compareDecimals(caseValue, applicability.threshold) : undefined;
  return { actual: evaluateDecision(decision.decision, caseValue), boundary };
}

export function verifyCases(model: RoutedModel, content: string) {
  // Keep JSON numbers typed as numbers for schema checks, but use the original
  // tokens for thresholds, where even a small rounding error can change the outcome.
  const numberLiterals = new WeakMap<object, Map<string, string>>();
  const data = object(JSON.parse(content, function (this: object, key: string, value: unknown, context?: { source: string }) {
    if (typeof value === "number" && context) {
      const literals = numberLiterals.get(this) ?? new Map<string, string>();
      literals.set(key, context.source);
      numberLiterals.set(this, literals);
    }
    return value;
  }), "verification cases");
  if (data.version !== 1 || !Array.isArray(data.cases)) throw new Error("Invalid verification cases version or cases");
  const decisions = model.routes.flatMap((route) => route.decisions);
  const ids = new Set<string>();
  const results = new Map(decisions.map((decision) => {
    const thresholds = "caseInputs" in decision ? decision.decision.inputs.flatMap((input) =>
      "ranges" in input ? numericThresholds(decision.decision, input).map((threshold) =>
        ({ input: input.id, threshold, boundaries: new Set<number>() })) : []) : [];
    return [decision.id, { failures: [] as string[], checks: [] as string[], states: new Set<string>(), boundaries: new Set<number>(), thresholds }];
  }));
  for (const raw of data.cases) {
    const entry = object(raw, "verification case");
    if (typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id)) throw new Error("Invalid or duplicate verification case id");
    ids.add(entry.id);
    const decision = decisions.find(({ id }) => id === entry.decision);
    if (!decision) throw new Error(`Unknown verification decision "${String(entry.decision)}"`);
    const inputs = object(entry.inputs, `inputs for case "${entry.id}"`);
    const expected = object(entry.expected, `expected result for case "${entry.id}"`);
    const literals = numberLiterals.get(inputs);
    const { actual, boundary } = evaluateCase(decision, inputs, entry.id, literals);
    if (!["applicable", "unmet", "missing"].includes(String(expected.state))) throw new Error(`Invalid expected state in case "${entry.id}"`);
    if (expected.state === "applicable") {
      if (typeof expected.guidance !== "string" || typeof expected.score !== "number" || !Number.isFinite(expected.score) || expected.score < 0 || expected.score > 1) throw new Error(`Invalid expected guidance or score in case "${entry.id}"`);
    } else if ("guidance" in expected || "score" in expected) throw new Error(`Unexpected guidance or score in case "${entry.id}"`);
    const outcome = results.get(decision.id)!;
    outcome.states.add(actual.status);
    if (boundary !== undefined) outcome.boundaries.add(boundary);
    const actualResult = actual.status === "applicable"
      ? { state: actual.status, guidance: actual.action.id, ...("doNotConsiderScore" in actual
        ? { score: actual.doNotConsiderScore } : { scoreUnavailable: actual.scoreUnavailable }) }
      : { state: actual.status };
    if (actual.status !== expected.state || (actual.status === "applicable" &&
      (actual.action.id !== expected.guidance || !("doNotConsiderScore" in actual) ||
        Math.abs(actual.doNotConsiderScore - (expected.score as number)) > 1e-12))) {
      outcome.failures.push(`Case ${entry.id}: expected ${JSON.stringify(expected)}; actual ${JSON.stringify(actualResult)}`);
    } else {
      outcome.checks.push(`Case ${entry.id}: passed`);
      for (const { input, threshold, boundaries } of outcome.thresholds) {
        const value = literals?.get(input);
        if (value !== undefined) boundaries.add(compareDecimals(value, threshold));
      }
    }
  }
  for (const decision of decisions) {
    const result = results.get(decision.id)!;
    for (const state of ["applicable", "unmet", "missing"]) {
      if (!result.states.has(state)) result.failures.push(`Insufficient coverage: missing ${state} case`);
    }
    if ("caseInput" in decision && "type" in decision.caseInput) {
      for (const [boundary, label] of boundaryChecks) {
        if (!result.boundaries.has(boundary)) result.failures.push(`Insufficient coverage: missing case ${label} threshold`);
      }
    }
    for (const { input, threshold, boundaries } of result.thresholds) {
      for (const [boundary, label] of boundaryChecks) {
        if (!boundaries.has(boundary)) result.failures.push(`Insufficient coverage: missing case ${label} threshold ${threshold} for Case Input "${input}"`);
      }
    }
  }
  const routes = model.routes.map((route) => ({
    ...route,
    decisions: route.decisions.filter(({ id }) => {
      const result = results.get(id)!;
      return !result.failures.length;
    }),
  })).filter((route) => route.decisions.length);
  if (!routes.length) throw new Error(`No verified decisions: ${decisions.map(({ id }) => `${id}: ${results.get(id)!.failures.join("; ")}`).join("; ")}`);
  return { model: { version: model.version, routes }, results };
}
