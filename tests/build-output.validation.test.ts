import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type TestContext } from "vitest";
import { buildApp } from "./build-app.ts";

const fixture = "fixtures/six-week-follow-up/model.xml";

test("mixed build reports verification and source coverage separately", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-reports-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "app");
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, [
    "--inventory", "fixtures/mixed-decisions/inventory.json",
    "--cases", "fixtures/mixed-decisions/cases.json",
  ]);
  expect(run.status, run.stderr).toBe(0);
  const coverage = await readFile(join(output, "coverage-report.md"), "utf8");
  const tests = await readFile(join(output, "test-report.md"), "utf8");
  expect(coverage).toMatch(/partial/i);
  expect(coverage).toMatch(/routine-review.*delivered/i);
  expect(coverage).toMatch(/inspect-equipment.*excluded/i);
  expect(coverage).toMatch(/later-review-date.*unresolved/i);
  expect(coverage).toMatch(/appendix.*unprocessed/i);
  expect(tests).toContain("equipment-yes-deliberate-mismatch");
  expect(tests).toMatch(/expected.*0\.2/i);
  expect(tests).toMatch(/actual.*0\.09999999999999998/i);
  expect(tests).toMatch(/browser.*not run/i);
  expect(await readFile(join(output, "model.xml"))).toEqual(await readFile("fixtures/mixed-decisions/model.xml"));
});

test("fully verified and inventoried decisions produce a complete coverage report", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-complete-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const cases = JSON.parse(await readFile("fixtures/mixed-decisions/cases.json", "utf8"));
  cases.cases.find((entry: { id: string }) => entry.id === "equipment-yes-deliberate-mismatch").expected.score = 0.1;
  const inventory = JSON.parse(await readFile("fixtures/mixed-decisions/inventory.json", "utf8"));
  inventory.decisions = inventory.decisions.filter((entry: { status: string }) => entry.status === "modeled");
  inventory.sections = [];
  const casesPath = join(directory, "cases.json"), inventoryPath = join(directory, "inventory.json");
  await writeFile(casesPath, JSON.stringify(cases));
  await writeFile(inventoryPath, JSON.stringify(inventory));
  const output = join(directory, "app");
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, ["--cases", casesPath, "--inventory", inventoryPath]);
  expect(run.status, run.stderr).toBe(0);
  expect(await readFile(join(output, "coverage-report.md"), "utf8")).toContain("Build status: complete");
  inventory.sections = [{ id: "appendix", section: "§5", status: "unreadable", reason: "Illegible." }];
  await writeFile(inventoryPath, JSON.stringify(inventory));
  const partialOutput = join(directory, "partial");
  const partialRun = buildApp("fixtures/mixed-decisions/model.xml", partialOutput, ["--cases", casesPath, "--inventory", inventoryPath]);
  expect(partialRun.status, partialRun.stderr).toBe(0);
  expect(await readFile(join(partialOutput, "coverage-report.md"), "utf8")).toMatch(/Build status: partial[\s\S]*appendix.*unreadable/);
}, 20000);

test("rejects an inventory that omits a modeled Clinical Decision", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-inventory-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const inventory = JSON.parse(await readFile("fixtures/mixed-decisions/inventory.json", "utf8"));
  inventory.decisions = inventory.decisions.filter((entry: { id: string }) => entry.id !== "repeat-marker");
  const inventoryPath = join(directory, "inventory.json"), output = join(directory, "app");
  await writeFile(inventoryPath, JSON.stringify(inventory));
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, ["--inventory", inventoryPath, "--cases", "fixtures/mixed-decisions/cases.json"]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/repeat-marker.*missing from inventory/);
  await expect(readdir(output)).rejects.toMatchObject({ code: "ENOENT" });
});

test("insufficient verification of all decisions publishes no app and identifies decisions", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-unverified-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const casesPath = join(directory, "cases.json"), output = join(directory, "app");
  await writeFile(casesPath, JSON.stringify({ version: 1, cases: [] }));
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, ["--cases", casesPath, "--inventory", "fixtures/mixed-decisions/inventory.json"]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/No verified decisions.*routine-review.*missing applicable case/i);
  await expect(readdir(output)).rejects.toMatchObject({ code: "ENOENT" });
});

async function generateApp({ onTestFinished }: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "decide-build-output-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "portable app");

  const run = buildApp(fixture, output);
  expect(run.error).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);

  return { directory, output };
}

