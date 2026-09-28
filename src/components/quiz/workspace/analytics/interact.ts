/**
 * HUB6.3E — chart → rail wiring. A donut target (an outcome, a slice, a
 * group) becomes a `HistoryHighlight` of its exact members; hover/focus
 * previews it, click/tap locks it (a second click unlocks).
 */
import { useCallback } from "react";
import { runHighlight, useHighlightControls, type HistoryHighlight } from "@/components/quiz/workspace/historyHighlight";
import { RESULT_WORD } from "./ink";
import { targetKey, type DonutTarget } from "./charts";
import type { NestedDonutData } from "./derive";

export interface DonutWiring {
  onPreview: (t: DonutTarget | null) => void;
  onLock: (t: DonutTarget) => void;
  lockedKey: string | null;
}

/**
 * `scope`: the stage the donut describes, or null for a run-wide donut (each
 * group's own stages are its scope; an outcome lights every stage).
 * `expand` adds related occurrences (a Review replay's source miss).
 */
export function useDonutHighlight(
  data: NestedDonutData,
  namespace: string,
  scope: string | null,
  expand?: (ids: string[]) => { ids: string[]; stageIds: string[] },
): DonutWiring {
  const { preview, toggleLock, locked } = useHighlightControls();
  const build = useCallback((t: DonutTarget): HistoryHighlight => {
    let ids: string[];
    let stageIds: string[] | null;
    let label: string;
    let outcome = null as HistoryHighlight["outcome"];
    if (t.kind === "group") {
      const g = data.groups.find((x) => x.group === t.group);
      ids = g?.ids ?? [];
      stageIds = scope ? [scope] : g?.stageIds ?? [];
      label = g?.label ?? "";
    } else {
      ids = t.slice.ids;
      outcome = t.slice.outcome;
      label = t.kind === "outcome" ? RESULT_WORD[t.slice.outcome] : `${t.slice.label} · ${RESULT_WORD[t.slice.outcome].toLowerCase()}`;
      if (scope) stageIds = [scope];
      else if (t.kind === "slice") stageIds = data.groups.find((g) => g.group === t.slice.group)?.stageIds ?? [];
      else stageIds = null;
    }
    if (expand) {
      const more = expand(ids);
      ids = [...ids, ...more.ids];
      if (stageIds) stageIds = [...new Set([...stageIds, ...more.stageIds])];
    }
    return runHighlight(ids, { key: `${namespace}:${targetKey(t)}`, stageIds, outcome, label });
  }, [data, namespace, scope, expand]);

  const onPreview = useCallback((t: DonutTarget | null) => preview(t ? build(t) : null), [preview, build]);
  const onLock = useCallback((t: DonutTarget) => toggleLock(build(t)), [toggleLock, build]);
  const prefix = `${namespace}:`;
  const lockedKey = locked?.key?.startsWith(prefix) ? locked.key.slice(prefix.length) : null;
  return { onPreview, onLock, lockedKey };
}
