/**
 * Atlas cross-section — the FRONTEND VIEW MODEL.
 *
 * The backend's `atlas_questions.v0` JSON ("wire") is the authority for what
 * the server says; this file is what the UI renders. They are deliberately
 * separate: `wireTypes.ts` types the raw envelope, `wireResponse.ts` is the
 * one place that validates it and translates it into the types below, and the
 * fixture adapter emits the same view types without any wire step. The view
 * keeps the wire's honesty where it matters (coverage is never "full", an
 * unavailable entitlement is not a denial, `null` discovery is not "locked",
 * applicability keeps its four states, B.1 results live in their own panel)
 * and nothing else about the wire leaks into components.
 *
 * ATL-CS-UX-001 introduced the shape; ATL-CS-INT-001 aligned it to the
 * implemented backend (draft PR League_Combat_Simulator#93).
 */

export type SubjectKind = "champion" | "item";

export interface SubjectRef {
  kind: SubjectKind;
  /** Canonical champion name ("Ahri") or Riot item id ("3089"). */
  id: string;
}

export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";

export const ABILITY_SLOTS: readonly AbilitySlot[] = ["P", "Q", "W", "E", "R"];

/* ------------------------------------------------------------------------- */
/* Topics                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * A topic is whatever the server certifies. The default catalog mirrors the
 * backend's `GET /api/atlas/questions/coverage` `topics` list (pinned by a
 * contract test against the committed example). It deliberately has no
 * `damage`, `range` or `scaling` entry: no certified backend family supports
 * them yet, and `gold` / `ability_cost` are different topics, not one `cost`.
 * Question screens list the topics a RESPONSE reports (id + label from its
 * facets); this catalog only validates what the encoder may send and labels a
 * topic the response did not.
 */
export type TopicId = string;

export interface TopicInfo {
  id: TopicId;
  label: string;
}

export const DEFAULT_TOPIC_CATALOG: readonly TopicInfo[] = [
  { id: "cooldown", label: "Cooldown" },
  { id: "ability_cost", label: "Ability cost" },
  { id: "mana", label: "Mana" },
  { id: "energy", label: "Energy" },
  { id: "health", label: "Health" },
  { id: "ability_haste", label: "Ability haste" },
  { id: "ability_power", label: "Ability power" },
  { id: "attack_damage", label: "Attack damage" },
  { id: "attack_speed", label: "Attack speed" },
  { id: "critical_strike", label: "Critical strike" },
  { id: "defenses", label: "Armor & magic resist" },
  { id: "movement", label: "Movement" },
  { id: "sustain", label: "Sustain" },
  { id: "lethality_penetration", label: "Lethality & penetration" },
  { id: "stats", label: "Stats" },
  { id: "charges", label: "Charges" },
  { id: "gold", label: "Gold & cost" },
  { id: "build_path", label: "Build path" },
  { id: "item_effects", label: "Item effects" },
  { id: "summoner_spells", label: "Summoner spells" },
  { id: "jungle", label: "Jungle" },
  { id: "objectives", label: "Objectives" },
  { id: "waves", label: "Minion waves" },
  { id: "experience", label: "Experience" },
  { id: "vision", label: "Vision" },
  { id: "map_mechanics", label: "Map mechanics" },
  { id: "fundamentals", label: "Fundamentals" },
];

/** Topic id → label, preferring labels the response itself supplied. */
export function topicLabel(id: TopicId, response?: Pick<CrossSectionResponse, "facets"> | null): string {
  const fromFacet = response?.facets.topics.find((t) => t.id === id)?.label;
  return fromFacet ?? DEFAULT_TOPIC_CATALOG.find((t) => t.id === id)?.label ?? id;
}

/* ------------------------------------------------------------------------- */
/* Collections and query                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Collections the owner wants told apart. `premium_exclusive` is RESERVED:
 * the server answers `not_configured` and nothing is counted or invented.
 */
export type Collection = "catalog" | "discovered" | "premium_review" | "admin_inventory" | "premium_exclusive";

export const COLLECTIONS: readonly Collection[] = ["catalog", "discovered", "premium_review", "admin_inventory", "premium_exclusive"];

export const COLLECTION_LABELS: Record<Collection, string> = {
  catalog: "All relevant",
  discovered: "My unlocked",
  premium_review: "Premium review",
  admin_inventory: "Admin inventory",
  premium_exclusive: "Premium exclusive",
};

export type CenterView = "overview" | "abilities" | "questions" | "compare";

/** The server accepts ranks 1–6 (Jayce/Udyr) or the symbolic `max`. */
export type AbilityRank = number | "max";

export const MAX_ABILITY_RANK = 6;
export const MAX_CHAMPION_LEVEL = 18;

