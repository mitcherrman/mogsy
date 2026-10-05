import { describe, expect, it } from "vitest";
import type { PatchReportCard, PatchReportDetail } from "@/lib/patch-reports/api";
import { buildPatchReportStructure } from "@/lib/patch-reports/report-structure";
import { buildCatchUpReport } from "./build";
import { comparePatchVersions } from "./patch-range";
import {
  abilityLine,
  championCard,
  deepFreeze,
  itemCard,
  report,
  statLine,
  systemCard,
} from "./test-support";
import type { CatchUpReport, ChainValueState, VerifiedAlias } from "./types";

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

type Spec = Record<string, PatchReportCard[]>;
type Options = {
  since?: string;
  through?: string;
  /** `false` omits the listing; an array overrides it. Default: the loaded versions. */
  listed?: string[] | false;
  aliases?: readonly VerifiedAlias[];
};

const sortedVersions = (spec: Spec) =>
  Object.keys(spec).sort((a, b) => comparePatchVersions(a, b) ?? 0);

const previous = (version: string) => {
  const [year, n] = version.split(".");
  return `${year}.${Number(n) - 1}`;
};

function reportsOf(spec: Spec): PatchReportDetail[] {
  return sortedVersions(spec).map((v) => report(v, spec[v]));
}

function build(spec: Spec, o: Options = {}): CatchUpReport {
  const versions = sortedVersions(spec);
  const res = buildCatchUpReport({
    reports: reportsOf(spec),
    sincePatch: o.since ?? previous(versions[0]),
    throughPatch: o.through ?? versions[versions.length - 1],
    listedVersions: o.listed === false ? undefined : (o.listed ?? versions),
    ...(o.aliases ? { aliases: o.aliases } : {}),
  });
  if (res.ok === false) throw new Error(`range invalid: ${res.detail}`);
  return res.report;
}

const q = (property: string, before: string, after: string, o = {}) =>
  abilityLine("Q - Test", "Q", property, before, after, o);

/** A champion card with a single Q line. */
const champQ = (name: string, property: string, before: string, after: string, o = {}) =>
  championCard(name, [q(property, before, after, o)]);

/** One property across consecutive patches; each step is `[before, after]`. */
function series(steps: Array<[string, string]>, start = 12): Spec {
  const spec: Spec = {};
  steps.forEach(([before, after], i) => {
    spec[`26.${start + i}`] = [champQ("Tester", "Damage", before, after)];
  });
  return spec;
}

const onlyChain = (r: CatchUpReport) => {
  expect(r.continuity.chains).toHaveLength(1);
  return r.continuity.chains[0];
};

const state = (steps: Array<[string, string]>): ChainValueState | "no_chain" => {
  const r = build(series(steps));
  return r.continuity.chains[0]?.valueState ?? "no_chain";
};

/* -------------------------------------------------------------------------- */
/* Value-state classification (PH3-A §11)                                     */
/* -------------------------------------------------------------------------- */

