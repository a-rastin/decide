import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Browser } from "@playwright/test";
import { buildApp } from "./build-app.ts";

const fixture = "fixtures/six-week-follow-up/model.xml";

test("mixed build preserves verified guidance offline after relocation", async ({ browser }, testInfo) => {
  const output = testInfo.outputPath("mixed");
  const relocated = testInfo.outputPath("relocated mixed");
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, [
    "--inventory", "fixtures/mixed-decisions/inventory.json",
    "--cases", "fixtures/mixed-decisions/cases.json",
  ]);
  expect(run.status, run.stderr).toBe(0);
  await checkMixedOffline(browser, output);
  await rename(output, relocated);
  await checkMixedOffline(browser, relocated);
});

test("switching decisions in the same route discards the draft but reuses original Case Inputs by ID", async ({ browser }, testInfo) => {
  const output = testInfo.outputPath("routed-sandbox");
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, ["--cases", "fixtures/mixed-decisions/cases.json"]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("Readiness", { exact: true }).click();
    const decisions = page.getByRole("radiogroup", { name: "Choose a Clinical Decision" });
    await decisions.getByText("Routine review", { exact: true }).click();
    const originalInput = page.getByRole("region", { name: "Synthetic Case Input" });
    const variant = page.getByRole("region", { name: "What-if variant" });
    const open = page.getByRole("button", { name: "Open What-If Sandbox" });
    await originalInput.getByText("Yes", { exact: true }).click();
    await open.click();
    await variant.getByText("No", { exact: true }).click();
    await expect(variant.getByText("Guidance does not apply")).toBeVisible();

    await decisions.getByText("Information pack", { exact: true }).click();
    await expect(variant).toHaveCount(0);
    await expect(originalInput.getByRole("radio", { name: "Yes", exact: true })).toBeChecked();
    await open.click();
    await expect(variant.getByRole("radio", { name: "Yes", exact: true })).toBeChecked();
    await expect(variant.getByRole("heading", { name: "Offer the information pack" })).toBeVisible();

    await decisions.getByText("Routine review", { exact: true }).click();
    await open.click();
    await expect(variant.getByRole("radio", { name: "Yes", exact: true })).toBeChecked();
    await expect(variant.getByText("10%", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

async function checkMixedOffline(browser: Browser, output: string) {
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
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await expect(page.getByText("Partial build: some decisions or source sections are not included.")).toBeVisible();
    await expect(page.getByText(/Research only/)).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Choose a topic or scenario" })).toBeVisible();
    await expect(page.getByText("Synthetic Case Input", { exact: true })).toHaveCount(0);
    await page.getByText("Readiness", { exact: true }).first().click();
    await page.getByText("Routine review", { exact: true }).first().click();
    const input = page.getByRole("radiogroup", { name: "Is the checklist complete?" });
    await expect(input).toBeVisible();
    await expect(page.getByLabel("Synthetic marker (units)")).toHaveCount(0);
    const yes = input.getByRole("radio", { name: "Yes" });
    await input.getByText("Yes", { exact: true }).click();
    await expect(yes).toBeChecked();
    const result = page.getByRole("region", { name: "Decision result" });
    await expect(result.getByRole("heading", { name: "Schedule a routine review" })).toBeVisible();
    await expect(result.getByText("The initial checklist is complete.")).toBeVisible();
    await expect(result.getByText("Synthetic Monitoring Note §1")).toBeVisible();
    await expect(result.getByText("10%", { exact: true })).toBeVisible();
    await expect(result.getByText(/does not estimate a clinical outcome/)).toBeVisible();
    await page.getByText("Information pack", { exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Offer the information pack" })).toBeVisible();
    await input.getByText("No", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await expect(page.getByText("Unmet source condition")).toBeVisible();
    await expect(page.getByText("Do-Not-Consider Score")).toHaveCount(0);
    await input.getByText("Unknown", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Decision result" }).getByText("Is the checklist complete?")).toBeVisible();
    await expect(page.getByText("Do-Not-Consider Score")).toHaveCount(0);
    await page.getByText("Monitoring", { exact: true }).first().click();
    await expect(page.getByText("Marker check", { exact: true })).toBeVisible();
    await expect(page.getByText("Equipment inspection", { exact: true })).toHaveCount(0);
    await page.getByText("Marker check", { exact: true }).first().click();
    await expect(input).toHaveCount(0);
    const marker = page.getByLabel("Synthetic marker (units)");
    await expect(marker).toBeVisible();
    await marker.fill("9.99");
    await expect(page.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await marker.fill("10");
    await expect(page.getByRole("heading", { name: "Repeat the marker check" })).toBeVisible();
    await expect(page.getByText("5%", { exact: true })).toBeVisible();
    await expect(page.getByText("The synthetic marker is at least 10 units.")).toBeVisible();
    await expect(page.getByText("Synthetic Monitoring Note §2")).toBeVisible();
    await marker.fill("10.01");
    await expect(page.getByRole("heading", { name: "Repeat the marker check" })).toBeVisible();
    await marker.fill("oops");
    await expect(page.getByRole("alert")).toHaveText("Invalid numeric Case Input");
    await expect(marker).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Do-Not-Consider Score")).toHaveCount(0);
    await marker.fill("");
    await expect(page.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await expect(page.getByText("Do-Not-Consider Score")).toHaveCount(0);
    const radius = await marker.evaluate((element) => getComputedStyle(element).borderRadius);
    expect(parseFloat(radius)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  } finally {
    await context.close();
  }
}

function expectSuccessfulBuild(model: string, output: string) {
  const run = buildApp(model, output);
  expect(run.error).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
}

async function checkOfflineApp(browser: Browser, output: string, score: string) {
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const networkRequests: string[] = [];
    const pageErrors: string[] = [];
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (!["file:", "data:", "blob:"].includes(url.protocol)) {
        networkRequests.push(url.href);
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("websocket", (socket) => networkRequests.push(socket.url()));

    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await expect(page.getByText("Research only. Do not use for clinical care.")).toBeVisible();

    const input = page.getByRole("radiogroup", { name: "Were all baseline checks completed?" });
    const result = page.getByRole("region", { name: "Decision result" });
    const sourceCondition = result.getByText("All baseline checks were completed.", { exact: true });
    const citation = result.getByText("Synthetic Follow-up Note §1", { exact: true });
    const scoreLabel = result.getByText("Do-Not-Consider Score", { exact: true });
    const scoreValue = result.getByText(score, { exact: true });
    const scoredResult = result.getByText("Recheck at six weeks", { exact: true }).or(scoreLabel).or(scoreValue);
    await expect(input).toBeVisible();
    await input.getByText("Yes", { exact: true }).click();
    await expect(input.getByRole("radio", { name: "Yes" })).toBeChecked();

    await expect(page.getByRole("heading", { name: "Recheck at six weeks" })).toBeVisible();
    await expect(sourceCondition).toBeVisible();
    await expect(citation).toBeVisible();
    await expect(scoreValue).toBeVisible();
    await expect(scoreLabel).toBeVisible();
    await expect(page.getByText("Research Modeling Convention", { exact: true })).toBeVisible();
    await expect(page.getByText(/modeled support for leaving this action out of consideration/)).toBeVisible();
    await expect(page.getByText(/does not estimate a clinical outcome/)).toBeVisible();

    await input.getByText("No", { exact: true }).click();
    await expect(input.getByRole("radio", { name: "No", exact: true })).toBeChecked();
    await expect(page.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await expect(page.getByText("Unmet source condition", { exact: true })).toBeVisible();
    await expect(sourceCondition).toBeVisible();
    await expect(citation).toBeVisible();
    await expect(scoredResult).toHaveCount(0);

    await input.getByText("Yes", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recheck at six weeks" })).toBeVisible();
    await expect(scoreValue).toBeVisible();

    const unknown = input.getByRole("radio", { name: "Unknown", exact: true });
    await expect(unknown).toBeVisible();
    await input.getByText("Unknown", { exact: true }).click();
    await expect(unknown).toBeChecked();
    await expect(result.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await expect(result.getByText("Were all baseline checks completed?", { exact: true })).toBeVisible();
    await expect(result.getByText("Unmet source condition", { exact: true })).toHaveCount(0);
    await expect(result.getByText("Guidance does not apply", { exact: true })).toHaveCount(0);
    await expect(scoredResult).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(networkRequests).toEqual([]);
  } finally {
    await context.close();
  }
}

test("updates six-week guidance when the source condition changes offline, even after relocation", async ({ browser }, testInfo) => {
  const original = testInfo.outputPath("app");
  const relocated = testInfo.outputPath("relocated app");
  expectSuccessfulBuild(fixture, original);

  expect(await readFile(join(original, "model.xml"))).toEqual(await readFile(fixture));
  await checkOfflineApp(browser, original, "1%");

  await rename(original, relocated);
  await checkOfflineApp(browser, relocated, "1%");
});

test("operates the legacy What-If Sandbox by keyboard with labeled stacked results", async ({ browser }, testInfo) => {
  const output = testInfo.outputPath("legacy-sandbox");
  expectSuccessfulBuild(fixture, output);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    const sandbox = page.getByRole("region", { name: "What-If Sandbox" });
    const original = sandbox.getByRole("region", { name: "Original case" });
    const variant = sandbox.getByRole("region", { name: "What-if variant" });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: "Unknown", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(sandbox.getByRole("button", { name: "Open What-If Sandbox" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(original.getByRole("heading", { name: "Original case" })).toBeVisible();
    await expect(variant.getByRole("heading", { name: "What-if variant" })).toBeVisible();
    const originalBox = (await original.boundingBox())!;
    const variantBox = (await variant.boundingBox())!;
    expect(variantBox.y).toBeGreaterThanOrEqual(originalBox.y + originalBox.height);
    await expect(original.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await expect(original.getByText("Were all baseline checks completed?")).toBeVisible();
    await expect(original.getByText("Synthetic Follow-up Note §1")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(variant.getByRole("radio", { name: "Unknown", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(variant.getByRole("radio", { name: "Yes", exact: true })).toBeChecked();
    await expect(variant.getByRole("heading", { name: "Recheck at six weeks" })).toBeVisible();
    await expect(variant.getByText("1%", { exact: true })).toBeVisible();
    await expect(original.getByText("1%", { exact: true })).toHaveCount(0);
    await expect(sandbox.getByRole("status")).toContainText("original case needs Case Inputs");

    await page.keyboard.press("Tab");
    await expect(sandbox.getByRole("button", { name: "Reset variant to original" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(variant.getByRole("radio", { name: "Unknown", exact: true })).toBeChecked();
    await expect(variant.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await page.reload();
    await expect(sandbox.getByRole("button", { name: "Open What-If Sandbox" })).toBeVisible();

    const inputs = page.getByRole("region", { name: "Synthetic Case Input" });
    await inputs.getByText("Yes", { exact: true }).click();
    const sensitivity = page.getByRole("region", { name: "Sensitivity Bars" });
    await expect(sensitivity.getByRole("list", { name: "Comparable score ranges" })).toHaveCount(0);
    await expect(sensitivity.getByRole("status")).toContainText(/only one category can be scored/i);
    await expect(sensitivity.getByRole("row", { name: "Yes 1%" })).toBeVisible();
    await expect(sensitivity.getByRole("cell", { name: /All baseline checks were completed/ })).toBeVisible();
    await expect(sandbox.getByRole("button", { name: "Open What-If Sandbox" })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("uses the supplied XML to score the same case at 95/5", async ({ browser }, testInfo) => {
  const variant = testInfo.outputPath("variant.xml");
  const output = testInfo.outputPath("app");
  const xml = await readFile(fixture, "utf8");
  const variantXml = xml
    .replace('probability="0.99"', 'probability="0.95"')
    .replace('probability="0.01"', 'probability="0.05"');

  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(variant, variantXml);
  expectSuccessfulBuild(variant, output);

  expect(await readFile(join(output, "model.xml"), "utf8")).toEqual(variantXml);
  await checkOfflineApp(browser, output, "5%");
});

test("routes verified categorical decisions and reuses only shared Case Input IDs offline", async ({ browser }, testInfo) => {
  const model = testInfo.outputPath("categorical.xml");
  const cases = testInfo.outputPath("cases.json");
  const output = testInfo.outputPath("app");
  const relocated = testInfo.outputPath("relocated categorical app");
  const excludedOutput = testInfo.outputPath("excluded-app");
  const xml = (await readFile("fixtures/mixed-decisions/model.xml", "utf8"))
    .replaceAll("initial-checklist", "constructor")
    .replace(/  <case-input id="marker".*\/>\n/, "")
    .replace(/    <clinical-decision id="repeat-marker"[\s\S]*?    <\/clinical-decision>\n/, "");
  const sourceCases = JSON.parse((await readFile("fixtures/mixed-decisions/cases.json", "utf8"))
    .replaceAll("initial-checklist", "constructor"));
  const categoricalCases = sourceCases.cases.filter((entry: { decision: string }) => entry.decision !== "repeat-marker");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(model, xml);
  await writeFile(cases, JSON.stringify({ version: 1, cases: categoricalCases }));
  const excluded = buildApp(model, excludedOutput, ["--cases", cases]);
  expect(excluded.status, excluded.stderr).toBe(0);
  categoricalCases.find((entry: { id: string }) => entry.id === "equipment-yes-deliberate-mismatch").expected.score = 0.1;
  await writeFile(cases, JSON.stringify({ version: 1, cases: categoricalCases }));
  const run = buildApp(model, output, ["--cases", cases]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  const requests: string[] = [];
  context.on("request", (request) => {
    if (!["file:", "data:", "blob:"].includes(new URL(request.url()).protocol)) requests.push(request.url());
  });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(excludedOutput, "index.html")).href);
    await expect(page.getByRole("radio", { name: "Monitoring" })).toHaveCount(0);
    await expect(page.getByText("Equipment inspection", { exact: true })).toHaveCount(0);
    for (const location of [output, relocated]) {
      if (location === relocated) await rename(output, relocated);
      await page.goto(pathToFileURL(join(location, "index.html")).href);
      await expect(page.getByRole("radiogroup", { name: "Is the checklist complete?" })).toHaveCount(0);
      await page.getByText("Readiness", { exact: true }).first().click();
      await page.getByText("Routine review", { exact: true }).first().click();
      await expect(page.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
      await page.getByRole("region", { name: "Synthetic Case Input" }).getByText("Yes", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Schedule a routine review" })).toBeVisible();
      await page.getByText("Information pack", { exact: true }).first().click();
      await expect(page.getByRole("heading", { name: "Offer the information pack" })).toBeVisible();
      await page.getByText("Monitoring", { exact: true }).first().click();
      await page.getByText("Equipment inspection", { exact: true }).first().click();
      await expect(page.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
      await page.getByRole("region", { name: "Synthetic Case Input" }).getByText("No", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
      await page.getByText("Readiness", { exact: true }).first().click();
      await page.getByText("Routine review", { exact: true }).first().click();
      await expect(page.getByRole("heading", { name: "Schedule a routine review" })).toBeVisible();
    }
    expect(requests).toEqual([]);
  } finally {
    await context.close();
  }
});

test("evaluates numeric inputs and rejects invalid text offline", async ({ browser }, testInfo) => {
  const output = testInfo.outputPath("numeric-app");
  const casesPath = testInfo.outputPath("boundary-cases.json");
  const cases = await readFile("fixtures/mixed-decisions/cases.json", "utf8");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(casesPath, cases.replace("9.99", "9.9999999999999999").replace("10.01", "1.00000000000000001e1"));
  const run = buildApp("fixtures/mixed-decisions/model.xml", output, ["--cases", casesPath]);
  expect(run.status, run.stderr).toBe(0);
  const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(output, "index.html")).href);
    await page.getByText("Monitoring", { exact: true }).first().click();
    await page.getByText("Marker check", { exact: true }).first().click();
    const input = page.getByLabel("Synthetic marker (units)");
    await expect(page.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
    await input.fill("9.9999999999999999");
    await expect(page.getByRole("heading", { name: "Guidance does not apply" })).toBeVisible();
    await input.fill("10");
    await expect(page.getByRole("heading", { name: "Repeat the marker check" })).toBeVisible();
    await expect(page.getByText("5%", { exact: true })).toBeVisible();
    await input.fill("1.00000000000000001e1");
    await expect(page.getByRole("heading", { name: "Repeat the marker check" })).toBeVisible();
    await input.fill("oops");
    await expect(page.getByText("Invalid numeric Case Input")).toBeVisible();
    await expect(page.getByText("Do-Not-Consider Score")).toHaveCount(0);
    await input.fill("");
    await expect(page.getByRole("heading", { name: "Missing Case Input" })).toBeVisible();
  } finally {
    await context.close();
  }
});
