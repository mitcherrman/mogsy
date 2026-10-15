import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import rangeCapture from "@/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json";
import wordRounds from "@/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json";
import {
  LAB_PACK_FILES, MAX_PACK_BYTES, PROTOTYPE_LABEL, readPackFile, readRangefinderPack, readWordPuzzlePack,
} from "./packs";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fileOf = (text: string, name = "pack.json") => new File([text], name, { type: "application/json" });

describe("INT1 lab packs — Rangefinder capture", () => {
  it("accepts the committed capture and carries every eligible record unchanged", () => {
    const r = readRangefinderPack(rangeCapture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.eligible).toEqual(rangeCapture.eligible);
    expect(r.pack.eligible).toHaveLength(227);
    expect(r.pack.capturedAt).toBe(rangeCapture.capturedAt);
  });

  it("refuses the Word Puzzle file, records off the lattice, and non-wiki sources", () => {
    expect(readRangefinderPack(wordRounds).ok).toBe(false);
    const off = clone(rangeCapture); off.eligible[0].castRangeUnits = 740;
    expect(readRangefinderPack(off)).toMatchObject({ ok: false, error: expect.stringMatching(/lattice/) });
    const js = clone(rangeCapture); js.eligible[0].sourceUrl = "javascript:alert(1)";
    expect(readRangefinderPack(js)).toMatchObject({ ok: false, error: expect.stringMatching(/sourceUrl/) });
    const other = clone(rangeCapture); other.eligible[0].sourceUrl = "https://evil.example/Template:Data_Ahri";
    expect(readRangefinderPack(other).ok).toBe(false);
    const dup = clone(rangeCapture); dup.eligible.push(dup.eligible[0]);
    expect(readRangefinderPack(dup)).toMatchObject({ ok: false, error: expect.stringMatching(/repeats/) });
    expect(readRangefinderPack({ ...clone(rangeCapture), eligible: [] }).ok).toBe(false);
    expect(readRangefinderPack(null).ok).toBe(false);
  });
});

describe("INT1 lab packs — Word Puzzle rounds", () => {
  it("accepts the committed round file and carries every round unchanged", () => {
    const r = readWordPuzzlePack(wordRounds);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack).toHaveLength(wordRounds.rounds.length);
    for (const [i, round] of r.pack.entries()) {
      const src = wordRounds.rounds[i] as Record<string, unknown>;
      expect(round.id).toBe(src.id);
      expect(round.answer).toBe(src.answer);
      expect(round.verified).toBe(src.verified);
      expect(round.source).toEqual(src.source);
    }
  });

  it("refuses the Rangefinder file, unsourced 'verified' rounds, bad ids and bad clue slots", () => {
    expect(readWordPuzzlePack(rangeCapture).ok).toBe(false);
    const unsourced = clone(wordRounds); (unsourced.rounds[0] as Record<string, unknown>).source = null;
    expect(readWordPuzzlePack(unsourced)).toMatchObject({ ok: false, error: expect.stringMatching(/verified with no source/) });
    const badId = clone(wordRounds); badId.rounds[0].id = "../../etc";
    expect(readWordPuzzlePack(badId).ok).toBe(false);
    const badSlot = clone(wordRounds); (badSlot.rounds[0].clue as Record<string, unknown>).slot = "<img>";
    expect(readWordPuzzlePack(badSlot).ok).toBe(false);
    const noLetters = clone(wordRounds); noLetters.rounds[0].answer = "''";
    expect(readWordPuzzlePack(noLetters).ok).toBe(false);
  });
});

describe("INT1 lab packs — file reading", () => {
  it("reads a JSON file, and refuses invalid JSON and oversized files before parsing", async () => {
    expect((await readPackFile(fileOf(JSON.stringify(wordRounds)), readWordPuzzlePack)).ok).toBe(true);
    expect(await readPackFile(fileOf("{ not json"), readWordPuzzlePack)).toMatchObject({ ok: false, error: "File is not valid JSON." });
    const big = fileOf("x".repeat(MAX_PACK_BYTES + 1));
    expect(await readPackFile(big, readWordPuzzlePack)).toMatchObject({ ok: false, error: expect.stringMatching(/KB/) });
  });

  it("names the committed fixture paths and the mandatory label", () => {
    for (const p of Object.values(LAB_PACK_FILES)) expect(() => readFileSync(resolve(process.cwd(), p))).not.toThrow();
    expect(PROTOTYPE_LABEL).toBe("Prototype • not server-authoritatively graded");
  });
});

