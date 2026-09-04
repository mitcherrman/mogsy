// Presentation metadata for the mechanics study tables.
//
// The BACKEND owns the grouping: its eight categories are the navigable unit,
// and this module never merges, splits or reorders the tables inside one.
// What lives here is strictly reader-facing dressing that the API does not
// carry — a URL slug, a shelf heading, an icon, a display order, and the
// blurb that introduces a category on the landing page.
//
// Nothing here is a mechanics value, and nothing here is required for a
// category to render: an unrecognised category falls back to a derived label
// and slug, so a category published on the backend tomorrow appears in the
// navigation with this build unchanged.

import {
  Coins,
  Landmark,
  LineChart,
  Radar,
  Skull,
  Swords,
  TowerControl,
  Trees,
  type LucideIcon,
} from "lucide-react";

import type { StudyTableRef, TablesIndexCategory } from "./api";

/** The shelves the landing page groups categories under. Presentation only. */
export const SHELVES = ["minions", "map", "economy"] as const;
export type ShelfId = (typeof SHELVES)[number];

export const SHELF_LABELS: Record<ShelfId, string> = {
  minions: "Minions & waves",
  map: "The map",
  economy: "Economy",
};

export const SHELF_BLURBS: Record<ShelfId, string> = {
  minions: "The lane clock: when waves arrive, what is in them, and what they are worth.",
  map: "Neutral ground and buildings — camps, objectives, turrets, and your own base.",
  economy: "What a takedown pays, and what it costs the player who dies.",
};

interface CategoryPresentation {
  slug: string;
  label: string;
  blurb: string;
  shelf: ShelfId;
  Icon: LucideIcon;
  /** Sort order within the shelf. */
  order: number;
}

const CATEGORY_PRESENTATION: Record<string, CategoryPresentation> = {
  minion_waves: {
    slug: "minion-waves",
    label: "Minion waves",
    blurb: "When waves spawn, how the cannon cadence changes, and what each wave is made of.",
    shelf: "minions",
    Icon: Swords,
    order: 1,
  },
  minion_stats: {
    slug: "minion-stats",
    label: "Minion stats",
    blurb: "What each lane minion is worth, how tough it is, and how it grows over the game.",
    shelf: "minions",
    Icon: Radar,
    order: 2,
  },
  minion_behavior: {
    slug: "minion-behavior",
    label: "Minion behaviour",
    blurb: "What makes minions turn on you, and the catch-up buff a winning team's wave gets.",
    shelf: "minions",
    Icon: Radar,
    order: 3,
  },
  wave_economy: {
    slug: "wave-economy",
    label: "Wave XP & gold",
    blurb: "Experience and gold from minions wave by wave, and the level each wave puts you on.",
    shelf: "minions",
    Icon: LineChart,
    order: 4,
  },
  jungle_objectives: {
    slug: "jungle-objectives",
    label: "Jungle & objectives",
    blurb: "First spawns and respawn timers for every camp and neutral objective.",
    shelf: "map",
    Icon: Trees,
    order: 1,
  },
  structures: {
    slug: "structures",
    label: "Structures",
    blurb: "Turrets, plates, inhibitors and the Nexus — stats, combat rules and comeback mechanics.",
    shelf: "map",
    Icon: TowerControl,
    order: 2,
  },
  base_systems: {
    slug: "base-systems",
    label: "Base & respawn",
    blurb: "The fountain, Homeguard, and how long you stay dead.",
    shelf: "map",
    Icon: Landmark,
    order: 3,
  },
  takedown_economy: {
    slug: "takedown-economy",
    label: "Takedown gold",
    blurb: "Kill and assist gold by level, First Blood, and how bounties build and pay out.",
    shelf: "economy",
    Icon: Coins,
    order: 1,
  },
};

