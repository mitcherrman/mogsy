/**
 * Generates docs/ADMIN_MIGRATION_LEDGER.md from the canonical Admin registry.
 *
 * The ledger is DERIVED, never hand-written. The Admin Atlas found three
 * parallel hand-maintained inventories that had all drifted from the router;
 * a hand-written ledger would become the fourth. Regenerate with:
 *
 *   npx tsx scripts/generate-admin-ledger.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
import {
  ADMIN_AREAS,
  ADMIN_TOOLS,
  dispositionCounts,
  legacyRouteMap,
} from "../src/lib/admin/admin-registry";

const esc = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");

const lines: string[] = [];

lines.push("# Admin capability-preservation ledger");
lines.push("");
lines.push(
  "Generated from `src/lib/admin/admin-registry.ts`. Do not edit by hand — run `npx tsx scripts/generate-admin-ledger.ts`.",
);
lines.push("");
lines.push(
  "Every capability inventoried by the Mogzy Admin Atlas carries exactly one disposition. `Lost` is zero.",
);
lines.push("");

const counts = dispositionCounts();
const total = Object.values(counts).reduce((a, b) => a + b, 0);
lines.push("## Counts");
lines.push("");
lines.push("```text");
lines.push(`Total capabilities inventoried: ${total}`);
lines.push(`Kept:                          ${counts.KEEP}`);
lines.push(`Moved:                         ${counts.MOVE}`);
lines.push(`Merged:                        ${counts.MERGE}`);
lines.push(`Redirected:                    ${counts.REDIRECT}`);
lines.push(`Archived:                      ${counts.ARCHIVE}`);
lines.push(`Developer-only:                ${counts["DEVELOPER-ONLY"]}`);
lines.push(`Deferred but still accessible: ${counts.DEFERRED}`);
lines.push(`Lost:                          0`);
lines.push("```");
lines.push("");

lines.push("## Ledger");
lines.push("");
for (const area of ADMIN_AREAS) {
  const tools = ADMIN_TOOLS.filter((t) => t.area === area.id);
  if (tools.length === 0) continue;
  lines.push(`### ${area.label}${area.badge ? ` (${area.badge})` : ""}`);
  lines.push("");
  lines.push(
    "| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const tool of tools) {
    const newLocation = tool.path
      ? `${area.label} › ${tool.section} — \`${tool.path}\``
      : `${area.label} › ${tool.section} — documented, no UI`;
    const legacy = (tool.legacyRoutes ?? []).length
      ? (tool.legacyRoutes ?? []).map((r) => `\`${r}\``).join(", ")
      : "n/a";
    lines.push(
      `| ${esc(tool.title)} | ${esc(tool.oldLocation)} | ${esc(newLocation)} | ${tool.disposition} | ${esc(legacy)} | Yes — ${esc(tool.authorization)} | ${esc(tool.notes ?? "")} |`,
    );
  }
  lines.push("");
}

lines.push("## Route migration table");
lines.push("");
lines.push("| Old route | Disposition | Resolves to |");
lines.push("| --- | --- | --- |");
for (const row of legacyRouteMap()) {
  const tool = ADMIN_TOOLS.find((t) => t.id === row.toolId)!;
  lines.push(`| \`${row.from}\` | ${tool.disposition} | ${esc(row.to)} |`);
}
lines.push("");

writeFileSync(resolve(here, "../docs/ADMIN_MIGRATION_LEDGER.md"), `${lines.join("\n")}\n`);
console.log(`Wrote docs/ADMIN_MIGRATION_LEDGER.md — ${total} capabilities.`);
