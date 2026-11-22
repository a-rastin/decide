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
