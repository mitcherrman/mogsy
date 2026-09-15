/** RL2 — the champion-knowledge contract, including the one that matters:
 *  production says ABSENT and never a number. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHAMPION_KNOWLEDGE_TOP_N,
  championIconPath,
  productionChampionKnowledge,
  topChampions,
} from "./championKnowledge";
import { RANKED_ROLES } from "@/lib/ranked-public/roles";

describe("the production reader", () => {
  it("is absent for every role — it never invents a champion", () => {
    for (const role of RANKED_ROLES) {
      expect(productionChampionKnowledge(role)).toEqual({ state: "absent" });
    }
  });

  it("parses no question keys and reads no champion→role table", () => {
    // The two authorities this needs live on the backend; copying either one
    // into the client is the failure mode this guard exists for.
    // The prose header NAMES both authorities on purpose, so the next reader
    // knows where they live. The guard is on the code, with comments stripped.
    const code = readFileSync(resolve(__dirname, "championKnowledge.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.split\(":"\)/);
    expect(code).not.toContain("primary_role");
    expect(code).not.toContain("RANKED_ROLE_CHAMPIONS");
    // And no 173-row table smuggled in as data.
    expect(code).not.toContain("Aatrox");
  });
});

describe("ranking", () => {
  const entries = [
    { champion: "Ashe", correct: 20, attempts: 30 },
    { champion: "Jhin", correct: 44, attempts: 58 },
    { champion: "Ezreal", correct: 20, attempts: 25 },
    { champion: "Draven", correct: 0, attempts: 4 },
  ];

  it("orders by correct answers, not by accuracy", () => {
    // Ezreal has the better rate and fewer correct answers; correct wins.
    expect(topChampions(entries).map((e) => e.champion)).toEqual(["Jhin", "Ashe", "Ezreal"]);
  });

  it("breaks ties by name, so the row does not reshuffle between renders", () => {
    const tied = [
      { champion: "Zed", correct: 5, attempts: 9 },
      { champion: "Ahri", correct: 5, attempts: 9 },
    ];
    expect(topChampions(tied).map((e) => e.champion)).toEqual(["Ahri", "Zed"]);
  });

  it("drops a champion with no correct answers rather than ranking it last", () => {
    expect(topChampions(entries, 4).map((e) => e.champion)).not.toContain("Draven");
  });

  it("cuts to three", () => {
    expect(CHAMPION_KNOWLEDGE_TOP_N).toBe(3);
    expect(topChampions(entries)).toHaveLength(3);
  });
});

describe("icon paths", () => {
  it("uses the canonical capitalised folder — Linux 404s on the wrong case", () => {
    expect(championIconPath("Dr. Mundo")).toBe("assets/champions/Dr. Mundo/icon.png");
    expect(championIconPath("Ashe")).toBe("assets/champions/Ashe/icon.png");
  });
});
