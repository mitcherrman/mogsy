/**
 * Production-corpus certification for the Catch-Up domain.
 *
 * Corpus: the 10 production patch reports 26.10–26.19 (captured 2026-10-04,
 * trimmed to the fields the domain reads), against the committed PH3-A fixture
 * (`ph3a-continuity-fixture.json`, from audit commit 3f3eec28).
 *
 * Two invariants are asserted everywhere they can be:
 *   A. RIOT COVERAGE — every input line of every in-range patch is returned
 *      exactly once.
 *   B. MOGZY CHAINS  — only the five PH3-A-proven relationships exist.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { buildCatchUpReport, buildCatchUpReportInternal } from "./build";
import { VERIFIED_ALIASES } from "./aliases";
import { continuityKeyString } from "./keys";
import { comparePatchVersions } from "./patch-range";
import {
  CORPUS_RAW,
  CORPUS_VERSIONS,
  PH3A,
  corpusReports,
  deepFreeze,
  type Ph3aCandidate,
} from "./test-support";
import type { CatchUpParameterChain, CatchUpReport, CatchUpRiotLine } from "./types";

const REPORTS = deepFreeze(corpusReports());
const LISTED = CORPUS_VERSIONS;

/** Patch before the first listed one: includes the whole corpus (the floor is included). */
const BELOW_FLOOR = "26.9";

function run(since: string, through: string, o: { aliases?: typeof VERIFIED_ALIASES } = {}) {
  const res = buildCatchUpReport({
    reports: REPORTS,
    sincePatch: since,
    throughPatch: through,
    listedVersions: LISTED,
    ...(o.aliases ? { aliases: o.aliases } : {}),
  });
  if (res.ok === false) throw new Error(`range invalid: ${res.detail}`);
  return res.report;
}

const FULL = run(BELOW_FLOOR, "26.19");

/* -------------------------------------------------------------------------- */
/* Fixture integrity                                                          */
/* -------------------------------------------------------------------------- */

/** Key-sorted compact JSON, so the hash is independent of key order and whitespace. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of each TRIMMED report (the fields the domain reads), pinned at capture time. */
const TRIMMED_SHA256: Record<string, string> = {
  "26.10": "dda8d4091e6df5308831b34d4834acfe64337b22489aef5f2f2517eade467ca0",
  "26.11": "2528d23209cf6c7d1ef42efaf81d2851722ceeab44c1b1e427ab4195a5a84cfd",
  "26.12": "ffadf37edbcc8da2ea12ea1ce8761ea5cd90739736562117745b347e199795ed",
  "26.13": "3d72441c30b990672733c84f5b1ac52fdf55faf1d6956f64cb434f3c008b3440",
  "26.14": "b014ec1d525b4714efb13fc15d8005307604d7dc7d14f2e3383b983a0b21abca",
  "26.15": "d56efaa388a96f678a6e4e147ddd386aa67a39a4431853273a45ffebc4b8d8d9",
  "26.16": "7b675194ab405a63a5c37a13e527bd01f88c7b72420ac8ea057835b71f072063",
  "26.17": "ea728df153e95b22da64ec01de2b8a4f104b08a1b2fdbf86f3ce9064ef6d7fad",
  "26.18": "b7e3c062d862552a65955bfff749465f875c2a5e1e0c6e7f8e246f27ec58f5f7",
  "26.19": "68c8fa59477534ab4734203b06bd3f702ed0cd30619de45249affef96c90c057",
};

/** PH3-A §2 inventory: cards and lines per patch. */
const INVENTORY: Record<string, { cards: number; lines: number }> = {
  "26.10": { cards: 50, lines: 156 },
  "26.11": { cards: 87, lines: 173 },
  "26.12": { cards: 172, lines: 231 },
  "26.13": { cards: 72, lines: 130 },
  "26.14": { cards: 46, lines: 98 },
  "26.15": { cards: 86, lines: 201 },
  "26.16": { cards: 90, lines: 261 },
  "26.17": { cards: 44, lines: 202 },
  "26.18": { cards: 21, lines: 109 },
  "26.19": { cards: 50, lines: 214 },
};

