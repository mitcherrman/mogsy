/**
 * Academy Core V3.5 — data for the two redesigned crystal projections.
 *
 * PRO PLAY: a representative 5v5 lineup, top -> jungle -> mid -> bot -> support
 * for each side. Decorative: no players, no teams, no result — only "five
 * champions versus five champions". Names are the champion manifest's own keys
 * (`/api/assets/champions`, the same authority the book covers use), resolved
 * to their manifest icons at runtime; a name the manifest does not know draws
 * an empty plate rather than a guessed image.
 *
 * THE RIFT CENTRE IMAGE is a 256 px derivative (13 KB WebP) of two assets the
 * product already ships: the owner-supplied Summoner's Rift lane scene
 * (`src/assets/ranked/lane.png`, ENVVIS1, 2026-09-20) with the backend's
 * canonical turret render (`assets/structures/turret.png`, the
 * `quiz.structure_assets` registry art) composited on it — the same pairing
 * the quiz's `lane_turret` environment scene uses. See the V3.5 handoff.
 */
import riftLaneTurret from "@/assets/academy-core/rift-lane-turret.webp";

export const RIFT_CENTRE_ART: string = riftLaneTurret;

/**
 * LEAGUECRAFT ("Arcane Mystery"): the champion examined behind the glass. The
 * manifest key, resolved to the manifest's own square icon (128 px) with
 * `getChampionIcon`; no splash, no invented URL.
 */
export const MYSTERY_CHAMPION = "Lux";
/**
 * The portrait chamber: a pointy-top hexagon with this corner radius (local lens
 * units), aligned with Leaguecraft's iris opening and inside the ring of five
 * role icons (r 76, rings r 9: the chamber, its halo and hinges stay within ~64,
 * clear of their inner edge at 67). About 91 x 105 px at 1366 wide.
 */
export const LUX_WINDOW_RADIUS = 56;
export const MATCHUP_LINEUP = {
  blue: ["Gnar", "Lee Sin", "Azir", "Jinx", "Thresh"],
  red: ["K'Sante", "Vi", "Orianna", "Kai'Sa", "Nautilus"],
} as const;

export interface MatchupMedia {
  /** Five icon URLs per side (null when the manifest has no icon). */
  blue: readonly (string | null)[];
  red: readonly (string | null)[];
  /** The Summoner's Rift centre image (lane + turret), or null before it is due. */
  rift: string | null;
}

/* Geometry of the 5 v 5 arcs, in the lens's local units (lens r 118, Pro Play iris opening 88). */
export const TEAM_ARC_R = 74;
export const TEAM_ICON_R = 12;
export const TEAM_STEP_DEG = 23;

/** Position of champion `i` (0 = leftmost) on the upper or lower arc. */
export function teamSlot(side: "top" | "bottom", i: number): { x: number; y: number } {
  const deg = side === "top" ? -90 + (i - 2) * TEAM_STEP_DEG : 90 - (i - 2) * TEAM_STEP_DEG;
  const r = (deg * Math.PI) / 180;
  return { x: TEAM_ARC_R * Math.cos(r), y: TEAM_ARC_R * Math.sin(r) };
}
