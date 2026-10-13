/**
 * Screen 03 — Teams (UX2): the Worlds field as an explorer.
 *
 * DESKTOP: a compact selector (region filter + crest tiles) beside one large
 * focus workspace. With no team selected the focus is the field's shape: who
 * goes straight to Swiss by tier, who starts in the Play-In. With a team
 * selected it is that organization: identity (official name, code, region,
 * qualification, entry), its served standing, its way through the event
 * (verified steps vs what the format leaves open), its matches on the
 * official schedule, and its Worlds lineup only when certified, with the
 * canonical team profile one click away.
 *
 * PHONE: region chips and a crest grid; a team opens in a bottom sheet.
 *
 * URL: `?team=<code>` (a detail: opening pushes, switching replaces, closing
 * pops) and `?region=<region>` (a view setting: replaces).
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, Info, Trophy, X } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { PlayerPortrait, TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { localStart } from "@/lib/pro-play/hubSeries";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";
import type { TournamentMatchV2, TournamentParticipantV2 } from "@/lib/pro-play/tournamentApi";
import { ROLE_LABEL } from "@/lib/pro-play/tournamentView";
import { displayName, matchCaption, outcomeOf, scoreV2, slotLabel, stageOf, swissTiers, teamName } from "@/lib/pro-play/tournamentV2View";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import {
  certifiedLineup,
  participantByCode,
  regionOptions,
  teamMatches,
  teamPath,
  teamSeries,
  teamStatus,
  teamsInRegion,
  type PathStep,
  type TeamStatus,
} from "@/lib/pro-play/worldsExperience/teamsView";
import { cn } from "@/lib/utils";

import { BottomSheet } from "./Detail";
import { useExperience } from "./ExperienceContext";
import { DURATION, OFFSET, slideTransition } from "./motion";
import { Eyebrow, GOLD_TEXT, SURFACE, calendarDay, rovingKeys } from "./parts";

/* ── small pieces ───────────────────────────────────────────────────────── */

function EntryChip({ p, long = false }: { p: TournamentParticipantV2; long?: boolean }) {
  if (p.entry_stage === "play_in") {
    return (
      <span className="rounded border border-cyan-400/50 px-1 py-px text-[9.5px] font-bold uppercase tracking-[0.08em] text-cyan-200" data-testid="entry-chip">
        {long ? "Play-In" : "PI"}
      </span>
    );
  }
  if (p.entry_stage === "swiss") {
    return (
      <span className="rounded border border-[#c9a84c]/45 px-1 py-px text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#e3c66f]" data-testid="entry-chip">
        {long ? `Swiss${typeof p.swiss_tier === "number" ? ` · Tier ${p.swiss_tier}` : ""}` : typeof p.swiss_tier === "number" ? `T${p.swiss_tier}` : "SW"}
      </span>
    );
  }
  return null;
}

const STATUS_TONE: Record<TeamStatus["kind"], string> = {
  champion: "border-[#c9a84c]/70 bg-[#c9a84c]/15 text-[#f1dc9c]",
  advanced: "border-[#c9a84c]/50 bg-[#c9a84c]/[0.08] text-[#e3c66f]",
  knockout: "border-[#c9a84c]/50 bg-[#c9a84c]/[0.08] text-[#e3c66f]",
  won_play_in: "border-[#c9a84c]/50 bg-[#c9a84c]/[0.08] text-[#e3c66f]",
  placed: "border-[#c9a84c]/50 bg-[#c9a84c]/[0.08] text-[#e3c66f]",
  alive: "border-white/15 text-foreground/85",
  out: "border-white/10 text-muted-foreground",
};

