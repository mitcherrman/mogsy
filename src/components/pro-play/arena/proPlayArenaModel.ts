/**
 * PPQ2-C — the PURE half of the premium Pro Play arena presentation.
 *
 * Everything the plates, tablets and panels decide that is not markup lives
 * here, so it can be tested without a DOM and so no component re-derives it
 * on its own. It reads ONLY the pre-answer presentation contract
 * (`ProPlayQuestionContext`, see `lib/pro-play/contract.ts`) and the neutral
 * option list. It never reads `presentation` (legacy), `result`, `evidence`
 * or any value that orders the options.
 *
 * THE SYMMETRY RULE, STATED ONCE
 * ──────────────────────────────
 * A tablet's identity is either RICH FOR EVERY OPTION or PLAIN FOR EVERY
 * OPTION. `alignTabletIdentities` returns one shape for the whole question:
 * if any subject is missing, out of order, of a different kind, or does not
 * name the option it sits beside, every tablet falls back to its label. A
 * richer tablet is itself a signal, so "mostly rich" is not allowed.
 */
import type { RankedRole } from "@/lib/ranked-public/roles";
import {
  RECENT_ESPORTS_TAG,
  type ProPlayLeagueChip,
  type ProPlayQuestionContext,
  type ProPlaySubject,
  type ProPlayTag,
  type ProPlayTeamChip,
} from "@/lib/pro-play/contract";

/** Neutral absence marker — identical on every tablet that lacks a value. */
export const EMPTY_VALUE = "—";

/** The entity kinds the plates and tablets draw richly. */
export type ProPlayEntityKind = "champion" | "player" | "team";

/** Backend role id → the canonical Ranked role vocabulary. FLEX has no lane. */
const ROLE_ID: Record<string, RankedRole> = {
  top: "top",
  jungle: "jungle",
  mid: "mid",
  adc: "adc",
  bot: "adc",
  support: "support",
};

/** The role emblem for a player subject, or null (FLEX, unknown, absent). */
export function rankedRoleFor(subject: ProPlaySubject | null | undefined): RankedRole | null {
  const id = subject?.role?.id;
  return id ? (ROLE_ID[id] ?? null) : null;
}

/** The player-facing role word, e.g. "JUNGLE", "FLEX"; "—" when absent. */
export function roleLabel(subject: ProPlaySubject | null | undefined): string {
  return subject?.role?.label?.trim() || EMPTY_VALUE;
}

/** The champion manifest key, or null for any other kind. */
export function championKey(subject: ProPlaySubject | null | undefined): string | null {
  if (!subject || subject.kind !== "champion") return null;
  return subject.media?.key ?? null;
}

/**
 * The typographic mark for an entity with no logo or portrait.
 *
 * A team's server short code when it has one ("KRX", "T1"); otherwise up to
 * three initials of the name. Never invented beyond the name itself.
 */
