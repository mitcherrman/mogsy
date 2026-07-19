/**
 * Player-safe rendering guards (J1). The player views must never surface engine
 * internals: no snapshot/artifact digests, raw stat slugs, A/B target codes,
 * "maximum unavailable", or the "authored/question-proposed" taxonomy.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readStateView } from "../contracts/stateView";
import { readTransitionView } from "../contracts/transitionView";
import { MasteryStatePanel } from "./MasteryStatePanel";
import { MasteryTransitionPanel } from "./MasteryTransitionPanel";
import { MasteryChampionPortrait } from "./MasteryChampionPortrait";

afterEach(cleanup);

const champ = (id: string, name: string, hp: number, maxHp: number | null, effects: unknown[] = []) => ({
  champion_id: id, display_name: name, current_health: hp, max_health: maxHp,
  resource_type: "mana", current_resource: 400, max_resource: null,
  active_effects: effects, inventory_summary: [],
});

const stateRaw = {
  snapshot_id: "snap_257350f8b649e44f6c90609da32c36da39c051d0fb493f9391190f40ea334e0a",
  patch_key_digest: "patchkey_x", validation_status: "certified", label: "state",
  champion_a: champ("ahri", "Ahri", 590, null, [
    { effect_id: "e1", label: "Ability Haste", magnitude: 20, unit: "ability_haste" },
  ]),
  champion_b: champ("syndra", "Syndra", 480, null),
};

describe("MasteryStatePanel is player-safe", () => {
  it("shows HP without 'maximum unavailable' and no snapshot id", () => {
    render(<MasteryStatePanel state={readStateView(stateRaw)} heading="Current state" />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/maximum unavailable/i);
    expect(text).not.toContain("snap_257350");   // no snapshot digest
    expect(text).not.toMatch(/technical details/i);
    expect(screen.getByTestId("mastery-hp-ahri")).toHaveTextContent("590");
  });

  it("labels effects with plain stat names, never the raw slug or a duplicate", () => {
    render(<MasteryStatePanel state={readStateView(stateRaw)} />);
    const effects = screen.getByTestId("mastery-effects-ahri");
    expect(effects).toHaveTextContent("+20 Ability Haste");
    expect(effects.textContent).not.toContain("ability_haste");
  });
});

describe("MasteryTransitionPanel is player-safe", () => {
  it("renders a health change in plain language (champion names, no A/B, no taxonomy)", () => {
    const t = readTransitionView({
      classification: "health_change", origin: "question_proposed", transition_id: "txn_x",
      target: "B", label: "internal", before_value: 480, after_value: 230, delta: -250,
      unit: "health", applied: true,
    });
    render(<MasteryTransitionPanel transition={t} championA="Ahri" championB="Syndra" />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/syndra loses 250 hp/i);
    expect(text).not.toMatch(/target:/i);
    expect(text).not.toMatch(/question-proposed|authored scenario transition/i);
    expect(text).not.toContain("txn_x");
  });

  it("renders an authored effect as '<champion> gains +N <stat>'", () => {
    const t = readTransitionView({
      classification: "authored_effect", origin: "authored_inter_step", transition_id: "txn_y",
      target: "A", label: "Authored +20 ability haste on Ahri", effect: "ability_haste",
      magnitude: 20, unit: "ability_haste", applied: true,
    });
    render(<MasteryTransitionPanel transition={t} championA="Ahri" championB="Syndra" />);
    expect(document.body.textContent ?? "").toMatch(/ahri gains \+20 ability haste/i);
    expect(document.body.textContent ?? "").not.toContain("ability_haste");
  });

  it("renders 'No state change' for a read-only step", () => {
    const t = readTransitionView({ classification: "state_unchanged", label: "" });
    render(<MasteryTransitionPanel transition={t} championA="Ahri" championB="Syndra" />);
    expect(document.body.textContent ?? "").toMatch(/no state change/i);
    expect(document.body.textContent ?? "").not.toMatch(/canonical state unchanged/i);
  });
});

describe("MasteryChampionPortrait", () => {
  it("renders a graceful text fallback when no icon is available (no provider)", () => {
    render(<MasteryChampionPortrait championId="ahri" displayName="Ahri" />);
    // No manifest → initial-letter fallback, never a broken image.
    expect(screen.getByTestId("mastery-portrait-fallback-ahri")).toHaveTextContent("A");
    expect(screen.queryByTestId("mastery-portrait-ahri")).toBeNull();
  });
});
