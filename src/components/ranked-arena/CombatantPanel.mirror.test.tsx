/**
 * AI1 Phase 2B follow-up — the opponent column is the player column REFLECTED.
 *
 * The complaint this file exists for: the right-hand duelist did not read as
 * the mirror of the left-hand one. Two causes, both pinned below.
 *
 *  1. Rows that never learned about sides. The mascot slot, the identity row
 *     and the damage trail flipped; the HP meter, the XP meter, the status
 *     chips and the reveal verdict did not, so half the column reflected and
 *     half of it did not. There is now ONE rule (`isMirroredSide`) and every
 *     row derives from it — that is what these tests actually enforce, so a
 *     row added later cannot quietly opt out.
 *
 *  2. The artwork. See `RoleMascot.test.tsx`: the five plates are not drawn to
 *     one convention, and treating them as if they were pointed a Mid duelist
 *     out of the arena on BOTH columns.
 *
 * Geometry is asserted in the browser (jsdom has no layout), so what is pinned
 * here is the STRUCTURE that produces it: which rows reverse, which merely
 * re-align, and which must not move at all.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { CombatantPanel, isMirroredSide } from "./CombatantPanel";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";

afterEach(cleanup);

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "userA", name: "You", side: "player", tag: "Top", classId: "tank",
  roleId: "top", hp: 80, maxHp: 100, xp: 10, level: 1,
  currentLevelThreshold: 0, nextLevelThreshold: 100,
  hasSubmitted: false, abilityWindow: "open", hasAbilitySelected: false,
  ...over,
} as CombatantView);

const opponent = (over: Partial<CombatantView> = {}) =>
  combatant({ playerId: "userB", name: "Opponent", side: "opponent", roleId: "mid",
    tag: "Mid", ...over });

const DAMAGE = [{
  roundNumber: 1, outcome: "incorrect" as const, dealt: 0, taken: 9,
  absorbed: 0, hpBefore: 80, hpAfter: 71, timeExpired: false,
}];

/** Render both columns and hand back a lookup for each side's DOM. */
function bothColumns(props: Record<string, unknown> = {}) {
  const left = render(<CombatantPanel combatant={combatant()} damage={DAMAGE} {...props} />);
  const right = render(<CombatantPanel combatant={opponent()} damage={DAMAGE} {...props} />);
  return {
    L: left.container.querySelector("section")! as HTMLElement,
    R: right.container.querySelector("section")! as HTMLElement,
  };
}

/** Does this row reverse which end each group sits at? */
const reversed = (el: Element | null) => el !== null && el.className.includes("flex-row-reverse");
/** Does this row keep its order but move to the far end? */
const endAligned = (el: Element | null) => el !== null && el.className.includes("justify-end");

