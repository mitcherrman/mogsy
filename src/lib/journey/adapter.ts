/**
 * THE ADAPTER: a backend Journey wire + the viewer's cursor → the board's view
 * model (`JourneyPublicState`) and each reached child's Journey context.
 *
 * THE BOUNDARY. The board, the rails, the sheet and the transition beat read
 * only what this returns; they never see a wire spelling.
 *
 *   * `adaptJourneyJ3` — JOURNEY-UI3, the REAL contract the Daily serves
 *     (`journey3/daily`, `journey_public_state.v1`, read by `j3.ts`). This is
 *     the only one production parses (`ranked-public/contracts.ts`).
 *   * `adaptJourneyJ2` — JOURNEY-UI2's reader of the superseded J2 wire, kept
 *     ISOLATED (its own tests only). J2 narrated item gold, which the
 *     production parser now refuses; nothing in gameplay reaches it.
 *
 * WHAT IS SHOWN, AND FROM WHERE (J3; every value is the server's):
 *
 *   * the board's two sides — the LATEST REACHED child's public state:
 *     champion, level, Q/W/E/R names and ranks, inventory (with item ids),
 *     and ONLY the stats that child's premise states. J3 publishes no max
 *     rank, so ranks print as numbers, never pips of a guessed length;
 *   * WITHHELD stats — from the state's own `withheld` list: `asked` draws `?`,
 *     `recalled` draws "recall · step N" (the step that established it, and
 *     whether it was stated or revealed). Neither carries a number;
 *   * during a transition BEAT (the server shows the transition before its
 *     child exists), the reached state with the transition's typed events
 *     applied — level, ranks, acquired items. The next child's premise stats
 *     are NOT published yet, so the beat board shows none rather than stale
 *     ones beside a new "+20 AD";
 *   * FOCUS — the state's `focus` (champion: side + slot/stat; matchup: both
 *     sides' slot; combat: attacker slot, target, and the target stat shown);
 *   * the transition's marks — while the child it precedes is on screen;
 *   * the canonical BEAT — `until` is `own_card_started_at`, the instant the
 *     server opens that child, and only while the child is NOT yet exposed.
 *
 * NOT DONE HERE, BY RULE: no League value computed, no total built from a
 * delta, no future child imagined (`children` is the reached prefix), no
 * learner state inferred from correctness, nothing read from a reveal.
 */
import type {
  AbilitySlot, JourneyAbility, JourneyEvent, JourneyFocusRef, JourneyItem,
  JourneyPublicState, JourneySide, JourneySideId, JourneyStat, JourneyTransition,
} from "./contract";
import { ABILITY_SLOTS, JourneyContractError } from "./contract";
import { JOURNEY_STAT_KEYS, type JourneyStatKey } from "./stats";
import {
  readJourneyJ2, type J2Child, type J2Side, type J2SideState, type J2Transition, type JourneyJ2,
} from "./j2";
import {
  readJourneyJ3, type J3Child, type J3Side, type J3SideState, type J3State,
  type J3Transition, type JourneyJ3,
} from "./j3";

/** The viewer's position, from the segment state the Journey rides on. */
export interface JourneyCursor {
  ownNextChallengeIndex: number;
  /** The server instant the viewer's CURRENT card opens (per-child clocks). */
  ownCardStartedAt: string | null;
  ownFinished: boolean;
}

/** What a child asks: NAMED, its value never present. */
export interface JourneyAsks {
  engine: string;
  family: string;
  metric: string;
  subjectRef: string;
  subject: string | string[];
}

/** An ability damage formula, exactly as a child STATES it. */
export interface JourneyFormula {
  abilityName: string;
  champion: string;
  slot: string;
  damageType: string;
  flatByRank: number[];
  ratios: { stat: string; label: string; ratio: number }[];
}

