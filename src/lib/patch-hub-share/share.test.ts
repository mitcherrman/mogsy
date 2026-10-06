import { describe, expect, it } from "vitest";
import { corpusReport } from "@/lib/patch-impact/fixtures/corpus";
import { buildPatchReportStructure, type ReportEntityNode } from "@/lib/patch-reports/report-structure";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";
import { anchorFallbacks, changeShareEligibility, resolveLandingTarget } from "./anchors";
import { catchUpEntryUrl, reportAnchorUrl } from "./urls";

const entityOf = (version: string, name: string): ReportEntityNode => {
  const structure = buildPatchReportStructure(corpusReport(version));
  const found = structure.sections.flatMap((s) => s.entities).find((e) => e.card.entity_name === name);
  if (!found) throw new Error(`no ${name} in ${version}`);
  return found;
};

const eligibility = (entity: ReportEntityNode, property: string) => {
  for (const group of entity.groups) {
    const node = group.changes.find((c) => c.change.property_name === property);
    if (node) return { node, group, result: changeShareEligibility(entity, group, node) };
  }
  throw new Error(`no ${property}`);
};

describe("PH4-A share URLs", () => {
  it("report entity URL always carries ?patch= and the entity anchor", () => {
    const vi = entityOf("26.19", "Vi");
    expect(reportAnchorUrl("26.19", vi.anchor)).toBe(
      `https://mogzy.lol/lol/patch-reports?patch=26.19#${vi.anchor}`,
    );
    expect(vi.anchor).toBe("s-patch-champions__e-champion-vi");
  });

  it("Catch-Up URL carries ?since= and the #cu- anchor, never ?patch=", () => {
    expect(catchUpEntryUrl("26.14", "cu-sr-champions-bel-veth")).toBe(
      "https://mogzy.lol/lol/patch-reports?since=26.14#cu-sr-champions-bel-veth",
    );
    const url = catchUpEntryUrl("26.14", "cu-sr-items-sundered-sky")!;
    expect(url).not.toContain("patch=");
    expect(url).not.toContain("through");
  });

  it("Catch-Up has no URL without an explicit baseline", () => {
    expect(catchUpEntryUrl(null, "cu-x")).toBeNull();
    expect(catchUpEntryUrl("  ", "cu-x")).toBeNull();
  });
});

describe("PH4-A change share eligibility", () => {
  it("labelled, unique lines are shareable (Vi AD, Vi Passive Shield, Draven AD)", () => {
    const vi = entityOf("26.19", "Vi");
    const ad = eligibility(vi, "Attack Damage");
    expect(ad.result).toEqual({ ok: true });
    expect(ad.node.anchor).toBe("s-patch-champions__e-champion-vi__g-base-stats__c-attack-damage");
    expect(eligibility(vi, "Shield").result).toEqual({ ok: true });
    expect(eligibility(entityOf("26.19", "Draven"), "Attack Damage").result).toEqual({ ok: true });
  });

  it("an unlabelled line (real Zeri 26.10 R) is not shareable", () => {
    const zeri = entityOf("26.10", "Zeri");
    const unlabelled = zeri.groups
      .flatMap((g) => g.changes.map((n) => ({ g, n })))
      .find((x) => !x.n.change.property_name);
    expect(unlabelled).toBeDefined();
    expect(unlabelled!.n.anchor).toMatch(/__c-change$/);
    expect(changeShareEligibility(zeri, unlabelled!.g, unlabelled!.n)).toEqual({ ok: false, reason: "unlabelled" });
  });

  it("a duplicate group+property pair is positional, so neither line is shareable", () => {
    const card = mkCard("Dup", {
      changes: [
        mkChange({ group_title: "Base Stats", property_name: "Armor", before_raw: "1", after_raw: "2" }),
        mkChange({ group_title: "Base Stats", property_name: "Armor", before_raw: "3", after_raw: "4" }),
        mkChange({ group_title: "Base Stats", property_name: "Health", before_raw: "5", after_raw: "6" }),
      ],
    });
    const entity = buildPatchReportStructure({ patch_version: "9.9", cards: [card] }).sections[0].entities[0];
    const [first, second, other] = entity.groups[0].changes;
    expect(second.anchor).toBe(`${first.anchor}-2`);
    expect(changeShareEligibility(entity, entity.groups[0], first)).toEqual({ ok: false, reason: "duplicate" });
    expect(changeShareEligibility(entity, entity.groups[0], second)).toEqual({ ok: false, reason: "duplicate" });
    expect(changeShareEligibility(entity, entity.groups[0], other)).toEqual({ ok: true });
  });
});

describe("PH4-A landing fallbacks", () => {
  const change = "s-patch-champions__e-champion-vi__g-base-stats__c-attack-damage";
  it("exact → group → entity, never above the entity", () => {
    expect(anchorFallbacks(change)).toEqual([
      change,
      "s-patch-champions__e-champion-vi__g-base-stats",
      "s-patch-champions__e-champion-vi",
    ]);
    expect(anchorFallbacks("s-patch-champions__e-champion-vi")).toEqual(["s-patch-champions__e-champion-vi"]);
    expect(anchorFallbacks("s-patch-champions")).toEqual(["s-patch-champions"]);
  });

  it("resolves the first fallback that exists and nothing unrelated", () => {
    const present = new Set(["s-patch-champions__e-champion-vi__g-base-stats", "s-patch-champions__e-champion-vi"]);
    const look = (id: string) => (present.has(id) ? id : null);
    expect(resolveLandingTarget(change, look)).toBe("s-patch-champions__e-champion-vi__g-base-stats");
    present.delete("s-patch-champions__e-champion-vi__g-base-stats");
    expect(resolveLandingTarget(change, look)).toBe("s-patch-champions__e-champion-vi");
    present.clear();
    present.add("s-patch-champions__e-champion-vi__g-base-stats__c-armor"); // a sibling line
    present.add("s-patch-champions");
    expect(resolveLandingTarget(change, look)).toBeNull();
  });
});
