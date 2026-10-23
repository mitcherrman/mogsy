import { describe, expect, it } from "vitest";
import { QUESTIONS } from "./fixtures";
import { accessFor, createFixtureAdapter, pairSupported, searchFixtures } from "./fixtureAdapter";
import { INITIAL_STATE, appliedFilters, availableViews, reduceCrossSection, relationshipLabel, relationshipOf, type CrossSectionAction } from "./query";
import { DEFAULT_TOPIC_CATALOG, relationUnsupported, type CrossSectionQuery, type SessionContext, type SubjectRef } from "./types";

const ahri: SubjectRef = { kind: "champion", id: "Ahri" };
const syndra: SubjectRef = { kind: "champion", id: "Syndra" };
const jinx: SubjectRef = { kind: "champion", id: "Jinx" };
const deathcap: SubjectRef = { kind: "item", id: "3089" };
const voidstaff: SubjectRef = { kind: "item", id: "3135" };
const zhonya = "3157";

const account: SessionContext = { persona: "account", premiumLookup: "ok" };
const owner: SessionContext = { persona: "owner", premiumLookup: "ok" };
const premium: SessionContext = { persona: "premium", premiumLookup: "ok" };
const anonymous: SessionContext = { persona: "anonymous", premiumLookup: "ok" };

function run(actions: CrossSectionAction[]) {
  return actions.reduce(reduceCrossSection, INITIAL_STATE);
}

function query(partial: Partial<CrossSectionQuery>): CrossSectionQuery {
  return { ...INITIAL_STATE.query, ...partial };
}

describe("A / B / B.1 semantics", () => {
  it("A alone, B alone and the pair are each valid and labelled", () => {
    expect(relationshipLabel(relationshipOf(query({ a: ahri })))).toBe("A only");
    expect(relationshipLabel(relationshipOf(query({ b: syndra })))).toBe("B only");
    expect(relationshipLabel(relationshipOf(query({ a: ahri, b: syndra })))).toBe("A × B");
    expect(relationshipLabel(relationshipOf(query({ a: ahri, b: syndra, b1ItemId: zhonya })))).toBe("A × (B + B.1)");
    expect(relationshipOf(query({ a: deathcap, b: voidstaff }))).toMatchObject({ kind: "pair", shape: "item_x_item" });
    expect(relationshipOf(query({ a: ahri, b: deathcap }))).toMatchObject({ kind: "pair", shape: "champion_x_item" });
  });

  it("B.1 attaches only to a champion in B and is cleared explicitly when B changes or becomes an item", () => {
    let s = run([{ type: "setB1", itemId: zhonya }]);
    expect(s.query.b1ItemId).toBeNull();
    expect(s.lastInvalidation).toContain("needs a champion in B");

    s = run([{ type: "setA", subject: ahri }, { type: "setB", subject: syndra }, { type: "setB1", itemId: zhonya }]);
    expect(s.query.b1ItemId).toBe(zhonya);

    const changed = reduceCrossSection(s, { type: "setB", subject: jinx });
    expect(changed.query.b1ItemId).toBeNull();
    expect(changed.lastInvalidation).toContain("attached item was cleared");

    const item = reduceCrossSection(s, { type: "setB", subject: deathcap });
    expect(item.query.b1ItemId).toBeNull();
    expect(item.lastInvalidation).toContain("cannot equip an item");

    const cleared = reduceCrossSection(s, { type: "setB", subject: null });
    expect(cleared.query.b1ItemId).toBeNull();
    expect(cleared.lastInvalidation).toContain("B cleared");
  });

  it("swap keeps B.1 only when the new B is a champion", () => {
    const s = run([{ type: "setA", subject: deathcap }, { type: "setB", subject: syndra }, { type: "setB1", itemId: zhonya }]);
    const swapped = reduceCrossSection(s, { type: "swap" });
    expect(swapped.query.a).toEqual(syndra);
    expect(swapped.query.b).toEqual(deathcap);
    expect(swapped.query.b1ItemId).toBeNull();
    expect(swapped.lastInvalidation).toContain("Axes swapped");
  });

  it("level and rank are separate, clamped facets; rank is 1-6 or the symbolic max", () => {
    let s = run([{ type: "setA", subject: ahri }, { type: "setLevel", level: 40 }, { type: "setRank", rank: 9 }]);
    expect(s.query.championLevel).toBe(18);
    expect(s.query.abilityRank).toBe(6);
    // The slot no longer narrows the rank: the index cannot say how many ranks an ability has.
    s = reduceCrossSection(s, { type: "setSlot", slot: "R" });
    expect(s.query.abilityRank).toBe(6);
    expect(appliedFilters(s.query)).toEqual(["Slot: R", "Level 18", "Rank 6", "Patch: current"]);
    s = reduceCrossSection(s, { type: "setRank", rank: "max" });
    expect(s.query.abilityRank).toBe("max");
    expect(appliedFilters(s.query)).toContain("Rank max");
  });

  it("topic filters read as backend labels and keep OR semantics", () => {
    const s = run([{ type: "setA", subject: ahri }, { type: "toggleTopic", topic: "ability_cost" }, { type: "toggleTopic", topic: "cooldown" }]);
    expect(s.query.topics).toEqual(["ability_cost", "cooldown"]);
    expect(appliedFilters(s.query)[0]).toBe("Topic: Ability cost or Cooldown");
  });

  it("compare is offered only for a pair, and the view falls back when the pair dissolves", () => {
    expect(availableViews(query({ a: ahri }))).toEqual(["overview", "abilities", "questions"]);
    const s = run([{ type: "setA", subject: ahri }, { type: "setB", subject: syndra }, { type: "setView", view: "compare" }]);
    expect(s.view).toBe("compare");
    expect(reduceCrossSection(s, { type: "setB", subject: null }).view).toBe("overview");
  });
});

