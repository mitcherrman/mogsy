/**
 * PT5.3 — the BLIND flow's presenters in jsdom: the blind chronometer and stage
 * in every phase (no elapsed time while running, no frame loop, the count-in
 * numeral, the locked time once stopped), Hold / Resume, the arena's sounds
 * (count-in voices, the cast, nothing while running, the lock, the verdict),
 * the reveal and the slice transition moving on by themselves unless held.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import { installFakeFrames, type FakeFrames } from "@/lib/perfect-timing/fakeFrames.testutil";
import type { CountInBeat } from "@/lib/perfect-timing/countIn";
import type { PtBlindFlowView, PtPhase, PtRoundView, PtStageModel } from "@/lib/perfect-timing/viewModel";
import { DEMO_REVEALS, DEMO_ROUNDS, demoPress } from "./__stories__/demoViewModels";

const play = vi.fn();
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play, stop: () => {}, preload: () => {} }),
}));

import { PerfectTimingArena } from "./PerfectTimingArena";
import { PerfectTimingReveal } from "./PerfectTimingReveal";
import { PerfectTimingStage } from "./PerfectTimingStage";
import { SliceTransition } from "./SliceTransition";
import { LOCK_HOLD_MS, REVEAL_DWELL_MS, TRANSITION_DWELL_MS, TRANSITION_READY_MS, blindReadoutFor } from "./presentation";
import { REVEAL_BEATS } from "./PerfectTimingReveal";

const css = readFileSync(path.resolve(process.cwd(), "src/components/perfect-timing/perfectTiming.css"), "utf8");
const ROUND = DEMO_ROUNDS[1];
const onHold = vi.fn();
const onResume = vi.fn();

const flow = (over: Partial<PtBlindFlowView> = {}): PtBlindFlowView => ({
  countIn: null, countInId: null, held: false, onHold, onResume, ...over,
});
const counting = (beat: CountInBeat, pass = 1, over: Partial<PtBlindFlowView> = {}) =>
  flow({ countIn: beat, countInId: `${ROUND.roundId}:${pass}`, ...over });

function stage(phase: PtPhase, f: PtBlindFlowView, elapsedMs: number | null = null, round: PtRoundView = ROUND) {
  return <PerfectTimingStage key={round.roundId} round={round} phase={phase} press={demoPress("seal", phase !== "running")}
    clock={{ t0: phase === "running" ? 1_000 : null, elapsedMs }} flow={f} />;
}
const model = (over: Partial<PtStageModel>): PtStageModel => ({
  round: ROUND, phase: "countdown", press: demoPress("seal"), reveal: null, onNext: () => {}, flow: flow(), ...over,
});
const sfx = () => play.mock.calls.map((c) => `${c[0]}|${(c[1] as { eventId?: string } | undefined)?.eventId ?? ""}`);
const stageDigits = () => {
  const clone = screen.getByTestId("pt-stage").cloneNode(true) as HTMLElement;
  clone.querySelector('[data-testid="pt-rank"]')?.remove();
  return clone.textContent?.match(/\d/g) ?? [];
};

let ff: FakeFrames;
beforeEach(() => {
  play.mockClear();
  onHold.mockReset();
  onResume.mockReset();
  ff = installFakeFrames(1_000);
});
afterEach(() => {
  cleanup();
  ff.restore();
  document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  vi.useRealTimers();
});

describe("BlindChronometer — what the instrument shows", () => {
  it("readout per phase: count, held, blind (running), locked, halted", () => {
    expect(blindReadoutFor("countdown", false, 3, null)).toBe("count");
    expect(blindReadoutFor("countdown", true, 3, null)).toBe("held");
    expect(blindReadoutFor("countdown", false, null, null)).toBe("idle");
    expect(blindReadoutFor("running", false, null, null)).toBe("blind");
    expect(blindReadoutFor("stopped", false, null, 5_437)).toBe("locked");
    expect(blindReadoutFor("submitting", false, null, 5_437)).toBe("locked");
    expect(blindReadoutFor("interrupted", false, null, null)).toBe("halted");
    expect(blindReadoutFor("loading", false, null, null)).toBe("idle");
  });

  it("counting in: the beat as a big numeral, GET READY, the seal disabled, Hold offered — and no frame loop", () => {
    render(stage("countdown", counting(3)));
    expect(screen.getByTestId("pt-chrono")).toHaveAttribute("data-flow", "blind");
    expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("3");
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent(/get ready/i);
    expect(screen.getByTestId("pt-press-surface")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("pt-hold")).toBeInTheDocument();
    expect(screen.getByTestId("pt-hint")).toHaveAttribute("data-live", "true");
    expect(ff.pending()).toBe(0);
  });

  it("the final beat is marked and each beat (and each pass) is its own node, so the one-shot replays", () => {
    const { rerender } = render(stage("countdown", counting(2)));
    const two = screen.getByTestId("pt-chrono-count");
    rerender(stage("countdown", counting(1)));
    const one = screen.getByTestId("pt-chrono-count");
    expect(one).not.toBe(two);
    expect(one).toHaveAttribute("data-final", "true");
    rerender(stage("countdown", counting(1, 2)));
    expect(screen.getByTestId("pt-chrono-count")).not.toBe(one);
  });

  it("running: NO elapsed time anywhere — no digits, no sweep, no beat, no frame loop, only the engraved slot letter", () => {
    render(stage("running", flow()));
    expect(screen.queryByTestId("pt-chrono-digits")).toBeNull();
    expect(document.querySelector(".pt-chrono-sweep")).toBeNull();
    expect(screen.getByTestId("pt-chrono")).not.toHaveAttribute("data-beat");
    expect(screen.getByTestId("pt-chrono-glyph")).toHaveTextContent(ROUND.slot);
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent(/press to stop/i);
    expect(stageDigits()).toEqual([]);
    expect(ff.pending()).toBe(0);
    // Time passes; nothing on the stage changes.
    const before = screen.getByTestId("pt-stage").innerHTML;
    ff.setNow(9_000);
    ff.frame(9_016);
    expect(screen.getByTestId("pt-stage").innerHTML).toBe(before);
  });

  it("locked: the player's own submitted time, frozen, and announced once", () => {
    render(stage("stopped", flow(), 5_437));
    expect(screen.getByTestId("pt-chrono-digits")).toHaveTextContent("5.44");
    expect(screen.getByTestId("pt-status")).toHaveTextContent("Locked at 5.44 s");
    expect(screen.getByTestId("pt-hint")).toHaveAttribute("data-live", "false");
  });

  it("voided: a struck dash, VOIDED, no time", () => {
    render(stage("interrupted", flow()));
    expect(screen.getByTestId("pt-chrono-glyph")).toHaveAttribute("data-halted", "true");
    expect(screen.queryByTestId("pt-chrono-digits")).toBeNull();
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent(/voided/i);
  });

  it("Hold during the count-in; a held count-in shows a pause, says so, and Resume focuses the seal", () => {
    const { rerender } = render(stage("countdown", counting(2)));
    fireEvent.click(screen.getByTestId("pt-hold"));
    expect(onHold).toHaveBeenCalledTimes(1);
    rerender(stage("countdown", flow({ held: true })));
    expect(screen.getByTestId("pt-chrono-held")).toBeInTheDocument();
    expect(screen.queryByTestId("pt-chrono-count")).toBeNull();
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent(/held/i);
    expect(screen.getByTestId("pt-status")).toHaveTextContent(/starts again from 3/i);
    fireEvent.click(screen.getByTestId("pt-resume"));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pt-press-surface")).toHaveFocus();
  });

  it("reduced motion keeps the information and drops the motion", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(stage("countdown", counting(1)));
    expect(screen.getByTestId("pt-chrono")).toHaveAttribute("data-animate", "false");
    expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("1");
  });

  it("the stylesheet: no infinite animation; the count-in, cast and fill are finite and switched off under reduced motion", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/infinite/);
    for (const name of ["pt-countin-beat", "pt-countin-ring", "pt-chrono-castword", "pt-auto-fill"]) expect(rules).toContain(`@keyframes ${name}`);
    expect(rules).toMatch(/\.pt-chrono\[data-animate="false"\] \* \{ animation: none !important; \}/);
    expect(rules).toMatch(/\.pt-reveal\[data-animate="true"\] \.pt-next\[data-auto="running"\] \.pt-auto-fill/);
  });

  it("a blind stage is the same for every dealt round: nothing but the slot letter differs while running", () => {
    const html = (r: PtRoundView) => {
      const { container, unmount } = render(stage("running", flow(), null, r));
      const chrono = container.querySelector('[data-testid="pt-chrono"]')!.cloneNode(true) as HTMLElement;
      chrono.querySelector(".pt-chrono-medallion")?.remove();
      chrono.querySelector('[data-testid="pt-chrono-glyph"]')!.textContent = "";
      unmount();
      return chrono.outerHTML;
    };
    expect(html(DEMO_ROUNDS[0])).toBe(html(DEMO_ROUNDS[2]));
  });
});

describe("PerfectTimingArena — the blind flow's sound", () => {
  it("the count-in voices (3 and 2, a stronger 1), the cast as the game starts it, NOTHING while running, the lock, the verdict", async () => {
    const id = ROUND.roundId;
    const { rerender } = render(<PerfectTimingArena model={model({ flow: counting(3) })} />);
    rerender(<PerfectTimingArena model={model({ flow: counting(2) })} />);
    rerender(<PerfectTimingArena model={model({ flow: counting(1) })} />);
    rerender(<PerfectTimingArena model={model({ phase: "running", flow: flow() })} />);
    for (let i = 0; i < 6; i++) { ff.frame(2_000 + i * 1_000); }
    rerender(<PerfectTimingArena model={model({ phase: "stopped", flow: flow(), clock: { t0: 1_000, elapsedMs: 5_437 } })} />);
    rerender(<PerfectTimingArena model={model({ phase: "revealed", flow: flow(), reveal: DEMO_REVEALS.early })} />);
    ff.setNow(ff.now + LOCK_HOLD_MS + 50);
    await act(() => new Promise<void>((r) => { setTimeout(r, LOCK_HOLD_MS + 50); }));
    expect(sfx()).toEqual([
      `perfect-timing.countin|perfect-timing:${id}:1:countin:3`,
      `perfect-timing.countin|perfect-timing:${id}:1:countin:2`,
      `perfect-timing.countin.final|perfect-timing:${id}:1:countin:1`,
      `perfect-timing.cast|perfect-timing:${id}:cast`,
      `perfect-timing.lock|perfect-timing:${id}:lock`,
      `ranked.answer.correct|perfect-timing:${id}:verdict`,
    ]);
    // Pre-start cues are never played late; no PT5.2 tick, no old start cue.
    expect(play.mock.calls.filter((c) => String(c[0]).startsWith("perfect-timing.countin") || c[0] === "perfect-timing.cast")
      .every((c) => (c[1] as { dropIfNotRunning?: boolean }).dropIfNotRunning === true)).toBe(true);
    expect(sfx().some((s) => s.startsWith("perfect-timing.clock.") || s.startsWith("ranked.module.start"))).toBe(false);
  });

  it("a held count-in is silent; a re-count after it is heard again as a new pass", () => {
    const id = ROUND.roundId;
    const { rerender } = render(<PerfectTimingArena model={model({ flow: counting(3) })} />);
    rerender(<PerfectTimingArena model={model({ flow: flow({ held: true }) })} />);
    rerender(<PerfectTimingArena model={model({ flow: counting(3, 2) })} />);
    rerender(<PerfectTimingArena model={model({ flow: counting(3, 2) })} />); // a re-render is not a beat
    expect(sfx()).toEqual([
      `perfect-timing.countin|perfect-timing:${id}:1:countin:3`,
      `perfect-timing.countin|perfect-timing:${id}:2:countin:3`,
    ]);
  });

  it("the keyboard player's focus goes to the seal when the next round counts in after a reveal", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "revealed", reveal: DEMO_REVEALS.early, flow: flow() })} />);
    rerender(<PerfectTimingArena model={model({ round: DEMO_ROUNDS[2], flow: flow({ countIn: 3, countInId: `${DEMO_ROUNDS[2].roundId}:1` }) })} />);
    expect(screen.getByTestId("pt-press-surface")).toHaveFocus();
  });
});

describe("the reveal and the transition move on by themselves (blind flow)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it("reveal: Next with a dwell fill once settled, then 'auto' after REVEAL_DWELL_MS; nothing before", () => {
    const onNext = vi.fn();
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} autoAdvanceMs={REVEAL_DWELL_MS} onHold={onHold} />);
    expect(screen.getByTestId("pt-next-row")).toBeInTheDocument();
    advance(REVEAL_BEATS.focus);
    expect(screen.getByTestId("pt-next")).toHaveAttribute("data-auto", "running");
    expect(screen.getByTestId("pt-auto-fill")).toBeInTheDocument();
    expect(screen.getByTestId("pt-next")).toHaveFocus();
    advance(REVEAL_DWELL_MS - 1);
    expect(onNext).not.toHaveBeenCalled();
    advance(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledWith("auto");
  });

  it("reveal: Hold stops it for good (the player continues with Next); focus stays on the way on", () => {
    const onNext = vi.fn();
    const { rerender } = render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} autoAdvanceMs={REVEAL_DWELL_MS} onHold={onHold} />);
    advance(REVEAL_BEATS.focus);
    advance(1_000);
    fireEvent.click(screen.getByTestId("pt-hold"));
    expect(onHold).toHaveBeenCalledTimes(1);
    rerender(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} autoAdvanceMs={REVEAL_DWELL_MS} held onHold={onHold} />);
    expect(screen.getByTestId("pt-hold")).toBeDisabled();
    expect(screen.getByTestId("pt-hold")).toHaveTextContent(/held/i);
    expect(screen.getByTestId("pt-next")).toHaveAttribute("data-auto", "held");
    expect(screen.getByTestId("pt-next")).toHaveFocus();
    advance(30_000);
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pt-next"), { detail: 1 });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("reveal without a dwell (PT5.2 flow) is unchanged: one Next button, nothing automatic", () => {
    const onNext = vi.fn();
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} />);
    expect(screen.queryByTestId("pt-next-row")).toBeNull();
    expect(screen.queryByTestId("pt-hold")).toBeNull();
    advance(60_000);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("transition: continues by itself TRANSITION_DWELL_MS after it is ready, unless held", () => {
    const sliceRound = { ...DEMO_ROUNDS[1], slice: { kind: "rank_up" as const, stage: 2, total: 3, abilityHaste: 0, item: null, previous: { kind: "foundation" as const, rank: 1, item: null } }, rank: 3 };
    const onContinue = vi.fn();
    const { unmount } = render(<SliceTransition round={sliceRound} onContinue={onContinue} autoAdvanceMs={TRANSITION_DWELL_MS} onHold={onHold} />);
    advance(TRANSITION_READY_MS);
    expect(screen.getByTestId("pt-tr-continue")).toHaveAttribute("data-auto", "running");
    advance(TRANSITION_DWELL_MS - 1);
    expect(onContinue).not.toHaveBeenCalled();
    advance(1);
    expect(onContinue).toHaveBeenCalledWith("auto");
    unmount();

    const held = vi.fn();
    render(<SliceTransition round={sliceRound} onContinue={held} autoAdvanceMs={TRANSITION_DWELL_MS} held onHold={onHold} />);
    advance(TRANSITION_READY_MS + 20_000);
    expect(held).not.toHaveBeenCalled();
    expect(screen.getByTestId("pt-hold")).toBeDisabled();
  });
});
