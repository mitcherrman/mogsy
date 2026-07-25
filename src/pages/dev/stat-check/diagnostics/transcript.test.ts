import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STAT_CHECK_FIXTURE_DECK } from "../fixtureDeck";
import { STAT_CATEGORIES } from "../statCheckEngine";
import {
  TRANSCRIPT_FORMAT_VERSION,
  buildMatchTranscript,
  transcriptLongDeck,
  type MatchTranscript,
} from "./transcript";

/**
 * Golden-fixture contract. Regenerate (after an INTENTIONAL rules change) with:
 *   STAT_CHECK_WRITE_TRANSCRIPTS=1 npx vitest run src/pages/dev/stat-check/diagnostics/transcript.test.ts
 * then copy the transcripts/ directory into the backend's parity fixtures and
 * update the Python engine mirror in the same change.
 */
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "transcripts");
const WRITE = process.env.STAT_CHECK_WRITE_TRANSCRIPTS === "1";

type FixtureSpec = {
  file: string;
  deck: "fixture" | "long";
  seed: string;
  items: boolean;
};

export const TRANSCRIPT_FIXTURES: FixtureSpec[] = [
  { file: "fixture-noitems-a.json", deck: "fixture", seed: "sc-golden:noitems:a", items: false },
  { file: "fixture-noitems-b.json", deck: "fixture", seed: "sc-golden:noitems:b", items: false },
  { file: "fixture-noitems-c.json", deck: "fixture", seed: "sc-golden:noitems:c", items: false },
  { file: "fixture-items-a.json", deck: "fixture", seed: "sc-golden:items:a", items: true },
  { file: "fixture-items-b.json", deck: "fixture", seed: "sc-golden:items:b", items: true },
  { file: "fixture-items-c.json", deck: "fixture", seed: "sc-golden:items:c", items: true },
  { file: "long-items-a.json", deck: "long", seed: "sc-golden:long:a", items: true },
  { file: "long-items-b.json", deck: "long", seed: "sc-golden:long:b", items: true },
];

const deckFor = (spec: FixtureSpec) =>
  spec.deck === "fixture" ? STAT_CHECK_FIXTURE_DECK : transcriptLongDeck(STAT_CHECK_FIXTURE_DECK);

const build = (spec: FixtureSpec) => buildMatchTranscript(deckFor(spec), spec.seed, { items: spec.items });

const readFixture = (spec: FixtureSpec): MatchTranscript =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, spec.file), "utf8"));

describe("stat check golden transcripts", () => {
  it("writes fixtures when explicitly requested", () => {
    if (!WRITE) return;
    mkdirSync(FIXTURE_DIR, { recursive: true });
    for (const spec of TRANSCRIPT_FIXTURES) {
      writeFileSync(path.join(FIXTURE_DIR, spec.file), `${JSON.stringify(build(spec), null, 1)}\n`);
    }
  });

  it("exports deterministically (identical rebuild)", () => {
    const spec = TRANSCRIPT_FIXTURES[3];
    expect(build(spec)).toEqual(build(spec));
  });

  it("matches every committed fixture exactly", () => {
    for (const spec of TRANSCRIPT_FIXTURES) {
      expect(existsSync(path.join(FIXTURE_DIR, spec.file)), spec.file).toBe(true);
      const fixture = readFixture(spec);
      expect(fixture.formatVersion).toBe(TRANSCRIPT_FORMAT_VERSION);
      // Deep-equal covers every float (margins, L18 values) bit-for-bit after
      // JSON round-trip: both sides serialize shortest-round-trip doubles.
      expect(build(spec), spec.file).toEqual(fixture);
    }
  });

  it("covers the required scenario matrix", () => {
    const all = TRANSCRIPT_FIXTURES.map(readFixture);
    const categoryById = new Map(STAT_CATEGORIES.map((category) => [category.id, category]));
    const laneCategories = all.flatMap((t) => t.rounds.flatMap((r) => r.boardCategoryIds));

    // Zero-item and items-enabled matches both present.
    expect(all.some((t) => !t.itemsEnabled)).toBe(true);
    expect(all.some((t) => t.itemsEnabled)).toBe(true);
    // Highest and Lowest directions both contested.
    expect(laneCategories.some((id) => categoryById.get(id as never)?.direction === "higher")).toBe(true);
    expect(laneCategories.some((id) => categoryById.get(id as never)?.direction === "lower")).toBe(true);
    // Items actually consumed by both seats somewhere, including Mogzy Snack.
    const laneResults = all.flatMap((t) => t.rounds.flatMap((r) => r.results));
    expect(laneResults.some((r) => r.p1Item)).toBe(true);
    expect(laneResults.some((r) => r.p2Item)).toBe(true);
    expect(laneResults.some((r) => r.p1Item === "mogzy-snack" || r.p2Item === "mogzy-snack")).toBe(true);
    // Decisive lanes and ties appear.
    expect(laneResults.some((r) => r.decisive)).toBe(true);
    // At least one match passes a post-Round-3 item-choice phase, and the long
    // matches reach deeper cadence points.
    expect(all.some((t) => t.itemChoices.some((c) => c.completedRounds === 3))).toBe(true);
    expect(all.some((t) => t.itemChoices.some((c) => c.completedRounds >= 9))).toBe(true);
    // Both endings represented: HP knockouts and deck exhaustion.
    expect(all.some((t) => (t.final.endReason ?? "").includes("Deck exhausted"))).toBe(true);
    expect(all.some((t) => (t.final.endReason ?? "").includes("HP"))).toBe(true);
    // No invariant violations anywhere.
    for (const t of all) expect(t.final.invariantIssues).toEqual([]);
  });

  it("keeps exact-category adjacency inside every fixture", () => {
    for (const t of TRANSCRIPT_FIXTURES.map(readFixture)) {
      for (let i = 1; i < t.rounds.length; i++) {
        for (const id of t.rounds[i].boardCategoryIds) {
          expect(t.rounds[i - 1].boardCategoryIds).not.toContain(id);
        }
        expect(new Set(t.rounds[i].boardCategoryIds).size).toBe(3);
      }
    }
  });

  it("records structurally complete rounds", () => {
    for (const t of TRANSCRIPT_FIXTURES.map(readFixture)) {
      expect(t.initialShuffleIds).toHaveLength(t.deck.length);
      expect(new Set(t.initialShuffleIds).size).toBe(t.deck.length);
      for (const round of t.rounds) {
        expect(Object.keys(round.p1.assignments).sort()).toEqual([...round.boardCategoryIds].sort());
        expect(Object.keys(round.p2.assignments).sort()).toEqual([...round.boardCategoryIds].sort());
        expect(round.results).toHaveLength(3);
        for (const lane of round.results) {
          expect(lane.p1Final).toBe(lane.p1Natural + lane.p1Bonus);
          expect(lane.p2Final).toBe(lane.p2Natural + lane.p2Bonus);
        }
      }
      const last = t.rounds[t.rounds.length - 1];
      expect(t.final.roundsPlayed).toBe(t.rounds.length);
      expect(t.final.p1Hp).toBe(last.p1HpAfter);
      expect(t.final.p2Hp).toBe(last.p2HpAfter);
    }
  });
});
