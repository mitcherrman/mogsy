import { describe, expect, it } from "vitest";
import { QUESTIONS } from "./fixtures";
import { accessFor, createFixtureAdapter, pairSupported, searchFixtures } from "./fixtureAdapter";
import { INITIAL_STATE, appliedFilters, availableViews, reduceCrossSection, relationshipLabel, relationshipOf, type CrossSectionAction } from "./query";
import type { CrossSectionQuery, SessionContext, SubjectRef } from "./types";

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

  it("level and rank are separate, clamped facets; rank follows the slot's maximum", () => {
    let s = run([{ type: "setA", subject: ahri }, { type: "setLevel", level: 40 }, { type: "setRank", rank: 9 }]);
    expect(s.query.championLevel).toBe(18);
    expect(s.query.abilityRank).toBe(5);
    s = reduceCrossSection(s, { type: "setSlot", slot: "R" });
    expect(s.query.abilityRank).toBe(3);
    expect(appliedFilters(s.query)).toEqual(["Slot: R", "Level 18", "Rank 3", "Patch: current"]);
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
    expect(both.counts.visible_matching).toBeGreaterThanOrEqual(Math.max(mana.counts.visible_matching, cooldown.counts.visible_matching));
  });

  it("never exposes answer-keyed or uncertified edges outside the admin inventory", () => {
    const syndraCatalog = searchFixtures(query({ a: syndra }), account);
    expect(syndraCatalog.results.some((r) => r.prompt.includes("Unleashed Power?"))).toBe(false);
    const ahriCatalog = searchFixtures(query({ a: ahri }), account);
    expect(ahriCatalog.results.some((r) => r.prompt.includes("region"))).toBe(false);
    expect(ahriCatalog.coverage.state).toBe("partial");
    expect(ahriCatalog.coverage.reason_codes).toContain("uncertified_families_excluded");
    const inventory = searchFixtures(query({ a: ahri, collection: "admin_inventory", limit: 50 }), owner);
    expect(inventory.results.some((r) => r.prompt.includes("region"))).toBe(true);
    expect(inventory.results.every((r) => r.inventory !== undefined)).toBe(true);
  });

  it("A × B requires both axes; B.1 questions land in related_results only", () => {
    const pair = searchFixtures(query({ a: ahri, b: syndra, limit: 50 }), account);
    expect(pair.relation).toBe("pair");
    expect(pair.results.length).toBeGreaterThan(0);
    expect(pair.results.every((r) => r.family_label === "Comparison")).toBe(true);
    const withItem = searchFixtures(query({ a: ahri, b: syndra, b1ItemId: zhonya, limit: 50 }), account);
    expect(withItem.query.b_modifier).toEqual({ item_id: zhonya, intent: "equipped_for_research" });
    expect(withItem.results.map((r) => r.handle)).toEqual(pair.results.map((r) => r.handle));
    expect(withItem.related_results.length).toBeGreaterThan(0);
    expect(withItem.related_results.every((r) => r.prompt.includes("Zhonya"))).toBe(true);
    expect(withItem.results.some((r) => withItem.related_results.some((x) => x.handle === r.handle))).toBe(false);
  });

  it("reports an unsupported relation for a pair with no certified relation anywhere", () => {
    expect(pairSupported(ahri, jinx)).toBe(false);
    const res = searchFixtures(query({ a: ahri, b: jinx }), account);
    expect(res.relation).toBe("unsupported");
    expect(res.results).toHaveLength(0);
  });

  it("item × item and champion × item pairs resolve gracefully", () => {
    const items = searchFixtures(query({ a: deathcap, b: voidstaff }), account);
    expect(items.relation).toBe("pair");
    expect(items.results.map((r) => r.family_label)).toEqual(["Comparison"]);
    const mixed = searchFixtures(query({ a: ahri, b: { kind: "item", id: "6655" } }), account);
    expect(mixed.results.every((r) => r.family_label === "Scenario")).toBe(true);
  });

  it("level and rank filters touch only scoped questions", () => {
    const all = searchFixtures(query({ a: ahri, limit: 50 }), account);
    const level9 = searchFixtures(query({ a: ahri, championLevel: 9, limit: 50 }), account);
    const level3 = searchFixtures(query({ a: ahri, championLevel: 3, limit: 50 }), account);
    expect(level9.results.some((r) => r.prompt.includes("level 9"))).toBe(true);
    expect(level3.results.some((r) => r.prompt.includes("level 9"))).toBe(false);
    expect(level3.results.some((r) => r.applicability.champion_level.kind === "agnostic")).toBe(true);
    expect(level9.counts.visible_matching).toBeLessThan(all.counts.visible_matching);
    const rank5 = searchFixtures(query({ a: ahri, abilityRank: 5, limit: 50 }), account);
    expect(rank5.results.some((r) => r.prompt.includes("rank 1"))).toBe(false);
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
  });

  it("collections are access-checked from the session, never from the family", () => {
    expect(accessFor("catalog", anonymous).state).toBe("requires_account");
    expect(accessFor("discovered", anonymous).state).toBe("requires_account");
    expect(accessFor("premium_review", account).state).toBe("denied");
    expect(accessFor("premium_review", { persona: "premium", premiumLookup: "unavailable" }).state).toBe("unavailable_entitlement");
    expect(accessFor("admin_inventory", premium).state).toBe("denied");
    expect(accessFor("premium_exclusive", owner).state).toBe("not_configured");

    const anon = searchFixtures(query({ a: ahri }), anonymous);
    expect(anon.results).toHaveLength(0);
    expect(anon.counts.count_state).toBe("unavailable");

    const unlocked = searchFixtures(query({ a: ahri, limit: 50 }), account);
    const mine = searchFixtures(query({ a: ahri, collection: "discovered", limit: 50 }), account);
    expect(mine.results.every((r) => r.discovery.state === "unlocked")).toBe(true);
    expect(mine.counts.visible_matching).toBeLessThan(unlocked.counts.visible_matching);

    const review = searchFixtures(query({ a: ahri, collection: "premium_review", limit: 50 }), premium);
    expect(review.results.every((r) => r.review?.outcome === "missed")).toBe(true);
    expect(review.results.length).toBeGreaterThan(0);
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
    }
    expect(QUESTIONS.every((q) => !("answer" in q))).toBe(true);
  });
});
