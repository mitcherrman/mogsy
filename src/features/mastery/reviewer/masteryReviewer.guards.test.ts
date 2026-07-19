import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseMasteryReviewArtifact } from "../contracts/parsers";
import { reviewArtifactEnvelope } from "../fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(here).filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
);
const codeOf = (file: string): string =>
  readFileSync(path.join(here, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("reviewer package guards", () => {
  it("contains no game-formula / eval / hashing / ID-generation logic", () => {
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

  it("makes no network / Supabase / env calls", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/\bfetch\s*\(/.test(src), `${file} calls fetch`).toBe(false);
      expect(/supabase/i.test(src), `${file} references supabase`).toBe(false);
      expect(/import\.meta\.env/.test(src), `${file} reads env`).toBe(false);
    }
  });

  it("does not import the player prototype or player fixtures as reviewer authority", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/from\s+["'][^"']*\/player["']/.test(src), `${file} imports player package`).toBe(false);
      expect(/playerQuestionEnvelopes|playerRevealEnvelopes/.test(src), `${file} uses player fixtures`).toBe(false);
    }
  });
});

describe("reviewer fixture immutability", () => {
  it("parsing does not mutate the source fixture (fresh factory equals re-parse input)", () => {
    const env1 = reviewArtifactEnvelope();
    const before = JSON.stringify(env1);
    parseMasteryReviewArtifact(env1);
    expect(JSON.stringify(env1)).toBe(before); // parse did not mutate
    // A second fresh factory is deep-equal to the first (no shared mutable state).
    expect(reviewArtifactEnvelope()).toEqual(JSON.parse(before));
  });

  it("the reviewer fixture is the sole parsed source (parses to the audited artifact)", () => {
    const { artifact, reviewRecord } = parseMasteryReviewArtifact(reviewArtifactEnvelope());
    expect(artifact.steps).toHaveLength(6);
    expect(artifact.rankedCapsules).toHaveLength(4);
    expect(reviewRecord.reviewerStatus).toBe("unreviewed");
  });
});
