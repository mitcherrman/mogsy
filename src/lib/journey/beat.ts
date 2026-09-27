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

/*
 * JOURNEY-MOTION-V1 — the beat reads as the STATE changing, not as a screen.
 * The board keeps showing; each changed object animates in place, and the
 * only words on screen are one compact stamp in the board's own header. The
 * full per-event lines stay for assistive tech (the beat's status region).
 */

/** The stamp words, in reading order: recall / first back, level, unlock, purchase. Full words (status region). */
export function beatStamps(transition: JourneyTransition | null): string[] {
  const events = transition?.events ?? [];
  const out: string[] = [];
  if (events.some((e) => e.kind === "purchase" && e.group === "recall")) out.push("Recall");
  // J3 narrates some purchases as a first back to base: a presentation label
  // the recipe chose, not a recall mechanic (J3 retired canonical recall).
  else if (events.some((e) => e.kind === "purchase" && e.group === "first_back")) out.push("First back");
  if (events.some((e) => e.kind === "ability_unlock")) out.push("Ultimate unlocked");
  if (events.some((e) => e.kind === "level")) out.push("Level up");
  if (!out.length && events.some((e) => e.kind === "purchase")) out.push("Purchase");
  if (!out.length && events.some((e) => e.kind === "ability_rank")) out.push("Rank up");
  return out.length ? out : ["State change"];
}

/**
 * The VISIBLE stamp: short enough for the phone header beside "Step N of M".
 * A progression beat reads as one moment ("Lv 6 · R unlocked"); a purchase
 * in the same beat is carried by its slot and its delta tag, not by words.
 */
export function beatShortStamp(transition: JourneyTransition | null): string {
  const events = transition?.events ?? [];
  const levels = new Set(events.flatMap((e) => (e.kind === "level" ? [e.to] : [])));
  const unlocked = [...new Set(events.flatMap((e) => (e.kind === "ability_unlock" ? [e.slot] : [])))];
  const parts: string[] = [];
  if (levels.size === 1) parts.push(`Lv ${[...levels][0]}`);
  else if (levels.size > 1) parts.push("Level up");
  if (unlocked.length) parts.push(`${unlocked.join("/")} unlocked`);
  // The recipe's narration of a purchase (a recall / first back) is kept; a
  // plain purchase beside a progression is carried by its slot and tag alone.
  if (events.some((e) => e.kind === "purchase" && e.group === "recall")) parts.push("Recall");
  else if (events.some((e) => e.kind === "purchase" && e.group === "first_back")) parts.push("First back");
  if (parts.length) return parts.join(" · ");
  if (events.some((e) => e.kind === "purchase")) return "Purchase";
  if (events.some((e) => e.kind === "ability_rank")) return "Rank up";
  return "Update";
}

/**
 * The item's own stat lines, as the server published them, keyed by the slot
 * the item landed in (`side:slot`): "+10 AH". Only a `stat_change` whose
 * `source` names an item this transition put in that side's inventory — the
 * one causal link the public data states. Nothing is summed or derived; a
 * `stat_delta` (from/to, J2) belongs to its stat chip, not to an item.
 */
export function itemGainTags(transition: JourneyTransition | null): Map<string, string[]> {
  const bought = new Map<string, string>();       // `side|name` → markKey(side, slot)
  const out = new Map<string, string[]>();
  for (const e of transition?.events ?? []) {
    if (e.kind === "purchase") for (const it of e.items) if (it.slot >= 0) bought.set(`${e.side}|${it.name}`, k(e.side, it.slot));
    if (e.kind === "stat_change" && e.source) {
      const at = bought.get(`${e.side}|${e.source}`);
      if (!at) continue;
      out.set(at, [...(out.get(at) ?? []), `${formatStatGain(e.delta, e.key)} ${JOURNEY_STAT_META[e.key].short}`]);
    }
  }
  return out;
}
