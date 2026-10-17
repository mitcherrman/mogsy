/**
 * MISC W2D (F10–F12) — the Daily Time Trial bank is the stage's answer clock.
 * Its last five seconds knock and pulse while it DRAINS; TIME'S UP sounds only
 * when the server's own reading says the bank is spent — never because the
 * projection reached 0.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mogzyAudio } from "@/lib/audio/engine";
import type { DailyTimeBank } from "@/lib/daily-challenge/run/contracts";
import { resetCountdownFeedbackForTests } from "@/lib/quiz-timer/useCountdownFeedback";
import { TimeBankMeter } from "./DailyStageChrome";

const T0 = Date.parse("2026-10-17T12:00:00.000Z");

const bank = (over: Partial<DailyTimeBank> = {}): DailyTimeBank => ({
  totalMs: 60_000, remainingMs: 8_000, asOf: new Date(T0).toISOString(), draining: true,
  answerableAt: null, deadline: null, answered: false, ...over,
});

let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetCountdownFeedbackForTests();
  play = vi.spyOn(mogzyAudio, "playSfx").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  play.mockRestore();
  vi.useRealTimers();
});

const heard = () => play.mock.calls.map(([e, o]) => `${String(e)}@${(o as { eventId: string }).eventId}`);
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) await act(async () => { vi.advanceTimersByTime(50); });
}

describe("Time Trial bank", () => {
  it("knocks 5..1 once each while draining, and pulses the readout", async () => {
    render(<TimeBankMeter bank={bank()} skewMs={0} childPhase="answering" stageId="s2" />);
    await advance(3_100); // 8 s → 4.9 s left: showing 5
    expect(screen.getByTestId("daily-time-bank-value")).toHaveAttribute("data-countdown", "5");
    await advance(5_000);
    expect(heard()).toEqual([
      "quiz.countdown.tick@quiz-countdown:daily-bank:s2:5",
      "quiz.countdown.tick@quiz-countdown:daily-bank:s2:4",
      "quiz.countdown.urgent@quiz-countdown:daily-bank:s2:3",
      "quiz.countdown.urgent@quiz-countdown:daily-bank:s2:2",
      "quiz.countdown.final@quiz-countdown:daily-bank:s2:1",
    ]);
    // The projection reached 0:00 — and that is NOT a timeout.
    expect(screen.getByTestId("daily-time-bank")).toHaveAttribute("data-bank-ms", "0");
    expect(heard().some((h) => h.startsWith("quiz.answer.timeout"))).toBe(false);
  });

  it("a held bank (reveal, lead-in, a question already answered) neither knocks nor pulses", async () => {
    render(<TimeBankMeter bank={bank({ remainingMs: 4_000 })} skewMs={0} childPhase="revealing" stageId="s2" />);
    await advance(5_000);
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByTestId("daily-time-bank-value")).not.toHaveAttribute("data-countdown");
  });

  it("TIME'S UP sounds once when the SERVER's reading says the bank is spent", async () => {
    const view = render(<TimeBankMeter bank={bank({ remainingMs: 900 })} skewMs={0}
      childPhase="answering" stageId="s2" />);
    view.rerender(<TimeBankMeter bank={bank({ remainingMs: 0, draining: false })} skewMs={0}
      childPhase="answering" stageId="s2" />);
    view.rerender(<TimeBankMeter bank={bank({ remainingMs: 0, draining: false })} skewMs={0}
      childPhase="answering" stageId="s2" />);
    expect(heard().filter((h) => h.startsWith("quiz.answer.timeout")))
      .toEqual(["quiz.answer.timeout@quiz-timeout:daily-bank:s2"]);
  });

  it("re-entering a stage whose bank was already spent replays nothing", () => {
    render(<TimeBankMeter bank={bank({ remainingMs: 0, draining: false })} skewMs={0}
      childPhase="answering" stageId="s2" />);
    expect(play).not.toHaveBeenCalled();
  });
});
