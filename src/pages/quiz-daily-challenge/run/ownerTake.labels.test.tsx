/**
 * Owner takes (Creator Replay / Daily three acts): result surfaces never imply
 * an official Daily score. Official runs keep their wording exactly.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "userA", is_anonymous: false } }) }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const sfxApi = vi.hoisted(() => ({ play: () => {}, stop: () => {}, preload: () => {} }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));

import { V5_ELIGIBLE_DAY, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { OWNER_TAKE_LABELS, OwnerTakeContext } from "@/lib/daily-challenge/run/ownerTake";
import { DailyCompletion } from "./DailyCompletion";
import { DailyMainResult } from "./DailyMainResult";

const MAIN_DONE = { main_completed_at: "2026-10-16T10:00:00Z", main_score: 31 };
const mainDone = () => fixtureV5Run(V5_ELIGIBLE_DAY, { ...MAIN_DONE, current_stage_index: 1 },
  { 0: { status: "completed", result: wireResult() } });
const finished = () => fixtureV5Run(V5_ELIGIBLE_DAY, { ...MAIN_DONE, status: "completed",
  current_stage_index: null, outcome: "reviewed" },
  Object.fromEntries(V5_ELIGIBLE_DAY.map((_, i) => [i, { status: "completed", result: wireResult() }])));

function mainResult(ownerTake: boolean) {
  const run = mainDone();
  return render(<OwnerTakeContext.Provider value={ownerTake}><MemoryRouter>
    <DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}} onProceed={() => {}} />
  </MemoryRouter></OwnerTakeContext.Provider>);
}

describe("owner-take result labels", () => {
  it("the main result says Owner take / Take score and that nothing is official", () => {
    mainResult(true);
    const result = screen.getByTestId("daily-main-result");
    expect(result).toHaveAttribute("aria-label", "Owner take result");
    expect(result.textContent).toContain(OWNER_TAKE_LABELS.headline);
    expect(result.textContent).toContain(OWNER_TAKE_LABELS.scoreLabel);
    // Outside the disclaimer itself, nothing reads as the official Daily.
    const labels = (result.textContent ?? "").replace(OWNER_TAKE_LABELS.note, "");
    expect(labels).not.toMatch(/Today's Challenge|Daily score/);
    expect(screen.getByTestId("daily-owner-take-note")).toHaveTextContent(/Not official/);
  });

  it("an official run keeps Today's Challenge and Daily score", () => {
    mainResult(false);
    const result = screen.getByTestId("daily-main-result");
    expect(result).toHaveAttribute("aria-label", "Today's Challenge result");
    expect(result.textContent).toContain("Daily score");
    expect(screen.queryByTestId("daily-owner-take-note")).toBeNull();
  });

  it("the final recap of a take is labelled as a take", () => {
    render(<OwnerTakeContext.Provider value><MemoryRouter>
      <DailyCompletion run={finished()} saveRequired={false} />
    </MemoryRouter></OwnerTakeContext.Provider>);
    expect(screen.getByTestId("daily-run-complete-title")).toHaveTextContent("Owner take complete");
    expect(screen.getByTestId("daily-run-complete-note")).toHaveTextContent(/Not official/);
    expect(screen.getByTestId("daily-recap-main-score")).toHaveTextContent(OWNER_TAKE_LABELS.scoreLabel);
  });
});
