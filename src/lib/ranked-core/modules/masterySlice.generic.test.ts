// ---------------------------------------------------------------------------
// The `mastery_slice` frontend is generic — asserted against the SOURCE.
//
// The product constraint this guards is "a new runtime question family should
// reach players through backend registration, not through bespoke React". A
// behavioural test cannot prove that: a renderer with an `if (champion ===
// "Jarvan IV")` inside it would pass every rendering test in this directory
// while quietly making the next family someone else's problem.
//
// So this reads the files themselves and refuses content vocabulary in them.
// The list is deliberately about CONTENT — champions, items, abilities, damage
// mechanics, set ids — and not about the generic contract, which these files
// must of course name (`mastery_slice`, `interaction_kind`, `atomic_recall`).
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");

/** Every file that renders or routes a `mastery_slice` challenge. */
const RENDERING_SOURCES = [
  "lib/ranked-core/modules/masterySliceModule.tsx",
  "lib/ranked-core/modules/registry.ts",
  "components/quiz/workspace/QuestionReviewCard.tsx",
  "pages/admin/ranked/GenerationPolicyPanel.tsx",
  "pages/admin/ranked/ModuleConfigFields.tsx",
  "pages/admin/ranked/SegmentRow.tsx",
];

/**
 * Content vocabulary that must not appear in a renderer.
 *
 * A champion or item name means the file has learned about one family's
 * content; a set id means it has learned about one specific set; a mechanic
 * name means it is reasoning about the calculation rather than displaying the
 * backend's own words.
 */
/**
 * Comments are stripped before scanning.
 *
 * The guard is about LOGIC, not prose: a comment that names a real set as an
 * illustration ("a terse internal label, e.g. \"Ahri Q — ability_cooldown\"")
 * is exactly the kind of documentation that makes a generic file readable, and
 * banning it would push these files toward vaguer comments to satisfy a test.
 * What must not appear is a name the CODE branches on.
 */
function strippedSource(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .toLowerCase();
}

const FORBIDDEN = [
  "jarvan", "ahri", "syndra", "olaf",
  "serrated", "dominik", "dirk",
  "lethality", "percent_pen", "physical_penetration",
  "chain.jarvan", "playtest.champion", "playtest.matchup",
  "armour penetration", "armor penetration",
];

describe("the mastery_slice frontend names no content", () => {
  for (const relative of RENDERING_SOURCES) {
    it(`${relative} contains no champion, item, set or mechanic name`, () => {
      const source = strippedSource(relative);
      for (const token of FORBIDDEN) {
        expect(source.includes(token), `${relative} names "${token}"`).toBe(false);
      }
    });
  }

  it("routes on the generic challenge contract, not on content", () => {
    const source = readFileSync(
      join(ROOT, "lib/ranked-core/modules/masterySliceModule.tsx"), "utf8");
    // What it IS allowed to know: the wire's own discriminators.
    expect(source).toContain("interactionKind");
    expect(source).toContain("comparison_left_right");
    expect(source).toContain("atomic_recall");
    // And it decides nothing about correctness — that is the server's.
    expect(source).not.toContain("isCorrect");
    expect(source).not.toContain("correctAnswer");
  });

  it("computes no answer anywhere in the admin preview path", () => {
    const source = readFileSync(
      join(ROOT, "pages/admin/ranked/GenerationPolicyPanel.tsx"), "utf8");
    // The preview only ever DISPLAYS what the backend generated.
    expect(source).toContain("previewMasterySlice");
    // No arithmetic on canonical values: a calculator here would be a second
    // content authority that eventually disagrees with what players are served.
    expect(source).not.toMatch(/Math\.(floor|round|max|min|pow)/);
  });
});
