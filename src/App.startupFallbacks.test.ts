/**
 * Startup and entry→hub Suspense fallbacks, pinned against the route
 * declarations in App.tsx.
 *
 * Asserted against source for the same reason as App.routing-contract.test.ts:
 * App mounts BrowserRouter and every provider itself, so it cannot be rendered
 * at an arbitrary path in jsdom. The declaration is the contract — if someone
 * re-points / or /lol at a full-screen logo loader, that is the regression.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const layoutSource = readFileSync(resolve(__dirname, "components/Layout.tsx"), "utf8");

function routeLine(path: string): string {
  const line = appSource
    .split("\n")
    .find((l) => l.includes(`path="${path}"`) && l.includes("<Route"));
  if (!line) throw new Error(`no <Route> declared for ${path}`);
  return line;
}

describe("the legacy wordmark is gone from every startup path", () => {
  it("is not referenced by the route table", () => {
    expect(appSource).not.toContain("mogsy-logo-text.png");
  });

  it("is not referenced by the shell or its loaders", () => {
    expect(layoutSource).not.toContain("mogsy-logo-text.png");
  });

  it("leaves no pulsing full-screen loader behind in the shell", () => {
    expect(layoutSource).not.toContain("animate-pulse");
  });
});

describe("the entrance route paints its own shell", () => {
  it("falls back to the entrance shell, not a route loader", () => {
    const root = appSource
      .split("\n")
      .find((l) => l.includes("<MogzyEntryV2 seo=\"root\" />"));
    expect(root).toBeDefined();
    expect(root!).toContain("fallback={<EntryShell />}");
    expect(root!).not.toContain("RouteLoader");
  });
});

describe("the hub route paints its own shell", () => {
  it("falls back to the library shell", () => {
    expect(routeLine("/lol")).toContain("fallback={<LibraryHubShell />}");
  });

  it("does not fall back to a full-screen loader", () => {
    expect(routeLine("/lol")).not.toContain("RouteLoader");
  });
});

describe("entry → hub navigation mounts no intermediate loader", () => {
  it("keeps every League destination on the in-shell transparent fallback", () => {
    // These are the routes reachable from the hub. A full-screen fallback on any
    // of them would blank the shell the visitor can already see.
    for (const path of ["/lol/tier-list", "/lol/docs", "/lol/history", "/combat-lab"]) {
      expect(routeLine(path)).not.toContain("RouteLoader");
    }
  });

  it("holds the content area open inside the already-mounted shell", () => {
    expect(layoutSource).toMatch(/Suspense fallback=\{<div aria-hidden className="min-h-\[50vh\]" \/>\}/);
  });
});

describe("route guards are untouched by the shell work", () => {
  it("keeps the hub inside <Layout> rather than promoting it out", () => {
    expect(routeLine("/lol")).not.toContain("<ProtectedRoute>");
    expect(appSource).toContain("<Route element={<Layout />}>");
  });

  it("keeps the ranked tutorial guard on the ranked surfaces", () => {
    expect(routeLine("/quiz/ranked")).toContain("<RequireRankedTutorial>");
    expect(routeLine("/quiz/daily")).toContain("<RequireRankedTutorial>");
  });

  it("keeps admin surfaces behind AdminRoute", () => {
    expect(routeLine("/quiz/admin")).toContain("<AdminRoute>");
    expect(routeLine("/admin/quiz-broadcast/view")).toContain("<AdminRoute>");
  });

  it("keeps the profile behind ProtectedRoute", () => {
    expect(routeLine("/profile")).toContain("<ProtectedRoute>");
  });
});

describe("the auth/settings gate is preserved, not removed", () => {
  it("still blocks the shell on both authorities", () => {
    expect(layoutSource).toContain("if (loading || settingsLoading)");
  });
});