describe("fixture adapter — contract semantics", () => {
  it("A = Ahri, topic mana returns only mana questions and changing the topic changes the results", () => {
    const mana = searchFixtures(query({ a: ahri, topics: ["mana"] }), account);
    expect(mana.access.state).toBe("allowed");
    expect(mana.results.length).toBeGreaterThan(0);
    expect(mana.results.every((r) => r.topics.includes("mana"))).toBe(true);
    const cooldown = searchFixtures(query({ a: ahri, topics: ["cooldown"] }), account);
    expect(cooldown.results.every((r) => r.topics.includes("cooldown"))).toBe(true);
    expect(cooldown.results.map((r) => r.handle)).not.toEqual(mana.results.map((r) => r.handle));
    // Topics OR together.
    const both = searchFixtures(query({ a: ahri, topics: ["mana", "cooldown"] }), account);
    expect(both.counts.visible_matching).toBeGreaterThanOrEqual(Math.max(mana.counts.visible_matching ?? 0, cooldown.counts.visible_matching ?? 0));
  });

  it("offers no demo-only topics and keeps gold and ability cost apart", () => {
    const everything = QUESTIONS.flatMap((q) => q.topics);
    for (const banned of ["damage", "range", "scaling", "cost"]) expect(everything).not.toContain(banned);
    expect(everything).toContain("gold");
    expect(everything).toContain("ability_cost");
    expect(DEFAULT_TOPIC_CATALOG.map((t) => t.id)).not.toEqual(expect.arrayContaining(["damage"]));
  });

  it("never exposes answer-keyed or uncertified edges outside the admin inventory", () => {
    const syndraCatalog = searchFixtures(query({ a: syndra }), account);
    expect(syndraCatalog.results.some((r) => r.prompt.includes("Unleashed Power?"))).toBe(false);
    const ahriCatalog = searchFixtures(query({ a: ahri }), account);
    expect(ahriCatalog.results.some((r) => r.prompt.includes("region"))).toBe(false);
    expect(ahriCatalog.coverage?.state).toBe("partial");
    expect(ahriCatalog.coverage?.reason_codes).toContain("uncategorized_families_excluded");
    const inventory = searchFixtures(query({ a: ahri, collection: "admin_inventory", limit: 50 }), owner);
    expect(inventory.results.some((r) => r.prompt.includes("region"))).toBe(true);
    expect(inventory.results.every((r) => r.admin !== null)).toBe(true);
    // answer_subject edges are never listed as result subjects, even for the owner.
    const syndraInventory = searchFixtures(query({ a: syndra, collection: "admin_inventory", limit: 50 }), owner);
    expect(syndraInventory.results.flatMap((r) => r.subjects).some((s) => (s.role as string) === "answer_subject")).toBe(false);
  });

  it("coverage is never full and says what the corpus is", () => {
    const res = searchFixtures(query({ a: ahri }), account);
    expect(res.coverage?.state).toBe("partial");
    expect(res.coverage?.corpus_label).toMatch(/DEMO/);
    expect(res.coverage?.not_indexed_sources.length).toBeGreaterThan(0);
  });

  it("A x B requires both axes; the pair reports a supported relation and its families", () => {
    const pair = searchFixtures(query({ a: ahri, b: syndra, limit: 50 }), account);
    expect(pair.relationship).toMatchObject({ state: "supported" });
    expect(pair.relationship?.supporting_families).toContain("comparison");
    expect(pair.results.length).toBeGreaterThan(0);
    expect(pair.results.every((r) => ["Comparison", "Scenario"].includes(r.family.label))).toBe(true);
    // One axis reports no relation at all: two subjects alone are the only way to ask for one.
    expect(searchFixtures(query({ a: ahri }), account).relationship).toBeNull();
  });

  it("B.1 narrows the intersection to its attached item; questions about the item land in `related` only", () => {
    const pair = searchFixtures(query({ a: ahri, b: syndra, limit: 50 }), account);
    const withItem = searchFixtures(query({ a: ahri, b: syndra, b1ItemId: zhonya, limit: 50 }), account);
    expect(withItem.query?.b_modifier).toMatchObject({ kind: "item", id: zhonya, attached_to: "b", intent: "equipped_for_research" });
    expect(withItem.results.length).toBeGreaterThan(0);
    expect(withItem.results.length).toBeLessThan(pair.results.length);
    expect(withItem.results.every((r) => r.prompt.includes("Zhonya"))).toBe(true);
    expect(withItem.related?.kind).toBe("b_modifier");
    expect(withItem.related?.relationship).toBe("item_is_premise_subject");
    expect(withItem.related?.results.length).toBeGreaterThan(0);
    expect(withItem.related?.count).toBe(withItem.related?.results.length);
    expect(withItem.related?.results.every((r) => r.subjects.some((s) => s.id === zhonya && s.role === "premise_subject"))).toBe(true);
    expect(withItem.results.some((r) => withItem.related?.results.some((x) => x.handle === r.handle))).toBe(false);
    expect(withItem.relationship?.b_modifier).toMatchObject({ state: "supported" });
    // A B.1 item held by a different champion does not narrow B.
    const wrong = searchFixtures(query({ a: ahri, b: syndra, b1ItemId: "6655", limit: 50 }), account);
    expect(wrong.results).toHaveLength(0);
  });

  it("reports an unsupported relation, with its reason, for a pair no certified family relates", () => {
    expect(pairSupported(ahri, jinx)).toBe(false);
    const res = searchFixtures(query({ a: ahri, b: jinx }), account);
    expect(res.relationship).toMatchObject({ state: "unsupported", supporting_families: [] });
    expect(res.relationship?.reason).toBeTruthy();
    expect(relationUnsupported(res)).toBe(true);
    expect(res.results).toHaveLength(0);
  });

  it("item x item and champion x item pairs resolve gracefully", () => {
    const items = searchFixtures(query({ a: deathcap, b: voidstaff }), account);
    expect(items.relationship?.state).toBe("supported");
    expect(items.results.map((r) => r.family.label)).toEqual(["Comparison"]);
    const mixed = searchFixtures(query({ a: ahri, b: { kind: "item", id: "6655" } }), account);
    expect(mixed.results.every((r) => r.family.label === "Scenario")).toBe(true);
  });

  it("level and rank filters match only questions that STATE a matching value", () => {
    const all = searchFixtures(query({ a: ahri, limit: 50 }), account);
    const level9 = searchFixtures(query({ a: ahri, championLevel: 9, limit: 50 }), account);
    const level3 = searchFixtures(query({ a: ahri, championLevel: 3, limit: 50 }), account);
    expect(level9.results.some((r) => r.prompt.includes("level 9"))).toBe(true);
    expect(level9.results.every((r) => r.applicability.champion_level.value === 9)).toBe(true);
    // A question that does not state a level never matches a level filter.
    expect(level3.results).toHaveLength(0);
    expect(level3.counts).toMatchObject({ visible_matching: 0, count_state: "exact" });
    expect(level9.counts.visible_matching).toBeLessThan(all.counts.visible_matching ?? 0);
    // ...and unstated is reported as a count of its own, not folded into zero.
    expect(all.facet_applicability.champion_level.not_stated).toBeGreaterThan(0);
    const rank5 = searchFixtures(query({ a: ahri, abilityRank: 5, limit: 50 }), account);
    expect(rank5.results.length).toBeGreaterThan(0);
    expect(rank5.results.every((r) => r.applicability.ability_rank.value === "5")).toBe(true);
  });

  it("max rank is symbolic: an interval with value max, matched only by a max filter", () => {
    const max = searchFixtures(query({ a: syndra, abilityRank: "max", limit: 50 }), account);
    expect(max.results.length).toBe(1);
    expect(max.results[0].applicability.ability_rank).toEqual({ state: "interval", value: "max" });
    const five = searchFixtures(query({ a: syndra, abilityRank: 5, limit: 50 }), account);
    expect(five.results.some((r) => r.applicability.ability_rank.state === "interval")).toBe(false);
  });

  it("facets and counts describe the full authorized population, not the page", () => {
    const paged = searchFixtures(query({ a: ahri, limit: 2 }), account);
    expect(paged.results).toHaveLength(2);
    expect(paged.page.has_more).toBe(true);
    expect(paged.counts.visible_matching).toBeGreaterThan(2);
    const mana = paged.facets.topics.find((t) => t.id === "mana");
    expect(mana?.count).toBe(searchFixtures(query({ a: ahri, topics: ["mana"], limit: 50 }), account).counts.visible_matching);
    const next = searchFixtures(query({ a: ahri, limit: 2, cursor: paged.page.next_cursor }), account);
    expect(next.results[0].handle).not.toBe(paged.results[0].handle);
    // A selected topic keeps its siblings' counts (disjunctive facets).
    const selected = searchFixtures(query({ a: ahri, topics: ["mana"], limit: 50 }), account);
    expect(selected.facets.topics.find((t) => t.id === "cooldown")?.count).toBeGreaterThan(0);
    expect(selected.facets.topics.find((t) => t.id === "mana")?.selected).toBe(true);
  });

  it("collections are access-checked from the session, never from the family", () => {
    expect(accessFor("catalog", anonymous).state).toBe("requires_account");
    expect(accessFor("discovered", anonymous).state).toBe("requires_account");
    expect(accessFor("premium_review", account).state).toBe("denied");
    expect(accessFor("premium_review", { persona: "premium", premiumLookup: "unavailable" })).toMatchObject({ state: "unavailable_entitlement", retryable: true });
    expect(accessFor("admin_inventory", premium).state).toBe("denied");
    expect(accessFor("premium_exclusive", owner).state).toBe("not_configured");

    // A closed collection is unavailable, not zero.
    const anon = searchFixtures(query({ a: ahri }), anonymous);
    expect(anon.results).toHaveLength(0);
    expect(anon.counts).toMatchObject({ visible_matching: null, count_state: "unavailable" });
    expect(anon.coverage).toBeNull();

    const unlocked = searchFixtures(query({ a: ahri, limit: 50 }), account);
    const mine = searchFixtures(query({ a: ahri, collection: "discovered", limit: 50 }), account);
    expect(mine.results.every((r) => r.discovery?.state === "unlocked")).toBe(true);
    expect(mine.counts.visible_matching ?? 0).toBeLessThan(unlocked.counts.visible_matching ?? 0);
    // Elsewhere discovery is not reported: null is not "locked".
    expect(unlocked.results.every((r) => r.discovery === null)).toBe(true);

    const review = searchFixtures(query({ a: ahri, collection: "premium_review", limit: 50 }), premium);
    expect(review.results.every((r) => (r.review?.missed_attempts ?? 0) >= 1)).toBe(true);
    expect(review.results.length).toBeGreaterThan(0);
  });

  it("patch=current drops rows that are inactive or withheld in the bank", () => {
    const zhonyaGold = searchFixtures(query({ a: { kind: "item", id: "3157" }, topics: ["gold"], limit: 50 }), account);
    expect(zhonyaGold.results).toHaveLength(0);
    expect(searchFixtures(query({ a: ahri, limit: 50 }), account).results.every((r) => r.source_status === "current")).toBe(true);
  });

  it("the async adapter resolves the same answer and carries the DEMO flag", async () => {
    const adapter = createFixtureAdapter({ latencyMs: 0 });
    const res = await adapter.search(query({ a: ahri }), account);
    expect(res.demo).toBe(true);
    expect(res.contract_version).toBe("atlas_questions.v0");
    expect(res.results.map((r) => r.handle)).toEqual(searchFixtures(query({ a: ahri }), account).results.map((r) => r.handle));
  });

  it("no result ever carries a raw question key, answer, option or explanation", () => {
    const res = searchFixtures(query({ a: ahri, collection: "admin_inventory", limit: 50 }), owner);
    for (const r of res.results) {
      expect(r.handle).toMatch(/^demo-q-\d{3}$/);
      expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["answer", "options", "explanation", "question_key", "correct_answer"]));
      expect(Object.keys(r.admin ?? {})).not.toContain("question_key");
    }
    expect(QUESTIONS.every((q) => !("answer" in q))).toBe(true);
  });
});
