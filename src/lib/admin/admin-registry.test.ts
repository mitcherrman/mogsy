// ---------------------------------------------------------------------------
// Registry invariants and the capability-preservation proof.
//
// The load-bearing test here is "supersedes the pre-migration directory": it
// asserts that every destination the old hand-maintained registry advertised
// is still present in the new one. That is the mechanical form of the absolute
// product rule — no admin capability may disappear. FUNNEL1C deleted that old
// registry (admin-directory.ts), so its path list is frozen below as data.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  ADMIN_ALL_TOOLS_PATH,
  ADMIN_AREAS,
  ADMIN_AREA_IDS,
  ADMIN_AREAS_BY_ID,
  ADMIN_HOME_PATH,
  ADMIN_TOOLS,
  dispositionCounts,
  legacyRouteMap,
  searchAdminTools,
  toolsForArea,
  toolsForSection,
} from "./admin-registry";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every path the deleted admin-directory.ts advertised (items, legacy aliases
 * and child actions), frozen at the commit that deleted it.
 */
const RETIRED_DIRECTORY_PATHS = [
  "/admin", "/admin/about", "/admin/blog", "/admin/combat-battles", "/admin/data", "/admin/demo",
  "/admin/diagnostics", "/admin/directory", "/admin/gaming", "/admin/knowledge", "/admin/knowledge/health",
  "/admin/knowledge/queue", "/admin/knowledge/rundown", "/admin/platform-policies", "/admin/play",
  "/admin/quiz-broadcast", "/admin/quiz-broadcast/view", "/admin/quiz-builder", "/admin/quiz-content",
  "/admin/quiz-content?tab=diagnostics", "/admin/quiz-content?tab=review", "/admin/quiz-review",
  "/admin/quiz-video-export", "/admin/users", "/admin/workspace", "/broadcast/live-view",
  "/combat-lab/diagnostics", "/dev/content-studio", "/dev/quiz-render", "/dev/ranked-duel", "/moderator",
  "/quiz/admin", "/quiz/diagnostics",
];

