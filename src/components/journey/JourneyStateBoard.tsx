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
 *
 * JOURNEY-PRES-V1 — each side sits on its champion's splash: masked toward the
 * seam, darkened, low opacity, `aria-hidden`, absolutely positioned (it lays
 * out nothing, so the board cannot change size when the art loads or fails).
 * The champion is the side's public identity (`side.championName`, already
 * printed beside it), so the art discloses nothing the board does not.
 *
 * K2 — KNOWLEDGE MARKS. A portrait or ability the Journey has established
 * facts about wears a tiny `!` (`JourneyKnowledgeMark`), keyed by K1's object
 * key (`player:<champion>:<slot>` / `opponent:<champion>`). Each portrait and
 * ability sits in a same-size `journey-know-host`, marked or not, so a mark
 * appearing changes no box. Items are never marked (K1 has no item fact).
 */
import { useState, type ReactNode } from "react";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";
import { QuestionRoleEmblems } from "@/components/ranked-arena/RoleEmblem";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { ArrowRight, PanelTopOpen } from "lucide-react";
import type {
  JourneyFocusRef, JourneyPublicState, JourneySide, JourneySideId,
} from "@/lib/journey/contract";
import { itemGainTags, markKey, rankFrom, transitionMarks, type JourneyMarks } from "@/lib/journey/beat";
import { knowledgeKeyFor, NO_KNOWLEDGE, type JourneyKnowledge } from "@/lib/journey/knowledge";
import {
  AbilityRankPips, InventorySlots, JourneyPortrait, LevelBadge, StatChip,
} from "./JourneyPrimitives";
import { JourneyKnowledgeMark } from "./JourneyKnowledgeMark";

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

/** The side's decorative splash underlay. Nothing when there is no art. */
function SideSplash({ side }: { side: JourneySide }) {
  const assets = useMasteryAssets();
  const [broken, setBroken] = useState(false);
  const url = assets.championSplashUrl?.(side.championId, side.championName) ?? null;
  if (!url || broken) return null;
  return (
    <span aria-hidden data-testid={`journey-splash-${side.side}`} data-champion={side.championName}
      className="journey-side__splash">
      <img src={url} alt="" draggable={false} loading="lazy" decoding="async"
        onError={() => setBroken(true)} />
    </span>
  );
}

function SidePanel({ state, side, marks, knowledge, gains }: {
  state: JourneyPublicState;
  side: JourneySide;
  marks: JourneyMarks;
  knowledge: JourneyKnowledge;
  /** MOTION-V1 — while the beat runs: a new item's server stat lines, by `side:slot`. */
  gains: ReadonlyMap<string, string[]> | null;
}) {
  const id = side.side;
  const championMark = knowledge.get(knowledgeKeyFor(side)) ?? null;
  const focus = focusSet(state.focus.refs, id);
  const combat = state.focus.combat;
  const role = combat ? (combat.attacker === id ? "Attacker" : "Target") : null;
  const newSlots = new Set(side.items.map((it) => it.slot).filter((s) => marks.newItems.has(markKey(id, s))));
  // Compact priority: what the question is about, then what just changed.
  const ranked = [...side.stats].sort((a, b) => {
    const changed = (key: string) => marks.stat.has(markKey(id, key)) || marks.gain.has(markKey(id, key));
    const score = (key: string) => (focus.stats.has(key) ? 2 : 0) + (changed(key) ? 1 : 0);
    return score(b.key) - score(a.key);
  });
  const compactKeys = new Set(ranked
    .filter((s) => focus.stats.has(s.key) || marks.stat.has(markKey(id, s.key)) || marks.gain.has(markKey(id, s.key)))
    .slice(0, COMPACT_STAT_LIMIT).map((s) => s.key));
  const level = marks.level[id] ?? null;
  return (
    <section data-testid={`journey-side-${id}`} data-side={id}
      data-combat-role={role?.toLowerCase()}
      aria-label={`${side.championName}, level ${side.level}${role ? `, ${role.toLowerCase()}` : ""}`}
      className="journey-side">
      <SideSplash side={side} />
      <header className="journey-side__id">
        <span className="journey-know-host journey-know-host--portrait" data-know-key={knowledgeKeyFor(side)}>
          <JourneyPortrait side={side} />
          {championMark && (
            <JourneyKnowledgeMark mark={championMark} name={side.championName} placement="portrait"
              testId={`journey-know-${id}-champion`} />
          )}
        </span>
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
        {side.abilities.map((a) => {
          const known = knowledge.get(knowledgeKeyFor(side, a.slot)) ?? null;
          return (
            <span key={a.slot} className="journey-know-host journey-know-host--ability"
              data-know-key={knowledgeKeyFor(side, a.slot)}>
              <AbilityRankPips ability={a} champion={side.championName} side={id}
                rankFrom={marks.rank.has(markKey(id, a.slot)) ? rankFrom(state.transition, id, a.slot) : null}
                unlocked={marks.unlocked.has(markKey(id, a.slot))}
                focused={focus.abilities.has(a.slot)} />
              {known && (
                <JourneyKnowledgeMark mark={known} name={`${side.championName} ${a.slot}`} placement="ability"
                  testId={`journey-know-${id}-${a.slot}`} />
              )}
            </span>
          );
        })}
      </div>
      <div className="journey-side__items">
        <InventorySlots side={side} items={side.items} newSlots={newSlots} focusSlots={focus.items}
          gainTags={gains ? new Map([...newSlots].flatMap((slot) => {
            const tags = gains.get(markKey(id, slot));
            return tags ? [[slot, tags] as const] : [];
          })) : undefined} />
      </div>
      <div className="journey-side__stats">
        {ranked.map((s) => (
          <span key={s.key} className="journey-stat-cell"
            data-compact={compactKeys.has(s.key) ? "true" : "false"}>
            <StatChip side={id} stat={s}
              delta={marks.stat.get(markKey(id, s.key)) ?? null}
              gain={marks.gain.get(markKey(id, s.key)) ?? null}
              focused={focus.stats.has(s.key)} />
          </span>
        ))}
      </div>
    </section>
  );
}

