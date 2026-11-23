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

const extraNodes = (count: number) => Array.from({ length: count }, (_, i) =>
  `<node id="extra-${i}"><state id="a" label="A"/><state id="b" label="B"/><row probabilities="0.5 0.5"/></node>`).join("");

test("rejects a decision with too many applicability combinations despite a small network", async () => {
  const ids = ["one", "two", "three", "four"];
  const changed = xml
    .replace("<network ", `${ids.map((id) =>
      `<case-input id="${id}" label="${id}" type="numeric" unit="points"/>`).join("")}<network `)
    .replace("</network>", `${extraNodes(ids.length)}</network>`)
    .replace("<applicability>", `${ids.map((id, i) =>
      `<observe input="${id}" node="extra-${i}"><range state="a"/></observe>`).join("")}<applicability>`)
    .replace(/<any>[^]*?<\/any>/, (predicate) => `<all>${predicate}${ids.map((id) =>
      `<any>${[1, 2, 3, 4, 5].map((threshold) =>
        `<compare input="${id}" operator="eq" threshold="${threshold}"/>`).join("")}</any>`).join("")}</all>`);
  const invalid = join(directory, "invalid.xml");
  const output = join(directory, "app");
  await writeFile(invalid, changed);
  const rejection = buildApp(invalid, output, [...verify, "--replace"]);
  expect(rejection.status).not.toBe(0);
  expect(rejection.stderr).toMatch(/review-sample.*applicability limit/);
  expect(await readArtifact(output)).toEqual(before);
}, 15_000);

test("rejects a sensitivity sweep that would repeatedly evaluate a costly blank case", async () => {
  const ids = ["one", "two", "three", "four", "five", "six", "sampled"];
  const samples = Array.from({ length: 64 }, (_, value) => `<sample value="${value}"/>`).join("");
  const changed = xml
    .replace("<network ", `${ids.map((id) =>
      `<case-input id="${id}" label="${id}" type="numeric" unit="points">${
        id === "sampled" ? `<sampling min="0" max="63">${samples}</sampling>` : ""}</case-input>`).join("")}<network `)
    .replace("</network>", `${extraNodes(ids.length)}</network>`)
    .replace("<applicability>", `${ids.map((id, i) =>
      `<observe input="${id}" node="extra-${i}"><range state="a"/></observe>`).join("")}<applicability>`)
    .replace("</any>", `${ids.slice(0, -1).map((id) =>
      `<compare input="${id}" operator="eq" threshold="1"/>`).join("")}</any>`);
  const invalid = join(directory, "invalid.xml");
  const output = join(directory, "app");
  await writeFile(invalid, changed);
  const rejection = buildApp(invalid, output, [...verify, "--replace"]);
  expect(rejection.status).not.toBe(0);
  expect(rejection.stderr).toMatch(/review-sample.*case exploration limit.*work units/);
  expect(await readArtifact(output)).toEqual(before);
}, 15_000);

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
  ["network over inference limit", '</network>', `${extraNodes(10)}</network>`, /inference limit of 4096/],
  ["too many predicate elements", '<equals input="screen" value="clear" />',
    '<equals input="screen" value="clear" />'.repeat(128), /applicability limit of 128 predicate elements/],
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

