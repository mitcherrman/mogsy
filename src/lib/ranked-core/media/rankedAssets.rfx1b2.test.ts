/**
 * RFX1 Phase 2B2 — THE ASSET CONTRACT.
 *
 * Three claims, and each is the one that actually breaks in practice:
 *
 *  1. every derivative the client asks for EXISTS on disk;
 *  2. the URL that is PRELOADED is the URL that is RENDERED — a mismatch is
 *     invisible in the UI and doubles the bytes, which is the exact defect
 *     this phase exists to remove;
 *  3. the heavyweight originals a Ranked surface used to request are no
 *     longer requested by it. The FILES stay (the lobby stage, the hub guide
 *     and the welcome scenes draw them large); only Ranked's references move.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MOGZY_MASCOT_ASSETS, MOGZY_MASCOT_ASSETS_COMPACT, MOGZY_ROLE_ASSETS,
  MOGZY_ROLE_ASSETS_COMPACT, getMogzyArtAssetPath, getRankedRoleMascotPath,
} from "@/components/mascot/mascot-assets";
import { RANKED_ROLES } from "@/lib/ranked-public/roles";
import { JUNGLE_GRASS_BACKGROUND } from "@/lib/question-surface/jungleAtmosphere";
import { MOTIF_ART_URLS } from "./roundMedia";
import {
  RANKED_BACKDROP_NARROW_MAX_PX, RANKED_BACKDROP_NARROW_URL, RANKED_CHROME_URLS,
  rankedBackdropUrl, rankedRoleMascotUrl,
} from "./rankedChrome";

const CSS = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");
const publicFile = (u: string) => resolve(process.cwd(), "public", u.replace(/^\//, ""));
const bytes = (u: string) => statSync(publicFile(u)).size;

/** Every public URL this phase points a Ranked surface at. */
const DERIVATIVES = [
  ...RANKED_CHROME_URLS,
  RANKED_BACKDROP_NARROW_URL,
  ...Object.values(MOGZY_ROLE_ASSETS_COMPACT),
  ...Object.values(MOGZY_MASCOT_ASSETS_COMPACT),
  ...Object.values(MOTIF_ART_URLS).flat(),
  JUNGLE_GRASS_BACKGROUND,
  "/mascot/mogzy-hat-transparent-128.webp",
];

describe("RFX1 2B2 — the optimized Ranked assets exist and are small", () => {
  it("ships every derivative the client references", () => {
    for (const u of DERIVATIVES) expect(existsSync(publicFile(u)), u).toBe(true);
  });

  it("keeps every source original, because a bigger surface still draws it", () => {
    // Deleting art Ranked stopped using would break the lobby carousel, the
    // hub guide and the welcome scenes, which draw these at full size.
    for (const u of [...Object.values(MOGZY_ROLE_ASSETS), MOGZY_MASCOT_ASSETS.base,
      MOGZY_MASCOT_ASSETS.explaining, MOGZY_MASCOT_ASSETS.peeking,
      MOGZY_MASCOT_ASSETS.raisingHand]) {
      expect(existsSync(publicFile(u)), u).toBe(true);
    }
  });

  it("puts every arena role plate under 40 KB (they were 0.86-1.02 MB)", () => {
    for (const role of RANKED_ROLES) {
      const compact = getRankedRoleMascotPath(role, "compact");
      expect(bytes(compact), compact).toBeLessThan(40 * 1024);
      // ...and it really is a different file from the one the lobby draws.
      expect(compact).not.toBe(getRankedRoleMascotPath(role));
    }
  });

  it("puts the whole arena chrome under 250 KB on desktop and 200 KB on a phone", () => {
    const desktop = RANKED_CHROME_URLS.reduce((n, u) => n + bytes(u), 0);
    expect(desktop).toBeLessThan(250 * 1024);
    const phone = [RANKED_BACKDROP_NARROW_URL, ...RANKED_CHROME_URLS.slice(1)]
      .reduce((n, u) => n + bytes(u), 0);
    expect(phone).toBeLessThan(200 * 1024);
  });
});

