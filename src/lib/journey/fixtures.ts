/**
 * JOURNEY-UI1 — Journey public-state FIXTURES, in wire shape (`journey.public.v0`).
 *
 * WHERE THE NUMBERS COME FROM. Levels, items and every stat value
 * below are copied from the backend's canonical-DB probe in
 * `JOURNEY1_HANDOFF.md` §7 (arcs A, C and F). None is computed here. Ability
 * RANKS other than the ones §7 states are illustrative UI data — in production
 * they come from the accepted skill path, never from this file.
 *
 * Each export is ONE poll of `segment_state.journey` for the viewer's current
 * child, exactly as the server would send it. `withBeat` plays the part of the
 * server stamping the canonical beat instant — the explicit fixture
 * simulation of a backend beat that does not exist yet.
 */
type Wire = Record<string, unknown>;

const ability = (slot: string, rank: number, maxRank: number, name: string) =>
  ({ slot, rank, max_rank: maxRank, name });
const item = (slot: number, itemId: number, name: string) => ({ slot, item_id: itemId, name });
const stat = (key: string, value: number) => ({ key, value });
const withheld = (key: string) => ({ key, withheld: true });

// ── arc A — Jungle · First Recall → Defensive Purchase → Penetration ─────────
// Jarvan IV (subject) vs Olaf. §7 A: n0 L6 both, J4 Q3 W1 E1 R1, no items;
// n1 J4 buys Caulfield's Warhammer (1050g: +20 AD, +10 AH); n2 Olaf buys Chain
// Vest (800g), armor 51.59 → 91.59; n3 L7, Q r4, + Serrated Dirk (1000g:
// +20 AD, 10 lethality), Olaf armor 95.349.

const JARVAN_ABILITIES = (q: number, w: number, e: number, r: number) => [
  ability("Q", q, 5, "Dragon Strike"), ability("W", w, 5, "Golden Aegis"),
  ability("E", e, 5, "Demacian Standard"), ability("R", r, 3, "Cataclysm"),
];
// Olaf's ranks are illustrative (different from Jarvan's on purpose, so the
// board's per-side ranks are visibly independent — the Matchup defect).
const OLAF_ABILITIES = (q: number, w: number, e: number, r: number) => [
  ability("Q", q, 5, "Undertow"), ability("W", w, 5, "Tough It Out"),
  ability("E", e, 5, "Reckless Swing"), ability("R", r, 3, "Ragnarok"),
];

function arcA(opts: {
  index: number; nodeId: string; nodeLabel: string;
  jarvan: Wire; olaf: Wire; transition?: Wire | null; focus?: Wire;
}): Wire {
  return {
    contract: "journey.public.v0",
    journey_key: "journey:jungle-first-recall-j4-olaf@1",
    plan: "standard",
    title: "First Recall → Defensive Purchase",
    step: { index: opts.index, count: 5, node_id: opts.nodeId, node_label: opts.nodeLabel },
    sides: [opts.jarvan, opts.olaf],
    transition: opts.transition ?? null,
    focus: opts.focus ?? { refs: [], combat: null },
  };
}

const J4 = (level: number, abilities: Wire[], items: Wire[], stats: Wire[]): Wire => ({
  side: "subject", champion_id: "JarvanIV", champion_name: "Jarvan IV",
  level, abilities, items, stats,
});
const OLAF = (level: number, abilities: Wire[], items: Wire[], stats: Wire[]): Wire => ({
  side: "opponent", champion_id: "Olaf", champion_name: "Olaf",
  level, abilities, items, stats,
});

const N0_J4 = J4(6, JARVAN_ABILITIES(3, 1, 1, 1), [], [stat("bonus_attack_damage", 0), stat("ability_haste", 0)]);
const N0_OLAF = OLAF(6, OLAF_ABILITIES(3, 0, 2, 1), [], [stat("armor", 51.59)]);
const N1_J4 = J4(6, JARVAN_ABILITIES(3, 1, 1, 1), [item(0, 3133, "Caulfield's Warhammer")],
  [stat("bonus_attack_damage", 20), stat("ability_haste", 10)]);
