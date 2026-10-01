/**
 * The hub's way into a featured tournament page (DCGI1).
 *
 * One compact band: the event mark, the event's name, its phase, and the
 * next match when upstream has one. It reads the same tournament contract the
 * page does (React Query shares the cache), and draws nothing while loading,
 * on an error, or for an unknown context — an absent band is the honest
 * state, never a placeholder that promises a page.
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
        className="group flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#c9a84c]/30 bg-[#c9a84c]/[0.04] px-3 py-2 transition-colors hover:border-[#c9a84c]/60 sm:px-4"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <EventMark name={ctx.short_name} slug={ctx.league.slug} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{ctx.name}</span>
            <span className="block text-[11px] uppercase tracking-[0.1em] text-[#c9a84c]">
              {PHASE_LABEL[state.phase]} · {dateRange(ctx.starts, ctx.ends)}
            </span>
          </span>
        </span>
        {next && (
          <span className="text-xs text-muted-foreground" data-testid="spotlight-next">
            Next: <span className="font-semibold text-foreground/90">{teamText(next.teams[0])} vs {teamText(next.teams[1])}</span>
            {" · "}
            <span className="tabular-nums">{localStart(next.scheduled_start)}</span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[#e3c66f]">
          {state.phase === "pre_event" ? "Know the field" : "Open"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>
    </ProPlayMediaProvider>
  );
}
