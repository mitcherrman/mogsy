/**
 * The Swiss stage of the v2 tournament page (PW4-B).
 *
 * BEFORE A RESULT: the certified seeding — each tier's teams from the
 * registry, plus the Play-In's slot, which stays unresolved until the backend
 * serves it (a Play-In team upstream placed in Swiss, or the certified Play-In
 * winner). There is no 0–0 table.
 *
 * AFTER RESULTS: the backend's records, grouped by W–L in its order (no
 * tiebreak is published, so none is drawn), with `advanced` / `eliminated`
 * exactly as served; and upstream's own rounds, one at a time. A round whose
 * pairings are not published yet is one summary line, not eight TBD rows.
 */
import { useState } from "react";
import { Check, X } from "lucide-react";

import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { SwissRecordV2, TournamentMatchV2, TournamentStageV2 } from "@/lib/pro-play/tournamentApi";
import { dayLabel, localDayKey, matchesByDay, recordGroups } from "@/lib/pro-play/tournamentView";
import {
  bothTbd,
  displayName,
  focusRound,
  formats,
  playInSwissSlot,
  stageOf,
  stageShortName,
  swissRounds,
  swissTiers,
  type SwissRound,
} from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

import { CARD, MatchLines, Notice, useKit } from "./TournamentParts";

/* ── seeding ────────────────────────────────────────────────────────────── */

function SwissSeeding({ wide = false }: { wide?: boolean }) {
  const { ctx, state, byCode } = useKit();
  const tiers = swissTiers(ctx);
  const slot = playInSwissSlot(ctx, state);
  const playIn = stageOf(ctx, "play_in");
  const slotTeam = slot.code ? byCode.get(slot.code) : null;
  if (!tiers.length) return null;
  return (
    <div className="space-y-3" data-testid="swiss-seeding">
      <div className={cn("grid grid-cols-2 gap-2 sm:gap-3", wide && "xl:grid-cols-4")}>
        {tiers.map((t) => (
          <div key={t.tier} className={cn(CARD, "p-2.5 sm:p-3")} data-testid="swiss-tier" data-tier={t.tier}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#c9a84c]">Tier {t.tier}</p>
            <ul className="space-y-1.5">
              {t.teams.map((p) => (
                <li key={p.code} className="flex min-w-0 items-center gap-2" data-team={p.code}>
                  <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="xs" />
                  <span className="w-11 shrink-0 text-sm font-semibold">{p.code}</span>
                  <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">{displayName(p)}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{p.region}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {playIn && (
        <div
          className={cn(CARD, "flex flex-wrap items-center gap-x-3 gap-y-1 border-dashed px-3 py-2.5")}
          data-testid="swiss-play-in-slot"
          data-state={slot.basis}
        >
          {slotTeam ? (
            <TeamCrest teamKey={slotTeam.team_key} name={displayName(slotTeam)} shortCode={slotTeam.code} size="xs" />
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-dashed border-border/80 text-[10px] font-semibold text-muted-foreground" aria-hidden="true">
              ?
            </span>
          )}
          <span className="text-sm font-semibold">{slotTeam ? slotTeam.code : "TBD"}</span>
          <span className="text-xs text-muted-foreground">
            {slot.basis === "placed"
              ? `Placed in Swiss from the ${stageShortName(playIn)}`
              : slot.basis === "won"
                ? `Won the ${stageShortName(playIn)}`
                : `${stageShortName(playIn)} winner's slot`}
          </span>
          <span className="w-full text-[11px] leading-snug text-muted-foreground/90">{playIn.format_note}</span>
        </div>
      )}
    </div>
  );
}

/* ── records ────────────────────────────────────────────────────────────── */

function StatusMark({ status }: { status: SwissRecordV2["status"] }) {
  if (status === "advanced") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#e3c66f]">
        <Check className="h-3 w-3" aria-hidden="true" /> Advanced
      </span>
    );
  }
  if (status === "eliminated") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <X className="h-3 w-3" aria-hidden="true" /> Eliminated
      </span>
    );
  }
  return null;
}

