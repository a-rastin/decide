import { Label, Radio, RadioGroup } from "@heroui/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { evaluateDecision, type DecideModel } from "../model.ts";

declare const __DECIDE_MODEL__: DecideModel;

const scoreFormat = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 6,
});

function App({ model }: { model: DecideModel }) {
  const [caseValue, setCaseValue] = useState<string | null>(null);
  const { caseInput, decision } = model;
  const result = evaluateDecision(decision, caseValue);

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
        <header className="mb-8 border-b border-slate-200 pb-7">
          <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">{decision.title}</h1>
        </header>

        <section className="grid items-start gap-8 md:grid-cols-[2fr_3fr]">
          <section aria-labelledby="case-input-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 id="case-input-heading" className="mb-5 text-lg font-semibold">Synthetic Case Input</h2>
            <RadioGroup name={caseInput.id} value={caseValue} onChange={setCaseValue} className="gap-3">
              <Label>{caseInput.label}</Label>
              {caseInput.values.map((value) => (
                <Radio key={value.id} value={value.id}>
                  <Radio.Content className="w-full rounded-lg border border-slate-200 p-3 hover:bg-slate-50 data-[selected]:border-teal-600 data-[selected]:bg-teal-50">
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    <Label>{value.label}</Label>
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </section>

          <section aria-labelledby="result-heading" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 id="result-heading" className="mb-4 text-lg font-semibold">Decision result</h2>
            {caseValue === null ? (
              <p className="text-slate-600">Guidance appears when the source condition is met.</p>
            ) : (
              <article className="space-y-5">
                <h3 className="font-serif text-3xl tracking-tight text-slate-950">
                  {result?.action ?? "Guidance does not apply"}
                </h3>
                <dl className="border-s-2 border-teal-500 ps-4">
                  <dt className="text-sm font-semibold">{result ? "Applicable source condition" : "Unmet source condition"}</dt>
                  <dd className="mt-1 text-slate-700">{decision.applicability.condition}</dd>
                  <dd className="mt-1 text-sm text-slate-600"><cite>{decision.applicability.citation}</cite></dd>
                </dl>
                {result && (
                  <>
                    <section className="rounded-xl bg-teal-950 p-5 text-teal-50">
                      <h4 className="font-medium">Do-Not-Consider Score</h4>
                      <p className="my-2 text-4xl font-semibold tabular-nums">{scoreFormat.format(result.doNotConsiderScore)}</p>
                      <p className="text-sm leading-relaxed text-teal-100">
                        This score measures modeled support for leaving this action out of consideration.
                        It does not estimate a clinical outcome.
                      </p>
                    </section>
                    <section>
                      <h4 className="text-sm font-semibold">Research Modeling Convention</h4>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{decision.distribution.convention}</p>
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

const root = document.getElementById("app");
if (!root) throw new Error("Missing app container");
createRoot(root).render(<App model={__DECIDE_MODEL__} />);
