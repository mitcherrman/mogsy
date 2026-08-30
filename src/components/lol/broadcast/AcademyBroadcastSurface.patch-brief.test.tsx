/**
 * Icon-only Patch Brief rendering on the Academy Broadcast book surface.
 *
 * The product rule proven here, end to end (raw report data soaked in entity
 * names → projection → rendered DOM, desktop AND mobile): every entity shows
 * its icon and NEVER its name in visible text, `title` attributes, or
 * tooltips — names survive only inside aria-labels and sr-only spans.
 * Visible assertions use a visibility-aware text walker, never textContent,
 * so an sr-only leak would fail the suite.
 *
 * Also pinned: the ONLY visible text is the patch label, the section
 * headings, and Read full report (the "PATCH BRIEF" eyebrow is gone — the
 * spread is a mirrored Buffs-left / Nerfs-right composition whose only
 * intentional asymmetry is the patch title above the left page); no
 * summaries, numbers, arrows, or captions survive; empty sections are
 * absent; the CTA targets the patch; and composing the brief centerpiece
 * still creates no audio element and no toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchReportCard, PatchReportDetail } from "@/lib/patch-reports/api";
import { projectPatchBrief } from "@/lib/patch-reports/patch-brief";
import AcademyBroadcastCenterpiece from "./AcademyBroadcastCenterpiece";
import AcademyBroadcastSurface from "./AcademyBroadcastSurface";
import { briefTransmission } from "./usePatchBriefFeed";
import { INITIAL_BROADCAST_FEED, type BroadcastFeed } from "./broadcast-content";
import { resetRadioForTests } from "@/lib/audio/academy-radio";

/* -------------------------------------------------------------------------- */
/* Fixture: raw report data deliberately soaked in entity names               */
/* -------------------------------------------------------------------------- */

const CHAMPIONS = ["Ryze", "Ahri", "Corki", "Kai'Sa", "Nunu & Willump"] as const;
const ITEMS = ["Immortal Path", "Long Sword"] as const;

const baseChange = {
  ability_icon_url: null,
  is_new: false,
  detail_text: null,
  mogzy_property: null,
  mogzy_current_raw: null,
  mogzy_status: "matches" as const,
  proposal_id: null,
  proposal_status: null,
};

const numeric = (property: string, before: string, after: string) => ({
  ...baseChange,
  group_title: "Base Stats",
  ability_slot: null,
  property_name: property,
  change_kind: "numeric" as const,
  before_raw: before,
  after_raw: after,
});

let cardId = 1;
const card = (
  name: string,
  changes: PatchReportCard["changes"],
  overrides: Partial<PatchReportCard> = {},
): PatchReportCard => ({
  id: cardId++,
  entity_type: "champion",
  entity_name: name,
  entity_slug: null,
  section_id: "champions",
  section_title: "Champions",
  official_image_url: null,
  mogzy_image_path: null,
  mogzy_entity_ref: name,
  context_text: `${name} has been dominating pro play.`,
  aggregate_status: "matches",
  changes,
  ...overrides,
});

const DETAIL: PatchReportDetail = {
  patch_version: "26.14",
  source_url: "https://example.com/notes",
  built_at: "2026-07-30T00:00:00Z",
  section_titles: ["Champions", "Items"],
  skipped_sections: [],
  cards: [
    // Buff, linked.
    card("Ryze", [numeric("Base attack damage", "58", "61")]),
    // Nerf, linked.
    card("Ahri", [numeric("Q Cooldown", "8", "10")], {
      changes: [
        {
          ...numeric("Cooldown", "8", "10"),
          group_title: "Q - Orb of Deception",
          ability_slot: "Q",
        },
      ],
    }),
    // Mixed directions → Adjustments.
    card("Corki", [
      numeric("Base health", "645", "620"),
      numeric("Base armor", "28", "31"),
    ]),
    // Fixes only → omitted entirely.
    card("Kai'Sa", [
      {
        ...baseChange,
        group_title: "Bugfixes",
        ability_slot: null,
        property_name: "Bugfixes",
        change_kind: "mechanical",
        before_raw: null,
        after_raw: null,
        detail_text: "Fixed a bug where Kai'Sa's passive dealt no damage.",
      },
    ]),
    // Buff, NOT in Mogzy's catalog → icon renders without a link.
    card("Nunu & Willump", [numeric("W Move Speed", "30", "35")], {
      mogzy_entity_ref: null,
    }),
    // Item nerf.
    card("Immortal Path", [numeric("Damage Increase While Above Threshold", "12", "10")], {
      entity_type: "item",
      section_id: "items",
      section_title: "Items",
      official_image_url: "https://cdn.example/immortal-path.png",
      context_text: "Immortal Path forgives too many mistakes.",
    }),
    // Item buff.
    card("Long Sword", [numeric("Attack damage", "9", "10")], {
      entity_type: "item",
      section_id: "items",
      section_title: "Items",
      official_image_url: "https://cdn.example/long-sword.png",
    }),
  ],
};