describe("value-state classification", () => {
  it("scalar net: 100→110, 110→105 is a partial return with net 100 → 105 (+5)", () => {
    const chain = onlyChain(build(series([["100", "110"], ["110", "105"]])));
    expect(chain.valueState).toBe("partially_returns_toward_start");
    expect(chain.net).toEqual({
      startPatch: "26.12",
      endPatch: "26.13",
      startRaw: "100",
      endRaw: "105",
      components: [{ start: "100", end: "105", delta: "5" }],
    });
    expect(chain.netUnavailableReason).toBeNull();
  });

  it("exact return to start: 100→110, 110→100", () => {
    const chain = onlyChain(build(series([["100", "110"], ["110", "100"]])));
    expect(chain.valueState).toBe("returns_to_start_value");
    expect(chain.net.components).toEqual([{ start: "100", end: "100", delta: "0" }]);
  });

  it("moves beyond the start: 100→110, 110→95", () => {
    const chain = onlyChain(build(series([["100", "110"], ["110", "95"]])));
    expect(chain.valueState).toBe("moves_beyond_start");
    expect(chain.net.components).toEqual([{ start: "100", end: "95", delta: "-5" }]);
  });

  it("same direction twice is just a net change: 100→110, 110→120", () => {
    const chain = onlyChain(build(series([["100", "110"], ["110", "120"]])));
    expect(chain.valueState).toBe("changed");
    expect(chain.net.components).toEqual([{ start: "100", end: "120", delta: "20" }]);
  });

  it("downward continuation is also `changed` (no buff/nerf claim)", () => {
    expect(state([["100", "90"], ["90", "80"]])).toBe("changed");
  });

  it("three steps, final step reverses a monotone climb: partial relative to the start", () => {
    const chain = onlyChain(build(series([["100", "110"], ["110", "120"], ["120", "105"]])));
    expect(chain.steps).toHaveLength(3);
    expect(chain.valueState).toBe("partially_returns_toward_start");
    expect(chain.net.components).toEqual([{ start: "100", end: "105", delta: "5" }]);
  });

  it("non-monotonic multi-step: direction changes before the last step", () => {
    const chain = onlyChain(build(series([["100", "110"], ["110", "105"], ["105", "108"]])));
    expect(chain.valueState).toBe("multi_step_non_monotonic");
    expect(chain.net.components).toEqual([{ start: "100", end: "108", delta: "8" }]);
  });

  it("oscillation that lands back on the start is a return to the start value", () => {
    expect(state([["100", "110"], ["110", "105"], ["105", "100"]])).toBe("returns_to_start_value");
  });

  it("uses exact decimals for deltas", () => {
    const chain = onlyChain(build(series([["0.1", "0.4"], ["0.4", "0.3"]])));
    expect(chain.valueState).toBe("partially_returns_toward_start");
    expect(chain.net.components).toEqual([{ start: "0.1", end: "0.3", delta: "0.2" }]);
  });

  it("percent values: 10%→13%, 13%→10% returns to 10%", () => {
    const chain = onlyChain(build(series([["10%", "13%"], ["13%", "10%"]])));
    expect(chain.valueState).toBe("returns_to_start_value");
    expect(chain.net.startRaw).toBe("10%");
  });

  it("percent deltas are percentage points", () => {
    const chain = onlyChain(build(series([["10%", "13%"], ["13%", "12%"]])));
    expect(chain.net.components).toEqual([{ start: "10", end: "12", delta: "2" }]);
  });

  describe("rank arrays", () => {
    it("unanimous per-rank movement is classified rank by rank", () => {
      const chain = onlyChain(
        build(series([["10 / 20 / 30", "12 / 22 / 32"], ["12 / 22 / 32", "11 / 21 / 31"]])),
      );
      expect(chain.valueState).toBe("partially_returns_toward_start");
      expect(chain.net.components).toEqual([
        { start: "10", end: "11", delta: "1" },
        { start: "20", end: "21", delta: "1" },
        { start: "30", end: "31", delta: "1" },
      ]);
    });

    it("mixed components: one rank starts moving only in the last step", () => {
      const chain = onlyChain(
        build(series([["10 / 15 / 20%", "5 / 15 / 25%"], ["5 / 15 / 25%", "6 / 13 / 20%"]])),
      );
      expect(chain.valueState).toBe("net_unavailable");
      expect(chain.netUnavailableReason).toBe("mixed_components");
      expect(chain.net.components).toBeNull();
      expect(chain.net.startRaw).toBe("10 / 15 / 20%");
      expect(chain.net.endRaw).toBe("6 / 13 / 20%");
    });

    it("a rank-count change is a valid chain with endpoints only (incomparable shape)", () => {
      const chain = onlyChain(
        build(series([["70 / 75 / 80 / 85 / 90", "90"], ["90", "80"]])),
      );
      expect(chain.valueState).toBe("net_unavailable");
      expect(chain.netUnavailableReason).toBe("incomparable_shape");
      expect(chain.net.components).toBeNull();
      expect(chain.net.startRaw).toBe("70 / 75 / 80 / 85 / 90");
      expect(chain.net.endRaw).toBe("80");
    });

    it("an exact array return needs no comparability", () => {
      const chain = onlyChain(
        build(series([["1 / 2 / 3", "4 / 5 / 6"], ["4 / 5 / 6", "1 / 2 / 3"]])),
      );
      expect(chain.valueState).toBe("returns_to_start_value");
    });
  });

  it("ratio-basis drift inside a chain: before_mismatch, never comparable", () => {
    const r = build(series([["60 (+40% AD)", "70 (+40% AD)"], ["70 (+40% bonus AD)", "60 (+40% bonus AD)"]]));
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("before_mismatch");
  });
});

/* -------------------------------------------------------------------------- */
/* Continuity gates                                                           */
/* -------------------------------------------------------------------------- */

