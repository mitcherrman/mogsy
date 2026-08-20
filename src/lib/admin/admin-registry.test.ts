// ---------------------------------------------------------------------------
// Registry invariants and the capability-preservation proof.
//
// The load-bearing test here is "supersedes the pre-migration directory": it
// asserts that every destination the old hand-maintained registry advertised
// is still present in the new one. That is the mechanical form of the absolute
// product rule — no admin capability may disappear.
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
import { ADMIN_DIRECTORY_ITEMS } from "./admin-directory";

describe("admin registry — structure", () => {
  it("declares the chosen ten-area architecture in order", () => {
    expect(ADMIN_AREAS.map((a) => a.label)).toEqual([
      "Overview",
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
    for (const item of ADMIN_DIRECTORY_ITEMS) {
      const paths = [item.path, ...(item.legacyAliases ?? []), ...(item.childActions ?? []).map((c) => c.path)];
      for (const path of paths) {
        expect(registryPaths.has(path.split("?")[0]), `${item.id} lost ${path}`).toBe(true);
      }
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
    expect(searchAdminTools("17-tab").map((t) => t.id)).toContain("legacy-admin-dashboard");
    expect(searchAdminTools("").length).toBe(ADMIN_TOOLS.length);
    expect(searchAdminTools("zzzz-no-such-tool").length).toBe(0);
  });
});