export interface CrossSectionQuery {
  a: SubjectRef | null;
  b: SubjectRef | null;
  /** One item attached to B; valid only while B is a champion. */
  b1ItemId: string | null;
  collection: Collection;
  /** OR within the topic group; AND against the other facet groups. */
  topics: TopicId[];
  abilitySlot: AbilitySlot | null;
  /** 1–18; applies only to level-scoped questions. */
  championLevel: number | null;
  /** 1–6 or `max`; applies only to rank-scoped questions. */
  abilityRank: AbilityRank | null;
  /** The server supports `current` only. */
  patch: "current";
  /** Opaque server cursor (the fixture uses an offset string). */
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
/* Session (who is asking). The server adapter derives identity from the     */
/* transport's own credentials and IGNORES this; only the fixture adapter    */
/* uses the DEMO persona so the owner can preview each state.                */
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

/**
 * `requires_account` is a FRONTEND state derived from HTTP 401 / 403
 * `ACCOUNT_REQUIRED`; the wire reports those as `denied`. `denied`,
 * `unavailable_entitlement` and `not_configured` stay three different things
 * and none of them is ever shown as a count of zero.
 */
export type AccessState = "allowed" | "denied" | "requires_account" | "unavailable_entitlement" | "not_configured";

export type AccessRequirement = "account" | "premium" | "owner" | "premium_exclusive_entitlement";

export interface Access {
  state: AccessState;
  requires: AccessRequirement;
  /** Server reason code (e.g. `premium_required`), kept for diagnostics. */
  reason: string | null;
  /** True when retrying later can change the answer (entitlement outage). */
  retryable: boolean;
  /** Human sentence for the state panel; frontend-owned copy. */
  message: string;
}

/**
 * The server only ever reports `partial` (the index certifies a subset of
 * stored rows) or `unavailable`. There is no "full" and no way to construct
 * one here.
 */
export type CoverageState = "partial" | "unavailable";

export interface Coverage {
  state: CoverageState;
  scope: string | null;
  /** Machine id of the indexed corpus, e.g. `quiz_bank.stored_rows`. */
  corpus: string | null;
  /** The indexed corpus is NOT every Mogzy question; this says what it is. */
  corpus_label: string | null;
  index_revision: string | null;
  indexed_at: string | null;
  rules_version: string | null;
  reason_codes: string[];
  /** Question sources the index does not cover at all. */
  not_indexed_sources: string[];
}

export type CountState = "exact" | "unavailable";

/** Edge roles that may appear on a public result (answer roles never do). */
export type PublicEdgeRole = "premise_subject" | "comparison_operand" | "scenario_context";

/** Applicability keeps the server's four states; nothing is inferred. */
export type ApplicabilityState = "specific" | "interval" | "not_stated" | "not_applicable";

export type LevelApplicability =
  | { state: "specific"; value: number }
  | { state: "not_stated" | "not_applicable"; value: null };

/** `interval` only ever means the symbolic `max` rank; no numeric bound exists. */
export type RankApplicability =
  | { state: "specific"; value: string }
  | { state: "interval"; value: "max" }
  | { state: "not_stated" | "not_applicable"; value: null };

export interface FamilyRef {
  id: string;
  label: string;
}

export interface ResultSubject {
  kind: "champion" | "item" | "ability";
  id: string;
  role: PublicEdgeRole;
}

/**
 * Present only when the collection reports it AND the viewer's own account
 * unlocked the question; `null` means "not reported here", never "locked".
 */
export interface Discovery {
  state: "unlocked";
  times_answered: number;
  times_correct: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

/** Distinct-question aggregation of the viewer's own misses (no answers). */
export interface Review {
  missed_attempts: number;
  last_missed_at: string | null;
}

export type SourceStatus = "current" | "inactive" | "withheld" | "unavailable";

/**
 * Owner inventory facts. The wire also carries the raw `question_key`, which
 * is answer-bearing for some families; the mapper discards it so it can never
 * reach a prop, URL, log or storage. The handle is the only identifier.
 */
export interface AdminFacts {
  index_state: "certified" | "uncategorized" | "excluded";
  catalog_exposure: boolean;
}

export interface QuestionResult {
  /** Opaque, non-answer-derived handle. Never a question_key. */
  handle: string;
  /** Answer-safe prompt only. */
  prompt: string;
  family: FamilyRef;
  topics: TopicId[];
  ability_slot: AbilitySlot | null;
  applicability: { champion_level: LevelApplicability; ability_rank: RankApplicability };
  difficulty: number | null;
  modes: string[];
  subjects: ResultSubject[];
  source_status: SourceStatus;
  patch_context: string | null;
  discovery: Discovery | null;
  /** Only in `premium_review`, only for the viewer's own misses. */
  review: Review | null;
  /** Only in `admin_inventory`. */
  admin: AdminFacts | null;
}

export interface FacetCount<T extends string | number = string> {
  id: T;
  count: number;
  count_state: CountState;
  selected: boolean;
  label?: string;
}

export interface Facets {
  topics: FacetCount<TopicId>[];
  ability_slot: FacetCount<AbilitySlot>[];
  ability_rank: FacetCount<string>[];
  champion_level: FacetCount<number>[];
  family: FacetCount<string>[];
  mode: FacetCount<string>[];
  difficulty: FacetCount<number>[];
}

/** How many matching questions state / do not state their level or rank. */
export interface FacetApplicability {
  ability_rank: Partial<Record<ApplicabilityState, number>>;
  champion_level: Partial<Record<ApplicabilityState, number>>;
}

export interface LabeledSubject {
  kind: SubjectKind;
  id: string;
  label: string;
}

export interface BModifierEcho extends LabeledSubject {
  kind: "item";
  attached_to: "b";
  intent: "equipped_for_research";
}

export interface QueryEcho {
  a: LabeledSubject | null;
  b: LabeledSubject | null;
  b_modifier: BModifierEcho | null;
  filters: {
    topic: TopicId[];
    ability_slot: AbilitySlot[];
    ability_rank: string[];
    champion_level: number[];
    family: string[];
    mode: string[];
    difficulty: number[];
    patch: "current" | null;
  };
}

/**
 * Whether a certified question family relates the requested subjects.
 * `null` on the response means only one axis (nothing is being related).
 * Two subjects alone are NOT evidence of a relation: `supported` lists the
 * families that can certify one, `unsupported` carries the reason.
 */
export interface RelationEvidence {
  state: "supported" | "unsupported";
  supporting_families: string[];
  reason: string | null;
  /** Present when a B.1 item was requested. */
  b_modifier: { state: "supported" | "unsupported"; supporting_families: string[] } | null;
}

/** Questions about the B.1 item itself. Never part of the A × B intersection. */
export interface RelatedPanel {
  kind: "b_modifier";
  subject: LabeledSubject;
  relationship: "item_is_premise_subject";
  label: string;
  results: QuestionResult[];
  count: number;
  count_state: CountState;
  has_more: boolean;
}

export interface ResponseError {
  code: string;
  message: string;
  field: string | null;
  /** HTTP status the envelope arrived with (fixture: 200 never has an error). */
  http_status: number;
}

export type CountUnit = "question" | "prompt_stem";

export interface Counts {
  /** `null` when the server reports the count unavailable — never 0. */
  visible_matching: number | null;
  count_state: CountState;
  /** `prompt_stem` in the catalog: one unit per distinct prompt, not per row. */
  unit: CountUnit | null;
  /** My unlocked: discoveries the index cannot resolve, by reason. */
  discoveries_total?: number;
  discoveries_outside_index?: Record<string, number>;
  /** Premium review: missed attempts by whether the index covers them. */
  missed_attempts_indexed?: number;
  missed_attempts_outside_index?: Record<string, number>;
}

export interface PageInfo {
  limit: number | null;
  offset: number | null;
  next_cursor: string | null;
  has_more: boolean;
}

export interface CrossSectionResponse {
  contract_version: "atlas_questions.v0";
  /** `null` when the request never reached the index (access, outage). */
  query: QueryEcho | null;
  collection: Collection;
  access: Access;
  /** `null` unless access was allowed and the index answered. */
  coverage: Coverage | null;
  /** `null` for one axis; see {@link RelationEvidence}. */
  relationship: RelationEvidence | null;
  /** True matches: every requested axis satisfied by a certified edge. */
  results: QuestionResult[];
  facets: Facets;
  facet_applicability: FacetApplicability;
  /** Distinct B.1 panel; `null` unless a B.1 item was requested. */
  related: RelatedPanel | null;
  page: PageInfo;
  counts: Counts;
  /** A request-level failure (400 / 503 source outage). Not an empty result. */
  error: ResponseError | null;
  /** True only for the in-memory fixture adapter. */
  demo: boolean;
}

export const EMPTY_FACETS: Facets = {
  topics: [],
  ability_slot: [],
  ability_rank: [],
  champion_level: [],
  family: [],
  mode: [],
  difficulty: [],
};

/** True when the server (or fixture) says no certified family relates the subjects. */
export function relationUnsupported(response: Pick<CrossSectionResponse, "relationship"> | null): boolean {
  return response?.relationship?.state === "unsupported";
}

/**
 * Adapter boundary. The UI only ever sees this. The fixture adapter answers
 * from memory; the server wire adapter (never constructed by the page today)
 * encodes the query, calls an injected transport and validates the reply.
 * `search` may reject with an `AtlasWireError`; the page treats a rejection as
 * "unavailable", never as zero results.
 */
export interface CrossSectionAdapter {
  readonly label: string;
  search(query: CrossSectionQuery, session: SessionContext): Promise<CrossSectionResponse>;
}
