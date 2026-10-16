/**
 * PGM2 — Perfect Timing on its public page: the PT4.4 page on the PUBLIC run,
 * with the way back to More Challenges, a report per round (the cooldown only
 * after the reveal), and player-facing deal errors.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/perfect-timing/__fixtures__/captureV1.json";

vi.mock("@/lib/backend-auth", () => ({ getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer player" })) }));
vi.mock("@/lib/ranked-public/client", () => ({ RANKED_API_BASE: "http://api.test" }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => {}, stop: () => {}, preload: () => {} }) }));
vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...real, championAssetsQuery: { ...real.championAssetsQuery, queryFn: async () => ({ champions: {} }) } };
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportableQuestionProvider, useReportableQuestion } from "@/lib/feedback/reportable-question";
import { bonusTimingApi } from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import PerfectTimingGame, { timingDealErrorText } from "./PerfectTimingGame";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function ReportProbe() {
  return <pre data-testid="report-probe">{JSON.stringify(useReportableQuestion())}</pre>;
}

function mount(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const api = bonusTimingApi({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/quiz/more-challenges/perfect_timing"]}>
        <ReportableQuestionProvider>
          <PerfectTimingGame entry={{ id: "perfect_timing", title: "Perfect Timing", reportId: "perfect_timing" } as PublicModeEntry} api={api} />
          <ReportProbe />
        </ReportableQuestionProvider>
      </MemoryRouter>
    </QueryClientProvider>);
}

afterEach(() => { vi.clearAllMocks(); });

describe("PGM2 — Perfect Timing (public)", () => {
  it("deals the public run, leads back to More Challenges and reports the round without its answer", async () => {
    const deal = JSON.parse(JSON.stringify(capture.deal.response)) as Json;
    for (const r of deal.rounds) r.expires_at = new Date(Date.now() + 600_000).toISOString();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/perfect_timing/sessions") ? reply({ ...deal, session_id: "run1" }) : reply({}, 404));
    mount(fetchImpl);
    await waitFor(() => expect(screen.getByTestId("bonus-game-back").getAttribute("href")).toBe("/quiz/more-challenges"));
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://api.test/api/game-modes/perfect_timing/sessions");
    await waitFor(() => {
      const snap = JSON.parse(screen.getByTestId("report-probe").textContent || "null");
      expect(snap).toMatchObject({ gameModeId: "perfect_timing", mode: "Perfect Timing", canonicalAnswer: null });
      expect(snap.prompt).toContain(deal.rounds[0].ability_name);
    });
    expect(document.body.textContent).not.toMatch(/PERFECT_TIMING_LAB_ENABLED|owner session|Playtests/);
  });

  it("words a failed deal for players, never as a flag or an owner session", () => {
    for (const status of [null, 401, 403, 404, 429, 503]) {
      expect(timingDealErrorText(status, "x")).not.toMatch(/ENABLED|owner|admin|backend/i);
    }
    expect(timingDealErrorText(503, "x")).toBe("Perfect Timing can't be played right now. Please try again later.");
  });
});
