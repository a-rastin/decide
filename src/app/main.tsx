import { Label, Radio, RadioGroup } from "@heroui/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { caseValueDisplayLabel, evaluateDecision, evaluateNetworkDecision, unknownCaseLabel, type DecideModel, type RoutedDecision, type RoutedModel } from "../model.ts";

declare const __DECIDE_MODEL__: DecideModel | RoutedModel;

const scoreFormat = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 6,
});

const knownCasePrefix = "known:";
const unknownCaseOption = "unknown";

function inputLabel(input: { label: string } | { label: string; unit: string }) {
  return "unit" in input ? `${input.label} (${input.unit})` : input.label;
}

function App({ model, values, setValue, navigation }: {
  model: DecideModel | RoutedDecision;
  values: Record<string, string>;
  setValue: (id: string, value: string) => void;
  navigation?: React.ReactNode;
}) {
  const { decision } = model;
  const valueFor = (id: string) => Object.hasOwn(values, id) ? values[id] : undefined;
  const caseInputs = "caseInputs" in model ? model.caseInputs : [model.caseInput];
  const result = "caseInputs" in model ? evaluateNetworkDecision(model.decision, values)
    : evaluateDecision(model.decision, valueFor(model.caseInput.id) || null);
  const convention = "convention" in decision ? decision.convention : decision.distribution.convention;
  const inputLabels = (ids: string[]) => caseInputs.filter(({ id }) => ids.includes(id)).map(inputLabel);
  const applicable = result.status === "applicable";

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <section className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-10">
          <p className="font-serif text-2xl font-semibold tracking-tight text-slate-950">Decide</p>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Research only. Do not use for clinical care.
          </p>
        </section>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
        {navigation}
        <header className="mb-8 border-b border-slate-200 pb-7">
          <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">{decision.title}</h1>
        </header>

        <section className="grid items-start gap-8 md:grid-cols-[2fr_3fr]">
          <section aria-labelledby="case-input-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 id="case-input-heading" className="mb-5 text-lg font-semibold">Synthetic Case Input</h2>
            <div className="space-y-5">
              {caseInputs.map((caseInput) => {
                const selected = valueFor(caseInput.id) ?? "";
                return "type" in caseInput ? (
                  <label key={caseInput.id} className="block font-medium">
                    {inputLabel(caseInput)}
                    <input type="text" inputMode="decimal" value={selected} onChange={(event) => setValue(caseInput.id, event.target.value)}
                      aria-invalid={result.status === "invalid" && (!("inputs" in result) || result.inputs.includes(caseInput.id))}
                      className="mt-3 block w-full rounded-lg border border-slate-300 p-3" />
                  </label>
                ) : (
                  <RadioGroup key={caseInput.id} name={caseInput.id} className="gap-3"
                    value={selected ? `${knownCasePrefix}${selected}` : unknownCaseOption}
                    onChange={(value) => setValue(caseInput.id, value === unknownCaseOption ? "" : value.slice(knownCasePrefix.length))}>
                    <Label>{caseInput.label}</Label>
                    {[
                      ...caseInput.values.map(({ id, label }) => ({ value: `${knownCasePrefix}${id}`, label: caseValueDisplayLabel(label) })),
                      { value: unknownCaseOption, label: unknownCaseLabel },
                    ].map(({ value, label }) => (
                      <Radio key={value} value={value}>
                        <Radio.Content className="w-full rounded-lg border border-slate-200 p-3 hover:bg-slate-50 data-[selected]:border-teal-600 data-[selected]:bg-teal-50">
                          <Radio.Control>
                            <Radio.Indicator />
                          </Radio.Control>
                          <Label>{label}</Label>
                        </Radio.Content>
                      </Radio>
                    ))}
                  </RadioGroup>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="result-heading" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 id="result-heading" className="mb-4 text-lg font-semibold">Decision result</h2>
            {result.status === "missing" ? (
              <article className="space-y-3">
                <h3 className="font-serif text-3xl tracking-tight text-slate-950">Missing Case Input</h3>
                {inputLabels("inputs" in result ? result.inputs : [caseInputs[0].id]).map((label, index) =>
                  <p key={index} className="text-slate-700">{label}</p>)}
              </article>
            ) : result.status === "invalid" ? (
              <p role="alert">{"inputs" in result ? `Invalid Case Input: ${inputLabels(result.inputs).join(", ")}` : "Invalid numeric Case Input"}</p>
            ) : (
              <article className="space-y-5">
                <h3 className="font-serif text-3xl tracking-tight text-slate-950">
                  {applicable ? result.action.label : "Guidance does not apply"}
                </h3>
                <dl className="border-s-2 border-teal-500 ps-4">
                  <dt className="text-sm font-semibold">{applicable ? "Applicable source condition" : "Unmet source condition"}</dt>
                  <dd className="mt-1 text-slate-700">{decision.applicability.condition}</dd>
                  <dd className="mt-1 text-sm text-slate-600"><cite>{decision.applicability.citation}</cite></dd>
                </dl>
                {applicable && (
                  <>
                    {"doNotConsiderScore" in result ? <section className="rounded-xl bg-teal-950 p-5 text-teal-50">
                      <h4 className="font-medium">Do-Not-Consider Score</h4>
                      <p className="my-2 text-4xl font-semibold tabular-nums">{scoreFormat.format(result.doNotConsiderScore)}</p>
                      <p className="text-sm leading-relaxed text-teal-100">
                        This score measures modeled support for leaving this action out of consideration.
                        It does not estimate a clinical outcome.
                      </p>
                    </section> : <p>{result.scoreUnavailable.reason === "missing"
                        ? `No score. Supply: ${inputLabels(result.scoreUnavailable.inputs).join(", ")}.`
                        : "No score. The entered evidence has zero probability in this model."}</p>}
                    <section>
                      <h4 className="text-sm font-semibold">Research Modeling Convention</h4>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{convention}</p>
                    </section>
                  </>
                )}
              </article>
            )}
          </section>
        </section>
      </main>
    </>
  );
}

function Root({ model }: { model: DecideModel | RoutedModel }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [routeId, setRouteId] = useState("");
  const [decisionId, setDecisionId] = useState("");
  const route = "version" in model ? model.routes.find((entry) => entry.id === routeId) : undefined;
  const selected = route?.decisions.find((entry) => entry.id === decisionId);
  const single = "version" in model && model.routes.length === 1 && model.routes[0].decisions.length === 1
    ? model.routes[0].decisions[0] : undefined;
  const current = "version" in model ? single ?? selected : model;
  const navigation = "version" in model && !single ? (
    <section className="mb-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
      <p>Only verified decisions are available.</p>
      {model.partial && <p>Partial build: some decisions or source sections are not included.</p>}
      <RadioGroup name="route" value={routeId} onChange={(value) => { setRouteId(value); setDecisionId(""); }}>
        <Label>Choose a topic or scenario</Label>
        {model.routes.map((entry) => (
          <Radio key={entry.id} value={entry.id}><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>{entry.label}</Label></Radio.Content></Radio>
        ))}
      </RadioGroup>
      {route && (
        <RadioGroup name="decision" value={decisionId} onChange={setDecisionId}>
          <Label>Choose a Clinical Decision</Label>
          {route.decisions.map((entry) => (
            <Radio key={entry.id} value={entry.id}><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>{entry.decision.title}</Label></Radio.Content></Radio>
          ))}
        </RadioGroup>
      )}
    </section>
  ) : single ? <section className="mb-6"><p>Only verified decisions are available.</p>
    {"version" in model && model.partial && <p>Partial build: some decisions or source sections are not included.</p>}</section> : undefined;
  if (!current) return (
    <>
      <header className="border-b border-slate-200 bg-white p-6">Decide — Research only. Do not use for clinical care.</header>
      <main className="mx-auto max-w-6xl px-6 py-10">{navigation}</main>
    </>
  );
  return <App model={current} navigation={navigation} values={values}
    setValue={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))} />;
}

const root = document.getElementById("app");
if (!root) throw new Error("Missing app container");
createRoot(root).render(<Root model={__DECIDE_MODEL__} />);
