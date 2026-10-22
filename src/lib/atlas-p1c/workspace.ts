/**
 * ATL-P1-C — semantic workspace reducer with undo/redo.
 *
 * Every action here changes MEANING (what is being looked at, under which
 * context, in which relation). None of them knows about pixels, focus or
 * dock order; that is `visual.ts`. Because meaning is what a player can get
 * wrong, every semantic action is undoable.
 */
import { contextValidFor, resolveEffectiveContext, sameContext } from "./context";
import { CHAMPIONS, EMPTY_WORKSPACE, PLAYERS } from "./fixtures";
import type {
  AbilitySlot,
  ChampionId,
  Comparison,
  GlobalContext,
  GlobalSlot,
  Lens,
  LensGroup,
  PlayerId,
  SubjectRef,
  TemporalContext,
  TransformRecord,
  WorkspaceState,
} from "./types";

export type WorkspaceAction =
  | { type: "addLens"; subject: SubjectRef; pinned?: boolean }
  | { type: "removeLens"; id: string }
  | { type: "cloneLens"; id: string }
  | { type: "pinLens"; id: string; pinned: boolean }
  | { type: "holdLens"; id: string; held: boolean }
  | { type: "setOverride"; id: string; context: TemporalContext | null }
  | { type: "setGlobal"; slot: GlobalSlot; context: TemporalContext }
  | { type: "transformToProChampion"; id: string }
  | { type: "revertTransform"; id: string }
  | { type: "addMatrix"; players: PlayerId[]; champions: ChampionId[] }
  | { type: "compare"; a: string; b: string }
  | { type: "uncompare"; id: string }
  | { type: "clearUnpinned" }
  | { type: "restore"; state: WorkspaceState };

export interface History<S> {
  past: S[];
  present: S;
  future: S[];
}

export type HistoryAction = WorkspaceAction | { type: "undo" } | { type: "redo" };

const MAX_HISTORY = 50;

export function createHistory(initial: WorkspaceState = EMPTY_WORKSPACE): History<WorkspaceState> {
  return { past: [], present: initial, future: [] };
}

function nextId(state: WorkspaceState, prefix: string): [string, WorkspaceState] {
  const seq = state.seq + 1;
  return [`${prefix}-${seq}`, { ...state, seq }];
}

function makeLens(id: string, subject: SubjectRef, pinned = false): Lens {
  return { id, subject, override: null, held: null, pinned, groupId: null, clonedFrom: null, provenance: [] };
}

