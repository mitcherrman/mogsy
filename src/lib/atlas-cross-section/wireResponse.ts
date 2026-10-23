/**
 * Atlas cross-section — response mapper (backend wire → frontend view).
 *
 * This is the ONE place the `atlas_questions.v0` envelope is read. The body
 * is treated as hostile: it is validated against an explicit allow-list
 * (unknown keys are rejected, not ignored), every enum is closed, HTTP status,
 * access state and payload must agree, and anything that does not fit throws
 * `AtlasWireError`. A thrown error is never rendered as "zero results".
 *
 * What is translated, and what is refused:
 *
 *   access      `allowed|denied|unavailable_entitlement|not_configured`; an
 *               unknown value fails closed. HTTP 401 and 403 `ACCOUNT_REQUIRED`
 *               become the frontend `requires_account`; `unavailable` is never
 *               folded into `denied`, and neither is ever a count of zero.
 *   coverage    `partial|unavailable` only. A claim of "full" (or anything
 *               else) is a contract violation, not a mapping.
 *   relationship `null` = one axis. Two subjects alone are never evidence of
 *               a relation; `supported` names families, `unsupported` a reason.
 *   related     the B.1 panel, kept apart from `results`.
 *   discovery   `null` stays `null` ("not reported"), never "locked".
 *   review      `{missed_attempts,last_missed_at}` (a distinct question).
 *   admin       accepted only in `admin_inventory`; the raw `question_key` is
 *               discarded so it cannot reach a prop, URL, log or storage.
 *   answers     any answer-bearing key anywhere in the body (or a
 *               `question_key` outside `admin`) rejects the whole response.
 */
import {
  EMPTY_FACETS,
  type Access,
  type AccessRequirement,
  type AbilitySlot,
  type AccessState,
  type AdminFacts,
  type ApplicabilityState,
  type BModifierEcho,
  type Collection,
  type Counts,
  type Coverage,
  type CrossSectionQuery,
  type CrossSectionResponse,
  type Discovery,
  type FacetApplicability,
  type FacetCount,
  type Facets,
  type FamilyRef,
  type LabeledSubject,
  type LevelApplicability,
  type PageInfo,
  type QueryEcho,
  type QuestionResult,
  type RankApplicability,
  type RelatedPanel,
  type RelationEvidence,
  type ResponseError,
  type Review,
  type ResultSubject,
  type SourceStatus,
  COLLECTIONS,
} from "./types";
import { AtlasWireError, WIRE_CONTRACT_VERSION, WIRE_LIMITS, CURSOR_PATTERN, fail, type WireHttpResponse } from "./wire";

type Obj = Record<string, unknown>;

/* ------------------------------------------------------------------------- */
/* Primitives                                                                */
/* ------------------------------------------------------------------------- */

const MAX_DEPTH = 12;
const MAX_RESULTS = WIRE_LIMITS.limitMax;
const MAX_FACET_ENTRIES = 500;

/**
 * Keys that mean "an answer or a raw source identifier". `times_correct` and
 * `source_status` are fine: the patterns are anchored to the whole name.
 */
const FORBIDDEN_KEY = /^(answers?|correct(_?(answers?|option|choice|index|value))?(_json)?|choices?(_json)?|options?(_json)?|explanations?|solutions?|rationale|distractors?|metadata(_json)?|question_(text|id)|source_row_id|stem_key|question_key)$/i;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function scanForbidden(v: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) fail("malformed", path, "nesting is too deep");
  if (Array.isArray(v)) {
    v.forEach((item, i) => scanForbidden(item, `${path}[${i}]`, depth + 1));
    return;
  }
  if (!isObj(v)) return;
  for (const key of Object.keys(v)) {
    const here = path ? `${path}.${key}` : key;
    // The raw key is allowed to EXIST only inside an `admin` block; the object
    // mapper then refuses that block anywhere but the owner collection.
    if (FORBIDDEN_KEY.test(key) && !(key === "question_key" && path.endsWith(".admin"))) fail("forbidden_key", here, "answer-bearing or raw-identifier key");
    scanForbidden(v[key], here, depth + 1);
  }
}

function strictObj(v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Obj {
  if (!isObj(v)) return fail("malformed", path, "expected an object");
  for (const key of Object.keys(v)) {
    if (!required.includes(key) && !optional.includes(key)) fail("malformed", `${path}.${key}`, "unexpected key");
  }
  for (const key of required) {
    if (!(key in v)) fail("malformed", `${path}.${key}`, "required key is missing");
  }
  return v;
}

function str(v: unknown, path: string, max: number, pattern?: RegExp): string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) return fail("malformed", path, `expected a string of 1-${max} characters`);
  if (pattern && !pattern.test(v)) return fail("malformed", path, "string is not in the documented format");
  return v;
}

function strOrNull(v: unknown, path: string, max: number, pattern?: RegExp): string | null {
  return v === null ? null : str(v, path, max, pattern);
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return fail("malformed", path, `expected an integer ${min}-${max}`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") return fail("malformed", path, "expected a boolean");
  return v;
}

function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) return fail("malformed", path, "expected an array");
  if (v.length > max) return fail("malformed", path, `array longer than ${max}`);
  return v;
}

