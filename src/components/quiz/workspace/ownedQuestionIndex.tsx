/**
 * PT1.2 (revised) — the OWNERSHIP INDEX that lets HISTORY's question cards
 * say what REVIEW knows.
 *
 * HISTORY already renders every Ranked question in full, and every
 * `ReviewRound` already carries `canonicalQuestionRef` — the same identity
 * `ranked_question_discoveries` is keyed by. So the one fact HISTORY cannot
 * state on its own is the lifetime one: *you have met this question four
 * times and got it right twice, and it has been yours since August 18th.*
 * That is a property of the QUESTION, and the match record has no way to
 * know it.
 *
 * ONE REQUEST, NOT ONE PER CARD
 * ─────────────────────────────
 * A per-card lookup would be an N+1 against a surface that can hold twenty
 * matches of ten rounds. There is no by-ref endpoint and no bulk lookup, so
 * this reads ONE page of the collection at the endpoint's maximum
 * (`LIBRARY_MAX_LIMIT` = 100) and indexes it by ref. Cards then cost a map
 * lookup and no I/O at all.
 *
 * COMPLETE, OR SILENT — NEVER PARTIAL
 * ───────────────────────────────────
 * One page is the whole collection only while the collection fits in it. If
 * `total_count` exceeds what came back, this reports `complete: false` and
 * every card renders WITHOUT an ownership line.
 *
 * That is deliberate and it is the important property here. A partial index
 * cannot be distinguished from a real answer by the reader: a card with no
 * ownership line would read as "you do not own this", which for a player with
 * 120 discoveries would be false on most of their questions. Withholding the
 * line entirely is the only honest degradation available without a bulk or
 * by-ref read, and it is recorded as the exact blocker in the PT1 handoff.
 *
 * BEST-EFFORT, LIKE THE REVIEWS BESIDE IT
 * ───────────────────────────────────────
 * Any failure — a guest, a backend without the endpoint, a rate limit — is
 * "no ownership to show", never a broken record. HISTORY's own contract is
 * that a missing review degrades to placeholder marks; ownership degrades the
 * same way, one step quieter.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getQuestionLibrary, isAborted } from "@/lib/ranked-public/client";
import type { QuestionLibraryEntryView } from "@/lib/ranked-public/contracts";

/** The endpoint's own ceiling — asking for more is clamped server-side. */
export const OWNERSHIP_INDEX_LIMIT = 100;

export interface OwnedQuestionIndex {
  /** Ref -> the caller's lifetime record for that question. */
  byRef: ReadonlyMap<string, QuestionLibraryEntryView>;
  /** False when the collection did not fit in one page, or nothing loaded.
   *  While false, consumers must render NO ownership at all (see header). */
  complete: boolean;
}

const EMPTY: OwnedQuestionIndex = { byRef: new Map(), complete: false };

const OwnedQuestionIndexContext = createContext<OwnedQuestionIndex>(EMPTY);

/**
 * Load the caller's collection once and index it.
 *
 * `enabled` is false for a guest/anonymous session or a host that must not
 * fetch, in which case no request is made and the index stays incomplete —
 * which reads as "show no ownership", the correct answer for someone whose
 * collection we have not seen.
 */
export function useOwnedQuestionIndex(enabled: boolean): OwnedQuestionIndex {
  const [index, setIndex] = useState<OwnedQuestionIndex>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setIndex(EMPTY);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const view = await getQuestionLibrary(
          { limit: OWNERSHIP_INDEX_LIMIT, offset: 0 }, controller.signal);
        if (cancelled) return;
        const byRef = new Map<string, QuestionLibraryEntryView>();
        for (const e of view.entries) byRef.set(e.canonicalQuestionRef, e);
        setIndex({
          byRef,
          complete: view.summary.uniqueDiscovered <= view.entries.length,
        });
      } catch (e) {
        if (cancelled || isAborted(e)) return;
        setIndex(EMPTY);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled]);

  return index;
}

export function OwnedQuestionIndexProvider({
  value,
  children,
}: {
  value: OwnedQuestionIndex;
  children: React.ReactNode;
}) {
  return (
    <OwnedQuestionIndexContext.Provider value={value}>
      {children}
    </OwnedQuestionIndexContext.Provider>
  );
}

/**
 * The caller's lifetime record for one question, or null.
 *
 * Null covers every reason a card should print nothing: no ref on the round
 * (Meta Reflex, legacy rows), an incomplete index, or a question genuinely not
 * in the collection. The card does not need to tell those apart — in all of
 * them the honest output is silence.
 */
export function useQuestionOwnership(
  canonicalQuestionRef: string | null,
): QuestionLibraryEntryView | null {
  const index = useContext(OwnedQuestionIndexContext);
  return useMemo(() => {
    if (!canonicalQuestionRef || !index.complete) return null;
    return index.byRef.get(canonicalQuestionRef) ?? null;
  }, [canonicalQuestionRef, index]);
}