test("verifies routed decisions sharing a multi-parent network and preserves the original on rerun", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-routed-network-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const fixture = "fixtures/routed-network";
  const output = join(directory, "app");
  const args = ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`];
  const first = buildApp(`${fixture}/model.xml`, output, args);
  expect(first.status, first.stderr).toBe(0);
  const original = await readArtifact(output);
  const coverage = await readFile(join(output, "coverage-report.md"), "utf8");
  const report = await readFile(join(output, "test-report.md"), "utf8");
  expect(coverage).toMatch(/first-review.*verified and delivered/);
  expect(coverage).toMatch(/second-review.*verified and delivered/);
  expect(report).toMatch(/first-review: verified/);
  expect(report).toMatch(/second-review: verified/);
  expect(report).toMatch(/Browser checks not run by this build/);
  const rerun = buildApp(`${fixture}/model.xml`, output, args);
  expect(rerun.status, rerun.stderr).toBe(0);
  expect(await readArtifact(output)).toEqual(original);
  expect((await readdir(directory)).length).toBe(2);
}, 30_000);

test("excludes only the routed decision with a mismatched verification case", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-partial-network-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const fixture = "fixtures/routed-network";
  const cases = join(directory, "cases.json");
  const output = join(directory, "app");
  await writeFile(cases, (await readFile(`${fixture}/cases.json`, "utf8")).replace('"score": 0.9', '"score": 0.1'));
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", cases, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const coverage = await readFile(join(output, "coverage-report.md"), "utf8");
  const report = await readFile(join(output, "test-report.md"), "utf8");
  expect(coverage).toMatch(/Build status: partial/);
  expect(coverage).toMatch(/first-review.*excluded/);
  expect(coverage).toMatch(/second-review.*verified and delivered/);
  expect(report).toMatch(/first-review: excluded[\s\S]*Case first-both-yes: expected/);
  expect(report).toMatch(/second-review: verified/);
}, 30_000);

test("verifies exact source and observation thresholds from authored decimal cases", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-numeric-network-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const fixture = "fixtures/numeric-review";
  const output = join(directory, "app");
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  expect(await readFile(join(output, "model.xml"))).toEqual(await readFile(`${fixture}/model.xml`));
  const report = await readFile(join(output, "test-report.md"), "utf8");
  expect(report).toMatch(/review-reading: verified/);
  for (const id of ["below-source", "at-source", "above-source", "below-model", "at-model", "above-model", "unanswered"]) {
    expect(report).toContain(`Case ${id}: passed`);
  }
}, 30_000);

test("does not verify a numeric decision that skips exact equality at a model threshold", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-numeric-coverage-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const fixture = "fixtures/numeric-review";
  const cases = join(directory, "cases.json");
  const output = join(directory, "app");
  const authored = await readFile(`${fixture}/cases.json`, "utf8");
  await writeFile(cases, authored.split("\n").filter((line) => !line.includes('"at-model"')).join("\n"));
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", cases, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/No verified decisions: review-reading: Insufficient coverage: missing case at threshold 0\.3 for Case Input "reading"/);
  await expect(stat(output)).rejects.toHaveProperty("code", "ENOENT");
}, 30_000);

test.each([
  ["unmapped equality", '<range min="0.3" max="3e-1" min-inclusive="true" max-inclusive="true" state="boundary" />', "", /Gap in numeric ranges/],
  ["decimal gap", '<range max="0.3"', '<range max="0.29999999999999999999"', /Gap in numeric ranges/],
  ["double-mapped equality", '<range max="0.3"', '<range max="0.3" max-inclusive="true"', /Overlap in numeric ranges/],
  ["decimal overlap", '<range max="0.3"', '<range max="0.30000000000000000001"', /Overlap in numeric ranges/],
  ["bounded domain", '<range min="3e-1" state="high"', '<range min="3e-1" max="1" state="high"', /Gap in numeric ranges/],
  ["unknown state", 'state="boundary"', 'state="unknown"', /Invalid numeric state mapping/],
  ["empty interval", 'min-inclusive="true" max-inclusive="true"', 'min-inclusive="true" max-inclusive="false"', /Empty or inverted numeric range/],
  ["invalid bound", '<range max="0.3"', '<range max="NaN"', /Invalid numeric range max/],
] as const)("rejects numeric partitions with %s before replacing an existing artifact", async (_name, original, replacement, diagnostic) => {
  const fixture = "fixtures/numeric-review";
  const authored = await readFile(`${fixture}/model.xml`, "utf8");
  const invalid = join(directory, "invalid.xml");
  const output = join(directory, "app");
  const changed = authored.replace(original, replacement);
  expect(changed).not.toBe(authored);
  await writeFile(invalid, changed);
  const run = buildApp(invalid, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`, "--replace"]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(diagnostic);
  expect(await readArtifact(output)).toEqual(before);
  expect((await readdir(directory)).sort()).toEqual(["app", "invalid.xml"]);
}, 15_000);

