import { readFile } from "node:fs/promises";
import { beforeAll, expect, test } from "vitest";
import { evaluateDecision, inferPosterior, type DecideModel } from "../src/model.ts";
import { readModel } from "../src/read-model.ts";

let decision: DecideModel["decision"];

beforeAll(async () => {
  const fixture = new URL("../fixtures/six-week-follow-up/model.xml", import.meta.url);
  ({ decision } = readModel(await readFile(fixture)));
});

test("scores the six-week guidance when baseline checks are complete", () => {
  const result = evaluateDecision(decision, "yes");

  expect(result).toEqual({
    status: "applicable",
    action: { id: "recheck", label: "Recheck at six weeks" },
    doNotConsiderScore: expect.closeTo(0.01, 10),
  });
});

test("marginalizes latent states to score the source-selected action given observed evidence", () => {
  const network = [
    { id: "latent", states: ["low", "high"], parents: [], rows: [{ when: [], probabilities: [0.6, 0.4] }] },
    { id: "observation", states: ["negative", "positive"], parents: ["latent"], rows: [
      { when: ["low"], probabilities: [0.8, 0.2] },
      { when: ["high"], probabilities: [0.2, 0.8] },
    ] },
    { id: "action", states: ["selected", "other"], parents: ["latent"], rows: [
      { when: ["low"], probabilities: [0.1, 0.9] },
      { when: ["high"], probabilities: [0.7, 0.3] },
    ] },
  ];
  // P(high | positive) = 8/11, hence P(selected | positive) = 59/110.
  expect(inferPosterior(network, "action", "selected", { observation: "positive" })).toBeCloseTo(59 / 110, 12);
  expect(inferPosterior(network, "action", "selected", { observation: "negative" })).toBeCloseTo(13 / 70, 12);
});

test("does not invent a posterior when observed evidence has zero probability", () => {
  const network = [
    { id: "observation", states: ["possible", "impossible"], parents: [], rows: [{ when: [], probabilities: [1, 0] }] },
    { id: "action", states: ["selected", "other"], parents: [], rows: [{ when: [], probabilities: [0.4, 0.6] }] },
  ];
  expect(inferPosterior(network, "action", "selected", { observation: "impossible" })).toBeNull();
});

test("returns an unmet condition when baseline checks are incomplete", () => {
  expect(evaluateDecision(decision, "no")).toEqual({ status: "unmet" });
});

test("returns a missing input when baseline checks are unknown", () => {
  expect(evaluateDecision(decision, null)).toEqual({ status: "missing" });
});

test("evaluates numeric thresholds without rounding and distinguishes blank and invalid input", () => {
  const numeric = { ...decision, applicability: { operator: "gte" as const, threshold: "5", condition: "At least 5", citation: "Source" } };
  expect(evaluateDecision(numeric, "4.9999999999999999")).toEqual({ status: "unmet" });
  expect(evaluateDecision(numeric, "5").status).toBe("applicable");
  expect(evaluateDecision(numeric, "5.1").status).toBe("applicable");
  expect(evaluateDecision(numeric, "").status).toBe("missing");
  expect(evaluateDecision(numeric, "5abc").status).toBe("invalid");
});

test.each([
  ["lt", ["applicable", "unmet", "unmet"]],
  ["lte", ["applicable", "applicable", "unmet"]],
  ["gt", ["unmet", "unmet", "applicable"]],
  ["gte", ["unmet", "applicable", "applicable"]],
] as const)("evaluates %s at both sides and the boundary", (operator, expected) => {
  const numeric = { ...decision, applicability: { operator, threshold: "1e1", condition: "Source condition", citation: "Source" } };
  expect(["9.99", "10", "10.01"].map((value) => evaluateDecision(numeric, value).status)).toEqual(expected);
});
