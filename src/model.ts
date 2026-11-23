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
    { values: string[]; states: string[] } | { ranges: NumericRange[] }
  ))[];
  condition: NetworkCondition;
  nodes: NetworkNode[];
}

function sourceThresholdsByInput(condition: NetworkCondition) {
  const thresholdsByInput = new Map<string, string[]>();
  function collect(condition: NetworkCondition) {
    if ("operands" in condition) {
      condition.operands.forEach(collect);
      return;
    }
    const thresholds = thresholdsByInput.get(condition.input) ?? [];
    if (condition.kind === "compare") thresholds.push(condition.threshold);
    thresholdsByInput.set(condition.input, thresholds);
  }
  collect(condition);
  return thresholdsByInput;
}

/** Domains that can change source predicates, independent of network states. */
export function applicabilityDomains(decision: NetworkDecision) {
  return [...sourceThresholdsByInput(decision.condition)].map(([id, thresholds]) => {
    const input = decision.inputs.find((input) => input.id === id)!;
    if ("values" in input) return { id, candidates: input.values };
    const ordered = orderedThresholds([...thresholds]);
    const positions = new Map(thresholds.map((threshold) =>
      [threshold, 2 * ordered.findIndex((value) => compareDecimals(value, threshold) === 0) + 1]));
    // Predicates are constant between adjacent thresholds. Compare positions
    // rather than constructing decimal midpoints for those open intervals.
    return { id, candidates: Array.from({ length: 2 * ordered.length + 1 }, (_, index) =>
      (threshold: string) => Math.sign(index - positions.get(threshold)!)) };
  });
}

type UnmetOutcome = { status: "unmet"; invalidInputs?: string[] };

type NetworkOutcome =
  | { status: "missing" | "invalid"; inputs: string[] }
  | UnmetOutcome
  | { status: "applicable"; action: ActionReference; doNotConsiderScore: number }
  | { status: "applicable"; action: ActionReference; scoreUnavailable: { reason: "missing"; inputs: string[] } | { reason: "zero-likelihood" } };

function orderedThresholds(values: string[]) {
  return values.sort(compareDecimals).filter((value, i, sorted) => i === 0 || compareDecimals(sorted[i - 1], value) !== 0);
}

export function numericThresholds(decision: NetworkDecision, input: Extract<NetworkDecision["inputs"][number], { ranges: NumericRange[] }>) {
  const thresholds = sourceThresholdsByInput(decision.condition).get(input.id) ?? [];
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
    return index === -1 ? undefined : input.states[index];
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
  function conditionResult(condition: NetworkCondition): boolean | undefined {
    if ("input" in condition) {
      const id = condition.input;
      const entry = entered.get(id)!;
      const override = overrides.get(id);
      const value = override ?? entry.value;
      if (!value || (override === undefined && entry.state === undefined)) return undefined;
      return condition.kind === "equals" ? value === condition.value
        : matchesComparison(typeof value === "function" ? value(condition.threshold)
          : compareDecimals(value, condition.threshold), condition.operator);
    }
    const decisive = condition.kind === "any";
    let undecided = false;
    for (const operand of condition.operands) {
      const result = conditionResult(operand);
      if (result === decisive) return decisive;
      if (result === undefined) undecided = true;
    }
    return undecided ? undefined : !decisive;
  }
  const applicability = conditionResult(decision.condition);
  const invalid = decision.inputs.filter(({ id }) => {
    const { value, state } = entered.get(id)!;
    return value && state === undefined;
  }).map(({ id }) => id);
  if (applicability === false) return invalid.length ? { status: "unmet", invalidInputs: invalid } : { status: "unmet" };
  if (invalid.length) return { status: "invalid", inputs: invalid };
  if (applicability === undefined) {
    let combinations = 1;
    const dimensions = applicabilityDomains(decision).filter(({ id }) => !entered.get(id)!.value)
      .map((domain) => {
        const stride = combinations;
        combinations *= domain.candidates.length;
        return { ...domain, stride };
      });
    // Evaluate each completion once, then compare entries that differ in just
    // one dimension. Repeated predicates share the same input in every entry.
    const truth = new Uint8Array(combinations);
    for (let i = 0; i < combinations; i++) {
      for (const { id, candidates, stride } of dimensions) {
        overrides.set(id, candidates[Math.floor(i / stride) % candidates.length]);
      }
      truth[i] = Number(conditionResult(decision.condition));
    }
    const relevant = dimensions.filter(({ stride, candidates }) =>
      truth.some((value, i) => Math.floor(i / stride) % candidates.length !== 0 &&
        value !== truth[i - stride])).map(({ id }) => id);
    if (relevant.length) return { status: "missing", inputs: relevant };
    if (!truth[0]) return { status: "unmet" };
  }
  const action = { id: decision.action.id, label: decision.action.label };
  const missing = decision.inputs.filter(({ id, required }) => required && !entered.get(id)!.value).map(({ id }) => id);
  if (missing.length) return { status: "applicable", action, scoreUnavailable: { reason: "missing", inputs: missing } };
  const evidence: Record<string, string> = Object.create(null);
  for (const input of decision.inputs) {
    const state = entered.get(input.id)!.state;
    if (state !== undefined) evidence[input.node] = state;
  }
  // Sum the competing actions directly: subtracting a rounded posterior from
  // one can erase small but representable scores.
  const score = inferActionProbability(decision.nodes, decision.action.node, (state) => state !== decision.action.id, evidence);
  return score === null
    ? { status: "applicable", action, scoreUnavailable: { reason: "zero-likelihood" } }
    : { status: "applicable", action, doNotConsiderScore: score };
}

