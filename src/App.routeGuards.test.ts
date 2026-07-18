import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Assert the App route table gates exactly the routes it should. This is a
// structural regression guard: if someone unwraps a gated quiz route or wraps
// the tutorial route in its own guard, these tests fail.
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

/** First JSX component that the given route path's `element={` opens with. */
function firstElementFor(path: string): string | null {
  const re = new RegExp(`path="${path.replace(/[/]/g, "\\/")}"\\s+element=\\{(<[A-Za-z]+)`);
  const m = appSource.match(re);
  return m ? m[1] : null;
}

const GATED = ["/quiz", "/quiz/daily", "/quiz/ranked"];

describe("App /quiz route classification", () => {
  it("gates every normal quiz gameplay / hub route with RequireRankedTutorial", () => {
    for (const path of GATED) {
      expect(firstElementFor(path), `${path} should be gated`).toBe("<RequireRankedTutorial");
    }
  });

  it("never guards the tutorial route with itself (no self-redirect loop)", () => {
    // The onboarding route is auth-gated only, never behind RequireRankedTutorial.
    expect(firstElementFor("/onboarding/ranked-tutorial")).toBe("<ProtectedRoute");
    expect(appSource).not.toMatch(
      /path="\/onboarding\/ranked-tutorial"\s+element=\{<RequireRankedTutorial/,
    );
  });

  it("keeps the admin quiz route on AdminRoute (admin surface, not a normal bypass)", () => {
    expect(firstElementFor("/quiz/admin")).toBe("<AdminRoute");
  });

  it("leaves diagnostics and legal/auth routes ungated", () => {
    // Non-gameplay diagnostics readout — not a way to play the quiz.
    expect(firstElementFor("/quiz/diagnostics")).not.toBe("<RequireRankedTutorial");
    // Required account / legal routes must never sit behind the tutorial gate.
    for (const path of ["/auth", "/reset-password", "/terms", "/privacy", "/security", "/contact"]) {
      expect(firstElementFor(path)).not.toBe("<RequireRankedTutorial");
    }
  });
});
