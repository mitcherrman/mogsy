// ---------------------------------------------------------------------------
// Client for the canonical esports-media authority (/api/pro-play/media).
//
// THE POINT OF THIS FILE IS WHAT IT DOES NOT CONTAIN. There is no Liquipedia
// URL here, no Leaguepedia URL, no filename pattern, no `logos/${team}.png`.
// The frontend knows one thing: a canonical entity key, which it already holds
// because every dossier row is keyed by `team_key` or `player_lp_page`. The
// backend answers with a path into Mogzy's own asset store, and
// `resolveAssetUrl` — the same helper champion art already goes through —
// turns that into a URL. No page render ever reaches an external host.
//
// PUBLIC, AND DELIBERATELY SO. Unlike the rest of the Matchup Explorer's
// clients this one sends no admin header: the endpoint is public because the
// bytes it points at are served from the public `/assets` mount, and a crest
// that vanished for a logged-out reader would be a gate protecting nothing.
//
// A FAILED REQUEST IS NOT AN ERROR STATE. Every consumer of this module has a
// designed empty frame already, so a network failure, a 500 or a missing
// registry all resolve to "no art" and the monogram that was going to be there
// anyway. Nothing here throws into a render path.
// ---------------------------------------------------------------------------

import { resolveAssetUrl } from "@/hooks/useChampionAssets";

const API_BASE_URL = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

/** "art" — an approved asset was selected. "fallback" — draw the monogram. */
export type MediaState = "art" | "fallback";

export interface EntityMedia {
  entity_type: "team" | "player";
  entity_key: string;
  media_type: string;
  state: MediaState;
  /** Why, when `state` is "fallback". `unknown_entity` means the caller asked
   *  with something that is not a canonical key — an alias or a short code —
   *  which is a bug worth seeing rather than a missing picture. */
  reason: string;
  display_name: string | null;
  fallback_label: string | null;
  /** Relative to the Combat API root, e.g. "assets/esports/teams/…". Never an
   *  absolute external URL. */
  asset_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  /** Display-safe attribution, e.g. "Colin Young-Wolff / Riot Games". */
  credit: string | null;
  contract_version: string;
}

export interface MediaBatch {
  ok: boolean;
  contract_version: string;
  count: number;
  /** False when the roster identity registry is unreachable — every slot will
   *  be a fallback, and that is a deployment fact rather than a data gap. */
  identity_available: boolean;
  results: EntityMedia[];
}

export interface MediaRequest {
  teams?: string[];
  players?: string[];
}

/** Resolve every slot on a screen in one request. Never throws. */
export async function fetchProPlayMedia(
  request: MediaRequest,
  signal?: AbortSignal,
): Promise<MediaBatch | null> {
  const params = new URLSearchParams();
  for (const key of request.teams ?? []) params.append("team", key);
  for (const key of request.players ?? []) params.append("player", key);
  if (![...params].length) {
    return { ok: true, contract_version: "", count: 0, identity_available: true, results: [] };
  }
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/pro-play/media/resolve?${params.toString()}`,
      { headers: { accept: "application/json" }, signal },
    );
    if (!response.ok) return null;
    return (await response.json()) as MediaBatch;
  } catch {
    return null;
  }
}

/** The URL for an entry's art, or null when the slot must fall back. */
export function mediaSrc(entry: EntityMedia | undefined | null): string | null {
  if (!entry || entry.state !== "art" || !entry.asset_path) return null;
  return resolveAssetUrl(entry.asset_path);
}

/** Index a batch for O(1) lookup by (type, key). */
export function indexMedia(batch: MediaBatch | null | undefined) {
  const index = new Map<string, EntityMedia>();
  for (const entry of batch?.results ?? []) {
    index.set(`${entry.entity_type}:${entry.entity_key}`, entry);
  }
  return index;
}

export function mediaKey(entityType: "team" | "player", entityKey: string) {
  return `${entityType}:${entityKey}`;
}


/**
 * Every canonical key a Matchup Explorer payload is about to draw.
 *
 * WRITTEN OUT FIELD BY FIELD RATHER THAN WALKED GENERICALLY. A recursive
 * "collect anything called team_key" would also collect keys the page is not
 * rendering — warnings, drill-down selections, scope descriptors — and turn a
 * four-entity request into a thirty-entity one. Listing the slots keeps the
 * request the same size as the screen.
 */
interface LaneCandidateKeys {
  a?: { candidates?: { player_lp_page?: string | null }[] | null } | null;
  b?: { candidates?: { player_lp_page?: string | null }[] | null } | null;
}

function isLaneRow(row: unknown): row is LaneCandidateKeys {
  return typeof row === "object" && row !== null;
}

export function matchupMediaKeys(
  payload:
    | {
        teams?: {
          a?: { team_key?: string | null } | null;
          b?: { team_key?: string | null } | null;
        } | null;
        /** `unknown` because the two boards disagree: the five-lane payload's
         *  `lanes` is a list of LANE ROWS, and the lane explorer's is a list of
         *  LANE NAMES (plain strings). Typing it as either would make one of
         *  the two call sites a type error, and coercing them into a union
         *  would claim a compatibility that does not exist — so the shape is
         *  narrowed at runtime, where the difference actually is. */
        lanes?: unknown;
        sides?: {
          a?: {
            team?: { team_key?: string | null } | null;
            player?: { player_lp_page?: string | null } | null;
          } | null;
          b?: {
            team?: { team_key?: string | null } | null;
            player?: { player_lp_page?: string | null } | null;
          } | null;
        } | null;
      }
    | null
    | undefined,
): MediaRequest {
  const teams: string[] = [];
  const players: string[] = [];
  if (!payload) return { teams, players };

  for (const side of [payload.teams?.a, payload.teams?.b]) {
    if (side?.team_key) teams.push(side.team_key);
  }
  if (Array.isArray(payload.lanes)) {
    for (const row of payload.lanes) {
      if (!isLaneRow(row)) continue;
      for (const side of [row.a, row.b]) {
        for (const candidate of side?.candidates ?? []) {
          if (candidate?.player_lp_page) players.push(candidate.player_lp_page);
        }
      }
    }
  }
  for (const side of [payload.sides?.a, payload.sides?.b]) {
    if (side?.team?.team_key) teams.push(side.team.team_key);
    if (side?.player?.player_lp_page) players.push(side.player.player_lp_page);
  }
  return { teams, players };
}
