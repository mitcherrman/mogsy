/**
 * The two redesigned V3.5 crystal projections, and their isolation from V3.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/hooks/useReducedMotionPreference", () => ({ useReducedMotionPreference: () => true }));

import AcademyCoreInstrument from "@/pages/academy-core/AcademyCoreInstrument";
import { LuxMysteryProjection, MatchupProjection } from "./OrreryProjections";
import { LUX_GLASS_SCALE, LUX_WINDOW_RADIUS, MATCHUP_LINEUP, MYSTERY_CHAMPION, RIFT_CENTRE_ART, TEAM_ARC_R, TEAM_ICON_R, teamSlot } from "./orrery-projections-data";

const ROLES = ["/r/top.svg", "/r/jungle.svg", "/r/mid.svg", "/r/bot.svg", "/r/support.svg"];
const icons = (side: string) => [0, 1, 2, 3, 4].map((i) => `/icons/${side}-${i}.png`);
const MATCHUP = { blue: icons("blue"), red: icons("red"), rift: "/rift.webp" };

/** Lens radius and the Pro Play iris opening (hexagon inradius), local units. */
const LENS_R = 118;
const PRO_PLAY_IRIS = 88;

describe("V3 stays V3 unless a caller opts in", () => {
  it("without overrides the instrument draws the V3 Leaguecraft magnifier and the V3 Pro Play mark", () => {
    const { container } = render(<AcademyCoreInstrument focus="idle" compact media={{ art: { leaguecraft: "/ryze.jpg", "pro-play": "/ahri.jpg" }, observeRoles: ROLES }} />);
    expect(container.querySelector(".acore-mode-leaguecraft .acore-magnifier")).not.toBeNull();
    expect(container.querySelector(".acore-mode-pro-play .acore-track-mark")).not.toBeNull();
    expect(container.querySelectorAll("[data-projection='override']")).toHaveLength(0);
    expect(container.querySelector("[class*='o35-']")).toBeNull();
  });

  it("with overrides only Leaguecraft and Pro Play change; Combat and Archives are the V3 originals", () => {
    const base = render(<AcademyCoreInstrument focus="idle" compact media={{ observeRoles: ROLES }} />);
    const combat = base.container.querySelector(".acore-mode-combat")!.innerHTML;
    const archives = base.container.querySelector(".acore-mode-archives")!.innerHTML;
    base.unmount();
    const { container } = render(
      <AcademyCoreInstrument
        focus="idle"
        compact
        media={{ observeRoles: ROLES }}
        projectionOverrides={{ leaguecraft: <LuxMysteryProjection portrait="/lux.png" />, "pro-play": <MatchupProjection media={MATCHUP} /> }}
      />,
    );
    expect(container.querySelector(".acore-mode-leaguecraft")).toHaveAttribute("data-projection", "override");
    expect(container.querySelector(".acore-mode-pro-play")).toHaveAttribute("data-projection", "override");
    expect(container.querySelector(".acore-magnifier")).toBeNull();
    expect(container.querySelector(".acore-track-mark")).toBeNull();
    expect(container.querySelector(".acore-mode-combat")!.innerHTML).toBe(combat);
    expect(container.querySelector(".acore-mode-archives")!.innerHTML).toBe(archives);
    // the overrides are inside the lens's clipped, scaled group (with the iris drawn after them)
    const lc = container.querySelector(".acore-mode-leaguecraft")!;
    expect(lc.closest("[clip-path='url(#acore-lens-clip)']")).not.toBeNull();
  });
});

describe("Leaguecraft: Arcane Mystery — Lux behind shifting Hextech glass", () => {
  const LUX = "/assets/champions/Lux/icon.png";
  const LEAGUECRAFT_IRIS = 104;

  it("one large subject: Lux's icon in a hexagonal window, with three glass panes in front of it", () => {
    const { container } = render(<svg><LuxMysteryProjection portrait={LUX} /></svg>);
    const portrait = container.querySelector("[data-testid='academy-core-v35-lux-portrait']")!;
    expect(portrait.getAttribute("href")).toBe(LUX);
    expect(Number(portrait.getAttribute("width"))).toBeCloseTo(2 * LUX_WINDOW_RADIUS, 6);
    expect(portrait.closest("[clip-path='url(#o35-lux-window)']")).not.toBeNull();
    const panes = ["blue", "violet", "gold"].map((id) => container.querySelector(`[data-testid='academy-core-v35-pane-${id}']`));
    expect(panes.every(Boolean)).toBe(true);
    // the panes are drawn after (in front of) the portrait
    const order = [...container.querySelectorAll("[data-testid='academy-core-v35-lux-portrait'], [data-testid^='academy-core-v35-pane-']")];
    expect(order[0]).toBe(portrait);
    // through the glass the portrait is refracted: a magnified, displaced copy masked to the panes
    const refract = container.querySelector(".o35-lux-refract")!;
    expect(refract.getAttribute("href")).toBe(LUX);
    expect(refract.closest("[mask='url(#o35-lux-glass-mask)']")).not.toBeNull();
    expect(container.querySelectorAll("#o35-lux-glass-mask polygon")).toHaveLength(3);
    // the mask's silhouettes carry the same motion classes as the visible panes, so they move together
    for (const id of ["blue", "violet", "gold"]) {
      expect(container.querySelectorAll(`.o35-pane-drift-${id}`)).toHaveLength(2);
      expect(container.querySelectorAll(`.o35-pane-engage-${id}`)).toHaveLength(2);
    }
    // the light sweep: across the portrait and along the glass
    expect(container.querySelectorAll(".o35-lux-beam")).toHaveLength(2);
  });

  it("nothing of the previous design remains: no reticle, role icons, scroll or quill, and no text", () => {
    const { container } = render(<svg><LuxMysteryProjection portrait={LUX} /></svg>);
    for (const sel of [".acore-reticle", ".acore-role", "[data-testid='academy-core-v35-study-emblem']", ".o35-study-emblem", "text"]) {
      expect(container.querySelector(sel), sel).toBeNull();
    }
    // the only raster images are the portrait and its refraction
    expect([...container.querySelectorAll("image")].map((i) => i.getAttribute("href"))).toEqual([LUX, LUX]);
  });

  it("before the art is due it draws the window and the glass, and never a guessed image", () => {
    const { container } = render(<svg><LuxMysteryProjection portrait={null} /></svg>);
    expect(container.querySelectorAll("image")).toHaveLength(0);
    expect(container.querySelector(".o35-lux-frame")).not.toBeNull();
    expect(container.querySelector("[data-testid='academy-core-v35-pane-blue']")).not.toBeNull();
  });

  it("geometry: the window sits inside Leaguecraft's open iris and the lens, aligned with the iris", () => {
    // pointy-top hexagon of corner radius R: its corners project to R * cos(30deg) on the iris's blade normals (0, 60, ... deg)
    const R = LUX_WINDOW_RADIUS;
    for (const corner of [-90, -30, 30, 90, 150, 210]) {
      for (let k = 0; k < 6; k++) {
        const proj = R * Math.cos(((corner - k * 60) * Math.PI) / 180);
        expect(proj, `corner ${corner} vs blade ${k}`).toBeLessThan(LEAGUECRAFT_IRIS);
      }
    }
    expect(R).toBeLessThan(LENS_R);
    expect(LUX_GLASS_SCALE).toBeCloseTo((2 * R) / 157, 9);
    expect(MYSTERY_CHAMPION).toBe("Lux");
  });
});

