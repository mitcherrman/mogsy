/**
 * RD1 — the duel standing's presentation seams: the score tally, the clock
 * face's secondary line and urgency class, and the header record's tones.
 *
 * Geometry is asserted as CLASS equality across states, because jsdom lays
 * nothing out: if the standing changed a size, weight or position class, the
 * class lists would differ.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { CombatantPanel, ScoreTally } from "./CombatantPanel";
import { CentralStage } from "./CentralStage";
import { RoundResultBeat, pointsRecordKind } from "./RoundResultBeat";
import type {
  CombatantView, ResolvedCombatantView, ResolvedRoundView, TimerView,
} from "@/lib/ranked-core/viewTypes";
import type { PointsFeedbackView } from "@/lib/ranked-core/pointsFeedback";

const combatant: CombatantView = {
  playerId: "you", name: "You", tag: "Top", roleId: "top", identityMode: "role",
  side: "player", classId: "tank", hp: 170, maxHp: 170, xp: 0, level: 1,
  nextLevelThreshold: null, currentLevelThreshold: null,
  hasSubmitted: false, abilityWindow: null, hasAbilitySelected: null, score: 7,
};

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

describe("ScoreTally standing", () => {
  it("publishes the standing it is given, and nothing when given none", () => {
    const { rerender } = render(<ScoreTally combatant={combatant} standing="leading" />);
    expect(screen.getByTestId("score-you")).toHaveAttribute("data-standing", "leading");
    rerender(<ScoreTally combatant={combatant} standing="trailing" />);
    expect(screen.getByTestId("score-you")).toHaveAttribute("data-standing", "trailing");
    rerender(<ScoreTally combatant={combatant} />);
    expect(screen.getByTestId("score-you")).not.toHaveAttribute("data-standing");
  });

  it("reaches the tally through the panel", () => {
    render(<CombatantPanel combatant={combatant} progressionEnabled={false}
      presentation="banner" standing="tied" />);
    expect(screen.getByTestId("score-you")).toHaveAttribute("data-standing", "tied");
  });

  it("changes no size or position class between standings", () => {
    const classes = (standing: "leading" | "tied" | "trailing" | null) => {
      const { unmount } = render(<ScoreTally combatant={combatant} standing={standing} />);
      const out = [
        screen.getByTestId("score-you").className,
        screen.getByTestId("ranked-score-value-you").className,
      ];
      unmount();
      return out;
    };
    const baseline = classes(null);
    for (const s of ["leading", "tied", "trailing"] as const) {
      expect(classes(s)).toEqual(baseline);
    }
    expect(baseline[1]).toMatch(/\btext-4xl\b/);
    expect(baseline[1]).toMatch(/min-\[1500px\]:text-5xl/);
  });

  it("colours only from the attribute: gold by default, green ahead, rose behind", () => {
    expect(css).toMatch(/\.ranked-score-value \{ color: #e8c97a; \}/);
    expect(css).toMatch(/\[data-standing="leading"\] > \.ranked-score-value \{ color: #86d4a4; \}/);
    expect(css).toMatch(/\[data-standing="trailing"\] > \.ranked-score-value \{ color: #e2757b; \}/);
  });

  it("never gives its new test ids the `score-` prefix the banner sizes", () => {
    // `.ranked-banner [data-testid^="score-"]` sets a min-height; a child
    // matching it would grow the slot.
    render(<ScoreTally combatant={combatant} standing="leading" leadPulseId="lead:3" />);
    const matched = document.querySelectorAll('[data-testid^="score-"]');
    expect(matched).toHaveLength(1);
  });
});

describe("the lead-change glow", () => {
  it("mounts once per event id and survives re-renders within the beat", () => {
    const { rerender } = render(
      <ScoreTally combatant={combatant} standing="leading" leadPulseId="lead:3" />);
    const first = screen.getByTestId("ranked-lead-pulse-you");
    expect(first).toHaveAttribute("data-event", "lead:3");
    expect(first).toHaveClass("ranked-score-lead-pulse", "absolute");
    // A poll re-render with the same event keeps the SAME node: no replay.
    rerender(<ScoreTally combatant={{ ...combatant }} standing="leading" leadPulseId="lead:3" />);
    expect(screen.getByTestId("ranked-lead-pulse-you")).toBe(first);
    // A new settled event is a new node, i.e. a new one-shot.
    rerender(<ScoreTally combatant={combatant} standing="leading" leadPulseId="lead:7" />);
    expect(screen.getByTestId("ranked-lead-pulse-you")).not.toBe(first);
    // The beat ends: gone.
    rerender(<ScoreTally combatant={combatant} standing="leading" leadPulseId={null} />);
    expect(screen.queryByTestId("ranked-lead-pulse-you")).toBeNull();
  });

  it("is opacity/transform only and honours reduced motion", () => {
    const keyframes = /@keyframes ranked-score-lead-pulse \{([^}]*\}){3}/.exec(css)?.[0] ?? "";
    expect(keyframes).not.toBe("");
    expect(keyframes).not.toMatch(/width|height|margin|padding|top|left/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.ranked-score-lead-pulse \{ transform: none; \}/);
  });
});

describe("the clock face", () => {
  const timer = (over: Partial<TimerView> = {}): TimerView => ({
    durationSeconds: 30, remainingSeconds: 12, paused: false, urgent: false, ...over,
  });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("puts the standing on the secondary line instead of the round length", () => {
    render(<CentralStage timer={timer()} result={null} moduleTitle={null} moduleEventId={null}
      standing={{ label: "AHEAD BY 2 PTS", standing: "leading" }} />);
    const line = screen.getByTestId("central-duel-standing");
    expect(line).toHaveTextContent("AHEAD BY 2 PTS");
    expect(line).toHaveAttribute("data-standing", "leading");
    expect(screen.getByTestId("timer-display").textContent).not.toMatch(/shared round/);
  });

  it("keeps the round length when there is no duel, and 'time's up' over the standing", () => {
    const { rerender } = render(<CentralStage timer={timer()} result={null}
      moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("timer-display")).toHaveTextContent("of 0:30 shared round");
    rerender(<CentralStage timer={timer({ remainingSeconds: 0 })} result={null}
      moduleTitle={null} moduleEventId={null}
      standing={{ label: "TIED", standing: "tied" }} />);
    expect(screen.getByTestId("central-timer-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("central-duel-standing")).toBeNull();
  });

  it("a duel event takes the result face's secondary line; the award joins the verdict", () => {
    render(<CentralStage timer={timer()} result={{ verdict: "CORRECT", points: "+3 POINTS" }}
      moduleTitle={null} moduleEventId={null}
      standing={{ label: "BEHIND BY 3 PTS", standing: "trailing" }}
      event={{ label: "YOU TAKE THE LEAD", tone: "positive" }} />);
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("CORRECT +3");
    const line = screen.getByTestId("central-duel-event");
    expect(line).toHaveTextContent("YOU TAKE THE LEAD");
    expect(line).toHaveAttribute("data-tone", "positive");
    expect(line).toHaveClass("ranked-duel-event");
    expect(screen.queryByTestId("central-result")).toBeNull();
    expect(screen.queryByTestId("central-duel-standing")).toBeNull();
  });

  it("without an event the result face is exactly as before", () => {
    render(<CentralStage timer={timer()} result={{ verdict: "CORRECT", points: "+2 POINTS" }}
      moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("central-result-verdict").textContent).toBe("CORRECT");
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+2 POINTS");
    expect(screen.queryByTestId("central-duel-event")).toBeNull();
  });

  it("the event styles are colour and glow only", () => {
    const rules = css.match(/\.ranked-duel-event[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(4);
    for (const r of rules) expect(r).not.toMatch(/font-size|height|width|margin|padding|transform/);
  });

  it("marks only the urgent state with the urgency class, without resizing the digits", () => {
    const { rerender } = render(<CentralStage timer={timer()} result={null}
      moduleTitle={null} moduleEventId={null} />);
    const running = screen.getByTestId("timer-value");
    expect(running).not.toHaveClass("ranked-timer-urgent");
    const size = running.className.split(/\s+/).filter((c) => /text-(4xl|5xl|6xl)/.test(c));

    rerender(<CentralStage timer={timer({ remainingSeconds: 4, urgent: true })} result={null}
      moduleTitle={null} moduleEventId={null} />);
    const urgent = screen.getByTestId("timer-value");
    expect(urgent).toHaveAttribute("data-timer-state", "urgent");
    expect(urgent).toHaveClass("ranked-timer-urgent");
    expect(urgent.className.split(/\s+/).filter((c) => /text-(4xl|5xl|6xl)/.test(c))).toEqual(size);

    rerender(<CentralStage timer={timer({ remainingSeconds: 0, urgent: false })} result={null}
      moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("timer-value")).not.toHaveClass("ranked-timer-urgent");
  });

  it("urgency animates glow and opacity only, and stops under reduced motion", () => {
    const keyframes = /@keyframes ranked-timer-urgent \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(keyframes).toMatch(/text-shadow/);
    expect(keyframes).not.toMatch(/transform|scale|font-size/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.ranked-timer-urgent[\s\S]*?animation: none/);
  });
});

describe("the header record's tones", () => {
  const side = (over: Partial<ResolvedCombatantView>): ResolvedCombatantView => ({
    playerId: "you", outcome: "correct", finalDamageDealt: 0, finalDamageReceived: 0,
    shieldAbsorbed: 0, ...over,
  }) as ResolvedCombatantView;
  const settlement = (you: ResolvedCombatantView["outcome"], opp: ResolvedCombatantView["outcome"]) => ({
    roundNumber: 2, endReason: "both_answered",
    players: { p1: side({ outcome: you }), p2: side({ playerId: "opp", outcome: opp }) },
  }) as unknown as ResolvedRoundView;
  const fb = (basePoints: number): PointsFeedbackView => ({
    baseLabel: basePoints > 0 ? "CORRECT" : "INCORRECT", basePoints, speed: null,
    pointsAwarded: basePoints, scoreAfter: 4,
  });
  const verdict = () => screen.getByTestId("ranked-last-result-verdict");

  it("a scored CORRECT is green even when the opponent also scored", () => {
    render(<RoundResultBeat settlement={settlement("correct", "correct")} viewerSlot="p1"
      feedback={fb(2)} pointsMatch />);
    expect(screen.getByTestId("ranked-last-result")).toHaveAttribute("data-kind", "correct");
    expect(verdict()).toHaveClass("text-emerald-300");
  });

  it("INCORRECT and TIMED OUT are both rose", () => {
    const { unmount } = render(<RoundResultBeat settlement={settlement("incorrect", "correct")}
      viewerSlot="p1" feedback={fb(0)} pointsMatch />);
    expect(verdict()).toHaveClass("text-[#e2757b]");
    unmount();
    render(<RoundResultBeat settlement={settlement("timed_out", "correct")} viewerSlot="p1"
      feedback={{ ...fb(0), baseLabel: "TIMED OUT" }} pointsMatch />);
    expect(screen.getByTestId("ranked-last-result")).toHaveAttribute("data-kind", "timed-out");
    expect(verdict()).toHaveClass("text-[#e2757b]");
  });

  it("an hp match keeps the brass traded-round tone", () => {
    expect(pointsRecordKind("both-correct", null)).toBe("both-correct");
    render(<RoundResultBeat settlement={settlement("correct", "correct")} viewerSlot="p1" />);
    expect(screen.getByTestId("ranked-last-result")).toHaveAttribute("data-kind", "both-correct");
  });

  it("changes no plate geometry class between tones", () => {
    const plate = (you: ResolvedCombatantView["outcome"], points: number) => {
      const { unmount } = render(<RoundResultBeat settlement={settlement(you, "correct")}
        viewerSlot="p1" feedback={fb(points)} pointsMatch />);
      const geometry = screen.getByTestId("ranked-last-result").className.split(/\s+/)
        .filter((c) => /^(h-|px-|gap-|shrink-|rounded|border$)/.test(c));
      unmount();
      return geometry;
    };
    expect(plate("incorrect", 0)).toEqual(plate("correct", 2));
    expect(plate("timed_out", 0)).toEqual(plate("correct", 2));
  });
});
