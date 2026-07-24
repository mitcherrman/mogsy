/**
 * Canonical transition-classification coverage (J5).
 *
 * The backend projection (`applied_transition_view` / `_transition_view`,
 * mastery/publication/projections.py) can emit EXACTLY these classifications:
 *   authored_effect, health_change, state_unchanged,
 *   level_change, ability_rank_change, gold_set, gold_spend, item_acquire.
 *
 * Every one must parse — a missing arm breaks a public journey at that step
 * (the Olaf gold-checkpoint incident, 2026-07-23). Payload shapes below mirror
 * the backend projection field-for-field.
 */
import { describe, expect, it } from "vitest";

import {
  PROGRESSION_CLASSIFICATIONS,
  TRANSITION_CLASSIFICATIONS,
  readTransitionView,
} from "./transitionView";

const TXN = "txn_5f76cf036fd63439f59c2c9b867fa96fe49cd46298d14bb55216fd2f6956b5ae";

describe("canonical classification inventory", () => {
  it("matches the backend projection inventory exactly", () => {
    expect([...TRANSITION_CLASSIFICATIONS].sort()).toEqual(
      [
        "ability_rank_change",
        "authored_effect",
        "gold_set",
        "gold_spend",
        "health_change",
        "item_acquire",
        "level_change",
        "state_unchanged",
      ].sort(),
    );
    for (const p of PROGRESSION_CLASSIFICATIONS) {
      expect(TRANSITION_CLASSIFICATIONS).toContain(p);
    }
  });

  it("rejects a classification outside the canonical inventory", () => {
    expect(() =>
      readTransitionView({ classification: "item_sale", label: "x" }),
    ).toThrow(/classification/);
  });
});

describe("readTransitionView parses every canonical classification", () => {
  it("authored_effect", () => {
    const t = readTransitionView({
      classification: "authored_effect", origin: "authored_inter_step",
      transition_id: TXN, target: "A",
      label: "Authored +20 ability haste on Ahri",
      effect: "ability_haste", magnitude: 20, unit: "ability_haste", applied: true,
    });
    expect(t.classification).toBe("authored_effect");
  });

  it("health_change", () => {
    const t = readTransitionView({
      classification: "health_change", origin: "question_proposed",
      transition_id: TXN, target: "B", label: "250 damage applied to Syndra",
      before_value: 480, after_value: 230, delta: -250, unit: "health", applied: true,
    });
    expect(t.classification).toBe("health_change");
  });

  it("state_unchanged", () => {
    const t = readTransitionView({ classification: "state_unchanged", label: "State unchanged" });
    expect(t.classification).toBe("state_unchanged");
  });

  it("level_change (before/after values, unit 'level')", () => {
    const t = readTransitionView({
      classification: "level_change", origin: "authored_inter_step",
      transition_id: TXN, target: "A", label: "Olaf reaches level 6",
      before_value: 1, after_value: 6, unit: "level", applied: true,
    });
    expect(t.classification).toBe("level_change");
    if (t.classification === "level_change") {
      expect(t.beforeValue).toBe(1);
      expect(t.afterValue).toBe(6);
      expect(t.delta).toBeNull();
      expect(t.item).toBeNull();
    }
  });

  it("ability_rank_change (ability_key, after value only)", () => {
    const t = readTransitionView({
      classification: "ability_rank_change", origin: "authored_inter_step",
      transition_id: TXN, target: "A", label: "Olaf ranks up E to 2",
      ability_key: "E", after_value: 2, unit: "rank", applied: true,
    });
    expect(t.classification).toBe("ability_rank_change");
    if (t.classification === "ability_rank_change") {
      expect(t.abilityKey).toBe("E");
      expect(t.afterValue).toBe(2);
      expect(t.beforeValue).toBeNull(); // backend omits it; must not throw
    }
  });

  it("gold_set (the Olaf incident payload — after value only)", () => {
    const t = readTransitionView({
      classification: "gold_set", origin: "authored_inter_step",
      transition_id: TXN, target: "A", label: "Olaf recalls with 1,100 gold",
      after_value: 1100, unit: "gold", applied: true,
    });
    expect(t.classification).toBe("gold_set");
    if (t.classification === "gold_set") {
      expect(t.afterValue).toBe(1100);
      expect(t.beforeValue).toBeNull();
      expect(t.unit).toBe("gold");
    }
  });

  it("gold_spend (delta only)", () => {
    const t = readTransitionView({
      classification: "gold_spend", origin: "authored_inter_step",
      transition_id: TXN, target: "A", label: "Olaf spends 1,050 gold",
      delta: 1050, unit: "gold", applied: true,
    });
    expect(t.classification).toBe("gold_spend");
    if (t.classification === "gold_spend") {
      expect(t.delta).toBe(1050);
      expect(t.unit).toBe("gold");
    }
  });

  it("item_acquire (item name, no unit)", () => {
    const t = readTransitionView({
      classification: "item_acquire", origin: "authored_inter_step",
      transition_id: TXN, target: "A",
      label: "Olaf acquires Caulfield's Warhammer", item: "Caulfield's Warhammer",
      applied: true,
    });
    expect(t.classification).toBe("item_acquire");
    if (t.classification === "item_acquire") {
      expect(t.item).toBe("Caulfield's Warhammer");
      expect(t.unit).toBeNull();
    }
  });
});
