/**
 * ATL-P1-C — visual workspace state.
 *
 * Focus, dock order, collapse, expand and lift. This reducer takes NO
 * semantic input and returns NO semantic output: by construction a visual
 * action cannot change a subject, a context or a query key. `syncLenses` is
 * the only bridge, and it only learns which ids exist.
 */

export interface VisualState {
  /** Dock order of lens ids. Semantic creation order is not layout order. */
  order: string[];
  focusId: string | null;
  collapsed: Record<string, true>;
  expanded: Record<string, true>;
  /** Lens being dragged, if any. */
  lifted: string | null;
  /** Lens ids chosen for the next comparison (max two). */
  compareTray: string[];
}

export type VisualAction =
  | { type: "syncLenses"; ids: string[] }
  | { type: "focus"; id: string | null }
  | { type: "toggleCollapse"; id: string }
  | { type: "toggleExpand"; id: string }
  | { type: "move"; id: string; to: number }
  | { type: "moveBy"; id: string; delta: number }
  | { type: "lift"; id: string | null }
  | { type: "trayToggle"; id: string }
  | { type: "trayClear" }
  | { type: "setOrder"; order: string[] };

export const EMPTY_VISUAL: VisualState = { order: [], focusId: null, collapsed: {}, expanded: {}, lifted: null, compareTray: [] };

function without<T extends Record<string, true>>(map: T, ids: Set<string>): T {
  const next: Record<string, true> = {};
  for (const key of Object.keys(map)) if (ids.has(key)) next[key] = true;
  return next as T;
}

export function reduceVisual(state: VisualState, action: VisualAction): VisualState {
  switch (action.type) {
    case "syncLenses": {
      const live = new Set(action.ids);
      const kept = state.order.filter((id) => live.has(id));
      const added = action.ids.filter((id) => !kept.includes(id));
      const order = [...kept, ...added];
      const focusId = state.focusId && live.has(state.focusId) ? state.focusId : (added[added.length - 1] ?? order[order.length - 1] ?? null);
      return {
        ...state,
        order,
        focusId,
        collapsed: without(state.collapsed, live),
        expanded: without(state.expanded, live),
        lifted: state.lifted && live.has(state.lifted) ? state.lifted : null,
        compareTray: state.compareTray.filter((id) => live.has(id)),
      };
    }
    case "focus":
      return state.focusId === action.id ? state : { ...state, focusId: action.id };
    case "toggleCollapse": {
      const collapsed = { ...state.collapsed };
      if (collapsed[action.id]) delete collapsed[action.id];
      else collapsed[action.id] = true;
      const expanded = { ...state.expanded };
      if (collapsed[action.id]) delete expanded[action.id];
      return { ...state, collapsed, expanded };
    }
    case "toggleExpand": {
      const expanded = { ...state.expanded };
      if (expanded[action.id]) delete expanded[action.id];
      else expanded[action.id] = true;
      const collapsed = { ...state.collapsed };
      if (expanded[action.id]) delete collapsed[action.id];
      return { ...state, expanded, collapsed };
    }
    case "move": {
      const from = state.order.indexOf(action.id);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(state.order.length - 1, action.to));
      if (from === to) return state;
      const order = [...state.order];
      order.splice(from, 1);
      order.splice(to, 0, action.id);
      return { ...state, order };
    }
    case "moveBy": {
      const from = state.order.indexOf(action.id);
      if (from < 0) return state;
      return reduceVisual(state, { type: "move", id: action.id, to: from + action.delta });
    }
    case "lift":
      return state.lifted === action.id ? state : { ...state, lifted: action.id };
    case "trayToggle": {
      if (state.compareTray.includes(action.id)) {
        return { ...state, compareTray: state.compareTray.filter((id) => id !== action.id) };
      }
      const compareTray = [...state.compareTray, action.id].slice(-2);
      return { ...state, compareTray };
    }
    case "trayClear":
      return state.compareTray.length ? { ...state, compareTray: [] } : state;
    case "setOrder":
      return { ...state, order: action.order.filter((id, i, arr) => arr.indexOf(id) === i) };
  }
}
