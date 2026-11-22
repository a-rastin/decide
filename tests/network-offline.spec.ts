import { readFile, rename } from "node:fs/promises";
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
