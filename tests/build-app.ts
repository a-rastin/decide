import { spawnSync } from "node:child_process";

export function buildApp(model: string, output: string, options: string[] = []) {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run the test suite through npm");
  return spawnSync(process.execPath, [npm, "run", "build", "--", model, output, ...options], { encoding: "utf8" });
}
