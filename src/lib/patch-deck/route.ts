/**
 * Patch Deck URL state (PHD1). Pure.
 *
 *   /dev/patch-deck?patch=26.20&card=<deck card id>&face=impact
 *
 * `card` is the deck card id (the report entity anchor for an entity card,
 * "cover" for the opening card), so a link names a champion, never a position
 * that would drift when a report is rebuilt. `face` is the internal view of
 * that card. Both are optional and anything unreadable falls back to the deck's
 * own defaults rather than erroring.
 */

export const DECK_FACES = ["overview", "changes", "impact", "history", "explore"] as const;
export type DeckFace = (typeof DECK_FACES)[number];

/** Full names (accessible names, headings). */
export const DECK_FACE_LABELS: Record<DeckFace, string> = {
  overview: "Overview",
  changes: "Riot changes",
  impact: "Mogzy Impact",
  history: "Patch history",
  explore: "Explore",
};

/** Short visible tab words; every one fits the panel at 1024px beside its count. */
export const DECK_FACE_SHORT: Record<DeckFace, string> = {
  overview: "Overview",
  changes: "Changes",
  impact: "Impact",
  history: "History",
  explore: "Explore",
};

export const DEFAULT_FACE: DeckFace = "overview";

export type DeckRoute = {
  patch: string | null;
  card: string | null;
  face: DeckFace;
};

export function isDeckFace(value: unknown): value is DeckFace {
  return typeof value === "string" && (DECK_FACES as readonly string[]).includes(value);
}

export function readDeckRoute(params: URLSearchParams): DeckRoute {
  const patch = params.get("patch")?.trim() || null;
  const card = params.get("card")?.trim() || null;
  const rawFace = params.get("face");
  return { patch, card, face: isDeckFace(rawFace) ? rawFace : DEFAULT_FACE };
}

/** The search string for a deck position. Defaults are omitted so URLs stay short. */
export function deckSearch(route: Partial<DeckRoute>): string {
  const params = new URLSearchParams();
  if (route.patch) params.set("patch", route.patch);
  if (route.card && route.card !== "cover") params.set("card", route.card);
  if (route.face && route.face !== DEFAULT_FACE) params.set("face", route.face);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const DECK_PATH = "/dev/patch-deck";

export const deckHref = (route: Partial<DeckRoute>): string => `${DECK_PATH}${deckSearch(route)}`;
