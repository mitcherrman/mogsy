import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FORBIDDEN_ANSWER_KEYS } from "./hiddenInfoGuard";
import {
  parseMasteryPlayerQuestion,
  parseMasteryPlayerReveal,
  parseMasteryReviewArtifact,
} from "./parsers";
import {
  ARTIFACT_DIGEST,
  SET_ID,
  STEP_IDS,
  playerQuestionEnvelopes,
  playerRevealEnvelopes,
  reviewArtifactEnvelope,
} from "../fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, "../__fixtures__");
const contractsDir = here;

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
}

describe("captured JSON matches the factory fixtures (drift guard)", () => {
  it("player_questions.json equals playerQuestionEnvelopes()", () => {
    expect(readJson("player_questions.json")).toEqual(playerQuestionEnvelopes());
  });
  it("player_reveals.json equals playerRevealEnvelopes()", () => {
    expect(readJson("player_reveals.json")).toEqual(playerRevealEnvelopes());
  });
  it("review_artifact.json equals reviewArtifactEnvelope()", () => {
    expect(readJson("review_artifact.json")).toEqual(reviewArtifactEnvelope());
  });
});

describe("captured JSON parses through the readers", () => {
  it("all captured player questions parse", () => {
    const envs = readJson("player_questions.json") as unknown[];
    expect(envs.map(parseMasteryPlayerQuestion)).toHaveLength(6);
  });
  it("all captured reveals parse", () => {
    const envs = readJson("player_reveals.json") as unknown[];
    expect(envs.map(parseMasteryPlayerReveal)).toHaveLength(6);
  });
  it("captured reviewer envelope parses", () => {
    expect(() => parseMasteryReviewArtifact(readJson("review_artifact.json"))).not.toThrow();
  });
});

describe("captured question JSON leaks no answer keys (raw text scan)", () => {
  it("player_questions.json contains none of the forbidden field names as object keys", () => {
    // Match a forbidden token only when it appears as a JSON key (`"key":`), so a
    // legitimate enum VALUE such as question_family "health_remaining" is allowed.
    const raw = readFileSync(path.join(fixturesDir, "player_questions.json"), "utf8").toLowerCase();
    const hits = FORBIDDEN_ANSWER_KEYS.filter((k) => new RegExp(`"${k}"\\s*:`).test(raw));
    expect(hits, `forbidden keys present: ${hits.join(", ")}`).toEqual([]);
  });

  it("player_questions.json text does not contain the audited answer values as fields", () => {
    // The audited answers (3,10,5,325,230,true) must not appear as correct_answer
    // fields; the raw-text guard above already forbids the field name, so a value
    // like "325" appearing inside a prompt is fine, but no answer field exists.
    const raw = readFileSync(path.join(fixturesDir, "player_questions.json"), "utf8");
    expect(raw).not.toMatch(/correct_answer/i);
    expect(raw).not.toMatch(/authoritative_correctness/i);
  });
});

describe("fixture identities match the audited artifact", () => {
  it("preserves the audited set id, artifact digest, and ordered step ids", () => {
    const { artifact } = parseMasteryReviewArtifact(reviewArtifactEnvelope());
    expect(artifact.masterySetId).toBe(SET_ID);
    expect(artifact.artifactDigest).toBe(ARTIFACT_DIGEST);
    expect(artifact.steps.map((s) => s.stepId)).toEqual([...STEP_IDS]);
  });

  it("player-question and reveal envelopes share the audited digest", () => {
    const q = parseMasteryPlayerQuestion(playerQuestionEnvelopes()[0]);
    const r = parseMasteryPlayerReveal(playerRevealEnvelopes()[0]);
    expect(q.artifactDigest).toBe(ARTIFACT_DIGEST);
    expect(r.artifactDigest).toBe(ARTIFACT_DIGEST);
  });
});

describe("formula-authority prohibition (source scan)", () => {
  const sourceFiles = readdirSync(contractsDir).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );

  // Strip line + block comments so the scan judges executable code only (doc
  // comments legitimately mention "no formulas", "no Supabase", etc.).
  const codeOf = (file: string): string =>
    readFileSync(path.join(contractsDir, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("contract package files contain no game-formula / correctness / hashing logic", () => {
    // Tokens that would indicate the client recomputing a canonical value.
    const forbidden = [
      /final_cooldown\s*\(/,
      /createHash|sha256|content_hash/i,
      /100\s*\/\s*\(\s*100\s*\+/, // ability-haste cooldown formula
      /\*\s*0\.85/, // Ahri E AP ratio
      /Math\.(pow|sqrt)\s*\(/,
    ];
    for (const file of sourceFiles) {
      const src = codeOf(file);
      for (const pattern of forbidden) {
        expect(pattern.test(src), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  it("contract package files make no network or Supabase calls", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/\bfetch\s*\(/.test(src), `${file} calls fetch`).toBe(false);
      expect(/supabase/i.test(src), `${file} references supabase`).toBe(false);
      expect(/import\.meta\.env/.test(src), `${file} reads env`).toBe(false);
    }
  });
});
