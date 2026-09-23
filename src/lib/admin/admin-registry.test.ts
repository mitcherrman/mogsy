// ---------------------------------------------------------------------------
// Registry invariants, and LEGACY1's retired-concept guards.
//
// This file USED to carry a capability-preservation proof: every destination
// the pre-migration directory advertised had to still exist. LEGACY1 retired
// that rule on the owner's instruction — preserving the Mogsy voting product
// is no longer the goal, deleting it is — so the frozen path list is now split
// into two: paths that must still resolve, and paths that must NOT come back.
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
 * CURRENT destinations that the pre-migration directory also advertised. Each
 * one is part of Mogzy today and must keep resolving.
 */
const PRESERVED_DIRECTORY_PATHS = [
  "/admin", "/admin/blog", "/admin/combat-battles",
  "/admin/diagnostics", "/admin/knowledge", "/admin/knowledge/health",
  "/admin/knowledge/queue", "/admin/knowledge/rundown", "/admin/platform-policies",
  "/admin/quiz-broadcast", "/admin/quiz-broadcast/view", "/admin/quiz-builder", "/admin/quiz-content",
  "/admin/quiz-content?tab=diagnostics", "/admin/quiz-content?tab=review", "/admin/quiz-review",
  "/admin/quiz-video-export", "/admin/users", "/admin/workspace", "/broadcast/live-view",
  "/combat-lab/diagnostics", "/dev/content-studio", "/dev/quiz-render", "/dev/ranked-duel",
  "/quiz/admin", "/quiz/diagnostics",
];

/**
 * LEGACY1 — retired paths. The registry must not name any of these again, as a
 * destination OR as a redirect: the surfaces behind them are deleted, and an
 * entry here is exactly how a future agent mistakes a dead product for a live
 * one. `/admin/about` and `/moderator` are on this list deliberately: their
 * capabilities are gone (Internal Docs) or covered by People › Moderation.
 */
const ERADICATED_PATHS = [
  "/admin/about", "/admin/arena", "/admin/arena/data-graphs", "/admin/data", "/admin/demo",
  "/admin/directory", "/admin/gaming", "/admin/legacy-dashboard", "/admin/legacy-directory",
  "/admin/play", "/moderator", "/shop", "/swipe", "/swipe-game", "/play", "/home", "/elo-check",
  "/referral", "/multiplayer", "/swipe-leagues",
];

