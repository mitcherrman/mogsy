// ---------------------------------------------------------------------------
// LEGACY1 — the retired Mogsy product must not come back.
//
// WHY THIS EXISTS. The previous phase archived the pre-Mogzy voting product
// instead of deleting it, and the archive did what archives do: later agents
// found it, assumed it was current, and built against it. The owner's rule now
// is that a concept with no current production dependency is deleted. This file
// is the mechanical half of that rule.
//
// WHAT IT SCANS. Active runtime source under src/ only, excluding this file and
// the generated Supabase types. It deliberately does NOT scan:
//
//   · supabase/migrations/** — immutable history. A migration that created
//     `leagues` in 2025 is a true record and must never be edited.
//   · src/integrations/supabase/types.ts — generated from the live database,
//     which still HAS those tables. The columns are historical residue
//     (LEGACY1_HANDOFF.md); what matters is that nothing reads them.
//
// So a hit here means active code, not history.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const SELF = resolve(__filename);

/** Generated from the live database; residue there is expected, not a reader. */
const EXCLUDED = new Set([resolve(SRC, "integrations/supabase/types.ts"), SELF]);

function activeSources(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      // Runtime code only. A test may legitimately NAME a retired column —
      // that is how it proves nothing writes it — and banning the word there
      // would make the proof unwritable.
      if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
      if (EXCLUDED.has(resolve(full))) continue;
      out.push(full);
    }
  })(SRC);
  return out;
}

/**
 * Comments are stripped before scanning. The record of what was removed is
 * written in comments all over this codebase — including in the files that used
 * to hold the removed code — and a scan that banned the words would make that
 * record unwritable. What this guard cares about is executable references.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ")
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1");
}

const SOURCES = activeSources().map((f) => ({
  path: relative(process.cwd(), f).replace(/\\/g, "/"),
  text: stripComments(readFileSync(f, "utf8")),
}));

function hits(pattern: RegExp): string[] {
  return SOURCES.filter((f) => pattern.test(f.text)).map((f) => f.path);
}

describe("LEGACY1 — retired product surfaces stay deleted", () => {
  it("declares no route into the retired voting product", () => {
    // Route declarations only: a path inside a comment explaining what was
    // removed is documentation, and banning that would make the record
    // unwritable. App.tsx's own agreement test covers the router exhaustively.
    for (const dead of [
      "/admin/arena",
      "/admin/play",
      "/admin/gaming",
      "/admin/demo",
      "/admin/legacy-dashboard",
      "/admin/legacy-directory",
      "/moderator",
      "/swipe-game",
      "/swipe-leagues",
      "/elo-check",
      "/referral",
    ]) {
      const pattern = new RegExp(`path=["']${dead}["']|to=["']${dead}["']`);
      expect(hits(pattern), `${dead} is routed or linked again`).toEqual([]);
    }
  });

  it("has no reader or writer for the retired currency", () => {
    // `Diamond` on its own is the LEAGUE RANK TIER and is current Ranked
    // vocabulary, so this matches the economy columns by name instead.
    for (const column of [
      "grant_diamonds",
      "default_diamonds",
      "reward_diamonds",
      "referrer_diamonds",
      "elo_shields",
      "boost_credits",
      "active_boost_until",
      "activate_boost",
    ]) {
      expect(hits(new RegExp(`\\b${column}\\b`)), `${column} is read or written again`).toEqual([]);
    }
  });

  it("has no league-only flag, and therefore no implied way back", () => {
    expect(hits(/LEAGUE_ONLY_MODE/)).toEqual([]);
  });

  it("imports none of the deleted modules", () => {
    for (const mod of [
      "@/lib/admin-data-sources",
      "@/lib/ad-analytics",
      "@/lib/card-animations",
      "@/lib/elo",
      "@/pages/Moderator",
      "@/components/FavoritesEditor",
      "@/components/admin/AdminCollections",
      "@/components/admin/AdminBots",
      "@/components/admin/AdminSounds",
    ]) {
      // AdminSounds is the one exception: it survives, rehomed. It is listed
      // here as a path that must no longer be imported from a deleted shell,
      // so the check is for the shell's own files, not the component.
      if (mod.endsWith("AdminSounds")) continue;
      expect(hits(new RegExp(`from ["']${mod}["']`)), `${mod} is imported again`).toEqual([]);
    }
  });

  it("registers no Admin area that is presented as archived", () => {
    expect(hits(/kind: ["']archived["']/)).toEqual([]);
    expect(hits(/disposition: ["']ARCHIVE["']/)).toEqual([]);
  });
});

describe("LEGACY1 — the capabilities that were rehomed still exist", () => {
  it("keeps the Audio Studio, out of the deleted /admin/gaming shell", () => {
    expect(hits(/from ["']@\/components\/admin\/AdminSounds["']/)).toEqual([
      "src/pages/admin/AdminAudioStudio.tsx",
    ]);
    expect(hits(/path="audio-studio"/)).toContain("src/App.tsx");
  });

  it("keeps current Ranked, whose vocabulary overlaps the retired product's", () => {
    // These are the semantic traps LEGACY1 had to avoid deleting: the Ranked
    // match surface is called an arena, and Diamond is a rank tier.
    expect(hits(/ranked-arena/).length).toBeGreaterThan(0);
    expect(hits(/DIAMOND/).length).toBeGreaterThan(0);
    expect(hits(/league-swipe/).length).toBeGreaterThan(0);
  });
});
