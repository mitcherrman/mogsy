/**
 * The Stage Explorer's context column (UX1): the selected match's detail, or,
 * with nothing selected, the stage's brief. On desktop it is a panel beside
 * the bracket (the bracket stays in view and keeps its selection); on a phone
 * the match detail is a bottom sheet over the stage.
 *
 * Every line is served structure: sides and where an unnamed side comes from
 * (upstream's slot edges, each one a link to that match), what the result
 * does (the routes upstream draws, or the stage's own rules where a side has
 * no route), and when / where. No history, form or prediction.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Clock, MapPin, Trophy, X } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { countdown, localStart } from "@/lib/pro-play/hubSeries";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";
import type { TournamentMatchTeamV2, TournamentMatchV2, TournamentStageV2 } from "@/lib/pro-play/tournamentApi";
import { matchHref } from "@/lib/pro-play/tournamentView";
import {
  awaitingDraw,
  displayName,
  matchRef,
  outcomeOf,
  playInSwissSlot,
  stageOf,
  swissTiers,
  teamName,
} from "@/lib/pro-play/tournamentV2View";
import { matchOnward, stageStakes, swissMatchStakes, type Onward } from "@/lib/pro-play/worldsExperience/experienceView";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { Eyebrow, Figure, GOLD_TEXT, SideMark, calendarDay } from "./parts";

/* ── match ──────────────────────────────────────────────────────────────── */

