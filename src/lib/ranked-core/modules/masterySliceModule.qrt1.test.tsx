/**
 * QRT1 — HOW LONG A JOURNEY REVEAL IS ACTUALLY ON SCREEN, on the real JP5
 * captures (the Zed/Ahri reference Journey).
 *
 * The server starts a child's reveal the instant it accepts the answer, and
 * the next child's clock starts `reveal_until` later whether or not this client
 * has drawn anything. So the visible reveal is `reveal_until` minus the moment
 * the client first draws it:
 *
 *   * BEFORE QRT1 it was drawn from the poll the accepted submit triggered —
 *     the visible reveal lost the ack's travel time AND a whole poll;
 *   * WITH QRT1 it is drawn from the submit response itself
 *     (`challenge_reveal_timing`), losing only the response's travel time;
 *   * either way it ends AT `reveal_until`, never later: no reveal is ever
 *     held over the next child's running clock.
 *
 * Plus the hazards: duplicate acks and polls, a stale snapshot, a late ack, an
 * unmount mid-hold, and the click acknowledgment before grading.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useRevealAutoAdvance } from "@/features/mastery/interactions/revealState";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import {
  MASTERY_SLICE_MODULE_ID, readOwnChallengeReveal, readPublicRound, type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { readJourneyAckRevealTiming } from "@/lib/ranked-public/client";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { withRevealWindow } from "@/pages/dev/journey-arena/JourneyArenaHarness";
import { withJourneyAckReveal, type JourneyAckRevealRef } from "../journeyAckReveal";
import { masterySliceModule } from "./masterySliceModule";

// The real hook, observed (scope of the end instant: Journeys only).
vi.mock("@/features/mastery/interactions/revealState", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/mastery/interactions/revealState")>();
  return { ...real, useRevealAutoAdvance: vi.fn(real.useRevealAutoAdvance) };
});

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const REF = load("jp5/zed_ahri.reference");
const snap = (label: string) => {
  const s = REF.find((x) => x.label === label);
  if (!s) throw new Error(label);
  return s;
};
type Wire = Record<string, unknown>;
const segWire = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire }).segment_state;
const MATCH = "jp5-correct";

/**
 * The submit response the server sends for `index`, built from the capture's
 * own reveal snapshot: the same frozen chain the backend's
 * `_journey_reveal_timing` reads (pinned in `test_qrt1_journey_reveal_timing`).
 */