async function expectRejectedSampling(sampling: string, diagnostic: RegExp) {
  const fixture = "fixtures/numeric-review";
  const authored = await readFile(`${fixture}/model.xml`, "utf8");
  const invalid = join(directory, "invalid.xml");
  const output = join(directory, "app");
  const changed = authored.replace('unit="points" />', `unit="points">${sampling}</case-input>`);
  expect(changed).not.toBe(authored);
  await writeFile(invalid, changed);
  const run = buildApp(invalid, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`, "--replace"]);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(diagnostic);
  expect(await readArtifact(output)).toEqual(before);
  expect((await readdir(directory)).sort()).toEqual(["app", "invalid.xml"]);
}

test.each([
  ["inverted interval", '<sampling min="0.4" max="0.1"><sample value="0.2"/></sampling>', /inverted sampling interval/],
  ["non-decimal bound", '<sampling min="0" max="Infinity"><sample value="0.2"/></sampling>', /invalid sampling max/i],
  ["no samples", '<sampling min="0" max="0.4"/>', /requires at least one sample/],
  ["non-decimal sample", '<sampling min="0" max="0.4"><sample value="NaN"/></sampling>', /invalid sample value/i],
  ["out-of-interval sample", '<sampling min="0" max="0.3"><sample value="0.30000000000000000001"/></sampling>', /sample .*outside/],
  ["exact decimal duplicate", '<sampling min="0" max="0.4"><sample value="0.30"/><sample value="3e-1"/></sampling>', /duplicate sample/i],
  ["too many sample rows for a small model", `<sampling min="0" max="256">${
    ["0.1", "0.3", ...Array.from({ length: 257 }, (_, i) => i)].map((value) => `<sample value="${value}"/>`).join("")
  }</sampling>`, /case exploration limit.*256 tested values/],
] as const)("rejects numeric sampling with %s before replacing an existing artifact", async (_name, sampling, diagnostic) => {
  await expectRejectedSampling(sampling, diagnostic);
}, 15_000);

test.each([
  ["source boundary", ["0.09", "0.2", "3e-1", "0.31"], /sample at threshold 0\.1/],
  ["model boundary", ["0.09", "1e-1", "0.2", "0.30000000000000000001"], /sample at threshold 0\.3/],
  ["below the source boundary", ["0.1", "0.2", "0.3", "0.31"], /sample below threshold 0\.1/],
  ["above the model boundary", ["0.09", "0.1", "0.2", "0.3"], /sample above threshold 0\.3/],
] as const)("rejects numeric sampling without a sample at or on the required side of %s", async (_name, values, diagnostic) => {
  await expectRejectedSampling(
    `<sampling min="0.09" max="0.31">${values.map((value) => `<sample value="${value}"/>`).join("")}</sampling>`,
    diagnostic,
  );
}, 15_000);

test("accepts authored samples at closed interval ends without requiring samples outside the interval", async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), "decide-sampling-ends-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const fixture = "fixtures/numeric-review";
  const model = join(directory, "sampled.xml");
  const output = join(directory, "app");
  const authored = await readFile(`${fixture}/model.xml`, "utf8");
  await writeFile(model, authored.replace('unit="points" />', `unit="points">
    <sampling min="0.1" max="3e-1"><sample value="1e-1"/><sample value="0.300"/></sampling>
  </case-input>`));
  const run = buildApp(model, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  expect(await readFile(join(output, "model.xml"))).toEqual(await readFile(model));
}, 30_000);
