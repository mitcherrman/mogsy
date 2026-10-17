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
 * NO SCROLLING (UX4). All 19 teams are on the selector at once where they
 * fit (grouped by region, else one dense grid), else a page at a time with
 * the selected team's page shown. A team's matches page; where its detail
 * cannot be one view it is three — Overview · Matches · Lineup — each from
 * real served data, none a placeholder.
 *
 * URL: `?team=<code>` (a detail: opening pushes, switching replaces, closing
 * pops) and `?region=<region>` (a view setting: replaces).
 */
import { useState, type ReactNode } from "react";
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
import { FitCascade, FitPages, ViewTabs } from "./fit";
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
    <div
      role="group"
      aria-label="Filter teams by region"
      // A phone wraps the chips into a grid (no sideways strip); a desktop keeps one
      // row; a phone on its side has the width for one row of equal chips.
      className={cn("shrink-0 gap-1.5", x.desktop ? "flex flex-wrap" : x.landscape ? "grid" : "grid grid-cols-4")}
      style={x.landscape ? { gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` } : undefined}
      onKeyDown={rovingKeys}
      data-testid="region-filter"
    >
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
              "inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
              on ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.12] text-[#f1dc9c]" : "border-white/10 text-foreground/75 hover:border-white/20 hover:text-foreground",
            )}
          >
            {c.label}
            <span className="tabular-nums text-muted-foreground">{c.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function TeamTile({ p, wide, withRegion = false }: { p: TournamentParticipantV2; wide: boolean; withRegion?: boolean }) {
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
        "group relative flex h-12 w-full min-w-0 items-center gap-2.5 rounded-xl border px-2.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
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
        <span className={cn("block truncate text-[11px] leading-tight text-muted-foreground", !wide && !withRegion && "sr-only")}>
          {wide ? displayName(p) : withRegion ? p.region : displayName(p)}
          {withRegion && wide ? ` · ${p.region}` : ""}
        </span>
        {!wide && withRegion && <span className="sr-only">{displayName(p)}</span>}
      </span>
      {status && status.kind !== "alive" && (
        <span aria-label={status.label} className={cn("absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full", out ? "bg-white/25" : "bg-[#e3c66f]")} />
      )}
      {status?.kind === "alive" && wide && (
        <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-foreground/70" data-testid="tile-record">
          {status.label.split(" · ")[1]}
        </span>
      )}
    </button>
  );
}

/** A phone's tile: the crest and code, entry and standing as marks; the name in its label. */
function CrestTile({ p }: { p: TournamentParticipantV2 }) {
  const kit = useKit();
  const x = useExperience();
  const selected = x.loc.team === p.code;
  const status = teamStatus(p, kit.state, kit.ctx);
  const out = status?.kind === "out";
  const entry = p.entry_stage === "play_in" ? "Play-In entrant" : typeof p.swiss_tier === "number" ? `Swiss tier ${p.swiss_tier}` : "";
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-roving
      data-testid="team-tile"
      data-team={p.code}
      onClick={() => x.selectTeam(p.code)}
      aria-label={[displayName(p), p.region, entry, status?.label].filter(Boolean).join(", ")}
      className={cn(
        "relative flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border outline-none transition-[border-color,background-color] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
        selected ? "border-[#c9a84c] bg-[#c9a84c]/[0.08]" : "border-white/[0.07] bg-white/[0.015]",
      )}
    >
      <span className={cn(out && "opacity-50 grayscale")}>
        <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />
      </span>
      <span className={cn("text-[12px] font-bold leading-none", out ? "text-foreground/55" : "text-foreground")}>{p.code}</span>
      <span className="absolute right-1 top-1 scale-90"><EntryChip p={p} /></span>
      {status && status.kind !== "alive" && <span aria-hidden="true" className={cn("absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full", out ? "bg-white/25" : "bg-[#e3c66f]")} />}
    </button>
  );
}

/** The teams under the region filter, in registry order. */
function useShownTeams() {
  const { ctx } = useKit();
  const x = useExperience();
  const region = x.loc.region && ctx.participants.some((p) => p.region === x.loc.region) ? x.loc.region : null;
  return { region, teams: teamsInRegion(ctx, region) };
}

/** Every team at once, by region (the spacious selector). */
function GroupedSelector() {
  const { ctx } = useKit();
  const x = useExperience();
  const { region } = useShownTeams();
  const groups = (region ? [region] : ctx.regions).map((r) => ({ region: r, teams: teamsInRegion(ctx, r) })).filter((g) => g.teams.length);
  const wide = Boolean(region);
  return (
    <div className="space-y-2.5" data-testid="team-selector" data-layout="grouped" onKeyDown={rovingKeys}>
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

/** One grid of tiles, each saying its region; paged only if even that does not fit. */
function GridSelector({ cols, crest = false }: { cols: string; crest?: boolean }) {
  const x = useExperience();
  const { region, teams } = useShownTeams();
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="team-selector" data-layout="grid" onKeyDown={rovingKeys}>
      <FitPages
        items={teams}
        keyOf={(p) => p.code}
        noun="Teams"
        focusKey={x.loc.team}
        resetKey={region}
        onPage={(shown) => {
          if (x.loc.team && !shown.some((p) => p.code === x.loc.team)) x.selectTeam(null);
        }}
        testId="team-pages"
        className="min-h-[48px]"
        listClassName={cn("grid gap-1.5", cols)}
        render={(p) => (crest ? <CrestTile p={p} /> : <TeamTile p={p} wide={Boolean(region) && x.desktop} withRegion={!region} />)}
      />
    </div>
  );
}

/* ── the field (nothing selected) ───────────────────────────────────────── */

function CrestButton({ p, tight, chip = false }: { p: TournamentParticipantV2; tight: boolean; chip?: boolean }) {
  const x = useExperience();
  if (chip) {
    return (
      <button
        type="button"
        onClick={() => x.selectTeam(p.code)}
        data-testid="field-team"
        data-team={p.code}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2 text-xs font-bold text-foreground/90 outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
      >
        <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="xs" />
        {p.code}
        <span className="sr-only">{p.region}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => x.selectTeam(p.code)}
      data-testid="field-team"
      data-team={p.code}
      className={cn(
        "group flex flex-col items-center rounded-xl outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
        tight ? "w-[68px] gap-1 py-1" : "w-[84px] gap-1.5 py-2",
      )}
    >
      <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size={tight ? "sm" : "md"} />
      <span className="text-xs font-bold text-foreground/90">{p.code}</span>
      <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{p.region}</span>
    </button>
  );
}

function FieldFocus({ level }: { level: number }) {
  const tight = level > 0;
  const chip = level > 1;
  // The tightest level keeps every team and fact; only the "select a team" hint goes.
  const hint = level < 3;
  const kit = useKit();
  const { ctx } = kit;
  const tiers = swissTiers(ctx);
  const playIn = ctx.participants.filter((p) => p.entry_stage === "play_in");
  const piStage = stageOf(ctx, "play_in");
  const swiss = stageOf(ctx, "swiss");
  return (
    <div className={cn("flex h-full flex-col", tight ? "gap-3 p-4" : "gap-5 p-6")} data-testid="field-focus">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>The field</Eyebrow>
          <h2 className={cn("mt-2 leading-tight", tight ? "text-[22px]" : "text-[28px]")}>
            {ctx.participants.length} teams · {ctx.regions.length} regions
          </h2>
        </div>
        {hint && <p className="max-w-md text-sm text-muted-foreground">Select a team to see its way through Worlds, its matches and where to read more.</p>}
      </div>
      <div className={cn("grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]", tight ? "gap-3" : "gap-5")}>
        {tiers.length > 0 && swiss && (
          <section className={cn("rounded-2xl border border-[#c9a84c]/15 bg-[#c9a84c]/[0.025]", tight ? "p-3" : "p-4")} aria-label="Straight to Swiss">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#c9a84c]">Straight to {stageLabel(swiss)}</span>
              <span className="text-xs text-muted-foreground">from {calendarDay(swiss.starts)} · {swiss.venue}</span>
            </p>
            <div className={cn(tight ? "mt-2 space-y-0.5" : "mt-3 space-y-1")}>
              {tiers.map((t) => (
                <div key={t.tier} className="flex items-center gap-3" data-testid="field-tier" data-tier={t.tier}>
                  <span className="w-14 shrink-0 text-xs font-semibold text-foreground/70">Tier {t.tier}</span>
                  <div className={cn("flex flex-wrap", chip && "gap-1.5 py-0.5")}>{t.teams.map((p) => <CrestButton key={p.code} p={p} tight={tight} chip={chip} />)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {playIn.length > 0 && piStage && (
          <section className={cn("rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.02]", tight ? "p-3" : "p-4")} aria-label="Through the Play-In">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Through the {stageLabel(piStage)}</p>
            <p className="mt-1 text-xs text-muted-foreground">from {calendarDay(piStage.starts)} · {piStage.venue}</p>
            <div className={cn("grid grid-cols-2", chip ? "mt-2 justify-items-start gap-1.5" : "justify-items-center", !chip && (tight ? "mt-2" : "mt-3"))}>{playIn.map((p) => <CrestButton key={p.code} p={p} tight={tight} chip={chip} />)}</div>
            <p className={cn("text-xs leading-relaxed text-muted-foreground", tight ? "mt-2" : "mt-3")}>{piStage.format_note}</p>
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
    <button
      type="button"
      onClick={() => x.selectMatch(m.match_id)}
      data-testid="team-match"
      data-match-id={m.match_id}
      data-state={m.state}
      className="grid min-h-[52px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c9a84c]/70"
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
    <div className="space-y-2" data-testid="lineup" data-certified="false">
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
    <p className="mb-1.5 flex shrink-0 items-baseline justify-between gap-3">
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

function TeamMatches({ p }: { p: TournamentParticipantV2 }) {
  const kit = useKit();
  const matches = teamMatches(kit.state, p);
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <SectionTitle aside={<span className="text-[11px] tabular-nums text-muted-foreground">{matches.length}</span>}>Matches</SectionTitle>
      {matches.length ? (
        <div className="-mx-2 flex min-h-[104px] flex-1 flex-col" data-testid="team-matches">
          <FitPages items={matches} keyOf={(m) => m.match_id} noun="Matches" resetKey={p.code} className="min-h-[52px]" listClassName="grid" render={(m) => <TeamMatchRow m={m} p={p} />} />
        </div>
      ) : (
        <NoMatchesYet p={p} />
      )}
    </section>
  );
}

function TeamPath({ p }: { p: TournamentParticipantV2 }) {
  const kit = useKit();
  return (
    <section className="shrink-0">
      <SectionTitle aside={<span className="text-[10.5px] italic text-muted-foreground/80">italic: still open</span>}>Way through Worlds</SectionTitle>
      <PathTrack steps={teamPath(p, kit.state, kit.ctx)} />
    </section>
  );
}

function TeamLineup({ p }: { p: TournamentParticipantV2 }) {
  const kit = useKit();
  return (
    <section>
      <SectionTitle>{kit.ctx.short_name} lineup</SectionTitle>
      <Lineup p={p} />
    </section>
  );
}

type TeamView = "overview" | "matches" | "lineup";

/** The team in three views, for a box that cannot hold it as one. */
function TeamViews({ p }: { p: TournamentParticipantV2 }) {
  const kit = useKit();
  const [view, setView] = useState<TeamView>("overview");
  const count = teamMatches(kit.state, p).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="team-views" data-view={view}>
      <ViewTabs
        label={`${displayName(p)} views`}
        testId="team-view-tabs"
        value={view}
        onChange={setView}
        views={[
          { key: "overview", label: "Overview" },
          { key: "matches", label: "Matches", count },
          { key: "lineup", label: "Lineup" },
        ]}
      />
      <div role="tabpanel" aria-label={view} className="flex min-h-0 flex-1 flex-col gap-4">
        {view === "overview" ? (
          <>
            <TeamPath p={p} />
            <RegionMates p={p} />
          </>
        ) : view === "matches" ? (
          <TeamMatches p={p} />
        ) : (
          <TeamLineup p={p} />
        )}
      </div>
    </div>
  );
}

export function TeamFocus({ p, onClose }: { p: TournamentParticipantV2; onClose?: () => void }) {
  const kit = useKit();
  const x = useExperience();
  const name = displayName(p);
  const status = teamStatus(p, kit.state, kit.ctx);
  const series = teamSeries(kit.state, p);
  const compact = !x.desktop;
  const sideways = x.landscape;
  const profile = (
    <Link
      to={proPlayProfileUrl("team", p.team_key)}
      data-testid="team-profile-link"
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-3.5 text-sm font-semibold text-[#14110a] shadow-[0_1px_0_#f6e7b3_inset] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Team profile <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
  if (sideways) {
    // A phone on its side: who the team is in a column beside its views.
    return (
      <article className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" data-testid="team-focus" data-team={p.code} data-layout="landscape" aria-labelledby="team-focus-title">
        <header className="flex min-h-0 min-w-0 flex-col gap-2 border-r border-white/[0.07] px-4 pb-3 pt-1">
          <div className="flex items-start justify-between gap-2">
            <TeamCrest teamKey={p.team_key} name={name} shortCode={p.code} size="md" />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close team"
                data-testid="team-close"
                className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <h2 id="team-focus-title" className="!font-sans text-lg font-extrabold leading-tight tracking-tight text-foreground [text-shadow:none]">
            {name}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground/80" data-testid="team-identity">
            <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-bold tracking-[0.06em] text-foreground">{p.code}</span>
            <span className="font-semibold">{p.region}</span>
            {p.qualification && <span className="text-muted-foreground">Qualified as {p.qualification}</span>}
            <EntryChip p={p} long />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {status ? <StatusPill status={status} /> : <span className="text-xs text-muted-foreground" data-testid="team-status-none">No result yet</span>}
            {(series.won > 0 || series.lost > 0) && (
              <span className="text-xs tabular-nums text-muted-foreground" data-testid="team-series">
                Series {series.won}–{series.lost}
              </span>
            )}
          </div>
          <div className="mt-auto flex">{profile}</div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-col px-4 pb-3 pt-1">
          <TeamViews p={p} />
        </div>
      </article>
    );
  }
  return (
    <article className="flex min-h-0 flex-1 flex-col" data-testid="team-focus" data-team={p.code} aria-labelledby="team-focus-title">
      <header className={cn("relative shrink-0 overflow-clip border-b border-white/[0.07]", compact ? "px-4 pb-3 pt-1.5" : "px-6 pb-4 pt-5")}>
        {!compact && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,hsl(42_70%_50%/0.12),transparent_65%)]" />}
        <div className="relative flex items-start gap-4">
          <TeamCrest teamKey={p.team_key} name={name} shortCode={p.code} size={compact ? "md" : "xl"} />
          <div className="min-w-0 flex-1">
            <h2 id="team-focus-title" className={cn("!font-sans font-extrabold leading-tight tracking-tight text-foreground [text-shadow:none]", compact ? "text-xl" : "text-[30px]")}>
              {name}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground/80" data-testid="team-identity">
              <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-bold tracking-[0.06em] text-foreground">{p.code}</span>
              <span className="font-semibold">{p.region}</span>
              {p.qualification && <span className="text-muted-foreground">Qualified as {p.qualification}</span>}
              <EntryChip p={p} long />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status ? <StatusPill status={status} /> : <span className="text-xs text-muted-foreground" data-testid="team-status-none">No result yet</span>}
              {(series.won > 0 || series.lost > 0) && (
                <span className="text-xs tabular-nums text-muted-foreground" data-testid="team-series">
                  Series {series.won}–{series.lost}
                </span>
              )}
              {compact && profile}
            </div>
          </div>
          {!compact && profile}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close team"
              data-testid="team-close"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      {compact ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <TeamViews p={p} />
        </div>
      ) : (
        <FitCascade levels={2} watch={p.code} className="flex min-h-0 flex-1 flex-col" testId="team-body">
          {(level) =>
            level === 0 ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-6 px-6 py-4">
                <div className="flex min-h-0 min-w-0 flex-col gap-4">
                  <TeamPath p={p} />
                  <TeamMatches p={p} />
                </div>
                <div className="min-w-0 space-y-4">
                  <TeamLineup p={p} />
                  <RegionMates p={p} />
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col px-6 py-3">
                <TeamViews p={p} />
              </div>
            )
          }
        </FitCascade>
      )}
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
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-xs font-semibold outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
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
  const { region } = useShownTeams();
  const direct = kit.ctx.participants.filter((p) => p.entry_stage === "swiss").length;
  const playIn = kit.ctx.participants.filter((p) => p.entry_stage === "play_in").length;
  if (x.landscape) {
    // A phone on its side: the region chips in one row, the crests in wide rows beneath.
    return (
      <div className="flex h-full flex-col gap-2 px-3 py-2" data-testid="teams" data-layout="landscape">
        <RegionFilter />
        <section className="flex min-h-0 flex-1 flex-col" aria-label={`Teams: ${kit.ctx.participants.length} teams from ${kit.ctx.regions.length} regions`}>
          <GridSelector cols="grid-cols-10" crest />
        </section>
        <BottomSheet open={Boolean(selected)} onClose={() => x.selectTeam(null)} title={selected ? displayName(selected) : "Team"} testId="team-sheet" fill>
          {selected && <TeamFocus p={selected} onClose={() => x.selectTeam(null)} />}
        </BottomSheet>
      </div>
    );
  }
  if (!x.desktop) {
    return (
      <div className="flex h-full flex-col gap-2.5 px-3 py-3" data-testid="teams">
        <p className="flex shrink-0 items-baseline justify-between gap-2">
          <Eyebrow>The field</Eyebrow>
          <span className="text-xs text-foreground/85">
            {kit.ctx.participants.length} teams · {kit.ctx.regions.length} regions
          </span>
        </p>
        <RegionFilter />
        <section className="flex min-h-0 flex-1 flex-col" aria-label="Teams">
          <GridSelector cols="grid-cols-4 sm:grid-cols-5" crest />
        </section>
        <BottomSheet open={Boolean(selected)} onClose={() => x.selectTeam(null)} title={selected ? displayName(selected) : "Team"} testId="team-sheet" fill>
          {selected && <TeamFocus p={selected} onClose={() => x.selectTeam(null)} />}
        </BottomSheet>
      </div>
    );
  }
  return (
    <div className="mx-auto flex h-full max-w-[1760px] flex-col gap-3 px-6 pb-5 pt-4" data-testid="teams">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <RegionFilter />
        <p className="text-xs text-muted-foreground">
          {direct} straight to Swiss · {playIn} in the Play-In
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-4">
        <section className={cn(SURFACE, "min-h-0 overflow-clip p-3")} aria-label="Teams">
          <FitCascade levels={2} watch={`${region}|${x.loc.team ?? ""}`} className="h-full">
            {(level) => (level === 0 ? <GroupedSelector /> : <GridSelector cols={region ? "grid-cols-2" : "grid-cols-3"} />)}
          </FitCascade>
        </section>
        <section className={cn(SURFACE, "relative flex min-h-0 flex-col overflow-clip")} data-testid="team-workspace" data-mode={selected ? "team" : "field"}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={selected?.code ?? "field"}
              initial={x.reduced ? { opacity: 0 } : { opacity: 0, x: OFFSET.panel }}
              animate={{ opacity: 1, x: 0 }}
              exit={x.reduced ? { opacity: 0 } : { opacity: 0, x: -OFFSET.panel / 2 }}
              transition={slideTransition(DURATION.panel, x.reduced)}
              className="flex h-full flex-col"
            >
              {selected ? (
                <TeamFocus p={selected} onClose={() => x.selectTeam(null)} />
              ) : (
                <FitCascade levels={4} watch="field" className="h-full">
                  {(level) => <FieldFocus level={level} />}
                </FitCascade>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
