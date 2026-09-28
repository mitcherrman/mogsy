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
 *
 * JP3 — THE BOARD IS THE LEARNER'S NOTEBOOK. One grammar (`knowledge.ts`): a
 * learned value FILLS the board's `?` for it — Ahri's "Armor ?" becomes
 * "Armor 24 !" at Step 3's reveal and stays; Zed's "E raw damage ?" becomes
 * "E raw damage 85 !" at Step 2's. The `!` sits on the most specific object:
 * the stat chip for a stat, the ability icon for the ability's facts, the
 * portrait for anything else. The moment a value is learned it glows once
 * (`useJustLearned`), then settles. What is learned is K2's join over the
 * learner ledger, so a wrong answer or a timeout fills it exactly as a right
 * one does; an unreached child fills nothing.
 *
 * JP3 — THE ART. On the band the champions' art is a board-level layer: each
 * champion's loading-screen art (composed on the champion; the splash if
 * absent) large at its OUTER edge, face and upper body, darkening into the
 * seam so the state stays the brightest thing on it. The compact phone rows
 * keep their quieter per-row splash. Decorative, `aria-hidden`, absolutely
 * positioned: the board's box never depends on art loading.
 *
 * JP3 — THE MICRO-CHAIN beside "Step N of M" (`lib/journey/chain.ts`).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";
