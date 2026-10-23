/**
 * ATL-CS-UX-001 — Atlas cross-section: typed semantic query and the adapter
 * response shape, written against "Mogzy Atlas — Cross-Section Question Data
 * Contract V0" (2026-10-22). The names here mirror the proposed handshake so
 * a later server adapter can replace the fixture adapter without touching the
 * UI. Nothing in this file is a backend contract; it is the frontend's typed
 * reading of the proposal.
 */

export type SubjectKind = "champion" | "item";

export interface SubjectRef {
  kind: SubjectKind;
  /** Canonical champion name ("Ahri") or Riot item id ("3089"). */
  id: string;
}

export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";

export const ABILITY_SLOTS: readonly AbilitySlot[] = ["P", "Q", "W", "E", "R"];

export type Topic = "mana" | "cooldown" | "damage" | "movement" | "defenses" | "cost" | "vision" | "range" | "scaling";

export const TOPICS: readonly { id: Topic; label: string }[] = [
  { id: "mana", label: "Mana" },
  { id: "cooldown", label: "Cooldown" },
  { id: "damage", label: "Damage" },
  { id: "range", label: "Range" },
  { id: "scaling", label: "Scaling" },
  { id: "movement", label: "Movement" },
  { id: "defenses", label: "Defenses" },
  { id: "cost", label: "Cost" },
  { id: "vision", label: "Vision" },
];

/**
 * Collections the owner wants told apart. `premium_exclusive` is RESERVED by
 * the contract: it exists in the enum so the UI leaves room for it, and the
 * adapter answers `not_configured`, never a fabricated set.
 */
export type Collection = "catalog" | "discovered" | "premium_review" | "admin_inventory" | "premium_exclusive";

export const COLLECTION_LABELS: Record<Collection, string> = {
  catalog: "All relevant",
  discovered: "My unlocked",
  premium_review: "Premium review",
  admin_inventory: "Admin inventory",
  premium_exclusive: "Premium exclusive",
};

export type CenterView = "overview" | "abilities" | "questions" | "compare";

export interface CrossSectionQuery {
  a: SubjectRef | null;
  b: SubjectRef | null;
  /** One item attached to B; valid only while B is a champion. */
  b1ItemId: string | null;
  collection: Collection;
  /** OR within the topic group; AND against the other facet groups. */
  topics: Topic[];
  abilitySlot: AbilitySlot | null;
  /** 1–18; applies only to level-scoped questions. */
  championLevel: number | null;
  /** 1–5 (typically); applies only to rank-scoped questions. */
  abilityRank: number | null;
  patch: "current";
  cursor: string | null;
  limit: number;
}

/** What the two axes form. Derived, never stored. */
export type Relationship =
  | { kind: "none" }
  | { kind: "a_only"; a: SubjectRef }
  | { kind: "b_only"; b: SubjectRef; b1ItemId: string | null }
  | { kind: "pair"; a: SubjectRef; b: SubjectRef; b1ItemId: string | null; shape: PairShape };

export type PairShape = "champion_x_champion" | "item_x_item" | "champion_x_item" | "item_x_champion";

/* ------------------------------------------------------------------------- */
/* Session (who is asking). The real adapter derives this from the JWT; the  */
/* fixture adapter takes a DEMO persona so the owner can preview each state. */
/* ------------------------------------------------------------------------- */

export type Persona = "anonymous" | "account" | "premium" | "owner";

export interface SessionContext {
  persona: Persona;
  /** Demo-only: whether the Premium entitlement lookup is reachable. */
  premiumLookup: "ok" | "unavailable";
}

/* ------------------------------------------------------------------------- */
/* Response                                                                  */
/* ------------------------------------------------------------------------- */

export type AccessState = "allowed" | "denied" | "requires_account" | "unavailable_entitlement" | "not_configured";

export interface Access {
  state: AccessState;
  requires: "none" | "account" | "premium" | "owner";
  /** Human sentence for the state panel. */
  message: string;
}

export type CoverageState = "full" | "partial" | "none" | "unavailable";

export interface Coverage {
  state: CoverageState;
  scope: string;
  reason_codes: string[];
  /** Families the index certifies out of the families seen for the subject(s). */
  families_certified: number;
  families_total: number;
}

export type CountState = "exact" | "approximate" | "unavailable";

export type EdgeRole = "premise_subject" | "comparison_operand" | "scenario_context" | "answer_subject" | "unverified";

export type Applicability =
  | { kind: "agnostic" }
  | { kind: "specific"; value: number }
  | { kind: "interval"; min: number; max: number };

export type DiscoveryState = "unlocked" | "locked" | "not_applicable";

export interface QuestionResult {
  /** Opaque, non-answer-derived handle. Never a question_key. */
  handle: string;
  /** Answer-safe prompt only. */
  prompt: string;
  family_label: string;
  topics: Topic[];
  ability_slot: AbilitySlot | null;
  applicability: { champion_level: Applicability; ability_rank: Applicability };
  discovery: { state: DiscoveryState };
  source_status: "current" | "frozen" | "unavailable";
  /** Only present in `premium_review`, only for the viewer's own attempts. */
  review?: { attempted_at: string; outcome: "missed" | "correct" };
  /** Only present in `admin_inventory`. */
  inventory?: { serve_state: "serveable" | "hold" | "retired"; answer_role_edges: number };
}

export interface FacetCount<T extends string> {
  id: T;
  count: number;
  count_state: CountState;
}

export interface CrossSectionResponse {
  contract_version: "atlas_questions.v0";
  query: { a: SubjectRef | null; b: SubjectRef | null; b_modifier: { item_id: string; intent: "equipped_for_research" } | null };
  collection: Collection;
  access: Access;
  coverage: Coverage;
  /** True matches: every requested axis is satisfied by a certified premise-safe edge. */
  results: QuestionResult[];
  /** Questions about the B.1 modifier item, never mixed into `results`. */
  related_results: QuestionResult[];
  /** `unsupported` when a pair has no certified relation at all. */
  relation: "single" | "pair" | "unsupported";
  facets: { topics: FacetCount<Topic>[]; ability_slots: FacetCount<AbilitySlot>[] };
  page: { next_cursor: string | null; has_more: boolean };
  counts: { visible_matching: number; count_state: CountState };
  demo: true;
}

/**
 * Adapter boundary. The UI only ever sees this. The fixture adapter answers
 * from memory; a later server adapter would call the proposed route and map
 * its JSON onto `CrossSectionResponse`.
 */
export interface CrossSectionAdapter {
  readonly label: string;
  search(query: CrossSectionQuery, session: SessionContext): Promise<CrossSectionResponse>;
}
