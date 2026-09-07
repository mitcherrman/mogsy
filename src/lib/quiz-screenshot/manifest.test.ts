import { describe, expect, it } from "vitest";
import {
  buildRunManifest,
  manifestSourceEntry,
  parseRunManifest,
  RUN_MANIFEST_VERSION,
} from "./manifest";

const fullArgs = {
  run_id: "r1",
  created_at: "2026-07-15T00:00:00.000Z",
  mode: "multi-question" as const,
  package_type: "post-3-multi-question",
  package_prefix: "daily-x",
  formats: ["mobile-social"],
  question_ids: ["1", "2"],
  sources: [
    {
      id: "1",
      review_key: null,
      source_kind: "stored_question",
      materialization: "stored",
      family: null,
      source_version: null,
      specimen_version: null,
      data_version: null,
      framing: null,
    },
    {
      id: "2",
      review_key: null,
      source_kind: "stored_question",
      materialization: "stored",
      family: null,
      source_version: null,
      specimen_version: null,
      data_version: null,
      framing: null,
    },
  ],
  questions: [
    { id: "1", prompt_preview: "Q1?", correct_label: "A1" },
    { id: "2", prompt_preview: "Q2?", correct_label: "A2" },
  ],
  states: null,
  difficulty_default: "gold",
  difficulty_overrides: { "2": "diamond" },
  slides: [
    {
      index: 1,
      slide_kind: "opening",
      slug: "opening",
      state: "question",
      format: "mobile-social",
      file: "question_challenge/mobile-social_slide-01_opening.png",
    },
  ],
  capture_count: 1,
  failure_count: 0,
  warning_count: 0,
  challenge: { question_count: 2, repeat_variant: 1, mid_cta_variant: null, summary_title: "TODAY'S ANSWERS" },
  copy_variants: { app_cta: "prove-it-v2" },
  allow_incomplete_presentation: false,
  allow_missing_assets: false,
  platform: "generic",
  generator: { version: "quiz-screenshots-2", commit: "abc1234" },
  completed: true,
};

describe("run manifest", () => {
  it("builds with the current schema version and round-trips through parse", () => {
    const manifest = buildRunManifest(fullArgs);
    expect(manifest.schema_version).toBe(RUN_MANIFEST_VERSION);
    const parsed = parseRunManifest(JSON.parse(JSON.stringify(manifest)));
    expect(parsed).toEqual(manifest);
  });

  it("returns null for garbage / missing runs (backward compatibility)", () => {
    expect(parseRunManifest(null)).toBeNull();
    expect(parseRunManifest("nope")).toBeNull();
    expect(parseRunManifest({})).toBeNull();
    expect(parseRunManifest({ schema_version: 0, run_id: "x", mode: "classic" })).toBeNull();
    expect(parseRunManifest({ schema_version: 1, run_id: "", mode: "classic" })).toBeNull();
  });

  it("tolerates partial/older manifests by defaulting collections", () => {
    const parsed = parseRunManifest({ schema_version: 1, run_id: "old", mode: "classic" });
    expect(parsed).not.toBeNull();
    expect(parsed!.slides).toEqual([]);
    expect(parsed!.question_ids).toEqual([]);
    expect(parsed!.difficulty_overrides).toEqual({});
    expect(parsed!.platform).toBe("generic");
    expect(parsed!.completed).toBe(false);
    expect(parsed!.generator.version).toBe("unknown");
  });

  it("drops malformed slide entries instead of crashing", () => {
    const parsed = parseRunManifest({
      schema_version: 1,
      run_id: "r",
      mode: "classic",
      slides: [{ file: "a/b.png", slide_kind: "quiz" }, { nope: true }, null, "x"],
    });
    expect(parsed!.slides.length).toBe(1);
    expect(parsed!.capture_count).toBe(1);
  });
});

