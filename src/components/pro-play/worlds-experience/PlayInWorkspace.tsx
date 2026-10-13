/**
 * The Play-In workspace (UX1): the double-elimination bracket as one
 * instrument.
 *
 * DESKTOP: the whole bracket at once — an upper lane and a lower lane whose
 * columns line up, the Play-In Final beside them, and an end cap for the one
 * place it awards in Swiss. Cards and connector lines are the published
 * page's own (`BracketMatchCard`, `Connectors`), so the authority rules are
 * the same code: lines only along upstream's winner edges, "Out" / winner tags
 * only with standings authority. Selecting a card opens it in the side panel.
 *
 * PHONE: the graph is not squeezed. One round at a time, chosen from a rail
 * in bracket order (upper rounds, lower rounds, final); each card still says
 * where its winner and loser go, and the detail sheet steps along those edges.
 * The round is in the URL (`?step=<upstream cell slug>`, UX2), so refresh and
 * links keep it; it is a view setting (replace) and is separate from the
 * Swiss `?round=`.
 */
import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
import { Eyebrow, calendarDay } from "./parts";

/** "Semifinals" from "Upper Bracket - Semifinals"; the cell itself otherwise. */
const roundWord = (cell: string) => cell.split(/\s+-\s+/)[1] ?? cell;

function EmptyStage({ text }: { text: string }) {
  return <p className="p-6 text-sm text-muted-foreground" data-testid="stage-empty">{text}</p>;
}

