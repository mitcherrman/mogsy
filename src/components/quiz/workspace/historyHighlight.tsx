/**
 * HUB6.3D → HUB6.3E — cross-highlight between History's analytics and its
 * question icons.
 *
 * A chart (a donut slice, a streak chain, a strike marker, a Review link)
 * says "these questions"; the persistent timeline lights exactly those
 * occurrences and steps the rest back. The unit of address is the OCCURRENCE
 * — HUB6.3B's `question_result_id` — because the server already returns exact
 * membership for outcomes, public categories, streak spans, strikes and
 * Review links.
 *
 * HUB6.3E — PREVIEW AND LOCK
 * ──────────────────────────
 *   hover / focus   `preview(h)` — temporary; `preview(null)` on leave/blur
 *   click / tap     `toggleLock(h)` — stays until clicked again, another
 *                   lock, Escape, "Clear", or the run's view changing
 *   Escape          clears the lock (one document listener, only while
 *                   something is locked)
 * The effective highlight is the preview when there is one, else the lock.
 *
 * SCOPE: a highlight addresses one stage (`stageId`), several (`stageIds`),
 * or — both null — every stage of the run (the Daily donut's inner ring).
 * Rails outside the scope are left untouched.
 *
 * Local by design: one provider per Daily (`DailyRunRow`), so a highlight can
 * never leak into another run or survive a collapse. No global store.
 *
 * THREE CONTEXTS, so a hover is cheap: the actions never change; the lock
 * changes only on click; the effective highlight changes on every preview and
 * is read only by the rails. A chart that previews therefore re-renders
 * nothing but the question rails (`useHighlightControls` for charts,
 * `useStageHighlightState` for rails).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { HistoryStage } from "@/lib/history/contracts";
import { buildStageViewModel, type QuestionResult } from "@/components/quiz/workspace/historyViewModel";

export interface HistoryHighlight {
  /** The one stage the members belong to, or null for a multi-stage / run
   *  highlight (see `stageIds`). */
  stageId: string | null;
  /** Several stages (Review links: the Review rail and a source rail). Null:
   *  `stageId` alone, or — with `stageId` null too — every stage. */
  stageIds?: ReadonlySet<string> | null;
  /** What the highlight means, for labels and legends. */
  outcome: QuestionResult | null;
  publicCategory: string | null;
  /** The exact occurrences to light. */
  occurrenceIds: ReadonlySet<string>;
  /** Identity, so a second click on the same control unlocks it. */
  key?: string;
  /** Words for the "Lighting N questions" line. */
  label?: string;
}

interface HighlightState {
  /** The effective highlight: the preview, else the lock. */
  highlight: HistoryHighlight | null;
  locked: HistoryHighlight | null;
  /** HUB6.3D API: set (lock) or clear the highlight. */
  setHighlight: (h: HistoryHighlight | null) => void;
  preview: (h: HistoryHighlight | null) => void;
  toggleLock: (h: HistoryHighlight) => void;
  clear: () => void;
}

interface HighlightActions {
  setHighlight: (h: HistoryHighlight | null) => void;
  preview: (h: HistoryHighlight | null) => void;
  toggleLock: (h: HistoryHighlight) => void;
  clear: () => void;
}

const NOOP = () => {};
const ActionsContext = createContext<HighlightActions>({ setHighlight: NOOP, preview: NOOP, toggleLock: NOOP, clear: NOOP });
const LockedContext = createContext<HistoryHighlight | null>(null);
const EffectiveContext = createContext<HistoryHighlight | null>(null);

const sameKey = (a: HistoryHighlight | null, b: HistoryHighlight | null) =>
  !!a && !!b && a.key !== undefined && a.key === b.key;

