import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const markerName = ".decide-build";
const buildFiles = ["index.html", "model.xml", "app.js", "app.css"];
const lockName = /^\..+-publish-lock$/s;

async function inspect(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function buildMarker(path: string) {
  const hash = createHash("sha256");
  for (const name of buildFiles) {
    const file = join(path, name);
    if (!(await inspect(file))?.isFile()) return;
    hash.update(createHash("sha256").update(await readFile(file)).digest());
  }
  return `Decide build v1 ${hash.digest("hex")}\n`;
}

async function isBuild(path: string) {
  const marker = join(path, markerName);
  return (await inspect(marker))?.isFile() && await readFile(marker, "utf8") === await buildMarker(path);
}

function publicationLock(path: string) {
  return join(dirname(path), `.${basename(path)}-publish-lock`);
}

async function validateDestination(target: string) {
  if (lockName.test(basename(target))) throw new Error(`Reserved publication path: ${target}`);
  for (let ancestor = dirname(target); dirname(ancestor) !== ancestor; ancestor = dirname(ancestor)) {
    if (lockName.test(basename(ancestor))) throw new Error(`Reserved publication path: ${ancestor}`);
    // Look for the lock even when the ancestor is absent: replacement may have moved it aside.
    if (await inspect(join(ancestor, markerName)) || await inspect(publicationLock(ancestor))) {
      throw new Error(`Cannot publish inside a Decide build or active publication: ${ancestor}`);
    }
  }
}

async function cleanup(path: string, remove: (path: string) => Promise<void>) {
  await remove(path).catch((error) => console.error(`Could not remove ${path}: ${String(error)}`));
}

async function replaceBuild(stage: string, target: string) {
  const backup = await mkdtemp(join(dirname(target), `.${basename(target)}-backup-`));
  const previous = join(backup, "previous");
  let keepBackup = false;
  try {
    await rename(target, previous);
    try {
      await rename(stage, target);
    } catch (error) {
      try {
        await rename(previous, target);
      } catch (restoreError) {
        keepBackup = true;
        throw new Error(`Publication failed; previous output remains at ${previous}: ${String(restoreError)}`, { cause: error });
      }
      throw error;
    }
  } finally {
    if (!keepBackup) await cleanup(backup, (path) => rm(path, { recursive: true }));
  }
}

export async function publishBuild(outputPath: string, replace: boolean, generate: (stage: string) => Promise<void>) {
  const target = resolve(outputPath);
  const parent = dirname(target);
  if (parent === target) throw new Error("Cannot publish to a filesystem root");
  await validateDestination(target);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, `.${basename(target)}-stage-`));
  try {
    await generate(stage);
    const marker = await buildMarker(stage);
    if (!marker) throw new Error("Cannot publish an incomplete Decide build");
    await writeFile(join(stage, markerName), marker);
    for (let suffix = 0; ; suffix++) {
      const destination = suffix ? `${target}-${suffix}` : target;
      const lock = publicationLock(destination);
      // Default and explicit publishers must both reserve the destination, including during rollback.
      try {
        await mkdir(lock);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (replace) throw new Error(`Publication is locked for ${destination}`);
        continue;
      }
      try {
        const existing = await inspect(destination);
        if (existing) {
          if (!replace) continue;
          if (!existing.isDirectory() || !await isBuild(destination)) {
            throw new Error(`Cannot replace ${destination}: not a Decide build`);
          }
          await replaceBuild(stage, destination);
        } else {
          await rename(stage, destination);
        }
        return destination;
      } finally {
        await cleanup(lock, rmdir);
      }
    }
  } finally {
    await cleanup(stage, (path) => rm(path, { recursive: true, force: true }));
  }
}
