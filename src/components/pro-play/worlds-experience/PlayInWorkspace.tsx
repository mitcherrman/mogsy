/**
 * The Play-In workspace (UX1): the double-elimination bracket as one
 * instrument.
 *
 * DESKTOP: the whole bracket at once where it is readable in the stage area —
 * an upper lane and a lower lane whose columns line up, the Play-In Final
 * beside them, and an end cap for the one place it awards in Swiss. Cards and
 * connector lines are the published page's own (`BracketMatchCard`,
 * `Connectors`), so the authority rules are the same code: lines only along
 * upstream's winner edges, "Out" / winner tags only with standings authority.
 * Selecting a card opens it in the side panel.
 *
 * WHEN IT DOES NOT FIT (UX4), it is never scrolled or squeezed: first a
 * tighter bracket, then the bracket by region (Upper · Lower · Final, each
 * with its own connectors), then one round at a time. Every card keeps its
 * "Winner → / Loser →" line, so a region or round still says where its teams
 * go, and the detail steps along those edges.
 *
 * PHONE: one round at a time, chosen from a segmented control in bracket order
 * (upper rounds, lower rounds, final). The round is in the URL
 * (`?step=<upstream cell slug>`, UX2), so refresh and links keep it; it is a
 * view setting (replace) and is separate from the Swiss `?round=`.
 */
import { useMemo, useState } from "react";

import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import {
  AuthorityNotice,
  BracketMatchCard,
  BracketSelectContext,
  CellList,
  Connectors,
  daySpan,
  useBracketEdges,
} from "@/components/pro-play/tournament/TournamentBracket";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import type { TournamentMatchV2 } from "@/lib/pro-play/tournamentApi";
import { displayName, doubleElimLayout, playInSwissSlot, stageMatches, stageOf, type BracketColumn } from "@/lib/pro-play/tournamentV2View";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { FitCascade, FitPages, ViewTabs } from "./fit";
import { Eyebrow, calendarDay } from "./parts";

/** "Semifinals" from "Upper Bracket - Semifinals"; the cell itself otherwise. */
const roundWord = (cell: string) => cell.split(/\s+-\s+/)[1] ?? cell;

const ABBR: Record<string, string> = { semifinals: "SF", finals: "F", quarterfinals: "QF" };
const SIDE: Record<string, string> = { upper: "UB", lower: "LB" };
const abbr = (word: string) => ABBR[word.toLowerCase()] ?? word.replace(/^Round\s+/i, "R");

function EmptyStage({ text }: { text: string }) {
  return <p className="p-6 text-sm text-muted-foreground" data-testid="stage-empty">{text}</p>;
}

