import { compareDecimals, evaluateDecision, type MultiModel } from "./model.ts";

function object(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${description}`);
  return value as Record<string, unknown>;
}

export function verifyCategorical(model: MultiModel, content: string): MultiModel {
  const data = object(JSON.parse(content), "verification cases");
  if (data.version !== 1 || !Array.isArray(data.cases)) throw new Error("Invalid verification cases version or cases");
  const decisions = model.routes.flatMap((route) => route.decisions);
  const ids = new Set<string>();
  const results = new Map(decisions.map(({ id }) => [id, { failed: false, states: new Set<string>(), boundaries: new Set<number>() }]));
  for (const raw of data.cases) {
    const entry = object(raw, "verification case");
    if (typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id)) throw new Error("Invalid or duplicate verification case id");
    ids.add(entry.id);
    const decision = decisions.find(({ id }) => id === entry.decision);
    if (!decision) throw new Error(`Unknown verification decision "${String(entry.decision)}"`);
    const inputs = object(entry.inputs, `inputs for case "${entry.id}"`);
    const expected = object(entry.expected, `expected result for case "${entry.id}"`);
    if (Object.keys(inputs).some((key) => key !== decision.caseInput.id)) throw new Error(`Invalid Case Input in case "${entry.id}"`);
    const value = inputs[decision.caseInput.id];
    const input = decision.caseInput;
    const numeric = "type" in input;
    if (value !== undefined && ("type" in input
      ? typeof value !== "number" || !Number.isFinite(value)
      : typeof value !== "string" || !input.values.some(({ id }) => id === value))) {
      throw new Error(`Invalid Case Input value in case "${entry.id}"`);
    }
    if (!["applicable", "unmet", "missing"].includes(String(expected.state))) throw new Error(`Invalid expected state in case "${entry.id}"`);
    if (expected.state === "applicable") {
      if (typeof expected.guidance !== "string" || typeof expected.score !== "number" || !Number.isFinite(expected.score) || expected.score < 0 || expected.score > 1) throw new Error(`Invalid expected guidance or score in case "${entry.id}"`);
    } else if ("guidance" in expected || "score" in expected) throw new Error(`Unexpected guidance or score in case "${entry.id}"`);
    const actual = evaluateDecision(decision.decision, value === undefined ? null : value as string | number);
    const outcome = results.get(decision.id)!;
    outcome.states.add(actual.status);
    if (numeric && value !== undefined && "operator" in decision.decision.applicability) {
      outcome.boundaries.add(compareDecimals(String(value), decision.decision.applicability.threshold));
    }
    if (actual.status !== expected.state || (actual.status === "applicable" &&
      (decision.decision.distribution.guidance.id !== expected.guidance || Math.abs(actual.doNotConsiderScore - (expected.score as number)) > 1e-12))) {
      outcome.failed = true;
    }
  }
  const routes = model.routes.map((route) => ({
    ...route,
    decisions: route.decisions.filter(({ id, caseInput }) => {
      const result = results.get(id)!;
      return !result.failed && ["applicable", "unmet", "missing"].every((state) => result.states.has(state))
        && (!("type" in caseInput) || [-1, 0, 1].every((boundary) => result.boundaries.has(boundary)));
    }),
  })).filter((route) => route.decisions.length);
  if (!routes.length) throw new Error(`No verified decisions: ${decisions.map(({ id }) => id).join(", ")}`);
  return { version: 2, routes };
}