describe("admin registry — structure", () => {
  it("declares the nine-area architecture in order, Users beside Overview", () => {
    expect(ADMIN_AREAS.map((a) => a.label)).toEqual([
      "Overview",
      "Users",
      "Leaguecraft",
      "Ranked",
      "Simulation",
      "Game Data",
      "Studio",
      "Operations",
      "Developer",
    ]);
    expect(ADMIN_AREA_IDS.length).toBe(ADMIN_AREAS.length);
  });

  it("marks Developer as engineering, and has no archived area at all", () => {
    expect(ADMIN_AREAS_BY_ID.developer.kind).toBe("developer");
    const live = ADMIN_AREAS.filter((a) => a.kind === "live").map((a) => a.id);
    expect(live).not.toContain("developer");
    // LEGACY1: the retired voting product was deleted rather than archived, so
    // "archived" is no longer a kind an area can have.
    expect(ADMIN_AREAS.map((a) => a.kind)).not.toContain("archived");
    expect(ADMIN_AREA_IDS).not.toContain("arena");
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
  it("keeps every CURRENT destination the pre-migration directory advertised", () => {
    const registryPaths = new Set<string>();
    for (const tool of ADMIN_TOOLS) {
      if (tool.path) registryPaths.add(tool.path.split("?")[0]);
      for (const legacy of tool.legacyRoutes ?? []) registryPaths.add(legacy.split("?")[0]);
    }
    registryPaths.add("/admin"); // the Admin home — the Overview tool's own path
    for (const path of PRESERVED_DIRECTORY_PATHS) {
      expect(registryPaths.has(path.split("?")[0]), `lost ${path}`).toBe(true);
    }
  });

  it("LEGACY1 guard: names no eradicated path as a destination or a redirect", () => {
    const named = new Set<string>();
    for (const tool of ADMIN_TOOLS) {
      if (tool.path) named.add(tool.path.split("?")[0]);
      for (const legacy of tool.legacyRoutes ?? []) named.add(legacy.split("?")[0]);
    }
    for (const path of ERADICATED_PATHS) {
      expect(named.has(path), `${path} is back in the registry`).toBe(false);
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

  it("preserves the three quiz workspace aliases", () => {
    const froms = legacyRouteMap().map((r) => r.from);
    for (const alias of [
      "/admin/quiz-builder",
      "/admin/quiz-review",
      "/admin/workspace",
    ]) {
      expect(froms, alias).toContain(alias);
    }
  });

  it("LEGACY1 guard: registers no retired voting-product tool", () => {
    const ids = ADMIN_TOOLS.map((t) => t.id);
    for (const id of [
      "arena-collections",
      "arena-bots",
      "arena-promoted",
      "arena-ranks",
      "arena-play-layout",
      "arena-gaming",
      "arena-demo",
      "arena-data-graphs",
      "arena-preset-items-orphan",
      "arena-swipe-ad-override",
      "shop-grant-diamonds",
      "moderator-panel",
      "internal-docs",
    ]) {
      expect(ids, id).not.toContain(id);
    }
    // And no tool may advertise minting the retired currency.
    for (const tool of ADMIN_TOOLS) {
      expect(`${tool.title} ${tool.description}`, tool.id).not.toMatch(/diamond/i);
    }
  });

  it("LEGACY1: Audio Studio kept its capability and gained its own home", () => {
    const audio = ADMIN_TOOLS.find((t) => t.id === "audio-studio")!;
    expect(audio).toBeTruthy();
    expect(audio.area).toBe("studio");
    expect(audio.section).toBe("audio");
    expect(audio.kind).toBe("route");
    expect(audio.path).toBe("/admin/audio-studio");
    expect(audio.disposition).toBe("MOVE");
    // Its old home was the retired shell — recorded, not resurrected.
    expect(audio.oldLocation).toMatch(/admin\/gaming/);
    expect(audio.authorization).toMatch(/audio_event_bindings|audio_assets/);
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
    expect(searchAdminTools("audio").map((t) => t.id)).toContain("audio-studio");
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

  it("keeps the identity directory under Users › Accounts as a panel", () => {
    expect(identities).toBeTruthy();
    expect(identities.area).toBe("users");
    expect(identities.section).toBe("accounts");
    expect(identities.kind).toBe("panel");
    expect(identities.path).toBe("/admin/users?section=accounts&view=identities");
  });

  it("records the master-admin authority it already enforces, without changing it", () => {
    expect(identities.requiredRole).toBe("master_admin");
    expect(identities.authorization).toMatch(/master_admin|is_master_admin/);
  });

  it("is searchable in All Tools", () => {
    expect(searchAdminTools("identities").map((t) => t.id)).toContain(identities.id);
  });

  it("advertises no second account-browsing route", () => {
    // USERS1 — /admin/users is now the Users AREA, not a second directory, so
    // the only route under it is the area itself. Accounts, Profile browser,
    // Roles & access and Identities are views of that one destination.
    const routes = ADMIN_TOOLS.filter(
      (t) => t.kind === "route" && /^\/admin\/users/.test(t.path ?? ""),
    ).map((t) => t.path);
    expect(routes).toEqual(["/admin/users"]);
    const userTools = toolsForSection("users", "accounts").filter((t) => t.kind === "panel");
    const bases = new Set(userTools.map((t) => t.path?.split("?")[0]));
    expect([...bases]).toEqual(["/admin/users"]);
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

  it("keeps only the redirects whose destination is a current surface", () => {
    const map = new Map(legacyRouteMap().map((r) => [r.from, r.to]));
    expect(map.get("/admin/demo-analytics")).toBe("/admin/premium-preview");
    // USERS1 — People and Analytics are gone as destinations; the two old
    // paths redirect for bookmarks and are advertised nowhere.
    expect(map.get("/admin/analytics")).toBe("/admin/users");
    expect(map.get("/admin/analytics?section=health")).toBe("/admin/users?section=traffic-health");
    // LEGACY1 deleted the redirects that existed only to keep a dead concept
    // reachable. A redirect to nowhere is not compatibility, it is a rumour.
    for (const gone of [
      "/admin/legacy-dashboard",
      "/admin/legacy-directory",
      "/admin/directory",
      "/admin/data",
      "/admin/about",
    ]) {
      expect(map.has(gone), gone).toBe(false);
    }
    expect(ADMIN_ALL_TOOLS_PATH).toBe("/admin/all-tools");
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

describe("USERS1 — Users is the one audience domain", () => {
  it("is a live area beside Overview with the eight sections", () => {
    const area = ADMIN_AREAS_BY_ID.users;
    expect(area.kind).toBe("live");
    expect(area.path).toBe("/admin/users");
    expect(ADMIN_AREA_IDS.indexOf("users")).toBe(ADMIN_AREA_IDS.indexOf("overview") + 1);
    expect(area.sections.map((s) => s.id)).toEqual([
      "overview",
      "visitors",
      "accounts",
      "activity",
      "acquisition",
      "retention",
      "moderation",
      "traffic-health",
    ]);
  });

  it("has removed People and Analytics as areas entirely", () => {
    expect(ADMIN_AREA_IDS).not.toContain("people");
    expect(ADMIN_AREA_IDS).not.toContain("analytics");
    for (const tool of ADMIN_TOOLS) {
      expect(tool.path ?? "", tool.id).not.toMatch(/^\/admin\/(people|analytics)/);
    }
  });

  it("puts every audience and account capability in Users", () => {
    const users = toolsForArea("users").map((t) => t.id);
    for (const id of [
      "product-analytics",
      "analytics-system-health",
      "users-visitors",
      "users-detail",
      "people-users",
      "people-user-identities",
      "people-invites",
      "people-comments",
      "people-feedback",
    ]) {
      expect(users, id).toContain(id);
    }
  });

  it("moved the notification consoles to Operations, which is where an operator queue belongs", () => {
    const ops = toolsForArea("operations").map((t) => t.id);
    expect(ops).toContain("people-admin-notifications");
    expect(ops).toContain("people-push");
  });

  it("is the only destination that reports product analytics", () => {
    const named = ADMIN_TOOLS.filter((t) => /analytics/i.test(t.title));
    for (const tool of named) expect(tool.area, tool.id).toBe("users");
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

  it("LEGACY1 deleted the Match & Rank graph builder outright", () => {
    expect(ADMIN_TOOLS.find((t) => t.id === "arena-data-graphs")).toBeUndefined();
    expect(existsSync(resolve(__dirname, "../admin-data-sources.ts"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../../pages/AdminData.tsx"))).toBe(false);
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
