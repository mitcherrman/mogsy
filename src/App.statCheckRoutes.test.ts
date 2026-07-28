/**
 * Structural guard on the Stat Check route table. The public entrance must be
 * the mode-selection screen, the bot and private modes must have their own
 * production routes, and — critically — the existing invite URL shape
 * /quiz/stat-check/room/:inviteCode must keep resolving to the room page so
 * links already shared in production do not break.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

function firstElementFor(path: string): string | null {
  const re = new RegExp(`path="${path.replace(/[/:]/g, (c) => `\\${c}`)}"\\s+element=\\{(<[A-Za-z]+)`);
  const m = appSource.match(re);
  return m ? m[1] : null;
}

describe("Stat Check route map", () => {
  it("makes /quiz/stat-check the mode-selection screen", () => {
    expect(firstElementFor("/quiz/stat-check")).toBe("<Suspense");
    expect(appSource).toMatch(
      /path="\/quiz\/stat-check"\s+element=\{<Suspense[^\n]*?<StatCheckModeSelectPage\s*\/>/,
    );
  });

  it("gives the public bot game its own route", () => {
    expect(appSource).toMatch(
      /path="\/quiz\/stat-check\/bot"\s+element=\{<Suspense[^\n]*?<StatCheckBotPage\s*\/>/,
    );
  });

  it("routes the private mode at the existing room page", () => {
    expect(appSource).toMatch(
      /path="\/quiz\/stat-check\/private"\s+element=\{<Suspense[^\n]*?<StatCheckRoomPage\s*\/>/,
    );
  });

  it("preserves the production invite-room URL", () => {
    expect(appSource).toMatch(
      /path="\/quiz\/stat-check\/room\/:inviteCode"\s+element=\{<Suspense[^\n]*?<StatCheckRoomPage\s*\/>/,
    );
  });

  it("keeps the dev route on the dev prototype page", () => {
    expect(appSource).toMatch(
      /path="\/dev\/stat-check"\s+element=\{<Suspense[^\n]*?<StatCheckPage\s*\/>/,
    );
  });

  it("does not point any public Stat Check surface at the dev route", () => {
    const publicSources = [
      "src/pages/stat-check/StatCheckModeSelectPage.tsx",
      "src/pages/LolHub.tsx",
      "src/pages/Quiz.tsx",
    ];
    for (const file of publicSources) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, `${file} must not link to /dev/stat-check`).not.toMatch(/\/dev\/stat-check/);
    }
  });
});
