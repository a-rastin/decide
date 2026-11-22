import { readFile } from "node:fs/promises";
import { beforeAll, expect, test } from "vitest";
import { evaluateDecision, type DecideModel } from "../src/model.ts";
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
