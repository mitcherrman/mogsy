/**
 * Expanded match detail for one bracket node: the two entrants face to face,
 * the series score, every game played, and the actions the viewer may take.
 *
 * "Play" / "Enter match" leads to the duel experience. In production that is
 * where `QuizRankedMatch host="tournament"` mounts (handoff §7.3 "Match
 * handoff"); here it is the fixture duel, which commits a scripted result to
 * this node when it ends.
 */
import { Swords, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

import { nodeLabel, roundName, slotSourceLabel, type ArenaEntrant, type ArenaEvent, type ArenaNode } from "../contracts";
import { winsNeeded } from "../engine/advance";
import { accentStyle, entrantById } from "../identity";
import { matchPoint, SeriesPips } from "../ceremony/SeriesPips";
import { Btn, EntrantAvatar, Eyebrow, Pill, VersusMark } from "../ui/parts";

export interface NodeActions {
  onPlay: (nodeId: string) => void;
  onEnterMatch: (nodeId: string) => void;
  onStepResult: (nodeId: string) => void;
  onWalkover: (nodeId: string, side: 0 | 1) => void;
  onReplayFinals?: () => void;
}

export function NodeDetail({ event, node, viewerId, actions, onClose, fixture }: {
  event: ArenaEvent;
  node: ArenaNode;
  viewerId: string | null;
  actions: NodeActions;
  onClose?: () => void;
  /** Show the fixture-only controls. */
  fixture: boolean;
}) {
  const total = event.bracket?.rounds ?? 1;
  const nodes = event.bracket?.nodes ?? [];
  const a = entrantById(event.entrants, node.slots[0].profile_id);
  const b = entrantById(event.entrants, node.slots[1].profile_id);
  const viewerIn = Boolean(viewerId) && node.slots.some((s) => s.profile_id === viewerId);
  const organizer = event.viewer_role === "organizer" || event.viewer_role === "cohost";
  const isFinal = node.round === total;
  const need = winsNeeded(node.best_of);
  const mp = node.status === "live" ? matchPoint(node.slots[0].wins, node.slots[1].wins, node.best_of) : null;
  const winner = entrantById(event.entrants, node.winner_profile_id);
  const settled = node.status === "complete" || node.status === "walkover" || node.status === "bye";
  return (
    <div className="flex flex-col gap-4" data-testid="ta-node-detail" data-node={node.node_id}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Eyebrow>{roundName(node.round, total)} · {isFinal ? "Final" : nodeLabel(node, total)} · Bo{node.best_of}</Eyebrow>
          <h3 className="ta-title mt-1 truncate text-[20px] font-bold text-white">
            {a?.display_name ?? slotSourceLabel(node.slots[0].source, nodes, total)} <span className="text-[#c9a84c]">vs</span> {b?.display_name ?? slotSourceLabel(node.slots[1].source, nodes, total)}
          </h3>
        </div>
        {onClose && <Btn size="sm" onClick={onClose} aria-label="Close match detail">Close</Btn>}
      </div>

      {/* the two seats */}
      <div className="ta-plate ta-plate--gold grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4">
        <Seat entrant={a} side="left" wins={node.slots[0].wins} need={need} outcome={outcome(node, 0)} isViewer={a?.profile_id === viewerId} matchPoint={mp === 0} source={slotSourceLabel(node.slots[0].source, nodes, total)} />
        <div className="flex flex-col items-center gap-1">
          <VersusMark size={44} />
          {node.best_of > 1 && (
            <p className="ta-num text-[22px] font-black leading-none text-white" data-testid="ta-series-score">
              {node.slots[0].wins}<span className="mx-1 text-white/40">–</span>{node.slots[1].wins}
            </p>
          )}
        </div>
        <Seat entrant={b} side="right" wins={node.slots[1].wins} need={need} outcome={outcome(node, 1)} isViewer={b?.profile_id === viewerId} matchPoint={mp === 1} source={slotSourceLabel(node.slots[1].source, nodes, total)} />
      </div>

      {/* status line */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[rgba(215,205,180,0.75)]">
        {node.status === "live" && <Pill tone="live">Live</Pill>}
        {node.status === "ready" && <Pill tone="ready">Ready to play</Pill>}
        {node.status === "pending" && <Pill tone="muted">Waiting on earlier results</Pill>}
        {node.status === "bye" && <Pill tone="muted">Bye</Pill>}
        {node.status === "walkover" && <Pill tone="muted">Walkover</Pill>}
        {node.status === "complete" && <Pill tone="gold">Final</Pill>}
        {winner && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#f1dc9c]"><Trophy className="h-3.5 w-3.5" aria-hidden="true" />{winner.display_name} advances{isFinal ? " as champion" : ""}</span>
        )}
        {mp !== null && <span className="ta-matchpoint">Match point</span>}
      </div>

      {/* games */}
      {node.games.length > 0 && (
        <ol className="flex flex-col gap-1.5" aria-label="Games" data-testid="ta-games">
          {node.games.map((g) => {
            const w = entrantById(event.entrants, g.winner_profile_id);
            return (
              <li key={g.game_index} className="ta-plate flex items-center gap-3 px-3 py-2 text-[12.5px]">
                <span className="w-14 shrink-0 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[rgba(215,205,180,0.6)]">Game {g.game_index}</span>
                <span className="ta-num flex-1 font-semibold text-white">
                  {g.score_a ?? "–"} <span className="text-white/40">·</span> {g.score_b ?? "–"}
                </span>
                {g.outcome === "draw" ? <Pill tone="muted">Draw · replayed</Pill> : w ? <span className="truncate font-semibold text-[#f1dc9c]">{w.display_name}</span> : null}
                {g.outcome === "forfeit" && <Pill tone="muted">Forfeit</Pill>}
              </li>
            );
          })}
        </ol>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2" data-testid="ta-node-actions">
        {viewerIn && node.status === "ready" && (
          <Btn tone="primary" onClick={() => actions.onPlay(node.node_id)} data-testid="ta-play"><Swords className="h-4 w-4" aria-hidden="true" />Play your match</Btn>
        )}
        {viewerIn && node.status === "live" && (
          <Btn tone="primary" onClick={() => actions.onEnterMatch(node.node_id)} data-testid="ta-enter"><Swords className="h-4 w-4" aria-hidden="true" />Enter the match</Btn>
        )}
        {isFinal && actions.onReplayFinals && (node.status === "ready" || node.status === "live") && (
          <Btn onClick={actions.onReplayFinals} data-testid="ta-replay-finals">Finals intro</Btn>
        )}
        {organizer && !settled && a && b && (
          <>
            <Btn size="sm" tone="danger" onClick={() => actions.onWalkover(node.node_id, 0)}>Walkover · {a.display_name}</Btn>
            <Btn size="sm" tone="danger" onClick={() => actions.onWalkover(node.node_id, 1)}>Walkover · {b.display_name}</Btn>
          </>
        )}
        {fixture && !settled && a && b && (
          <Btn size="sm" onClick={() => actions.onStepResult(node.node_id)} data-testid="ta-step-node" title="Fixture: commit the next scripted game">Step result</Btn>
        )}
      </div>
      {viewerIn && (node.status === "ready" || node.status === "live") && (
        <p className="text-[11px] leading-snug text-[rgba(215,205,180,0.55)]">
          In production this mounts the Ranked match UI with <code className="text-[#f1dc9c]">host="tournament"</code>; the result returns here and the bracket advances.
        </p>
      )}
    </div>
  );
}

function outcome(node: ArenaNode, i: 0 | 1): "win" | "loss" | null {
  if (!node.winner_profile_id) return null;
  const pid = node.slots[i].profile_id;
  return pid ? (pid === node.winner_profile_id ? "win" : "loss") : null;
}

function Seat({ entrant, side, wins, need, outcome, isViewer, matchPoint, source }: {
  entrant: ArenaEntrant | null;
  side: "left" | "right";
  wins: number;
  need: number;
  outcome: "win" | "loss" | null;
  isViewer: boolean;
  matchPoint: boolean;
  source: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-1.5 text-center", outcome === "loss" && "opacity-55 saturate-50")} style={accentStyle(entrant?.profile_id)} data-testid={`ta-detail-seat-${side}`}>
      <EntrantAvatar entrant={entrant} size="lg" hex facing={side === "left" ? "right" : "left"} />
      <p className={cn("ta-title line-clamp-2 w-full text-[12px] tracking-normal [overflow-wrap:anywhere] font-semibold leading-tight", outcome === "win" ? "text-[#f1dc9c]" : "text-white")}>{entrant?.display_name ?? source}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ta-accent)]">
        {entrant?.seed ? `Seed ${entrant.seed}` : "TBD"}{isViewer ? " · You" : ""}
      </p>
      {need > 1 && entrant && <SeriesPips wins={wins} bestOf={need * 2 - 1} label={entrant.display_name} size="md" />}
      {matchPoint && <span className="ta-matchpoint">Match point</span>}
    </div>
  );
}
