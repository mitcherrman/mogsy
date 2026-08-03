/**
 * Patch Brief rendering on the Academy Broadcast book surface.
 *
 * The one product rule proven here, end to end (raw report text → projection
 * → rendered DOM, desktop AND mobile): every champion entry shows its icon
 * and NEVER its name in visible text, `title` attributes, or tooltips —
 * champion names survive only inside aria-labels and sr-only spans. Visible
 * assertions use a visibility-aware text walker, never textContent, so an
 * sr-only leak would fail the suite.
 *
 * Also pinned: patch label, direction labels as text (not color-alone),
 * concise summaries, docs/full-report links, keyboard focus, the desktop
 * fourth-row breakpoint reduction, and that composing the brief centerpiece
 * still creates no audio element and no toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { projectPatchBrief } from "@/lib/patch-reports/patch-brief";
import AcademyBroadcastCenterpiece from "./AcademyBroadcastCenterpiece";
import AcademyBroadcastSurface from "./AcademyBroadcastSurface";
import { briefTransmission } from "./usePatchBriefFeed";
import { INITIAL_BROADCAST_FEED, type BroadcastFeed } from "./broadcast-content";
import { resetRadioForTests } from "@/lib/audio/academy-radio";

/* -------------------------------------------------------------------------- */
/* Fixture: raw report data deliberately soaked in champion names             */
/* -------------------------------------------------------------------------- */

const CHAMPIONS = ["Ryze", "Ahri", "Corki", "Kai'Sa"] as const;

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

const DETAIL: PatchReportDetail = {
  patch_version: "25.14",
  source_url: "https://example.com/notes",
  built_at: "2026-07-30T00:00:00Z",
  section_titles: ["Champions", "Items"],
  skipped_sections: [],
  cards: [
    {
      id: 1,
      entity_type: "champion",
      entity_name: "Ryze",
      entity_slug: null,
      section_id: "champions",
      section_title: "Champions",
      official_image_url: null,
      mogzy_image_path: null,
      mogzy_entity_ref: "Ryze",
      context_text: "Ryze has been struggling in solo queue.",
      aggregate_status: "matches",
      changes: [
        {
          ...baseChange,
          group_title: "Ryze Base Stats",
          ability_slot: null,
          property_name: "Base attack damage",
          change_kind: "numeric",
          before_raw: "58",
          after_raw: "61",
        },
      ],
    },
    {
      id: 2,
      entity_type: "champion",
      entity_name: "Ahri",
      entity_slug: null,
      section_id: "champions",
      section_title: "Champions",
      official_image_url: null,
      mogzy_image_path: null,
      mogzy_entity_ref: "Ahri",
      context_text: null,
      aggregate_status: "matches",
      changes: [
        {
          ...baseChange,
          group_title: "Q - Orb of Deception",
          ability_slot: "Q",
          property_name: "Cooldown",
          change_kind: "numeric",
          before_raw: "8",
          after_raw: "10",
        },
      ],
    },
    {
      id: 3,
      entity_type: "champion",
      entity_name: "Corki",
      entity_slug: null,
      section_id: "champions",
      section_title: "Champions",
      official_image_url: null,
      mogzy_image_path: null,
      // Not in Mogzy's catalog → icon renders WITHOUT a docs link.
      mogzy_entity_ref: null,
      context_text: null,
      aggregate_status: "matches",
      changes: [
        {
          ...baseChange,
          group_title: "Base Stats",
          ability_slot: null,
          property_name: "Base health",
          change_kind: "numeric",
          before_raw: "645",
          after_raw: "620",
        },
        {
          ...baseChange,
          group_title: "Base Stats",
          ability_slot: null,
          property_name: "Base armor",
          change_kind: "numeric",
          before_raw: "28",
          after_raw: "31",
        },
      ],
    },
    {
      id: 4,
      entity_type: "champion",
      entity_name: "Kai'Sa",
      entity_slug: null,
      section_id: "champions",
      section_title: "Champions",
      official_image_url: null,
      mogzy_image_path: null,
      mogzy_entity_ref: "Kai'Sa",
      context_text: null,
      aggregate_status: "matches",
      changes: [
        {
          ...baseChange,
          group_title: "Bugfixes",
          ability_slot: null,
          property_name: "Bugfixes",
          change_kind: "mechanical",
          detail_text: "Fixed a bug where Kai'Sa's passive dealt no damage.",
        },
      ],
    },
    {
      id: 5,
      entity_type: "item",
      entity_name: "Long Sword",
      entity_slug: null,
      section_id: "items",
      section_title: "Items",
      official_image_url: "https://cdn.example/long-sword.png",
      mogzy_image_path: null,
      mogzy_entity_ref: "Long Sword",
      context_text: null,
      aggregate_status: "matches",
      changes: [
        {
          ...baseChange,
          group_title: "Long Sword",
          ability_slot: null,
          property_name: "Attack damage",
          change_kind: "numeric",
          before_raw: "10",
          after_raw: "9",
        },
      ],
    },
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

function briefFeed(): BroadcastFeed {
  const brief = projectPatchBrief(DETAIL, MANIFEST);
  if (!brief) throw new Error("fixture must project a brief");
  return { status: "ready", transmissions: [briefTransmission(brief)], index: 0 };
}

/**
 * Text a sighted user can actually read: every text node EXCEPT those inside
 * `.sr-only` (visually hidden) subtrees. aria-labels are attributes, so they
 * are excluded by construction. This is what textContent would wrongly count.
 */
function visibleText(root: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node instanceof Element && node.classList.contains("sr-only")) return;
    node.childNodes.forEach(walk);
  };
  walk(root);
  return out;
}

