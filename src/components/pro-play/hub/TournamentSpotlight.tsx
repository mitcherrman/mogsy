/**
 * The hub's way into a featured tournament page (DCGI1).
 *
 * A compact pill that lives in the hub's existing header row, so the Match
 * Center keeps its place in the first screen (PPH3's one-screen desktop
 * target). It carries the event mark and short name everywhere; the phase and
 * dates from `xl`, and the next match from `2xl`, where the header has room
 * beside the search (the UP NEXT rail already carries the next match).
 * The full event name is the link's accessible name.
 *
 * It reads the same tournament contract the page does (React Query shares the
 * cache), and draws nothing while loading, on an error, or for an unknown
 * context — an absent pill is the honest state, never a placeholder that
 * promises a page.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { EventMark } from "@/components/pro-play/media/EventMark";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { localStart } from "@/lib/pro-play/hubSeries";
import { proPlayTournamentUrl } from "@/lib/pro-play/routes";
import { useTournament, type TournamentMatchTeam } from "@/lib/pro-play/tournamentApi";
import { PHASE_LABEL, dateRange } from "@/lib/pro-play/tournamentView";

const teamText = (t: TournamentMatchTeam) => (t.tbd || !t.code ? "TBD" : t.code);

export default function TournamentSpotlight({ contextId }: { contextId: string }) {
  const { data } = useTournament(contextId);
  if (!data) return null;
  const { context: ctx, state } = data;
  const next = state.matches.find((m) => m.match_id === state.next_match_id);
  return (
    <ProPlayMediaProvider leagues={[ctx.league.slug]}>
      <Link
        to={proPlayTournamentUrl(ctx.context_id)}
        data-testid="tournament-spotlight"
        aria-label={`${ctx.name}: ${PHASE_LABEL[state.phase]}`}
        title={`${ctx.name} · ${dateRange(ctx.starts, ctx.ends)}`}
        className="group inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/[0.06] py-1 pl-1 pr-2.5 sm:gap-2 sm:pr-3 text-xs transition-colors hover:border-[#c9a84c]/70 sm:min-h-0"
      >
        <EventMark name={ctx.short_name} slug={ctx.league.slug} className="rounded-full" />
        <span className="font-semibold text-foreground">{ctx.short_name}</span>
        <span className="hidden whitespace-nowrap uppercase tracking-[0.08em] text-[#c9a84c] xl:inline">
          {PHASE_LABEL[state.phase]} · {dateRange(ctx.starts, ctx.ends)}
        </span>
        {next && (
          <span className="hidden whitespace-nowrap text-muted-foreground 2xl:inline" data-testid="spotlight-next">
            Next <span className="font-semibold text-foreground/90">{teamText(next.teams[0])} vs {teamText(next.teams[1])}</span>
            {" · "}
            <span className="tabular-nums">{localStart(next.scheduled_start)}</span>
          </span>
        )}
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-[#e3c66f] transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </ProPlayMediaProvider>
  );
}
