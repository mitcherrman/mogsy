/**
 * Atlas cross-section — typed request encoder (view query → wire request).
 *
 * Pure and fail-closed: anything the server would reject, or that the
 * contract does not document, throws `AtlasWireError("encode")` here instead
 * of becoming a request. It encodes the QUERY only: no persona, no user id, no
 * impersonation input exists in its signature, so a "preview as" choice can
 * never reach the server.
 *
 * Semantics preserved from the backend: topics repeat and OR together; every
 * other group ANDs; the cursor is opaque and passed through; only
 * `patch=current` exists.
 */
import { COLLECTIONS, DEFAULT_TOPIC_CATALOG, type CrossSectionQuery, type SubjectRef, type TopicInfo } from "./types";
import { sameSubject } from "./query";
import { CHAMPION_ID_PATTERN, CURSOR_PATTERN, ITEM_ID_PATTERN, WIRE_LIMITS, WIRE_SEARCH_PATH, fail, type WireRequest } from "./wire";

export interface EncodeOptions {
  /** Topics the encoder may send; defaults to the backend catalog mirror. */
  topics?: readonly TopicInfo[];
}

function subjectParams(prefix: "a" | "b", ref: SubjectRef | null): Array<readonly [string, string]> {
  if (!ref) return [];
  if (ref.kind === "champion") {
    if (!CHAMPION_ID_PATTERN.test(ref.id)) fail("encode", `${prefix}_id`, "champion id is not in the documented format");
  } else if (ref.kind === "item") {
    if (!ITEM_ID_PATTERN.test(ref.id)) fail("encode", `${prefix}_id`, "item id must be a numeric canonical id");
  } else {
    fail("encode", `${prefix}_kind`, "axis kind must be champion or item");
  }
  return [
    [`${prefix}_kind`, ref.kind],
    [`${prefix}_id`, ref.id],
  ];
}

export function encodeSearchRequest(query: CrossSectionQuery, options: EncodeOptions = {}): WireRequest {
  const params: Array<readonly [string, string]> = [];
  const catalog = options.topics ?? DEFAULT_TOPIC_CATALOG;

  if (!COLLECTIONS.includes(query.collection)) fail("encode", "collection", "unknown collection");
  params.push(["collection", query.collection]);

  if (query.a && query.b && sameSubject(query.a, query.b)) fail("encode", "b_id", "A and B must be different subjects");
  params.push(...subjectParams("a", query.a), ...subjectParams("b", query.b));

  if (query.b1ItemId !== null) {
    if (!query.b) fail("encode", "b1_item_id", "B.1 attaches to B; B is absent");
    if (query.b.kind !== "champion") fail("encode", "b1_item_id", "B.1 attaches only to a champion B");
    if (!ITEM_ID_PATTERN.test(query.b1ItemId)) fail("encode", "b1_item_id", "item id must be a numeric canonical id");
    if (query.a && sameSubject(query.a, { kind: "item", id: query.b1ItemId })) fail("encode", "b1_item_id", "A and B.1 must be different subjects");
    params.push(["b1_item_id", query.b1ItemId]);
  }

  const topics = Array.from(new Set(query.topics));
  if (topics.length > WIRE_LIMITS.repeatMax) fail("encode", "topic", "too many topics");
  for (const topic of topics) {
    if (!catalog.some((t) => t.id === topic)) fail("encode", "topic", "topic is not in the certified catalog");
    params.push(["topic", topic]);
  }

  if (query.abilitySlot !== null) {
    if (!["P", "Q", "W", "E", "R"].includes(query.abilitySlot)) fail("encode", "ability_slot", "unknown ability slot");
    params.push(["ability_slot", query.abilitySlot]);
  }

  if (query.abilityRank !== null) {
    const rank = query.abilityRank;
    if (rank !== "max" && !(Number.isInteger(rank) && rank >= WIRE_LIMITS.rankMin && rank <= WIRE_LIMITS.rankMax)) fail("encode", "ability_rank", "ability rank must be 1-6 or max");
    params.push(["ability_rank", String(rank)]);
  }

  if (query.championLevel !== null) {
    const level = query.championLevel;
    if (!Number.isInteger(level) || level < WIRE_LIMITS.levelMin || level > WIRE_LIMITS.levelMax) fail("encode", "champion_level", "champion level must be 1-18");
    params.push(["champion_level", String(level)]);
  }

  if (query.patch !== "current") fail("encode", "patch", "only patch=current is supported");
  params.push(["patch", "current"]);

  if (query.cursor !== null) {
    if (!CURSOR_PATTERN.test(query.cursor)) fail("encode", "cursor", "cursor is not an opaque token");
    params.push(["cursor", query.cursor]);
  }

  if (!Number.isInteger(query.limit) || query.limit < WIRE_LIMITS.limitMin || query.limit > WIRE_LIMITS.limitMax) fail("encode", "limit", "limit must be 1-50");
  params.push(["limit", String(query.limit)]);

  return { method: "GET", path: WIRE_SEARCH_PATH, params };
}

/** `a=b&c=d` for a transport that builds its own URL. Never includes a host. */
export function requestSearch(request: WireRequest): string {
  const search = new URLSearchParams();
  for (const [k, v] of request.params) search.append(k, v);
  return search.toString();
}
