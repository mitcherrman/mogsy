/**
 * MISC W2D (F10/F11) — the header answer clock's identity, its beats over
 * REAL Journey captures on virtual time, and the two presenters' pulse.
 *
 *   * pooled Standard (historical, `active_time_*`): one clock per module;
 *   * per-child Survival (`card_timer_ms`): one clock per child;
 *   * F09 Standard v2 (per-child 30 s): the SAME per-child identity — the
 *     historical capture re-clocked exactly as draft PR #59 does it;
 *   * desktop (`CentralStage`) and phone (`MobileMatchBar`) draw the same
 *     beat from the same `TimerView`, and neither owns a sound.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CentralStage } from "@/components/ranked-arena/CentralStage";
import { MobileMatchBar } from "@/components/ranked-arena/MobileMatchBar";
import { mogzyAudio } from "@/lib/audio/engine";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import type { ArenaHeaderView } from "@/lib/ranked-core/arenaView";
import type { CombatantView, TimerView } from "@/lib/ranked-core/viewTypes";
import { observeCountdown, type CountdownWatch } from "@/lib/quiz-timer/countdownFeedback";
import { readPublicRound, type PublicRoundView } from "@/lib/ranked-public/contracts";
import { answerClockKey, projectJourneyTimer, projectTimer } from "./rankedViews";

afterEach(cleanup);

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j3");
const snaps = (name: string) =>
  JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as CaptureSnapshot[];
const snap = (name: string, label: string) => {
  const s = snaps(name).find((x) => x.label === label);
  if (!s) throw new Error(`${name}: ${label}`);
  return s;
};

/** F09 v2 — PR #59's adaptation: only the clock fields become per-child 30 s. */
function reclockedStandard(label: string): { round: PublicRoundView; at: number } {
  const s = snap("zed.standard", label);
  const envelope = JSON.parse(JSON.stringify(s.envelope));
  const seg = envelope.payload.segment_state as Record<string, unknown>;
  const opensAt = Date.parse(seg.own_card_started_at as string);
  seg.card_timer_ms = 30_000;
  seg.active_time_ms = null;
  seg.active_time_remaining_ms = null;
  seg.active_time_running = null;
  seg.own_card_deadline = new Date(opensAt + 30_000).toISOString();
  return { round: readPublicRound(envelope), at: Date.parse(s.at) };
}

const live = (name: string, label: string) => {
  const s = snap(name, label);
  return { round: readPublicRound(s.envelope), at: Date.parse(s.at) };
};

describe("answerClockKey — one identity per genuine answer clock", () => {
  it("historical pooled Standard: ONE clock for the whole module, across children", () => {
    const a = live("zed.standard", "child0-live").round;
    const b = live("zed.standard", "child1-live").round;
    expect(answerClockKey("m1", a, a.segmentState)).toMatch(/^m1:mastery_slice\.\d+#\d+:pool$/);
    expect(answerClockKey("m1", b, b.segmentState)).toBe(answerClockKey("m1", a, a.segmentState));
  });

  it("Survival: one clock per child", () => {
    const a = live("olaf.survival", "child0-live").round;
    const b = live("olaf.survival", "child1-live").round;
    expect(answerClockKey("m1", a, a.segmentState)).toMatch(/:card:0$/);
    expect(answerClockKey("m1", b, b.segmentState)).toMatch(/:card:1$/);
  });

  it("F09 Standard v2 (five 30 s children): per-child identity, not the pool", () => {
    const a = reclockedStandard("child0-live").round;
    const b = reclockedStandard("child1-live").round;
    expect(answerClockKey("m1", a, a.segmentState)).toMatch(/:card:0$/);
    expect(answerClockKey("m1", b, b.segmentState)).toMatch(/:card:1$/);
  });

  it("a plain round is its round's clock; nothing live is null", () => {
    const round = { activeRound: { roundNumber: 7 } } as PublicRoundView;
    expect(answerClockKey("m1", round, null)).toBe("m1:r7");
    expect(answerClockKey("m1", null, null)).toBeNull();
  });
});

/** Sample a captured clock every 100 ms of virtual time from its capture instant. */
function beatsOver(round: PublicRoundView, at: number, spanMs: number) {
  let watch: CountdownWatch | null = null;
  const heard: string[] = [];
  for (let t = 0; t <= spanMs; t += 100) {
    const timer = projectJourneyTimer(round.segmentState, 0, at + t) ?? projectTimer(round, 0, at + t);
    const next = observeCountdown(watch, {
      clockKey: timer ? answerClockKey("m1", round, round.segmentState) : null,
      remainingSeconds: timer?.remainingSeconds ?? null,
      running: timer !== null && !timer.paused,
      armed: true,
    });
    watch = next.watch;
    if (next.tick) heard.push(`${next.tick.second}@${Math.round(t / 100) / 10}s`);
  }
  return heard;
}

describe("real captures on virtual time — beats at the server's own boundaries", () => {
  it("Survival child 0 (28 s left at capture): 5,4,3,2,1 exactly at 23,24,25,26,27 s later", () => {
    const { round, at } = live("olaf.survival", "child0-live");
    expect(beatsOver(round, at, 40_000)).toEqual(["5@23s", "4@24s", "3@25s", "2@26s", "1@27s"]);
  });

  it("F09 Standard v2 child 0: the same five beats on the per-child clock", () => {
    const { round, at } = reclockedStandard("child0-live");
    expect(beatsOver(round, at, 40_000)).toEqual(["5@23s", "4@24s", "3@25s", "2@26s", "1@27s"]);
  });

  it("a held clock (a Survival reveal) is silent however long it is watched", () => {
    const { round, at } = live("olaf.survival", "child0-reveal");
    expect(beatsOver(round, at, 1_000)).toEqual([]);
  });
});

// ── the two presenters ───────────────────────────────────────────────────
const clock = (remainingSeconds: number, over: Partial<TimerView> = {}): TimerView => ({
  durationSeconds: 30, remainingSeconds, paused: false, urgent: remainingSeconds <= 5, ...over,
});
const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "userA", name: "A", side: "player", classId: "tank", roleId: "mid",
  identityMode: "role", hp: 170, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: null, score: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});