const renderSurface = (variant: "desktop" | "mobile", feed: BroadcastFeed = briefFeed()) =>
  render(
    <MemoryRouter>
      <AcademyBroadcastSurface feed={feed} variant={variant} />
    </MemoryRouter>,
  );

afterEach(() => cleanup());

/* -------------------------------------------------------------------------- */

describe.each(["desktop", "mobile"] as const)(
  "Patch Brief on the book surface — %s variant",
  (variant) => {
    const suffix = variant === "desktop" ? "" : "-mobile";

    it("shows PATCH BRIEF, the patch label, and an icon for every champion entry", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      const visible = visibleText(surface);
      expect(visible).toContain("Patch Brief");
      expect(visible).toContain("Patch 25.14");

      const rows = surface.querySelectorAll('[data-testid="patch-brief-champion-row"]');
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        const img = row.querySelector("img");
        expect(img).toBeTruthy();
        expect(img!.getAttribute("alt")).toBe("");
      }
    });

    it("NEVER shows a champion name in visible text, title attributes, or tooltips", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      const visible = visibleText(surface).toLowerCase();
      for (const name of CHAMPIONS) {
        expect(visible).not.toContain(name.toLowerCase());
        expect(visible).not.toContain("kai"); // partials of raw text can't leak either
      }
      // No native title attribute anywhere on the surface — the only tooltip
      // mechanism the book could accidentally grow.
      expect(surface.querySelectorAll("[title]")).toHaveLength(0);
    });

    it("keeps the champion name available to screen readers on the docs link", () => {
      renderSurface(variant);
      const link = screen.getByRole("link", { name: "Open Ryze in League Docs" });
      expect(link).toHaveAttribute("href", "/lol/docs/champions/ryze");
      // The image inside contributes no duplicate accessible name.
      expect(link.querySelector("img")!.getAttribute("alt")).toBe("");
      link.focus();
      expect(document.activeElement).toBe(link);
    });

    it("renders an uncatalogued champion's icon with sr-only identity and no link", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      // Corki has no mogzy_entity_ref → no docs link may exist for it…
      expect(
        screen.queryByRole("link", { name: /Corki/ }),
      ).toBeNull();
      // …but its row still identifies itself invisibly, icon intact.
      const srOnly = Array.from(surface.querySelectorAll(".sr-only")).map(
        (el) => el.textContent,
      );
      expect(srOnly).toContain("Corki");
      expect(visibleText(surface)).not.toContain("Corki");
    });

    it("classifies with visible text labels: Buff, Nerf, Adjusted, Fix", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      const visible = visibleText(surface);
      expect(visible).toContain("Buff");
      expect(visible).toContain("Nerf");
      expect(visible).toContain("Adjusted");
      expect(visible).toContain("Fix");
    });

    it("shows concise sanitized summaries built from structured fields", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      const visible = visibleText(surface);
      expect(visible).toContain("Base attack damage 58 → 61");
      expect(visible).toContain("Q cooldown 8 → 10");
      // Kai'Sa's bugfix prose (with her name) is never rendered — label only.
      expect(visible).toContain("Bugfixes");
      expect(visible).not.toContain("passive dealt no damage");
    });

    it("renders the one item change and links Read full report to the patch", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      const itemRows = surface.querySelectorAll('[data-testid="patch-brief-item-row"]');
      expect(itemRows).toHaveLength(1);
      expect(visibleText(surface)).toContain("Attack damage 10 → 9");

      const report = screen.getByRole("link", { name: "Read full report" });
      expect(report).toHaveAttribute("href", "/lol/patch-reports?patch=25.14");
    });

    it("keeps champion rows on the left page and the report action on the right page", () => {
      renderSurface(variant);
      const surface = screen.getByTestId(`academy-broadcast-surface${suffix}`);
      const championList = surface.querySelector('[aria-label="Selected champion changes"]')!;
      const report = screen.getByRole("link", { name: "Read full report" });
      expect(
        championList.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  },
);

describe("Patch Brief — breakpoint reduction and fallback", () => {
  it("desktop reduces to three rows on narrow lanes via the breakpoint class — never names", () => {
    renderSurface("desktop");
    const rows = screen
      .getByTestId("academy-broadcast-surface")
      .querySelectorAll('[data-testid="patch-brief-champion-row"]');
    expect(rows[3].className).toContain("hidden");
    expect(rows[3].className).toContain("min-[1360px]:flex");
    for (const i of [0, 1, 2]) expect(rows[i].className).not.toContain("hidden");
  });

  it("mobile keeps all four rows visible", () => {
    renderSurface("mobile");
    const rows = screen
      .getByTestId("academy-broadcast-surface-mobile")
      .querySelectorAll('[data-testid="patch-brief-champion-row"]');
    for (const row of rows) expect(row.className).not.toContain("hidden");
  });

  it("the neutral placeholder feed renders no brief rows and no links", () => {
    renderSurface("desktop", INITIAL_BROADCAST_FEED);
    const surface = screen.getByTestId("academy-broadcast-surface");
    expect(surface.querySelectorAll("[data-testid^='patch-brief-']")).toHaveLength(0);
    expect(surface.querySelector("a")).toBeNull();
    expect(surface).toHaveTextContent("Transmission systems online");
  });
});

/* -------------------------------------------------------------------------- */
/* Centerpiece regression — composing the brief changes nothing about audio   */
/* -------------------------------------------------------------------------- */

describe("Patch Brief centerpiece — audio and dock regressions", () => {
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
        <AcademyBroadcastCenterpiece feed={briefFeed()} />
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