import { QuestionRoleEmblems } from "@/components/ranked-arena/RoleEmblem";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { ArrowRight, Calculator, Check, PanelTopOpen } from "lucide-react";
import type {
  JourneyFocusRef, JourneyPublicState, JourneySide, JourneySideId,
} from "@/lib/journey/contract";
import { itemGainTags, markKey, rankFrom, transitionMarks, type JourneyMarks } from "@/lib/journey/beat";
import {
  knowledgeKeyFor, learnedRawDamage, learnedStatFact, markOf, markWithout, NO_KNOWLEDGE,
  type JourneyKnowledge, type KnowledgeFact,
} from "@/lib/journey/knowledge";
import type { JourneyChainNode } from "@/lib/journey/chain";
import type { AbilitySlot } from "@/lib/journey/contract";
import {
  AbilityReadoutChip, AbilityRankPips, InventorySlots, JourneyPortrait, LevelBadge, StatChip,
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

/**
 * JP3 — one champion's art on the band, at the board's outer edge. The
 * loading-screen art first (portrait, composed on the champion, so the crop
 * lands on the face), else the splash. Nothing when there is no art.
 */
function SideArt({ side }: { side: JourneySide }) {
  const assets = useMasteryAssets();
  const [broken, setBroken] = useState(0);
  const loading = assets.championLoadingUrl?.(side.championId, side.championName) ?? null;
  const splash = assets.championSplashUrl?.(side.championId, side.championName) ?? null;
  const candidates = [loading ? { url: loading, kind: "loading" } : null, splash ? { url: splash, kind: "splash" } : null]
    .filter((c): c is { url: string; kind: string } => c !== null);
  const art = candidates[broken] ?? null;
  if (!art) return null;
  return (
    <span aria-hidden data-testid={`journey-art-${side.side}`} data-champion={side.championName}
      data-art={art.kind} className={`journey-board__art journey-board__art--${side.side}`}>
      <img key={art.url} src={art.url} alt="" draggable={false} decoding="async"
        onError={() => setBroken((n) => n + 1)} />
    </span>
  );
}

/**
 * JP3 — which learned keys appeared SINCE THE LAST RENDER, kept for one short
 * glow. The first render seeds silently (a reload mid-Journey replays no
 * glow); after that, a key that arrives — a reveal establishing a fact — is
 * "just learned" for ~1.6s. Reads only which facts exist, never correctness.
 */
function useJustLearned(keys: readonly string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const signature = keys.join("|");
  useEffect(() => {
    if (seen.current === null) { seen.current = new Set(keys); return; }
    const added = keys.filter((k) => !seen.current!.has(k));
    for (const k of keys) seen.current.add(k);
    if (added.length === 0) return;
    setFresh(new Set(added));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh(new Set()), 1600);
    // `signature` is `keys`, by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return fresh;
}

/** The side's decorative splash underlay (compact phone rows). Nothing when there is no art. */
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

const RAW_LABEL = { long: "raw damage", short: "raw" } as const;

/** JP3 — every established fact, keyed by object (for the one-shot glow). */
function learnedKeysOf(knowledge: JourneyKnowledge): string[] {
  const out: string[] = [];
  for (const m of knowledge.values()) for (const f of m.facts) out.push(`${m.key}#${f.fact}`);
  return out;
}

function SidePanel({ state, side, marks, knowledge, gains, fresh }: {
  state: JourneyPublicState;
  side: JourneySide;
  marks: JourneyMarks;
  knowledge: JourneyKnowledge;
  /** MOTION-V1 — while the beat runs: a new item's server stat lines, by `side:slot`. */
  gains: ReadonlyMap<string, string[]> | null;
  /** JP3 — fact keys learned just now (`useJustLearned`). */
  fresh: ReadonlySet<string>;
}) {
  const id = side.side;
  const championKey = knowledgeKeyFor(side);
  const isFresh = (objectKey: string, f: KnowledgeFact) => fresh.has(`${objectKey}#${f.fact}`);
  // JP3 — a learned value fills its withheld stat chip; that fact's `!` rides
  // on the chip, so the portrait keeps only what no chip shows.
  const statFacts = new Map<string, KnowledgeFact>();
  for (const st of side.stats) {
    if (!st.withheld) continue;
    const f = learnedStatFact(knowledge, side, st, state.step.index);
    if (f) statFacts.set(st.key, f);
  }
  const championFull = knowledge.get(championKey) ?? null;
  const championMark = markWithout(championFull, new Set([...statFacts.values()].map((f) => f.fact)));
  // JP3 — ability value readouts: asked / recalled by this state, or already
  // learned earlier in the Journey (the notebook keeps them).
  const readoutSlots: { slot: AbilitySlot; asked: boolean; learned: KnowledgeFact | null }[] = [];
  for (const a of side.abilities) {
    const onState = side.readouts?.find((r) => r.slot === a.slot) ?? null;
    const learned = learnedRawDamage(knowledge, side, a.slot);
    if (onState || learned) readoutSlots.push({ slot: a.slot, asked: onState !== null, learned });
  }
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
            <JourneyKnowledgeMark mark={championMark} name={side.championName} championName={side.championName}
              placement="portrait" fresh={championMark.facts.some((f) => isFresh(championKey, f))}
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
                <JourneyKnowledgeMark mark={known} name={`${side.championName} ${a.slot}`} abilityName={a.name}
                  placement="ability" fresh={known.facts.some((f) => isFresh(known.key, f))}
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
        {ranked.map((s) => {
          const fact = statFacts.get(s.key) ?? null;
          return (
            <span key={s.key} className="journey-stat-cell"
              data-compact={compactKeys.has(s.key) ? "true" : "false"}>
              <StatChip side={id} stat={s}
                delta={marks.stat.get(markKey(id, s.key)) ?? null}
                gain={marks.gain.get(markKey(id, s.key)) ?? null}
                focused={focus.stats.has(s.key)}
                learned={fact && championFull ? {
                  display: fact.display, step: fact.child + 1, fresh: isFresh(championKey, fact),
                  mark: <JourneyKnowledgeMark mark={markOf(championFull, fact)} name={`${side.championName} ${s.key}`}
                    championName={side.championName} placement="chip" fresh={isFresh(championKey, fact)}
                    testId={`journey-know-${id}-stat-${s.key}`} />,
                } : null} />
            </span>
          );
        })}
        {readoutSlots.map(({ slot, asked, learned }) => {
          const abilityKey = knowledgeKeyFor(side, slot);
          const abilityMark = knowledge.get(abilityKey) ?? null;
          const ability = side.abilities.find((a) => a.slot === slot);
          return (
            // Compact rows keep the readout the CURRENT question asks or relies on.
            <span key={`readout-${slot}`} className="journey-stat-cell" data-compact={asked ? "true" : "false"}>
              <AbilityReadoutChip side={id} slot={slot} label={RAW_LABEL}
                focused={asked && focus.abilities.has(slot)}
                learned={learned && abilityMark ? {
                  display: learned.display, step: learned.child + 1, fresh: isFresh(abilityKey, learned),
                  mark: <JourneyKnowledgeMark mark={markOf(abilityMark, learned)} name={`${side.championName} ${slot} raw damage`}
                    abilityName={ability?.name ?? null} placement="chip" fresh={isFresh(abilityKey, learned)}
                    testId={`journey-know-${id}-readout-${slot}`} />,
                } : null} />
            </span>
          );
        })}
      </div>
    </section>
  );
}

/**
 * JP3 — the micro-chain: one node per step, the reached steps named from their
 * served asks, the future ones bare. Subordinate to the board: header-sized.
 *
 * IT FITS ITSELF, NEVER CLIPS. The header line is fixed-height and shares
 * its run with "Step N of M" (and a Daily's transition note), and how long a
 * chain is depends on how many steps are named and how. So the chain tries
 * its forms in order — every reached step named, only the current one named,
 * nodes only — and keeps the first that fits its line, re-measuring when the
 * line resizes. Only what is inside the line changes; no box moves.
 */
const CHAIN_FITS = ["full", "current", "dots"] as const;
type ChainFit = (typeof CHAIN_FITS)[number];

function JourneyChain({ nodes }: { nodes: readonly JourneyChainNode[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [fit, setFit] = useState<ChainFit>("full");
  const signature = nodes.map((n) => `${n.state}:${n.label ?? ""}`).join("|");
  useLayoutEffect(() => {
    const el = ref.current;
    const line = el?.parentElement;
    if (!el || !line) return;
    // A Daily's transition note shares the line: a form fits only if the note
    // keeps a readable run (it truncates, but is never squeezed to nothing).
    const NOTE_MIN = 96;
    const measure = () => {
      const note = line.querySelector<HTMLElement>(".journey-board__node-label");
      for (const f of CHAIN_FITS) {
        el.dataset.fit = f;
        const noteOk = !note || note.clientWidth >= Math.min(note.scrollWidth, NOTE_MIN);
        if (line.scrollWidth <= line.clientWidth + 1 && noteOk) { setFit(f); return; }
      }
      setFit("dots");
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(line);
    return () => ro.disconnect();
  }, [signature]);
  return (
    <ol ref={ref} data-testid="journey-chain" data-fit={fit} className="journey-chain" aria-label="Journey chain">
      {nodes.map((n, i) => (
        <li key={n.index} data-testid={`journey-chain-${n.index}`} data-state={n.state}
          aria-label={`Step ${n.index + 1}${n.label ? `, ${n.label}` : ""}: ${
            n.state === "done" ? "established" : n.state === "current" ? "current" : "ahead"}`}
          className="journey-chain__node">
          {i > 0 && <span aria-hidden className="journey-chain__link">→</span>}
          <span aria-hidden className="journey-chain__dot">
            {n.state === "done" && <Check className="journey-chain__check" strokeWidth={3.5} />}
          </span>
          {n.label && <span aria-hidden className="journey-chain__label">{n.label}</span>}
        </li>
      ))}
    </ol>
  );
}

export function JourneyStateBoard({
  state, beatActive = false, onOpenDetail, onOpenFormulas, questionRoles = null, knowledge = NO_KNOWLEDGE,
  beatStamp = null, chain = null, children,
}: {
  state: JourneyPublicState;
  /** JP3 — the micro-chain for the step on screen (`journeyChain`); null draws none. */
  chain?: readonly JourneyChainNode[] | null;
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
  /** Opens the Formulas & Calculator sheet (JX2). */
  onOpenFormulas?: () => void;
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
  const fresh = useJustLearned(learnedKeysOf(knowledge));
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
          {chain && chain.length > 1 && !beatStamp && <JourneyChain nodes={chain} />}
          {beatStamp ? (
            <>
              <span aria-hidden className="px-1 text-white/35">·</span>
              {beatStamp}
            </>
          ) : state.step.nodeLabel && (
            <>
              <span aria-hidden className="px-1 text-white/35">·</span>
              <span data-testid="journey-node-label" className="journey-board__node-label min-w-0 truncate text-white/75">{state.step.nodeLabel}</span>
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
        {onOpenFormulas && (
          <button type="button" onClick={onOpenFormulas} data-testid="journey-open-formulas"
            aria-label="Formulas and calculator" title="Formulas and calculator"
            className="journey-board__state-btn inline-flex shrink-0 items-center gap-1 rounded-md border border-[#d4b35a]/40 bg-black/50 px-1.5 font-bold uppercase tracking-[0.16em] text-[#f3dca0] hover:bg-[#d4b35a]/15">
            <Calculator aria-hidden className="h-3 w-3" />
            {/* JP3 — icon-only where the header also carries the micro-chain. */}
            <span className="journey-board__btn-text">Calc</span>
          </button>
        )}
        </span>
      </div>
      <SideArt side={subject} />
      <SideArt side={opponent} />
      <div className="journey-board__sides">
        <SidePanel state={state} side={subject} marks={marks} knowledge={knowledge} gains={gains} fresh={fresh} />
        <div aria-hidden className="journey-board__seam" data-testid="journey-seam"
          data-seam={combat ? "combat" : "versus"}>
          {combat ? (
            <ArrowRight className={`h-4 w-4 text-[#e8c97a] ${combat.attacker === "opponent" ? "rotate-180" : ""}`} />
          ) : (
            <span className="font-black tracking-[0.2em] text-[#e8c97a]/80">VS</span>
          )}
        </div>
        <SidePanel state={state} side={opponent} marks={marks} knowledge={knowledge} gains={gains} fresh={fresh} />
      </div>
      {children}
    </div>
  );
}
