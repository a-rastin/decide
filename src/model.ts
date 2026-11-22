type CaseValue = { id: string; label: string };
type CompetingAction = CaseValue & { probability: number };

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

export function evaluateDecision(decision: DecideModel["decision"], caseValue: string | null) {
  if (caseValue !== decision.applicability.value) return null;

  const action = decision.distribution.guidance;
  return { action: action.label, doNotConsiderScore: 1 - action.probability };
}
