import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { buildApp } from "./build-app.ts";

const explorationFixture = "fixtures/joint-exploration";

function buildExploration(output: string) {
  const run = buildApp(`${explorationFixture}/model.xml`, output, [
    "--cases", `${explorationFixture}/cases.json`, "--inventory", `${explorationFixture}/inventory.json`,
  ]);
  expect(run.status, run.stderr).toBe(0);
  const entry = run.stdout.match(/^Generated (.+)$/m)?.[1];
  expect(entry, run.stdout).toBe(join(output, "index.html"));
  return entry!;
}

test("publishes the routed exploration fixture with its original XML and separate verification reports", async ({}, testInfo) => {
  const folder = dirname(buildExploration(testInfo.outputPath("exploration-artifacts")));
  expect(await readFile(join(folder, "model.xml"))).toEqual(await readFile(`${explorationFixture}/model.xml`));
  for (const asset of ["index.html", "app.js", "app.css"]) {
    expect((await readFile(join(folder, asset))).length).toBeGreaterThan(0);
  }
  const coverage = await readFile(join(folder, "coverage-report.md"), "utf8");
  expect(coverage).toMatch(/joint-review.*verified and delivered/);
  expect(coverage).toMatch(/follow-up-review.*verified and delivered/);
  const report = await readFile(join(folder, "test-report.md"), "utf8");
  expect(report).toContain("Case joint-both-edits: passed");
  expect(report).toContain("Case follow-up-optional-marker: passed");
  expect(report).not.toContain(": failed");
});