const rail = (c: CombatantView) => ({
  kind: "combatant" as const, combatant: c, damage: [], outcome: null, damageDealt: null,
  presentation: "banner" as const, reaction: null,
});
const header = (timer: TimerView): ArenaHeaderView => ({
  eyebrow: "Ranked Duel", title: "4 / 10", transitionNote: null, playtestNote: null,
  presenceNote: null, timerLabel: "Round timer", timer,
});
function presenters(timer: TimerView) {
  return render(<>
    <CentralStage timer={timer} result={null} moduleTitle={null} moduleEventId={null} />
    <MobileMatchBar header={header(timer)} progressionEnabled={false}
      left={rail(combatant())} right={rail(combatant({ playerId: "userB", side: "opponent" }))} />
  </>);
}

describe("F11 — both presenters draw the same escalating beat, and no sound", () => {
  it.each([
    [6, undefined, undefined],
    [5, "5", "warn"], [4, "4", "warn"], [3, "3", "strong"], [2, "2", "strong"], [1, "1", "final"],
    [0, undefined, undefined],
  ])("at %s s: data-countdown=%s intensity=%s", (s, beat, intensity) => {
    const play = vi.spyOn(mogzyAudio, "playSfx");
    presenters(clock(s));
    for (const id of ["timer-value", "mobile-timer-value"]) {
      const el = screen.getByTestId(id);
      expect(el.getAttribute("data-countdown") ?? undefined).toBe(beat);
      expect(el.getAttribute("data-countdown-intensity") ?? undefined).toBe(intensity);
      expect(el.querySelector(".quiz-countdown-digits")).not.toBeNull();
    }
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });

  it("a paused clock has no beat (a pooled Journey budget held at 4)", () => {
    presenters(clock(4, { paused: true }));
    expect(screen.getByTestId("timer-value")).not.toHaveAttribute("data-countdown");
    expect(screen.getByTestId("mobile-timer-value")).not.toHaveAttribute("data-countdown");
  });

  it("each beat remounts the digits (so the one-shot pulse replays) without moving the clock box", () => {
    const view = presenters(clock(3));
    const box = screen.getByTestId("timer-value");
    const digits3 = box.querySelector(".quiz-countdown-digits");
    view.rerender(<>
      <CentralStage timer={clock(2)} result={null} moduleTitle={null} moduleEventId={null} />
      <MobileMatchBar header={header(clock(2))} progressionEnabled={false}
        left={rail(combatant())} right={rail(combatant({ playerId: "userB", side: "opponent" }))} />
    </>);
    expect(screen.getByTestId("timer-value")).toBe(box);
    expect(box.querySelector(".quiz-countdown-digits")).not.toBe(digits3);
    expect(box).toHaveTextContent("0:02");
  });
});

describe("F12 — the centre face stamps only the server's verdict", () => {
  it("TIMED OUT (a settled result) is stamped; a local zero says only that it is settling", () => {
    const view = render(<CentralStage timer={clock(0)} result={null} moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("central-timer-expired")).toHaveTextContent("Settling…");
    expect(screen.queryByText(/time'?s up|timed out/i)).toBeNull();
    view.rerender(<CentralStage timer={clock(0)} result={{ verdict: "TIMED OUT", points: "+0 POINTS" }}
      moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("central-result-verdict")).toHaveAttribute("data-timeout", "true");
    view.rerender(<CentralStage timer={clock(0)} result={{ verdict: "INCORRECT", points: "+0 POINTS" }}
      moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("central-result-verdict")).not.toHaveAttribute("data-timeout");
  });
});
