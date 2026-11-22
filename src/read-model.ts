import { SaxesParser } from "saxes";
import { caseValueDisplayLabel, decimalLiteral, type DecideModel, type MultiModel } from "./model.ts";

interface XmlElement {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: XmlElement[];
  text: string;
}

const decimal = /^(?<sign>[+-]?)(?=\d|\.\d)(?<whole>\d*)(?:\.(?<fraction>\d*))?(?:[eE](?<exponent>[+-]?\d+))?$/;
const distributionTolerance = 1e-12;

function validateElement(
  element: XmlElement,
  attributes: readonly string[],
  childNames: readonly string[] = [],
  allowText = false,
) {
  for (const attribute of Object.keys(element.attributes)) {
    if (!attributes.includes(attribute)) {
      throw new Error(`Unexpected attribute "${attribute}" on <${element.name}>`);
    }
  }
  for (const child of element.children) {
    if (!childNames.includes(child.name)) {
      throw new Error(`Unexpected <${child.name}> in <${element.name}>`);
    }
  }
  if (!allowText && /[^\t\r\n ]/.test(element.text)) throw new Error(`Unexpected text in <${element.name}>`);
}

function childrenNamed(parent: XmlElement, name: string): XmlElement[] {
  return parent.children.filter((element) => element.name === name);
}

function child(parent: XmlElement, name: string): XmlElement {
  const elements = childrenNamed(parent, name);
  if (elements.length !== 1) {
    throw new Error(`Expected exactly one <${name}> in <${parent.name}>, found ${elements.length}`);
  }
  return elements[0];
}

function alternatives(parent: XmlElement, name: string): XmlElement[] {
  const elements = childrenNamed(parent, name);
  if (elements.length < 2) {
    throw new Error(`Expected at least two <${name}> elements in <${parent.name}>`);
  }
  return elements;
}

function attribute(element: XmlElement, name: string): string {
  const value = element.attributes[name];
  if (!value?.trim()) throw new Error(`Expected a non-empty "${name}" attribute on <${element.name}>`);
  return value;
}

function labeledValue(element: XmlElement) {
  return { id: attribute(element, "id"), label: attribute(element, "label") };
}

function validateUniqueIds(entries: readonly { id: string }[], elementName: string) {
  const ids = new Set<string>();
  for (const { id } of entries) {
    if (ids.has(id)) throw new Error(`Duplicate <${elementName}> id "${id}"`);
    ids.add(id);
  }
}

function isProbabilityLiteral(literal: string): boolean {
  const parts = decimal.exec(literal)?.groups;
  if (!parts) return false;

  const { sign, whole, fraction = "", exponent = "0" } = parts;
  const digits = whole + fraction;
  const firstNonzero = digits.search(/[1-9]/);
  if (firstNonzero === -1) return true;
  if (sign === "-") return false;

  // Locate the decimal point relative to the first significant digit before rounding.
  const digitsBeforePoint = whole.length + Number(exponent) - firstNonzero;
  return digitsBeforePoint < 1 || (digitsBeforePoint === 1 && /^10*$/.test(digits.slice(firstNonzero)));
}

function actionProbability(element: XmlElement, id: string): number {
  const literal = attribute(element, "probability").trim();
  if (!isProbabilityLiteral(literal)) {
    throw new Error(`Action "${id}" has invalid probability "${literal}". Expected a decimal number from 0 to 1.`);
  }
  return Number(literal);
}

function text(parent: XmlElement, name: string): string {
  const element = child(parent, name);
  validateElement(element, [], [], true);
  const value = element.text.trim();
  if (!value) throw new Error(`Expected non-empty text in <${name}>`);
  return value;
}

