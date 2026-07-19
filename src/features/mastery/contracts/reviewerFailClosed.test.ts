import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MasteryContractParseError } from "./common";
import { parseMasteryReviewArtifact } from "./parsers";
import { reviewArtifactEnvelope } from "../fixtures";

type Obj = Record<string, unknown>;

// Deep clone a fresh envelope for each mutation (never mutate the factory output).
function envelope(): Obj {
  return JSON.parse(JSON.stringify(reviewArtifactEnvelope())) as Obj;
}
function artifactOf(env: Obj): Obj {
  return (env.data as Obj).artifact as Obj;
}
function step0(env: Obj): Obj {
  return (artifactOf(env).ordered_steps as Obj[])[0];
}
function capsules(env: Obj): Obj[] {
  return artifactOf(env).ranked_capsules as Obj[];
}

describe("reviewer step evidence fails closed", () => {
  it("rejects a missing answer_options", () => {
    const env = envelope();
    delete step0(env).answer_options;
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/answer_options/);
  });
  it("rejects a missing canonical_inputs", () => {
    const env = envelope();
    delete step0(env).canonical_inputs;
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/canonical_inputs/);
  });
  it("rejects a missing source_records", () => {
    const env = envelope();
    delete step0(env).source_records;
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/source_records/);
  });
  it("rejects a malformed answer_options (object, not array)", () => {
    const env = envelope();
    step0(env).answer_options = { a: 1 };
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/answer_options/);
  });
  it("rejects a malformed canonical_inputs (array, not object)", () => {
    const env = envelope();
    step0(env).canonical_inputs = [1, 2];
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/canonical_inputs/);
  });
  it("rejects a malformed source_records (string, not array)", () => {
    const env = envelope();
    step0(env).source_records = "oops";
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/source_records/);
  });
  it("rejects an empty step source_records (required audit evidence)", () => {
    const env = envelope();
    step0(env).source_records = [];
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/source_records.*not be empty|not be empty.*source_records/i);
  });
});

describe("valid-but-empty evidence acceptance", () => {
  it("accepts an empty answer_options for the numeric Q1", () => {
    const env = envelope();
    step0(env).answer_options = [];
    expect(() => parseMasteryReviewArtifact(env)).not.toThrow();
  });
  it("accepts an empty canonical_inputs object", () => {
    const env = envelope();
    step0(env).canonical_inputs = {};
    expect(() => parseMasteryReviewArtifact(env)).not.toThrow();
  });
});

describe("ranked_capsules fails closed", () => {
  it("rejects a missing ranked_capsules", () => {
    const env = envelope();
    delete artifactOf(env).ranked_capsules;
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/ranked_capsules/);
  });
  it("rejects a malformed ranked_capsules (object, not array)", () => {
    const env = envelope();
    artifactOf(env).ranked_capsules = {};
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/ranked_capsules/);
  });
  it("rejects a wrong capsule ID prefix", () => {
    const env = envelope();
    capsules(env)[0].capsule_id = "wrong_abc";
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/capsule_id/);
  });
  it("rejects a wrong source_step_id prefix", () => {
    const env = envelope();
    capsules(env)[0].source_step_id = "notastep_abc";
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/source_step_id/);
  });
  it("rejects a duplicate capsule ID", () => {
    const env = envelope();
    const caps = capsules(env);
    caps[1].capsule_id = caps[0].capsule_id;
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/duplicate.*capsule_id/i);
  });
  it("rejects a duplicate source_step_id", () => {
    const env = envelope();
    const caps = capsules(env);
    caps[1].source_step_id = caps[0].source_step_id;
    expect(() => parseMasteryReviewArtifact(env)).toThrow(/duplicate.*source_step_id/i);
  });
});

describe("audited fixture still valid", () => {
  it("parses and carries exactly four capsule references for Q1, Q2, Q4, Q5", () => {
    const { artifact } = parseMasteryReviewArtifact(reviewArtifactEnvelope());
    expect(artifact.rankedCapsules).toHaveLength(4);
    expect(artifact.rankedCapsules.map((c) => c.sourceSequenceIndex)).toEqual([0, 1, 3, 4]);
    // Each capsule's source step matches the ordered step at that index.
    for (const c of artifact.rankedCapsules) {
      expect(c.sourceStepId).toBe(artifact.steps[c.sourceSequenceIndex].stepId);
    }
  });
});

describe("contract-completeness: no required-field fallback patterns", () => {
  it("review.ts parser contains no `?? []` or `?? {}` default-before-validate patterns", () => {
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "review.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(/\?\?\s*\[\]/.test(src), "found `?? []`").toBe(false);
    expect(/\?\?\s*\{\}/.test(src), "found `?? {}`").toBe(false);
  });

  it("all thrown errors are typed MasteryContractParseError", () => {
    const env = envelope();
    delete step0(env).source_records;
    try {
      parseMasteryReviewArtifact(env);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MasteryContractParseError);
    }
  });
});
