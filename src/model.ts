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

/** Exact enumeration over a validated, topologically ordered network. */
export function inferPosterior(
  nodes: NetworkNode[], action: string, selected: string, evidence: Record<string, string>,
): number | null {
  const assignment: Record<string, string> = {};
  let total = 0;
  let selectedTotal = 0;
  function visit(index: number, weight: number): void {
    if (index === nodes.length) {
      total += weight;
      if (assignment[action] === selected) selectedTotal += weight;
      return;
    }
    const node = nodes[index];
    const row = node.rows.find(({ when }) => when.every((value, i) => assignment[node.parents[i]] === value))!;
    node.states.forEach((state, i) => {
      if (Object.hasOwn(evidence, node.id) && evidence[node.id] !== state) return;
      assignment[node.id] = state;
      visit(index + 1, weight * row.probabilities[i]);
    });
    delete assignment[node.id];
  }
  visit(0, 1);
  return total === 0 ? null : selectedTotal / total;
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

export interface MultiModel {
  version: 2;
  partial?: boolean;
  routes: { id: string; label: string; decisions: (DecideModel & { id: string })[] }[];
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
