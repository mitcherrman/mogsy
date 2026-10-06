/**
 * PH4-C: which Patch Hub cards may hand off to Combat Lab, and exactly what
 * URL they get. Real cards come from the frozen production corpus; the cases the
 * corpus does not hold (items, runes, Arena) are built with the shared
 * `mkCard`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCombatLabMatchupUrl } from "@/lib/combat-lab/matchup-link";
import { CORPUS_REPORTS } from "@/lib/patch-impact/fixtures/corpus";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import { mkCard } from "@/lib/patch-reports/test-fixtures";
import { combatLabHandoffFor, combatLabHandoffLabel } from "./handoff";

const corpusCard = (version: string, name: string): PatchReportCard => {
  const card = CORPUS_REPORTS.find((r) => r.patch_version === version)!.cards.find((c) => c.entity_name === name);
  if (!card) throw new Error(`no ${name} in ${version}`);
  return card;
};

describe("eligible champions (real corpus)", () => {
  it.each([
    ["26.19", "Vi", "/combat-lab?attacker=vi"],
    ["26.19", "Draven", "/combat-lab?attacker=draven"],
    ["26.15", "Bel'Veth", "/combat-lab?attacker=belveth"],
  ])("%s %s → %s", (version, name, href) => {
    const handoff = combatLabHandoffFor(corpusCard(version, name));
    expect(handoff?.href).toBe(href);
    expect(handoff?.label).toBe(`Open ${name} in Combat Lab`);
  });

  it("the href is exactly what the canonical Combat Lab builder returns", () => {
    for (const name of ["Vi", "Draven", "Bel'Veth"]) {
      const card = CORPUS_REPORTS.flatMap((r) => r.cards).find((c) => c.entity_name === name)!;
      expect(combatLabHandoffFor(card)?.href).toBe(buildCombatLabMatchupUrl({ attacker: card.mogzy_entity_ref }));
    }
  });

  it("every eligible champion in every corpus patch resolves to an attacker-only URL", () => {
    let eligible = 0;
    for (const card of CORPUS_REPORTS.flatMap((r) => r.cards)) {
      const handoff = combatLabHandoffFor(card);
      if (!handoff) continue;
      eligible++;
      expect(handoff.href).toMatch(/^\/combat-lab\?attacker=[a-z0-9-]+$/);
    }
    expect(eligible).toBeGreaterThan(100);
  });
});

describe("wording", () => {
  it("names the champion and promises nothing else", () => {
    const label = combatLabHandoffLabel("Vi");
    expect(label).toBe("Open Vi in Combat Lab");
    expect(label).not.toMatch(/test|simulat|compar|impact|before|after|patch|change/i);
  });
});

describe("fails closed", () => {
  it("an item (Sundered Sky) gets nothing", () => {
    const card = mkCard("Sundered Sky", { entity_type: "item", section_id: "patch-items", section_title: "Items" });
    expect(card.mogzy_entity_ref).toBe("Sundered Sky"); // even with a catalog ref
    expect(combatLabHandoffFor(card)).toBeNull();
  });

  it("a rune gets nothing", () => {
    const card = mkCard("Conqueror", { entity_type: "rune", section_id: "patch-runes", section_title: "Runes" });
    expect(combatLabHandoffFor(card)).toBeNull();
  });

  it("a system entity gets nothing (real: 26.16 Heimerdinger, Classic)", () => {
    const card = corpusCard("26.16", "Heimerdinger");
    expect(card.entity_type).toBe("system");
    expect(combatLabHandoffFor(card)).toBeNull();
  });

  it("an Arena/mode card is not a Summoner's Rift champion, even if typed as champion with a ref", () => {
    const card = mkCard("Vi", { section_id: "patch-arena", section_title: "Arena" });
    expect(combatLabHandoffFor(card)).toBeNull();
  });

  it("an unmapped champion (real: 26.14 Locke, no catalog ref) gets nothing and is not guessed from its name", () => {
    const card = corpusCard("26.14", "Locke");
    expect(card.entity_type).toBe("champion");
    expect(card.mogzy_entity_ref).toBeNull();
    expect(combatLabHandoffFor(card)).toBeNull();
  });

  it.each([["", "empty"], ["   ", "blank"], ["???", "no slug characters"], ["x".repeat(41), "over-long"]])(
    "a champion whose ref is %j (%s) gets nothing",
    (ref) => {
      expect(combatLabHandoffFor(mkCard("Vi", { mogzy_entity_ref: ref }))).toBeNull();
    },
  );
});

describe("no historical patch information in the URL", () => {
  it("a champion-only URL, whatever the card or patch", () => {
    for (const card of CORPUS_REPORTS.flatMap((r) => r.cards)) {
      const href = combatLabHandoffFor(card)?.href;
      if (!href) continue;
      const params = new URL(href, "https://mogzy.lol").searchParams;
      expect([...params.keys()]).toEqual(["attacker"]);
      expect(href).not.toMatch(/patch|version|level|item|rune|since|26\.\d+/i);
    }
  });

  it("source contract: the handoff modules take no patch/version/level input and add no query parameters", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "handoff.ts"),
      resolve(here, "../../components/patch-hub-combat-lab/CombatLabHandoffLink.tsx"),
    ];
    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/URLSearchParams|searchParams|[?&]\w+=|patchVersion|patch_version|reportVersion|level|\.set\(/);
      expect(code, file).not.toMatch(/\bfetch\(|useQuery|mutate|useMutation|XMLHttpRequest|sendBeacon/);
    }
    // The only way to a Combat Lab URL here is the canonical builder.
    expect(readFileSync(files[0], "utf8")).toContain("buildCombatLabMatchupUrl({ attacker: ref })");
  });
});