const N2_OLAF = OLAF(6, OLAF_ABILITIES(3, 0, 2, 1), [item(0, 1031, "Chain Vest")], [stat("armor", 91.59)]);

/** Child 1 — establish n0: Jarvan's Q at rank 3 (the answer is a cooldown: never on the board). */
export const ARC_A_CHILD_0 = arcA({
  index: 0, nodeId: "n0", nodeLabel: "Level 6 · no items",
  jarvan: N0_J4, olaf: N0_OLAF,
  focus: { refs: [{ side: "subject", kind: "ability", key: "Q" }], combat: null },
});

/** Child 2 — compare n0 (Matchup): each side at ITS OWN rank. */
export const ARC_A_CHILD_1 = arcA({
  index: 1, nodeId: "n0", nodeLabel: "Level 6 · no items",
  jarvan: N0_J4, olaf: N0_OLAF,
  focus: {
    refs: [{ side: "subject", kind: "ability", key: "Q" }, { side: "opponent", kind: "ability", key: "Q" }],
    combat: null,
  },
});

/** Child 3 — n0 → n1: the first recall. A grouped purchase and two stat deltas. */
export const ARC_A_CHILD_2 = arcA({
  index: 2, nodeId: "n1", nodeLabel: "Jarvan IV's first back",
  jarvan: N1_J4, olaf: N0_OLAF,
  transition: {
    from_node: "n0", to_node: "n1",
    label: "Jarvan IV buys Caulfield's Warhammer",
    events: [
      { kind: "purchase", side: "subject", group: "recall",
        items: [{ slot: 0, item_id: 3133, name: "Caulfield's Warhammer" }] },
      { kind: "stat_delta", side: "subject", key: "bonus_attack_damage", from: 0, to: 20 },
      { kind: "stat_delta", side: "subject", key: "ability_haste", from: 0, to: 10 },
    ],
    beat: { ms: 1800, until: null },
  },
  focus: {
    refs: [{ side: "subject", kind: "ability", key: "Q" }, { side: "subject", kind: "stat", key: "ability_haste" }],
    combat: null,
  },
});

/** Child 4 — apply n1 (Combat): attacker Q/rank/bonus AD, target armor. No transition. */
export const ARC_A_CHILD_3 = arcA({
  index: 3, nodeId: "n1", nodeLabel: "Jarvan IV's first back",
  jarvan: N1_J4, olaf: N0_OLAF,
  focus: {
    refs: [
      { side: "subject", kind: "ability", key: "Q" },
      { side: "subject", kind: "stat", key: "bonus_attack_damage" },
      { side: "opponent", kind: "stat", key: "armor" },
    ],
    combat: { attacker: "subject", target: "opponent" },
  },
});

/** Child 5 — n1 → n2 (Combat): Olaf answers with Chain Vest. */
export const ARC_A_CHILD_4 = arcA({
  index: 4, nodeId: "n2", nodeLabel: "Olaf buys armor",
  jarvan: N1_J4, olaf: N2_OLAF,
  transition: {
    from_node: "n1", to_node: "n2",
    label: "Olaf buys Chain Vest",
    events: [
      { kind: "purchase", side: "opponent", group: null,
        items: [{ slot: 0, item_id: 1031, name: "Chain Vest" }] },
      { kind: "stat_delta", side: "opponent", key: "armor", from: 51.59, to: 91.59 },
    ],
    beat: { ms: 1600, until: null },
  },
  focus: {
    refs: [
      { side: "subject", kind: "ability", key: "Q" },
      { side: "subject", kind: "stat", key: "bonus_attack_damage" },
      { side: "opponent", kind: "stat", key: "armor" },
      { side: "opponent", kind: "item", key: 0 },
    ],
    combat: { attacker: "subject", target: "opponent" },
  },
});

/**
 * §7 A "alt 5" — n2 → n3: both sides level, Jarvan's Q ranks up, and a
 * Serrated Dirk brings lethality. Every transition kind but an unlock at once.
 */
