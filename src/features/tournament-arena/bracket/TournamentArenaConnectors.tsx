/**
 * The bracket's connecting paths, drawn from the PURE layout (no DOM
 * measuring): every edge joins a source card's right edge to the exact slot
 * row its winner fills. Decided edges turn gold; a freshly decided edge glows
 * and the winner's chip travels along it (`ta-glide`, CSS `offset-path`).
 */
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import type { ArenaEntrant, ArenaNode } from "../contracts";
import { entrantById } from "../identity";
import { EntrantAvatar } from "../ui/parts";
import type { BracketPlane } from "./layout";

export interface GlideBeat {
  /** Edge from → to; the chip is the winner of `from`. */
  from: string;
  to: string;
  key: string;
}

export function TournamentArenaConnectors({ plane, nodes, entrants, glides, drawing, revealStepMs = 160 }: {
  plane: BracketPlane;
  nodes: readonly ArenaNode[];
  entrants: readonly ArenaEntrant[];
  /** Advancement beats in flight. */
  glides: readonly GlideBeat[];
  /** First reveal: edges draw themselves round by round. */
  drawing: boolean;
  revealStepMs?: number;
}) {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  return (
    <>
      <svg className="ta-connectors" width={plane.width} height={plane.height} aria-hidden="true" data-testid="ta-connectors">
        {plane.edges.map((e) => {
          const src = byId.get(e.from);
          const done = Boolean(src?.winner_profile_id);
          const live = src?.status === "live";
          const glowing = glides.some((g) => g.from === e.from && g.to === e.to);
          const round = src?.round ?? 1;
          return (
            <path
              key={`${e.from}>${e.to}`}
              d={e.d}
              data-edge={`${e.from}>${e.to}`}
              data-done={done}
              className={cn("ta-connector", done && "ta-connector--done", live && !done && "ta-connector--live", glowing && "ta-connector--glow", drawing && "ta-connector--draw")}
              style={{ "--ta-len": e.length, "--ta-delay": `${round * revealStepMs + 180}ms` } as CSSProperties}
            />
          );
        })}
      </svg>
      {glides.map((g) => {
        const edge = plane.edges.find((e) => e.from === g.from && e.to === g.to);
        const src = byId.get(g.from);
        const winner = entrantById(entrants, src?.winner_profile_id ?? null);
        if (!edge || !winner) return null;
        return (
          <span key={g.key} className="ta-glide" style={{ "--ta-path": `"${edge.d}"` } as CSSProperties} data-testid="ta-glide" aria-hidden="true">
            <span className="ta-glide__chip">
              <EntrantAvatar entrant={winner} size="xs" crown={false} />
              {winner.display_name}
            </span>
          </span>
        );
      })}
    </>
  );
}
