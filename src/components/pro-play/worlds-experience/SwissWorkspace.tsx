/**
 * The Swiss workspace (UX1): Swiss as Swiss, not as a bracket.
 *
 * THE POOL MAP. Seeding on the left (the certified tiers, the Play-In's place
 * unresolved until served), then one column per round holding its record
 * pools — 0–0, then 1–0 / 0–1, … — and the outcomes on the right (3–0, 3–1,
 * 3–2 through; 0–3, 1–3, 2–3 out). The pools are the arithmetic of the served
 * format (`swissPoolMap`), drawn only when they reproduce upstream's round
 * sizes. Teams appear on a pool or an outcome only from the backend's records
 * (no 0–0 table before a result; advanced / eliminated exactly as served).
 *
 * THE ROUND. A round column is selectable; under the map, that round's
 * pairings from upstream (or one line while the draw is unpublished). A
 * pairing opens in the side panel.
 *
 * Without standings (no rounds) or with a format the map cannot reproduce,
 * the published page's Swiss stage is shown instead.
 *
 * STRUCTURE vs VERIFIED (UX2). A pool's size is written as "places" (the
 * format's arithmetic); crests on it are teams on that record from verified
 * results. The map says which is which.
 *
 * PHONE (UX2): the round's fixtures first, then the served records (or the
 * seeding before a result); the progression map stays one tap away as
 * "Explore the format".
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { SwissStage } from "@/components/pro-play/tournament/TournamentSwiss";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { SwissRecordV2, TournamentMatchV2 } from "@/lib/pro-play/tournamentApi";
import { dayLabel, localDayKey } from "@/lib/pro-play/tournamentView";
import {
  bothTbd,
  displayName,
  focusRound,
  formats,
  outcomeOf,
  playInSwissSlot,
  scoreV2,
  stageMatches,
  stageOf,
  swissRounds,
  swissTiers,
  teamName,
  type SwissRound,
} from "@/lib/pro-play/tournamentV2View";
import {
  outcomeId,
  poolId,
  stageTeams,
  swissOccupancy,
  swissPoolMap,
  type SwissPool,
  type SwissPoolMap,
} from "@/lib/pro-play/worldsExperience/experienceView";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { GOLD_TEXT, compactDays } from "./parts";

/* ── measured links between map nodes ──────────────────────────────────── */

