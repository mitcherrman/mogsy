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
 * K2 — KNOWLEDGE MARKS. An ability the Journey has established facts about
 * (JP5: and a portrait, through its champion portrait popup) wears a tiny `!`, keyed by K1's object
 * key (`player:<champion>:<slot>` / `opponent:<champion>`). Each portrait and
 * ability sits in a same-size `journey-know-host`, marked or not, so a mark
 * appearing changes no box. Items are never marked (K1 has no item fact).
 *
 * JATTN1 — THE ATTENTION GRAMMAR (`lib/journey/attention.ts`): CHANGED (green:
 * the beat's motion, then a thin green inner rim on every changed object for
 * the child), SAVED (gold: the persistent `!` + a brief anchored "Saved" tag
 * during the reveal hold — never "correct") and RELEVANT NOW (ice corner
 * brackets from the server's focus, drawn in once as the child opens). Three
 * cues, three looks, one source each; the portrait's `!` now means a stat was
 * SAVED by a reveal (a stated premise stat stays inspectable, unmarked).
 *
 * JP3 — LEARNED HISTORY LIVES ON THE BOARD'S OBJECTS. One grammar (`knowledge.ts`): a
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
 *
 * JP5 — ONE JOB EACH. The board is the CURRENT League objects: portraits,
 * abilities (with their own learned `!`), items, shards, level. It no longer
 * carries retained scalar bubbles ("Bonus AD 21", "Raw 85 !", "Armor !"):
 * a champion's stats live in its champion portrait popup (`JourneyChampionPortraitPopup`
 * — what the learner has established, state by state), and the values the
 * current question needs are the Reasoning Chain's. The former anchor row is
 * gone (JP5 geometry pass): a phone's name line takes its column, and above a
 * phone its height went to the question region (`--jq-prompt-h`).
 */
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";
import { QuestionRoleEmblems } from "@/components/ranked-arena/RoleEmblem";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { ArrowRight, Calculator, Check, PanelTopOpen } from "lucide-react";
import type { JourneyPublicState, JourneySide } from "@/lib/journey/contract";
import { itemGainTags, markKey, rankFrom, transitionMarks, type JourneyMarks } from "@/lib/journey/beat";
import {
  knowledgeKeyFor, NO_KNOWLEDGE, type JourneyKnowledge, type KnowledgeFact,
} from "@/lib/journey/knowledge";
import type { JourneyChainNode } from "@/lib/journey/chain";
import type { JourneyJ3 } from "@/lib/journey/j3";
import { championPortraitPopup, type ChampionPortraitPopup } from "@/lib/journey/portraitPopup";
import { boardAttention, type BoardAttention, type PortraitPopups } from "@/lib/journey/attention";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { resolveEnvironmentSceneArt } from "@/lib/question-surface/environmentScenes";
import { AbilityRankPips, InventorySlots, JourneyPortrait, LevelBadge } from "./JourneyPrimitives";
import { JourneyKnowledgeMark } from "./JourneyKnowledgeMark";
import { JourneyChampionPortraitPopup } from "./JourneyChampionPortraitPopup";
import { ShardIcon } from "./JourneyIcons";
import { JourneyShardReference } from "./JourneyReferencePopover";
import { useBoardCoach } from "./useKnowledgeCoach";
import { useSavedNow, type SavedNow } from "./useSavedNow";

/**
 * JP4 — the board's shared ground: ONE lane scene under both champions, so the
 * seam shows the Rift rather than a black gap. The owner's ENVVIS1 lane art,
 * through the existing scene seam (its background only; no foreground).
 */
const BOARD_SCENE = resolveEnvironmentSceneArt("lane_minion")?.background ?? null;

/**
 * JATTN1 — the SAVED moment: a small gold tag anchored to the exact object a
 * reveal just saved a fact on, for the ~1.6s fresh window. Says only "Saved"
 * (never "Correct", never "You learned"); the value is the `!` card's.
 */
