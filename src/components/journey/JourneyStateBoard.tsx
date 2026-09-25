/**
 * JOURNEY-UI1 — THE TWO-SIDED JOURNEY STATE BOARD.
 *
 * One current game state, read left to right: the Journey's SUBJECT on the
 * left, its OPPONENT on the right, split by the Matchup card's seam (a VS, or
 * an attacker → target arrow on a Combat child). Drawn inside
 * `ScenarioMediaBand` — the same box every Ranked scenario card uses — so the
 * question card's geometry is the one it already has.
 *
 * TWO DENSITIES, ONE COMPONENT, CHOSEN BY THE BAND'S WIDTH (index.css
 * `.journey-board`, a container query on the band):
 *
 *   band     (desktop)  the sides stand side by side as two columns:
 *                       identity, Q/W/E/R pips, six slots, stat chips;
 *   compact  (phone)    the sides STACK as two rows, both always visible —
 *                       identity + the stats that matter on one line, kit
 *                       and items on the next. No carousel: the point of a
 *                       two-sided state is seeing both sides at once.
 *
 * INFORMATION HIERARCHY. Always: identity, level, ranks, items. Stats: all of
 * a side's (few) premise stats on the band; on compact only those the current
 * question is about or that just changed (at most two). Everything else is one
 * tap away in the State sheet. `focus` (from the server) outlines the facts
 * the question is about; `marks` (the transition into this node) keep their
 * delta face for the whole child.
 *
 * Presentation only: nothing here reads an answer, and nothing is computed.
 */
import type { ReactNode } from "react";
import { ArrowRight, PanelTopOpen } from "lucide-react";
import type {
  JourneyFocusRef, JourneyPublicState, JourneySide, JourneySideId,
} from "@/lib/journey/contract";
import { markKey, rankFrom, transitionMarks, type JourneyMarks } from "@/lib/journey/beat";
import {
  AbilityRankPips, InventorySlots, JourneyPortrait, LevelBadge, StatChip,
} from "./JourneyPrimitives";

/** Compact rows show at most this many stats; the sheet shows them all. */
export const COMPACT_STAT_LIMIT = 2;

function focusSet(refs: JourneyFocusRef[], side: JourneySideId) {
  const stats = new Set<string>();
  const abilities = new Set<string>();
  const items = new Set<number>();
  let level = false;
  for (const r of refs) {
    if (r.side !== side) continue;
    if (r.kind === "stat") stats.add(r.key);
    if (r.kind === "ability") abilities.add(r.key);
    if (r.kind === "item") items.add(r.key);
    if (r.kind === "level") level = true;
  }
  return { stats, abilities, items, level };
}

