import { memo, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronsRight,
  Crosshair,
  Footprints,
  Gauge,
  Heart,
  RotateCcw,
  Shield,
  Sparkles,
  Sword,
  Swords,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChampionAssets, getChampionSplash, getChampionIcon } from "@/hooks/useChampionAssets";
import { useChampionBaseStats } from "@/hooks/useChampionBaseStats";
import { cn } from "@/lib/utils";
import stoneSurfaceUrl from "@/assets/stat-check/board/stat-check-stone-surface.png";
import socketFrameUrl from "@/assets/stat-check/board/stat-check-card-socket-frame.png";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import { buildMatchSummary } from "./matchSummary";
import {
  DAMAGE_REVEAL_TIMELINE,
  LANE_PLAQUE_TIMELINE,
  REDUCED_MOTION_CHOREO,
  STAT_CHECK_ANIMATION,
  STAT_CHECK_ANIMATION_SPEEDS,
  STAT_CHECK_DEFAULT_ANIMATION_SPEED,
  REVEAL_TIMELINE,
  animationDuration,
  boardResultOffset,
  durationAtSpeed,
  laneResolveOffsets,
  lanePlaqueStageOffsets,
  heroArcLift,
  isStatCheckAnimationSpeed,
  type StatCheckAnimationSpeed,
} from "./animationConfig";
import {
  damageRevealBoardShown,
  damageRevealHealthApplied,
  damageRevealPlan,
  damageRevealPlanTotalMs,
  damageRevealShownTotal,
  damageRevealStageOffsets,
  damageRevealStepStarts,
  damageRevealStepTotalMs,
  damageRevealSweepVisible,
  damageRevealedLanes,
  type DamageRevealStage,
  type DamageRevealStep,
} from "./damageReveal";
import {
  DEFAULT_STAT_CHECK_IDENTITIES,
  damageIdentityHeader,
  type StatCheckIdentities,
} from "./damageIdentity";
import UserAvatar from "@/components/UserAvatar";
import {
  activeResolvedLane,
  allowsPreLockInteraction,
  animationStepReducer,
  initialLanePlaqueStages,
  laneSliceActive,
  laneValuesActive,
  laneWinnerEmphasised,
  lanePlaqueBonusEarned,
  lanePlaqueShowsBonus,
  itemsRevealedAtStep,
  revealedOpponentCount,
  stepAfterLane,
  stepBeforeDamage,
  type LanePlaqueStage,
  type PresentationStep,
} from "./animationState";
import { fanCardLayout, responsiveFanParameters } from "./fanLayout";
import { ITEMS, isItemCompatible, itemBonusFor, totalInventoryCount, type ItemId } from "./items";
import { categoryValueAccessibleText, handCardCategoryValues, type CardCategoryValue } from "./handCardStats";
import { ItemChoiceOverlay, ItemChoicePanel, ItemGlyph, ItemInventoryDock } from "./StatCheckItems";
import { BoardTooltip } from "./StatCheckTooltip";
import {
  DECISIVE_MARGIN_PRESENTATION,
  categoryIcon,
  categoryLevelBadge,
  categoryTooltipLabel,
  formatThreshold,
} from "./statCategoryIcons";
import type { OnlineMatchController } from "./online/useStatCheckMatch";
import {
  STAT_CHECK_RULES,
  assignCard,
  beginItemChoice,
  buildCardsFromBaseStats,
  chooseItem,
  createMatch,
  equipItem,
  isReadyToLock,
  itemChoiceDue,
  resolveCurrentRound,
  startNextRound,
  unequipItem,
  STAT_FAMILY_LABELS,
  type CategoryResult,
  type EquippedItem,
  type MatchState,
  type RoundDamage,
  type RoundResolution,
  type Side,
  type StatCategory,
  type StatCategoryId,
  type StatCheckCard,
} from "./statCheckEngine";

const SEED = "stat-check-tabletop-v2";

type TravelingCardState = {
  id: string;
  card: StatCheckCard;
  imageUrl?: string | null;
  /** Category + label of the destination slot, so the clone's final frame is
      pixel-identical to the real board card it hands off to. */
  category?: StatCategory;
  /**
   * Already-resolved contested value for `category`. Discard clones carry it so
   * an outgoing card keeps the exact item-adjusted number it just contested
   * rather than re-deriving a natural value.
   */
  value?: number;
  label?: string;
  from: DOMRectSnapshot;
  to: DOMRectSnapshot;
  fromRotation: number;
  toRotation: number;
  /** Total clone flight time, already speed-scaled. */
  durationMs: number;
  /**
   * Speed-scaled per-phase durations for authored choreography.
   * place/lane-move: [pickup, hold, launch, travel, approach, impact, rebound, settle]
   * return: [lift, hold, travel, settle]
   */
  phaseDurations?: number[];
  kind: "place" | "return" | "lane-move" | "discard" | "deal";
};

type DOMRectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LaneReactionState = {
  categoryId: StatCategoryId;
  kind: "charging" | "impact" | "accept";
};

/**
 * What the centre damage presentation is currently showing. Presentation only:
 * `step` is one entry of the plan derived from the authoritative RoundDamage,
 * and `stage` selects which slice of it is on screen. No amount in here is
 * computed by the presentation.
 */
type DamageRevealState = {
  step: DamageRevealStep;
  stage: DamageRevealStage;
};

const SPEED_STORAGE_KEY = "stat-check-animation-speed";

/**
 * Match-driver boundary: with no `online` controller the page runs the local
 * bot game exactly as before (rules via the local engine, no network). With
 * an online controller, every rules transition is the server's — the page
 * keeps only presentation state (placements before lock, reveal choreography)
 * and renders authoritative snapshots + resolution events.
 */
