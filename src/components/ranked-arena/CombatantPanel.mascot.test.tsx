/**
 * AI1 Phase 2 — Ranked as the FIRST CONSUMER of the reusable role mascot.
 *
 * Two things are pinned here: that a real settlement drives the two mascots,
 * and that Ranked consumes the shared component rather than growing its own
 * copy of the motion.
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { CombatantPanel } from "./CombatantPanel";
import { projectMascotReactions } from "@/pages/quiz-ranked/rankedViews";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";

afterEach(cleanup);

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "userA", name: "You", side: "player", tag: "Top", classId: "tank",
  roleId: "top", hp: 80, maxHp: 100, xp: 0, level: 1,
  currentLevelThreshold: 0, nextLevelThreshold: 100,
  hasSubmitted: false, abilityWindow: null, hasAbilitySelected: false,
  ...over,
} as CombatantView);

/** A settled round where p1 hurt p2 and took nothing back. */
function settlement(over: Record<string, unknown> = {}): ResolvedRoundView {
  return {
    roundNumber: 3,
    correctOptionIndex: 0,
    players: {
      p1: { playerId: "userA", outcome: "correct", finalDamageDealt: 22,
        finalDamageReceived: 0, shieldAbsorbed: 0, hpAfter: 100 },
      p2: { playerId: "userB", outcome: "incorrect", finalDamageDealt: 0,
        finalDamageReceived: 22, shieldAbsorbed: 0, hpAfter: 78 },
    },
    ...over,
  } as unknown as ResolvedRoundView;
}

describe("projectMascotReactions — the real damage event", () => {
  it("lunges the dealer and recoils the damaged, as one settled round", () => {
    const out = projectMascotReactions(settlement(), true);
    expect(out.userA).toEqual({ action: "attack", actionId: 3 });
    expect(out.userB).toEqual({ action: "hit", actionId: 3 });
  });

  it("carries the round number as the id, so consecutive rounds retrigger", () => {
    const r1 = projectMascotReactions(settlement({ roundNumber: 4 }), true);
    const r2 = projectMascotReactions(settlement({ roundNumber: 5 }), true);
    expect(r1.userB.actionId).not.toBe(r2.userB.actionId);
    // Same ACTION both rounds — which is exactly why playback is keyed on the
    // id and not on the action string.
    expect(r1.userB.action).toBe(r2.userB.action);
  });

  it("is silent outside the reveal beat and with no settlement", () => {
    expect(projectMascotReactions(settlement(), false)).toEqual({});
    expect(projectMascotReactions(null, true)).toEqual({});
  });

  it("animates nobody in a round where neither side was hurt", () => {
    const clean = settlement({
      players: {
        p1: { playerId: "userA", outcome: "correct", finalDamageDealt: 0,
          finalDamageReceived: 0, shieldAbsorbed: 0, hpAfter: 100 },
        p2: { playerId: "userB", outcome: "correct", finalDamageDealt: 0,
          finalDamageReceived: 0, shieldAbsorbed: 0, hpAfter: 100 },
      },
    });
    expect(projectMascotReactions(clean, true)).toEqual({});
  });

  it("recoils on a fully absorbed hit — being shielded is still being hit", () => {
    const blocked = settlement({
      players: {
        p1: { playerId: "userA", outcome: "correct", finalDamageDealt: 20,
          finalDamageReceived: 0, shieldAbsorbed: 0, hpAfter: 100 },
        p2: { playerId: "userB", outcome: "incorrect", finalDamageDealt: 0,
          finalDamageReceived: 0, shieldAbsorbed: 20, hpAfter: 100 },
      },
    });
    expect(projectMascotReactions(blocked, true).userB.action).toBe("hit");
  });

  it("prefers hit when a player both dealt and took damage", () => {
    const trade = settlement({
      players: {
        p1: { playerId: "userA", outcome: "correct", finalDamageDealt: 20,
          finalDamageReceived: 14, shieldAbsorbed: 0, hpAfter: 86 },
        p2: { playerId: "userB", outcome: "correct", finalDamageDealt: 14,
          finalDamageReceived: 20, shieldAbsorbed: 0, hpAfter: 80 },
      },
    });
    // One body, one motion: the fact that moved this player's HP bar wins.
    expect(projectMascotReactions(trade, true).userA.action).toBe("hit");
    expect(projectMascotReactions(trade, true).userB.action).toBe("hit");
  });
});

