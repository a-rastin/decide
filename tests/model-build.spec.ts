import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { expect, test, type TestInfo } from "@playwright/test";

const fixture = "fixtures/six-week-follow-up/model.xml";

async function expectBuildRejection(
  testInfo: TestInfo,
  original: string,
  replacement: string,
  diagnostic: RegExp,
) {
  const model = testInfo.outputPath("invalid.xml");
  const output = testInfo.outputPath("app");
  const xml = await readFile(fixture, "utf8");
  expect(xml).toContain(original);
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(model, xml.replace(original, replacement));

  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run the build checks with npm test");
  const run = spawnSync(process.execPath, [npm, "run", "build", "--", model, output], { encoding: "utf8" });

  expect(run.error).toBeUndefined();
  expect(run.status).toBeGreaterThan(0);
  expect(run.stderr).toContain(`Build failed for ${model}:`);
  expect(run.stderr).toMatch(diagnostic);
  await expect(stat(output)).rejects.toHaveProperty("code", "ENOENT");
}

test("rejects an unsupported Decide XML schema version", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, '<decide-model version="1">', '<decide-model version="2">',
    /unsupported Decide XML schema version "2".+expected "1"/i);
});

test("rejects malformed model XML with unquoted attributes", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'version="1">', 'version=1>', /malformed XML/i);
});

test("rejects malformed model XML with a bare ampersand", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'label="Yes"', 'label="Yes & ready"', /malformed XML/i);
});

test("rejects structurally invalid model XML with duplicate applicability elements", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, '</applicability>', '</applicability><applicability />',
    /expected exactly one <applicability> in <clinical-decision>.*found 2/i);
});

test("rejects an applicability reference to an unknown Case Input", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'input="baseline-checks"', 'input="other-input"',
    /applicability.*unknown Case Input "other-input"/i);
});

test("rejects an applicability reference to an unknown Case Input value", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'value="yes"', 'value="maybe"', /applicability.*unknown value "maybe"/i);
});

test("rejects an action distribution referencing an unknown guidance action", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'guidance="recheck"', 'guidance="missing"', /unknown guidance action "missing"/i);
});

test("rejects an action distribution with duplicate action IDs", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'id="defer"', 'id="recheck"', /duplicate <action> id "recheck"/i);
});

test("rejects an action distribution whose probabilities do not sum to one", async ({}, testInfo) => {
  await expectBuildRejection(testInfo, 'probability="0.99"', 'probability="0.90"',
    /action distribution.*probabilities must sum to 1.*0\.91/i);
});

for (const [guidanceProbability, otherProbability] of [
  ["1.01", "-0.01"],
  ["1.00000000000000001", "0"],
  ["-1e-400", "1"],
]) {
  test(`rejects out-of-range action probability ${guidanceProbability} even when the total rounds to one`, async ({}, testInfo) => {
    const original = 'probability="0.99" />\n      <action id="defer" label="Defer the timing decision" probability="0.01"';
    const replacement = original.replace('"0.99"', `"${guidanceProbability}"`).replace('"0.01"', `"${otherProbability}"`);
    await expectBuildRejection(testInfo, original, replacement, /action "recheck" has invalid probability/i);
  });
}