function SavedTag({ testId }: { testId: string }) {
  return <span aria-hidden data-testid={testId} className="journey-saved-tag">Saved</span>;
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

/**
 * JP4 — a side's stat-shard page: three shards in a fixed column beside the
 * portrait, in row order (offense, flex, defense), the served ids and names.
 * When the OTHER side has a page and this one does not, the same column is
 * drawn empty, so the two halves keep one geometry.
 */
function ShardPage({ side, popup }: { side: JourneySide; popup: ChampionPortraitPopup | null }) {
  const shards = side.shards ?? [];
  return (
    <span className="journey-side__shards" role={shards.length ? "list" : undefined}
      aria-label={shards.length ? `${side.championName} stat shards` : undefined}
      aria-hidden={shards.length ? undefined : true}
      data-testid={`journey-shards-${side.side}`} data-count={shards.length}>
      {shards.map((sh) => (
        <span key={sh.row} role="listitem" aria-label={`${sh.name}, ${sh.row} shard`} className="journey-side__shard"
          data-row={sh.row} data-inspect="true">
          <ShardIcon shardId={sh.shardId} name={`${sh.name} · ${sh.row} shard`} size="board"
            testId={`journey-shard-${side.side}-${sh.row}`} />
          {/* JPX — a served shard is inspectable: what it contributes to this champion. */}
          <JourneyShardReference side={side} popup={popup} shard={sh}
            testId={`journey-shard-ref-${side.side}-${sh.row}`} />
        </span>
      ))}
    </span>
  );
}

function SidePanel({ state, side, marks, knowledge, gains, saved, attention, popup, shardColumn }: {
  state: JourneyPublicState;
  side: JourneySide;
  marks: JourneyMarks;
  knowledge: JourneyKnowledge;
  /** MOTION-V1 — while the beat runs: a new item's server stat lines, by `side:slot`. */
  gains: ReadonlyMap<string, string[]> | null;
  /** JATTN1 — the facts / objects a reveal saved just now (`useSavedNow`). */
  saved: SavedNow;
  /** JATTN1 — each object's Changed / Saved / Relevant states. */
  attention: BoardAttention;
  /** JP4 — either side has a shard page: both halves draw the column. */
  shardColumn: boolean;
  /** JP5 — this champion's portrait popup (built once per render by the board). */
  popup: ChampionPortraitPopup | null;
}) {
  const id = side.side;
  const step = state.step.index;
  const championKey = knowledgeKeyFor(side);
  const isFresh = (objectKey: string, f: KnowledgeFact) => saved.facts.has(`${objectKey}#${f.fact}`);
  const championFacts = knowledge.get(championKey)?.facts ?? [];
  const portrait = attention.of({ kind: "portrait", side: id });
  const portraitFresh = championFacts.some((f) => f.kind === "champion_stat_at_level" && isFresh(championKey, f));
  const levelState = attention.of({ kind: "level", side: id });
  const combat = state.focus.combat;
  const role = combat ? (combat.attacker === id ? "Attacker" : "Target") : null;
  const newSlots = new Set(side.items.map((it) => it.slot).filter((s) => marks.newItems.has(markKey(id, s))));
  const level = marks.level[id] ?? null;
  return (
    <section data-testid={`journey-side-${id}`} data-side={id}
      data-combat-role={role?.toLowerCase()}
      aria-label={`${side.championName}, level ${side.level}${role ? `, ${role.toLowerCase()}` : ""}`}
      className="journey-side">
      <SideSplash side={side} />
      <header className="journey-side__id">
        {shardColumn && <ShardPage side={side} popup={popup} />}
        <span className="journey-know-host journey-know-host--portrait" data-know-key={knowledgeKeyFor(side)}>
          {/* JP5 — the portrait opens the champion portrait popup. JATTN1: its
              `!` is SAVED (a revealed stat), its brackets RELEVANT (the server's focus). */}
          <JourneyChampionPortraitPopup side={side} popup={popup}
            saved={portrait.saved} relevant={portrait.relevant} step={step} fresh={portraitFresh}
            testId={`journey-portrait-popup-${id}`} />
          {portraitFresh && <SavedTag testId={`journey-saved-tag-${id}-portrait`} />}
        </span>
        <div className="journey-side__name min-w-0">
          <span className="journey-side__champion truncate font-black uppercase tracking-[0.08em] text-white"
            data-testid={`journey-name-${id}`}>
            {side.championName}
          </span>
          <span className="flex items-center gap-1">
            <LevelBadge level={side.level} from={level?.from ?? null} relevant={levelState.relevant} step={step}
              testId={`journey-level-${id}`} />
            {/* JPX — a reserved slot: the role chip arrives inside a box that is always there. */}
            <span className="journey-role-slot journey-chip rounded-md font-bold uppercase tracking-[0.18em]">
              {role && (
                <span data-testid={`journey-role-${id}`}
                  className={`journey-chip rounded-md px-1 font-bold uppercase tracking-[0.18em] ${
                    role === "Attacker" ? "bg-[#d4b35a]/20 text-[#f3dca0]" : "bg-[#7fb2d4]/20 text-[#cfe6f5]"}`}>
                  <span className="journey-role-long">{role}</span>
                  <span aria-hidden className="journey-role-short">{role === "Attacker" ? "Atk" : "Tgt"}</span>
                </span>
              )}
            </span>
          </span>
        </div>
      </header>
      <div className="journey-side__kit" role="group" aria-label={`${side.championName} abilities`}>
        {side.abilities.map((a) => {
          const key = knowledgeKeyFor(side, a.slot);
          const known = knowledge.get(key) ?? null;
          const relevant = attention.of({ kind: "ability", side: id, slot: a.slot }).relevant;
          return (
            <span key={a.slot} className="journey-know-host journey-know-host--ability" data-know-key={key}>
              <AbilityRankPips ability={a} champion={side.championName} side={id}
                rankFrom={marks.rank.has(markKey(id, a.slot)) ? rankFrom(state.transition, id, a.slot) : null}
                unlocked={marks.unlocked.has(markKey(id, a.slot))}
                relevant={relevant} step={step} />
              {known && (
                <JourneyKnowledgeMark mark={known} name={`${side.championName} ${a.slot}`} abilityName={a.name}
                  placement="ability" fresh={known.facts.some((f) => isFresh(known.key, f))} relevant={relevant}
                  testId={`journey-know-${id}-${a.slot}`} />
              )}
              {saved.objects.has(key) && <SavedTag testId={`journey-saved-tag-${id}-${a.slot}`} />}
            </span>
          );
        })}
      </div>
      <div className="journey-side__items">
        <InventorySlots side={side} items={side.items} newSlots={newSlots} step={step}
          relevantSlots={new Set(side.items.map((it) => it.slot)
            .filter((slot) => attention.of({ kind: "item", side: id, slot }).relevant))}
          gainTags={gains ? new Map([...newSlots].flatMap((slot) => {
            const tags = gains.get(markKey(id, slot));
            return tags ? [[slot, tags] as const] : [];
          })) : undefined} />
      </div>
    </section>
  );
}

/**
 * JATTN1 — the one-time BOARD coach (`useBoardCoach`): a compact Mogzy-faced
 * pill, non-modal, never focused, in the JPX state coach's placement:
 *
 * JPX — the one-time STATE coach, anchored to the board's STATE control but
 * hung OUTSIDE the board: a pill resting on the board's top edge, right-aligned
 * to the header buttons. The board's box is `overflow: hidden` and every pixel
 * of it is the state (identity, inputs, abilities, items, shards), so the coach
 * is portalled to the page and positioned from the board's own rect — it covers
 * the card's margin above the board, never the board. Presentation only; it
 * lays out nothing and follows the board on scroll / resize.
 */
function CoachPill({ boardRef, text, onDismiss }: { boardRef: RefObject<HTMLDivElement>; text: string; onDismiss: () => void }) {
  const [at, setAt] = useState<{ right: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const board = boardRef.current;
      if (!board) return;
      const b = board.getBoundingClientRect();
      const btn = [...board.querySelectorAll<HTMLElement>(".journey-board__state-btn")].pop();
      const edge = btn ? btn.getBoundingClientRect().right : b.right - 8;
      setAt({ right: Math.max(8, window.innerWidth - edge), bottom: Math.max(0, window.innerHeight - b.top + 3) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [boardRef]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <p role="status" data-testid="journey-know-coach" className="journey-coach" onPointerDown={onDismiss}
      style={at ? { right: at.right, bottom: at.bottom } : { visibility: "hidden" }}>
      {/* JATTN1 — Mogzy's face, compact (the guide's own art), decorative. */}
      <span aria-hidden className="journey-coach__mogzy">
        <MogzyMascot pose="explaining" scale="compact" decorative className="journey-coach__mogzy-img" />
      </span>
      <span className="journey-coach__text">{text}</span>
    </p>,
    document.body,
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

function JourneyPath({ nodes }: { nodes: readonly JourneyChainNode[] }) {
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
    <ol ref={ref} data-testid="journey-path" data-fit={fit} className="journey-path" aria-label="Journey path">
      {nodes.map((n, i) => (
        <li key={n.index} data-testid={`journey-path-${n.index}`} data-state={n.state}
          aria-label={`Step ${n.index + 1}${n.label ? `, ${n.label}` : ""}: ${
            n.state === "done" ? "established" : n.state === "current" ? "current" : "ahead"}`}
          className="journey-path__node">
          {i > 0 && <span aria-hidden className="journey-path__link">→</span>}
          <span aria-hidden className="journey-path__dot">
            {n.state === "done" && <Check className="journey-path__check" strokeWidth={3.5} />}
          </span>
          {n.label && <span aria-hidden className="journey-path__label">{n.label}</span>}
        </li>
      ))}
    </ol>
  );
}

export function JourneyStateBoard({
  state, beatActive = false, onOpenDetail, onOpenFormulas, questionRoles = null, knowledge = NO_KNOWLEDGE,
  beatStamp = null, chain = null, journey = null, revealing = false, clockFreeUntil = null, children,
}: {
  /**
   * JATTN1 — the board is holding the reveal of the child on screen: a fact
   * that arrives now was saved by THIS reveal (the "Saved" moment).
   */
  revealing?: boolean;
  /**
   * JATTN1 — the client-clock ms the next answer window opens (null: one is
   * open now; Infinity: none follows). The board coach runs only before it.
   */
  clockFreeUntil?: number | null;
  state: JourneyPublicState;
  /** JP5 — the served Journey block (reached prefix), for the champion portrait popups. */
  journey?: JourneyJ3 | null;
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
  // JP5 — each champion's portrait popup, once (the side panel and the attention model share it).
  const popups: PortraitPopups = {
    subject: championPortraitPopup(journey, knowledge, "player", state.step.index),
    opponent: championPortraitPopup(journey, knowledge, "opponent", state.step.index),
  };
  const attention = boardAttention(state, knowledge, journey, popups);
  // JATTN1 — the facts this reveal saved just now (seeded silently on mount).
  const saved = useSavedNow(knowledge, revealing ? state.step.index : null);
  // JP4 — one shard column for both halves when either has a page.
  const shardColumn = Boolean(subject.shards?.length || opponent.shards?.length);
  const boardRef = useRef<HTMLDivElement>(null);
  // JATTN1 — the first fact the board saves (any fact) teaches the board once.
  const coarse = useCoarsePointer();
  const coach = useBoardCoach({ savedNow: saved.objects.size > 0, clockFreeUntil, coarse, boardRef });
  return (
    <div ref={boardRef} data-testid="journey-board" data-journey-key={state.journeyKey}
      data-step={state.step.index} data-node={state.step.nodeId}
      data-beat={beatActive ? "active" : "idle"}
      data-shards={shardColumn ? "true" : undefined}
      data-coach={coach.visible ? "true" : undefined}
      className="journey-vars journey-board">
      {BOARD_SCENE && (
        <span aria-hidden data-testid="journey-scene" className="journey-board__scene">
          <img src={BOARD_SCENE} alt="" draggable={false} decoding="async" />
        </span>
      )}
      <div className="journey-board__head">
        <span className="journey-board__eyebrow truncate">
          <span className="text-[#e8c97a]">Journey</span>
          <span aria-hidden className="px-1 text-white/35">·</span>
          <span data-testid="journey-step">Step {state.step.index + 1} of {state.step.count}</span>
          {chain && chain.length > 1 && !beatStamp && <JourneyPath nodes={chain} />}
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
        <SidePanel state={state} side={subject} marks={marks} knowledge={knowledge} gains={gains} saved={saved}
          attention={attention} popup={popups.subject ?? null} shardColumn={shardColumn} />
        <div aria-hidden className="journey-board__seam" data-testid="journey-seam"
          data-seam={combat ? "combat" : "versus"}>
          {combat ? (
            <ArrowRight className={`h-4 w-4 text-[#e8c97a] ${combat.attacker === "opponent" ? "rotate-180" : ""}`} />
          ) : (
            <span className="font-black tracking-[0.2em] text-[#e8c97a]/80">VS</span>
          )}
        </div>
        <SidePanel state={state} side={opponent} marks={marks} knowledge={knowledge} gains={gains} saved={saved}
          attention={attention} popup={popups.opponent ?? null} shardColumn={shardColumn} />
      </div>
      {coach.visible && <CoachPill boardRef={boardRef} text={coach.text} onDismiss={coach.dismiss} />}
      {children}
    </div>
  );
}
