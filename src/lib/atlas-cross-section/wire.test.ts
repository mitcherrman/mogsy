// @vitest-environment node
/**
 * ATL-CS-INT-001 — contract tests for the backend-wire → frontend-view boundary.
 *
 * The fixture is the backend's own committed example payloads (draft PR
 * League_Combat_Simulator#93 @ 5319bbf7, synthetic: counts, handles, revision
 * and timestamps are fixture values, not corpus facts). Cases the examples do
 * not contain (owner inventory, the `max` rank, the other source statuses,
 * hostile shapes) are DERIVED by cloning an example and changing one thing, and
 * are labelled as derived.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import examples from "./__fixtures__/atlasQuestionsV0Examples.json";
import { INITIAL_STATE } from "./query";
import { createServerWireAdapter } from "./serverWireAdapter";
import { DEFAULT_TOPIC_CATALOG, type Collection, type CrossSectionQuery } from "./types";
import { AtlasWireError, WIRE_SEARCH_PARAMS, WIRE_SEARCH_PATH, type WireHttpResponse, type WireRequest } from "./wire";
import { encodeSearchRequest, requestSearch } from "./wireRequest";
import { mapCoverageCatalog, mapWireResponse } from "./wireResponse";

// Wire bodies are deliberately untyped here: the tests mutate them into hostile shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Example = { request: string; status: number; body: Record<string, any> };
const all = examples as unknown as Record<string, Example | string>;

/**
 * A deep copy, so one case never mutates another. The backend examples were
 * requested WITHOUT `patch`, so their echo says `patch: null`; this client
 * always sends `patch=current` and the server echoes it, so the echo is set to
 * what a real answer to the encoded request carries (DERIVED, one field).
 */
function ex(name: string): Example {
  const found = all[name];
  if (!found || typeof found === "string") throw new Error(`no example ${name}`);
  const copy = structuredClone(found) as Example;
  if (copy.body.query) copy.body.query.filters.patch = "current";
  return copy;
}

function http(e: Example): WireHttpResponse {
  return { status: e.status, body: e.body };
}

function q(partial: Partial<CrossSectionQuery>): CrossSectionQuery {
  return { ...INITIAL_STATE.query, ...partial };
}

const ahri = { kind: "champion", id: "Ahri" } as const;
const syndra = { kind: "champion", id: "Syndra" } as const;

function throwsWire(fn: () => unknown, kind: string, pathPart?: string): AtlasWireError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AtlasWireError);
    expect((error as AtlasWireError).kind).toBe(kind);
    if (pathPart) expect((error as AtlasWireError).path).toContain(pathPart);
    return error as AtlasWireError;
  }
  throw new Error(`expected a ${kind} AtlasWireError, nothing was thrown`);
}

/* ------------------------------------------------------------------------- */
/* Request encoder                                                           */
/* ------------------------------------------------------------------------- */

describe("request encoder", () => {
  it("encodes A, the collection, patch=current and the limit — nothing else", () => {
    const req = encodeSearchRequest(q({ a: ahri, collection: "discovered", limit: 2 }));
    expect(req).toEqual({
      method: "GET",
      path: "/api/atlas/questions/search",
      params: [
        ["collection", "discovered"],
        ["a_kind", "champion"],
        ["a_id", "Ahri"],
        ["patch", "current"],
        ["limit", "2"],
      ],
    });
    expect(requestSearch(req)).toBe("collection=discovered&a_kind=champion&a_id=Ahri&patch=current&limit=2");
  });

  it("matches the parameters of every committed backend example request", () => {
    for (const [name, value] of Object.entries(all)) {
      if (typeof value === "string" || !value.request.includes("/search?")) continue;
      const wire = new URLSearchParams(value.request.split("?")[1]);
      const kind = (k: string) => wire.get(k);
      const query = q({
        collection: kind("collection") as Collection,
        a: kind("a_kind") && kind("a_id") ? { kind: kind("a_kind") as "champion" | "item", id: kind("a_id")! } : null,
        b: kind("b_kind") && kind("b_id") ? { kind: kind("b_kind") as "champion" | "item", id: kind("b_id")! } : null,
        b1ItemId: kind("b1_item_id"),
        topics: wire.getAll("topic"),
        limit: Number(kind("limit") ?? 20),
      });
      if (name === "invalid item id") {
        // The backend 400s on a non-numeric item id; the encoder refuses before the network.
        throwsWire(() => encodeSearchRequest(query), "encode", "a_id");
        continue;
      }
      const ours = new URLSearchParams(requestSearch(encodeSearchRequest(query)));
      ours.delete("patch");
      if (!wire.has("limit")) ours.delete("limit");
      expect([...ours.entries()].sort()).toEqual([...wire.entries()].sort());
    }
  });

  it("repeats topics (OR), sends slot / rank / level, B.1 and an opaque cursor", () => {
    const req = encodeSearchRequest(q({ a: ahri, b: syndra, b1ItemId: "3089", collection: "catalog", topics: ["cooldown", "ability_cost"], abilitySlot: "Q", abilityRank: "max", championLevel: 9, cursor: "eyJvIjoyLCJmIjoiODVhODAyOTI5ZDA2NGNkMiJ9" }));
    const search = new URLSearchParams(requestSearch(req));
    expect(search.getAll("topic")).toEqual(["cooldown", "ability_cost"]);
    expect(search.get("b1_item_id")).toBe("3089");
    expect(search.get("ability_slot")).toBe("Q");
    expect(search.get("ability_rank")).toBe("max");
    expect(search.get("champion_level")).toBe("9");
    expect(search.get("cursor")).toBe("eyJvIjoyLCJmIjoiODVhODAyOTI5ZDA2NGNkMiJ9");
    for (const name of search.keys()) expect(WIRE_SEARCH_PARAMS).toContain(name);
  });

  it("only ever targets the documented search route and sends no persona or identity", () => {
    const req = encodeSearchRequest(q({ a: ahri }));
    expect(req.path).toBe(WIRE_SEARCH_PATH);
    const names = req.params.map(([k]) => k);
    for (const forbidden of ["persona", "user", "user_id", "as", "preview_as", "token", "admin"]) expect(names).not.toContain(forbidden);
  });

  it("fails closed before the network on anything the server would reject or the contract omits", () => {
    throwsWire(() => encodeSearchRequest(q({ a: ahri, b: ahri })), "encode", "b_id");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, b1ItemId: "3089" })), "encode", "b1_item_id");
    throwsWire(() => encodeSearchRequest(q({ b: { kind: "item", id: "3089" }, b1ItemId: "3157" })), "encode", "b1_item_id");
    throwsWire(() => encodeSearchRequest(q({ a: { kind: "item", id: "abc" } })), "encode", "a_id");
    throwsWire(() => encodeSearchRequest(q({ a: { kind: "champion", id: "Ahri<script>" } })), "encode", "a_id");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, topics: ["damage"] })), "encode", "topic");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, topics: ["range"] })), "encode", "topic");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, topics: ["scaling"] })), "encode", "topic");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, topics: ["cost"] })), "encode", "topic");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, abilityRank: 7 })), "encode", "ability_rank");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, abilityRank: 0 })), "encode", "ability_rank");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, championLevel: 19 })), "encode", "champion_level");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, limit: 51 })), "encode", "limit");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, cursor: "../etc/passwd" })), "encode", "cursor");
    throwsWire(() => encodeSearchRequest({ ...q({ a: ahri }), patch: "2026.20" as "current" }), "encode", "patch");
    throwsWire(() => encodeSearchRequest(q({ a: ahri, collection: "everything" as Collection })), "encode", "collection");
  });

  it("accepts ranks 1-6 and max, and a custom topic catalog", () => {
    for (const rank of [1, 2, 3, 4, 5, 6, "max"] as const) expect(requestSearch(encodeSearchRequest(q({ a: ahri, abilityRank: rank })))).toContain(`ability_rank=${rank}`);
    expect(() => encodeSearchRequest(q({ a: ahri, topics: ["future_topic"] }), { topics: [{ id: "future_topic", label: "Future" }] })).not.toThrow();
  });
});