describe("RFX1 2B2 — the preloaded URL is the rendered URL", () => {
  it("warms exactly the mascot encode the arena's <img> asks for", () => {
    for (const role of RANKED_ROLES) {
      // `RoleCrest` / `MobileMatchBar` / `RankedEntryIntro` all pass
      // `art="compact"`, so this is the same string the DOM will carry.
      expect(rankedRoleMascotUrl(role)).toBe(getRankedRoleMascotPath(role, "compact"));
    }
  });

  it("warms the backdrop encode this viewport's media query will paint", () => {
    expect(rankedBackdropUrl(390)).toBe(RANKED_BACKDROP_NARROW_URL);
    expect(rankedBackdropUrl(RANKED_BACKDROP_NARROW_MAX_PX)).toBe(RANKED_BACKDROP_NARROW_URL);
    expect(rankedBackdropUrl(RANKED_BACKDROP_NARROW_MAX_PX + 1)).toBe(RANKED_CHROME_URLS[0]);
    expect(rankedBackdropUrl(1440)).toBe(RANKED_CHROME_URLS[0]);
  });

  it("pins both backdrop encodes to the stylesheet that selects them", () => {
    expect(CSS).toContain(`--ranked-backdrop-image: url("${RANKED_CHROME_URLS[0]}")`);
    expect(CSS).toContain(`@media (max-width: ${RANKED_BACKDROP_NARROW_MAX_PX}px)`);
    expect(CSS).toContain(`--ranked-backdrop-image: url("${RANKED_BACKDROP_NARROW_URL}")`);
  });

  it("resolves a compact pose to its derivative and falls back for the rest", () => {
    expect(getMogzyArtAssetPath({ category: "mascot", name: "base" }, "compact"))
      .toBe(MOGZY_MASCOT_ASSETS_COMPACT.base);
    // A pose with no derivative is not a broken image: it is the source.
    expect(getMogzyArtAssetPath({ category: "mascot", name: "cheering" }, "compact"))
      .toBe(MOGZY_MASCOT_ASSETS.cheering);
    // And `full` is untouched everywhere.
    expect(getMogzyArtAssetPath({ category: "mascot", name: "base" }))
      .toBe(MOGZY_MASCOT_ASSETS.base);
  });
});

describe("RFX1 2B2 — the replaced heavyweights are no longer requested", () => {
  const source = (rel: string) => readFileSync(resolve(__dirname, "../../..", rel), "utf8");

  it("draws no Ranked chrome PNG from the stylesheet any more", () => {
    // The `url(...)` calls only — the prose above each rule still names the
    // source artwork, and should.
    const urls = [...CSS.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    for (const dead of ["/assets/ranked/ranked-academy-duel-bg.png",
      "/assets/ranked/ranked-vellum-texture.png", "/assets/ranked/navy-banner2.png",
      "/assets/ranked/question-accents/champ-combat.png"]) {
      expect(urls, dead).not.toContain(dead);
    }
  });

  it("points the HUD and the Rules scroll at their own small encodes", () => {
    expect(source("components/hud/GlobalHud.tsx"))
      .toContain("/mascot/mogzy-hat-transparent-128.webp");
    expect(source("components/hud/GlobalHud.tsx"))
      .not.toContain('src="/mascot/mogzy-hat-transparent.png"');
    expect(source("components/hud/MogzyIdentityMenu.tsx"))
      .toContain("/mascot/mogzy-mascot-base-v1-240.webp");
    expect(source("components/ranked-rules/MogzyExplainsPanel.tsx"))
      .toContain('scale="compact"');
  });

  it("asks for no 1254px role plate from any arena surface", () => {
    for (const rel of ["components/ranked-arena/roleIdentity.tsx",
      "components/ranked-arena/MobileMatchBar.tsx",
      "components/ranked-arena/RankedEntryIntro.tsx",
      "pages/quiz-ranked/RankedResultDuel.tsx"]) {
      expect(source(rel), rel).toContain('art="compact"');
    }
  });
});
