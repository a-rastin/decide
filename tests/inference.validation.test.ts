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
    action: "Recheck at six weeks",
    doNotConsiderScore: expect.closeTo(0.01, 10),
  });
});

test("returns an unmet condition when baseline checks are incomplete", () => {
  expect(evaluateDecision(decision, "no")).toEqual({ status: "unmet" });
});

test("returns a missing input when baseline checks are unknown", () => {
  expect(evaluateDecision(decision, null)).toEqual({ status: "missing" });
});
