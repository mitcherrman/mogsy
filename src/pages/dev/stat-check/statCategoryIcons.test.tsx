import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryMarker } from "./StatCheckPage";
import {
  DECISIVE_MARGIN_PRESENTATION,
  RESERVED_STAT_PRESENTATION,
  categoryIcon,
  categoryLevelBadge,
  categoryTooltipLabel,
  formatThreshold,
  nextRoundHintTooltip,
  statFamilyPresentation,
} from "./statCategoryIcons";
import {
  ACTIVE_STAT_CATEGORIES,
  STAT_CATEGORIES,
  type StatCategory,
  type StatFamily,
} from "./statCheckEngine";

vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionSplash: () => null,
  getChampionIcon: () => null,
  resolveAssetUrl: () => null,
}));

function categoryById(id: string): StatCategory {
  const category = STAT_CATEGORIES.find((entry) => entry.id === id);
  if (!category) throw new Error(`missing fixture category ${id}`);
  return category;
}

/** Text a sighted player actually sees: sr-only metadata stripped out. */
function visibleText(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const srOnly of Array.from(clone.querySelectorAll(".sr-only"))) srOnly.remove();
  return clone.textContent ?? "";
}

function renderMarker(id: string) {
  const { container } = render(<CategoryMarker category={categoryById(id)} />);
  const marker = container.querySelector<HTMLElement>(`[data-testid="stat-check-marker-${id}"]`);
  if (!marker) throw new Error(`marker ${id} did not render`);
  return marker;
}

describe("stat category icon mapping", () => {
  it("maps every family the generator can place on a board to its own PNG", () => {
    const activeFamilies = new Set<StatFamily>(ACTIVE_STAT_CATEGORIES.map((category) => category.family));
    // Guards against a family being activated without art being wired up.
    expect(activeFamilies).toEqual(
      new Set<StatFamily>(["health", "attack-damage", "armor", "move-speed", "attack-range"]),
    );

    const icons = new Map<StatFamily, string>();
    for (const family of activeFamilies) {
      const { icon, label } = statFamilyPresentation(family);
      expect(icon, `${family} has no icon`).toBeTruthy();
      expect(label).toBeTruthy();
      icons.set(family, icon as string);
    }

    expect(icons.get("health")).toMatch(/health\.png|health\.\w+\.png/);
    expect(icons.get("attack-damage")).toMatch(/attack-damage/);
    expect(icons.get("armor")).toMatch(/armor/);
    expect(icons.get("move-speed")).toMatch(/movespeed/);
    expect(icons.get("attack-range")).toMatch(/range/);

    // Distinct art per family — no accidental reuse.
    expect(new Set(icons.values()).size).toBe(icons.size);
  });

  it("keeps a Health Regeneration mapping available without adding it to the active pool", () => {
    expect(RESERVED_STAT_PRESENTATION["health-regen"].icon).toMatch(/health-regen/);
    expect(RESERVED_STAT_PRESENTATION["health-regen"].label).toBe("Health Regeneration");

    // Reserved for future use only: it is not a generated category today.
    const activeFamilies = ACTIVE_STAT_CATEGORIES.map((category) => String(category.family));
    expect(activeFamilies).not.toContain("health-regen");
    expect(STAT_CATEGORIES.map((category) => String(category.family))).not.toContain("health-regen");
  });

  it("gives retired families no borrowed art", () => {
    // magic-resist and attack-speed are active:false and never generated, so
    // they must not silently display another family's symbol.
    expect(statFamilyPresentation("magic-resist").icon).toBeNull();
    expect(statFamilyPresentation("attack-speed").icon).toBeNull();
  });

  it("formats engine threshold fractions as board percentages", () => {
    expect(formatThreshold(0.05)).toBe("5%");
    expect(formatThreshold(0.075)).toBe("7.5%");
    expect(formatThreshold(0.2)).toBe("20%");
  });

  it("builds the complete written category for tooltips only", () => {
    expect(categoryTooltipLabel(categoryById("lowest-armor-18"))).toBe("Lowest Level 18 Armor");
    expect(categoryTooltipLabel(categoryById("highest-hp-1"))).toBe("Highest Level 1 Health");
    expect(categoryTooltipLabel(categoryById("highest-attack-range"))).toBe("Highest Attack Range");
  });

  it("omits the level for unscaled stats and keeps it for levelled ones", () => {
    expect(categoryLevelBadge(categoryById("highest-hp-1"))).toBe("1");
    expect(categoryLevelBadge(categoryById("lowest-armor-18"))).toBe("18");
    expect(categoryLevelBadge(categoryById("highest-move-speed"))).toBeNull();
    expect(categoryLevelBadge(categoryById("highest-attack-range"))).toBeNull();
  });
});