function MapLinks({ edges, active, version }: { edges: SwissPoolMap["edges"] | { from: string; to: string; kind: "win" | "loss" | "seed" }[]; active: Set<string>; version: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ d: string; kind: string; on: boolean }[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = anchor.current?.parentElement;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const out: { d: string; kind: string; on: boolean }[] = [];
      if (b.width > 0) {
        for (const e of edges) {
          const s = el.querySelector<HTMLElement>(`[data-node="${e.from}"]`);
          const t = el.querySelector<HTMLElement>(`[data-node="${e.to}"]`);
          if (!s || !t) continue;
          const a = s.getBoundingClientRect();
          const c = t.getBoundingClientRect();
          const sx = a.right - b.left;
          const sy = a.top + a.height / 2 - b.top;
          const tx = c.left - b.left;
          const ty = c.top + c.height / 2 - b.top;
          if (tx - sx < 8) continue;
          const k = (tx - sx) * 0.5;
          out.push({ d: `M${sx} ${sy}C${sx + k} ${sy} ${tx - k} ${ty} ${tx} ${ty}`, kind: e.kind, on: active.has(e.from) });
        }
      }
      setBox((p) => (p.w === b.width && p.h === b.height ? p : { w: b.width, h: b.height }));
      setDrawn((p) => (JSON.stringify(p) === JSON.stringify(out) ? p : out));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [edges, active, version]);
  return (
    <div ref={anchor} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-0">
      {drawn.length > 0 && (
        <svg width={box.w} height={box.h} className="block" data-testid="swiss-links">
          {drawn.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              strokeWidth={p.on ? 1.6 : 1.1}
              strokeDasharray={p.kind === "loss" ? "3 4" : undefined}
              className={cn(
                "transition-[stroke] duration-200",
                p.kind === "loss" ? (p.on ? "stroke-white/45" : "stroke-white/[0.13]") : p.on ? "stroke-[#e3c66f]/80" : "stroke-[#c9a84c]/25",
              )}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

/* ── nodes ──────────────────────────────────────────────────────────────── */

function Crests({ codes, max = 8 }: { codes: string[]; max?: number }) {
  const { byCode } = useKit();
  if (!codes.length) return null;
  return (
    <ul className="mt-1.5 grid grid-cols-4 gap-1" data-testid="node-teams">
      {codes.slice(0, max).map((c) => {
        const p = byCode.get(c);
        return (
          <li key={c} title={p ? displayName(p) : c} data-team={c} className="flex">
            <TeamCrest teamKey={p?.team_key} name={p ? displayName(p) : c} shortCode={c} size="xs" />
          </li>
        );
      })}
    </ul>
  );
}

function PoolNode({ pool, occupants, selected }: { pool: SwissPool; occupants: string[]; selected: boolean }) {
  const diff = pool.wins - pool.losses;
  return (
    <div
      data-node={poolId(pool.wins, pool.losses)}
      data-testid="swiss-pool"
      data-record={`${pool.wins}-${pool.losses}`}
      className={cn(
        "relative z-[1] rounded-xl border px-2.5 py-2 transition-colors duration-200",
        diff > 0 ? "border-[#c9a84c]/25 bg-[hsl(40_35%_11%)]" : diff < 0 ? "border-white/[0.08] bg-[hsl(215_35%_9%)]" : "border-white/[0.12] bg-[hsl(214_45%_10%)]",
        selected && "border-[#c9a84c]/60",
      )}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className={cn("whitespace-nowrap text-[15px] font-bold tabular-nums leading-none", diff > 0 ? GOLD_TEXT : "text-foreground")}>
          {pool.wins}–{pool.losses}
        </span>
        <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground" data-basis="structure" title="Places in the format">{pool.teams} places</span>
      </p>
      <Crests codes={occupants} />
    </div>
  );
}

function OutcomeNode({ wins, losses, teams, result, occupants }: { wins: number; losses: number; teams: number; result: "advanced" | "eliminated"; occupants: string[] }) {
  return (
    <div
      data-node={outcomeId(wins, losses)}
      data-testid="swiss-outcome"
      data-result={result}
      data-record={`${wins}-${losses}`}
      className={cn(
        "relative z-[1] rounded-lg border px-2.5 py-1.5",
        result === "advanced" ? "border-[#c9a84c]/40 bg-[#c9a84c]/[0.07]" : "border-white/[0.07] bg-white/[0.015]",
      )}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className={cn("whitespace-nowrap text-[13px] font-bold tabular-nums", result === "advanced" ? GOLD_TEXT : "text-foreground/60")}>
          {wins}–{losses}
        </span>
        <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground" data-basis="structure" title="Teams on this record / places in the format">{occupants.length ? `${occupants.length}/${teams}` : `${teams} places`}</span>
      </p>
      <Crests codes={occupants} />
    </div>
  );
}

function SeedColumn() {
  const kit = useKit();
  const tiers = swissTiers(kit.ctx);
  const slot = playInSwissSlot(kit.ctx, kit.state);
  const slotTeam = slot.code ? kit.byCode.get(slot.code) : null;
  const playIn = stageOf(kit.ctx, "play_in");
  const lastTier = tiers[tiers.length - 1]?.tier;
  return (
    <div className="flex flex-col justify-center gap-2" data-testid="swiss-seeds">
      {tiers.map((t) => (
        <div key={t.tier} data-node={`tier-${t.tier}`} data-testid="swiss-tier" data-tier={t.tier} className="relative z-[1] rounded-xl border border-white/[0.08] bg-[hsl(214_45%_9%)] px-2.5 py-2">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#c9a84c]">Tier {t.tier}</p>
          <ul className="mt-1.5 grid grid-cols-4 gap-1">
            {t.teams.map((p) => (
              <li key={p.code} title={displayName(p)} data-team={p.code} className="flex">
                <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="xs" />
              </li>
            ))}
            {playIn && t.tier === lastTier && (
              <li className="flex" data-testid="seed-play-in-slot" data-state={slot.basis} title={slotTeam ? `${slotTeam.code} (from the Play-In)` : "The Play-In winner's place"}>
                {slotTeam ? (
                  <TeamCrest teamKey={slotTeam.team_key} name={displayName(slotTeam)} shortCode={slotTeam.code} size="xs" />
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-dashed border-[#c9a84c]/50 text-[9px] font-bold text-[#c9a84c]">PI</span>
                )}
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ── the round under the map ────────────────────────────────────────────── */

function PairingButton({ match }: { match: TournamentMatchV2 }) {
  const kit = useKit();
  const x = useExperience();
  const selected = x.loc.matchId === match.match_id;
  const score = scoreV2(match);
  const side = (i: 0 | 1) => {
    const t = match.teams[i];
    if (t.tbd || !t.code) return <span className="text-muted-foreground">TBD</span>;
    const o = outcomeOf(match, t);
    return (
      <span className={cn("inline-flex items-center gap-1.5 font-semibold", o === "loss" && "opacity-55", o === "win" && GOLD_TEXT, i === 1 && "flex-row-reverse")}>
        <TeamCrest teamKey={t.team_key} name={teamName(t, kit.byCode)} shortCode={t.code} size="xs" />
        {t.code}
      </span>
    );
  };
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => x.selectMatch(match.match_id)}
      data-testid="swiss-pairing"
      data-match-id={match.match_id}
      data-state={match.state}
      className={cn(
        "flex min-h-11 w-full flex-col gap-1.5 rounded-xl border px-3 py-2 text-left outline-none transition-[border-color,box-shadow,background-color] duration-200 focus-visible:ring-2 focus-visible:ring-[#c9a84c]",
        match.state === "live" ? "border-emerald-500/50" : "border-white/[0.08] hover:border-white/20",
        selected && "border-[#c9a84c] shadow-[0_0_0_1px_#c9a84c]",
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[10.5px] tabular-nums text-muted-foreground">
        <span className="truncate whitespace-nowrap">{localStart(match.scheduled_start)?.split(" · ")[1]}{match.best_of ? ` · Bo${match.best_of}` : ""}</span>
        {match.state !== "upcoming" && <MatchStateBadge state={match.state} size="sm" />}
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
        {side(0)}
        <span className="text-xs tabular-nums text-muted-foreground">{score ?? "v"}</span>
        <span className="flex justify-end">{side(1)}</span>
      </span>
    </button>
  );
}

function roundDays(matches: readonly TournamentMatchV2[]) {
  const days = [...new Set(matches.map((m) => localDayKey(m.scheduled_start)).filter((d): d is string => Boolean(d)))].sort();
  if (!days.length) return "";
  return days.length === 1 ? dayLabel(days[0]) : `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`;
}

function RoundPairings({ round }: { round: SwissRound }) {
  const x = useExperience();
  const unpaired = round.matches.every(bothTbd);
  return (
    <section className="space-y-2.5" data-testid="swiss-round" data-round={round.round} aria-labelledby={`round-${round.round}-title`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={`round-${round.round}-title`} className="text-sm font-semibold text-foreground">Round {round.round}</h3>
        <span className="text-xs text-muted-foreground">
          {round.matches.length} matches · {formats(round.matches)} · {roundDays(round.matches)}
        </span>
      </div>
      {unpaired ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-xs text-muted-foreground" data-testid="swiss-round-unpaired">
          Pairings are published by the official draw{round.round > 1 ? " once the previous round is played" : ""}. First match{" "}
          <span className="tabular-nums text-foreground/85">{localStart(round.matches[0].scheduled_start)}</span>.
        </p>
      ) : (
        <div className={cn("grid gap-2", x.desktop ? "grid-cols-4" : "grid-cols-1")}>
          {round.matches.map((m) => <PairingButton key={m.match_id} match={m} />)}
        </div>
      )}
    </section>
  );
}

/* ── phone: records first, the format on request ────────────────────────── */

function PhoneRecords() {
  const { state, byCode } = useKit();
  const groups: { record: string; rows: SwissRecordV2[] }[] = [];
  for (const r of state.swiss.records) {
    const record = `${r.wins}–${r.losses}`;
    const g = groups.find((x) => x.record === record);
    if (g) g.rows.push(r);
    else groups.push({ record, rows: [r] });
  }
  return (
    <section className="space-y-2" aria-label="Records" data-testid="swiss-phone-records">
      <p className="flex items-baseline justify-between text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Records
        <span className="font-semibold normal-case tracking-normal">from verified results</span>
      </p>
      <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
        {groups.map((g) => (
          <li key={g.record} className="flex items-start gap-3 px-3 py-2.5" data-testid="phone-record-group" data-record={g.record}>
            <span className="w-9 shrink-0 pt-1 text-sm font-bold tabular-nums">{g.record}</span>
            <ul className="flex min-w-0 flex-wrap gap-1.5">
              {g.rows.map((r) => {
                const p = byCode.get(r.code);
                return (
                  <li
                    key={r.code}
                    data-team={r.code}
                    data-status={r.status}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-1.5 text-xs font-semibold",
                      r.status === "advanced" ? "border-[#c9a84c]/50 bg-[#c9a84c]/[0.08] text-[#f1dc9c]" : r.status === "eliminated" ? "border-white/10 text-foreground/50" : "border-white/10",
                    )}
                  >
                    <TeamCrest teamKey={r.team_key} name={p ? displayName(p) : r.code} shortCode={r.code} size="xs" />
                    {r.code}
                    {r.status === "advanced" && <span className="text-[9px] uppercase tracking-[0.1em]">Through</span>}
                    {r.status === "eliminated" && <span className="text-[9px] uppercase tracking-[0.1em]">Out</span>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">No tiebreak order is published, so teams on one record are not ranked.</p>
    </section>
  );
}

function PhoneFormat({ map, round, occ }: { map: SwissPoolMap; round: number; occ: Map<string, string[]> }) {
  const [open, setOpen] = useState(false);
  const r = map.rounds.find((p) => p.round === round);
  return (
    <section className="rounded-xl border border-white/[0.08]" data-testid="swiss-phone-format">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="swiss-format-toggle"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
      >
        <span>
          Explore the format
          <span className="block text-[11px] font-normal text-muted-foreground">Round {round}'s record pools and where each result leads</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] p-3" data-testid="swiss-format-body">
          {r && (
            <div className="grid grid-cols-2 gap-2" data-testid="swiss-round-pools">
              {r.pools.map((p) => (
                <PoolNode key={poolId(p.wins, p.losses)} pool={p} occupants={occ.get(poolId(p.wins, p.losses)) ?? []} selected />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[...map.advanced, ...map.eliminated].map((o) => (
              <OutcomeNode key={outcomeId(o.wins, o.losses)} {...o} occupants={occ.get(outcomeId(o.wins, o.losses)) ?? []} />
            ))}
          </div>
          <SwissLegend />
        </div>
      )}
    </section>
  );
}

/** Which marks are the format and which are verified results. */
function SwissLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground" data-testid="swiss-legend">
      <span><b className="font-semibold text-foreground/75">places</b>: the format's arithmetic</span>
      <span><b className="font-semibold text-foreground/75">crests</b>: teams on that record from verified results</span>
      <span>wins solid, losses dashed</span>
    </p>
  );
}

/* ── workspace ──────────────────────────────────────────────────────────── */

function useRound(rounds: SwissRound[]) {
  const x = useExperience();
  const focus = focusRound(rounds);
  const chosen = rounds.find((r) => r.round === x.loc.round) ?? rounds.find((r) => r.round === focus) ?? rounds[0];
  return chosen;
}

function RoundTabs({ rounds, selected }: { rounds: SwissRound[]; selected: number }) {
  const x = useExperience();
  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-1" data-swipe-ignore>
      <div role="tablist" aria-label="Swiss rounds" className="flex w-max gap-1.5">
        {rounds.map((r) => {
          const live = r.matches.some((m) => m.state === "live");
          const done = r.matches.every((m) => m.state === "completed");
          return (
            <button
              key={r.round}
              type="button"
              role="tab"
              aria-selected={r.round === selected}
              data-testid="swiss-round-tab"
              onClick={() => x.selectRound(r.round)}
              className={cn(
                "flex min-h-11 min-w-14 flex-col items-center justify-center rounded-lg border px-2.5 text-xs font-semibold",
                r.round === selected ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.1] text-[#f1dc9c]" : "border-white/10 text-foreground/75",
              )}
            >
              R{r.round}
              <span className="text-[9.5px] font-medium text-muted-foreground">
                {live ? "Live" : done ? "Done" : formats(r.matches)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SwissWorkspace() {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, "swiss");
  const rounds = useMemo(() => swissRounds(kit.state), [kit.state]);
  const teams = stage ? stageTeams(stage, kit.state, kit.ctx) : null;
  const map = useMemo(
    () => (stage ? swissPoolMap(kit.state, teams, stage.wins_to_advance, stage.losses_to_eliminate) : null),
    [kit.state, stage, teams],
  );
  const occ = useMemo(() => swissOccupancy(kit.state), [kit.state]);
  const selected = useRound(rounds);
  const tiers = swissTiers(kit.ctx);
  const edges = useMemo(() => {
    if (!map) return [];
    const seed = tiers.map((t) => ({ from: `tier-${t.tier}`, to: poolId(0, 0), kind: "seed" as const }));
    return [...seed, ...map.edges];
  }, [map, tiers]);
  const activeNodes = useMemo(() => {
    const s = new Set<string>();
    const r = map?.rounds.find((x) => x.round === selected?.round);
    r?.pools.forEach((p) => s.add(poolId(p.wins, p.losses)));
    if (selected?.round === 1) tiers.forEach((t) => s.add(`tier-${t.tier}`));
    return s;
  }, [map, selected, tiers]);

  if (!stage) return null;
  // No upstream rounds (standings unavailable) or a format the map can't
  // reproduce: the published page's Swiss stage, as it is.
  if (!map || !rounds.length || !selected) {
    return (
      <div className={cn(x.desktop ? "p-5" : "")} data-testid="swiss-fallback">
        <SwissStage stage={stage} matches={stageMatches(kit.state, "swiss")} />
      </div>
    );
  }

  if (!x.desktop) {
    return (
      <div className="space-y-5" data-testid="swiss-phone">
        <RoundTabs rounds={rounds} selected={selected.round} />
        <RoundPairings round={selected} />
        {kit.state.swiss.records.length > 0 ? (
          <PhoneRecords />
        ) : (
          <section className="space-y-2" aria-label="Seeding">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Seeding</p>
            <div className="grid grid-cols-2 gap-2" data-testid="swiss-seeds">
              {tiers.map((t) => (
                <div key={t.tier} className="rounded-xl border border-white/[0.08] bg-[hsl(214_45%_9%)] px-2.5 py-2" data-testid="swiss-tier" data-tier={t.tier}>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#c9a84c]">Tier {t.tier}</p>
                  <p className="mt-1 text-xs font-semibold text-foreground/85">
                    {t.teams.map((p) => p.code).join(" · ")}
                    {t.tier === tiers[tiers.length - 1].tier ? " · PI" : ""}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Records appear from the first verified result. PI is the Play-In winner's place.</p>
          </section>
        )}
        <PhoneFormat map={map} round={selected.round} occ={occ} />
      </div>
    );
  }

  const version = `${selected.round}|${[...occ.entries()].map(([k, v]) => `${k}:${v.join(",")}`).join("|")}`;
  return (
    <div className="space-y-5 p-5" data-testid="swiss-map-view">
      <div className="relative min-w-[800px]" data-testid="swiss-map">
        <MapLinks edges={edges} active={activeNodes} version={version} />
        <div className="grid gap-x-5 2xl:gap-x-7" style={{ gridTemplateColumns: `minmax(124px, 0.95fr) repeat(${map.rounds.length}, minmax(0, 1fr)) minmax(124px, 0.95fr)` }}>
          {/* headers */}
          <p className="pb-3 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Seeding</p>
          {map.rounds.map((r) => {
            const up = rounds.find((u) => u.round === r.round);
            const on = r.round === selected.round;
            const live = up?.matches.some((m) => m.state === "live");
            return (
              <button
                key={r.round}
                type="button"
                aria-pressed={on}
                data-testid="swiss-round-head"
                onClick={() => x.selectRound(r.round)}
                className={cn(
                  "group mb-3 flex flex-col items-start rounded-lg border-b-2 px-1 pb-1.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#c9a84c]",
                  on ? "border-[#e3c66f]" : "border-transparent hover:border-white/15",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]", on ? "text-[#f1dc9c]" : "text-foreground/70")}>
                  Round {r.round}
                  {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="live" />}
                </span>
                <span className="text-[10.5px] text-muted-foreground">{up ? formats(up.matches) : ""}</span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground/80">{up ? compactDays(up.matches.map((m) => m.scheduled_start)) : ""}</span>
              </button>
            );
          })}
          <p className="pb-3 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Outcome</p>
          {/* columns */}
          <SeedColumn />
          {map.rounds.map((r) => (
            <div
              key={r.round}
              className={cn("-mx-2 flex flex-col justify-center gap-2.5 rounded-xl px-2 py-2 transition-colors duration-200", r.round === selected.round && "bg-[#c9a84c]/[0.04]")}
              data-testid="swiss-map-round"
              data-round={r.round}
            >
              {r.pools.map((p) => (
                <PoolNode key={poolId(p.wins, p.losses)} pool={p} occupants={occ.get(poolId(p.wins, p.losses)) ?? []} selected={r.round === selected.round} />
              ))}
            </div>
          ))}
          <div className="flex flex-col justify-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c9a84c]">Through</p>
            {map.advanced.map((o) => (
              <OutcomeNode key={outcomeId(o.wins, o.losses)} {...o} occupants={occ.get(outcomeId(o.wins, o.losses)) ?? []} />
            ))}
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Out</p>
            {map.eliminated.map((o) => (
              <OutcomeNode key={outcomeId(o.wins, o.losses)} {...o} occupants={occ.get(outcomeId(o.wins, o.losses)) ?? []} />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06] pt-4">
        <RoundPairings round={selected} />
      </div>
      {kit.state.swiss.records.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Teams sit on their current record from verified results; no tiebreak order is published, so teams on one record are not ranked.
          {kit.state.swiss.unverified_completed_matches > 0 && " Some completed results are pending verification and are not counted yet."}
        </p>
      )}
      <SwissLegend />
    </div>
  );
}