/* ------------------------------------------------------------------------- */
/* Response mapper — representative backend examples                         */
/* ------------------------------------------------------------------------- */

describe("response mapper: discovered Ahri", () => {
  const e = ex("A=Ahri (discovered, user U1)");
  const mapped = mapWireResponse(http(e), { query: q({ a: ahri, collection: "discovered", limit: 2 }) });

  it("maps access, coverage and counts without ever claiming full coverage", () => {
    expect(mapped.demo).toBe(false);
    expect(mapped.access).toMatchObject({ state: "allowed", requires: "account", reason: null, retryable: false });
    expect(mapped.coverage?.state).toBe("partial");
    expect(mapped.coverage?.index_revision).toBe("4b7bd8bb643dd32110d2");
    expect(mapped.coverage?.not_indexed_sources).toEqual(["ranked_accepted_bank", "mastery_curriculum", "runtime_casual_families", "pro_play_on_demand"]);
    expect(mapped.coverage?.reason_codes).toContain("discoveries_outside_index");
    expect(mapped.coverage?.corpus_label).toMatch(/NOT in this corpus/);
    expect(mapped.counts).toMatchObject({ visible_matching: 3, count_state: "exact", unit: "question", discoveries_total: 10 });
    expect(mapped.counts.discoveries_outside_index).toEqual({ family_uncategorized: 1, "namespace_not_indexed:mastery": 1, "namespace_not_indexed:ranked": 1, ref_not_in_index: 1 });
    expect(mapped.relationship).toBeNull();
    expect(mapped.related).toBeNull();
    expect(mapped.error).toBeNull();
  });

  it("maps results: family object, applicability states, user-scoped discovery, no review", () => {
    expect(mapped.results).toHaveLength(2);
    const r = mapped.results[1];
    expect(r.handle).toMatch(/^aqh_/);
    expect(r.family).toEqual({ id: "ability_cooldown_rank", label: "Ability cooldown at a stated rank" });
    expect(r.topics).toEqual(["cooldown"]);
    expect(r.ability_slot).toBe("Q");
    expect(r.applicability.ability_rank).toEqual({ state: "specific", value: "1" });
    expect(r.applicability.champion_level).toEqual({ state: "not_stated", value: null });
    expect(r.discovery).toMatchObject({ state: "unlocked", times_answered: 2, times_correct: 1 });
    expect(r.review).toBeNull();
    expect(r.admin).toBeNull();
    expect(r.source_status).toBe("current");
    expect(r.subjects.map((s) => s.role)).toEqual(["premise_subject", "premise_subject"]);
    expect(r.subjects[0]).toEqual({ kind: "ability", id: "Ahri:Q", role: "premise_subject" });
  });

  it("keeps facets (including ability_slot), labels from the server, and cursor paging", () => {
    expect(mapped.facets.topics[0]).toEqual({ id: "cooldown", count: 3, count_state: "exact", label: "Cooldown", selected: false });
    expect(mapped.facets.ability_slot.map((f) => f.id).sort()).toEqual(["E", "Q", "R"]);
    expect(mapped.facets.ability_rank.map((f) => f.id)).toEqual(["1", "2"]);
    expect(mapped.facets.family[0].label).toBeTruthy();
    expect(mapped.facets.difficulty[0].id).toBe(2);
    expect(mapped.facet_applicability.champion_level).toEqual({ not_stated: 3 });
    expect(mapped.page).toMatchObject({ limit: 2, offset: 0, has_more: true });
    expect(mapped.page.next_cursor).toBe(e.body.page.next_cursor);
    expect(mapped.query?.a).toEqual({ kind: "champion", id: "Ahri", label: "Ahri" });
    expect(mapped.query?.filters.patch).toBe("current");
  });

  it("rejects a response that answers a different request than was sent", () => {
    throwsWire(() => mapWireResponse(http(ex("A=Ahri (discovered, user U1)")), { query: q({ a: syndra, collection: "discovered", limit: 2 }) }), "inconsistent", "query.a");
    throwsWire(() => mapWireResponse(http(ex("A=Ahri (discovered, user U1)")), { query: q({ a: ahri, collection: "catalog", limit: 2 }) }), "inconsistent", "collection");
    throwsWire(() => mapWireResponse(http(ex("A=Ahri (discovered, user U1)")), { query: q({ a: ahri, collection: "discovered", topics: ["mana"], limit: 2 }) }), "inconsistent", "topic");
  });
});

describe("response mapper: topic filter echo", () => {
  it("round-trips a topic filter and its selected facet", () => {
    const e = ex("A=Ahri topic=mana (discovered, user U2)");
    const echoTopics = e.body.query.filters.topic as string[];
    const mapped = mapWireResponse(http(e), { query: q({ a: ahri, collection: "discovered", topics: echoTopics }) });
    expect(mapped.query?.filters.topic).toEqual(["mana"]);
    expect(mapped.facets.topics.some((t) => t.selected && t.id === "mana")).toBe(true);
  });
});