describe("admin registry — structure", () => {
  it("declares the eleven-area architecture in order, Analytics beside Overview", () => {
    expect(ADMIN_AREAS.map((a) => a.label)).toEqual([
      "Overview",
      "Analytics",
      "People",
      "Leaguecraft",
      "Ranked",
      "Simulation",
      "Game Data",
      "Studio",
      "Operations",
      "Developer",
      "Arena",
    ]);
    expect(ADMIN_AREA_IDS.length).toBe(ADMIN_AREAS.length);
  });

  it("marks Arena archived and Developer as engineering, and nothing else", () => {
    expect(ADMIN_AREAS_BY_ID.arena.kind).toBe("archived");
    expect(ADMIN_AREAS_BY_ID.arena.badge).toBe("Archived");
    expect(ADMIN_AREAS_BY_ID.developer.kind).toBe("developer");
    const live = ADMIN_AREAS.filter((a) => a.kind === "live").map((a) => a.id);
    expect(live).not.toContain("arena");
    expect(live).not.toContain("developer");
  });

  it("exports the canonical entry points", () => {
    expect(ADMIN_HOME_PATH).toBe("/admin");
    expect(ADMIN_ALL_TOOLS_PATH).toBe("/admin/all-tools");
  });

  it("has unique tool ids and area ids", () => {
    const ids = ADMIN_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const areas = ADMIN_AREAS.map((a) => a.id);
    expect(new Set(areas).size).toBe(areas.length);
  });

  it("places every tool in a section its area actually declares", () => {
    for (const tool of ADMIN_TOOLS) {
      const area = ADMIN_AREAS_BY_ID[tool.area];
      expect(area, tool.id).toBeTruthy();
      expect(
        area.sections.map((s) => s.id),
        `${tool.id} → ${tool.area}/${tool.section}`,
      ).toContain(tool.section);
    }
  });

  it("gives every area at least one section, and every section a summary", () => {
    for (const area of ADMIN_AREAS) {
      expect(area.sections.length, area.id).toBeGreaterThan(0);
      for (const section of area.sections) {
        expect(section.summary.length, `${area.id}/${section.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses leading-slash internal paths everywhere", () => {
    for (const tool of ADMIN_TOOLS) {
      if (!tool.path) continue;
      expect(tool.path.startsWith("/"), `${tool.id}: ${tool.path}`).toBe(true);
      expect(() => new URL(tool.path!, "https://mogzy.lol")).not.toThrow();
    }
    for (const { from } of legacyRouteMap()) {
      expect(from.startsWith("/"), from).toBe(true);
    }
  });
});

describe("admin registry — safety metadata", () => {
  it("gives every non-none danger level an explicit textual warning", () => {
    for (const tool of ADMIN_TOOLS) {
      if (tool.dangerLevel !== "none") {
        expect(tool.warning, tool.id).toBeTruthy();
      }
    }
  });

  it("records an authorization note on every tool", () => {
    for (const tool of ADMIN_TOOLS) {
      expect(tool.authorization.length, tool.id).toBeGreaterThan(0);
    }
  });

  it("keeps destructive capabilities out of the navigable set", () => {
    // A destructive capability may be DOCUMENTED anywhere, but it must never be
    // presented as a one-click navigable control that the reorganization added.
    const destructive = ADMIN_TOOLS.filter((t) => t.dangerLevel === "destructive");
    expect(destructive.length).toBeGreaterThan(0);
    for (const tool of destructive) {
      expect(["backend", "embedded"], `${tool.id} kind`).toContain(tool.kind);
    }
    const restore = ADMIN_TOOLS.find((t) => t.id === "db-restore")!;
    expect(restore.kind).toBe("backend");
    expect(restore.path).toBeUndefined();
    // The existing interlocks must stay described, so nobody "simplifies" them.
    for (const interlock of [
      "force=true",
      "X-Content-SHA256",
      "RESTORE_ALLOWED_DEST_DIRS",
      "RESTORE_MAX_UPLOAD_BYTES",
      "atomic",
    ]) {
      expect(restore.authorization, interlock).toContain(interlock);
    }
  });

  it("labels every developer-only tool and homes it in Developer", () => {
    const devTools = ADMIN_TOOLS.filter((t) => t.developerOnly);
    expect(devTools.length).toBeGreaterThan(0);
    for (const tool of devTools) {
      expect(tool.area, tool.id).toBe("developer");
      expect(tool.disposition, tool.id).toBe("DEVELOPER-ONLY");
    }
  });

  it("never presents a future gap as a working control", () => {
    for (const tool of ADMIN_TOOLS.filter((t) => t.kind === "gap")) {
      expect(tool.path, tool.id).toBeUndefined();
    }
    // Both named Ranked gaps are present and honest.
    const gapIds = ADMIN_TOOLS.filter((t) => t.kind === "gap").map((t) => t.id);
    expect(gapIds).toContain("ranked-match-inspector");
    expect(gapIds).toContain("ranked-queue-inspection");
  });
});

describe("admin registry — capability preservation", () => {
  it("supersedes the pre-migration directory: every advertised path survives", () => {
    const registryPaths = new Set<string>();
    for (const tool of ADMIN_TOOLS) {
      if (tool.path) registryPaths.add(tool.path.split("?")[0]);
      for (const legacy of tool.legacyRoutes ?? []) registryPaths.add(legacy.split("?")[0]);
    }
    registryPaths.add("/admin"); // the Admin home — the Overview tool's own path
    for (const path of RETIRED_DIRECTORY_PATHS) {
      expect(registryPaths.has(path.split("?")[0]), `lost ${path}`).toBe(true);
    }
  });

  it("loses nothing: every tool carries an explicit disposition", () => {
    const counts = dispositionCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(ADMIN_TOOLS.length);
    for (const tool of ADMIN_TOOLS) {
      expect(tool.disposition, tool.id).toBeTruthy();
      expect(tool.oldLocation.length, tool.id).toBeGreaterThan(0);
    }
  });

  it("explains every DEFERRED capability as still accessible or an owner decision", () => {
    for (const tool of ADMIN_TOOLS.filter((t) => t.disposition === "DEFERRED")) {
      expect(tool.notes, tool.id).toBeTruthy();
      expect(
        /STILL ACCESSIBLE|Owner decision|owner review|no endpoint exists|Future gap|FUTURE GAP/i.test(
          tool.notes ?? "",
        ),
        `${tool.id}: ${tool.notes}`,
      ).toBe(true);
    }
  });

  it("preserves the three quiz workspace aliases and the directory alias", () => {
    const froms = legacyRouteMap().map((r) => r.from);
    for (const alias of [
      "/admin/quiz-builder",
      "/admin/quiz-review",
      "/admin/workspace",
      "/admin/directory",
    ]) {
      expect(froms, alias).toContain(alias);
    }
  });

  it("keeps the moderator panel intact and does not restore its Users tab", () => {
    const mod = ADMIN_TOOLS.find((t) => t.id === "moderator-panel")!;
    expect(mod.disposition).toBe("KEEP");
    expect(mod.path).toBe("/moderator");
    expect(mod.requiredRole).toBe("moderator+");
    expect(mod.description).not.toMatch(/\bUsers\b/);
    expect(mod.authorization).toMatch(/unchanged/i);
  });

  it("does not mount the orphaned preset-items editor", () => {
    const orphan = ADMIN_TOOLS.find((t) => t.id === "arena-preset-items-orphan")!;
    expect(orphan.kind).toBe("gap");
    expect(orphan.path).toBeUndefined();
    expect(orphan.disposition).toBe("DEFERRED");
  });
});

describe("admin registry — helpers", () => {
  it("scopes tools by area and section", () => {
    expect(toolsForArea("ranked").length).toBeGreaterThan(0);
    for (const tool of toolsForArea("ranked")) expect(tool.area).toBe("ranked");
    for (const tool of toolsForSection("operations", "danger-zone")) {
      expect(tool.section).toBe("danger-zone");
    }
  });

  it("searches titles, paths and old locations", () => {
    expect(searchAdminTools("launch-readiness").map((t) => t.id)).toContain("ranked-overview");
    expect(searchAdminTools("/admin/blog").map((t) => t.id)).toContain("blog-cms");
    expect(searchAdminTools("17-tab").map((t) => t.id)).toEqual(["overview-dashboard"]);
    expect(searchAdminTools("").length).toBe(ADMIN_TOOLS.length);
    expect(searchAdminTools("zzzz-no-such-tool").length).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// ADMIN1A → FUNNEL1C/ADMIN2 — the master-admin user directory.
//
// ADMIN1A registered /admin/users, a live master-gated route the registry had
// never listed. FUNNEL1C removed it as a DESTINATION: three ways to browse
// accounts lived under People › Users, so it became that section's master-only
// Identities view and the path became a redirect.
// ---------------------------------------------------------------------------

describe("accounts have exactly one destination", () => {
  const identities = ADMIN_TOOLS.find((t) => t.id === "people-user-identities")!;

  it("keeps the identity directory under People › Users as a panel", () => {
    expect(identities).toBeTruthy();
    expect(identities.area).toBe("people");
    expect(identities.section).toBe("users");
    expect(identities.kind).toBe("panel");
    expect(identities.path).toBe("/admin/people?section=users&view=identities");
  });

  it("records the master-admin authority it already enforces, without changing it", () => {
    expect(identities.requiredRole).toBe("master_admin");
    expect(identities.authorization).toMatch(/master_admin|is_master_admin/);
  });

  it("is searchable in All Tools", () => {
    expect(searchAdminTools("identities").map((t) => t.id)).toContain(identities.id);
  });

  it("advertises no second account-browsing route", () => {
    const routes = ADMIN_TOOLS.filter(
      (t) => t.kind === "route" && /^\/admin\/users/.test(t.path ?? ""),
    );
    expect(routes).toEqual([]);
    // Accounts, Profile browser and Identities are views of ONE destination.
    const userTools = toolsForSection("people", "users").filter((t) => t.kind === "panel");
    const bases = new Set(userTools.map((t) => t.path?.split("?")[0]));
    expect([...bases]).toEqual(["/admin/people"]);
  });
});


// ---------------------------------------------------------------------------
// FUNNEL1C / ADMIN2 — one authority, one path per job.
// ---------------------------------------------------------------------------

describe("FUNNEL1C — a single Admin inventory", () => {
  it("has deleted the second hand-maintained registry", () => {
    expect(existsSync(resolve(__dirname, "admin-directory.ts"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../../pages/admin/AdminDirectory.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../../pages/Admin.tsx"))).toBe(false);
  });

  it("advertises no legacy shell as a destination", () => {
    const ids = ADMIN_TOOLS.map((t) => t.id);
    expect(ids).not.toContain("legacy-admin-dashboard");
    expect(ids).not.toContain("legacy-admin-directory");
    for (const tool of ADMIN_TOOLS) {
      expect(tool.path ?? "", tool.id).not.toMatch(/legacy-(dashboard|directory)/);
    }
  });

  it("keeps the retired paths as redirects owned by their canonical home", () => {
    const map = new Map(legacyRouteMap().map((r) => [r.from, r.to]));
    expect(map.get("/admin/legacy-dashboard")).toBe("/admin");
    expect(map.get("/admin/legacy-directory")).toBe(ADMIN_ALL_TOOLS_PATH);
    expect(map.get("/admin/directory")).toBe(ADMIN_ALL_TOOLS_PATH);
    expect(map.get("/admin/data")).toBe("/admin/arena/data-graphs");
    expect(map.get("/admin/demo-analytics")).toBe("/admin/premium-preview");
  });

  it("gives every navigable destination exactly one canonical tool", () => {
    // Panels may share their area-page URL; a ROUTE is a destination and must be unique.
    const routes = ADMIN_TOOLS.filter((t) => t.kind === "route" && t.path).map((t) => t.path!);
    const dupes = routes.filter((p, i) => routes.indexOf(p) !== i);
    expect(dupes).toEqual([]);
  });

  it("never lists a path both as a destination and as someone else's redirect", () => {
    const destinations = new Set(ADMIN_TOOLS.map((t) => t.path?.split("?")[0]).filter(Boolean));
    for (const { from, toolId, to } of legacyRouteMap()) {
      if (from.split("?")[0] === to.split("?")[0]) continue; // a tool's own path, recorded as kept
      expect(destinations.has(from), `${toolId}: ${from} is both a redirect and a destination`).toBe(false);
    }
  });

  it("has no two tools with the same title", () => {
    const titles = ADMIN_TOOLS.map((t) => t.title);
    const dupes = titles.filter((x, i) => titles.indexOf(x) !== i);
    expect(dupes).toEqual([]);
  });
});

describe("FUNNEL1C — Analytics is first-class and unambiguous", () => {
  it("is a live area beside Overview with the seven sections", () => {
    const area = ADMIN_AREAS_BY_ID.analytics;
    expect(area.kind).toBe("live");
    expect(area.path).toBe("/admin/analytics");
    expect(ADMIN_AREA_IDS.indexOf("analytics")).toBe(ADMIN_AREA_IDS.indexOf("overview") + 1);
    expect(area.sections.map((s) => s.id)).toEqual([
      "overview",
      "acquisition",
      "engagement",
      "accounts",
      "retention",
      "sources",
      "health",
    ]);
  });

  it("is the only destination called Analytics", () => {
    const named = ADMIN_TOOLS.filter((t) => /analytics/i.test(t.title));
    for (const tool of named) expect(tool.area, tool.id).toBe("analytics");
    const premium = ADMIN_TOOLS.find((t) => t.id === "premium-trends-preview")!;
    expect(premium.title).not.toMatch(/analytics/i);
    expect(premium.path).toBe("/admin/premium-preview");
  });

  it("does not make Operations the home of product analytics", () => {
    const ops = ADMIN_AREAS_BY_ID.operations;
    for (const section of ops.sections) {
      expect(`${section.label} ${section.summary}`, section.id).not.toMatch(/image-click|analytics graphs/i);
    }
    expect(toolsForArea("operations").filter((t) => /analytics/i.test(t.title))).toEqual([]);
  });

  it("archives the Match & Rank graph builder under Arena", () => {
    const graphs = ADMIN_TOOLS.find((t) => t.id === "arena-data-graphs")!;
    expect(graphs.area).toBe("arena");
    expect(graphs.disposition).toBe("ARCHIVE");
  });

  it("has exactly one operator Quiz Diagnostics, and the old inspector is Developer-only", () => {
    expect(ADMIN_TOOLS.filter((t) => t.title === "Quiz Diagnostics").map((t) => t.path)).toEqual([
      "/admin/quiz-content?tab=diagnostics",
    ]);
    const inspector = ADMIN_TOOLS.find((t) => t.path === "/quiz/diagnostics")!;
    expect(inspector.area).toBe("developer");
    expect(inspector.developerOnly).toBe(true);
  });
});