describe("icon-only category plaque", () => {
  it("shows no category wording, direction words, or the word Decisive", () => {
    for (const category of ACTIVE_STAT_CATEGORIES) {
      const marker = renderMarker(category.id);
      const text = visibleText(marker);
      expect(text).not.toMatch(/decisive|hidden|base|level/i);
      expect(text).not.toMatch(/health|armor|attack|damage|move|speed|range|hp|ad/i);
      expect(text).not.toContain(category.shortLabel);
      expect(text).not.toMatch(/high|low/i);
    }
  });

  it("renders the family PNG, direction arrow, and bare level number", () => {
    const marker = renderMarker("lowest-armor-18");
    expect(marker.querySelector('[data-testid="stat-check-category-icon-lowest-armor-18"]')).toHaveAttribute(
      "src",
      categoryIcon(categoryById("lowest-armor-18")) as string,
    );
    expect(marker.querySelector('[data-testid="stat-check-category-level-lowest-armor-18"]')?.textContent).toBe("18");
    expect(marker.querySelector("svg.lucide-arrow-down")).toBeTruthy();
    expect(marker.querySelector("svg.lucide-arrow-up")).toBeNull();
  });

  it("uses an up arrow for highest and a down arrow for lowest", () => {
    expect(renderMarker("highest-hp-1").querySelector("svg.lucide-arrow-up")).toBeTruthy();
    expect(renderMarker("lowest-hp-1").querySelector("svg.lucide-arrow-down")).toBeTruthy();
  });

  it("shows level 1 as a bare 1 and omits the level entirely for move speed and range", () => {
    expect(renderMarker("highest-hp-1").querySelector('[data-testid="stat-check-category-level-highest-hp-1"]')?.textContent).toBe("1");

    const moveSpeed = renderMarker("highest-move-speed");
    expect(moveSpeed.querySelector('[data-testid="stat-check-category-level-highest-move-speed"]')).toBeNull();
    expect(visibleText(moveSpeed)).not.toMatch(/base/i);

    const range = renderMarker("highest-attack-range");
    expect(range.querySelector('[data-testid="stat-check-category-level-highest-attack-range"]')).toBeNull();
  });

  it("renders the scale icon with the lane's own threshold percentage", () => {
    const marker = renderMarker("lowest-hp-1"); // 7.5%
    expect(marker.querySelector('[data-testid="stat-check-decisive-icon-lowest-hp-1"]')).toHaveAttribute(
      "src",
      DECISIVE_MARGIN_PRESENTATION.icon,
    );
    expect(visibleText(marker)).toContain("7.5%");

    expect(visibleText(renderMarker("highest-attack-range"))).toContain("20%");
  });

  it("explains the scale on interaction using the actual threshold", async () => {
    renderMarker("lowest-hp-1");
    const scale = screen.getByTestId("stat-check-decisive-lowest-hp-1");
    expect(scale).toHaveAttribute("aria-label", "If there is a 7.5% gap in stats, deal 1 extra damage.");

    fireEvent.click(scale);
    expect(await screen.findAllByText("If there is a 7.5% gap in stats, deal 1 extra damage.")).not.toHaveLength(0);
  });

  it("exposes the complete written category on the symbol control", async () => {
    renderMarker("lowest-armor-18");
    const symbol = screen.getByTestId("stat-check-category-symbol-lowest-armor-18");
    // Full detail for screen readers...
    expect(symbol.getAttribute("aria-label")).toMatch(/armor/i);
    expect(symbol.getAttribute("aria-label")).toMatch(/7.5%|15%|25%|20%|5%/);

    // ...and the written category on hover/focus/tap.
    fireEvent.focus(symbol);
    expect(await screen.findAllByText("Lowest Level 18 Armor")).not.toHaveLength(0);
  });
});

describe("next-round hint presentation", () => {
  it("names only the family, never direction or level", () => {
    expect(nextRoundHintTooltip("attack-damage")).toBe("Next-round hint: Attack Damage");
    expect(nextRoundHintTooltip("armor")).toBe("Next-round hint: Armor");
    expect(nextRoundHintTooltip("attack-range")).toBe("Next-round hint: Attack Range");
    for (const family of ["health", "armor", "attack-damage", "move-speed", "attack-range"] as StatFamily[]) {
      expect(nextRoundHintTooltip(family)).not.toMatch(/highest|lowest|level \d/i);
    }
  });
});
