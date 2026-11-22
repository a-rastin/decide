import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { buildApp } from "./build-app.ts";

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
