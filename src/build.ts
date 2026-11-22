import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";
import { readBuildModel } from "./read-model.ts";
import { verifyCategorical } from "./verify-categorical.ts";

async function generateApp(modelPath: string, outputPath: string, casesPath?: string) {
  const project = resolve(import.meta.dirname, "..");
  const app = join(project, "src", "app");
  const xml = await readFile(modelPath);
  const parsed = readBuildModel(xml);
  if ("version" in parsed && !casesPath) throw new Error("Version 2 requires --cases for verification");
  const model = "version" in parsed ? verifyCategorical(parsed, await readFile(casesPath!, "utf8")) : parsed;
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
  ]);
}

const [modelPath = "fixtures/six-week-follow-up/model.xml", outputPath = "dist", ...options] = process.argv.slice(2);
try {
  if (options.length && (options.length !== 2 || options[0] !== "--cases" || !options[1])) throw new Error("Expected --cases <path>");
  await generateApp(modelPath, outputPath, options[1]);
  console.log(`Generated ${resolve(outputPath, "index.html")}`);
} catch (error) {
  console.error(`Build failed for ${modelPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
