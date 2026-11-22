import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type TestContext } from "vitest";
import { buildApp } from "./build-app.ts";

const fixture = "fixtures/six-week-follow-up/model.xml";

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
