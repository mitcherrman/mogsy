// ---------------------------------------------------------------------------
// HUB-NEXT1 — resolving an explicit `?next=<match_id>` the hub's schedule
// does not list.
//
// The hub's schedule is two BOUNDED reads (`/upcoming`, `/upcoming?league=
// worlds`: the next 12 within 14 days). A fixture beyond them — the Worlds
// Final a month out — is not "gone"; it is simply further away than those
// reads look. The tournament contract (`/api/live-esports/tournament/{id}`)
// carries each configured event's whole schedule, so it is the authority for
// such a link.
//
// Which events are asked: every event the hub is CONFIGURED to feature
// (`FEATURED_EVENTS`), not only the one featured today — a Worlds link must
// resolve on 13 Oct while DCGI holds the slot. Only for an unresolved explicit
// link: an ordinary visit never reaches this.
//
// Honesty rules:
// - A match is identified only by its exact upstream `match_id`; no mapping.
// - Found = that context lists it. Its state is the backend's; nothing about
//   lineups, scores or a game is inferred here.
// - Not found is never "removed": a read that is partial, stale, an older
//   contract, or missing (404) makes the miss `partial`.
// - A read that failed (anything but 404) means the miss cannot be verified:
//   `unavailable`, not `not_found`.
// ---------------------------------------------------------------------------

import type { LiveGameSummary, UpcomingMatch } from "@/lib/live-esports/api";
import { FEATURED_EVENTS } from "@/lib/pro-play/featuredTournament";
import { proPlayTournamentUrl } from "@/lib/pro-play/routes";
import {
  TournamentNotFound,
  isTournamentV2,
  type AnyTournamentResponse,
  type TournamentMatch,
  type TournamentMatchState,
  type TournamentMatchTeam,
} from "@/lib/pro-play/tournamentApi";
import { buildHref } from "@/lib/pro-play/worldsExperience/navigation";
import { WORLDS_EXPERIENCE_BASE, usesWorldsExperience } from "@/lib/pro-play/worldsExperience/productionGate";

/** The tournament contexts an explicit fixture is looked up in, in order. */
export const FIXTURE_CONTEXT_IDS: readonly string[] = FEATURED_EVENTS.map((e) => e.contextId);

/** One context's read, as React Query reports it. */
export interface ContextRead {
  contextId: string;
  data: AnyTournamentResponse | undefined;
  error: unknown;
  isPending: boolean;
}

export type FixtureResolution =
  | { kind: "found"; contextId: string; response: AnyTournamentResponse; match: TournamentMatch }
  | { kind: "pending" }
  | { kind: "unavailable" }
  | { kind: "not_found"; partial: boolean };

/** A read whose schedule can stand behind "this event does not list it". */
function completeFor(data: AnyTournamentResponse, matchId: string): boolean {
  if (!isTournamentV2(data)) return false;
  const coverage = data.state.coverage;
  return (
    data.source_ok &&
    !data.stale &&
    coverage.complete === true &&
    !coverage.missing_match_ids.includes(matchId)
  );
}

export function resolveExplicitFixture(matchId: string, reads: readonly ContextRead[]): FixtureResolution {
  for (const r of reads) {
    const match = r.data?.state.matches.find((m) => m.match_id === matchId);
    if (r.data && match) return { kind: "found", contextId: r.contextId, response: r.data, match };
  }
  if (reads.some((r) => !r.data && r.isPending)) return { kind: "pending" };
  if (reads.some((r) => !r.data && r.error && !(r.error instanceof TournamentNotFound))) {
    return { kind: "unavailable" };
  }
  return { kind: "not_found", partial: reads.some((r) => !r.data || !completeFor(r.data, matchId)) };
}

/**
 * The feed game a started fixture continues as: the backend's own
 * `live1_game_ids` for the match, live first, then the newest finished one.
 * Only games the feed actually holds — never a guessed id.
 */
export function fixtureFeedGame(
  match: TournamentMatch,
  live: readonly LiveGameSummary[],
  recent: readonly LiveGameSummary[],
): string | null {
  const ids = match.live1_game_ids ?? [];
  if (!ids.length) return null;
  const hit = live.find((g) => ids.includes(g.game_id)) ?? recent.find((g) => ids.includes(g.game_id));
  return hit?.game_id ?? null;
}

/** What the board draws for a fixture found in a tournament schedule. */
export interface TournamentFixtureView {
  /** The fixture in the upcoming board's shape (identity, time, teams). */
  match: UpcomingMatch;
  /** The tournament's own state for it. */
  state: TournamentMatchState;
  /** The event whose schedule is the source, in full and short. */
  eventName: string;
  shortName: string;
  /** The event page (or, when the Worlds experience is on, its Schedule). */
  href: string;
  /** The tournament read is a stale copy or its source failed. */
  stale: boolean;
}

const fixtureTeam = (t: TournamentMatchTeam) => {
  const named = !t.tbd && !!t.code;
  return {
    name: named ? t.upstream_name : null,
    code: named ? t.code : null,
    resolved_page: named ? t.team_key : null,
    tbd: !named,
  };
};

/** Where the event's own schedule for this fixture lives in this build. */
export function fixtureHref(contextId: string, matchId: string): string {
  return usesWorldsExperience(contextId)
    ? buildHref(WORLDS_EXPERIENCE_BASE, { screen: "schedule", matchId })
    : proPlayTournamentUrl(contextId);
}

export function tournamentFixtureView(found: Extract<FixtureResolution, { kind: "found" }>): TournamentFixtureView {
  const { response, match: m, contextId } = found;
  const ctx = response.context;
  const stage = ctx.stages.find((s) => s.key === m.stage)?.name ?? null;
  const block = [stage, m.block_name].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);
  return {
    match: {
      match_id: m.match_id,
      scheduled_start: m.scheduled_start,
      league: { slug: ctx.league.slug, name: ctx.short_name, region: null, scope: null },
      block_name: block.length ? block.join(" · ") : null,
      best_of: m.best_of,
      teams: { a: fixtureTeam(m.teams[0]), b: fixtureTeam(m.teams[1]) },
    },
    state: m.state,
    eventName: ctx.name,
    shortName: ctx.short_name,
    href: fixtureHref(contextId, m.match_id),
    stale: response.stale || !response.source_ok,
  };
}
