/**
 * Whether the Match Centre can actually show a fixture (UX2).
 *
 * THE BOUNDARY. `matchHref()` links a played match by `?game=` (always
 * resolvable: the game is stored) and an upcoming one by `?next=<match_id>`.
 * The hub resolves `?next=` only against its schedule (`useSchedule`: the
 * bounded `/upcoming` reads, the next 12 within 14 days). A valid fixture
 * outside that window gets the hub's "isn't in the current schedule"
 * notice and an UNRELATED latest match in its place (verified in a real
 * browser for the Knockout Final, UX2 handoff §5).
 *
 * So a `?next=` link is offered only when the same schedule reads list the
 * fixture. They share the hub's query keys, so opening the hub afterwards
 * reuses the answer. Nothing here changes the hub or the backend.
 */
import { useSchedule } from "@/lib/live-esports/hooks";
import type { TournamentMatchV2 } from "@/lib/pro-play/tournamentApi";
import { matchHref } from "@/lib/pro-play/tournamentView";

export type MatchCentreLink =
  | { state: "game" | "listed"; href: string }
  | { state: "none" | "checking" | "not_listed" | "unavailable"; href: null };

export interface ScheduleProbe {
  isPending: boolean;
  unusable: boolean;
  ids: ReadonlySet<string>;
}

/** The decision, pure: a match, its link, and what the hub's schedule holds. */
export function matchCentreLink(match: TournamentMatchV2, schedule: ScheduleProbe): MatchCentreLink {
  const href = matchHref(match);
  if (!href) return { state: "none", href: null };
  if (match.live1_game_ids.length) return { state: "game", href };
  if (schedule.ids.has(match.match_id)) return { state: "listed", href };
  if (schedule.isPending) return { state: "checking", href: null };
  if (schedule.unusable) return { state: "unavailable", href: null };
  return { state: "not_listed", href: null };
}

export function useMatchCentreLink(match: TournamentMatchV2): MatchCentreLink {
  const schedule = useSchedule();
  const ids = new Set(schedule.matches.map((m) => m.match_id));
  return matchCentreLink(match, { isPending: schedule.isPending, unusable: schedule.unusable, ids });
}
