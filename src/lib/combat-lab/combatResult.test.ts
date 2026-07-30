/**
 * Contract for the Combat Lab's user-facing result model.
 *
 * Two things are pinned here: engine vocabulary never becomes a headline, and no
 * figure is produced that the response did not report.
 */
import { describe, expect, it } from "vitest";
import {
  isInternalEngineToken,
  summarizeCombatResult,
  userFacingEventName,
} from "./combatResult";
import type { TimelineEvent } from "./api";

describe("isInternalEngineToken", () => {
  it("rejects the engine's own type names", () => {
    for (const token of [
      "damage_packet",
      "item_damage",
      "champion_ability",
      "rune_shield",
      "BASIC_ATTACK_DAMAGE",
      "HEAL_APPLIED",
    ]) {
      expect(isInternalEngineToken(token), token).toBe(true);
    }
  });

  it("accepts names a player would recognise", () => {
    for (const name of ["Basic Attack", "Q1 Sweetspot", "Rend", "Death Lotus"]) {
      expect(isInternalEngineToken(name), name).toBe(false);
    }
  });

  it("treats blanks and non-strings as unusable", () => {
    expect(isInternalEngineToken("")).toBe(true);
    expect(isInternalEngineToken("   ")).toBe(true);
    expect(isInternalEngineToken(undefined)).toBe(true);
    expect(isInternalEngineToken(null)).toBe(true);
    expect(isInternalEngineToken(42)).toBe(true);
  });
});

describe("userFacingEventName", () => {
  it("returns null rather than surfacing damage_packet", () => {
    const event = {
      type: "damage_packet",
      state: "BASIC_ATTACK_DAMAGE",
      source: "basic_attack",
      final_damage: 107,
    } as unknown as TimelineEvent;
    expect(userFacingEventName(event)).toBeNull();
  });

  it("uses a readable source when the engine supplies one", () => {
    const event = { type: "damage_packet", source: "Basic Attack" } as unknown as TimelineEvent;
    expect(userFacingEventName(event)).toBe("Basic Attack");
  });

  it("handles a missing event", () => {
    expect(userFacingEventName(null)).toBeNull();
  });
});

const packet = (over: Record<string, unknown> = {}) =>
  ({
    type: "damage_packet",
    source: "Basic Attack",
    final_damage: 107,
    damage_type: "physical",
    ...over,
  }) as unknown as TimelineEvent;

describe("summarizeCombatResult", () => {
  it("reads a single-type hit as that type", () => {
    const r = summarizeCombatResult({ final_damage: 107, damage_type: "physical", events: [packet()] });
    expect(r.tone).toBe("physical");
    expect(r.amount).toBe(107);
    expect(r.headline).toBe("PHYSICAL DAMAGE");
  });

  it("names magic and true damage correctly", () => {
    expect(
      summarizeCombatResult({ events: [packet({ damage_type: "magic" })] }).headline,
    ).toBe("MAGIC DAMAGE");
    expect(
      summarizeCombatResult({ events: [packet({ damage_type: "true" })] }).headline,
    ).toBe("TRUE DAMAGE");
  });

  it("calls a multi-type action mixed rather than picking one", () => {
    const r = summarizeCombatResult({
      final_damage: 150,
      events: [packet({ final_damage: 100 }), packet({ final_damage: 50, damage_type: "magic" })],
    });
    expect(r.tone).toBe("mixed");
    expect(r.headline).toBe("MIXED DAMAGE");
    expect(r.amount).toBe(150);
    expect(r.byType).toMatchObject({ physical: 100, magic: 50 });
  });

  it("falls back to the action total when the events carry no types", () => {
    const r = summarizeCombatResult({ final_damage: 80, damage_type: null, events: [] });
    expect(r.amount).toBe(80);
    expect(r.headline).toBe("DAMAGE");
    expect(r.tone).toBe("mixed");
  });

  it("reports healing from the event's own metadata", () => {
    const r = summarizeCombatResult({
      final_damage: 0,
      events: [
        {
          type: "heal",
          damage_type: "healing",
          final_damage: 0,
          metadata: { final_heal: 63.5 },
        } as unknown as TimelineEvent,
      ],
    });
    expect(r.tone).toBe("healing");
    expect(r.headline).toBe("HEALING");
    expect(r.amount).toBe(63.5);
  });

  it("reports a shield from the event's own metadata", () => {
    const r = summarizeCombatResult({
      final_damage: 0,
      events: [
        { type: "item_shield", final_damage: 0, metadata: { shield: 320 } } as unknown as TimelineEvent,
      ],
    });
    expect(r.tone).toBe("shield");
    expect(r.headline).toBe("SHIELDED");
    expect(r.amount).toBe(320);
  });

  it("mentions an absorbing shield alongside damage that still landed", () => {
    const r = summarizeCombatResult({
      final_damage: 40,
      damage_type: "physical",
      shield_absorbed: 67,
      events: [packet({ final_damage: 40 })],
    });
    expect(r.tone).toBe("physical");
    expect(r.amount).toBe(40);
    expect(r.shielded).toBe(67);
  });

  it("says no damage instead of inventing one", () => {
    const r = summarizeCombatResult({ final_damage: 0, damage_type: null, events: [] });
    expect(r.tone).toBe("none");
    expect(r.headline).toBe("NO DAMAGE");
    expect(r.amount).toBe(0);
  });

  it("survives a malformed response", () => {
    const r = summarizeCombatResult({
      final_damage: Number.NaN,
      events: [null as unknown as TimelineEvent, {} as TimelineEvent],
    });
    expect(r.tone).toBe("none");
    expect(r.amount).toBe(0);
  });
});