function StatusPill({ status }: { status: TeamStatus }) {
  return (
    <span
      data-testid="team-status"
      data-kind={status.kind}
      className={cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-bold uppercase tracking-[0.1em]", STATUS_TONE[status.kind])}
    >
      {status.kind === "champion" && <Trophy className="h-3 w-3" aria-hidden="true" />}
      {status.label}
    </span>
  );
}

/* ── selector ───────────────────────────────────────────────────────────── */

function RegionFilter() {
  const { ctx } = useKit();
  const x = useExperience();
  const options = regionOptions(ctx);
  const active = x.loc.region && options.some((o) => o.region === x.loc.region) ? x.loc.region : null;
  const chips = [{ region: null as string | null, label: "All", count: ctx.participants.length }, ...options.map((o) => ({ region: o.region as string | null, label: o.region, count: o.count }))];
  return (
    <div className={cn(!x.desktop && "-mx-3 overflow-x-auto px-3 pb-1")} data-swipe-ignore>
      <div role="group" aria-label="Filter teams by region" className={cn("flex gap-1.5", !x.desktop && "w-max")} onKeyDown={rovingKeys} data-testid="region-filter">
        {chips.map((c) => {
          const on = active === c.region;
          return (
            <button
              key={c.label}
              type="button"
              data-roving
              aria-pressed={on}
              data-testid="region-chip"
              data-region={c.region ?? "all"}
              onClick={() => x.setRegion(c.region)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#c9a84c] lg:min-h-9",
                on ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.12] text-[#f1dc9c]" : "border-white/10 text-foreground/75 hover:border-white/20 hover:text-foreground",
              )}
            >
              {c.label}
              <span className="tabular-nums text-muted-foreground">{c.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeamTile({ p, wide }: { p: TournamentParticipantV2; wide: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const selected = x.loc.team === p.code;
  const status = teamStatus(p, kit.state, kit.ctx);
  const out = status?.kind === "out";
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-roving
      data-testid="team-tile"
      data-team={p.code}
      onClick={() => x.selectTeam(p.code)}
      title={status ? `${displayName(p)} · ${status.label}` : displayName(p)}
      className={cn(
        "group relative flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#c9a84c]",
        selected
          ? "border-[#c9a84c] bg-[#c9a84c]/[0.08] shadow-[0_0_0_1px_#c9a84c,0_10px_28px_-16px_rgba(201,168,76,0.8)]"
          : "border-white/[0.07] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.035]",
      )}
    >
      <span className={cn("shrink-0", out && "opacity-50 grayscale")}>
        <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("text-[13px] font-bold leading-tight", out ? "text-foreground/55" : "text-foreground")}>{p.code}</span>
          <EntryChip p={p} />
        </span>
        <span className={cn("block truncate text-[11px] leading-tight text-muted-foreground", !wide && "sr-only")}>{displayName(p)}</span>
      </span>
      {status && status.kind !== "alive" && (
        <span
          aria-label={status.label}
          className={cn("absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full", out ? "bg-white/25" : "bg-[#e3c66f]")}
        />
      )}
      {status?.kind === "alive" && wide && (
        <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-foreground/70" data-testid="tile-record">
          {status.label.split(" · ")[1]}
        </span>
      )}
    </button>
  );
}

function Selector() {
  const { ctx } = useKit();
  const x = useExperience();
  const region = x.loc.region && ctx.participants.some((p) => p.region === x.loc.region) ? x.loc.region : null;
  const groups = (region ? [region] : ctx.regions).map((r) => ({ region: r, teams: teamsInRegion(ctx, r) })).filter((g) => g.teams.length);
  const wide = Boolean(region) || !x.desktop;
  return (
    <div className="space-y-3" data-testid="team-selector" onKeyDown={rovingKeys}>
      {groups.map((g) => (
        <section key={g.region} aria-label={`${g.region} teams`} data-testid="selector-region" data-region={g.region}>
          <p className="mb-1.5 flex items-baseline justify-between text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#c9a84c]">
            {g.region}
            <span className="font-semibold tracking-[0.1em] text-muted-foreground">{g.teams.length}</span>
          </p>
          <div className={cn("grid gap-1.5", x.desktop ? (wide ? "grid-cols-2" : "grid-cols-3") : "grid-cols-2")}>
            {g.teams.map((p) => <TeamTile key={p.code} p={p} wide={wide} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── the field (nothing selected) ───────────────────────────────────────── */

function CrestButton({ p }: { p: TournamentParticipantV2 }) {
  const x = useExperience();
  return (
    <button
      type="button"
      onClick={() => x.selectTeam(p.code)}
      data-testid="field-team"
      data-team={p.code}
      className="group flex w-[84px] flex-col items-center gap-1.5 rounded-xl py-2 outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
    >
      <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="md" />
      <span className="text-xs font-bold text-foreground/90">{p.code}</span>
      <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{p.region}</span>
    </button>
  );
}

function FieldFocus() {
  const kit = useKit();
  const { ctx } = kit;
  const tiers = swissTiers(ctx);
  const playIn = ctx.participants.filter((p) => p.entry_stage === "play_in");
  const piStage = stageOf(ctx, "play_in");
  const swiss = stageOf(ctx, "swiss");
  return (
    <div className="flex h-full flex-col gap-5 p-6" data-testid="field-focus">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>The field</Eyebrow>
          <h2 className="mt-2 text-[28px] leading-tight">
            {ctx.participants.length} teams · {ctx.regions.length} regions
          </h2>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">Select a team to see its way through Worlds, its matches and where to read more.</p>
      </div>
      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {tiers.length > 0 && swiss && (
          <section className="rounded-2xl border border-[#c9a84c]/15 bg-[#c9a84c]/[0.025] p-4" aria-label="Straight to Swiss">
            <p className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c9a84c]">Straight to {stageLabel(swiss)}</span>
              <span className="text-xs text-muted-foreground">from {calendarDay(swiss.starts)} · {swiss.venue}</span>
            </p>
            <div className="mt-3 space-y-1">
              {tiers.map((t) => (
                <div key={t.tier} className="flex items-center gap-3" data-testid="field-tier" data-tier={t.tier}>
                  <span className="w-14 shrink-0 text-xs font-semibold text-foreground/70">Tier {t.tier}</span>
                  <div className="flex flex-wrap">{t.teams.map((p) => <CrestButton key={p.code} p={p} />)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {playIn.length > 0 && piStage && (
          <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.02] p-4" aria-label="Through the Play-In">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Through the {stageLabel(piStage)}</p>
            <p className="mt-1 text-xs text-muted-foreground">from {calendarDay(piStage.starts)} · {piStage.venue}</p>
            <div className="mt-3 grid grid-cols-2 justify-items-center">{playIn.map((p) => <CrestButton key={p.code} p={p} />)}</div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{piStage.format_note}</p>
          </section>
        )}
      </div>
    </div>
  );
}

/* ── the selected team ──────────────────────────────────────────────────── */

const PATH_DOT: Record<PathStep["state"], string> = {
  entered: "border-[#e3c66f] bg-[#c9a84c]/30",
  reached: "border-[#e3c66f] bg-[#c9a84c]/30",
  skipped: "border-white/15 bg-transparent",
  open: "border-dashed border-white/30 bg-transparent",
  closed: "border-white/10 bg-transparent",
};

function PathTrack({ steps }: { steps: PathStep[] }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} data-testid="team-path">
      {steps.map((s, i) => (
        <li key={s.stage.key} className="relative" data-testid="path-step" data-stage={s.stage.key} data-state={s.state} data-basis={s.basis}>
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-4 right-[-8px] top-[7px] h-px bg-white/10" />}
          <span className={cn("relative block h-[15px] w-[15px] rounded-full border-2", PATH_DOT[s.state])} aria-hidden="true">
            {s.outcome === "out" && <X className="absolute -left-[1px] -top-[1px] h-[13px] w-[13px] text-muted-foreground" />}
            {(s.outcome === "won" || s.outcome === "advanced" || s.outcome === "champion") && <Check className="absolute -left-[1px] -top-[1px] h-[13px] w-[13px] text-[#14110a]" />}
          </span>
          <p className={cn("mt-2 text-sm font-semibold", s.state === "skipped" || s.state === "closed" ? "text-foreground/45" : "text-foreground")}>{stageLabel(s.stage)}</p>
          <p className={cn("mt-0.5 text-xs leading-snug", s.basis === "structure" ? "italic text-muted-foreground/80" : "text-foreground/75")}>{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function TeamMatchRow({ m, p }: { m: TournamentMatchV2; p: TournamentParticipantV2 }) {
  const kit = useKit();
  const x = useExperience();
  const us = m.teams.find((t) => t.code === p.code)!;
  const them = m.teams.find((t) => t !== us)!;
  const result = outcomeOf(m, us);
  const score = scoreV2(m);
  const oppo = them.tbd || !them.code ? (slotLabel(them.slot, kit.byId, kit.names) ?? "TBD") : them.code;
  return (
    <li>
      <button
        type="button"
        onClick={() => x.selectMatch(m.match_id)}
        data-testid="team-match"
        data-match-id={m.match_id}
        data-state={m.state}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-[#c9a84c]/70"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">vs</span>
            {them.code && !them.tbd ? (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <TeamCrest teamKey={them.team_key} name={teamName(them, kit.byCode)} shortCode={them.code} size="xs" />
                {oppo}
              </span>
            ) : (
              <span className="truncate text-muted-foreground">{oppo}</span>
            )}
            {score && (
              <span className={cn("ml-1 font-bold tabular-nums", result === "win" ? GOLD_TEXT : "text-foreground/70")}>
                {us === m.teams[0] ? score : score.split("–").reverse().join("–")}
              </span>
            )}
            {result && <span className={cn("text-[10px] font-bold uppercase tracking-[0.12em]", result === "win" ? GOLD_TEXT : "text-muted-foreground")}>{result === "win" ? "Won" : "Lost"}</span>}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {localStart(m.scheduled_start)} · {matchCaption(m, kit)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {m.state !== "upcoming" && <MatchStateBadge state={m.state} size="sm" />}
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

function Lineup({ p }: { p: TournamentParticipantV2 }) {
  const kit = useKit();
  const lineup = certifiedLineup(p);
  const name = displayName(p);
  if (lineup) {
    return (
      <ul className="space-y-1.5" aria-label={`${name} Worlds lineup`} data-testid="lineup" data-certified="true">
        {lineup.map((slot) => (
          <li key={slot.role} className="flex min-h-9 items-center gap-2.5">
            <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{ROLE_LABEL[slot.role]}</span>
            <PlayerPortrait playerKey={slot.player_key} name={slot.handle} size="xs" />
            <Link to={proPlayProfileUrl("player", slot.player_key)} className="min-w-0 truncate text-sm font-medium text-foreground/90 hover:underline">
              {slot.handle}
            </Link>
            {slot.change && <span className="ml-auto shrink-0 rounded border border-cyan-400/40 px-1.5 py-0.5 text-[10px] text-cyan-200">{slot.change}</span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2.5" data-testid="lineup" data-certified="false">
      <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Mogzy hasn't certified a {kit.ctx.short_name} lineup for {name} yet. That's about what Mogzy has verified, not whether the team has registered its players.
        </span>
      </p>
      <Link
        to={proPlayProfileUrl("team", p.team_key)}
        data-testid="lineup-profile-link"
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#e3c66f] hover:underline"
      >
        Roster history on the team profile <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <p className="mb-2 flex items-baseline justify-between gap-3">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{children}</span>
      {aside}
    </p>
  );
}

function NoMatchesYet({ p }: { p: TournamentParticipantV2 }) {
  const { ctx } = useKit();
  const entry = stageOf(ctx, p.entry_stage);
  return (
    <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs leading-relaxed text-muted-foreground" data-testid="team-no-matches">
      No match is named for {p.code} on the official schedule yet.
      {entry ? ` ${stageLabel(entry)} pairings are published by the official draw; the stage starts ${calendarDay(entry.starts)}.` : ""}
    </p>
  );
}

export function TeamFocus({ p, onClose }: { p: TournamentParticipantV2; onClose?: () => void }) {
  const kit = useKit();
  const x = useExperience();
  const name = displayName(p);
  const status = teamStatus(p, kit.state, kit.ctx);
  const path = teamPath(p, kit.state, kit.ctx);
  const matches = teamMatches(kit.state, p);
  const series = teamSeries(kit.state, p);
  const compact = !x.desktop;
  const profile = (
    <Link
      to={proPlayProfileUrl("team", p.team_key)}
      data-testid="team-profile-link"
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-3.5 text-sm font-semibold text-[#14110a] shadow-[0_1px_0_#f6e7b3_inset] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Team profile <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
  return (
    <article className="flex h-full min-h-0 flex-col" data-testid="team-focus" data-team={p.code} aria-labelledby="team-focus-title">
      <header className={cn("relative overflow-hidden border-b border-white/[0.07]", compact ? "px-4 pb-4 pt-2" : "px-6 pb-5 pt-6")}>
        {!compact && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,hsl(42_70%_50%/0.12),transparent_65%)]" />}
        <div className="relative flex items-start gap-4">
          <TeamCrest teamKey={p.team_key} name={name} shortCode={p.code} size={compact ? "lg" : "xl"} />
          <div className="min-w-0 flex-1">
            <h2 id="team-focus-title" className={cn("!font-sans font-extrabold leading-tight tracking-tight text-foreground [text-shadow:none]", compact ? "text-xl" : "text-[30px]")}>
              {name}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-foreground/80" data-testid="team-identity">
              <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-bold tracking-[0.06em] text-foreground">{p.code}</span>
              <span className="font-semibold">{p.region}</span>
              {p.qualification && <span className="text-muted-foreground">Qualified as {p.qualification}</span>}
              <EntryChip p={p} long />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {status ? <StatusPill status={status} /> : <span className="text-xs text-muted-foreground" data-testid="team-status-none">No result yet</span>}
              {(series.won > 0 || series.lost > 0) && (
                <span className="text-xs tabular-nums text-muted-foreground" data-testid="team-series">
                  Series {series.won}–{series.lost}
                </span>
              )}
            </div>
          </div>
          {!compact && profile}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close team"
              data-testid="team-close"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {compact && <div className="relative mt-3">{profile}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", compact ? "space-y-5 px-4 py-4" : "grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-6 px-6 py-5")}>
        <div className="min-w-0 space-y-5">
          <section>
            <SectionTitle aside={<span className="text-[10.5px] italic text-muted-foreground/80">italic: still open</span>}>Way through Worlds</SectionTitle>
            <PathTrack steps={path} />
          </section>
          <section>
            <SectionTitle aside={<span className="text-[11px] tabular-nums text-muted-foreground">{matches.length}</span>}>Matches</SectionTitle>
            {matches.length ? <ul className="-mx-2" data-testid="team-matches">{matches.map((m) => <TeamMatchRow key={m.match_id} m={m} p={p} />)}</ul> : <NoMatchesYet p={p} />}
          </section>
        </div>
        <div className="min-w-0 space-y-5">
          <section>
            <SectionTitle>{kit.ctx.short_name} lineup</SectionTitle>
            <Lineup p={p} />
          </section>
          <RegionMates p={p} />
        </div>
      </div>
    </article>
  );
}

function RegionMates({ p }: { p: TournamentParticipantV2 }) {
  const { ctx } = useKit();
  const x = useExperience();
  const mates = ctx.participants.filter((q) => q.region === p.region && q.code !== p.code);
  if (!mates.length) return null;
  return (
    <section>
      <SectionTitle>Also from {p.region}</SectionTitle>
      <ul className="flex flex-wrap gap-1.5">
        {mates.map((q) => (
          <li key={q.code}>
            <button
              type="button"
              onClick={() => x.selectTeam(q.code)}
              data-testid="region-mate"
              data-team={q.code}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-xs font-semibold outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
            >
              <TeamCrest teamKey={q.team_key} name={displayName(q)} shortCode={q.code} size="xs" />
              {q.code}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

export function TeamsScreen() {
  const kit = useKit();
  const x = useExperience();
  const selected = participantByCode(kit.ctx, x.loc.team);
  if (!x.desktop) {
    return (
      <div className="space-y-4 px-3 pb-24 pt-3" data-testid="teams">
        <div>
          <Eyebrow>The field</Eyebrow>
          <p className="mt-1.5 text-sm text-foreground/85">
            {kit.ctx.participants.length} teams · {kit.ctx.regions.length} regions
          </p>
        </div>
        <RegionFilter />
        <Selector />
        <BottomSheet open={Boolean(selected)} onClose={() => x.selectTeam(null)} title={selected ? displayName(selected) : "Team"} testId="team-sheet">
          {selected && <TeamFocus p={selected} onClose={() => x.selectTeam(null)} />}
        </BottomSheet>
      </div>
    );
  }
  return (
    <div className="mx-auto flex h-full max-w-[1760px] flex-col gap-3 px-6 pb-5 pt-4" data-testid="teams">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RegionFilter />
        <p className="text-xs text-muted-foreground">
          {kit.ctx.participants.filter((p) => p.entry_stage === "swiss").length} straight to Swiss · {kit.ctx.participants.filter((p) => p.entry_stage === "play_in").length} in the Play-In
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,400px)_minmax(0,1fr)] gap-4">
        <section className={cn(SURFACE, "max-h-full min-h-0 self-start overflow-y-auto overscroll-contain p-4")} aria-label="Teams">
          <Selector />
        </section>
        <section className={cn(SURFACE, "relative min-h-0 overflow-hidden")} data-testid="team-workspace" data-mode={selected ? "team" : "field"}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={selected?.code ?? "field"}
              initial={x.reduced ? { opacity: 0 } : { opacity: 0, x: OFFSET.panel }}
              animate={{ opacity: 1, x: 0 }}
              exit={x.reduced ? { opacity: 0 } : { opacity: 0, x: -OFFSET.panel / 2 }}
              transition={slideTransition(DURATION.panel, x.reduced)}
              className="h-full"
            >
              {selected ? <TeamFocus p={selected} onClose={() => x.selectTeam(null)} /> : <FieldFocus />}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