describe("the one side rule", () => {
  it("is the only thing that decides a column is a reflection", () => {
    expect(isMirroredSide(combatant())).toBe(false);
    expect(isMirroredSide(opponent())).toBe(true);
  });

  it("is derived from the combatant, so no caller can put a column on the wrong side", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/ranked-arena/CombatantPanel.tsx"), "utf8");
    // Every row must go through the shared helpers. A bare `side === "opponent"`
    // outside `isMirroredSide` is a row inventing its own idea of "mirrored",
    // which is exactly how the HP meter got left behind.
    const occurrences = src.match(/side === "opponent"/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});

describe("every row reflects, and reflects the right way", () => {
  it("reverses the rows that are two groups, and only those", () => {
    const { L, R } = bothColumns();
    // Identity row: name at the outer edge, role at the inner edge.
    const idRow = (s: HTMLElement) => s.querySelector("header > div");
    expect(reversed(idRow(L))).toBe(false);
    expect(reversed(idRow(R))).toBe(true);

    // HP: the label and the value swap ends. This row did NOT move before —
    // "HP" sat on the left of both columns while everything around it flipped.
    const hpRow = (s: HTMLElement) => s.querySelector('[data-testid^="hp-"] > div');
    expect(reversed(hpRow(L))).toBe(false);
    expect(reversed(hpRow(R))).toBe(true);

    // XP, the same, so a progression match cannot be half-reflected either.
    const xpRow = (s: HTMLElement) => s.querySelector('[data-testid^="xp-"] > div');
    expect(reversed(xpRow(L))).toBe(false);
    expect(reversed(xpRow(R))).toBe(true);
  });

  it("re-aligns the rows that are a SEQUENCE, without reversing them", () => {
    const { L, R } = bothColumns();
    // A reflection moves the ledger's heading to the other end of the card. It
    // must not turn the history round: the rows are newest-first and stay that
    // way on both columns.
    const heading = (s: HTMLElement) =>
      s.querySelector('[data-testid^="combat-ledger-"]')!.firstElementChild;
    expect(endAligned(heading(L))).toBe(false);
    expect(endAligned(heading(R))).toBe(true);
    expect(reversed(heading(R))).toBe(false);
    // Each ledger ROW is two groups (round + verdict, then damage) and does
    // reverse — the round marker sits at the column's outer edge on both sides.
    const row = (s: HTMLElement) => s.querySelector('[data-testid^="ledger-row-"]');
    expect(reversed(row(L))).toBe(false);
    expect(reversed(row(R))).toBe(true);

    // Same for the status chips: answer-then-ability is a reading order.
    const chips = (s: HTMLElement) => s.querySelector('[data-testid^="status-"]');
    expect(endAligned(chips(L))).toBe(false);
    expect(endAligned(chips(R))).toBe(true);
    expect(reversed(chips(R))).toBe(false);
  });

  it("reflects the reveal verdict, auto-margin and all", () => {
    const l = render(<CombatantPanel combatant={combatant()} outcome="correct" damageDealt={24} />);
    const lRow = l.container.querySelector('[data-testid^="outcome-"]')!;
    const lDmg = l.container.querySelector('[data-testid^="outcome-damage-"]')!;
    cleanup();
    const r = render(<CombatantPanel combatant={opponent()} outcome="correct" damageDealt={24} />);
    const rRow = r.container.querySelector('[data-testid^="outcome-"]')!;
    const rDmg = r.container.querySelector('[data-testid^="outcome-damage-"]')!;

    expect(reversed(lRow)).toBe(false);
    expect(reversed(rRow)).toBe(true);
    // The auto margin has to change side with the row: in a reversed row
    // `ml-auto` still pushes physically right, which would park the damage
    // number back against the verdict instead of across from it.
    expect(lDmg.className).toContain("ml-auto");
    expect(rDmg.className).toContain("mr-auto");
    expect(rDmg.className).not.toContain("ml-auto");
  });

  it("does not reflect what is a KIND difference rather than a direction", () => {
    const { L, R } = bothColumns();
    // You are blue and they are red on both columns. A mirror must not swap
    // which duelist is which.
    expect(L.className).toContain("border-primary/60");
    expect(R.className).toContain("border-destructive/50");
  });

  it("puts the two mascots' slots in structurally identical positions", () => {
    const { L, R } = bothColumns();
    const slot = (s: HTMLElement) => s.querySelector('[data-testid="role-crest"]')!;
    // Same classes on both = same size, same padding, same headroom, same glow
    // treatment, same distance from the header. Nothing about the slot is
    // side-aware, which is the point: only the mascot inside it turns.
    expect(slot(L).className).toBe(slot(R).className);
    // ...and it is the first thing in the column on both sides.
    for (const s of [L, R]) {
      expect(s.firstElementChild).toBe(slot(s));
    }
  });

  it("keeps both columns structurally identical when only ONE side has a role", () => {
    // THE MIXED MATCH, which is every bot match: the human has a role and the
    // bot legitimately has none. This used to be the asymmetry itself — the
    // human stood up a full-height mascot slot and the bot fell through to a
    // 48px class bust in the header, so the two columns were not the same
    // object at all. `identityMode` is a MATCH fact, so both columns take the
    // role branch and the slot's geometry is identical; only what stands in it
    // differs.
    const left = render(<CombatantPanel damage={DAMAGE} progressionEnabled={false}
      combatant={combatant({ identityMode: "role" })} />);
    const right = render(<CombatantPanel damage={DAMAGE} progressionEnabled={false}
      combatant={opponent({ identityMode: "role", roleId: null, tag: undefined })} />);
    const L = left.container.querySelector("section")! as HTMLElement;
    const R = right.container.querySelector("section")! as HTMLElement;

    const slot = (s: HTMLElement) => s.querySelector('[data-testid="role-crest"]')!;
    // Same slot, same classes, same position: first child of the column.
    expect(slot(L).className).toBe(slot(R).className);
    expect(L.firstElementChild).toBe(slot(L));
    expect(R.firstElementChild).toBe(slot(R));
    // The role-less side draws the neutral emblem in the mascot's own box, at
    // the same fraction of the column — not a 48px badge in the header.
    const art = (s: HTMLElement) => s.querySelector(
      '[data-testid="role-crest-mascot"], [data-testid="role-crest-neutral"]',
    )! as HTMLElement;
    for (const cls of ["aspect-[6/7]", "w-[52%]", "min-w-[3.5rem]", "max-w-[9rem]"]) {
      expect(art(L).className).toContain(cls);
      expect(art(R).className).toContain(cls);
    }
    // No legacy class art, and no class NAME, anywhere on the role-less column.
    expect(R.querySelector('[data-testid="class-portrait"]')).toBeNull();
    expect(R.textContent).not.toMatch(/tank/i);
    // Both columns still carry the same ROWS, in the same order.
    const rows = (s: HTMLElement) => Array.from(s.children)
      .map((c) => c.getAttribute("data-testid")?.replace(/user[AB]/, "…") ?? c.tagName);
    expect(rows(L)).toEqual(rows(R));
  });

  it("turns both mascots inward, and states nothing else about direction", () => {
    const { L, R } = bothColumns();
    const m = (s: HTMLElement) => s.querySelector('[data-testid="role-crest-mascot"]') as HTMLElement;
    expect(m(L).dataset.facing).toBe("right");
    expect(m(R).dataset.facing).toBe("left");
    // The arena says which way each mascot LOOKS. Whether that needed the
    // plate flipping is the component's business and differs by role, which is
    // why the two columns can disagree here while both face the centre.
    expect(m(L).dataset.role).toBe("top");
    expect(m(R).dataset.role).toBe("mid");
    expect(m(L).dataset.plateFlipped).toBeUndefined();  // top is drawn facing right
    expect(m(R).dataset.plateFlipped).toBeUndefined();  // mid is drawn facing left
  });
});
