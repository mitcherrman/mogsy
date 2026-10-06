/**
 * PH4-A: the Impact slot hands Explore a share link only for a change whose
 * anchor is stable (labelled and unique within its card). PatchImpact is
 * stubbed so the test reads exactly what the slot decided.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPatchReportStructure } from "@/lib/patch-reports/report-structure";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";

vi.mock("@/hooks/usePatchImpactLoader", () => ({
  usePatchImpactLoader: () => ({
    analysis: null,
    state: { status: "not_required", reason: "riot_complete" },
    canRequest: false,
    requestProjection: vi.fn(),
  }),
}));
vi.mock("./PatchImpact", () => ({
  PatchImpact: ({ shareChange }: { shareChange?: { url: string; label: string } }) => (
    <div data-testid="impact-stub" data-share-url={shareChange?.url ?? ""} data-share-label={shareChange?.label ?? ""} />
  ),
}));

import { PatchImpactChangeAnalysis } from "./PatchImpactChangeAnalysis";

const base = (property: string, before: string, after: string) =>
  mkChange({ group_title: "Base Stats", ability_slot: null, property_name: property, change_kind: "numeric", before_raw: before, after_raw: after });

function renderLines(changes: ReturnType<typeof base>[]) {
  const card = mkCard("Vi", { changes });
  const entity = buildPatchReportStructure({ patch_version: "26.19", cards: [card] }).sections[0].entities[0];
  const group = entity.groups[0];
  render(
    <>
      {group.changes.map((node) => (
        <PatchImpactChangeAnalysis
          key={node.anchor}
          patchVersion="26.19"
          ctx={{ entity, group, node, change: node.change }}
        />
      ))}
    </>,
  );
  return screen.getAllByTestId("impact-stub");
}

describe("PatchImpactChangeAnalysis share link", () => {
  it("a labelled unique line gets the canonical ?patch= change URL", () => {
    const [stub] = renderLines([base("Attack Damage", "63", "61")]);
    expect(stub.dataset.shareUrl).toBe(
      "https://mogzy.lol/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-vi__g-base-stats__c-attack-damage",
    );
    expect(stub.dataset.shareLabel).toBe("Copy link to Vi Attack Damage change in Patch 26.19");
  });

  it("duplicate group+property lines get no share link; their unique sibling still does", () => {
    const [a, b, c] = renderLines([base("Armor", "30", "31"), base("Armor", "32", "33"), base("Health", "600", "610")]);
    expect(a.dataset.shareUrl).toBe("");
    expect(b.dataset.shareUrl).toBe("");
    expect(c.dataset.shareUrl).toContain("__c-health");
  });
});