export const ARC_A_ALT_LEVEL_UP = arcA({
  index: 4, nodeId: "n3", nodeLabel: "Level 7 · penetration",
  jarvan: J4(7, JARVAN_ABILITIES(4, 1, 1, 1),
    [item(0, 3133, "Caulfield's Warhammer"), item(1, 3134, "Serrated Dirk")],
    [stat("bonus_attack_damage", 40), stat("ability_haste", 10), stat("lethality", 10)]),
  olaf: OLAF(7, OLAF_ABILITIES(4, 0, 2, 1), [item(0, 1031, "Chain Vest")], [stat("armor", 95.349)]),
  transition: {
    from_node: "n2", to_node: "n3",
    label: "Level 7 · Jarvan IV adds Serrated Dirk",
    events: [
      { kind: "level", side: "subject", from: 6, to: 7 },
      { kind: "level", side: "opponent", from: 6, to: 7 },
      { kind: "ability_rank", side: "subject", slot: "Q", from: 3, to: 4 },
      { kind: "ability_rank", side: "opponent", slot: "Q", from: 3, to: 4 },
      { kind: "purchase", side: "subject", group: null,
        items: [{ slot: 1, item_id: 3134, name: "Serrated Dirk" }] },
      { kind: "stat_delta", side: "subject", key: "bonus_attack_damage", from: 20, to: 40 },
      { kind: "stat_delta", side: "subject", key: "lethality", from: 0, to: 10 },
      { kind: "stat_delta", side: "opponent", key: "armor", from: 91.59, to: 95.349 },
    ],
    beat: { ms: 2400, until: null },
  },
  focus: {
    refs: [
      { side: "subject", kind: "ability", key: "Q" },
      { side: "subject", kind: "stat", key: "lethality" },
      { side: "opponent", kind: "stat", key: "armor" },
    ],
    combat: { attacker: "subject", target: "opponent" },
  },
});

export const ARC_A_STEPS: readonly Wire[] = [
  ARC_A_CHILD_0, ARC_A_CHILD_1, ARC_A_CHILD_2, ARC_A_CHILD_3, ARC_A_CHILD_4,
];

// ── arc C — Top · the WITHHELD case ──────────────────────────────────────────
// Darius (subject) vs Garen. §7 C child 1 asks "Garen armor at L3" (44.195).
// On that child the armor is WITHHELD — absent from the payload. Child 3 states
// it as a Combat premise, so there it is public.

const DARIUS = (stats: Wire[]): Wire => ({
  side: "subject", champion_id: "Darius", champion_name: "Darius", level: 3,
  abilities: [ability("Q", 1, 5, "Decimate"), ability("W", 1, 5, "Crippling Strike"),
    ability("E", 1, 5, "Apprehend"), ability("R", 0, 3, "Noxian Guillotine")],
  items: [], stats,
});
const GAREN = (stats: Wire[]): Wire => ({
  side: "opponent", champion_id: "Garen", champion_name: "Garen", level: 3,
  abilities: [ability("Q", 1, 5, "Decisive Strike"), ability("W", 1, 5, "Courage"),
    ability("E", 1, 5, "Judgment"), ability("R", 0, 3, "Demacian Justice")],
  items: [], stats,
});

const arcC = (index: number, darius: Wire, garen: Wire, focus: Wire): Wire => ({
  contract: "journey.public.v0",
  journey_key: "journey:top-trade-darius-garen@1",
  plan: "standard",
  title: "Trade → Defensive Purchase → Level 6",
  step: { index, count: 5, node_id: "n0", node_label: "Level 3 · first trade" },
  sides: [darius, garen],
  transition: null,
  focus,
});

/** Child 1 asks Garen's armor at level 3: the board shows `?`, and the value is not in the payload. */
export const ARC_C_CHILD_0_WITHHELD = arcC(0,
  DARIUS([stat("attack_damage", 71.375)]),
  GAREN([withheld("armor")]),
  { refs: [{ side: "opponent", kind: "stat", key: "armor" }, { side: "opponent", kind: "level" }], combat: null });

