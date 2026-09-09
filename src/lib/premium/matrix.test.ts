/**
 * PT1.13 — the canonical matrix, fenced.
 *
 * These tests lock three different kinds of thing, and the third is the one
 * that matters most:
 *
 *  1. the rows themselves — the Free/Premium distinctions PT1.7B, PT1.8 and
 *     PT1.10–PT1.12 actually shipped;
 *  2. the presentation contract — `partial` and `planned` can never reach a
 *     user-facing surface;
 *  3. the SAFETY property — this module is presentation data, and no
 *     entitlement, gate or route guard may import it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BENEFIT_GROUPS,
  PREMIUM_MATRIX,
  benefitById,
  benefitsInGroup,
  discrepancies,
  freeBenefits,
  populatedGroups,
  premiumBenefits,
  presentableBenefits,
  upsellEligible,
  upsellsForSurface,
} from "./matrix";

describe("the matrix is well formed", () => {
  it("has unique ids", () => {
    const ids = PREMIUM_MATRIX.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts every row in a declared group", () => {
    const groups = new Set(BENEFIT_GROUPS.map((g) => g.id));
    for (const b of PREMIUM_MATRIX) expect(groups.has(b.group)).toBe(true);
  });

  it("says what BOTH tiers get on every row, always", () => {
    // A row with only a Premium column is a sales bullet, not a matrix entry.
    for (const b of PREMIUM_MATRIX) {
      expect(b.free.length, b.id).toBeGreaterThan(0);
      expect(b.premium.length, b.id).toBeGreaterThan(0);
    }
  });

  it("records where every distinction is enforced", () => {
    for (const b of PREMIUM_MATRIX) {
      expect(b.enforcementNote.length, b.id).toBeGreaterThan(0);
    }
  });
});

describe("PHASE 5 — status semantics: nothing unshipped is ever presentable", () => {
  it("presents only shipped rows", () => {
    for (const b of presentableBenefits()) expect(b.status).toBe("shipped");
  });

  it("presents only rows whose author wrote user-facing copy", () => {
    for (const b of presentableBenefits()) expect(b.userFacingSummary).toBeTruthy();
  });

  it("withholds every planned row from every user-facing helper", () => {
    const planned = PREMIUM_MATRIX.filter((b) => b.status === "planned");
    expect(planned.length).toBeGreaterThan(0);
    const shown = new Set(presentableBenefits().map((b) => b.id));
    for (const b of planned) expect(shown.has(b.id), b.id).toBe(false);
  });

  it("withholds Team Combat: the backend is live and Premium-gated, but nothing offers it", () => {
    const team = benefitById("team-combat")!;
    expect(team.status).toBe("partial");
    expect(team.enforcement).toBe("backend");
    expect(team.userFacingSummary).toBeNull();
    expect(team.discrepancy).toMatch(/VITE_TEAM_SIM_ENABLED|reachable by nobody/);
  });

  it("flags the sales claims that describe nothing, rather than normalising them", () => {
    for (const id of ["curated-learning-journeys", "earned-matchup-cards"]) {
      const b = benefitById(id)!;
      expect(b.status).toBe("planned");
      expect(b.userFacingSummary).toBeNull();
      expect(b.discrepancy).toBeTruthy();
    }
  });

  it("flags every contradiction it knows about", () => {
    const ids = discrepancies().map((b) => b.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "combat-lab-1v1",
        "team-combat",
        "profile-frames",
        "ad-free",
        "curated-learning-journeys",
        "earned-matchup-cards",
      ]),
    );
  });
});

describe("PHASE 6 — analytics rows match PT1.11/PT1.12 exactly", () => {
  const snapshot = benefitById("performance-snapshot")!;
  const trends = benefitById("performance-trends")!;
  const weak = benefitById("recurring-weaknesses")!;

  it("does not call the snapshot 'Free analytics'", () => {
    // The forbidden simplification: a tier name where a scope belongs.
    for (const b of [snapshot, trends, weak]) {
      expect(`${b.label} ${b.userFacingSummary ?? ""}`).not.toMatch(/free analytics|premium analytics/i);
    }
  });

  it("gives Free the recent-performance snapshot, bounded by ANSWERS not days", () => {
    expect(snapshot.differentiator).toBe(false);
    expect(snapshot.free).toMatch(/50/);
    expect(snapshot.free).toMatch(/answers/i);
    expect(snapshot.free).toMatch(/accuracy/i);
    expect(snapshot.free).toMatch(/days studied/i);
    expect(snapshot.free).toMatch(/per category/i);
    expect(snapshot.free).toMatch(/per mode/i);
    // Low-sample handling is part of the Free promise, not a Premium nicety.
    expect(snapshot.free).toMatch(/too few answers/i);
    // And it is genuinely on the Free page.
    expect(freeBenefits().map((b) => b.id)).toContain("performance-snapshot");
  });

  it("gives Premium the windows, the comparison and the direction", () => {
    expect(trends.differentiator).toBe(true);
    expect(trends.premium).toMatch(/7, 30 or 90/);
    expect(trends.premium).toMatch(/period before/i);
    expect(trends.premium).toMatch(/improving, steady or declining/i);
    expect(trends.free).toMatch(/No windows and no comparison/i);
  });

  it("gives Premium the recurring-weakness diagnosis and the Practice handoff", () => {
    expect(weak.differentiator).toBe(true);
    expect(weak.premium).toMatch(/both periods/i);
    expect(weak.premium).toMatch(/Practice Builder/);
    expect(weak.enforcementNote).toMatch(/trends-practise-all/);
    expect(weak.enforcementNote).toMatch(/pool:'weak'/);
    expect(weak.enforcementNote).toMatch(/pool:'bank', category/);
  });

  it("states the scope on every analytics row that has one", () => {
    // PT1.8: the record read is Practice + Time Trial. Ranked is not in it,
    // and an unscoped "your accuracy" is a promise about every mode.
    for (const b of [snapshot, trends]) {
      expect(b.caveat, b.id).toMatch(/Ranked rounds are not included/);
    }
  });

  it("keeps the snapshot on Premium too — a lapse removes the reading, not the figures", () => {
    expect(snapshot.premium).toMatch(/same figures/i);
  });
});

describe("PHASE 7 — history and review, as actually implemented", () => {
  it("limits Free history to the 10 most recent sessions", () => {
    const h = benefitById("study-history")!;
    expect(h.free).toMatch(/10 most recent/);
    expect(h.enforcement).toBe("backend");
    expect(h.enforcementNote).toMatch(/FREE_HISTORY_LIMIT = 10/);
  });

  it("locks the missed BANK but not per-session missed review", () => {
    const m = benefitById("missed-question-bank")!;
    expect(m.differentiator).toBe(true);
    expect(m.free).toMatch(/results screen/i);
    expect(m.enforcementNote).toMatch(/no attempt data/i);
  });

  it("keeps discovered questions Free and permanent — an account, never Premium", () => {
    const lib = benefitById("question-library")!;
    expect(lib.differentiator).toBe(false);
    expect(lib.enforcement).toBe("none");
    expect(lib.enforcementNote).toMatch(/ACCOUNT_REQUIRED/);
  });

  it("records that a lapse keeps saved sets readable, renameable and deletable", () => {
    const s = benefitById("saved-practice-sets")!;
    expect(s.free).toMatch(/renameable and deletable/i);
    expect(s.enforcementNote).toMatch(/a lapse destroys nothing/);
  });
});

describe("the anti-claims — rows where Premium adds nothing", () => {
  it("does not sell the 1v1 Combat Lab, which is free and unlimited", () => {
    const c = benefitById("combat-lab-1v1")!;
    expect(c.differentiator).toBe(false);
    expect(premiumBenefits().map((b) => b.id)).not.toContain("combat-lab-1v1");
    expect(freeBenefits().map((b) => b.id)).toContain("combat-lab-1v1");
  });

  it("does not sell Ranked, Time Trial, the practice sets or Pro Play", () => {
    const sold = new Set(premiumBenefits().map((b) => b.id));
    for (const id of ["ranked", "time-trial", "practice-packs", "pro-play"]) {
      expect(sold.has(id), id).toBe(false);
    }
  });

  it("keeps 'ad-free' out of the sales list while no ads are served", () => {
    const ads = benefitById("ad-free")!;
    expect(ads.enforcement).toBe("inert");
    expect(ads.userFacingSummary).toBeNull();
  });
});

describe("PHASE 8 — upsell metadata exists, and nothing places it", () => {
  it("only ever proposes shipped, differentiating, marketable benefits", () => {
    const sellable = new Set(premiumBenefits().map((b) => b.id));
    for (const b of upsellEligible()) expect(sellable.has(b.id), b.id).toBe(true);
  });

  it("gives every eligible benefit a CTA, a value line and at least one surface", () => {
    for (const b of upsellEligible()) {
      expect(b.upsell!.cta.length, b.id).toBeGreaterThan(0);
      expect(b.upsell!.cta.length, b.id).toBeLessThanOrEqual(28);
      expect(b.upsell!.value.length, b.id).toBeGreaterThan(0);
      expect(b.upsell!.surfaces.length, b.id).toBeGreaterThan(0);
      // A price on an upsell is the sales page's job, not a banner's.
      expect(`${b.upsell!.cta} ${b.upsell!.value}`).not.toMatch(/\$|\d+\.\d\d/);
    }
  });

  it("can answer 'what belongs on this surface' without any placement existing", () => {
    expect(upsellsForSurface("trends-pane").map((b) => b.id)).toContain("performance-trends");
    expect(upsellsForSurface("history-pane").map((b) => b.id)).toEqual(["study-history"]);
    expect(upsellsForSurface("nowhere-at-all")).toEqual([]);
  });
});

describe("grouping", () => {
  it("returns only groups that have something to show, in canonical order", () => {
    const shown = populatedGroups().map((g) => g.id);
    const order = BENEFIT_GROUPS.map((g) => g.id).filter((id) => shown.includes(id));
    expect(shown).toEqual(order);
    for (const g of shown) expect(benefitsInGroup(g).length).toBeGreaterThan(0);
  });

  it("partitions the presentable rows exactly once between Free and Premium", () => {
    const total = presentableBenefits().length;
    expect(premiumBenefits().length + freeBenefits().length).toBe(total);
  });
});

describe("SAFETY — this is presentation data and nothing may gate on it", () => {
  /** Every .ts/.tsx under src, except the matrix and its own test. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "node_modules") sourceFiles(full, out);
      } else if (/\.tsx?$/.test(name)) {
        out.push(full);
      }
    }
    return out;
  }

  const importers = sourceFiles(join(process.cwd(), "src")).filter((f) => {
    if (f.includes(join("src", "lib", "premium", "matrix"))) return false;
    return /from\s+["']@\/lib\/premium\/matrix["']/.test(readFileSync(f, "utf8"));
  });

  it("is imported only by surfaces that DESCRIBE the product", () => {
    // Add a file here only after confirming it renders copy. A gate, a
    // fetch wrapper, a route guard or an entitlement helper must never
    // appear: a client-side entitlement is not an entitlement, and the
    // authority is services/entitlement.py plus @/lib/pro/entitlement.
    const allowed = [
      join("src", "pages", "LolPremium.tsx"),
      join("src", "pages", "LolPremium.test.tsx"),
      join("src", "pages", "AdminAbout.tsx"),
      // PT1.5's commercial-identity fence follows the copy it guards.
      join("src", "test", "security", "pt15CommercialOfferIdentity.test.ts"),
    ];
    for (const f of importers) {
      expect(allowed.some((a) => f.endsWith(a)), f).toBe(true);
    }
  });

  it("exports no entitlement decision of its own", () => {
    const raw = readFileSync(join(process.cwd(), "src/lib/premium/matrix.ts"), "utf8");
    // Strip comments and string literals first: the file DESCRIBES gates in
    // prose (`isPro ? selectedFrame`, `services/entitlement.py`) and must be
    // free to, so what is checked is the executable half only.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    // No resolver, no boolean answer about a caller, no token, no fetch.
    expect(code).not.toMatch(/\bfetch\s*\(|supabase|isPro\b|effectivePro|access_token/);
    expect(code).not.toMatch(/export function (can|is|has|require)[A-Z]/);
  });
});