/** A fact a child RELIES ON without restating its number. */
export interface JourneyRecall {
  fact: string;
  /** `ability_damage` (a formula) or `target_armor`. */
  what: string;
  slot: string | null;
  champion: string;
  /** How the learner has it (J3): a premise stated it, or a reveal taught it. Null on J2. */
  source: "stated" | "revealed" | null;
  /** The EARLIER child that established it (the learner-ledger teacher). */
  establishedInChild: number;
}

/** What the question renderer needs from the Journey for ONE child. */
export interface JourneyChildContext {
  index: number;
  engine: "champion" | "matchup" | "combat";
  asks: JourneyAsks;
  /** A formula this child STATES (Combat), exactly as served. */
  formula: JourneyFormula | null;
  /** Facts this child RECALLS: their numbers are withheld; the teacher is named. */
  recalled: JourneyRecall[];
  /** Backend learner-ledger links (earlier children this one reinforces). */
  reinforces: number[];
  playerChampion: string;
  opponentChampion: string;
  /**
   * JOURNEY-UI3 — the ATTACKER's premise stats the board itself shows for this
   * child (J3 states them on the public state), keyed as the Combat scenario
   * keys them. From `lg` the premise card does not repeat them (the same rule
   * UI2 applied to level and items). Empty on J2, whose board had no stats.
   */
  boardStats?: string[];
}

export interface JourneyView {
  board: JourneyPublicState;
  /** Context for each reached child, by index. */
  children: JourneyChildContext[];
  /** A transition is showing and the child after it has not opened yet. */
  pendingChildIndex: number | null;
}

// ═══════════════════════════════════════════════════════════════════ J3 ═══

const SIDE3: Record<J3Side, JourneySideId> = { player: "subject", opponent: "opponent" };

function itemsOf(inv: { itemId: string; name: string }[]): JourneyItem[] {
  return inv.slice(0, 6).map((it, slot) => {
    const n = Number(it.itemId);
    return { slot, itemId: Number.isInteger(n) && n > 0 ? n : null, name: it.name, icon: null };
  });
}

/** One side's premise stats and withheld markers, in the vocabulary's order. */
function statsOf(state: J3State, side: J3Side, recalls: J3Child["recalls"]): JourneyStat[] {
  const out = new Map<JourneyStatKey, JourneyStat>();
  const values = state.sides[side].stats;
  for (const w of state.withheld) {
    if (w.side !== side) continue;
    const m = /^stats\.([a-z_]+)$/.exec(w.field);
    if (!m) continue;
    const key = m[1] as JourneyStatKey;
    if (w.reason === "asked") {
      out.set(key, { key, withheld: true, value: null, withheldReason: "asked", recalledFrom: null });
    } else {
      const teacher = recalls.find((r) => r.fact === w.fact) ?? null;
      out.set(key, {
        key, withheld: true, value: null, withheldReason: "recalled",
        recalledFrom: w.establishedInChild === null ? null
          : { child: w.establishedInChild, source: teacher?.source ?? "revealed" },
      });
    }
  }
  for (const [k, v] of Object.entries(values)) {
    const key = k as JourneyStatKey;
    if (typeof v === "number" && !out.has(key)) out.set(key, { key, withheld: false, value: v, withheldReason: null });
  }
  return JOURNEY_STAT_KEYS.filter((k) => out.has(k)).map((k) => out.get(k)!);
}

function boardSide3(s: J3SideState, stats: JourneyStat[]): JourneySide {
  const abilities: JourneyAbility[] = s.abilities.map((a) => ({
    slot: a.slot, rank: a.rank, maxRank: null, name: a.name, icon: null,
  }));
  return {
    side: SIDE3[s.side], championId: s.championId, championName: s.champion, icon: null,
    level: s.level, abilities, items: itemsOf(s.inventory), stats, vitals: null,
  };
}

