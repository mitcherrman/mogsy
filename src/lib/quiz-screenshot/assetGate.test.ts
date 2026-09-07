/**
 * CON1 Step 1E — the Content Factory asset gate.
 *
 * The gate must fail a capture when a question genuinely REQUIRES a visual
 * asset that the backend's canonical resolver could not resolve, and must not
 * fail anything else. Every fixture below is the shape
 * `quiz.asset_health.compute_asset_status` really returns for that row kind
 * (see presentationFixtures.ts), so these assertions measure the contract
 * rather than a convenient invention.
 */

import { describe, expect, it } from "vitest";

import {
  DEGRADED_ASSET_CODE,
  MISSING_REQUIRED_ASSET_CODE,
  evaluateAssetGate,
} from "./assetGate";
import {
  ASSET_CASE_REPAIRED,
  ASSET_NOT_REQUIRED,
  ASSET_OPTIONAL_UNRESOLVED,
  ASSET_REQUIRED_RESOLVED,
  ASSET_REQUIRED_UNRESOLVED,
  ASSET_UNKNOWN,
  ASSET_WITHHELD,
} from "./presentationFixtures";
import {
  INCOMPLETE_PRESENTATION_CODE,
  evaluatePresentationGate,
} from "./presentationGate";
import type { AssetStatus } from "../quiz/assetStatus";

const run = (assetStatus: unknown, allowMissingAssets = false) =>
  evaluateAssetGate({
    assetStatus: assetStatus as AssetStatus | undefined,
    questionId: 42,
    questionKey: "ability_recognition:Aatrox:Q",
    format: "mobile-social",
    state: "question",
    allowMissingAssets,
  });

const failures = (r: ReturnType<typeof run>) =>
  r.findings.filter((f) => f.severity === "failure");
const warnings = (r: ReturnType<typeof run>) =>
  r.findings.filter((f) => f.severity === "warning");

