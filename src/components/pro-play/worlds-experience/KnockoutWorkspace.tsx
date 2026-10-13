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
 */
import { useMemo } from "react";
import { Trophy } from "lucide-react";

import {
  BracketSelectContext,
  ChampionBanner,
  Connectors,
  SingleElimStage,
  useBracketEdges,
} from "@/components/pro-play/tournament/TournamentBracket";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { TournamentMatchV2 } from "@/lib/pro-play/tournamentApi";
import { awaitingDraw, singleElimRounds, stageMatches, stageOf } from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { Eyebrow, compactDays } from "./parts";

/** Every match still unnamed, the opening round awaiting its draw, nothing started. */
export function knockoutPreDraw(matches: readonly TournamentMatchV2[]) {
  if (!matches.length || matches.some((m) => m.state !== "upcoming")) return false;
  const { rounds } = singleElimRounds(matches);
  return rounds.length > 0 && rounds[0].matches.every((m) => awaitingDraw(m)) && matches.every((m) => m.teams.every((t) => t.tbd || !t.code));
}

function SchematicNode({ match, final }: { match: TournamentMatchV2; final?: boolean }) {
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
        "relative z-[1] w-full rounded-xl border px-3.5 py-2.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#c9a84c]",
        final ? "border-[#c9a84c]/45 bg-[linear-gradient(180deg,hsl(42_60%_40%/0.16),hsl(214_52%_8%))]" : "border-white/[0.09] bg-[hsl(214_50%_9%)] hover:border-white/20",
        selected && "border-[#c9a84c] shadow-[0_0_0_1px_#c9a84c,0_8px_28px_-12px_rgba(201,168,76,0.55)]",
      )}
    >
      <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.12em]", final ? "text-[#e3c66f]" : "text-foreground/85")}>
        {name}
        {match.best_of ? <span className="text-muted-foreground"> · Bo{match.best_of}</span> : null}
      </span>
      <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{when}</span>
      <span aria-hidden="true" className="mt-2 flex flex-col gap-1">
        <span className="h-[3px] w-3/4 rounded-full bg-white/[0.07]" />
        <span className="h-[3px] w-1/2 rounded-full bg-white/[0.07]" />
      </span>
    </button>
  );
}

function Schematic({ matches }: { matches: TournamentMatchV2[] }) {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, "knockout");
  const { rounds, tree } = useMemo(() => singleElimRounds(matches), [matches]);
  const { edges, version } = useBracketEdges(matches, kit.state.knockout.bracket_authority === "standings" && tree);
  const last = rounds.length - 1;
  return (
    <div className={cn(x.desktop ? "p-6" : "space-y-3")} data-testid="knockout-schematic">
      <div className={cn("flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1", x.desktop ? "mb-5" : "mb-1")}>
        <Eyebrow>Bracket set by the draw</Eyebrow>
        {x.desktop && (
          <p className="text-xs text-muted-foreground">
            {rounds[0]?.matches.length ? `${rounds[0].matches.length * 2} teams` : ""} · pairings come from the official quarterfinal draw after Swiss
          </p>
        )}
      </div>
      <div className={cn("relative", x.desktop && "min-w-[760px]")}>
        {x.desktop && <Connectors edges={edges} version={version} />}
        <div className={cn(x.desktop ? "grid gap-12" : "space-y-5")} style={x.desktop ? { gridTemplateColumns: `repeat(${rounds.length + 1}, minmax(0, 1fr))` } : undefined}>
          {rounds.map((r, i) => (
            <div key={r.cell} className="flex min-w-0 flex-col gap-3" data-testid="schematic-round" data-cell={r.cell}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/75">
                {r.cell}
                <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {compactDays(r.matches.map((m) => m.scheduled_start))}</span>
              </p>
              <div className={cn("flex-1 gap-3", x.desktop ? "flex flex-col justify-around" : r.matches.length > 1 ? "grid grid-cols-2 gap-2" : "flex flex-col")}>
                {r.matches.map((m) => <SchematicNode key={m.match_id} match={m} final={i === last} />)}
              </div>
            </div>
          ))}
          <div className="flex min-w-0 flex-col justify-center" data-testid="champion-cap">
            <div className="rounded-2xl border border-dashed border-[#c9a84c]/40 p-4 text-center">
              <Trophy className="mx-auto h-6 w-6 text-[#c9a84c]" aria-hidden="true" />
              <p className="mt-2 font-['Cinzel',serif] text-base text-[#e3c66f]">{kit.ctx.short_name} champion</p>
              <p className="mt-1 text-xs text-muted-foreground">{stage?.venue.includes(";") ? stage.venue.split(";")[1].trim().replace(/^Final in /i, "") : stage?.venue}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KnockoutWorkspace() {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, "knockout");
  const matches = stageMatches(kit.state, "knockout", kit.state.knockout);
  const selection = useMemo(() => ({ selectedId: x.loc.matchId, onSelect: x.selectMatch, dense: x.desktop }), [x.loc.matchId, x.selectMatch, x.desktop]);
  if (!stage || !matches.length) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="stage-empty">No Knockout matches are on the official schedule right now.</p>;
  }
  if (knockoutPreDraw(matches)) return <Schematic matches={matches} />;
  return (
    <BracketSelectContext.Provider value={selection}>
      <div className={cn("space-y-4", x.desktop && "p-5")} data-testid="knockout-bracket">
        <ChampionBanner />
        <div className={cn(x.desktop && "min-w-[860px]")}>
          <SingleElimStage stage={stage} summary={kit.state.knockout} matches={matches} />
        </div>
      </div>
    </BracketSelectContext.Provider>
  );
}
