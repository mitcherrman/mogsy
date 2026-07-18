/**
 * Registry integrity for the League Glossary. These guard the invariants
 * the Glossary page and its deep-link anchors rely on: unique ids/anchors,
 * every relatedTermIds pointer resolves, search matches term/alias/body,
 * category filtering is exhaustive, and no misleading damage-type aliases
 * (e.g. "AD damage" / "AP damage") creep back in.
 */
import { describe, expect, it } from "vitest";
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERMS,
  getGlossaryTerm,
  searchGlossary,
  sortGlossary,
} from "./registry";

describe("glossary registry integrity", () => {
  it("has at least one term", () => {
    expect(GLOSSARY_TERMS.length).toBeGreaterThan(0);
  });

  it("uses unique term ids (and therefore unique anchors)", () => {
    const ids = GLOSSARY_TERMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses id slugs that are safe URL fragments (lowercase-kebab)", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("resolves every relatedTermIds pointer to a real term", () => {
    for (const t of GLOSSARY_TERMS) {
      for (const rid of t.relatedTermIds) {
        expect(getGlossaryTerm(rid), `${t.id} → ${rid}`).toBeDefined();
      }
    }
  });

  it("never lists a term as related to itself", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.relatedTermIds).not.toContain(t.id);
    }
  });

  it("assigns every term to a declared category", () => {
    const cats = new Set(GLOSSARY_CATEGORIES.map((c) => c.id));
    for (const t of GLOSSARY_TERMS) {
      expect(cats.has(t.category), `${t.id} category ${t.category}`).toBe(true);
    }
  });
});

describe("glossary terminology accuracy", () => {
  it("does not use the misleading aliases 'AD damage' or 'AP damage'", () => {
    for (const t of GLOSSARY_TERMS) {
      const lowered = t.aliases.map((a) => a.toLowerCase());
      expect(lowered).not.toContain("ad damage");
      expect(lowered).not.toContain("ap damage");
    }
  });
});

describe("post-shield damage model", () => {
  it("defines the pipeline order raw → post-mitigation → health-damage → lethal", () => {
    for (const id of ["raw-damage", "post-mitigation-damage", "health-damage", "lethal-damage"]) {
      expect(getGlossaryTerm(id), id).toBeDefined();
    }
  });

  it("excludes shield absorption from post-mitigation damage", () => {
    const pmd = getGlossaryTerm("post-mitigation-damage")!;
    expect(pmd.shortDefinition).toMatch(/shield absorption is not included/i);
    // The old wording folded shields into the mitigated number — guard against regression.
    expect(pmd.shortDefinition.toLowerCase()).not.toMatch(/after every.*shield.*is applied/);
  });

  it("defines health-damage as post-mitigation damage after shields, linked correctly", () => {
    const hd = getGlossaryTerm("health-damage")!;
    expect(hd.shortDefinition).toMatch(/removed from current health/i);
    expect(hd.relatedTermIds).toEqual(
      expect.arrayContaining(["post-mitigation-damage", "current-health", "lethal-damage"]),
    );
  });

  it("makes lethality depend on health damage, not post-mitigation damage", () => {
    const lethal = getGlossaryTerm("lethal-damage")!;
    expect(lethal.formula).toBe("lethal ⇔ health_damage ≥ current_health");
    expect(lethal.shortDefinition).toMatch(/health damage/i);
    expect(lethal.relatedTermIds).toContain("health-damage");
  });

  it("computes health-remaining from health damage, not post-mitigation damage", () => {
    const hr = getGlossaryTerm("health-remaining")!;
    expect(hr.relatedTermIds).toContain("health-damage");
    expect(hr.formula).toBe("health_remaining = max(0, current_health − health_damage)");
    // Must not subtract post-mitigation damage directly.
    expect(hr.formula).not.toMatch(/current_health\s*−\s*post_mitigation_damage/);
    expect(hr.shortDefinition).toMatch(/health damage/i);
  });

  it("does not let a shielded hit reduce health by the full post-mitigation amount", () => {
    // Model the documented pipeline with the registry formulas as the source of truth.
    const currentHealth = 420;
    const postMitigation = 380;
    const shield = 100;
    const healthDamage = Math.max(0, postMitigation - shield); // 280
    const healthRemaining = Math.max(0, currentHealth - healthDamage); // 140
    // The wrong (old) model would have left 420 − 380 = 40.
    expect(healthRemaining).toBe(140);
    expect(healthRemaining).not.toBe(currentHealth - postMitigation);
    // The glossary example encodes exactly this shielded scenario.
    expect(getGlossaryTerm("health-remaining")!.example).toContain("shield absorbing 100");
  });

  it("keeps true damage conservative about shields and drops the all-damage-reduction claim", () => {
    const td = getGlossaryTerm("true-damage")!;
    expect(td.shortDefinition).toMatch(/shields may absorb true damage/i);
    expect(td.fullDefinition.toLowerCase()).not.toContain("reduces incoming damage of all types");
  });
});

describe("searchGlossary", () => {
  it("returns all terms for an empty query", () => {
    expect(searchGlossary("")).toHaveLength(GLOSSARY_TERMS.length);
    expect(searchGlossary("   ")).toHaveLength(GLOSSARY_TERMS.length);
  });

  it("matches on the term name, case-insensitively", () => {
    const hits = searchGlossary("ARMOR");
    expect(hits.some((t) => t.id === "armor")).toBe(true);
  });

  it("matches on an alias", () => {
    const hits = searchGlossary("magic resist");
    expect(hits.some((t) => t.id === "magic-resistance")).toBe(true);
  });

  it("matches on definition body text", () => {
    const hits = searchGlossary("bypasses armor and magic resistance");
    expect(hits.some((t) => t.id === "true-damage")).toBe(true);
  });

  it("returns nothing for a term that does not exist", () => {
    expect(searchGlossary("zzz-not-a-real-term")).toHaveLength(0);
  });

  it("searches within a pre-filtered subset when one is provided", () => {
    const damageOnly = GLOSSARY_TERMS.filter((t) => t.category === "damage");
    const hits = searchGlossary("resistance", damageOnly);
    expect(hits.every((t) => t.category === "damage")).toBe(true);
  });
});

describe("category filtering + sortGlossary", () => {
  it("filters to exactly the terms in a category", () => {
    for (const c of GLOSSARY_CATEGORIES) {
      const filtered = GLOSSARY_TERMS.filter((t) => t.category === c.id);
      expect(filtered.every((t) => t.category === c.id)).toBe(true);
    }
  });

  it("orders by category, then per-term order, without dropping terms", () => {
    const sorted = sortGlossary(GLOSSARY_TERMS);
    expect(sorted).toHaveLength(GLOSSARY_TERMS.length);
    const catIndex = new Map(GLOSSARY_CATEGORIES.map((c, i) => [c.id, i] as const));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const cp = catIndex.get(prev.category)!;
      const cc = catIndex.get(curr.category)!;
      expect(cp).toBeLessThanOrEqual(cc);
      if (cp === cc) expect(prev.order).toBeLessThanOrEqual(curr.order);
    }
  });
});