function parseXml(xml: Uint8Array): XmlElement {
  const parser = new SaxesParser();
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let hasDoctype = false;
  parser.on("doctype", () => {
    hasDoctype = true;
  });
  parser.on("xmldecl", ({ encoding }) => {
    if (encoding && encoding.toLowerCase() !== "utf-8") {
      throw new Error(`Expected UTF-8 encoding, found "${encoding}"`);
    }
  });
  parser.on("opentag", ({ name, attributes }) => {
    const element: XmlElement = { name, attributes, children: [], text: "" };
    stack.at(-1)?.children.push(element);
    root ??= element;
    stack.push(element);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  function appendText(text: string) {
    const element = stack.at(-1);
    if (element) element.text += text;
  }
  parser.on("text", appendText);
  parser.on("cdata", appendText);

  try {
    // Preserve the byte-order mark so the XML parser consumes it exactly once.
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(xml);
    parser.write(source).close();
  } catch (error) {
    throw new Error(`Malformed XML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (hasDoctype) throw new Error("DOCTYPE declarations are not supported in Decide model XML");
  if (!root) throw new Error("Model XML is missing a root element");
  return root;
}

export function readModel(xml: Uint8Array): DecideModel {
  return readSingleModel(parseXml(xml));
}

function readSingleModel(root: XmlElement): DecideModel {
  if (root.name !== "decide-model") {
    throw new Error('Expected an unqualified <decide-model> root element');
  }
  const version = attribute(root, "version");
  if (version !== "1") throw new Error(`Unsupported Decide XML schema version "${version}". Expected "1".`);
  validateElement(root, ["version"], ["case-input", "clinical-decision"]);

  const caseInput = child(root, "case-input");
  validateElement(caseInput, ["id", "label"], ["value"]);
  const input = labeledValue(caseInput);
  const values = alternatives(caseInput, "value").map((element) => {
    validateElement(element, ["id", "label"]);
    return labeledValue(element);
  });
  validateUniqueIds(values, "value");
  const labelIds = new Map<string, string>();
  for (const { id, label } of values) {
    const displayLabel = caseValueDisplayLabel(label);
    const labelKey = displayLabel.replace(/\s+/g, " ").trim().toLowerCase().normalize("NFC");
    const previousId = labelIds.get(labelKey);
    if (previousId !== undefined) {
      throw new Error(`Duplicate Case Input display label "${displayLabel}" for values "${previousId}" and "${id}"`);
    }
    labelIds.set(labelKey, id);
  }

  const decision = child(root, "clinical-decision");
  validateElement(decision, ["title"], ["applicability", "action-distribution"]);
  const title = attribute(decision, "title");
  const applicability = child(decision, "applicability");
  validateElement(applicability, ["input", "value"], ["source-condition", "citation"]);
  const inputId = attribute(applicability, "input");
  if (inputId !== input.id) throw new Error(`<applicability> references unknown Case Input "${inputId}"`);
  const value = attribute(applicability, "value");
  if (!values.some((option) => option.id === value)) {
    throw new Error(`<applicability> references unknown value "${value}" for Case Input "${inputId}"`);
  }
  const condition = text(applicability, "source-condition");
  const citation = text(applicability, "citation");

  const distribution = child(decision, "action-distribution");
  validateElement(distribution, ["guidance"], ["research-modeling-convention", "action"]);
  const convention = text(distribution, "research-modeling-convention");
  const actions = alternatives(distribution, "action").map((element) => {
    validateElement(element, ["id", "label", "probability"]);
    const action = labeledValue(element);
    return { ...action, probability: actionProbability(element, action.id) };
  });
  validateUniqueIds(actions, "action");
  const total = actions.reduce((sum, { probability }) => sum + probability, 0);
  if (Math.abs(total - 1) > distributionTolerance) {
    throw new Error(`Action distribution probabilities must sum to 1, got ${total}`);
  }
  const guidanceId = attribute(distribution, "guidance");
  const guidance = actions.find((action) => action.id === guidanceId);
  if (!guidance) throw new Error(`Unknown guidance action "${guidanceId}"`);

  return {
    caseInput: { ...input, values },
    decision: {
      title,
      applicability: { value, condition, citation },
      distribution: { convention, guidance },
    },
  };
}

export function readBuildModel(xml: Uint8Array): DecideModel | MultiModel {
  const root = parseXml(xml);
  if (root.name !== "decide-model" || root.attributes.version !== "2") return readSingleModel(root);
  validateElement(root, ["version"], ["case-input", "route"]);
  const inputs = childrenNamed(root, "case-input");
  const routeElements = childrenNamed(root, "route");
  if (!inputs.length || !routeElements.length) throw new Error("Version 2 requires Case Inputs and routes");
  const parsedInputs = inputs.map((input) => {
    validateElement(input, ["id", "label", "type", "unit"], ["value"]);
    const type = attribute(input, "type");
    if (type !== "categorical" && type !== "numeric") throw new Error(`Unsupported Case Input type "${type}"`);
    if (type === "numeric") {
      attribute(input, "unit");
      if (input.children.length) throw new Error("Numeric Case Input must not contain values");
    } else if ("unit" in input.attributes) throw new Error("Categorical Case Input must not declare a unit");
    attribute(input, "label");
    return { id: attribute(input, "id"), element: input, type };
  });
  validateUniqueIds(parsedInputs, "case-input");
  const allDecisions: { id: string }[] = [];
  const routes = routeElements.map((route) => {
    validateElement(route, ["id", "label"], ["clinical-decision"]);
    const routeInfo = labeledValue(route);
    const decisionElements = childrenNamed(route, "clinical-decision");
    if (!decisionElements.length) throw new Error(`Route "${routeInfo.id}" has no Clinical Decisions`);
    const decisions = decisionElements.map((decision) => {
      validateElement(decision, ["id", "title"], ["applicability", "action-distribution"]);
      const id = attribute(decision, "id");
      allDecisions.push({ id });
      const inputId = attribute(child(decision, "applicability"), "input");
      const input = parsedInputs.find((entry) => entry.id === inputId);
      if (!input) throw new Error(`<applicability> references unknown Case Input "${inputId}"`);
      const applicability = child(decision, "applicability");
      let numeric: { operator: "lt" | "lte" | "gt" | "gte"; threshold: string } | undefined;
      if (input.type === "numeric") {
        validateElement(applicability, ["input", "operator", "threshold"], ["source-condition", "citation"]);
        const operator = attribute(applicability, "operator");
        const threshold = attribute(applicability, "threshold").trim();
        if (!["lt", "lte", "gt", "gte"].includes(operator)) throw new Error(`Invalid numeric operator "${operator}"`);
        if (!decimalLiteral.test(threshold) || !Number.isFinite(Number(threshold))) throw new Error(`Invalid numeric threshold "${threshold}"`);
        numeric = { operator: operator as "lt" | "lte" | "gt" | "gte", threshold };
      }
      const syntheticInput: XmlElement = numeric
        ? { ...input.element, attributes: { id: input.id, label: attribute(input.element, "label") }, children: [
          { name: "value", attributes: { id: "yes", label: "Yes" }, children: [], text: "" },
          { name: "value", attributes: { id: "no", label: "No" }, children: [], text: "" },
        ] }
        : { ...input.element, attributes: { id: input.id, label: attribute(input.element, "label") } };
      const syntheticDecision = numeric ? { ...decision, children: decision.children.map((entry) =>
        entry === applicability ? { ...entry, attributes: { input: inputId, value: "yes" } } : entry) } : decision;
      const singleRoot: XmlElement = {
        name: "decide-model",
        attributes: { version: "1" },
        text: "",
        children: [
          syntheticInput,
          { ...syntheticDecision, attributes: { title: attribute(decision, "title") } },
        ],
      };
      const parsed = readSingleModel(singleRoot);
      if (numeric) {
        return { id, caseInput: { id: input.id, label: attribute(input.element, "label"), type: "numeric" as const, unit: attribute(input.element, "unit") },
          decision: { ...parsed.decision, applicability: { ...numeric, condition: parsed.decision.applicability.condition, citation: parsed.decision.applicability.citation } } };
      }
      return { id, ...parsed };
    });
    return { ...routeInfo, decisions };
  });
  validateUniqueIds(routes, "route");
  validateUniqueIds(allDecisions, "clinical-decision");
  // Validate even unused Case Inputs through the same value and label rules.
  for (const input of parsedInputs) {
    if (input.type === "categorical" && !routes.some((route) => route.decisions.some((decision) => decision.caseInput.id === input.id))) {
      const values = alternatives(input.element, "value");
      for (const value of values) validateElement(value, ["id", "label"]);
      const entries = values.map(labeledValue);
      validateUniqueIds(entries, "value");
      const labels = entries.map(({ label }) => caseValueDisplayLabel(label).replace(/\s+/g, " ").trim().toLowerCase().normalize("NFC"));
      if (new Set(labels).size !== labels.length) throw new Error(`Duplicate Case Input display label in "${input.id}"`);
    }
  }
  return { version: 2, routes };
}