describe("corpus fixture integrity", () => {
  it("pins the trimmed reports (SHA-256) and the PH3-A inventory", () => {
    expect(Object.keys(CORPUS_RAW.reports)).toEqual(CORPUS_VERSIONS);
    for (const version of CORPUS_VERSIONS) {
      const hash = createHash("sha256")
        .update(stableStringify(CORPUS_RAW.reports[version]))
        .digest("hex");
      expect(hash, version).toBe(TRIMMED_SHA256[version]);
      const report = REPORTS.find((r) => r.patch_version === version) as PatchReportDetail;
      expect(report.cards.length, version).toBe(INVENTORY[version].cards);
      expect(report.cards.reduce((n, c) => n + c.changes.length, 0), version).toBe(
        INVENTORY[version].lines,
      );
    }
  });

  it("records the PH3-A full-body hashes it was captured against", () => {
    expect(CORPUS_RAW.fullBodySha256).toEqual(PH3A.report_sha256);
  });

  it("is 718 cards and 1,775 lines; SR scope is 376 lines on 153 cards and 113 entities", () => {
    const cards = REPORTS.flatMap((r) => r.cards);
    expect(cards).toHaveLength(718);
    expect(cards.reduce((n, c) => n + c.changes.length, 0)).toBe(1775);
    const sr = cards.filter(
      (c) =>
        (c.section_id === "patch-champions" && c.entity_type === "champion") ||
        (c.section_id === "patch-items" && c.entity_type === "item"),
    );
    expect(sr).toHaveLength(153);
    expect(sr.reduce((n, c) => n + c.changes.length, 0)).toBe(376);
    expect(new Set(sr.map((c) => `${c.entity_type}|${c.entity_name}`)).size).toBe(113);
  });
});

/* -------------------------------------------------------------------------- */
/* Invariant A — Riot coverage                                                */
/* -------------------------------------------------------------------------- */

