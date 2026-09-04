// ---------------------------------------------------------------------------
// Registry ⇄ router agreement.
//
// The Admin Atlas found three parallel hand-written route lists — the old
// directory registry, /admin/about §14 and /admin/diagnostics — and all three
// had drifted from the router. This test is the mechanism that stops the new
// registry becoming the fourth: it reads src/App.tsx and asserts that every
// path the registry advertises is actually declared, and that every legacy
// admin route still resolves.
//
// It reads the router SOURCE rather than rendering it, because rendering App
// needs Supabase, the auth providers and the network. A source assertion still
// fails the moment a route is renamed or deleted, which is the drift class
// that actually bit.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TEAM_SIM_DEV_ROUTE, TEAM_SIM_ROUTE } from "@/lib/combat-lab/team-sim/featureGate";
import {
  LEGACY_ESPORTS_LIVE_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
} from "@/lib/pro-play/routes";
import { ADMIN_TOOLS, legacyRouteMap } from "./admin-registry";

const appSource = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");

/**
 * Full paths declared in App.tsx, resolving nesting.
 *
 * React Router children carry RELATIVE paths, so `<Route path="queue">` inside
 * `<Route path="/admin/knowledge">` is /admin/knowledge/queue. The parser keeps
 * a stack of open parents so a nested declaration resolves the way the router
 * resolves it. Constant-valued paths are substituted from the module that
 * exports them.
 */
const PATH_CONSTANTS: Record<string, string> = {
  TEAM_SIM_ROUTE,
  TEAM_SIM_DEV_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  LEGACY_ESPORTS_LIVE_ROUTE,
};

function declaredPaths(source: string): Set<string> {
  const paths = new Set<string>();
  const stack: string[] = [];
  const join = (parent: string | undefined, path: string) => {
    if (path.startsWith("/")) return path;
    const base = parent ?? "";
    return `${base.replace(/\/$/, "")}/${path}`;
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("</Route>")) {
      stack.pop();
      continue;
    }
    const match = /<Route\s+[^>]*?path=(?:"([^"]+)"|\{([A-Za-z_][A-Za-z0-9_]*)\})/.exec(line);
    if (!match) {
      // A multi-line <Route ...> opening tag: its path sits on its own line.
      const bare = /^path=(?:"([^"]+)"|\{([A-Za-z_][A-Za-z0-9_]*)\})/.exec(line);
      if (!bare) continue;
      const value = bare[1] ?? PATH_CONSTANTS[bare[2]];
      if (value === undefined) continue;
      const full = join(stack[stack.length - 1], value);
      paths.add(full);
      stack.push(full);
      continue;
    }
    const value = match[1] ?? PATH_CONSTANTS[match[2]];
    if (value === undefined) continue;
    const full = join(stack[stack.length - 1], value);
    paths.add(full);
    // A self-closing element is a leaf; anything else opens a parent. The test
    // is the line ENDING, not whether "/>" appears anywhere: an opening tag
    // whose element prop contains <RouteFallback /> also contains "/>".
    if (!line.endsWith("/>")) stack.push(full);
  }
  return paths;
}

const DECLARED = declaredPaths(appSource);

/** Registry paths are navigation targets; strip the query the tab carries. */
const basePath = (p: string) => p.split("?")[0];

