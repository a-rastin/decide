import { mkdir, mkdtemp, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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

async function publishApp(modelPath: string, outputPath: string, casesPath?: string, inventoryPath?: string, replace = false) {
  const target = resolve(outputPath);
  const parent = dirname(target);
  const name = basename(target);
  if (parent === target) throw new Error("Cannot publish to a filesystem root");
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, `.${name}-stage-`));
  try {
    await generateApp(modelPath, stage, casesPath, inventoryPath);
    if (replace) {
      const backup = await mkdtemp(join(parent, `.${name}-backup-`));
      const previous = join(backup, "previous");
      let hadPrevious = false;
      try {
        try {
          await rename(target, previous);
          hadPrevious = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        try {
          await rename(stage, target);
        } catch (error) {
          if (hadPrevious) {
            try {
              await rename(previous, target);
              hadPrevious = false;
            } catch (restoreError) {
              throw new Error(`Publication failed; previous output remains at ${previous}: ${String(restoreError)}`, { cause: error });
            }
          }
          throw error;
        }
        hadPrevious = false;
      } finally {
        if (!hadPrevious) await rm(backup, { recursive: true, force: true }).catch((error) => console.error(`Could not remove backup ${backup}: ${String(error)}`));
      }
      return target;
    }
    for (let suffix = 0; ; suffix++) {
      const destination = suffix ? `${target}-${suffix}` : target;
      try {
        await mkdir(destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      try {
        await rename(stage, destination);
      } catch (error) {
        await rmdir(destination);
        throw error;
      }
      return destination;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

const [modelPath = "fixtures/six-week-follow-up/model.xml", outputPath = "dist", ...options] = process.argv.slice(2);
try {
  const paths: Record<string, string> = {};
  let replace = false;
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (option === "--replace" && !replace) {
      replace = true;
      continue;
    }
    const value = options[++i];
    if (!["--cases", "--inventory"].includes(option) || !value || value.startsWith("--") || paths[option]) throw new Error("Expected --cases <path>, optional --inventory <path>, and optional --replace");
    paths[option] = value;
  }
  const published = await publishApp(modelPath, outputPath, paths["--cases"], paths["--inventory"], replace);
  console.log(`Generated ${join(published, "index.html")}`);
} catch (error) {
  console.error(`Build failed for ${modelPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
