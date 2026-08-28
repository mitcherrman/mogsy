/**
 * Source-scan guards for the interaction dispatcher package (Phase 4C1).
 * Mirrors `player/masteryPlayer.guards.test.ts`'s discipline for the new
 * `interactions/` package: no game-formula / correctness / hashing logic, no
 * network calls, and no reviewer-artifact import.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(here).filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
);

const codeOf = (file: string): string =>
  readFileSync(path.join(here, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("interactions package source scan", () => {
  it("contains at least the expected renderer/dispatcher files", () => {
    expect(sourceFiles).toEqual(
      expect.arrayContaining([
        "registry.tsx",
        "AtomicRecallQuestionView.tsx",
        "AtomicRecallRevealView.tsx",
        "formatPromptSemantics.ts",
      ]),
    );
  });

  it("contains no game-formula / correctness / hashing / eval logic", () => {
    const forbidden = [
      /final_cooldown\s*\(/,
      /createHash|sha256|content_hash/i,
      /100\s*\/\s*\(\s*100\s*\+/,
      /\*\s*0\.85/,
      /Math\.(pow|sqrt)\s*\(/,
      /\beval\s*\(/,
      /new\s+Function\s*\(/,
    ];
    for (const file of sourceFiles) {
      const src = codeOf(file);
      for (const pattern of forbidden) {
        expect(pattern.test(src), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  it("never compares a submitted answer to a correct answer (no client-side grading)", () => {
    // The only legitimate reads of correctness are `reveal.authoritativeCorrectness`
    // (pass-through display) — never an equality/comparison against a submitted value.
    const suspicious = [
      /submittedAnswer\s*===?\s*.*correctAnswer/,
      /correctAnswer\s*===?\s*.*submittedAnswer/,
      /playerAnswer\s*===?\s*.*correctAnswer/,
      /numeric\s*===?\s*.*correctAnswer/,
    ];
    for (const file of sourceFiles) {
      const src = codeOf(file);
      for (const pattern of suspicious) {
        expect(pattern.test(src), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  it("makes no network / Supabase / env calls", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/\bfetch\s*\(/.test(src), `${file} calls fetch`).toBe(false);
      expect(/supabase/i.test(src), `${file} references supabase`).toBe(false);
      expect(/import\.meta\.env/.test(src), `${file} reads env`).toBe(false);
    }
  });

  it("never imports the reviewer artifact fixture or review contracts", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/reviewArtifactEnvelope/.test(src), `${file} imports reviewArtifactEnvelope`).toBe(false);
      expect(/from\s+["'][^"']*contracts\/review["']/.test(src), `${file} imports review contract`).toBe(false);
    }
  });
});
