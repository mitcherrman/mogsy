/**
 * Atlas cross-section — fixture adapter over the DEMO corpus. It behaves the
 * way the implemented backend (`atlas_questions.v0`) does, so the UI is built
 * and previewed against real semantics, and it emits the same view types the
 * wire mapper produces. Nothing here touches a network.
 *
 *   * subject edges count only when their family is certified and their
 *     role is premise-safe; `answer_subject` and `unverified` edges never
 *     satisfy a public axis;
 *   * A × B requires both axes satisfied independently; a pair with no
 *     certified relation is `unsupported` and carries a reason;
 *   * B.1 narrows the intersection to questions whose scenario-context item
 *     is attached to B; questions about the item itself go to the separate
 *     `related` panel, never into `results`;
 *   * a facet filter matches a question only if one of its VALUES is wanted
 *     (a question that does not state a rank never matches a rank filter);
 *     topics OR, the other groups AND; `patch=current` drops non-current rows;
 *   * collections are access-checked from the session, never from the
 *     question's family; facets and counts come from the full authorized
 *     population (each group counted over the other groups' filters);
 *   * discovery metadata exists only in `discovered`, review only in
 *     `premium_review`, admin facts only in `admin_inventory`; elsewhere they
 *     are `null`, which is not "locked".
 *
 * It resolves on a microtask with a tiny optional delay so the UI's loading
 * state is real.
 */
import { FAMILIES, QUESTIONS, findSubject, type DemoQuestion, type FamilyId } from "./fixtures";
import { relationshipOf, sameSubject } from "./query";
import {
  EMPTY_FACETS,
  type Access,
  type AbilitySlot,
  type ApplicabilityState,
  type Collection,
  type Coverage,
  type CrossSectionAdapter,
  type CrossSectionQuery,
  type CrossSectionResponse,
  type FacetCount,
  type FacetApplicability,
  type Facets,
  type LabeledSubject,
  type QuestionResult,
  type RelatedPanel,
  type RelationEvidence,
  type SessionContext,
  type SubjectRef,
} from "./types";

const PREMISE_SAFE_ROLES = ["premise_subject", "comparison_operand", "scenario_context"] as const;
const certifiedFamilies = new Set<FamilyId>(FAMILIES.filter((f) => f.certified).map((f) => f.id));
const RELATED_LIMIT = 10;
const UNSUPPORTED_REASON = "no_certified_family_relates_these_subjects_in_collection";

function isSafeRole(role: string): boolean {
  return (PREMISE_SAFE_ROLES as readonly string[]).includes(role);
}

function publicEdgeFor(question: DemoQuestion, subject: SubjectRef): boolean {
  if (!certifiedFamilies.has(question.family)) return false;
  return question.edges.some((e) => sameSubject(e.subject, subject) && isSafeRole(e.role));
}

function anyEdgeFor(question: DemoQuestion, subject: SubjectRef): boolean {
  return question.edges.some((e) => sameSubject(e.subject, subject));
}

function axisMatch(question: DemoQuestion, subject: SubjectRef, inventory: boolean): boolean {
  return inventory ? anyEdgeFor(question, subject) : publicEdgeFor(question, subject);
}

/** True when `question` carries an item edge for `item` held by champion `holder`. */
function attachedItem(question: DemoQuestion, item: SubjectRef, holder: SubjectRef, inventory: boolean): boolean {
  if (!inventory && !certifiedFamilies.has(question.family)) return false;
  return question.edges.some((e) => e.role === "scenario_context" && sameSubject(e.subject, item) && e.attachedTo !== undefined && sameSubject(e.attachedTo, holder));
}

function premiseOfItem(question: DemoQuestion, item: SubjectRef, inventory: boolean): boolean {
  if (!inventory && !certifiedFamilies.has(question.family)) return false;
  return question.edges.some((e) => e.role === "premise_subject" && sameSubject(e.subject, item));
}

type FacetGroup = "topics" | "ability_slot" | "ability_rank" | "champion_level";
const GROUPS: readonly FacetGroup[] = ["topics", "ability_slot", "ability_rank", "champion_level"];

function valuesOf(question: DemoQuestion, group: FacetGroup): string[] {
  switch (group) {
    case "topics":
      return question.topics;
    case "ability_slot":
      return question.abilitySlot ? [question.abilitySlot] : [];
    case "ability_rank":
      return question.abilityRank.value === null ? [] : [question.abilityRank.value];
    case "champion_level":
      return question.championLevel.value === null ? [] : [String(question.championLevel.value)];
  }
}