/** The reached state with a pending transition's typed events applied (identity + kit + items only). */
function applyEvents(state: J3State, ts: J3Transition[]): Record<J3Side, J3SideState> {
  const copy = (s: J3SideState): J3SideState => ({
    ...s, abilities: s.abilities.map((a) => ({ ...a })), inventory: [...s.inventory], stats: {},
  });
  const next: Record<J3Side, J3SideState> = { player: copy(state.sides.player), opponent: copy(state.sides.opponent) };
  for (const t of ts) for (const e of t.events) {
    const s = next[e.side];
    if (e.type === "level_up") s.level = e.to;
    if (e.type === "ability_rank_up") {
      const a = s.abilities.find((x) => x.slot === e.slot)!;
      a.rank = e.to;
      a.unlocked = e.to > 0;
    }
    if (e.type === "item_acquired") s.inventory.push({ itemId: e.itemId, name: e.name });
  }
  return next;
}

function events3(ts: J3Transition[], inventories: Record<J3Side, { itemId: string; name: string }[]>): JourneyEvent[] {
  const out: JourneyEvent[] = [];
  for (const t of ts) for (const e of t.events) {
    const side = SIDE3[e.side];
    if (e.type === "level_up") out.push({ kind: "level", side, from: e.from, to: e.to });
    if (e.type === "ability_rank_up") {
      if (e.from === 0) out.push({ kind: "ability_unlock", side, slot: e.slot });
      else out.push({ kind: "ability_rank", side, slot: e.slot, from: e.from, to: e.to });
    }
    if (e.type === "item_acquired") {
      const inv = inventories[e.side];
      let slot = -1;
      for (let i = inv.length - 1; i >= 0; i -= 1) if (inv[i].itemId === e.itemId) { slot = i; break; }
      const n = Number(e.itemId);
      out.push({
        kind: "purchase", side, group: t.presentation === "first_back" ? "first_back" : null,
        items: [{ slot, itemId: Number.isInteger(n) && n > 0 ? n : null, name: e.name }],
      });
    }
    if (e.type === "stat_change") {
      out.push({ kind: "stat_change", side, key: e.stat, delta: e.delta, source: e.source?.name ?? null });
    }
  }
  return out;
}

function focus3(state: J3State, stats: Record<J3Side, JourneyStat[]>): JourneyPublicState["focus"] {
  const f = state.focus;
  const refs: JourneyFocusRef[] = [];
  if (!f) return { refs, combat: null };
  const hasStat = (s: J3Side, key: JourneyStatKey) => stats[s].some((x) => x.key === key);
  if (f.engine === "matchup") {
    for (const s of f.sides) refs.push({ side: SIDE3[s], kind: "ability", key: f.slot });
    return { refs, combat: null };
  }
  if (f.engine === "combat") {
    refs.push({ side: SIDE3[f.side], kind: "ability", key: f.slot });
    // The target's resistance the question is read against, when it is shown.
    for (const key of ["armor", "magic_resist"] as const) {
      if (hasStat(f.targetSide, key)) refs.push({ side: SIDE3[f.targetSide], kind: "stat", key });
    }
    return { refs, combat: { attacker: SIDE3[f.side], target: SIDE3[f.targetSide] } };
  }
  if (f.stat && hasStat(f.side, f.stat)) {
    refs.push({ side: SIDE3[f.side], kind: "stat", key: f.stat }, { side: SIDE3[f.side], kind: "level" });
  }
  if (f.slot) refs.push({ side: SIDE3[f.side], kind: "ability", key: f.slot as AbilitySlot });
  return { refs, combat: null };
}

function childContext3(c: J3Child): JourneyChildContext {
  return {
    index: c.index, engine: c.engine, asks: c.asks, formula: c.formula,
    recalled: c.recalls.map((r) => ({
      fact: r.fact, what: r.what, slot: r.slot, champion: r.champion,
      source: r.source, establishedInChild: r.establishedInChild,
    })),
    reinforces: c.reinforces,
    playerChampion: c.state.sides.player.champion, opponentChampion: c.state.sides.opponent.champion,
    boardStats: c.state.focus?.engine === "combat"
      ? Object.entries(c.state.sides[c.state.focus.side].stats)
        .filter(([, v]) => typeof v === "number").map(([k]) => k)
      : [],
  };
}

