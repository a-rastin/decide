import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";
import { readModel } from "./read-model.ts";

async function generateApp(modelPath: string, outputPath: string) {
  const project = resolve(import.meta.dirname, "..");
  const app = join(project, "src", "app");
  const xml = await readFile(modelPath);
  const model = readModel(xml);
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

const [modelPath = "fixtures/six-week-follow-up/model.xml", outputPath = "dist"] = process.argv.slice(2);
try {
  await generateApp(modelPath, outputPath);
  console.log(`Generated ${resolve(outputPath, "index.html")}`);
} catch (error) {
  console.error(`Build failed for ${modelPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
