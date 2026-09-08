import { describe, expect, it } from "vitest";
import {
  buildExportPlan,
  exportActionLabel,
  exportDeliveryHint,
  isBrowserExportableFormat,
} from "./exportPlan";

const AT = new Date("2026-09-08T14:30:00Z");
const one = [{ id: "123", label: "#123" }];
const two = [
  { id: "123", label: "#123" },
  { id: "456", label: "#456" },
];

describe("buildExportPlan", () => {
  it("Case A — one question, one format, one state is one PNG", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["mobile-social"],
      states: ["question"],
      post: null,
      runId: "runA",
      now: AT,
    });
    expect(plan.errors).toEqual([]);
    expect(plan.cards).toHaveLength(1);
    expect(plan.delivery).toBe("png");
    expect(exportActionLabel(plan)).toBe("Export PNG");
    // The Content Factory's own naming, not a new convention.
    expect(plan.cards[0].zipPath).toBe("runA/question_000123/mobile-social_question.png");
    expect(plan.cards[0].flatFileName).toBe("question_000123_mobile-social_question.png");
  });

  it("Case B — one question, Question + Reveal is two cards, in that order", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["mobile-social"],
      states: ["question", "correct"],
      post: null,
      runId: "runB",
      now: AT,
    });
    expect(plan.cards.map((c) => c.state)).toEqual(["question", "correct"]);
    expect(plan.delivery).toBe("zip");
    // The count AND the container, because the button is a promise.
    expect(exportActionLabel(plan)).toBe("Export 2 PNGs as ZIP");
    expect(plan.zipFileName).toBe("runB.zip");
  });

  it("Case C — several questions is a ZIP, one folder per question", () => {
    const plan = buildExportPlan({
      selection: two,
      formats: ["mobile-social"],
      states: ["question", "correct"],
      post: null,
      runId: "runC",
      now: AT,
    });
    expect(plan.cards).toHaveLength(4);
    expect(plan.delivery).toBe("zip");
    expect(exportActionLabel(plan)).toBe("Export 4 PNGs as ZIP");
    expect(plan.cards.map((c) => c.zipPath)).toEqual([
      "runC/question_000123/mobile-social_question.png",
      "runC/question_000123/mobile-social_correct.png",
      "runC/question_000456/mobile-social_question.png",
      "runC/question_000456/mobile-social_correct.png",
    ]);
  });

  it("Case D — several formats multiply the cards and stay distinct on disk", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["mobile-social", "vertical", "square"],
      states: ["question"],
      post: null,
      runId: "runD",
      now: AT,
    });
    expect(plan.cards).toHaveLength(3);
    expect(new Set(plan.cards.map((c) => c.zipPath)).size).toBe(3);
    expect(plan.cards.map((c) => c.formatKey)).toEqual(["mobile-social", "vertical", "square"]);
  });

  it("expands a post into its own ordered slides instead of the card states", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["mobile-social"],
      // States are ignored under a post: the composition owns its slides, and
      // the CLI rejects the combination outright.
      states: ["question", "correct", "explanation"],
      post: "answer-reveal",
      runId: "runP",
      now: AT,
    });
    expect(plan.cards.map((c) => c.slide)).toEqual(["recap", "quiz", "community"]);
    expect(plan.cards.map((c) => c.zipPath)).toEqual([
      "runP/question_000123/mobile-social_slide-01_recap.png",
      "runP/question_000123/mobile-social_slide-02_answer.png",
      "runP/question_000123/mobile-social_slide-03_community.png",
    ]);
  });

  it("falls back to the CLI's own timestamp run directory when unnamed", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["square"],
      states: ["question"],
      post: null,
      now: new Date(2026, 8, 8, 14, 30, 5),
    });
    expect(plan.runDir).toBe("2026-09-08_143005");
  });

  it("rejects an audit format rather than exporting the operator's own viewport", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["mobile-social", "desktop-audit"],
      states: ["question"],
      post: null,
      now: AT,
    });
    expect(plan.cards).toEqual([]);
    expect(plan.errors.join(" ")).toContain("desktop-audit");
    expect(plan.errors.join(" ")).toContain("Developer tools");
    expect(isBrowserExportableFormat("desktop-audit")).toBe(false);
    expect(isBrowserExportableFormat("mobile-social")).toBe(true);
  });

  it("refuses an empty selection, an empty destination and an empty card set", () => {
    expect(
      buildExportPlan({ selection: [], formats: ["square"], states: ["question"], post: null, now: AT }).errors,
    ).toContain("Select at least one question.");
    expect(
      buildExportPlan({ selection: one, formats: [], states: ["question"], post: null, now: AT }).errors,
    ).toContain("Pick at least one destination.");
    expect(
      buildExportPlan({ selection: one, formats: ["square"], states: [], post: null, now: AT }).errors,
    ).toContain("Pick at least one card.");
  });

  it("surfaces an invalid run name instead of writing a path from it", () => {
    const plan = buildExportPlan({
      selection: one,
      formats: ["square"],
      states: ["question"],
      post: null,
      runId: "../escape",
      now: AT,
    });
    expect(plan.errors.join(" ")).toContain("Invalid run id");
    expect(plan.cards).toEqual([]);
  });

  it("says nothing it cannot deliver when the plan is empty", () => {
    const empty = buildExportPlan({ selection: [], formats: [], states: [], post: null, now: AT });
    expect(exportActionLabel(empty)).toBe("Export");
    expect(exportDeliveryHint(empty)).toBe("");
  });

  it("describes the single-file and archive deliveries in the operator's terms", () => {
    const single = buildExportPlan({
      selection: one, formats: ["square"], states: ["question"], post: null, runId: "r", now: AT,
    });
    expect(exportDeliveryHint(single)).toContain("question_000123_square_question.png");

    const many = buildExportPlan({
      selection: two, formats: ["square"], states: ["question"], post: null, runId: "r", now: AT,
    });
    expect(exportDeliveryHint(many)).toContain("r.zip");
  });
});