function wantedOf(query: CrossSectionQuery, group: FacetGroup): string[] {
  switch (group) {
    case "topics":
      return query.topics;
    case "ability_slot":
      return query.abilitySlot ? [query.abilitySlot] : [];
    case "ability_rank":
      return query.abilityRank === null ? [] : [String(query.abilityRank)];
    case "champion_level":
      return query.championLevel === null ? [] : [String(query.championLevel)];
  }
}

function passes(question: DemoQuestion, query: CrossSectionQuery, group: FacetGroup): boolean {
  const wanted = wantedOf(query, group);
  if (!wanted.length) return true;
  return valuesOf(question, group).some((v) => wanted.includes(v));
}

export function accessFor(collection: Collection, session: SessionContext): Access {
  const p = session.persona;
  const make = (state: Access["state"], requires: Access["requires"], message: string, reason: string | null = null, retryable = false): Access => ({ state, requires, reason, retryable, message });
  switch (collection) {
    case "catalog":
      // Account-only is the contract's "simplest/safest first implementation".
      return p === "anonymous"
        ? make("requires_account", "account", "The indexed catalog is browsable with an account. Sign in to see it.", "unauthenticated")
        : make("allowed", "account", "Indexed, premise-safe catalog.");
    case "discovered":
      return p === "anonymous"
        ? make("requires_account", "account", "Unlocked questions belong to an account. Sign in to see yours.", "unauthenticated")
        : make("allowed", "account", "Questions this account has actually discovered in Ranked.");
    case "premium_review":
      if (p === "anonymous") return make("requires_account", "premium", "Premium review needs a signed-in Premium account.", "unauthenticated");
      if (session.premiumLookup === "unavailable") return make("unavailable_entitlement", "premium", "The Premium entitlement check is unreachable right now. This is not a Free upsell; retry shortly.", null, true);
      if (p === "account") return make("denied", "premium", "Premium review lists your own missed questions. This account is not Premium.", "premium_required");
      return make("allowed", "premium", "Your own missed questions. Answers stay in the existing Premium missed-question review.");
    case "admin_inventory":
      return p === "owner" ? make("allowed", "owner", "Owner-only inventory: every record, including uncertified families.") : make("denied", "owner", "Admin inventory is owner-only and never feeds public responses.", "owner_required");
    case "premium_exclusive":
      return make("not_configured", "premium_exclusive_entitlement", "Reserved. No Premium-exclusive question supply exists; nothing is counted or invented.", "no_premium_exclusive_question_supply_exists");
  }
}

function labeled(ref: SubjectRef): LabeledSubject {
  return { kind: ref.kind, id: ref.id, label: findSubject(ref)?.name ?? ref.id };
}

function toResult(question: DemoQuestion, collection: Collection): QuestionResult {
  const family = FAMILIES.find((f) => f.id === question.family);
  return {
    handle: question.handle,
    prompt: question.prompt,
    family: { id: question.family, label: family?.label ?? question.family },
    topics: [...question.topics].sort(),
    ability_slot: question.abilitySlot,
    applicability: { champion_level: question.championLevel, ability_rank: question.abilityRank },
    difficulty: null,
    modes: [],
    subjects: question.edges
      .filter((e) => certifiedFamilies.has(question.family) && isSafeRole(e.role))
      .map((e) => ({ kind: e.subject.kind, id: e.subject.id, role: e.role as "premise_subject" | "comparison_operand" | "scenario_context" })),
    source_status: question.serveState === "serveable" ? question.sourceStatus : "withheld",
    patch_context: null,
    discovery: collection === "discovered" && question.discoveredByDemoUser ? { state: "unlocked", times_answered: 2, times_correct: 1, first_seen_at: "2026-10-01T00:00:00+00:00", last_seen_at: "2026-10-12T00:00:00+00:00" } : null,
    review: collection === "premium_review" && question.demoAttempt ? { ...question.demoAttempt } : null,
    admin: collection === "admin_inventory" ? { index_state: certifiedFamilies.has(question.family) ? "certified" : "uncategorized", catalog_exposure: certifiedFamilies.has(question.family) } : null,
  };
}

function facetEntries(items: DemoQuestion[], group: FacetGroup, query: CrossSectionQuery): FacetCount<string>[] {
  const counts = new Map<string, number>();
  for (const q of items) for (const v of new Set(valuesOf(q, group))) counts.set(v, (counts.get(v) ?? 0) + 1);
  const selected = new Set(wantedOf(query, group));
  for (const s of selected) if (!counts.has(s)) counts.set(s, 0);
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, count, count_state: "exact" as const, selected: selected.has(id) }))
    .sort((x, y) => y.count - x.count || x.id.localeCompare(y.id));
}