function updateLens(state: WorkspaceState, id: string, fn: (lens: Lens) => Lens): WorkspaceState {
  let changed = false;
  const lenses = state.lenses.map((l) => {
    if (l.id !== id) return l;
    const next = fn(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { ...state, lenses } : state;
}

export function subjectKey(subject: SubjectRef): string {
  switch (subject.kind) {
    case "ability":
      return `ability:${subject.champion}:${subject.slot}`;
    case "champion":
      return `champion:${subject.champion}`;
    case "player-champion":
      return `player-champion:${subject.player}:${subject.champion}`;
    case "exact-matchup":
      return `exact:${subject.a.player}:${subject.a.champion}:${subject.b.player}:${subject.b.champion}`;
  }
}

export function abilitySubject(champion: ChampionId, slot: AbilitySlot): SubjectRef {
  return { kind: "ability", universe: "leaguecraft", champion, slot };
}

export function proChampionSubject(champion: ChampionId): SubjectRef {
  return { kind: "champion", universe: "pro-play", champion };
}

export function playerChampionSubject(player: PlayerId, champion: ChampionId): SubjectRef {
  return { kind: "player-champion", universe: "pro-play", player, champion };
}

export function exactMatchupSubject(a: { player: PlayerId; champion: ChampionId }, b: { player: PlayerId; champion: ChampionId }): SubjectRef {
  return { kind: "exact-matchup", universe: "pro-play", a, b };
}

/** What a transform to Pro Play would drop, before it happens. */
export function describeProTransform(lens: Lens): { droppedFacets: string[]; note: string } | null {
  const s = lens.subject;
  if (s.kind !== "ability") return null;
  return {
    droppedFacets: [`ability ${s.slot} (per-rank values, cooldown, cost)`],
    note: `Pro Play records ${CHAMPIONS[s.champion].name} at champion level only. No Pro ability-usage numbers exist, so the ${s.slot} facet is dropped, not approximated.`,
  };
}

export function reduceWorkspace(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "addLens": {
      const [id, next] = nextId(state, "lens");
      return { ...next, lenses: [...next.lenses, makeLens(id, action.subject, action.pinned ?? false)] };
    }
    case "removeLens": {
      if (!state.lenses.some((l) => l.id === action.id)) return state;
      return {
        ...state,
        lenses: state.lenses.filter((l) => l.id !== action.id),
        comparisons: state.comparisons.filter((c) => !c.lensIds.includes(action.id)),
      };
    }
    case "cloneLens": {
      const source = state.lenses.find((l) => l.id === action.id);
      if (!source) return state;
      const [id, next] = nextId(state, "lens");
      const clone: Lens = { ...source, id, pinned: false, clonedFrom: source.id, groupId: null, provenance: [...source.provenance] };
      const index = next.lenses.findIndex((l) => l.id === source.id);
      const lenses = [...next.lenses];
      lenses.splice(index + 1, 0, clone);
      return { ...next, lenses };
    }
    case "pinLens":
      return updateLens(state, action.id, (l) => (l.pinned === action.pinned ? l : { ...l, pinned: action.pinned }));
    case "holdLens":
      return updateLens(state, action.id, (l) => {
        if (!action.held) return l.held ? { ...l, held: null } : l;
        if (l.held) return l;
        const effective = resolveEffectiveContext(l, state.global);
        return { ...l, held: effective.context };
      });
    case "setOverride":
      return updateLens(state, action.id, (l) => {
        if (action.context && !contextValidFor(l.subject.universe, action.context)) return l;
        if (action.context === null && l.override === null) return l;
        if (action.context && l.override && sameContext(action.context, l.override)) return l;
        return { ...l, override: action.context };
      });
    case "setGlobal": {
      const universe = action.slot === "leaguecraft" ? "leaguecraft" : "pro-play";
      if (!contextValidFor(universe, action.context)) return state;
      if (sameContext(state.global[action.slot], action.context)) return state;
      const global: GlobalContext = { ...state.global, [action.slot]: action.context };
      return { ...state, global };
    }
    case "transformToProChampion": {
      const lens = state.lenses.find((l) => l.id === action.id);
      if (!lens || lens.subject.kind !== "ability") return state;
      const target = CHAMPIONS[lens.subject.champion];
      const to = proChampionSubject(lens.subject.champion);
      const crosswalk: TransformRecord["crosswalk"] = target.proPlayKey
        ? { from: "lc.ability_catalog", to: "pro.champion_records", status: "exact", note: `${target.leaguecraftKey} → ${target.proPlayKey}` }
        : { from: "lc.ability_catalog", to: "pro.champion_records", status: "failed", note: `${target.leaguecraftKey} has no Pro Play registry key` };
      if (crosswalk.status === "failed") return state;
      const described = describeProTransform(lens);
      // No override or hold crosses a universe boundary: a Leaguecraft
      // "current patch" is not a Pro "current season", so it is cleared and
      // the ribbon says so rather than letting the meaning drift.
      const record: TransformRecord = {
        seq: state.seq + 1,
        from: lens.subject,
        to,
        droppedFacets: described?.droppedFacets ?? [],
        clearedContext: Boolean(lens.override || lens.held),
        crosswalk,
      };
      const next = { ...state, seq: state.seq + 1 };
      return updateLens(next, action.id, (l) => ({
        ...l,
        subject: to,
        override: null,
        held: null,
        provenance: [...l.provenance, record],
      }));
    }
    case "revertTransform": {
      const lens = state.lenses.find((l) => l.id === action.id);
      if (!lens || lens.provenance.length === 0) return state;
      const last = lens.provenance[lens.provenance.length - 1];
      return updateLens(state, action.id, (l) => ({
        ...l,
        subject: last.from,
        override: null,
        held: null,
        provenance: l.provenance.slice(0, -1),
      }));
    }
    case "addMatrix": {
      let next = state;
      const [groupId, afterGroup] = nextId(next, "grp");
      next = afterGroup;
      const group: LensGroup = {
        id: groupId,
        kind: "matrix",
        label: `${action.players.map((p) => PLAYERS[p].name).join(" · ")} × ${action.champions.map((c) => CHAMPIONS[c].name).join(" · ")}`,
        players: action.players,
        champions: action.champions,
      };
      const lenses: Lens[] = [];
      for (const player of action.players) {
        for (const champion of action.champions) {
          const [id, after] = nextId(next, "lens");
          next = after;
          lenses.push({ ...makeLens(id, playerChampionSubject(player, champion)), groupId });
        }
      }
      return { ...next, groups: [...next.groups, group], lenses: [...next.lenses, ...lenses] };
    }
    case "compare": {
      if (action.a === action.b) return state;
      const has = (id: string) => state.lenses.some((l) => l.id === id);
      if (!has(action.a) || !has(action.b)) return state;
      const exists = state.comparisons.some((c) => (c.lensIds[0] === action.a && c.lensIds[1] === action.b) || (c.lensIds[0] === action.b && c.lensIds[1] === action.a));
      if (exists) return state;
      const [id, next] = nextId(state, "cmp");
      const comparison: Comparison = { id, lensIds: [action.a, action.b] };
      return { ...next, comparisons: [...next.comparisons, comparison] };
    }
    case "uncompare":
      return { ...state, comparisons: state.comparisons.filter((c) => c.id !== action.id) };
    case "clearUnpinned": {
      const keep = new Set(state.lenses.filter((l) => l.pinned).map((l) => l.id));
      return {
        ...state,
        lenses: state.lenses.filter((l) => keep.has(l.id)),
        comparisons: state.comparisons.filter((c) => keep.has(c.lensIds[0]) && keep.has(c.lensIds[1])),
        groups: state.groups.filter((g) => state.lenses.some((l) => l.groupId === g.id && keep.has(l.id))),
      };
    }
    case "restore":
      return action.state;
  }
}

export function reduceHistory(history: History<WorkspaceState>, action: HistoryAction): History<WorkspaceState> {
  if (action.type === "undo") {
    if (history.past.length === 0) return history;
    const previous = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
  }
  if (action.type === "redo") {
    if (history.future.length === 0) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
  }
  const next = reduceWorkspace(history.present, action);
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, present: next, future: [] };
}

/** One-line description of a semantic action, for the live region. */
export function describeAction(action: HistoryAction): string {
  switch (action.type) {
    case "undo":
      return "Undid the last change.";
    case "redo":
      return "Redid the change.";
    case "addLens":
      return "Lens added.";
    case "removeLens":
      return "Lens closed. Undo restores it.";
    case "cloneLens":
      return "Lens cloned beside the original.";
    case "pinLens":
      return action.pinned ? "Lens pinned. It survives Clear and restores." : "Lens unpinned.";
    case "holdLens":
      return action.held ? "Lens held. It ignores global context changes until released." : "Lens released. It follows the global context again.";
    case "setOverride":
      return action.context ? "Override set on this Lens only." : "Override cleared. Lens inherits the global context.";
    case "setGlobal":
      return action.slot === "leaguecraft" ? "Global Leaguecraft context changed." : "Global Pro Play context changed.";
    case "transformToProChampion":
      return "Transformed to Pro Play at champion level. The ability facet was dropped; revert restores it.";
    case "revertTransform":
      return "Transform reverted. The ability Lens is back.";
    case "addMatrix":
      return "Player-by-champion matrix added as independent Lenses.";
    case "compare":
      return "Comparison composed.";
    case "uncompare":
      return "Comparison removed.";
    case "clearUnpinned":
      return "Unpinned Lenses cleared.";
    case "restore":
      return "Workspace restored from a memory-only sample.";
  }
}
