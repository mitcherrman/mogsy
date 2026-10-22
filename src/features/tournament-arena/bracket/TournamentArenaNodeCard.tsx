/**
 * One bracket node: two entrant rows, the series score, the node's state.
 *
 * Forked from `pro-play/tournament/TournamentBracket.tsx` `BracketMatchCard`
 * with the `bracket_authority` / `useKit` / `TeamCrest` / `matchHref` coupling
 * removed: entrants are people (avatar + name + seed), the card is a toggle
 * button that selects the node for the detail panel, and motion is layered
 * on by the parent (`ta-rise`, `ta-slot--arrived`).
 *
 * TRUTHFULNESS: an unfilled slot prints its source ("Winner of SF1"); a
 * winner is drawn only when the contract names one.
 */
import { memo, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { nodeLabel, slotSourceLabel, type ArenaEntrant, type ArenaNode } from "../contracts";
import { entrantById } from "../identity";
import { matchPoint, SeriesPips } from "../ceremony/SeriesPips";
import { EntrantAvatar, Pill } from "../ui/parts";

export interface NodeCardProps {
  node: ArenaNode;
  nodes: readonly ArenaNode[];
  entrants: readonly ArenaEntrant[];
  totalRounds: number;
  viewerId: string | null;
  selected: boolean;
  compact?: boolean;
  onSelect: (nodeId: string) => void;
  /** Slot index whose entrant just arrived (advancement beat). */
  arrivedSlot?: 0 | 1 | null;
  /** Wins at the previous revision, so new pips stamp in. */
  prevWins?: [number, number] | null;
  style?: CSSProperties;
  className?: string;
  revealDelayMs?: number;
}

const STATUS_PILL: Record<ArenaNode["status"], { tone: "live" | "gold" | "ready" | "muted"; label: string } | null> = {
  pending: null,
  ready: { tone: "ready", label: "Ready" },
  live: { tone: "live", label: "Live" },
  complete: { tone: "gold", label: "Final" },
  walkover: { tone: "muted", label: "Walkover" },
  bye: { tone: "muted", label: "Bye" },
};

function outcomeOf(node: ArenaNode, i: 0 | 1): "win" | "loss" | null {
  if (!node.winner_profile_id) return null;
  const pid = node.slots[i].profile_id;
  if (!pid) return null;
  return pid === node.winner_profile_id ? "win" : "loss";
}

export const TournamentArenaNodeCard = memo(function TournamentArenaNodeCard({
  node, nodes, entrants, totalRounds, viewerId, selected, compact = false, onSelect, arrivedSlot = null, prevWins = null, style, className, revealDelayMs,
}: NodeCardProps) {
  const label = nodeLabel(node, totalRounds);
  const isFinal = node.round === totalRounds;
  const pill = STATUS_PILL[node.status];
  const viewerIn = Boolean(viewerId) && node.slots.some((s) => s.profile_id === viewerId);
  const started = node.status === "live" || node.status === "complete" || node.status === "walkover";
  const mp = node.status === "live" ? matchPoint(node.slots[0].wins, node.slots[1].wins, node.best_of) : null;
  const showScores = started && node.best_of > 1;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-current={viewerIn && node.status === "live" ? "step" : undefined}
      aria-label={`${isFinal ? "Final" : label}: ${node.slots.map((s) => entrantById(entrants, s.profile_id)?.display_name ?? slotSourceLabel(s.source, nodes, totalRounds)).join(" versus ")}${pill ? `, ${pill.label}` : ""}`}
      data-testid="ta-node"
      data-node={node.node_id}
      data-status={node.status}
      data-selected={selected}
      data-final={isFinal}
      data-viewer={viewerIn}
      onClick={() => onSelect(node.node_id)}
      className={cn("ta-node", compact && "ta-node--compact", revealDelayMs !== undefined && "ta-rise", className)}
      style={{ ...style, ...(revealDelayMs !== undefined ? ({ "--ta-delay": `${revealDelayMs}ms` } as CSSProperties) : null) }}
    >
      <span className="ta-node__head">
        <b className={cn(isFinal && "text-[#f1dc9c]")}>{isFinal ? "Final" : label}</b>
        <span className="opacity-70">· Bo{node.best_of}</span>
        {mp !== null && <span className="ta-matchpoint ml-1">Match point</span>}
        <span className="ml-auto">{pill && <Pill tone={pill.tone}>{pill.label}</Pill>}</span>
      </span>
      {node.slots.map((slot, i) => {
        const e = entrantById(entrants, slot.profile_id);
        const outcome = outcomeOf(node, i as 0 | 1);
        const stampFrom = prevWins ? prevWins[i] : undefined;
        return (
          <span
            key={i}
            className={cn("ta-slot", arrivedSlot === i && "ta-slot--arrived")}
            data-slot-row={`${node.node_id}:${i}`}
            data-outcome={outcome ?? undefined}
            data-testid="ta-slot"
          >
            {e ? (
              <>
                <EntrantAvatar entrant={e} size={compact ? "xs" : "sm"} crown={false} />
                <span className="ta-slot__name">
                  {e.display_name}
                  {!compact && e.seed && <span className="ta-slot__sub">Seed {e.seed}{e.profile_id === viewerId ? " · You" : ""}</span>}
                </span>
                {showScores ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="ta-slot__score" data-testid="ta-score">{slot.wins}</span>
                    {!compact && <SeriesPips wins={slot.wins} bestOf={node.best_of} label={e.display_name} stampFrom={stampFrom} />}
                  </span>
                ) : (
                  started && <span className="ta-slot__score">{outcome === "win" ? "W" : outcome === "loss" ? "L" : ""}</span>
                )}
              </>
            ) : (
              <>
                <EntrantAvatar entrant={null} size={compact ? "xs" : "sm"} crown={false} />
                <span className="ta-slot__tbd">{slotSourceLabel(slot.source, nodes, totalRounds)}</span>
              </>
            )}
          </span>
        );
      })}
    </button>
  );
});