test("reproduces joint exploration from the printed entry point before and after relocation", async ({ browser }, testInfo) => {
  const entry = buildExploration(testInfo.outputPath("exploration-app"));
  const relocated = testInfo.outputPath("relocated exploration app");
  async function exerciseAt(path: string) {
    const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
    const requests: string[] = [];
    const sockets: string[] = [];
    const errors: string[] = [];
    context.on("request", (request) => {
      if (!["file:", "data:", "blob:"].includes(new URL(request.url()).protocol)) requests.push(request.url());
    });
    try {
      const page = await context.newPage();
      page.on("websocket", (socket) => sockets.push(socket.url()));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(pathToFileURL(path).href);
      await exerciseJointExploration(page);
      expect(requests).toEqual([]);
      expect(sockets).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
  await test.step("at the printed entry point", () => exerciseAt(entry));
  await rename(dirname(entry), relocated);
  await test.step("after moving the entire folder", () => exerciseAt(join(relocated, relative(dirname(entry), entry))));
});

async function exerciseJointExploration(page: Page) {
  const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
  const reading = inputs.getByRole("textbox", { name: "Synthetic reading (points)" });
  const marker = inputs.getByRole("radiogroup", { name: "Shared synthetic marker" });
  const result = page.getByRole("region", { name: "Decision result" });
  const sensitivity = page.getByRole("region", { name: "Sensitivity Bars" });
  const ranges = sensitivity.getByRole("list", { name: "Comparable score ranges" });
  const samples = (name: string) => sensitivity.getByRole("table", { name }).getByRole("row")
    .filter({ has: page.getByRole("rowheader") });
  const condition = "The reading is at least 0.3 points, or it is at least 0.1 points and the marker is not Outside exercise.";
  const sandbox = page.getByRole("region", { name: "What-If Sandbox" });
  const open = sandbox.getByRole("button", { name: "Open What-If Sandbox" });
  const original = sandbox.getByRole("region", { name: "Original case" });
  const variant = sandbox.getByRole("region", { name: "What-if variant" });
  const draftReading = variant.getByRole("textbox", { name: "Synthetic reading (points)" });
  const draftMarker = variant.getByRole("radiogroup", { name: "Shared synthetic marker" });
  const comparison = sandbox.getByRole("status");
  const keyboard = page.keyboard;

  await expect(page.getByText(/Research only/)).toBeVisible();
  await expect(inputs).toHaveCount(0);
  await keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Synthetic exploration" })).toBeFocused();
  await keyboard.press("Space");
  await expect(inputs).toHaveCount(0);
  await keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Joint review" })).toBeFocused();
  await keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Joint review" })).toBeFocused();
  await keyboard.press("Tab");
  await expect(reading).toBeFocused();
  await expect(inputs.getByRole("textbox")).toHaveCount(1);
  await expect(inputs.getByRole("radiogroup")).toHaveCount(1);
  await keyboard.type("0.2");
  await keyboard.press("Tab");
  await expect(marker.getByRole("radio", { name: "Unknown" })).toBeFocused();
  await keyboard.press("ArrowDown");
  await expect(marker.getByRole("radio", { name: "A", exact: true })).toBeChecked();
  await expect(result.getByRole("heading", { name: "Review the synthetic reading" })).toBeVisible();
  await expect(result.getByText(condition)).toBeVisible();
  await expect(result.getByText("Synthetic Exploration Note §1")).toBeVisible();

  async function expectBaselineChart() {
    // Independent weighted sums and spans are worked out in the fixture's source.md.
    await expect(result.getByText("80%", { exact: true })).toBeVisible();
    await expect(ranges.getByRole("listitem")).toHaveText([
      /Synthetic reading.*30%–80%/, /Shared synthetic marker.*60%–80%/,
    ]);
    await expect(sensitivity.getByRole("table", { name: "Synthetic reading" })).toBeVisible();
    await expect(sensitivity.getByRole("table", { name: "Shared synthetic marker" })).toBeVisible();
    await expect(samples("Synthetic reading")).toHaveText([
      `0.09 pointsGuidance does not apply. Source condition: ${condition}`,
      /^0\.1 points\s*80%$/, /^0\.2 points\s*80%$/, /^0\.300 points\s*70%$/, /^0\.31 points\s*30%$/,
    ]);
    await expect(samples("Shared synthetic marker")).toHaveText([
      /^A\s*80%$/, /^B\s*60%$/,
      `Outside exerciseGuidance does not apply. Source condition: ${condition}`,
      /Impossible.*zero probability/,
    ]);
    await expect(sensitivity.getByRole("cell", { name: "10%", exact: true })).toHaveCount(0);
  }
  await expectBaselineChart();

  await keyboard.press("Tab");
  await expect(open).toBeFocused();
  await keyboard.press("Enter");
  await expect(original.getByRole("heading", { name: "Original case" })).toBeVisible();
  await expect(variant.getByRole("heading", { name: "What-if variant" })).toBeVisible();
  await expect(original.getByText("80%", { exact: true })).toBeVisible();
  await expect(variant.getByText("80%", { exact: true })).toBeVisible();
  await keyboard.press("Tab");
  await expect(draftReading).toBeFocused();
  await keyboard.press("ControlOrMeta+a");
  await keyboard.type("0.31");
  await expect(variant.getByText("30%", { exact: true })).toBeVisible();
  await keyboard.press("Tab");
  await expect(draftMarker.getByRole("radio", { name: "A", exact: true })).toBeFocused();
  await keyboard.press("ArrowDown");
  await expect(variant.getByRole("heading", { name: "Review the synthetic reading" })).toBeVisible();
  await expect(variant.getByText("10%", { exact: true })).toBeVisible();
  await expect(comparison).toContainText("-70 percentage points");
  await expect(reading).toHaveValue("0.2");
  await expect(marker.getByRole("radio", { name: "A", exact: true })).toBeChecked();
  await expect(original.getByText("80%", { exact: true })).toBeVisible();
  await expectBaselineChart();

  const reset = variant.getByRole("button", { name: "Reset variant to original" });
  await keyboard.press("Tab");
  await expect(reset).toBeFocused();
  await keyboard.press("Space");
  await expect(draftReading).toHaveValue("0.2");
  await expect(draftMarker.getByRole("radio", { name: "A", exact: true })).toBeChecked();
  await expect(variant.getByText("80%", { exact: true })).toBeVisible();
  await expect(comparison).toContainText("No modeled change");
  await expectBaselineChart();

  await draftMarker.getByText("B", { exact: true }).click();
  await expect(variant.getByText("60%", { exact: true })).toBeVisible();
  await reading.fill("0.300");
  await expect(result.getByText("70%", { exact: true })).toBeVisible();
  await expect(original.getByText("70%", { exact: true })).toBeVisible();
  await expect(ranges.getByRole("listitem")).toHaveText([
    /Synthetic reading.*30%–80%/, /Shared synthetic marker.*50%–70%/,
  ]);
  await expect(draftReading).toHaveValue("0.2");
  await expect(draftMarker.getByRole("radio", { name: "B", exact: true })).toBeChecked();
  await expect(variant.getByText("60%", { exact: true })).toBeVisible();
  await expect(comparison).toContainText("-10 percentage points");

  await keyboard.press("Shift+Tab");
  await expect(page.getByRole("radio", { name: "Joint review" })).toBeFocused();
  await keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "Follow-up review" })).toBeChecked();
  await expect(variant).toHaveCount(0);
  await expect(reading).toHaveValue("");
  await expect(marker.getByRole("radio", { name: "A", exact: true })).toBeChecked();
  await expect(sensitivity.getByText(/Synthetic reading was not varied: no sampling declaration/)).toBeVisible();
  await keyboard.press("ArrowUp");
  await expect(page.getByRole("radio", { name: "Joint review" })).toBeChecked();
  await expect(variant).toHaveCount(0);
  await expect(reading).toHaveValue("0.300");
  await open.click();
  await expect(draftReading).toHaveValue("0.300");
  await expect(draftMarker.getByRole("radio", { name: "A", exact: true })).toBeChecked();
  await draftReading.fill("0.31");
  await expect(variant.getByText("30%", { exact: true })).toBeVisible();
  await reset.click();
  await expect(draftReading).toHaveValue("0.300");
  await expect(variant.getByText("70%", { exact: true })).toBeVisible();
  const close = sandbox.getByRole("button", { name: "Close What-If Sandbox" });
  await close.click();

  for (const [value, state, reason] of [
    ["", "Missing Case Input", "needs Case Inputs to determine whether guidance applies"],
    ["not a number", "Invalid Case Input: Synthetic reading (points)", "has an invalid Case Input"],
    ["0.09", "Guidance does not apply", "has guidance that does not apply"],
  ]) {
    await reading.fill(value);
    await expect(ranges).toHaveCount(0);
    await open.click();
    await expect(original.getByText(state, { exact: true })).toBeVisible();
    await expect(original.getByRole("heading", { name: "Do-Not-Consider Score" })).toHaveCount(0);
    await draftReading.fill("0.31");
    await draftMarker.getByText("B", { exact: true }).click();
    await expect(variant.getByText("10%", { exact: true })).toBeVisible();
    await expect(comparison).toHaveText(`Score comparison unavailable: the original case ${reason}.`);
    await expect(reading).toHaveValue(value);
    await expect(ranges).toHaveCount(0);
    await close.click();
  }

  await reading.fill("0.300");
  await marker.getByText("Unknown", { exact: true }).click();
  await expect(result.getByRole("heading", { name: "Review the synthetic reading" })).toBeVisible();
  await expect(result.getByText("No score. Supply: Shared synthetic marker.")).toBeVisible();
  await expect(ranges).toHaveCount(0);
  await marker.getByText("Impossible", { exact: true }).click();
  await expect(result.getByRole("heading", { name: "Review the synthetic reading" })).toBeVisible();
  await expect(result.getByText(/No score.*zero probability/)).toBeVisible();
  await expect(ranges).toHaveCount(0);
}

