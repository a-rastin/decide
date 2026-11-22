import { spawnSync } from "node:child_process";

export function buildApp(model: string, output: string) {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run the test suite through npm");
  return spawnSync(process.execPath, [npm, "run", "build", "--", model, output], { encoding: "utf8" });
}