function SwissRecords() {
  const { state, byCode } = useKit();
  const groups = recordGroups(state.swiss.records);
  return (
    <div className="space-y-2" data-testid="swiss-records">
      <div className={cn(CARD, "divide-y divide-border/50")}>
        {groups.map((g) => (
          <div key={g.record} className="flex gap-3 px-3 py-2.5" data-testid="record-group" data-record={g.record}>
            <span className="w-9 shrink-0 pt-1 text-sm font-bold tabular-nums text-foreground">{g.record}</span>
            <ul className="flex min-w-0 flex-wrap gap-1.5">
              {(g.rows as SwissRecordV2[]).map((r) => {
                const p = byCode.get(r.code);
                return (
                  <li
                    key={r.code}
                    data-testid="swiss-record"
                    data-team={r.code}
                    data-status={r.status}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1",
                      r.status === "advanced" && "border-[#c9a84c]/50 bg-[#c9a84c]/[0.08]",
                      r.status === "eliminated" && "border-border/50 opacity-60",
                      r.status === "active" && "border-border/60",
                    )}
                  >
                    <TeamCrest teamKey={r.team_key} name={p ? displayName(p) : r.team_key} shortCode={r.code} size="xs" />
                    <span className="text-xs font-semibold">{r.code}</span>
                    <StatusMark status={r.status} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Grouped by match record from verified results. No tiebreak order is published, so teams on the same record are not ranked.
      </p>
      {state.swiss.unverified_completed_matches > 0 && (
        <Notice tone="info">Some completed Swiss results are pending verification and are not counted yet.</Notice>
      )}
    </div>
  );
}

/* ── rounds ─────────────────────────────────────────────────────────────── */

function roundDays(matches: readonly TournamentMatchV2[]) {
  const days = [...new Set(matches.map((m) => localDayKey(m.scheduled_start)).filter((d): d is string => Boolean(d)))].sort();
  if (!days.length) return null;
  return days.length === 1 ? dayLabel(days[0]) : `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`;
}

function RoundPanel({ round }: { round: SwissRound }) {
  const unpaired = round.matches.every(bothTbd);
  if (unpaired) {
    const first = localStart(round.matches[0].scheduled_start);
    return (
      <div className={cn(CARD, "space-y-1 px-4 py-4")} data-testid="swiss-round-summary">
        <p className="text-sm font-semibold text-foreground">
          {round.matches.length} matches · {formats(round.matches)}
        </p>
        <p className="text-xs text-muted-foreground">
          {roundDays(round.matches)}
          {first ? ` · first match ${first.split(" · ")[1] ?? first}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">Pairings are published by the official draw. Teams appear here once they are.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {matchesByDay(round.matches).map((d) => (
        <div key={d.day} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{dayLabel(d.day)}</p>
          <MatchLines matches={d.matches as TournamentMatchV2[]} withStage={false} showDay={false} dense />
        </div>
      ))}
    </div>
  );
}

function SwissRounds({ rounds }: { rounds: SwissRound[] }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const focus = focusRound(rounds);
  const selected = rounds.find((r) => r.round === chosen) ?? rounds.find((r) => r.round === focus) ?? rounds[0];
  return (
    <div className="space-y-3" data-testid="swiss-rounds">
      <div role="tablist" aria-label="Swiss rounds" className="flex gap-1.5 overflow-x-auto pb-0.5">
        {rounds.map((r) => {
          const active = r.round === selected.round;
          const done = r.matches.every((m) => m.state === "completed");
          const live = r.matches.some((m) => m.state === "live");
          return (
            <button
              key={r.round}
              type="button"
              role="tab"
              id={`swiss-round-tab-${r.round}`}
              aria-selected={active}
              aria-controls="swiss-round-panel"
              data-testid="swiss-round-tab"
              onClick={() => setChosen(r.round)}
              className={cn(
                "flex min-h-11 shrink-0 flex-col items-start justify-center rounded-md border px-2.5 py-1 text-left transition-colors sm:min-h-0",
                active ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.08]" : "border-border/60 hover:bg-muted/30",
              )}
            >
              <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <span className="sm:hidden">R{r.round}</span>
                <span className="hidden sm:inline">Round {r.round}</span>
                {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="live" />}
                {done && !live && <Check className="h-3 w-3 text-muted-foreground" aria-label="complete" />}
              </span>
              <span className="text-[10px] text-muted-foreground">{formats(r.matches)}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="swiss-round-panel" aria-labelledby={`swiss-round-tab-${selected.round}`} data-round={selected.round}>
        <RoundPanel round={selected} />
      </div>
    </div>
  );
}

/* ── stage ──────────────────────────────────────────────────────────────── */

export function SwissStage({ stage, matches }: { stage: TournamentStageV2; matches: TournamentMatchV2[] }) {
  const { state } = useKit();
  const rounds = swissRounds(state);
  const hasRecords = state.swiss.records.length > 0;
  // Before a result the seeding is the content and takes the width; once
  // records exist they sit beside the rounds.
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{stage.format_note}</p>
      <div className={cn("grid gap-5", hasRecords && "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {hasRecords ? "Records" : "Seeding"}
          </p>
          {hasRecords ? <SwissRecords /> : <SwissSeeding wide />}
          {!hasRecords && (
            <p className="text-[11px] text-muted-foreground">Records appear here after the first Swiss result.</p>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Rounds</p>
          {rounds.length > 0 ? (
            <SwissRounds rounds={rounds} />
          ) : matches.length > 0 ? (
            // No standings: upstream's rounds are unknown, so matches are
            // listed by day rather than numbered by date.
            <div className="space-y-3" data-testid="swiss-by-day">
              {matchesByDay(matches).map((d) => (
                <div key={d.day} className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{dayLabel(d.day)}</p>
                  <MatchLines matches={d.matches as TournamentMatchV2[]} withStage={false} showDay={false} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No Swiss matches are on the schedule right now.</p>
          )}
        </div>
      </div>
    </div>
  );
}
