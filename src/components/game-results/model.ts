/**
 * THE SHARED RESULT MODEL — one vocabulary for every finished game.
 *
 * Ranked, Bot Ranked, the Daily Challenge, Time Trial and an ordinary practice
 * quiz all end on the same five questions: what happened, how did I do, what
 * did I earn, what should I study, and what do I do next. They had five
 * different answers to those questions and five different screens; this module
 * is the ONE answer, and each mode writes an ADAPTER that fills it in.
 *
 * THE MODEL CARRIES FACTS, NEVER SPECULATION
 * ──────────────────────────────────────────
 * Every field is optional and every absent field renders NOTHING. A mode that
 * has no rating shows no rating row, not a zero and not a "pending"; a mode
 * with no per-question timing shows no speed stat. An adapter that cannot
 * source a value honestly leaves it out — that is the whole discipline here,
 * and it is why nothing in this file has a default that could be mistaken for
 * a measurement.
 */
import type { ReactNode } from "react";

/** The result word at the top. `complete` is a run that has no opponent to
 *  beat — a Daily, a Time Trial, a practice set. */
export type ResultState = "victory" | "defeat" | "draw" | "complete";

/**
 * How this game counted, in one word.
 *
 * Deliberately a closed set: these are the four things the product actually
 * distinguishes, and a free-text status would let a mode invent a fifth.
 * `null`/absent means the mode does not make the distinction at all.
 */
export type ResultStanding = "rated" | "unrated" | "official" | "practice";

export const STANDING_LABEL: Record<ResultStanding, string> = {
  rated: "Rated",
  unrated: "Unrated",
  official: "Official",
  practice: "Practice",
};

/** One side of the hero's compact identity strip. */
export interface ResultContestant {
  name: string;
  /** The score this side finished on, or null when the mode does not score. */
  score: number | null;
  /** R1 role id, when the match froze one. Drives the crest; never guessed. */
  roleId?: string | null;
  /** Role / class / "Bot" — whatever the mode already calls this side. */
  tag?: string | null;
  /** Level, when the match had a progression layer. */
  level?: number | null;
  /** Emphasised side. The MODE decides this from its own result row. */
  emphasis?: boolean;
}

/** One figure in the Performance Snapshot. */
export interface ResultStat {
  key: string;
  label: string;
  value: string;
  /** A quiet second line — "4 missed for score", "of 10 modules". */
  hint?: string | null;
  /** Colour intent. `plain` is the default and the right answer for most. */
  tone?: "plain" | "good" | "bad";
  /** Overrides `result-stat-<key>` for a mode with its own named contract. */
  testId?: string;
}

/** One line in Progress / Rewards. */
export interface ResultProgressItem {
  key: string;
  label: string;
  value: string;
  /** Signed movement, for tinting only. Omit when the value is not a delta. */
  delta?: number | null;
  icon?: "xp" | "streak" | "rating" | "collection" | "unrated";
  hint?: string | null;
  /** Overrides `result-progress-<key>` for a mode with its own contract. */
  testId?: string;
}

/** One module / round in the compact timeline. */
export interface ResultTimelineEntry {
  /** 1-based position. The timeline's stable key. */
  index: number;
  /** "Champion Mastery", "Item Builds" — the module's public subject. */
  label: string;
  outcome: "correct" | "incorrect" | "unanswered";
  /** What this module awarded, or null when no authority stated it. */
  points?: number | null;
  /** Optional expandable detail: the prompt the player was shown. */
  detail?: string | null;
  /** Optional second detail line — a category, a sub-result. */
  detailHint?: string | null;
}

export interface ResultAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * An additional test id for a control the product names specifically —
   * Practice's remediation CTA, for instance, which has to stay findable as
   * ITSELF rather than as "whatever is in the secondary slot this run".
   */
  testId?: string;
}

export interface ResultActions {
  /** Play Again. */
  primary?: ResultAction;
  /** Review Match — a first-class action, not a footnote. */
  secondary?: ResultAction;
  /** Back to Leaguecraft. */
  tertiary?: ResultAction;
}

/**
 * Everything a finished game has to say.
 *
 * Sections render in this order and each disappears entirely when empty, so a
 * mode with only a score and a way out gets a short, complete screen rather
 * than a tall one full of dashes.
 */
export interface GameResultsModel {
  state: ResultState;
  /** "Ranked Duel", "Time Trial", "Daily Challenge", the set's name. */
  mode: string;
  standing?: ResultStanding | null;
  /** Overrides `result-standing` for a mode with its own named contract. */
  standingTestId?: string;
  /** Overrides the state's own word ("Challenge complete"). */
  headline?: string;
  /** One quiet line under the headline — a completion reason, a date. */
  subheading?: string | null;
  /** The headline number. `outOf` prints "17 / 20"; `opponent` prints a duel. */
  score?: {
    you: number;
    opponent?: number | null;
    outOf?: number | null;
    label?: string;
    /** Overrides `result-score` for a mode with its own named contract. */
    testId?: string;
  } | null;
  contestants?: { you: ResultContestant; opponent?: ResultContestant | null } | null;
  snapshot?: ResultStat[];
  progress?: ResultProgressItem[];
  /** Deterministic sentences from `buildMatchReport`. Never generated prose. */
  report?: string[];
  timeline?: {
    /** "Modules", "Questions" — what one entry IS in this mode. */
    unitLabel: string;
    entries: ResultTimelineEntry[];
  } | null;
  /** Mode-owned content under Review — discoveries, missed questions. */
  review?: ReactNode;
  actions?: ResultActions;
}
