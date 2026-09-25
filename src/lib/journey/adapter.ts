/**
 * JOURNEY-UI2 — THE ADAPTER: a backend Journey wire + the viewer's cursor →
 * the board's view model (`JourneyPublicState`) and the current child's
 * Journey context.
 *
 * THE BOUNDARY. The board, the rails, the sheet and the transition beat read
 * only what this returns; they never see a wire spelling. Today it adapts J2
 * (`j2.ts`, `mastery_journey.v1`). A J3 contract gets a reader beside `j2.ts`
 * and a branch here — the components do not change.
 *
 * WHAT IS SHOWN, AND FROM WHERE (every value is the server's):
 *
 *   * the board's two sides — the LATEST REACHED child's public node state
 *     (champion, level, Q/W/E/R ranks, items). J2 publishes inputs only: no
 *     stats, no max rank, no numeric item id on the state;
 *   * during a transition BEAT (the server shows the transition before its
 *     child exists), the node AFTER it: the reached state with the
 *     transition's own lossless `changes` applied — its level `[from, to]`,
 *     its ranks `[from, to]`, its `items_added`. Server deltas, applied as
 *     given; nothing is derived;
 *   * a WITHHELD asked stat — J2 names what a child asks (`asks`) and never
 *     its value, so a Champion "stat at level" child puts `?` on that side;
 *   * FOCUS — the current child's `asks` (its subject and ability slot; for a
 *     Matchup both sides; for Combat attacker and target);
 *   * the transition's marks — while the child it precedes is the one on
 *     screen (pending, or current), and not after;
 *   * the canonical BEAT — `until` is `own_card_started_at`, the instant the
 *     server opens that child, and only while the child has NOT been exposed.
 *
 * NOT DONE HERE, BY RULE: no League value computed, no stat reconstructed, no
 * future child imagined (`children` is the reached prefix), nothing read from
 * a reveal or private field.
 */
import type {
  AbilitySlot, JourneyAbility, JourneyEvent, JourneyFocusRef, JourneyItem,
  JourneyPublicState, JourneySide, JourneySideId, JourneyStat, JourneyTransition,
} from "./contract";
import { ABILITY_SLOTS, JourneyContractError } from "./contract";
import type { JourneyStatKey } from "./stats";
import {
  readJourneyJ2, type J2Asks, type J2Child, type J2Formula, type J2Side, type J2SideState,
  type J2Transition, type J2Withheld, type JourneyJ2,
} from "./j2";

/** The viewer's position, from the segment state the Journey rides on. */
export interface JourneyCursor {
  ownNextChallengeIndex: number;
  /** The server instant the viewer's CURRENT card opens (per-child clocks). */
  ownCardStartedAt: string | null;
  ownFinished: boolean;
}

/** What the question renderer needs from the Journey for ONE child. */
export interface JourneyChildContext {
  index: number;
  engine: J2Child["engine"];
  asks: J2Asks;
  /** A formula this child STATES (Combat), exactly as served. */
  formula: J2Formula | null;
  /** Facts this child RECALLS: their numbers are withheld; the teacher is named. */
  recalled: J2Withheld[];
  /** Backend learner-ledger links (earlier children this one reinforces). */
  reinforces: number[];
  playerChampion: string;
  opponentChampion: string;
}

export interface JourneyView {
  board: JourneyPublicState;
  /** Context for each reached child, by index. */
  children: JourneyChildContext[];
  /** A transition is showing and the child after it has not opened yet. */
  pendingChildIndex: number | null;
}

const SIDE: Record<J2Side, JourneySideId> = { player: "subject", opponent: "opponent" };
const J2_SIDE: Record<JourneySideId, J2Side> = { subject: "player", opponent: "opponent" };

/**
 * The asked Champion stat, in the board's stat vocabulary. Only metrics a
 * "stat at level" child asks; anything else puts no `?` on the board.
 */
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

/** Apply a transition's own lossless changes to a node state. */
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
        // J2's `recall` kind groups a back-to-base purchase; nothing requires it.
        group: t.kind === "recall" ? "recall" : null,
        items: c.itemsAdded.map((it) => ({
          slot: held.lastIndexOf(it.name), itemId: Number(it.itemId) || 0, name: it.name, cost: it.cost,
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
    recalled: c.withheld, reinforces: c.reinforces,
    playerChampion: c.state.player.champion, opponentChampion: c.state.opponent.champion,
  };
}

/** J2 (already read) + cursor → the board's view and the reached children's context. */
export function adaptJourneyJ2(j: JourneyJ2, cursor: JourneyCursor): JourneyView | null {
  const reached = j.children;
  const latest = reached.length ? reached[reached.length - 1] : null;
  // A transition for the NEXT child, shown during its beat, before the child exists.
  const pendingT = j.transitions.find((t) => t.beforeChild === reached.length) ?? null;
  const pending = pendingT !== null && !cursor.ownFinished;
  if (!latest && !pending) return null;
  const ids = itemIds(j.transitions);
  const base = latest ? latest.state : null;
  if (!base) return null;            // a beat before any child: nothing to stand on
  const onScreenIndex = pending ? pendingT!.beforeChild : latest!.index;
  const t = pending ? pendingT : (j.transitions.find((x) => x.beforeChild === latest!.index) ?? null);
  const nodeState = pending ? applyChanges(base, pendingT!) : base;
  const focus = !pending && latest ? focusFor(latest) : { refs: [], combat: null, askedStat: null };
  const statsFor = (side: J2Side): JourneyStat[] =>
    focus.askedStat && focus.askedStat.side === side
      ? [{ key: focus.askedStat.key, withheld: true, value: null }] : [];
  let transition: JourneyTransition | null = null;
  if (t) {
    // The beat is live only while its child has not been exposed; `until` is
    // the instant the server opens it. Afterwards the marks stay, the beat is over.
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

/** Wire → view, tolerant at the surface: an unreadable block draws no board. */
export function journeyViewFromWire(raw: unknown, cursor: JourneyCursor): JourneyView | null {
  if (raw === null || raw === undefined) return null;
  try {
    return adaptJourneyJ2(readJourneyJ2(raw), cursor);
  } catch (e) {
    if (e instanceof JourneyContractError) return null;
    throw e;
  }
}

export { J2_SIDE };
