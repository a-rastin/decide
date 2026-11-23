type CaseValue = { id: string; label: string };
type ActionReference = { id: string; label: string };
type CompetingAction = ActionReference & { probability: number };

export const unknownCaseLabel = "Unknown";

export interface NetworkNode {
  id: string;
  states: string[];
  parents: string[];
  rows: { when: string[]; probabilities: number[] }[];
}

export type NetworkCondition =
  | { kind: "equals"; input: string; value: string }
  | { kind: "compare"; input: string; operator: NumericOperator; threshold: string }
  | { kind: "all" | "any"; operands: NetworkCondition[] };

type NumericOperator = "lt" | "lte" | "eq" | "gt" | "gte";
export type NumericRange = {
  min?: string;
  max?: string;
  minInclusive: boolean;
  maxInclusive: boolean;
  state: string;
};

export interface NetworkDecision {
  action: { node: string; id: string; label: string };
  inputs: ({ id: string; node: string; required: boolean } & (
    { values: string[]; states?: string[] } | { ranges: NumericRange[] }
  ))[];
  condition: NetworkCondition;
  nodes: NetworkNode[];
}

type NetworkOutcome =
  | { status: "missing" | "invalid"; inputs: string[] }
  | { status: "unmet" }
  | { status: "applicable"; action: ActionReference; doNotConsiderScore: number }
  | { status: "applicable"; action: ActionReference; scoreUnavailable: { reason: "missing"; inputs: string[] } | { reason: "zero-likelihood" } };

function sourceThresholds(condition: NetworkCondition, id: string): string[] {
  if ("operands" in condition) return condition.operands.flatMap((operand) => sourceThresholds(operand, id));
  return condition.kind === "compare" && condition.input === id ? [condition.threshold] : [];
}

function orderedThresholds(values: string[]) {
  return values.sort(compareDecimals).filter((value, i, sorted) => i === 0 || compareDecimals(sorted[i - 1], value) !== 0);
}

export function numericThresholds(decision: NetworkDecision, input: Extract<NetworkDecision["inputs"][number], { ranges: NumericRange[] }>) {
  const thresholds = sourceThresholds(decision.condition, input.id);
  for (const { min, max } of input.ranges) {
    if (min !== undefined) thresholds.push(min);
    if (max !== undefined) thresholds.push(max);
  }
  return orderedThresholds(thresholds);
}

function matchesComparison(order: number, operator: NumericOperator) {
  return { lt: order < 0, lte: order <= 0, eq: order === 0, gt: order > 0, gte: order >= 0 }[operator];
}

function observedState(input: NetworkDecision["inputs"][number], value: string) {
  if ("values" in input) {
    const index = input.values.indexOf(value);
    return index === -1 ? undefined : input.states?.[index] ?? value;
  }
  if (!decimalLiteral.test(value)) return undefined;
  return input.ranges.find(({ min, max, minInclusive, maxInclusive }) =>
    (min === undefined || matchesComparison(compareDecimals(value, min), minInclusive ? "gte" : "gt")) &&
    (max === undefined || matchesComparison(compareDecimals(value, max), maxInclusive ? "lte" : "lt"))
  )?.state;
}

