/**
 * ROG1-D1 — the match: five positional battles (1 point each), then the
 * weighted team battle (2 points), 7 points total, first to 4.
 *
 * Every number on this screen is the backend's: power components, the
 * pre-roll probability (raw and clamped), each recorded roll and threshold,
 * re-roll claims and the final points. The page only stages them. A result
 * that arrives in this session is revealed battle by battle (skippable); a
 * resumed result, or reduced motion, shows everything at once.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import type { DynastySnapshot, PowerComponent } from "@/lib/dynasty/contracts";
import {
  RANKED_ROLE_OF, ROLE_LABEL, fixed, groupTeamComponents, matchView, pct, signed,
  type LaneView, type RollWindow, type TeamView,
} from "@/lib/dynasty/model";
import { Eyebrow, GOLD_TEXT, SURFACE } from "./parts";

const STEP_MS = 1100;
const LAST_STEP = 7; // 0 intro · 1-5 lanes · 6 team battle · 7 final

export function MatchStage({ snapshot, fresh, onNewRun, busy }: {
  snapshot: DynastySnapshot;
  fresh: boolean;
  onNewRun: () => void;
  busy: boolean;
}) {
  const view = useMemo(() => matchView(snapshot.match!), [snapshot.match]);
  const motion = useMotionAllowed();
  const animate = fresh && motion;
  const [step, setStep] = useState(animate ? 0 : LAST_STEP);
  const sfx = useSfx();
  const played = useRef(-1);

  useEffect(() => {
    if (!animate || step >= LAST_STEP) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [animate, step]);

  useEffect(() => {
    if (!fresh || played.current === step) return;
    played.current = step;
    if (step >= 1 && step <= 6 && animate) sfx.play("ranked.discovery.reveal");
    if (step === LAST_STEP) sfx.play(view.outcome === "won" ? "ranked.match.victory" : "ranked.match.defeat");
  }, [fresh, animate, step, sfx, view.outcome]);

  const lanesShown = Math.max(0, Math.min(5, step));
  const won = view.outcome === "won";
  // Points that have been revealed so far.
  const live = view.lanes.slice(0, lanesShown).reduce(
    (acc, l) => (l.youWon ? { ...acc, you: acc.you + 1 } : { ...acc, them: acc.them + 1 }), { you: 0, them: 0 });
  if (step >= 6) {
    if (view.team.youWon) live.you += 2; else live.them += 2;
  }

  return (
    <section aria-labelledby="match-heading" className="space-y-4" data-testid="dynasty-match" data-step={step}>
      <header className={cn(SURFACE, "relative overflow-hidden p-4 sm:p-5")}>
        <div aria-hidden className={cn(
          "pointer-events-none absolute inset-0 opacity-60",
          step >= LAST_STEP && (won
            ? "bg-[radial-gradient(ellipse_at_top,hsl(45_90%_55%/0.22),transparent_60%)]"
            : "bg-[radial-gradient(ellipse_at_top,hsl(0_70%_50%/0.16),transparent_60%)]"),
        )} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Match · first to 4 of 7</Eyebrow>
            <h2 id="match-heading" className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
              Your team <span className="text-white/40">vs</span> {view.opponentName}
            </h2>
            <p className="mt-1 text-[11.5px] text-white/50">{view.opponentLabel}{view.opponentRelics.length ? ` · relic: ${view.opponentRelics.join(", ")}` : ""}</p>
          </div>
          <Scoreboard you={live.you} them={live.them} final={step >= LAST_STEP} />
        </div>
        <PointLedger lanes={view.lanes} team={view.team} shownLanes={lanesShown} teamShown={step >= 6} />
        {animate && step < LAST_STEP ? (
          <button
            type="button"
            className="relative mt-3 text-[12px] font-semibold text-[#e3c66f] underline-offset-2 hover:underline"
            onClick={() => setStep(LAST_STEP)}
            data-testid="match-skip"
          >
            Skip to result
          </button>
        ) : null}
      </header>

      {step >= LAST_STEP ? <OutcomeBanner won={won} you={view.points.you} them={view.points.them} onNewRun={onNewRun} busy={busy} team={view.team} /> : null}

      <div className="space-y-2.5" aria-live="polite">
        {view.lanes.slice(0, lanesShown).map((lane) => <LaneCard key={lane.role} lane={lane} />)}
        {step >= 6 ? <TeamCard team={view.team} /> : null}
      </div>

      {view.rerollClaims.some((c) => c.status === "contested") ? (
        <p className="text-[12px] text-white/60">
          A contested re-roll claim was cancelled for both sides: {view.rerollClaims.filter((c) => c.status === "contested").map((c) => `${c.team_id} on ${c.role}`).join(", ")}.
        </p>
      ) : null}
      <p className="text-[11px] text-white/40" data-testid="match-provenance">
        Simulated by the backend ({view.ruleset}, {snapshot.pins.relic_table_version}, catalog {snapshot.catalog.id}). Not a historical result.
      </p>
    </section>
  );
}

function Scoreboard({ you, them, final }: { you: number; them: number; final: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="match-score" aria-label={`Score: you ${you}, opponent ${them}`}>
      <ScoreDigit value={you} label="You" lead={final && you > them} />
      <span className="text-xl font-bold text-white/30">–</span>
      <ScoreDigit value={them} label="Opp" lead={final && them > you} />
    </div>
  );
}

function ScoreDigit({ value, label, lead }: { value: number; label: string; lead: boolean }) {
  return (
    <div className="text-center">
      <p className={cn("text-[40px] font-black leading-none tabular-nums", lead ? GOLD_TEXT : "text-white")}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>
    </div>
  );
}

function PointLedger({ lanes, team, shownLanes, teamShown }: { lanes: LaneView[]; team: TeamView; shownLanes: number; teamShown: boolean }) {
  return (
    <ol className="relative mt-4 grid grid-cols-6 gap-1.5" aria-label="Battles">
      {lanes.map((l, i) => {
        const shown = i < shownLanes;
        return (
          <li key={l.role} className={cn(
            "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition-colors",
            !shown && "border-white/[0.06] bg-white/[0.02]",
            shown && l.youWon && "border-[#e3c66f]/50 bg-[#e3c66f]/10",
            shown && !l.youWon && "border-rose-400/40 bg-rose-500/10",
          )}>
            <RoleEmblem role={RANKED_ROLE_OF[l.role]} size="sm" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/70">{shown ? (l.youWon ? "Win" : "Loss") : "1 pt"}</span>
          </li>
        );
      })}
      <li className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5",
        !teamShown && "border-white/[0.06] bg-white/[0.02]",
        teamShown && team.youWon && "border-[#e3c66f]/50 bg-[#e3c66f]/10",
        teamShown && !team.youWon && "border-rose-400/40 bg-rose-500/10",
      )}>
        <Trophy className="h-3.5 w-3.5 text-[#e3c66f]" aria-label="Team battle" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/70">{teamShown ? (team.youWon ? "Win" : "Loss") : "2 pts"}</span>
      </li>
    </ol>
  );
}

function OutcomeBanner({ won, you, them, team, onNewRun, busy }: {
  won: boolean; you: number; them: number; team: TeamView; onNewRun: () => void; busy: boolean;
}) {
  const lanesYou = team.lanesWon.you;
  return (
    <section
      className={cn(SURFACE, "flex flex-col items-center gap-4 p-4 sm:flex-row sm:p-5", won ? "border-[#e3c66f]/40" : "border-rose-400/30")}
      data-testid="match-outcome"
      aria-label={won ? "Victory" : "Defeat"}
    >
      <MogzyMascot pose={won ? "cheering" : "defeated"} decorative scale="compact" className="h-28 w-20 shrink-0 object-contain" />
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className={cn("text-3xl font-black uppercase tracking-tight", won ? GOLD_TEXT : "text-rose-300")}>{won ? "Victory" : "Defeat"} {you}–{them}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-white/75">
          You took {lanesYou} of 5 lanes ({lanesYou} pt{lanesYou === 1 ? "" : "s"}) and {team.youWon ? "won" : "lost"} the team battle
          ({team.youWon ? "+2" : "0"}), where your chance was {pct(team.youChance, 1)}.
          {team.upset ? " The team battle was an upset." : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onNewRun}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
        data-testid="new-run"
      >
        <RotateCcw className="h-4 w-4" aria-hidden /> New run
      </button>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── battles

/** A 0→1 strip: the user's winning window in gold, the drawn roll as a tick. */
export function RollBar({ window: w, label }: { window: RollWindow; label: string }) {
  return (
    <div className="space-y-1">
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-rose-500/25"
        role="img"
        aria-label={`${label}: you win if the draw lands in ${w.userFrom.toFixed(3)}–${w.userTo.toFixed(3)}; the draw was ${w.roll.toFixed(3)}, so you ${w.userWon ? "won" : "lost"}.`}
        data-testid="roll-bar"
        data-user-won={w.userWon}
      >
        <span className="absolute inset-y-0 bg-[#e3c66f]/70" style={{ left: `${w.userFrom * 100}%`, width: `${(w.userTo - w.userFrom) * 100}%` }} />
        <span className="absolute -top-0.5 h-3.5 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" style={{ left: `${w.roll * 100}%` }} />
      </div>
      <p className="text-[10.5px] tabular-nums text-white/50">
        Draw {w.roll.toFixed(3)} · your window {w.userFrom.toFixed(3)}–{w.userTo.toFixed(3)}
      </p>
    </div>
  );
}

