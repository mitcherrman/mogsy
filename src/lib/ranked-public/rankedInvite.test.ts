/**
 * PLAY1 — the Ranked invite seam.
 *
 * These are honesty tests, not behaviour tests. The gateway's job today is to
 * refuse clearly; the thing worth pinning is that it refuses WITHOUT
 * inventing a match, and that it never quietly grows a dependency on the Stat
 * Check invite rooms — a different game, a different room lifecycle, and no
 * Ranked rating.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RANKED_INVITE_UNAVAILABLE_REASON,
  rankedInviteGateway,
} from "./rankedInvite";

describe("the Ranked invite gateway in force today", () => {
  it("reports itself unavailable, with copy a player can read", () => {
    const availability = rankedInviteGateway.availability();
    expect(availability.available).toBe(false);
    expect(availability.reason).toBe(RANKED_INVITE_UNAVAILABLE_REASON);
    // Finished copy, not a diagnostic and not scaffolding.
    expect(availability.reason).not.toMatch(/TODO|not implemented|coming soon/i);
  });

  it("refuses to send rather than fabricating a match", async () => {
    const result = await rankedInviteGateway.send({
      profileId: "p1", displayName: "Ashen",
    });
    expect(result.ok).toBe(false);
    expect(result.matchId).toBeNull();
    expect(result.reason).toBe(RANKED_INVITE_UNAVAILABLE_REASON);
  });
});

describe("the seam does not reach for the Stat Check rooms", () => {
  const read = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8");

  it("neither the seam nor the view imports Stat Check invite code", () => {
    for (const path of [
      "src/lib/ranked-public/rankedInvite.ts",
      "src/components/quiz/play-scroll/InvitePlayView.tsx",
    ]) {
      const source = read(path);
      const imports = source
        .split("\n")
        .filter((line) => line.trimStart().startsWith("import"))
        .join("\n");
      expect(imports).not.toContain("useStatCheckInvites");
      expect(imports).not.toContain("stat-check-online");
      expect(imports).not.toContain("stat-check");
    }
  });

  it("the view asks the seam rather than deciding availability itself", () => {
    const view = read("src/components/quiz/play-scroll/InvitePlayView.tsx");
    expect(view).toContain("rankedInviteGateway");
    // No hardcoded copy: the reason has exactly one source.
    expect(view).not.toContain("aren't open yet");
  });
});