/** The place the Play-In awards, as the backend serves it (placed / won / open). */
function SwissEndCap() {
  const kit = useKit();
  const swiss = stageOf(kit.ctx, "swiss");
  const slot = playInSwissSlot(kit.ctx, kit.state);
  const p = slot.code ? kit.byCode.get(slot.code) : null;
  if (!swiss) return null;
  return (
    <div className="rounded-xl border border-dashed border-[#c9a84c]/35 bg-[#c9a84c]/[0.03] p-3" data-testid="swiss-end-cap" data-state={slot.basis}>
      <Eyebrow>To {stageLabel(swiss)}</Eyebrow>
      <div className="mt-2.5 flex items-center gap-2.5">
        {p ? (
          <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />
        ) : (
          <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-[#c9a84c]/40 text-xs text-[#c9a84c]/80">?</span>
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

function DesktopBracket({ matches }: { matches: TournamentMatchV2[] }) {
  const kit = useKit();
  const summary = kit.state.play_in;
  const layout = useMemo(() => doubleElimLayout(matches), [matches]);
  const authority = summary.bracket_authority === "standings";
  const { edges, version } = useBracketEdges(matches, authority && layout !== null);
  if (!layout) {
    return (
      <div className="space-y-3 p-5">
        <AuthorityNotice summary={summary} />
        <CellList matches={matches} />
      </div>
    );
  }
  const columns = Math.max(...layout.rows.map((r) => r.columns.length));
  const card = (m: TournamentMatchV2) => <BracketMatchCard key={m.match_id} match={m} summary={summary} stageName="Play-In" winnerTag="Play-In winner" />;
  const finalName = (layout.final?.matches.length === 1 && kit.names.get(layout.final.matches[0].match_id)) || "Final";
  return (
    <div className="space-y-3 p-4" data-testid="playin-bracket" data-bracket="double_elimination">
      <AuthorityNotice summary={summary} />
      <div className="relative min-w-[860px]">
        <Connectors edges={edges} version={version} />
        <div className="grid grid-cols-[minmax(0,2.05fr)_minmax(0,0.95fr)] gap-8">
          <div className="flex flex-col gap-3">
            {layout.rows.map((row) => (
              <div
                key={row.key}
                data-testid={`lane-${row.key}`}
                className={cn(
                  "grid grid-cols-[14px_minmax(0,1fr)] gap-3 rounded-2xl border py-3 pl-2.5 pr-3",
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
                <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                  {row.columns.map((col) => (
                    <div key={col.cell} data-testid="bracket-column" data-cell={col.cell} className="flex min-w-0 flex-col justify-around gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/70">
                        {roundWord(col.cell)}
                        {daySpan(col.matches) && <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {daySpan(col.matches)}</span>}
                      </p>
                      {col.matches.map(card)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {layout.final && (
            <div className="flex min-w-0 flex-col justify-center gap-3" data-testid="bracket-final">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#c9a84c]">
                {finalName}
                {daySpan(layout.final.matches) && <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {daySpan(layout.final.matches)}</span>}
              </p>
              {layout.final.matches.map(card)}
              <SwissEndCap />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── phone ──────────────────────────────────────────────────────────────── */

interface Step {
  key: string;
  label: string;
  col: BracketColumn;
}

/** A column's URL key: upstream's cell slug, else its name made URL-safe. */
const stepKey = (col: BracketColumn) =>
  col.matches[0]?.bracket?.cell_slug ?? col.cell.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function PhoneRounds({ matches }: { matches: TournamentMatchV2[] }) {
  const kit = useKit();
  const summary = kit.state.play_in;
  const layout = useMemo(() => doubleElimLayout(matches), [matches]);
  const steps: Step[] = useMemo(() => {
    if (!layout) return [];
    const out: Step[] = [];
    for (const row of layout.rows) {
      for (const col of row.columns) out.push({ key: stepKey(col), label: `${row.key === "upper" ? "Upper" : "Lower"} ${roundWord(col.cell).replace(/s$/, "")}`, col });
    }
    if (layout.final) out.push({ key: stepKey(layout.final), label: "Final", col: layout.final });
    return out;
  }, [layout]);
  const focusId = kit.state.matches.find((m) => m.stage === "play_in" && m.state === "live")?.match_id ?? kit.state.next_match_id;
  const initial = Math.max(0, steps.findIndex((s) => s.col.matches.some((m) => m.match_id === focusId)));
  const x = useExperience();
  const fromUrl = steps.findIndex((s) => s.key === x.loc.step);
  const chosen = fromUrl >= 0 ? fromUrl : null;
  const setChosen = (i: number) => x.selectStep(steps[i].key);
  if (!layout) {
    return (
      <div className="space-y-3 px-3">
        <AuthorityNotice summary={summary} />
        <CellList matches={matches} />
      </div>
    );
  }
  const at = chosen ?? initial;
  const step = steps[at];
  return (
    <div className="space-y-3" data-testid="playin-rounds">
      <div className="-mx-3 overflow-x-auto px-3 pb-1" data-swipe-ignore>
        <ol className="flex w-max items-center gap-1" aria-label="Play-In rounds">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />}
              <button
                type="button"
                aria-pressed={i === at}
                data-testid="round-step"
                onClick={() => setChosen(i)}
                className={cn(
                  "min-h-11 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-colors",
                  i === at ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.1] text-[#f1dc9c]" : "border-white/10 text-foreground/75",
                )}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <AuthorityNotice summary={summary} />
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {daySpan(step.col.matches)} · {step.col.matches.length} {step.col.matches.length === 1 ? "match" : "matches"}
      </p>
      <div className="space-y-3" data-testid="round-cards">
        {step.col.matches.map((m) => (
          <BracketMatchCard key={m.match_id} match={m} summary={summary} stageName="Play-In" winnerTag="Play-In winner" />
        ))}
      </div>
      {at === steps.length - 1 && <SwissEndCap />}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={at === 0}
          onClick={() => setChosen(at - 1)}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground/80 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {at > 0 ? steps[at - 1].label : ""}
        </button>
        <button
          type="button"
          disabled={at === steps.length - 1}
          onClick={() => setChosen(at + 1)}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#e3c66f] disabled:opacity-30"
        >
          {at < steps.length - 1 ? steps[at + 1].label : ""} <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function PlayInWorkspace() {
  const kit = useKit();
  const x = useExperience();
  const matches = stageMatches(kit.state, "play_in", kit.state.play_in);
  const selection = useMemo(() => ({ selectedId: x.loc.matchId, onSelect: x.selectMatch, dense: x.desktop }), [x.loc.matchId, x.selectMatch, x.desktop]);
  if (!matches.length) return <EmptyStage text="No Play-In matches are on the official schedule right now." />;
  return (
    <BracketSelectContext.Provider value={selection}>
      {x.desktop ? <DesktopBracket matches={matches} /> : <PhoneRounds matches={matches} />}
    </BracketSelectContext.Provider>
  );
}
