/**
 * W26Q — Worlds 2026 Quiz report attribution, end to end.
 *
 * Owner decision (2026-10-20): Worlds 2026 Quiz reports file under mode
 * "Worlds 2026 Quiz", category "Leaguecraft". This walks the whole path with
 * the real components and the real feedback code, mocking only the FB1 insert
 * (`./client`), exactly as `submitReport.test.ts` does:
 *
 *   displayed session (the Worlds page, a real captured backend session)
 *     → the snapshot the CanonicalArena publishes to the report slot
 *     → `submitQuestionReport` → the FB1 `submitFeedback` payload
 *       (`category` column + `report_context.mode`, title and body)
 *     → the Admin presentation (`reportOrigin`).
 *
 * No schema, column or CHECK value is new: "Leaguecraft" is the category the
 * Pro Play Quiz already files under, and `mode` is free text in the jsonb.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SubmitArgs = [Record<string, unknown>];

const client = vi.hoisted(() => ({
  submitFeedback: vi.fn(async (..._args: unknown[]) => "row-1"),
  getMyProfileId: vi.fn(async (_userId: string) => "profile-1" as string | null),
  FeedbackRateLimitError: class extends Error {},
}));
vi.mock("./client", () => client);

import Worlds2026Quiz from "@/pages/Worlds2026Quiz";
import ProPlayQuiz from "@/pages/ProPlayQuiz";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReportableQuestionProvider, useReportableQuestion } from "./reportable-question";
import type { ReportableQuestionSnapshot } from "./report-context";
import { submitQuestionReport } from "./submitReport";
import { reportOrigin } from "./adminReportView";
import captured from "@/lib/pro-play/__fixtures__/worlds2026PresetSession.json";
import { PRO_PLAY_WORLDS_QUIZ_ROUTE } from "@/lib/pro-play/routes";

type Json = Record<string, unknown>;
const START = captured.start as Json;

let published: Array<ReportableQuestionSnapshot | null> = [];
function Sink() {
  published.push(useReportableQuestion());
  return null;
}

function serve(body: Json) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response));
}

const mount = (page: JSX.Element, path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <ReportableQuestionProvider>
          <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
          <Sink />
        </ReportableQuestionProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );

async function publishedSnapshot(): Promise<ReportableQuestionSnapshot> {
  await screen.findByText((START.question as Json).question_text as string);
  const last = [...published].reverse().find((s) => s !== null);
  expect(last).toBeTruthy();
  return last!;
}

const payload = () => (client.submitFeedback.mock.calls as unknown as SubmitArgs[])[0][0];

beforeEach(() => {
  published = [];
  client.submitFeedback.mockClear();
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Worlds 2026 Quiz report attribution (owner decision 3)", () => {
  it("displayed session → published snapshot → FB1 payload → Admin label", async () => {
    serve(START);
    mount(<Worlds2026Quiz />, PRO_PLAY_WORLDS_QUIZ_ROUTE);

    // 2. The snapshot the arena publishes to the one report slot.
    const snap = await publishedSnapshot();
    // 1. What the player sees names the mode.
    expect(screen.getByTestId("ranked-header").textContent).toContain("Worlds 2026 Quiz");
    expect(snap.mode).toBe("Worlds 2026 Quiz");
    expect(snap.category).toBe("Leaguecraft");
    expect(snap.runtimeQuestionId).toBe((START.question as Json).question_id);
    // Answer-safe before grading, unchanged by the mode label.
    expect(snap.canonicalAnswer ?? null).toBeNull();

    // 3. The FB1 insert payload: same single write path, Leaguecraft column,
    //    the Worlds mode in the jsonb, the title and the body.
    await submitQuestionReport({
      userId: "user-1", reason: "incorrect_answer", comment: "",
      route: PRO_PLAY_WORLDS_QUIZ_ROUTE, snapshot: snap,
    });
    expect(client.submitFeedback).toHaveBeenCalledTimes(1);
    const p = payload();
    expect(p.entryIntent).toBe("question_report");
    expect(p.category).toBe("Leaguecraft");
    const ctx = p.reportContext as Json;
    expect(ctx.mode).toBe("Worlds 2026 Quiz");
    expect(ctx.route).toBe(PRO_PLAY_WORLDS_QUIZ_ROUTE);
    expect(ctx.runtime_question_id).toBe((START.question as Json).question_id);
    expect(String(p.body)).toContain("Worlds 2026 Quiz");

    // 4. The Admin presentation of that stored row.
    const origin = reportOrigin({
      entry_intent: "question_report", category: p.category as string,
      page_url: p.pageUrl as string, report_context: ctx,
    });
    expect(origin.kind).toBe("question");
    expect(origin.label).toMatch(/^Question Report · .+ · Worlds 2026 Quiz$/);
  });

  it("the general Pro Play Quiz still files exactly as before", async () => {
    serve({ ...START, session: { session_id: "g1", total: 10, answered: 0, score: 0, complete: false } });
    mount(<ProPlayQuiz />, "/lol/pro-play/quiz");
    const snap = await publishedSnapshot();
    expect(snap.mode).toBe("Pro Play Quiz");
    expect(snap.category).toBe("Leaguecraft");
    await submitQuestionReport({ userId: "u", reason: "incorrect_answer", comment: "", route: "/lol/pro-play/quiz", snapshot: snap });
    const p = payload();
    expect(p.category).toBe("Leaguecraft");
    expect((p.reportContext as Json).mode).toBe("Pro Play Quiz");
    expect(reportOrigin({ entry_intent: "question_report", category: "Leaguecraft", report_context: p.reportContext }).label)
      .toMatch(/· Pro Play Quiz$/);
  });
});
