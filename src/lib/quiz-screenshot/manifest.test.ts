import { describe, expect, it } from "vitest";
import { buildRunManifest, parseRunManifest, RUN_MANIFEST_VERSION } from "./manifest";

const fullArgs = {
  run_id: "r1",
  created_at: "2026-07-15T00:00:00.000Z",
  mode: "multi-question" as const,
  package_type: "post-3-multi-question",
  package_prefix: "daily-x",
  formats: ["mobile-social"],
  question_ids: ["1", "2"],
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
