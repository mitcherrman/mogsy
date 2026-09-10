// ---------------------------------------------------------------------------
// RB3 — the guided playtest's step machine.
//
// It owns ONE decision: is an informational page on screen right now, or is
// the player in the match? It does not render questions, score anything, hold
// a copy of the gameplay sequence, or know what a segment contains. The arena
// does all of that, unchanged.
//
// WHERE THE STATE LIVES
// ─────────────────────
// Almost nowhere. The position in the guided sequence is DERIVED, every
// render, from two facts:
//
//   `completedSegments`  the server's own count of settled segments
//   `dismissed`          which pages this viewer has already pressed past
//
// The first is authoritative and survives everything. The second is a per-
// viewer convenience persisted in `sessionStorage` under the match id, so a
// refresh mid-match does not re-show a page the player already read. Losing it
// is harmless and bounded: the worst case is reading one page twice, which is
// not a corrupted sequence. It is deliberately NOT the sequence itself.
//
// IDEMPOTENCE
// ───────────
// `dismiss` writes a SET keyed by page id. Pressing Continue twice adds the
// same id twice, which is the same set — there is no cursor to advance past
// the end of, and no way to skip a page by clicking fast.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PLAYTEST_INTERSTITIALS,
  PLAYTEST_INTRO,
  PLAYTEST_OUTRO,
  type PlaytestInterstitial,
  interstitialAfter,
} from "./preset";

/** Where the guided session is. Exactly one is true at a time. */
export type PlaytestStage =
  /** Before the match exists. The intro is on screen. */
  | "intro"
  /** In the match: the canonical arena is on screen and the clock runs. */
  | "gameplay"
  /** An informational page is on screen; the match is HELD. */
  | "interstitial"
  /** The canonical Ranked result screen is on screen. */
  | "result"
  /** After the result, the playtest's own closing page. */
  | "outro";

export interface PlaytestSession {
  stage: PlaytestStage;
  /** The page to draw, for `intro` / `interstitial` / `outro`. */
  page: PlaytestInterstitial | null;
  /**
   * Hold the match. True for exactly the stages where no question may be on a
   * clock — passed straight to `useRankedMatch({ paused })`.
   */
  paused: boolean;
  /** Press the page's action. Idempotent. */
  advance: () => void;
}

const key = (matchId: string | null) => `mogzy.playtest.read.${matchId ?? "pre"}`;

function readDismissed(matchId: string | null): ReadonlySet<string> {
  try {
    const raw = window.sessionStorage.getItem(key(matchId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(
      (v): v is string => typeof v === "string") : []);
  } catch {
    // A private window, blocked site data, or a thrown accessor. The session
    // still works; a page may simply be shown again after a refresh.
    return new Set();
  }
}

export interface PlaytestSessionInput {
  /** The match, once one exists. Null while the intro is on screen. */
  matchId: string | null;
  /** The server's settled-segment count. Null before the first snapshot. */
  completedSegments: number | null;
  /** Has the match reached its canonical result screen? */
  matchOver: boolean;
  /** Test seam. Defaults to the shipped preset. */
  pages?: readonly PlaytestInterstitial[];
}

export function usePlaytestSession(input: PlaytestSessionInput): PlaytestSession {
  const { matchId, completedSegments, matchOver } = input;
  const pages = input.pages ?? PLAYTEST_INTERSTITIALS;
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => readDismissed(matchId));

  // Re-read when the match id resolves: the intro is dismissed before a match
  // exists, so its record starts under the pre-match key and the session
  // adopts the match's own store as soon as there is one.
  useEffect(() => { setDismissed(readDismissed(matchId)); }, [matchId]);

  const persist = useCallback((next: ReadonlySet<string>) => {
    try {
      window.sessionStorage.setItem(key(matchId), JSON.stringify([...next]));
    } catch { /* see readDismissed */ }
  }, [matchId]);

  const session = useMemo<Omit<PlaytestSession, "advance">>(() => {
    if (matchOver) {
      // TWO stages after the last question, in this order:
      //   `result` — the CANONICAL Ranked end screen is on screen. RB2 made
      //              that a real completion and RB3 does not replace it; the
      //              outro is what its primary action leads TO.
      //   `outro`  — the playtest's own closing page.
      // Neither holds anything: a finished match has no clock left to spend.
      return dismissed.has(PLAYTEST_OUTRO.id)
        ? { stage: "outro", page: PLAYTEST_OUTRO, paused: false }
        : { stage: "result", page: PLAYTEST_OUTRO, paused: false };
    }
    if (!matchId) {
      // No match, so nothing to pause. `paused` is about a running clock, and
      // there is not one until the player presses Begin.
      return { stage: "intro", page: PLAYTEST_INTRO, paused: false };
    }
    if (completedSegments === null) {
      // The first snapshot has not landed. Do NOT hold — holding here would
      // stop the very poll that answers the question.
      return { stage: "gameplay", page: null, paused: false };
    }
    const due = interstitialAfter(completedSegments, pages);
    if (due && !dismissed.has(due.id)) {
      return { stage: "interstitial", page: due, paused: true };
    }
    return { stage: "gameplay", page: null, paused: false };
  }, [matchId, completedSegments, matchOver, dismissed, pages]);

  const advance = useCallback(() => {
    const id = session.page?.id;
    if (!id) return;
    setDismissed((prev) => {
      if (prev.has(id)) return prev;       // idempotent: same set, no re-render
      const next = new Set(prev).add(id);
      persist(next);
      return next;
    });
  }, [session.page, persist]);

  return { ...session, advance };
}

/** Has this viewer already pressed past the intro for a not-yet-created match? */
export function introDismissed(): boolean {
  return readDismissed(null).has(PLAYTEST_INTRO.id);
}
