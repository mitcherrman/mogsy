/**
 * The Knockouts workspace (UX1).
 *
 * BEFORE THE DRAW the stage is a shape, not seven TBD cards: a compact
 * schematic of Quarterfinals → Semifinals → Final with each match's day and
 * local time, the venue, and one line saying the pairs come from the draw.
 * Nothing in it pretends a pairing is known. It is drawn only while every
 * quarterfinal is still awaiting its draw and nothing has started.
 *
 * ONCE TEAMS ARE PLACED it is the published page's own single-elimination
 * bracket (`SingleElimStage`: upstream cells, tree re-ordering, connector
 * lines, authority-gated tags), made selectable for the side panel, with the
 * champion above it only when the backend certifies one.
 *
 * FITTING (UX4). The whole schematic or bracket where it is readable in the
 * stage area; else a tighter schematic; else one round at a time behind a
 * round control (Quarterfinals · Semifinals · Final), every match of the
 * round reachable through its pages. A phone always reads it a round at a
 * time.
 */
import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";

import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import {
  BracketMatchCard,
  BracketSelectContext,
  ChampionBanner,
  Connectors,
  SingleElimStage,
  useBracketEdges,
} from "@/components/pro-play/tournament/TournamentBracket";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { TournamentMatchV2 } from "@/lib/pro-play/tournamentApi";
import { awaitingDraw, championMatch, displayName, singleElimRounds, stageMatches, stageOf, stageShortName } from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { FitCascade, FitPages, ViewTabs } from "./fit";
import { Eyebrow, compactDays } from "./parts";

/** Every match still unnamed, the opening round awaiting its draw, nothing started. */
export function knockoutPreDraw(matches: readonly TournamentMatchV2[]) {
  if (!matches.length || matches.some((m) => m.state !== "upcoming")) return false;
  const { rounds } = singleElimRounds(matches);
  return rounds.length > 0 && rounds[0].matches.every((m) => awaitingDraw(m)) && matches.every((m) => m.teams.every((t) => t.tbd || !t.code));
}

