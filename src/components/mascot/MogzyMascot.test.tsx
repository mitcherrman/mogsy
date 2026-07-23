import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import {
  MOGZY_CLASS_ASSETS,
  MOGZY_COMPANION_ASSETS,
  MOGZY_FAMILY_ASSETS,
  MOGZY_MASCOT_ASSETS,
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
];

describe("mascot-assets registry", () => {
  it("resolves every registered path to a real file with exact casing", () => {
    for (const assetPath of ALL_PATHS) {
      const fullPath = path.join(process.cwd(), "public", assetPath);
      expect(fs.existsSync(fullPath), assetPath).toBe(true);
      const dirEntries = fs.readdirSync(path.dirname(fullPath));
      expect(dirEntries, assetPath).toContain(path.basename(fullPath));
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
