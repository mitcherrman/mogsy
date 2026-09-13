import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Assert the App route table gates exactly the routes it should. Since TUT1
// that includes the negative case: the scripted Ranked tutorial and its route
// guard are gone, and no quiz route may reacquire a tutorial gate.
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

/** First JSX component that the given route path's `element={` opens with. */
function firstElementFor(path: string): string | null {
  const re = new RegExp(`path="${path.replace(/[/]/g, "\\/")}"\\s+element=\\{(<[A-Za-z]+)`);
  const m = appSource.match(re);
  return m ? m[1] : null;
}

const UNGATED_QUIZ = ["/quiz", "/quiz/daily", "/quiz/daily-challenge", "/quiz/matchup", "/quiz/ranked"];

describe("TUT1 — no Ranked tutorial gate survives", () => {
  it("opens every normal quiz gameplay / hub route directly, with no tutorial gate", () => {
    for (const path of UNGATED_QUIZ) {
      expect(firstElementFor(path), `${path} should not be gated`).toBe("<Suspense");
    }
  });

  it("never mentions the removed guard or its modules anywhere in the route table", () => {
    expect(appSource).not.toContain("RequireRankedTutorial");
    expect(appSource).not.toContain("RankedTutorialOnboardingPage");
    expect(appSource).not.toContain("RankedTutorialPage");
    expect(appSource).not.toContain("lib/ranked-tutorial");
  });

  it("keeps the admin quiz route on AdminRoute (admin surface, not a normal bypass)", () => {
    expect(firstElementFor("/quiz/admin")).toBe("<AdminRoute");
  });
});

describe("retired tutorial URLs", () => {
  // There are no users, so there is no bookmark to honour and no reason to
  // carry a redirect. The routes are simply not declared: they fall through to
  // NotFound like any other unknown path.
  it("declares no tutorial route at all — not even a redirect", () => {
    for (const path of [
      "/onboarding/ranked-tutorial",
      "/quiz/tutorial",
      "/dev/ranked-tutorial",
    ]) {
      expect(firstElementFor(path), `${path} is still routed`).toBeNull();
      expect(appSource, `${path} is still declared`)
        .not.toContain(`path="${path}"`);
    }
  });

  it("leaves no tutorial string anywhere in the route table", () => {
    expect(appSource.toLowerCase()).not.toContain("tutorial");
  });
});

describe("admin platform-policies route", () => {
  // The Admin Architecture reorganization moved every /admin page under one
  // shell layout route, so the gate now sits on the PARENT rather than being
  // repeated per page. The intent of this guard is unchanged: reaching
  // platform-policies must require AdminRoute, not merely fail to be linked.
  it("is admin-gated, not merely hidden", () => {
    // The child route exists under /admin...
    expect(appSource).toMatch(/<Route path="platform-policies" element=\{/);
    // ...and the /admin layout that owns it is wrapped in AdminRoute.
    expect(firstElementFor("/admin")).toBe("<AdminRoute");
  });

  it("inherits the gate rather than losing it — the shell is never ungated", () => {
    expect(appSource).toMatch(
      /<Route path="\/admin" element=\{<AdminRoute>[\s\S]{0,200}?<AdminShell \/>/,
    );
    // No admin page may be declared outside a gate. The three deliberate
    // exceptions keep their own explicit AdminRoute wrapper.
    for (const explicit of [
      '<Route path="/admin/quiz-content" element={<AdminRoute>',
      '<Route path="/admin/quiz-broadcast/view" element={<AdminRoute>',
    ]) {
      expect(appSource, explicit).toContain(explicit);
    }
    expect(appSource).toMatch(/path="\/admin\/knowledge"[\s\S]{0,200}?roles=\{\["master_admin"\]\}/);
  });
});
