/**
 * FB1-4 — the capture contract.
 *
 * These are the assertions that matter most, because every one of them
 * protects something a reviewer cannot see by reading the UI: which reason
 * token reaches the database, what happens to a mode that has no database
 * question row, and what is dropped when a snapshot is too big to store.
 */
import { describe, expect, it } from "vitest";

import { FEEDBACK_LIMITS } from "./contract";
import {
  QUESTION_REPORT_REASONS,
  QUESTION_REPORT_REASON_LABELS,
  buildPageReportContext,
  buildQuestionReportContext,
  capturePageQuery,
  categoryForReport,
  isQuestionReportReason,
  pageReportTitle,
  questionReportReasonLabel,
  questionReportTitle,
  reportBody,
  serializeReportContext,
  type ReportableQuestionSnapshot,
} from "./report-context";

const RANKED: ReportableQuestionSnapshot = {
  category: "Ranked",
  mode: "Ranked",
  runtimeQuestionId: "q-77",
  prompt: "Which item gives the most armor?",
  choices: ["Thornmail", "Warmog's", "Bloodthirster"],
  matchId: "match-1",
  roundNumber: 3,
  moduleType: "quiz.v1",
};

describe("report reasons", () => {
  it("offers exactly the four the product specifies, in order", () => {
    expect([...QUESTION_REPORT_REASONS]).toEqual([
      "doesnt_make_sense",
      "incorrect_answer",
      "typo",
      "other",
    ]);
  });

  it("maps every reason to a distinct human label", () => {
    const labels = QUESTION_REPORT_REASONS.map(r => QUESTION_REPORT_REASON_LABELS[r]);
    expect(labels).toEqual([
      "Doesn't make sense",
      "Incorrect answer",
      "Typo",
      "Other",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("stores the token, not the label — so wording can change without a migration", () => {
    const ctx = buildQuestionReportContext({
      snapshot: RANKED,
      reason: "incorrect_answer",
      route: "/quiz/ranked",
    });
    expect(ctx.reason).toBe("incorrect_answer");
    expect(JSON.stringify(ctx)).not.toContain("Incorrect answer");
  });

  it("renders an unknown reason as itself rather than dropping it", () => {
    expect(questionReportReasonLabel("some_future_reason")).toBe("some_future_reason");
    expect(questionReportReasonLabel(undefined)).toBe("Unspecified");
    expect(isQuestionReportReason("typo")).toBe(true);
    expect(isQuestionReportReason("nope")).toBe(false);
  });
});

describe("question identity serialization", () => {
  it("captures a RUNTIME question that has a question_key but no database id", () => {
    const ctx = buildQuestionReportContext({
      snapshot: {
        category: "Leaguecraft",
        mode: "Practice",
        questionKey: "item_exact_stat:armor:highest",
        prompt: "Which item gives the most armor?",
        choices: ["Thornmail", "Warmog's"],
      },
      reason: "typo",
      route: "/quiz",
    });
    expect(ctx.question_key).toBe("item_exact_stat:armor:highest");
    // Absent, not null: the mode had no static row, and the stored object must
    // not imply one was looked for and missing.
    expect("static_question_id" in ctx).toBe(false);
  });

  it("captures a STATIC question's database id alongside its key", () => {
    const ctx = buildQuestionReportContext({
      snapshot: {
        category: "Leaguecraft",
        mode: "Practice",
        questionKey: "ability_cooldown_haste:aatrox:e:r5",
        staticQuestionId: 4821,
        prompt: "p",
      },
      reason: "other",
      route: "/quiz",
    });
    expect(ctx.question_key).toBe("ability_cooldown_haste:aatrox:e:r5");
    // Stringified, because the column is jsonb and the modes disagree about
    // whether their id is a number or a string.
    expect(ctx.static_question_id).toBe("4821");
  });

  it("captures a mode with NEITHER key nor id, keyed on session and step", () => {
    const ctx = buildQuestionReportContext({
      snapshot: {
        category: "Mastery",
        mode: "Mastery",
        runtimeQuestionId: "set-9#2",
        sessionId: "sess-abc",
        roundNumber: 2,
        questionType: "post_mitigation_damage",
        prompt: "How much damage?",
      },
      reason: "incorrect_answer",
      route: "/quiz/mastery/set-9",
    });
    expect("question_key" in ctx).toBe(false);
    expect("static_question_id" in ctx).toBe(false);
    expect(ctx.session_id).toBe("sess-abc");
    expect(ctx.round_number).toBe(2);
    expect(ctx.runtime_question_id).toBe("set-9#2");
  });

  it("keeps round 0 and drops NaN", () => {
    const zero = buildQuestionReportContext({
      snapshot: { ...RANKED, roundNumber: 0 },
      reason: "other",
      route: "/quiz/ranked",
    });
    expect(zero.round_number).toBe(0);

    const nan = buildQuestionReportContext({
      snapshot: { ...RANKED, roundNumber: Number.NaN },
      reason: "other",
      route: "/quiz/ranked",
    });
    expect("round_number" in nan).toBe(false);
  });

  it("captures the snapshot of what was rendered, not a pointer", () => {
    const ctx = buildQuestionReportContext({
      snapshot: RANKED,
      reason: "doesnt_make_sense",
      route: "/quiz/ranked",
    });
    expect(ctx.prompt).toBe("Which item gives the most armor?");
    expect(ctx.choices).toEqual(["Thornmail", "Warmog's", "Bloodthirster"]);
    expect(ctx.match_id).toBe("match-1");
    expect(ctx.module_type).toBe("quiz.v1");
    expect(ctx.route).toBe("/quiz/ranked");
    expect(Date.parse(ctx.captured_at)).not.toBeNaN();
  });

  it("omits an answer the mode did not supply", () => {
    const ctx = buildQuestionReportContext({
      snapshot: RANKED,
      reason: "incorrect_answer",
      route: "/quiz/ranked",
    });
    expect("canonical_answer" in ctx).toBe(false);
    expect("selected_answer" in ctx).toBe(false);
  });

  it("strips the query string out of the captured route", () => {
    const ctx = buildQuestionReportContext({
      snapshot: RANKED,
      reason: "other",
      route: "/quiz/stat-check/room?invite=SECRET#top",
    });
    expect(ctx.route).toBe("/quiz/stat-check/room");
  });
});

describe("size budget", () => {
  it("stores a normal snapshot verbatim", () => {
    const ctx = buildQuestionReportContext({
      snapshot: RANKED, reason: "typo", route: "/quiz/ranked",
    });
    expect(serializeReportContext(ctx)).toEqual(ctx);
  });

  it("drops the unbounded fields rather than failing to send", () => {
    const huge = buildQuestionReportContext({
      snapshot: {
        ...RANKED,
        prompt: "x".repeat(1900),
        choices: Array.from({ length: 12 }, () => "y".repeat(290)),
      },
      reason: "typo",
      route: "/quiz/ranked",
    });
    // Force the reducer by asserting on a context already at its per-field
    // caps plus a hostile extra: the builder truncates fields, the serializer
    // is the backstop for the whole object.
    const stuffed = { ...huge, prompt: "z".repeat(FEEDBACK_LIMITS.reportContextJson) };
    const out = serializeReportContext(stuffed as typeof huge);
    expect(out.truncated).toBe(true);
    expect("prompt" in out).toBe(false);
    expect("choices" in out).toBe(false);
    // Identity survives — the part that makes the report actionable at all.
    expect(out.match_id).toBe("match-1");
    expect(out.reason).toBe("typo");
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(
      FEEDBACK_LIMITS.reportContextJson,
    );
  });

  it("truncates individual fields at their own caps", () => {
    const ctx = buildQuestionReportContext({
      snapshot: { ...RANKED, prompt: "p".repeat(5000) },
      reason: "typo",
      route: "/quiz/ranked",
    });
    expect(ctx.prompt!.length).toBe(2000);
  });
});

describe("page reports", () => {
  it("captures the route", () => {
    const ctx = buildPageReportContext({ route: "/lol/pro-play/live" });
    expect(ctx.kind).toBe("page_report");
    expect(ctx.route).toBe("/lol/pro-play/live");
    expect(Date.parse(ctx.captured_at)).not.toBeNaN();
  });

  it("keeps only allow-listed query parameters", () => {
    const query = capturePageQuery("?category=items&invite=SECRET&session_token=abc&tab=stats");
    expect(query).toEqual({ category: "items", tab: "stats" });
  });

  it("retains no query bag when nothing is allow-listed", () => {
    expect(capturePageQuery("?invite=SECRET")).toBeUndefined();
    expect(capturePageQuery("")).toBeUndefined();
  });

  it("never lets a credential-bearing parameter through the builder", () => {
    const ctx = buildPageReportContext({
      route: "/quiz/stat-check/room",
      search: "?inviteCode=JOINME&roomKey=xyz",
    });
    expect(JSON.stringify(ctx)).not.toContain("JOINME");
    expect(JSON.stringify(ctx)).not.toContain("xyz");
  });
});

describe("titles, bodies and filing", () => {
  it("titles a question report with its reason and mode", () => {
    expect(questionReportTitle("incorrect_answer", "Ranked"))
      .toBe("Incorrect answer — Ranked");
  });

  it("titles a page report with its route", () => {
    expect(pageReportTitle("/lol/pro-play/live?x=1"))
      .toBe("Page issue — /lol/pro-play/live");
  });

  it("falls back rather than sending an empty body", () => {
    expect(reportBody("   ", "fallback")).toBe("fallback");
    expect(reportBody("the second option is also right", "fallback"))
      .toBe("the second option is also right");
  });

  it("caps the comment at the contract's limit", () => {
    expect(reportBody("c".repeat(5000), "f").length).toBe(FEEDBACK_LIMITS.reportComment);
  });

  it("files under the mode's area, or the route's when there is no mode", () => {
    expect(categoryForReport({ category: "Mastery" }, "/quiz/ranked")).toBe("Mastery");
    expect(categoryForReport(null, "/quiz/ranked")).toBe("Ranked");
    expect(categoryForReport(null, "/lol/premium")).toBe("General");
  });
});
