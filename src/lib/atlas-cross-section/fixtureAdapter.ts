/**
 * ATL-CS-UX-001 — fixture adapter implementing the Contract V0 handshake
 * over the DEMO corpus. Its job is to behave the way the proposed server
 * would, so the UI is built against real semantics:
 *
 *   * subject edges count only when their family is certified and their
 *     role is premise-safe; `answer_subject` and `unverified` edges never
 *     satisfy a public axis;
 *   * A × B requires both axes satisfied independently; a pair with no
 *     certified relation anywhere in the corpus is `unsupported`;
 *   * B.1 is a scenario modifier: questions about the item go to
 *     `related_results`, never into `results`;
 *   * topics OR, the other facet groups AND; level/rank apply only to
 *     scoped questions;
 *   * collections are access-checked from the session, never from the
 *     question's family; facets and counts come from the full authorized
 *     matching population, not the page.
 *
 * It resolves on a microtask with a tiny optional delay so the UI's loading
 * state is real. Nothing here touches a network.
 */
import { FAMILIES, QUESTIONS, findSubject, type DemoQuestion, type FamilyId } from "./fixtures";
import { relationshipOf, sameSubject } from "./query";
import type {
  AbilitySlot,
  Access,
  Applicability,
  Collection,
  Coverage,
  CrossSectionAdapter,
  CrossSectionQuery,
  CrossSectionResponse,
  EdgeRole,
  FacetCount,
  QuestionResult,
  SessionContext,
  SubjectRef,
  Topic,
} from "./types";

const PREMISE_SAFE_ROLES: readonly EdgeRole[] = ["premise_subject", "comparison_operand", "scenario_context"];
const certifiedFamilies = new Set<FamilyId>(FAMILIES.filter((f) => f.certified).map((f) => f.id));

function publicEdgeFor(question: DemoQuestion, subject: SubjectRef): boolean {
  if (!certifiedFamilies.has(question.family)) return false;
  return question.edges.some((e) => sameSubject(e.subject, subject) && PREMISE_SAFE_ROLES.includes(e.role));
}

function anyEdgeFor(question: DemoQuestion, subject: SubjectRef): boolean {
  return question.edges.some((e) => sameSubject(e.subject, subject));
}

function applies(app: Applicability, value: number | null): boolean {
  if (value === null || app.kind === "agnostic") return true;
  if (app.kind === "specific") return app.value === value;
  return value >= app.min && value <= app.max;
}

function facetMatch(question: DemoQuestion, query: CrossSectionQuery): boolean {
  if (query.topics.length && !query.topics.some((t) => question.topics.includes(t))) return false;
  if (query.abilitySlot && question.abilitySlot !== query.abilitySlot) return false;
  if (!applies(question.championLevel, query.championLevel)) return false;
  if (!applies(question.abilityRank, query.abilityRank)) return false;
  return true;
}

export function accessFor(collection: Collection, session: SessionContext): Access {
  const p = session.persona;
  switch (collection) {
    case "catalog":
      // Account-only is the contract's "simplest/safest first implementation".
      return p === "anonymous"
        ? { state: "requires_account", requires: "account", message: "The indexed catalog is browsable with an account. Sign in to see it." }
        : { state: "allowed", requires: "account", message: "Indexed, premise-safe catalog." };
    case "discovered":
      return p === "anonymous"
        ? { state: "requires_account", requires: "account", message: "Unlocked questions belong to an account. Sign in to see yours." }
        : { state: "allowed", requires: "account", message: "Questions this account has actually discovered in Ranked." };
    case "premium_review":
      if (p === "anonymous") return { state: "requires_account", requires: "premium", message: "Premium review needs a signed-in Premium account." };
      if (session.premiumLookup === "unavailable") return { state: "unavailable_entitlement", requires: "premium", message: "The Premium entitlement check is unreachable right now. This is not a Free upsell; retry shortly." };
      if (p === "account") return { state: "denied", requires: "premium", message: "Premium review is the existing Premium-gated missed-question review. This account is not Premium." };
      return { state: "allowed", requires: "premium", message: "Your own missed attempts, reviewable with answers inside the Premium review surface." };
    case "admin_inventory":
      return p === "owner"
        ? { state: "allowed", requires: "owner", message: "Owner-only inventory: every record, including uncertified families and answer-role edges." }
        : { state: "denied", requires: "owner", message: "Admin inventory is owner-only and never feeds public responses." };
    case "premium_exclusive":
      return { state: "not_configured", requires: "premium", message: "Reserved. No Premium-exclusive question supply exists; nothing is counted or invented." };
  }
}

function toResult(question: DemoQuestion, collection: Collection, persona: SessionContext["persona"]): QuestionResult {
  const base: QuestionResult = {
    handle: question.handle,
    prompt: question.prompt,
    family_label: FAMILIES.find((f) => f.id === question.family)?.label ?? question.family,
    topics: question.topics,
    ability_slot: question.abilitySlot,
    applicability: { champion_level: question.championLevel, ability_rank: question.abilityRank },
    discovery: { state: persona === "anonymous" ? "not_applicable" : question.discoveredByDemoUser ? "unlocked" : "locked" },
    source_status: question.sourceStatus,
  };
  if (collection === "premium_review" && question.demoAttempt) base.review = { ...question.demoAttempt };
  if (collection === "admin_inventory") {
    base.inventory = { serve_state: question.serveState, answer_role_edges: question.edges.filter((e) => e.role === "answer_subject").length };
  }
  return base;
}

