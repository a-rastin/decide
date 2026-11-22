import { Button } from "@heroui/react";
import { useId, useState } from "react";
import { CaseInputFields, CaseResultDetails, caseInputsFor, caseValue, evaluateCase, type CaseModel, type CaseResult, type CaseValues } from "./case.tsx";

const differenceFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 6, signDisplay: "exceptZero" });

function whyUnavailable(result: CaseResult): string | undefined {
  if (result.status === "missing") return "needs Case Inputs to determine whether guidance applies";
  if (result.status === "invalid") return "has an invalid Case Input";
  if (result.status === "unmet") return "has guidance that does not apply";
  if ("scoreUnavailable" in result) {
    return result.scoreUnavailable.reason === "missing" ? "needs more Case Inputs to compute a score"
      : "has evidence with zero probability in the model";
  }
}

function compareScores(original: CaseResult, variant: CaseResult) {
  if ("doNotConsiderScore" in original && "doNotConsiderScore" in variant) {
    if (original.action.id !== variant.action.id) return "Score comparison unavailable: the cases score different guidance options.";
    const change = (variant.doNotConsiderScore - original.doNotConsiderScore) * 100;
    if (change === 0) return "No modeled change in the score (0 percentage points).";
    const difference = differenceFormat.format(change);
    return difference === "0"
      ? `Do-Not-Consider Score ${change > 0 ? "increased" : "decreased"} by less than 0.000001 percentage points.`
      : `Do-Not-Consider Score difference (variant minus original): ${difference} percentage points.`;
  }
  const originalReason = whyUnavailable(original);
  const variantReason = whyUnavailable(variant);
  return `Score comparison unavailable: ${[
    originalReason && `the original case ${originalReason}`,
    variantReason && `the what-if variant ${variantReason}`,
  ].filter(Boolean).join("; ")}.`;
}

export function WhatIfSandbox({ model, values, result }: {
  model: CaseModel;
  values: CaseValues;
  result: CaseResult;
}) {
  const [draft, setDraft] = useState<CaseValues | null>(null);
  const panelId = useId();
  const copyOriginal = () => Object.fromEntries(caseInputsFor(model).map(({ id }) => [id, caseValue(values, id)]));
  const variantResult = draft === null ? null : evaluateCase(model, draft);

  return (
    <section aria-labelledby={`${panelId}-heading`} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 id={`${panelId}-heading`} className="text-lg font-semibold">What-If Sandbox</h2>
      <p className="text-slate-700">Try different Case Inputs without changing the original synthetic case or model assumptions.</p>
      <Button variant="secondary" aria-expanded={draft !== null} aria-controls={panelId}
        onPress={() => setDraft(draft === null ? copyOriginal() : null)}>
        {draft === null ? "Open What-If Sandbox" : "Close What-If Sandbox"}
      </Button>
      <section id={panelId} hidden={draft === null} className="space-y-5">
        {draft !== null && variantResult !== null && (
          <>
            <p role="status" className="rounded-lg bg-slate-100 p-4 font-medium">{compareScores(result, variantResult)}</p>
            <div className="grid items-start gap-4 md:grid-cols-2">
              <section aria-labelledby={`${panelId}-original`} className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 id={`${panelId}-original`} className="font-semibold">Original case</h3>
                <CaseResultDetails model={model} result={result} comparison />
              </section>
              <section aria-labelledby={`${panelId}-variant`} className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 id={`${panelId}-variant`} className="font-semibold">What-if variant</h3>
                <div aria-live="polite">
                  <CaseResultDetails model={model} result={variantResult} comparison />
                </div>
                <h4 className="border-t border-slate-200 pt-4 font-medium">Edit variant inputs</h4>
                <CaseInputFields model={model} values={draft} result={variantResult}
                  setValue={(id, value) => setDraft((previous) => previous === null ? null : { ...previous, [id]: value })} />
                <Button variant="secondary" onPress={() => setDraft(copyOriginal())}>Reset variant to original</Button>
              </section>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