/** Evaluate source applicability before using the decision's declared scoring evidence. */
export function evaluateNetworkDecision(decision: NetworkDecision, values: Record<string, string | undefined>): NetworkOutcome {
  type Candidate = string | ((threshold: string) => number);
  const overrides = new Map<string, Candidate>();
  const entered = new Map(decision.inputs.map((input) => {
    const raw = Object.hasOwn(values, input.id) ? values[input.id] : undefined;
    const value = "ranges" in input ? raw?.trim() : raw;
    return [input.id, { value, state: value ? observedState(input, value) : undefined }];
  }));
  type ConditionResult = { state: "true" | "false" | "missing" | "invalid"; inputs: string[] };
  function conditionResult(condition: NetworkCondition): ConditionResult {
    if ("input" in condition) {
      const id = condition.input;
      const entry = entered.get(id)!;
      const override = overrides.get(id);
      const value = override ?? entry.value;
      if (!value) return { state: "missing", inputs: [id] };
      if (override === undefined && entry.state === undefined) return { state: "invalid", inputs: [id] };
      const matches = condition.kind === "equals" ? value === condition.value
        : matchesComparison(typeof value === "function" ? value(condition.threshold)
          : compareDecimals(value, condition.threshold), condition.operator);
      return { state: matches ? "true" : "false", inputs: [] };
    }
    const results = condition.operands.map(conditionResult);
    const decisive = condition.kind === "all" ? "false" : "true";
    if (results.some(({ state }) => state === decisive)) return { state: decisive, inputs: [] };
    const invalid = results.filter(({ state }) => state === "invalid");
    if (invalid.length) return { state: "invalid", inputs: [...new Set(invalid.flatMap(({ inputs }) => inputs))] };
    const missing = results.filter(({ state }) => state === "missing");
    if (missing.length) return { state: "missing", inputs: [...new Set(missing.flatMap(({ inputs }) => inputs))] };
    return { state: condition.kind === "all" ? "true" : "false", inputs: [] };
  }
  const applicability = conditionResult(decision.condition);
  if (applicability.state === "false") return { status: "unmet" };
  if (applicability.state === "invalid") return { status: "invalid", inputs: applicability.inputs };
  if (applicability.state === "missing") {
    const candidatesById = new Map<string, Candidate[]>(applicability.inputs.map((id) => {
      const input = decision.inputs.find((input) => input.id === id)!;
      if ("values" in input) return [id, input.values] as const;
      const thresholds = orderedThresholds(sourceThresholds(decision.condition, id));
      // Applicability is constant in each open interval and at each threshold.
      // Use their order rather than rounding or constructing decimal midpoints.
      return [id, Array.from({ length: 2 * thresholds.length + 1 }, (_, position) =>
        (threshold: string) => Math.sign(position - (2 * thresholds.findIndex((value) => compareDecimals(value, threshold) === 0) + 1)))] as const;
    }));
    // A repeated input can correlate predicates in different branches. Check
    // whether varying each unanswered input can actually change the outcome
    // while the other unanswered inputs have the same values.
    const relevant = applicability.inputs.filter((candidate) => {
      const others = applicability.inputs.filter((id) => id !== candidate);
      const candidates = candidatesById.get(candidate)!;
      function affects(index: number): boolean {
        const states = candidates.map((value) => {
          overrides.set(candidate, value);
          return conditionResult(decision.condition).state;
        });
        overrides.delete(candidate);
        if (states.every((state) => state === "true") || states.every((state) => state === "false")) return false;
        if (index === others.length) return states.includes("true") && states.includes("false");
        const id = others[index];
        for (const value of candidatesById.get(id)!) {
          overrides.set(id, value);
          if (affects(index + 1)) {
            overrides.delete(id);
            return true;
          }
        }
        overrides.delete(id);
        return false;
      }
      return affects(0);
    });
    if (relevant.length) return { status: "missing", inputs: relevant };
    for (const id of applicability.inputs) overrides.set(id, candidatesById.get(id)![0]);
    const settled = conditionResult(decision.condition).state;
    overrides.clear();
    if (settled === "false") return { status: "unmet" };
  }
  const invalid = decision.inputs.filter(({ id }) => {
    const { value, state } = entered.get(id)!;
    return value && state === undefined;
  }).map(({ id }) => id);
  if (invalid.length) return { status: "invalid", inputs: invalid };
  const action = { id: decision.action.id, label: decision.action.label };
  const missing = decision.inputs.filter(({ id, required }) => required && !entered.get(id)!.value).map(({ id }) => id);
  if (missing.length) return { status: "applicable", action, scoreUnavailable: { reason: "missing", inputs: missing } };
  const evidence: Record<string, string> = Object.create(null);
  for (const input of decision.inputs) {
    const state = entered.get(input.id)!.state;
    if (state !== undefined) evidence[input.node] = state;
  }
  const posterior = inferPosterior(decision.nodes, decision.action.node, decision.action.id, evidence);
  return posterior === null
    ? { status: "applicable", action, scoreUnavailable: { reason: "zero-likelihood" } }
    : { status: "applicable", action, doNotConsiderScore: 1 - posterior };
}