function stateCounts(items: DemoQuestion[], pick: (q: DemoQuestion) => { state: ApplicabilityState; value: unknown }): Partial<Record<ApplicabilityState, number>> {
  const out: Partial<Record<ApplicabilityState, number>> = {};
  for (const q of items) {
    const a = pick(q);
    if (a.value === null) out[a.state] = (out[a.state] ?? 0) + 1;
  }
  return out;
}

function demoCoverage(): Coverage {
  return {
    state: "partial",
    scope: "certified_premise_index",
    corpus: "demo.fixture_rows",
    corpus_label: "DEMO fixture corpus. It is not the Mogzy question bank and its numbers are not server facts.",
    index_revision: "demo-fixture",
    indexed_at: null,
    rules_version: "demo",
    reason_codes: ["uncategorized_families_excluded"],
    not_indexed_sources: ["ranked_accepted_bank", "mastery_curriculum", "runtime_casual_families", "pro_play_on_demand"],
  };
}

export interface FixtureAdapterOptions {
  /** Simulated latency in ms (0 in tests). */
  latencyMs?: number;
}

export function createFixtureAdapter(options: FixtureAdapterOptions = {}): CrossSectionAdapter {
  const latency = options.latencyMs ?? 0;
  return {
    label: "Fixture adapter (DEMO DATA)",
    async search(query, session) {
      if (latency > 0) await new Promise((r) => setTimeout(r, latency));
      return searchFixtures(query, session);
    },
  };
}