export default function StatCheckPage({
  online = null,
  onOnlineExit,
  identities = DEFAULT_STAT_CHECK_IDENTITIES,
  surface = "dev",
}: {
  online?: OnlineMatchController | null;
  onOnlineExit?: () => void;
  /**
   * Which shell the identical game is mounted in. The engine, choreography and
   * every control are the same either way — `"public"` only suppresses the
   * development-facing chrome in the header (prototype eyebrow, deck-source and
   * stat-loading badges) so the shipped bot route does not read as a dev page.
   */
  surface?: "dev" | "public";
  /**
   * Who the two sides are, for the damage tally's header. Defaults to the bot
   * game's You/Bot pair; the online room supplies the seats' real display names
   * (already present client-side in RoomView, so no contract changes) and
   * whatever avatar the existing profile system already has.
   */
  identities?: StatCheckIdentities;
} = {}) {
  const { data: statRows, isLoading, isError } = useChampionBaseStats();
  const { data: assets } = useChampionAssets();
  const deck = useMemo(() => {
    const apiDeck = buildCardsFromBaseStats(statRows);
    return apiDeck.length >= 24 ? apiDeck : STAT_CHECK_FIXTURE_DECK;
  }, [statRows]);
  const dataSource = buildCardsFromBaseStats(statRows).length >= 24 ? "League Docs stats" : "Fixture deck";
  const [matchKey, setMatchKey] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  // Armed inventory item awaiting a lane click (click item, then click lane).
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
  /**
   * Item dock collapse: purely local presentation. It is deliberately NOT part
   * of MatchState — it never reaches the engine, the reducer, or any online
   * payload, so collapsing cannot desync a multiplayer match.
   */
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false);
  /**
   * Which face each lane's fixed plaque is showing. Presentation only — the
   * winner, margin, threshold, and damage are all computed once by the engine
   * before any of this runs. Scheduled from the single reveal timeline below
   * so no component owns its own sequence timers.
   */
  const [lanePlaqueStages, setLanePlaqueStages] = useState<LanePlaqueStage[]>(initialLanePlaqueStages);
  /**
   * Centre damage presentation, and which sides have already had their health
   * loss revealed. Both are scheduled from the same reveal timeline as the
   * lanes; the health bars read `revealedDamageSides` so a bar cannot drop
   * before its own impact frame.
   */
  const [damageReveal, setDamageReveal] = useState<DamageRevealState | null>(null);
  const [revealedDamageSides, setRevealedDamageSides] = useState<Side[]>([]);
  // Highlighted-but-unconfirmed pick inside the item-choice panel.
  const [pendingChoiceId, setPendingChoiceId] = useState<ItemId | null>(null);
  const [match, setMatch] = useState<MatchState>(() => createMatch(STAT_CHECK_FIXTURE_DECK, `${SEED}:0`, { items: true }));
  const [revealStep, dispatchRevealStep] = useReducer(animationStepReducer, "selecting" as PresentationStep);
  const [travelingCards, setTravelingCards] = useState<TravelingCardState[]>([]);
  // Cards that still hold their fan slot (invisibly) while their travel clone departs,
  // so the hand gap closes only after the card has visibly left.
  const [handGapIds, setHandGapIds] = useState<string[]>([]);
  const [laneReaction, setLaneReaction] = useState<LaneReactionState | null>(null);
  const [animationSpeed, setAnimationSpeed] = useSessionAnimationSpeed();
  const [damageFlashKey, setDamageFlashKey] = useState(0);
  // Dev-only ?forceMotion=1 overrides the OS reduced-motion preference so the
  // full choreography can be inspected during animation development.
  const prefersReducedMotion = usePrefersReducedMotion() && !isForceMotionEnabled();
  const timersRef = useRef<number[]>([]);
  const previousMotionSettingsRef = useRef({ animationSpeed, prefersReducedMotion });
  const handCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const laneRefs = useRef<Record<string, HTMLElement | null>>({});
  const lanePlayerRefs = useRef<Record<string, HTMLElement | null>>({});
  const laneBotRefs = useRef<Record<string, HTMLElement | null>>({});
  const discardRefs = useRef<Record<"player" | "bot", HTMLElement | null>>({ player: null, bot: null });

  const matchRef = useRef(match);
  matchRef.current = match;
  const onlineReadyRef = useRef(false);
  const resolutionKeyRef = useRef(0);

  /**
   * Drop the centre presentation and every revealed health step. Called from
   * the same places that clear the reveal timers, so an interrupted round
   * (restart, speed change, reconnect, adopting an authoritative snapshot)
   * cannot leave a half-played damage popup or a partially drained bar behind.
   * Health then falls back to the authoritative match totals.
   */
  const clearDamageReveal = () => {
    setDamageReveal(null);
    setRevealedDamageSides([]);
  };

  useEffect(() => {
    // Local bot mode only: online matches never run the local engine.
    if (online) return;
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    setMatch(createMatch(deck, `${SEED}:${matchKey}`, { items: true }));
    setSelectedCardId(null);
    setSelectedItemId(null);
    setPendingChoiceId(null);
    dispatchRevealStep({ type: "cancel" });
  }, [deck, matchKey, online]);

  /** Adopt an authoritative snapshot wholesale (initial load / recovery). */
  const hardAdoptOnline = (live: MatchState) => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    setSelectedCardId(null);
    setSelectedItemId(null);
    setMatch(live);
    onlineReadyRef.current = true;
    if (live.phase === "match-over") dispatchRevealStep({ type: "match-over" });
    else if (live.phase === "item-choice" && live.lastResolution) dispatchRevealStep({ type: "resolved" });
    else dispatchRevealStep({ type: "cancel" });
  };

  /** Advance into the next authoritative state with discard/deal presentation. */
  const advanceAdoptOnline = (live: MatchState) => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    setSelectedCardId(null);
    setSelectedItemId(null);
    dispatchRevealStep({ type: "discard" });
    queueDiscardTravels();
    setMatch(live);
    const dealTimer = window.setTimeout(
      () => dispatchRevealStep({ type: "deal" }),
      animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
    );
    const selectTimer = window.setTimeout(
      () => dispatchRevealStep({ type: "select" }),
      animationDuration(
        STAT_CHECK_ANIMATION.discardMs + STAT_CHECK_ANIMATION.dealStaggerMs * 4,
        prefersReducedMotion,
        animationSpeed,
      ),
    );
    timersRef.current.push(dealTimer, selectTimer);
  };

  // Online resolution events: merge the authoritative resolution into the
  // presented state and run the EXISTING reveal choreography.
  useEffect(() => {
    if (!online?.resolutionEvent) return;
    const { key, resolution } = online.resolutionEvent;
    if (key === resolutionKeyRef.current) return;
    resolutionKeyRef.current = key;
    if (!onlineReadyRef.current) return; // resume path: history arrives inside `live`
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    setSelectedCardId(null);
    setSelectedItemId(null);
    const ended = resolution.playerHpAfter <= 0 || resolution.botHpAfter <= 0;
    setMatch((current) => ({
      ...current,
      phase: ended ? "match-over" : "resolved",
      playerHp: resolution.playerHpAfter,
      botHp: resolution.botHpAfter,
      lastResolution: resolution,
      roundHistory: [...current.roundHistory, resolution],
      equippedItem: null,
      outcome: !ended
        ? null
        : resolution.playerHpAfter <= 0 && resolution.botHpAfter <= 0
          ? "draw"
          : resolution.playerHpAfter <= 0
            ? "bot"
            : "player",
    }));
    dispatchRevealStep({ type: "lock" });
  }, [online?.resolutionEvent]);

  // Online boundary adoption: initial snapshot, post-cadence item choice
  // opening after the reveal settles, item-choice completion advancing into
  // the next round, and terminal states discovered on advance.
  useEffect(() => {
    if (!online?.live) return;
    const live = online.live;
    if (!onlineReadyRef.current) {
      hardAdoptOnline(live);
      return;
    }
    const presented = matchRef.current;
    const settled = revealStep === "resolved" || revealStep === "match-over";
    if (presented.phase === "resolved" && settled && live.phase === "item-choice") {
      // Keep the resolved board + results visible; only the control rail
      // switches to the choice panel (same as bot mode).
      setMatch({ ...live, lastResolution: presented.lastResolution, currentCategories: presented.currentCategories });
      return;
    }
    if (presented.phase === "resolved" && settled && live.phase === "match-over" && presented.outcome === null) {
      // Deck exhaustion discovered on advance.
      setMatch({ ...live, lastResolution: presented.lastResolution });
      dispatchRevealStep({ type: "match-over" });
      return;
    }
    if (presented.phase === "item-choice" && live.phase === "selecting") {
      advanceAdoptOnline(live);
      return;
    }
    if (live.phase === "match-over" && presented.phase !== "match-over" && presented.phase !== "resolved") {
      // Non-combat terminal (concede / disconnect forfeit / no-contest)
      // arriving outside a reveal: adopt immediately.
      hardAdoptOnline(live);
      return;
    }
    if (presented.phase === "item-choice" && presented.roundHistory.length === 0 && live.phase === "item-choice") {
      // Opening choice: keep server truth for chosen counters.
      setMatch((current) => ({ ...current, itemChoicesCompleted: live.itemChoicesCompleted }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online?.liveKey, revealStep]);

  useEffect(() => () => clearAnimationTimers(timersRef.current), []);

  useEffect(() => {
    const previous = previousMotionSettingsRef.current;
    previousMotionSettingsRef.current = { animationSpeed, prefersReducedMotion };
    if (previous.animationSpeed === animationSpeed && previous.prefersReducedMotion === prefersReducedMotion) return;
    if (travelingCards.length === 0) return;
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    dispatchRevealStep({ type: "cancel" });
  }, [animationSpeed, prefersReducedMotion, travelingCards.length]);

  useEffect(() => {
    if (!selectedCardId && !selectedItemId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelectedCardId(null);
      setSelectedItemId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCardId, selectedItemId]);

  // Post-cadence rounds enter the item-choice phase automatically once the
  // resolved presentation has fully played out. The resolved board, damage,
  // and next-round hint all stay mounted; only the Next Round control is
  // replaced by the choice panel until the pick is confirmed.
  useEffect(() => {
    if (online) return; // online: the server owns phase transitions
    if (revealStep !== "resolved" && revealStep !== "match-over") return;
    if (match.phase !== "resolved" || !itemChoiceDue(match)) return;
    setMatch((state) => beginItemChoice(state));
  }, [match, online, revealStep]);

  useEffect(() => {
    if (revealStep !== "locking" || !match.lastResolution) return;
    clearAnimationTimers(timersRef.current);

    // Every reveal starts with all three plaques on their category face.
    setLanePlaqueStages(initialLanePlaqueStages());

    if (prefersReducedMotion) {
      dispatchRevealStep({ type: match.phase === "match-over" ? "match-over" : "resolved" });
      setDamageFlashKey((key) => key + 1);
      // Reduced motion skips the staged blink entirely and rests on +1/+0.
      setLanePlaqueStages(["settled", "settled", "settled"]);
      // No count-up, no travel, no jolt: the contained arena flash above is the
      // whole impact, and health lands on the authoritative post-round totals
      // immediately because the resolved step stops deferring them.
      clearDamageReveal();
      return;
    }

    // Rounds where an item was played get an extra item-reveal beat between
    // the opponent flips and lane resolution; every later step shifts by the
    // same amount so the bonus lands readably. Item-free rounds keep the
    // original timeline exactly.
    const roundHasItems = match.lastResolution.results.some((result) => result.playerItem || result.botItem);
    const shift = roundHasItems ? REVEAL_TIMELINE.itemRevealShiftMs : 0;
    /**
     * Each lane's own authoritative outcome, in board order. A lane that earned
     * no decisive bonus has no slice, no packet and no impact to wait for, so it
     * runs a materially shorter sequence — and because every later lane starts
     * from the previous lane's end, a fast lane pulls the whole round forward
     * rather than leaving dead air behind it. This is a pure read of the engine
     * result: no gameplay figure is recomputed here.
     */
    const laneDecisive = [0, 1, 2].map((index) => match.lastResolution?.results[index]?.decisive ?? false);
    const laneResolveAt = laneResolveOffsets(laneDecisive);
    const setLaneStage = (laneIndex: number, next: LanePlaqueStage) =>
      setLanePlaqueStages((current) => current.map((value, index) => (index === laneIndex ? next : value)));
    // Each lane walks its own plaque through winner → threshold → bonus,
    // starting from that lane's own resolve beat. A lane starts only once the
    // previous one has finished its cleanup, so the sequences never overlap and
    // never leave an idle gap between them.
    const lanePlaqueSteps: Array<[number, () => void]> = laneResolveAt.flatMap((resolveAt, laneIndex) => {
      const stageOffsets = lanePlaqueStageOffsets(laneDecisive[laneIndex]);
      return (["threshold", "values", "winner", "slice", "zero", "transfer", "bonus", "settled"] as const).map(
        (nextStage) =>
          [resolveAt + shift + stageOffsets[nextStage], () => setLaneStage(laneIndex, nextStage)] as [number, () => void],
      );
    });

    /**
     * Centre damage presentation. The plan is derived once, here, from the
     * resolution's authoritative RoundDamage — the scheduler only decides when
     * each already-computed component appears. Zero-damage sides produce no
     * step, so no popup is scheduled for them; a round where neither side dealt
     * damage produces an empty plan costing 0ms, which reproduces the original
     * boardResult → damage → resolved pacing exactly.
     */
    const damagePlan = damageRevealPlan(match.lastResolution.damage, match.lastResolution.results);
    const damageStartsAt = boardResultOffset(laneDecisive) + shift;
    const stepStarts = damageRevealStepStarts(damagePlan);
    const damageSteps: Array<[number, () => void]> = damagePlan.flatMap((step, stepIndex) => {
      const startAt = damageStartsAt + stepStarts[stepIndex];
      const beats: Array<[number, () => void]> = damageRevealStageOffsets(step).map(([stage, offset]) => [
        startAt + offset,
        () => {
          setDamageReveal({ step, stage });
          // The health bar drops at, and only at, this side's health stage.
          if (stage === "health") {
            setRevealedDamageSides((sides) => (sides.includes(step.target) ? sides : [...sides, step.target]));
          }
          if (stage === "impact") setDamageFlashKey((key) => key + 1);
        },
      ]);
      // Clear this direction before the next one (or the resolved rail) begins.
      beats.push([startAt + damageRevealStepTotalMs(step), () => setDamageReveal(null)]);
      return beats;
    });
    const damageRevealEndsAt = damageStartsAt + damageRevealPlanTotalMs(damagePlan);

    const timeline: Array<[number, () => void]> = [
      ...lanePlaqueSteps,
      ...damageSteps,
      [REVEAL_TIMELINE.opponentReveal1, () => dispatchRevealStep({ type: "opponent", lane: 1 })],
      [REVEAL_TIMELINE.opponentReveal2, () => dispatchRevealStep({ type: "opponent", lane: 2 })],
      [REVEAL_TIMELINE.opponentReveal3, () => dispatchRevealStep({ type: "opponent", lane: 3 })],
      ...(roundHasItems
        ? [[REVEAL_TIMELINE.itemReveal, () => dispatchRevealStep({ type: "item-reveal" })] as [number, () => void]]
        : []),
      [laneResolveAt[0] + shift, () => dispatchRevealStep({ type: "resolve", lane: 1 })],
      [laneResolveAt[1] + shift, () => dispatchRevealStep({ type: "resolve", lane: 2 })],
      [laneResolveAt[2] + shift, () => dispatchRevealStep({ type: "resolve", lane: 3 })],
      [damageStartsAt, () => dispatchRevealStep({ type: "board-result" })],
      [damageRevealEndsAt + REVEAL_TIMELINE.damageTailMs, () => dispatchRevealStep({ type: "damage" })],
      [
        damageRevealEndsAt + REVEAL_TIMELINE.resolvedTailMs,
        () => dispatchRevealStep({ type: match.phase === "match-over" ? "match-over" : "resolved" }),
      ],
    ];
    timersRef.current = timeline.map(([delay, action]) => window.setTimeout(action, animationDuration(delay, prefersReducedMotion, animationSpeed)));
  }, [animationSpeed, match.lastResolution, match.phase, prefersReducedMotion, revealStep]);

  const selectedCard = match.playerHand.find((card) => card.id === selectedCardId) ?? null;
  const assignedCardIds = new Set(Object.values(match.assignments).filter(Boolean));
  // Cards currently flying toward a lane: the real board card stays hidden under a
  // receiving slot until the clone lands exactly on top of it.
  const inFlightToLaneIds = new Set(
    travelingCards.filter((item) => item.kind === "place" || item.kind === "lane-move").map((item) => item.card.id),
  );
  const returningIds = new Set(travelingCards.filter((item) => item.kind === "return").map((item) => item.card.id));
  const departingIds = new Set(handGapIds);
  const canEdit =
    match.phase === "selecting" && allowsPreLockInteraction(revealStep) && !(online && online.youLocked);
  const activeLaneIndex = activeResolvedLane(revealStep);
  const activeResolution = match.lastResolution?.round === match.round ? match.lastResolution : null;
  // Whether the reveal has reached the item beat: before it, lanes show only
  // natural values and the opponent's item stays hidden.
  const itemsRevealed = itemsRevealedAtStep(revealStep);
  const itemChoiceOpen = match.phase === "item-choice";
  // Pre-Round-1 opening choice: no resolution exists yet, and the full Round 1
  // board must stay concealed (only the single-family hint may show).
  const preRoundItemChoice = itemChoiceOpen && !match.lastResolution;
  const armedItem = selectedItemId && canEdit ? selectedItemId : null;
  const opponentLabel = online ? "Opponent" : "Bot";
  // Layout mode: the approved three-column desktop shell needs ~1210px; below
  // that the side rails unmount entirely and the compact arena flow takes over
  // (compact matchup header, tighter board, tray inventory, secondary drawer).
  // JS-driven so exactly one layout's components (and testids) exist at a time.
  const viewportWidth = useViewportWidth();
  const wideLayout = viewportWidth >= 1210;
  /**
   * Health shown on the bars. Through the reveal both sides hold their
   * pre-round totals; a side drops to its authoritative post-round value only
   * once its own impact frame has landed (`revealedDamageSides`), so a bar can
   * never move before the damage that caused it is on screen. Outside the
   * reveal — including reduced motion, reconnect and any adopted snapshot —
   * this falls straight through to the authoritative match totals.
   */
  const displayHp = activeResolution && stepBeforeDamage(revealStep)
    ? {
        player: revealedDamageSides.includes("player") ? activeResolution.playerHpAfter : activeResolution.playerHpBefore,
        bot: revealedDamageSides.includes("bot") ? activeResolution.botHpAfter : activeResolution.botHpBefore,
      }
    : { player: match.playerHp, bot: match.botHp };
  /**
   * Bar being struck right now: it flashes from the impact frame and stays lit
   * through the drain. Only ever the target of the step currently on screen,
   * so a two-way round lights one bar at a time.
   */
  const damageImpactSide: Side | null =
    damageReveal && (damageReveal.stage === "impact" || damageRevealHealthApplied(damageReveal.stage))
      ? damageReveal.step.target
      : null;

  // Shared online presentation state for the reveal rail and the item modal.
  const onlineState = online
    ? {
        youChosen: online.youChosen,
        youLocked: online.youLocked,
        opponentChosen: online.opponentChosen,
        opponentLocked: online.opponentLocked,
        opponentConnected: online.opponentConnected,
        opponentReconnectDeadline: online.opponentReconnectDeadline,
        onConcede: () => void online.concede(),
      }
    : null;

  const restart = () => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    setMatchKey((key) => key + 1);
  };

  const confirmItemChoice = () => {
    if (!pendingChoiceId || match.phase !== "item-choice") return;
    if (online) {
      if (online.youChosen) return;
      void online.submitItemChoice(pendingChoiceId);
      setPendingChoiceId(null);
      return;
    }
    setMatch((state) => chooseItem(state, pendingChoiceId));
    setPendingChoiceId(null);
  };

  const toggleInventoryItem = (itemId: ItemId) => {
    if (!canEdit) return;
    setSelectedCardId(null);
    setSelectedItemId((current) => (current === itemId ? null : itemId));
  };

  // Acquiring an item pops the dock open so the new well is never hidden
  // behind a collapsed lever. Only a genuine increase re-expands, so manual
  // collapse still sticks once the player owns items.
  const inventoryTotal = totalInventoryCount(match.playerInventory);
  const previousInventoryTotal = useRef(inventoryTotal);
  useEffect(() => {
    if (inventoryTotal > previousInventoryTotal.current) setInventoryCollapsed(false);
    previousInventoryTotal.current = inventoryTotal;
  }, [inventoryTotal]);

  /**
   * An armed item must stay visibly represented while it waits for a lane, so
   * arming forces the wells open regardless of the manual collapse preference
   * (which is remembered and reapplied once the item is assigned or disarmed).
   */
  const dockCollapsed = inventoryCollapsed && !selectedItemId;

  // Item-to-lane attachment shares the click-lane gesture with card placement:
  // an armed inventory item takes priority and never falls through to the
  // card place/return paths, so champion movement stays untouched.
  const tryEquipSelectedItem = (category: StatCategory): boolean => {
    if (!armedItem) return false;
    const next = equipItem(match, category.id, armedItem);
    if (next !== match) {
      setMatch(next);
      setSelectedItemId(null);
    }
    return true;
  };

  const removePendingItem = () => {
    if (!canEdit) return;
    setMatch((state) => unequipItem(state));
  };

  const placeCard = (category: StatCategory) => {
    if (!canEdit) return;
    if (tryEquipSelectedItem(category)) return;
    const current = match.assignments[category.id];
    if (selectedCardId) {
      const card = match.playerHand.find((item) => item.id === selectedCardId);
      const fromElement = handCardRefs.current[selectedCardId];
      const toElement = slotElement(lanePlayerRefs.current[category.id]);
      if (card) {
        const p = STAT_CHECK_ANIMATION.placement;
        // Reduced motion still communicates the placement with a compact authored
        // slide instead of a teleport; full motion scales with the ANIM control.
        const phaseDurations = prefersReducedMotion
          ? [...REDUCED_MOTION_CHOREO.placement]
          : [p.pickupMs, p.holdMs, p.launchMs, p.travelMs, p.approachMs, p.impactMs, p.reboundMs, p.settleMs]
              .map((ms) => durationAtSpeed(ms, animationSpeed));
        const durationMs = phaseDurations.reduce((sum, ms) => sum + ms, 0);
        queueCardTravel({
          card,
          imageUrl: getImage(assets, card),
          category,
          label: "You",
          fromElement,
          toElement,
          fromRotation: readElementRotation(fromElement),
          toRotation: 0,
          kind: current ? "lane-move" : "place",
          targetCategoryId: category.id,
          phaseDurations,
          durationMs,
          acceptanceMs: prefersReducedMotion
            ? REDUCED_MOTION_CHOREO.placementAcceptanceMs
            : durationAtSpeed(p.acceptanceMs, animationSpeed),
        });
        // Hold the fan slot open through pickup, the anticipation hold, and the
        // launch; only start closing the gap 40% into the main flight.
        const cardId = card.id;
        const [pickupMs, holdMs, launchMs, travelMs] = phaseDurations;
        setHandGapIds((ids) => (ids.includes(cardId) ? ids : [...ids, cardId]));
        timersRef.current.push(
          window.setTimeout(
            () => setHandGapIds((ids) => ids.filter((id) => id !== cardId)),
            pickupMs + holdMs + launchMs + Math.round(travelMs * STAT_CHECK_ANIMATION.handGapHoldTravelRatio),
          ),
        );
      }
      dispatchRevealStep({ type: "pickup" });
      setMatch((state) => assignCard(state, category.id, selectedCardId));
      setSelectedCardId(null);
    } else if (current) {
      // Ignore clicks on a lane whose card is still traveling toward it, so a
      // rapid double-click cannot place a card and immediately bounce it back.
      if (travelingCards.some((item) => item.card.id === current && item.kind !== "return")) return;
      const card = match.playerHand.find((item) => item.id === current);
      // Capture the board-slot geometry BEFORE the return commits (the card
      // unmounts from the lane on commit), then flush the state change so the
      // card's own fan slot is mounted (hidden) and we can fly the clone into
      // its exact final position and rotation — no near-hand pause or pop.
      const fromRect = snapshotElement(slotElement(lanePlayerRefs.current[category.id]));
      dispatchRevealStep({ type: "return" });
      flushSync(() => setMatch((state) => assignCard(state, category.id, null)));
      if (card) {
        const toElement = handCardRefs.current[card.id] ?? handFallbackElement();
        const r = STAT_CHECK_ANIMATION.returnPlay;
        const phaseDurations = prefersReducedMotion
          ? [...REDUCED_MOTION_CHOREO.return]
          : [r.liftMs, r.holdMs, r.travelMs, r.settleMs].map((ms) => durationAtSpeed(ms, animationSpeed));
        queueCardTravel({
          card,
          imageUrl: getImage(assets, card),
          fromRect,
          toElement,
          fromRotation: 0,
          toRotation: readElementRotation(toElement),
          kind: "return",
          phaseDurations,
          durationMs: phaseDurations.reduce((sum, ms) => sum + ms, 0),
        });
      }
    }
  };

  const lockIn = () => {
    if (!isReadyToLock(match) || !canEdit) return;
    // Locking finalizes placement presentation instantly: cancel any in-flight
    // clones and their pending phase timers so they cannot clobber the reveal.
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    setSelectedCardId(null);
    setSelectedItemId(null);
    if (online) {
      // Authoritative lock: the reveal starts only when the server resolution
      // event arrives (both seats locked). Until then the board stays as
      // placed and the opponent-status rail shows the wait.
      void online.submitLock(match.assignments, match.equippedItem);
      return;
    }
    dispatchRevealStep({ type: "lock" });
    setMatch((state) => resolveCurrentRound(state));
  };

  const nextRound = () => {
    if (online) {
      // The server already advanced; this is pure presentation adoption.
      if (online.live && online.live.phase !== "resolved") advanceAdoptOnline(online.live);
      return;
    }
    // A due item choice must complete first; the auto-begin effect and the
    // choice panel own that path, so this control is inert until then.
    if (match.phase !== "resolved" || itemChoiceDue(match)) return;
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    clearDamageReveal();
    dispatchRevealStep({ type: "discard" });
    queueDiscardTravels();
    setSelectedCardId(null);
    const advanced = startNextRound(match);
    setMatch(advanced);
    if (advanced.phase === "match-over") {
      // Deck exhaustion ends the match during round advancement: show the
      // match-over panel instead of dealing into an unplayable round.
      const overTimer = window.setTimeout(
        () => dispatchRevealStep({ type: "match-over" }),
        animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      );
      timersRef.current.push(overTimer);
      return;
    }
    const dealTimer = window.setTimeout(() => dispatchRevealStep({ type: "deal" }), animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed));
    const selectTimer = window.setTimeout(() => dispatchRevealStep({ type: "select" }), animationDuration(STAT_CHECK_ANIMATION.discardMs + STAT_CHECK_ANIMATION.dealStaggerMs * 4, prefersReducedMotion, animationSpeed));
    timersRef.current.push(dealTimer, selectTimer);
  };

  const queueCardTravel = ({
    card,
    imageUrl,
    category,
    value,
    label,
    fromElement,
    toElement,
    fromRect,
    toRect,
    fromRotation,
    toRotation,
    kind,
    durationMs,
    phaseDurations,
    acceptanceMs,
    targetCategoryId,
  }: {
    card: StatCheckCard;
    imageUrl?: string | null;
    category?: StatCategory;
    value?: number;
    label?: string;
    fromElement?: Element | null;
    toElement?: Element | null;
    fromRect?: DOMRectSnapshot | null;
    toRect?: DOMRectSnapshot | null;
    fromRotation: number;
    toRotation: number;
    kind: TravelingCardState["kind"];
    durationMs: number;
    phaseDurations?: number[];
    acceptanceMs?: number;
    targetCategoryId?: StatCategoryId;
  }) => {
    const from = fromRect ?? snapshotElement(fromElement) ?? fallbackRect();
    const to = toRect ?? snapshotElement(toElement) ?? from;
    const id = `${kind}:${card.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    setTravelingCards((items) => [...items, { id, card, imageUrl, category, value, label, from, to, fromRotation, toRotation, durationMs, phaseDurations, kind }]);
    if ((kind === "place" || kind === "lane-move") && phaseDurations?.length === 8) {
      // Schedule the hero-play phase machine: each dispatch fires at the end of
      // the previous phase; the lane charges immediately, flashes at impact, and
      // glows in acceptance after the clone hands off.
      const [pickupMs, holdMs, launchMs, travelMs, approachMs, impactMs, reboundMs, settleMs] = phaseDurations;
      if (targetCategoryId) setLaneReaction({ categoryId: targetCategoryId, kind: "charging" });
      let at = pickupMs;
      const schedule = (delay: number, action: () => void) => timersRef.current.push(window.setTimeout(action, delay));
      schedule(at, () => dispatchRevealStep({ type: "hold" }));
      schedule((at += holdMs), () => dispatchRevealStep({ type: "launch" }));
      schedule((at += launchMs), () => dispatchRevealStep({ type: "travel" }));
      schedule((at += travelMs), () => dispatchRevealStep({ type: "approach" }));
      schedule((at += approachMs), () => {
        if (targetCategoryId) setLaneReaction({ categoryId: targetCategoryId, kind: "impact" });
        dispatchRevealStep({ type: "impact" });
      });
      schedule((at += impactMs), () => dispatchRevealStep({ type: "rebound" }));
      schedule((at += reboundMs), () => dispatchRevealStep({ type: "settle" }));
      schedule((at += settleMs), () => {
        if (targetCategoryId) setLaneReaction({ categoryId: targetCategoryId, kind: "accept" });
        dispatchRevealStep({ type: "accept" });
      });
      schedule(at + (acceptanceMs ?? 0), () => setLaneReaction((reaction) => (reaction?.categoryId === targetCategoryId ? null : reaction)));
    }
    const timer = window.setTimeout(() => {
      setTravelingCards((items) => items.filter((item) => item.id !== id));
      if (["place", "return", "lane-move"].includes(kind)) dispatchRevealStep({ type: "select" });
    }, durationMs + 80);
    timersRef.current.push(timer);
  };

  const handFallbackElement = () => Object.values(handCardRefs.current).find(Boolean) ?? null;

  const queueDiscardTravels = () => {
    if (!activeResolution) return;
    // Narrow layouts keep the discard piles inside a collapsed drawer whose
    // content has no box geometry; fly the cards toward the drawer's corner
    // of the viewport instead of letting the clone collapse onto itself.
    const discardTarget = (side: "player" | "bot"): DOMRectSnapshot =>
      snapshotElement(discardRefs.current[side]) ?? {
        x: side === "player" ? window.innerWidth * 0.7 : window.innerWidth * 0.2,
        y: window.innerHeight + 40,
        width: 44,
        height: 62,
      };
    // Outgoing cards keep the presentation of the round they belonged to: the
    // lane they contested and the final value they contested it with. Without
    // this the clone had no category and fell back to the generic stat chips,
    // flashing stats that had nothing to do with the round being cleared.
    for (const result of activeResolution.results) {
      queueCardTravel({
        card: result.playerCard,
        imageUrl: getImage(assets, result.playerCard),
        category: result.category,
        value: result.playerValue,
        fromElement: slotElement(lanePlayerRefs.current[result.category.id]),
        toRect: discardTarget("player"),
        fromRotation: 0,
        toRotation: -8,
        kind: "discard",
        durationMs: animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      });
      queueCardTravel({
        card: result.botCard,
        imageUrl: getImage(assets, result.botCard),
        category: result.category,
        value: result.botValue,
        fromElement: slotElement(laneBotRefs.current[result.category.id]),
        toRect: discardTarget("bot"),
        fromRotation: 0,
        toRotation: 8,
        kind: "discard",
        durationMs: animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      });
    }
  };

  if (online && !onlineReadyRef.current) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050b12] text-slate-100">
        <div data-testid="sc-online-connecting" className="rounded-md border border-cyan-300/15 bg-black/30 p-6 text-sm text-slate-300">
          {online.status === "error"
            ? `Could not join the match${online.errorCode ? ` (${online.errorCode})` : ""}.`
            : "Connecting to your match…"}
        </div>
      </main>
    );
  }

  return (
    <main
      data-anim-phase={revealStep}
      className="relative min-h-screen overflow-hidden bg-[#050b12] text-slate-100 [@media(min-width:1210px)_and_(min-height:840px)]:h-[calc(100svh-56px)] [@media(min-width:1210px)_and_(min-height:840px)]:min-h-0"
    >
      {isAnimDebugEnabled() && (
        <div
          data-testid="stat-check-phase-indicator"
          className="fixed bottom-2 left-2 z-[10000] rounded bg-black/85 px-2 py-1 font-mono text-[11px] text-lime-300"
        >
          {revealStep}
          {laneReaction ? ` | ${laneReaction.kind}:${laneReaction.categoryId}` : ""}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(25,187,211,0.2),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,168,76,0.16),transparent_34%),linear-gradient(180deg,#091421_0%,#071018_45%,#04070b_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[8%] mx-auto h-[74%] max-w-6xl rounded-[42%] bg-[radial-gradient(ellipse_at_center,rgba(8,22,35,0.92),rgba(4,8,13,0.35)_68%,transparent_72%)] shadow-[0_0_90px_rgba(0,0,0,0.7)_inset]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1920px] flex-col gap-2 px-3 py-2 sm:px-4 min-[1210px]:h-full min-[1210px]:min-h-0 min-[1210px]:px-2">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div>
            <div className="hidden items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#d6b55d] md:flex">
              <Swords className="h-4 w-4" /> {surface === "public" ? (online ? "Private match" : "Practice match") : "Dev prototype"}
            </div>
            <h1 className="text-lg font-black leading-tight md:text-2xl min-[1210px]:text-3xl">Stat Check</h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300 md:gap-2">
            {surface === "dev" && (
              <Badge variant="outline" className="hidden border-cyan-300/30 bg-cyan-300/10 text-cyan-100 md:inline-flex">
                {online ? "Online match" : dataSource}
              </Badge>
            )}
            <AnimationSpeedControl speed={animationSpeed} onSpeedChange={setAnimationSpeed} />
            {surface === "dev" && !online && isLoading && <Badge variant="outline" className="hidden md:inline-flex">Loading stats</Badge>}
            {surface === "dev" && !online && isError && <Badge variant="outline" className="hidden md:inline-flex">Fallback active</Badge>}
            {!online && (
              <Button size="sm" variant="outline" onClick={restart} className="border-[#d6b55d]/40 bg-black/30 text-[#f4d77d]">
                <RotateCcw className="h-4 w-4 md:mr-1.5" />
                <span className="hidden md:inline">Restart</span>
              </Button>
            )}
          </div>
        </header>

        {/* The three-column arena grid needs ~1210px: 280px matchup rail +
            three 210px-minimum lanes with their gaps and slab chrome + the
            utility rail. Below that the rails UNMOUNT (no stacked document
            flow): a compact matchup header sits above the board, inventory
            docks in the controls row, and secondary info collapses into a
            drawer below the arena. */}
        <section
          className={cn(
            "flex flex-1 flex-col gap-2",
            wideLayout && "grid min-h-0 grid-cols-[280px_minmax(0,1fr)_160px] xl:grid-cols-[300px_minmax(0,1fr)_176px]",
          )}
        >
          {wideLayout ? (
            <MatchupRail
              match={match}
              displayHp={displayHp}
              resolution={activeResolution}
              flashKey={damageFlashKey}
              impactSide={damageImpactSide}
              isOnline={Boolean(online)}
              opponentLabel={opponentLabel}
              surface={surface}
            />
          ) : (
            <CompactMatchupBar
              displayHp={displayHp}
              resolution={activeResolution}
              flashKey={damageFlashKey}
              impactSide={damageImpactSide}
              isOnline={Boolean(online)}
              opponentLabel={opponentLabel}
            />
          )}

          <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-1.5 sm:gap-2">
            <div
              data-testid="stat-check-arena"
              data-damage-stage={damageReveal?.stage ?? undefined}
              className={cn(
                "relative min-h-0 rounded-2xl p-1.5 md:p-2 min-[1210px]:p-3",
                // The slab itself: the approved stone-surface asset is the board
                // material, held by a raised brass perimeter frame. Translucent
                // light/shade gradients sit over the texture so the stone stays
                // visible but reads as one lit object; the drop shadows below
                // give the block visible thickness on the table.
                "border-2 border-[#7d6430]",
                "shadow-[inset_0_2px_0_rgba(244,215,125,0.28),inset_0_-2px_0_rgba(0,0,0,0.6),inset_0_0_70px_rgba(0,0,0,0.55),0_6px_0_-2px_#241d0e,0_10px_0_-4px_#0a0d14,0_30px_60px_rgba(0,0,0,0.6)]",
                // Impact frame: two short directional jolts on the arena frame
                // ONLY. It is a transform, so no layout box moves and the app
                // shell, header, rails and page never shake with it.
                damageReveal?.stage === "impact" && "animate-arena-jolt motion-reduce:animate-none",
              )}
              style={{
                backgroundImage: `radial-gradient(ellipse at 50% 16%, rgba(72,98,132,0.34), transparent 60%), linear-gradient(180deg, rgba(27,37,54,0.22) 0%, rgba(16,23,36,0.4) 46%, rgba(9,14,24,0.62) 100%), url(${stoneSurfaceUrl})`,
                backgroundSize: "auto, auto, 640px 640px",
                // Value-badge emphasis transitions (enlarge, winner/loser, and
                // the settle cleanup) read this, so they scale with the speed
                // control exactly like the scheduled beats — which is what lets
                // the next lane start the instant cleanup has finished.
                ["--sc-value-transition" as string]: `${durationAtSpeed(LANE_PLAQUE_TIMELINE.valueTransitionMs, animationSpeed)}ms`,
                ["--sc-arena-jolt" as string]: `${durationAtSpeed(DAMAGE_REVEAL_TIMELINE.impactMs, animationSpeed)}ms`,
              }}
            >
              <ArenaAmbience
                reducedMotion={prefersReducedMotion}
                intense={
                  revealStep === "locking" ||
                  revealStep.startsWith("opponent-reveal") ||
                  revealStep.startsWith("resolve-lane") ||
                  revealStep === "board-result" ||
                  revealStep === "damage"
                }
                verdict={
                  damageReveal?.stage === "impact" ||
                  revealStep === "damage" ||
                  revealStep === "resolved" ||
                  revealStep === "match-over"
                }
                verdictKey={damageFlashKey}
              />
              {/* All three lanes stay side-by-side at EVERY width: cards are
                  width-budgeted below md (see BOARD_CARD_SIZE) so the board
                  compacts instead of scrolling horizontally. Lane gaps and
                  unused stone shrink with the viewport. */}
              <div className="relative z-10 grid h-full min-h-0 grid-cols-3 gap-1 sm:gap-2 md:grid-cols-[repeat(3,minmax(180px,340px))] md:justify-center md:gap-4 min-[1210px]:grid-cols-[repeat(3,minmax(210px,340px))] min-[1210px]:gap-8 xl:gap-12">
              {match.currentCategories.map((category, index) => {
                const resolution = activeResolution?.results.find((result) => result.category.id === category.id);
                const assigned = assignedCard(match, category.id);
                return (
                  <ArenaLane
                    key={category.id}
                    category={category}
                    index={index}
                    selectedCard={selectedCard}
                    playerCard={resolution?.playerCard ?? assigned}
                    playerCardInFlight={Boolean(assigned && inFlightToLaneIds.has(assigned.id))}
                    botCard={resolution?.botCard ?? null}
                    resolution={resolution}
                    canEdit={canEdit}
                    revealStep={revealStep}
                    active={activeLaneIndex === index}
                    reaction={laneReaction?.categoryId === category.id ? laneReaction.kind : null}
                    revealedBotCount={revealedOpponentCount(revealStep)}
                    reducedMotion={prefersReducedMotion}
                    animationSpeed={animationSpeed}
                    assets={assets}
                    concealed={preRoundItemChoice}
                    itemsRevealed={itemsRevealed}
                    plaqueStage={lanePlaqueStages[index] ?? "category"}
                    armedItem={armedItem}
                    pendingItem={match.equippedItem?.categoryId === category.id ? match.equippedItem : null}
                    onRemovePendingItem={removePendingItem}
                    opponentLabel={opponentLabel}
                    laneRef={(element) => { laneRefs.current[category.id] = element; }}
                    playerRef={(element) => { lanePlayerRefs.current[category.id] = element; }}
                    botRef={(element) => { laneBotRefs.current[category.id] = element; }}
                    onPlace={() => placeCard(category)}
                  />
                );
              })}
              </div>
              {/* Round payoff: the already-computed damage components add into
                  one number in the middle of the arena, in front of the board.
                  Absolutely positioned inside the slab, so it adds no layout
                  box — no lane, card, socket, connector or plaque can move
                  because of it. */}
              <CentreDamageReveal
                reveal={damageReveal}
                identities={identities}
                animationSpeed={animationSpeed}
              />
            </div>

            <div className="relative flex items-start gap-1 sm:gap-1.5">
              {/* Board-mounted item dock — icons and counts only, one mount,
                  one component, one orientation. It is the hand tray's left
                  column at every width: an in-flow vertical socket strip whose
                  top lip meets the slab's bottom-left edge, so it reads as an
                  extension of the board rather than a panel.
                  Being in flow (not absolutely mounted) is what keeps it clear
                  of the hand on phones, where the fan otherwise spans the whole
                  viewport: the tray shrinks by the strip's width instead of
                  being overlapped, and the mobile fan budget in
                  responsiveFanParameters reserves that same column. */}
              <ItemInventoryDock
                inventory={match.playerInventory}
                selectedItemId={selectedItemId}
                disabled={!canEdit}
                onToggle={toggleInventoryItem}
                collapsed={dockCollapsed}
                onToggleCollapsed={() => setInventoryCollapsed((current) => !current)}
                nextHintFamily={match.nextCategories[0]?.family ?? null}
                className="z-[450] -mt-2 shrink-0"
              />
              {/* hand dock: a carved stone tray extending from the slab's lower
                  edge, in the same stone-and-brass construction — the hand is
                  held by the board, not floating on a panel */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-[12%] -top-3 bottom-3 overflow-hidden border-x-2 border-b-2 border-[#7d6430]/70 shadow-[inset_0_2px_0_rgba(244,215,125,0.2),inset_0_14px_30px_rgba(0,0,0,0.55),0_8px_0_-3px_#0a0d14,0_18px_36px_rgba(0,0,0,0.5)] sm:inset-x-[20%]"
                style={{
                  borderRadius: "14px 14px 50% 50% / 14px 14px 130px 130px",
                  backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(72,98,132,0.3), transparent 65%), linear-gradient(180deg, rgba(24,32,47,0.3) 0%, rgba(13,19,32,0.55) 55%, rgba(9,14,24,0.72) 100%), url(${stoneSurfaceUrl})`,
                  backgroundSize: "auto, auto, 560px 560px",
                }}
              >
                <span className="absolute inset-x-4 top-3 bottom-2 rounded-[12px_12px_50%_50%/12px_12px_110px_110px] border border-black/40 shadow-[inset_0_3px_12px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.04)]" />
              </div>
              {/* brass lip joining slab to dock, with the center keystone tab */}
              <div aria-hidden className="pointer-events-none absolute -top-3 left-1/2 h-[3px] w-[70%] -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,transparent,rgba(138,111,53,0.7)_18%,rgba(168,137,75,0.85)_50%,rgba(138,111,53,0.7)_82%,transparent)] shadow-[inset_0_1px_0_rgba(244,215,125,0.4)]" />
              <div aria-hidden className="pointer-events-none absolute -top-3 left-1/2 h-2.5 w-48 -translate-x-1/2 rounded-b-md bg-gradient-to-b from-[#8a6f35]/60 to-transparent" />
              {/* small power cores where the tray meets the slab */}
              <HextechCore className="pointer-events-none -top-[13px] left-[13%] sm:left-[21%]" />
              <HextechCore className="pointer-events-none -top-[13px] right-[13%] sm:right-[21%]" />
              {/* restrained energy feed under the fan */}
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-2 h-16 w-[46%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.1),transparent_70%)]" />
              <PlayerHand
                cards={match.playerHand}
                categories={match.currentCategories}
                assets={assets}
                selectedCardId={selectedCardId}
                assignedCardIds={assignedCardIds}
                departingIds={departingIds}
                returningIds={returningIds}
                disabled={!canEdit}
                reducedMotion={prefersReducedMotion}
                reflowMs={animationDuration(STAT_CHECK_ANIMATION.handReflowMs, prefersReducedMotion, animationSpeed)}
                cardRefs={handCardRefs}
                onSelect={(cardId) => {
                  if (!canEdit) return;
                  setSelectedItemId(null);
                  setSelectedCardId((current) => (current === cardId ? null : cardId));
                }}
              />
            </div>

            {/* The fan's outer cards droop past the hand container, so the
                controls row must own the stacking context above them (fan
                cards reach z-400 on hover) — otherwise a drooping card sits
                over Lock In and swallows the tap on narrow screens. */}
            <div className="relative z-[500] flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 px-1">
              {/* Lock In exists ONLY during the selecting phase: it never
                  competes with item confirmation or terminal controls. */}
              {match.phase === "selecting" && (
                <Button
                  size="sm"
                  data-testid="stat-check-lock"
                  onClick={lockIn}
                  disabled={!isReadyToLock(match) || !canEdit}
                  className={cn(
                    "bg-[#d6b55d] text-[#071018] shadow-[0_0_24px_rgba(214,181,93,0.25)] hover:bg-[#f4d77d]",
                    revealStep === "locking" && "animate-pulse motion-reduce:animate-none",
                  )}
                >
                  <Zap className="mr-1.5 h-4 w-4" /> Lock in
                </Button>
              )}
            </div>
          </section>

          {wideLayout ? (
            <aside className="relative h-full min-h-0 space-y-2 overflow-y-auto rounded-md border border-cyan-300/15 bg-black/28 p-1.5 shadow-2xl">
              <RevealSequence
                match={match}
                resolution={activeResolution}
                revealStep={revealStep}
                onNextRound={nextRound}
                onRestart={online ? (onOnlineExit ?? restart) : restart}
                opponentLabel={opponentLabel}
                online={itemChoiceOpen ? null : onlineState}
              />
              <UtilityStack
                match={match}
                assets={assets}
                opponentLabel={opponentLabel}
                botDiscardRef={(element) => { discardRefs.current.bot = element; }}
                playerDiscardRef={(element) => { discardRefs.current.player = element; }}
              />
            </aside>
          ) : (
            <section className="space-y-2 pb-[max(env(safe-area-inset-bottom),8px)]">
              <div className="rounded-md border border-cyan-300/15 bg-black/28 p-2.5 shadow-2xl">
                <RevealSequence
                  match={match}
                  resolution={activeResolution}
                  revealStep={revealStep}
                  onNextRound={nextRound}
                  onRestart={online ? (onOnlineExit ?? restart) : restart}
                  opponentLabel={opponentLabel}
                  online={itemChoiceOpen ? null : onlineState}
                />
              </div>
              {/* Secondary information: collapsed by default so history and
                  discards never dominate the arena on narrow screens. */}
              <details
                data-testid="stat-check-secondary"
                className="rounded-md border border-cyan-300/15 bg-black/28 p-2.5 shadow-2xl"
              >
                <summary className="cursor-pointer select-none text-xs font-black uppercase tracking-[0.14em] text-cyan-100">
                  Match details
                </summary>
                <div className="mt-2 grid gap-2">
                  <CountPill label="Shared pool" value={match.drawPile.length} />
                  <CountPill label="Your hand" value={match.playerHand.length} />
                  <CountPill label={`${opponentLabel} hand`} value={match.botHand.length} />
                  <LastRoundDamage resolution={match.roundHistory[match.roundHistory.length - 1] ?? null} opponentLabel={opponentLabel} />
                  <MatchHistoryPanel history={match.roundHistory} opponentLabel={opponentLabel} />
                  <DiscardPile side="bot" cards={match.botDiscard} assets={assets} opponentLabel={opponentLabel} elementRef={(element) => { discardRefs.current.bot = element; }} />
                  <DiscardPile side="player" cards={match.playerDiscard} assets={assets} opponentLabel={opponentLabel} elementRef={(element) => { discardRefs.current.player = element; }} />
                </div>
              </details>
            </section>
          )}
        </section>
      </div>
      {/* Item acquisition is a temporary phase: it lives in a contextual
          overlay (bottom sheet on phones, centered modal above) with the
          board still visible behind it. Never a page transition. */}
      <ItemChoiceOverlay open={itemChoiceOpen}>
        <NextRoundIntel
          categories={preRoundItemChoice ? match.currentCategories : match.nextCategories}
          heading={preRoundItemChoice ? "Round 1 Intel" : "Next Round Intel"}
          compact
        />
        <div className="mt-2">
          <ItemChoicePanel
            title={
              preRoundItemChoice
                ? "Choose your starting item"
                : `Item choice — ${match.roundHistory.length} rounds complete`
            }
            subtitle={
              preRoundItemChoice
                ? "Both sides pick one item in secret before Round 1 begins."
                : "Both sides pick one item in secret before the next round begins."
            }
            inventory={match.playerInventory}
            selectedItemId={pendingChoiceId}
            onSelect={(itemId) => setPendingChoiceId(itemId)}
            onConfirm={confirmItemChoice}
            waiting={Boolean(online && itemChoiceOpen && online.youChosen)}
          />
        </div>
        {onlineState && itemChoiceOpen && <OnlineOpponentStatus online={onlineState} phase={match.phase} />}
      </ItemChoiceOverlay>
      <CardMotionOverlay travelingCards={travelingCards} assets={assets} reducedMotion={prefersReducedMotion} />
    </main>
  );
}

