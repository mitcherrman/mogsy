import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import {
  MOGZY_CLASS_ASSETS,
  MOGZY_COMPANION_ASSETS,
  MOGZY_FAMILY_ASSETS,
  MOGZY_MASCOT_ASSETS,
  MOGZY_MASCOT_ASSETS_COMPACT,
  MOGZY_MASCOT_ASSETS_MEDIUM,
  MOGZY_ROLE_ASSETS,
  getMogzyArtAssetPath,
  isMogzyClassCharacter,
  isMogzyCompanion,
  isMogzyFamilyCharacter,
  isMogzyMascotPose,
} from "./mascot-assets";
import {
  MogzyClass,
  MogzyCompanion,
  MogzyFamily,
  MogzyMascot,
} from "./MogzyMascot";

afterEach(cleanup);

const ALL_PATHS = [
  ...Object.values(MOGZY_MASCOT_ASSETS),
  ...Object.values(MOGZY_FAMILY_ASSETS),
  ...Object.values(MOGZY_CLASS_ASSETS),
  ...Object.values(MOGZY_COMPANION_ASSETS),
  ...Object.values(MOGZY_ROLE_ASSETS),
];

describe("mascot-assets registry", () => {
  it("resolves every registered path to a real file with exact casing", () => {
    for (const assetPath of ALL_PATHS) {
      // A registered path is a URL, not a filename: the background-removed art
      // has spaces in its name and is registered percent-encoded, which is what
      // the browser must be handed. Decode before touching the filesystem — and
      // decode ONLY here, so the exact-casing check below still compares the
      // real bytes of the real directory entry. That check is the one that
      // catches an asset macOS resolves case-insensitively and Linux 404s.
      const fullPath = path.join(
        process.cwd(), "public", decodeURIComponent(assetPath));
      expect(fs.existsSync(fullPath), assetPath).toBe(true);
      const dirEntries = fs.readdirSync(path.dirname(fullPath));
      expect(dirEntries, assetPath).toContain(path.basename(fullPath));
    }
  });

  // Role art is dedicated art: no role mascot may share a file with a Ranked
  // class character, so the five role paths join the shared existence and
  // cross-category uniqueness checks above rather than getting a weaker one.
  it("keeps Ranked role mascots disjoint from the Ranked class characters", () => {
    const roleArt = new Set(Object.values(MOGZY_ROLE_ASSETS));
    expect(roleArt.size).toBe(5);
    for (const classArt of Object.values(MOGZY_CLASS_ASSETS)) {
      expect(roleArt.has(classArt), classArt).toBe(false);
    }
  });

  it("keeps every registered path unique across categories", () => {
    expect(new Set(ALL_PATHS).size).toBe(ALL_PATHS.length);
  });

  it("keeps character categories semantically separate", () => {
    expect(isMogzyMascotPose("cheering")).toBe(true);
    expect(isMogzyMascotPose("king")).toBe(false);
    expect(isMogzyFamilyCharacter("king")).toBe(true);
    expect(isMogzyFamilyCharacter("tank")).toBe(false);
    expect(isMogzyClassCharacter("tank")).toBe(true);
    expect(isMogzyClassCharacter("familiar")).toBe(false);
    expect(isMogzyCompanion("familiar")).toBe(true);
    expect(isMogzyCompanion("base")).toBe(false);
  });

  it("PERF1: every compact and medium derivative is a real file, distinct from its source", () => {
    const derivatives = [
      ...Object.entries(MOGZY_MASCOT_ASSETS_COMPACT),
      ...Object.entries(MOGZY_MASCOT_ASSETS_MEDIUM),
    ];
    for (const [pose, p] of derivatives) {
      const fullPath = path.join(process.cwd(), "public", p!);
      expect(fs.existsSync(fullPath), p).toBe(true);
      expect(fs.readdirSync(path.dirname(fullPath)), p).toContain(path.basename(fullPath));
      expect(p).not.toBe(MOGZY_MASCOT_ASSETS[pose as keyof typeof MOGZY_MASCOT_ASSETS]);
      expect(p).toMatch(/\.webp$/);
    }
  });

  it("PERF1: resolves a requested scale, and falls back to the source without one", () => {
    const base = { category: "mascot", name: "base" } as const;
    expect(getMogzyArtAssetPath(base, "medium")).toBe("/mascot/mogzy-mascot-base-v1-512.webp");
    expect(getMogzyArtAssetPath(base, "compact")).toBe("/mascot/mogzy-mascot-base-v1-240.webp");
    expect(getMogzyArtAssetPath({ category: "mascot", name: "holdingBook" }, "compact")).toBe(
      "/mascot/mogzy-holding-book-transparent-192.webp",
    );
    // No medium derivative for this pose: the source.
    expect(getMogzyArtAssetPath({ category: "mascot", name: "explaining" }, "medium")).toBe(
      MOGZY_MASCOT_ASSETS.explaining,
    );
  });

  it("resolves paths through the generic API", () => {
    expect(getMogzyArtAssetPath({ category: "mascot", name: "base" })).toBe(
      "/mascot/mogzy-mascot-base-v1.png",
    );
    expect(getMogzyArtAssetPath({ category: "class", name: "marksman" })).toBe(
      "/mascot/family/mogzy-archer.png",
    );
  });
});

describe("Mogzy art components", () => {
  it("renders the default Mogzy pose with default alt", () => {
    render(<MogzyMascot />);
    const img = screen.getByRole("img", { name: "Mogzy" });
    expect(img).toHaveAttribute("src", "/mascot/mogzy-mascot-base-v1.png");
    expect(img).toHaveAttribute("data-mogzy-art-category", "mascot");
  });

  it("renders family, class, and companion characters in their own categories", () => {
    render(
      <>
        <MogzyFamily character="king" />
        <MogzyClass character="mage" />
        <MogzyCompanion companion="familiar" />
      </>,
    );
    expect(screen.getByRole("img", { name: "The King" })).toHaveAttribute(
      "data-mogzy-art-category",
      "family",
    );
    expect(
      screen.getByRole("img", { name: "Mage class character" }),
    ).toHaveAttribute("src", "/mascot/family/mogzy-mage.png");
    expect(
      screen.getByRole("img", { name: "Magical familiar" }),
    ).toHaveAttribute("data-mogzy-art-category", "companion");
  });

  it("hides decorative images from assistive technology", () => {
    const { container } = render(<MogzyMascot pose="peeking" decorative />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("alt", "");
  });
});
