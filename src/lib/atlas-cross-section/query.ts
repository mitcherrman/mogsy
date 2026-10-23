/**
 * ATL-CS-UX-001 — semantic query state.
 *
 * One reducer owns A, B, B.1, the collection, the facets and the center
 * view. The rules the owner fixed live here and nowhere else:
 *
 *   * A and B are independent; either may stand alone.
 *   * B.1 is an item attached to B. It is valid only while B is a champion.
 *     Changing or clearing B, or making B an item, clears B.1 explicitly
 *     (`lastInvalidation` says why, so the UI can announce it).
 *   * Champion level (1–18) and ability rank (1–6 or `max`) are separate facets.
 *   * Topics OR together; every other facet ANDs.
 */
import { MAX_ABILITY_RANK, topicLabel, MAX_CHAMPION_LEVEL, type AbilityRank, type AbilitySlot, type CenterView, type Collection, type CrossSectionQuery, type PairShape, type Relationship, type SubjectRef, type TopicId } from "./types";

export interface CrossSectionState {
  query: CrossSectionQuery;
  view: CenterView;
  /** Why B.1 was last cleared, for the live region. Cleared on the next action. */
  lastInvalidation: string | null;
}

export type CrossSectionAction =
  | { type: "setA"; subject: SubjectRef | null }
  | { type: "setB"; subject: SubjectRef | null }
  | { type: "setB1"; itemId: string | null }
  | { type: "swap" }
  | { type: "setCollection"; collection: Collection }
  | { type: "toggleTopic"; topic: TopicId }
  | { type: "clearTopics" }
  | { type: "setSlot"; slot: AbilitySlot | null }
  | { type: "setLevel"; level: number | null }
  | { type: "setRank"; rank: AbilityRank | null }
  | { type: "setView"; view: CenterView }
  | { type: "reset" }
  | { type: "load"; state: Partial<CrossSectionQuery> & { view?: CenterView } };

export const DEFAULT_QUERY: CrossSectionQuery = {
  a: null,
  b: null,
  b1ItemId: null,
  collection: "catalog",
  topics: [],
  abilitySlot: null,
  championLevel: null,
  abilityRank: null,
  patch: "current",
  cursor: null,
  limit: 20,
};

export const INITIAL_STATE: CrossSectionState = { query: DEFAULT_QUERY, view: "overview", lastInvalidation: null };

export function sameSubject(a: SubjectRef | null, b: SubjectRef | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_CHAMPION_LEVEL, Math.round(level)));
}

/**
 * The server accepts ranks 1–6 or `max`. It cannot say which ability has how
 * many ranks, so the slot no longer narrows the bound and a numeric bound is
 * never invented for `max`.
 */
export function clampRank(rank: AbilityRank, _slot?: AbilitySlot | null): AbilityRank {
  if (rank === "max") return "max";
  return Math.max(1, Math.min(MAX_ABILITY_RANK, Math.round(rank)));
}

export function relationshipOf(query: CrossSectionQuery): Relationship {
  const { a, b, b1ItemId } = query;
  if (!a && !b) return { kind: "none" };
  if (a && !b) return { kind: "a_only", a };
  if (!a && b) return { kind: "b_only", b, b1ItemId: b.kind === "champion" ? b1ItemId : null };
  const shape: PairShape = a!.kind === "champion" ? (b!.kind === "champion" ? "champion_x_champion" : "champion_x_item") : b!.kind === "item" ? "item_x_item" : "item_x_champion";
  return { kind: "pair", a: a!, b: b!, b1ItemId: b!.kind === "champion" ? b1ItemId : null, shape };
}

export function relationshipLabel(rel: Relationship): string {
  switch (rel.kind) {
    case "none":
      return "No subject";
    case "a_only":
      return "A only";
    case "b_only":
      return rel.b1ItemId ? "B + B.1 only" : "B only";
    case "pair":
      return rel.b1ItemId ? "A × (B + B.1)" : "A × B";
  }
}

/** Which center views make sense for the current relationship. */
export function availableViews(query: CrossSectionQuery): CenterView[] {
  const rel = relationshipOf(query);
  if (rel.kind === "none") return ["overview"];
  if (rel.kind === "pair") return ["overview", "abilities", "questions", "compare"];
  return ["overview", "abilities", "questions"];
}

