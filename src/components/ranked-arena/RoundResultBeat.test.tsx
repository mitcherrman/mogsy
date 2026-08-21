/**
 * THE ROUND-RESOLUTION BEAT — the top HUD's four states.
 *
 * These pin the vocabulary and the geometry, not the pixels. What matters is
 * that each of the four states is DISTINGUISHABLE (icon and word, never colour
 * alone), that "both correct" is not sold as a solo win, that every value is
 * settlement pass-through, and that the plate's box is a constant so a round
 * resolving cannot move the round title or the clock beside it.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { resultConsequence, resultKind, RoundResultBeat } from "./RoundResultBeat";
import type { ResolvedCombatantView, ResolvedRoundView } from "@/lib/ranked-core/viewTypes";

afterEach(cleanup);

function player(id: string, over: Partial<ResolvedCombatantView> = {}): ResolvedCombatantView {
  return {
    playerId: id, outcome: "correct", submittedAt: null, answeredFirst: false,
    timedOut: false, abilityId: null, abilityName: "No Ability",
    baseDamageDealt: 0, outgoingBonus: 0, finalDamageDealt: 0,
    finalDamageReceived: 0, shieldAbsorbed: 0, incomingReduction: 0,
    hpBefore: 170, hpAfter: 170, reachedZeroHp: false,
    xpGained: 0, totalXpAfter: 0, levelBefore: 1, levelAfter: 1,
    leveledUp: false, levelUpEvents: [], chargeConsumed: false,
    consumedAbilityId: null, remainingChargesAfterRound: {},
    effectsGained: [], effectsConsumed: [], consecutiveCorrect: 0,
    combatLabUnlockDeltaSeconds: 0, ...over,
  };
}

function settlement(
  p1: Partial<ResolvedCombatantView>, p2: Partial<ResolvedCombatantView> = {},
  round = 5,
): ResolvedRoundView {
  return {
    matchId: "m1", roundNumber: round, questionId: null,
    endReason: "both_answered", pressureApplied: false,
    sharedNextRoundDurationSeconds: 30, sharedTimerDeltaSeconds: 0,
    winner: null, matchOver: false, completionReason: null, summary: "",
    correctOptionIndex: null,
    players: { p1: player("userA", p1), p2: player("userB", p2) },
  };
}

const beat = () => screen.getByTestId("ranked-last-result");
const verdict = () => screen.getByTestId("ranked-last-result-verdict");
const consequence = () => screen.getByTestId("ranked-last-result-consequence");

describe("the four result states", () => {
  it("CORRECT — the viewer alone got it right, with the damage they dealt", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "correct", finalDamageDealt: 14 },
      { outcome: "incorrect", finalDamageReceived: 14 })} />);
    expect(beat()).toHaveAttribute("data-kind", "correct");
    expect(verdict()).toHaveTextContent("Correct");
    expect(consequence()).toHaveTextContent("14 DAMAGE");
  });

  it("INCORRECT — names the consequence, not just the verdict", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "incorrect", finalDamageReceived: 10 },
      { outcome: "correct", finalDamageDealt: 10 })} />);
    expect(beat()).toHaveAttribute("data-kind", "incorrect");
    expect(verdict()).toHaveTextContent("Incorrect");
    expect(consequence()).toHaveTextContent("10 DAMAGE TAKEN");
  });

  it("TIMED OUT — its own state, never folded into incorrect", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "timed_out", timedOut: true, finalDamageReceived: 10 },
      { outcome: "correct", finalDamageDealt: 10 })} />);
    expect(beat()).toHaveAttribute("data-kind", "timed-out");
    expect(verdict()).toHaveTextContent("Timed out");
    expect(consequence()).toHaveTextContent("10 DAMAGE TAKEN");
  });

  it("BOTH CORRECT — a traded round, and NOT the solo-correct treatment", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "correct", finalDamageDealt: 7 },
      { outcome: "correct", finalDamageReceived: 7 })} />);
    expect(beat()).toHaveAttribute("data-kind", "both-correct");
    expect(verdict()).toHaveTextContent("Both correct");
    expect(consequence()).toHaveTextContent("7 DAMAGE");
  });

  it("gives each state a distinct tone AND a distinct word", () => {
    // Never colour alone: the four states differ in `data-kind`, in the
    // verdict word, and in the icon that accompanies it.
    const kinds = new Set<string>();
    const words = new Set<string>();
    const cases: [Partial<ResolvedCombatantView>, Partial<ResolvedCombatantView>][] = [
      [{ outcome: "correct" }, { outcome: "incorrect" }],
      [{ outcome: "correct" }, { outcome: "correct" }],
      [{ outcome: "incorrect" }, { outcome: "correct" }],
      [{ outcome: "timed_out", timedOut: true }, { outcome: "correct" }],
    ];
    for (const [p1, p2] of cases) {
      render(<RoundResultBeat viewerSlot="p1" settlement={settlement(p1, p2)} />);
      kinds.add(beat().getAttribute("data-kind")!);
      words.add(verdict().textContent!);
      expect(beat().querySelector("svg")).not.toBeNull();
      cleanup();
    }
    expect(kinds.size).toBe(4);
    expect(words.size).toBe(4);
  });

  it("carries the outcome and the round straight from the settlement", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "incorrect" }, { outcome: "correct" }, 12)} />);
    expect(beat()).toHaveAttribute("data-outcome", "incorrect");
    expect(beat()).toHaveAttribute("data-round", "12");
    expect(beat()).toHaveTextContent("R12");
  });

  it("reads from the viewer's OWN slot", () => {
    const s = settlement({ outcome: "correct", finalDamageDealt: 9 },
                         { outcome: "incorrect", finalDamageReceived: 9 });
    render(<RoundResultBeat viewerSlot="p2" settlement={s} />);
    expect(beat()).toHaveAttribute("data-kind", "incorrect");
    expect(consequence()).toHaveTextContent("9 DAMAGE TAKEN");
  });
});

describe("the consequence line", () => {
  it("keeps dealt and taken separate when a round produced both", () => {
    // Collapsing them to a net figure would invent a value the settlement does
    // not contain.
    expect(resultConsequence(player("userA", {
      finalDamageDealt: 10, finalDamageReceived: 4 }))).toBe("10 DEALT · 4 TAKEN");
  });

  it("reports a fully absorbed instance as its own fact", () => {
    expect(resultConsequence(player("userA", { shieldAbsorbed: 8 })))
      .toBe("8 ABSORBED");
  });

  it("says so when a round cost nobody health", () => {
    expect(resultConsequence(player("userA"))).toBe("NO DAMAGE");
  });
});

describe("result kind", () => {
  it("only calls it BOTH CORRECT when both actually were", () => {
    const c = player("x", { outcome: "correct" });
    const i = player("y", { outcome: "incorrect" });
    const t = player("z", { outcome: "timed_out" });
    expect(resultKind(c, c)).toBe("both-correct");
    expect(resultKind(c, i)).toBe("correct");
    expect(resultKind(c, t)).toBe("correct");
  });

  it("keeps a shared FAILURE in the viewer's own tone", () => {
    // "Both incorrect" and "Both timed out" are still the viewer being wrong
    // or out of time; the verdict text already says "Both". Only the shared
    // SUCCESS needed its own tone, because that is the one a single tone would
    // have mis-sold as a win.
    const i = player("y", { outcome: "incorrect" });
    const t = player("z", { outcome: "timed_out" });
    expect(resultKind(i, i)).toBe("incorrect");
    expect(resultKind(t, t)).toBe("timed-out");
  });
});

describe("geometry and motion", () => {
  it("occupies one FIXED box whatever the state says", () => {
    // The plate lives inside the header strip's already-reserved min-height.
    // A taller or wrapping state would grow the strip and move the clock.
    const cases: [Partial<ResolvedCombatantView>, Partial<ResolvedCombatantView>][] = [
      [{ outcome: "correct", finalDamageDealt: 14 }, { outcome: "incorrect" }],
      [{ outcome: "correct", finalDamageDealt: 999, finalDamageReceived: 999 },
       { outcome: "correct" }],
      [{ outcome: "timed_out", timedOut: true }, { outcome: "timed_out", timedOut: true }],
    ];
    const boxes = new Set<string>();
    for (const [p1, p2] of cases) {
      render(<RoundResultBeat viewerSlot="p1" settlement={settlement(p1, p2)} />);
      const cls = beat().className;
      expect(cls).toContain("h-10");
      expect(cls).toContain("whitespace-nowrap");
      expect(cls).toContain("shrink-0");
      boxes.add([...cls.split(/\s+/)].filter(
        (c) => c.startsWith("h-") || c === "whitespace-nowrap" || c === "shrink-0",
      ).sort().join(" "));
      cleanup();
    }
    expect(boxes.size).toBe(1);
  });

  it("carries the animation hook, whose reduced-motion path is in the stylesheet", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "correct" }, { outcome: "incorrect" })} />);
    // The class is the only motion contract this component owns: distances,
    // durations and the `prefers-reduced-motion` fallback all live in
    // `.ranked-result-beat` (index.css), keyed off `data-kind`.
    expect(beat().className).toContain("ranked-result-beat");
    expect(beat()).toHaveAttribute("data-kind", "correct");
  });

  it("is presentation only: no control, no live region, no pointer target", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "correct" }, { outcome: "incorrect" })} />);
    expect(beat().querySelector("button")).toBeNull();
    expect(beat().querySelector("a")).toBeNull();
    // `role="status"` without `aria-live`: the duelist columns already
    // announce the verdict once during the beat.
    expect(beat()).toHaveAttribute("role", "status");
    expect(beat().getAttribute("aria-live")).toBeNull();
  });

  it("describes the whole result to a screen reader in one label", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "incorrect", finalDamageReceived: 10 },
      { outcome: "correct", finalDamageDealt: 10 }, 4)} />);
    expect(beat()).toHaveAttribute(
      "aria-label", "Round 4 result: Incorrect, 10 damage taken");
  });
});

/**
 * The motion contract itself lives in the stylesheet, so it is asserted there.
 * Two things must hold and neither is visible from the component: the entrance
 * and the emphasis must not fight over `transform`, and reduced motion must
 * still deliver the result.
 */