describe("continuity gates", () => {
  it("later.before mismatch breaks the identity: no chain, no fragments (PH3-A H)", () => {
    const r = build(series([["100", "110"], ["115", "120"], ["120", "100"]]));
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified).toHaveLength(1);
    expect(r.continuity.unclassified[0].reason).toBe("before_mismatch");
    // Every line stays, and each records why its identity was not chained.
    expect(r.lines).toHaveLength(3);
    expect(r.lines.every((l) => l.chainId === null && l.identityRefusal === "before_mismatch")).toBe(true);
  });

  it("units gate: 13 vs 13% is a before mismatch", () => {
    const r = build(series([["10", "13"], ["13%", "10%"]]));
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("before_mismatch");
  });

  it("cosmetic value differences still chain (AP ≡ Ability Power, spacing, decimals)", () => {
    const chain = onlyChain(
      build(series([["40 / 65 (+45% AP)", "50/75 (+0.50% AP)"], ["50 / 75 (+.5% Ability Power)", "40 / 65 (+45% Ability Power)"]])),
    );
    expect(chain.valueState).toBe("returns_to_start_value");
  });

  it("a mechanical line with the same key between two numeric lines poisons the identity", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Damage", "100", "110")],
      "26.13": [championCard("Tester", [q("Damage", null, null, { change_kind: "mechanical", detail_text: "Reworked" })])],
      "26.14": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("not_numeric");
    expect(r.lines).toHaveLength(3);
  });

  it("a no-op line (65% → 65%) inside an identity leaves it unclassified", () => {
    const r = build(series([["60%", "65%"], ["65%", "65%"], ["65%", "70%"]]));
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("no_op_line");
  });

  it("unknown / unparseable values never chain, and the Riot lines stay", () => {
    for (const bad of ["Removed", "On Hit", "Every attack", "2% (+…. )", null]) {
      const r = build(series([["100", "110"], ["110", bad as string]]));
      expect(r.continuity.chains).toEqual([]);
      expect(r.lines).toHaveLength(2);
      expect(r.lines[1].eligibility).toEqual({ status: "refused", reason: "value_ineligible" });
      expect(r.continuity.unclassified[0].reason).toBe("value_ineligible");
    }
  });

  it("a numeric line with no property name has no identity (key_incomplete) and never chains", () => {
    const r = build({
      "26.12": [championCard("Tester", [q("", "100", "110")])],
      "26.13": [championCard("Tester", [q("", "110", "100")])],
    });
    expect(r.continuity.chains).toEqual([]);
    expect(r.lines.map((l) => l.eligibility)).toEqual([
      { status: "refused", reason: "key_incomplete" },
      { status: "refused", reason: "key_incomplete" },
    ]);
    expect(r.lines.every((l) => l.key === null)).toBe(true);
  });

  it("two lines with the same key in one card are ambiguous: fail closed, pick neither", () => {
    const spec: Spec = {
      "26.12": [championCard("Tester", [q("Damage", "100", "110"), q("Damage", "200", "210")])],
      "26.13": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("key_ambiguous_in_patch");
    const ambiguous = r.lines.filter(
      (l) => l.eligibility.status === "refused" && l.eligibility.reason === "key_ambiguous_in_patch",
    );
    expect(ambiguous).toHaveLength(2);
  });

  it("the same key on two cards of one patch is ambiguous", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Damage", "100", "110"), champQ("Tester", "Damage", "100", "110")],
      "26.13": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("key_ambiguous_in_patch");
  });

  it("an ambiguous mechanical twin makes the numeric line ambiguous too (any line kind)", () => {
    const spec: Spec = {
      "26.12": [championCard("Tester", [q("Damage", "100", "110"), q("Damage", null, null, { change_kind: "mechanical" })])],
      "26.13": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    expect(r.lines[0].eligibility).toEqual({ status: "refused", reason: "key_ambiguous_in_patch" });
  });

  it("same slot, different group title (26.15 Riven): distinct identities, no cross-link", () => {
    const riven = (group: string, before: string, after: string) =>
      abilityLine(group, "R", "Bonus Attack Damage Ratio", before, after);
    const spec: Spec = {
      "26.14": [championCard("Riven", [riven("R - Blade of the Exile", "60%", "70%")])],
      "26.15": [
        championCard("Riven", [
          riven("R - Blade of the Exile", "70%", "60%"),
          riven("R - Wind Slash", "70%", "75%"),
        ]),
      ],
    };
    const r = build(spec);
    // Blade of the Exile chains on its own; Wind Slash must not be confused with it.
    const chain = onlyChain(r);
    expect(chain.keys[0].group).toBe("r - blade of the exile");
    expect(chain.steps.map((s) => s.change.group_title)).toEqual([
      "R - Blade of the Exile",
      "R - Blade of the Exile",
    ]);
    const windSlash = r.lines.find((l) => l.groupTitle === "R - Wind Slash");
    expect(windSlash?.chainId).toBeNull();
  });

  it("equal values with a different group title never link (same slot is not enough)", () => {
    const spec: Spec = {
      "26.12": [championCard("Tester", [abilityLine("Q - Old Name", "Q", "Damage", "100", "110")])],
      "26.13": [championCard("Tester", [abilityLine("Q - New Name", "Q", "Damage", "110", "100")])],
    };
    expect(build(spec).continuity.chains).toEqual([]);
  });

  it("same value, different property never links (a rename without an alias row)", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Initial Damage", "100", "110")],
      "26.13": [champQ("Tester", "First Lash Damage", "110", "100")],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified).toEqual([]); // two different identities, one line each
    expect(r.lines).toHaveLength(2);
  });

  it("same property in a different mode never links (SR champion vs Arena card)", () => {
    const spec: Spec = {
      "26.12": [champQ("Locke", "Damage", "100", "110")],
      "26.13": [
        systemCard("Locke", [q("Damage", "110", "100")], { id: "patch-arena", title: "Arena" }),
      ],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    const names = r.entities.map((e) => e.key);
    expect(new Set(names).size).toBe(2);
    expect(r.lines[1].eligibility).toEqual({ status: "out_of_scope" });
  });

  it("same entity name in two scopes (item vs champion) never merges", () => {
    const spec: Spec = {
      "26.12": [champQ("Twin", "Health", "100", "110")],
      "26.13": [itemCard("Twin", [abilityLine("", null, "Health", "110", "100")])],
    };
    expect(build(spec).continuity.chains).toEqual([]);
  });

  it("cosmetic property/entity/group differences DO preserve identity", () => {
    const spec: Spec = {
      "26.12": [championCard("Bel’Veth", [abilityLine("Q – Test", "Q", "Damage:", "100", "110")], { mogzy_entity_ref: null })],
      "26.13": [championCard("Bel'Veth", [abilityLine("Q - Test", "Q", "  damage ", "110", "100")], { mogzy_entity_ref: null })],
    };
    expect(onlyChain(build(spec)).identityProvenance).toBe("exact");
  });

  describe("mogzy_* vetoes", () => {
    it("conflicting non-null mogzy_property vetoes a link even with matching values", () => {
      const spec: Spec = {
        "26.12": [champQ("Tester", "Damage", "100", "110", { mogzy_property: "cooldown" })],
        "26.13": [champQ("Tester", "Damage", "110", "100", { mogzy_property: "mana_cost" })],
      };
      const r = build(spec);
      expect(r.continuity.chains).toEqual([]);
      expect(r.continuity.unclassified[0].reason).toBe("mogzy_property_conflict");
    });

    it("null vs non-null mogzy_property is allowed (it can only veto)", () => {
      const spec: Spec = {
        "26.12": [champQ("Tester", "Health", "100", "110", { mogzy_property: null })],
        "26.13": [champQ("Tester", "Health", "110", "100", { mogzy_property: "stat_hp" })],
      };
      expect(build(spec).continuity.chains).toHaveLength(1);
    });

    it("matching mogzy_property never CREATES identity", () => {
      const spec: Spec = {
        "26.12": [champQ("Tester", "Initial Damage", "100", "110", { mogzy_property: "ability_damage_formula" })],
        "26.13": [champQ("Tester", "First Lash Damage", "110", "100", { mogzy_property: "ability_damage_formula" })],
      };
      expect(build(spec).continuity.chains).toEqual([]);
    });

    it("conflicting mogzy_entity_ref vetoes (3097 vs 3095)", () => {
      const spec: Spec = {
        "26.12": [itemCard("Stormrazor", [abilityLine("", null, "Health", "100", "110")], { mogzy_entity_ref: "3097" })],
        "26.13": [itemCard("Stormrazor", [abilityLine("", null, "Health", "110", "100")], { mogzy_entity_ref: "3095" })],
      };
      const r = build(spec);
      expect(r.continuity.chains).toEqual([]);
      expect(r.continuity.unclassified[0].reason).toBe("entity_ref_conflict");
    });

    it("a null ref never vetoes", () => {
      const spec: Spec = {
        "26.12": [itemCard("Stormrazor", [abilityLine("", null, "Health", "100", "110")], { mogzy_entity_ref: "3097" })],
        "26.13": [itemCard("Stormrazor", [abilityLine("", null, "Health", "110", "100")], { mogzy_entity_ref: null })],
      };
      expect(build(spec).continuity.chains).toHaveLength(1);
    });
  });

  it("lines outside the chain scope stay Riot lines but never chain (Arena, Support Adjustments)", () => {
    const sa = { id: "patch-support-adjustments", title: "Support Adjustments" };
    const spec: Spec = {
      "26.12": [systemCard("Imperial Mandate", [abilityLine("", null, "AP", "60", "65")], sa)],
      "26.13": [itemCard("Imperial Mandate", [abilityLine("", null, "AP", "65", "60")])],
    };
    const r = build(spec);
    expect(r.continuity.chains).toEqual([]);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].eligibility).toEqual({ status: "out_of_scope" });
    expect(r.sections.find((s) => s.key === "patch-support-adjustments")?.chainable).toBe(false);
    expect(r.sections.find((s) => s.key === "patch-items")?.chainable).toBe(true);
  });

  it("the same exact key repeated inside an out-of-scope mode never chains either", () => {
    const arena = { id: "patch-arena", title: "Arena" };
    const spec: Spec = {
      "26.12": [systemCard("Protein Shake", [abilityLine("", null, "Heal Shield Power", "25", "15")], arena)],
      "26.13": [systemCard("Protein Shake", [abilityLine("", null, "Heal Shield Power", "15", "25")], arena)],
    };
    expect(build(spec).continuity.chains).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Range effects on chains                                                    */
/* -------------------------------------------------------------------------- */

describe("range effects on chains", () => {
  const spec = (): Spec => ({
    "26.12": [champQ("Tester", "Damage", "100", "110")],
    "26.13": [champQ("Tester", "Damage", "110", "100")],
    "26.14": [],
  });

  it("a chain needs both steps inside the range: X is excluded", () => {
    expect(build(spec(), { since: "26.11", through: "26.14" }).continuity.chains).toHaveLength(1);
    const cut = build(spec(), { since: "26.12", through: "26.14" });
    expect(cut.continuity.chains).toEqual([]);
    expect(cut.lines).toHaveLength(1); // the 26.13 line is still a Riot line
  });

  it("a chain survives intermediate patches that do not mention it", () => {
    const s: Spec = {
      "26.12": [champQ("Tester", "Damage", "100", "110")],
      "26.13": [champQ("Other", "Cooldown", "1", "2")],
      "26.14": [champQ("Other", "Mana", "5", "6")],
      "26.15": [champQ("Tester", "Damage", "110", "100")],
    };
    expect(build(s).continuity.chains).toHaveLength(1);
  });

  it("a listed-but-missing intermediate report withholds every continuity claim", () => {
    const s: Spec = {
      "26.13": [champQ("Tester", "Damage", "100", "110")],
      "26.15": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(s, { since: "26.12", through: "26.15", listed: ["26.12", "26.13", "26.14", "26.15"] });
    expect(r.continuity.status).toBe("withheld");
    expect(r.continuity.chains).toEqual([]);
    expect(r.coverage.missingPatches).toEqual(["26.14"]);
    // Coverage of Riot lines is unaffected.
    expect(r.lines).toHaveLength(2);
  });

  it("an unlisted hole between loaded patches is an ordinal gap, never bridged", () => {
    const s: Spec = {
      "26.13": [champQ("Tester", "Damage", "100", "110")],
      "26.15": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(s, { since: "26.12", through: "26.15", listed: ["26.12", "26.13", "26.15"] });
    expect(r.continuity.status).toBe("withheld");
    expect(r.continuity.chains).toEqual([]);
    expect(r.coverage.issues.map((i) => i.kind)).toContain("ordinal_gap");
  });

  it("no link crosses a year boundary (25.24 → 26.1 is unverifiable)", () => {
    const s: Spec = {
      "25.24": [champQ("Tester", "Damage", "100", "110")],
      "26.1": [champQ("Tester", "Damage", "110", "100")],
    };
    const r = build(s, { since: "25.23", through: "26.1" });
    expect(r.continuity.status).toBe("available");
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.unclassified[0].reason).toBe("contiguity_unverifiable");
    expect(r.coverage.issues.map((i) => i.kind)).toEqual(["unverified_adjacency"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Aliases                                                                    */
/* -------------------------------------------------------------------------- */

const ALIAS: VerifiedAlias = {
  id: "tester-q-26.12-26.13",
  scope: "sr.champions",
  entity: "Tester",
  slot: "Q",
  group: "Q - Test",
  from: { patch: "26.12", property: "Initial Damage", before: "100", after: "110" },
  to: { patch: "26.13", property: "First Lash Damage", before: "110", after: "100" },
  evidence: ["synthetic"],
  verifiedBy: "test",
  verifiedOn: "2026-10-04",
  approval: "test",
};

const renameSpec = (): Spec => ({
  "26.12": [champQ("Tester", "Initial Damage", "100", "110")],
  "26.13": [champQ("Tester", "First Lash Damage", "110", "100")],
});

describe("explicit aliases", () => {
  it("off: the rename produces no chain; on: it links with approved_alias provenance", () => {
    const off = build(renameSpec(), { aliases: [] });
    expect(off.continuity.chains).toEqual([]);
    expect(off.continuity.aliases).toEqual([]);

    const on = build(renameSpec(), { aliases: [ALIAS] });
    const chain = onlyChain(on);
    expect(chain.identityProvenance).toBe("approved_alias");
    expect(chain.linkBasis).toEqual([{ kind: "approved_alias", aliasId: ALIAS.id }]);
    expect(chain.steps[1].linkFromPrevious).toEqual({ kind: "approved_alias", aliasId: ALIAS.id });
    expect(chain.keys.map((k) => k.property)).toEqual(["initial damage", "first lash damage"]);
    expect(chain.valueState).toBe("returns_to_start_value");
    expect(on.continuity.aliases).toEqual([{ aliasId: ALIAS.id, status: "linked" }]);
  });

  it("default registry is exactly the two reviewed rows", async () => {
    const { VERIFIED_ALIASES } = await import("./aliases");
    expect(VERIFIED_ALIASES.map((a) => a.id)).toEqual([
      "sylas-q-26.12-26.15",
      "mordekaiser-r-26.14-26.15",
    ]);
    for (const alias of VERIFIED_ALIASES) {
      expect(alias.evidence.length).toBeGreaterThan(0);
      expect(alias.approval).toMatch(/PH3-A/);
    }
  });

  it("does not apply to another entity with the same labels", () => {
    const spec: Spec = {
      "26.12": [champQ("Someone Else", "Initial Damage", "100", "110")],
      "26.13": [champQ("Someone Else", "First Lash Damage", "110", "100")],
    };
    const r = build(spec, { aliases: [ALIAS] });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases[0].status).toBe("refused");
    expect(r.continuity.aliases[0].reason).toBe("alias_row_unresolved");
  });

  it("does not apply to another group of the same entity", () => {
    const spec: Spec = {
      "26.12": [championCard("Tester", [abilityLine("W - Other", "W", "Initial Damage", "100", "110")])],
      "26.13": [championCard("Tester", [abilityLine("W - Other", "W", "First Lash Damage", "110", "100")])],
    };
    expect(build(spec, { aliases: [ALIAS] }).continuity.chains).toEqual([]);
  });

  it("does not apply outside its pinned patches", () => {
    const spec: Spec = {
      "26.14": [champQ("Tester", "Initial Damage", "100", "110")],
      "26.15": [champQ("Tester", "First Lash Damage", "110", "100")],
    };
    const r = build(spec, { aliases: [ALIAS] });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases[0].status).toBe("inactive_out_of_range");
  });

  it("is inactive (and silent) when the range does not cover both pinned patches", () => {
    const r = build(renameSpec(), { aliases: [ALIAS], since: "26.12", through: "26.13" });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases).toEqual([{ aliasId: ALIAS.id, status: "inactive_out_of_range" }]);
    expect(r.continuity.refusals).toEqual([]);
  });

  it("a pinned raw string that drifted by one character stops matching (alias_row_unresolved)", () => {
    const drifted: VerifiedAlias = { ...ALIAS, to: { ...ALIAS.to, before: "110 " } };
    const r = build(renameSpec(), { aliases: [drifted] });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases[0]).toEqual({
      aliasId: ALIAS.id,
      status: "refused",
      reason: "alias_row_unresolved",
    });
    expect(r.continuity.unclassified[0].reason).toBe("alias_row_unresolved");
  });

  it("the old property still existing in the later card is a coexistence, not a rename", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Initial Damage", "100", "110")],
      "26.13": [
        championCard("Tester", [
          q("First Lash Damage", "110", "100"),
          q("Initial Damage", "50", "60"),
        ]),
      ],
    };
    const r = build(spec, { aliases: [ALIAS] });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases[0].reason).toBe("alias_evidence_failed");
  });

  it("an occurrence of either key strictly between the pinned patches fails the evidence test", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Initial Damage", "100", "110")],
      "26.13": [champQ("Tester", "Initial Damage", "110", "105")],
      "26.14": [champQ("Tester", "First Lash Damage", "110", "100")],
    };
    const alias: VerifiedAlias = { ...ALIAS, to: { ...ALIAS.to, patch: "26.14" } };
    const r = build(spec, { aliases: [alias] });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases[0].reason).toBe("alias_evidence_failed");
  });

  it("an alias pair still has to pass value continuity (later.before == earlier.after)", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Initial Damage", "100", "110")],
      "26.13": [champQ("Tester", "First Lash Damage", "115", "100")],
    };
    const alias: VerifiedAlias = { ...ALIAS, to: { ...ALIAS.to, before: "115" } };
    const r = build(spec, { aliases: [alias] });
    expect(r.continuity.chains).toEqual([]);
    expect(r.continuity.aliases[0].reason).toBe("before_mismatch");
  });

  it("an alias link can be extended by exact-key steps (provenance stays approved_alias)", () => {
    const spec: Spec = {
      "26.12": [champQ("Tester", "Initial Damage", "100", "110")],
      "26.13": [champQ("Tester", "First Lash Damage", "110", "100")],
      "26.14": [champQ("Tester", "First Lash Damage", "100", "120")],
    };
    const chain = onlyChain(build(spec, { aliases: [ALIAS] }));
    expect(chain.steps).toHaveLength(3);
    expect(chain.linkBasis.map((b) => b.kind)).toEqual(["approved_alias", "exact_key"]);
    expect(chain.identityProvenance).toBe("approved_alias");
    expect(chain.valueState).toBe("multi_step_non_monotonic");
  });
});