/** A snake_case backend token as a sentence-case reader label. */
export function humanizeToken(token: string): string {
  const words = token.split(/[._]+/).filter(Boolean);
  if (words.length === 0) return token;
  return words
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** A backend token as a URL slug. */
export function slugifyToken(token: string): string {
  return token
    .toLowerCase()
    .split(/[._\s]+/)
    .filter(Boolean)
    .join("-");
}

/** The reader-facing view of one backend category, always resolvable. */
export interface CategoryView {
  id: string;
  slug: string;
  label: string;
  blurb: string;
  shelf: ShelfId;
  Icon: LucideIcon;
  order: number;
  tables: TableView[];
}

/** The reader-facing view of one study table. */
export interface TableView {
  tableId: string;
  slug: string;
  title: string;
  subtitle: string;
  rowCount: number;
  categoryId: string;
  categorySlug: string;
}

const FALLBACK_ICON: LucideIcon = Skull;

/**
 * The table's slug: its id with the owning category and the `study` marker
 * stripped, so `minion_waves.study.wave_times` becomes `wave-times`. Derived
 * from the id rather than mapped, so a table published tomorrow is linkable
 * with this build unchanged. Falls back to the whole id when the id does not
 * follow that shape.
 */
export function tableSlug(tableId: string, categoryId: string): string {
  let rest = tableId;
  if (categoryId && rest.startsWith(`${categoryId}.`)) rest = rest.slice(categoryId.length + 1);
  if (rest.startsWith("study.")) rest = rest.slice("study.".length);
  return slugifyToken(rest || tableId);
}

function presentationFor(categoryId: string): Omit<CategoryPresentation, "slug"> & { slug: string } {
  const known = CATEGORY_PRESENTATION[categoryId];
  if (known) return known;
  return {
    slug: slugifyToken(categoryId),
    label: humanizeToken(categoryId),
    blurb: "",
    // An unmapped category is still real published data. It goes on the map
    // shelf last rather than disappearing from the navigation.
    shelf: "map",
    Icon: FALLBACK_ICON,
    order: 99,
  };
}

/** Build the reader-facing category list from the backend index. */
export function buildCategoryViews(categories: TablesIndexCategory[]): CategoryView[] {
  const views = categories.map((category) => {
    const presentation = presentationFor(category.category);
    return {
      id: category.category,
      ...presentation,
      tables: category.study_tables.map((table: StudyTableRef) => ({
        tableId: table.table_id,
        slug: tableSlug(table.table_id, category.category),
        title: table.title,
        subtitle: table.subtitle,
        rowCount: table.row_count,
        categoryId: category.category,
        categorySlug: presentation.slug,
      })),
    };
  });
  const shelfIndex = (shelf: ShelfId) => SHELVES.indexOf(shelf);
  return views.sort(
    (a, b) => shelfIndex(a.shelf) - shelfIndex(b.shelf) || a.order - b.order || a.label.localeCompare(b.label),
  );
}

/** Categories bucketed into their shelves, shelves in declared order. */
export function groupByShelf(views: CategoryView[]): Array<{ shelf: ShelfId; categories: CategoryView[] }> {
  return SHELVES.map((shelf) => ({
    shelf,
    categories: views.filter((view) => view.shelf === shelf),
  })).filter((group) => group.categories.length > 0);
}

export function findCategoryBySlug(views: CategoryView[], slug: string): CategoryView | undefined {
  return views.find((view) => view.slug === slug);
}

export function findTableBySlug(category: CategoryView, slug: string): TableView | undefined {
  return category.tables.find((table) => table.slug === slug);
}

// ---------------------------------------------------------------------------
// Route helpers — one place that knows the URL shape
// ---------------------------------------------------------------------------

export const MECHANICS_REFERENCE_PATH = "/lol/docs/mechanics";

export function categoryPath(category: { slug: string }): string {
  return `${MECHANICS_REFERENCE_PATH}/${category.slug}`;
}

export function tablePath(table: { categorySlug: string; slug: string }): string {
  return `${MECHANICS_REFERENCE_PATH}/${table.categorySlug}/${table.slug}`;
}
