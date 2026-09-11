/**
 * Canonical route identity for the Pro Play area.
 *
 * These live apart from the hub component for the same reason the Premium
 * routes do (`@/lib/premium-routes`): the router needs the paths, and
 * importing them from `ProPlayHub.tsx` would pull that page — and everything
 * it imports — into the main bundle, undoing its lazy split.
 *
 * Naming rule: **Pro Play is the esports content area at `/lol/pro-play`;
 * Premium is the paid subscription at `/lol/premium`.** They are unrelated
 * products that unfortunately share a word. See
 * `docs/naming-premium-vs-pro-play.md`.
 */

/** The Pro Play hub — the landing page for the area. */
export const PRO_PLAY_ROUTE = "/lol/pro-play";
export const PRO_PLAY_QUIZ_ROUTE = "/lol/pro-play/quiz";
export const PRO_PLAY_GRAPHS_ROUTE = "/lol/pro-play/graphs";

/**
 * The LIVE1 match centre. It shipped first at `/esports/live`, outside this
 * area and linked from nowhere; that URL now redirects here so the match
 * centre sits inside the Pro Play IA it belongs to.
 */
export const PRO_PLAY_LIVE_ROUTE = "/lol/pro-play/live";

/** The pre-Pro-Play URL for the match centre, kept as a redirect. */
export const LEGACY_ESPORTS_LIVE_ROUTE = "/esports/live";

/**
 * Browsing the stored match catalogue — the archive. A child of the match
 * centre because that is what it feeds: picking a game here opens it in the
 * viewer at `PRO_PLAY_LIVE_ROUTE`, not in a second renderer.
 *
 * The backend calls this data `history`, not `archive`: over there `archive`
 * already means the verified .jsonl.gz artifacts and the `live_archives`
 * ledger. Reader-facing word here, operator-facing word there, on purpose.
 */
export const PRO_PLAY_LIVE_ARCHIVE_ROUTE = "/lol/pro-play/live/archive";

/**
 * Deep link to one stored game in the match centre: `?game=<id>`. The viewer
 * pins whatever this names — including a game far too old to appear in the
 * live feed — so an archive row, a shared URL and a refresh all land on the
 * same match.
 */
export const PRO_PLAY_LIVE_GAME_PARAM = "game";

export function proPlayLiveGameUrl(gameId: string): string {
  return `${PRO_PLAY_LIVE_ROUTE}?${PRO_PLAY_LIVE_GAME_PARAM}=${encodeURIComponent(gameId)}`;
}

/**
 * The Pro Play research surface: global search over players, teams and
 * champions, and the three profiles it resolves to.
 *
 * PUBLIC. Search and the three profiles are the canonical public Pro Play
 * identity layer: signed-out readable, indexable, and the destination every
 * other Pro Play surface links its identities to. Do not add a second set of
 * public profile paths — these are it.
 *
 * Deliberately NOT the same thing as `/lol/docs/pro/...`: those pages are the
 * DECLARED roster (wiki history, aliases, lineups as announced), while these
 * are DEMONSTRATED performance drawn from the match corpus. The two disagree
 * often and on purpose, and both stay. Research pages link out to the docs
 * pages for roster history; the docs pages linking back is now permissible
 * (it was not while this was admin-only) but is the docs owner's call.
 */
export const PRO_PLAY_SEARCH_ROUTE = "/lol/pro-play/search";

/** Profile routes take the canonical entity key, URL-encoded. */
export const PRO_PLAY_PLAYER_ROUTE = "/lol/pro-play/player/:key";
export const PRO_PLAY_TEAM_ROUTE = "/lol/pro-play/team/:key";
export const PRO_PLAY_CHAMPION_ROUTE = "/lol/pro-play/champion/:key";

/** The three profile kinds, as they appear in the URL. */
export type ProPlayEntityKind = "player" | "team" | "champion";

/**
 * Link to one research profile. The key is canonical and may contain spaces
 * and dots ("Gen.G", "Invictus Gaming"), so it is always encoded.
 */
export function proPlayProfileUrl(kind: ProPlayEntityKind, key: string): string {
  return `/lol/pro-play/${kind}/${encodeURIComponent(key)}`;
}

/**
 * The Worlds Matchup Explorer: configure two teams, a lane, two players and
 * two champions, and read both sides over the four standard scopes.
 *
 * A child of the Pro Play area rather than of `search`, because it is a
 * sibling surface and not a drill-down from one: search resolves an identity,
 * the Explorer composes several. Admin-gated for the same reason the research
 * routes are, so the hub carries no tile for it either.
 *
 * All of its state lives in the query string (see `matchupApi.ts`), so the
 * path itself takes no parameters and a configured matchup is one URL.
 */
export const PRO_PLAY_MATCHUP_ROUTE = "/lol/pro-play/matchup";
