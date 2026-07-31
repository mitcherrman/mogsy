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

describe("startup fallbacks are plain surfaces, not skeletons", () => {
  it("gives the entrance its base colour and nothing else", () => {
    const root = appSource
      .split("\n")
      .find((l) => l.includes("<MogzyEntryV2 seo=\"root\" />"));
    expect(root).toBeDefined();
    expect(root!).toContain('fallback={<StartupSurface pathname="/" />}');
    expect(root!).not.toContain("RouteLoader");
  });

  it("leaves the hub on the invisible in-shell fallback", () => {
    // Layout is already mounted and already painting the League colour here, so
    // the hub needs its height held and nothing drawn. Rendering the hub's own
    // geometry made the visitor watch the page assemble.
    expect(routeLine("/lol")).toContain("fallback={<RouteFallback />}");
    expect(routeLine("/lol")).not.toContain("RouteLoader");
  });

  it("no longer ships any destination-shaped skeleton component", () => {
    const shellSource = readFileSync(
      resolve(__dirname, "components/startup/StartupShells.tsx"),
      "utf8",
    );
    for (const gone of ["LibraryHubShell", "EntryShell", "NeutralBootShell", "RouteBootShell"]) {
      expect(appSource).not.toContain(gone);
      expect(layoutSource).not.toContain(gone);
      expect(shellSource).not.toContain(gone);
    }
    expect(shellSource).not.toMatch(/data-shell-book|role="status"|animate-/);
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