describe("response mapper: Ahri + Syndra relation", () => {
  it("a supported relation names its certified families", () => {
    const mapped = mapWireResponse(http(ex("A=Ahri B=Syndra (discovered)")), { query: q({ a: ahri, b: syndra, collection: "discovered" }) });
    expect(mapped.relationship).toEqual({ state: "supported", supporting_families: ["ability_cooldown_compare"], reason: null, b_modifier: null });
    expect(mapped.query?.b).toEqual({ kind: "champion", id: "Syndra", label: "Syndra" });
    expect(mapped.results.length).toBeGreaterThan(0);
  });

  it("A + B alone is not evidence: an unsupported relation keeps its reason and has no matches", () => {
    const e = ex("A=Ahri B=Syndra (discovered)");
    e.body.relationship = { state: "unsupported", supporting_families: [], reason: "no_certified_family_relates_these_subjects_in_collection" };
    e.body.results = [];
    e.body.counts = { ...e.body.counts, visible_matching: 0 };
    e.body.page = { ...e.body.page, has_more: false, next_cursor: null };
    const mapped = mapWireResponse(http(e), { query: q({ a: ahri, b: syndra, collection: "discovered" }) });
    expect(mapped.relationship).toMatchObject({ state: "unsupported", reason: "no_certified_family_relates_these_subjects_in_collection", supporting_families: [] });
    expect(mapped.results).toEqual([]);
  });

  it("an unsupported relation that still returns matches is a contract violation", () => {
    const e = ex("A=Ahri B=Syndra (discovered)");
    e.body.relationship = { state: "unsupported", supporting_families: [], reason: "no_certified_family_relates_these_subjects_in_collection" };
    throwsWire(() => mapWireResponse(http(e)), "inconsistent", "relationship");
  });

  it("a two-axis query must report its relation", () => {
    const e = ex("A=Ahri B=Syndra (discovered)");
    e.body.relationship = null;
    throwsWire(() => mapWireResponse(http(e)), "inconsistent", "relationship");
  });
});

describe("response mapper: B.1 with a separate related panel", () => {
  const query = q({ a: ahri, b: syndra, b1ItemId: "3089", collection: "catalog" });
  const mapped = mapWireResponse(http(ex("A=Ahri B=Syndra B.1=3089 (catalog, flag on)")), { query });

  it("keeps B.1 results out of the intersection", () => {
    expect(mapped.results).toEqual([]);
    expect(mapped.counts).toMatchObject({ visible_matching: 0, count_state: "exact", unit: "prompt_stem" });
    expect(mapped.related).toMatchObject({ kind: "b_modifier", relationship: "item_is_premise_subject", count: 1, count_state: "exact", has_more: false });
    expect(mapped.related?.subject).toEqual({ kind: "item", id: "3089", label: "Rabadon's Deathcap" });
    expect(mapped.related?.results[0].prompt).toBe("How much does Rabadon's Deathcap cost?");
    expect(mapped.related?.results[0].topics).toEqual(["gold"]);
  });

  it("echoes the modifier as attached to B and reports B.1 support separately", () => {
    expect(mapped.query?.b_modifier).toEqual({ kind: "item", id: "3089", label: "Rabadon's Deathcap", attached_to: "b", intent: "equipped_for_research" });
    expect(mapped.relationship).toMatchObject({ state: "unsupported", supporting_families: [], b_modifier: { state: "unsupported", supporting_families: [] } });
    expect(mapped.relationship?.reason).toBeTruthy();
  });

  it("catalog discovery is null (not reported), never locked", () => {
    expect(mapped.related?.results.every((r) => r.discovery === null)).toBe(true);
  });

  it("B alone + B.1 maps the same panel", () => {
    const m = mapWireResponse(http(ex("B=Syndra B.1=3089 (catalog, flag on)")), { query: q({ b: syndra, b1ItemId: "3089", collection: "catalog" }) });
    expect(m.related?.subject.id).toBe("3089");
    expect(m.query?.a).toBeNull();
  });

  it("the panel and the B.1 echo must appear together and name the same item", () => {
    const noEcho = ex("A=Ahri B=Syndra B.1=3089 (catalog, flag on)");
    noEcho.body.query.b_modifier = null;
    throwsWire(() => mapWireResponse(http(noEcho)), "inconsistent", "related");
    const other = ex("A=Ahri B=Syndra B.1=3089 (catalog, flag on)");
    other.body.related.b_modifier.subject.id = "3157";
    throwsWire(() => mapWireResponse(http(other)), "inconsistent", "related.b_modifier.subject");
    throwsWire(() => mapWireResponse(http(ex("A=Ahri B=Syndra B.1=3089 (catalog, flag on)")), { query: q({ a: ahri, b: syndra, b1ItemId: "3157", collection: "catalog" }) }), "inconsistent", "b_modifier");
  });
});