/** The place the Play-In awards, as the backend serves it (placed / won / open). */
function SwissEndCap({ compact = false }: { compact?: boolean }) {
  const kit = useKit();
  const swiss = stageOf(kit.ctx, "swiss");
  const slot = playInSwissSlot(kit.ctx, kit.state);
  const p = slot.code ? kit.byCode.get(slot.code) : null;
  if (!swiss) return null;
  return (
    <div className={cn("rounded-xl border border-dashed border-[#c9a84c]/35 bg-[#c9a84c]/[0.03]", compact ? "p-2.5" : "p-3")} data-testid="swiss-end-cap" data-state={slot.basis}>
      <Eyebrow>To {stageLabel(swiss)}</Eyebrow>
      <div className={cn("flex items-center gap-2.5", compact ? "mt-2" : "mt-2.5")}>
        {p ? (
          <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />
        ) : (
          <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-[#c9a84c]/40 text-xs text-[#c9a84c]/80">?</span>
        )}
        <span className="min-w-0 text-xs leading-snug">
          <span className="block font-semibold text-foreground">{p ? p.code : "One place"}</span>
          <span className="block text-muted-foreground">
            {stageLabel(swiss)} from {calendarDay(swiss.starts)} · {swiss.venue}
          </span>
        </span>
      </div>
    </div>
  );
}

type Layout = NonNullable<ReturnType<typeof doubleElimLayout>>;

function Lane({ row, columns, tight }: { row: Layout["rows"][number]; columns: number; tight: boolean }) {
  const kit = useKit();
  const summary = kit.state.play_in;
  return (
    <div
      data-testid={`lane-${row.key}`}
      className={cn(
        "grid grid-cols-[14px_minmax(0,1fr)] gap-3 rounded-2xl border pl-2.5 pr-3",
        tight ? "py-2" : "py-3",
        row.key === "upper" ? "border-[#c9a84c]/[0.14] bg-[#c9a84c]/[0.025]" : "border-white/[0.06] bg-white/[0.012]",
      )}
    >
      <p
        className={cn(
          "flex rotate-180 items-center justify-center whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.24em] [writing-mode:vertical-rl]",
          row.key === "upper" ? "text-[#c9a84c]" : "text-muted-foreground",
        )}
      >
        {row.label}
      </p>
      <div className={cn("grid", tight ? "gap-6" : "gap-8")} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {row.columns.map((col) => (
          <div key={col.cell} data-testid="bracket-column" data-cell={col.cell} className={cn("flex min-w-0 flex-col justify-around", tight ? "gap-2" : "gap-3")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/70">
              {roundWord(col.cell)}
              {daySpan(col.matches) && <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {daySpan(col.matches)}</span>}
            </p>
            {col.matches.map((m) => <BracketMatchCard key={m.match_id} match={m} summary={summary} stageName="Play-In" winnerTag="Play-In winner" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalColumn({ layout, tight }: { layout: Layout; tight: boolean }) {
  const kit = useKit();
  const summary = kit.state.play_in;
  if (!layout.final) return null;
  const finalName = (layout.final.matches.length === 1 && kit.names.get(layout.final.matches[0].match_id)) || "Final";
  return (
    <div className={cn("flex min-w-0 flex-col justify-center", tight ? "gap-2" : "gap-3")} data-testid="bracket-final">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#c9a84c]">
        {finalName}
        {daySpan(layout.final.matches) && <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {daySpan(layout.final.matches)}</span>}
      </p>
      {layout.final.matches.map((m) => <BracketMatchCard key={m.match_id} match={m} summary={summary} stageName="Play-In" winnerTag="Play-In winner" />)}
      <SwissEndCap compact={tight} />
    </div>
  );
}

/** The whole bracket at once (level 0 spacious, level 1 tight). */
function WholeBracket({ layout, matches, tight }: { layout: Layout; matches: TournamentMatchV2[]; tight: boolean }) {
  const kit = useKit();
  const summary = kit.state.play_in;
  const authority = summary.bracket_authority === "standings";
  const { edges, version } = useBracketEdges(matches, authority);
  const columns = Math.max(...layout.rows.map((r) => r.columns.length));
  return (
    <div className={cn(tight ? "space-y-2 p-3" : "space-y-3 p-4")} data-testid="playin-bracket" data-bracket="double_elimination" data-view="whole">
      <AuthorityNotice summary={summary} />
      <div className={cn("relative", tight ? "min-w-[780px]" : "min-w-[860px]")}>
        <Connectors edges={edges} version={version} />
        <div className={cn("grid grid-cols-[minmax(0,2.05fr)_minmax(0,0.95fr)]", tight ? "gap-6" : "gap-8")}>
          <div className={cn("flex flex-col", tight ? "gap-2" : "gap-3")}>
            {layout.rows.map((row) => <Lane key={row.key} row={row} columns={columns} tight={tight} />)}
          </div>
          <FinalColumn layout={layout} tight={tight} />
        </div>
      </div>
    </div>
  );
}

type Region = "upper" | "lower" | "final";

/** The bracket a region at a time: each lane (with its own connectors), or the final. */
function RegionBracket({ layout, matches }: { layout: Layout; matches: TournamentMatchV2[] }) {
  const kit = useKit();
  const x = useExperience();
  const summary = kit.state.play_in;
  const authority = summary.bracket_authority === "standings";
  const regions: { key: Region; label: string }[] = [
    ...layout.rows.map((r) => ({ key: r.key as Region, label: r.label })),
    ...(layout.final ? [{ key: "final" as Region, label: "Final" }] : []),
  ];
  // Open on the region of the selected match, else of the live or next one.
  const focusId = x.loc.matchId ?? kit.state.matches.find((m) => m.stage === "play_in" && m.state === "live")?.match_id ?? kit.state.next_match_id;
  const regionOf = (id: string | null | undefined): Region | null => {
    if (!id) return null;
    if (layout.final?.matches.some((m) => m.match_id === id)) return "final";
    const row = layout.rows.find((r) => r.columns.some((c) => c.matches.some((m) => m.match_id === id)));
    return (row?.key as Region) ?? null;
  };
  const [chosen, setChosen] = useState<Region | null>(null);
  const selectedRegion = regionOf(x.loc.matchId);
  const region = selectedRegion ?? chosen ?? regionOf(focusId) ?? regions[0].key;
  const row = layout.rows.find((r) => r.key === region);
  const laneMatches = row ? row.columns.flatMap((c) => c.matches) : (layout.final?.matches ?? []);
  const { edges, version } = useBracketEdges(laneMatches, authority);
  const columns = Math.max(...layout.rows.map((r) => r.columns.length));
  const pick = (r: Region) => {
    setChosen(r);
    // A selected match outside the region would be a detail for nothing on screen.
    if (x.loc.matchId && regionOf(x.loc.matchId) !== r) x.selectMatch(null);
  };
  void matches;
  return (
    <div className="flex h-full flex-col gap-2.5 p-3" data-testid="playin-bracket" data-bracket="double_elimination" data-view="regions" data-region={region}>
      <ViewTabs label="Play-In bracket regions" testId="playin-regions" value={region} onChange={pick} views={regions} className="max-w-md" />
      <AuthorityNotice summary={summary} />
      <div className="relative min-h-0 flex-1">
        <Connectors edges={edges} version={version} />
        {row ? <Lane row={row} columns={columns} tight /> : <div className="max-w-sm"><FinalColumn layout={layout} tight /></div>}
      </div>
    </div>
  );
}

/* ── one round at a time (phone, and the desktop floor) ─────────────────── */

interface Step {
  key: string;
  label: string;
  short: string;
  col: BracketColumn;
}

/** A column's URL key: upstream's cell slug, else its name made URL-safe. */
const stepKey = (col: BracketColumn) =>
  col.matches[0]?.bracket?.cell_slug ?? col.cell.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function useSteps(layout: Layout | null): Step[] {
  return useMemo(() => {
    if (!layout) return [];
    const out: Step[] = [];
    for (const row of layout.rows) {
      for (const col of row.columns) {
        const side = row.key === "upper" ? "Upper" : "Lower";
        out.push({ key: stepKey(col), label: `${side} ${roundWord(col.cell).replace(/s$/, "")}`, short: `${SIDE[row.key] ?? side} ${abbr(roundWord(col.cell))}`, col });
      }
    }
    if (layout.final) out.push({ key: stepKey(layout.final), label: "Final", short: "Final", col: layout.final });
    return out;
  }, [layout]);
}

function RoundSteps({ layout }: { layout: Layout }) {
  const kit = useKit();
  const x = useExperience();
  const summary = kit.state.play_in;
  const steps = useSteps(layout);
  const focusId = kit.state.matches.find((m) => m.stage === "play_in" && m.state === "live")?.match_id ?? kit.state.next_match_id;
  const initial = Math.max(0, steps.findIndex((s) => s.col.matches.some((m) => m.match_id === focusId)));
  const fromUrl = steps.findIndex((s) => s.key === x.loc.step);
  const at = fromUrl >= 0 ? fromUrl : initial;
  const step = steps[at];
  const choose = (key: string) => {
    const next = steps.find((s) => s.key === key);
    // The detail follows the round: a selection in another round is closed.
    if (next && x.loc.matchId && !next.col.matches.some((m) => m.match_id === x.loc.matchId)) x.selectMatch(null);
    x.selectStep(key);
  };
  const last = at === steps.length - 1;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="playin-rounds" data-step={step.key}>
      <ViewTabs
        label="Play-In rounds"
        testId="round-steps"
        tabTestId="round-step"
        value={step.key}
        onChange={choose}
        views={steps.map((s) => ({ key: s.key, label: s.short, name: s.label }))}
      />
      <AuthorityNotice summary={summary} />
      <p className="flex shrink-0 items-baseline justify-between gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground" data-testid="round-heading">
        <span className="text-foreground/85">{step.label}</span>
        <span className="normal-case tracking-normal">
          {daySpan(step.col.matches)} · {step.col.matches.length} {step.col.matches.length === 1 ? "match" : "matches"}
        </span>
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="round-cards">
        <FitPages
          items={step.col.matches}
          keyOf={(m) => m.match_id}
          noun="Matches"
          focusKey={x.loc.matchId}
          resetKey={step.key}
          onPage={(shown) => {
            if (x.loc.matchId && !shown.some((m) => m.match_id === x.loc.matchId)) x.selectMatch(null);
          }}
          className="min-h-[96px]"
          listClassName="grid gap-2 sm:grid-cols-2"
          render={(m) => <BracketMatchCard match={m} summary={summary} stageName="Play-In" winnerTag="Play-In winner" />}
        />
        {last && <SwissEndCap compact />}
      </div>
    </div>
  );
}

export function PlayInWorkspace() {
  const kit = useKit();
  const x = useExperience();
  const matches = stageMatches(kit.state, "play_in", kit.state.play_in);
  const layout = useMemo(() => doubleElimLayout(matches), [matches]);
  const selection = useMemo(() => ({ selectedId: x.loc.matchId, onSelect: x.selectMatch, dense: true }), [x.loc.matchId, x.selectMatch]);
  if (!matches.length) return <EmptyStage text="No Play-In matches are on the official schedule right now." />;
  const watch = matches.map((m) => `${m.match_id}:${m.state}:${m.teams.map((t) => t.code ?? "").join("/")}`).join("|");
  return (
    <BracketSelectContext.Provider value={selection}>
      {!layout ? (
        // Unrecognised cells: the published list, by cell, a page at a time.
        <CellPages matches={matches} />
      ) : x.desktop ? (
        <FitCascade levels={4} watch={watch} className="h-full" testId="playin-fit">
          {(level) =>
            level === 0 ? (
              <WholeBracket layout={layout} matches={matches} tight={false} />
            ) : level === 1 ? (
              <WholeBracket layout={layout} matches={matches} tight />
            ) : level === 2 ? (
              <RegionBracket layout={layout} matches={matches} />
            ) : (
              <div className="h-full p-3"><RoundSteps layout={layout} /></div>
            )
          }
        </FitCascade>
      ) : (
        <RoundSteps layout={layout} />
      )}
    </BracketSelectContext.Provider>
  );
}

/** Without a recognisable bracket: the published cell list where it fits, else the matches a page at a time. */
function CellPages({ matches }: { matches: TournamentMatchV2[] }) {
  const kit = useKit();
  const x = useExperience();
  return (
    <FitCascade levels={2} watch={matches.length} className="h-full">
      {(level) =>
        level === 0 ? (
          <div className={cn("space-y-3", x.desktop ? "p-5" : "")}>
            <AuthorityNotice summary={kit.state.play_in} />
            <CellList matches={matches} />
          </div>
        ) : (
          <div className={cn("flex h-full flex-col gap-2", x.desktop ? "p-4" : "")} data-testid="bracket-list">
            <AuthorityNotice summary={kit.state.play_in} />
            <FitPages
              items={matches}
              keyOf={(m) => m.match_id}
              noun="Matches"
              focusKey={x.loc.matchId}
              className="min-h-[96px]"
              listClassName="grid gap-2 sm:grid-cols-2"
              render={(m) => <BracketMatchCard match={m} summary={kit.state.play_in} stageName="Play-In" winnerTag="Play-In winner" />}
            />
          </div>
        )
      }
    </FitCascade>
  );
}