describe("invariant A: every Riot line in range is returned exactly once", () => {
  const linesOf = (r: PatchReportDetail) => r.cards.flatMap((c) => c.changes);

  function expectCoverage(report: CatchUpReport, since: string, through: string) {
    const inRange = REPORTS.filter(
      (r) =>
        (comparePatchVersions(r.patch_version, since) ?? 0) > 0 &&
        (comparePatchVersions(r.patch_version, through) ?? 0) <= 0,
    );
    const expected = inRange.flatMap(linesOf);
    expect(report.lines).toHaveLength(expected.length);
    expect(new Set(report.lines.map((l) => l.id)).size).toBe(expected.length);
    // Every payload change object appears exactly once, by reference.
    const seen = new Map<unknown, number>();
    for (const line of report.lines) seen.set(line.change, (seen.get(line.change) ?? 0) + 1);
    expect(seen.size).toBe(expected.length);
    for (const change of expected) expect(seen.get(change), "line missing or duplicated").toBe(1);
    expect(report.totals.riotLines).toBe(expected.length);
    expect(report.includedPatches).toEqual(inRange.map((r) => r.patch_version));
  }

  it("the whole corpus: 1,775 lines, per-patch counts match PH3-A", () => {
    expectCoverage(FULL, BELOW_FLOOR, "26.19");
    expect(FULL.totals.riotLines).toBe(1775);
    for (const version of CORPUS_VERSIONS) {
      expect(FULL.lines.filter((l) => l.patch === version)).toHaveLength(INVENTORY[version].lines);
    }
    expect(FULL.range.clampedToCoverageFloor).toBe(true);
    expect(FULL.coverage.complete).toBe(true);
  });

  it("all 45 PH3-A ranges (since, end]", () => {
    expect(PH3A.expected_chains_by_range).toHaveLength(45);
    for (const { since, end } of PH3A.expected_chains_by_range) {
      expectCoverage(run(since, end), since, end);
    }
  });

  it("X excluded / Y included: since 26.10 drops exactly the 156 lines of 26.10", () => {
    const r = run("26.10", "26.19");
    expect(r.totals.riotLines).toBe(1775 - 156);
    expect(r.includedPatches[0]).toBe("26.11");
    expect(r.includedPatches.at(-1)).toBe("26.19");
    expect(run("26.17", "26.18").totals.riotLines).toBe(109); // 26.18 only
  });

  it("no changes in the interval: since === through is up to date", () => {
    const r = run("26.19", "26.19");
    expect(r.range.status).toBe("up_to_date");
    expect(r.lines).toEqual([]);
    expect(r.continuity.chains).toEqual([]);
  });

  it("lines are chronological and keep each patch's original payload order grouping", () => {
    const patchOrder = FULL.lines.map((l) => l.patchOrdinal);
    expect(patchOrder).toEqual([...patchOrder].sort((a, b) => a - b));
    expect(FULL.lines.map((l) => l.order)).toEqual(FULL.lines.map((_, i) => i));
  });

  it("every entity lists all of its lines; entity lines sum to the report lines", () => {
    expect(FULL.entities.reduce((n, e) => n + e.riotLines.length, 0)).toBe(1775);
    const srEntities = FULL.entities.filter((e) => e.scope !== null);
    expect(srEntities).toHaveLength(113);
    expect(srEntities.filter((e) => e.scope === "sr.champions")).toHaveLength(85);
    expect(srEntities.filter((e) => e.scope === "sr.items")).toHaveLength(28);
  });

  it("cards with no change lines are reported, never dropped", () => {
    expect(FULL.cardsWithoutChanges.length).toBeGreaterThan(0);
    const emptyCards = REPORTS.flatMap((r) => r.cards).filter((c) => c.changes.length === 0);
    expect(FULL.cardsWithoutChanges).toHaveLength(emptyCards.length);
  });

  it("SR content published in Systems and Support Adjustments stays visible as Riot lines", () => {
    const keys = FULL.sections.map((s) => s.key);
    expect(keys).toContain("patch-systems");
    expect(keys).toContain("patch-support-adjustments");
    const unchainable = FULL.sections.filter((s) => !s.chainable).reduce((n, s) => n + s.lineCount, 0);
    expect(unchainable).toBe(1775 - 376);
    expect(FULL.totals.chainedLines).toBeLessThan(FULL.totals.riotLines);
  });

  it("the report is deterministic under shuffled report order", () => {
    const shuffled = [...REPORTS].sort((a, b) => (a.patch_version < b.patch_version ? 1 : -1));
    const res = buildCatchUpReport({
      reports: shuffled,
      sincePatch: BELOW_FLOOR,
      throughPatch: "26.19",
      listedVersions: [...LISTED].reverse(),
    });
    if (res.ok === false) throw new Error("range");
    expect(res.report).toEqual(FULL);
  });
});

/* -------------------------------------------------------------------------- */
/* Invariant B — exactly the five proven chains                               */
/* -------------------------------------------------------------------------- */

const IDENTITIES = {
  doran: JSON.stringify(["sr.items", "doran's helm", null, "", "health"]),
  belveth: JSON.stringify(["sr.champions", "bel'veth", null, "base stats", "health growth"]),
  sundered: JSON.stringify(["sr.items", "sundered sky", null, "", "health"]),
  sylas: JSON.stringify(["sr.champions", "sylas", "Q", "q - chain lash", "initial damage"]),
  mordekaiser: JSON.stringify(["sr.champions", "mordekaiser", "R", "r - realm of death", "stat steal"]),
};

/** PH3-A classification names → Catch-Up value states. */
const STATE_OF: Record<string, string> = { exact_undo: "returns_to_start_value", continued: "changed" };

