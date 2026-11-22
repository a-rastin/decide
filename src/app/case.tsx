import { Label, Radio, RadioGroup } from "@heroui/react";
import { useId } from "react";
import { caseValueDisplayLabel, evaluateDecision, evaluateNetworkDecision, unknownCaseLabel, type DecideModel, type RoutedDecision } from "../model.ts";

export type CaseModel = DecideModel | RoutedDecision;
export type CaseValues = Record<string, string>;

export const scoreFormat = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 6,
});

const knownCasePrefix = "known:";
const unknownCaseOption = "unknown";

function inputLabel(input: { label: string } | { label: string; unit: string }) {
  return "unit" in input ? `${input.label} (${input.unit})` : input.label;
}

export function caseInputsFor(model: CaseModel) {
  return "caseInputs" in model ? model.caseInputs : [model.caseInput];
}

export function caseValue(values: CaseValues, id: string) {
  return Object.hasOwn(values, id) ? values[id] : "";
}

export function evaluateCase(model: CaseModel, values: CaseValues) {
  return "caseInputs" in model ? evaluateNetworkDecision(model.decision, values)
    : evaluateDecision(model.decision, caseValue(values, model.caseInput.id) || null);
}

export type CaseResult = ReturnType<typeof evaluateCase>;

export function CaseInputFields({ model, values, result, setValue }: {
  model: CaseModel;
  values: CaseValues;
  result: CaseResult;
  setValue: (id: string, value: string) => void;
}) {
  const groupId = useId();
  return (
    <div className="space-y-5">
      {caseInputsFor(model).map((input) => {
        const selected = caseValue(values, input.id);
        return "type" in input ? (
          <label key={input.id} className="block font-medium">
            {inputLabel(input)}
            <input type="text" inputMode="decimal" value={selected} onChange={(event) => setValue(input.id, event.target.value)}
              aria-invalid={result.status === "invalid" && (!("inputs" in result) || result.inputs.includes(input.id))}
              className="mt-3 block w-full rounded-lg border border-slate-300 p-3" />
          </label>
        ) : (
          <RadioGroup key={input.id} name={`${groupId}-${input.id}`} className="gap-3"
            value={selected ? `${knownCasePrefix}${selected}` : unknownCaseOption}
            onChange={(value) => setValue(input.id, value === unknownCaseOption ? "" : value.slice(knownCasePrefix.length))}>
            <Label>{input.label}</Label>
            {[
              ...input.values.map(({ id, label }) => ({ value: `${knownCasePrefix}${id}`, label: caseValueDisplayLabel(label) })),
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
  );
}

export function CaseResultDetails({ model, result, comparison = false }: {
  model: CaseModel;
  result: CaseResult;
  comparison?: boolean;
}) {
  const { decision } = model;
  const convention = "convention" in decision ? decision.convention : decision.distribution.convention;
  const caseInputs = caseInputsFor(model);
  const inputLabels = (ids: string[]) => caseInputs.filter(({ id }) => ids.includes(id)).map(inputLabel);
  const Heading = comparison ? "h4" : "h3";
  const Subheading = comparison ? "h5" : "h4";

  return (
    <article className="space-y-5">
      {result.status === "missing" ? (
        <>
          <Heading className="font-serif text-3xl tracking-tight text-slate-950">Missing Case Input</Heading>
          {inputLabels("inputs" in result ? result.inputs : [caseInputs[0].id]).map((label, index) =>
            <p key={index} className="text-slate-700">{label}</p>)}
        </>
      ) : result.status === "invalid" ? (
        <p role={comparison ? undefined : "alert"}>{"inputs" in result ? `Invalid Case Input: ${inputLabels(result.inputs).join(", ")}` : "Invalid numeric Case Input"}</p>
      ) : (
        <Heading className="font-serif text-3xl tracking-tight text-slate-950">
          {result.status === "applicable" ? result.action.label : "Guidance does not apply"}
        </Heading>
      )}
      {(comparison || result.status === "applicable" || result.status === "unmet") && (
        <dl className="border-s-2 border-teal-500 ps-4">
          <dt className="text-sm font-semibold">{result.status === "applicable" ? "Applicable source condition"
            : result.status === "unmet" ? "Unmet source condition" : "Source condition"}</dt>
          <dd className="mt-1 text-slate-700">{decision.applicability.condition}</dd>
          <dd className="mt-1 text-sm text-slate-600"><cite>{decision.applicability.citation}</cite></dd>
        </dl>
      )}
      {result.status === "applicable" && (
        <>
          {"doNotConsiderScore" in result ? <section className="rounded-xl bg-teal-950 p-5 text-teal-50">
            <Subheading className="font-medium">Do-Not-Consider Score</Subheading>
            <p className="my-2 text-4xl font-semibold tabular-nums">{scoreFormat.format(result.doNotConsiderScore)}</p>
            <p className="text-sm leading-relaxed text-teal-100">
              This score measures modeled support for leaving this action out of consideration.
              It does not estimate a clinical outcome.
            </p>
          </section> : <p>{result.scoreUnavailable.reason === "missing"
            ? `No score. Supply: ${inputLabels(result.scoreUnavailable.inputs).join(", ")}.`
            : "No score. The entered evidence has zero probability in this model."}</p>}
          <section>
            <Subheading className="text-sm font-semibold">Research Modeling Convention</Subheading>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{convention}</p>
          </section>
        </>
      )}
    </article>
  );
}