describe("CON1 Step 1D — the presentation override is auditable from the manifest", () => {
  it("records the override when a run enabled it", () => {
    const m = buildRunManifest({ ...fullArgs, allow_incomplete_presentation: true });
    expect(m.allow_incomplete_presentation).toBe(true);
    expect(JSON.parse(JSON.stringify(m)).allow_incomplete_presentation).toBe(true);
  });

  it("round-trips through parse, so a reader never has to infer it", () => {
    const raw = JSON.parse(
      JSON.stringify(buildRunManifest({ ...fullArgs, allow_incomplete_presentation: true })),
    );
    expect(parseRunManifest(raw)?.allow_incomplete_presentation).toBe(true);
  });

  it("reads false for a manifest written before the flag existed", () => {
    const raw = JSON.parse(JSON.stringify(buildRunManifest({ ...fullArgs })));
    delete raw.allow_incomplete_presentation;
    expect(parseRunManifest(raw)?.allow_incomplete_presentation).toBe(false);
  });
});

// CON1 Step 1E — the asset override is recorded SEPARATELY, so a manifest says
// WHICH class of completeness was waived rather than just "something was".
describe("CON1 Step 1E — the asset override is auditable from the manifest", () => {
  it("round-trips allow_missing_assets independently of the presentation flag", () => {
    const m = buildRunManifest({ ...fullArgs, allow_missing_assets: true });
    expect(m.allow_missing_assets).toBe(true);
    expect(m.allow_incomplete_presentation).toBe(false);
    const raw = JSON.parse(JSON.stringify(m));
    expect(parseRunManifest(raw)?.allow_missing_assets).toBe(true);
    expect(parseRunManifest(raw)?.allow_incomplete_presentation).toBe(false);
  });

  it("treats a manifest predating the asset override as not overridden", () => {
    const raw = JSON.parse(JSON.stringify(buildRunManifest(fullArgs)));
    delete raw.allow_missing_assets;
    expect(parseRunManifest(raw)?.allow_missing_assets).toBe(false);
  });
});

/**
 * CON1 Step 3B — a run manifest must not lose a GENERATED source's identity.
 *
 * A stored id names a durable row anyone can re-read. `mastery:ssm.base.FLASH`
 * names a record a code enumerator materializes, and that curriculum moves
 * with the game — so an image recorded only as "question 0" would be
 * unattributable one patch later.
 */
describe("source provenance", () => {
  it("records a stored question as stored, inventing nothing", () => {
    expect(manifestSourceEntry({ id: 41 })).toEqual({
      id: 41,
      review_key: null,
      source_kind: "stored_question",
      materialization: "stored",
      family: null,
      source_version: null,
      specimen_version: null,
      data_version: null,
      framing: null,
    });
  });

  it("carries a generated source's review key, kind, family and version", () => {
    expect(
      manifestSourceEntry({
        id: "mastery:ssm.base.BARRIER",
        review_key: "mastery:ssm.base.BARRIER",
        source_kind: "mastery_question",
        provenance: {
          review_key: "mastery:ssm.base.BARRIER",
          source_kind: "mastery_question",
          materialization: "code_generated",
          family: "mastery",
          source_version: "mset_bbb59f3c",
          specimen_version: "ssm.slice.barrier",
        },
      }),
    ).toEqual({
      id: "mastery:ssm.base.BARRIER",
      review_key: "mastery:ssm.base.BARRIER",
      source_kind: "mastery_question",
      materialization: "code_generated",
      family: "mastery",
      source_version: "mset_bbb59f3c",
      specimen_version: "ssm.slice.barrier",
      data_version: null,
      framing: null,
    });
  });

  it("round-trips through parse, and an older manifest parses as no sources", () => {
    const manifest = buildRunManifest({
      ...fullArgs,
      sources: [manifestSourceEntry({ id: 41 })],
    });
    expect(parseRunManifest(JSON.parse(JSON.stringify(manifest)))!.sources).toEqual(
      manifest.sources,
    );
    const legacy = { ...JSON.parse(JSON.stringify(manifest)) };
    delete legacy.sources;
    expect(parseRunManifest(legacy)!.sources).toEqual([]);
  });
});
