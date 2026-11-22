import { DOMParser, type Element } from "@xmldom/xmldom";
import type { DecideModel } from "./model.ts";

function children(parent: Element, name: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === 1 && node.nodeName === name,
  );
}

function child(parent: Element, name: string): Element {
  const element = children(parent, name)[0];
  if (!element) throw new Error(`Missing <${name}> in <${parent.tagName}>`);
  return element;
}

function attribute(element: Element, name: string): string {
  const value = element.getAttribute(name);
  if (value === null) throw new Error(`Missing "${name}" on <${element.tagName}>`);
  return value;
}

function labeledValue(element: Element) {
  return { id: attribute(element, "id"), label: attribute(element, "label") };
}

function text(parent: Element, name: string): string {
  return child(parent, name).textContent?.trim() ?? "";
}

export function readModel(xml: Uint8Array): DecideModel {
  const document = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  const root = document.documentElement;
  if (!root) throw new Error("Model XML is missing a root element");

  const caseInput = child(root, "case-input");
  const decision = child(root, "clinical-decision");
  const applicability = child(decision, "applicability");
  const distribution = child(decision, "action-distribution");
  const actions = children(distribution, "action").map((element) => ({
    ...labeledValue(element),
    probability: Number(attribute(element, "probability")),
  }));
  const guidanceId = attribute(distribution, "guidance");
  const guidance = actions.find((action) => action.id === guidanceId);
  if (!guidance) throw new Error(`Unknown guidance action "${guidanceId}"`);

  return {
    caseInput: { ...labeledValue(caseInput), values: children(caseInput, "value").map(labeledValue) },
    decision: {
      title: attribute(decision, "title"),
      applicability: {
        input: attribute(applicability, "input"),
        value: attribute(applicability, "value"),
        condition: text(applicability, "source-condition"),
        citation: text(applicability, "citation"),
      },
      distribution: {
        convention: text(distribution, "research-modeling-convention"),
        guidance,
        actions,
      },
    },
  };
}
