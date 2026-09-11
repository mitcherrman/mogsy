/**
 * WHERE THE RULES SCROLL IS ALLOWED TO APPEAR, AND WHAT IT MAY KNOW.
 *
 * Two rules, asserted directly rather than trusted to stay true:
 *
 * 1. ONLY RANKED MOUNTS IT. The Tutorial and the Daily Challenge render
 *    through the SAME `CanonicalArena` Ranked does. If the scroll ever drifts
 *    into the shared arena layer — or into another mode — every one of those
 *    surfaces would start explaining Ranked's scoring, which is not their
 *    scoring. Nothing failing would say so, so this does.
 *
 * 2. IT READS NOTHING FROM THE MATCH. The scroll is a static explanation and
 *    a stored dismissal. It must never import the match controller, the
 *    Ranked transport, the settlement projections or the arena view model:
 *    the moment it can read a match, it can be wrong about one, and the
 *    "opening it cannot affect the duel" guarantee stops being structural.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Files that name `RankedRulesScroll` at all, product code only. */
function importersOf(name: string): string[] {
  return sourceFiles(ROOT)
    .filter((file) => !file.includes(join("components", "ranked-rules")))
    .filter((file) => readFileSync(file, "utf8").includes(name))
    .map((file) => file.slice(ROOT.length + 1));
}

describe("only Ranked mounts the Ranked rules scroll", () => {
  it("is referenced by exactly one product file — Ranked's match surface", () => {
    expect(importersOf("RankedRulesScroll")).toEqual([
      join("pages", "quiz-ranked", "QuizRankedMatch.tsx"),
    ]);
  });

  it("never reaches the shared arena layer, which the Daily and Tutorial share",
    () => {
      const shared = sourceFiles(join(ROOT, "components", "ranked-arena"));
      for (const file of shared) {
        expect(readFileSync(file, "utf8")).not.toContain("ranked-rules");
      }
    });
});

describe("the scroll cannot read the match", () => {
  const FORBIDDEN = [
    "useRankedMatch",
    "ranked-public/client",
    "ranked-core/arenaView",
    "ranked-core/settlementViews",
    "ranked-core/pointsFeedback",
    "@/lib/backend-auth",
  ];

  it("imports no match controller, transport or settlement projection", () => {
    for (const file of sourceFiles(join(ROOT, "components", "ranked-rules"))) {
      // IMPORTS, not prose. These files document the boundary by naming the
      // modules on the other side of it, and a plain substring search would
      // fail on the comment that explains the rule.
      const imports = (readFileSync(file, "utf8")
        .match(/^\s*(?:import|export)[^\n]*?from\s+["'][^"']+["']/gm) ?? []).join("\n");
      for (const forbidden of FORBIDDEN) {
        expect(imports, `${file} must not reach ${forbidden}`)
          .not.toContain(forbidden);
      }
    }
  });
});