export function HistoryHighlightProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState<HistoryHighlight | null>(null);
  const [previewed, setPreviewed] = useState<HistoryHighlight | null>(null);
  const setHighlight = useCallback((h: HistoryHighlight | null) => {
    setPreviewed(null);
    setLocked(h);
  }, []);
  const preview = useCallback((h: HistoryHighlight | null) => setPreviewed(h), []);
  const toggleLock = useCallback((h: HistoryHighlight) => {
    setPreviewed(null);
    setLocked((cur) => (sameKey(cur, h) ? null : h));
  }, []);
  const clear = useCallback(() => {
    setPreviewed(null);
    setLocked(null);
  }, []);

  useEffect(() => {
    if (!locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [locked, clear]);

  const actions = useMemo(() => ({ setHighlight, preview, toggleLock, clear }), [setHighlight, preview, toggleLock, clear]);
  return (
    <ActionsContext.Provider value={actions}>
      <LockedContext.Provider value={locked}>
        <EffectiveContext.Provider value={previewed ?? locked}>{children}</EffectiveContext.Provider>
      </LockedContext.Provider>
    </ActionsContext.Provider>
  );
}

/** Everything (re-renders on every preview) — the HUB6.3D API. */
export function useHistoryHighlight(): HighlightState {
  const actions = useContext(ActionsContext);
  const locked = useContext(LockedContext);
  const highlight = useContext(EffectiveContext);
  return { ...actions, locked, highlight };
}

/** For charts: the actions and the lock (for pressed states) — a hover
 *  preview does not re-render the caller. */
export function useHighlightControls(): HighlightActions & { locked: HistoryHighlight | null } {
  const actions = useContext(ActionsContext);
  const locked = useContext(LockedContext);
  return useMemo(() => ({ ...actions, locked }), [actions, locked]);
}

function inScope(h: HistoryHighlight, stageId: string): boolean {
  if (h.stageIds) return h.stageIds.has(stageId);
  return h.stageId === null || h.stageId === stageId;
}

/** The occurrence ids a stage's timeline should light, or null when nothing
 *  targets this stage. */
export function useStageHighlight(stageId: string): ReadonlySet<string> | null {
  const highlight = useContext(EffectiveContext);
  return highlight && inScope(highlight, stageId) ? highlight.occurrenceIds : null;
}

/** As `useStageHighlight`, plus whether it is a lock (the timeline pages to
 *  a lit icon only for a lock — a hover never moves the rail). */
export function useStageHighlightState(stageId: string): { ids: ReadonlySet<string>; locked: boolean } | null {
  const highlight = useContext(EffectiveContext);
  const locked = useContext(LockedContext);
  if (!highlight || !inScope(highlight, stageId)) return null;
  return { ids: highlight.occurrenceIds, locked: highlight === locked };
}

/** Whether a control's highlight is the current lock (its pressed state). */
export function useIsLocked(key: string): boolean {
  const locked = useContext(LockedContext);
  return locked?.key === key;
}

// ─────────────────────────────────────────────────────────── builders

/**
 * A highlight for one public category of a stage, optionally narrowed to one
 * outcome — the nested donut's outer slice (category) and a segment of it
 * (category × outcome). Uses the server's exact membership when the stage's
 * Premium analytics carry it, else the record's own questions (Free facts).
 */
export function categoryHighlight(stage: HistoryStage, key: string, outcome: QuestionResult | null = null): HistoryHighlight {
  const server = stage.analytics?.personalFacts.categories.find((c) => c.publicCategory.key === key);
  let ids: string[];
  if (server) {
    ids = outcome ? server.idsByOutcome[outcome] : server.questionResultIds;
  } else {
    const vm = buildStageViewModel(stage);
    ids = [...vm.byOccurrence.values()]
      .filter((o) => o.publicCategory?.key === key && (!outcome || o.outcome === outcome))
      .map((o) => o.occurrenceId);
  }
  return {
    stageId: stage.stageId, outcome, publicCategory: key, occurrenceIds: new Set(ids),
    key: `${stage.stageId}:cat:${key}:${outcome ?? "all"}`,
  };
}

/** A highlight for one outcome of a stage — the donut's inner ring. */
export function outcomeHighlight(stage: HistoryStage, outcome: QuestionResult): HistoryHighlight {
  const server = stage.analytics?.personalFacts.outcomes?.[outcome];
  const ids = server
    ? server.questionResultIds
    : [...buildStageViewModel(stage).byOccurrence.values()].filter((o) => o.outcome === outcome).map((o) => o.occurrenceId);
  return {
    stageId: stage.stageId, outcome, publicCategory: null, occurrenceIds: new Set(ids),
    key: `${stage.stageId}:out:${outcome}`,
  };
}

/** A highlight for exact occurrences (a streak span, a strike, a replay). */
export function occurrenceHighlight(stage: HistoryStage, ids: Iterable<string>, key?: string): HistoryHighlight {
  return { stageId: stage.stageId, outcome: null, publicCategory: null, occurrenceIds: new Set(ids), key };
}

/** Exact occurrences across several stages of one run (or every stage when
 *  `stageIds` is null) — the Daily donut, Review links. */
export function runHighlight(
  ids: Iterable<string>,
  { key, stageIds = null, outcome = null, label }:
    { key: string; stageIds?: Iterable<string> | null; outcome?: QuestionResult | null; label?: string },
): HistoryHighlight {
  return {
    stageId: null,
    stageIds: stageIds ? new Set(stageIds) : null,
    outcome,
    publicCategory: null,
    occurrenceIds: new Set(ids),
    key,
    label,
  };
}