function SidePanel({ state, side, marks }: {
  state: JourneyPublicState;
  side: JourneySide;
  marks: JourneyMarks;
}) {
  const id = side.side;
  const focus = focusSet(state.focus.refs, id);
  const combat = state.focus.combat;
  const role = combat ? (combat.attacker === id ? "Attacker" : "Target") : null;
  const newSlots = new Set(side.items.map((it) => it.slot).filter((s) => marks.newItems.has(markKey(id, s))));
  // Compact priority: what the question is about, then what just changed.
  const ranked = [...side.stats].sort((a, b) => {
    const score = (key: string) => (focus.stats.has(key) ? 2 : 0) + (marks.stat.has(markKey(id, key)) ? 1 : 0);
    return score(b.key) - score(a.key);
  });
  const compactKeys = new Set(ranked
    .filter((s) => focus.stats.has(s.key) || marks.stat.has(markKey(id, s.key)))
    .slice(0, COMPACT_STAT_LIMIT).map((s) => s.key));
  const level = marks.level[id] ?? null;
  return (
    <section data-testid={`journey-side-${id}`} data-side={id}
      data-combat-role={role?.toLowerCase()}
      aria-label={`${side.championName}, level ${side.level}${role ? `, ${role.toLowerCase()}` : ""}`}
      className="journey-side">
      <header className="journey-side__id">
        <JourneyPortrait side={side} />
        <div className="journey-side__name min-w-0">
          <span className="journey-side__champion truncate font-black uppercase tracking-[0.08em] text-white"
            data-testid={`journey-name-${id}`}>
            {side.championName}
          </span>
          <span className="flex items-center gap-1">
            <LevelBadge level={side.level} from={level?.from ?? null} focused={focus.level}
              testId={`journey-level-${id}`} />
            {role && (
              <span data-testid={`journey-role-${id}`}
                className={`journey-chip rounded-md px-1 font-bold uppercase tracking-[0.18em] ${
                  role === "Attacker" ? "bg-[#d4b35a]/20 text-[#f3dca0]" : "bg-[#7fb2d4]/20 text-[#cfe6f5]"}`}>
                <span className="journey-role-long">{role}</span>
                <span aria-hidden className="journey-role-short">{role === "Attacker" ? "Atk" : "Tgt"}</span>
              </span>
            )}
          </span>
        </div>
      </header>
      <div className="journey-side__kit" role="group" aria-label={`${side.championName} abilities`}>
        {side.abilities.map((a) => (
          <AbilityRankPips key={a.slot} ability={a} champion={side.championName} side={id}
            rankFrom={marks.rank.has(markKey(id, a.slot)) ? rankFrom(state.transition, id, a.slot) : null}
            unlocked={marks.unlocked.has(markKey(id, a.slot))}
            focused={focus.abilities.has(a.slot)} />
        ))}
      </div>
      <div className="journey-side__items">
        <InventorySlots side={side} items={side.items} newSlots={newSlots} focusSlots={focus.items} />
      </div>
      <div className="journey-side__stats">
        {ranked.map((s) => (
          <span key={s.key} className="journey-stat-cell"
            data-compact={compactKeys.has(s.key) ? "true" : "false"}>
            <StatChip side={id} stat={s}
              delta={marks.stat.get(markKey(id, s.key)) ?? null}
              focused={focus.stats.has(s.key)} />
          </span>
        ))}
      </div>
    </section>
  );
}

export function JourneyStateBoard({ state, beatActive = false, onOpenDetail, children }: {
  state: JourneyPublicState;
  /** While the canonical beat runs, the changed facts pulse. */
  beatActive?: boolean;
  onOpenDetail?: () => void;
  /** The transition beat overlay, drawn inside the board's box. */
  children?: ReactNode;
}) {
  const marks = transitionMarks(state.transition);
  const [subject, opponent] = state.sides;
  const combat = state.focus.combat;
  return (
    <div data-testid="journey-board" data-journey-key={state.journeyKey}
      data-step={state.step.index} data-node={state.step.nodeId}
      data-beat={beatActive ? "active" : "idle"}
      className="journey-vars journey-board">
      <div className="journey-board__head">
        <span className="journey-board__eyebrow truncate">
          <span className="text-[#e8c97a]">Journey</span>
          <span aria-hidden className="px-1 text-white/35">·</span>
          <span data-testid="journey-step">Step {state.step.index + 1} of {state.step.count}</span>
          {state.step.nodeLabel && (
            <>
              <span aria-hidden className="px-1 text-white/35">·</span>
              <span data-testid="journey-node-label" className="text-white/75">{state.step.nodeLabel}</span>
            </>
          )}
        </span>
        {onOpenDetail && (
          <button type="button" onClick={onOpenDetail} data-testid="journey-open-state"
            className="journey-board__state-btn inline-flex shrink-0 items-center gap-1 rounded-md border border-[#d4b35a]/40 bg-black/50 px-1.5 font-bold uppercase tracking-[0.16em] text-[#f3dca0] hover:bg-[#d4b35a]/15">
            <PanelTopOpen aria-hidden className="h-3 w-3" />
            State
          </button>
        )}
      </div>
      <div className="journey-board__sides">
        <SidePanel state={state} side={subject} marks={marks} />
        <div aria-hidden className="journey-board__seam" data-testid="journey-seam"
          data-seam={combat ? "combat" : "versus"}>
          {combat ? (
            <ArrowRight className={`h-4 w-4 text-[#e8c97a] ${combat.attacker === "opponent" ? "rotate-180" : ""}`} />
          ) : (
            <span className="font-black tracking-[0.2em] text-[#e8c97a]/80">VS</span>
          )}
        </div>
        <SidePanel state={state} side={opponent} marks={marks} />
      </div>
      {children}
    </div>
  );
}