/* -------------------------------------------------------------------------- */
/* concurrentMechanical                                                       */
/* -------------------------------------------------------------------------- */

describe("concurrentMechanical", () => {
  it("is set when a mechanical line shares the entity and group at a step's patch", () => {
    const spec: Spec = {
      "26.12": [championCard("Tester", [statLine("Health Growth", "105", "110")])],
      "26.13": [
        championCard("Tester", [
          statLine("Health Growth", "110", "105"),
          statLine("Total Attack Animation", null, null, { change_kind: "mechanical" }),
        ]),
      ],
    };
    expect(onlyChain(build(spec)).concurrentMechanical).toBe(true);
  });

  it("is not set by a mechanical line in a different group", () => {
    const spec: Spec = {
      "26.12": [championCard("Tester", [statLine("Health Growth", "105", "110")])],
      "26.13": [
        championCard("Tester", [
          statLine("Health Growth", "110", "105"),
          abilityLine("R - Other", "R", "Bugfix", null, null, { change_kind: "mechanical" }),
        ]),
      ],
    };
    expect(onlyChain(build(spec)).concurrentMechanical).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Riot-line coverage invariants                                              */
/* -------------------------------------------------------------------------- */

describe("every Riot line is accounted for exactly once", () => {
  const spec = (): Spec => ({
    "26.12": [
      championCard("Tester", [q("Damage", "100", "110"), q("Cooldown", "10", "9"), q("Note", null, null, { change_kind: "mechanical" })]),
      itemCard("Blade", [abilityLine("", null, "Health", "400", "450")]),
      systemCard("Protein Shake", [abilityLine("", null, "Heal Shield Power", "25", "15")]),
      systemCard("Imperial Mandate", [abilityLine("", null, "AP", "60", "65")], {
        id: "patch-support-adjustments",
        title: "Support Adjustments",
      }),
      championCard("Empty Card", []),
    ],
    "26.13": [
      championCard("Tester", [q("Damage", "110", "100")]),
      systemCard("ADC MAGIC RESISTANCE", [abilityLine("", null, "Magic Resistance", "30", "32")], {
        id: "patch-systems",
        title: "Systems",
      }),
    ],
  });

  it("returns each input line once, in chronological report order, with original references", () => {
    const input = deepFreeze(reportsOf(spec()));
    const res = buildCatchUpReport({ reports: input, sincePatch: "26.11", throughPatch: "26.13", listedVersions: ["26.12", "26.13"] });
    if (res.ok === false) throw new Error("range");
    const r = res.report;
    const inputLines = input.flatMap((rep) => rep.cards.flatMap((c) => c.changes));
    expect(r.lines).toHaveLength(inputLines.length);
    expect(r.lines).toHaveLength(8);
    expect(new Set(r.lines.map((l) => l.id)).size).toBe(8);
    // Same objects, untouched.
    expect(new Set(r.lines.map((l) => l.change))).toEqual(new Set(inputLines));
    for (const line of r.lines) expect(line.card.changes[line.changeIndex]).toBe(line.change);
    // Chronological by patch, then report order.
    expect(r.lines.map((l) => l.patch)).toEqual([...r.lines.map((l) => l.patch)].sort());
    expect(r.lines.map((l) => l.order)).toEqual(r.lines.map((_, i) => i));
    expect(r.totals).toMatchObject({ riotLines: 8, chains: 1, chainedLines: 2, unchainedLines: 6 });
    expect(r.cardsWithoutChanges).toEqual([
      { patch: "26.12", cardIndex: 4, entityName: "Empty Card", sectionKey: "patch-champions" },
    ]);
  });

  it("every entity lists ALL of its Riot lines; chains are a subset", () => {
    const r = build(spec());
    const total = r.entities.reduce((n, e) => n + e.riotLines.length, 0);
    expect(total).toBe(r.lines.length);
    const tester = r.entities.find((e) => e.name === "Tester");
    expect(tester?.riotLines).toHaveLength(4);
    expect(tester?.chains).toHaveLength(1);
    const chained = new Set(tester?.chains.flatMap((c) => c.steps.map((s) => s.line)));
    expect(chained.size).toBeLessThan(tester?.riotLines.length ?? 0);
    for (const line of chained) expect(tester?.riotLines).toContain(line);
    expect(tester?.appearances.map((a) => [a.patch, a.lineCount])).toEqual([["26.12", 3], ["26.13", 1]]);
  });

  it("surfaces Systems and Support Adjustments as sections of Riot lines (no chains)", () => {
    const r = build(spec());
    const keys = r.sections.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["patch-systems", "patch-support-adjustments", "patch-arena"]));
    expect(r.sections.find((s) => s.key === "patch-systems")).toMatchObject({ chainable: false, lineCount: 1 });
  });

  it("uses the Patch Report page's own anchors for every line", () => {
    const input = reportsOf(spec());
    const r = build(spec());
    for (const rep of input) {
      const structure = buildPatchReportStructure(rep);
      const expected = new Set<string>();
      for (const s of structure.sections) for (const e of s.entities) for (const g of e.groups) for (const c of g.changes) expected.add(c.anchor);
      const got = new Set(r.lines.filter((l) => l.patch === rep.patch_version).map((l) => l.target.change));
      expect(got).toEqual(expected);
    }
    for (const line of r.lines) {
      expect(line.target.change.startsWith(line.target.group)).toBe(true);
      expect(line.target.group.startsWith(line.target.entity)).toBe(true);
      expect(line.target.entity.startsWith(line.target.section)).toBe(true);
      expect(line.target.patch).toBe(line.patch);
    }
  });

  it("chain steps carry the original change and its semantic anchor", () => {
    const r = build(spec());
    const chain = onlyChain(r);
    for (const step of chain.steps) {
      expect(step.change).toBe(step.line.change);
      expect(step.target).toBe(step.line.target);
      expect(step.target.change).toContain("__c-damage");
    }
  });

  it("does not mutate its input and is order-independent", () => {
    const frozen = deepFreeze(reportsOf(spec()));
    const forward = buildCatchUpReport({ reports: frozen, sincePatch: "26.11", throughPatch: "26.13", listedVersions: ["26.12", "26.13"] });
    const reversed = buildCatchUpReport({ reports: [...frozen].reverse(), sincePatch: "26.11", throughPatch: "26.13", listedVersions: ["26.13", "26.12"] });
    expect(reversed).toEqual(forward);
  });

  it("an out-of-scope entity name never merges with an SR entity", () => {
    const spec2: Spec = {
      "26.12": [champQ("Locke", "Damage", "1", "2"), systemCard("Locke", [abilityLine("", null, "Damage", "1", "2")], { id: "patch-locke", title: "Locke" })],
    };
    const r = build(spec2);
    expect(r.entities).toHaveLength(2);
    expect(new Set(r.entities.map((e) => e.key)).size).toBe(2);
  });
});