/** J3 (already read) + cursor → the board's view and the reached children's context. */
export function adaptJourneyJ3(j: JourneyJ3, cursor: JourneyCursor): JourneyView | null {
  const reached = j.children;
  const latest = reached.length ? reached[reached.length - 1] : null;
  if (!latest) return null;                 // nothing reached yet: nothing to stand on
  // Transitions for the NEXT child, shown during its beat, before the child exists.
  const pendingTs = cursor.ownFinished ? [] : j.transitions.filter((t) => t.beforeChild === reached.length);
  const pending = pendingTs.length > 0;
  const onScreenIndex = pending ? reached.length : latest.index;
  const ts = pending ? pendingTs : j.transitions.filter((t) => t.beforeChild === latest.index);

  const sides3 = pending ? applyEvents(latest.state, pendingTs) : latest.state.sides;
  const stats: Record<J3Side, JourneyStat[]> = pending
    ? { player: [], opponent: [] }
    : { player: statsOf(latest.state, "player", latest.recalls), opponent: statsOf(latest.state, "opponent", latest.recalls) };
  const focus = pending ? { refs: [], combat: null } : focus3(latest.state, stats);

  let transition: JourneyTransition | null = null;
  if (ts.length) {
    const first = ts[0];
    const last = ts[ts.length - 1];
    // The beat is live only while its child has not been exposed; `until` is
    // the instant the server opens it. Afterwards the marks stay, the beat is over.
    const beatLive = pending && cursor.ownNextChallengeIndex === first.beforeChild;
    transition = {
      fromNode: `sv${first.stateVersion - 1}`, toNode: `sv${last.stateVersion}`,
      label: ts.map((t) => t.note).join(" · "),
      events: events3(ts, { player: sides3.player.inventory, opponent: sides3.opponent.inventory }),
      beat: { ms: ts.reduce((n, t) => n + t.beatMs, 0), until: beatLive ? cursor.ownCardStartedAt : null },
    };
  }
  const board: JourneyPublicState = {
    contract: latest.state.contract,
    // A Review re-ask names no recipe: its own public state key identifies it.
    journeyKey: j.reask ? `reask:${latest.state.stateKey}` : `${j.recipeId}@${j.recipeVersion}:${j.plan}`,
    plan: j.plan,
    title: j.reask ? "Review" : j.title,
    step: {
      index: Math.min(onScreenIndex, j.childCount - 1), count: j.childCount,
      nodeId: transition ? transition.toNode : `sv${latest.state.stateVersion}`,
      nodeLabel: transition ? transition.label : null,
    },
    sides: [boardSide3(sides3.player, stats.player), boardSide3(sides3.opponent, stats.opponent)],
    transition,
    focus,
  };
  return { board, children: reached.map(childContext3), pendingChildIndex: pending ? reached.length : null };
}

// ═══════════════════════════════════════════════ J2 (isolated, legacy) ═══

const SIDE: Record<J2Side, JourneySideId> = { player: "subject", opponent: "opponent" };

/** The asked Champion stat, in the board's stat vocabulary (J2 had no withheld list). */
const ASKED_STAT: Record<string, JourneyStatKey> = {
  base_armor: "armor",
  base_attack_damage: "attack_damage",
  base_health: "health",
  base_magic_resist: "magic_resist",
};

function sideOfChampion(state: Record<J2Side, J2SideState>, champion: string): J2Side | null {
  if (state.player.champion === champion) return "player";
  if (state.opponent.champion === champion) return "opponent";
  return null;
}

function applyChanges(state: Record<J2Side, J2SideState>, t: J2Transition): Record<J2Side, J2SideState> {
  const next: Record<J2Side, J2SideState> = {
    player: { ...state.player, ranks: { ...state.player.ranks }, items: [...state.player.items] },
    opponent: { ...state.opponent, ranks: { ...state.opponent.ranks }, items: [...state.opponent.items] },
  };
  for (const c of t.changes) {
    const s = next[c.side];
    if (c.level) s.level = c.level[1];
    for (const [slot, [, to]] of Object.entries(c.ranks)) s.ranks[slot] = to;
    for (const it of c.itemsAdded) s.items.push(it.name);
  }
  return next;
}

