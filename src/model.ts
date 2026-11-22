type CaseValue = { id: string; label: string };
type CompetingAction = CaseValue & { probability: number };

export const unknownCaseLabel = "Unknown";

export function caseValueDisplayLabel(label: string): string {
  return label.trim().toLowerCase() === unknownCaseLabel.toLowerCase() ? `${label} (modeled value)` : label;
}

export interface DecideModel {
  caseInput: {
    id: string;
    label: string;
    values: CaseValue[];
  };
  decision: {
    title: string;
    applicability: {
      value: string;
      condition: string;
      citation: string;
    };
    distribution: {
      convention: string;
      guidance: CompetingAction;
    };
  };
}

type DecisionOutcome =
  | { status: "missing" }
  | { status: "unmet" }
  | { status: "applicable"; action: string; doNotConsiderScore: number };

export function evaluateDecision(decision: DecideModel["decision"], caseValue: string | null): DecisionOutcome {
  if (caseValue === null) return { status: "missing" };
  if (caseValue !== decision.applicability.value) return { status: "unmet" };

  const action = decision.distribution.guidance;
  return { status: "applicable", action: action.label, doNotConsiderScore: 1 - action.probability };
}