/** Deterministic ambient motes drifting over the arena floor. */
const ARENA_PARTICLES = [
  { left: "9%", top: "22%", size: 3, duration: 16, delay: 0 },
  { left: "18%", top: "68%", size: 2, duration: 13, delay: 2.5 },
  { left: "31%", top: "38%", size: 2, duration: 18, delay: 5 },
  { left: "46%", top: "76%", size: 3, duration: 14, delay: 1.2 },
  { left: "57%", top: "24%", size: 2, duration: 17, delay: 7 },
  { left: "69%", top: "62%", size: 3, duration: 15, delay: 3.4 },
  { left: "82%", top: "34%", size: 2, duration: 19, delay: 6 },
  { left: "92%", top: "70%", size: 2, duration: 12, delay: 4.2 },
] as const;

/** Flat-top hexagon for the central engine housing and crystal chamber. */
const HEX_CLIP = "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)";
/** Octagonal brass housing silhouette for the perimeter power cores. */
const OCTAGON_CLIP = "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";
/** Fine fractal-noise grain overlaid on the slab so it reads as stone. */
const STONE_NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")";

/**
 * A perimeter power core: an octagonal brass housing with a recessed chamber
 * and a glowing blue gem, mounted on the slab's conduit circuit.
 */
function HextechCore({ className, size = "md", bright = false }: { className?: string; size?: "md" | "lg"; bright?: boolean }) {
  return (
    <span aria-hidden className={cn("absolute grid place-items-center", size === "lg" ? "h-7 w-7" : "h-[22px] w-[22px]", className)}>
      <span className="absolute inset-0 bg-[linear-gradient(160deg,#8a6f35,#4a3a1c_55%,#6a5429)] shadow-[0_2px_4px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(244,215,125,0.5)]" style={{ clipPath: OCTAGON_CLIP }} />
      <span className="absolute inset-[3px] bg-[#0a121f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]" style={{ clipPath: OCTAGON_CLIP }} />
      <span
        className={cn(
          "relative rotate-45 rounded-[1px]",
          size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2",
          bright
            ? "bg-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.95),0_0_24px_rgba(34,211,238,0.55)]"
            : "bg-cyan-300/90 shadow-[0_0_8px_rgba(34,211,238,0.75),0_0_18px_rgba(34,211,238,0.35)]",
        )}
      />
    </span>
  );
}

/**
 * Shared hextech-arena atmosphere: haze, striations, perimeter construction
 * (corner brackets, edge ring), the comparison MECHANISM (brass rail with a
 * flowing energy channel and end caps), a layered rotating core the middle
 * plaque mounts onto, and slow arcane motes. `intense` brightens the core and
 * speeds the energy flow during reveal/resolution; `verdictKey`/`verdict`
 * fire a one-shot gold perimeter flash when damage lands. Pure decoration —
 * pointer-events-none, behind the lanes, static under reduced motion.
 */