test("ships the original XML and local assets in the requested output folder", async (context) => {
  const { output } = await generateApp(context);
  const [source, model, html, script, stylesheet] = await Promise.all([
    readFile(fixture),
    readFile(join(output, "model.xml")),
    readFile(join(output, "index.html"), "utf8"),
    readFile(join(output, "app.js"), "utf8"),
    readFile(join(output, "app.css"), "utf8"),
  ]);

  expect(model).toEqual(source);
  expect(html).toMatch(/<script\b[^>]*\bsrc="\.\/app\.js"/);
  expect(html).toMatch(/<link\b[^>]*\bhref="\.\/app\.css"/);
  expect(script.trim()).not.toBe("");
  expect(stylesheet.trim()).not.toBe("");
});

test("successful reruns publish separately and report the actual entry point", async (context) => {
  const { directory, output } = await generateApp(context);
  await writeFile(join(output, "keep.txt"), "previous build");
  const files = (await readdir(output)).sort();
  const original = await Promise.all(files.map((file) => readFile(join(output, file))));
  const run = buildApp(fixture, output);
  expect(run.status, run.stderr).toBe(0);
  const entry = run.stdout.match(/Generated (.+index\.html)/)?.[1];
  expect(entry).toBeDefined();
  expect(entry).not.toBe(join(output, "index.html"));
  expect(entry).toMatch(new RegExp(`^${directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));
  expect(await readFile(entry!, "utf8")).toContain("app.js");
  expect((await readdir(output)).sort()).toEqual(files);
  expect(await Promise.all(files.map((file) => readFile(join(output, file))))).toEqual(original);
}, 20000);

test("explicit replacement publishes the complete new build at the requested destination", async (context) => {
  const { output } = await generateApp(context);
  await writeFile(join(output, "keep.txt"), "old");
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, [
    "--replace", "--cases", "fixtures/mixed-decisions/cases.json",
    "--inventory", "fixtures/mixed-decisions/inventory.json",
  ]);
  expect(run.status, run.stderr).toBe(0);
  expect(run.stdout).toContain(`Generated ${join(output, "index.html")}`);
  await expect(readFile(join(output, "keep.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(output, "model.xml"))).toEqual(await readFile("fixtures/mixed-decisions/model.xml"));
  expect(await readFile(join(output, "coverage-report.md"), "utf8")).toMatch(/partial/i);
  expect(await readFile(join(output, "test-report.md"), "utf8")).toContain("equipment-yes-deliberate-mismatch");
}, 20000);

test("failed explicit replacements preserve the existing artifact and leave no staged build", async (context) => {
  const { directory, output } = await generateApp(context);
  const files = (await readdir(output)).sort();
  const original = await Promise.all(files.map((file) => readFile(join(output, file))));
  const invalid = join(directory, "invalid.xml");
  const cases = join(directory, "empty-cases.json");
  await writeFile(invalid, '<decide-model version="99" />');
  await writeFile(cases, JSON.stringify({ version: 1, cases: [] }));
  const invalidRun = buildApp(invalid, output, ["--replace"]);
  expect(invalidRun.status).not.toBe(0);
  expect(invalidRun.stderr).toMatch(/unsupported Decide XML schema version/i);
  const unverified = buildApp("fixtures/mixed-decisions/model.xml", output, ["--replace", "--cases", cases]);
  expect(unverified.status).not.toBe(0);
  expect(unverified.stderr).toMatch(/no verified decisions/i);
  expect((await readdir(output)).sort()).toEqual(files);
  expect(await Promise.all(files.map((file) => readFile(join(output, file))))).toEqual(original);
  expect((await readdir(directory)).sort()).toEqual(["empty-cases.json", "invalid.xml", "portable app"]);
}, 20000);

test("preserves an existing app when a rebuild rejects the supplied model", async (context) => {
  const { directory, output } = await generateApp(context);
  const files = (await readdir(output)).sort();
  const original = await Promise.all(files.map((file) => readFile(join(output, file))));
  const invalidModel = join(directory, "unsupported.xml");
  await writeFile(invalidModel, '<decide-model version="99" />');

  const run = buildApp(invalidModel, output);

  expect(run.error).toBeUndefined();
  expect(run.status).toBeGreaterThan(0);
  expect(run.stderr).toContain(`Build failed for ${invalidModel}:`);
  expect(run.stderr).toMatch(/unsupported Decide XML schema version "99"/i);
  expect((await readdir(output)).sort()).toEqual(files);
  const afterRebuild = await Promise.all(files.map((file) => readFile(join(output, file))));
  for (const [index, file] of files.entries()) {
    expect(afterRebuild[index].equals(original[index]), `${file} changed`).toBe(true);
  }
});
