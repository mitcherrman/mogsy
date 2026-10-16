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
 *
 * CONSEQUENCE, NOT VERDICT (UX1 decision 7). Before a match is decided its
 * rows read "If they win" / "If they lose": nobody is called eliminated
 * before the result exists. Once completed they read "Winner" / "Loser".
 *
 * ONE DETAIL, EVERY SCREEN (UX2). The same component serves Stages and
 * Schedule (and their phone sheets); its footer offers the other place the
 * match lives, and a side's code opens that team in Teams. Simulated data
 * is marked in the header.
 */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, FlaskConical, GitBranch, MapPin, Trophy, X } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { countdown, localStart } from "@/lib/pro-play/hubSeries";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";
import type { TournamentMatchTeamV2, TournamentMatchV2, TournamentStageV2 } from "@/lib/pro-play/tournamentApi";
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
import { matchDay } from "@/lib/pro-play/worldsExperience/scheduleView";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { FitCascade, ViewTabs } from "./fit";
import { useMatchCentreLink, type MatchCentreLink } from "./matchCentreLink";
import { Eyebrow, Figure, GOLD_TEXT, SideMark, calendarDay } from "./parts";

/* ── match ──────────────────────────────────────────────────────────────── */

function Side({ team, match, compact = false }: { team: TournamentMatchTeamV2; match: TournamentMatchV2; compact?: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const started = match.state !== "upcoming";
  const outcome = outcomeOf(match, team);
  const row = compact ? "py-1.5" : "py-2.5";
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
      <li className={cn("flex items-center gap-3", row)} data-testid="detail-side" data-team="tbd">
        <SideMark team={team} size={compact ? "sm" : "md"} byCodeName={(t) => teamName(t, kit.byCode)} />
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
    <li className={cn("flex items-center gap-3", row, outcome === "loss" && "opacity-60")} data-testid="detail-side" data-team={team.code}>
      <TeamCrest teamKey={team.team_key} name={teamName(team, kit.byCode)} shortCode={team.code} size={compact ? "sm" : "md"} />
      <span className="min-w-0 flex-1">
        <button
          type="button"
          // A side is a registry team only when code and canonical key agree.
          disabled={!p || p.team_key !== team.team_key}
          onClick={() => x.selectTeam(team.code)}
          aria-label={`Open ${teamName(team, kit.byCode)} in Teams`}
          data-testid="detail-team-link"
          className={cn(
            "block text-base font-bold leading-tight underline decoration-transparent underline-offset-2 outline-none transition-colors hover:decoration-[#c9a84c] focus-visible:ring-2 focus-visible:ring-[#c9a84c]",
            outcome === "win" ? GOLD_TEXT : "text-foreground",
          )}
        >
          {team.code}
        </button>
        <span className="block text-xs leading-tight text-foreground/80">{teamName(team, kit.byCode)}</span>
        {meta && <span className="block text-[10.5px] uppercase leading-tight tracking-[0.1em] text-muted-foreground">{meta}</span>}
      </span>
      {p && p.team_key === team.team_key && (
        <Link
          to={proPlayProfileUrl("team", p.team_key)}
          aria-label={`${teamName(team, kit.byCode)} profile`}
          data-testid="detail-profile-link"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-[#e3c66f] focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {started && <span className={cn("font-extrabold tabular-nums", compact ? "text-2xl" : "text-3xl", outcome === "win" ? GOLD_TEXT : "text-foreground/85")} data-testid="detail-score">{team.game_wins}</span>}
    </li>
  );
}

function OnwardLine({ who, onward, settled, compact = false }: { who: "Winner" | "Loser"; onward: Onward | null; settled: boolean; compact?: boolean }) {
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
    <li className={cn("flex items-center justify-between gap-3", compact ? "py-1.5" : "py-2")} data-testid={`onward-${who.toLowerCase()}`} data-kind={onward.kind}>
      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground" data-testid="onward-label">{rowLabel(who, settled)}</span>
      <span className="text-sm">{body}</span>
    </li>
  );
}

/** "If they lose" until the result exists; "Loser" once it does. */
const rowLabel = (who: "Winner" | "Loser", settled: boolean) => (settled ? who : who === "Winner" ? "If they win" : "If they lose");

export function MatchDetail({ match, onClose }: { match: TournamentMatchV2; onClose?: () => void }) {
  const kit = useKit();
  const x = useExperience();
  const settled = match.state === "completed";
  const day = matchDay(match);
  const stage = stageOf(kit.ctx, match.stage);
  const name = kit.names.get(match.match_id);
  const ref = matchRef(match, kit.names);
  const centre = useMatchCentreLink(match);
  const href = centre.href;
  const onward = matchOnward(match, kit.state, kit.ctx);
  const swiss = swissMatchStakes(match, kit.state);
  const drawn = awaitingDraw(match) && match.teams.some((t) => t.slot?.kind === "draw");
  const when = localStart(match.scheduled_start);
  const until = match.state === "upcoming" ? countdown(match.scheduled_start, kit.now) : null;
  const sides = (compact: boolean) => (
    <ul className="divide-y divide-white/[0.06]" aria-label="Teams">
      {match.teams.map((t, i) => <Side key={i} team={t} match={match} compact={compact} />)}
    </ul>
  );
  const drawNote = drawn && <p className="text-xs text-muted-foreground" data-testid="detail-draw">Both teams are decided by the official draw.</p>;
  const whenWhere = (compact: boolean) => (
    <section className={compact ? "space-y-1" : "space-y-2"}>
      <Eyebrow tone="muted">When &amp; where</Eyebrow>
      <ul className={cn("text-sm", compact ? "space-y-1" : "space-y-1.5")}>
        <li className="flex flex-wrap items-center gap-x-2 tabular-nums text-foreground/90">
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
  );
  // Why there is no Match Centre button (when there isn't one): part of the
  // detail's content, so it compacts and divides with it.
  const note = <MatchCentreNote link={centre} />;
  const hasStakes = Boolean((onward && (onward.winner || onward.loser)) || swiss);
  const stakes = (compact: boolean) => (
    <>
      {onward && (onward.winner || onward.loser) && (
        <section className="space-y-1" data-testid="detail-onward">
          <Eyebrow tone="muted">What the result decides</Eyebrow>
          <ul className="divide-y divide-white/[0.06]">
            <OnwardLine who="Winner" onward={onward.winner} settled={settled} compact={compact} />
            <OnwardLine who="Loser" onward={onward.loser} settled={settled} compact={compact} />
          </ul>
        </section>
      )}
      {swiss && (
        <section className="space-y-1" data-testid="detail-swiss-stakes">
          <Eyebrow tone="muted">Played at {swiss.record}</Eyebrow>
          <ul className="divide-y divide-white/[0.06] text-sm">
            <li className={cn("flex justify-between", compact ? "py-1.5" : "py-2")}><span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{rowLabel("Winner", settled)}</span><span className={cn("font-semibold", swiss.winner === "advances" && GOLD_TEXT)}>{swiss.winner === "advances" ? "Advances" : `Moves to ${swiss.winner}`}</span></li>
            <li className={cn("flex justify-between", compact ? "py-1.5" : "py-2")}><span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{rowLabel("Loser", settled)}</span><span className="font-semibold text-foreground/75">{swiss.loser === "eliminated" ? "Eliminated" : `Drops to ${swiss.loser}`}</span></li>
          </ul>
        </section>
      )}
    </>
  );
  return (
    <article className="flex min-h-0 flex-1 flex-col" data-testid="match-detail" data-match-id={match.match_id} aria-labelledby="match-detail-title">
      <header className="flex shrink-0 items-start gap-3 border-b border-white/[0.07] px-5 pb-3.5 pt-4">
        <div className="min-w-0 flex-1">
          <Eyebrow>{[stage ? stageLabel(stage) : null, match.best_of ? `Bo${match.best_of}` : null].filter(Boolean).join(" · ")}</Eyebrow>
          <h3 id="match-detail-title" className="mt-2 text-xl font-bold leading-tight text-foreground">
            {ref && ref !== name ? ref : (name ?? "Match")}
          </h3>
          {ref && name && ref !== name && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{name}</p>}
        </div>
        <span className="mt-0.5 flex flex-col items-end gap-1.5">
          <MatchStateBadge state={match.state} size="sm" />
          {x.simulated && match.state !== "upcoming" && (
            <span
              data-testid="detail-simulated"
              className="inline-flex items-center gap-1 rounded border border-amber-400/50 px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200"
            >
              <FlaskConical className="h-2.5 w-2.5" aria-hidden="true" /> Simulated
            </span>
          )}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close match detail"
            data-testid="detail-close"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>
      {/* UX4: all at once where it fits, then tighter, then two views. */}
      {/* UX4: all at once where it fits, then tighter, then two views, then three. */}
      <FitCascade levels={hasStakes ? 4 : 3} watch={`${match.match_id}|${match.state}|${centre.state}`} className="flex min-h-0 flex-1 flex-col" testId="detail-body">
        {(level) =>
          level < 2 ? (
            <div className={cn("px-5", level === 0 ? "space-y-5 py-4" : "space-y-3 py-3")}>
              {sides(level === 1)}
              {drawNote}
              {whenWhere(level === 1)}
              {stakes(level === 1)}
              {note}
            </div>
          ) : level === 2 && hasStakes ? (
            <DetailViews
              views={[
                { key: "match", label: "Match", body: <>{sides(true)}{drawNote}{whenWhere(true)}{note}</> },
                { key: "stakes", label: "What it decides", body: stakes(true) },
              ]}
            />
          ) : (
            <DetailViews
              views={[
                { key: "teams", label: "Teams", body: <>{sides(true)}{drawNote}</> },
                { key: "when", label: "When", name: "When and where", body: <>{whenWhere(true)}{note}</> },
                ...(hasStakes ? [{ key: "stakes", label: "Decides", name: "What the result decides", body: stakes(true) }] : []),
              ]}
            />
          )
        }
      </FitCascade>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.07] px-5 py-3" data-testid="detail-footer" data-match-centre={centre.state}>
        {href && (
          <Link to={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-3.5 text-sm font-semibold text-[#14110a] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]" data-testid="detail-match-centre">
            Match centre <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        {x.loc.screen !== "stages" && stage && (
          <button
            type="button"
            onClick={() => x.go({ screen: "stages", stageKey: stage.key, matchId: match.match_id })}
            data-testid="detail-open-stage"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#c9a84c]/35 bg-[#c9a84c]/[0.06] px-3 text-xs font-semibold text-[#e3c66f] outline-none hover:bg-[#c9a84c]/[0.12] focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Show in {stageLabel(stage)}
          </button>
        )}
        {x.loc.screen !== "schedule" && day && (
          <button
            type="button"
            onClick={() => x.go({ screen: "schedule", day, matchId: match.match_id })}
            data-testid="detail-open-schedule"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#c9a84c]/35 bg-[#c9a84c]/[0.06] px-3 text-xs font-semibold text-[#e3c66f] outline-none hover:bg-[#c9a84c]/[0.12] focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Show in Schedule
          </button>
        )}
      </footer>
    </article>
  );
}

/** The detail as views (two, then three on the shortest columns) when it cannot be one. */
function DetailViews({ views }: { views: { key: string; label: string; name?: string; body: ReactNode }[] }) {
  const [chosen, setView] = useState(views[0].key);
  const view = views.find((v) => v.key === chosen) ?? views[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-5 py-3" data-testid="detail-views" data-views={views.length}>
      <ViewTabs label="Match detail views" value={view.key} onChange={setView} views={views.map((v) => ({ key: v.key, label: v.label, name: v.name }))} />
      <div role="tabpanel" aria-label={view.name ?? view.label} className="space-y-3" data-view={view.key}>
        {view.body}
      </div>
    </div>
  );
}

/** Why there is no Match Centre button for a fixture that would otherwise have one. */
function MatchCentreNote({ link }: { link: MatchCentreLink }) {
  if (link.href || link.state === "none") return null;
  const text =
    link.state === "checking"
      ? "Checking the Match Centre's schedule…"
      : link.state === "unavailable"
        ? "The Match Centre's schedule isn't answering right now."
        : "This fixture isn't in the Match Centre's upcoming list yet (it lists the next few matches). It can be opened there closer to the start.";
  return (
    <p className="w-full text-[11px] leading-snug text-muted-foreground" data-testid="match-centre-note" data-state={link.state}>
      {text}
    </p>
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
      <header className="shrink-0 border-b border-white/[0.07] px-5 pb-3.5 pt-4">
        <Eyebrow>{stageLabel(stage)} brief</Eyebrow>
        <p className="mt-2.5 text-sm text-foreground/85">
          {calendarDay(stage.starts)} – {calendarDay(stage.ends)} · {stage.venue}
        </p>
      </header>
      <FitCascade levels={2} watch={`${stage.key}|${recs.length}`} className="flex min-h-0 flex-1 flex-col">
        {(level) => (
      <div className={cn("px-5", level === 0 ? "space-y-5 py-4" : "space-y-3 py-3")}>
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
        {x.desktop && <p className="border-t border-white/[0.06] pt-3 text-[11px] text-muted-foreground">Select any match to see who plays, when, and what the result decides.</p>}
      </div>
        )}
      </FitCascade>
    </div>
  );
}
