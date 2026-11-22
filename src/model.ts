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
  | { kind: "all" | "any"; operands: NetworkCondition[] };

export interface NetworkDecision {
  action: { node: string; id: string; label: string };
  inputs: { id: string; values: string[]; node: string; required: boolean; states?: string[] }[];
  condition: NetworkCondition;
  nodes: NetworkNode[];
}

type NetworkOutcome =
  | { status: "missing" | "invalid"; inputs: string[] }
  | { status: "unmet" }
  | { status: "applicable"; action: ActionReference; doNotConsiderScore: number }
  | { status: "applicable"; action: ActionReference; scoreUnavailable: { reason: "missing"; inputs: string[] } | { reason: "zero-likelihood" } };

/** Evaluate source applicability before using the decision's declared scoring evidence. */
export function evaluateNetworkDecision(decision: NetworkDecision, values: Record<string, string | undefined>): NetworkOutcome {
  const overrides: Record<string, string> = Object.create(null);
  const valueFor = (id: string) => Object.hasOwn(overrides, id) ? overrides[id] : Object.hasOwn(values, id) ? values[id] : undefined;
  type ConditionResult = { state: "true" | "false" | "missing" | "invalid"; inputs: string[] };
  function conditionResult(condition: NetworkCondition): ConditionResult {
    if (condition.kind === "equals") {
      const input = decision.inputs.find(({ id }) => id === condition.input)!;
      const value = valueFor(input.id);
      if (value === undefined || value === "") return { state: "missing", inputs: [input.id] };
      if (!input.values.includes(value)) return { state: "invalid", inputs: [input.id] };
      return { state: value === condition.value ? "true" : "false", inputs: [] };
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
    // A repeated input can correlate predicates in different branches. Check
    // whether varying each unanswered input can actually change the outcome
    // while the other unanswered inputs have the same values.
    const relevant = applicability.inputs.filter((candidate) => {
      const others = applicability.inputs.filter((id) => id !== candidate);
      const candidates = decision.inputs.find(({ id }) => id === candidate)!.values;
      function affects(index: number): boolean {
        const states = candidates.map((value) => {
          overrides[candidate] = value;
          return conditionResult(decision.condition).state;
        });
        delete overrides[candidate];
        if (states.every((state) => state === "true") || states.every((state) => state === "false")) return false;
        if (index === others.length) return states.includes("true") && states.includes("false");
        const id = others[index];
        for (const value of decision.inputs.find((input) => input.id === id)!.values) {
          overrides[id] = value;
          if (affects(index + 1)) {
            delete overrides[id];
            return true;
          }
        }
        delete overrides[id];
        return false;
      }
      return affects(0);
    });
    if (relevant.length) return { status: "missing", inputs: relevant };
    for (const id of applicability.inputs) overrides[id] = decision.inputs.find((input) => input.id === id)!.values[0];
    const settled = conditionResult(decision.condition).state;
    for (const id of applicability.inputs) delete overrides[id];
    if (settled === "false") return { status: "unmet" };
  }
  const invalid = decision.inputs.filter(({ id, values: allowed }) => {
    const value = valueFor(id);
    return value && !allowed.includes(value);
  }).map(({ id }) => id);
  if (invalid.length) return { status: "invalid", inputs: invalid };
  const action = { id: decision.action.id, label: decision.action.label };
  const missing = decision.inputs.filter(({ id, required }) => required && !valueFor(id)).map(({ id }) => id);
  if (missing.length) return { status: "applicable", action, scoreUnavailable: { reason: "missing", inputs: missing } };
  const evidence: Record<string, string> = Object.create(null);
  for (const input of decision.inputs) {
    const value = valueFor(input.id);
    if (value) evidence[input.node] = input.states?.[input.values.indexOf(value)] ?? value;
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
  } | { id: string; label: string; type: "numeric"; unit: string };
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

export interface NetworkModelDecision {
  id: string;
  caseInputs: CategoricalCaseInput[];
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
