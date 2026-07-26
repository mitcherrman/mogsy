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
  REDUCED_MOTION_CHOREO,
  STAT_CHECK_ANIMATION,
  STAT_CHECK_ANIMATION_SPEEDS,
  REVEAL_TIMELINE,
  animationDuration,
  durationAtSpeed,
  heroArcLift,
  isStatCheckAnimationSpeed,
  type StatCheckAnimationSpeed,
} from "./animationConfig";
import {
  activeResolvedLane,
  allowsPreLockInteraction,
  animationStepReducer,
  itemsRevealedAtStep,
  revealedOpponentCount,
  stepAfterLane,
  stepBeforeDamage,
  type PresentationStep,
} from "./animationState";
import { fanCardLayout, responsiveFanParameters } from "./fanLayout";
import { ITEMS, isItemCompatible, itemBonusFor, type ItemId } from "./items";
import { ItemChoiceOverlay, ItemChoicePanel, ItemGlyph, ItemInventoryDock } from "./StatCheckItems";
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
}: {
  online?: OnlineMatchController | null;
  onOnlineExit?: () => void;
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

  useEffect(() => {
    // Local bot mode only: online matches never run the local engine.
    if (online) return;
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
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

    if (prefersReducedMotion) {
      dispatchRevealStep({ type: match.phase === "match-over" ? "match-over" : "resolved" });
      setDamageFlashKey((key) => key + 1);
      return;
    }

    // Rounds where an item was played get an extra item-reveal beat between
    // the opponent flips and lane resolution; every later step shifts by the
    // same amount so the bonus lands readably. Item-free rounds keep the
    // original timeline exactly.
    const roundHasItems = match.lastResolution.results.some((result) => result.playerItem || result.botItem);
    const shift = roundHasItems ? REVEAL_TIMELINE.itemRevealShiftMs : 0;
    const timeline: Array<[number, () => void]> = [
      [REVEAL_TIMELINE.opponentReveal1, () => dispatchRevealStep({ type: "opponent", lane: 1 })],
      [REVEAL_TIMELINE.opponentReveal2, () => dispatchRevealStep({ type: "opponent", lane: 2 })],
      [REVEAL_TIMELINE.opponentReveal3, () => dispatchRevealStep({ type: "opponent", lane: 3 })],
      ...(roundHasItems
        ? [[REVEAL_TIMELINE.itemReveal, () => dispatchRevealStep({ type: "item-reveal" })] as [number, () => void]]
        : []),
      [REVEAL_TIMELINE.resolveLane1 + shift, () => dispatchRevealStep({ type: "resolve", lane: 1 })],
      [REVEAL_TIMELINE.resolveLane2 + shift, () => dispatchRevealStep({ type: "resolve", lane: 2 })],
      [REVEAL_TIMELINE.resolveLane3 + shift, () => dispatchRevealStep({ type: "resolve", lane: 3 })],
      [REVEAL_TIMELINE.boardResult + shift, () => dispatchRevealStep({ type: "board-result" })],
      [REVEAL_TIMELINE.damage + shift, () => {
        dispatchRevealStep({ type: "damage" });
        setDamageFlashKey((key) => key + 1);
      }],
      [REVEAL_TIMELINE.resolved + shift, () => dispatchRevealStep({ type: match.phase === "match-over" ? "match-over" : "resolved" })],
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
  const displayHp = activeResolution && stepBeforeDamage(revealStep)
    ? { player: activeResolution.playerHpBefore, bot: activeResolution.botHpBefore }
    : { player: match.playerHp, bot: match.botHp };

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
    setTravelingCards((items) => [...items, { id, card, imageUrl, category, label, from, to, fromRotation, toRotation, durationMs, phaseDurations, kind }]);
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
    for (const result of activeResolution.results) {
      queueCardTravel({
        card: result.playerCard,
        imageUrl: getImage(assets, result.playerCard),
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
              <Swords className="h-4 w-4" /> Dev prototype
            </div>
            <h1 className="text-lg font-black leading-tight md:text-2xl min-[1210px]:text-3xl">Stat Check</h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300 md:gap-2">
            <Badge variant="outline" className="hidden border-cyan-300/30 bg-cyan-300/10 text-cyan-100 md:inline-flex">
              {online ? "Online match" : dataSource}
            </Badge>
            <AnimationSpeedControl speed={animationSpeed} onSpeedChange={setAnimationSpeed} />
            {!online && isLoading && <Badge variant="outline" className="hidden md:inline-flex">Loading stats</Badge>}
            {!online && isError && <Badge variant="outline" className="hidden md:inline-flex">Fallback active</Badge>}
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
              isOnline={Boolean(online)}
              opponentLabel={opponentLabel}
            />
          ) : (
            <CompactMatchupBar
              displayHp={displayHp}
              resolution={activeResolution}
              flashKey={damageFlashKey}
              isOnline={Boolean(online)}
              opponentLabel={opponentLabel}
            />
          )}

          <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-1.5 sm:gap-2">
            <div
              className={cn(
                "relative min-h-0 rounded-2xl p-1.5 md:p-2 min-[1210px]:p-3",
                // The slab itself: the approved stone-surface asset is the board
                // material, held by a raised brass perimeter frame. Translucent
                // light/shade gradients sit over the texture so the stone stays
                // visible but reads as one lit object; the drop shadows below
                // give the block visible thickness on the table.
                "border-2 border-[#7d6430]",
                "shadow-[inset_0_2px_0_rgba(244,215,125,0.28),inset_0_-2px_0_rgba(0,0,0,0.6),inset_0_0_70px_rgba(0,0,0,0.55),0_6px_0_-2px_#241d0e,0_10px_0_-4px_#0a0d14,0_30px_60px_rgba(0,0,0,0.6)]",
              )}
              style={{
                backgroundImage: `radial-gradient(ellipse at 50% 16%, rgba(72,98,132,0.34), transparent 60%), linear-gradient(180deg, rgba(27,37,54,0.22) 0%, rgba(16,23,36,0.4) 46%, rgba(9,14,24,0.62) 100%), url(${stoneSurfaceUrl})`,
                backgroundSize: "auto, auto, 640px 640px",
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
                verdict={revealStep === "damage" || revealStep === "resolved" || revealStep === "match-over"}
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
            </div>

            <div className="relative">
              {/* Board-mounted item dock — icons and counts only, one mount,
                  one component, split on the same 1210px boundary as the
                  arena itself.
                  Compact arena: an in-flow shelf bolted to the board's lower
                  edge directly above the hand tray. The fan spans the full
                  width at these sizes, so sitting above it is the only place
                  that never tangles with hand cards, and it keeps the dock
                  out of the viewport corner where the app's floating buttons
                  live.
                  Wide arena: absolutely mounted in the free corner where the
                  slab's bottom-left edge meets the tray, clear of the
                  narrower centred fan. */}
              <ItemInventoryDock
                inventory={match.playerInventory}
                selectedItemId={selectedItemId}
                disabled={!canEdit}
                onToggle={toggleInventoryItem}
                className="z-[450] mx-auto -mt-2 mb-2 min-[1210px]:absolute min-[1210px]:-top-2 min-[1210px]:left-0 min-[1210px]:m-0"
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
            <div className="relative z-[500] flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1">
              {match.phase === "selecting" ? (
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-cyan-100/70" data-testid="stat-check-instruction">
                  {armedItem
                    ? `Click a compatible occupied lane to attach ${ITEMS[armedItem].label}.`
                    : selectedCard
                      ? `Click a lane to play ${selectedCard.name}.`
                      : "Click a champion, then click a lane."}
                </p>
              ) : (
                <span aria-hidden className="min-w-0 flex-1" />
              )}
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
                nextCategories={match.nextCategories}
                showIntel={!itemChoiceOpen}
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
                  nextCategories={match.nextCategories}
                  showIntel={!itemChoiceOpen}
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
  const botState = showResult && botWon ? (resolution?.decisive ? "decisive" : "winner") : showResult && playerWon ? "loser" : "idle";
  const playerState = showResult && playerWon ? (resolution?.decisive ? "decisive" : "winner") : showResult && botWon ? "loser" : "idle";
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
      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
        <div ref={botRef} className="relative flex min-h-0 min-w-0 items-center justify-center py-0.5">
          <FlippableCard
            card={botCard}
            imageUrl={getImage(assets, botCard)}
            category={category}
            value={botShownValue}
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
        <div className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1">
          {concealed ? (
            <HiddenCategoryMarker index={index} />
          ) : showResult && resolution ? (
            <LaneResult result={resolution} opponentLabel={opponentLabel} />
          ) : (
            <CategoryMarker category={category} />
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
                showResult && resolution
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

export function CategoryMarker({ category }: { category: StatCategory }) {
  const higher = category.direction === "higher";
  return (
    <div
      data-testid={`stat-check-marker-${category.id}`}
      data-direction={category.direction}
      className="z-10 flex w-full items-center gap-2"
    >
      <span aria-hidden className="h-[3px] flex-1 rounded-full bg-[linear-gradient(90deg,transparent,rgba(138,111,53,0.55)_20%,rgba(138,111,53,0.8))] shadow-[0_1px_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.3)]" />
      <div className="relative max-w-full rounded-xl border border-[#8a6f35]/60 bg-[linear-gradient(180deg,rgba(74,58,28,0.6),rgba(6,10,16,0.88))] p-[5px] shadow-[0_10px_26px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.28)]">
        {/* rail clamps bolting the plaque onto the comparison rail */}
        <span aria-hidden className="absolute -left-[7px] top-1/2 h-6 w-[7px] -translate-y-1/2 rounded-l-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute -right-[7px] top-1/2 h-6 w-[7px] -translate-y-1/2 rounded-r-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        {/* corner bolts on the backing plate */}
        <span aria-hidden className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
        <div className="flex min-w-0 max-w-full flex-col items-center gap-0.5 rounded-lg border border-[#d6b55d]/45 bg-black/80 px-1 py-1 shadow-[inset_0_1px_0_rgba(214,181,93,0.28)] md:min-w-[112px] md:px-3 md:py-2 min-[1210px]:px-4">
        <span className="flex items-center gap-1 md:gap-2" aria-hidden>
          {higher ? (
            <ArrowUp className="h-3.5 w-3.5 text-[#f4d77d] md:h-7 md:w-7" strokeWidth={2.75} />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-cyan-300 md:h-7 md:w-7" strokeWidth={2.75} />
          )}
          <CategoryGlyph category={category} className="hidden h-5 w-5 text-[#f4d77d] md:block" />
          <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.04em] text-white md:text-lg md:tracking-[0.06em]">
            {category.shortLabel}
          </span>
        </span>
        <span className="hidden flex-wrap items-center justify-center gap-x-2 gap-y-0.5 md:flex" aria-hidden>
          <span className="rounded bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">
            {scopeLabel(category)}
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#f4d77d]">
            Decisive {formatThreshold(category.decisiveThreshold)}
          </span>
        </span>
        </div>
      </div>
      <span aria-hidden className="h-[3px] flex-1 rounded-full bg-[linear-gradient(270deg,transparent,rgba(138,111,53,0.55)_20%,rgba(138,111,53,0.8))] shadow-[0_1px_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(244,215,125,0.3)]" />
      <span className="sr-only">{categoryAccessibleLabel(category)}</span>
    </div>
  );
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
        <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-[#d6b55d]/45 bg-black/80 px-1.5 py-1 shadow-[inset_0_1px_0_rgba(214,181,93,0.28)] md:min-w-[112px] md:px-3 md:py-2 min-[1210px]:px-4">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:text-base">Hidden</span>
          <span className="hidden text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 md:block">Choose an item first</span>
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
    <div className="relative mx-auto h-[148px] w-full max-w-4xl overflow-visible px-3 pb-0 pt-1 sm:h-[210px] lg:h-[176px] xl:h-[188px] 2xl:h-[200px]" data-testid="stat-check-hand">
      <div className="relative mx-auto h-full min-w-[320px] max-w-full">
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
          {flipped && <ChampionCard card={card} imageUrl={imageUrl} category={category} value={value} mode="board" state={state} label={opponentLabel} fill />}
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
  value,
  mode,
  state = "idle",
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
  value?: number;
  mode: "hand" | "board" | "face-down";
  state?: "idle" | "selected" | "assigned" | "winner" | "loser" | "decisive";
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
  const chips = card ? statChips(card) : [];
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
          <>
            <div className="mt-0.5 inline-flex rounded-full bg-[#d6b55d] px-2 py-0.5 text-sm font-black text-black">{relevant}</div>
            <div className="mt-1 flex flex-wrap gap-0.5 opacity-70">
              {chips.slice(0, 3).map((chip) => (
                <span key={chip.label} className="rounded bg-black/55 px-1 py-px text-[9px] font-semibold text-slate-300">
                  {chip.label} {chip.value}
                </span>
              ))}
            </div>
          </>
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
        aria-label={card ? handCardAccessibleLabel(card, selected) : undefined}
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

function handCardAccessibleLabel(card: StatCheckCard, selected?: boolean) {
  const stats = statChips(card).map((chip) => `${chip.label} ${chip.value}`).join(", ");
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
  nextCategories,
  showIntel = true,
  onNextRound,
  onRestart,
  online = null,
  opponentLabel = "Bot",
}: {
  match: MatchState;
  resolution: RoundResolution | null;
  revealStep: PresentationStep;
  nextCategories: StatCategory[];
  /** False while the item-choice overlay owns the (single) intel panel. */
  showIntel?: boolean;
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
      {showIntel && (
        <>
          <NextRoundIntel categories={nextCategories} compact />
          <div className="mt-2 h-px bg-cyan-300/10" />
        </>
      )}

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
  isOnline = false,
  opponentLabel = "Bot",
}: {
  displayHp: { player: number; bot: number };
  resolution: RoundResolution | null;
  flashKey: number;
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
  isOnline = false,
  opponentLabel = "Bot",
}: {
  match: MatchState;
  displayHp: { player: number; bot: number };
  resolution: RoundResolution | null;
  flashKey: number;
  isOnline?: boolean;
  opponentLabel?: string;
}) {
  const lastRound = match.roundHistory[match.roundHistory.length - 1] ?? null;
  return (
    <aside className="order-3 flex min-h-0 flex-col gap-2 min-[1210px]:order-none min-[1210px]:h-full min-[1210px]:overflow-y-auto">
      <ProfilePanel side="bot" isOnline={isOnline} />
      <HpBar
        side="bot"
        hp={displayHp.bot}
        previousHp={resolution?.botHpBefore}
        damage={resolution?.damage.player ?? 0}
        flashKey={flashKey}
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
      />
      <ProfilePanel side="player" isOnline={isOnline} />
      <LastRoundDamage resolution={lastRound} opponentLabel={opponentLabel} />
      <MatchHistoryPanel history={match.roundHistory} opponentLabel={opponentLabel} />
    </aside>
  );
}

function ProfilePanel({ side, isOnline = false }: { side: "player" | "bot"; isOnline?: boolean }) {
  // Cosmetic matchup dressing for the dev prototype (mock rank/record flavor);
  // online private matches show neutral seat identities instead.
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
          {isOnline ? "Private match" : bot ? "Platinum IV - 63% WR - 412 games" : "Diamond II - 57% WR - 892 games"}
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
}: {
  side: "player" | "bot";
  hp: number;
  previousHp?: number;
  damage: number;
  flashKey: number;
}) {
  const pct = Math.max(0, Math.min(100, (hp / STAT_CHECK_RULES.startingHp) * 100));
  const damaged = previousHp != null && damage > 0 && hp < previousHp;
  return (
    <div className="relative rounded-md border border-cyan-300/12 bg-black/28 px-3 py-1.5 shadow-xl">
      {damaged && (
        <div key={flashKey} className="pointer-events-none absolute right-3 top-0 -translate-y-3 animate-bounce rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white motion-reduce:animate-none">
          -{damage}
        </div>
      )}
      <div data-testid={`stat-check-${side}-hp`} className="text-sm font-black">
        {Math.max(0, hp)} / {STAT_CHECK_RULES.startingHp} HP
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-900">
        <div
          className={cn(
            "h-full transition-all duration-500 motion-reduce:transition-none",
            side === "bot" ? "bg-gradient-to-r from-red-600 to-red-400" : "bg-gradient-to-r from-cyan-500 to-cyan-300",
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

export function LaneResult({ result, opponentLabel = "Bot" }: { result: CategoryResult; opponentLabel?: string }) {
  const headline = result.winner === "player" ? "You win" : result.winner === "bot" ? `${opponentLabel} wins` : "Lane tied";
  const accent = result.winner === "player" ? "text-[#f4d77d]" : result.winner === "bot" ? "text-cyan-200" : "text-slate-200";
  const lineAccent = result.winner === "player" ? "via-[#f4d77d]/60" : result.winner === "bot" ? "via-cyan-300/50" : "via-slate-400/40";
  return (
    <div className="z-20 flex w-full items-center gap-2">
      <span aria-hidden className={cn("h-px flex-1 bg-gradient-to-r from-transparent to-white/30", lineAccent)} />
      <div
        className={cn(
          "relative max-w-full rounded-xl border p-[3px] shadow-[0_10px_26px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(214,181,93,0.22)] md:p-[5px]",
          "bg-[linear-gradient(180deg,rgba(52,42,18,0.55),rgba(6,10,16,0.85))]",
          result.decisive ? "border-[#f4d77d]/50 shadow-[0_0_30px_rgba(214,181,93,0.3)]" : "border-[#d6b55d]/30",
        )}
      >
        <span aria-hidden className="absolute -left-[7px] top-1/2 h-6 w-[7px] -translate-y-1/2 rounded-l-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        <span aria-hidden className="absolute -right-[7px] top-1/2 h-6 w-[7px] -translate-y-1/2 rounded-r-sm bg-[linear-gradient(180deg,#8a6f35,#4a3a1c)] shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(244,215,125,0.4)]" />
        <div
          className={cn(
            "flex min-w-0 max-w-full flex-col items-center gap-0.5 rounded-lg border bg-black/85 px-1 py-1 text-center shadow-[inset_0_1px_0_rgba(214,181,93,0.28)] md:min-w-[112px] md:px-3 md:py-2 min-[1210px]:px-4",
            result.decisive ? "border-[#f4d77d]/80" : "border-[#d6b55d]/45",
          )}
        >
        <div className={cn("text-[10px] font-black uppercase tracking-[0.04em] md:whitespace-nowrap md:text-lg md:tracking-[0.08em]", accent)}>{headline}</div>
        <div className="text-[10px] font-black text-white md:whitespace-nowrap md:text-base">
          {result.category.formatValue(result.playerValue)} vs {result.category.formatValue(result.botValue)}
        </div>
        {/* Item breakdown: natural + bonus → final, per side that used one. */}
        {result.playerItem && (
          <div data-testid="stat-check-result-item-player" className="flex flex-wrap items-center justify-center gap-1 text-[9px] font-black text-[#f4d77d] md:whitespace-nowrap md:text-[10px]">
            <ItemGlyph itemId={result.playerItem} className="h-3 w-3" />
            You: {result.category.formatValue(result.playerNaturalValue)} + {result.playerBonus} → {result.category.formatValue(result.playerValue)}
          </div>
        )}
        {result.botItem && (
          <div data-testid="stat-check-result-item-bot" className="flex flex-wrap items-center justify-center gap-1 text-[9px] font-black text-red-200 md:whitespace-nowrap md:text-[10px]">
            <ItemGlyph itemId={result.botItem} className="h-3 w-3" />
            {opponentLabel}: {result.category.formatValue(result.botNaturalValue)} + {result.botBonus} → {result.category.formatValue(result.botValue)}
          </div>
        )}
        {result.decisive && (
          <div className="rounded bg-[#d6b55d]/20 px-1.5 py-0 text-[10px] font-black uppercase tracking-[0.1em] text-[#f4d77d] md:px-2 md:py-0.5 md:text-xs">
            Decisive +1
          </div>
        )}
        <div className="hidden text-[10px] font-semibold text-slate-400 md:block">
          {(result.margin * 100).toFixed(1)}% margin - Decisive at {formatThreshold(result.category.decisiveThreshold)}
          {result.category.direction === "lower" ? " - Lower wins" : ""}
        </div>
        </div>
      </div>
      <span aria-hidden className={cn("h-px flex-1 bg-gradient-to-l from-transparent to-white/30", lineAccent)} />
    </div>
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

function formatThreshold(threshold: number) {
  const percent = threshold * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
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

function readStoredAnimationSpeed(): StatCheckAnimationSpeed {
  if (typeof window === "undefined") return 1;
  const stored = Number(window.sessionStorage.getItem(SPEED_STORAGE_KEY));
  return isStatCheckAnimationSpeed(stored) ? stored : 1;
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
