import { SaxesParser } from "saxes";
import {
  applicabilityDomains, caseValueDisplayLabel, compareDecimals, decimalLiteral, numericThresholds, type DecideModel,
  type NetworkCaseInput, type NetworkCondition, type NetworkDecision, type NetworkNode, type NumericRange, type RoutedDecision, type RoutedModel,
} from "./model.ts";

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
  const input = { ...labeledValue(caseInput), values: readCaseValues(caseInput) };
  const decision = child(root, "clinical-decision");
  validateElement(decision, ["title"], ["applicability", "action-distribution"]);
  return readDecision(decision, new Map([[input.id, input]]));
}

function readCaseValues(caseInput: XmlElement) {
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
  return values;
}

function readDecision(decision: XmlElement, inputs: ReadonlyMap<string, DecideModel["caseInput"]>): DecideModel {
  const title = attribute(decision, "title");
  const applicability = child(decision, "applicability");
  const inputId = attribute(applicability, "input");
  const input = inputs.get(inputId);
  if (!input) throw new Error(`<applicability> references unknown Case Input "${inputId}"`);
  return {
    caseInput: input,
    decision: {
      title,
      applicability: readApplicability(applicability, input),
      distribution: readDistribution(child(decision, "action-distribution")),
    },
  };
}

function readApplicability(element: XmlElement, input: DecideModel["caseInput"]): DecideModel["decision"]["applicability"] {
  const content = ["source-condition", "citation"];
  if ("type" in input) {
    validateElement(element, ["input", "operator", "threshold"], content);
    const operator = attribute(element, "operator");
    const threshold = attribute(element, "threshold").trim();
    if (operator !== "lt" && operator !== "lte" && operator !== "gt" && operator !== "gte") {
      throw new Error(`Invalid numeric operator "${operator}"`);
    }
    if (!decimalLiteral.test(threshold)) {
      throw new Error(`Invalid numeric threshold "${threshold}"`);
    }
    return { operator, threshold, condition: text(element, "source-condition"), citation: text(element, "citation") };
  }
  validateElement(element, ["input", "value"], content);
  const value = attribute(element, "value");
  if (!input.values.some((option) => option.id === value)) {
    throw new Error(`<applicability> references unknown value "${value}" for Case Input "${input.id}"`);
  }
  return { value, condition: text(element, "source-condition"), citation: text(element, "citation") };
}

function readDistribution(distribution: XmlElement): DecideModel["decision"]["distribution"] {
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

  return { convention, guidance };
}

export function readBuildModel(xml: Uint8Array): DecideModel | RoutedModel {
  const root = parseXml(xml);
  if (root.name === "decide-model" && root.attributes.version === "3") return readNetworkModel(root);
  if (root.name !== "decide-model" || root.attributes.version !== "2") return readSingleModel(root);
  validateElement(root, ["version"], ["case-input", "route"]);
  const inputs = childrenNamed(root, "case-input");
  const routeElements = childrenNamed(root, "route");
  if (!inputs.length || !routeElements.length) throw new Error("Version 2 requires Case Inputs and routes");
  const parsedInputs = inputs.map((input): DecideModel["caseInput"] => {
    validateElement(input, ["id", "label", "type", "unit"], ["value"]);
    const type = attribute(input, "type");
    const info = labeledValue(input);
    if (type === "numeric") {
      const unit = attribute(input, "unit");
      if (input.children.length) throw new Error("Numeric Case Input must not contain values");
      return { ...info, type, unit };
    }
    if (type !== "categorical") throw new Error(`Unsupported Case Input type "${type}"`);
    if ("unit" in input.attributes) throw new Error("Categorical Case Input must not declare a unit");
    return { ...info, values: readCaseValues(input) };
  });
  validateUniqueIds(parsedInputs, "case-input");
  const inputsById = new Map(parsedInputs.map((input) => [input.id, input]));
  const routes = readRoutes(root, (decision) => {
    validateElement(decision, ["id", "title"], ["applicability", "action-distribution"]);
    return { id: attribute(decision, "id"), ...readDecision(decision, inputsById) };
  });
  return { version: 2, routes };
}