function ackWire(reveal: CaptureSnapshot, index: number): Wire {
  const seg = segWire(reveal);
  return {
    status: "accepted", match_id: MATCH, segment_number: seg.segment_number, challenge_index: index,
    idempotent: false, conflicting: false, segment_resolved: false,
    next_challenge_index: seg.own_next_challenge_index,
    reveal_window_ms: seg.reveal_window_ms,
    challenge_reveal_window_ms: seg.own_reveal_window_ms,
    challenge_reveal: (seg.own_challenge_reveals as Wire[]).find((r) => r.challenge_index === index),
    challenge_reveal_timing: {
      revealing_card_index: index,
      reveal_until: seg.own_reveal_until,
      reveal_window_ms: seg.own_reveal_window_ms ?? seg.reveal_window_ms,
      next_challenge_index: seg.own_next_challenge_index,
      next_card_started_at: seg.own_card_started_at,
      next_card_deadline: seg.own_card_deadline,
      challenges_completed: seg.own_challenges_completed,
      finished: seg.own_finished,
    },
  };
}
/** What `useRankedMatch` stores from an accepted Journey ack. */
function ackRef(reveal: CaptureSnapshot, index: number): JourneyAckRevealRef {
  const w = ackWire(reveal, index);
  const timing = readJourneyAckRevealTiming(w.challenge_reveal_timing)!;
  return {
    matchId: MATCH, segmentNumber: w.segment_number as number, timing,
    reveal: readOwnChallengeReveal(w.challenge_reveal, timing.nextChallengeIndex, MASTERY_SLICE_MODULE_ID),
  };
}
const untilOf = (s: CaptureSnapshot) => Date.parse(segWire(s).own_reveal_until as string);
const windowOf = (s: CaptureSnapshot) => (segWire(s).own_reveal_window_ms ?? segWire(s).reveal_window_ms) as number;

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot, ack: JourneyAckRevealRef | null = null,
  submitChallenge: (i: number, c: unknown) => void | Promise<boolean> = () => {}, busy = false) {
  const round = readPublicRound(s.envelope);
  const state = withJourneyAckReveal(round.segmentState, ack, MATCH);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={state} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: submitChallenge as never, busy, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const revealing = () => screen.queryByTestId("journey-reveal") !== null;
/** Milliseconds the reveal stays on screen from now, stepping 10 ms at a time. */
function measureVisibleMs(limit = 20_000): number {
  let ms = 0;
  while (revealing() && ms < limit) { tick(10); ms += 10; }
  return ms;
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("the overlay: the ack's reveal on a snapshot that has not caught up", () => {
  const live = () => readPublicRound(snap("child1-live").envelope).segmentState!;
  const fresh = () => readPublicRound(snap("child1-reveal").envelope).segmentState!;

  it("places the server's reveal and phase exactly where the next snapshot puts them", () => {
    const patched = withJourneyAckReveal(live(), ackRef(snap("child1-reveal"), 1), MATCH)!;
    const real = fresh();
    for (const k of ["ownNextChallengeIndex", "ownChallengesCompleted", "ownFinished", "ownCardIndex",
      "ownCardStartedAt", "ownCardDeadline", "ownRevealingCardIndex", "ownRevealUntil",
      "ownRevealWindowMs", "activeTimeRunning", "activeTimeRemainingMs"] as const) {
      expect(patched[k], k).toEqual(real[k]);
    }
    // The paused pool is what the answer left (104 s), not the stale live
    // snapshot's 110 s.
    expect(live().activeTimeRemainingMs).toBe(110_000);
    expect(patched.activeTimeRemainingMs).toBe(104_000);
    expect(patched.ownChallengeReveals).toEqual(real.ownChallengeReveals);
    // Nothing else moves: the reached prefix is still the snapshot's own.
    expect(patched.journey).toBe(live().journey === null ? null : patched.journey);
    expect(patched.block).toEqual(live().block);
  });

  it("the FINAL child: finished, no next card, and the pool its own deadline left", () => {
    const patched = withJourneyAckReveal(readPublicRound(snap("child3-live").envelope).segmentState!,
      ackRef(snap("child3-reveal"), 3), MATCH)!;
    const real = readPublicRound(snap("child3-reveal").envelope).segmentState!;
    for (const k of ["ownNextChallengeIndex", "ownChallengesCompleted", "ownFinished", "ownCardIndex",
      "ownCardStartedAt", "ownCardDeadline", "ownRevealingCardIndex", "ownRevealUntil",
      "ownRevealWindowMs", "activeTimeRunning", "activeTimeRemainingMs"] as const) {
      expect(patched[k], k).toEqual(real[k]);
    }
    expect(patched.ownFinished).toBe(true);
    expect(patched.ownCardIndex).toBeNull();
    expect(patched.activeTimeRemainingMs).toBe(88_000);
  });

  it("a non-pooled snapshot gets no pool, and an unknown remainder keeps the snapshot's", () => {
    const ack = ackRef(snap("child3-reveal"), 3);
    const live = readPublicRound(snap("child3-live").envelope).segmentState!;
    const survival = { ...live, activeTimeMs: null, activeTimeRemainingMs: null, activeTimeRunning: null };
    const p = withJourneyAckReveal(survival as SegmentStateView, ack, MATCH)!;
    expect(p.activeTimeRemainingMs).toBeNull();
    expect(p.activeTimeRunning).toBeNull();
    // An older snapshot not on the answered child: nothing to read the final remainder off.
    const older = { ...live, ownCardIndex: 2 };
    expect(withJourneyAckReveal(older, ack, MATCH)!.activeTimeRemainingMs).toBe(live.activeTimeRemainingMs);
  });

  it("is a no-op (same object) once a snapshot carries the reveal or has moved on", () => {
    const ack = ackRef(snap("child1-reveal"), 1);
    for (const label of ["child1-reveal", "child1-reveal-end", "child2-open", "child2-live"]) {
      const state = readPublicRound(snap(label).envelope).segmentState!;
      expect(withJourneyAckReveal(state, ack, MATCH), label).toBe(state);
    }
  });

  it("never crosses a match, a segment, a module, or a mismatched child", () => {
    const state = live();
    const ack = ackRef(snap("child1-reveal"), 1);
    expect(withJourneyAckReveal(state, ack, "another-match")).toBe(state);
    expect(withJourneyAckReveal(state, { ...ack, segmentNumber: 2 }, MATCH)).toBe(state);
    expect(withJourneyAckReveal({ ...state, journey: null }, ack, MATCH)).toEqual({ ...state, journey: null });
    expect(withJourneyAckReveal({ ...state, moduleId: "item_cost_duel" } as SegmentStateView, ack, MATCH))
      .toEqual({ ...state, moduleId: "item_cost_duel" });
    const crossed = { ...ack, reveal: { ...ack.reveal, challengeIndex: 0 } };
    expect(withJourneyAckReveal(state, crossed, MATCH)).toBe(state);
    expect(withJourneyAckReveal(state, null, MATCH)).toBe(state);
    expect(withJourneyAckReveal(null, ack, MATCH)).toBeNull();
  });

  it("reads the ack's timing fail-closed: an older backend or a bad field is simply no timing", () => {
    const good = ackWire(snap("child1-reveal"), 1).challenge_reveal_timing as Wire;
    expect(readJourneyAckRevealTiming(good)).not.toBeNull();
    expect(readJourneyAckRevealTiming(undefined)).toBeNull();
    expect(readJourneyAckRevealTiming(null)).toBeNull();
    expect(readJourneyAckRevealTiming([good])).toBeNull();
    for (const [k, bad] of [["reveal_until", "soon"], ["reveal_until", null], ["revealing_card_index", -1],
      ["reveal_window_ms", 0], ["reveal_window_ms", "2250"], ["next_challenge_index", 1.5],
      ["finished", "no"], ["next_card_started_at", "later"], ["challenges_completed", undefined]] as const) {
      expect(readJourneyAckRevealTiming({ ...good, [k]: bad }), `${k}=${String(bad)}`).toBeNull();
    }
    // Nullable instants are allowed to be null (the final child has no next card).
    expect(readJourneyAckRevealTiming({ ...good, next_card_started_at: null, next_card_deadline: null }))
      .not.toBeNull();
  });
});

describe("visible reveal duration: from the response, never past the server's reveal", () => {
  // Child 1 is the raw-damage child: captured at 4000 ms; QRT1 serves 5000 ms.
  const settledAt = () => untilOf(snap("child1-reveal")) - windowOf(snap("child1-reveal"));

  it.each([0, 120, 400, 900])("an ack that arrives %i ms after acceptance shows window − %i ms, then stops", (lag) => {
    const reveal = snap("child1-reveal");
    vi.setSystemTime(settledAt() + lag);
    render(view(snap("child1-live"), ackRef(reveal, 1)));
    expect(revealing()).toBe(true);
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-challenge-index", "1");
    expect(measureVisibleMs()).toBe(windowOf(reveal) - lag);
    // It ended AT the server's reveal_until, and the answered child did not
    // come back as answerable: the next child is not open yet.
    expect(Date.now()).toBe(untilOf(reveal));
    expect(screen.queryByTestId("journey-child")).toBeNull();
    expect(screen.getByTestId("journey-next-pending")).toBeInTheDocument();
  });

  it("the same answer drawn from a poll instead loses the whole round trip (the pre-QRT1 path)", () => {
    // The live stack measured the post-submit poll at 0.5-2 s; at 1.2 s:
    const reveal = snap("child1-reveal");
    const pollLag = 1200;
    vi.setSystemTime(settledAt() + pollLag);
    render(view(reveal));
    expect(measureVisibleMs()).toBe(windowOf(reveal) - pollLag);
  });

  it("an ack that lands after the server's reveal ended shows no reveal at all", () => {
    const reveal = snap("child1-reveal");
    vi.setSystemTime(untilOf(reveal) + 10);
    render(view(snap("child1-live"), ackRef(reveal, 1)));
    expect(revealing()).toBe(false);
    expect(screen.queryByTestId("journey-child")).toBeNull();
  });

  it("a duplicate ack, a stale poll and the catching-up poll all keep ONE hold to the same instant", () => {
    const reveal = snap("child1-reveal");
    const ack = ackRef(reveal, 1);
    vi.setSystemTime(settledAt() + 150);
    const { rerender } = render(view(snap("child1-live"), ack));
    tick(200);
    rerender(view(snap("child1-live"), ackRef(reveal, 1)));      // duplicate ack (idempotent retry)
    tick(200);
    rerender(view(snap("child1-live"), ack));                    // a poll that was already in flight: stale
    tick(200);
    rerender(view(reveal, ack));                                 // the poll that carries the reveal
    tick(200);
    rerender(view(snap("child1-reveal-late"), ack));             // and another
    expect(revealing()).toBe(true);
    measureVisibleMs();
    expect(Date.now()).toBe(untilOf(reveal));
  });

  it("an unmount mid-reveal leaves no timer behind", () => {
    const reveal = snap("child1-reveal");
    vi.setSystemTime(settledAt() + 100);
    const { unmount } = render(view(snap("child1-live"), ackRef(reveal, 1)));
    expect(revealing()).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    tick(10_000);                                                // nothing fires into an unmounted tree
  });

  it("correct, wrong and timed-out children reveal exactly as long (outcome-blind)", () => {
    const answered = snap("child3-reveal");
    const wrong = load("jp5/zed_ahri.reference.wrong").find((x) => x.label === "child3-reveal")!;
    const timeout = load("jp5/zed_ahri.reference.timeout").find((x) => x.label === "child3-timeout-reveal")!;
    expect(windowOf(wrong)).toBe(windowOf(answered));
    expect(windowOf(timeout)).toBe(windowOf(answered));
    for (const s of [answered, wrong, timeout]) {
      vi.setSystemTime(untilOf(s) - windowOf(s));
      render(view(s));
      expect(measureVisibleMs(), s.label).toBe(windowOf(s));
      cleanup();
    }
  });
});

describe("the QRT1 windows on screen", () => {
  it("a 7000 ms armor unfold keeps the derivation open to the measured 3.2 s fold, then the compact chain 3.8 s", () => {
    // The capture froze 6000 ms; the probe replays it as a 7000 ms server window.
    const s = withRevealWindow(snap("child3-reveal"), 7000);
    vi.setSystemTime(Date.parse(s.at));
    render(view(s));
    const phase = () => screen.getByTestId("journey-combat-working").querySelector("ol")!.getAttribute("data-phase");
    expect(phase()).toBe("expanded");
    tick(3199);
    expect(phase()).toBe("expanded");
    tick(1);
    expect(phase()).toBe("compressed");
    expect(measureVisibleMs()).toBe(3800);
  });

  it("a 2250 ms ordinary child is held 2250 ms", () => {
    const s = withRevealWindow(snap("child0-reveal"), 2250);
    vi.setSystemTime(Date.parse(s.at));
    render(view(s));
    expect(measureVisibleMs()).toBe(2250);
  });

  it("a frozen pre-QRT1 Journey keeps its captured windows (1750 / 4000 / 6000)", () => {
    for (const [label, ms] of [["child0-reveal", 1750], ["child1-reveal", 4000], ["child3-reveal", 6000]] as const) {
      const s = snap(label);
      expect(windowOf(s)).toBe(ms);
      vi.setSystemTime(untilOf(s) - ms);
      render(view(s));
      expect(measureVisibleMs(), label).toBe(ms);
      cleanup();
    }
  });
});

describe("the click is acknowledged at once, without a verdict", () => {
  it("marks the picked tablet, locks the grid, and paints no correct or wrong before grading", async () => {
    const s = snap("child1-live");
    vi.setSystemTime(Date.parse(s.at));
    let resolveSubmit: (ok: boolean) => void = () => {};
    const submit = vi.fn(() => new Promise<boolean>((r) => { resolveSubmit = r; }));
    render(view(s, null, submit));
    const tablets = () => [...document.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]")];
    expect(tablets().length).toBeGreaterThan(1);
    fireEvent.click(tablets()[2]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(1, { selected: expect.any(String) });
    // Immediately: the pick is shown, nothing is graded, nothing else answerable.
    expect(tablets()[2]).toHaveAttribute("data-choice-state", "selected");
    expect(tablets().map((t) => t.getAttribute("data-choice-state")))
      .not.toContain("correct");
    expect(tablets().map((t) => t.getAttribute("data-choice-state")))
      .not.toContain("incorrect-selected");
    expect(revealing()).toBe(false);
    // A second click while the first is in flight sends nothing.
    fireEvent.click(tablets()[0]);
    expect(submit).toHaveBeenCalledTimes(1);
    // A refused submission releases the lock so the player can answer again.
    resolveSubmit(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(tablets()[0]);
    expect(submit).toHaveBeenCalledTimes(2);
  });
});

describe("the hold is armed against the server's END INSTANT, not a render-time duration", () => {
  it("a timer armed late (a slow commit) still fires at the end instant, never after it", () => {
    vi.setSystemTime(10_000);
    const endsAt = Date.now() + 2250;             // decided at render
    vi.setSystemTime(10_000 + 180);               // ...armed 180 ms later
    const fired = vi.fn();
    renderHook(() => useRevealAutoAdvance(1, fired, 2250, endsAt));
    tick(2250 - 180 - 1);
    expect(fired).not.toHaveBeenCalled();
    tick(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(Date.now()).toBe(endsAt);
  });

  it("a Journey's module hold is armed against an end instant at the server's reveal_until", () => {
    const reveal = snap("child1-reveal");
    vi.setSystemTime(untilOf(reveal) - windowOf(reveal) + 300);
    vi.mocked(useRevealAutoAdvance).mockClear();
    render(view(reveal));
    const held = vi.mocked(useRevealAutoAdvance).mock.calls.filter(([key]) => key === 1);
    expect(held.length).toBeGreaterThan(0);
    for (const [, , , endsAtMs] of held) expect(endsAtMs).toBe(untilOf(reveal));
  });

  it("an end instant already passed fires at once; no end instant keeps the plain delay", () => {
    vi.setSystemTime(10_000);
    const late = vi.fn();
    renderHook(() => useRevealAutoAdvance(1, late, 2250, 9_000));
    tick(0);
    expect(late).toHaveBeenCalledTimes(1);
    const plain = vi.fn();
    renderHook(() => useRevealAutoAdvance(2, plain, 1750));
    tick(1749);
    expect(plain).not.toHaveBeenCalled();
    tick(1);
    expect(plain).toHaveBeenCalledTimes(1);
  });
});