export function monogram(label: string, short?: string | null): string {
  const s = short?.trim();
  if (s) return s.slice(0, 4).toUpperCase();
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return EMPTY_VALUE;
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

/** A row of compact chips plus how many the server held back ("+N"). */
export interface ChipRow<T> {
  shown: T[];
  hidden: number;
}

export function teamChips(subject: ProPlaySubject): ChipRow<ProPlayTeamChip> {
  const shown = subject.teams ?? [];
  return { shown, hidden: Math.max(0, (subject.teams_total ?? shown.length) - shown.length) };
}

export function leagueChips(subject: ProPlaySubject): ChipRow<ProPlayLeagueChip> {
  const shown = subject.leagues ?? [];
  return { shown, hidden: Math.max(0, (subject.leagues_total ?? shown.length) - shown.length) };
}

/** Seasons in scope as served ("2017–2024"), or "—". */
export function seasonsLabel(subject: ProPlaySubject | null | undefined): string {
  return subject?.seasons?.label?.trim() || EMPTY_VALUE;
}

/**
 * One tablet's identity. Plain when the question cannot be drawn richly for
 * EVERY option (see the module note).
 */
export type TabletIdentity =
  | { kind: "champion"; label: string; championKey: string | null }
  | { kind: "player"; label: string; subject: ProPlaySubject }
  | { kind: "team"; label: string; subject: ProPlaySubject }
  | { kind: "plain"; label: string };

/** What every tablet of one question draws. One kind, by construction. */
export interface TabletIdentities {
  kind: ProPlayEntityKind | "plain";
  items: TabletIdentity[];
}

const isEntityKind = (k: string): k is ProPlayEntityKind =>
  k === "champion" || k === "player" || k === "team";

/**
 * Pair each option with the subject the server sent for it, positionally.
 *
 * `context.subjects` arrives in the SAME shuffled order as `choices`, so
 * position is the join — but it is verified, not assumed: a subject must name
 * exactly the option beside it. Any mismatch, length difference or mixed kind
 * drops the WHOLE question to plain identities.
 */
export function alignTabletIdentities(
  options: ReadonlyArray<{ label: string }>,
  context: ProPlayQuestionContext | null | undefined,
): TabletIdentities {
  const plain: TabletIdentities = {
    kind: "plain",
    items: options.map((o) => ({ kind: "plain", label: o.label })),
  };
  const subjects = context?.subjects;
  if (!subjects || subjects.length !== options.length || options.length === 0) return plain;
  const kind = subjects[0]?.kind;
  if (!kind || !isEntityKind(kind)) return plain;
  for (let i = 0; i < options.length; i += 1) {
    const s = subjects[i];
    if (!s || s.kind !== kind || s.label !== options[i].label) return plain;
  }
  return {
    kind,
    items: subjects.map((s): TabletIdentity => (
      kind === "champion"
        ? { kind, label: s.label, championKey: championKey(s) }
        : { kind, label: s.label, subject: s }
    )),
  };
}

/**
 * Tablet arrangement from the option COUNT only:
 *  - "facing" — a two-way comparison, two equal tablets either side of a seam;
 *  - "grid"   — three or four, a 2x2 of equal cells (three leaves the fourth
 *               cell empty rather than stretching one tablet);
 *  - "stack"  — anything else, one column.
 */
export type TabletLayout = "facing" | "grid" | "stack";

export function tabletLayout(count: number): TabletLayout {
  if (count === 2) return "facing";
  if (count === 3 || count === 4) return "grid";
  return "stack";
}

/** Option letters, A–D, then numbers beyond (never reached by the contract). */
export function optionLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** The anchor plate to draw. Unknown kinds draw the typographic scope plate. */
export type AnchorPlateKind = "champion" | "player" | "team" | "scope" | "none";

export function anchorPlateKind(context: ProPlayQuestionContext | null | undefined): AnchorPlateKind {
  const anchor = context?.anchor;
  if (!anchor) return "none";
  if (anchor.kind === "champion" || anchor.kind === "player" || anchor.kind === "team") {
    return anchor.kind;
  }
  return "scope";
}

/** Scope tags in the server's own order — never re-sorted, never filtered. */
export function scopeTags(context: ProPlayQuestionContext | null | undefined): ProPlayTag[] {
  return Array.isArray(context?.scope_tags) ? context!.scope_tags : [];
}

/** True when the server marked this question as current-events content. */
export function isRecent(context: ProPlayQuestionContext | null | undefined): boolean {
  return (context?.editorial_tags ?? []).some((t) => t.id === RECENT_ESPORTS_TAG);
}

/**
 * The scope tag types that name a COMPETITION (as opposed to a time window).
 * Used only to choose which tags headline the competition plate.
 */
const COMPETITION_TYPES = new Set(["league", "tournament", "pro_play"]);

export function competitionTags(context: ProPlayQuestionContext | null | undefined): ProPlayTag[] {
  return scopeTags(context).filter((t) => COMPETITION_TYPES.has(t.type));
}

export function windowTags(context: ProPlayQuestionContext | null | undefined): ProPlayTag[] {
  return scopeTags(context).filter((t) => !COMPETITION_TYPES.has(t.type));
}

/**
 * One outcome per question position, from results the client actually
 * received. `undefined` = not answered yet (or not received).
 */
export type ProPlayOutcome = "correct" | "incorrect";

/** The session headline for a phone header strip: "Question 4 / 10 · 2 correct". */
export function sessionHeadline(s: { number: number; total: number; score: number; answered: number }): string {
  const base = `Question ${s.number} / ${s.total}`;
  return s.answered > 0 ? `${base} · ${s.score} correct` : base;
}
