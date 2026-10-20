/**
 * Where a NEW Ranked match can be started from the browser.
 *
 * Starting is `POST /api/ranked/queue` (a human queue entry, or a bot match for
 * Premium/admin). The server refuses it with 503 RANKED_QUEUE_PAUSED for a
 * non-admin while the owner's Ranked pause is on. The browser must not add a
 * second, unguarded way in: this pins every source file allowed to call
 * `joinQueue`, and proves the live-match host route (/quiz/ranked), which a
 * direct URL lands on, only reads state and cannot start anything.
 *
 * Adding a caller is allowed, but it must be a deliberate edit to this list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk("src").map((f) => ({ path: f.replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));

describe("browser Ranked start surfaces", () => {
  it("only the known hosts call the queue join", () => {
    const callers = files
      .filter((f) => /\bjoinQueue\s*\(/.test(f.text) && f.path !== "src/lib/ranked-public/client.ts")
      .map((f) => f.path)
      .sort();
    expect(callers).toEqual([
      "src/components/playtest/PlaytestMatchHost.tsx",
      "src/pages/admin/ranked/PresetLaunch.tsx",
      "src/pages/quiz-ranked/useRankedQueue.ts",
    ]);
  });

  it("the public record starts Ranked only through the guarded queue hook", () => {
    const scroll = files.find((f) => f.path === "src/components/quiz/play-scroll/RankedPlayScroll.tsx")!;
    expect(scroll.text).toMatch(/useRankedQueue\(\{ startAllowed: props\.modes\.ranked \}\)/);
  });

  it("the /quiz/ranked live-match host cannot start a match", () => {
    const page = files.find((f) => f.path === "src/pages/quiz-ranked/QuizRankedPage.tsx")!;
    expect(page.text).not.toMatch(/joinQueue|useRankedQueue|joinWithoutClass|matchWithBot/);
    expect(page.text).toMatch(/getActiveMatch/);
  });
});