function itemIds(transitions: J2Transition[]): Map<string, number> {
  const ids = new Map<string, number>();
  for (const t of transitions) for (const c of t.changes) for (const it of c.itemsAdded) {
    const n = Number(it.itemId);
    if (Number.isInteger(n) && n > 0) ids.set(it.name, n);
  }
  return ids;
}

function boardSide(sideId: J2Side, s: J2SideState, ids: Map<string, number>, stats: JourneyStat[]): JourneySide {
  const abilities: JourneyAbility[] = ABILITY_SLOTS.map((slot) => {
    const rank = s.ranks[slot];
    if (rank === undefined) {
      throw new JourneyContractError(`journey(j2): ${s.champion} has no ${slot} rank on the public state`);
    }
    return { slot, rank, maxRank: null, name: null, icon: null };
  });
  const items: JourneyItem[] = s.items.slice(0, 6).map((name, slot) => ({
    slot, itemId: ids.get(name) ?? null, name, icon: null,
  }));
  return {
    side: SIDE[sideId], championId: s.champion, championName: s.champion, icon: null,
    level: s.level, abilities, items, stats, vitals: null,
  };
}

function events(t: J2Transition, next: Record<J2Side, J2SideState>): JourneyEvent[] {
  const out: JourneyEvent[] = [];
  for (const c of t.changes) {
    const side = SIDE[c.side];
    if (c.level) out.push({ kind: "level", side, from: c.level[0], to: c.level[1] });
    for (const slot of ABILITY_SLOTS) {
      const pair = c.ranks[slot];
      if (!pair) continue;
      if (pair[0] === 0) out.push({ kind: "ability_unlock", side, slot });
      else out.push({ kind: "ability_rank", side, slot, from: pair[0], to: pair[1] });
    }
    if (c.itemsAdded.length) {
      const held = next[c.side].items;
      out.push({
        kind: "purchase", side,
        group: t.kind === "recall" ? "recall" : null,
        // J2's gold narration is dropped here: the view model carries none.
        items: c.itemsAdded.map((it) => ({
          slot: held.lastIndexOf(it.name), itemId: Number(it.itemId) || null, name: it.name,
        })),
      });
    }
  }
  return out;
}

function focusFor(child: J2Child): { refs: JourneyFocusRef[]; combat: JourneyPublicState["focus"]["combat"]; askedStat: { side: J2Side; key: JourneyStatKey } | null } {
  const a = child.asks;
  const refs: JourneyFocusRef[] = [];
  const slot = /^[QWER]$/.test(a.subjectRef) ? a.subjectRef as AbilitySlot : null;
  if (child.engine === "matchup") {
    if (slot) refs.push({ side: "subject", kind: "ability", key: slot }, { side: "opponent", kind: "ability", key: slot });
    return { refs, combat: null, askedStat: null };
  }
  const who = typeof a.subject === "string" ? sideOfChampion(child.state, a.subject) : null;
  if (!who) return { refs, combat: null, askedStat: null };
  const side = SIDE[who];
  if (child.engine === "combat") {
    if (slot) refs.push({ side, kind: "ability", key: slot });
    return { refs, combat: { attacker: side, target: side === "subject" ? "opponent" : "subject" }, askedStat: null };
  }
  const stat = ASKED_STAT[a.metric] ?? null;
  if (stat) {
    refs.push({ side, kind: "stat", key: stat }, { side, kind: "level" });
    return { refs, combat: null, askedStat: { side: who, key: stat } };
  }
  if (slot) refs.push({ side, kind: "ability", key: slot });
  return { refs, combat: null, askedStat: null };
}