const stepSignature = (c: CatchUpParameterChain) =>
  c.steps.map((s) => [s.patch, s.change.group_title, s.change.property_name, s.change.before_raw, s.change.after_raw]);

describe("invariant B: only the PH3-A-proven chains exist", () => {
  it("the full range yields exactly five chains with exactly these identities", () => {
    expect(FULL.continuity.status).toBe("available");
    expect(FULL.continuity.chains.map((c) => c.identity).sort()).toEqual(
      Object.values(IDENTITIES).sort(),
    );
    expect(FULL.totals.chains).toBe(5);
    expect(FULL.totals.chainedLines).toBe(10);
    // No identity-level refusal anywhere in the production corpus.
    expect(FULL.continuity.unclassified).toEqual([]);
    expect(FULL.continuity.refusals).toEqual([]);
    expect(FULL.lines.every((l) => l.identityRefusal === null)).toBe(true);
  });

  it("matches PH3-A expected_links (basis, patches, raw endpoints)", () => {
    expect(PH3A.expected_links).toHaveLength(5);
    for (const link of PH3A.expected_links) {
      const chain = FULL.continuity.chains.find(
        (c) => c.entityName === link.entity && c.scope === link.scope,
      );
      expect(chain, link.entity).toBeDefined();
      if (!chain) continue;
      expect(chain.steps).toHaveLength(2);
      const [a, b] = chain.steps;
      for (const [step, ref] of [[a, link.a], [b, link.b]] as const) {
        expect(step.patch).toBe(ref.patch);
        expect(step.change.group_title).toBe(ref.group);
        expect(step.change.property_name).toBe(ref.property);
        expect(step.change.before_raw).toBe(ref.before);
        expect(step.change.after_raw).toBe(ref.after);
        expect(step.before.raw).toBe(ref.before);
        expect(step.after.raw).toBe(ref.after);
      }
      expect(chain.identityProvenance).toBe(link.tier === "A" ? "exact" : "approved_alias");
      if (link.tier === "B") {
        const aliasId = link.reason.replace("verified_alias:", "");
        expect(chain.linkBasis).toEqual([{ kind: "approved_alias", aliasId }]);
      }
    }
  });

  it("aliases off: exactly the three Tier A chains", () => {
    const r = run(BELOW_FLOOR, "26.19", { aliases: [] });
    expect(r.continuity.chains.map((c) => c.identity).sort()).toEqual(
      [IDENTITIES.doran, IDENTITIES.belveth, IDENTITIES.sundered].sort(),
    );
    expect(r.continuity.chains.every((c) => c.identityProvenance === "exact")).toBe(true);
    expect(r.continuity.aliases).toEqual([]);
  });

  it("the alias registry is exactly Sylas Q and Mordekaiser R, and both link", () => {
    expect(VERIFIED_ALIASES.map((a) => a.id)).toEqual([
      "sylas-q-26.12-26.15",
      "mordekaiser-r-26.14-26.15",
    ]);
    expect(FULL.continuity.aliases).toEqual([
      { aliasId: "sylas-q-26.12-26.15", status: "linked" },
      { aliasId: "mordekaiser-r-26.14-26.15", status: "linked" },
    ]);
  });

  it("value states and net values", () => {
    const byEntity = Object.fromEntries(FULL.continuity.chains.map((c) => [c.entityName, c]));
    expect(byEntity["Bel'Veth"].valueState).toBe("returns_to_start_value");
    expect(byEntity["Sundered Sky"].valueState).toBe("returns_to_start_value");
    expect(byEntity["Sylas"].valueState).toBe("returns_to_start_value");
    expect(byEntity["Mordekaiser"].valueState).toBe("returns_to_start_value");
    expect(byEntity["Doran's Helm"].valueState).toBe("changed");
    expect(byEntity["Doran's Helm"].net).toMatchObject({
      startPatch: "26.10",
      endPatch: "26.13",
      startRaw: "110",
      endRaw: "150",
      components: [{ start: "110", end: "150", delta: "40" }],
    });
    expect(byEntity["Bel'Veth"].net).toMatchObject({ startRaw: "105", endRaw: "105" });
    expect(byEntity["Mordekaiser"].net).toMatchObject({ startRaw: "10%", endRaw: "10%" });
    for (const c of FULL.continuity.chains) expect(c.netUnavailableReason).toBeNull();
  });

  it("concurrentMechanical: true for Mordekaiser R and Bel'Veth Health Growth, false for the rest", () => {
    const flags = Object.fromEntries(FULL.continuity.chains.map((c) => [c.entityName, c.concurrentMechanical]));
    expect(flags).toEqual({
      "Doran's Helm": false,
      "Bel'Veth": true,
      "Sundered Sky": false,
      Sylas: false,
      Mordekaiser: true,
    });
  });

  it("all 45 PH3-A ranges: identical chain identity, steps and value state", () => {
    for (const { since, end, chains: expected } of PH3A.expected_chains_by_range) {
      const r = run(since, end);
      const got = r.continuity.chains.map((c) => ({
        entity: c.entityName,
        scope: c.scope,
        steps: stepSignature(c),
        tiers: [c.identityProvenance === "exact" ? "A" : "B"],
        state: c.valueState,
      }));
      const want = expected.map((e) => ({
        entity: e.entity,
        scope: e.scope,
        steps: e.steps.map((s) => [s.patch, s.group, s.property, s.before, s.after]),
        tiers: e.tiers,
        state: STATE_OF[e.classification],
      }));
      const order = (x: { entity: string }, y: { entity: string }) => (x.entity < y.entity ? -1 : 1);
      expect(got.sort(order), `${since}→${end}`).toEqual(want.sort(order));
    }
  });

  it("Doran's Helm appears only when the baseline predates 26.10", () => {
    const withDoran = (r: CatchUpReport) => r.continuity.chains.some((c) => c.entityName === "Doran's Helm");
    expect(withDoran(run("26.9", "26.19"))).toBe(true);
    expect(withDoran(run("26.10", "26.19"))).toBe(false);
  });

  it("a chain only exists when both steps are inside the range", () => {
    // Sylas 26.12 → 26.15: cut by X = 26.12 or by Y = 26.14.
    const has = (r: CatchUpReport, name: string) => r.continuity.chains.some((c) => c.entityName === name);
    expect(has(run("26.11", "26.15"), "Sylas")).toBe(true);
    expect(has(run("26.12", "26.15"), "Sylas")).toBe(false);
    expect(has(run("26.11", "26.14"), "Sylas")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Every PH3-A candidate that is not proven produces no relationship          */
/* -------------------------------------------------------------------------- */

function linesMatching(
  r: CatchUpReport,
  c: Ph3aCandidate,
  side: "a" | "b",
): CatchUpRiotLine[] {
  const patch = side === "a" ? c.a_patch : c.b_patch;
  const group = side === "a" ? c.a_group : c.b_group;
  const prop = side === "a" ? c.a_prop : c.b_prop;
  const before = side === "a" ? c.a_before : c.b_before;
  const after = side === "a" ? c.a_after : c.b_after;
  return r.lines.filter(
    (l) =>
      l.patch === patch &&
      l.entityName === c.entity &&
      l.groupTitle === group &&
      l.change.property_name === prop &&
      l.change.before_raw === before &&
      l.change.after_raw === after &&
      l.key !== null &&
      l.key.scope === c.scope,
  );
}

describe("PH3-A candidate table", () => {
  const unproven = PH3A.candidate_table.filter((c) => c.verdict !== "proven");

  it("has 93 candidates: 5 proven, 8 plausible-unsafe, 5 unclassifiable, 75 rejected", () => {
    expect(PH3A.candidate_table).toHaveLength(93);
    expect(PH3A.candidate_table.filter((c) => c.verdict === "proven")).toHaveLength(5);
    expect(unproven).toHaveLength(88);
  });

  it("every candidate pair is locatable in the corpus (the fixture and corpus agree)", () => {
    for (const c of PH3A.candidate_table) {
      expect(linesMatching(FULL, c, "a").length, `${c.entity} ${c.a_patch} ${c.a_prop}`).toBeGreaterThan(0);
      expect(linesMatching(FULL, c, "b").length, `${c.entity} ${c.b_patch} ${c.b_prop}`).toBeGreaterThan(0);
    }
  });

  it("the 5 proven candidates are chained, and the 88 others never share a chain", () => {
    let chained = 0;
    for (const c of PH3A.candidate_table) {
      const aLines = linesMatching(FULL, c, "a");
      const bLines = linesMatching(FULL, c, "b");
      const together = FULL.continuity.chains.some(
        (chain) =>
          chain.steps.some((s) => aLines.includes(s.line)) &&
          chain.steps.some((s) => bLines.includes(s.line)),
      );
      if (c.verdict === "proven") {
        expect(together, `${c.entity} should chain`).toBe(true);
        chained += 1;
      } else {
        expect(together, `${c.entity} ${c.a_prop} → ${c.b_prop} must NOT chain`).toBe(false);
      }
    }
    expect(chained).toBe(5);
  });

  it("holds with aliases off too (the plausible-unsafe renames stay unlinked either way)", () => {
    const r = run(BELOW_FLOOR, "26.19", { aliases: [] });
    for (const c of unproven) {
      const aLines = linesMatching(r, c, "a");
      const bLines = linesMatching(r, c, "b");
      const together = r.continuity.chains.some(
        (chain) =>
          chain.steps.some((s) => aLines.includes(s.line)) &&
          chain.steps.some((s) => bLines.includes(s.line)),
      );
      expect(together).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Named false-positive fences                                                */
/* -------------------------------------------------------------------------- */

describe("false-positive fences", () => {
  const pick = (patch: string, entity: string, property: string, section?: string) => {
    const hits = FULL.lines.filter(
      (l) =>
        l.patch === patch &&
        l.entityName.startsWith(entity) &&
        l.change.property_name === property &&
        (section === undefined || l.sectionKey === section),
    );
    expect(hits, `${patch} ${entity} ${property}`).toHaveLength(1);
    return hits[0];
  };

  const expectSeparate = (a: CatchUpRiotLine, b: CatchUpRiotLine) => {
    expect(a.chainId).toBeNull();
    expect(b.chainId).toBeNull();
    expect(a.eligibility).toEqual({ status: "out_of_scope" });
    expect(b.eligibility).toEqual({ status: "out_of_scope" });
  };

  it("Arena Protein Shake: 'Heal Shield Power' 25→15 vs 'Base Health Scaling' 15→25", () => {
    const a = pick("26.11", "Protein Shake", "Heal Shield Power:");
    const b = pick("26.19", "Protein Shake", "Base Health Scaling");
    expect([a.change.before_raw, a.change.after_raw]).toEqual(["25", "15"]);
    expect([b.change.before_raw, b.change.after_raw]).toEqual(["15", "25"]);
    expectSeparate(a, b);
  });

  it("Arena Serylda's Grudge: 'Slow Amount' vs 'Slow Threshold'", () => {
    const a = pick("26.12", "Serylda's Grudge", "Slow Amount:");
    const b = pick("26.17", "Serylda's Grudge", "Slow Threshold");
    expectSeparate(a, b);
  });

  it("Classic — General: Cast Range → Missile Range and Attack Damage → Missile Width", () => {
    const castRange = pick("26.17", "Classic", "Cast Range", "patch-classic");
    const missileRange = pick("26.19", "Classic", "Missile Range", "patch-classic");
    const attackDamage = pick("26.17", "Classic", "Attack Damage", "patch-classic");
    const missileWidth = pick("26.19", "Classic", "Missile Width", "patch-classic");
    expect(castRange.change.after_raw).toBe(missileRange.change.before_raw);
    expect(attackDamage.change.after_raw).toBe(missileWidth.change.before_raw);
    expectSeparate(castRange, missileRange);
    expectSeparate(attackDamage, missileWidth);
  });

  it("SR Locke vs Arena Locke: the equal-valued collision never links", () => {
    const sr = pick("26.14", "Locke", "Damage Taken Grey Health Cap", "patch-champions");
    const arena = pick("26.15", "Locke", "Base Health Restored", "patch-arena");
    expect(sr.change.after_raw).toBe(arena.change.before_raw);
    expect(sr.chainId).toBeNull();
    expect(arena.chainId).toBeNull();
    expect(sr.entityKey).not.toBe(arena.entityKey);
    expect(arena.eligibility).toEqual({ status: "out_of_scope" });
  });

  it("26.15 Riven: two R groups with the same property are distinct keys and both unchained", () => {
    const hits = FULL.lines.filter(
      (l) => l.patch === "26.15" && l.entityName === "Riven" && l.change.property_name === "Bonus Attack Damage Ratio",
    );
    expect(hits).toHaveLength(2);
    const keys = hits.map((l) => continuityKeyString(l.key as NonNullable<typeof l.key>));
    expect(new Set(keys).size).toBe(2);
    expect(hits.map((l) => l.change.ability_slot)).toEqual(["R", "R"]);
    for (const l of hits) {
      expect(l.chainId).toBeNull();
      expect(l.eligibility).toEqual({ status: "candidate" }); // unique per group, so not ambiguous
    }
  });

  it("Bel'Veth R, Poppy Q ×2, Qiyana, Xin Zhao, Locke, LeBlanc, Naafiri, Senna and Quinn stay unlinked", () => {
    for (const name of ["Poppy", "Qiyana", "Xin Zhao", "LeBlanc", "Naafiri", "Senna", "Quinn"]) {
      const chained = FULL.continuity.chains.filter((c) => c.entityName === name);
      expect(chained, name).toEqual([]);
    }
    // Bel'Veth chains Health Growth only, never R.
    const belveth = FULL.continuity.chains.filter((c) => c.entityName === "Bel'Veth");
    expect(belveth).toHaveLength(1);
    expect(belveth[0].keys.map((k) => k.property)).toEqual(["health growth"]);
    // Locke has no chain at all.
    expect(FULL.continuity.chains.filter((c) => c.entityName === "Locke")).toEqual([]);
  });

  it("Imperial Mandate (Support Adjustments → Items) is not chained, but both lines are returned", () => {
    const sa = FULL.lines.filter(
      (l) => l.entityName === "Imperial Mandate" && l.sectionKey === "patch-support-adjustments",
    );
    const items = FULL.lines.filter(
      (l) => l.entityName === "Imperial Mandate" && l.sectionKey === "patch-items",
    );
    expect(sa.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
    expect(FULL.continuity.chains.some((c) => c.entityName === "Imperial Mandate")).toBe(false);
  });

  it("the 7 in-scope value-ineligible lines are refused value_ineligible, not chained", () => {
    const refused = FULL.lines.filter(
      (l) => l.eligibility.status === "refused" && l.eligibility.reason === "value_ineligible",
    );
    expect(refused).toHaveLength(7);
    expect(refused.every((l) => l.chainId === null)).toBe(true);
    const byEntity: Record<string, number> = {};
    for (const l of refused) byEntity[l.entityName] = (byEntity[l.entityName] ?? 0) + 1;
    expect(byEntity).toEqual({ "Bel'Veth": 5, Senna: 1, Viego: 1 });
  });

  it("line-level gates account for every SR line", () => {
    const reasons: Record<string, number> = {};
    for (const l of FULL.lines) {
      const k = l.eligibility.status === "refused" ? l.eligibility.reason : l.eligibility.status;
      reasons[k] = (reasons[k] ?? 0) + 1;
    }
    expect(reasons).toEqual({
      candidate: 351,
      not_numeric: 17, // 16 prose lines + Zeri 26.10 R, a blank-property mechanical line
      value_ineligible: 7,
      no_op_line: 1, // Cassiopeia E "Total Ability Power Ratio" 65% → 65% (26.18)
      out_of_scope: 1399,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Scope allowlist removed (PH3-A §6A last row, §15 assertion 3)              */
/* -------------------------------------------------------------------------- */

describe("with the scope allowlist removed the exact-key and ambiguity gates still hold", () => {
  const res = buildCatchUpReportInternal(
    {
      reports: REPORTS,
      sincePatch: BELOW_FLOOR,
      throughPatch: "26.19",
      listedVersions: LISTED,
      aliases: [],
    },
    { resolveScope: (card) => `test:${card.section_id}|${card.entity_type}` },
  );
  if (res.ok === false) throw new Error("range");
  const r = res.report;

  it("still exactly the 3 Tier A chains, in every section, with 0 false", () => {
    expect(r.continuity.chains).toHaveLength(3);
    expect(r.continuity.chains.map((c) => c.entityName).sort()).toEqual(
      ["Bel'Veth", "Doran's Helm", "Sundered Sky"].sort(),
    );
    expect(r.totals.riotLines).toBe(1775);
  });

  it("none of the four prior-rule false positives chains, in any mode", () => {
    for (const [entity, props] of [
      ["Protein Shake", ["Heal Shield Power:", "Base Health Scaling"]],
      ["Serylda's Grudge", ["Slow Amount:", "Slow Threshold"]],
      ["Classic", ["Cast Range", "Missile Range", "Attack Damage", "Missile Width"]],
    ] as const) {
      const lines = r.lines.filter(
        (l) => l.entityName.startsWith(entity) && (props as readonly string[]).includes(l.change.property_name),
      );
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => l.chainId === null)).toBe(true);
    }
  });

  it("repeated keys inside a patch are refused as ambiguous rather than picked", () => {
    const ambiguous = r.lines.filter(
      (l) => l.eligibility.status === "refused" && l.eligibility.reason === "key_ambiguous_in_patch",
    );
    expect(ambiguous.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Coverage failures on real data                                             */
/* -------------------------------------------------------------------------- */

describe("coverage failures on the real corpus", () => {
  it("a failed 26.14 load withholds continuity everywhere but keeps every other Riot line", () => {
    const without = REPORTS.filter((r) => r.patch_version !== "26.14");
    const res = buildCatchUpReport({
      reports: without,
      sincePatch: "26.12",
      throughPatch: "26.19",
      listedVersions: LISTED,
    });
    if (res.ok === false) throw new Error("range");
    const r = res.report;
    expect(r.coverage.missingPatches).toEqual(["26.14"]);
    expect(r.continuity).toMatchObject({ status: "withheld", withheldReasons: ["missing_report"], chains: [] });
    expect(r.totals.riotLines).toBe(130 + 201 + 261 + 202 + 109 + 214); // everything but 26.14
    expect(r.lines.every((l) => l.chainId === null)).toBe(true);
  });

  it("dropping an unlisted report leaves an ordinal gap and withholds continuity", () => {
    const without = REPORTS.filter((r) => r.patch_version !== "26.16");
    const res = buildCatchUpReport({
      reports: without,
      sincePatch: "26.14",
      throughPatch: "26.19",
      listedVersions: LISTED.filter((v) => v !== "26.16"),
    });
    if (res.ok === false) throw new Error("range");
    expect(res.report.coverage.issues.map((i) => i.kind)).toContain("ordinal_gap");
    expect(res.report.continuity.status).toBe("withheld");
    expect(res.report.continuity.chains).toEqual([]);
  });
});
