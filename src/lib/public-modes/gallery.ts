/**
 * MC-UX1 — the More Challenges GALLERY: how the thirteen modes are grouped and
 * what a card says about the player's eligibility. Presentation only.
 *
 * COLLECTIONS. Three player-facing groups, keyed by the stable public mode ids.
 * The server still owns which modes exist, their order, copy, availability and
 * launch; a collection only decides where a mode the catalog returned is drawn.
 * A mode the catalog returns that no collection names is never dropped — it is
 * drawn in a trailing "More games" group — and a collection with none of its
 * modes in the catalog is not drawn at all.
 *
 * STATUS. `cardStatus` turns the ONE launch decision (`resolveModeAction`, in
 * ./launch) into what a card shows. It decides nothing itself: every state is
 * the action's own kind and `gate`. A Play button exists exactly when the
 * action is `play` or `start`, as before the redesign.
 */
import type { PublicModeEntry, PublicModeId } from "./contracts";
import type { ModeAction } from "./launch";
import { cn } from "@/lib/utils";

/** Each mode's accent: its own hue inside Mogzy's gold/navy room. */
export const MODE_ACCENT: Readonly<Record<PublicModeId, string>> = {
  time_trial: "#f2c14e",
  survival: "#ec7a64",
  roster_lock: "#5ab8ee",
  draft_memory: "#9aa6ff",
  chronoscope: "#47cdb9",
  match_grid: "#e8a33d",
  reconstruct: "#d9ad6a",
  order_forge: "#f08a4c",
  rangefinder: "#63d4ff",
  glyph_press: "#d6c193",
  perfect_timing: "#a796ff",
  stat_drop: "#8bd06b",
  combat_estimate: "#f07a8e",
};

export type ModeCollectionId = "daily_extras" | "knowledge_arena" | "precision_recall";

export interface ModeCollection {
  id: ModeCollectionId;
  title: string;
  /** One line: what kind of games these are. */
  blurb: string;
  /** How often they can be played (true of every mode in the group). */
  cadence: string;
  modes: readonly PublicModeId[];
}

export const MODE_COLLECTIONS: readonly ModeCollection[] = [
  {
    id: "daily_extras",
    title: "Daily Extras",
    blurb: "Bonus stages of today's Daily Challenge. They unlock after the main Daily and play in order.",
    cadence: "Once a day",
    modes: ["time_trial", "survival"],
  },
  {
    id: "knowledge_arena",
    title: "Knowledge Arena",
    blurb: "Short timed matches against a bot. Get the whole board right to score.",
    cadence: "Play any time",
    modes: ["roster_lock", "draft_memory", "chronoscope", "match_grid", "reconstruct", "order_forge"],
  },
  {
    id: "precision_recall",
    title: "Precision & Recall",
    blurb: "Solo runs: place, spell, time and estimate. The real answer is revealed after every lock.",
    cadence: "Play any time",
    modes: ["rangefinder", "glyph_press", "perfect_timing", "stat_drop", "combat_estimate"],
  },
];

export interface GalleryGroup {
  id: ModeCollectionId | "more";
  title: string;
  blurb: string | null;
  cadence: string | null;
  modes: PublicModeEntry[];
}

/** The catalog's modes, grouped. Server order is kept inside every group. */
export function groupModes(modes: readonly PublicModeEntry[]): GalleryGroup[] {
  const placed = new Set<PublicModeId>();
  const groups: GalleryGroup[] = [];
  for (const c of MODE_COLLECTIONS) {
    const members = modes.filter((m) => c.modes.includes(m.id));
    members.forEach((m) => placed.add(m.id));
    if (members.length) groups.push({ id: c.id, title: c.title, blurb: c.blurb, cadence: c.cadence, modes: members });
  }
  const rest = modes.filter((m) => !placed.has(m.id));
  if (rest.length) groups.push({ id: "more", title: "More games", blurb: null, cadence: null, modes: rest });
  return groups;
}

/**
 * What a card shows about the player's eligibility.
 *
 *   ready        Play plays this mode now.
 *   daily_first  The Daily comes first; the button goes there.
 *   waiting      An earlier Daily bonus stage is up first.
 *   played       Played today (with today's result when there is one).
 *   closed       Closed for today.
 *   paused       New starts are paused by the owner.
 *   unavailable  Not available right now.
 *   checking     Still reading the player's Daily.
 *   coming_soon  No public launch yet.
 */
export type CardState =
  | "ready" | "daily_first" | "waiting" | "played" | "closed"
  | "paused" | "unavailable" | "checking" | "coming_soon";

export interface CardStatus {
  state: CardState;
  /**
   * A short mark on the card's art, only where it adds something: a Daily
   * stage that is up now, the Daily coming first, a mode not launched yet. A
   * bonus game that is simply playable carries none — its Play button says it.
   */
  badge: string | null;
  /** Drawn in place of Play when there is no Play: the resolver's own words. */
  plate: { label: string; detail: string | null } | null;
  /** A line under Play (why Play goes to the Daily), if any. */
  note: string | null;
}

export function cardStatus(entry: PublicModeEntry, action: ModeAction): CardStatus {
  switch (action.kind) {
    case "start":
      return { state: "ready", badge: null, plate: null, note: action.note };
    case "play":
      if (action.gate === "daily_first") {
        return { state: "daily_first", badge: "Daily first", plate: null, note: action.note };
      }
      return { state: "ready", badge: entry.launch?.kind === "daily_stage" ? "Up now" : null,
        plate: null, note: action.note };
    case "checking":
      return { state: "checking", badge: null, plate: null, note: null };
    case "done":
      return { state: action.gate, badge: null, plate: { label: action.label, detail: action.note }, note: null };
    case "blocked":
      return { state: action.gate, badge: null, plate: { label: action.label, detail: action.note }, note: null };
    case "coming_soon":
      return { state: "coming_soon", badge: "Coming soon", plate: { label: "Coming soon", detail: null }, note: null };
  }
}

/**
 * When EVERY card of a collection is paused with the same reason, the reason
 * is said once, under the collection's heading, and each card keeps a short
 * "Paused" plate. Returns that shared reason (null when there is none to share)
 * and the statuses to draw.
 */
export function sharePause(statuses: readonly CardStatus[]): { reason: string | null; statuses: CardStatus[] } {
  const reasons = new Set(statuses.map((s) => (s.state === "paused" ? s.plate?.detail ?? null : undefined)));
  const [only] = [...reasons];
  if (statuses.length < 2 || reasons.size !== 1 || typeof only !== "string") {
    return { reason: null, statuses: [...statuses] };
  }
  return {
    reason: only,
    statuses: statuses.map((s) => ({ ...s, plate: s.plate ? { ...s.plate, detail: null } : null })),
  };
}

/**
 * Where a card sits in its collection's grid. Daily Extras is two wide cards;
 * the others are three across at lg (a six-track grid), and a row left with
 * two cards shares its width between them instead of leaving a hole. On the
 * two-column (sm) grid an odd last card takes the full row.
 */
export function collectionCellClass(groupId: GalleryGroup["id"], index: number, count: number): string {
  if (groupId === "daily_extras") return "";
  const lastOdd = count % 2 === 1 && index === count - 1 ? "sm:col-span-2" : "";
  const lgSpan = count % 3 === 2 && index >= count - 2 ? "lg:col-span-3" : "lg:col-span-2";
  return cn(lastOdd, lgSpan);
}

/** How many cards are playable right now (for the hero's count). */
export const countReady = (statuses: Iterable<CardStatus>) =>
  [...statuses].filter((s) => s.state === "ready").length;