describe("the default publishing rule", () => {
  it("passes a question that requires no asset", () => {
    const result = run(ASSET_NOT_REQUIRED);
    expect(result.failed).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("passes a required asset that resolves", () => {
    const result = run(ASSET_REQUIRED_RESOLVED);
    expect(result.failed).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("FAILS a required asset that does not resolve", () => {
    const result = run(ASSET_REQUIRED_UNRESOLVED);
    expect(result.failed).toBe(true);
    expect(failures(result)).toHaveLength(1);
    expect(failures(result)[0].code).toBe(MISSING_REQUIRED_ASSET_CODE);
  });
});

describe("what must NOT be treated as a failure", () => {
  it("does not fail an unresolved OPTIONAL asset — production degrades to text", () => {
    const result = run(ASSET_OPTIONAL_UNRESOLVED);
    expect(result.failed).toBe(false);
    expect(failures(result)).toEqual([]);
    // reported, though: it is a real degradation an operator should see
    expect(warnings(result)[0].code).toBe(DEGRADED_ASSET_CODE);
    expect(warnings(result)[0].message).toContain("assets/items/9999.png");
  });

  it("does not fail artwork production deliberately withholds", () => {
    const result = run(ASSET_WITHHELD);
    expect(result.failed).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("does not fail a path that only needed case repair, but says so", () => {
    const result = run(ASSET_CASE_REPAIRED);
    expect(result.failed).toBe(false);
    expect(failures(result)).toEqual([]);
    expect(warnings(result)[0].message).toContain("404s on a case-sensitive filesystem");
  });

  it("does not judge a checkout with no asset tree", () => {
    const result = run(ASSET_UNKNOWN);
    expect(result.failed).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("does not judge a source that carried no asset_status at all", () => {
    // A hand-written fixture or an older JSON dump. Absence of the signal is
    // absence of evidence — inventing a failure from it would fail every
    // fixture-driven run.
    for (const value of [undefined, null, {}, { status: 7 }]) {
      expect(run(value).findings).toEqual([]);
      expect(run(value).failed).toBe(false);
    }
  });
});

describe("Minion XP and Pro Play must not be falsely asset-incomplete", () => {
  it("passes Minion XP: geometric glyphs, so no minion art is required", () => {
    const result = evaluateAssetGate({
      assetStatus: ASSET_NOT_REQUIRED as unknown as AssetStatus,
      questionId: "minion-exact",
      questionKey: "minion_xp_level_breakpoint:exact_minion:solo:l4:w4",
      format: "mobile-social",
      state: "question",
      allowMissingAssets: false,
    });
    expect(result.failed).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("passes Pro Play: no portrait contract exists today, so none is required", () => {
    const result = evaluateAssetGate({
      assetStatus: ASSET_NOT_REQUIRED as unknown as AssetStatus,
      questionId: 900,
      questionKey: "pro_champion_scope_comparison:kda:faker",
      format: "mobile-social",
      state: "question",
      allowMissingAssets: false,
    });
    expect(result.failed).toBe(false);
  });
});

describe("the failure report", () => {
  const result = run(ASSET_REQUIRED_UNRESOLVED);
  const message = failures(result)[0].message;

  it("names the question id and key", () => {
    expect(message).toContain("question 42");
    expect(message).toContain("ability_recognition:Aatrox:Q");
  });

  it("names the unresolved channel and path", () => {
    expect(message).toContain("image_path=assets/champions/NoSuchChampion/icon.png");
  });

  it("names the format, the render state and the backend's reason", () => {
    expect(message).toContain("format=mobile-social");
    expect(message).toContain("state=question");
    expect(message).toContain("does not resolve to a file on disk");
    expect(failures(result)[0].format).toBe("mobile-social");
    expect(failures(result)[0].state).toBe("question");
  });

  it("names the override that would capture it anyway", () => {
    expect(message).toContain("--allow-missing-assets");
  });

  it("falls back to the id alone when the row carried no key", () => {
    const anonymous = evaluateAssetGate({
      assetStatus: ASSET_REQUIRED_UNRESOLVED as unknown as AssetStatus,
      questionId: 7,
      questionKey: null,
      format: "square",
      state: "reveal",
      allowMissingAssets: false,
    });
    expect(failures(anonymous)[0].message).toContain("question 7:");
  });
});

describe("the --allow-missing-assets override", () => {
  it("downgrades the failure to a warning and does not fail the capture", () => {
    const result = run(ASSET_REQUIRED_UNRESOLVED, true);
    expect(result.failed).toBe(false);
    expect(result.overridden).toBe(true);
    expect(failures(result)).toEqual([]);
    const finding = warnings(result).find((f) => f.code === MISSING_REQUIRED_ASSET_CODE);
    expect(finding?.message).toContain("not a publishable capture");
  });

  it("is inert when there was nothing to override", () => {
    const result = run(ASSET_REQUIRED_RESOLVED, true);
    expect(result.overridden).toBe(false);
    expect(result.findings).toEqual([]);
  });
});

describe("the two completeness gates are independent", () => {
  // Step 1D's gate answers "did the layout DRAW the premise?"; this one answers
  // "is the FILE on disk?". Neither can mask the other, and neither override
  // touches the other's verdict.
  const presentation = (allowIncomplete: boolean) =>
    evaluatePresentationGate({
      status: "text-only",
      band: "compact",
      reason: "the layout authority drew no scenario for it",
      questionId: 42,
      questionKey: "ability_recognition:Aatrox:Q",
      format: "mobile-social",
      state: "question",
      allowIncomplete,
    });

  it("an unresolved asset does not change the presentation verdict", () => {
    expect(presentation(false).failed).toBe(true);
    expect(run(ASSET_REQUIRED_UNRESOLVED).failed).toBe(true);
    // and the two findings are distinguishable by code
    expect(presentation(false).findings[0].code).toBe(INCOMPLETE_PRESENTATION_CODE);
    expect(failures(run(ASSET_REQUIRED_UNRESOLVED))[0].code)
      .toBe(MISSING_REQUIRED_ASSET_CODE);
  });

  it("the presentation override does NOT waive an unresolved asset", () => {
    // The whole reason --allow-missing-assets is a second flag.
    expect(presentation(true).failed).toBe(false);
    expect(run(ASSET_REQUIRED_UNRESOLVED, false).failed).toBe(true);
  });

  it("the asset override does NOT waive an undrawn presentation", () => {
    expect(run(ASSET_REQUIRED_UNRESOLVED, true).failed).toBe(false);
    expect(presentation(false).failed).toBe(true);
  });

  it("a complete presentation does not excuse a missing required asset", () => {
    const drawn = evaluatePresentationGate({
      status: "family", band: "family", questionId: 42, format: "mobile-social",
      state: "question", allowIncomplete: false,
    });
    expect(drawn.failed).toBe(false);
    expect(run(ASSET_REQUIRED_UNRESOLVED).failed).toBe(true);
  });
});
