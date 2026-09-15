/**
 * FB1-4 — the admin surface can tell the three origins apart, and the
 * submitter/admin boundary survived being widened.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { capturedFields, diagnosticFields, reportOrigin } from "./adminReportView";
import { FEEDBACK_ADMIN_ONLY_FIELDS } from "./contract";

const QUESTION_ROW = {
  entry_intent: "question_report",
  category: "Ranked",
  page_url: "/quiz/ranked",
  report_context: {
    kind: "question_report",
    v: 1,
    reason: "incorrect_answer",
    mode: "Ranked",
    route: "/quiz/ranked",
    captured_at: "2026-09-13T10:00:00.000Z",
    prompt: "Which item gives the most armor?",
    choices: ["Thornmail", "Warmog's"],
    canonical_answer: "Thornmail",
    selected_answer: "Warmog's",
    runtime_question_id: "q-77",
    match_id: "match-1",
    round_number: 3,
    module_type: "quiz.v1",
  },
};

const PAGE_ROW = {
  entry_intent: "page_report",
  category: "General",
  page_url: "/lol/pro-play/live",
  report_context: {
    kind: "page_report",
    v: 1,
    route: "/lol/pro-play/live",
    captured_at: "2026-09-13T10:00:00.000Z",
    query: { tab: "stats" },
  },
};

const CENTER_ROW = {
  entry_intent: "bug",
  category: "Combat Lab",
  page_url: "/combat-lab",
  report_context: {},
};

describe("AdminFeedback can distinguish report types", () => {
  it("labels a question report with reason and mode", () => {
    const origin = reportOrigin(QUESTION_ROW);
    expect(origin.kind).toBe("question");
    expect(origin.label).toBe("Question Report · Incorrect answer · Ranked");
  });

  it("labels a question report from another mode", () => {
    const origin = reportOrigin({
      ...QUESTION_ROW,
      category: "Mastery",
      report_context: { ...QUESTION_ROW.report_context, reason: "typo", mode: "Mastery" },
    });
    expect(origin.label).toBe("Question Report · Typo · Mastery");
  });

  it("labels a page report with its route", () => {
    const origin = reportOrigin(PAGE_ROW);
    expect(origin.kind).toBe("page");
    expect(origin.label).toBe("Page Issue · /lol/pro-play/live");
  });

  it("leaves a Feedback Center submission as its own door", () => {
    const origin = reportOrigin(CENTER_ROW);
    expect(origin.kind).toBe("center");
    expect(origin.label).toBe("Report a Bug");
  });

  it("believes entry_intent over a report_context that disagrees", () => {
    // The column is CHECK-constrained and server-visible; the jsonb is
    // client-written. A row whose context claims to be something else is a
    // client bug or an attempt, and neither should change how it is filed.
    const origin = reportOrigin({
      entry_intent: "page_report",
      report_context: { kind: "question_report", reason: "typo", mode: "Ranked" },
      page_url: "/lol",
    });
    expect(origin.kind).toBe("page");
  });

  it("survives a legacy row with no report_context at all", () => {
    expect(reportOrigin({ entry_intent: "other" }).kind).toBe("center");
    expect(reportOrigin({}).label).toBe("Feedback");
    expect(capturedFields({})).toEqual([]);
  });

  it("renders an entry intent added after this build as itself", () => {
    expect(reportOrigin({ entry_intent: "future_door" }).label).toBe("future_door");
  });
});

describe("captured context is exposed field by field", () => {
  it("shows the owner what the player saw, in reading order", () => {
    const fields = capturedFields(QUESTION_ROW);
    const keys = fields.map(f => f.key);
    expect(keys.slice(0, 4)).toEqual([
      "prompt", "choices", "canonical_answer", "selected_answer",
    ]);
    expect(fields.find(f => f.key === "choices")?.value).toBe("Thornmail\nWarmog's");
    expect(fields.find(f => f.key === "canonical_answer")?.value).toBe("Thornmail");
    expect(fields.find(f => f.key === "selected_answer")?.value).toBe("Warmog's");
    expect(fields.find(f => f.key === "match_id")?.value).toBe("match-1");
    expect(fields.find(f => f.key === "round_number")?.value).toBe("3");
  });

  it("omits a field the mode never captured rather than showing a blank", () => {
    const fields = capturedFields({
      entry_intent: "question_report",
      report_context: { reason: "typo", mode: "Mastery", prompt: "p" },
    });
    expect(fields.map(f => f.key)).not.toContain("question_key");
    expect(fields.map(f => f.key)).not.toContain("static_question_id");
  });

  it("flattens a page report's allow-listed query", () => {
    const fields = capturedFields(PAGE_ROW);
    expect(fields.find(f => f.key === "route")?.value).toBe("/lol/pro-play/live");
    expect(fields.find(f => f.key === "query.tab")?.value).toBe("stats");
  });

  it("says so when a snapshot was reduced to fit", () => {
    const fields = capturedFields({
      entry_intent: "question_report",
      report_context: { reason: "typo", mode: "Ranked", truncated: true },
    });
    expect(fields.find(f => f.key === "truncated")?.value).toContain("size cap");
  });

  it("renders diagnostics, and nothing when there are none", () => {
    expect(diagnosticFields({ ua: "UA", viewport: "375x667", app_version: "abc" })
      .map(f => f.label)).toEqual(["Build", "Viewport", "User agent"]);
    expect(diagnosticFields(null)).toEqual([]);
    expect(diagnosticFields("not an object")).toEqual([]);
  });
});

describe("the submitter/admin boundary is unchanged", () => {
  const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql")).sort()
    .map(f => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));

  it("treats report_context as admin-only, like client_meta", () => {
    expect(FEEDBACK_ADMIN_ONLY_FIELDS).toContain("report_context");
    expect(FEEDBACK_ADMIN_ONLY_FIELDS).toContain("client_meta");
    expect(FEEDBACK_ADMIN_ONLY_FIELDS).toContain("admin_notes");
  });

  it("never adds an admin-only column to list_my_feedback()", () => {
    // The submitter read contract is a RETURNS TABLE a caller cannot widen.
    // FB1-4 must not widen it either — that is the move that cannot be undone.
    const definitions = sql
      .filter(s => s.includes("FUNCTION public.list_my_feedback()"))
      .map(s => s.slice(
        s.indexOf("FUNCTION public.list_my_feedback()"),
        s.indexOf("$$;", s.indexOf("FUNCTION public.list_my_feedback()")),
      ));
    expect(definitions.length).toBeGreaterThan(0);
    for (const definition of definitions) {
      for (const field of FEEDBACK_ADMIN_ONLY_FIELDS) {
        expect(definition, `${field} must not appear in list_my_feedback`)
          .not.toContain(field);
      }
    }
  });

  /** Source with comments removed. These files DOCUMENT the boundary at
   *  length, so a bare substring scan would fail on the prose explaining why
   *  the column is unreachable. Code is what the assertion is about. */
  function code(file: string): string {
    return readFileSync(join(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  it("no user-facing module reads an admin-only column", () => {
    // The two in-product reporters and their shared submit path WRITE
    // report_context; nothing on a user READ path may name any admin column.
    const readers = [
      "src/pages/Feedback.tsx",
      "src/components/feedback/FeedbackForm.tsx",
      "src/components/report/QuestionReportScroll.tsx",
      "src/components/report/PageReportControl.tsx",
    ];
    for (const file of readers) {
      const source = code(file);
      expect(source, `${file} must not read admin_notes`).not.toContain("admin_notes");
      expect(source, `${file} must not read duplicate_of`).not.toContain("duplicate_of");
      expect(source, `${file} must not read client_meta`).not.toContain("client_meta");
    }
  });

  it("keeps the user read path on the RPC, never a table select", () => {
    for (const file of ["src/pages/Feedback.tsx", "src/lib/feedback/submitReport.ts"]) {
      expect(code(file)).not.toMatch(/from\(\s*["']feedback["']\s*\)\s*\.select/);
    }
  });
});