describe("response mapper: Premium review and access states", () => {
  it("maps the viewer's distinct missed questions without answers", () => {
    const m = mapWireResponse(http(ex("premium_review (Premium)")), { query: q({ a: ahri, collection: "premium_review" }) });
    expect(m.access).toMatchObject({ state: "allowed", requires: "premium" });
    expect(m.results[0].review).toEqual({ missed_attempts: 3, last_missed_at: "2026-10-22T00:00:00" });
    expect(m.results[0].discovery).toBeNull();
    expect(m.counts).toMatchObject({ visible_matching: 2, missed_attempts_indexed: 5 });
    expect(m.counts.missed_attempts_outside_index).toEqual({ family_uncategorized: 1 });
  });

  it("Free is a 200 denial: no data, and the count is unavailable rather than zero", () => {
    const m = mapWireResponse(http(ex("premium_review (Free) denied")), { query: q({ collection: "premium_review" }) });
    expect(m.access).toMatchObject({ state: "denied", requires: "premium", reason: "premium_required", retryable: false });
    expect(m.results).toEqual([]);
    expect(m.coverage).toBeNull();
    expect(m.counts).toMatchObject({ visible_matching: null, count_state: "unavailable" });
    expect(m.error).toBeNull();
  });

  it("an entitlement outage (503) is neither a denial nor an upsell nor zero", () => {
    const m = mapWireResponse(http(ex("premium_review (lookup error)")), { query: q({ collection: "premium_review" }) });
    expect(m.access).toMatchObject({ state: "unavailable_entitlement", requires: "premium", retryable: true });
    expect(m.access.state).not.toBe("denied");
    expect(m.error).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE", http_status: 503 });
    expect(m.counts.visible_matching).toBeNull();
    expect(m.access.message).toMatch(/not a denial/i);
  });

  it("premium_exclusive is reserved: not_configured, nothing counted", () => {
    const m = mapWireResponse(http(ex("premium_exclusive")), { query: q({ collection: "premium_exclusive" }) });
    expect(m.access).toMatchObject({ state: "not_configured", requires: "premium_exclusive_entitlement", reason: "no_premium_exclusive_question_supply_exists" });
    expect(m.results).toEqual([]);
    expect(m.counts.visible_matching).toBeNull();
  });

  it("the catalog is off by default: not_configured, even for an account", () => {
    const m = mapWireResponse(http(ex("catalog (default)")), { query: q({ collection: "catalog" }) });
    expect(m.access).toMatchObject({ state: "not_configured", requires: "account", reason: "catalog_exposure_policy_pending_owner_review" });
    expect(m.counts).toMatchObject({ visible_matching: null, count_state: "unavailable" });
  });

  it("HTTP 401 and 403 ACCOUNT_REQUIRED become the frontend requires_account", () => {
    const unauth = mapWireResponse(http(ex("discovered unauthenticated")), { query: q({ collection: "discovered" }) });
    expect(unauth.access).toMatchObject({ state: "requires_account", reason: "unauthenticated" });
    expect(unauth.error).toMatchObject({ code: "AUTH_REQUIRED", http_status: 401 });
    const anon = mapWireResponse(http(ex("discovered anonymous")), { query: q({ collection: "discovered" }) });
    expect(anon.access).toMatchObject({ state: "requires_account", reason: "anonymous_session" });
    expect(anon.error).toMatchObject({ code: "ACCOUNT_REQUIRED", http_status: 403 });
    expect(anon.access.message).toMatch(/guest/);
  });

  it("DERIVED: 403 OWNER_REQUIRED stays denied (not a sign-in prompt)", () => {
    const e = ex("discovered anonymous");
    e.body.collection = "admin_inventory";
    e.body.access = { state: "denied", requires: "owner", reason: null, retryable: false };
    e.body.error = { code: "OWNER_REQUIRED", message: "owner authorization required", field: null };
    const m = mapWireResponse(http(e), { query: q({ collection: "admin_inventory" }) });
    expect(m.access).toMatchObject({ state: "denied", requires: "owner" });
  });

  it("DERIVED: 503 SOURCE_UNAVAILABLE is a failed request after access was allowed", () => {
    const e = ex("invalid item id");
    e.status = 503;
    e.body.error = { code: "SOURCE_UNAVAILABLE", message: "the collection's source table is unavailable", field: null };
    const m = mapWireResponse(http(e), { query: q({ collection: "discovered" }) });
    expect(m.access.state).toBe("allowed");
    expect(m.error).toMatchObject({ code: "SOURCE_UNAVAILABLE", http_status: 503 });
    expect(m.counts.visible_matching).toBeNull();
  });

  it("400 invalid subject: the rejection is an error with its field, not an empty result", () => {
    const m = mapWireResponse(http(ex("invalid item id")), { query: q({ collection: "discovered" }) });
    expect(m.error).toEqual({ code: "INVALID_SUBJECT_ID", message: "item id must be a numeric canonical item id", field: "a_id", http_status: 400 });
    expect(m.results).toEqual([]);
    expect(m.counts.visible_matching).toBeNull();
  });

  it("DERIVED: an index that cannot answer reports coverage unavailable and an unavailable count", () => {
    const e = ex("A=Ahri (discovered, user U1)");
    e.body.query = null;
    e.body.coverage = { state: "unavailable", scope: "certified_premise_index", corpus: null, index_revision: null, indexed_at: null, rules_version: "atl-cs-rules.1", reason_codes: ["index_not_built"], not_indexed_sources: [] };
    for (const k of ["relationship", "facets", "facet_applicability", "page", "related"]) e.body[k] = null;
    e.body.results = [];
    e.body.counts = { visible_matching: null, count_state: "unavailable" };
    const m = mapWireResponse(http(e));
    expect(m.coverage).toMatchObject({ state: "unavailable", reason_codes: ["index_not_built"] });
    expect(m.counts).toMatchObject({ visible_matching: null, count_state: "unavailable" });
  });

  it("HTTP 429 is a rate limit with a retry hint, never a payload", () => {
    const err = throwsWire(() => mapWireResponse({ status: 429, body: { detail: { code: "ATLAS_RATE_LIMITED", message: "too many requests; slow down", retry_after_seconds: 12 } } }), "rate_limited");
    expect(err.retryAfterSeconds).toBe(12);
    expect(throwsWire(() => mapWireResponse({ status: 429, body: null, retryAfter: "30" }), "rate_limited").retryAfterSeconds).toBe(30);
  });

  it("any other HTTP status fails closed", () => {
    for (const status of [201, 204, 301, 404, 500, 502, 504]) throwsWire(() => mapWireResponse({ status, body: ex("catalog (default)").body }), "unexpected_status");
  });
});

/* ------------------------------------------------------------------------- */
/* Fail-closed: unknown states                                               */
/* ------------------------------------------------------------------------- */