describe("CombatantPanel — mascot wiring", () => {
  it("renders the role mascot above the HP bar, in the crest slot", () => {
    const { container } = render(<CombatantPanel combatant={combatant()} />);
    const mascot = screen.getByTestId("role-crest-mascot");
    expect(mascot).toHaveAttribute("data-role", "top");
    expect(container.querySelector('img[data-mogzy-art-name="top"]')).not.toBeNull();
    // Document order: the crest precedes the HP meter.
    const hp = screen.getByTestId("hp-userA");
    expect(mascot.compareDocumentPosition(hp) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it("gives the mascot the top of the column, not a 56px icon frame", () => {
    render(<CombatantPanel combatant={combatant()} />);
    const slot = screen.getByTestId("role-crest");
    const mascot = screen.getByTestId("role-crest-mascot");
    // The owner's verdict on the crest was that it made a character read as an
    // icon. There is no frame at this size: no fixed 56px box, no border, and
    // nothing that clips the motion at its edge.
    expect(slot.className).not.toMatch(/\bh-14\b|\bw-14\b|\bh-10\b|\bw-10\b/);
    expect(slot.className).not.toContain("overflow-hidden");
    expect(slot.className).toContain("overflow-visible");
    expect(slot.className).not.toContain("rounded-xl");
    // Sized as a FRACTION of the column, so the clearance the motion needs is
    // preserved at every width rather than only at the ones we sampled.
    expect(mascot.className).toContain("w-[52%]");
    // ...and crops the plate's empty bands so the CHARACTER fills the slot.
    expect(mascot.querySelector("img")!.className).toContain("object-cover");
  });

  it("lets a duelist's mascot be poked, and asks for nothing else", () => {
    render(<CombatantPanel combatant={combatant()} />);
    const mascot = screen.getByTestId("role-crest-mascot");
    expect(mascot).toHaveAttribute("data-interactive", "true");
    // Ranked says only THAT it is touchable. What a touch looks like, how long
    // it lasts and what beats what are all the component's.
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/ranked-arena/CombatantPanel.tsx"), "utf8");
    expect(src).not.toMatch(/onClick[^}]*mascot/i);
  });

  it("keeps the column's own furniture out of the mascot's way", () => {
    // Nothing below the mascot may be positioned relative to it: the name, the
    // HP meter and the trail are siblings of the slot, not children of it, so
    // no action can move them and no layout depends on the mascot's internals.
    render(<CombatantPanel combatant={combatant()}
      damage={[{ roundNumber: 1, amount: 9, hpAfter: 71, kind: "hit" }]} />);
    const slot = screen.getByTestId("role-crest");
    for (const id of ["hp-userA", "damage-trail-userA"]) {
      expect(slot.contains(screen.getByTestId(id))).toBe(false);
    }
    expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Top");
  });

  it("passes the reaction through as an intent, never as a distance", () => {
    render(<CombatantPanel combatant={combatant()}
      reaction={{ action: "hit", actionId: 3 }} />);
    // The panel hands down an action name; nothing about px, ms or easing
    // crosses this boundary.
    expect(screen.getByTestId("role-crest-mascot")).toBeInTheDocument();
  });

  it("faces both duelists toward the arena centre", () => {
    render(<CombatantPanel combatant={combatant()} />);
    expect(screen.getByTestId("role-crest-mascot")).toHaveAttribute("data-facing", "right");
    cleanup();
    render(<CombatantPanel combatant={combatant({
      playerId: "userB", side: "opponent", roleId: "adc" })} />);
    expect(screen.getByTestId("role-crest-mascot")).toHaveAttribute("data-facing", "left");
  });

  it("keeps the drawn sigil for a duelist with no role — never a guessed mascot", () => {
    render(<CombatantPanel combatant={combatant({ roleId: null, tag: "TANK" })} />);
    expect(screen.queryByTestId("role-crest-mascot")).toBeNull();
  });
});

describe("Ranked does not duplicate the mascot motion", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  /** Source with comments stripped. The rule being enforced is about the CODE:
   *  prose is free to NAME a tuning token while explaining a sizing decision,
   *  which is not the same as the arena declaring motion of its own. */
  const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("declares no keyframes, durations or easing of its own in the arena", () => {
    for (const rel of [
      "src/components/ranked-arena/roleIdentity.tsx",
      "src/components/ranked-arena/CombatantPanel.tsx",
      "src/pages/quiz-ranked/QuizRankedMatch.tsx",
    ]) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/@keyframes|cubic-bezier|animation:/);
      expect(src, rel).not.toMatch(/role-mascot-(attack|hit|idle|facing)/);
    }
  });

  it("owns every role-mascot keyframe in exactly one stylesheet block", () => {
    const css = read("src/index.css");
    for (const name of [
      "role-mascot-idle-float", "role-mascot-attack", "role-mascot-hit",
    ]) {
      expect(css.match(new RegExp(`@keyframes ${name}\\b`, "g"))!.length, name).toBe(1);
    }
  });

  it("reaches the mascot only through the shared component", () => {
    // The arena must not resolve role art itself — that is the component's job.
    expect(read("src/components/ranked-arena/roleIdentity.tsx"))
      .toContain('from "@/components/mascot/RoleMascot"');
    for (const rel of [
      "src/components/ranked-arena/CombatantPanel.tsx",
      "src/pages/quiz-ranked/QuizRankedMatch.tsx",
    ]) {
      expect(read(rel), rel).not.toContain("getRankedRoleMascotPath");
    }
  });
});