describe("Pro Play: five champions versus five around Summoner's Rift", () => {
  it("draws exactly five icons per side and the Rift in the centre", () => {
    const { container } = render(<svg><MatchupProjection media={MATCHUP} /></svg>);
    const top = [...container.querySelectorAll("[data-testid='academy-core-v35-team-top'] .o35-team-icon")];
    const bottom = [...container.querySelectorAll("[data-testid='academy-core-v35-team-bottom'] .o35-team-icon")];
    expect(top.map((i) => i.getAttribute("href"))).toEqual(MATCHUP.blue);
    expect(bottom.map((i) => i.getAttribute("href"))).toEqual(MATCHUP.red);
    expect(container.querySelectorAll(".o35-team-icon")).toHaveLength(10);
    expect(container.querySelector("[data-testid='academy-core-v35-rift'] image")).toHaveAttribute("href", "/rift.webp");
    // no Archives content (patch label / strata) and no text at all
    expect(container.querySelector(".acore-strata-label, .acore-stratum")).toBeNull();
    expect(container.querySelector("text")).toBeNull();
  });

  it("before the art is due it draws the empty plates (no guessed images)", () => {
    const { container } = render(<svg><MatchupProjection media={null} /></svg>);
    expect(container.querySelectorAll(".o35-team-icon")).toHaveLength(0);
    expect(container.querySelectorAll(".o35-team-slot")).toHaveLength(0);
    const partial = render(<svg><MatchupProjection media={{ ...MATCHUP, blue: [null, ...icons("b").slice(1)] }} /></svg>);
    expect(partial.container.querySelectorAll(".o35-team-slot")).toHaveLength(10);
    expect(partial.container.querySelectorAll(".o35-team-icon")).toHaveLength(9);
  });

  it("geometry: mirrored arcs, no collisions, inside the lens and inside the open Pro Play iris", () => {
    const top = [0, 1, 2, 3, 4].map((i) => teamSlot("top", i));
    const bottom = [0, 1, 2, 3, 4].map((i) => teamSlot("bottom", i));
    // left to right, mirrored top / bottom
    for (let i = 0; i < 5; i++) {
      expect(top[i].x).toBeCloseTo(bottom[i].x, 9);
      expect(top[i].y).toBeCloseTo(-bottom[i].y, 9);
      expect(top[i].y).toBeLessThan(0);
      if (i) expect(top[i].x).toBeGreaterThan(top[i - 1].x);
    }
    const all = [...top, ...bottom];
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      const d = Math.hypot(p.x, p.y);
      expect(d + TEAM_ICON_R).toBeLessThan(LENS_R);
      // the centre disc is r 46 with its ring at 47 (+ dash at 54, which icons may overlap as decoration)
      expect(d - TEAM_ICON_R).toBeGreaterThan(47 + 10);
      // the iris aperture is a hexagon of inradius 88 with blade normals every 60 degrees from 0
      for (let k = 0; k < 6; k++) {
        const a = (k * 60 * Math.PI) / 180;
        expect(p.x * Math.cos(a) + p.y * Math.sin(a) + TEAM_ICON_R, `icon ${i} vs blade ${k}`).toBeLessThan(PRO_PLAY_IRIS);
      }
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.hypot(p.x - all[j].x, p.y - all[j].y), `icons ${i}/${j}`).toBeGreaterThan(2 * TEAM_ICON_R + 4);
      }
    }
    expect(TEAM_ARC_R).toBe(74);
  });

  it("the lineup is a real, distinct ten-champion lineup and the Rift art is the shipped derivative", () => {
    const names = [...MATCHUP_LINEUP.blue, ...MATCHUP_LINEUP.red];
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    expect(RIFT_CENTRE_ART).toMatch(/rift-lane-turret.*\.webp/);
  });
});