describe("unknown states fail closed", () => {
  const withAccess = (state: string, mutate?: (e: Example) => void) => {
    const e = ex("catalog (default)");
    e.body.access.state = state;
    mutate?.(e);
    return () => mapWireResponse(http(e));
  };

  it("an unknown access state is rejected, including the frontend-only requires_account", () => {
    throwsWire(withAccess("maybe"), "unknown_state", "access.state");
    throwsWire(withAccess("requires_account"), "unknown_state", "access.state");
    throwsWire(withAccess("allowed_with_limits"), "unknown_state", "access.state");
    throwsWire(withAccess(""), "unknown_state", "access.state");
  });

  it("an unknown requirement, or one that belongs to another collection, is rejected", () => {
    const e = ex("catalog (default)");
    e.body.access.requires = "friends";
    throwsWire(() => mapWireResponse(http(e)), "unknown_state", "access.requires");
    const f = ex("catalog (default)");
    f.body.access.requires = "premium";
    throwsWire(() => mapWireResponse(http(f)), "inconsistent", "access.requires");
  });

  it("access states must agree with the HTTP status", () => {
    const unavailableOn200 = ex("premium_review (lookup error)");
    unavailableOn200.status = 200;
    unavailableOn200.body.error = null;
    throwsWire(() => mapWireResponse(http(unavailableOn200)), "inconsistent");
    const allowedEntitlementOutage = ex("premium_review (lookup error)");
    allowedEntitlementOutage.body.access.state = "allowed";
    throwsWire(() => mapWireResponse(http(allowedEntitlementOutage)), "inconsistent");
    const notConfigured503 = ex("catalog (default)");
    notConfigured503.status = 503;
    notConfigured503.body.error = { code: "SOURCE_UNAVAILABLE", message: "x", field: null };
    throwsWire(() => mapWireResponse(http(notConfigured503)), "inconsistent");
    const unknown503 = ex("premium_review (lookup error)");
    unknown503.body.error.code = "SOMETHING_ELSE";
    throwsWire(() => mapWireResponse(http(unknown503)), "unknown_state", "error.code");
    const denied401WithoutCode = ex("discovered unauthenticated");
    denied401WithoutCode.body.error.code = "ACCOUNT_REQUIRED";
    throwsWire(() => mapWireResponse(http(denied401WithoutCode)), "inconsistent");
    const unknown403 = ex("discovered anonymous");
    unknown403.body.error.code = "BANNED";
    throwsWire(() => mapWireResponse(http(unknown403)), "unknown_state", "error.code");
  });

  it("coverage may only be partial or unavailable; a full-coverage claim is refused", () => {
    for (const claim of ["full", "complete", "all", "none", ""]) {
      const e = ex("A=Ahri (discovered, user U1)");
      e.body.coverage.state = claim;
      throwsWire(() => mapWireResponse(http(e)), "unknown_state", "coverage.state");
    }
    const noRevision = ex("A=Ahri (discovered, user U1)");
    noRevision.body.coverage.index_revision = null;
    throwsWire(() => mapWireResponse(http(noRevision)), "inconsistent", "coverage");
  });

  it("source status is current|inactive|withheld|unavailable; 'frozen' is not a server state", () => {
    for (const status of ["current", "inactive", "withheld", "unavailable"] as const) {
      const e = ex("A=Ahri (discovered, user U1)");
      e.body.results[0].source_status = status;
      expect(mapWireResponse(http(e)).results[0].source_status).toBe(status);
    }
    for (const bad of ["frozen", "retired", "hold", "", null]) {
      const e = ex("A=Ahri (discovered, user U1)");
      e.body.results[0].source_status = bad;
      throwsWire(() => mapWireResponse(http(e)), bad === null ? "unknown_state" : "unknown_state", "source_status");
    }
  });

  it("an unknown contract version is refused", () => {
    for (const version of ["atlas_questions.v1", "atlas_questions.v0.1", "", null, 0]) {
      const e = ex("catalog (default)");
      e.body.contract_version = version;
      throwsWire(() => mapWireResponse(http(e)), "contract_mismatch");
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Applicability, max rank                                                   */
/* ------------------------------------------------------------------------- */

describe("applicability", () => {
  const rankOf = (e: Example, value: unknown) => {
    e.body.results[0].applicability.ability_rank = value;
    return () => mapWireResponse(http(e));
  };

  it("DERIVED: keeps the symbolic max as an interval and never turns it into a number", () => {
    const e = ex("A=Ahri (discovered, user U1)");
    e.body.results[0].applicability.ability_rank = { state: "interval", value: "max" };
    e.body.facets.ability_rank = [{ id: "max", count: 1, count_state: "exact", selected: true }];
    e.body.query.filters.ability_rank = ["max"];
    const m = mapWireResponse(http(e), { query: q({ a: ahri, collection: "discovered", limit: 2, abilityRank: "max" }) });
    expect(m.results[0].applicability.ability_rank).toEqual({ state: "interval", value: "max" });
    expect(m.facets.ability_rank[0]).toMatchObject({ id: "max", selected: true });
  });

  it("DERIVED: ranks 1-6 are accepted (Jayce / Udyr have six) and 7 is not", () => {
    for (const r of ["1", "2", "3", "4", "5", "6"]) {
      const e = ex("A=Ahri (discovered, user U1)");
      expect(mapWireResponse(http(e)).results.length).toBeGreaterThan(0);
      expect(rankOf(e, { state: "specific", value: r })()).toBeTruthy();
    }
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "specific", value: "7" }), "malformed", "ability_rank.value");
  });

  it("DERIVED: invents no numeric bound — an interval is max only, and unstated states carry no value", () => {
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "interval", value: "5" }), "malformed", "ability_rank.value");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "interval", value: 5 }), "malformed", "ability_rank.value");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "interval", value: null }), "malformed", "ability_rank.value");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "not_stated", value: "3" }), "inconsistent", "ability_rank.value");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "not_applicable", value: 3 }), "inconsistent", "ability_rank.value");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "specific", value: null }), "malformed", "ability_rank.value");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { state: "approximately", value: "3" }), "unknown_state", "ability_rank.state");
    throwsWire(rankOf(ex("A=Ahri (discovered, user U1)"), { kind: "specific", value: 3 }), "malformed", "ability_rank");
    const level = ex("A=Ahri (discovered, user U1)");
    level.body.results[0].applicability.champion_level = { state: "interval", value: 11 };
    throwsWire(() => mapWireResponse(http(level)), "inconsistent", "champion_level.state");
    const level2 = ex("A=Ahri (discovered, user U1)");
    level2.body.results[0].applicability.champion_level = { state: "specific", value: 19 };
    throwsWire(() => mapWireResponse(http(level2)), "malformed", "champion_level.value");
  });

  it("keeps all four states distinct", () => {
    const e = ex("A=Ahri (discovered, user U1)");
    const states = [{ state: "specific", value: "2" }, { state: "interval", value: "max" }, { state: "not_stated", value: null }];
    const shown = states.map((state) => {
      const copy = ex("A=Ahri (discovered, user U1)");
      copy.body.results[0].applicability.ability_rank = state;
      return mapWireResponse(http(copy)).results[0].applicability.ability_rank.state;
    });
    expect(new Set(shown).size).toBe(3);
    const na = ex("B=Syndra B.1=3089 (catalog, flag on)");
    expect(mapWireResponse(http(na)).related?.results[0].applicability.ability_rank.state).toBe("not_applicable");
    expect(e.body.results.length).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */
/* Discovery, review, admin                                                  */
/* ------------------------------------------------------------------------- */

describe("discovery, review and the owner collection", () => {
  it("discovery is user-scoped: absent outside 'discovered', required inside it", () => {
    const leak = ex("premium_review (Premium)");
    leak.body.results[0].discovery = { state: "unlocked", times_answered: 1, times_correct: 0, first_seen_at: null, last_seen_at: null };
    throwsWire(() => mapWireResponse(http(leak)), "inconsistent", "discovery");
    const missing = ex("A=Ahri (discovered, user U1)");
    missing.body.results[0].discovery = null;
    throwsWire(() => mapWireResponse(http(missing)), "inconsistent", "discovery");
    const locked = ex("A=Ahri (discovered, user U1)");
    locked.body.results[0].discovery = { state: "locked" };
    throwsWire(() => mapWireResponse(http(locked)), "malformed", "discovery");
  });

  it("review is a distinct-question aggregation, not an attempt record", () => {
    const attempt = ex("premium_review (Premium)");
    attempt.body.results[0].review = { attempted_at: "2026-10-22T00:00:00", outcome: "missed" };
    throwsWire(() => mapWireResponse(http(attempt)), "malformed", "review");
    const zero = ex("premium_review (Premium)");
    zero.body.results[0].review.missed_attempts = 0;
    throwsWire(() => mapWireResponse(http(zero)), "malformed", "missed_attempts");
    const outside = ex("A=Ahri (discovered, user U1)");
    outside.body.results[0].review = { missed_attempts: 1, last_missed_at: null };
    throwsWire(() => mapWireResponse(http(outside)), "inconsistent", "review");
    const absent = ex("premium_review (Premium)");
    absent.body.results[0].review = null;
    throwsWire(() => mapWireResponse(http(absent)), "inconsistent", "review");
  });

  /** DERIVED: the backend examples contain no owner response, so clone Ahri and make it one. */
  function ownerResponse(): Example {
    const e = ex("A=Ahri (discovered, user U1)");
    e.body.collection = "admin_inventory";
    e.body.access = { state: "allowed", requires: "owner", reason: null, retryable: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e.body.results.forEach((r: Record<string, any>, i: number) => {
      r.discovery = null;
      r.admin = { question_key: `SECRET-KEY-${i}:answer-bearing`, index_state: "certified", catalog_exposure: i === 0 };
    });
    return e;
  }

  it("DERIVED: admin facts are mapped and the raw question_key is discarded", () => {
    const m = mapWireResponse(http(ownerResponse()), { query: q({ a: ahri, collection: "admin_inventory", limit: 2 }) });
    expect(m.results.map((r) => r.admin)).toEqual([
      { index_state: "certified", catalog_exposure: true },
      { index_state: "certified", catalog_exposure: false },
    ]);
    const text = JSON.stringify(m);
    expect(text).not.toContain("SECRET-KEY");
    expect(text).not.toContain("question_key");
  });

  it("DERIVED: admin blocks are refused anywhere but the owner collection", () => {
    const e = ex("A=Ahri (discovered, user U1)");
    e.body.results[0].admin = { question_key: "SECRET-KEY-0", index_state: "certified", catalog_exposure: true };
    const err = throwsWire(() => mapWireResponse(http(e)), "malformed", "admin");
    expect(err.message).not.toContain("SECRET-KEY");
    const missing = ownerResponse();
    delete missing.body.results[0].admin;
    throwsWire(() => mapWireResponse(http(missing)), "malformed", "admin");
    const bad = ownerResponse();
    bad.body.results[0].admin.index_state = "freeform";
    throwsWire(() => mapWireResponse(http(bad)), "unknown_state", "index_state");
  });

  it("DERIVED: a raw question_key outside an admin block is an answer-bearing leak", () => {
    const e = ex("A=Ahri (discovered, user U1)");
    e.body.results[0].question_key = "ability_cooldown_rank:Ahri:Q:1:answer";
    throwsWire(() => mapWireResponse(http(e)), "forbidden_key", "results[0].question_key");
    const nested = ownerResponse();
    nested.body.results[0].admin.nested = { question_key: "x" };
    throwsWire(() => mapWireResponse(http(nested)), "forbidden_key");
  });
});

/* ------------------------------------------------------------------------- */
/* Hostile and malformed bodies                                              */
/* ------------------------------------------------------------------------- */

describe("malformed and answer-bearing responses are rejected whole", () => {
  const SECRET = "SECRET-ANSWER-VALUE";

  it("rejects every answer-bearing key wherever it appears, without echoing its value", () => {
    const keys = ["answer", "answers", "correct_answer", "correct_answer_json", "correct", "correct_option", "choices", "choices_json", "options", "explanation", "solution", "rationale", "metadata_json", "question_text", "question_id", "source_row_id", "stem_key"];
    const places: Array<(e: Example, key: string) => void> = [
      (e, key) => (e.body[key] = SECRET),
      (e, key) => (e.body.results[0][key] = SECRET),
      (e, key) => (e.body.coverage[key] = SECRET),
      (e, key) => (e.body.facets.topics[0][key] = SECRET),
      (e, key) => (e.body.results[0].applicability[key] = SECRET),
      (e, key) => (e.body.results[0].subjects[0][key] = SECRET),
      (e, key) => (e.body.counts[key] = { nested: SECRET }),
    ];
    for (const key of keys) {
      for (const place of places) {
        const e = ex("A=Ahri (discovered, user U1)");
        place(e, key);
        const err = throwsWire(() => mapWireResponse(http(e)), "forbidden_key");
        expect(err.message).not.toContain(SECRET);
        expect(err.path).toContain(key);
      }
    }
  });

  it("does not mistake legitimate names for answers (times_correct, source_status)", () => {
    expect(() => mapWireResponse(http(ex("A=Ahri (discovered, user U1)")))).not.toThrow();
  });

  it("rejects an answer-bearing key inside the related panel and an error body", () => {
    const related = ex("A=Ahri B=Syndra B.1=3089 (catalog, flag on)");
    related.body.related.b_modifier.results[0].explanation = SECRET;
    throwsWire(() => mapWireResponse(http(related)), "forbidden_key", "related");
    const err = ex("premium_review (lookup error)");
    err.body.error.correct_answer = SECRET;
    throwsWire(() => mapWireResponse(http(err)), "forbidden_key", "error");
  });

  it("an answer role can never appear as a result subject", () => {
    for (const role of ["answer_subject", "unverified", "winner"]) {
      const e = ex("A=Ahri (discovered, user U1)");
      e.body.results[0].subjects[0].role = role;
      const err = throwsWire(() => mapWireResponse(http(e)), "unknown_state", "subjects[0].role");
      expect(err.message).not.toContain(role);
    }
  });

  it("rejects unexpected keys instead of ignoring them", () => {
    const places: Array<(e: Example) => void> = [
      (e) => (e.body.debug = true),
      (e) => (e.body.results[0].score = 0.9),
      (e) => (e.body.access.plan = "pro"),
      (e) => (e.body.coverage.completeness = "full"),
      (e) => (e.body.page.total = 3),
      (e) => (e.body.facets.region = []),
      (e) => (e.body.query.filters.persona = "owner"),
      (e) => (e.body.counts.hidden = 0),
    ];
    for (const place of places) {
      const e = ex("A=Ahri (discovered, user U1)");
      place(e);
      throwsWire(() => mapWireResponse(http(e)), "malformed");
    }
  });

  it("rejects missing required keys", () => {
    for (const key of ["contract_version", "query", "collection", "access", "coverage", "relationship", "results", "facets", "facet_applicability", "page", "counts", "related", "error"]) {
      const e = ex("A=Ahri (discovered, user U1)");
      delete e.body[key];
      throwsWire(() => mapWireResponse(http(e)), "malformed");
    }
    for (const key of ["handle", "prompt", "family", "topics", "applicability", "source_status", "discovery", "review", "subjects", "modes"]) {
      const e = ex("A=Ahri (discovered, user U1)");
      delete e.body.results[0][key];
      throwsWire(() => mapWireResponse(http(e)), "malformed", key);
    }
  });

  it("rejects non-object and wrongly typed bodies", () => {
    for (const body of [null, undefined, "ok", 7, [], [ex("catalog (default)").body], true]) throwsWire(() => mapWireResponse({ status: 200, body }), "malformed");
    const typed: Array<[string, (e: Example) => void]> = [
      ["results not an array", (e) => (e.body.results = {})],
      ["prompt not a string", (e) => (e.body.results[0].prompt = 12)],
      ["empty prompt", (e) => (e.body.results[0].prompt = "")],
      ["prompt too long", (e) => (e.body.results[0].prompt = "x".repeat(2001))],
      ["handle not aqh_", (e) => (e.body.results[0].handle = "demo-q-001")],
      ["handle is a key", (e) => (e.body.results[0].handle = "ability_cooldown_rank:Ahri:Q:1")],
      ["slot unknown", (e) => (e.body.results[0].ability_slot = "Z")],
      ["difficulty 9", (e) => (e.body.results[0].difficulty = 9)],
      ["count negative", (e) => (e.body.counts.visible_matching = -1)],
      ["count float", (e) => (e.body.counts.visible_matching = 1.5)],
      ["count string", (e) => (e.body.counts.visible_matching = "3")],
      ["facet count_state approximate", (e) => (e.body.facets.topics[0].count_state = "approximate")],
      ["page.limit 0", (e) => (e.body.page.limit = 0)],
      ["topic with spaces", (e) => (e.body.results[0].topics = ["not a topic!"])],
      ["subject kind unknown", (e) => (e.body.results[0].subjects[0].kind = "region")],
    ];
    for (const [label, mutate] of typed) {
      const e = ex("A=Ahri (discovered, user U1)");
      mutate(e);
      // A closed enum reports unknown_state; every other shape error is malformed.
      expect(() => mapWireResponse(http(e)), label).toThrow(AtlasWireError);
      try {
        mapWireResponse(http(e));
      } catch (error) {
        expect(["malformed", "unknown_state"], label).toContain((error as AtlasWireError).kind);
      }
    }
  });

  it("rejects bodies that contradict themselves", () => {
    const cases: Array<[string, (e: Example) => void]> = [
      ["has_more without a cursor", (e) => (e.body.page.next_cursor = null)],
      ["cursor without has_more", (e) => (e.body.page.has_more = false)],
      ["more results than the count", (e) => (e.body.counts.visible_matching = 1)],
      ["exact count without a number", (e) => (e.body.counts.visible_matching = null)],
      ["exact count without a unit", (e) => delete e.body.counts.unit],
      ["unavailable count with a number", (e) => (e.body.counts.count_state = "unavailable")],
      ["duplicate handle", (e) => (e.body.results[1].handle = e.body.results[0].handle)],
      ["more results than the page limit", (e) => (e.body.page.limit = 1)],
      ["error on a 200", (e) => (e.body.error = { code: "SOMETHING", message: "x", field: null })],
      ["supported relation without families", (e) => (e.body.relationship = { state: "supported", supporting_families: [] })],
      ["related panel without a B.1 echo", (e) => (e.body.related = { b_modifier: { subject: { kind: "item", id: "1", label: "x" }, relationship: "item_is_premise_subject", label: "x", results: [], count: 0, count_state: "exact", has_more: false } })],
    ];
    for (const [, mutate] of cases) {
      const e = ex("A=Ahri (discovered, user U1)");
      mutate(e);
      throwsWire(() => mapWireResponse(http(e)), "inconsistent");
    }
  });

  it("a gated or failed response may carry no data at all", () => {
    for (const [name, key, value] of [
      ["premium_review (Free) denied", "results", [ex("A=Ahri (discovered, user U1)").body.results[0]]],
      ["premium_review (Free) denied", "counts", { visible_matching: 0, count_state: "exact", unit: "question" }],
      ["premium_review (Free) denied", "facets", ex("A=Ahri (discovered, user U1)").body.facets],
      ["catalog (default)", "coverage", ex("A=Ahri (discovered, user U1)").body.coverage],
      ["invalid item id", "page", { limit: 20, offset: 0, has_more: false, next_cursor: null }],
      ["premium_exclusive", "results", [ex("A=Ahri (discovered, user U1)").body.results[0]]],
    ] as const) {
      const e = ex(name);
      e.body[key] = structuredClone(value);
      throwsWire(() => mapWireResponse(http(e)), "inconsistent", key);
    }
  });

  it("bounds the work a hostile body can cause", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 40; i += 1) cursor = (cursor.x = {}) as Record<string, unknown>;
    const e = ex("catalog (default)");
    e.body.extra = deep;
    throwsWire(() => mapWireResponse(http(e)), "malformed");
    const many = ex("A=Ahri (discovered, user U1)");
    many.body.results = Array.from({ length: 51 }, () => structuredClone(many.body.results[0]));
    throwsWire(() => mapWireResponse(http(many)), "malformed", "results");
  });
});

/* ------------------------------------------------------------------------- */
/* GET /coverage — the topics catalog                                        */
/* ------------------------------------------------------------------------- */

describe("coverage catalog and topics", () => {
  const catalog = mapCoverageCatalog(http(ex("public coverage")));

  it("takes topic ids and labels from the backend catalog", () => {
    expect(catalog.state).toBe("partial");
    expect(catalog.index_revision).toBe("4b7bd8bb643dd32110d2");
    expect(catalog.topics).toEqual(DEFAULT_TOPIC_CATALOG);
    expect(catalog.topics).toHaveLength(27);
    expect(catalog.not_indexed_sources).toContain("ranked_accepted_bank");
    expect(catalog.collections).toEqual(["catalog", "discovered", "premium_review", "admin_inventory", "premium_exclusive"]);
  });

  it("has no active damage, range, scaling or generic cost topic; gold and ability cost are separate", () => {
    const ids = catalog.topics.map((t) => t.id);
    for (const banned of ["damage", "range", "scaling", "cost"]) expect(ids).not.toContain(banned);
    expect(ids).toEqual(expect.arrayContaining(["gold", "ability_cost"]));
    expect(catalog.topics.find((t) => t.id === "gold")?.label).toBe("Gold & cost");
    expect(catalog.topics.find((t) => t.id === "ability_cost")?.label).toBe("Ability cost");
  });

  it("refuses a malformed coverage body", () => {
    const e = ex("public coverage");
    e.body.topics[0].extra = true;
    throwsWire(() => mapCoverageCatalog(http(e)), "malformed");
    const v = ex("public coverage");
    v.body.contract_version = "atlas_questions.v9";
    throwsWire(() => mapCoverageCatalog(http(v)), "contract_mismatch");
    throwsWire(() => mapCoverageCatalog({ status: 500, body: v.body }), "unexpected_status");
    const full = ex("public coverage");
    full.body.state = "full";
    throwsWire(() => mapCoverageCatalog(http(full)), "unknown_state");
  });
});

/* ------------------------------------------------------------------------- */
/* Server adapter boundary                                                   */
/* ------------------------------------------------------------------------- */

describe("server wire adapter", () => {
  const anonymous = { persona: "anonymous", premiumLookup: "ok" } as const;
  const owner = { persona: "owner", premiumLookup: "unavailable" } as const;

  it("encodes, calls the injected transport once, and returns the mapped view", async () => {
    const transport = vi.fn(async (_: WireRequest) => http(ex("A=Ahri (discovered, user U1)")));
    const adapter = createServerWireAdapter(transport);
    const res = await adapter.search(q({ a: ahri, collection: "discovered", limit: 2 }), anonymous);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].path).toBe(WIRE_SEARCH_PATH);
    expect(res.results).toHaveLength(2);
    expect(res.demo).toBe(false);
  });

  it("never lets the demo persona reach the request (no impersonation)", async () => {
    const seen: WireRequest[] = [];
    const adapter = createServerWireAdapter(async (request) => {
      seen.push(request);
      return http(ex("A=Ahri (discovered, user U1)"));
    });
    const query = q({ a: ahri, collection: "discovered", limit: 2 });
    await adapter.search(query, anonymous);
    await adapter.search(query, owner);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(seen[1]);
    expect(JSON.stringify(seen)).not.toMatch(/persona|anonymous|owner/);
  });

  it("does not call the transport for a query the encoder refuses", async () => {
    const transport = vi.fn(async () => http(ex("A=Ahri (discovered, user U1)")));
    const adapter = createServerWireAdapter(transport);
    await expect(adapter.search(q({ a: ahri, topics: ["damage"] }), anonymous)).rejects.toMatchObject({ kind: "encode" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("turns a transport failure, a rate limit and a bad body into AtlasWireError, never an empty result", async () => {
    const query = q({ a: ahri, collection: "discovered", limit: 2 });
    await expect(createServerWireAdapter(async () => Promise.reject(new Error("offline: secret detail"))).search(query, anonymous)).rejects.toMatchObject({ kind: "transport" });
    await expect(createServerWireAdapter(async () => ({ status: 429, body: { detail: { retry_after_seconds: 5 } } })).search(query, anonymous)).rejects.toMatchObject({ kind: "rate_limited", retryAfterSeconds: 5 });
    await expect(createServerWireAdapter(async () => ({ status: 200, body: "<html>proxy error</html>" })).search(query, anonymous)).rejects.toBeInstanceOf(AtlasWireError);
    const err = await createServerWireAdapter(async () => Promise.reject(new Error("offline: secret detail"))).search(query, anonymous).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("secret detail");
  });

  it("maps a 401 through the whole boundary without throwing", async () => {
    const adapter = createServerWireAdapter(async () => http(ex("discovered unauthenticated")));
    const res = await adapter.search(q({ collection: "discovered" }), anonymous);
    expect(res.access.state).toBe("requires_account");
  });
});

/* ------------------------------------------------------------------------- */
/* Static guards: nothing here can reach a network or storage                 */
/* ------------------------------------------------------------------------- */

describe("the wire boundary performs no I/O", () => {
  const dir = __dirname;
  const read = (rel: string) => readFileSync(resolve(dir, rel), "utf8");
  const wireFiles = ["wire.ts", "wireRequest.ts", "wireResponse.ts", "serverWireAdapter.ts"];

  it("has no fetch, XHR, WebSocket, storage, logging, env or client imports", () => {
    for (const file of wireFiles) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const needle of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /console\./, /import\.meta\.env/, /VITE_/, /process\.env/, /supabase/i, /Authorization/, /@\/lib\/(api|backend|auth)/, /railway/i, /localhost/]) {
        expect(code, `${file} must not match ${needle}`).not.toMatch(needle);
      }
    }
  });

  it("is not imported by the page, the fixture adapter or any route, so no request can happen today", () => {
    const importers = [resolve(dir, "../../pages/dev/atlas-cross-section/AtlasCrossSectionPage.tsx"), resolve(dir, "../../pages/dev/atlas-cross-section/Views.tsx"), resolve(dir, "fixtureAdapter.ts"), resolve(dir, "../../App.tsx")];
    for (const file of importers) {
      const code = readFileSync(file, "utf8");
      expect(code, file).not.toMatch(/serverWireAdapter|wireRequest|wireResponse/);
    }
  });
});