/** Exact enumeration over a validated, topologically ordered network. */
export function inferPosterior(
  nodes: NetworkNode[], action: string, selected: string, evidence: Record<string, string>,
): number | null {
  return inferActionProbability(nodes, action, (state) => state === selected, evidence);
}

function inferActionProbability(
  nodes: NetworkNode[], action: string, includes: (state: string) => boolean, evidence: Record<string, string>,
): number | null {
  const assignment: Record<string, string> = Object.create(null);
  const binary = new DataView(new ArrayBuffer(8));
  const factors = new Map([[1, { significand: 1n, exponent: 0 }]]);
  function exactFactor(probability: number) {
    const cached = factors.get(probability);
    if (cached) return cached;
    binary.setFloat64(0, probability);
    const bits = binary.getBigUint64(0);
    const biasedExponent = Number(bits >> 52n);
    const fraction = bits & ((1n << 52n) - 1n);
    const factor = {
      significand: biasedExponent === 0 ? fraction : (1n << 52n) + fraction,
      exponent: Math.max(1, biasedExponent) - 1075,
    };
    factors.set(probability, factor);
    return factor;
  }

  // Keep exact masses of the validated binary64 weights until division.
  // This prevents both underflow and evidence-dependent rounding of equal scores.
  let included = 0n, excluded = 0n, commonExponent = 0;
  function visit(index: number, significand: bigint, exponent: number): void {
    if (index === nodes.length) {
      if (exponent < commonExponent) {
        const shift = BigInt(commonExponent - exponent);
        included <<= shift;
        excluded <<= shift;
        commonExponent = exponent;
      }
      const mass = significand << BigInt(exponent - commonExponent);
      if (includes(assignment[action])) included += mass;
      else excluded += mass;
      return;
    }
    const node = nodes[index];
    const row = probabilityRow(node, assignment);
    node.states.forEach((state, i) => {
      const probability = row[i];
      if (!probability || (Object.hasOwn(evidence, node.id) && evidence[node.id] !== state)) return;
      assignment[node.id] = state;
      const factor = exactFactor(probability);
      visit(index + 1, significand * factor.significand, exponent + factor.exponent);
    });
    delete assignment[node.id];
  }
  visit(0, 1n, 0);
  const total = included + excluded;
  return total === 0n ? null : roundedProbability(included, total);
}

const rowsByNode = new WeakMap<NetworkNode, Map<string, number[]>>();

function probabilityRow(node: NetworkNode, assignment: Record<string, string>) {
  if (node.parents.length === 0) return node.rows[0].probabilities;
  let table = rowsByNode.get(node);
  if (!table) {
    table = new Map(node.rows.map(({ when, probabilities }) => [JSON.stringify(when), probabilities]));
    rowsByNode.set(node, table);
  }
  return table.get(JSON.stringify(node.parents.map((id) => assignment[id])))!;
}

function roundedProbability(numerator: bigint, denominator: bigint) {
  if (numerator === 0n) return 0;
  if (numerator === denominator) return 1;
  let exponent = numerator.toString(2).length - denominator.toString(2).length;
  if ((numerator << BigInt(-exponent)) < denominator) exponent--;
  // Scale to 53 significant bits, or to the smallest subnormal quantum.
  // Round once, to nearest with ties to even, like a binary64 division.
  const shift = Math.min(1074, 52 - exponent);
  const scaled = numerator << BigInt(shift);
  let rounded = scaled / denominator;
  const twiceRemainder = 2n * (scaled % denominator);
  if (twiceRemainder > denominator || (twiceRemainder === denominator && rounded % 2n !== 0n)) rounded++;
  return Number(rounded) * 2 ** -shift;
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
  | UnmetOutcome
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
    if (!matchesComparison(compareDecimals(literal, applicability.threshold), applicability.operator)) return { status: "unmet" };
  } else if (caseValue !== applicability.value) return { status: "unmet" };

  const { id, label, probability } = decision.distribution.guidance;
  return { status: "applicable", action: { id, label }, doNotConsiderScore: 1 - probability };
}