const MANIFEST: ChampionManifest = {
  champions: Object.fromEntries(
    CHAMPIONS.map((n) => [
      n,
      {
        icon: `assets/champions/${n}/icon.png`,
        splash: `assets/champions/${n}/splash.jpg`,
        loading: `assets/champions/${n}/loading.jpg`,
        cutout: `assets/champions/${n}/cutout.png`,
      },
    ]),
  ),
};

function feedFor(detail: PatchReportDetail): BroadcastFeed {
  const brief = projectPatchBrief(detail, MANIFEST);
  if (!brief) throw new Error("fixture must project a brief");
  return { status: "ready", transmissions: [briefTransmission(brief)], index: 0 };
}

/**
 * Text a sighted user can actually read: every text node EXCEPT those inside
 * `.sr-only` (visually hidden) subtrees. aria-labels are attributes, so they
 * are excluded by construction.
 */
function visibleText(root: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += ` ${node.textContent ?? ""}`;
      return;
    }
    if (node instanceof Element && node.classList.contains("sr-only")) return;
    node.childNodes.forEach(walk);
  };
  walk(root);
  return out.replace(/\s+/g, " ").trim();
}

const renderSurface = (variant: "desktop" | "mobile", feed: BroadcastFeed = feedFor(DETAIL)) =>
  render(
    <MemoryRouter>
      <AcademyBroadcastSurface feed={feed} variant={variant} />
    </MemoryRouter>,
  );

afterEach(() => cleanup());

/* -------------------------------------------------------------------------- */