describe("INT1 production boundary (source)", () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  // Everything the owner-only admin route can load in a production build.
  // UGMP: the file-loader page is gone; the owner plays at /admin/playtests/:mode,
  // whose hosts receive every round from the backend.
  const PRODUCTION_REACHABLE = [
    "src/pages/admin/playtests/OwnerPlaytestPage.tsx",
    "src/pages/admin/playtests/RangefinderOwnerPlaytest.tsx",
    "src/pages/admin/playtests/GlyphPressOwnerPlaytest.tsx",
    "src/pages/admin/playtests/ownerArena.tsx",
    "src/pages/admin/playtests/legacyRedirects.tsx",
    "src/pages/dev/interaction-lab/labArenaView.ts",
    "src/lib/playtests/api.ts",
    "src/lib/playtests/modes.ts",
    "src/lib/interaction-labs/packs.ts",
    "src/pages/dev/rangefinder/RangefinderLab.tsx",
    "src/pages/dev/rangefinder/labAuthority.ts",
    "src/pages/dev/word-puzzle/WordPuzzleLab.tsx",
    "src/pages/dev/word-puzzle/labAuthority.ts",
    "src/lib/word-puzzle/authority.ts",
    "src/lib/rangefinder/eligibility.ts",
    "src/components/interaction-grammar/Rangefinder.tsx",
    "src/components/interaction-grammar/GlyphPress.tsx",
  ];

  it("no production-reachable module imports an answer-bearing fixture", () => {
    for (const p of PRODUCTION_REACHABLE) {
      const imports = src(p).split("\n").filter((l) => /^\s*import\b/.test(l) || /import\(/.test(l));
      expect(imports.filter((l) => /__fixtures__|\.json["']/.test(l)), p).toEqual([]);
    }
  });

  it("only the DEV hosts import the fixtures, and App.tsx registers them behind import.meta.env.DEV", () => {
    expect(src("src/pages/dev/rangefinder/RangefinderDevLab.tsx")).toMatch(/__fixtures__\/rangeAuthorityCapture\.json/);
    expect(src("src/pages/dev/word-puzzle/WordPuzzleDevLab.tsx")).toMatch(/__fixtures__\/wordPuzzleRounds\.json/);
    const app = src("src/App.tsx");
    expect(app).toMatch(/const RangefinderLab = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\("\.\/pages\/dev\/rangefinder\/RangefinderDevLab"\)\)/);
    expect(app).toMatch(/const WordPuzzleLab = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\("\.\/pages\/dev\/word-puzzle\/WordPuzzleDevLab"\)\)/);
    expect(app.match(/DevLab"\)/g)).toHaveLength(2);
  });

  it("the owner play route is wrapped in AdminRoute, and the retired lab URLs only redirect", () => {
    const app = src("src/App.tsx");
    const play = app.split("\n").filter((l) => l.includes('path="/admin/playtests/:mode"'));
    expect(play).toHaveLength(1);
    expect(play[0]).toMatch(/element=\{<AdminRoute><Suspense fallback=\{<RouteFallback \/>\}><OwnerPlaytestPage \/><\/Suspense><\/AdminRoute>\}/);
    const legacy = app.split("\n").filter((l) => l.includes('path="/admin/interaction-labs'));
    expect(legacy).toHaveLength(2);
    for (const r of legacy) expect(r).toMatch(/element=\{<InteractionLabsRedirect \/>\}/);
    expect(app).not.toMatch(/InteractionLabPage\b/);
  });

  it("both DEV labs carry the prototype label", () => {
    for (const p of ["src/pages/dev/rangefinder/RangefinderLab.tsx", "src/pages/dev/word-puzzle/WordPuzzleLab.tsx"]) {
      expect(src(p), p).toMatch(/data-testid="lab-prototype-label"[^{}]{0,300}\{PROTOTYPE_LABEL\}/);
    }
  });
});