function Components({ title, items }: { title: string; items: PowerComponent[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((c, i) => (
          <li key={`${c.source}-${i}`} className="flex justify-between gap-3 text-[11.5px]">
            <span className="min-w-0 truncate text-white/70" title={c.source}>{c.label}</span>
            <span className={cn("shrink-0 tabular-nums", c.value < 0 ? "text-rose-300" : "text-white")}>{signed(c.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProbabilityLine({ chance, raw, clamped, difference, scale }: { chance: number; raw: number; clamped: boolean; difference: number; scale: number }) {
  return (
    <p className="text-[11.5px] leading-relaxed text-white/65">
      Power gap {signed(difference)} on a logistic scale of {fixed(scale, 0)} → your chance {pct(chance, 1)}
      {clamped ? <> (raw {pct(raw, 1)}, clamped by the ruleset)</> : null}.
    </p>
  );
}

function ResultChip({ won, upset, extra }: { won: boolean; upset: boolean; extra?: string }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
        won ? "bg-[#e3c66f] text-[#1a1406]" : "bg-rose-500/80 text-white")}>{won ? "Won" : "Lost"}</span>
      {upset ? <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-200">Upset</span> : null}
      {extra ? <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-200">{extra}</span> : null}
    </span>
  );
}

function LaneCard({ lane }: { lane: LaneView }) {
  const last = lane.history[lane.history.length - 1];
  return (
    <article className={cn(SURFACE, "p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2")} data-testid={`lane-${lane.role}`} data-won={lane.youWon}>
      <div className="flex items-center gap-2">
        <RoleEmblem role={RANKED_ROLE_OF[lane.role]} size="md" decorative />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">{ROLE_LABEL[lane.role]} · 1 pt</span>
        <span className="ml-auto"><ResultChip won={lane.youWon} upset={lane.upset} extra={lane.rerolled ? "Re-roll" : undefined} /></span>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold text-white">{lane.you.player}</p>
          <p className="text-[11px] leading-tight text-teal-200/80 [overflow-wrap:anywhere]">{lane.you.champion}</p>
        </div>
        <p className="text-center text-[12px] font-bold tabular-nums text-white/80">
          <span className={lane.youWon ? GOLD_TEXT : undefined}>{fixed(lane.you.power)}</span>
          <span className="mx-1 text-white/30">vs</span>
          <span className={!lane.youWon ? "text-rose-300" : undefined}>{fixed(lane.them.power)}</span>
        </p>
        <div className="min-w-0 text-right">
          <p className="truncate text-[13.5px] font-bold text-white/85">{lane.them.player}</p>
          <p className="text-[11px] leading-tight text-white/50 [overflow-wrap:anywhere]">{lane.them.champion}</p>
        </div>
      </div>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <RollBar window={last.window} label={`${ROLE_LABEL[lane.role]} lane`} />
        <p className="text-[12px] font-semibold tabular-nums text-white/80 sm:text-right">Your chance {pct(lane.youChance, 1)}</p>
      </div>
      <details className="group mt-2">
        <summary className="cursor-pointer text-[11.5px] font-semibold text-[#e3c66f] marker:text-[#e3c66f]/60">Why?</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Components title={`You · ${fixed(lane.you.power)}`} items={lane.you.components} />
          <Components title={`Opponent · ${fixed(lane.them.power)}`} items={lane.them.components} />
        </div>
        <div className="mt-2 space-y-1.5">
          <ProbabilityLine chance={lane.youChance} raw={lane.rawYouChance} clamped={lane.clamped} difference={lane.difference} scale={lane.scale} />
          {lane.history.map((h, i) => (
            <div key={i} className="rounded-lg bg-white/[0.03] p-2" data-testid="roll-record">
              <p className="mb-1 text-[11px] text-white/70">
                {h.stage === "initial" ? "Initial roll" : `Extra roll for ${h.claimed_by === "user" ? "you" : "the opponent"} (${h.source})`}
                {" → "}{h.window.userWon ? "you won" : "opponent won"}
                {h.stage === "reroll" ? ". Granted only because the initial roll was lost; it is an independent draw at the lane's own odds." : ""}
              </p>
              <RollBar window={h.window} label={h.stage === "initial" ? "Initial roll" : "Extra roll"} />
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

function TeamCard({ team }: { team: TeamView }) {
  const mine = groupTeamComponents(team.you.components);
  const theirs = groupTeamComponents(team.them.components);
  return (
    <article className={cn(SURFACE, "border-[#e3c66f]/25 p-3.5 motion-safe:animate-in motion-safe:fade-in")} data-testid="team-battle" data-won={team.youWon}>
      <div className="flex items-start gap-3">
        <Trophy className="h-7 w-7 shrink-0 text-[#e3c66f]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-white">Team battle · 2 points</p>
          <p className="text-[11.5px] text-white/55">Weighted lane power, momentum from lanes won ({team.lanesWon.you}–{team.lanesWon.them}) and synergy.</p>
        </div>
        <ResultChip won={team.youWon} upset={team.upset} />
      </div>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <RollBar window={team.window} label="Team battle" />
        <p className="text-[12px] font-semibold tabular-nums text-white/80 sm:text-right">
          {fixed(team.you.power)} vs {fixed(team.them.power)} · your chance {pct(team.youChance, 1)}
        </p>
      </div>
      <details className="mt-2" open>
        <summary className="cursor-pointer text-[11.5px] font-semibold text-[#e3c66f]">Strength breakdown</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {[{ who: "You", groups: mine, total: team.you.power }, { who: "Opponent", groups: theirs, total: team.them.power }].map((side) => (
            <div key={side.who} className="space-y-2">
              <p className="text-[12px] font-bold text-white">{side.who} · {fixed(side.total)}</p>
              {side.groups.map((g) => (
                <Components key={g.key} title={`${g.title} · ${signed(g.total)}`} items={g.items} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2">
          <ProbabilityLine chance={team.youChance} raw={team.rawYouChance} clamped={team.clamped} difference={team.difference} scale={team.scale} />
        </div>
      </details>
    </article>
  );
}
