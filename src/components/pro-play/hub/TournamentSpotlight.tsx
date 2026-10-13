/**
 * The hub's way into a featured tournament page (DCGI1; Worlds, PW4-B).
 *
 * A compact pill that lives in the hub's existing header row, so the Match
 * Center keeps its place in the first screen (PPH3's one-screen desktop
 * target). It carries the event mark and short name everywhere; the phase and
 * dates from `xl`, and the live or next match from `2xl`, where the header
 * has room beside the search (the UP NEXT rail already carries the next
 * match). The full event name is the link's accessible name.
 *
 * It reads the same tournament contract the page does (React Query shares the
 * cache), either version. It draws nothing while loading or for a context the
 * backend does not have (404): an absent pill is the honest state there,
 * never a placeholder that promises a page. When the hub passes the featured
 * event's configured identity (`fallback`) and the read fails for any other
 * reason, the pill stays, with only that identity: the featured event does
 * not vanish (or hand its place to another) because one request failed, and
 * its page says what it cannot read.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { EventMark } from "@/components/pro-play/media/EventMark";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { localStart } from "@/lib/pro-play/hubSeries";
import { proPlayTournamentUrl } from "@/lib/pro-play/routes";
import {
  TournamentNotFound,
  isTournamentV2,
  useTournament,
  type AnyTournamentResponse,
  type TournamentMatchTeam,
} from "@/lib/pro-play/tournamentApi";
import { PHASE_LABEL, dateRange } from "@/lib/pro-play/tournamentView";
import { phaseLabelV2 } from "@/lib/pro-play/tournamentV2View";

const teamText = (t: TournamentMatchTeam) => (t.tbd || !t.code ? "TBD" : t.code);

const PILL =
  "group inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/[0.06] py-1 pl-1 pr-2.5 sm:gap-2 sm:pr-3 text-xs transition-colors hover:border-[#c9a84c]/70 sm:min-h-0";

function phaseText(data: AnyTournamentResponse) {
  return isTournamentV2(data) ? phaseLabelV2(data.state, data.context) : PHASE_LABEL[data.state.phase];
}

function Kicker({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span
      className="pl-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      data-testid="spotlight-label"
    >
      {label}
    </span>
  );
}

const Arrow = () => (
  <ArrowRight
    className="h-3.5 w-3.5 shrink-0 text-[#e3c66f] transition-transform group-hover:translate-x-0.5"
    aria-hidden="true"
  />
);

export default function TournamentSpotlight({
  contextId,
  label,
  fallback,
}: {
  contextId: string;
  /** A visible kicker ("Featured") saying this is page chrome — an event the
   *  hub points at — and not the selected match's own event (PP-IA2). */
  label?: string;
  /** The featured event's configured identity, drawn when the read fails. */
  fallback?: { name: string; shortName: string; leagueSlug: string };
}) {
  const { data, error } = useTournament(contextId);
  if (!data) {
    if (!fallback || !error || error instanceof TournamentNotFound) return null;
    return (
      <ProPlayMediaProvider leagues={[fallback.leagueSlug]}>
        <Link
          to={proPlayTournamentUrl(contextId)}
          data-testid="tournament-spotlight"
          data-state="unavailable"
          aria-label={fallback.name}
          title={fallback.name}
          className={PILL}
        >
          <Kicker label={label} />
          <EventMark name={fallback.shortName} slug={fallback.leagueSlug} className="rounded-full" />
          <span className="font-semibold text-foreground">{fallback.shortName}</span>
          <Arrow />
        </Link>
      </ProPlayMediaProvider>
    );
  }
  const { context: ctx, state } = data;
  const phase = phaseText(data);
  // v2 leads with a live match; v1 (DCGI) keeps its reviewed "Next" line.
  const live = isTournamentV2(data) ? (state.matches.find((m) => m.state === "live") ?? null) : null;
  const next = live ?? state.matches.find((m) => m.match_id === state.next_match_id);
  return (
    <ProPlayMediaProvider leagues={[ctx.league.slug]}>
      <Link
        to={proPlayTournamentUrl(ctx.context_id)}
        data-testid="tournament-spotlight"
        aria-label={`${ctx.name}: ${phase}`}
        title={`${ctx.name} · ${dateRange(ctx.starts, ctx.ends)}`}
        className={PILL}
      >
        <Kicker label={label} />
        <EventMark name={ctx.short_name} slug={ctx.league.slug} className="rounded-full" />
        <span className="font-semibold text-foreground">{ctx.short_name}</span>
        <span className="hidden whitespace-nowrap uppercase tracking-[0.08em] text-[#c9a84c] xl:inline">
          {phase} · {dateRange(ctx.starts, ctx.ends)}
        </span>
        {next && (
          <span className="hidden whitespace-nowrap text-muted-foreground 2xl:inline" data-testid="spotlight-next">
            {live ? "Live" : "Next"}{" "}
            <span className="font-semibold text-foreground/90">{teamText(next.teams[0])} vs {teamText(next.teams[1])}</span>
            {!live && (
              <>
                {" · "}
                <span className="tabular-nums">{localStart(next.scheduled_start)}</span>
              </>
            )}
          </span>
        )}
        <Arrow />
      </Link>
    </ProPlayMediaProvider>
  );
}