/** Child 3 — the same armor is now a stated Combat premise, so it is public. */
export const ARC_C_CHILD_2_PREMISE = arcC(2,
  DARIUS([stat("attack_damage", 71.375)]),
  GAREN([stat("armor", 44.195)]),
  {
    refs: [
      { side: "subject", kind: "ability", key: "Q" },
      { side: "subject", kind: "stat", key: "attack_damage" },
      { side: "opponent", kind: "stat", key: "armor" },
    ],
    combat: { attacker: "subject", target: "opponent" },
  });

// ── arc F — Mid · Level 6 unlock ─────────────────────────────────────────────
// Talon (subject) vs Ahri. §7 F: n0 L5 (Talon W3 Q1 E1); n1 L6 (R1). Ahri's
// armor 33.978 at L5 and 37.59 at L6.

const TALON = (level: number, r: number): Wire => ({
  side: "subject", champion_id: "Talon", champion_name: "Talon", level,
  abilities: [ability("Q", 1, 5, "Noxian Diplomacy"), ability("W", 3, 5, "Rake"),
    ability("E", 1, 5, "Assassin's Path"), ability("R", r, 3, "Shadow Assault")],
  items: [], stats: [stat("bonus_attack_damage", 0)],
});
const AHRI = (level: number, r: number, armor: number): Wire => ({
  side: "opponent", champion_id: "Ahri", champion_name: "Ahri", level,
  abilities: [ability("Q", 3, 5, "Orb of Deception"), ability("W", 1, 5, "Fox-Fire"),
    ability("E", 1, 5, "Charm"), ability("R", r, 3, "Spirit Rush")],
  items: [], stats: [stat("armor", armor)],
});

export const ARC_F_CHILD_1_UNLOCK = {
  contract: "journey.public.v0",
  journey_key: "journey:mid-level6-talon-ahri@1",
  plan: "survival",
  title: "Level 6 Unlock",
  step: { index: 1, count: 3, node_id: "n1", node_label: "Level 6" },
  sides: [TALON(6, 1), AHRI(6, 1, 37.59)],
  transition: {
    from_node: "n0", to_node: "n1", label: "Both champions reach level 6",
    events: [
      { kind: "level", side: "subject", from: 5, to: 6 },
      { kind: "level", side: "opponent", from: 5, to: 6 },
      { kind: "ability_unlock", side: "subject", slot: "R" },
      { kind: "ability_unlock", side: "opponent", slot: "R" },
      { kind: "stat_delta", side: "opponent", key: "armor", from: 33.978, to: 37.59 },
    ],
    beat: { ms: 2000, until: null },
  },
  focus: { refs: [{ side: "subject", kind: "ability", key: "R" }], combat: null },
} satisfies Wire;

export const ARC_F_CHILD_0 = {
  ...ARC_F_CHILD_1_UNLOCK,
  step: { index: 0, count: 3, node_id: "n0", node_label: "Level 5" },
  sides: [TALON(5, 0), AHRI(5, 0, 33.978)],
  transition: null,
  focus: {
    refs: [{ side: "subject", kind: "ability", key: "W" }, { side: "opponent", kind: "stat", key: "armor" }],
    combat: { attacker: "subject", target: "opponent" },
  },
} satisfies Wire;

// ── the explicit beat simulation ─────────────────────────────────────────────

/**
 * Stamp the canonical beat as the server would when the viewer arrives on
 * this child: `until = arrival + ms`. A fixture with no transition is returned
 * unchanged.
 */
export function withBeat(wire: Wire, arrivedAtMs: number): Wire {
  const t = wire.transition as Wire | null | undefined;
  if (!t) return wire;
  const beat = t.beat as { ms: number };
  return {
    ...wire,
    transition: { ...t, beat: { ms: beat.ms, until: new Date(arrivedAtMs + beat.ms).toISOString() } },
  };
}
