/**
 * FB1-4 — both in-product doors go through FB1's existing insert.
 *
 * The single most important property of this feature is that it added no
 * second write path: no new table, no new RPC, no bypass of the rate limit,
 * the normalisation trigger or the admin notification. None of that is visible
 * by reading the UI, and all of it would be easy to lose in a later refactor —
 * so it is asserted here, at the seam, by mocking `submitFeedback` and looking
 * at exactly what the reporters hand it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Typed so `mock.calls[0][0]` is a payload rather than a zero-length tuple. */
type SubmitArgs = [Record<string, unknown>];

const client = vi.hoisted(() => ({
  submitFeedback: vi.fn(async (..._args: unknown[]) => "row-1"),
  getMyProfileId: vi.fn(async (_userId: string) => "profile-1" as string | null),
  FeedbackRateLimitError: class extends Error {},
}));
vi.mock("./client", () => client);

vi.mock("./diagnostics", async importOriginal => {
  const actual = await importOriginal<typeof import("./diagnostics")>();
  return {
    ...actual,
    captureClientMeta: () => ({
      ua: "TestAgent/1.0",
      viewport: "1280x800",
      app_version: "test-build",
    }),
  };
});

import { MissingProfileError, submitPageReport, submitQuestionReport } from "./submitReport";
import { ENTRY_INTENT_TO_TYPE } from "./contract";

beforeEach(() => {
  client.submitFeedback.mockClear();
  client.getMyProfileId.mockClear();
  client.getMyProfileId.mockResolvedValue("profile-1");
});

const call = () =>
  (client.submitFeedback.mock.calls as unknown as SubmitArgs[])[0][0];

describe("question reports use the FB1 insert", () => {
  it("submits through submitFeedback and nothing else", async () => {
    await submitQuestionReport({
      userId: "user-1",
      reason: "incorrect_answer",
      comment: "Thornmail gives more",
      route: "/quiz/ranked",
      snapshot: {
        category: "Ranked",
        mode: "Ranked",
        runtimeQuestionId: "q-77",
        prompt: "Which item gives the most armor?",
        choices: ["Thornmail", "Warmog's"],
        matchId: "match-1",
        roundNumber: 3,
      },
    });
    expect(client.submitFeedback).toHaveBeenCalledTimes(1);
    expect(client.getMyProfileId).toHaveBeenCalledWith("user-1");
  });

  it("files under the new entry intent, which triages as a bug", async () => {
    await submitQuestionReport({
      userId: "user-1", reason: "typo", comment: "", route: "/quiz/ranked",
      snapshot: { category: "Ranked", mode: "Ranked", prompt: "p" },
    });
    expect(call().entryIntent).toBe("question_report");
    // `type` is derived server-side; the contract's map is what the UI can
    // predict, and it must agree with the migration (contract.test.ts proves
    // the map mirrors the trigger).
    expect(ENTRY_INTENT_TO_TYPE.question_report).toBe("bug");
    // Never sent: the database overwrites it, so sending it would be theatre.
    expect("type" in call()).toBe(false);
  });

  it("puts the structured snapshot in report_context, not in body", async () => {
    await submitQuestionReport({
      userId: "user-1",
      reason: "doesnt_make_sense",
      comment: "no idea what this is asking",
      route: "/quiz/mastery/set-9",
      snapshot: {
        category: "Mastery", mode: "Mastery",
        prompt: "How much post-mitigation damage?",
        choices: ["120", "240"],
        sessionId: "sess-abc",
      },
    });
    const sent = call();
    expect(sent.body).toBe("no idea what this is asking");
    // The whole point of the column: the body carries the human's words only.
    expect(sent.body).not.toContain("post-mitigation");
    const ctx = sent.reportContext as Record<string, unknown>;
    expect(ctx.kind).toBe("question_report");
    expect(ctx.reason).toBe("doesnt_make_sense");
    expect(ctx.prompt).toBe("How much post-mitigation damage?");
    expect(ctx.choices).toEqual(["120", "240"]);
    expect(ctx.session_id).toBe("sess-abc");
  });

  it("attaches FB1's own diagnostics and the route", async () => {
    await submitQuestionReport({
      userId: "user-1", reason: "other", comment: "", route: "/quiz/ranked?x=1",
      snapshot: { category: "Ranked", mode: "Ranked", prompt: "p" },
    });
    const sent = call();
    expect(sent.clientMeta).toEqual({
      ua: "TestAgent/1.0", viewport: "1280x800", app_version: "test-build",
    });
    // Path only — capturePageUrl strips the query, and the CHECK rejects it.
    expect(sent.pageUrl).toBe("/quiz/ranked");
  });

  it("files under the reporting mode's product area", async () => {
    await submitQuestionReport({
      userId: "user-1", reason: "typo", comment: "", route: "/quiz/ranked",
      snapshot: { category: "Time Trial", mode: "Time Trial", prompt: "p" },
    });
    expect(call().category).toBe("Time Trial");
  });

  it("sends with no comment at all", async () => {
    await submitQuestionReport({
      userId: "user-1", reason: "typo", comment: "   ", route: "/quiz/ranked",
      snapshot: { category: "Ranked", mode: "Ranked", prompt: "p" },
    });
    expect(call().body).toBe("Reported from Ranked with no additional comment.");
  });

  it("refuses rather than filing an unattributed row", async () => {
    client.getMyProfileId.mockResolvedValue(null);
    await expect(submitQuestionReport({
      userId: "user-1", reason: "typo", comment: "", route: "/quiz/ranked",
      snapshot: { category: "Ranked", mode: "Ranked", prompt: "p" },
    })).rejects.toBeInstanceOf(MissingProfileError);
    expect(client.submitFeedback).not.toHaveBeenCalled();
  });
});

describe("page reports use the FB1 insert", () => {
  it("captures the current route", async () => {
    await submitPageReport({
      userId: "user-1",
      comment: "the tier list renders empty",
      route: "/lol/pro-play/live",
      search: "?tab=stats&invite=SECRET",
    });
    const sent = call();
    expect(sent.entryIntent).toBe("page_report");
    expect(sent.pageUrl).toBe("/lol/pro-play/live");
    const ctx = sent.reportContext as Record<string, unknown>;
    expect(ctx.kind).toBe("page_report");
    expect(ctx.route).toBe("/lol/pro-play/live");
    expect(ctx.query).toEqual({ tab: "stats" });
    expect(JSON.stringify(ctx)).not.toContain("SECRET");
  });

  it("derives the product area from the route", async () => {
    await submitPageReport({ userId: "u", comment: "broken", route: "/quiz/mastery" });
    expect(call().category).toBe("Mastery");
  });

  it("keeps the visitor's own words as the body", async () => {
    await submitPageReport({ userId: "u", comment: "nothing loads", route: "/lol" });
    expect(call().body).toBe("nothing loads");
  });

  it("attaches diagnostics through the same FB1 capture", async () => {
    await submitPageReport({ userId: "u", comment: "x", route: "/lol" });
    expect(call().clientMeta).toEqual({
      ua: "TestAgent/1.0", viewport: "1280x800", app_version: "test-build",
    });
  });
});