function Side({ team, match }: { team: TournamentMatchTeamV2; match: TournamentMatchV2 }) {
  const kit = useKit();
  const x = useExperience();
  const started = match.state !== "upcoming";
  const outcome = outcomeOf(match, team);
  if (team.tbd || !team.code) {
    const src = team.slot;
    const ref = src?.match_id ? kit.byId.get(src.match_id) : null;
    const refName = ref ? (matchRef(ref, kit.names) ?? kit.names.get(ref.match_id)) : null;
    let source: ReactNode = <span>To be decided</span>;
    if (src?.kind === "draw") source = <span>Decided by draw</span>;
    else if ((src?.kind === "winner_of" || src?.kind === "loser_of") && ref && refName) {
      source = (
        <button
          type="button"
          onClick={() => x.selectMatch(ref.match_id)}
          data-testid="slot-source-link"
          className="inline-flex items-center gap-1 text-left text-foreground/85 underline decoration-white/20 underline-offset-2 hover:text-foreground hover:decoration-[#c9a84c]"
        >
          {src.kind === "winner_of" ? "Winner" : "Loser"} of {refName}
        </button>
      );
    }
    return (
      <li className="flex items-center gap-3 py-2.5" data-testid="detail-side" data-team="tbd">
        <SideMark team={team} size="md" byCodeName={(t) => teamName(t, kit.byCode)} />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-foreground/60">TBD</span>
          <span className="block text-xs text-muted-foreground">{source}</span>
        </span>
      </li>
    );
  }
  const p = kit.byCode.get(team.code);
  const meta = [p?.region, p?.qualification, p?.entry_stage === "play_in" ? "Play-In entrant" : p?.swiss_tier ? `Swiss tier ${p.swiss_tier}` : null].filter(Boolean).join(" · ");
  return (
    <li className={cn("flex items-center gap-3 py-2.5", outcome === "loss" && "opacity-60")} data-testid="detail-side" data-team={team.code}>
      <TeamCrest teamKey={team.team_key} name={teamName(team, kit.byCode)} shortCode={team.code} size="md" />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-base font-bold leading-tight", outcome === "win" ? GOLD_TEXT : "text-foreground")}>{team.code}</span>
        <span className="block truncate text-xs text-foreground/80">{teamName(team, kit.byCode)}</span>
        {meta && <span className="block truncate text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{meta}</span>}
      </span>
      {started && <span className={cn("text-3xl font-extrabold tabular-nums", outcome === "win" ? GOLD_TEXT : "text-foreground/85")} data-testid="detail-score">{team.game_wins}</span>}
    </li>
  );
}

function OnwardLine({ who, onward }: { who: "Winner" | "Loser"; onward: Onward | null }) {
  const kit = useKit();
  const x = useExperience();
  if (!onward) return null;
  let body: ReactNode;
  if (onward.kind === "route") {
    const name = kit.names.get(onward.to.match_id) ?? "next match";
    body = (
      <button
        type="button"
        onClick={() => x.selectMatch(onward.to.match_id)}
        data-testid="route-link"
        className="group inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-[#f1dc9c]"
      >
        {name}
        <ArrowRight className="h-3.5 w-3.5 text-[#c9a84c] transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
      </button>
    );
  } else if (onward.kind === "advances") {
    body = <span className="font-semibold text-[#e3c66f]">Advances to {stageLabel(onward.stage)}</span>;
  } else if (onward.kind === "champion") {
    body = <span className="inline-flex items-center gap-1 font-semibold text-[#e3c66f]"><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {kit.ctx.short_name} champion</span>;
  } else {
    body = <span className="font-semibold text-foreground/70">Eliminated</span>;
  }
  return (
    <li className="flex items-center justify-between gap-3 py-2" data-testid={`onward-${who.toLowerCase()}`} data-kind={onward.kind}>
      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{who}</span>
      <span className="text-sm">{body}</span>
    </li>
  );
}

export function MatchDetail({ match, onClose }: { match: TournamentMatchV2; onClose?: () => void }) {
  const kit = useKit();
  const stage = stageOf(kit.ctx, match.stage);
  const name = kit.names.get(match.match_id);
  const ref = matchRef(match, kit.names);
  const href = matchHref(match);
  const onward = matchOnward(match, kit.state, kit.ctx);
  const swiss = swissMatchStakes(match, kit.state);
  const drawn = awaitingDraw(match) && match.teams.some((t) => t.slot?.kind === "draw");
  const when = localStart(match.scheduled_start);
  const until = match.state === "upcoming" ? countdown(match.scheduled_start, kit.now) : null;
  const named = match.teams.filter((t) => !t.tbd && t.team_key);
  return (
    <article className="flex h-full min-h-0 flex-col" data-testid="match-detail" data-match-id={match.match_id} aria-labelledby="match-detail-title">
      <header className="flex items-start gap-3 border-b border-white/[0.07] px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <Eyebrow>{[stage ? stageLabel(stage) : null, match.best_of ? `Bo${match.best_of}` : null].filter(Boolean).join(" · ")}</Eyebrow>
          <h3 id="match-detail-title" className="mt-2.5 truncate text-xl font-bold text-foreground">
            {ref && ref !== name ? ref : (name ?? "Match")}
          </h3>
          {ref && name && ref !== name && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{name}</p>}
        </div>
        <MatchStateBadge state={match.state} size="sm" className="mt-0.5" />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close match detail"
            data-testid="detail-close"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
        <ul className="divide-y divide-white/[0.06]" aria-label="Teams">
          {match.teams.map((t, i) => <Side key={i} team={t} match={match} />)}
        </ul>
        {drawn && <p className="text-xs text-muted-foreground" data-testid="detail-draw">Both teams are decided by the official draw.</p>}

        <section className="space-y-2">
          <Eyebrow tone="muted">When &amp; where</Eyebrow>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center gap-2 tabular-nums text-foreground/90">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {when}
              {until && <span className="text-cyan-300">· {until}</span>}
            </li>
            {stage && (
              <li className="flex items-center gap-2 text-foreground/80">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> {stage.venue}
              </li>
            )}
          </ul>
        </section>

        {onward && (onward.winner || onward.loser) && (
          <section className="space-y-1" data-testid="detail-onward">
            <Eyebrow tone="muted">What the result decides</Eyebrow>
            <ul className="divide-y divide-white/[0.06]">
              <OnwardLine who="Winner" onward={onward.winner} />
              <OnwardLine who="Loser" onward={onward.loser} />
            </ul>
          </section>
        )}
        {swiss && (
          <section className="space-y-1" data-testid="detail-swiss-stakes">
            <Eyebrow tone="muted">Played at {swiss.record}</Eyebrow>
            <ul className="divide-y divide-white/[0.06] text-sm">
              <li className="flex justify-between py-2"><span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Winner</span><span className={cn("font-semibold", swiss.winner === "advances" && GOLD_TEXT)}>{swiss.winner === "advances" ? "Advances" : `Moves to ${swiss.winner}`}</span></li>
              <li className="flex justify-between py-2"><span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Loser</span><span className="font-semibold text-foreground/75">{swiss.loser === "eliminated" ? "Eliminated" : `Drops to ${swiss.loser}`}</span></li>
            </ul>
          </section>
        )}
      </div>
      {(href || named.length > 0) && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] px-5 py-3">
          {href && (
            <Link to={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-3.5 text-sm font-semibold text-[#14110a] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]" data-testid="detail-match-centre">
              Match centre <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          {named.map((t) => (
            <Link key={t.code} to={proPlayProfileUrl("team", t.team_key as string)} className="inline-flex min-h-10 items-center rounded-lg border border-white/12 px-3 text-xs font-semibold text-foreground/85 hover:border-[#c9a84c]/50">
              {t.code} profile
            </Link>
          ))}
        </footer>
      )}
    </article>
  );
}

/* ── stage brief ────────────────────────────────────────────────────────── */

export function StageBrief({ stage }: { stage: TournamentStageV2 }) {
  const kit = useKit();
  const x = useExperience();
  const { ctx, state } = kit;
  const stakes = stageStakes(stage, state, ctx);
  const swiss = stage.bracket === "swiss";
  const recs = state.swiss.records;
  const authority = stage.key === "play_in" && state.play_in.bracket_authority === "standings";
  const entrants = ctx.participants.filter((p) => p.entry_stage === stage.key);
  const slot = playInSwissSlot(ctx, state);
  const playIn = stageOf(ctx, "play_in");
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="stage-brief" data-stage={stage.key}>
      <header className="border-b border-white/[0.07] px-5 pb-4 pt-5">
        <Eyebrow>{stageLabel(stage)} brief</Eyebrow>
        <p className="mt-2.5 text-sm text-foreground/85">
          {calendarDay(stage.starts)} – {calendarDay(stage.ends)} · {stage.venue}
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
        {swiss && recs.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <Figure value={recs.filter((r) => r.status === "advanced").length} label="Advanced" tone="gold" />
            <Figure value={recs.filter((r) => r.status === "active").length} label="Alive" />
            <Figure value={recs.filter((r) => r.status === "eliminated").length} label="Out" tone="muted" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Figure value={stakes.teams ?? "—"} label="Teams" testId="brief-teams" />
            <Figure value={stakes.advance ?? "—"} label={stakes.nextStage ? "Advance" : "Champion"} tone="gold" testId="brief-advance" />
            <Figure value={stakes.eliminated ?? "—"} label="Go home" tone="muted" testId="brief-eliminated" />
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{stage.format_note}</p>

        {!swiss && stage.key === "play_in" && entrants.length > 0 && (
          <section className="space-y-2">
            <Eyebrow tone="muted">The four</Eyebrow>
            <ul className="space-y-1.5">
              {entrants.map((p) => {
                const out = authority && state.play_in.eliminated.includes(p.code);
                const won = authority && state.play_in.winner_code === p.code;
                return (
                  <li key={p.code} className={cn("flex items-center gap-2.5", out && "opacity-50")} data-testid="brief-team" data-team={p.code}>
                    <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{displayName(p)}</span>
                      <span className="block text-[11px] text-muted-foreground">{[p.code, p.region, p.qualification].filter(Boolean).join(" · ")}</span>
                    </span>
                    {won && <span className="rounded bg-[#c9a84c]/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#e3c66f]">Won</span>}
                    {out && <span className="rounded border border-white/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Out</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {swiss && (
          <section className="space-y-2">
            <Eyebrow tone="muted">Seeding</Eyebrow>
            <ul className="space-y-1">
              {swissTiers(ctx).map((t) => (
                <li key={t.tier} className="flex items-center gap-2 text-xs" data-testid="brief-tier" data-tier={t.tier}>
                  <span className="w-9 shrink-0 font-semibold text-[#c9a84c]">T{t.tier}</span>
                  <span className="flex flex-wrap gap-1">
                    {t.teams.map((p) => (
                      <span key={p.code} className="rounded bg-white/[0.05] px-1.5 py-0.5 font-semibold text-foreground/85">{p.code}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {playIn && (
              <p className="text-xs text-muted-foreground" data-testid="brief-play-in-slot" data-state={slot.basis}>
                {slot.code ? (
                  <>
                    <b className="font-semibold text-foreground">{slot.code}</b> {slot.basis === "placed" ? `placed from the ${stageLabel(playIn)}` : `won the ${stageLabel(playIn)}`}
                  </>
                ) : (
                  <>One place goes to the {stageLabel(playIn)} winner, still to be decided.</>
                )}
              </p>
            )}
          </section>
        )}

        {stage.key === "knockout" && state.knockout_teams.length > 0 && (
          <section className="space-y-2">
            <Eyebrow tone="muted">Qualified</Eyebrow>
            <ul className="flex flex-wrap gap-1.5">
              {state.knockout_teams.map((c) => {
                const p = kit.byCode.get(c);
                return (
                  <li key={c} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-1.5 py-1 text-xs font-semibold">
                    <TeamCrest teamKey={p?.team_key} name={p ? displayName(p) : c} shortCode={c} size="xs" /> {c}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {x.desktop && <p className="border-t border-white/[0.06] pt-4 text-[11px] text-muted-foreground">Select any match to see who plays, when, and what the result decides.</p>}
      </div>
    </div>
  );
}
