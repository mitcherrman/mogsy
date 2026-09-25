/**
 * JOURNEY-UI1 — the transition beat and its lasting marks, as pure functions.
 *
 * Two different lifetimes, on purpose:
 *
 *   * THE BEAT is momentary. It runs from when the viewer arrives on a child
 *     with a transition until the server's `beat.until` instant, and while it
 *     runs the next question is not active. The client never starts, extends
 *     or shortens it — it compares server time to the server's instant.
 *   * THE MARKS last the whole child. Every fact the transition changed keeps
 *     a delta/"new" treatment for as long as the server keeps the transition on
 *     the state (the child right after it), so a player who looked away during
 *     the beat still sees "Armor 51.59 → 91.59" while answering.
 *
 * Nothing here computes a League value. A delta is the server's `from`/`to`.
 */
import type {
  AbilitySlot, JourneyEvent, JourneyPublicState, JourneySideId, JourneyTransition,
} from "./contract";
import { formatStatGain, formatStatValue, JOURNEY_STAT_META, type JourneyStatKey } from "./stats";

/** Is the canonical beat still running at this server time? */
export function beatActiveAt(transition: JourneyTransition | null, serverNowMs: number): boolean {
  if (!transition || transition.beat.until === null) return false;
  return serverNowMs < Date.parse(transition.beat.until);
}

export function beatRemainingMs(transition: JourneyTransition | null, serverNowMs: number): number {
  if (!transition || transition.beat.until === null) return 0;
  return Math.max(0, Date.parse(transition.beat.until) - serverNowMs);
}

/** A stable identity for the transition on screen, so a poll never replays it. */
export function transitionKey(state: JourneyPublicState): string | null {
  const t = state.transition;
  return t ? `${state.journeyKey}|${state.step.index}|${t.fromNode}>${t.toNode}` : null;
}

export interface JourneyMarks {
  level: Partial<Record<JourneySideId, { from: number; to: number }>>;
  rank: Set<string>;
  unlocked: Set<string>;
  newItems: Set<string>;
  stat: Map<string, { from: number; to: number }>;
  /** JOURNEY-UI3 — J3 item stat lines: the server's DELTA per `side:stat`. */
  gain: Map<string, number>;
}

const k = (side: JourneySideId, key: string | number) => `${side}:${key}`;

/** What the transition into this node changed, keyed `side:fact`. */
export function transitionMarks(transition: JourneyTransition | null): JourneyMarks {
  const marks: JourneyMarks = {
    level: {}, rank: new Set(), unlocked: new Set(), newItems: new Set(), stat: new Map(), gain: new Map(),
  };
  for (const e of transition?.events ?? []) {
    if (e.kind === "level") marks.level[e.side] = { from: e.from, to: e.to };
    if (e.kind === "ability_rank") marks.rank.add(k(e.side, e.slot));
    if (e.kind === "ability_unlock") marks.unlocked.add(k(e.side, e.slot));
    if (e.kind === "purchase") e.items.forEach((it) => marks.newItems.add(k(e.side, it.slot)));
    if (e.kind === "stat_delta") marks.stat.set(k(e.side, e.key), { from: e.from, to: e.to });
    // Two item lines on one stat (e.g. two items both granting AD) are listed
    // separately in the beat; the chip's mark shows the first one only, so it
    // never presents a sum the server did not send.
    if (e.kind === "stat_change" && !marks.gain.has(k(e.side, e.key))) marks.gain.set(k(e.side, e.key), e.delta);
  }
  return marks;
}

export const markKey = k;

/** The previous rank of a slot the transition raised, for "2 → 3" copy. */
export function rankFrom(transition: JourneyTransition | null, side: JourneySideId, slot: AbilitySlot): number | null {
  for (const e of transition?.events ?? []) {
    if (e.kind === "ability_rank" && e.side === side && e.slot === slot) return e.from;
  }
  return null;
}

/**
 * One line per event for the beat and the change log — short, uppercase-able,
 * no paragraphs. Uses the champion's name so a two-sided transition reads.
 */
export function eventLine(e: JourneyEvent, name: (side: JourneySideId) => string): string {
  const who = name(e.side);
  switch (e.kind) {
    case "level":
      return `${who} · Level ${e.to}`;
    case "ability_rank":
      return `${who} · ${e.slot} rank ${e.from} → ${e.to}`;
    case "ability_unlock":
      return `${who} · ${e.slot} unlocked`;
    case "purchase": {
      const names = e.items.map((it) => it.name).join(", ");
      return e.group === "recall" ? `${who} recalls · ${names}` : `${who} buys ${names}`;
    }
    case "item_removed":
      return `${who} · ${e.name} used up`;
    case "stat_delta": {
      const meta = JOURNEY_STAT_META[e.key as JourneyStatKey];
      return `${who} · ${meta.short} ${formatStatValue(e.from, e.key)} → ${formatStatValue(e.to, e.key)}`;
    }
    case "stat_change":
      return `${who} · ${formatStatGain(e.delta, e.key)} ${JOURNEY_STAT_META[e.key].short}${e.source ? ` (${e.source})` : ""}`;
  }
}

/**
 * The beat's staging: events play in the server's order, spread across the
 * first 80% of the beat so the last one has time to land before `until`.
 * Presentation pacing only — `until` alone decides when the question opens.
 */
export function eventDelaysMs(count: number, beatMs: number): number[] {
  if (count <= 0) return [];
  const span = Math.max(0, beatMs * 0.8);
  const step = count > 1 ? Math.min(450, span / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}
