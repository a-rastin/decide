import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { buildApp } from "./build-app.ts";

const fixture = "fixtures/latent-review";
const verify = ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`];
const model = `${fixture}/model.xml`;

async function readArtifact(directory: string) {
  return Promise.all((await readdir(directory)).sort().map(async (name) => [name, await readFile(join(directory, name))]));
}

let directory: string;
let xml: string;
let before: Awaited<ReturnType<typeof readArtifact>>;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "decide-network-build-"));
  const output = join(directory, "app");
  const run = buildApp(model, output, verify);
  expect(run.status, run.stderr).toBe(0);
  before = await readArtifact(output);
  xml = await readFile(model, "utf8");
}, 30_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

const extraNodes = Array.from({ length: 10 }, (_, i) =>
  `<node id="extra-${i}"><state id="a" label="A"/><state id="b" label="B"/><row probabilities="0.5 0.5"/></node>`).join("");

test.each([
  ["unknown network", 'network="review-network"', 'network="missing"', /unknown network/],
  ["unknown action node", 'action-node="next-step"', 'action-node="missing"', /unknown action node/],
  ["unknown guidance", 'guidance="review"', 'guidance="missing"', /unknown guidance state/],
  ["unknown observed node", 'node="screening"', 'node="missing"', /unknown observed node/],
  ["unknown input", 'input="screen" node=', 'input="missing" node=', /unknown Case Input/],
  ["unknown predicate value", '<equals input="screen" value="clear"', '<equals input="screen" value="missing"', /unknown value/],
  ["unknown parent", '<parent node="pattern"', '<parent node="missing"', /unknown parent/],
  ["cycle", '<node id="pattern">', '<node id="pattern"><parent node="screening"/>', /cycle/],
  ["unknown parent state", 'when="a" probabilities="0.6', 'when="unknown" probabilities="0.6', /invalid parent state tuple/i],
  ["missing table row", '<row when="b" probabilities="0.2 0.6 0.2" />', '', /incomplete probability table/i],
  ["duplicate table row", 'when="b" probabilities="0.2 0.6 0.2"', 'when="a" probabilities="0.2 0.6 0.2"', /duplicate probability row/i],
  ["missing probability", '0.6 0.2 0.2', '0.8 0.2', /wrong number of probabilities/i],
  ["non-normalized row", '0.6 0.2 0.2', '0.7 0.2 0.2', /must sum to 1/],
  ["NaN probability", '0.6 0.2 0.2', 'NaN 0.2 0.2', /invalid probability/],
  ["non-finite probability", '0.6 0.2 0.2', '1e999 0 0', /invalid probability/],
  ["probability above one", '0.6 0.2 0.2', '1.00000000000000001 0 0', /invalid probability/],
  ["negative probability", '0.6 0.2 0.2', '-1e-400 1 0', /invalid probability/],
  ["missing state mapping", '<map value="outside" state="excluded" />', '', /incomplete state mapping/i],
  ["unknown mapped state", 'value="outside" state="excluded"', 'value="outside" state="missing"', /invalid or duplicate state mapping/i],
  ["duplicate mapping", 'value="outside" state="excluded"', 'value="clear" state="excluded"', /invalid or duplicate state mapping/i],
  ["network over inference limit", '</network>', `${extraNodes}</network>`, /inference limit of 4096/],
] as const)("rejects a model with %s and preserves the artifact", async (_name, original, replacement, diagnostic) => {
  const output = join(directory, "app");
  const invalid = join(directory, "invalid.xml");
  const changed = xml.replace(original, replacement);
  expect(changed).not.toBe(xml);
  await writeFile(invalid, changed);
  const rejection = buildApp(invalid, output, [...verify, "--replace"]);
  expect(rejection.status, `${replacement}: ${rejection.stderr}`).not.toBe(0);
  expect(rejection.stderr).toMatch(diagnostic);
  expect(await readArtifact(output)).toEqual(before);
  expect((await readdir(directory)).sort()).toEqual(["app", "invalid.xml"]);
}, 15_000);

test("does not publish the v3 decision when its independently authored score does not match", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-network-verification-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const cases = join(directory, "cases.json");
  const output = join(directory, "app");
  await writeFile(cases, (await readFile(`${fixture}/cases.json`, "utf8")).replace('"score": 0.65', '"score": 0.35'));
  const run = buildApp(model, output, ["--cases", cases, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/No verified decisions: review-sample: Case clear: expected .*; actual /);
  await expect(stat(output)).rejects.toHaveProperty("code", "ENOENT");
});