function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[], kind: "malformed" | "unknown_state" = "unknown_state"): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) return fail(kind, path, "value is not one of the documented states");
  return v as T;
}

const ID = /^[a-z][a-z0-9_]{0,63}$/;
const CODE = /^[a-z0-9_:]{1,80}$/;
const UPPER_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const HANDLE = /^aqh_[A-Za-z0-9_-]{1,36}$/;
const SUBJECT_ID = /^[A-Za-z0-9 '.&:-]{1,64}$/;
const TIMESTAMP = /^[0-9T:.+\-Z ]{8,40}$/;
const ABILITY_SLOTS = ["P", "Q", "W", "E", "R"] as const;
const SAFE_EDGE_ROLES = ["premise_subject", "comparison_operand", "scenario_context"] as const;

/* ------------------------------------------------------------------------- */
/* Access, error, coverage                                                   */
/* ------------------------------------------------------------------------- */

const REQUIRES_BY_COLLECTION: Record<Collection, AccessRequirement> = {
  catalog: "account",
  discovered: "account",
  premium_review: "premium",
  admin_inventory: "owner",
  premium_exclusive: "premium_exclusive_entitlement",
};

/** Frontend-owned copy. The wire carries a reason CODE, never prose. */
function accessMessage(state: AccessState, requires: AccessRequirement, reason: string | null): string {
  switch (state) {
    case "allowed":
      return requires === "owner" ? "Owner-only inventory." : requires === "premium" ? "Your own missed questions. Answers stay in the existing Premium missed-question review." : "Indexed, premise-safe questions.";
    case "requires_account":
      return reason === "anonymous_session" ? "This needs a signed-in account, not a guest session." : "Sign in to see this collection.";
    case "denied":
      return requires === "premium" ? "Premium review is for Premium accounts. This account is not Premium." : requires === "owner" ? "Admin inventory is owner-only." : "This account cannot see this collection.";
    case "unavailable_entitlement":
      return "The entitlement check is unavailable right now. This is not a denial and not a Free upsell; try again shortly.";
    case "not_configured":
      return reason === "catalog_exposure_policy_pending_owner_review" ? "The catalog is not enabled yet. Nothing is hidden or counted." : "Reserved. This collection has no question supply; nothing is counted or invented.";
  }
}

function mapError(v: unknown, status: number): ResponseError | null {
  if (v === null) return null;
  const o = strictObj(v, "error", ["code", "message", "field"]);
  return {
    code: str(o.code, "error.code", 64, UPPER_CODE),
    message: str(o.message, "error.message", 300),
    field: strOrNull(o.field, "error.field", 64, /^[a-z0-9_]{1,64}$/),
    http_status: status,
  };
}

function mapAccess(v: unknown, status: number, collection: Collection, error: ResponseError | null): Access {
  if (v === null) return fail("malformed", "access", "access is required");
  const o = strictObj(v, "access", ["state", "requires", "reason", "retryable"]);
  const wireState = oneOf(o.state, "access.state", ["allowed", "denied", "unavailable_entitlement", "not_configured"] as const);
  const requires = oneOf(o.requires, "access.requires", ["account", "premium", "owner", "premium_exclusive_entitlement"] as const);
  const reason = strOrNull(o.reason, "access.reason", 80, CODE);
  const retryable = bool(o.retryable, "access.retryable");
  if (requires !== REQUIRES_BY_COLLECTION[collection]) fail("inconsistent", "access.requires", "requirement does not belong to this collection");

  let state: AccessState = wireState;
  switch (status) {
    case 200:
      if (wireState === "unavailable_entitlement") fail("inconsistent", "access.state", "unavailable_entitlement must arrive as HTTP 503");
      break;
    case 400:
      if (wireState !== "allowed") fail("inconsistent", "access.state", "a rejected request cannot carry a gate state");
      break;
    case 401:
      if (wireState !== "denied" || error?.code !== "AUTH_REQUIRED") fail("inconsistent", "access.state", "401 must be denied / AUTH_REQUIRED");
      state = "requires_account";
      break;
    case 403:
      if (wireState !== "denied") fail("inconsistent", "access.state", "403 must be denied");
      if (error?.code === "ACCOUNT_REQUIRED") state = "requires_account";
      else if (error?.code !== "OWNER_REQUIRED") fail("unknown_state", "error.code", "unknown 403 code");
      break;
    case 503:
      if (error?.code === "SOURCE_UNAVAILABLE") {
        if (wireState !== "allowed") fail("inconsistent", "access.state", "a source outage happens after access was allowed");
      } else if (error?.code === "ENTITLEMENT_UNAVAILABLE" || error?.code === "OWNER_AUTH_UNAVAILABLE") {
        if (wireState !== "unavailable_entitlement" || !retryable) fail("inconsistent", "access.state", "an entitlement outage must be unavailable_entitlement and retryable");
      } else fail("unknown_state", "error.code", "unknown 503 code");
      break;
  }
  if (wireState === "unavailable_entitlement" && status !== 503) fail("inconsistent", "access.state", "unavailable_entitlement must arrive as HTTP 503");
  if (wireState === "not_configured" && status !== 200) fail("inconsistent", "access.state", "not_configured must arrive as HTTP 200");
  return { state, requires, reason, retryable, message: accessMessage(state, requires, reason) };
}

function mapCoverage(v: unknown): Coverage {
  const o = strictObj(v, "coverage", ["state", "scope", "corpus", "index_revision", "indexed_at", "rules_version", "reason_codes", "not_indexed_sources"], ["corpus_label"]);
  // "full" is not a state the server can emit; treating it as one would let a
  // bad response claim the index covers every Mogzy question.
  const state = oneOf(o.state, "coverage.state", ["partial", "unavailable"] as const);
  const coverage: Coverage = {
    state,
    scope: strOrNull(o.scope, "coverage.scope", 64, CODE),
    corpus: strOrNull(o.corpus, "coverage.corpus", 80, /^[a-z0-9_.]{1,80}$/),
    corpus_label: "corpus_label" in o ? strOrNull(o.corpus_label, "coverage.corpus_label", 400) : null,
    index_revision: strOrNull(o.index_revision, "coverage.index_revision", 64, /^[A-Za-z0-9_.-]{1,64}$/),
    indexed_at: strOrNull(o.indexed_at, "coverage.indexed_at", 40, TIMESTAMP),
    rules_version: strOrNull(o.rules_version, "coverage.rules_version", 40, /^[A-Za-z0-9_.-]{1,40}$/),
    reason_codes: arr(o.reason_codes, "coverage.reason_codes", 50).map((c, i) => str(c, `coverage.reason_codes[${i}]`, 80, CODE)),
    not_indexed_sources: arr(o.not_indexed_sources, "coverage.not_indexed_sources", 20).map((c, i) => str(c, `coverage.not_indexed_sources[${i}]`, 64, ID)),
  };
  if (state === "partial" && (coverage.index_revision === null || coverage.corpus === null)) fail("inconsistent", "coverage", "partial coverage must name its corpus and index revision");
  return coverage;
}

/* ------------------------------------------------------------------------- */
/* Query echo, relationship                                                  */
/* ------------------------------------------------------------------------- */

function mapLabeled(v: unknown, path: string): LabeledSubject {
  const o = strictObj(v, path, ["kind", "id", "label"]);
  return {
    kind: oneOf(o.kind, `${path}.kind`, ["champion", "item"] as const),
    id: str(o.id, `${path}.id`, 64, SUBJECT_ID),
    label: str(o.label, `${path}.label`, 120),
  };
}

function mapBModifierEcho(v: unknown): BModifierEcho {
  const o = strictObj(v, "query.b_modifier", ["kind", "id", "label", "attached_to", "intent"]);
  return {
    kind: oneOf(o.kind, "query.b_modifier.kind", ["item"] as const),
    id: str(o.id, "query.b_modifier.id", 64, SUBJECT_ID),
    label: str(o.label, "query.b_modifier.label", 120),
    attached_to: oneOf(o.attached_to, "query.b_modifier.attached_to", ["b"] as const),
    intent: oneOf(o.intent, "query.b_modifier.intent", ["equipped_for_research"] as const),
  };
}

function mapQuery(v: unknown): QueryEcho {
  const o = strictObj(v, "query", ["a", "b", "b_modifier", "filters"]);
  const f = strictObj(o.filters, "query.filters", ["topic", "ability_slot", "ability_rank", "champion_level", "family", "mode", "difficulty", "patch"]);
  return {
    a: o.a === null ? null : mapLabeled(o.a, "query.a"),
    b: o.b === null ? null : mapLabeled(o.b, "query.b"),
    b_modifier: o.b_modifier === null ? null : mapBModifierEcho(o.b_modifier),
    filters: {
      topic: arr(f.topic, "query.filters.topic", WIRE_LIMITS.repeatMax).map((t, i) => str(t, `query.filters.topic[${i}]`, 40, ID)),
      ability_slot: arr(f.ability_slot, "query.filters.ability_slot", 5).map((t, i) => oneOf(t, `query.filters.ability_slot[${i}]`, ABILITY_SLOTS)),
      ability_rank: arr(f.ability_rank, "query.filters.ability_rank", WIRE_LIMITS.repeatMax).map((t, i) => str(t, `query.filters.ability_rank[${i}]`, 3, /^([1-6]|max)$/)),
      champion_level: arr(f.champion_level, "query.filters.champion_level", WIRE_LIMITS.repeatMax).map((t, i) => int(t, `query.filters.champion_level[${i}]`, 1, 18)),
      family: arr(f.family, "query.filters.family", WIRE_LIMITS.repeatMax).map((t, i) => str(t, `query.filters.family[${i}]`, 64, ID)),
      mode: arr(f.mode, "query.filters.mode", WIRE_LIMITS.repeatMax).map((t, i) => str(t, `query.filters.mode[${i}]`, 40, ID)),
      difficulty: arr(f.difficulty, "query.filters.difficulty", WIRE_LIMITS.repeatMax).map((t, i) => int(t, `query.filters.difficulty[${i}]`, 1, 5)),
      patch: f.patch === null ? null : oneOf(f.patch, "query.filters.patch", ["current"] as const),
    },
  };
}

function mapSupport(v: unknown, path: string): { state: "supported" | "unsupported"; supporting_families: string[] } {
  const o = strictObj(v, path, ["state", "supporting_families"]);
  return mapSupportObj(o, path);
}

function mapSupportObj(o: Obj, path: string): { state: "supported" | "unsupported"; supporting_families: string[] } {
  const state = oneOf(o.state, `${path}.state`, ["supported", "unsupported"] as const);
  const supporting_families = arr(o.supporting_families, `${path}.supporting_families`, 40).map((f, i) => str(f, `${path}.supporting_families[${i}]`, 64, ID));
  if (state === "supported" && supporting_families.length === 0) fail("inconsistent", path, "a supported relation must name its families");
  if (state === "unsupported" && supporting_families.length > 0) fail("inconsistent", path, "an unsupported relation cannot name families");
  return { state, supporting_families };
}

function mapRelationship(v: unknown): RelationEvidence | null {
  if (v === null) return null;
  const o = strictObj(v, "relationship", ["state", "supporting_families"], ["reason", "b_modifier"]);
  const { state, supporting_families } = mapSupportObj(o, "relationship");
  const reason = "reason" in o ? strOrNull(o.reason, "relationship.reason", 120, CODE) : null;
  if (state === "unsupported" && reason === null) fail("inconsistent", "relationship.reason", "an unsupported relation must keep its reason");
  return {
    state,
    supporting_families,
    reason,
    b_modifier: "b_modifier" in o ? mapSupport(o.b_modifier, "relationship.b_modifier") : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Results                                                                   */
/* ------------------------------------------------------------------------- */

function mapLevelApplicability(v: unknown, path: string): LevelApplicability {
  const o = strictObj(v, path, ["state", "value"]);
  const state = oneOf(o.state, `${path}.state`, ["specific", "interval", "not_stated", "not_applicable"] as const);
  if (state === "specific") return { state, value: int(o.value, `${path}.value`, 1, 18) };
  // The server never emits a level interval, and a numeric bound would have to be invented.
  if (state === "interval") return fail("inconsistent", `${path}.state`, "a champion level has no interval state");
  if (o.value !== null) return fail("inconsistent", `${path}.value`, "an unstated or inapplicable level cannot carry a value");
  return { state, value: null };
}

function mapRankApplicability(v: unknown, path: string): RankApplicability {
  const o = strictObj(v, path, ["state", "value"]);
  const state = oneOf(o.state, `${path}.state`, ["specific", "interval", "not_stated", "not_applicable"] as const);
  if (state === "specific") return { state, value: str(o.value, `${path}.value`, 1, /^[1-6]$/) };
  // `max` is symbolic. It is preserved as `max`; it is never turned into a number.
  if (state === "interval") return { state, value: oneOf(o.value, `${path}.value`, ["max"] as const, "malformed") };
  if (o.value !== null) return fail("inconsistent", `${path}.value`, "an unstated or inapplicable rank cannot carry a value");
  return { state, value: null };
}

function mapFamily(v: unknown, path: string): FamilyRef {
  const o = strictObj(v, path, ["id", "label"]);
  return { id: str(o.id, `${path}.id`, 64, ID), label: str(o.label, `${path}.label`, 200) };
}

function mapSubjects(v: unknown, path: string): ResultSubject[] {
  return arr(v, path, 40).map((item, i) => {
    const o = strictObj(item, `${path}[${i}]`, ["kind", "id", "role"]);
    return {
      kind: oneOf(o.kind, `${path}[${i}].kind`, ["champion", "item", "ability"] as const),
      id: str(o.id, `${path}[${i}].id`, 64, SUBJECT_ID),
      // `answer_subject` / `unverified` are not in this list on purpose: the
      // server withholds them from every projection, so seeing one is a leak.
      role: oneOf(o.role, `${path}[${i}].role`, SAFE_EDGE_ROLES),
    };
  });
}

function mapDiscovery(v: unknown, path: string): Discovery | null {
  if (v === null) return null;
  const o = strictObj(v, path, ["state", "times_answered", "times_correct", "first_seen_at", "last_seen_at"]);
  return {
    state: oneOf(o.state, `${path}.state`, ["unlocked"] as const),
    times_answered: int(o.times_answered, `${path}.times_answered`, 0, 1_000_000),
    times_correct: int(o.times_correct, `${path}.times_correct`, 0, 1_000_000),
    first_seen_at: strOrNull(o.first_seen_at, `${path}.first_seen_at`, 40, TIMESTAMP),
    last_seen_at: strOrNull(o.last_seen_at, `${path}.last_seen_at`, 40, TIMESTAMP),
  };
}

function mapReview(v: unknown, path: string): Review | null {
  if (v === null) return null;
  const o = strictObj(v, path, ["missed_attempts", "last_missed_at"]);
  return {
    missed_attempts: int(o.missed_attempts, `${path}.missed_attempts`, 1, 1_000_000),
    last_missed_at: strOrNull(o.last_missed_at, `${path}.last_missed_at`, 40, TIMESTAMP),
  };
}

function mapAdmin(v: unknown, path: string): AdminFacts {
  const o = strictObj(v, path, ["question_key", "index_state", "catalog_exposure"]);
  // Validated, then dropped: the raw key is answer-bearing for some families.
  str(o.question_key, `${path}.question_key`, 400);
  return {
    index_state: oneOf(o.index_state, `${path}.index_state`, ["certified", "uncategorized", "excluded"] as const),
    catalog_exposure: bool(o.catalog_exposure, `${path}.catalog_exposure`),
  };
}

function mapResult(v: unknown, path: string, collection: Collection): QuestionResult {
  const o = strictObj(v, path, ["handle", "prompt", "family", "topics", "ability_slot", "applicability", "difficulty", "modes", "subjects", "source_status", "patch_context", "discovery", "review"], collection === "admin_inventory" ? ["admin"] : []);
  const a = strictObj(o.applicability, `${path}.applicability`, ["ability_rank", "champion_level"]);
  const discovery = mapDiscovery(o.discovery, `${path}.discovery`);
  const review = mapReview(o.review, `${path}.review`);
  // User-scoped metadata exists only where the server defines it; elsewhere it
  // would be another user's data or a mislabelled projection.
  if (collection === "discovered" && discovery === null) fail("inconsistent", `${path}.discovery`, "a discovered question must carry its discovery");
  if (collection !== "discovered" && discovery !== null) fail("inconsistent", `${path}.discovery`, "discovery metadata outside the discovered collection");
  if (collection === "premium_review" && review === null) fail("inconsistent", `${path}.review`, "a review question must carry its review");
  if (collection !== "premium_review" && review !== null) fail("inconsistent", `${path}.review`, "review metadata outside premium review");
  if (collection === "admin_inventory" && !("admin" in o)) fail("malformed", `${path}.admin`, "owner inventory results must carry admin facts");
  return {
    handle: str(o.handle, `${path}.handle`, 40, HANDLE),
    prompt: str(o.prompt, `${path}.prompt`, 2000),
    family: mapFamily(o.family, `${path}.family`),
    topics: arr(o.topics, `${path}.topics`, 12).map((t, i) => str(t, `${path}.topics[${i}]`, 40, ID)),
    ability_slot: o.ability_slot === null ? null : oneOf(o.ability_slot, `${path}.ability_slot`, ABILITY_SLOTS),
    applicability: {
      ability_rank: mapRankApplicability(a.ability_rank, `${path}.applicability.ability_rank`),
      champion_level: mapLevelApplicability(a.champion_level, `${path}.applicability.champion_level`),
    },
    difficulty: o.difficulty === null ? null : int(o.difficulty, `${path}.difficulty`, 1, 5),
    modes: arr(o.modes, `${path}.modes`, 12).map((m, i) => str(m, `${path}.modes[${i}]`, 40, ID)),
    subjects: mapSubjects(o.subjects, `${path}.subjects`),
    source_status: oneOf<SourceStatus>(o.source_status, `${path}.source_status`, ["current", "inactive", "withheld", "unavailable"]),
    patch_context: strOrNull(o.patch_context, `${path}.patch_context`, 40, /^[A-Za-z0-9_.-]{1,40}$/),
    discovery,
    review,
    admin: "admin" in o ? mapAdmin(o.admin, `${path}.admin`) : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Facets, page, counts, related                                             */
/* ------------------------------------------------------------------------- */

function mapFacetGroup<T extends string | number>(v: unknown, path: string, id: (raw: unknown, p: string) => T, labelled: boolean): FacetCount<T>[] {
  return arr(v, path, MAX_FACET_ENTRIES).map((item, i) => {
    const p = `${path}[${i}]`;
    const o = strictObj(item, p, ["id", "count", "count_state", "selected"], labelled ? ["label"] : []);
    const entry: FacetCount<T> = {
      id: id(o.id, `${p}.id`),
      count: int(o.count, `${p}.count`, 0, 10_000_000),
      count_state: oneOf(o.count_state, `${p}.count_state`, ["exact", "unavailable"] as const),
      selected: bool(o.selected, `${p}.selected`),
    };
    if ("label" in o) entry.label = str(o.label, `${p}.label`, 200);
    return entry;
  });
}

function mapFacets(v: unknown): Facets {
  const o = strictObj(v, "facets", ["topics", "ability_slot", "ability_rank", "champion_level", "family", "mode", "difficulty"]);
  return {
    topics: mapFacetGroup(o.topics, "facets.topics", (x, p) => str(x, p, 40, ID), true),
    ability_slot: mapFacetGroup<AbilitySlot>(o.ability_slot, "facets.ability_slot", (x, p) => oneOf(x, p, ABILITY_SLOTS), false),
    ability_rank: mapFacetGroup(o.ability_rank, "facets.ability_rank", (x, p) => str(x, p, 3, /^([1-6]|max)$/), false),
    champion_level: mapFacetGroup(o.champion_level, "facets.champion_level", (x, p) => int(x, p, 1, 18), false),
    family: mapFacetGroup(o.family, "facets.family", (x, p) => str(x, p, 64, ID), true),
    mode: mapFacetGroup(o.mode, "facets.mode", (x, p) => str(x, p, 40, ID), false),
    difficulty: mapFacetGroup(o.difficulty, "facets.difficulty", (x, p) => int(x, p, 1, 5), false),
  };
}

function mapStateCounts(v: unknown, path: string): Partial<Record<ApplicabilityState, number>> {
  if (!isObj(v)) return fail("malformed", path, "expected an object");
  const out: Partial<Record<ApplicabilityState, number>> = {};
  for (const key of Object.keys(v)) {
    const state = oneOf<ApplicabilityState>(key, `${path}.${key}`, ["specific", "interval", "not_stated", "not_applicable"]);
    out[state] = int(v[key], `${path}.${key}`, 0, 10_000_000);
  }
  return out;
}

function mapFacetApplicability(v: unknown): FacetApplicability {
  const o = strictObj(v, "facet_applicability", ["ability_rank", "champion_level"]);
  return { ability_rank: mapStateCounts(o.ability_rank, "facet_applicability.ability_rank"), champion_level: mapStateCounts(o.champion_level, "facet_applicability.champion_level") };
}

function mapPage(v: unknown): PageInfo {
  const o = strictObj(v, "page", ["limit", "offset", "has_more", "next_cursor"]);
  const next = strOrNull(o.next_cursor, "page.next_cursor", 512, CURSOR_PATTERN);
  const hasMore = bool(o.has_more, "page.has_more");
  if (hasMore !== (next !== null)) fail("inconsistent", "page", "has_more and next_cursor disagree");
  return { limit: int(o.limit, "page.limit", 1, MAX_RESULTS), offset: int(o.offset, "page.offset", 0, 1_000_000), has_more: hasMore, next_cursor: next };
}

function mapOutside(v: unknown, path: string): Record<string, number> {
  if (!isObj(v)) return fail("malformed", path, "expected an object");
  const out: Record<string, number> = {};
  for (const key of Object.keys(v)) {
    if (!/^[a-z0-9_:]{1,80}$/.test(key)) fail("malformed", `${path}.${key}`, "reason key is not in the documented format");
    out[key] = int(v[key], `${path}.${key}`, 0, 100_000_000);
  }
  return out;
}

function mapCounts(v: unknown): Counts {
  const o = strictObj(v, "counts", ["visible_matching", "count_state"], ["unit", "discoveries_total", "discoveries_outside_index", "missed_attempts_indexed", "missed_attempts_outside_index"]);
  const count_state = oneOf(o.count_state, "counts.count_state", ["exact", "unavailable"] as const);
  const counts: Counts = {
    visible_matching: o.visible_matching === null ? null : int(o.visible_matching, "counts.visible_matching", 0, 100_000_000),
    count_state,
    unit: "unit" in o ? oneOf(o.unit, "counts.unit", ["question", "prompt_stem"] as const) : null,
  };
  // An unavailable count is NOT zero, and an exact count must be a number.
  if (count_state === "unavailable" && counts.visible_matching !== null) fail("inconsistent", "counts.visible_matching", "an unavailable count cannot carry a number");
  if (count_state === "exact" && (counts.visible_matching === null || counts.unit === null)) fail("inconsistent", "counts", "an exact count needs a number and a unit");
  if ("discoveries_total" in o) counts.discoveries_total = int(o.discoveries_total, "counts.discoveries_total", 0, 100_000_000);
  if ("discoveries_outside_index" in o) counts.discoveries_outside_index = mapOutside(o.discoveries_outside_index, "counts.discoveries_outside_index");
  if ("missed_attempts_indexed" in o) counts.missed_attempts_indexed = int(o.missed_attempts_indexed, "counts.missed_attempts_indexed", 0, 100_000_000);
  if ("missed_attempts_outside_index" in o) counts.missed_attempts_outside_index = mapOutside(o.missed_attempts_outside_index, "counts.missed_attempts_outside_index");
  return counts;
}

function mapRelated(v: unknown, collection: Collection): RelatedPanel | null {
  if (v === null) return null;
  const wrap = strictObj(v, "related", ["b_modifier"]);
  const o = strictObj(wrap.b_modifier, "related.b_modifier", ["subject", "relationship", "label", "results", "count", "count_state", "has_more"]);
  const subject = mapLabeled(o.subject, "related.b_modifier.subject");
  if (subject.kind !== "item") fail("inconsistent", "related.b_modifier.subject.kind", "the B.1 subject is an item");
  const results = arr(o.results, "related.b_modifier.results", 10).map((r, i) => mapResult(r, `related.b_modifier.results[${i}]`, collection));
  const count = int(o.count, "related.b_modifier.count", 0, 100_000_000);
  const hasMore = bool(o.has_more, "related.b_modifier.has_more");
  if (count < results.length) fail("inconsistent", "related.b_modifier.count", "count is smaller than the results shown");
  if (hasMore !== count > results.length) fail("inconsistent", "related.b_modifier.has_more", "has_more disagrees with count");
  return {
    kind: "b_modifier",
    subject,
    relationship: oneOf(o.relationship, "related.b_modifier.relationship", ["item_is_premise_subject"] as const),
    label: str(o.label, "related.b_modifier.label", 200),
    results,
    count,
    count_state: oneOf(o.count_state, "related.b_modifier.count_state", ["exact", "unavailable"] as const),
    has_more: hasMore,
  };
}

/* ------------------------------------------------------------------------- */
/* Envelope                                                                  */
/* ------------------------------------------------------------------------- */

const ENVELOPE_KEYS = ["contract_version", "query", "collection", "access", "coverage", "relationship", "results", "facets", "facet_applicability", "page", "counts", "related", "error"] as const;
const HANDLED_STATUSES = [200, 400, 401, 403, 503];

export interface ExpectedRequest {
  /** The query that was encoded. When given, the echo must match it. */
  query: CrossSectionQuery;
}

function retryAfterSeconds(res: WireHttpResponse): number | null {
  const detail = isObj(res.body) && isObj(res.body.detail) ? res.body.detail : null;
  const fromBody = detail && typeof detail.retry_after_seconds === "number" && Number.isInteger(detail.retry_after_seconds) ? detail.retry_after_seconds : null;
  const header = res.retryAfter && /^[0-9]{1,5}$/.test(res.retryAfter) ? Number(res.retryAfter) : null;
  const picked = fromBody ?? header;
  return picked !== null && picked >= 0 && picked <= 3600 ? picked : null;
}

function checkEcho(echo: QueryEcho, q: CrossSectionQuery): void {
  const same = (got: LabeledSubject | null, want: CrossSectionQuery["a"], path: string) => {
    if ((got === null) !== (want === null) || (got && want && (got.kind !== want.kind || got.id !== want.id))) fail("inconsistent", path, "the response answers a different subject than was requested");
  };
  same(echo.a, q.a, "query.a");
  same(echo.b, q.b, "query.b");
  const wantB1 = q.b && q.b1ItemId ? q.b1ItemId : null;
  if ((echo.b_modifier?.id ?? null) !== wantB1) fail("inconsistent", "query.b_modifier", "the response answers a different B.1 item than was requested");
  const f = echo.filters;
  const sameSet = (got: Array<string | number>, want: Array<string | number>, path: string) => {
    const a = new Set(got.map(String));
    const b = new Set(want.map(String));
    if (a.size !== b.size || [...a].some((x) => !b.has(x))) fail("inconsistent", path, "the response applied different filters than were requested");
  };
  sameSet(f.topic, q.topics, "query.filters.topic");
  sameSet(f.ability_slot, q.abilitySlot ? [q.abilitySlot] : [], "query.filters.ability_slot");
  sameSet(f.ability_rank, q.abilityRank === null ? [] : [q.abilityRank], "query.filters.ability_rank");
  sameSet(f.champion_level, q.championLevel === null ? [] : [q.championLevel], "query.filters.champion_level");
  if (f.family.length || f.mode.length || f.difficulty.length) fail("inconsistent", "query.filters", "the response applied filters that were not requested");
  if (f.patch !== q.patch) fail("inconsistent", "query.filters.patch", "the response applied a different patch than was requested");
}

const NO_PAYLOAD_KEYS = ["query", "coverage", "relationship", "facets", "facet_applicability", "page", "counts", "related"] as const;

function requireNoPayload(o: Obj, why: string, except: readonly string[] = []): void {
  for (const key of NO_PAYLOAD_KEYS) {
    if (except.includes(key)) continue;
    if (o[key] !== null) fail("inconsistent", key, `${why} cannot carry ${key}`);
  }
  if (!Array.isArray(o.results) || o.results.length !== 0) fail("inconsistent", "results", `${why} cannot carry results`);
}

export function mapWireResponse(res: WireHttpResponse, expected?: ExpectedRequest): CrossSectionResponse {
  const status = res.status;
  if (status === 429) throw new AtlasWireError("rate_limited", "", "the server asked this client to slow down", retryAfterSeconds(res));
  if (!HANDLED_STATUSES.includes(status)) return fail("unexpected_status", "", "HTTP status is not defined for this route");

  const body: unknown = res.body;
  if (!isObj(body)) return fail("malformed", "", "response body is not an object");
  scanForbidden(body, "", 0);
  const o = strictObj(body, "", ENVELOPE_KEYS);
  if (o.contract_version !== WIRE_CONTRACT_VERSION) return fail("contract_mismatch", "contract_version", "unsupported contract version");

  const collection = oneOf(o.collection, "collection", COLLECTIONS, "malformed");
  if (expected && collection !== expected.query.collection) fail("inconsistent", "collection", "the response answers a different collection than was requested");

  const error = mapError(o.error, status);
  if ((status === 200) !== (error === null)) fail("inconsistent", "error", "error presence disagrees with the HTTP status");
  const access = mapAccess(o.access, status, collection, error);

  const base = { contract_version: WIRE_CONTRACT_VERSION, collection, access, error, demo: false } as const;
  const closed = (): CrossSectionResponse => ({
    ...base,
    query: null,
    coverage: null,
    relationship: null,
    results: [],
    facets: EMPTY_FACETS,
    facet_applicability: { ability_rank: {}, champion_level: {} },
    related: null,
    page: { limit: null, offset: null, next_cursor: null, has_more: false },
    counts: { visible_matching: null, count_state: "unavailable", unit: null },
  });

  // Not allowed, or the request failed before the index answered: no data, ever.
  if (access.state !== "allowed" || error !== null) {
    requireNoPayload(o, access.state !== "allowed" ? "a gated collection" : "a failed request");
    return closed();
  }

  const coverage = mapCoverage(o.coverage);
  if (coverage.state === "unavailable") {
    // The index could not answer; the count is unavailable, never zero.
    requireNoPayload(o, "an unavailable index", ["coverage", "counts"]);
    const counts = mapCounts(o.counts);
    if (counts.count_state !== "unavailable") fail("inconsistent", "counts.count_state", "an unavailable index cannot report an exact count");
    return { ...closed(), coverage, counts };
  }

  const query = mapQuery(o.query);
  if (expected) checkEcho(query, expected.query);
  const relationship = mapRelationship(o.relationship);
  const results = arr(o.results, "results", MAX_RESULTS).map((r, i) => mapResult(r, `results[${i}]`, collection));
  const facets = mapFacets(o.facets);
  const facet_applicability = mapFacetApplicability(o.facet_applicability);
  const page = mapPage(o.page);
  const counts = mapCounts(o.counts);
  const related = mapRelated(o.related, collection);

  if (counts.count_state !== "exact" || counts.visible_matching === null) fail("inconsistent", "counts", "an answering index must report an exact count");
  if (results.length > counts.visible_matching) fail("inconsistent", "counts.visible_matching", "fewer matches than results shown");
  if (results.length > (page.limit ?? MAX_RESULTS)) fail("inconsistent", "page.limit", "more results than the page limit");
  if (relationship?.state === "unsupported" && (results.length > 0 || counts.visible_matching > 0)) fail("inconsistent", "relationship", "an unsupported relation cannot have matches");
  if ((related !== null) !== (query.b_modifier !== null)) fail("inconsistent", "related", "the B.1 panel and the B.1 echo must appear together");
  if (related && query.b_modifier && related.subject.id !== query.b_modifier.id) fail("inconsistent", "related.b_modifier.subject", "the B.1 panel is about a different item than the request");
  if (related && relationship && relationship.b_modifier === null) fail("inconsistent", "relationship.b_modifier", "a B.1 query must report B.1 support");
  const expectsRelation = (query.a !== null && query.b !== null) || query.b_modifier !== null;
  if (expectsRelation !== (relationship !== null)) fail("inconsistent", "relationship", "a relation is reported exactly when two subjects (or a B.1 item) are requested");
  if (results.some((r, i) => results.findIndex((x) => x.handle === r.handle) !== i)) fail("inconsistent", "results", "duplicate handle");

  return { ...base, query, coverage, relationship, results, facets, facet_applicability, related, page, counts };
}

/* ------------------------------------------------------------------------- */
/* GET /coverage (topics catalog)                                            */
/* ------------------------------------------------------------------------- */

export interface CoverageCatalog {
  /** Topic ids + labels the server certifies: the only topics a UI should offer. */
  topics: Array<{ id: string; label: string }>;
  index_revision: string | null;
  state: "partial" | "unavailable";
  not_indexed_sources: string[];
  certified_families: Array<{ family_id: string; label: string; catalog_exposure: boolean }>;
  collections: Collection[];
}

/** Maps `GET /api/atlas/questions/coverage`. Declarations only; no counts exist on it. */
export function mapCoverageCatalog(res: WireHttpResponse): CoverageCatalog {
  if (res.status !== 200) return fail("unexpected_status", "", "coverage is HTTP 200 or an error");
  if (!isObj(res.body)) return fail("malformed", "", "response body is not an object");
  scanForbidden(res.body, "", 0);
  const o = strictObj(res.body, "", ["contract_version", "rules_version", "index_revision", "indexed_at", "state", "certified_families", "uncertified_policy", "not_indexed_sources", "topics", "collections"]);
  if (o.contract_version !== WIRE_CONTRACT_VERSION) return fail("contract_mismatch", "contract_version", "unsupported contract version");
  const state = oneOf(o.state, "state", ["partial", "unavailable"] as const);
  return {
    state,
    index_revision: strOrNull(o.index_revision, "index_revision", 64, /^[A-Za-z0-9_.-]{1,64}$/),
    not_indexed_sources: arr(o.not_indexed_sources, "not_indexed_sources", 20).map((s, i) => str(s, `not_indexed_sources[${i}]`, 64, ID)),
    topics: arr(o.topics, "topics", 100).map((t, i) => {
      const e = strictObj(t, `topics[${i}]`, ["id", "label"]);
      return { id: str(e.id, `topics[${i}].id`, 40, ID), label: str(e.label, `topics[${i}].label`, 120) };
    }),
    certified_families: arr(o.certified_families, "certified_families", 200).map((f, i) => {
      const e = strictObj(f, `certified_families[${i}]`, ["family_id", "label", "indexability", "catalog_exposure", "catalog_withheld_reason"]);
      oneOf(e.indexability, `certified_families[${i}].indexability`, ["certified"] as const);
      return { family_id: str(e.family_id, `certified_families[${i}].family_id`, 64, ID), label: str(e.label, `certified_families[${i}].label`, 200), catalog_exposure: bool(e.catalog_exposure, `certified_families[${i}].catalog_exposure`) };
    }),
    collections: arr(o.collections, "collections", 10).map((c, i) => oneOf(c, `collections[${i}]`, COLLECTIONS, "malformed")),
  };
}