export function JourneyStateBoard({
  state, beatActive = false, onOpenDetail, questionRoles = null, knowledge = NO_KNOWLEDGE, beatStamp = null, children,
}: {
  state: JourneyPublicState;
  /** K2 — the established facts to mark on this board's objects. */
  knowledge?: JourneyKnowledge;
  /**
   * JOURNEY-PRES-V1 — the CURRENT QUESTION's RQ1 roles (`challenge.roles`),
   * beside "Step N of M". The step header is the one line that already
   * describes the question on screen, and it costs the height-locked card
   * nothing. A universal question (no roles) shows no badge; nothing here
   * reads the player's role or the recipe's.
   */
  questionRoles?: readonly RankedRole[] | null;
  /** While the canonical beat runs, the changed facts pulse. */
  beatActive?: boolean;
  onOpenDetail?: () => void;
  /**
   * JOURNEY-MOTION-V1 — the beat's compact stamp. While it is given it takes
   * the node label's place in the header row (same fixed-height, truncating
   * line), so it costs the board no box.
   */
  beatStamp?: ReactNode;
  /** The transition beat's status region, drawn inside the board's box. */
  children?: ReactNode;
}) {
  const marks = transitionMarks(state.transition);
  const gains = beatActive ? itemGainTags(state.transition) : null;
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
          {beatStamp ? (
            <>
              <span aria-hidden className="px-1 text-white/35">·</span>
              {beatStamp}
            </>
          ) : state.step.nodeLabel && (
            <>
              <span aria-hidden className="px-1 text-white/35">·</span>
              <span data-testid="journey-node-label" className="text-white/75">{state.step.nodeLabel}</span>
            </>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
        <QuestionRoleEmblems roles={questionRoles} size="card" testId="journey-question-roles"
          className="journey-board__roles" />
        {onOpenDetail && (
          <button type="button" onClick={onOpenDetail} data-testid="journey-open-state"
            className="journey-board__state-btn inline-flex shrink-0 items-center gap-1 rounded-md border border-[#d4b35a]/40 bg-black/50 px-1.5 font-bold uppercase tracking-[0.16em] text-[#f3dca0] hover:bg-[#d4b35a]/15">
            <PanelTopOpen aria-hidden className="h-3 w-3" />
            State
          </button>
        )}
        </span>
      </div>
      <div className="journey-board__sides">
        <SidePanel state={state} side={subject} marks={marks} knowledge={knowledge} gains={gains} />
        <div aria-hidden className="journey-board__seam" data-testid="journey-seam"
          data-seam={combat ? "combat" : "versus"}>
          {combat ? (
            <ArrowRight className={`h-4 w-4 text-[#e8c97a] ${combat.attacker === "opponent" ? "rotate-180" : ""}`} />
          ) : (
            <span className="font-black tracking-[0.2em] text-[#e8c97a]/80">VS</span>
          )}
        </div>
        <SidePanel state={state} side={opponent} marks={marks} knowledge={knowledge} gains={gains} />
      </div>
      {children}
    </div>
  );
}
