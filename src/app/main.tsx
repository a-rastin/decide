import { Label, Radio, RadioGroup } from "@heroui/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { DecideModel, RoutedModel } from "../model.ts";
import { CaseInputFields, CaseResultDetails, evaluateCase, type CaseModel, type CaseValues } from "./case.tsx";
import { SensitivityBars } from "./sensitivity-bars.tsx";
import { WhatIfSandbox } from "./what-if-sandbox.tsx";

declare const __DECIDE_MODEL__: DecideModel | RoutedModel;

function CaseWorkspace({ model, values, setValue }: {
  model: CaseModel;
  values: CaseValues;
  setValue: (id: string, value: string) => void;
}) {
  const { decision } = model;
  const result = evaluateCase(model, values);

  return (
    <>
      <header className="mb-8 border-b border-slate-200 pb-7">
        <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">{decision.title}</h1>
      </header>

      <section className="grid items-start gap-8 md:grid-cols-[2fr_3fr]">
        <section aria-labelledby="case-input-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="case-input-heading" className="text-lg font-semibold">Synthetic Case Input</h2>
          <p className="mb-5 mt-1 text-sm text-slate-700">Edits here change the original case.</p>
          <CaseInputFields model={model} values={values} result={result} setValue={setValue} />
        </section>

        <section aria-labelledby="result-heading" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 id="result-heading" className="mb-4 text-lg font-semibold">Decision result</h2>
          <CaseResultDetails model={model} result={result} />
        </section>
      </section>
      <SensitivityBars model={model} values={values} result={result} />
      <WhatIfSandbox key={"id" in model ? model.id : undefined} model={model} values={values} result={result} />
    </>
  );
}

function Root({ model }: { model: DecideModel | RoutedModel }) {
  const [values, setValues] = useState<CaseValues>({});
  const [routeId, setRouteId] = useState<string | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const route = "version" in model ? model.routes.find((entry) => entry.id === routeId) : undefined;
  const selected = route?.decisions.find((entry) => entry.id === decisionId);
  const single = "version" in model && model.routes.length === 1 && model.routes[0].decisions.length === 1
    ? model.routes[0].decisions[0] : undefined;
  const current = "version" in model ? single ?? selected : model;
  const navigation = "version" in model && !single ? (
    <section className="mb-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
      <p>Only verified decisions are available.</p>
      {model.partial && <p>Partial build: some decisions or source sections are not included.</p>}
        <RadioGroup name="route" value={routeId} onChange={(value) => { setRouteId(value); setDecisionId(null); }}>
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
        {current && <CaseWorkspace model={current} values={values}
          setValue={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))} />}
      </main>
    </>
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("Missing app container");
createRoot(root).render(<Root model={__DECIDE_MODEL__} />);