describe.each(["desktop", "mobile"] as const)(
  "Icon-only Patch Brief — %s variant",
  (variant) => {
    const suffix = variant === "desktop" ? "" : "-mobile";
    const surface = () => screen.getByTestId(`academy-broadcast-surface${suffix}`);

    it("renders ONLY the approved text: PATCH BRIEF, patch label, headings, CTA", () => {
      renderSurface(variant);
      let text = visibleText(surface());
      for (const allowed of ["Patch Brief", "Patch 26.14", "Buffs", "Nerfs", "Adjustments", "Read full report"]) {
        expect(text).toContain(allowed);
        // split/join, not replaceAll: the app's TS lib target is ES2020.
        text = text.split(allowed).join("");
      }
      // Nothing else is visible: no summaries, numbers, arrows, or captions.
      expect(text.replace(/\s+/g, "")).toBe("");
    });

    it("groups every qualifying entity once: buffs, nerfs, adjustments grids", () => {
      renderSurface(variant);
      const s = surface();
      const grid = (d: string) =>
        s.querySelector(`[data-testid="patch-brief-section-${d}"]`)!;
      // Buffs: Ryze, Nunu & Willump, Long Sword. Nerfs: Ahri, Immortal Path.
      // Adjustments: Corki. Kai'Sa (fixes only) is nowhere.
      expect(grid("buff").querySelectorAll("li")).toHaveLength(3);
      expect(grid("nerf").querySelectorAll("li")).toHaveLength(2);
      expect(grid("adjustment").querySelectorAll("li")).toHaveLength(1);
      expect(s.querySelectorAll('[data-testid="patch-brief-champion-icon"]')).toHaveLength(4);
      expect(s.querySelectorAll('[data-testid="patch-brief-item-icon"]')).toHaveLength(2);
    });

    it("every icon is name-silent: empty alt, no title, no tooltip, no visible name", () => {
      renderSurface(variant);
      const s = surface();
      for (const img of s.querySelectorAll("img")) {
        expect(img.getAttribute("alt")).toBe("");
      }
      expect(s.querySelectorAll("[title]")).toHaveLength(0);
      expect(s.querySelectorAll('[role="tooltip"]')).toHaveLength(0);
      const text = visibleText(s).toLowerCase();
      for (const name of [...CHAMPIONS, ...ITEMS]) {
        expect(text).not.toContain(name.toLowerCase());
      }
    });

    it("catalogued champions link to League Docs with the name only in the aria-label", () => {
      renderSurface(variant);
      const link = screen.getByRole("link", { name: "Open Ryze in League Docs" });
      expect(link).toHaveAttribute("href", "/lol/docs/champions/ryze");
      expect(link.querySelector("img")!.getAttribute("alt")).toBe("");
      link.focus();
      expect(document.activeElement).toBe(link);
    });

    it("uncatalogued champions and items render unlinked icons with sr-only identity", () => {
      renderSurface(variant);
      const s = surface();
      expect(screen.queryByRole("link", { name: /Nunu/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /Long Sword/ })).toBeNull();
      const srOnly = [...s.querySelectorAll(".sr-only")].map((el) => el.textContent);
      expect(srOnly).toContain("Nunu & Willump");
      expect(srOnly).toContain("Long Sword");
      expect(srOnly).toContain("Immortal Path");
    });

    it("Read full report targets the selected patch", () => {
      renderSurface(variant);
      expect(screen.getByRole("link", { name: "Read full report" })).toHaveAttribute(
        "href",
        "/lol/patch-reports?patch=26.14",
      );
    });

    it("splits sections across the spread by weight, with the CTA closing the right page", () => {
      renderSurface(variant);
      const s = surface();
      const [leftPage, rightPage] = s.querySelectorAll(":scope > div:last-child > div");
      // Weight-balanced (splitBriefSections): Buffs leads the headline page and
      // the remaining sections fill the right page instead of stranding it with
      // Adjustments alone. Both pages always carry at least one section.
      expect(leftPage.querySelector('[data-testid="patch-brief-section-buff"]')).toBeTruthy();
      expect(leftPage.querySelectorAll('[data-testid^="patch-brief-section-"]').length)
        .toBeGreaterThanOrEqual(1);
      expect(rightPage.querySelectorAll('[data-testid^="patch-brief-section-"]').length)
        .toBeGreaterThanOrEqual(1);
      expect(
        rightPage.querySelector('[data-testid="patch-brief-section-adjustment"]'),
      ).toBeTruthy();
      const cta = screen.getByRole("link", { name: "Read full report" });
      expect(rightPage.contains(cta)).toBe(true);
      expect(
        rightPage
          .querySelector('[data-testid="patch-brief-section-adjustment"]')!
          .compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

  },
);

/* -------------------------------------------------------------------------- */

describe("Icon-only Patch Brief — empty sections and fallback", () => {
  it("an empty Adjustments section is absent (no heading, no grid)", () => {
    const noAdjust: PatchReportDetail = {
      ...DETAIL,
      cards: DETAIL.cards.filter((c) => c.entity_name !== "Corki"),
    };
    renderSurface("desktop", feedFor(noAdjust));
    const s = screen.getByTestId("academy-broadcast-surface");
    expect(s.querySelector('[data-testid="patch-brief-section-adjustment"]')).toBeNull();
    expect(visibleText(s)).not.toContain("Adjustments");
  });

  it("an empty Buffs section is absent and the next section leads the left page", () => {
    const nerfsOnly: PatchReportDetail = {
      ...DETAIL,
      cards: DETAIL.cards.filter((c) => ["Ahri", "Immortal Path"].includes(c.entity_name)),
    };
    renderSurface("desktop", feedFor(nerfsOnly));
    const s = screen.getByTestId("academy-broadcast-surface");
    expect(s.querySelector('[data-testid="patch-brief-section-buff"]')).toBeNull();
    expect(visibleText(s)).not.toContain("Buffs");
    expect(s.querySelector('[data-testid="patch-brief-section-nerf"]')).toBeTruthy();
  });

  it("no qualifying entities at all → the projection is null (neutral fallback path)", () => {
    const fixesOnly: PatchReportDetail = {
      ...DETAIL,
      cards: DETAIL.cards.filter((c) => c.entity_name === "Kai'Sa"),
    };
    expect(projectPatchBrief(fixesOnly, MANIFEST)).toBeNull();
  });

  it("the neutral placeholder feed renders no brief markup and no links", () => {
    renderSurface("desktop", INITIAL_BROADCAST_FEED);
    const s = screen.getByTestId("academy-broadcast-surface");
    expect(s.querySelectorAll("[data-testid^='patch-brief-']")).toHaveLength(0);
    expect(s.querySelector("a")).toBeNull();
    expect(s).toHaveTextContent("Transmission systems online");
  });
});

/* -------------------------------------------------------------------------- */
/* Centerpiece regression — composing the brief changes nothing about audio   */
/* -------------------------------------------------------------------------- */

describe("Icon-only Patch Brief centerpiece — audio and dock regressions", () => {
  const nativeLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const nativeCreateElement = document.createElement.bind(document);
  let audioCreations = 0;

  beforeEach(() => {
    const entries = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        get length() {
          return entries.size;
        },
        clear: () => entries.clear(),
        getItem: (key: string) => (entries.has(key) ? entries.get(key)! : null),
        key: (index: number) => Array.from(entries.keys())[index] ?? null,
        removeItem: (key: string) => void entries.delete(key),
        setItem: (key: string, value: string) => void entries.set(key, String(value)),
      } satisfies Storage,
    });
    resetRadioForTests();
    audioCreations = 0;
    vi.spyOn(document, "createElement").mockImplementation(((
      tag: string,
      options?: ElementCreationOptions,
    ) => {
      if (tag === "audio") audioCreations += 1;
      return nativeCreateElement(tag, options);
    }) as typeof document.createElement);
  });

  afterEach(() => {
    cleanup();
    resetRadioForTests();
    vi.restoreAllMocks();
    if (nativeLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", nativeLocalStorage);
    }
  });

  it("creates no audio element and no toast, and keeps the dock below the book", () => {
    const { baseElement } = render(
      <MemoryRouter>
        <AcademyBroadcastCenterpiece feed={feedFor(DETAIL)} />
      </MemoryRouter>,
    );

    expect(audioCreations).toBe(0);
    expect(baseElement.querySelector('[role="status"], [role="alert"]')).toBeNull();

    const surface = screen.getByTestId("academy-broadcast-surface");
    const dock = screen.getByTestId("academy-radio-dock");
    expect(
      surface.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(surface.contains(dock)).toBe(false);
  });
});
