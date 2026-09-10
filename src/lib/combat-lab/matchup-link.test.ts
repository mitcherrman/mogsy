/**
 * The Combat Lab champion deep-link contract — Matchup Explorer Step 10.
 *
 * The point of these is champion IDENTITY. Matchup Explorer speaks
 * Leaguepedia's `champion_key`; Combat Lab's manifest is the `champions`
 * table. Punctuation, apostrophes, a stray period and casing are exactly where
 * a naive string comparison drops a champion, so every awkward name in the
 * roster is pinned by name here rather than trusted to a shared helper.
 */
import { describe, expect, it } from "vitest";
import {
  buildCombatLabMatchupUrl,
  parseCombatLabMatchup,
  resolveCombatLabChampion,
  COMBAT_LAB_ROUTE,
} from "./matchup-link";

/** A stand-in for /api/meta/champions — the `champions` table's own spellings,
 *  including the one that differs from Leaguepedia's ("Dr Mundo"). */
const MANIFEST = [
  { name: "Olaf" },
  { name: "K'Sante" },
  { name: "Cho'Gath" },
  { name: "Kai'Sa" },
  { name: "LeBlanc" },
  { name: "Dr Mundo" },
  { name: "Wukong" },
  { name: "Aurelion Sol" },
  { name: "Nunu" },
  { name: "Renata" },
];

describe("building the link", () => {
  it("carries both champions as slugs, attacker first", () => {
    expect(buildCombatLabMatchupUrl({ attacker: "Olaf", defender: "K'Sante" })).toBe(
      "/combat-lab?attacker=olaf&defender=ksante",
    );
  });

  it("normalizes every punctuation-heavy name in the roster", () => {
    const cases: [string, string][] = [
      ["K'Sante", "ksante"],
      ["Cho'Gath", "chogath"],
      ["Kai'Sa", "kaisa"],
      ["LeBlanc", "leblanc"],
      // Leaguepedia's spelling carries a period the champions table does not.
      // Both sides must land on the same slug or the champion is unreachable.
      ["Dr. Mundo", "dr-mundo"],
      ["Dr Mundo", "dr-mundo"],
      ["Wukong", "wukong"],
      ["Aurelion Sol", "aurelion-sol"],
      ["Nunu & Willump", "nunu-willump"],
      ["Renata Glasc", "renata-glasc"],
    ];
    for (const [name, slug] of cases) {
      expect(buildCombatLabMatchupUrl({ attacker: name })).toBe(
        `/combat-lab?attacker=${slug}`,
      );
    }
  });

  it("omits a side it cannot name rather than emitting an empty parameter", () => {
    expect(buildCombatLabMatchupUrl({ attacker: "Olaf", defender: null })).toBe(
      "/combat-lab?attacker=olaf",
    );
    expect(buildCombatLabMatchupUrl({ attacker: null, defender: "Olaf" })).toBe(
      "/combat-lab?defender=olaf",
    );
    expect(buildCombatLabMatchupUrl({ attacker: "   ", defender: "" })).toBe(
      COMBAT_LAB_ROUTE,
    );
  });

  it("carries the champions and NOTHING else", () => {
    // The link means "compare these champions", never "recreate that game".
    // No level, item, rune, patch, player or team may ride along.
    const url = buildCombatLabMatchupUrl({ attacker: "Olaf", defender: "K'Sante" });
    const params = new URLSearchParams(url.split("?")[1]);
    expect([...params.keys()].sort()).toEqual(["attacker", "defender"]);
  });
});

describe("parsing the link", () => {
  it("round-trips a built URL", () => {
    const url = buildCombatLabMatchupUrl({ attacker: "Kai'Sa", defender: "Dr. Mundo" });
    expect(parseCombatLabMatchup(new URLSearchParams(url.split("?")[1]))).toEqual({
      attacker: "kaisa",
      defender: "dr-mundo",
    });
  });

  it("reads a missing parameter as absent, not as an error", () => {
    expect(parseCombatLabMatchup(new URLSearchParams(""))).toEqual({
      attacker: null,
      defender: null,
    });
    expect(parseCombatLabMatchup(new URLSearchParams("attacker=olaf"))).toEqual({
      attacker: "olaf",
      defender: null,
    });
  });

  it("rejects every malformed value totally", () => {
    // Each of these resolves to "no champion requested" — never a thrown
    // error, and never a partial slug that could match the wrong champion.
    const bad = [
      "attacker=",
      "attacker=%20%20",
      "attacker=<script>alert(1)</script>",
      "attacker=../../etc/passwd",
      "attacker=olaf%2Cksante",
      "attacker=-olaf",
      "attacker=olaf-",
      "attacker=olaf--sol",
      "attacker=" + "a".repeat(41),
      "attacker=K'Sante",
    ];
    for (const qs of bad) {
      expect(parseCombatLabMatchup(new URLSearchParams(qs)).attacker).toBeNull();
    }
  });

  it("accepts a hand-typed slug that is merely shouted or padded", () => {
    // Casing and stray whitespace are not identity, and a URL pasted out of a
    // chat window routinely carries both. Neither is a malformed value.
    expect(parseCombatLabMatchup(new URLSearchParams("attacker=OLAF")).attacker).toBe(
      "olaf",
    );
    expect(parseCombatLabMatchup(new URLSearchParams("attacker=olaf%20")).attacker).toBe(
      "olaf",
    );
  });
});

describe("resolving against the manifest", () => {
  it("returns the simulator's own champion key for every roster spelling", () => {
    expect(resolveCombatLabChampion(MANIFEST, "ksante")).toBe("K'Sante");
    expect(resolveCombatLabChampion(MANIFEST, "chogath")).toBe("Cho'Gath");
    expect(resolveCombatLabChampion(MANIFEST, "kaisa")).toBe("Kai'Sa");
    expect(resolveCombatLabChampion(MANIFEST, "leblanc")).toBe("LeBlanc");
    expect(resolveCombatLabChampion(MANIFEST, "aurelion-sol")).toBe("Aurelion Sol");
    expect(resolveCombatLabChampion(MANIFEST, "wukong")).toBe("Wukong");
  });

  it("bridges the one name the two authorities spell differently", () => {
    // The Explorer says "Dr. Mundo"; the manifest says "Dr Mundo". The slug is
    // what makes them one champion.
    const url = buildCombatLabMatchupUrl({ attacker: "Dr. Mundo" });
    const { attacker } = parseCombatLabMatchup(new URLSearchParams(url.split("?")[1]));
    expect(resolveCombatLabChampion(MANIFEST, attacker)).toBe("Dr Mundo");
  });

  it("prefers the manifest's id when it carries one", () => {
    expect(resolveCombatLabChampion([{ id: "Olaf", name: "Olaf" }], "olaf")).toBe("Olaf");
  });

  it("returns null for an unknown or absent champion", () => {
    expect(resolveCombatLabChampion(MANIFEST, "not-a-champion")).toBeNull();
    expect(resolveCombatLabChampion(MANIFEST, null)).toBeNull();
    expect(resolveCombatLabChampion([], "olaf")).toBeNull();
  });
});
