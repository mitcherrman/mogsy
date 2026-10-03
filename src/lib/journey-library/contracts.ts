/**
 * JLIB-FE — the public Journey Library contract (`GET /api/journeys`).
 *
 * Typed against the backend's `public_library_entry` field whitelist
 * (`content_sets/journey_library.py`, JLIB-API). Every listed entry is the
 * ACTIVE version of its recipe; an active version that does not compose right
 * now is listed with `available: false` and is never replaced by an older one.
 *
 * The projection below keeps only what the Library renders or sends back:
 * the exact `(recipe_id, recipe_version)` pair, the names, the role, the
 * champions and the question count. `source`, `plan`, `status` and the
 * `superseded` history are read for validation and then dropped — a
 * superseded version is history, never something the client may launch.
 */

export const JOURNEY_LIBRARY_SCHEMA = "journey_library_list.v1";

export interface JourneyChampion {
  id: string;
  label: string;
}

export interface JourneyLibraryEntry {
  /** `${recipeId}@${recipeVersion}` — the Library's identity for a card. */
  key: string;
  recipeId: string;
  recipeVersion: number;
  title: string;
  /** The recipe's lane, as the backend spells it (`top`, `jungle`, `mid`, `bot`, `support`). */
  role: string;
  champions: JourneyChampion[];
  questions: number;
  available: boolean;
  unavailableCode: string | null;
}

export interface JourneyLibraryView {
  serverTime: string | null;
  journeys: JourneyLibraryEntry[];
}

export class JourneyLibraryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JourneyLibraryParseError";
  }
}

export const journeyKey = (recipeId: string, recipeVersion: number): string =>
  `${recipeId}@${recipeVersion}`;

function rec(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JourneyLibraryParseError(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, where: string): string {
  if (typeof value !== "string" || !value) {
    throw new JourneyLibraryParseError(`${where} must be a non-empty string`);
  }
  return value;
}

function int(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new JourneyLibraryParseError(`${where} must be an integer`);
  }
  return value;
}

function readEntry(raw: unknown, i: number): JourneyLibraryEntry | null {
  const where = `journeys[${i}]`;
  const e = rec(raw, where);
  // Defensive: the backend lists only active versions. Anything else is not a
  // playable card and is dropped rather than shown.
  if (e.status !== "active") return null;
  const recipeId = str(e.recipe_id, `${where}.recipe_id`);
  const recipeVersion = int(e.recipe_version, `${where}.recipe_version`);
  if (!Array.isArray(e.champions)) {
    throw new JourneyLibraryParseError(`${where}.champions must be an array`);
  }
  const champions = e.champions.map((c, j) => {
    const o = rec(c, `${where}.champions[${j}]`);
    const id = str(o.id, `${where}.champions[${j}].id`);
    return { id, label: typeof o.label === "string" && o.label ? o.label : id };
  });
  if (typeof e.available !== "boolean") {
    throw new JourneyLibraryParseError(`${where}.available must be a boolean`);
  }
  return {
    key: journeyKey(recipeId, recipeVersion),
    recipeId,
    recipeVersion,
    title: str(e.title, `${where}.title`),
    role: str(e.role, `${where}.role`),
    champions,
    questions: int(e.questions, `${where}.questions`),
    available: e.available,
    unavailableCode: typeof e.unavailable_code === "string" ? e.unavailable_code : null,
  };
}

export function readJourneyLibrary(body: unknown): JourneyLibraryView {
  const b = rec(body, "journey library");
  if (b.schema_version !== JOURNEY_LIBRARY_SCHEMA) {
    throw new JourneyLibraryParseError("unsupported journey library schema");
  }
  if (!Array.isArray(b.journeys)) {
    throw new JourneyLibraryParseError("journeys must be an array");
  }
  const seen = new Set<string>();
  const journeys: JourneyLibraryEntry[] = [];
  b.journeys.forEach((raw, i) => {
    const entry = readEntry(raw, i);
    if (!entry || seen.has(entry.key)) return;
    seen.add(entry.key);
    journeys.push(entry);
  });
  return {
    serverTime: typeof b.server_time === "string" ? b.server_time : null,
    journeys,
  };
}

// ------------------------------------------------------------- roles

/**
 * The Library's lane order and labels. The recipes spell the bot lane `bot`
 * (not Ranked's account-role `adc`), so this is the Library's own small map
 * rather than `RANKED_ROLE_LABELS`. An unknown role is shown title-cased,
 * after the known lanes.
 */
const ROLE_ORDER = ["top", "jungle", "mid", "bot", "adc", "support"];
const ROLE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  bot: "Bot",
  adc: "Bot",
  support: "Support",
};

export function journeyRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export function journeyRoles(entries: readonly JourneyLibraryEntry[]): string[] {
  const roles = Array.from(new Set(entries.map((e) => e.role)));
  const rank = (r: string) => {
    const i = ROLE_ORDER.indexOf(r);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  return roles.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ------------------------------------------------------------- filters

export interface JourneyFilter {
  role: string | null;
  champion: string;
}

const fold = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Does `entry` pass the role filter and the champion search? */
export function matchesJourneyFilter(entry: JourneyLibraryEntry, filter: JourneyFilter): boolean {
  if (filter.role && entry.role !== filter.role) return false;
  const q = fold(filter.champion);
  if (!q) return true;
  return entry.champions.some((c) => fold(c.label).includes(q) || fold(c.id).includes(q));
}