function withQuery(state: CrossSectionState, query: CrossSectionQuery, invalidation: string | null = null): CrossSectionState {
  const views = availableViews(query);
  const view = views.includes(state.view) ? state.view : "overview";
  // Cursor never survives a semantic change.
  return { query: { ...query, cursor: null }, view, lastInvalidation: invalidation };
}

export function reduceCrossSection(state: CrossSectionState, action: CrossSectionAction): CrossSectionState {
  const q = state.query;
  switch (action.type) {
    case "setA": {
      if (sameSubject(q.a, action.subject)) return { ...state, lastInvalidation: null };
      return withQuery(state, { ...q, a: action.subject });
    }
    case "setB": {
      if (sameSubject(q.b, action.subject)) return { ...state, lastInvalidation: null };
      const keepB1 = action.subject?.kind === "champion" && q.b1ItemId && sameSubject(q.b, action.subject);
      let invalidation: string | null = null;
      if (q.b1ItemId && !keepB1) {
        invalidation = action.subject
          ? action.subject.kind === "champion"
            ? `B changed to ${action.subject.id}; the attached item was cleared.`
            : "B is now an item; an item cannot equip an item, so B.1 was cleared."
          : "B cleared; its attached item was cleared with it.";
      }
      return withQuery(state, { ...q, b: action.subject, b1ItemId: keepB1 ? q.b1ItemId : null }, invalidation);
    }
    case "setB1": {
      if (action.itemId && q.b?.kind !== "champion") {
        return { ...state, lastInvalidation: "B.1 needs a champion in B to equip." };
      }
      if (q.b1ItemId === action.itemId) return { ...state, lastInvalidation: null };
      return withQuery(state, { ...q, b1ItemId: action.itemId });
    }
    case "swap": {
      if (!q.a && !q.b) return state;
      const b1 = q.a?.kind === "champion" ? q.b1ItemId : null;
      const invalidation = q.b1ItemId && !b1 ? "Axes swapped; B.1 cannot attach to an item, so it was cleared." : null;
      return withQuery(state, { ...q, a: q.b, b: q.a, b1ItemId: b1 }, invalidation);
    }
    case "setCollection":
      return q.collection === action.collection ? { ...state, lastInvalidation: null } : withQuery(state, { ...q, collection: action.collection });
    case "toggleTopic": {
      const topics = q.topics.includes(action.topic) ? q.topics.filter((t) => t !== action.topic) : [...q.topics, action.topic];
      return withQuery(state, { ...q, topics });
    }
    case "clearTopics":
      return q.topics.length ? withQuery(state, { ...q, topics: [] }) : { ...state, lastInvalidation: null };
    case "setSlot": {
      return withQuery(state, { ...q, abilitySlot: action.slot });
    }
    case "setLevel":
      return withQuery(state, { ...q, championLevel: action.level === null ? null : clampLevel(action.level) });
    case "setRank":
      return withQuery(state, { ...q, abilityRank: action.rank === null ? null : clampRank(action.rank, q.abilitySlot) });
    case "setView": {
      if (!availableViews(q).includes(action.view)) return state;
      return { ...state, view: action.view, lastInvalidation: null };
    }
    case "reset":
      return INITIAL_STATE;
    case "load": {
      const { view, ...partial } = action.state;
      const next: CrossSectionQuery = { ...DEFAULT_QUERY, ...partial };
      if (next.b?.kind !== "champion") next.b1ItemId = null;
      const views = availableViews(next);
      return { query: next, view: view && views.includes(view) ? view : views[views.length - 1], lastInvalidation: null };
    }
  }
}

/** Human list of applied filters, always shown so nothing filters silently. */
export function appliedFilters(query: CrossSectionQuery): string[] {
  const out: string[] = [];
  if (query.topics.length) out.push(`Topic: ${query.topics.map((t) => topicLabel(t)).join(" or ")}`);
  if (query.abilitySlot) out.push(`Slot: ${query.abilitySlot}`);
  if (query.championLevel !== null) out.push(`Level ${query.championLevel}`);
  if (query.abilityRank !== null) out.push(`Rank ${query.abilityRank}`);
  out.push(`Patch: ${query.patch}`);
  return out;
}
