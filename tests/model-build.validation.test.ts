import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type TestContext } from "vitest";
import { buildApp } from "./build-app.ts";

const fixture = "fixtures/six-week-follow-up/model.xml";

async function createBuildDirectory({ onTestFinished }: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "decide-model-build-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function expectBuildRejection(
  context: TestContext,
  original: string,
  replacement: string,
  diagnostic: RegExp,
) {
  const directory = await createBuildDirectory(context);
  const model = join(directory, "invalid.xml");
  const output = join(directory, "app");
  const xml = await readFile(fixture, "utf8");
  expect(xml).toContain(original);
  await writeFile(model, xml.replace(original, replacement));

  const run = buildApp(model, output);

  expect(run.error).toBeUndefined();
  expect(run.status).toBeGreaterThan(0);
  expect(run.stderr).toContain(`Build failed for ${model}:`);
  expect(run.stderr).toMatch(diagnostic);
  await expect(stat(output)).rejects.toHaveProperty("code", "ENOENT");
}

test("rejects an unsupported Decide XML schema version", async (context) => {
  await expectBuildRejection(context, '<decide-model version="1">', '<decide-model version="2">',
    /unsupported Decide XML schema version "2".+expected "1"/i);
});

test("rejects malformed model XML with unquoted attributes", async (context) => {
  await expectBuildRejection(context, 'version="1">', 'version=1>', /malformed XML/i);
});

test("rejects malformed model XML with a bare ampersand", async (context) => {
  await expectBuildRejection(context, 'label="Yes"', 'label="Yes & ready"', /malformed XML/i);
});

test("rejects malformed model XML with two leading UTF-8 byte-order marks", async (context) => {
  await expectBuildRejection(context, "<?xml", "\uFEFF\uFEFF<?xml", /malformed XML/i);
});

test("accepts model XML with one leading UTF-8 byte-order mark", async (context) => {
  const directory = await createBuildDirectory(context);
  const model = join(directory, "model-with-bom.xml");
  const output = join(directory, "app");
  const xml = `\uFEFF${await readFile(fixture, "utf8")}`;
  await writeFile(model, xml);

  const run = buildApp(model, output);
  expect(run.error).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
  expect(await readFile(join(output, "model.xml"), "utf8")).toBe(xml);
});

test("rejects structurally invalid model XML with duplicate applicability elements", async (context) => {
  await expectBuildRejection(context, '</applicability>', '</applicability><applicability />',
    /expected exactly one <applicability> in <clinical-decision>.*found 2/i);
});

test("rejects an applicability reference to an unknown Case Input", async (context) => {
  await expectBuildRejection(context, 'input="baseline-checks"', 'input="other-input"',
    /applicability.*unknown Case Input "other-input"/i);
});

test("rejects an applicability reference to an unknown Case Input value", async (context) => {
  await expectBuildRejection(context, 'value="yes"', 'value="maybe"', /applicability.*unknown value "maybe"/i);
});

test("rejects ambiguous Case Input value labels", async (context) => {
  await expectBuildRejection(context, 'label="No"', 'label="Yes"',
    /duplicate Case Input display label "Yes".*"yes" and "no"/i);
});

test("rejects canonically equivalent Case Input value labels", async (context) => {
  await expectBuildRejection(context, 'label="Yes" />\n    <value id="no" label="No"',
    'label="Café" />\n    <value id="no" label="Cafe&#x301;"',
    /duplicate Case Input display label .*"yes" and "no"/i);
});

test("rejects Case Input value labels that collide after distinguishing a modeled Unknown", async (context) => {
  await expectBuildRejection(context, 'label="Yes" />\n    <value id="no" label="No"',
    'label="Unknown" />\n    <value id="no" label=" unknown  (modeled value) "',
    /duplicate Case Input display label .*"yes" and "no"/i);
});

test("rejects an action distribution referencing an unknown guidance action", async (context) => {
  await expectBuildRejection(context, 'guidance="recheck"', 'guidance="missing"', /unknown guidance action "missing"/i);
});

test("rejects an action distribution with duplicate action IDs", async (context) => {
  await expectBuildRejection(context, 'id="defer"', 'id="recheck"', /duplicate <action> id "recheck"/i);
});

test("rejects an action distribution whose probabilities do not sum to one", async (context) => {
  await expectBuildRejection(context, 'probability="0.99"', 'probability="0.90"',
    /action distribution.*probabilities must sum to 1.*0\.91/i);
});

for (const [guidanceProbability, otherProbability] of [
  ["1.01", "-0.01"],
  ["1.00000000000000001", "0"],
  ["-1e-400", "1"],
]) {
  test(`rejects out-of-range action probability ${guidanceProbability} even when the total rounds to one`, async (context) => {
    const original = 'probability="0.99" />\n      <action id="defer" label="Defer the timing decision" probability="0.01"';
    const replacement = original.replace('"0.99"', `"${guidanceProbability}"`).replace('"0.01"', `"${otherProbability}"`);
    await expectBuildRejection(context, original, replacement, /action "recheck" has invalid probability/i);
  });
}
