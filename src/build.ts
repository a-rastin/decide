import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";
import { readBuildModel } from "./read-model.ts";
import { verifyCategorical } from "./verify-categorical.ts";
import { createReports } from "./reports.ts";

async function generateApp(modelPath: string, outputPath: string, casesPath?: string, inventoryPath?: string) {
  const project = resolve(import.meta.dirname, "..");
  const app = join(project, "src", "app");
  const xml = await readFile(modelPath);
  const parsed = readBuildModel(xml);
  if ("version" in parsed && !casesPath) throw new Error("Version 2 requires --cases for verification");
  if (!("version" in parsed) && inventoryPath) throw new Error("--inventory requires a version 2 model");
  const verification = "version" in parsed ? verifyCategorical(parsed, await readFile(casesPath!, "utf8")) : undefined;
  const reports = "version" in parsed && inventoryPath ? createReports(parsed, await readFile(inventoryPath, "utf8"), verification!) : undefined;
  const model = verification ? { ...verification.model, partial: reports?.partial ?? (verification.results.size !== verification.model.routes.flatMap((route) => route.decisions).length) } : parsed;
  const stylesheet = join(app, "app.css");
  const [bundle, css, html] = await Promise.all([
    build({
      entryPoints: [join(app, "main.tsx")],
      bundle: true,
      format: "iife",
      target: "es2022",
      minify: true,
      write: false,
      define: { __DECIDE_MODEL__: JSON.stringify(model) },
    }),
    readFile(stylesheet, "utf8").then((source) =>
      postcss([tailwindcss({ base: project, optimize: true })]).process(source, { from: stylesheet }),
    ),
    readFile(join(app, "index.html")),
  ]);

  await mkdir(outputPath, { recursive: true });
  await Promise.all([
    writeFile(join(outputPath, "index.html"), html),
    writeFile(join(outputPath, "model.xml"), xml),
    writeFile(join(outputPath, "app.js"), bundle.outputFiles[0].contents),
    writeFile(join(outputPath, "app.css"), css.css),
    ...(reports ? [
      writeFile(join(outputPath, "coverage-report.md"), reports.coverage),
      writeFile(join(outputPath, "test-report.md"), reports.tests),
    ] : []),
  ]);
}

const [modelPath = "fixtures/six-week-follow-up/model.xml", outputPath = "dist", ...options] = process.argv.slice(2);
try {
  const paths: Record<string, string> = {};
  for (let i = 0; i < options.length; i += 2) {
    const option = options[i], value = options[i + 1];
    if (!["--cases", "--inventory"].includes(option) || !value || value.startsWith("--") || paths[option]) throw new Error("Expected --cases <path> and optional --inventory <path>");
    paths[option] = value;
  }
  await generateApp(modelPath, outputPath, paths["--cases"], paths["--inventory"]);
  console.log(`Generated ${resolve(outputPath, "index.html")}`);
} catch (error) {
  console.error(`Build failed for ${modelPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
