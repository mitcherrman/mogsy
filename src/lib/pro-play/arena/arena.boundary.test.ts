/**
 * PPQ2-B — what the Pro Play arena layer may and may not reach.
 *
 * Source-level guards, on code with comments stripped (the files document at
 * length what they do NOT do, and that prose must not trip the guards).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), "src", "lib", "pro-play", "arena");
const FILES = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const code = (f: string) => codeOnly(readFileSync(join(DIR, f), "utf8"));
const imports = (f: string) =>
  [...code(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("pro-play/arena boundary", () => {
  it("has source files to guard", () => {
    expect(FILES.sort()).toEqual([
      "composeArenaView.ts", "index.ts", "projectProPlayArena.ts", "state.ts", "types.ts",
      "useProPlayArenaController.ts",
    ]);
  });

  it.each(FILES)("%s imports no component, page or Arena implementation", (f) => {
    for (const spec of imports(f)) {
      expect(spec, spec).not.toMatch(/@\/components\/|@\/pages\/|CanonicalArena|ArenaShell/);
    }
  });

  it.each(FILES)("%s never reads the legacy presentation or reveal blobs", (f) => {
    const src = code(f);
    expect(src).not.toMatch(/\.presentation\b/);
    expect(src).not.toMatch(/result\??\.reveal\b|graded\??\.reveal\b/);
  });

  it.each(FILES)("%s names no Ranked or PvP concept", (f) => {
    // `matchOver` is the canonical timeline's own input name, passed through.
    const src = code(f).replace(/\bmatchOver\b/g, "").toLowerCase();
    for (const word of [
      "opponent", "opponents", "rematch", "matchmaking", "rating", "elo", "mmr", "hp",
      "damage", "duelist", "duel", "victory", "defeat", "forfeit", "settlement",
      "combatant", "publicround", "segmentstate",
    ]) {
      expect(src, `${f} must not name "${word}"`).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it.each(FILES)("%s computes no grade: no comparison against correct_answer", (f) => {
    const src = code(f);
    expect(src).not.toMatch(/===\s*\w+\.correct_answer|correct_answer\s*===|selected_answer\s*===/);
  });

  it("does not touch the live page or the existing API/controller modules", () => {
    // The arena layer only CONSUMES these; it re-implements none of them.
    const all = FILES.map(code).join("\n");
    expect(all).toMatch(/from "\.\.\/answerFlow"/);
    expect(all).not.toMatch(/\bfetch\(/);
  });
});
