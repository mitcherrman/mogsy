/**
 * ATL-P1-C — the workspace hook: semantic history + visual state + derived
 * views, plus one announcement channel for the live region.
 *
 * Semantic actions go through `act` (undoable). Visual actions go through
 * `see` (not undoable; they change nothing a query would read). The dock is
 * derived: groups appear where their first member sits, comparison bridges
 * appear right after the later of their two Lenses.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { composeComparison } from "@/lib/atlas-p1c/compare";
import { EMPTY_WORKSPACE } from "@/lib/atlas-p1c/fixtures";
import { resolveLens } from "@/lib/atlas-p1c/resolve";
import type { ComparisonView, LensView, WorkspaceSnapshot, WorkspaceState } from "@/lib/atlas-p1c/types";
import { EMPTY_VISUAL, reduceVisual, type VisualAction, type VisualState } from "@/lib/atlas-p1c/visual";
import { createHistory, describeAction, reduceHistory, type HistoryAction } from "@/lib/atlas-p1c/workspace";

export type DockItem =
  | { key: string; kind: "lens"; id: string; lensIds: [string] }
  | { key: string; kind: "group"; id: string; lensIds: string[] }
  | { key: string; kind: "comparison"; id: string; lensIds: [string, string] };

export interface AtlasWorkspace {
  state: WorkspaceState;
  visual: VisualState;
  views: Map<string, LensView>;
  comparisons: Map<string, ComparisonView>;
  dock: DockItem[];
  canUndo: boolean;
  canRedo: boolean;
  announcement: string;
  act: (action: HistoryAction) => void;
  see: (action: VisualAction, announce?: string) => void;
  announce: (text: string) => void;
  moveItem: (key: string, delta: number) => void;
  moveItemTo: (key: string, index: number, announceMove?: boolean) => void;
  restore: (snapshot: WorkspaceSnapshot) => void;
  snapshotNow: (label: string) => WorkspaceSnapshot;
}

export function deriveDock(state: WorkspaceState, visual: VisualState): DockItem[] {
  const items: DockItem[] = [];
  const placed = new Set<string>();
  const groupsEmitted = new Set<string>();
  const comparisonsEmitted = new Set<string>();
  const byId = new Map(state.lenses.map((l) => [l.id, l]));

  const flushComparisons = () => {
    for (const c of state.comparisons) {
      if (comparisonsEmitted.has(c.id)) continue;
      if (placed.has(c.lensIds[0]) && placed.has(c.lensIds[1])) {
        comparisonsEmitted.add(c.id);
        items.push({ key: `cmp:${c.id}`, kind: "comparison", id: c.id, lensIds: c.lensIds });
      }
    }
  };

  for (const id of visual.order) {
    const lens = byId.get(id);
    if (!lens || placed.has(id)) continue;
    if (lens.groupId) {
      if (groupsEmitted.has(lens.groupId)) continue;
      groupsEmitted.add(lens.groupId);
      const members = visual.order.filter((m) => byId.get(m)?.groupId === lens.groupId);
      for (const m of members) placed.add(m);
      items.push({ key: `grp:${lens.groupId}`, kind: "group", id: lens.groupId, lensIds: members });
    } else {
      placed.add(id);
      items.push({ key: `lens:${id}`, kind: "lens", id, lensIds: [id] });
    }
    flushComparisons();
  }
  return items;
}

function orderFromDock(items: DockItem[]): string[] {
  const order: string[] = [];
  for (const item of items) {
    if (item.kind === "comparison") continue;
    for (const id of item.lensIds) if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function useAtlasWorkspace(initial: WorkspaceState = EMPTY_WORKSPACE, initialOrder?: string[]): AtlasWorkspace {
  const [history, dispatchHistory] = useReducer(reduceHistory, initial, createHistory);
  const [visual, dispatchVisual] = useReducer(
    reduceVisual,
    initialOrder ? { ...EMPTY_VISUAL, order: initialOrder } : EMPTY_VISUAL,
  );
  const [announcement, setAnnouncement] = useState("");
  const announceSeq = useRef(0);

  const state = history.present;

  // The only bridge from semantic to visual: which ids exist.
  useEffect(() => {
    dispatchVisual({ type: "syncLenses", ids: state.lenses.map((l) => l.id) });
  }, [state.lenses]);

  const announce = useCallback((text: string) => {
    announceSeq.current += 1;
    // A trailing marker forces the live region to re-announce identical text.
    setAnnouncement(`${text}${announceSeq.current % 2 ? "" : " "}`);
  }, []);

  const act = useCallback(
    (action: HistoryAction) => {
      dispatchHistory(action);
      announce(describeAction(action));
    },
    [announce],
  );

  const see = useCallback(
    (action: VisualAction, text?: string) => {
      dispatchVisual(action);
      if (text) announce(text);
    },
    [announce],
  );

  const views = useMemo(() => {
    const map = new Map<string, LensView>();
    for (const lens of state.lenses) map.set(lens.id, resolveLens(lens, state.global));
    return map;
  }, [state.lenses, state.global]);

  const comparisons = useMemo(() => {
    const map = new Map<string, ComparisonView>();
    for (const c of state.comparisons) {
      const a = views.get(c.lensIds[0]);
      const b = views.get(c.lensIds[1]);
      if (a && b) map.set(c.id, composeComparison(c, a, b));
    }
    return map;
  }, [state.comparisons, views]);

  const dock = useMemo(() => deriveDock(state, visual), [state, visual]);

  const moveItemTo = useCallback(
    (key: string, index: number, announceMove = true) => {
      const items = deriveDock(state, visual).filter((i) => i.kind !== "comparison");
      const from = items.findIndex((i) => i.key === key);
      if (from < 0) return;
      const to = Math.max(0, Math.min(items.length - 1, index));
      if (from === to) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      dispatchVisual({ type: "setOrder", order: orderFromDock(next) });
      if (announceMove) announce(`Moved to position ${to + 1} of ${items.length}.`);
    },
    [state, visual, announce],
  );

  const moveItem = useCallback(
    (key: string, delta: number) => {
      const items = deriveDock(state, visual).filter((i) => i.kind !== "comparison");
      const from = items.findIndex((i) => i.key === key);
      if (from < 0) return;
      moveItemTo(key, from + delta);
    },
    [state, visual, moveItemTo],
  );

  const restore = useCallback(
    (snapshot: WorkspaceSnapshot) => {
      dispatchHistory({ type: "restore", state: snapshot.state });
      dispatchVisual({ type: "setOrder", order: snapshot.order });
      announce(`Restored "${snapshot.label}" from memory. Nothing was loaded from a server.`);
    },
    [announce],
  );

  const snapshotNow = useCallback(
    (label: string): WorkspaceSnapshot => ({
      id: `snap-${Date.now()}`,
      label,
      description: `${state.lenses.length} Lens${state.lenses.length === 1 ? "" : "es"}, ${state.comparisons.length} comparison${state.comparisons.length === 1 ? "" : "s"}. Memory only.`,
      state,
      order: visual.order,
    }),
    [state, visual.order],
  );

  return {
    state,
    visual,
    views,
    comparisons,
    dock,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    announcement,
    act,
    see,
    announce,
    moveItem,
    moveItemTo,
    restore,
    snapshotNow,
  };
}