function ArenaAmbience({
  reducedMotion,
  intense,
  verdict,
  verdictKey,
}: {
  reducedMotion: boolean;
  intense: boolean;
  verdict: boolean;
  verdictKey: number;
}) {
  const flowAnim = !reducedMotion && (intense ? "animate-[sc-flow_2.2s_linear_infinite]" : "animate-[sc-flow_5s_linear_infinite]");
  const flowStyle: CSSProperties = {
    backgroundImage: "repeating-linear-gradient(90deg, rgba(34,211,238,0) 0px, rgba(34,211,238,0.5) 12px, rgba(34,211,238,0) 28px)",
    backgroundSize: "220px 100%",
  };
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      <style>{`
        @keyframes sc-drift { 0%,100% { transform: translateY(0); opacity: .12 } 50% { transform: translateY(-30px); opacity: .4 } }
        @keyframes sc-core-pulse { 0%,100% { opacity: .6; transform: scale(1) } 50% { opacity: 1; transform: scale(1.04) } }
        @keyframes sc-flow { from { background-position: 0 0 } to { background-position: 220px 0 } }
        @keyframes sc-verdict { 0% { opacity: .55; transform: scale(.995) } 100% { opacity: 0; transform: scale(1.012) } }
      `}</style>
      {/* light synthetic grain on top of the real stone asset, keeping the
          carved-striation direction without competing with its cracks */}
      <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay" style={{ backgroundImage: STONE_NOISE_URL }} />
      <div className="absolute inset-0 opacity-40 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.014)_0px,rgba(255,255,255,0.014)_2px,transparent_2px,transparent_11px)]" />
      {/* magical haze pooling low on the slab */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_44%,rgba(56,189,248,0.06),transparent_56%),radial-gradient(ellipse_at_50%_100%,rgba(70,86,140,0.08),transparent_50%)]" />
      {/* recessed inner playing surface: a step carved below the perimeter */}
      <div className="absolute inset-[26px] rounded-lg border border-black/45 shadow-[inset_0_3px_14px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.04)]" />
      {/* perimeter conduit groove routed between the cores: an inset dark
          channel with a live cyan line, one continuous circuit around the slab */}
      <div className="absolute inset-[13px] rounded-[10px] border-[3px] border-[#0a0f1a] shadow-[0_1px_0_rgba(244,215,125,0.1),inset_0_1px_0_rgba(244,215,125,0.08)]" />
      <div className={cn("absolute inset-x-9 top-[14px] h-px", intense ? "opacity-90" : "opacity-55", flowAnim)} style={flowStyle} />
      <div className={cn("absolute inset-x-9 bottom-[14px] h-px", intense ? "opacity-90" : "opacity-55", flowAnim)} style={flowStyle} />
      <div className="absolute inset-y-9 left-[14px] w-px bg-gradient-to-b from-cyan-300/10 via-cyan-300/40 to-cyan-300/10" />
      <div className="absolute inset-y-9 right-[14px] w-px bg-gradient-to-b from-cyan-300/10 via-cyan-300/40 to-cyan-300/10" />
      {/* perimeter power cores: corners, rail junctions, and center taps — the
          brass housings sit ON the conduit so the border reads as one circuit */}
      <HextechCore className="left-1 top-1" />
      <HextechCore className="right-1 top-1" />
      <HextechCore className="bottom-1 left-1" />
      <HextechCore className="bottom-1 right-1" />
      <HextechCore className="left-[3px] top-1/2 -translate-y-1/2" size="lg" bright={intense} />
      <HextechCore className="right-[3px] top-1/2 -translate-y-1/2" size="lg" bright={intense} />
      <HextechCore className="left-1/2 top-[3px] -translate-x-1/2" />
      <HextechCore className="bottom-[3px] left-1/2 -translate-x-1/2" />
      {/* comparison rail: brass structure fed by the side cores, carrying the
          flowing energy channel the three plaques mount onto */}
      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2">
        <div className="h-[5px] rounded-full bg-[linear-gradient(180deg,#8a6f35,#5f4c26_55%,#3c2f16)] shadow-[0_2px_3px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4),0_0_12px_rgba(214,181,93,0.14)]" />
        <div className={cn("absolute inset-x-1 top-[2px] h-px", intense ? "opacity-95" : "opacity-70", flowAnim)} style={flowStyle} />
      </div>
      {/* vertical comparison shaft feeding the engine from the top/bottom taps */}
      <div className="absolute bottom-4 left-1/2 top-4 w-px -translate-x-1/2 bg-gradient-to-b from-cyan-300/25 via-cyan-300/10 to-cyan-300/25" />
      {/* central comparison engine: one manufactured brass-and-crystal core the
          center plaque mounts over — engraved calibration ring, hex housing,
          and paired crystals left clear above/below the plaque footprint */}
      <div className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center">
        <div className={cn("absolute h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.14),transparent_60%)]", intense && "bg-[radial-gradient(circle,rgba(34,211,238,0.24),transparent_60%)]")} />
        {/* engraved calibration ring: carved into the stone, wide enough that
            its arcs surface in the open floor between the three lane columns */}
        <div
          className="absolute h-[460px] w-[460px] rounded-full"
          style={{
            backgroundImage:
              "repeating-conic-gradient(from 0deg, rgba(214,181,93,0.5) 0deg 1.4deg, transparent 1.4deg 12deg), radial-gradient(circle, transparent 0 47.2%, rgba(0,0,0,0.55) 47.6% 48%, rgba(214,181,93,0.22) 48.2% 48.6%, transparent 49%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 0 45.5%, black 46.5% 49%, transparent 50%)",
            maskImage: "radial-gradient(circle, transparent 0 45.5%, black 46.5% 49%, transparent 50%)",
          }}
        />
        {/* brass hex housing with a recessed dark chamber */}
        <div className="relative grid h-52 w-52 place-items-center">
          <span className="absolute inset-0 bg-[linear-gradient(160deg,#7d6430,#4a3a1c_55%,#6a5429)] shadow-[0_4px_10px_rgba(0,0,0,0.6)]" style={{ clipPath: HEX_CLIP }} />
          <span className="absolute inset-[7px] bg-[linear-gradient(180deg,#101a2b,#0a121f)] shadow-[inset_0_4px_14px_rgba(0,0,0,0.7)]" style={{ clipPath: HEX_CLIP }} />
          <span className="absolute inset-[16px] opacity-70" style={{ clipPath: HEX_CLIP, backgroundImage: "linear-gradient(180deg, rgba(34,211,238,0.06), transparent 40%)" }} />
          {/* inner crystal chamber breathing behind the plaque */}
          <span
            className={cn(
              "absolute h-24 w-24 bg-[radial-gradient(circle,rgba(103,232,249,0.5),rgba(34,211,238,0.18)_55%,transparent_75%)]",
              !reducedMotion && (intense ? "animate-[sc-core-pulse_2.6s_ease-in-out_infinite]" : "animate-[sc-core-pulse_5.5s_ease-in-out_infinite]"),
            )}
            style={{ clipPath: HEX_CLIP }}
          />
          {/* exposed crystal points above and below the mounted plaque */}
          <span className="absolute -top-1 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border border-cyan-200/80 bg-cyan-300/60 shadow-[0_0_14px_rgba(34,211,238,0.6)]" />
          <span className="absolute -bottom-1 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border border-cyan-200/80 bg-cyan-300/60 shadow-[0_0_14px_rgba(34,211,238,0.6)]" />
          {/* brass couplings where the rail enters the housing */}
          <span className="absolute -left-2 top-1/2 h-4 w-3 -translate-y-1/2 rounded-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
          <span className="absolute -right-2 top-1/2 h-4 w-3 -translate-y-1/2 rounded-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        </div>
      </div>
      {/* one-shot gold perimeter flash when damage lands */}
      {verdict && !reducedMotion && (
        <div key={verdictKey} className="absolute inset-1 rounded-xl border-2 border-[#f4d77d]/50" style={{ animation: "sc-verdict 700ms ease-out forwards" }} />
      )}
      {/* arcane motes */}
      {!reducedMotion &&
        ARENA_PARTICLES.map((particle, index) => (
          <span
            key={index}
            className="absolute rounded-full bg-cyan-200/40 blur-[1px]"
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              animation: `sc-drift ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
            }}
          />
        ))}
    </div>
  );
}

/**
 * Centre damage presentation: the round's payoff, mounted over the board.
 *
 * Every number here comes from the plan the scheduler derived from the
 * authoritative RoundDamage — this component adds nothing up and decides
 * nothing. It is absolutely positioned and pointer-events-none, so it cannot
 * reflow the board or intercept a click, and it clears itself between the two
 * directions rather than lingering over the arena.
 */
function CentreDamageReveal({
  reveal,
  identities,
  animationSpeed,
}: {
  reveal: DamageRevealState | null;
  identities: StatCheckIdentities;
  animationSpeed: StatCheckAnimationSpeed;
}) {
  if (!reveal) return null;
  const { step, stage } = reveal;
  const header = damageIdentityHeader(step, identities);
  const shown = damageRevealShownTotal(step, stage);
  const boardShown = damageRevealBoardShown(step, stage);
  const revealedLanes = damageRevealedLanes(step, stage);
  const sweepVisible = damageRevealSweepVisible(step, stage);
  const totalReached = stage === "total" || stage === "impact" || stage === "health" || stage === "settled";
  const striking = stage === "impact" || stage === "health" || stage === "settled";
  const playerDeals = step.side === "player";
  // Arena-relative direction: the opponent's cards sit at the top of every
  // lane and the player's at the bottom, so damage the player deals travels up.
  const travelUp = playerDeals;

  return (
    <div
      aria-hidden
      data-testid="stat-check-damage-reveal"
      data-damage-side={step.side}
      data-damage-target={step.target}
      data-damage-kind={step.kind}
      data-damage-stage={stage}
      data-damage-shown={shown}
      data-damage-board={step.kind === "winner" ? step.boardResult : undefined}
      data-damage-sweep={step.sweep ? "true" : "false"}
      className="pointer-events-none absolute inset-0 z-[300] grid place-items-center"
      style={{
        ["--sc-damage-tick" as string]: `${durationAtSpeed(280, animationSpeed)}ms`,
        ["--sc-damage-pulse" as string]: `${durationAtSpeed(DAMAGE_REVEAL_TIMELINE.healthMs, animationSpeed)}ms`,
        ["--sc-sweep-notice" as string]: `${durationAtSpeed(DAMAGE_REVEAL_TIMELINE.sweepNoticeMs, animationSpeed)}ms`,
        ["--damage-dy" as string]: travelUp ? "-190px" : "190px",
      }}
    >
      {/* Contained radial wash: keeps the number legible over the stone
          without ever hiding the board behind an opaque panel. */}
      <span
        className={cn(
          "absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-300 md:h-[420px] md:w-[420px]",
          playerDeals
            ? "bg-[radial-gradient(circle,rgba(244,215,125,0.34),rgba(6,10,16,0.72)_46%,transparent_70%)]"
            : "bg-[radial-gradient(circle,rgba(248,113,113,0.32),rgba(6,10,16,0.72)_46%,transparent_70%)]",
          striking ? "opacity-100" : "opacity-90",
        )}
      />
      {/* Directional pulse toward the bar that is about to drain. */}
      {stage === "health" && (
        <span
          data-testid="stat-check-damage-pulse"
          className={cn(
            "absolute left-1/2 top-1/2 h-24 w-24 animate-damage-pulse rounded-full motion-reduce:hidden",
            playerDeals
              ? "bg-[radial-gradient(circle,rgba(244,215,125,0.85),transparent_70%)]"
              : "bg-[radial-gradient(circle,rgba(248,113,113,0.85),transparent_70%)]",
          )}
        />
      )}

      {/* Floating SWEEP notification. Absolutely positioned above the plate, so
          it adds no layout box and can never push the identity header or the
          numbers around; it is contained by the arena's own bounds. It exists
          only while the board stage that established the `3` is on screen, and
          it is derived from the step, so it owns no state and cannot replay on
          reconnect or recovery. Reduced motion keeps the plain opacity fade and
          drops the float and the sparkle travel. */}
      {sweepVisible && (
        <div
          data-testid="stat-check-sweep-notice"
          className="absolute bottom-[calc(50%+68px)] left-1/2 -translate-x-1/2 md:bottom-[calc(50%+104px)]"
        >
          <div
            className={cn(
              "relative animate-sweep-notice rounded-lg border-2 border-[#d6b55d]/70 px-3 py-1 md:px-5 md:py-1.5",
              "bg-[linear-gradient(180deg,rgba(74,58,28,0.97),rgba(6,10,16,0.98))]",
              "shadow-[0_10px_30px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(244,215,125,0.35)]",
              "motion-reduce:animate-none motion-reduce:opacity-100",
            )}
            style={{ animationDuration: "var(--sc-sweep-notice)" }}
          >
            {/* Glint travelling across the brass. Purely decorative, and the
                first thing reduced motion drops. */}
            <span
              aria-hidden
              data-testid="stat-check-sweep-glint"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-md motion-reduce:hidden"
            >
              <span
                className="absolute inset-y-0 -left-full w-1/2 animate-sweep-glint bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]"
                style={{ animationDuration: "var(--sc-sweep-notice)" }}
              />
            </span>
            <span
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap text-[13px] font-black uppercase leading-none tracking-[0.34em] md:text-xl",
                "text-[#ffe9a8] [text-shadow:0_0_18px_rgba(244,215,125,0.95),0_2px_0_rgba(0,0,0,0.65)]",
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-[#8ee6f0] motion-reduce:hidden md:h-5 md:w-5" strokeWidth={3} />
              Sweep
            </span>
          </div>
        </div>
      )}

      {/* A brass-framed readout in the same construction as the lane plaques —
          frame, bolts, dark interior — rather than a floating label over the
          board. It must be opaque: the centre of the arena is exactly where the
          middle lane's plaque sits, and a translucent panel let that plaque's
          "+1" show through beside the total and read as part of the number. */}
      <div
        className={cn(
          "relative rounded-2xl border-2 p-[6px] shadow-[0_18px_44px_rgba(0,0,0,0.75)]",
          playerDeals
            ? "border-[#8a6f35]/80 bg-[linear-gradient(180deg,rgba(74,58,28,0.95),rgba(6,10,16,0.98))]"
            : "border-[#7d3a3a]/80 bg-[linear-gradient(180deg,rgba(74,28,28,0.95),rgba(6,10,16,0.98))]",
        )}
      >
        {/* corner bolts, matching the lane plaque's backing plate */}
        {["left-1 top-1", "right-1 top-1", "bottom-1 left-1", "bottom-1 right-1"].map((position) => (
          <span
            key={position}
            className={cn(
              "absolute h-1.5 w-1.5 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7)]",
              position,
              playerDeals ? "bg-[#a8894b]" : "bg-[#b06a6a]",
            )}
          />
        ))}
        <div
          className={cn(
            "flex min-w-[212px] flex-col items-center gap-1 rounded-xl border bg-[#05090f]/95 px-4 py-2 md:min-w-[320px] md:px-7 md:py-3",
            playerDeals ? "border-[#d6b55d]/45" : "border-red-400/40",
          )}
        >
          {/* Identity header: WHO this damage belongs to, with their avatar, as
              one unit. The arrow points at the side of the arena whose health
              bar this will reduce, which is what ties the identity to the damage
              being presented. A retaliation reads COUNTER, never WINNER, so the
              board-losing side is never presented as the round winner. */}
          <div
            data-testid="stat-check-damage-identity"
            data-damage-label={header.label}
            data-damage-name={header.name}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.24em] md:gap-2 md:text-[11px]",
              playerDeals ? "text-[#f4d77d]" : "text-red-200",
            )}
          >
            {travelUp ? <ArrowUp className="h-3 w-3" strokeWidth={3} /> : <ArrowDown className="h-3 w-3" strokeWidth={3} />}
            <span>
              {header.label}: {header.name}
            </span>
            <UserAvatar
              src={header.avatarUrl}
              name={header.name}
              size="xs"
              className={cn("ring-1", playerDeals ? "ring-[#d6b55d]/60" : "ring-red-400/50")}
            />
          </div>

          {/* The arithmetic, read left to right exactly as it was earned: the
              board result the round opened with, the three lanes in board
              order, then the total. Every slot is always mounted and reserved,
              so the plate never changes width mid-count and nothing under it
              moves. */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Board result: 2 for a normal board win, 3 for a sweep. Absent
                entirely on a retaliation, which never claims the board. */}
            {step.kind === "winner" && (
              <span
                key={`board:${step.boardResult}`}
                data-testid="stat-check-damage-board"
                data-damage-board-shown={boardShown ? "true" : "false"}
                className={cn(
                  "text-[38px] font-black leading-none tabular-nums transition-opacity duration-200 md:text-[58px]",
                  boardShown ? "animate-damage-tick opacity-100" : "opacity-0",
                  playerDeals
                    ? "text-[#ffe9a8] [text-shadow:0_0_22px_rgba(244,215,125,0.85),0_4px_0_rgba(0,0,0,0.6)]"
                    : "text-red-200 [text-shadow:0_0_22px_rgba(248,113,113,0.8),0_4px_0_rgba(0,0,0,0.6)]",
                )}
              >
                {step.boardResult}
              </span>
            )}

            {/* The three lane bonuses, left → middle → right, aligned with the
                board's own lane order. All three appear, including +0: a zero
                lane is deliberately subordinate rather than hidden. */}
            <div data-testid="stat-check-damage-lanes" className="flex items-center gap-1.5 md:gap-2.5">
              {step.laneBonuses.map((bonus) => {
                const laneRevealed = revealedLanes.some((entry) => entry.lane === bonus.lane);
                const earned = bonus.amount > 0;
                return (
                  <span
                    key={bonus.stage}
                    data-testid={`stat-check-damage-lane-${bonus.lane}`}
                    data-damage-lane-amount={bonus.amount}
                    data-damage-lane-revealed={laneRevealed ? "true" : "false"}
                    className={cn(
                      "text-base font-black leading-none tabular-nums transition-all duration-200 md:text-2xl",
                      laneRevealed ? "opacity-100" : "opacity-0",
                      laneRevealed && earned && "animate-damage-tick",
                      earned
                        ? playerDeals
                          ? "scale-110 text-[#f4d77d] [text-shadow:0_0_14px_rgba(244,215,125,0.85)]"
                          : "scale-110 text-red-200 [text-shadow:0_0_14px_rgba(248,113,113,0.8)]"
                        : "text-slate-500",
                    )}
                  >
                    +{bonus.amount}
                  </span>
                );
              })}
            </div>

            {/* Final total. Always mounted (invisible until it lands) so the
                plate never changes width mid-count. */}
            <div className="flex items-baseline gap-1.5 md:gap-2">
              <span
                aria-hidden
                className={cn(
                  "text-xl font-black leading-none text-white/40 transition-opacity duration-200 md:text-3xl",
                  totalReached ? "opacity-100" : "opacity-0",
                )}
              >
                =
              </span>
              <span
                key={`${step.side}:${striking ? "strike" : "total"}`}
                data-testid="stat-check-damage-total"
                data-damage-total-reached={totalReached ? "true" : "false"}
                className={cn(
                  "text-[52px] font-black leading-none tabular-nums md:text-[80px]",
                  // The tick/strike keyframes end on opacity:1 with `both` fill,
                  // which overrides a static opacity-0 class. So the animation is
                  // mounted only once the total has actually landed — otherwise
                  // the answer sits on screen through the entire count.
                  totalReached && (striking ? "animate-damage-strike" : "animate-damage-tick"),
                  totalReached ? "opacity-100" : "opacity-0",
                  playerDeals
                    ? "text-[#ffe9a8] [text-shadow:0_0_26px_rgba(244,215,125,0.9),0_5px_0_rgba(0,0,0,0.6)]"
                    : "text-red-200 [text-shadow:0_0_26px_rgba(248,113,113,0.85),0_5px_0_rgba(0,0,0,0.6)]",
                )}
              >
                {step.total}
              </span>
              <span
                data-testid="stat-check-damage-total-label"
                className={cn(
                  "text-sm font-black uppercase tracking-[0.28em] text-white/85 transition-opacity duration-200 md:text-2xl",
                  totalReached ? "opacity-100" : "opacity-0",
                )}
              >
                Damage
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArenaLane({
  category,
  index,
  selectedCard,
  playerCard,
  playerCardInFlight,
  botCard,
  resolution,
  canEdit,
  revealStep,
  active,
  reaction,
  revealedBotCount,
  reducedMotion,
  animationSpeed,
  assets,
  concealed,
  itemsRevealed,
  plaqueStage = "category",
  armedItem,
  pendingItem,
  onRemovePendingItem,
  opponentLabel = "Bot",
  laneRef,
  playerRef,
  botRef,
  onPlace,
}: {
  category: StatCategory;
  index: number;
  selectedCard: StatCheckCard | null;
  playerCard: StatCheckCard | null;
  playerCardInFlight: boolean;
  botCard: StatCheckCard | null;
  resolution?: CategoryResult;
  canEdit: boolean;
  revealStep: PresentationStep;
  active: boolean;
  reaction: LaneReactionState["kind"] | null;
  revealedBotCount: number;
  reducedMotion: boolean;
  animationSpeed: StatCheckAnimationSpeed;
  assets: ReturnType<typeof useChampionAssets>["data"];
  /** Pre-Round-1 item choice: the lane's category plaque stays hidden. */
  concealed: boolean;
  /** Reveal has reached the item beat: bonuses and final values may show. */
  itemsRevealed: boolean;
  /** Which face this lane's fixed plaque is showing, scheduled by the page. */
  plaqueStage?: LanePlaqueStage;
  /** Inventory item armed for lane assignment, if any. */
  armedItem: ItemId | null;
  /** The player's own pending equip on this lane (hidden from no one — it is theirs). */
  pendingItem: EquippedItem | null;
  opponentLabel?: string;
  onRemovePendingItem: () => void;
  laneRef: (element: HTMLElement | null) => void;
  playerRef: (element: HTMLElement | null) => void;
  botRef: (element: HTMLElement | null) => void;
  onPlace: () => void;
}) {
  const botHidden = !resolution || revealedBotCount <= index;
  const showResult = Boolean(resolution && (active || stepAfterLane(revealStep, index)));
  const playerWon = resolution?.winner === "player";
  const botWon = resolution?.winner === "bot";
  /**
   * Socket, connector and card lighting waits for the winner scene, so a lane
   * reads as category → threshold → values → winner instead of lighting up the
   * instant it resolves.
   */
  const lit = showResult && laneWinnerEmphasised(plaqueStage);
  const botState = lit && botWon ? (resolution?.decisive ? "decisive" : "winner") : lit && playerWon ? "loser" : "idle";
  const playerState = lit && playerWon ? (resolution?.decisive ? "decisive" : "winner") : lit && botWon ? "loser" : "idle";
  // Presentation treatment for the active category value on each card. The
  // number itself is always the engine's final post-item value.
  const botValueEmphasis = laneValueEmphasis(plaqueStage, showResult ? (resolution ?? null) : null, "bot");
  const playerValueEmphasis = laneValueEmphasis(plaqueStage, showResult ? (resolution ?? null) : null, "player");
  const transferring = Boolean(
    showResult && resolution?.decisive && resolution.winner !== "tie" && plaqueStage === "transfer",
  );

  // Energy packet geometry, measured from the winning number and the plaque so
  // it visibly starts on the value rather than at the card or socket centre.
  const laneBoxRef = useRef<HTMLDivElement | null>(null);
  const botValueEl = useRef<HTMLSpanElement | null>(null);
  const playerValueEl = useRef<HTMLSpanElement | null>(null);
  const plaqueEl = useRef<HTMLDivElement | null>(null);
  const [packet, setPacket] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!transferring || reducedMotion) {
      setPacket(null);
      return;
    }
    const laneBox = laneBoxRef.current;
    const source = (botWon ? botValueEl.current : playerValueEl.current) ?? null;
    const target = plaqueEl.current;
    if (!laneBox || !source || !target) return;
    const lane = laneBox.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    setPacket({
      x: fromX - lane.left,
      y: fromY - lane.top,
      dx: to.left + to.width / 2 - fromX,
      dy: to.top + to.height / 2 - fromY,
    });
  }, [transferring, reducedMotion, botWon]);
  // Natural values only until the item-reveal beat; final values afterwards.
  const playerShownValue = resolution
    ? itemsRevealed
      ? resolution.playerValue
      : resolution.playerNaturalValue
    : undefined;
  const botShownValue = resolution
    ? itemsRevealed
      ? resolution.botValue
      : resolution.botNaturalValue
    : undefined;
  const playerLaneItem = itemsRevealed && resolution?.playerItem ? resolution : null;
  const botLaneItem = itemsRevealed && resolution?.botItem ? resolution : null;
  const armedCompatible = armedItem ? isItemCompatible(armedItem, category.family) : false;
  const placementHint = canEdit && armedItem
    ? armedCompatible && playerCard
      ? `Attach ${ITEMS[armedItem].label} here.`
      : `${ITEMS[armedItem].label} cannot be used here.`
    : canEdit && selectedCard
      ? playerCard
        ? `Swap in ${selectedCard.name}.`
        : `Place ${selectedCard.name} here.`
      : playerCard && canEdit
        ? "Click to return your card to hand."
        : "";

  return (
    <div
      data-testid={`stat-check-lane-${category.id}`}
      ref={laneRef}
      role="button"
      tabIndex={canEdit ? 0 : -1}
      aria-label={
        concealed
          ? `Lane ${index + 1}: category hidden until the opening item choice completes.`
          : `Lane ${index + 1}: ${categoryAccessibleLabel(category)} ${placementHint}`.trim()
      }
      data-armed-item={armedItem ? (armedCompatible && playerCard ? "compatible" : "blocked") : undefined}
      onClick={onPlace}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlace();
        }
      }}
      className={cn(
        // Lanes are open zones on the shared slab: no column washes at all.
        // Target and reaction feedback lives in the socket itself (rim, recess
        // glow, gem status light), so selecting a card never lights the lane.
        "group relative flex min-h-0 min-w-0 flex-col rounded-xl p-1 outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200 md:min-h-[400px] md:p-2",
        "bg-[radial-gradient(ellipse_62%_52%_at_50%_50%,rgba(56,189,248,0.035),transparent_74%)]",
        reaction === "impact" && "translate-y-[2px]",
      )}
    >
      {reaction === "impact" && (
        <span
          aria-hidden
          data-testid="stat-check-impact-ring"
          className="pointer-events-none absolute inset-x-12 bottom-10 top-[58%] z-20 animate-ping rounded-full border border-[#f4d77d]/55 motion-reduce:hidden"
        />
      )}
      <div
        ref={laneBoxRef}
        className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
      >
        {/* Energy packet: absolutely positioned, so it adds no layout box and
            cannot move a card, socket or the plaque. It starts on the winning
            number's measured centre and travels the lane to the plaque, where
            its arrival is what turns +0 into +1. */}
        {packet && (
          <span
            aria-hidden
            data-testid={`stat-check-energy-packet-${category.id}`}
            style={{
              left: `${packet.x}px`,
              top: `${packet.y}px`,
              ["--packet-dx" as string]: `${packet.dx}px`,
              ["--packet-dy" as string]: `${packet.dy}px`,
              animationDuration: `${durationAtSpeed(LANE_PLAQUE_TIMELINE.transferMs, animationSpeed)}ms`,
            }}
            className="pointer-events-none absolute z-[60] h-2.5 w-2.5 animate-energy-transfer rounded-full bg-[#f4d77d] shadow-[0_0_12px_rgba(244,215,125,1),0_0_26px_rgba(244,215,125,0.6)] motion-reduce:hidden"
          />
        )}
        <div ref={botRef} className="relative flex min-h-0 min-w-0 items-center justify-center py-0.5">
          <FlippableCard
            card={botCard}
            imageUrl={getImage(assets, botCard)}
            category={category}
            value={botShownValue}
            valueEmphasis={botValueEmphasis}
            valueRef={botValueEl}
            flipped={!botHidden}
            reducedMotion={reducedMotion}
            animationSpeed={animationSpeed}
            state={botState}
            opponentLabel={opponentLabel}
          />
          {/* Opponent item: mounted ONLY at/after the item-reveal beat. */}
          {botLaneItem?.botItem && !botHidden && (
            <LaneItemChip
              testId="stat-check-reveal-item-bot"
              itemId={botLaneItem.botItem}
              bonus={botLaneItem.botBonus}
              side="bot"
            />
          )}
        </div>
        <div ref={plaqueEl} className="relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1">
          {concealed ? (
            <HiddenCategoryMarker index={index} />
          ) : (
            /* One fixed plaque for every state: it changes face, never size. */
            <LanePlaque
              category={category}
              result={showResult ? (resolution ?? null) : null}
              stage={plaqueStage}
              reducedMotion={reducedMotion}
              animationSpeed={animationSpeed}
              opponentLabel={opponentLabel}
            />
          )}
          {/* Context tooltip for an armed item: exact bonus, natural → final,
              and which direction wins — or why the item is unusable here. */}
          {!concealed && canEdit && armedItem && (
            <ItemLanePreview category={category} itemId={armedItem} playerCard={playerCard} />
          )}
        </div>
        <div ref={playerRef} className="flex min-h-0 min-w-0 items-center justify-center py-0.5">
          {/* The real board card mounts (invisibly) as soon as its clone takes
              flight so the champion image is decoded before the handoff — the
              clone-to-card swap is then a pure visibility flip with no darker
              first-paint blink. The socket frame stays mounted beneath the card
              layer the whole time, so the handoff never restyles the socket. */}
          {/* Armed-item targeting: a cyan energy ring around the receiving
              socket on compatible occupied lanes — paint only (ring/shadow),
              never the layout box the travel clone measures. */}
          <div
            className={cn(
              "relative",
              canEdit && armedItem && armedCompatible && playerCard &&
                "rounded-lg ring-2 ring-cyan-300/80 shadow-[0_0_16px_rgba(34,211,238,0.55),0_0_32px_rgba(34,211,238,0.25)]",
            )}
          >
            <SocketFrame
              active={Boolean(canEdit && selectedCard) || playerCardInFlight}
              occupied={Boolean(playerCard) && !playerCardInFlight}
              gem={
                lit && resolution
                  ? playerWon
                    ? "win"
                    : botWon
                      ? "lose"
                      : "tie"
                  : playerCardInFlight || (canEdit && selectedCard && !playerCard)
                    ? "target"
                    : playerCard
                      ? "placed"
                      : "idle"
              }
            />
            {playerCard && (
              <div
                data-board-premount={playerCardInFlight ? "true" : undefined}
                aria-hidden={playerCardInFlight || undefined}
                className={cn("relative z-10", playerCardInFlight && "invisible")}
              >
                <ChampionCard
                  card={playerCard}
                  imageUrl={getImage(assets, playerCard)}
                  category={category}
                  value={playerShownValue}
                  valueEmphasis={playerValueEmphasis}
                  valueRef={playerValueEl}
                  mode="board"
                  state={playerState}
                  label="You"
                />
                {/* The player's own pending equip (pre-lock, click to remove). */}
                {pendingItem && !resolution && (
                  <button
                    type="button"
                    data-testid="stat-check-pending-item"
                    aria-label={`${ITEMS[pendingItem.itemId].label} attached. Click to remove it.`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemovePendingItem();
                    }}
                    className="absolute -right-2 -top-2 z-30 flex items-center gap-1 rounded-full border border-[#f4d77d]/70 bg-[#1c1730] px-1.5 py-0.5 text-[10px] font-black text-[#f4d77d] shadow-[0_0_12px_rgba(244,215,125,0.4)] outline-none transition hover:bg-[#2a2344] focus-visible:ring-2 focus-visible:ring-cyan-200"
                  >
                    <ItemGlyph itemId={pendingItem.itemId} className="h-3 w-3" />
                    {`+${itemBonusFor(pendingItem.itemId, category.family)}`}
                  </button>
                )}
                {/* Consumed item, revealed at the item beat of the reveal. */}
                {playerLaneItem?.playerItem && (
                  <LaneItemChip
                    testId="stat-check-reveal-item-player"
                    itemId={playerLaneItem.playerItem}
                    bonus={playerLaneItem.playerBonus}
                    side="player"
                  />
                )}
              </div>
            )}
            {(!playerCard || playerCardInFlight) && (
              <div
                className={cn(
                  "z-10 flex items-center justify-center px-2 text-center text-[11px] font-semibold",
                  playerCardInFlight ? "absolute inset-0" : cn("relative", BOARD_CARD_SIZE),
                  canEdit && selectedCard ? "text-[#f4d77d]" : "text-slate-400 group-hover:text-slate-300",
                )}
              >
                {!playerCardInFlight && (
                  <span className="relative rounded bg-black/45 px-1.5 py-0.5">
                    {canEdit && selectedCard ? "Place here" : "Place champion"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Geometry of the approved socket-frame asset (1024x1536 source px), measured
 * from its alpha channel: the opaque gold ring spans x148-876 / y138-1240, the
 * inner stone opening x250-773 / y233-1071, and the hex-gem assembly hangs
 * below the ring to y1304.
 */
const SOCKET_FRAME_SRC = { w: 1024, h: 1536, ring: { x0: 148, x1: 876, y0: 138, y1: 1240 } };
/** Rendered ring overhang past the card box on each side (fraction of card). */
const SOCKET_RING_OVERHANG = 0.04;

/** Pointy-top hexagon matching the frame asset's bottom gem silhouette. */
const GEM_CLIP = "polygon(50% 0%, 96% 26%, 96% 74%, 50% 100%, 4% 74%, 4% 26%)";

type SocketGemState = "idle" | "target" | "placed" | "win" | "lose" | "tie";

/**
 * Status-light styles for states where the socket is actually illuminated.
 * Idle and placed-unresolved sockets render no lens at all.
 */
const GEM_LENS: Partial<Record<SocketGemState, { lens: string; glow: string }>> = {
  target: { lens: "bg-[radial-gradient(circle_at_50%_38%,#7c96ab,#2c3f52_70%)] opacity-85", glow: "opacity-35 bg-[radial-gradient(circle,rgba(148,197,222,0.5),transparent_65%)]" },
  win: { lens: "bg-[radial-gradient(circle_at_50%_38%,#a5f3fc,#0891b2_70%)] opacity-95", glow: "opacity-80 bg-[radial-gradient(circle,rgba(34,211,238,0.7),transparent_65%)]" },
  lose: { lens: "bg-[radial-gradient(circle_at_50%_38%,#fca5a5,#b91c1c_70%)] opacity-95", glow: "opacity-80 bg-[radial-gradient(circle,rgba(248,113,113,0.65),transparent_65%)]" },
  tie: { lens: "bg-[radial-gradient(circle_at_50%_38%,#e7e5e4,#a8a29e_70%)] opacity-90", glow: "opacity-45 bg-[radial-gradient(circle,rgba(231,229,228,0.5),transparent_65%)]" },
};

/**
 * The receiving socket: the approved frame asset mounted on the slab, scaled so
 * its gold ring sits just outside the fixed card footprint — a landed card sits
 * inside the ring with the rim visibly framing it. The frame stays mounted
 * beneath the card layer at all times and never pulses or restyles at the
 * clone-to-card handoff; the bottom gem doubles as the lane's status light.
 */
function SocketFrame({
  active,
  occupied,
  gem,
}: {
  active: boolean;
  occupied: boolean;
  gem: SocketGemState;
}) {
  const { w, h, ring } = SOCKET_FRAME_SRC;
  const scaleX = (1 + SOCKET_RING_OVERHANG * 2) / (ring.x1 - ring.x0);
  const scaleY = (1 + SOCKET_RING_OVERHANG * 2) / (ring.y1 - ring.y0);
  const style: CSSProperties = {
    width: `${w * scaleX * 100}%`,
    height: `${h * scaleY * 100}%`,
    left: `${-(SOCKET_RING_OVERHANG + ring.x0 * scaleX) * 100}%`,
    top: `${-(SOCKET_RING_OVERHANG + ring.y0 * scaleY) * 100}%`,
  };

  const showStatusLight = gem === "win" || gem === "lose";
  const lens = showStatusLight ? GEM_LENS[gem] : undefined;

  return (
    <>
      {/* Small local bloom around the socket when it is the live target. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-5 rounded-[20px] bg-[radial-gradient(ellipse_at_center,rgba(214,181,93,0.16),transparent_70%)] transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0",
        )}
      />

      <img
        src={socketFrameUrl}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          "pointer-events-none absolute max-w-none select-none transition duration-300",
          active
            ? "brightness-[0.88] drop-shadow-[0_0_14px_rgba(214,181,93,0.32)]"
            : occupied
              ? "brightness-[0.85]"
              : "brightness-[0.66] saturate-[0.8]",
        )}
        style={style}
      />

      {/* Recess treatment. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg bg-[#1c2637] mix-blend-color opacity-80"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-lg transition duration-300",
          "shadow-[inset_0_10px_22px_rgba(0,0,0,0.55),inset_0_-6px_14px_rgba(0,0,0,0.45)]",
          active
            ? "bg-[radial-gradient(ellipse_at_50%_45%,rgba(15,26,42,0.3),rgba(9,15,26,0.55))]"
            : "bg-[radial-gradient(ellipse_at_50%_45%,rgba(15,26,42,0.52),rgba(9,15,26,0.74))]",
        )}
      />


      {/* Active and resolved lights render above the z-10 card layer. */}
      {showStatusLight && lens && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[100%] z-[20] h-[10.5%] w-[15%] -translate-x-1/2 -translate-y-1/2"
        >
          <span
            className={cn(
              "absolute -inset-[70%] rounded-full transition-opacity duration-500",
              lens.glow,
            )}
          />
          <span
            className={cn(
              "absolute inset-0 transition duration-500",
              lens.lens,
            )}
            style={{ clipPath: GEM_CLIP }}
          />
        </span>
      )}
    </>
  );
}

/**
 * The one fixed plaque viewport, in exact pixels per responsive mode, matching
 * the measured unresolved category plaque (frame = these + 12px of p-[5px] and
 * border). Every lane and every stage renders into this same box, so resolving
 * a lane can never resize the plaque or push the cards around it.
 */
const PLAQUE_VIEWPORT = "h-[46px] w-[57px] md:h-[76px] md:w-[115px] min-[1210px]:w-[123px]";

/**
 * Icon sizing inside that fixed viewport. Driven by height with `w-auto` and a
 * max-width cap because the art ships in two aspect ratios (1:1 for
 * armor/health, 3:2 for attack-damage/move-speed/range/scale) — a square box
 * would render the 3:2 families visibly smaller. `object-contain` plus the cap
 * guarantees no clipping and no wrapping at any size.
 */
const STAT_ICON_SIZE = "h-6 w-auto max-w-[28px] md:h-10 md:max-w-[56px] min-[1210px]:h-12 min-[1210px]:max-w-[62px]";

/**
 * Optical kerning that pulls the stat art back toward its direction arrow.
 *
 * Every family's PNG carries 21–35% transparent padding on its left edge
 * (measured from the alpha channel: armor 0.21, health 0.24, scale/attack-
 * damage 0.25–0.28, move-speed 0.27, attack-range 0.35), and the lucide arrow
 * adds ~21% of its own box on each side. A positive box gap therefore renders
 * as a large hole between the two glyphs — wide enough that the arrow read as
 * belonging to the level instead of to the icon. These negative margins cancel
 * the art's built-in padding so the GLYPHS sit close, which is what the eye
 * actually groups on. They are horizontal only and the icon keeps `shrink-0`,
 * so the plaque's fixed viewport is unaffected.
 */
const STAT_ICON_KERN = "-ml-1.5 md:-ml-2.5 min-[1210px]:-ml-3.5";
const SCALE_ICON_SIZE = "h-6 w-auto max-w-[30px] md:h-9 md:max-w-[54px] min-[1210px]:h-10 min-[1210px]:max-w-[60px]";

/** Achieved stat gap for a lane, as a percentage; ties are a flat 0. */
function achievedGapPercent(result: CategoryResult) {
  return result.winner === "tie" ? 0 : result.margin * 100;
}

function formatAchievedGap(result: CategoryResult) {
  const gap = achievedGapPercent(result);
  return gap === 0 ? "0" : gap.toFixed(1);
}

/**
 * Fixed-size lane plaque. `stage` selects which face of the already-computed
 * result is showing; this component never derives game state, it only presents
 * it. The stage sequence is scheduled once by the page, not here — the only
 * timer below drives the shutter's conceal/reveal halves.
 */
export function LanePlaque({
  category,
  result = null,
  stage = "category",
  reducedMotion = false,
  animationSpeed = 1,
  opponentLabel = "Bot",
}: {
  category: StatCategory;
  result?: CategoryResult | null;
  stage?: LanePlaqueStage;
  reducedMotion?: boolean;
  animationSpeed?: StatCheckAnimationSpeed;
  opponentLabel?: string;
}) {
  const shownStage: LanePlaqueStage = result ? stage : "category";
  const blinkMs = Math.max(1, durationAtSpeed(LANE_PLAQUE_TIMELINE.blinkMs, animationSpeed));
  /**
   * There are only three plaque faces, and the shutter is keyed to the face —
   * not the scene — so it plays exactly twice per lane: category → threshold
   * and threshold → +0. The values/winner/slice scenes all keep the threshold
   * face, and +0 → +1 is driven by the arriving packet, not another blink.
   */
  const plaqueFace: "category" | "threshold" | "bonus" =
    shownStage === "category" ? "category" : lanePlaqueShowsBonus(shownStage) ? "bonus" : "threshold";

  return (
    <div
      data-testid={`stat-check-marker-${category.id}`}
      data-direction={category.direction}
      data-plaque-stage={shownStage}
      className="z-10 flex w-full items-center gap-2"
    >
      <span aria-hidden className="h-[3px] flex-1 rounded-full bg-[linear-gradient(90deg,transparent,rgba(138,111,53,0.55)_20%,rgba(138,111,53,0.8))] shadow-[0_1px_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.3)]" />
      <div className="relative rounded-xl border border-[#8a6f35]/60 bg-[linear-gradient(180deg,rgba(74,58,28,0.6),rgba(6,10,16,0.88))] p-[5px] shadow-[0_10px_26px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.28)]">
        {/* rail clamps bolting the plaque onto the comparison rail */}
        <span aria-hidden className="absolute -left-[7px] top-1/2 h-6 w-[7px] -translate-y-1/2 rounded-l-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute -right-[7px] top-1/2 h-6 w-[7px] -translate-y-1/2 rounded-r-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        {/* corner bolts on the backing plate */}
        <span aria-hidden className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <div
          data-testid={`stat-check-plaque-viewport-${category.id}`}
          className={cn(
            "relative grid place-items-center overflow-hidden rounded-lg border border-[#d6b55d]/45 bg-black/80 shadow-[inset_0_1px_0_rgba(214,181,93,0.28)]",
            PLAQUE_VIEWPORT,
          )}
        >
          <LanePlaqueFace
            stage={shownStage}
            category={category}
            result={result}
            opponentLabel={opponentLabel}
          />
          {/* Mechanical shutter: a brass-edged cover plate that is already
              fully across the viewport when a new face mounts, holds while it
              settles, then retracts upward. Keyed by stage so each transition
              replays it. The interior swap is synchronous and happens behind
              this plate, so no face is ever seen changing. Clipped by the
              viewport's overflow-hidden, so the frame never moves.
              Reduced motion: `motion-reduce:hidden` drops the plate entirely
              and the swap is a plain instant change. */}
          {plaqueFace !== "category" && (
            <span
              key={plaqueFace}
              aria-hidden
              data-testid={`stat-check-plaque-shutter-${category.id}`}
              style={{ animationDuration: `${blinkMs}ms` }}
              className={cn(
                "pointer-events-none absolute inset-0 z-20 animate-plaque-blink ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:hidden",
                "bg-[linear-gradient(180deg,#0a0f18_0%,#1a1508_58%,#3c3118_100%)]",
                "border-b-2 border-[#a8894b] shadow-[0_4px_10px_rgba(0,0,0,0.7)]",
              )}
            />
          )}
        </div>
      </div>
      <span aria-hidden className="h-[3px] flex-1 rounded-full bg-[linear-gradient(270deg,transparent,rgba(138,111,53,0.55)_20%,rgba(138,111,53,0.8))] shadow-[0_1px_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.3)]" />
      <span className="sr-only">
        {result && shownStage !== "category"
          ? laneStageAccessibleLabel(shownStage, result, opponentLabel)
          : categoryAccessibleLabel(category)}
      </span>
    </div>
  );
}

/** Written description of the face currently showing; never rendered visibly. */
function laneStageAccessibleLabel(stage: LanePlaqueStage, result: CategoryResult, opponentLabel: string) {
  const who = result.winner === "player" ? "You win" : result.winner === "bot" ? `${opponentLabel} wins` : "Lane tied";
  const required = formatThreshold(result.category.decisiveThreshold);
  // The threshold and values scenes state the requirement only: assistive tech
  // learns the outcome at the same moment the board shows it, never earlier.
  if (stage === "threshold" || stage === "values") {
    return `${categoryAccessibleLabel(result.category)} ${required} is required to deal 1 extra damage.`;
  }
  if (stage === "winner" || stage === "slice") {
    return `${who}. ${formatAchievedGap(result)}% stat gap against a ${required} requirement.`;
  }
  return result.decisive
    ? `${who}. Plus 1 extra damage: the ${formatAchievedGap(result)}% gap met the ${required} requirement.`
    : `${who}. Plus 0 extra damage: the ${formatAchievedGap(result)}% gap did not meet the ${required} requirement.`;
}

/** The swappable interior. Only one face is mounted at a time. */
function LanePlaqueFace({
  stage,
  category,
  result,
  opponentLabel,
}: {
  stage: LanePlaqueStage;
  category: StatCategory;
  result: CategoryResult | null;
  opponentLabel: string;
}) {
  if (stage !== "category" && result) {
    return <LanePlaqueResultFace stage={stage} result={result} opponentLabel={opponentLabel} />;
  }
  return <LanePlaqueCategoryFace category={category} />;
}

function LanePlaqueCategoryFace({ category }: { category: StatCategory }) {
  const higher = category.direction === "higher";
  const levelBadge = categoryLevelBadge(category);
  const familyIcon = categoryIcon(category);
  return (
    <div className="flex min-w-0 items-center justify-center">
      {/* Two information groups, in the semantic order level → direction →
          icon: "lv. 18" first, then "↓ [armor]". The arrow belongs to the stat
          family, not to the level, so it is nested with the icon at a hairline
          gap while a wider gap separates the level group. Both groups centre on
          the icon artwork's own box (items-center, not a shared baseline), so
          the arrow reads level with the symbol rather than with "lv.".
          The written category exists only in the tooltip and sr-only label. */}
      <BoardTooltip
        testId={`stat-check-category-symbol-${category.id}`}
        label={categoryTooltipLabel(category)}
        ariaLabel={categoryAccessibleLabel(category)}
        buttonClassName="flex items-center gap-[7px] md:gap-2.5"
      >
        {levelBadge && (
          <span
            aria-hidden
            data-testid={`stat-check-category-level-${category.id}`}
            className="flex items-baseline gap-px leading-none"
          >
            {/* "lv." is the smallest element; the number outranks it. */}
            <span className="text-[6px] font-black lowercase tracking-tight text-slate-400 md:text-[9px]">lv.</span>
            <span className="text-[10px] font-black text-white md:text-lg">{levelBadge}</span>
          </span>
        )}
        <span
          aria-hidden
          data-testid={`stat-check-category-stat-${category.id}`}
          className="flex items-center"
        >
          {higher ? (
            <ArrowUp className="h-3 w-3 shrink-0 text-[#f4d77d] md:h-5 md:w-5" strokeWidth={3} aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0 text-cyan-300 md:h-5 md:w-5" strokeWidth={3} aria-hidden />
          )}
          {familyIcon && (
            <img
              src={familyIcon}
              alt=""
              aria-hidden
              data-testid={`stat-check-category-icon-${category.id}`}
              className={cn(STAT_ICON_SIZE, STAT_ICON_KERN, "shrink-0 object-contain")}
            />
          )}
        </span>
      </BoardTooltip>
    </div>
  );
}

/**
 * Winner / threshold / bonus faces. Each is sized to the fixed viewport rather
 * than the other way round: no face may grow the plaque.
 */
function LanePlaqueResultFace({
  stage,
  result,
  opponentLabel,
}: {
  stage: LanePlaqueStage;
  result: CategoryResult;
  opponentLabel: string;
}) {
  const required = formatThreshold(result.category.decisiveThreshold);
  const achieved = formatAchievedGap(result);

  // Threshold scene: the requirement only — the achieved margin is never
  // shown here, and no winner wording exists on the plaque at any scene.
  if (!lanePlaqueShowsBonus(stage)) {
    return (
      <BoardTooltip
        testId="stat-check-plaque-threshold"
        label={DECISIVE_MARGIN_PRESENTATION.getTooltip(result.category.decisiveThreshold)}
        buttonClassName="flex items-center gap-1 rounded px-0.5 md:gap-2"
      >
        <img
          src={DECISIVE_MARGIN_PRESENTATION.icon}
          alt=""
          aria-hidden
          className={cn(SCALE_ICON_SIZE, "shrink-0 object-contain")}
        />
        <span
          aria-hidden
          className="whitespace-nowrap text-[10px] font-black leading-none text-[#f4d77d] md:text-base"
        >
          {required}
        </span>
      </BoardTooltip>
    );
  }

  // Bonus scene. The plaque lands on +0 first; +1 only after the winning
  // value's energy packet has actually arrived.
  const earned = result.decisive && lanePlaqueBonusEarned(stage);
  return (
    <BoardTooltip
      testId="stat-check-plaque-bonus"
      label={laneStageAccessibleLabel("bonus", result, opponentLabel)}
      buttonClassName="flex items-center justify-center px-1"
    >
      <span
        aria-hidden
        data-bonus={earned ? "1" : "0"}
        className={cn(
          "text-base font-black leading-none transition-all duration-200 md:text-3xl",
          earned
            ? "scale-110 text-[#f4d77d] [text-shadow:0_0_14px_rgba(244,215,125,0.85)]"
            : "text-slate-500",
        )}
      >
        {earned ? "+1" : "+0"}
      </span>
    </BoardTooltip>
  );
}

/**
 * How the active category's value is presented during a lane reveal. The value
 * itself is always the engine's final post-item number; only its treatment
 * changes here.
 */
export type LaneValueEmphasis = "none" | "enlarged" | "winner" | "loser" | "tie" | "sliced";

/**
 * Treatment for one side's category value at a given scene. Reads the already
 * computed result — it never decides who won, only how that is shown.
 */
export function laneValueEmphasis(
  stage: LanePlaqueStage,
  result: CategoryResult | null,
  side: "player" | "bot",
): LaneValueEmphasis {
  if (!result || !laneValuesActive(stage)) return "none";
  // Ties stay symmetrical and neutral for the whole lane: never a winner or
  // loser treatment, and never sliced.
  if (result.winner === "tie") return "tie";
  if (!laneWinnerEmphasised(stage)) return "enlarged";
  if (result.winner === side) return "winner";
  // Only a decisive pass cuts the losing number, and only from the slice scene.
  return result.decisive && laneSliceActive(stage) ? "sliced" : "loser";
}

/**
 * The active category value on a champion card.
 *
 * Enlargement is a pure `transform: scale`, so the badge's layout box — and
 * therefore the stat row, card height, portrait, name and item chip — never
 * move. The sliced state hides the real badge and draws two clipped copies in
 * an absolutely positioned overlay, so only the glyphs are cut.
 */
export function CategoryValueBadge({
  value,
  emphasis,
  valueRef,
}: {
  value: string | number;
  emphasis: LaneValueEmphasis;
  valueRef?: RefObject<HTMLSpanElement | null>;
}) {
  const sliced = emphasis === "sliced";
  const active = emphasis !== "none";
  return (
    <span data-testid="stat-check-value" data-value-emphasis={emphasis} className="relative mt-0.5 inline-flex">
      <span
        ref={valueRef}
        data-testid="stat-check-value-badge"
        /* The emphasis transition follows the speed control (the arena sets
           --sc-value-transition), so the settle cleanup always finishes in the
           trailing window the lane schedule reserves for it — at any speed. */
        style={{ transitionDuration: "var(--sc-value-transition, 500ms)" }}
        className={cn(
          "inline-flex origin-left rounded-full bg-[#d6b55d] px-2 py-0.5 text-sm font-black text-black",
          "transition-[transform,filter,opacity] ease-out motion-reduce:transition-none",
          active && "scale-[1.55]",
          emphasis === "winner" && "bg-[#ffe9a8] brightness-110 shadow-[0_0_20px_rgba(244,215,125,0.95),0_0_40px_rgba(244,215,125,0.45)]",
          emphasis === "loser" && "opacity-55 brightness-75 saturate-50",
          emphasis === "tie" && "bg-slate-200 shadow-[0_0_16px_rgba(203,213,225,0.65)]",
          sliced && "opacity-0",
        )}
      >
        {value}
      </span>
      {sliced && <SlicedValueOverlay value={value} />}
    </span>
  );
}

/** Two clipped halves of the losing number, pulled apart along a bright cut. */
function SlicedValueOverlay({ value }: { value: string | number }) {
  const half =
    "absolute left-0 top-0 inline-flex origin-left scale-[1.55] rounded-full bg-[#d6b55d] px-2 py-0.5 text-sm font-black text-black opacity-60 saturate-50";
  return (
    <span
      aria-hidden
      data-testid="stat-check-value-slice"
      className="pointer-events-none absolute left-0 top-0 motion-reduce:hidden"
    >
      <span className={cn(half, "-translate-y-[3px] -rotate-[2deg] [clip-path:polygon(0_0,100%_0,100%_44%,0_56%)]")}>
        {value}
      </span>
      <span className={cn(half, "translate-y-[3px] rotate-[2deg] [clip-path:polygon(0_56%,100%_44%,100%_100%,0_100%)]")}>
        {value}
      </span>
      <span className="absolute left-0 top-1/2 h-px w-[170%] origin-left -translate-y-1/2 scale-x-100 bg-[#f4d77d] shadow-[0_0_10px_rgba(244,215,125,0.95)]" />
    </span>
  );
}

/** Unresolved lanes render the same fixed plaque on its category face. */
export function CategoryMarker({ category }: { category: StatCategory }) {
  return <LanePlaque category={category} />;
}

/**
 * Pre-Round-1 stand-in plaque: keeps the physical plaque footprint without
 * revealing any of the opening board's categories.
 */
function HiddenCategoryMarker({ index }: { index: number }) {
  return (
    <div data-testid={`stat-check-hidden-category-${index}`} className="z-10 flex w-full items-center gap-2">
      <span aria-hidden className="h-[3px] flex-1 rounded-full bg-[linear-gradient(90deg,transparent,rgba(138,111,53,0.55)_20%,rgba(138,111,53,0.8))] shadow-[0_1px_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.3)]" />
      <div className="relative rounded-xl border border-[#8a6f35]/60 bg-[linear-gradient(180deg,rgba(74,58,28,0.6),rgba(6,10,16,0.88))] p-[5px] shadow-[0_10px_26px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.28)]">
        <div
          className={cn(
            "grid place-items-center overflow-hidden rounded-lg border border-[#d6b55d]/45 bg-black/80 shadow-[inset_0_1px_0_rgba(214,181,93,0.28)]",
            PLAQUE_VIEWPORT,
          )}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:text-base">Hidden</span>
        </div>
      </div>
      <span aria-hidden className="h-[3px] flex-1 rounded-full bg-[linear-gradient(270deg,transparent,rgba(138,111,53,0.55)_20%,rgba(138,111,53,0.8))] shadow-[0_1px_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.3)]" />
    </div>
  );
}

/** Revealed consumed-item chip on a resolved lane card. */
function LaneItemChip({
  testId,
  itemId,
  bonus,
  side,
}: {
  testId: string;
  itemId: ItemId;
  bonus: number;
  side: "player" | "bot";
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "absolute -right-2 z-30 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-black shadow-lg",
        side === "player"
          ? "-top-2 border-[#f4d77d]/70 bg-[#1c1730] text-[#f4d77d]"
          : "-top-2 border-red-400/60 bg-[#2a0f14] text-red-200",
      )}
    >
      <ItemGlyph itemId={itemId} className="h-3 w-3" />
      {`${ITEMS[itemId].label} +${bonus}`}
    </span>
  );
}

/**
 * Context tooltip while an inventory item is armed: for a compatible occupied
 * lane it spells out the exact bonus, natural → final values, and which
 * direction wins; otherwise it states exactly why the item cannot be used.
 */
function ItemLanePreview({
  category,
  itemId,
  playerCard,
}: {
  category: StatCategory;
  itemId: ItemId;
  playerCard: StatCheckCard | null;
}) {
  const bonus = itemBonusFor(itemId, category.family);
  const compatible = bonus > 0;
  const directionLine = category.direction === "higher" ? "Highest value wins." : "Lowest value wins.";
  let body: string;
  if (!compatible) {
    body = `Can't be used on ${statFamilyLabel(category)}.`;
  } else if (!playerCard) {
    body = "Place a champion here first.";
  } else {
    const natural = category.getValue(playerCard);
    body = `${playerCard.name}: ${category.formatValue(natural)} → ${category.formatValue(natural + bonus)} ${statFamilyLabel(category)}. ${directionLine}`;
  }
  return (
    <div
      data-testid={`stat-check-item-preview-${category.id}`}
      data-preview-state={compatible ? (playerCard ? "ready" : "empty") : "incompatible"}
      className={cn(
        "z-20 max-w-full rounded-md border px-2 py-1 text-center text-[10px] font-semibold shadow-lg",
        compatible && playerCard
          ? "border-[#f4d77d]/60 bg-black/80 text-[#f4d77d]"
          : "border-slate-500/40 bg-black/75 text-slate-400",
      )}
    >
      <span className="font-black">{`${ITEMS[itemId].label} `}</span>
      {compatible && <span className="text-cyan-100/90">{`Grants +${bonus} ${statFamilyLabel(category)}. `}</span>}
      <span>{body}</span>
    </div>
  );
}

function categoryAccessibleLabel(category: StatCategory) {
  const direction = category.direction === "higher" ? "Higher value wins" : "Lower value wins";
  return `${capitalize(category.label)}. ${statFamilyLabel(category)}. ${scopeLabel(category)}. ${direction}. Decisive ${formatThreshold(category.decisiveThreshold)} for bonus damage.`;
}

function PlayerHand({
  cards,
  categories,
  assets,
  selectedCardId,
  assignedCardIds,
  departingIds,
  returningIds,
  disabled,
  reducedMotion,
  reflowMs,
  cardRefs,
  onSelect,
}: {
  cards: StatCheckCard[];
  /** The current round's three lane categories, left → middle → right. */
  categories: StatCategory[];
  assets: ReturnType<typeof useChampionAssets>["data"];
  selectedCardId: string | null;
  assignedCardIds: Set<string>;
  departingIds: Set<string>;
  returningIds: Set<string>;
  disabled: boolean;
  reducedMotion: boolean;
  reflowMs: number;
  cardRefs: RefObject<Record<string, HTMLElement | null>>;
  onSelect: (cardId: string) => void;
}) {
  const viewportWidth = useViewportWidth();
  // Departing cards keep their fan slot (as an invisible placeholder) until
  // mid-flight, so the gap closes only after the card has visibly left the hand.
  const activeCards = cards.filter((card) => !assignedCardIds.has(card.id) || departingIds.has(card.id));
  const parameters = responsiveFanParameters(activeCards.length, viewportWidth);
  let visibleIndex = -1;

  return (
    // The tray is the flexible column beside the board's item dock: min-w-0 so
    // it yields the strip's width instead of pushing the fan off-screen.
    <div className="relative mx-auto h-[148px] w-full min-w-0 max-w-4xl flex-1 overflow-visible px-3 pb-0 pt-1 sm:h-[210px] lg:h-[176px] xl:h-[188px] 2xl:h-[200px]" data-testid="stat-check-hand">
      <div className="relative mx-auto h-full max-w-full">
        {activeCards.map((card, index) => {
          const departing = departingIds.has(card.id) && assignedCardIds.has(card.id);
          const returning = returningIds.has(card.id);
          const hidden = departing || returning;
          if (!departing) visibleIndex += 1;
          const selected = selectedCardId === card.id;
          const layout = fanCardLayout(index, activeCards.length, parameters, selected);
          const style = {
            transform: `translate(-50%, 0) translate(${layout.x}px, ${layout.y}px) rotate(${layout.rotation}deg)`,
            zIndex: layout.zIndex,
            transitionDuration: reducedMotion ? undefined : `${reflowMs}ms`,
          } as CSSProperties;
          return (
            <div
              key={card.id}
              className={cn(
                "absolute left-1/2 top-0 origin-bottom will-change-transform hover:!z-[400] focus-within:!z-[400]",
                // Selected card rises above every overlapping fan neighbor so
                // the pick is unmistakable in the tight mobile fan. Pure
                // stacking — the transform/geometry the clone measures is
                // untouched (fanCardLayout already applies the selected lift).
                selected && "!z-[400]",
                reducedMotion ? "transition-none" : "transition-[transform,opacity] ease-out motion-reduce:transition-none",
                hidden && "pointer-events-none opacity-0",
              )}
              data-fan-index={index}
              data-hand-placeholder={departing ? "true" : undefined}
              data-hand-returning={returning ? "true" : undefined}
              aria-hidden={hidden || undefined}
              ref={(element) => {
                if (cardRefs.current) cardRefs.current[card.id] = element;
              }}
              style={style}
            >
              <ChampionCard
                card={card}
                imageUrl={getImage(assets, card)}
                categoryValues={handCardCategoryValues(card, categories)}
                mode="hand"
                state={selected ? "selected" : "idle"}
                disabled={disabled || departing}
                selected={selected}
                onClick={departing ? undefined : () => onSelect(card.id)}
                testId={departing ? undefined : `stat-check-hand-${visibleIndex}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UtilityStack({
  match,
  assets,
  opponentLabel = "Bot",
  botDiscardRef,
  playerDiscardRef,
}: {
  match: MatchState;
  assets: ReturnType<typeof useChampionAssets>["data"];
  opponentLabel?: string;
  botDiscardRef: (element: HTMLElement | null) => void;
  playerDiscardRef: (element: HTMLElement | null) => void;
}) {
  return (
    <div className="grid gap-2">
      <CountPill label="Shared pool" value={match.drawPile.length} />
      <CountPill label="Your hand" value={match.playerHand.length} />
      <CountPill label={`${opponentLabel} hand`} value={match.botHand.length} />
      <DiscardPile side="bot" cards={match.botDiscard} assets={assets} opponentLabel={opponentLabel} elementRef={botDiscardRef} />
      <DiscardPile side="player" cards={match.playerDiscard} assets={assets} opponentLabel={opponentLabel} elementRef={playerDiscardRef} />
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-1 rounded-md border border-cyan-300/12 bg-black/28 px-2 py-1">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="text-base font-black text-cyan-100">{value}</div>
    </div>
  );
}

function AnimationSpeedControl({
  speed,
  onSpeedChange,
}: {
  speed: StatCheckAnimationSpeed;
  onSpeedChange: (speed: StatCheckAnimationSpeed) => void;
}) {
  return (
    <label className="flex items-center gap-1 rounded-full border border-cyan-300/20 bg-black/30 px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100">
      Anim
      <select
        data-testid="stat-check-animation-speed"
        value={speed}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (isStatCheckAnimationSpeed(next)) onSpeedChange(next);
        }}
        className="rounded border border-cyan-300/20 bg-[#071018] px-1.5 py-0.5 text-xs text-[#f4d77d] outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
      >
        {STAT_CHECK_ANIMATION_SPEEDS.map((option) => (
          <option key={option} value={option}>
            {option}x
          </option>
        ))}
      </select>
    </label>
  );
}

function CardMotionOverlay({
  travelingCards,
  assets,
  reducedMotion,
}: {
  travelingCards: TravelingCardState[];
  assets: ReturnType<typeof useChampionAssets>["data"];
  reducedMotion: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-testid="stat-check-motion-overlay" className="pointer-events-none fixed inset-0 z-[9999]">
      {travelingCards.map((item) => (
        <TravelingCard key={item.id} item={item} assets={assets} reducedMotion={reducedMotion} />
      ))}
    </div>,
    document.body,
  );
}

const TravelingCard = memo(function TravelingCard({
  item,
  assets,
  reducedMotion,
}: {
  item: TravelingCardState;
  assets: ReturnType<typeof useChampionAssets>["data"];
  reducedMotion: boolean;
}) {
  // The clone must remain ONE persistent animation: the motion plan is memoized
  // against the stable travel item so parent re-renders (phase dispatches, lane
  // reactions, hand-gap release) can never rebuild the keyframe arrays and make
  // framer-motion restart mid-flight — that restart was the visible "stepping".
  const motionPlan = useMemo(() => buildTravelKeyframes(item, reducedMotion), [item, reducedMotion]);
  return (
    <motion.div
      data-testid={`stat-check-travel-card-${item.card.id}`}
      className="fixed left-0 top-0 origin-center will-change-transform"
      style={{ width: item.from.width, height: item.from.height }}
      initial={motionPlan.initial}
      animate={motionPlan.animate}
      transition={motionPlan.transition}
    >
      <div className="h-full w-full overflow-hidden rounded-lg shadow-[0_18px_32px_rgba(0,0,0,0.45)]">
        <ChampionCard
          card={item.card}
          imageUrl={item.imageUrl ?? getImage(assets, item.card)}
          category={item.category}
          value={item.value}
          label={item.label}
          mode="board"
          state="idle"
          fill
        />
      </div>
    </motion.div>
  );
});

type TravelEase = "linear" | "easeIn" | "easeOut" | "easeInOut";

/**
 * Authored keyframe stations for the travel clone — transform-only.
 *
 * The element box is fixed at the SOURCE size (set once as static style); all
 * motion is x/y/rotate/scale around the center, so the whole flight runs on the
 * compositor (no width/height layout or animated drop-shadow paints). Stations
 * align the visual center with each target rect's center; the final board size
 * is reached via `endScale = to.width / from.width`.
 *
 * Per-segment easing keeps the motion continuous: decelerating eases only where
 * the choreography *intends* a pause (pickup, hold, settle); the flight itself
 * uses easeIn → linear → easeOut so the card never dead-stops between stations.
 */
function buildTravelKeyframes(item: TravelingCardState, reducedMotion: boolean) {
  const { from, to } = item;
  const px = (r: DOMRectSnapshot) => r.x + r.width / 2 - from.width / 2;
  const py = (r: DOMRectSnapshot) => r.y + r.height / 2 - from.height / 2;
  const x0 = px(from);
  const y0 = py(from);
  const x1 = px(to);
  const y1 = py(to);
  const endScale = to.width / Math.max(1, from.width);
  const duration = item.durationMs / 1000;
  const base = { x: x0, y: y0, rotate: item.fromRotation, scale: 1, opacity: 1, rotateX: 0, rotateY: 0 };

  if (reducedMotion) {
    // Compact reduced-motion communication: small lift, short slide, soft settle.
    return {
      initial: base,
      animate: {
        x: [x0, x0, x1, x1],
        y: [y0, y0 - 12, y1 - 4, y1],
        rotate: [item.fromRotation, 0, 0, item.toRotation],
        scale: [1, 1.02, endScale, endScale],
        opacity: 1,
        rotateX: 0,
        rotateY: 0,
      },
      transition: { duration, times: [0, 0.25, 0.88, 1], ease: ["easeOut", "easeInOut", "easeOut"] as TravelEase[] },
    };
  }

  const viewportW = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportH = typeof window === "undefined" ? 800 : window.innerHeight;
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const dir = Math.sign(x1 - x0) || 1;
  const midX = (x0 + x1) / 2;

  if ((item.kind === "place" || item.kind === "lane-move") && item.phaseDurations?.length === 8) {
    const [pickupMs, holdMs, launchMs, travelMs, approachMs, impactMs, reboundMs, settleMs] = item.phaseDurations;
    const total = item.durationMs;
    const apexSplit = travelMs * 0.55;
    let at = 0;
    const times = [0];
    for (const ms of [pickupMs, holdMs, launchMs, apexSplit, travelMs - apexSplit, approachMs, impactMs, reboundMs, settleMs]) {
      at += ms;
      times.push(Math.min(1, at / total));
    }
    const arc = heroArcLift(distance, viewportW, viewportH);
    const apexY = Math.min(y0, y1) - arc;
    const apexScale = STAT_CHECK_ANIMATION.heroApexScale;
    return {
      initial: base,
      animate: {
        //          start  pickup     hold       launch                    apex       descent          approach          impact             rebound           settle
        x:      [x0,      x0,        x0,        x0 + (midX - x0) * 0.25,  midX,      x1,              x1,               x1,                x1,               x1],
        y:      [y0,      y0 - 44,   y0 - 50,   y0 - 84,                  apexY,     y1 - 24,         y1,               y1 + 5,            y1 - 3,           y1],
        rotate: [item.fromRotation, 0, 0,       dir * 5,                  dir * 6,   dir * 2,         0,                -dir * 1.5,        0,                item.toRotation],
        scale:  [1,       1.1,       1.1,       1.18,                     apexScale, endScale * 1.08, endScale * 1.02,  endScale * 0.975,  endScale * 1.01,  endScale],
        rotateX: [0,      1.5,       1.5,       4,                        5,         3,               0,                -2,                0.5,              0],
        rotateY: [0,      0,         0,         dir * -3,                 dir * -5,  dir * -2,        0,                dir * 1,           0,                0],
        opacity: 1,
      },
      transition: {
        duration,
        times,
        // pickup rises then eases; hold floats; launch accelerates; flight is
        // linear through the apex; approach decelerates; impact accelerates into
        // the strike; rebound eases off; settle comes to rest.
        ease: ["easeOut", "easeInOut", "easeIn", "linear", "linear", "easeOut", "easeIn", "easeOut", "easeInOut"] as TravelEase[],
      },
    };
  }

  if (item.kind === "return" && item.phaseDurations?.length === 4) {
    const [liftMs, holdMs, travelMs, settleMs] = item.phaseDurations;
    const total = item.durationMs;
    const half = travelMs / 2;
    let at = 0;
    const times = [0];
    for (const ms of [liftMs, holdMs, half, half, settleMs]) {
      at += ms;
      times.push(Math.min(1, at / total));
    }
    const arc = heroArcLift(distance, viewportW, viewportH) * 0.6;
    const apexY = Math.min(y0, y1) - arc;
    return {
      initial: base,
      animate: {
        x:      [x0,     x0,       x0,       midX,           x1,               x1],
        y:      [y0,     y0 - 32,  y0 - 36,  apexY,          y1 - 6,           y1],
        rotate: [item.fromRotation, 0, 0,    -dir * 4,       item.toRotation,  item.toRotation],
        scale:  [1,      1.08,     1.08,     1.1,            endScale * 1.01,  endScale],
        rotateX: 0,
        rotateY: 0,
        opacity: 1,
      },
      transition: { duration, times, ease: ["easeOut", "easeInOut", "easeIn", "linear", "easeOut"] as TravelEase[] },
    };
  }

  return {
    initial: base,
    animate: {
      x: [x0, midX, x1],
      y: [y0, Math.min(y0, y1) - 40, y1],
      rotate: item.toRotation,
      scale: [1, 1, endScale],
      opacity: 1,
      rotateX: 0,
      rotateY: 0,
    },
    transition: { duration, times: [0, 0.5, 1], ease: ["easeIn", "easeOut"] as TravelEase[] },
  };
}

function FlippableCard({
  card,
  imageUrl,
  category,
  value,
  flipped,
  reducedMotion,
  animationSpeed,
  state,
  valueEmphasis = "none",
  valueRef,
  opponentLabel = "Bot",
}: {
  card: StatCheckCard | null;
  imageUrl?: string | null;
  category: StatCategory;
  value?: number;
  flipped: boolean;
  reducedMotion: boolean;
  animationSpeed: StatCheckAnimationSpeed;
  state: "idle" | "winner" | "loser" | "decisive";
  valueEmphasis?: LaneValueEmphasis;
  valueRef?: RefObject<HTMLSpanElement | null>;
  opponentLabel?: string;
}) {
  if (reducedMotion) {
    return (
      <ChampionCard
        card={flipped ? card : null}
        imageUrl={imageUrl}
        category={category}
        value={value}
        mode={flipped ? "board" : "face-down"}
        state={state}
        valueEmphasis={valueEmphasis}
        valueRef={valueRef}
        label={flipped ? opponentLabel : undefined}
      />
    );
  }

  return (
    <div className={BOARD_CARD_SIZE} style={{ perspective: "900px" }}>
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0, y: flipped ? -2 : 0, scale: flipped ? [1, 1.05, 1] : 1 }}
        transition={{ duration: animationDuration(STAT_CHECK_ANIMATION.opponentFlipMs, false, animationSpeed) / 1000, ease: STAT_CHECK_ANIMATION.easing }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <ChampionCard card={null} mode="face-down" fill />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden={!flipped}>
          {/* The face-up front mounts only once the flip starts, so the concealed
              champion never appears in the DOM or accessibility tree early. */}
          {flipped && (
            <ChampionCard
              card={card}
              imageUrl={imageUrl}
              category={category}
              value={value}
              mode="board"
              state={state}
              valueEmphasis={valueEmphasis}
              valueRef={valueRef}
              label={opponentLabel}
              fill
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Single source of truth for the physical board-card footprint (portrait, 7:10).
 * Fluid: fills the lane's flexible row so cards dominate the tabletop on large
 * screens instead of floating undersized in empty lane space.
 */
/**
 * Board-card height is budgeted from the viewport minus fixed chrome (nav,
 * header, hand band, bottom bar, gaps, marker) so two cards + marker always
 * fit the locked table height: (100svh - ~480px chrome) / 2 per card.
 */
/**
 * Below md the card is WIDTH-budgeted so all three lanes fit side by side with
 * no horizontal scroll: ~(100vw - slab chrome - lane gaps) / 3 per card. From
 * md up it returns to the height budget. One constant drives sockets, placed
 * cards, flip faces, and (via live DOM measurement) the travel clone, so every
 * card state scales together and placement geometry stays exact.
 */
const BOARD_CARD_SIZE =
  "w-[clamp(64px,26vw,110px)] h-auto shrink-0 [aspect-ratio:7/10] md:w-auto md:h-[clamp(150px,calc(50svh_-_240px),340px)]";

function ChampionCard({
  card,
  imageUrl,
  category,
  categoryValues,
  value,
  mode,
  state = "idle",
  valueEmphasis = "none",
  valueRef,
  label,
  disabled,
  selected,
  onClick,
  testId,
  fill,
}: {
  card: StatCheckCard | null;
  imageUrl?: string | null;
  category?: StatCategory;
  /**
   * The current board's three lane categories, in lane order. Supplied for
   * cards in hand so a card answers the live board; a placed card takes
   * `category` instead and shows only that lane's value.
   */
  categoryValues?: CardCategoryValue[];
  value?: number;
  mode: "hand" | "board" | "face-down";
  state?: "idle" | "selected" | "assigned" | "winner" | "loser" | "decisive";
  /** Reveal treatment for the active category's value only. */
  valueEmphasis?: LaneValueEmphasis;
  /** Measured by the lane so an energy packet can start at this number. */
  valueRef?: RefObject<HTMLSpanElement | null>;
  label?: string;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
  testId?: string;
  /** Fill the parent box (used by flip faces and the motion overlay) instead of self-sizing. */
  fill?: boolean;
}) {
  if (mode === "face-down") {
    // Restrained echo of the player-socket frame language: brass edge, inner
    // gold line, beveled corner cues, and a small dormant gem at bottom center
    // — kept far quieter than the ornate player-side frame asset.
    return (
      <div className={cn(fill ? "h-full w-full" : BOARD_CARD_SIZE, "relative overflow-hidden rounded-lg border-2 border-[#8a6f35]/45 bg-[linear-gradient(150deg,#0b2032,#071018_48%,#1c1730)] shadow-[0_10px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.16)]")}>
        <div className="absolute inset-[6px] rounded-md border border-[#d6b55d]/30" />
        {/* beveled corner cues matching the socket frame's cut corners */}
        <span aria-hidden className="absolute -left-2 -top-2 h-4 w-4 rotate-45 border-b border-[#8a6f35]/60 bg-[#0d1524]" />
        <span aria-hidden className="absolute -right-2 -top-2 h-4 w-4 rotate-45 border-l border-[#8a6f35]/60 bg-[#0d1524]" />
        <span aria-hidden className="absolute -bottom-2 -left-2 h-4 w-4 rotate-45 border-t border-[#8a6f35]/60 bg-[#0d1524]" />
        <span aria-hidden className="absolute -bottom-2 -right-2 h-4 w-4 rotate-45 border-r border-[#8a6f35]/60 bg-[#0d1524]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.22),transparent_46%)]" />
        <div className="relative flex h-full flex-col items-center justify-center gap-1.5 text-cyan-100">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#d6b55d]/40 bg-black/40 text-[#f4d77d]">
            <Swords className="h-5 w-5" />
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200/80">Concealed</span>
        </div>
        {/* dormant gem echoing the player socket's status light */}
        <span aria-hidden className="absolute bottom-[3px] left-1/2 h-2.5 w-3 -translate-x-1/2 bg-[radial-gradient(circle_at_50%_45%,#151c29,#0d1320_75%)] opacity-90" style={{ clipPath: GEM_CLIP }} />
      </div>
    );
  }

  const relevant = card && category ? category.formatValue(value ?? category.getValue(card)) : null;
  // A card in hand shows the round's three lane categories; anything else falls
  // back to the generic chip set (no board established yet).
  const boardRows = card && !relevant ? categoryValues ?? null : null;
  const chips = card && !boardRows ? statChips(card) : [];
  const cardClassName = cn(
    "relative block overflow-hidden rounded-lg border border-cyan-300/20 bg-[#071526] text-left shadow-2xl outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none",
    mode === "hand" && "h-40 w-28 shrink-0 origin-bottom hover:-translate-y-2 sm:h-44 sm:w-32 lg:h-[148px] lg:w-[104px] xl:h-40 xl:w-28 2xl:h-44 2xl:w-32",
    mode === "board" && (fill ? "h-full w-full" : BOARD_CARD_SIZE),
    state === "selected" &&
      "-translate-y-2 scale-[1.08] border-[#f4d77d] brightness-110 shadow-[0_22px_48px_rgba(0,0,0,0.65),0_0_30px_rgba(244,215,125,0.55),0_0_46px_rgba(34,211,238,0.3)] ring-2 ring-[#f4d77d]",
    state === "assigned" && "opacity-50 saturate-75",
    state === "winner" && "border-[#d6b55d] shadow-[0_0_24px_rgba(214,181,93,0.3)]",
    state === "decisive" && "border-[#f4d77d] shadow-[0_0_36px_rgba(214,181,93,0.45)]",
    state === "loser" && "opacity-80 brightness-90 saturate-[0.6]",
    disabled && "cursor-not-allowed",
  );

  const content = (
    <>
      {card && <ChampionArt card={card} imageUrl={imageUrl} />}
      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent", mode === "board" ? "p-1.5" : "p-2")}>
        {label && <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/80">{label}</div>}
        <div className={cn("truncate font-black text-white", mode === "board" ? "text-sm" : "text-sm")}>{card?.name}</div>
        {relevant ? (
          // Placed in a lane: only this lane's contested value survives.
          <CategoryValueBadge value={relevant} emphasis={valueEmphasis} valueRef={valueRef} />
        ) : boardRows ? (
          <div className="mt-1 flex flex-wrap gap-1" data-testid="stat-check-card-board-rows">
            {boardRows.map((row) => (
              <span
                key={`${row.laneIndex}-${row.category.id}`}
                data-card-lane={row.laneIndex}
                data-card-category={row.category.id}
                title={categoryValueAccessibleText(row)}
                className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200"
              >
                {row.label} {row.value}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <span key={chip.label} className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">
                {chip.label} {chip.value}
              </span>
            ))}
          </div>
        )}
      </div>
      {state === "assigned" && <div className="absolute right-1 top-1 rounded bg-[#d6b55d] px-1.5 py-0.5 text-[10px] font-black text-black">Set</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        data-testid={testId}
        data-card-champion={card?.name}
        type="button"
        disabled={disabled}
        aria-pressed={selected ?? false}
        aria-label={card ? handCardAccessibleLabel(card, selected, boardRows) : undefined}
        onClick={onClick}
        className={cardClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <div data-testid={testId} data-card-champion={card?.name} className={cardClassName}>
      {content}
    </div>
  );
}

function handCardAccessibleLabel(card: StatCheckCard, selected?: boolean, boardRows?: CardCategoryValue[] | null) {
  // Screen readers get the full category sentence the compact row abbreviates.
  const stats = boardRows?.length
    ? boardRows.map((row) => categoryValueAccessibleText(row)).join(", ")
    : statChips(card).map((chip) => `${chip.label} ${chip.value}`).join(", ");
  return `${card.name}. ${stats}.${selected ? " Selected. Click a lane to play it." : ""}`;
}

type RevealSequenceOnlineState = {
  youChosen: boolean;
  youLocked: boolean;
  opponentChosen: boolean;
  opponentLocked: boolean;
  opponentConnected: boolean;
  opponentReconnectDeadline: string | null;
  onConcede: () => void;
};

function OnlineOpponentStatus({
  online,
  phase,
}: {
  online: RevealSequenceOnlineState;
  phase: MatchState["phase"];
}) {
  // Pre-reveal the opponent exposes ONLY these booleans — nothing else exists
  // client-side to show.
  const label =
    phase === "item-choice"
      ? online.opponentChosen
        ? "Opponent has chosen"
        : "Opponent is choosing…"
      : phase === "selecting"
        ? online.opponentLocked
          ? "Opponent locked in"
          : "Opponent is placing…"
        : null;
  return (
    <div className="mt-2 space-y-1.5">
      {!online.opponentConnected && phase !== "match-over" && (
        <div
          data-testid="sc-online-disconnected"
          className="rounded-md border border-red-400/40 bg-red-950/40 px-2 py-1.5 text-[11px] font-semibold text-red-200"
        >
          Opponent disconnected — waiting for them to reconnect…
        </div>
      )}
      {label && (
        <div
          data-testid="sc-online-opponent-status"
          data-opponent-locked={online.opponentLocked ? "true" : "false"}
          data-opponent-chosen={online.opponentChosen ? "true" : "false"}
          className="flex items-center justify-between rounded-md border border-cyan-300/15 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-cyan-100/80"
        >
          <span>{label}</span>
          {phase === "selecting" && online.youLocked && (
            <span data-testid="sc-online-you-locked" className="font-black text-[#f4d77d]">
              You locked — waiting…
            </span>
          )}
        </div>
      )}
      {phase !== "match-over" && (
        <button
          type="button"
          data-testid="sc-online-concede"
          onClick={online.onConcede}
          className="w-full rounded-md border border-red-400/25 bg-black/25 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-300/80 transition hover:border-red-400/50 hover:text-red-200"
        >
          Concede match
        </button>
      )}
    </div>
  );
}

function RevealSequence({
  match,
  resolution,
  revealStep,
  onNextRound,
  onRestart,
  online = null,
  opponentLabel = "Bot",
}: {
  match: MatchState;
  resolution: RoundResolution | null;
  revealStep: PresentationStep;
  onNextRound: () => void;
  onRestart: () => void;
  online?: RevealSequenceOnlineState | null;
  opponentLabel?: string;
}) {
  const itemChoiceOpen = match.phase === "item-choice";
  const preRoundChoice = itemChoiceOpen && !match.lastResolution;

  if (preRoundChoice) {
    // Opening item choice: the modal owns the hint and the pick; the rail
    // shows nothing (the Round 1 board stays concealed on the slab).
    return null;
  }

  return (
    <div>
      {/* The next-round hint is no longer a panel here: it is a single
          icon-only socket mounted on the board's item dock. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Round {match.round}</div>
          <div className="text-sm font-black">Resolution</div>
        </div>
        <Badge variant="outline" className="border-[#d6b55d]/35 bg-[#d6b55d]/10 px-1.5 text-[10px] text-[#f4d77d]">
          {phaseLabel(revealStep)}
        </Badge>
      </div>

      {online && <OnlineOpponentStatus online={online} phase={match.phase} />}

      {!resolution && match.phase === "match-over" && (revealStep === "resolved" || revealStep === "match-over") ? (
        // Non-combat endings (concede / disconnect forfeit / no-contest)
        // terminate without a same-round resolution to display.
        <div className="mt-2 space-y-2">
          <div data-testid="stat-check-match-over" className="rounded-md border border-[#d6b55d]/35 bg-[#d6b55d]/10 p-2">
            <div className="text-lg font-black">{match.outcome === "draw" ? "Match Draw" : match.outcome === "player" ? "Victory" : "Defeat"}</div>
            <div className="text-xs text-slate-300">{match.endReason}</div>
            <MatchSummaryPanel match={match} />
            <Button onClick={onRestart} className="mt-3 w-full bg-[#d6b55d] text-[#071018] hover:bg-[#f4d77d]">
              {online ? "Leave match" : "Restart"}
            </Button>
          </div>
        </div>
      ) : !resolution ? (
        <div className="mt-2 space-y-2">
          <div className="rounded-md bg-black/30 p-2 text-xs text-slate-300">
            {online
              ? "Opponent cards stay face-down until both players lock in."
              : "Bot cards stay face-down until lock-in."}
          </div>
          <div data-testid="stat-check-rules-note" className="rounded-md bg-black/30 p-2 text-xs text-slate-300">
            <div className="mb-1 font-black uppercase tracking-[0.14em] text-cyan-200 text-[10px]">How damage works</div>
            <div>Win 2 of 3 lanes: {STAT_CHECK_RULES.boardDamage} damage. Win all 3: +{STAT_CHECK_RULES.sweepBonusDamage}.</div>
            <div>Each lane won past its Decisive margin: +{STAT_CHECK_RULES.decisiveDamage}.</div>
            <div className="mt-1 text-slate-400">Played cards are discarded for the whole match. Both sides redraw to {STAT_CHECK_RULES.handSize} from the same pile.</div>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <BoardResult resolution={resolution} opponentLabel={opponentLabel} />
          <DamageBreakdown title="You deal" amount={resolution.damage.player} side="player" damage={resolution.damage} />
          <DamageBreakdown title={`${opponentLabel} deals`} amount={resolution.damage.bot} side="bot" damage={resolution.damage} />
          {(revealStep === "resolved" || revealStep === "match-over") && (
            <div className="space-y-2 pt-2">
              {/* Post-cadence item choice happens in the overlay; the resolved
                  board, lane results, and damage all stay visible behind it. */}
              {match.phase === "resolved" && (
                <Button data-testid="stat-check-next-round" onClick={onNextRound} className="w-full bg-cyan-300 text-[#06111f] hover:bg-cyan-200">
                  Next Round <ChevronsRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
              {match.phase === "match-over" && (
                <div data-testid="stat-check-match-over" className="rounded-md border border-[#d6b55d]/35 bg-[#d6b55d]/10 p-2">
                  <div className="text-lg font-black">{match.outcome === "draw" ? "Match Draw" : match.outcome === "player" ? "Victory" : "Defeat"}</div>
                  <div className="text-xs text-slate-300">{match.endReason}</div>
                  <MatchSummaryPanel match={match} />
                  <Button onClick={onRestart} className="mt-3 w-full bg-[#d6b55d] text-[#071018] hover:bg-[#f4d77d]">
                    {online ? "Leave match" : "Restart"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchSummaryPanel({ match }: { match: MatchState }) {
  const summary = buildMatchSummary(match);
  const row = (label: string, value: string | number) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-300">{label}</span>
      <span className="font-black text-white">{value}</span>
    </div>
  );
  return (
    <details data-testid="stat-check-summary" className="mt-2 rounded-md bg-black/30 p-2 text-xs">
      <summary className="cursor-pointer select-none font-black uppercase tracking-[0.14em] text-cyan-200 text-[10px]">
        Playtest summary
      </summary>
      <div className="mt-2 space-y-1">
        {row("Rounds", summary.rounds)}
        {row("Final HP (you / bot)", `${summary.finalPlayerHp} / ${summary.finalBotHp}`)}
        {row("Your damage (board / sweep / decisive)", `${summary.player.boardDamage} / ${summary.player.sweepDamage} / ${summary.player.decisiveDamage}`)}
        {row("Bot damage (board / sweep / decisive)", `${summary.bot.boardDamage} / ${summary.bot.sweepDamage} / ${summary.bot.decisiveDamage}`)}
        {row("Tied boards", summary.tiedBoards)}
        {row("No-damage rounds", summary.noDamageRounds)}
        {row("Both-sides-damage rounds", summary.simultaneousDamageRounds)}
        {row("Strongest clue-family card retained", `${summary.clueRetainedRounds} of ${summary.clueTrackedRounds} tracked rounds`)}
        {row("Shared pool remaining", summary.poolRemaining)}
        {row("Discards (you / bot)", `${summary.playerDiscards} / ${summary.botDiscards}`)}
        <div className="pt-1 text-slate-400">Clues shown: {summary.clueFamilies.join(", ") || "none"}</div>
      </div>
    </details>
  );
}

/**
 * Narrow-layout matchup header: both HP bars and identities in one compact
 * band directly above the board, replacing the wide matchup rail.
 */
function CompactMatchupBar({
  displayHp,
  resolution,
  flashKey,
  impactSide = null,
  isOnline = false,
  opponentLabel = "Bot",
}: {
  displayHp: { player: number; bot: number };
  resolution: RoundResolution | null;
  flashKey: number;
  /** Side whose bar is currently taking the centre presentation's damage. */
  impactSide?: Side | null;
  isOnline?: boolean;
  opponentLabel?: string;
}) {
  return (
    <div data-testid="stat-check-compact-matchup" className="grid grid-cols-2 items-end gap-2">
      <div className="min-w-0">
        <div className="mb-0.5 flex items-baseline gap-1.5 px-0.5 leading-tight">
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/80">You</span>
          <span className="truncate text-[11px] font-black text-white">{isOnline ? "You" : "mogsy"}</span>
        </div>
        <HpBar
          side="player"
          hp={displayHp.player}
          previousHp={resolution?.playerHpBefore}
          damage={resolution?.damage.bot ?? 0}
          flashKey={flashKey}
          impacting={impactSide === "player"}
        />
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 flex items-baseline justify-end gap-1.5 px-0.5 leading-tight">
          <span className="truncate text-[11px] font-black text-white">
            {isOnline ? "Opponent" : "Deterministic Bot"}
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-red-300/80">{opponentLabel}</span>
        </div>
        <HpBar
          side="bot"
          hp={displayHp.bot}
          previousHp={resolution?.botHpBefore}
          damage={resolution?.damage.player ?? 0}
          flashKey={flashKey}
          impacting={impactSide === "bot"}
        />
      </div>
    </div>
  );
}

function MatchupRail({
  match,
  displayHp,
  resolution,
  flashKey,
  impactSide = null,
  isOnline = false,
  opponentLabel = "Bot",
  surface = "dev",
}: {
  match: MatchState;
  displayHp: { player: number; bot: number };
  resolution: RoundResolution | null;
  flashKey: number;
  /** Side whose bar is currently taking the centre presentation's damage. */
  impactSide?: Side | null;
  isOnline?: boolean;
  opponentLabel?: string;
  surface?: "dev" | "public";
}) {
  const lastRound = match.roundHistory[match.roundHistory.length - 1] ?? null;
  return (
    <aside className="order-3 flex min-h-0 flex-col gap-2 min-[1210px]:order-none min-[1210px]:h-full min-[1210px]:overflow-y-auto">
      <ProfilePanel side="bot" isOnline={isOnline} surface={surface} />
      <HpBar
        side="bot"
        hp={displayHp.bot}
        previousHp={resolution?.botHpBefore}
        damage={resolution?.damage.player ?? 0}
        flashKey={flashKey}
        impacting={impactSide === "bot"}
      />
      <div className="flex items-center gap-3 px-1" aria-hidden>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d6b55d]/50" />
        <span className="text-xs font-black uppercase tracking-[0.3em] text-[#f4d77d]">vs</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d6b55d]/50" />
      </div>
      <HpBar
        side="player"
        hp={displayHp.player}
        previousHp={resolution?.playerHpBefore}
        damage={resolution?.damage.bot ?? 0}
        flashKey={flashKey}
        impacting={impactSide === "player"}
      />
      <ProfilePanel side="player" isOnline={isOnline} surface={surface} />
      <LastRoundDamage resolution={lastRound} opponentLabel={opponentLabel} />
      <MatchHistoryPanel history={match.roundHistory} opponentLabel={opponentLabel} />
    </aside>
  );
}

/**
 * Invented matchup-card flavour. Nothing here is fetched, stored, or derived
 * from a profile, a match record, or any backend contract — these are fixed
 * decorative strings, and the engine never reads them.
 *
 * The public bot route deliberately gives the bot an absurd, obviously-fake
 * boast (`Metal IV`, a rank that does not exist) so it cannot be mistaken for
 * a real record; the dev prototype keeps its original placeholder line.
 */
const MATCHUP_FLAVOR: Record<"dev" | "public", { bot: string; player: string }> = {
  dev: { bot: "Platinum IV - 63% WR - 412 games", player: "Diamond II - 57% WR - 892 games" },
  public: { bot: "Metal IV - 99% WR - 999 games", player: "Diamond II - 57% WR - 892 games" },
};

export function ProfilePanel({
  side,
  isOnline = false,
  surface = "dev",
}: {
  side: "player" | "bot";
  isOnline?: boolean;
  surface?: "dev" | "public";
}) {
  // Cosmetic matchup dressing for the local bot game (invented rank/record
  // flavor); online private matches show neutral seat identities instead.
  const bot = side === "bot";
  return (
    <div className="flex items-center gap-3 rounded-md border border-cyan-300/12 bg-black/28 p-2.5 shadow-xl">
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full border-2",
          bot ? "border-red-400/50 bg-red-950/60 text-red-300" : "border-[#d6b55d]/60 bg-[#1c1730] text-[#f4d77d]",
        )}
      >
        {bot ? <Bot className="h-6 w-6" /> : <User className="h-6 w-6" />}
      </span>
      <div className="min-w-0">
        <div className={cn("text-[10px] font-black uppercase tracking-[0.2em]", bot ? "text-red-300/80" : "text-cyan-200/80")}>
          {bot ? "Opponent" : "You"}
        </div>
        <div className="truncate text-sm font-black text-white">
          {isOnline ? (bot ? "Opponent" : "You") : bot ? "Deterministic Bot" : "mogsy"}
        </div>
        <div className="truncate text-[11px] text-slate-400">
          {isOnline ? "Private match" : MATCHUP_FLAVOR[surface][bot ? "bot" : "player"]}
        </div>
      </div>
    </div>
  );
}

function HpBar({
  side,
  hp,
  previousHp,
  damage,
  flashKey,
  impacting = false,
}: {
  side: "player" | "bot";
  hp: number;
  previousHp?: number;
  damage: number;
  flashKey: number;
  /** True while this bar is the one currently taking the round's damage. */
  impacting?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (hp / STAT_CHECK_RULES.startingHp) * 100));
  const damaged = previousHp != null && damage > 0 && hp < previousHp;
  return (
    <div
      data-testid={`stat-check-${side}-hp-panel`}
      data-hp-impacting={impacting ? "true" : undefined}
      className={cn(
        "relative rounded-md border bg-black/28 px-3 py-1.5 shadow-xl transition-colors duration-200",
        impacting
          ? "border-red-400/70 shadow-[0_0_22px_rgba(248,113,113,0.45)]"
          : "border-cyan-300/12",
      )}
    >
      {damaged && (
        <div key={flashKey} className="pointer-events-none absolute right-3 top-0 -translate-y-3 animate-bounce rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white motion-reduce:animate-none">
          -{damage}
        </div>
      )}
      <div data-testid={`stat-check-${side}-hp`} className="text-sm font-black">
        {Math.max(0, hp)} / {STAT_CHECK_RULES.startingHp} HP
      </div>
      <div className={cn("mt-1 h-2 overflow-hidden rounded-full bg-slate-900", impacting && "ring-1 ring-red-300/60")}>
        <div
          className={cn(
            // The width transition IS the drain: the bar is handed its new
            // value only at the impact/health stage, never before it.
            "h-full transition-all duration-500 motion-reduce:transition-none",
            side === "bot" ? "bg-gradient-to-r from-red-600 to-red-400" : "bg-gradient-to-r from-cyan-500 to-cyan-300",
            impacting && "brightness-150",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LastRoundDamage({ resolution, opponentLabel = "Bot" }: { resolution: RoundResolution | null; opponentLabel?: string }) {
  return (
    <div className="rounded-md border border-cyan-300/12 bg-black/28 p-2.5 shadow-xl">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Last round damage</div>
      {resolution ? (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center justify-between rounded bg-black/30 px-2 py-1 text-xs">
            <span className="font-semibold text-slate-300">{opponentLabel} dealt</span>
            <span className={cn("font-black", resolution.damage.bot > 0 ? "text-red-300" : "text-slate-500")}>
              {resolution.damage.bot} damage
            </span>
          </div>
          <div className="flex items-center justify-between rounded bg-black/30 px-2 py-1 text-xs">
            <span className="font-semibold text-slate-300">You dealt</span>
            <span className={cn("font-black", resolution.damage.player > 0 ? "text-[#f4d77d]" : "text-slate-500")}>
              {resolution.damage.player} damage
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-slate-500">No rounds resolved yet.</div>
      )}
    </div>
  );
}

function MatchHistoryPanel({ history, opponentLabel = "Bot" }: { history: RoundResolution[]; opponentLabel?: string }) {
  return (
    <div className="min-h-0 rounded-md border border-cyan-300/12 bg-black/28 p-2.5 shadow-xl">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Match history</div>
      {history.length === 0 ? (
        <div className="mt-1.5 text-xs text-slate-500">No rounds played yet.</div>
      ) : (
        <div data-testid="stat-check-match-history" className="mt-1.5 max-h-56 space-y-1 overflow-y-auto pr-0.5">
          {history.map((round) => {
            const winner = round.damage.boardWinner;
            return (
              <div
                key={round.round}
                className={cn(
                  "flex items-center justify-between gap-2 rounded px-2 py-1 text-xs",
                  winner === "player" && "bg-emerald-950/50 text-emerald-200",
                  winner === "bot" && "bg-red-950/50 text-red-200",
                  winner === "tie" && "bg-black/30 text-slate-300",
                )}
              >
                <span className="font-black">R{round.round}</span>
                <span className="flex-1 font-semibold">
                  {winner === "player" ? "You won" : winner === "bot" ? `${opponentLabel} won` : "Tied"}
                </span>
                <span className="font-black">{round.damage.playerCategoryWins} - {round.damage.botCategoryWins}</span>
                <span className="w-14 text-right font-semibold text-slate-400">
                  {round.damage.bot > 0 ? `-${round.damage.bot} HP` : "-"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NextRoundIntel({
  categories,
  heading = "Next Round Intel",
  compact = false,
}: {
  categories: StatCategory[];
  heading?: string;
  compact?: boolean;
}) {
  const [visible, ...hiddenSlots] = categories;
  return (
    <div className={cn("rounded-md border border-[#d6b55d]/25 bg-black/28 shadow-xl", compact ? "p-2" : "p-3")}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4d77d]">{heading}</div>
      <div data-testid="stat-check-next-intel" className="mt-1.5 rounded-md border border-[#d6b55d]/30 bg-[#d6b55d]/10 p-1.5">
        <div className="flex items-center gap-1.5">
          <CategoryIcon category={visible} />
          <div className="min-w-0">
            <div data-testid="stat-check-next-intel-label" className="truncate text-xs font-black">{statFamilyLabel(visible)}</div>
            <div className="text-[10px] text-slate-300">One upcoming stat family</div>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {hiddenSlots.map((category) => (
          <div key={category.id} className="rounded-md border border-white/10 bg-black/25 p-1.5 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Hidden
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscardPile({
  side,
  cards,
  assets,
  opponentLabel = "Bot",
  elementRef,
}: {
  side: "player" | "bot";
  cards: StatCheckCard[];
  assets: ReturnType<typeof useChampionAssets>["data"];
  opponentLabel?: string;
  elementRef?: (element: HTMLElement | null) => void;
}) {
  return (
    <details ref={elementRef} className="rounded-md border border-cyan-300/12 bg-black/25 p-2 shadow-xl" data-testid={`stat-check-${side}-discard`}>
      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-cyan-100">
        {side === "player" ? "Your" : opponentLabel} discard - {cards.length}
      </summary>
      <div className="mt-2 flex min-h-10 flex-wrap gap-1">
        {cards.length === 0 ? (
          <span className="text-xs text-slate-500">Empty</span>
        ) : (
          cards.map((card, index) => (
            <div key={`${card.id}-${index}`} title={card.name} className="-ml-2 h-10 w-10 overflow-hidden rounded border border-[#d6b55d]/25 bg-slate-900 first:ml-0">
              <ChampionArt card={card} imageUrl={getImage(assets, card)} />
            </div>
          ))
        )}
      </div>
    </details>
  );
}


function BoardResult({ resolution, opponentLabel = "Bot" }: { resolution: RoundResolution; opponentLabel?: string }) {
  const label =
    resolution.damage.boardWinner === "tie"
      ? "Board tied"
      : resolution.damage.boardWinner === "player"
        ? resolution.damage.playerCategoryWins === 3
          ? "Player won board - Sweep"
          : "Player won board"
        : resolution.damage.botCategoryWins === 3
          ? `${opponentLabel} won board - Sweep`
          : `${opponentLabel} won board`;
  const matchEnding =
    resolution.outcome === "draw"
      ? "Simultaneous knockout - Match draw"
      : resolution.outcome === "player"
        ? `${opponentLabel} knocked out`
        : resolution.outcome === "bot"
          ? "Player knocked out"
          : null;
  return (
    <div data-testid="stat-check-board-result" className="rounded-md border border-white/10 bg-black/35 p-2">
      <div className="text-xs font-black">{label}</div>
      <div className="mt-1 text-xs text-slate-300">
        Lanes: You {resolution.damage.playerCategoryWins}, Bot {resolution.damage.botCategoryWins}
      </div>
      {matchEnding && <div className="mt-2 text-xs font-black uppercase text-[#f4d77d]">{matchEnding}</div>}
    </div>
  );
}

function DamageBreakdown({ title, amount, side, damage }: { title: string; amount: number; side: "player" | "bot"; damage: RoundDamage }) {
  const lines: string[] = [];
  if (side === "player") {
    if (damage.playerBoardDamage > 0) lines.push(`Board win: +${STAT_CHECK_RULES.boardDamage}`);
    if (damage.boardWinner === "player" && damage.playerCategoryWins === 3) lines.push(`Sweep: +${STAT_CHECK_RULES.sweepBonusDamage}`);
    for (let i = 0; i < damage.playerDecisiveDamage; i++) lines.push(`Decisive lane ${i + 1}: +${STAT_CHECK_RULES.decisiveDamage}`);
  } else {
    if (damage.botBoardDamage > 0) lines.push(`Board win: +${STAT_CHECK_RULES.boardDamage}`);
    if (damage.boardWinner === "bot" && damage.botCategoryWins === 3) lines.push(`Sweep: +${STAT_CHECK_RULES.sweepBonusDamage}`);
    for (let i = 0; i < damage.botDecisiveDamage; i++) lines.push(`Decisive lane ${i + 1}: +${STAT_CHECK_RULES.decisiveDamage}`);
  }
  if (lines.length === 0) lines.push("No damage");
  return (
    <div data-testid={`stat-check-damage-${side}`} className="rounded-md bg-black/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black">{title}</span>
        <span className="text-base font-black text-[#f4d77d]">{amount}</span>
      </div>
      <div className="mt-1.5 space-y-1 text-[11px] text-slate-300">
        {lines.map((line) => <div key={line}>{line}</div>)}
        <div className="font-black text-white">Total: {amount}</div>
      </div>
    </div>
  );
}

function CategoryGlyph({ category, className }: { category: StatCategory; className?: string }) {
  if (category.id.includes("hp")) return <Heart className={className} />;
  if (category.id.includes("ad")) return <Sword className={className} />;
  if (category.id.includes("armor")) return <Shield className={className} />;
  if (category.id.includes("mr")) return <Sparkles className={className} />;
  if (category.id.includes("move")) return <Footprints className={className} />;
  if (category.id.includes("range")) return <Crosshair className={className} />;
  return <Gauge className={className} />;
}

function CategoryIcon({ category }: { category: StatCategory }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#d6b55d]/35 bg-[#d6b55d]/10 text-[#f4d77d]">
      <CategoryGlyph category={category} className="h-4 w-4" />
    </span>
  );
}

function ChampionArt({ card, imageUrl }: { card: StatCheckCard; imageUrl?: string | null }) {
  // Crop biased right-of-center: champion splashes place the subject right of
  // the frame midline, so this keeps the champion centered in portrait crops.
  if (imageUrl) return <img src={imageUrl} alt={card.name} className="h-full w-full object-cover object-[65%_30%]" loading="lazy" />;
  return (
    <div className="flex h-full min-h-[88px] w-full items-center justify-center bg-gradient-to-br from-cyan-950 via-slate-900 to-amber-950 text-xl font-black text-[#f4d77d]">
      {card.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function assignedCard(match: MatchState, categoryId: StatCategoryId) {
  const id = match.assignments[categoryId];
  return match.playerHand.find((card) => card.id === id) ?? null;
}

function getImage(assets: ReturnType<typeof useChampionAssets>["data"], card?: StatCheckCard | null) {
  return getChampionSplash(assets, card?.name) || getChampionIcon(assets, card?.name);
}

function statChips(card: StatCheckCard) {
  return [
    { label: "HP", value: Math.round(card.stats.hp) },
    { label: "AD", value: Math.round(card.stats.ad) },
    { label: "AR", value: Math.round(card.stats.armor) },
    { label: "RNG", value: Math.round(card.stats.attackRange) },
  ];
}

function statFamilyLabel(category: StatCategory) {
  return STAT_FAMILY_LABELS[category.family] ?? "Champion Stats";
}

function scopeLabel(category: StatCategory) {
  if (category.id.includes("-18")) return "Level 18";
  if (category.id.includes("-1")) return "Level 1";
  return "Base";
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function phaseLabel(step: PresentationStep) {
  return step
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Dev-only: `?animDebug=1` shows a live phase indicator on the dev route. */
function isAnimDebugEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("animDebug");
}

/**
 * Dev-only: `?forceMotion=1` forces the full choreography regardless of the OS
 * prefers-reduced-motion setting, for animation development. Production builds
 * keep standards-compliant reduced-motion behavior.
 */
function isForceMotionEnabled() {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("forceMotion");
}

function clearAnimationTimers(timers: number[]) {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.length = 0;
}

/**
 * Snapshot an element's TRUE layout box, not its rotated bounding box.
 * getBoundingClientRect() on a fan-rotated wrapper returns an axis-aligned box
 * inflated by the rotation, which skewed the clone's size, aspect ratio, and
 * therefore its final landing scale. Using offsetWidth/offsetHeight (layout
 * size, unaffected by transforms) centered on the AABB center gives the exact
 * card geometry at both endpoints.
 */
function snapshotElement(element?: Element | null): DOMRectSnapshot | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const layoutWidth = (element as HTMLElement).offsetWidth || rect.width;
  const layoutHeight = (element as HTMLElement).offsetHeight || rect.height;
  return {
    x: rect.left + rect.width / 2 - layoutWidth / 2,
    y: rect.top + rect.height / 2 - layoutHeight / 2,
    width: layoutWidth,
    height: layoutHeight,
  };
}

/**
 * The lane refs point at the full-width row containers; the physical card slot
 * is their only child. Landing on the row made the clone finish larger and
 * off-center relative to the authoritative board card.
 */
function slotElement(row?: HTMLElement | null): Element | null {
  return row?.firstElementChild ?? row ?? null;
}

function fallbackRect(): DOMRectSnapshot {
  if (typeof window === "undefined") return { x: 0, y: 0, width: 120, height: 160 };
  return { x: window.innerWidth / 2 - 60, y: window.innerHeight / 2 - 80, width: 120, height: 160 };
}

function readElementRotation(element?: Element | null) {
  if (!element || typeof window === "undefined") return 0;
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  const values = transform.match(/matrix\(([^)]+)\)/)?.[1]?.split(",").map((value) => Number.parseFloat(value.trim()));
  if (!values || values.length < 2) return 0;
  return Math.round(Math.atan2(values[1], values[0]) * (180 / Math.PI));
}

/**
 * A speed the player explicitly chose this session wins; anything missing or
 * unrecognised falls back to the gameplay default. Reading the raw entry (not
 * `Number(null) === 0`) keeps "never chosen" distinguishable from "chose a
 * value we no longer offer", and both land on the default.
 */
function readStoredAnimationSpeed(): StatCheckAnimationSpeed {
  if (typeof window === "undefined") return STAT_CHECK_DEFAULT_ANIMATION_SPEED;
  const stored = window.sessionStorage.getItem(SPEED_STORAGE_KEY);
  if (stored === null) return STAT_CHECK_DEFAULT_ANIMATION_SPEED;
  const parsed = Number(stored);
  return isStatCheckAnimationSpeed(parsed) ? parsed : STAT_CHECK_DEFAULT_ANIMATION_SPEED;
}

function useSessionAnimationSpeed() {
  const [speed, setSpeed] = useState<StatCheckAnimationSpeed>(() => readStoredAnimationSpeed());
  const setSessionSpeed = (next: StatCheckAnimationSpeed) => {
    setSpeed(next);
    if (typeof window !== "undefined") window.sessionStorage.setItem(SPEED_STORAGE_KEY, String(next));
  };
  return [speed, setSessionSpeed] as const;
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth || 1440);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth || 1440);
    window.addEventListener("resize", onResize);
    // Some environments update innerWidth without dispatching a resize event
    // (e.g. emulated-viewport changes); the layout breakpoint's media query
    // still fires, so re-read the width on its change too.
    const query = window.matchMedia?.("(min-width: 1210px)");
    query?.addEventListener?.("change", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      query?.removeEventListener?.("change", onResize);
    };
  }, []);
  return width;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