describe("the stylesheet's motion contract", () => {
  const css = fs.readFileSync(
    path.join(process.cwd(), "src/index.css"), "utf8");
  const block = css.slice(
    css.indexOf(".ranked-result-beat {"),
    css.indexOf("/* ---- Question folio"));

  it("defines an entrance for every state", () => {
    expect(block).toContain("@keyframes ranked-result-in");
    for (const kind of ["correct", "both-correct", "incorrect", "timed-out"]) {
      expect(block).toContain(`.ranked-result-beat[data-kind="${kind}"]`);
    }
  });

  it("does not let the jolt fill backwards over the entrance", () => {
    // Two animations touching `transform` fight, and the later one in the list
    // wins for as long as it applies. A jolt with `fill-mode: both` would own
    // `transform` from t=0 and erase the entrance completely.
    const jolt = block.slice(block.indexOf('[data-kind="incorrect"]'));
    const rule = jolt.slice(0, jolt.indexOf("}"));
    expect(rule).toContain("animation-fill-mode: both, none");
    // ...and it starts only once the entrance has finished.
    expect(rule).toMatch(/animation-delay:\s*0ms,\s*300ms/);
    expect(rule).toMatch(/animation-duration:\s*300ms,\s*300ms/);
  });

  it("keeps the whole beat short", () => {
    // Longest state = entrance + emphasis, and it must land well inside the
    // settlement hold rather than adding a delay of its own.
    const durations = [...block.matchAll(/animation-duration:\s*([^;]+);/g)]
      .flatMap((m) => m[1].split(",").map((v) => parseInt(v.trim(), 10)));
    for (const d of durations) expect(d).toBeLessThanOrEqual(900);
  });

  it("still delivers the result under prefers-reduced-motion, with no motion", () => {
    const reduced = css.slice(css.indexOf("@keyframes ranked-result-fade"));
    const rule = reduced.slice(0, reduced.indexOf("\n}\n}"));
    // The information still arrives...
    expect(rule).toContain("animation-name: ranked-result-fade");
    expect(reduced).toMatch(/ranked-result-fade\s*\{[\s\S]*?opacity: 1/);
    // ...with no travel, no scale and no pulse, for every state.
    expect(rule).toContain("transform: none");
    expect(rule).toContain("box-shadow: none");
    for (const kind of ["correct", "both-correct", "incorrect", "timed-out"]) {
      expect(rule).toContain(`[data-kind="${kind}"]`);
    }
  });
});