function readRoutes(root: XmlElement, read: (decision: XmlElement) => RoutedDecision): RoutedModel["routes"] {
  const routes = childrenNamed(root, "route").map((route) => {
    validateElement(route, ["id", "label"], ["clinical-decision"]);
    const routeInfo = labeledValue(route);
    const decisionElements = childrenNamed(route, "clinical-decision");
    if (!decisionElements.length) throw new Error(`Route "${routeInfo.id}" has no Clinical Decisions`);
    const decisions = decisionElements.map(read);
    return { ...routeInfo, decisions };
  });
  validateUniqueIds(routes, "route");
  validateUniqueIds(routes.flatMap((route) => route.decisions), "clinical-decision");
  return routes;
}

const assignmentLimit = 4096;
const xmlTokens = (value: string) => value.trim().split(/[\t\r\n ]+/);

function readNetwork(network: XmlElement) {
  validateElement(network, ["id"], ["node"]);
  const id = attribute(network, "id");
  const nodes = childrenNamed(network, "node").map((node) => {
    validateElement(node, ["id"], ["state", "parent", "row"]);
    const states = alternatives(node, "state").map((state) => {
      validateElement(state, ["id", "label"]);
      const info = labeledValue(state);
      if (/\s/.test(info.id)) throw new Error(`State ID "${info.id}" must not contain whitespace`);
      return info;
    });
    validateUniqueIds(states, "state");
    const parents = childrenNamed(node, "parent").map((parent) => {
      validateElement(parent, ["node"]);
      return { id: attribute(parent, "node") };
    });
    validateUniqueIds(parents, "parent");
    return { id: attribute(node, "id"), states, parents: parents.map(({ id }) => id), element: node };
  });
  if (!nodes.length) throw new Error(`Network "${id}" has no nodes`);
  validateUniqueIds(nodes, "node");
  const assignments = nodes.reduce((count, node) => count * node.states.length, 1);
  if (assignments > assignmentLimit) {
    throw new Error(`Network "${id}" exceeds the inference limit of ${assignmentLimit} joint assignments`);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = new Map<string, NetworkNode>();
  const visiting = new Set<string>();

  function visit(node: typeof nodes[number]) {
    if (ordered.has(node.id)) return;
    if (visiting.has(node.id)) throw new Error(`Network "${id}" has a cycle at node "${node.id}"`);
    visiting.add(node.id);
    const parents = node.parents.map((parentId) => {
      const parent = byId.get(parentId);
      if (!parent) throw new Error(`Node "${node.id}" references unknown parent "${parentId}"`);
      visit(parent);
      return parent;
    });
    const keys = new Set<string>();
    const rows = childrenNamed(node.element, "row").map((row) => {
      validateElement(row, parents.length ? ["when", "probabilities"] : ["probabilities"]);
      const when = parents.length ? xmlTokens(attribute(row, "when")) : [];
      if (when.length !== parents.length || when.some((state, i) => !parents[i].states.some(({ id }) => id === state))) {
        throw new Error(`Invalid parent state tuple in probability row for node "${node.id}"`);
      }
      const key = JSON.stringify(when);
      if (keys.has(key)) throw new Error(`Duplicate probability row for node "${node.id}": ${key}`);
      keys.add(key);
      const probabilities = xmlTokens(attribute(row, "probabilities")).map((literal) => {
        const value = Number(literal);
        // Reject nonzero authored weights too small to represent even individually.
        if (!isProbabilityLiteral(literal) || !Number.isFinite(value) ||
            (value === 0 && /[1-9]/.test(literal.split(/[eE]/)[0]))) {
          throw new Error(`Node "${node.id}" has invalid probability "${literal}"`);
        }
        return value;
      });
      if (probabilities.length !== node.states.length) throw new Error(`Wrong number of probabilities for node "${node.id}"`);
      const total = probabilities.reduce((sum, value) => sum + value, 0);
      if (Math.abs(total - 1) > distributionTolerance) throw new Error(`Probabilities for node "${node.id}" must sum to 1, got ${total}`);
      return { when, probabilities };
    });
    if (rows.length !== parents.reduce((count, parent) => count * parent.states.length, 1)) {
      throw new Error(`Incomplete probability table for node "${node.id}"`);
    }
    ordered.set(node.id, { id: node.id, states: node.states.map(({ id }) => id), parents: node.parents, rows });
    visiting.delete(node.id);
  }
  nodes.forEach(visit);
  return { id, byId, assignments, nodes: [...ordered.values()] };
}

const networkPredicates = ["equals", "compare", "all", "any"];
const predicateLimit = 128;
const applicabilityWorkLimit = 65_536;
const explorationWorkLimit = 1_048_576;
const explorationSampleLimit = 256;

function readNetworkCondition(element: XmlElement, inputs: NetworkCaseInput[], countPredicate: () => void): NetworkCondition {
  countPredicate();
  if (element.name === "equals" || element.name === "compare") {
    validateElement(element, element.name === "equals" ? ["input", "value"] : ["input", "operator", "threshold"]);
    const input = attribute(element, "input");
    const entry = inputs.find(({ id }) => id === input);
    if (!entry) throw new Error(`Applicability references unbound Case Input "${input}"`);
    if (element.name === "compare") {
      if (!("type" in entry)) throw new Error(`Numeric comparison requires a numeric Case Input: "${input}"`);
      const operator = attribute(element, "operator");
      if (operator !== "lt" && operator !== "lte" && operator !== "eq" && operator !== "gt" && operator !== "gte") {
        throw new Error(`Invalid numeric operator "${operator}"`);
      }
      const threshold = attribute(element, "threshold");
      if (!decimalLiteral.test(threshold)) throw new Error(`Invalid numeric threshold "${threshold}"`);
      return { kind: "compare", input, operator, threshold };
    }
    if (!("values" in entry)) throw new Error(`Categorical equality requires a categorical Case Input: "${input}"`);
    const value = attribute(element, "value");
    if (!entry.values.some(({ id }) => id === value)) throw new Error(`Applicability references unknown value "${value}" for Case Input "${input}"`);
    return { kind: "equals", input, value };
  }
  if (element.name !== "all" && element.name !== "any") throw new Error(`Unexpected predicate <${element.name}>`);
  validateElement(element, [], networkPredicates);
  if (element.children.length < 2) throw new Error(`<${element.name}> requires at least two predicates`);
  return { kind: element.name, operands: element.children.map((operand) => readNetworkCondition(operand, inputs, countPredicate)) };
}

function readNumericRanges(observe: XmlElement, input: string, states: { id: string }[]): NumericRange[] {
  const ranges = childrenNamed(observe, "range").map((range) => {
    validateElement(range, ["min", "max", "min-inclusive", "max-inclusive", "state"]);
    function endpoint(name: "min" | "max") {
      const value = range.attributes[name];
      const inclusive = range.attributes[`${name}-inclusive`];
      if ((value !== undefined && !decimalLiteral.test(value)) ||
          (inclusive !== undefined && (value === undefined || (inclusive !== "true" && inclusive !== "false")))) {
        throw new Error(`Invalid numeric range ${name} for Case Input "${input}"`);
      }
      return { value, inclusive: inclusive === "true" };
    }
    const { value: min, inclusive: minInclusive } = endpoint("min");
    const { value: max, inclusive: maxInclusive } = endpoint("max");
    if (min !== undefined && max !== undefined) {
      const order = compareDecimals(min, max);
      if (order > 0 || (order === 0 && !(minInclusive && maxInclusive))) {
        throw new Error(`Empty or inverted numeric range for Case Input "${input}"`);
      }
    }
    const state = attribute(range, "state");
    if (!states.some(({ id }) => id === state)) throw new Error(`Invalid numeric state mapping "${state}" for Case Input "${input}"`);
    return { min, max, minInclusive, maxInclusive, state };
  }).sort((a, b) => a.min === undefined ? (b.min === undefined ? 0 : -1)
    : b.min === undefined ? 1 : compareDecimals(a.min, b.min) || Number(b.minInclusive) - Number(a.minInclusive));

  const gap = () => new Error(`Gap in numeric ranges for Case Input "${input}"`);
  const overlap = () => new Error(`Overlap in numeric ranges for Case Input "${input}"`);
  if (!ranges.length || ranges[0].min !== undefined) throw gap();
  for (let i = 1; i < ranges.length; i++) {
    const previous = ranges[i - 1], current = ranges[i];
    if (previous.max === undefined || current.min === undefined) throw overlap();
    const order = compareDecimals(previous.max, current.min);
    if (order > 0 || (order === 0 && previous.maxInclusive && current.minInclusive)) throw overlap();
    if (order < 0 || (order === 0 && !previous.maxInclusive && !current.minInclusive)) throw gap();
  }
  if (ranges.at(-1)!.max !== undefined) throw gap();
  return ranges;
}

function readSampling(input: XmlElement, id: string) {
  if (!input.children.length) return undefined;
  const sampling = child(input, "sampling");
  validateElement(sampling, ["min", "max"], ["sample"]);
  function decimalAttribute(element: XmlElement, name: string) {
    const value = attribute(element, name);
    if (!decimalLiteral.test(value)) throw new Error(`Invalid ${element.name} ${name} for Case Input "${id}": "${value}"`);
    return value;
  }
  const min = decimalAttribute(sampling, "min");
  const max = decimalAttribute(sampling, "max");
  if (compareDecimals(min, max) > 0) throw new Error(`Case Input "${id}" has an inverted sampling interval`);
  if (!sampling.children.length) throw new Error(`Sampling for Case Input "${id}" requires at least one sample`);
  const samples = sampling.children.map((sample) => {
    validateElement(sample, ["value"]);
    const value = decimalAttribute(sample, "value");
    if (compareDecimals(value, min) < 0 || compareDecimals(value, max) > 0) {
      throw new Error(`Case Input "${id}" sample "${value}" is outside its sampling interval`);
    }
    return value;
  });
  const ordered = [...samples].sort(compareDecimals);
  for (let i = 1; i < ordered.length; i++) {
    if (compareDecimals(ordered[i - 1], ordered[i]) === 0) throw new Error(`Duplicate sample "${ordered[i]}" for Case Input "${id}"`);
  }
  return { min, max, samples };
}

function validateSamplingCoverage(decision: NetworkDecision, inputs: NetworkCaseInput[], decisionId: string) {
  for (const binding of decision.inputs) {
    if (!("ranges" in binding)) continue;
    const input = inputs.find(({ id }) => id === binding.id);
    if (!input || !("type" in input) || !input.sampling) continue;
    const { min, max, samples } = input.sampling;
    for (const threshold of numericThresholds(decision, binding)) {
      const fromMin = compareDecimals(threshold, min);
      const fromMax = compareDecimals(threshold, max);
      if (fromMin < 0 || fromMax > 0) continue;
      const covered = new Set(samples.map((sample) => compareDecimals(sample, threshold)));
      for (const [side, order, required] of [["below", -1, fromMin > 0], ["at", 0, true], ["above", 1, fromMax < 0]] as const) {
        if (required && !covered.has(order)) {
          throw new Error(`Decision "${decisionId}": sampling for Case Input "${input.id}" requires a sample ${side} threshold ${threshold}`);
        }
      }
    }
  }
}

function readNetworkModel(root: XmlElement): RoutedModel {
  validateElement(root, ["version"], ["case-input", "network", "route"]);
  const inputs = childrenNamed(root, "case-input").map((input): NetworkCaseInput => {
    const type = attribute(input, "type");
    if (type === "numeric") {
      validateElement(input, ["id", "label", "type", "unit"], ["sampling"]);
      const entry = labeledValue(input);
      return { ...entry, type, unit: attribute(input, "unit"), sampling: readSampling(input, entry.id) };
    }
    if (type !== "categorical") throw new Error(`Unsupported Case Input type "${type}"`);
    validateElement(input, ["id", "label", "type"], ["value"]);
    return { ...labeledValue(input), values: readCaseValues(input) };
  });
  const networks = childrenNamed(root, "network").map(readNetwork);
  if (!inputs.length || !networks.length || !childrenNamed(root, "route").length) {
    throw new Error("Version 3 requires Case Inputs, networks, and routes");
  }
  validateUniqueIds(inputs, "case-input");
  validateUniqueIds(networks, "network");
  const routes = readRoutes(root, (element) => {
    validateElement(element, ["id", "title", "network", "action-node", "guidance"],
      ["observe", "applicability", "research-modeling-convention"]);
    const id = attribute(element, "id");
    const networkId = attribute(element, "network");
    const network = networks.find((entry) => entry.id === networkId);
    if (!network) throw new Error(`Decision "${id}" references unknown network "${networkId}"`);
    const actionNode = attribute(element, "action-node");
    const node = network.byId.get(actionNode);
    if (!node) throw new Error(`Decision "${id}" references unknown action node "${actionNode}"`);
    const guidance = attribute(element, "guidance");
    const action = node.states.find((state) => state.id === guidance);
    if (!action) throw new Error(`Decision "${id}" references unknown guidance state "${guidance}"`);
    const caseInputs: NetworkCaseInput[] = [];
    const observedNodes = new Set<string>();
    const bindings = childrenNamed(element, "observe").map((observe): NetworkDecision["inputs"][number] => {
      const inputId = attribute(observe, "input");
      const input = inputs.find((entry) => entry.id === inputId);
      if (!input) throw new Error(`Decision "${id}" references unknown Case Input "${inputId}"`);
      validateElement(observe, ["input", "node", "required"], ["type" in input ? "range" : "map"]);
      const nodeId = attribute(observe, "node");
      const observed = network.byId.get(nodeId);
      if (!observed) throw new Error(`Decision "${id}" references unknown observed node "${nodeId}"`);
      if (nodeId === actionNode || observedNodes.has(nodeId)) throw new Error(`Invalid or duplicate observation of node "${nodeId}" in decision "${id}"`);
      observedNodes.add(nodeId);
      const required = "required" in observe.attributes ? attribute(observe, "required") : "false";
      if (required !== "true" && required !== "false") throw new Error(`Invalid required flag for Case Input "${inputId}"`);
      caseInputs.push(input);
      const binding = { id: inputId, node: nodeId, required: required === "true" };
      if ("type" in input) return { ...binding, ranges: readNumericRanges(observe, inputId, observed.states) };
      const mapping = new Map<string, string>();
      for (const entry of childrenNamed(observe, "map")) {
        validateElement(entry, ["value", "state"]);
        const value = attribute(entry, "value");
        const state = attribute(entry, "state");
        if (mapping.has(value) || !input.values.some(({ id }) => id === value) || !observed.states.some(({ id }) => id === state)) {
          throw new Error(`Invalid or duplicate state mapping "${value}" → "${state}" for Case Input "${inputId}"`);
        }
        mapping.set(value, state);
      }
      if (mapping.size !== input.values.length) throw new Error(`Incomplete state mapping for Case Input "${inputId}"`);
      const values = input.values.map(({ id }) => id);
      return { ...binding, values, states: values.map((value) => mapping.get(value)!) };
    });
    validateUniqueIds(bindings, "observe input");
    const applicability = child(element, "applicability");
    validateElement(applicability, [], [...networkPredicates, "source-condition", "citation"]);
    const predicates = applicability.children.filter(({ name }) => name !== "source-condition" && name !== "citation");
    if (predicates.length !== 1) throw new Error("Expected exactly one predicate in <applicability>");
    let predicateCount = 0;
    const condition = readNetworkCondition(predicates[0], caseInputs, () => {
      if (++predicateCount > predicateLimit) {
        throw new Error(`Decision "${id}" exceeds the applicability limit of ${predicateLimit} predicate elements`);
      }
    });
    const decision = {
      title: attribute(element, "title"), action: { ...action, node: actionNode },
      inputs: bindings, nodes: network.nodes,
      condition,
      applicability: { condition: text(applicability, "source-condition"), citation: text(applicability, "citation") },
      convention: text(element, "research-modeling-convention"),
    };
    const applicabilityWork = applicabilityDomains(decision).reduce((cost, { candidates }) => cost * candidates.length, predicateCount);
    if (applicabilityWork > applicabilityWorkLimit) {
      throw new Error(`Decision "${id}" exceeds the applicability limit of ${applicabilityWorkLimit} predicate visits`);
    }
    const samples = caseInputs.reduce((count, input) =>
      count + ("values" in input ? input.values.length : input.sampling?.samples.length ?? 0), 0);
    if (samples > explorationSampleLimit) {
      throw new Error(`Decision "${id}" exceeds the case exploration limit of ${explorationSampleLimit} tested values`);
    }
    const inputMappings = bindings.reduce((count, binding) =>
      count + ("values" in binding ? binding.values.length : binding.ranges.length), 0);
    const evaluationWork = applicabilityWork + network.assignments * network.nodes.length + inputMappings;
    if ((1 + samples) * evaluationWork > explorationWorkLimit) {
      throw new Error(`Decision "${id}" exceeds the case exploration limit of ${explorationWorkLimit} work units for the baseline and all sensitivity samples`);
    }
    validateSamplingCoverage(decision, caseInputs, id);
    return { id, caseInputs, decision };
  });
  return { version: 3, routes };
}
