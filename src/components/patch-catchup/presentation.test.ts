import { describe, expect, it } from "vitest";
import { buildCatchUpReport, type CatchUpParameterChain, type CatchUpReport } from "@/lib/patch-catchup";
import {
  CORPUS_RAW,
  PH3A,
  corpusReports,
  report as mkReport,
  statLine,
  championCard,
  systemCard,
} from "@/lib/patch-catchup/test-support";
import {
  COLLAPSE_LINE_THRESHOLD,
  FORBIDDEN_CONTINUITY_WORDS,
  buildCatchUpViewModel,
  continuityWording,
  coverageNotices,
  orderSectionKeys,
  rangeText,
  searchCatchUp,
} from "./presentation";

const LISTED = CORPUS_RAW.listedVersions; // newest first, as the index returns it
const REPORTS = corpusReports();

function corpusRange(since: string, through = "26.19", reports = REPORTS): CatchUpReport {
  const result = buildCatchUpReport({ reports, sincePatch: since, throughPatch: through, listedVersions: LISTED });
  if (result.ok === false) throw new Error(result.detail);
  return result.report;
}

const NO_LOADER_ISSUES = { resources: [], issues: [] };

describe("section order (§7.1)", () => {
  it("pins Champions, Items, Runes, then keeps Riot's merged order (since 26.14)", () => {
    expect(orderSectionKeys(corpusRange("26.14"))).toEqual([
      "patch-champions",
      "patch-items",
      "patch-runes",
      "patch-aegis-of-valor",
      "patch-apex-duo-restrictions",
      "patch-hall-of-legends",
      "patch-systems",
      "patch-classic",
      "patch-aram-mayhem",
      "patch-arena",
    ]);
  });

  it("inserts an older-only section after its nearest preceding section from its own report", () => {
    const older = mkReport("26.2", [
      championCard("Ahri", [statLine("Armor", "1", "2")]),
      systemCard("Thing", [statLine("X", "1", "2")], { id: "patch-older-only", title: "Older Only" }),
      systemCard("Aug", [statLine("Y", "1", "2")], { id: "patch-arena", title: "Arena" }),
    ], ["Champions", "Older Only", "Arena"]);
    const newer = mkReport("26.3", [
      systemCard("Aug", [statLine("Y", "2", "3")], { id: "patch-arena", title: "Arena" }),
      championCard("Ahri", [statLine("Armor", "2", "3")]),
    ], ["Arena", "Champions"]);
    const result = buildCatchUpReport({ reports: [older, newer], sincePatch: "26.1", throughPatch: "26.3", listedVersions: ["26.3", "26.2", "26.1"] });
    if (result.ok === false) throw new Error("range");
    // Skeleton (newest): Arena, Champions → Older Only goes after Champions (its predecessor in 26.2).
    expect(orderSectionKeys(result.report)).toEqual(["patch-champions", "patch-arena", "patch-older-only"]);
  });

  it("keeps distinct official sections distinct (Systems vs Support Adjustments)", () => {
    const keys = orderSectionKeys(corpusRange("26.9"));
    expect(keys).toContain("patch-systems");
    expect(keys).toContain("patch-support-adjustments");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("view model", () => {
  const report = corpusRange("26.14");
  const model = buildCatchUpViewModel(report);

  it("accounts for every Riot line exactly once", () => {
    const ids = model.sections.flatMap((s) => s.entries.flatMap((e) => e.steps.flatMap((st) => st.groups.flatMap((g) => g.lines.map((l) => l.id)))));
    expect(ids.length).toBe(report.lines.length);
    expect(new Set(ids)).toEqual(new Set(report.lines.map((l) => l.id)));
    expect(report.lines.length).toBe(987);
  });

  it("sorts entries alphabetically and steps oldest first", () => {
    for (const section of model.sections) {
      const names = section.entries.map((e) => e.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
      for (const entry of section.entries) {
        const patches = entry.steps.map((s) => s.patch);
        const ordinal = (p: string) => report.includedPatches.indexOf(p);
        expect(patches.map(ordinal)).toEqual([...patches.map(ordinal)].sort((a, b) => a - b));
      }
    }
    const belveth = model.sections[0].entries.find((e) => e.name === "Bel'Veth")!;
    expect(belveth.steps.map((s) => s.patch)).toEqual(["26.15", "26.16"]);
  });

  it("collapses exactly the large non-chainable sections", () => {
    const collapsed = model.sections.filter((s) => s.defaultCollapsed).map((s) => s.key);
    expect(collapsed).toEqual(["patch-classic", "patch-aram-mayhem", "patch-arena"]);
    for (const s of model.sections) {
      expect(s.defaultCollapsed).toBe(!s.chainable && s.lineCount > COLLAPSE_LINE_THRESHOLD);
    }
  });

  it("applies the threshold strictly (> 40, not ≥ 40)", () => {
    const changes = (n: number) => Array.from({ length: n }, (_, i) => statLine(`P${i}`, "1", "2"));
    const build = (n: number) => {
      const r = mkReport("26.2", [systemCard("Mode", changes(n), { id: "patch-mode", title: "Mode" })]);
      const res = buildCatchUpReport({ reports: [r], sincePatch: "26.1", throughPatch: "26.2", listedVersions: ["26.2", "26.1"] });
      if (res.ok === false) throw new Error("range");
      return buildCatchUpViewModel(res.report).sections[0];
    };
    expect(build(40).defaultCollapsed).toBe(false);
    expect(build(41).defaultCollapsed).toBe(true);
  });

  it("decorates only PH3-B chain lines, with the note on the final step", () => {
    const chains = report.continuity.chains;
    expect(chains.map((c) => c.entityName).sort()).toEqual(["Bel'Veth", "Sundered Sky"]);
    expect(model.chainByLine.size).toBe(chains.reduce((n, c) => n + c.steps.length, 0));
    for (const chain of chains) {
      const last = model.chainByLine.get(chain.steps[chain.steps.length - 1].line.id)!;
      expect(last.isLast).toBe(true);
      const first = model.chainByLine.get(chain.steps[0].line.id)!;
      expect(first.isLast).toBe(false);
      expect(first.nextPatch).toBe(chain.steps[1].patch);
    }
  });

  it("never decorates when the domain withholds continuity", () => {
    const missing = corpusRange("26.14", "26.19", REPORTS.filter((r) => r.patch_version !== "26.17"));
    expect(missing.continuity.status).toBe("withheld");
    const withheld = buildCatchUpViewModel(missing);
    expect(withheld.continuityAvailable).toBe(false);
    expect(withheld.chainByLine.size).toBe(0);
    expect(withheld.sections.every((s) => s.entries.every((e) => e.chains.length === 0))).toBe(true);
    // Riot lines that loaded are all still there.
    const ids = withheld.sections.flatMap((s) => s.entries.flatMap((e) => e.steps.flatMap((st) => st.groups.flatMap((g) => g.lines))));
    expect(ids.length).toBe(missing.lines.length);
  });

  it("keeps SR and mode same-name entities in separate sections", () => {
    const result = searchCatchUp(model, "Locke");
    const hits = result.sections.flatMap((s) => s.entries.map((e) => `${s.key}:${e.name}`));
    expect(hits).toEqual([
      "patch-champions:Locke",
      "patch-classic:Innervating Locket",
      "patch-aram-mayhem:Locke",
      "patch-arena:Locke",
    ]);
    const arena = result.sections.find((s) => s.key === "patch-arena")!.entries[0];
    expect(arena.patches).toEqual(["26.15", "26.19"]);
  });

  it("emits unique DOM ids for sections, entries and notes", () => {
    const ids = [
      ...model.sections.map((s) => s.id),
      ...model.sections.flatMap((s) => s.entries.map((e) => e.id)),
      ...[...model.chainByLine.values()].map((i) => i.noteId),
    ];
    const distinctNotes = new Set([...model.chainByLine.values()].map((i) => i.noteId));
    expect(new Set(ids).size).toBe(ids.length - ([...model.chainByLine.values()].length - distinctNotes.size));
  });

  it("lists cards without changes and the Champions cross-reference", () => {
    expect(model.otherAnnouncements.map((c) => `${c.entityName}@${c.patch}`)).toEqual(
      expect.arrayContaining(["Team Voice@26.19"]),
    );
    expect(model.crossReferences.map((c) => c.key)).toEqual(["patch-systems"]);
  });
});

describe("search (§12)", () => {
  const model = buildCatchUpViewModel(corpusRange("26.14"));

  it("matches entity, section, group, property, detail text and patch version; keeps order", () => {
    expect(searchCatchUp(model, "belveth").sections[0].entries.map((e) => e.name)).toEqual(["Bel'Veth"]);
    expect(searchCatchUp(model, "BEL’VETH").sections[0].entries.map((e) => e.name)).toEqual(["Bel'Veth"]);
    expect(searchCatchUp(model, "endless banquet").sections[0].entries.map((e) => e.name)).toContain("Bel'Veth");
    expect(searchCatchUp(model, "health growth").sections[0].entries.map((e) => e.name)).toContain("Bel'Veth");
    expect(searchCatchUp(model, "hall of legends").sections.map((s) => s.key)).toEqual(["patch-hall-of-legends"]);
    const byPatch = searchCatchUp(model, "26.18");
    expect(byPatch.entryCount).toBeGreaterThan(0);
    expect(byPatch.sections.every((s) => s.entries.every((e) => e.patches.includes("26.18")))).toBe(true);
    const keys = byPatch.sections.map((s) => s.key);
    expect(keys).toEqual(model.sections.map((s) => s.key).filter((k) => keys.includes(k)));
  });

  it("keeps a matching entry whole and never changes anchors or continuity", () => {
    const full = model.sections[0].entries.find((e) => e.name === "Bel'Veth")!;
    const hit = searchCatchUp(model, "health growth").sections[0].entries.find((e) => e.name === "Bel'Veth")!;
    expect(hit).toBe(full); // same object: same steps, ids, chains
  });

  it("is inactive for blank queries and empty for no matches", () => {
    expect(searchCatchUp(model, "   ").active).toBe(false);
    const none = searchCatchUp(model, "zzzz-no-such-thing");
    expect(none.active).toBe(true);
    expect(none.entryCount).toBe(0);
    expect(none.sections).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Wording                                                                    */
/* -------------------------------------------------------------------------- */

function chainOf(over: Partial<CatchUpParameterChain> & { steps: Array<[string, string, string]>; property?: string; group?: string }): CatchUpParameterChain {
  const property = over.property ?? "Health";
  const group = over.group ?? "Base Stats";
  const steps = over.steps.map(([patch, before, after], i) => ({
    patch,
    line: { id: `${patch}#0.${i}` },
    change: { property_name: property, group_title: group, before_raw: before, after_raw: after },
    linkFromPrevious: i === 0 ? null : { kind: "exact_key" },
  }));
  return {
    id: "chain:x",
    identity: "x",
    scope: "sr.champions",
    entityKey: "sr.champions|x",
    entityName: "X",
    keys: [],
    identityProvenance: "exact",
    linkBasis: [],
    valueState: "changed",
    netUnavailableReason: null,
    concurrentMechanical: false,
    ...over,
    net: over.net ?? { startPatch: steps[0].patch, endPatch: steps[steps.length - 1].patch, startRaw: over.steps[0][1], endRaw: over.steps[over.steps.length - 1][2], components: null },
    steps,
  } as unknown as CatchUpParameterChain;
}

const CTX = { sincePatch: "26.9", clampedToCoverageFloor: false };

describe("continuity wording (§9, owner decision 9)", () => {
  it("returns_to_start_value → Back to {startRaw}", () => {
    const w = continuityWording(
      chainOf({ valueState: "returns_to_start_value", property: "Health Growth", steps: [["26.15", "105", "110"], ["26.16", "110", "105"]] }),
      CTX,
    );
    expect(w.note).toBe("Back to 105, its value before 26.15");
    expect(w.chip).toBe("Health Growth back to 105");
  });

  it("changed → Net since X with Riot's property", () => {
    const chain = chainOf({
      valueState: "changed",
      steps: [["26.10", "110", "130"], ["26.13", "130", "150"]],
      net: { startPatch: "26.10", endPatch: "26.13", startRaw: "110", endRaw: "150", components: [{ start: "110", end: "150", delta: "40" }] },
    });
    expect(continuityWording(chain, CTX).note).toBe("Net since 26.9: +40 Health");
    // Baseline below the coverage floor: never claims the unseen span.
    expect(continuityWording(chain, { sincePatch: "26.9", clampedToCoverageFloor: true }).note).toBe(
      "Net since before 26.10: +40 Health",
    );
  });

  it("percent deltas are percentage points; rank arrays are per rank; zero has no sign", () => {
    const pct = chainOf({
      valueState: "partially_returns_toward_start",
      property: "Attack Speed",
      steps: [["26.2", "10%", "20%"], ["26.3", "20%", "15%"]],
      net: { startPatch: "26.2", endPatch: "26.3", startRaw: "10%", endRaw: "15%", components: [{ start: "10", end: "15", delta: "5" }] },
    });
    expect(continuityWording(pct, CTX).note).toBe("Net since 26.9: Attack Speed +5 percentage points — part of the way back to 10%");
    const ranks = chainOf({
      valueState: "moves_beyond_start",
      property: "Damage",
      steps: [["26.2", "10 / 20", "30 / 40"], ["26.3", "30 / 40", "5 / 20"]],
      net: { startPatch: "26.2", endPatch: "26.3", startRaw: "10 / 20", endRaw: "5 / 20", components: [{ start: "10", end: "5", delta: "-5" }, { start: "20", end: "20", delta: "0" }] },
    });
    expect(continuityWording(ranks, CTX).note).toBe("Net since 26.9: Damage per rank −5 / 0 — now past 10 / 20");
  });

  it("multi_step_non_monotonic and net_unavailable", () => {
    const nm = chainOf({
      valueState: "multi_step_non_monotonic",
      steps: [["26.2", "100", "110"], ["26.3", "110", "105"], ["26.4", "105", "108"]],
      net: { startPatch: "26.2", endPatch: "26.4", startRaw: "100", endRaw: "108", components: [{ start: "100", end: "108", delta: "8" }] },
    });
    expect(continuityWording(nm, CTX).note).toBe("Net since 26.9: +8 Health (changed direction along the way)");
    const na = chainOf({ valueState: "net_unavailable", steps: [["26.2", "5", "6s"], ["26.3", "6s", "7 (+1)"]] });
    expect(continuityWording(na, CTX).note).toBe("Changed across 2 patches: 5 → 7 (+1)");
    expect(continuityWording(na, CTX).chip).toBe("Health changed across 2 patches");
  });

  it("keeps alias provenance in the How? disclosure only", () => {
    const exact = chainOf({ valueState: "returns_to_start_value", steps: [["26.2", "1", "2"], ["26.3", "2", "1"]] });
    const alias = chainOf({ valueState: "returns_to_start_value", identityProvenance: "approved_alias", steps: [["26.2", "1", "2"], ["26.3", "2", "1"]] });
    (alias.steps[1] as { linkFromPrevious: unknown }).linkFromPrevious = { kind: "approved_alias", aliasId: "a" };
    const we = continuityWording(exact, CTX);
    const wa = continuityWording(alias, CTX);
    expect(wa.note).toBe(we.note);
    expect(wa.chip).toBe(we.chip);
    expect(wa.identity).toMatch(/renamed/);
    expect(we.identity).toMatch(/Same parameter/);
    expect(we.steps).toEqual(["26.2: 1 → 2", "26.3: 2 → 1"]);
  });

  it("states the value only when Riot also changed the mechanic", () => {
    const w = continuityWording(
      chainOf({ valueState: "returns_to_start_value", concurrentMechanical: true, steps: [["26.2", "1", "2"], ["26.3", "2", "1"]] }),
      CTX,
    );
    expect(w.mechanical).toMatch(/about the number only/);
  });

  it("never uses revert/undo language over every PH3-A range of the production corpus", () => {
    let chains = 0;
    for (const range of PH3A.expected_chains_by_range) {
      const report = corpusRange(range.since, range.end);
      const model = buildCatchUpViewModel(report);
      for (const info of model.chainByLine.values()) {
        const w = continuityWording(info.chain, { sincePatch: report.sincePatch, clampedToCoverageFloor: report.range.clampedToCoverageFloor });
        for (const text of [w.note, w.chip, w.identity, ...w.steps, w.mechanical ?? ""]) {
          expect(text).not.toMatch(FORBIDDEN_CONTINUITY_WORDS);
        }
        chains += 1;
      }
    }
    expect(chains).toBeGreaterThan(0);
  });
});

describe("coverage notices (§11, owner decision 11)", () => {
  it("is empty for a complete range", () => {
    expect(coverageNotices(NO_LOADER_ISSUES, corpusRange("26.14"))).toEqual([]);
  });

  it("names a failed patch and offers retry", () => {
    const report = corpusRange("26.14", "26.19", REPORTS.filter((r) => r.patch_version !== "26.17"));
    const notices = coverageNotices(
      { resources: [{ version: "26.17", status: "failed", message: "x" }], issues: [] },
      report,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe("Patch 26.17 didn't load.");
    expect(notices[0].retry).toBe(true);
    expect(notices[0].body).not.toMatch(/nothing changed/i);
  });

  it("pluralises several failures", () => {
    const report = corpusRange("26.14", "26.19", REPORTS.filter((r) => !["26.16", "26.17"].includes(r.patch_version)));
    const notices = coverageNotices(
      {
        resources: [
          { version: "26.16", status: "failed", message: null },
          { version: "26.17", status: "malformed", message: null },
        ],
        issues: [],
      },
      report,
    );
    expect(notices[0].title).toBe("Patches 26.16 and 26.17 didn't load.");
  });

  it("explains a withheld range without a load failure, and the coverage floor", () => {
    const below = corpusRange("26.9");
    expect(coverageNotices(NO_LOADER_ISSUES, below).map((n) => n.kind)).toEqual(["floor"]);
    const dup = buildCatchUpReport({ reports: [...REPORTS, REPORTS[9]], sincePatch: "26.14", throughPatch: "26.19", listedVersions: LISTED });
    if (dup.ok === false) throw new Error("range");
    expect(coverageNotices(NO_LOADER_ISSUES, dup.report).map((n) => n.kind)).toContain("withheld");
  });
});

describe("range line", () => {
  it("states the included range; X is never in it", () => {
    expect(rangeText("26.15", "26.19")).toBe("Showing changes in 26.15 – 26.19");
    expect(rangeText("26.19", "26.19")).toBe("Showing changes in 26.19");
    expect(rangeText(null, null)).toBeNull();
  });
});