test("scores the source-selected v3 action through a latent node in a relocated offline app", async ({ browser }, testInfo) => {
  const fixture = "fixtures/latent-review";
  const output = testInfo.outputPath("network-app");
  const relocated = testInfo.outputPath("relocated network app");
  const run = buildApp(`${fixture}/model.xml`, output, [
    "--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`,
  ]);
  expect(run.status, run.stderr).toBe(0);
  await rename(output, relocated);
  expect(await readFile(join(relocated, "model.xml"))).toEqual(await readFile(`${fixture}/model.xml`));
  expect(await readFile(join(relocated, "coverage-report.md"), "utf8")).toMatch(/review-sample.*verified and delivered/);
  expect(await readFile(join(relocated, "test-report.md"), "utf8")).toMatch(/Case clear: passed[\s\S]*Case flagged: passed[\s\S]*Case outside: passed[\s\S]*Case unanswered: passed/);

  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  const requests: string[] = [];
  const errors: string[] = [];
  context.on("request", (request) => {
    if (!["file:", "data:", "blob:"].includes(new URL(request.url()).protocol)) requests.push(request.url());
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => requests.push(socket.url()));
    await page.goto(pathToFileURL(join(relocated, "index.html")).href);
    await expect(page.getByText(/Research only/)).toBeVisible();
    const input = page.getByRole("radiogroup", { name: "Synthetic screening result" });
    const result = page.getByRole("region", { name: "Decision result" });
    await expect(result.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    const score = result.getByRole("heading", { name: "Do-Not-Consider Score" });
    await expect(score).toHaveCount(0);
    for (const [value, expected] of [["Clear", "65%"], ["Flagged", "35%"]]) {
      await input.getByText(value, { exact: true }).click();
      await expect(result.getByRole("heading", { name: "Consider reviewing the synthetic sample" })).toBeVisible();
      await expect(result.getByText("Synthetic Review Note §1")).toBeVisible();
      await expect(result.getByText(expected, { exact: true })).toBeVisible();
      await expect(result.getByText(/does not estimate a clinical outcome/)).toBeVisible();
    }
    await input.getByText("Outside exercise", { exact: true }).click();
    await expect(result.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await expect(result.getByText("The synthetic screening result is Clear or Flagged.")).toBeVisible();
    await expect(score).toHaveCount(0);
    await input.getByText("Unknown", { exact: true }).click();
    await expect(result.getByText("Synthetic screening result")).toBeVisible();
    await expect(score).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("routes multiple decisions and reuses only shared Case Input IDs offline", async ({ browser }, testInfo) => {
  const fixture = "fixtures/routed-network";
  const output = testInfo.outputPath("routed-app");
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("First scenario", { exact: true }).click();
    await page.getByText("First synthetic decision", { exact: true }).click();
    const result = page.getByRole("region", { name: "Decision result" });
    const observation = page.getByRole("radiogroup", { name: "Synthetic observation" });
    const shared = page.getByRole("radiogroup", { name: "Shared synthetic marker" });
    await expect(result.getByText("Synthetic observation")).toBeVisible();
    await expect(result.getByText("Shared synthetic marker")).toHaveCount(0);
    await observation.getByText("No", { exact: true }).click();
    await expect(result.getByText("Guidance does not apply")).toBeVisible();
    await expect(result.getByText("The first observation is Yes.")).toBeVisible();
    await expect(result.getByText("Synthetic Joint Note §1")).toBeVisible();
    await observation.getByText("Yes", { exact: true }).click();
    await expect(result.getByText("No score. Supply: Shared synthetic marker.")).toBeVisible();
    await shared.getByText("Yes", { exact: true }).click();
    await expect(result.getByText("90%", { exact: true })).toBeVisible();
    await page.getByText("Second scenario", { exact: true }).click();
    await page.getByText("Second synthetic decision", { exact: true }).click();
    await expect(observation.getByRole("radio", { name: "Unknown" })).toBeChecked();
    await expect(shared.getByRole("radio", { name: "Yes" })).toBeChecked();
    await expect(result.getByText("65%", { exact: true })).toBeVisible();
    await observation.getByText("Impossible", { exact: true }).click();
    await expect(result.getByText("No score. The entered evidence has zero probability in this model.")).toBeVisible();
    await expect(result.getByText("Review the synthetic sample")).toBeVisible();
    await expect(result.getByRole("heading", { name: "Do-Not-Consider Score" })).toHaveCount(0);
    await observation.getByText("Yes", { exact: true }).click();
    await shared.getByText("Unknown", { exact: true }).click();
    await expect(result.getByText("80%", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("ranks categorical Sensitivity Bars by one-input score spans offline", async ({ browser }, testInfo) => {
  const fixture = "fixtures/routed-network";
  const output = testInfo.outputPath("categorical-sensitivity");
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("Second scenario", { exact: true }).click();
    await page.getByText("Second synthetic decision", { exact: true }).click();
    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    await inputs.getByRole("radiogroup", { name: "Synthetic observation" }).getByText("Yes", { exact: true }).click();
    await inputs.getByRole("radiogroup", { name: "Shared synthetic marker" }).getByText("Yes", { exact: true }).click();

    const sensitivity = page.getByRole("region", { name: "Sensitivity Bars" });
    await expect(sensitivity.getByText(/model sensitivity, not causation/i)).toBeVisible();
    await expect(sensitivity.getByText(/Review the synthetic sample/)).toBeVisible();
    const ranges = sensitivity.getByRole("list", { name: "Comparable score ranges" });
    // From the reviewed action's CPT: Yes/Yes → 90%, No/Yes → 40%,
    // Yes/No → 70%. The 20% for the joint No/No change is not a sample.
    await expect(ranges.getByRole("listitem")).toHaveText([
      /Synthetic observation.*40%–90%/, /Shared synthetic marker.*70%–90%/,
    ]);
    const observations = sensitivity.getByRole("table", { name: "Synthetic observation" });
    await expect(observations.getByRole("row").filter({ has: page.getByRole("rowheader") })).toHaveText([
      /^Yes\s*90%$/, /^No\s*40%$/, /^Impossible.*zero probability/,
    ]);
    const markers = sensitivity.getByRole("table", { name: "Shared synthetic marker" });
    await expect(markers.getByRole("row").filter({ has: page.getByRole("rowheader") })).toHaveText([
      /^Yes\s*90%$/, /^No\s*70%$/,
    ]);
    await inputs.getByRole("radiogroup", { name: "Synthetic observation" }).getByText("Impossible", { exact: true }).click();
    await expect(ranges).toHaveCount(0);
    await expect(sensitivity.getByRole("status")).toContainText(/original case.*zero probability/i);
  } finally {
    await context.close();
  }
});

test("explains unavailable categorical comparisons without retaining ranges or gating the sandbox", async ({ browser }, testInfo) => {
  const fixture = "fixtures/routed-network";
  const output = testInfo.outputPath("categorical-unavailable");
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("First scenario", { exact: true }).click();
    await page.getByText("First synthetic decision", { exact: true }).click();
    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    const observation = inputs.getByRole("radiogroup", { name: "Synthetic observation" });
    const marker = inputs.getByRole("radiogroup", { name: "Shared synthetic marker" });
    const sensitivity = page.getByRole("region", { name: "Sensitivity Bars" });
    const ranges = sensitivity.getByRole("list", { name: "Comparable score ranges" });
    await expect(sensitivity.getByRole("status")).toContainText(/original case.*missing.*guidance applies/i);
    await observation.getByText("Yes", { exact: true }).click();
    await expect(sensitivity.getByRole("status")).toContainText(/original case.*more Case Inputs.*score/i);
    await expect(ranges).toHaveCount(0);
    // Both marker samples can be scored, but the original still cannot.
    await expect(sensitivity.getByRole("table", { name: "Shared synthetic marker" }).getByRole("cell", { name: "70%" })).toBeVisible();

    await marker.getByText("Yes", { exact: true }).click();
    await expect(ranges.getByRole("listitem")).toHaveText([/Shared synthetic marker.*70%–90%/]);
    const observations = sensitivity.getByRole("table", { name: "Synthetic observation" });
    await expect(observations.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "No", exact: true }) }))
      .toContainText("Source condition: The first observation is Yes.");
    await expect(observations.getByText(/fewer than two comparable scores/i)).toBeVisible();
    await page.getByRole("button", { name: "Open What-If Sandbox" }).click();
    const variant = page.getByRole("region", { name: "What-if variant" });
    await variant.getByRole("radiogroup", { name: "Synthetic observation" }).getByText("No", { exact: true }).click();
    await expect(ranges.getByRole("listitem")).toHaveText([/Shared synthetic marker.*70%–90%/]);

    await observation.getByText("No", { exact: true }).click();
    await expect(ranges).toHaveCount(0);
    await expect(sensitivity.getByRole("status")).toContainText(/original case.*guidance does not apply.*The first observation is Yes/i);
    await variant.getByRole("radiogroup", { name: "Synthetic observation" }).getByText("Yes", { exact: true }).click();
    await expect(variant.getByText("90%", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("shows the common score for equal categorical samples in stable input order", async ({ browser }, testInfo) => {
  await expectSensitivitySpans(browser, testInfo, "equal");
});

test("ranks unequal spans below display precision without calling them ties", async ({ browser }, testInfo) => {
  await expectSensitivitySpans(browser, testInfo, "tiny");
});

test("ranks 0%–100% ahead of a range whose small positive endpoint displays near zero", async ({ browser }, testInfo) => {
  await expectSensitivitySpans(browser, testInfo, "near-full");
});

async function expectSensitivitySpans(browser: Browser, testInfo: TestInfo, span: "equal" | "tiny" | "near-full") {
  const fixture = "fixtures/routed-network";
  const model = testInfo.outputPath("equal-scores.xml");
  const cases = testInfo.outputPath("cases.json");
  const output = testInfo.outputPath("equal-scores");
  await mkdir(testInfo.outputDir, { recursive: true });
  const weights = {
    equal: { baseline: "0.3 0.7", observation: "0.3 0.7", marker: "0.3 0.7" },
    tiny: { baseline: "0.3 0.7", observation: "0.3000000000000003 0.6999999999999997", marker: "0.3000000000000001 0.6999999999999998" },
    "near-full": { baseline: "0 1", observation: "1 0", marker: "1 5.551115123125783e-17" },
  }[span];
  await writeFile(model, (await readFile(`${fixture}/model.xml`, "utf8"))
    .replaceAll('value id="impossible" label="Impossible"', 'value id="impossible" label="Unknown"')
    .replace('probabilities="0.5 0.5 0"', 'probabilities="0.75 0.25 0"')
    .replace('probabilities="0.5 0.5"', 'probabilities="0.4 0.6"')
    .replace('when="yes yes" probabilities="0.1 0.9"', `when="yes yes" probabilities="${weights.baseline}"`)
    .replace('when="no yes" probabilities="0.6 0.4"', `when="no yes" probabilities="${weights.observation}"`)
    .replace('when="yes no" probabilities="0.3 0.7"', `when="yes no" probabilities="${weights.marker}"`));
  await writeFile(cases, (await readFile(`${fixture}/cases.json`, "utf8"))
    .replaceAll('"score": 0.9', span === "near-full" ? '"score": 1' : '"score": 0.7')
    .replace('"score": 0.8', span === "near-full" ? '"score": 0.4' : '"score": 0.7'));
  const run = buildApp(model, output, ["--cases", cases, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("Second scenario", { exact: true }).click();
    await page.getByText("Second synthetic decision", { exact: true }).click();
    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    await inputs.getByRole("radiogroup", { name: "Synthetic observation" }).getByText("Yes", { exact: true }).click();
    await inputs.getByRole("radiogroup", { name: "Shared synthetic marker" }).getByText("Yes", { exact: true }).click();

    const ranges = page.getByRole("list", { name: "Comparable score ranges" });
    await expect(ranges.getByRole("listitem")).toHaveText({
      equal: [/Shared synthetic marker.*No modeled change.*70%/, /Synthetic observation.*No modeled change.*70%/],
      tiny: [/Synthetic observation.*Change below display precision/, /Shared synthetic marker.*Change below display precision/],
      "near-full": [/Synthetic observation.*0%–100%/, /Shared synthetic marker.*<0\.000001%–100%/],
    }[span]);
    const observations = page.getByRole("table", { name: "Synthetic observation" });
    await expect(observations.getByRole("rowheader", { name: "Unknown (modeled value)" })).toBeVisible();
    await expect(observations.getByRole("rowheader", { name: "Unknown", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
}

test("marks a malformed reading even when a separate source condition is unmet", async ({ browser }, testInfo) => {
  const fixture = "fixtures/joint-exploration";
  const model = testInfo.outputPath("guarded.xml");
  const output = testInfo.outputPath("guarded-app");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(model, (await readFile(`${fixture}/model.xml`, "utf8"))
    .replace(/<any>\n          <compare[^]*?<\/any>\n        <source-condition>/,
      `<all>
        <any><equals input="marker" value="a"/><equals input="marker" value="b"/><equals input="marker" value="impossible"/></any>
        <compare input="reading" operator="gte" threshold="0.1"/>
      </all>
        <source-condition>`)
    .replace("The reading is at least 0.3 points, or it is at least 0.1 points and the marker is not Outside exercise.",
      "The reading is at least 0.1 points and the marker is not Outside exercise."));
  const run = buildApp(model, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("Synthetic exploration", { exact: true }).click();
    await page.getByText("Joint review", { exact: true }).click();
    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    await inputs.getByText("Outside exercise", { exact: true }).click();
    const reading = inputs.getByRole("textbox", { name: "Synthetic reading (points)" });
    await reading.fill("abc");
    const result = page.getByRole("region", { name: "Decision result" });
    await expect(result.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await expect(result.getByRole("alert")).toHaveText("Invalid Case Input: Synthetic reading (points)");
    await expect(reading).toHaveAttribute("aria-invalid", "true");

    await page.getByRole("button", { name: "Open What-If Sandbox" }).click();
    const variant = page.getByRole("region", { name: "What-if variant" });
    const variantReading = variant.getByRole("textbox", { name: "Synthetic reading (points)" });
    await expect(variant.getByText("Invalid Case Input: Synthetic reading (points)")).toBeVisible();
    await expect(variantReading).toHaveAttribute("aria-invalid", "true");
    await variantReading.fill("0.2");
    await expect(variantReading).toHaveAttribute("aria-invalid", "false");
    await expect(variant.getByText("Invalid Case Input: Synthetic reading (points)")).toHaveCount(0);
    await expect(reading).toHaveAttribute("aria-invalid", "true");
    await expect(result.getByRole("heading", { name: "Do-Not-Consider Score" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("compares and resets joint What-If edits without changing the original case offline", async ({ browser }, testInfo) => {
  const fixture = "fixtures/routed-network";
  const output = testInfo.outputPath("sandbox-app");
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  const requests: string[] = [];
  const errors: string[] = [];
  context.on("request", (request) => {
    if (!["file:", "data:", "blob:"].includes(new URL(request.url()).protocol)) requests.push(request.url());
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => requests.push(socket.url()));
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("First scenario", { exact: true }).click();
    await page.getByText("First synthetic decision", { exact: true }).click();
    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    const observation = inputs.getByRole("radiogroup", { name: "Synthetic observation" });
    const marker = inputs.getByRole("radiogroup", { name: "Shared synthetic marker" });
    await observation.getByText("No", { exact: true }).click();

    await page.getByRole("button", { name: "Open What-If Sandbox" }).click();
    const sandbox = page.getByRole("region", { name: "What-If Sandbox" });
    const original = sandbox.getByRole("region", { name: "Original case" });
    const variant = sandbox.getByRole("region", { name: "What-if variant" });
    const variantObservation = variant.getByRole("radiogroup", { name: "Synthetic observation" });
    const variantMarker = variant.getByRole("radiogroup", { name: "Shared synthetic marker" });
    await expect(variantObservation.getByRole("radio", { name: "No", exact: true })).toBeChecked();
    await expect(variantMarker.getByRole("radio", { name: "Unknown" })).toBeChecked();
    await expect(original.getByText("Guidance does not apply")).toBeVisible();
    await expect(original.getByText("The first observation is Yes.")).toBeVisible();
    await expect(original.getByText("Synthetic Joint Note §1")).toBeVisible();
    const originalBox = (await original.boundingBox())!;
    const variantBox = (await variant.boundingBox())!;
    expect(variantBox.y).toBe(originalBox.y);
    expect(variantBox.x).toBeGreaterThanOrEqual(originalBox.x + originalBox.width);

    await variantObservation.getByText("Yes", { exact: true }).click();
    await expect(variant.getByText("No score. Supply: Shared synthetic marker.")).toBeVisible();
    await variantMarker.getByText("No", { exact: true }).click();
    await expect(variant.getByRole("heading", { name: "Review the synthetic sample" })).toBeVisible();
    await expect(variant.getByText("70%", { exact: true })).toBeVisible();
    await expect(sandbox.getByText(/Score comparison unavailable:.*original.*does not apply/i)).toBeVisible();
    await expect(original.getByRole("heading", { name: "Do-Not-Consider Score" })).toHaveCount(0);
    await expect(observation.getByRole("radio", { name: "No", exact: true })).toBeChecked();
    await expect(marker.getByRole("radio", { name: "Unknown" })).toBeChecked();

    await observation.getByText("Yes", { exact: true }).click();
    await marker.getByText("Yes", { exact: true }).click();
    await expect(original.getByText("90%", { exact: true })).toBeVisible();
    await expect(variant.getByText("70%", { exact: true })).toBeVisible();
    await expect(sandbox.getByText(/-20 percentage points/)).toBeVisible();
    await variantMarker.getByText("Unknown", { exact: true }).click();
    await expect(variant.getByText("No score. Supply: Shared synthetic marker.")).toBeVisible();
    await expect(sandbox.getByText(/-20 percentage points/)).toHaveCount(0);

    await sandbox.getByRole("button", { name: "Reset variant to original" }).click();
    await expect(variantMarker.getByRole("radio", { name: "Yes" })).toBeChecked();
    await expect(variant.getByText("90%", { exact: true })).toBeVisible();
    await expect(sandbox.getByText(/No modeled change/)).toBeVisible();
    await expect(marker.getByRole("radio", { name: "Yes" })).toBeChecked();

    await page.reload();
    await page.getByText("First scenario", { exact: true }).click();
    await page.getByText("First synthetic decision", { exact: true }).click();
    await expect(observation.getByRole("radio", { name: "Unknown", exact: true })).toBeChecked();
    await expect(marker.getByRole("radio", { name: "Unknown", exact: true })).toBeChecked();
    await expect(variant).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  } finally {
    await context.close();
  }
});

test("visibly labels a partially verified routed network and excludes failed guidance", async ({ browser }, testInfo) => {
  const fixture = "fixtures/routed-network";
  const cases = testInfo.outputPath("failed-cases.json");
  const output = testInfo.outputPath("partial-app");
  await writeFile(cases, (await readFile(`${fixture}/cases.json`, "utf8")).replace('"score": 0.9', '"score": 0.1'));
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", cases, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await expect(page.getByText(/Partial build/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Second synthetic decision" })).toBeVisible();
    await expect(page.getByText("First synthetic decision", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("shows exact numeric source and model boundaries and distinguishes unavailable results offline", async ({ browser }, testInfo) => {
  const fixture = "fixtures/numeric-review";
  const output = testInfo.outputPath("numeric-app");
  const run = buildApp(`${fixture}/model.xml`, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    const input = page.getByRole("region", { name: "Synthetic Case Input" }).getByRole("textbox", { name: "Synthetic reading (points)" });
    const result = page.getByRole("region", { name: "Decision result" });
    const score = result.getByRole("heading", { name: "Do-Not-Consider Score" });
    const sensitivity = page.getByRole("region", { name: "Sensitivity Bars" });
    await expect(result.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await expect(result.getByText("Synthetic reading (points)", { exact: true })).toBeVisible();
    await expect(score).toHaveCount(0);

    await input.fill("0.09999999999999999999");
    await expect(result.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await expect(result.getByText("The synthetic reading is at least 0.1 points.")).toBeVisible();
    await expect(score).toHaveCount(0);
    for (const [value, expected] of [
      ["1e-1", "80%"], ["0.10000000000000000001", "80%"], ["0.29999999999999999999", "80%"],
      ["0.300", "50%"], ["0.30000000000000000001", "10%"], ["1e500", "10%"],
    ]) {
      await input.fill(value);
      await expect(result.getByRole("heading", { name: "Review the synthetic reading" })).toBeVisible();
      await expect(result.getByText("Synthetic Reading Note §1")).toBeVisible();
      await expect(result.getByText(expected, { exact: true })).toBeVisible();
    }
    await expect(sensitivity.getByText(/Synthetic reading.*not varied.*no sampling declaration/i)).toBeVisible();
    await expect(sensitivity.getByRole("table", { name: "Synthetic reading" })).toHaveCount(0);
    await input.fill("0.3 points");
    await expect(result.getByRole("alert")).toHaveText("Invalid Case Input: Synthetic reading (points)");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(score).toHaveCount(0);
    await input.fill(" ");
    await expect(result.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "false");
    await expect(score).toHaveCount(0);

    await input.fill("0.300");
    await page.getByRole("button", { name: "Open What-If Sandbox" }).click();
    const sandbox = page.getByRole("region", { name: "What-If Sandbox" });
    const variant = sandbox.getByRole("region", { name: "What-if variant" });
    const variantInput = variant.getByRole("textbox", { name: "Synthetic reading (points)" });
    await expect(variantInput).toHaveValue("0.300");
    await variantInput.fill("0.30000000000000000001");
    await expect(variant.getByText("10%", { exact: true })).toBeVisible();
    await expect(sandbox.getByRole("status")).toContainText("-40 percentage points");
    await variantInput.clear();
    await expect(variant.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await expect(sandbox.getByRole("status")).toContainText("what-if variant needs Case Inputs");
    await expect(input).toHaveValue("0.300");
    await expect(result.getByText("50%", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("ranks authored numeric samples with categorical bars while holding the other input fixed offline", async ({ browser }, testInfo) => {
  const fixture = "fixtures/numeric-review";
  const model = testInfo.outputPath("sampled-reading.xml");
  const output = testInfo.outputPath("numeric-sensitivity");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(model, (await readFile(`${fixture}/model.xml`, "utf8"))
    .replace('unit="points" />', `unit="points">
      <sampling min="0.09" max="0.31">
        <sample value="0.09999999999999999999" />
        <sample value="1e-1" />
        <sample value="0.29999999999999999999" />
        <sample value="0.300" />
        <sample value="0.30000000000000000001" />
      </sampling>
    </case-input>
    <case-input id="marker" label="Synthetic marker" type="categorical">
      <value id="a" label="A" /><value id="b" label="B" />
    </case-input>`)
    .replace('<node id="action">', `<node id="marker-state">
      <state id="a" label="A" /><state id="b" label="B" />
      <row probabilities="0.5 0.5" />
    </node>
    <node id="action">`)
    .replace(/<row when="low"[^]*?(?=\n    <\/node>)/, `<parent node="marker-state" />
      <row when="low a" probabilities="0.1 0.9" />
      <row when="low b" probabilities="0.3 0.7" />
      <row when="boundary a" probabilities="0.3 0.7" />
      <row when="boundary b" probabilities="0.7 0.3" />
      <row when="high a" probabilities="0.9 0.1" />
      <row when="high b" probabilities="0.9 0.1" />`)
    .replace('<observe input="reading"', `<observe input="marker" node="marker-state">
      <map value="a" state="a" /><map value="b" state="b" />
    </observe>
    <observe input="reading"`));
  const run = buildApp(model, output, ["--cases", `${fixture}/cases.json`, "--inventory", `${fixture}/inventory.json`]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    const reading = inputs.getByRole("textbox", { name: "Synthetic reading (points)" });
    await reading.fill("0.300");
    await inputs.getByRole("radiogroup", { name: "Synthetic marker" }).getByText("A", { exact: true }).click();

    const sensitivity = page.getByRole("region", { name: "Sensitivity Bars" });
    const ranges = sensitivity.getByRole("list", { name: "Comparable score ranges" });
    // For marker A the low, boundary, and high scores are 90%, 70%, and 10%.
    // Marker B changes the boundary score to 30%, not any of the reading samples.
    await expect(ranges.getByRole("listitem")).toHaveText([
      /Synthetic reading.*10%–90%/, /Synthetic marker.*30%–70%/,
    ]);
    const samples = sensitivity.getByRole("table", { name: "Synthetic reading" });
    const rows = samples.getByRole("row").filter({ has: page.getByRole("rowheader") });
    await expect(rows).toHaveText([
      /^0\.09999999999999999999 points.*Source condition: The synthetic reading is at least 0\.1 points\.$/,
      /^1e-1 points\s*90%$/,
      /^0\.29999999999999999999 points\s*90%$/,
      /^0\.300 points\s*70%$/,
      /^0\.30000000000000000001 points\s*10%$/,
    ]);
    await expect(rows.first().getByRole("cell")).not.toContainText("%");

    // The chart interval is not a case input restriction and does not add the
    // current case's reading to the authored samples.
    await reading.fill("1");
    const result = page.getByRole("region", { name: "Decision result" });
    await expect(result.getByText("10%", { exact: true })).toBeVisible();
    await expect(ranges.getByRole("listitem")).toHaveText([
      /Synthetic reading.*10%–90%/, /Synthetic marker.*No modeled change.*10%/,
    ]);
    await expect(rows).toHaveCount(5);
  } finally {
    await context.close();
  }
});
