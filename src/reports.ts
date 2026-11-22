import type { RoutedModel } from "./model.ts";
import type { verifyCases } from "./verify-cases.ts";

function object(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${description}`);
  return value as Record<string, unknown>;
}

function text(value: unknown, description: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${description}`);
  return value;
}

export function createReports(model: RoutedModel, content: string, verification: ReturnType<typeof verifyCases>) {
  const inventory = object(JSON.parse(content), "inventory");
  if (inventory.version !== 1 || !Array.isArray(inventory.decisions) || !Array.isArray(inventory.sections)) throw new Error("Invalid inventory version, decisions or sections");
  const source = text(inventory.source, "inventory source");
  const modeled = new Set(model.routes.flatMap((route) => route.decisions.map(({ id }) => id)));
  const ids = new Set<string>();
  let partial = false;
  const decisions = inventory.decisions.map((raw) => {
    const entry = object(raw, "inventory decision");
    const id = text(entry.id, "inventory decision id");
    const section = text(entry.section, `section for ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate inventory decision "${id}"`);
    ids.add(id);
    if (entry.status === "modeled") {
      if (!modeled.has(id)) throw new Error(`Inventory modeled decision "${id}" has no XML decision`);
      const delivered = !verification.results.get(id)!.failures.length;
      if (!delivered) partial = true;
      return `- ${id} (${section}): ${delivered ? "verified and delivered" : "modeled but excluded after verification"}`;
    }
    if (entry.status === "unresolved") {
      if (modeled.has(id)) throw new Error(`Unresolved inventory decision "${id}" has an XML decision`);
      partial = true;
      return `- ${id} (${section}): unresolved — ${text(entry.reason, `reason for ${id}`)}`;
    }
    throw new Error(`Invalid inventory status for "${id}"`);
  });
  for (const id of modeled) if (!ids.has(id)) throw new Error(`XML decision "${id}" is missing from inventory`);
  const sectionIds = new Set<string>();
  const sections = inventory.sections.map((raw) => {
    const entry = object(raw, "inventory section");
    const id = text(entry.id, "inventory section id");
    if (sectionIds.has(id)) throw new Error(`Duplicate inventory section "${id}"`);
    sectionIds.add(id);
    const section = text(entry.section, `section for ${id}`);
    if (entry.status !== "unreadable" && entry.status !== "unprocessed") throw new Error(`Invalid inventory section status for "${id}"`);
    partial = true;
    return `- ${id} (${section}): ${entry.status} — ${text(entry.reason, `reason for ${id}`)}`;
  });
  const coverage = `# Coverage report\n\nBuild status: ${partial ? "partial" : "complete"}\n\nSource: ${source}\n\n## Clinical Decisions\n\n${decisions.join("\n") || "None."}\n\n## Unreadable or unprocessed sections\n\n${sections.join("\n") || "None."}\n`;
  const outcomes = [...verification.results].map(([id, result]) =>
    `## ${id}: ${result.failures.length ? "excluded" : "verified"}\n\n${[...result.checks, ...result.failures].map((line) => `- ${line}`).join("\n")}`);
  const tests = `# Test report\n\nBuild-time synthetic verification only. Browser checks not run by this build.\n\n${outcomes.join("\n\n")}\n`;
  return { partial, coverage, tests };
}