function countFacets<T extends string>(items: DemoQuestion[], pick: (q: DemoQuestion) => T[]): FacetCount<T>[] {
  const counts = new Map<T, number>();
  for (const q of items) for (const key of pick(q)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, count, count_state: "exact" as const }))
    .sort((x, y) => y.count - x.count || String(x.id).localeCompare(String(y.id)));
}

function coverageFor(subjects: SubjectRef[]): Coverage {
  const seen = new Set<FamilyId>();
  for (const q of QUESTIONS) if (subjects.some((s) => anyEdgeFor(q, s))) seen.add(q.family);
  const total = seen.size;
  const certified = Array.from(seen).filter((f) => certifiedFamilies.has(f)).length;
  if (total === 0) return { state: "none", scope: "certified_premise_index", reason_codes: ["no_indexed_families"], families_certified: 0, families_total: 0 };
  const reason_codes = certified < total ? ["uncertified_families_excluded"] : [];
  return { state: certified < total ? "partial" : "full", scope: "certified_premise_index", reason_codes, families_certified: certified, families_total: total };
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

/** Synchronous core, exported for tests. */
export function searchFixtures(query: CrossSectionQuery, session: SessionContext): CrossSectionResponse {
  const rel = relationshipOf(query);
  const axes: SubjectRef[] = rel.kind === "a_only" ? [rel.a] : rel.kind === "b_only" ? [rel.b] : rel.kind === "pair" ? [rel.a, rel.b] : [];
  const b1 = rel.kind !== "none" && rel.kind !== "a_only" ? rel.b1ItemId : null;
  const b1Ref: SubjectRef | null = b1 ? { kind: "item", id: b1 } : null;
  const access = accessFor(query.collection, session);
  const coverage = coverageFor([...axes, ...(b1Ref ? [b1Ref] : [])]);

  const empty = (relation: CrossSectionResponse["relation"]): CrossSectionResponse => ({
    contract_version: "atlas_questions.v0",
    query: { a: query.a, b: query.b, b_modifier: b1 ? { item_id: b1, intent: "equipped_for_research" } : null },
    collection: query.collection,
    access,
    coverage,
    results: [],
    related_results: [],
    relation,
    facets: { topics: [], ability_slots: [] },
    page: { next_cursor: null, has_more: false },
    counts: { visible_matching: 0, count_state: access.state === "allowed" ? "exact" : "unavailable" },
    demo: true,
  });

  if (axes.length === 0 || access.state !== "allowed") return empty(axes.length === 2 ? "pair" : "single");

  const inventory = query.collection === "admin_inventory";
  const axisMatch = (q: DemoQuestion, s: SubjectRef) => (inventory ? anyEdgeFor(q, s) : publicEdgeFor(q, s));

  // Population: every record that satisfies every axis under this collection's rules.
  let population = QUESTIONS.filter((q) => axes.every((s) => axisMatch(q, s)));
  if (!inventory) population = population.filter((q) => q.serveState === "serveable");
  if (query.collection === "discovered") population = population.filter((q) => q.discoveredByDemoUser);
  if (query.collection === "premium_review") population = population.filter((q) => q.demoAttempt?.outcome === "missed");

  if (axes.length === 2 && population.length === 0 && !QUESTIONS.some((q) => axes.every((s) => anyEdgeFor(q, s)))) {
    return empty("unsupported");
  }

  const matching = population.filter((q) => facetMatch(q, query));
  const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
  const page = matching.slice(offset, offset + query.limit);
  const hasMore = offset + query.limit < matching.length;

  // B.1 related results: questions about the modifier item alone, same
  // collection rules, never merged with the axis matches.
  let related: DemoQuestion[] = [];
  if (b1Ref) {
    related = QUESTIONS.filter((q) => axisMatch(q, b1Ref) && !axes.every((s) => axisMatch(q, s)));
    if (!inventory) related = related.filter((q) => q.serveState === "serveable");
    if (query.collection === "discovered") related = related.filter((q) => q.discoveredByDemoUser);
    if (query.collection === "premium_review") related = related.filter((q) => q.demoAttempt?.outcome === "missed");
    related = related.filter((q) => facetMatch(q, query));
  }

  return {
    contract_version: "atlas_questions.v0",
    query: { a: query.a, b: query.b, b_modifier: b1 ? { item_id: b1, intent: "equipped_for_research" } : null },
    collection: query.collection,
    access,
    coverage,
    results: page.map((q) => toResult(q, query.collection, session.persona)),
    related_results: related.map((q) => toResult(q, query.collection, session.persona)),
    relation: axes.length === 2 ? "pair" : "single",
    facets: {
      topics: countFacets<Topic>(population, (q) => q.topics),
      ability_slots: countFacets<AbilitySlot>(population, (q) => (q.abilitySlot ? [q.abilitySlot] : [])),
    },
    page: { next_cursor: hasMore ? String(offset + query.limit) : null, has_more: hasMore },
    counts: { visible_matching: matching.length, count_state: "exact" },
    demo: true,
  };
}

/** Convenience for the UI header: does the pair have any certified relation at all? */
export function pairSupported(a: SubjectRef, b: SubjectRef): boolean {
  return QUESTIONS.some((q) => publicEdgeFor(q, a) && publicEdgeFor(q, b));
}

export { findSubject };
