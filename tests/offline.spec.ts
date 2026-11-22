import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Browser } from "@playwright/test";
import { buildApp } from "./build-app.ts";

const fixture = "fixtures/six-week-follow-up/model.xml";

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
    const sourceCondition = page.getByText("All baseline checks were completed.", { exact: true });
    const citation = page.getByText("Synthetic Follow-up Note §1", { exact: true });
    const scoreLabel = page.getByText("Do-Not-Consider Score", { exact: true });
    const scoreValue = page.getByText(score, { exact: true });
    const scoredResult = page.getByText("Recheck at six weeks", { exact: true }).or(scoreLabel).or(scoreValue);
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
    const result = page.getByRole("region", { name: "Decision result" });
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
