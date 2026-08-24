/**
 * THE SHARED-LAYER BOUNDARY (ARENA1 Step 2A).
 *
 * The arena components in this directory are the canonical game renderer.
 * Ranked, the Tutorial and (later) the Daily all compose them, so they must
 * depend DOWNWARD on the neutral contracts in `lib/ranked-core` and never
 * upward on any one mode's page.
 *
 * That rule was broken twice, quietly and in the same shape both times: a
 * presentation type was declared next to the projection that produced it —
 * `MascotReaction` / `RoundHistoryEntry` in `pages/quiz-ranked/rankedViews`,
 * the timeline node types in `pages/quiz-ranked/roundTimeline` — and the
 * component that rendered it simply imported from there. Nothing failed. A
 * type-only import is invisible at runtime, costs nothing at build time, and
 * makes the arena layer un-reusable by any mode that is not Ranked.
 *
 * So this asserts the rule DIRECTLY rather than trusting each component's own
 * tests to notice. It is deliberately its own file, named after the rule: a
 * future exception has to delete a test that says what it is deleting.
 *
 * `import type` is checked too, on purpose — it is exactly what got through.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

/** Every .ts/.tsx file under `dir`, excluding tests. */
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

/**
 * Module specifiers this file imports from — `import`, `import type`,
 * `export … from` and bare side-effect imports alike. A regex is the right
 * tool here: the question is "what does the source text say", and a parser
 * would only add a way for the answer to differ from what a reader sees.
 */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\b[\s\S]*?from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  while ((m = bare.exec(source)) !== null) out.push(m[1]);
  return out;
}

/** Does this specifier reach a mode's page directory, aliased or relative? */
function reachesPages(specifier: string, fromFile: string): boolean {
  if (specifier.startsWith("@/pages/")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = resolve(fromFile, "..", specifier);
  return resolved.startsWith(join(ROOT, "pages"));
}

const LAYERS = [
  { name: "components/ranked-arena", dir: join(ROOT, "components", "ranked-arena") },
  { name: "components/question-surface", dir: join(ROOT, "components", "question-surface") },
  { name: "lib/ranked-core", dir: join(ROOT, "lib", "ranked-core") },
];

describe("the shared arena layer does not depend on any mode's page", () => {
  for (const layer of LAYERS) {
    it(`${layer.name}/** imports nothing from src/pages/**`, () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(layer.dir)) {
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          if (reachesPages(spec, file)) {
            offenders.push(`${file.slice(ROOT.length + 1)} → ${spec}`);
          }
        }
      }
      // Named so a failure reads as the rule, not as an array diff.
      expect(offenders, [
        "A shared arena module imported from a mode's page directory.",
        "Move the shared TYPE into src/lib/ranked-core/viewTypes.ts and",
        "re-export it from its old home, the way ARENA1 Step 2A did.",
      ].join(" ")).toEqual([]);
    });
  }

  it("keeps the arena's settled-round types in lib/ranked-core, not in a page", () => {
    const viewTypes = readFileSync(
      join(ROOT, "lib", "ranked-core", "viewTypes.ts"), "utf8");
    for (const name of [
      "ResultKind", "RoundHistoryEntry", "MascotReaction",
      "TimelineSegmentKind", "TimelineNodeState", "TimelineNodeTag",
      "TimelineNode", "RoundTimelineView",
    ]) {
      expect(viewTypes, `${name} must be DECLARED in lib/ranked-core/viewTypes`)
        .toMatch(new RegExp(`export (?:type|interface) ${name}\\b`));
    }
  });

  /**
   * ARENA1 Step 5 — the same rule, one level up: a mode-neutral RUNTIME
   * projection may not live in a mode's page either.
   *
   * The type move above fixed `components/` importing upward. It left the
   * FUNCTIONS that produce those types in `pages/quiz-ranked/`, and Step 4 had
   * the Tutorial importing them from there. That is the same inversion wearing
   * a different hat, and it only became visible when a THIRD mode arrived: at
   * that point Ranked's page directory is a shared library that nothing
   * declares and no reader expects to be one.
   *
   * Declared in `lib/ranked-core`, re-exported from their historical homes.
   */
  it("keeps the neutral settlement and timeline projections in lib/ranked-core", () => {
    const settlement = readFileSync(
      join(ROOT, "lib", "ranked-core", "settlementViews.ts"), "utf8");
    for (const fn of [
      "projectRoundHistory", "projectRevealOutcomes", "projectRevealDamage",
      "projectSurfaceReveal", "projectMascotReactions",
    ]) {
      expect(settlement, `${fn} must be DECLARED in lib/ranked-core/settlementViews`)
        .toMatch(new RegExp(`export function ${fn}\\b`));
    }
    expect(readFileSync(join(ROOT, "lib", "ranked-core", "roundTimeline.ts"), "utf8"))
      .toMatch(/export function projectRoundTimeline\b/);
    // `resultKind` had to come with the timeline: the projection needs it, and
    // a projection in `lib/` must not reach into `components/` for it.
    expect(readFileSync(join(ROOT, "lib", "ranked-core", "resultKind.ts"), "utf8"))
      .toMatch(/export function resultKind\b/);
  });

  it("leaves no neutral projection DECLARED in a mode's page", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      for (const fn of [
        "projectRoundHistory", "projectRevealOutcomes", "projectRevealDamage",
        "projectSurfaceReveal", "projectMascotReactions", "projectRoundTimeline",
        "resultKind",
      ]) {
        if (new RegExp(`export function ${fn}\\b`).test(src)) {
          offenders.push(`${file.slice(ROOT.length + 1)} declares ${fn}`);
        }
      }
    }
    expect(offenders, [
      "A mode-neutral projection was declared in a page directory again.",
      "Three modes render the arena; anything all three call belongs in",
      "lib/ranked-core, with a re-export left behind.",
    ].join(" ")).toEqual([]);
  });

  it("still resolves those types from their historical import sites", async () => {
    // The move is only safe because nothing had to be rewritten downstream.
    // These are the two modules that declared them; both re-export.
    const views = await import("@/pages/quiz-ranked/rankedViews");
    const timeline = await import("@/pages/quiz-ranked/roundTimeline");
    expect(typeof views.projectRoundHistory).toBe("function");
    expect(typeof views.projectMascotReactions).toBe("function");
    expect(typeof views.projectRevealOutcomes).toBe("function");
    expect(typeof views.projectRevealDamage).toBe("function");
    expect(typeof views.projectSurfaceReveal).toBe("function");
    expect(typeof timeline.projectRoundTimeline).toBe("function");
    // And `resultKind` from the component that used to declare it.
    const beat = await import("@/components/ranked-arena/RoundResultBeat");
    expect(typeof beat.resultKind).toBe("function");
    // The runtime values that did NOT move are still exported from here.
    expect(timeline.TIMELINE_VISIBLE_NODES).toBe(9);
    expect(timeline.TIMELINE_ANCHOR_INDEX).toBe(4);
  });
});