describe("registry ⇄ router agreement", () => {
  it("declares the ten area routes plus the two entry points", () => {
    for (const path of [
      "/admin",
      "/admin/all-tools",
      "/admin/people",
      "/admin/leaguecraft",
      "/admin/ranked",
      "/admin/simulation",
      "/admin/game-data",
      "/admin/studio",
      "/admin/operations",
      "/admin/developer",
      "/admin/arena",
    ]) {
      expect(DECLARED.has(path), `App.tsx is missing ${path}`).toBe(true);
    }
  });

  it("declares a route for every navigable registry path", () => {
    const missing: string[] = [];
    for (const tool of ADMIN_TOOLS) {
      if (!tool.path) continue;
      if (tool.kind === "gap" || tool.kind === "backend") continue;
      const path = basePath(tool.path);
      // Parameterized destinations are declared with their parameter segment.
      const declared =
        DECLARED.has(path) ||
        [...DECLARED].some((d) => d.includes(":") && d.split("/:")[0] === path);
      if (!declared) missing.push(`${tool.id} → ${path}`);
    }
    expect(missing).toEqual([]);
  });

  it("keeps every legacy admin route resolving", () => {
    const missing: string[] = [];
    for (const { from, toolId } of legacyRouteMap()) {
      const path = basePath(from);
      const declared =
        DECLARED.has(path) ||
        [...DECLARED].some((d) => d.includes(":") && d.split("/:")[0] === path.split("/:")[0]);
      if (!declared) missing.push(`${toolId} → ${from}`);
    }
    expect(missing).toEqual([]);
  });

  it("redirects /admin/directory rather than deleting it", () => {
    expect(appSource).toMatch(
      /path="directory"\s+element=\{<Navigate to="\/admin\/all-tools" replace \/>\}/,
    );
  });

  it("keeps the pre-migration directory page mounted, not deleted", () => {
    expect(DECLARED.has("/admin/legacy-directory")).toBe(true);
    expect(appSource).toContain("<AdminDirectory />");
  });

  it("keeps the legacy 17-tab dashboard mounted", () => {
    expect(DECLARED.has("/admin/legacy-dashboard")).toBe(true);
    expect(appSource).toMatch(/path="legacy-dashboard" element=\{<Admin \/>\}/);
  });

  it("keeps every quiz workspace alias resolving, now onto the Review tab", () => {
    // The bookmarks survive the retirement of the Builder tab: /admin/quiz-builder
    // still resolves, and lands on Quiz Review rather than on a tab that is gone.
    expect(appSource).toContain('<Route path="/admin/quiz-review" element={<QuizContentRedirect tab="review" />} />');
    expect(appSource).toContain('<Route path="/admin/quiz-builder" element={<QuizContentRedirect tab="review" />} />');
    expect(appSource).toContain('<Route path="/admin/workspace" element={<Navigate to="/admin/quiz-content" replace />} />');
  });
});

describe("authorization is unchanged by the reorganization", () => {
  it("gates the Admin shell with the same AdminRoute the dashboard used", () => {
    expect(appSource).toMatch(
      /<Route path="\/admin" element=\{<AdminRoute>[\s\S]{0,160}?<AdminShell \/>/,
    );
  });

  it("keeps /admin/knowledge master-admin only", () => {
    expect(appSource).toMatch(/path="\/admin\/knowledge"[\s\S]{0,200}?roles=\{\["master_admin"\]\}/);
  });

  it("keeps /moderator on its own moderator-inclusive gate", () => {
    expect(appSource).toContain(
      '<Route path="/moderator" element={<AdminRoute roles={["moderator", "admin", "master_admin"]}>',
    );
  });

  it("keeps the chrome-free broadcast capture view outside the Admin shell", () => {
    // Inside the shell it would gain navigation chrome and break OBS capture.
    const shellStart = appSource.indexOf('<Route path="/admin" element={<AdminRoute>');
    const shellEnd = appSource.indexOf('<Route path="/moderator"');
    const shellBlock = appSource.slice(shellStart, shellEnd);
    expect(shellBlock).not.toContain("quiz-broadcast/view");
    expect(appSource).toContain('<Route path="/admin/quiz-broadcast/view"');
  });

  it("does not touch the Ranked tutorial or onboarding routes", () => {
    expect(appSource).toContain('<Route path="/onboarding/ranked-tutorial"');
    expect(appSource).toContain('<Route path="/quiz/tutorial"');
    expect(appSource).toContain('<Route path="/quiz/ranked"');
  });

  it("leaves normal Ranked and Ranked Bot player access untouched", () => {
    // /quiz/ranked keeps exactly its existing wrapper: the tutorial gate, and
    // nothing added by this reorganization.
    expect(appSource).toMatch(
      /<Route path="\/quiz\/ranked" element=\{<RequireRankedTutorial>[\s\S]{0,140}?<QuizRankedPage \/>/,
    );
  });
});
