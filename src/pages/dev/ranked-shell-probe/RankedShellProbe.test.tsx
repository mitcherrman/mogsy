/**
 * The RG1 shell probe is a MEASURING INSTRUMENT, not a second arena.
 *
 * Its whole value is that it renders the REAL `QuizRankedMatch` inside the
 * REAL `/quiz/ranked` frame — if it ever grew its own layout, a measurement
 * taken through it would be a measurement of the probe. So this pins what it
 * is allowed to contain: canned HTTP responses and the canonical page, and no
 * geometry, engine, controller or projection of its own.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  resolve(process.cwd(), "src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx"),
  "utf-8");
const importLines = src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");

describe("RankedShellProbe", () => {
  it("renders the canonical page, not a copy of it", () => {
    expect(importLines).toContain('from "@/pages/quiz-ranked/QuizRankedPage"');
    expect(importLines).toContain('from "@/pages/quiz-ranked/QuizRankedMatch"');
    expect(src).toContain("<Frame size=\"wide\">");
  });

  it("declares no layout of its own around the frame", () => {
    // A height, a padding or a grid here would be measured as if it were the
    // arena's. The only styled thing the probe owns is its state switcher,
    // which is `fixed` and therefore outside the flow entirely.
    const own = src.slice(src.indexOf("export default function"));
    const inFlow = (own.match(/className=[`"][^`"]*[`"]/g) ?? [])
      .filter((cls) => !cls.includes("fixed") && !cls.includes("rounded px-1.5"));
    expect(inFlow).toEqual([]);
  });

  it("holds no engine, controller or service of its own", () => {
    for (const forbidden of [
      "useRankedMatch", "useRankedQueue", "/service", "/worker",
      "duel_round", "duel_match", "createBotMatch",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("takes only the API BASE from the client, never a request function", () => {
    // The base has to be the app's own, or the interceptor would answer a URL
    // the client never asks for and the probe would silently measure the
    // error state. Everything else in that module makes network calls, and a
    // probe that calls the backend is not a probe.
    const clientImport = /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/ranked-public\/client"/
      .exec(src)?.[1] ?? "";
    expect(clientImport.split(",").map((n) => n.trim()).filter(Boolean))
      .toEqual(["RANKED_API_BASE"]);
  });
});