function childContext(c: J2Child): JourneyChildContext {
  return {
    index: c.index, engine: c.engine, asks: c.asks, formula: c.formula,
    recalled: c.withheld.map((w) => ({ ...w, source: null })), reinforces: c.reinforces,
    playerChampion: c.state.player.champion, opponentChampion: c.state.opponent.champion,
  };
}

/** J2 (already read) + cursor → the board's view. ISOLATED: not on any gameplay path. */
export function adaptJourneyJ2(j: JourneyJ2, cursor: JourneyCursor): JourneyView | null {
  const reached = j.children;
  const latest = reached.length ? reached[reached.length - 1] : null;
  const pendingT = j.transitions.find((t) => t.beforeChild === reached.length) ?? null;
  const pending = pendingT !== null && !cursor.ownFinished;
  if (!latest && !pending) return null;
  const ids = itemIds(j.transitions);
  const base = latest ? latest.state : null;
  if (!base) return null;
  const onScreenIndex = pending ? pendingT!.beforeChild : latest!.index;
  const t = pending ? pendingT : (j.transitions.find((x) => x.beforeChild === latest!.index) ?? null);
  const nodeState = pending ? applyChanges(base, pendingT!) : base;
  const focus = !pending && latest ? focusFor(latest) : { refs: [], combat: null, askedStat: null };
  const statsFor = (side: J2Side): JourneyStat[] =>
    focus.askedStat && focus.askedStat.side === side
      ? [{ key: focus.askedStat.key, withheld: true, value: null, withheldReason: "asked" }] : [];
  let transition: JourneyTransition | null = null;
  if (t) {
    const beatLive = pending && cursor.ownNextChallengeIndex === t.beforeChild;
    transition = {
      fromNode: `before-${t.transitionId}`, toNode: `after-${t.transitionId}`,
      label: t.note, events: events(t, nodeState),
      beat: { ms: t.beatMs, until: beatLive ? cursor.ownCardStartedAt : null },
    };
  }
  const board: JourneyPublicState = {
    contract: j.version,
    journeyKey: `${j.recipeId}@${j.recipeVersion}:${j.plan}`,
    plan: j.plan === "survival" ? "survival" : "standard",
    title: j.title,
    step: {
      index: Math.min(onScreenIndex, j.childCount - 1), count: j.childCount,
      nodeId: t ? `after-${t.transitionId}` : "start", nodeLabel: t ? t.note : null,
    },
    sides: [boardSide("player", nodeState.player, ids, statsFor("player")),
      boardSide("opponent", nodeState.opponent, ids, statsFor("opponent"))],
    transition,
    focus: { refs: focus.refs, combat: focus.combat },
  };
  return { board, children: reached.map(childContext), pendingChildIndex: pending ? pendingT!.beforeChild : null };
}

// ═══════════════════════════════════════════════════════ entry points ═══

/** The production path: a parsed J3 block → view, tolerant at the surface. */
export function journeyViewFor(j: JourneyJ3 | null | undefined, cursor: JourneyCursor): JourneyView | null {
  if (!j) return null;
  try {
    return adaptJourneyJ3(j, cursor);
  } catch (e) {
    if (e instanceof JourneyContractError) return null;
    throw e;
  }
}

/** Raw J3 wire → view (tests, harness). An unreadable block draws no board. */
export function journeyViewFromWire(raw: unknown, cursor: JourneyCursor): JourneyView | null {
  if (raw === null || raw === undefined) return null;
  try {
    return adaptJourneyJ3(readJourneyJ3(raw), cursor);
  } catch (e) {
    if (e instanceof JourneyContractError) return null;
    throw e;
  }
}

/** Raw J2 wire → view. ISOLATED legacy reader; see the header. */
export function journeyViewFromJ2Wire(raw: unknown, cursor: JourneyCursor): JourneyView | null {
  if (raw === null || raw === undefined) return null;
  try {
    return adaptJourneyJ2(readJourneyJ2(raw), cursor);
  } catch (e) {
    if (e instanceof JourneyContractError) return null;
    throw e;
  }
}