function SchematicNode({ match, final, tight = false }: { match: TournamentMatchV2; final?: boolean; tight?: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const selected = x.loc.matchId === match.match_id;
  const name = kit.names.get(match.match_id) ?? "Match";
  const when = localStart(match.scheduled_start);
  return (
    <button
      type="button"
      data-bracket-match={match.match_id}
      data-state={match.state}
      data-testid="schematic-node"
      aria-pressed={selected}
      onClick={() => x.selectMatch(match.match_id)}
      className={cn(
        "relative z-[1] w-full rounded-xl border text-left outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
        tight ? "px-3 py-2" : "px-3.5 py-2.5",
        final ? "border-[#c9a84c]/45 bg-[linear-gradient(180deg,hsl(42_60%_40%/0.16),hsl(214_52%_8%))]" : "border-white/[0.09] bg-[hsl(214_50%_9%)] hover:border-white/20",
        selected && "border-[#c9a84c] shadow-[0_0_0_1px_#c9a84c,0_8px_28px_-12px_rgba(201,168,76,0.55)]",
      )}
    >
      <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.12em]", final ? "text-[#e3c66f]" : "text-foreground/85")}>
        {name}
        {match.best_of ? <span className="text-muted-foreground"> · Bo{match.best_of}</span> : null}
      </span>
      <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{when}</span>
      {!tight && (
        <span aria-hidden="true" className="mt-2 flex flex-col gap-1">
          <span className="h-[3px] w-3/4 rounded-full bg-white/[0.07]" />
          <span className="h-[3px] w-1/2 rounded-full bg-white/[0.07]" />
        </span>
      )}
    </button>
  );
}

function ChampionCap({ tight = false }: { tight?: boolean }) {
  const kit = useKit();
  const stage = stageOf(kit.ctx, "knockout");
  return (
    <div className={cn("rounded-2xl border border-dashed border-[#c9a84c]/40 text-center", tight ? "p-3" : "p-4")} data-testid="champion-cap">
      <Trophy className={cn("mx-auto text-[#c9a84c]", tight ? "h-5 w-5" : "h-6 w-6")} aria-hidden="true" />
      <p className="mt-1.5 font-['Cinzel',serif] text-base text-[#e3c66f]">{kit.ctx.short_name} champion</p>
      <p className="mt-1 text-xs text-muted-foreground">{stage?.venue.includes(";") ? stage.venue.split(";")[1].trim().replace(/^Final in /i, "") : stage?.venue}</p>
    </div>
  );
}

function DrawLine({ rounds }: { rounds: ReturnType<typeof singleElimRounds>["rounds"] }) {
  return (
    <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <Eyebrow>Bracket set by the draw</Eyebrow>
      <p className="text-xs text-muted-foreground">
        {rounds[0]?.matches.length ? `${rounds[0].matches.length * 2} teams · ` : ""}pairings come from the official quarterfinal draw after Swiss
      </p>
    </div>
  );
}

/** The whole schematic (desktop). */
function Schematic({ matches, tight }: { matches: TournamentMatchV2[]; tight: boolean }) {
  const kit = useKit();
  const { rounds, tree } = useMemo(() => singleElimRounds(matches), [matches]);
  const { edges, version } = useBracketEdges(matches, kit.state.knockout.bracket_authority === "standings" && tree);
  const last = rounds.length - 1;
  return (
    <div className={cn(tight ? "space-y-3 p-4" : "space-y-5 p-6")} data-testid="knockout-schematic" data-view="whole">
      <DrawLine rounds={rounds} />
      <div className={cn("relative", tight ? "min-w-[640px]" : "min-w-[760px]")}>
        <Connectors edges={edges} version={version} />
        <div className={cn("grid", tight ? "gap-6" : "gap-12")} style={{ gridTemplateColumns: `repeat(${rounds.length + 1}, minmax(0, 1fr))` }}>
          {rounds.map((r, i) => (
            <div key={r.cell} className={cn("flex min-w-0 flex-col", tight ? "gap-2" : "gap-3")} data-testid="schematic-round" data-cell={r.cell}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/75">
                {r.cell}
                <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {compactDays(r.matches.map((m) => m.scheduled_start))}</span>
              </p>
              <div className={cn("flex flex-1 flex-col justify-around", tight ? "gap-2" : "gap-3")}>
                {r.matches.map((m) => <SchematicNode key={m.match_id} match={m} final={i === last} tight={tight} />)}
              </div>
            </div>
          ))}
          <div className="flex min-w-0 flex-col justify-center">
            <ChampionCap tight={tight} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The certified champion in one line (the round view's room goes to the round). */
function ChampionLine() {
  const kit = useKit();
  const code = kit.state.knockout.bracket_authority === "standings" ? kit.state.knockout.champion_code : null;
  if (!code) return null;
  const final = championMatch(kit.state);
  const p = kit.byCode.get(code);
  const team = final?.teams.find((t) => t.code === code);
  const other = final?.teams.find((t) => t.code !== code);
  return (
    <p className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-[#c9a84c]/50 bg-[#c9a84c]/[0.08] px-3 py-1.5 text-sm" data-testid="champion" data-layout="line">
      <Trophy className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" />
      <TeamCrest teamKey={team?.team_key ?? p?.team_key} name={p ? displayName(p) : code} shortCode={code} size="xs" />
      <b className="font-bold text-[#f1dc9c]">{p ? displayName(p) : code}</b>
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c9a84c]">{kit.ctx.short_name} champion</span>
      {final && other && (
        <span className="text-xs text-muted-foreground">
          won the final <b className="font-semibold tabular-nums text-foreground">{team?.game_wins}–{other.game_wins}</b>
          {other.code ? ` against ${other.code}` : ""}
        </span>
      )}
    </p>
  );
}

/**
 * One round at a time: the round control, then the round's matches (schematic
 * nodes before the draw, bracket cards after), paged when they do not fit.
 */
function RoundFocus({ matches, preDraw }: { matches: TournamentMatchV2[]; preDraw: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, "knockout");
  const { rounds } = useMemo(() => singleElimRounds(matches), [matches]);
  const roundOf = (id: string | null | undefined) => (id ? rounds.findIndex((r) => r.matches.some((m) => m.match_id === id)) : -1);
  const focusId = kit.state.matches.find((m) => m.stage === "knockout" && m.state === "live")?.match_id ?? kit.state.next_match_id;
  const [chosen, setChosen] = useState<number | null>(null);
  const selectedRound = roundOf(x.loc.matchId);
  const at = selectedRound >= 0 ? selectedRound : (chosen ?? Math.max(0, roundOf(focusId)));
  const round = rounds[at] ?? rounds[0];
  const last = at === rounds.length - 1;
  const name = stage ? stageShortName(stage) : "Knockouts";
  const pick = (key: string) => {
    const i = rounds.findIndex((r) => r.cell === key);
    setChosen(i);
    if (x.loc.matchId && roundOf(x.loc.matchId) !== i) x.selectMatch(null);
  };
  if (!round) return null;
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2.5", x.desktop && "p-4")} data-testid={preDraw ? "knockout-schematic" : "knockout-bracket"} data-view="rounds" data-round={round.cell}>
      {preDraw && x.desktop && <DrawLine rounds={rounds} />}
      {!preDraw && <ChampionLine />}
      <ViewTabs
        label="Knockout rounds"
        testId="knockout-rounds"
        tabTestId="knockout-round-tab"
        className={cn(x.desktop && "max-w-lg")}
        value={round.cell}
        onChange={pick}
        views={rounds.map((r) => ({ key: r.cell, label: r.cell }))}
      />
      <p className="flex shrink-0 items-baseline justify-between gap-2 px-0.5 text-[11px] text-muted-foreground" data-testid="schematic-round" data-cell={round.cell}>
        <span className="font-semibold uppercase tracking-[0.12em] text-foreground/85">{round.cell}</span>
        <span className="tabular-nums">{compactDays(round.matches.map((m) => m.scheduled_start))} · {round.matches.length} {round.matches.length === 1 ? "match" : "matches"}</span>
      </p>
      {preDraw && !x.desktop && <p className="shrink-0 px-0.5 text-[11px] text-muted-foreground">Pairings come from the official quarterfinal draw after Swiss.</p>}
      <div className={cn("flex min-h-0 flex-1 gap-3", last && x.desktop ? "flex-row" : "flex-col")}>
        <FitPages
          items={round.matches}
          keyOf={(m) => m.match_id}
          noun="Matches"
          focusKey={x.loc.matchId}
          resetKey={round.cell}
          onPage={(shown) => {
            if (x.loc.matchId && !shown.some((m) => m.match_id === x.loc.matchId)) x.selectMatch(null);
          }}
          className="min-h-[72px]"
          // Bracket cards name their match in one line: a phone gives each the full width.
          listClassName={cn("grid gap-2", x.desktop ? "grid-cols-2 2xl:grid-cols-4" : preDraw ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}
          render={(m) =>
            preDraw ? <SchematicNode match={m} final={last} tight /> : <BracketMatchCard match={m} summary={kit.state.knockout} stageName={name} winnerTag="Champion" />
          }
        />
        {last && preDraw && (
          <div className={cn("shrink-0", x.desktop && "w-56")}>
            <ChampionCap tight />
          </div>
        )}
      </div>
    </div>
  );
}

export function KnockoutWorkspace() {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, "knockout");
  const matches = stageMatches(kit.state, "knockout", kit.state.knockout);
  const selection = useMemo(() => ({ selectedId: x.loc.matchId, onSelect: x.selectMatch, dense: true }), [x.loc.matchId, x.selectMatch]);
  if (!stage || !matches.length) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="stage-empty">No Knockout matches are on the official schedule right now.</p>;
  }
  const preDraw = knockoutPreDraw(matches);
  const watch = matches.map((m) => `${m.match_id}:${m.state}:${m.teams.map((t) => t.code ?? "").join("/")}`).join("|");
  return (
    <BracketSelectContext.Provider value={selection}>
      {!x.desktop ? (
        <RoundFocus matches={matches} preDraw={preDraw} />
      ) : preDraw ? (
        <FitCascade levels={3} watch={watch} className="h-full" testId="knockout-fit">
          {(level) => (level < 2 ? <Schematic matches={matches} tight={level === 1} /> : <RoundFocus matches={matches} preDraw />)}
        </FitCascade>
      ) : (
        <FitCascade levels={2} watch={watch} className="h-full" testId="knockout-fit">
          {(level) =>
            level === 0 ? (
              <div className="space-y-4 p-5" data-testid="knockout-bracket" data-view="whole">
                <ChampionBanner />
                <div className="min-w-[860px]">
                  <SingleElimStage stage={stage} summary={kit.state.knockout} matches={matches} />
                </div>
              </div>
            ) : (
              <RoundFocus matches={matches} preDraw={false} />
            )
          }
        </FitCascade>
      )}
    </BracketSelectContext.Provider>
  );
}