/** Exact enumeration over a validated, topologically ordered network. */
export function inferPosterior(
  nodes: NetworkNode[], action: string, selected: string, evidence: Record<string, string>,
): number | null {
  const assignment: Record<string, string> = Object.create(null);
  // Accumulate log masses so products of small nonzero probabilities do not
  // turn possible evidence into impossible evidence through underflow.
  let total = -Infinity;
  let selectedTotal = -Infinity;
  function addLogMass(left: number, right: number) {
    const larger = Math.max(left, right);
    return larger + Math.log1p(Math.exp(Math.min(left, right) - larger));
  }
  function visit(index: number, weight: number): void {
    if (index === nodes.length) {
      total = addLogMass(total, weight);
      if (assignment[action] === selected) selectedTotal = addLogMass(selectedTotal, weight);
      return;
    }
    const node = nodes[index];
    const row = node.rows.find(({ when }) => when.every((value, i) => assignment[node.parents[i]] === value))!;
    node.states.forEach((state, i) => {
      if (!row.probabilities[i] || (Object.hasOwn(evidence, node.id) && evidence[node.id] !== state)) return;
      assignment[node.id] = state;
      visit(index + 1, weight + Math.log(row.probabilities[i]));
    });
    delete assignment[node.id];
  }
  visit(0, 0);
  return total === -Infinity ? null : Math.min(1, Math.exp(selectedTotal - total));
}

export function caseValueDisplayLabel(label: string): string {
  return label.trim().toLowerCase() === unknownCaseLabel.toLowerCase() ? `${label} (modeled value)` : label;
}

export interface DecideModel {
  caseInput: {
    id: string;
    label: string;
    values: CaseValue[];
  } | NumericCaseInput;
  decision: {
    title: string;
    applicability: ({
      value: string;
    } | {
      operator: "lt" | "lte" | "gt" | "gte";
      threshold: string;
    }) & {
      condition: string;
      citation: string;
    };
    distribution: {
      convention: string;
      guidance: CompetingAction;
    };
  };
}

export type CategoricalCaseInput = { id: string; label: string; values: CaseValue[] };
type NumericCaseInput = {
  id: string;
  label: string;
  type: "numeric";
  unit: string;
  sampling?: { min: string; max: string; samples: string[] };
};
export type NetworkCaseInput = CategoricalCaseInput | NumericCaseInput;

export interface NetworkModelDecision {
  id: string;
  caseInputs: NetworkCaseInput[];
  decision: NetworkDecision & {
    title: string;
    applicability: { condition: string; citation: string };
    convention: string;
  };
}

export type RoutedDecision = (DecideModel & { id: string }) | NetworkModelDecision;

export interface RoutedModel {
  version: 2 | 3;
  partial?: boolean;
  routes: { id: string; label: string; decisions: RoutedDecision[] }[];
}

type DecisionOutcome =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "unmet" }
  | { status: "applicable"; action: ActionReference; doNotConsiderScore: number };

export const decimalLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function decimalParts(value: string) {
  const [mantissa, exponent = "0"] = value.toLowerCase().split("e");
  const negative = mantissa.startsWith("-");
  const [whole, fraction = ""] = mantissa.replace(/^[+-]/, "").split(".");
  const digits = (whole + fraction).replace(/^0+/, "").replace(/0+$/, "");
  if (!digits) return { sign: 0, digits: "", magnitude: 0n };
  const leading = (whole + fraction).replace(/^0+/, "");
  return { sign: negative ? -1 : 1, digits, magnitude: BigInt(exponent) + BigInt(leading.length - fraction.length) };
}

export function compareDecimals(left: string, right: string): number {
  const a = decimalParts(left), b = decimalParts(right);
  if (a.sign !== b.sign) return Math.sign(a.sign - b.sign);
  if (!a.sign) return 0;
  if (a.magnitude !== b.magnitude) return (a.magnitude > b.magnitude ? 1 : -1) * a.sign;
  const length = Math.max(a.digits.length, b.digits.length);
  const ad = a.digits.padEnd(length, "0"), bd = b.digits.padEnd(length, "0");
  return (ad === bd ? 0 : ad > bd ? 1 : -1) * a.sign;
}

export function evaluateDecision(decision: DecideModel["decision"], caseValue: string | number | null): DecisionOutcome {
  if (caseValue === null) return { status: "missing" };
  const applicability = decision.applicability;
  if ("operator" in applicability) {
    const literal = String(caseValue).trim();
    if (!literal) return { status: "missing" };
    if (!decimalLiteral.test(literal)) return { status: "invalid" };
    const comparison = compareDecimals(literal, applicability.threshold);
    const matches = { lt: comparison < 0, lte: comparison <= 0, gt: comparison > 0, gte: comparison >= 0 };
    if (!matches[applicability.operator]) return { status: "unmet" };
  } else if (caseValue !== applicability.value) return { status: "unmet" };

  const { id, label, probability } = decision.distribution.guidance;
  return { status: "applicable", action: { id, label }, doNotConsiderScore: 1 - probability };
}
