import { spawnSync } from "node:child_process";

export function buildApp(model: string, output: string, options: string[] = []) {
  // Run the same CLI as npm run build without another npm process for every fixture.
  return spawnSync(process.execPath, ["src/build.ts", model, output, ...options], { encoding: "utf8" });
}