function offsetOf(cursor: string | null): number {
  const n = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Synchronous core, exported for tests. */
export function searchFixtures(query: CrossSectionQuery, session: SessionContext): CrossSectionResponse {
  const rel = relationshipOf(query);
  const axes: SubjectRef[] = rel.kind === "a_only" ? [rel.a] : rel.kind === "b_only" ? [rel.b] : rel.kind === "pair" ? [rel.a, rel.b] : [];
  const b1 = rel.kind !== "none" && rel.kind !== "a_only" ? rel.b1ItemId : null;
  const b1Ref: SubjectRef | null = b1 ? { kind: "item", id: b1 } : null;
  const bRef: SubjectRef | null = rel.kind === "b_only" || rel.kind === "pair" ? rel.b : null;
  const access = accessFor(query.collection, session);
  const inventory = query.collection === "admin_inventory";
  const offset = offsetOf(query.cursor);

  const base = {
    contract_version: "atlas_questions.v0" as const,
    collection: query.collection,
    access,
    demo: true,
    error: null,
  };
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
  if (access.state !== "allowed") return closed();

  const echo = {
    a: query.a ? labeled(query.a) : null,
    b: query.b ? labeled(query.b) : null,
    b_modifier: b1Ref && bRef ? { ...labeled(b1Ref), kind: "item" as const, attached_to: "b" as const, intent: "equipped_for_research" as const } : null,
    filters: {
      topic: query.topics,
      ability_slot: query.abilitySlot ? [query.abilitySlot] : [],
      ability_rank: query.abilityRank === null ? [] : [String(query.abilityRank)],
      champion_level: query.championLevel === null ? [] : [query.championLevel],
      family: [],
      mode: [],
      difficulty: [],
      patch: query.patch,
    },
  };

  if (axes.length === 0) {
    return { ...closed(), query: echo, coverage: demoCoverage(), counts: { visible_matching: 0, count_state: "exact", unit: "question" } };
  }

  // Population: the collection's authorized rows, patch=current, every axis met.
  // `patch=current` keeps only rows whose source status is `current`; a held or
  // retired family is `withheld` and an unpublished row `inactive`.
  const currentOnly = (q: DemoQuestion) => query.patch !== "current" || (q.serveState === "serveable" && q.sourceStatus === "current");
  let population = QUESTIONS.filter((q) => (inventory || q.serveState === "serveable") && currentOnly(q));
  if (query.collection === "discovered") population = population.filter((q) => q.discoveredByDemoUser);
  if (query.collection === "premium_review") population = population.filter((q) => q.demoAttempt !== null);
  const authorized = population;

  let intersect = authorized.filter((q) => axes.every((s) => axisMatch(q, s, inventory)));
  if (b1Ref && bRef) intersect = intersect.filter((q) => attachedItem(q, b1Ref, bRef, inventory));

  // Relationship evidence (declared from certified families, not from the page).
  const pair = axes.length === 2;
  const familiesFor = (rows: DemoQuestion[]) => Array.from(new Set(rows.filter((q) => certifiedFamilies.has(q.family)).map((q) => q.family))).sort();
  let relationship: RelationEvidence | null = null;
  if (pair || b1Ref) {
    const pairFamilies = pair ? familiesFor(QUESTIONS.filter((q) => axes.every((s) => publicEdgeFor(q, s)))) : null;
    let bModifier: RelationEvidence["b_modifier"] = null;
    let families = pairFamilies;
    if (b1Ref && bRef) {
      const b1Families = familiesFor(QUESTIONS.filter((q) => attachedItem(q, b1Ref, bRef, false)));
      bModifier = { state: b1Families.length ? "supported" : "unsupported", supporting_families: b1Families };
      families = pairFamilies === null ? b1Families : b1Families.filter((f) => pairFamilies.includes(f));
    }
    relationship = families && families.length ? { state: "supported", supporting_families: families, reason: null, b_modifier: bModifier } : { state: "unsupported", supporting_families: [], reason: UNSUPPORTED_REASON, b_modifier: bModifier };
  }
  if (relationship?.state === "unsupported") intersect = [];

  const matching = intersect.filter((q) => GROUPS.every((g) => passes(q, query, g)));
  const page = matching.slice(offset, offset + query.limit);
  const hasMore = offset + query.limit < matching.length;

  // Disjunctive facet counts: a group is counted over the OTHER groups' filters.
  const facets: Facets = { ...EMPTY_FACETS };
  const facetApplicability: FacetApplicability = { ability_rank: {}, champion_level: {} };
  for (const group of GROUPS) {
    const others = intersect.filter((q) => GROUPS.every((g) => g === group || passes(q, query, g)));
    const entries = facetEntries(others, group, query);
    if (group === "topics") facets.topics = entries;
    if (group === "ability_slot") facets.ability_slot = entries as FacetCount<AbilitySlot>[];
    if (group === "ability_rank") {
      facets.ability_rank = entries;
      facetApplicability.ability_rank = stateCounts(others, (q) => q.abilityRank);
    }
    if (group === "champion_level") {
      facets.champion_level = entries.map((e) => ({ ...e, id: Number(e.id) }));
      facetApplicability.champion_level = stateCounts(others, (q) => q.championLevel);
    }
  }
  const familyCounts = new Map<string, number>();
  for (const q of matching) familyCounts.set(q.family, (familyCounts.get(q.family) ?? 0) + 1);
  facets.family = Array.from(familyCounts.entries())
    .map(([id, count]) => ({ id, count, count_state: "exact" as const, selected: false, label: FAMILIES.find((f) => f.id === id)?.label ?? id }))
    .sort((x, y) => y.count - x.count || x.id.localeCompare(y.id));

  // B.1 related panel: questions ABOUT the item, never merged with `results`.
  let related: RelatedPanel | null = null;
  if (b1Ref && bRef) {
    const matchedHandles = new Set(matching.map((q) => q.handle));
    const about = authorized.filter((q) => premiseOfItem(q, b1Ref, inventory) && !matchedHandles.has(q.handle));
    related = {
      kind: "b_modifier",
      subject: labeled(b1Ref),
      relationship: "item_is_premise_subject",
      label: "Questions about the B.1 item itself (not equipped by B)",
      results: about.slice(0, RELATED_LIMIT).map((q) => toResult(q, query.collection)),
      count: about.length,
      count_state: "exact",
      has_more: about.length > RELATED_LIMIT,
    };
  }

  return {
    ...base,
    query: echo,
    coverage: demoCoverage(),
    relationship,
    results: page.map((q) => toResult(q, query.collection)),
    facets,
    facet_applicability: facetApplicability,
    related,
    page: { limit: query.limit, offset, next_cursor: hasMore ? String(offset + query.limit) : null, has_more: hasMore },
    counts: { visible_matching: matching.length, count_state: "exact", unit: query.collection === "catalog" ? "prompt_stem" : "question" },
  };
}

/** Convenience for the UI header: does the pair have any certified relation at all? */
export function pairSupported(a: SubjectRef, b: SubjectRef): boolean {
  return QUESTIONS.some((q) => publicEdgeFor(q, a) && publicEdgeFor(q, b));
}

export { findSubject };
