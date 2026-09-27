/**
 * HUB6.3D — cross-highlight between History's analytics and its question icons.
 *
 * A future chart (a donut slice, a streak bar, a strike marker) says "these
 * questions"; the persistent timeline lights exactly those occurrences and
 * steps the rest back. The unit of address is the OCCURRENCE — HUB6.3B's
 * `question_result_id` — because the server already returns exact membership
 * for outcomes, public categories, streak spans, strikes and Review links.
 *
 * Local by design: one provider per expanded Daily (`DailyRunRow`), so a
 * highlight can never leak into another run or survive a collapse. No global
 * store.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { HistoryStage } from "@/lib/history/contracts";
import { buildStageViewModel, type QuestionResult } from "@/components/quiz/workspace/historyViewModel";

export interface HistoryHighlight {
  /** Which stage the members belong to (a highlight is stage-scoped). */
  stageId: string;
  /** What the highlight means, for labels and legends. */
  outcome: QuestionResult | null;
  publicCategory: string | null;
  /** The exact occurrences to light. */
  occurrenceIds: ReadonlySet<string>;
}

interface HighlightState {
  highlight: HistoryHighlight | null;
  setHighlight: (h: HistoryHighlight | null) => void;
}

const HighlightContext = createContext<HighlightState>({ highlight: null, setHighlight: () => {} });

export function HistoryHighlightProvider({ children }: { children: React.ReactNode }) {
  const [highlight, setHighlightState] = useState<HistoryHighlight | null>(null);
  const setHighlight = useCallback((h: HistoryHighlight | null) => setHighlightState(h), []);
  const value = useMemo(() => ({ highlight, setHighlight }), [highlight, setHighlight]);
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

export function useHistoryHighlight(): HighlightState {
  return useContext(HighlightContext);
}

/** The occurrence ids a stage's timeline should light, or null when nothing
 *  targets this stage. */
export function useStageHighlight(stageId: string): ReadonlySet<string> | null {
  const { highlight } = useHistoryHighlight();
  return highlight && highlight.stageId === stageId ? highlight.occurrenceIds : null;
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
  return { stageId: stage.stageId, outcome, publicCategory: key, occurrenceIds: new Set(ids) };
}

/** A highlight for one outcome of a stage — the donut's inner ring. */
export function outcomeHighlight(stage: HistoryStage, outcome: QuestionResult): HistoryHighlight {
  const server = stage.analytics?.personalFacts.outcomes?.[outcome];
  const ids = server
    ? server.questionResultIds
    : [...buildStageViewModel(stage).byOccurrence.values()].filter((o) => o.outcome === outcome).map((o) => o.occurrenceId);
  return { stageId: stage.stageId, outcome, publicCategory: null, occurrenceIds: new Set(ids) };
}

/** A highlight for exact occurrences (a streak span, a strike, a replay). */
export function occurrenceHighlight(stage: HistoryStage, ids: Iterable<string>): HistoryHighlight {
  return { stageId: stage.stageId, outcome: null, publicCategory: null, occurrenceIds: new Set(ids) };
}
