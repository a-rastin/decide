import { caseValueDisplayLabel } from "../model.ts";
import { caseInputsFor, evaluateCase, scoreFormat, type CaseModel, type CaseResult, type CaseValues } from "./case.tsx";

function sampleOutcome(model: CaseModel, result: CaseResult, actionId: string) {
  if (result.status === "unmet") {
    return { reason: `Guidance does not apply. Source condition: ${model.decision.applicability.condition}` };
  }
  if (result.status === "missing") return { reason: "Case Inputs are missing to determine whether guidance applies." };
  if (result.status !== "applicable") return { reason: "A Case Input is invalid." };
  if (result.action.id !== actionId) return { reason: "A different guidance option applies." };
  if ("doNotConsiderScore" in result) return { score: result.doNotConsiderScore };
  return { reason: result.scoreUnavailable.reason === "missing" ? "More Case Inputs are needed to compute a score."
    : "The entered evidence has zero probability in this model." };
}

export function SensitivityBars({ model, values, result }: { model: CaseModel; values: CaseValues; result: CaseResult }) {
  const { decision } = model;
  const action = "action" in decision ? decision.action : decision.distribution.guidance;
  const baseline = sampleOutcome(model, result, action.id);
  const sweeps = caseInputsFor(model).filter((input) => "values" in input).map((input) => {
    const samples = input.values.map(({ id, label }) => ({
      id, label: caseValueDisplayLabel(label),
      ...sampleOutcome(model, evaluateCase(model, { ...values, [input.id]: id }), action.id),
    }));
    const scores = samples.flatMap(({ score }) => score === undefined ? [] : [score]);
    return { input, samples, scores };
  });
  const ranges = baseline.score === undefined ? [] : sweeps.flatMap(({ input, scores }) => {
    if (scores.length < 2) return [];
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    // Ignore the last floating-point bits from posterior inference when ranking spans.
    return [{ input, min, max, spanRank: Math.round((max - min) * 1e15) }];
  }).sort((a, b) => b.spanRank - a.spanRank);

  return (
    <section aria-labelledby="sensitivity-heading" className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 id="sensitivity-heading" className="text-lg font-semibold">Sensitivity Bars</h2>
      <p className="text-slate-700">
        Selected option: <strong>{action.label}</strong>. Each comparison varies one Case Input from the original case
        while the other inputs and model assumptions stay fixed. This describes model sensitivity, not causation.
      </p>
      {ranges.length === 0 && (
        <p role="status" className="rounded-lg bg-slate-100 p-4">
          {baseline.score === undefined ? `No comparison: the original case cannot be scored. ${baseline.reason}`
            : sweeps.length === 0 ? "No categorical Case Inputs can be varied for this decision."
              : sweeps.length === 1 && sweeps[0].scores.length === 1
                ? "No comparison: only one category can be scored."
                : "No comparison: no categorical Case Input has two comparable scores."}
        </p>
      )}
      {ranges.length > 0 && (
        <figure className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <figcaption className="font-semibold">Do-Not-Consider Score ranges</figcaption>
          <ol role="list" aria-label="Comparable score ranges" className="space-y-3">
            {ranges.map(({ input, min, max, spanRank }) => (
              <li key={input.id} className="grid items-center gap-1 sm:grid-cols-[1fr_2fr] sm:gap-4">
                <p className="font-medium">{input.label}</p>
                <div>
                  <p className="text-sm tabular-nums">
                    {spanRank === 0 ? `No modeled change (${scoreFormat.format(min)})`
                      : `${scoreFormat.format(min)}–${scoreFormat.format(max)}`}
                  </p>
                  <div aria-hidden="true" className="relative mt-1 h-4 overflow-hidden rounded-sm bg-slate-200">
                    {spanRank === 0
                      ? <span className="absolute inset-y-0 w-1 -translate-x-1/2 bg-teal-700" style={{ left: `${min * 100}%` }} />
                      : <span className="absolute inset-y-0 rounded-sm bg-teal-700"
                        style={{ left: `${min * 100}%`, width: `${(max - min) * 100}%` }} />}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div aria-hidden="true" className="grid sm:grid-cols-[1fr_2fr] sm:gap-4">
            <p className="flex justify-between text-xs tabular-nums text-slate-600 sm:col-start-2">
              <span>0%</span><span>50%</span><span>100%</span>
            </p>
          </div>
        </figure>
      )}
      {sweeps.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Tested categories</h3>
          {sweeps.map(({ input, samples, scores }) => (
            <table key={input.id} className="w-full table-fixed border-collapse text-left text-sm">
              <caption className="pb-1 text-left font-medium">{input.label}</caption>
              <thead className="bg-slate-50">
                <tr><th scope="col" className="w-1/3 p-2">Category</th><th scope="col" className="p-2">Score or reason unavailable</th></tr>
              </thead>
              <tbody>
                {samples.map(({ id, label, score, reason }) => (
                  <tr key={id} className="border-b border-slate-200">
                    <th scope="row" className="break-words p-2 font-medium">{label}</th>
                    <td className="p-2 tabular-nums">{score === undefined ? reason : scoreFormat.format(score)}</td>
                  </tr>
                ))}
              </tbody>
              {baseline.score !== undefined && scores.length < 2 && (
                <tfoot>
                  <tr><td colSpan={2} className="p-2 text-slate-700">No bar: fewer than two comparable scores.</td></tr>
                </tfoot>
              )}
            </table>
          ))}
        </section>
      )}
    </section>
  );
}
