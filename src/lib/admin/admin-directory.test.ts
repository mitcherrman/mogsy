import { describe, expect, it } from "vitest";
import {
  ADMIN_DIRECTORY_CATEGORIES,
  ADMIN_DIRECTORY_ITEMS,
  ADMIN_DIRECTORY_PATH,
  groupedAdminDirectoryItems,
  visibleAdminDirectoryItems,
} from "./admin-directory";

const allPaths = (item: (typeof ADMIN_DIRECTORY_ITEMS)[number]) => [
  item.path,
  ...(item.legacyAliases ?? []),
  ...(item.childActions?.map((a) => a.path) ?? []),
];

describe("admin-directory registry", () => {
  it("exports the canonical directory path", () => {
    expect(ADMIN_DIRECTORY_PATH).toBe("/admin/directory");
  });

  it("has unique ids", () => {
    const ids = ADMIN_DIRECTORY_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique canonical (non-legacy) paths", () => {
    const paths = ADMIN_DIRECTORY_ITEMS.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses valid leading-slash internal paths everywhere", () => {
    for (const item of ADMIN_DIRECTORY_ITEMS) {
      for (const path of allPaths(item)) {
        expect(path.startsWith("/"), `${item.id}: ${path}`).toBe(true);
        // Must parse as a same-origin relative URL.
        expect(() => new URL(path, "https://mogzy.lol")).not.toThrow();
      }
    }
  });

  it("attaches the legacy quiz aliases to the canonical workspace, not as items", () => {
    const workspace = ADMIN_DIRECTORY_ITEMS.find((i) => i.id === "quiz-content-workspace");
    expect(workspace?.legacyAliases).toEqual([
      "/admin/quiz-builder",
      "/admin/quiz-review",
      "/admin/workspace",
    ]);
    const canonicalPaths = ADMIN_DIRECTORY_ITEMS.map((i) => i.path);
    for (const alias of workspace?.legacyAliases ?? []) {
      expect(canonicalPaths).not.toContain(alias);
    }
  });

  it("keeps every legacy alias off other items too", () => {
    const canonical = new Set(ADMIN_DIRECTORY_ITEMS.map((i) => i.path));
    for (const item of ADMIN_DIRECTORY_ITEMS) {
      for (const alias of item.legacyAliases ?? []) {
        expect(canonical.has(alias), `${item.id} alias ${alias}`).toBe(false);
      }
    }
  });

  it("preserves the exact Quiz Content child-action query strings", () => {
    const workspace = ADMIN_DIRECTORY_ITEMS.find((i) => i.id === "quiz-content-workspace");
    expect(workspace?.childActions?.map((a) => a.path)).toEqual([
      "/admin/quiz-content?tab=builder",
      "/admin/quiz-content?tab=review",
      "/admin/quiz-content?tab=ranked-duel",
    ]);
  });

  it("excludes development entries from production-visible output", () => {
    const prod = visibleAdminDirectoryItems(false);
    expect(prod.every((i) => i.environment === "all")).toBe(true);
    expect(prod.some((i) => i.path.startsWith("/dev/"))).toBe(false);
    // Dev builds include them.
    const dev = visibleAdminDirectoryItems(true);
    expect(dev.some((i) => i.path === "/dev/ranked-duel")).toBe(true);
    expect(dev.length).toBeGreaterThan(prod.length);
  });

  it("contains no /secret-room and no nonexistent /dev/ranked-tutorial", () => {
    for (const item of ADMIN_DIRECTORY_ITEMS) {
      for (const path of allPaths(item)) {
        expect(path).not.toContain("/secret-room");
        expect(path).not.toContain("/dev/ranked-tutorial");
      }
    }
  });

  it("groups items in stable category order with no empty categories", () => {
    for (const includeDev of [false, true]) {
      const groups = groupedAdminDirectoryItems(includeDev);
      expect(groups.every((g) => g.items.length > 0)).toBe(true);
      const order = groups.map((g) => g.category);
      const expected = ADMIN_DIRECTORY_CATEGORIES.filter((c) => order.includes(c));
      expect(order).toEqual(expected);
    }
    // Production hides the whole Development & QA group.
    expect(groupedAdminDirectoryItems(false).map((g) => g.category)).not.toContain(
      "Development & QA",
    );
  });

  it("gives every mutates-production item an explicit textual warning", () => {
    for (const item of ADMIN_DIRECTORY_ITEMS) {
      if (item.dangerLevel !== "none") {
        expect(item.warning, item.id).toBeTruthy();
      }
    }
    const broadcast = ADMIN_DIRECTORY_ITEMS.find((i) => i.id === "quiz-broadcast-studio");
    expect(broadcast?.dangerLevel).toBe("mutates-production");
    expect(broadcast?.warning).toBe("Publishes changes to the live public broadcast state.");
  });

  it("marks the master_admin requirement on the knowledge base", () => {
    const knowledge = ADMIN_DIRECTORY_ITEMS.find((i) => i.path === "/admin/knowledge");
    expect(knowledge?.requiredRole).toBe("master_admin");
  });
});
