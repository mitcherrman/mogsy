import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Bot,
  ChevronsRight,
  Crosshair,
  Eye,
  Footprints,
  Gauge,
  Heart,
  RotateCcw,
  Shield,
  Sparkles,
  Sword,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChampionAssets, getChampionSplash, getChampionIcon } from "@/hooks/useChampionAssets";
import { useChampionBaseStats } from "@/hooks/useChampionBaseStats";
import { cn } from "@/lib/utils";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import { buildMatchSummary } from "./matchSummary";
import {
  STAT_CHECK_ANIMATION,
  STAT_CHECK_ANIMATION_SPEEDS,
  REVEAL_TIMELINE,
  animationDuration,
  isStatCheckAnimationSpeed,
  type StatCheckAnimationSpeed,
} from "./animationConfig";
import {
  activeResolvedLane,
  allowsPreLockInteraction,
  animationStepReducer,
  revealedOpponentCount,
  stepAfterLane,
  stepBeforeDamage,
  type PresentationStep,
} from "./animationState";
import { fanCardLayout, responsiveFanParameters } from "./fanLayout";
import {
  STAT_CHECK_RULES,
  assignCard,
  buildCardsFromBaseStats,
  createMatch,
  isReadyToLock,
  resolveCurrentRound,
  startNextRound,
  STAT_FAMILY_LABELS,
  type CategoryResult,
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
  from: DOMRectSnapshot;
  to: DOMRectSnapshot;
  fromRotation: number;
  toRotation: number;
  durationMs: number;
  pickupMs?: number;
  travelMs?: number;
  landingMs?: number;
  acceptanceMs?: number;
  kind: "place" | "return" | "lane-move" | "discard" | "deal";
};

type DOMRectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragSessionState = {
  card: StatCheckCard;
  imageUrl?: string | null;
  pointerId: number;
  status: "pending" | "dragging";
  startX: number;
  startY: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  sourceRect: DOMRectSnapshot;
  sourceRotation: number;
  tilt: DragTilt;
  hoverCategoryId: StatCategoryId | null;
};

type DragTilt = {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
};

type LaneReactionState = {
  categoryId: StatCategoryId;
  kind: "hover" | "accept" | "invalid";
};

const DRAG_THRESHOLD_PX = 7;
const SPEED_STORAGE_KEY = "stat-check-animation-speed";

export default function StatCheckPage() {
  const { data: statRows, isLoading, isError } = useChampionBaseStats();
  const { data: assets } = useChampionAssets();
  const deck = useMemo(() => {
    const apiDeck = buildCardsFromBaseStats(statRows);
    return apiDeck.length >= 24 ? apiDeck : STAT_CHECK_FIXTURE_DECK;
  }, [statRows]);
  const dataSource = buildCardsFromBaseStats(statRows).length >= 24 ? "League Docs stats" : "Fixture deck";
  const [matchKey, setMatchKey] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchState>(() => createMatch(STAT_CHECK_FIXTURE_DECK, `${SEED}:0`));
  const [revealStep, dispatchRevealStep] = useReducer(animationStepReducer, "selecting" as PresentationStep);
  const [travelingCards, setTravelingCards] = useState<TravelingCardState[]>([]);
  const [dragSession, setDragSession] = useState<DragSessionState | null>(null);
  const [laneReaction, setLaneReaction] = useState<LaneReactionState | null>(null);
  const [animationSpeed, setAnimationSpeed] = useSessionAnimationSpeed();
  const [damageFlashKey, setDamageFlashKey] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const timersRef = useRef<number[]>([]);
  const previousMotionSettingsRef = useRef({ animationSpeed, prefersReducedMotion });
  const dragSessionRef = useRef<DragSessionState | null>(null);
  const handCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const laneRefs = useRef<Record<string, HTMLElement | null>>({});
  const lanePlayerRefs = useRef<Record<string, HTMLElement | null>>({});
  const laneBotRefs = useRef<Record<string, HTMLElement | null>>({});
  const discardRefs = useRef<Record<"player" | "bot", HTMLElement | null>>({ player: null, bot: null });
  const hpRefs = useRef<Record<"player" | "bot", HTMLElement | null>>({ player: null, bot: null });
  const suppressNextClickCardIdRef = useRef<string | null>(null);
  const dragHoverCategoryIdRef = useRef<StatCategoryId | null>(null);

  const updateDragSession = useCallback((
    next: DragSessionState | null | ((current: DragSessionState | null) => DragSessionState | null),
  ) => {
    const nextSession = typeof next === "function" ? next(dragSessionRef.current) : next;
    dragSessionRef.current = nextSession;
    setDragSession(nextSession);
  }, []);

  useEffect(() => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    updateDragSession(null);
    setLaneReaction(null);
    dragHoverCategoryIdRef.current = null;
    setMatch(createMatch(deck, `${SEED}:${matchKey}`));
    setSelectedCardId(null);
    dispatchRevealStep({ type: "cancel" });
  }, [deck, matchKey, updateDragSession]);

  useEffect(() => () => clearAnimationTimers(timersRef.current), []);

  useEffect(() => {
    const previous = previousMotionSettingsRef.current;
    previousMotionSettingsRef.current = { animationSpeed, prefersReducedMotion };
    if (previous.animationSpeed === animationSpeed && previous.prefersReducedMotion === prefersReducedMotion) return;
    if (travelingCards.length === 0 && !dragSession) return;
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    updateDragSession(null);
    setLaneReaction(null);
    dispatchRevealStep({ type: "cancel" });
  }, [animationSpeed, dragSession, prefersReducedMotion, travelingCards.length, updateDragSession]);

  useEffect(() => {
    const cancelActiveInteraction = () => {
      updateDragSession(null);
      setLaneReaction(null);
      setTravelingCards([]);
      suppressNextClickCardIdRef.current = null;
    };
    window.addEventListener("blur", cancelActiveInteraction);
    return () => window.removeEventListener("blur", cancelActiveInteraction);
  }, [updateDragSession]);

  useEffect(() => {
    if (!dragSession) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      returnDraggedCardToHand(dragSession);
      updateDragSession(null);
      setLaneReaction(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // returnDraggedCardToHand is intentionally read from the active render so Escape mirrors pointer cancel behavior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragSession, updateDragSession]);

  useEffect(() => {
    if (revealStep !== "locking" || !match.lastResolution) return;
    clearAnimationTimers(timersRef.current);

    if (prefersReducedMotion) {
      dispatchRevealStep({ type: match.phase === "match-over" ? "match-over" : "resolved" });
      setDamageFlashKey((key) => key + 1);
      return;
    }

    const timeline: Array<[number, () => void]> = [
      [REVEAL_TIMELINE.opponentReveal1, () => dispatchRevealStep({ type: "opponent", lane: 1 })],
      [REVEAL_TIMELINE.opponentReveal2, () => dispatchRevealStep({ type: "opponent", lane: 2 })],
      [REVEAL_TIMELINE.opponentReveal3, () => dispatchRevealStep({ type: "opponent", lane: 3 })],
      [REVEAL_TIMELINE.resolveLane1, () => dispatchRevealStep({ type: "resolve", lane: 1 })],
      [REVEAL_TIMELINE.resolveLane2, () => dispatchRevealStep({ type: "resolve", lane: 2 })],
      [REVEAL_TIMELINE.resolveLane3, () => dispatchRevealStep({ type: "resolve", lane: 3 })],
      [REVEAL_TIMELINE.boardResult, () => dispatchRevealStep({ type: "board-result" })],
      [REVEAL_TIMELINE.damage, () => {
        dispatchRevealStep({ type: "damage" });
        setDamageFlashKey((key) => key + 1);
      }],
      [REVEAL_TIMELINE.resolved, () => dispatchRevealStep({ type: match.phase === "match-over" ? "match-over" : "resolved" })],
    ];
    timersRef.current = timeline.map(([delay, action]) => window.setTimeout(action, animationDuration(delay, prefersReducedMotion, animationSpeed)));
  }, [animationSpeed, match.lastResolution, match.phase, prefersReducedMotion, revealStep]);

  const selectedCard = match.playerHand.find((card) => card.id === selectedCardId) ?? null;
  const assignedCardIds = new Set(Object.values(match.assignments).filter(Boolean));
  const activelyDragging = dragSession?.status === "dragging";
  const canEdit = match.phase === "selecting" && allowsPreLockInteraction(revealStep) && !activelyDragging;
  const canStartDrag = match.phase === "selecting" && revealStep === "selecting" && !dragSession;
  const activeLaneIndex = activeResolvedLane(revealStep);
  const activeResolution = match.lastResolution?.round === match.round ? match.lastResolution : null;
  const displayHp = activeResolution && stepBeforeDamage(revealStep)
    ? { player: activeResolution.playerHpBefore, bot: activeResolution.botHpBefore }
    : { player: match.playerHp, bot: match.botHp };

  const restart = () => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    updateDragSession(null);
    setLaneReaction(null);
    setMatchKey((key) => key + 1);
  };

  const placeCard = (category: StatCategory) => {
    if (!canEdit) return;
    const current = match.assignments[category.id];
    if (selectedCardId) {
      const card = match.playerHand.find((item) => item.id === selectedCardId);
      const fromElement = handCardRefs.current[selectedCardId];
      const toElement = lanePlayerRefs.current[category.id];
      if (card) {
        queueCardTravel({
          card,
          imageUrl: getImage(assets, card),
          fromElement,
          toElement,
          fromRotation: readElementRotation(fromElement),
          toRotation: 0,
          kind: current ? "lane-move" : "place",
          targetCategoryId: category.id,
          ...placementDurations(),
        });
      }
      dispatchRevealStep({ type: "pickup" });
      setMatch((state) => assignCard(state, category.id, selectedCardId));
      setSelectedCardId(null);
    } else if (current) {
      const card = match.playerHand.find((item) => item.id === current);
      const fromElement = lanePlayerRefs.current[category.id];
      const toElement = handFallbackElement();
      if (card) {
        queueCardTravel({
          card,
          imageUrl: getImage(assets, card),
          fromElement,
          toElement,
          fromRotation: 0,
          toRotation: 0,
          kind: "return",
          durationMs: animationDuration(STAT_CHECK_ANIMATION.handReturnMs, prefersReducedMotion, animationSpeed),
        });
      }
      dispatchRevealStep({ type: "return" });
      setMatch((state) => assignCard(state, category.id, null));
    }
  };

  const lockIn = () => {
    if (!isReadyToLock(match) || !canEdit) return;
    setSelectedCardId(null);
    dispatchRevealStep({ type: "lock" });
    setMatch((state) => resolveCurrentRound(state));
  };

  const nextRound = () => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    updateDragSession(null);
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
    fromElement,
    toElement,
    fromRect,
    toRect,
    fromRotation,
    toRotation,
    kind,
    durationMs,
    pickupMs,
    travelMs,
    landingMs,
    acceptanceMs,
    targetCategoryId,
  }: {
    card: StatCheckCard;
    imageUrl?: string | null;
    fromElement?: Element | null;
    toElement?: Element | null;
    fromRect?: DOMRectSnapshot | null;
    toRect?: DOMRectSnapshot | null;
    fromRotation: number;
    toRotation: number;
    kind: TravelingCardState["kind"];
    durationMs: number;
    pickupMs?: number;
    travelMs?: number;
    landingMs?: number;
    acceptanceMs?: number;
    targetCategoryId?: StatCategoryId;
  }) => {
    const from = fromRect ?? snapshotElement(fromElement) ?? fallbackRect();
    const to = toRect ?? snapshotElement(toElement) ?? from;
    const id = `${kind}:${card.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    setTravelingCards((items) => [...items, { id, card, imageUrl, from, to, fromRotation, toRotation, durationMs, pickupMs, travelMs, landingMs, acceptanceMs, kind }]);
    if (pickupMs && travelMs && landingMs && acceptanceMs) {
      timersRef.current.push(
        window.setTimeout(() => dispatchRevealStep({ type: "travel" }), pickupMs),
        window.setTimeout(() => {
          if (targetCategoryId) setLaneReaction({ categoryId: targetCategoryId, kind: "accept" });
          dispatchRevealStep({ type: "land" });
        }, pickupMs + travelMs),
        window.setTimeout(() => dispatchRevealStep({ type: "accept" }), pickupMs + travelMs + landingMs),
        window.setTimeout(() => setLaneReaction(null), pickupMs + travelMs + landingMs + acceptanceMs),
      );
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
    for (const result of activeResolution.results) {
      queueCardTravel({
        card: result.playerCard,
        imageUrl: getImage(assets, result.playerCard),
        fromElement: lanePlayerRefs.current[result.category.id],
        toElement: discardRefs.current.player,
        fromRotation: 0,
        toRotation: -8,
        kind: "discard",
        durationMs: animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      });
      queueCardTravel({
        card: result.botCard,
        imageUrl: getImage(assets, result.botCard),
        fromElement: laneBotRefs.current[result.category.id],
        toElement: discardRefs.current.bot,
        fromRotation: 0,
        toRotation: 8,
        kind: "discard",
        durationMs: animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      });
    }
  };

  const placementDurations = () => {
    const pickupMs = animationDuration(STAT_CHECK_ANIMATION.pickupMs, prefersReducedMotion, animationSpeed);
    const travelMs = animationDuration(STAT_CHECK_ANIMATION.handTravelMs, prefersReducedMotion, animationSpeed);
    const landingMs = animationDuration(STAT_CHECK_ANIMATION.landingMs, prefersReducedMotion, animationSpeed);
    const acceptanceMs = animationDuration(STAT_CHECK_ANIMATION.acceptanceMs, prefersReducedMotion, animationSpeed);
    return { pickupMs, travelMs, landingMs, acceptanceMs, durationMs: pickupMs + travelMs + landingMs + acceptanceMs };
  };

  const beginCardPointer = (card: StatCheckCard, event: ReactPointerEvent<HTMLElement>) => {
    if (!canStartDrag || event.button > 0) return;
    const sourceElement = handCardRefs.current[card.id];
    const sourceRect = snapshotElement(sourceElement) ?? fallbackRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateDragSession({
      card,
      imageUrl: getImage(assets, card),
      pointerId: event.pointerId,
      status: "pending",
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      sourceRect,
      sourceRotation: readElementRotation(sourceElement),
      tilt: { rotateX: 0, rotateY: 0, rotateZ: 0 },
      hoverCategoryId: null,
    });
  };

  const moveCardPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const activeDragSession = dragSessionRef.current;
    if (!activeDragSession || activeDragSession.pointerId !== event.pointerId) return;
    const dx = event.clientX - activeDragSession.startX;
    const dy = event.clientY - activeDragSession.startY;
    const distance = Math.hypot(dx, dy);
    if (activeDragSession.status === "pending" && distance < DRAG_THRESHOLD_PX) return;
    event.preventDefault();
    const nextHover = categoryAtPoint(event.clientX, event.clientY) ?? nearestCategoryForBoardPoint(event.clientX, event.clientY);
    const tilt = dragTilt(event.clientX - activeDragSession.lastX, event.clientY - activeDragSession.lastY);
    setSelectedCardId(null);
    setLaneReaction(nextHover ? { categoryId: nextHover.id, kind: "hover" } : null);
    dragHoverCategoryIdRef.current = nextHover?.id ?? null;
    updateDragSession({
      ...activeDragSession,
      status: "dragging",
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      tilt,
      hoverCategoryId: nextHover?.id ?? null,
    });
  };

  const endCardPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const activeDragSession = dragSessionRef.current;
    if (!activeDragSession || activeDragSession.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (activeDragSession.status !== "dragging") {
      updateDragSession(null);
      setLaneReaction(null);
      return;
    }
    event.preventDefault();
    suppressNextClickCardIdRef.current = activeDragSession.card.id;
    const releaseInBoard = event.clientY <= viewportHeight() * 0.68;
    const hoveredCategory = match.currentCategories.find((category) => category.id === dragHoverCategoryIdRef.current || category.id === activeDragSession.hoverCategoryId);
    const dropCategory = releaseInBoard
      ? categoryAtPoint(event.clientX, event.clientY) ?? nearestCategoryForBoardPoint(event.clientX, event.clientY) ?? hoveredCategory ?? null
      : null;
    if (dropCategory) {
      const toRect = snapshotElement(lanePlayerRefs.current[dropCategory.id]) ?? snapshotElement(laneRefs.current[dropCategory.id]) ?? fallbackRect();
      dispatchRevealStep({ type: "pickup" });
      queueCardTravel({
        card: activeDragSession.card,
        imageUrl: activeDragSession.imageUrl,
        fromRect: dragRect(activeDragSession),
        toRect,
        fromRotation: activeDragSession.tilt.rotateZ,
        toRotation: 0,
        kind: "place",
        targetCategoryId: dropCategory.id,
        ...placementDurations(),
      });
      setMatch((state) => assignCard(state, dropCategory.id, activeDragSession.card.id));
      setSelectedCardId(null);
    } else {
      returnDraggedCardToHand(activeDragSession);
    }
    updateDragSession(null);
    setLaneReaction(null);
    dragHoverCategoryIdRef.current = null;
  };

  const cancelCardPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const activeDragSession = dragSessionRef.current;
    if (!activeDragSession || activeDragSession.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (activeDragSession.status === "dragging") returnDraggedCardToHand(activeDragSession);
    updateDragSession(null);
    setLaneReaction(null);
    dragHoverCategoryIdRef.current = null;
  };

  const returnDraggedCardToHand = (session: DragSessionState) => {
    queueCardTravel({
      card: session.card,
      imageUrl: session.imageUrl,
      fromRect: dragRect(session),
      toElement: handCardRefs.current[session.card.id],
      toRect: snapshotElement(handCardRefs.current[session.card.id]) ?? session.sourceRect,
      fromRotation: session.tilt.rotateZ,
      toRotation: session.sourceRotation,
      kind: "return",
      durationMs: animationDuration(STAT_CHECK_ANIMATION.handReturnMs, prefersReducedMotion, animationSpeed),
    });
    dispatchRevealStep({ type: "return" });
  };

  const categoryAtPoint = (x: number, y: number) => {
    if (!canStartDrag && !dragSessionRef.current) return null;
    return match.currentCategories.find((category) => {
      const rect = laneRefs.current[category.id]?.getBoundingClientRect();
      return rect ? x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom : false;
    }) ?? null;
  };

  const nearestCategoryForBoardPoint = (x: number, y: number) => {
    if (y > viewportHeight() * 0.68) return null;
    let nearest: { category: StatCategory; distance: number } | null = null;
    for (const category of match.currentCategories) {
      const rect = laneRefs.current[category.id]?.getBoundingClientRect();
      if (!rect) continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(x - centerX, y - centerY);
      if (!nearest || distance < nearest.distance) nearest = { category, distance };
    }
    return nearest?.category ?? null;
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b12] text-slate-100 lg:h-[calc(100svh-56px)] lg:min-h-[640px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(25,187,211,0.2),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,168,76,0.16),transparent_34%),linear-gradient(180deg,#091421_0%,#071018_45%,#04070b_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[8%] mx-auto h-[74%] max-w-6xl rounded-[42%] bg-[radial-gradient(ellipse_at_center,rgba(8,22,35,0.92),rgba(4,8,13,0.35)_68%,transparent_72%)] shadow-[0_0_90px_rgba(0,0,0,0.7)_inset]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1920px] flex-col gap-2 px-3 py-2 sm:px-4 lg:h-full lg:min-h-0">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#d6b55d]">
              <Swords className="h-4 w-4" /> Dev prototype
            </div>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">Stat Check</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              {dataSource}
            </Badge>
            <AnimationSpeedControl speed={animationSpeed} onSpeedChange={setAnimationSpeed} />
            {isLoading && <Badge variant="outline">Loading stats</Badge>}
            {isError && <Badge variant="outline">Fallback active</Badge>}
            <Button size="sm" variant="outline" onClick={restart} className="border-[#d6b55d]/40 bg-black/30 text-[#f4d77d]">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Restart
            </Button>
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-2 lg:grid lg:min-h-0 lg:grid-cols-[172px_minmax(0,1fr)_260px] xl:grid-cols-[188px_minmax(0,1fr)_280px]">
          <MatchUtilityRail
            match={match}
            assets={assets}
            botDiscardRef={(element) => { discardRefs.current.bot = element; }}
            playerDiscardRef={(element) => { discardRefs.current.player = element; }}
          />

          <section className="order-1 grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-2 lg:order-none">
            <HpDisplay
              side="bot"
              hp={displayHp.bot}
              previousHp={activeResolution?.botHpBefore}
              damage={activeResolution?.damage.player ?? 0}
              flashKey={damageFlashKey}
              elementRef={(element) => { hpRefs.current.bot = element; }}
            />

            <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 rounded-full border border-cyan-300/15 bg-black/25 px-3 py-1.5 shadow-xl">
              <p className="text-sm font-semibold text-cyan-100">Choose a champion, then place it in a lane.</p>
              <Button
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
            </div>

            <div className="grid min-h-0 grid-flow-col auto-cols-[minmax(214px,74vw)] gap-2 overflow-x-auto pb-2 md:grid-flow-row md:grid-cols-3 md:overflow-visible md:pb-0">
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
                    laneRef={(element) => { laneRefs.current[category.id] = element; }}
                    playerRef={(element) => { lanePlayerRefs.current[category.id] = element; }}
                    botRef={(element) => { laneBotRefs.current[category.id] = element; }}
                    onPlace={() => placeCard(category)}
                  />
                );
              })}
            </div>

            <PlayerHand
              cards={match.playerHand}
              assets={assets}
              selectedCardId={selectedCardId}
              assignedCardIds={assignedCardIds}
              disabled={!canEdit}
              canDrag={canStartDrag}
              reducedMotion={prefersReducedMotion}
              draggingCardId={dragSession?.status === "dragging" ? dragSession.card.id : null}
              cardRefs={handCardRefs}
              onSelect={(cardId) => {
                if (suppressNextClickCardIdRef.current === cardId) {
                  suppressNextClickCardIdRef.current = null;
                  return;
                }
                setSelectedCardId((current) => (current === cardId ? null : cardId));
              }}
              onPointerDown={beginCardPointer}
              onPointerMove={moveCardPointer}
              onPointerUp={endCardPointer}
              onPointerCancel={cancelCardPointer}
            />

            <HpDisplay
              side="player"
              hp={displayHp.player}
              previousHp={activeResolution?.playerHpBefore}
              damage={activeResolution?.damage.bot ?? 0}
              flashKey={damageFlashKey}
              elementRef={(element) => { hpRefs.current.player = element; }}
            />
          </section>

          <RevealSequence
            match={match}
            resolution={activeResolution}
            revealStep={revealStep}
            nextCategories={match.nextCategories}
            onNextRound={nextRound}
            onRestart={restart}
          />
        </section>
      </div>
      <CardMotionOverlay travelingCards={travelingCards} dragSession={dragSession} assets={assets} reducedMotion={prefersReducedMotion} />
    </main>
  );
}

function ArenaLane({
  category,
  index,
  selectedCard,
  playerCard,
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
  laneRef,
  playerRef,
  botRef,
  onPlace,
}: {
  category: StatCategory;
  index: number;
  selectedCard: StatCheckCard | null;
  playerCard: StatCheckCard | null;
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

  return (
    <div
      data-testid={`stat-check-lane-${category.id}`}
      ref={laneRef}
      role="button"
      tabIndex={canEdit ? 0 : -1}
      onClick={onPlace}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlace();
        }
      }}
      className={cn(
        "group relative flex min-h-[278px] flex-col overflow-hidden rounded-md bg-[linear-gradient(180deg,rgba(12,28,43,0.82),rgba(5,9,14,0.9))] p-2 shadow-[0_22px_55px_rgba(0,0,0,0.42)] outline-none transition md:min-h-0 md:p-2.5",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-md before:border before:border-cyan-300/14 before:content-['']",
        canEdit && selectedCard && "ring-2 ring-[#d6b55d]/55",
        active && "ring-2 ring-cyan-300/65",
        reaction === "hover" && "ring-2 ring-cyan-200/75 before:border-cyan-200/60 before:bg-cyan-200/5",
        reaction === "accept" && "scale-[1.01] ring-2 ring-[#f4d77d]/85 before:border-[#f4d77d]/75 before:bg-[#d6b55d]/10",
        reaction === "invalid" && "ring-2 ring-red-400/60 before:border-red-300/60",
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CategoryIcon category={category} />
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{compactCategoryLabel(category)}</div>
            <div className="truncate text-[11px] text-slate-400">
              {scopeLabel(category)} - Decisive {formatThreshold(category.decisiveThreshold)}
            </div>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-[#d6b55d]/30 bg-[#d6b55d]/10 px-2 py-1 text-[10px] font-black uppercase text-[#f4d77d]">
          {category.direction === "higher" ? "High" : "Low"}
        </div>
      </div>

      <div className="relative mt-2 grid flex-1 grid-rows-[minmax(78px,1fr)_auto_minmax(78px,1fr)] gap-1.5">
        <div ref={botRef}>
          <FlippableCard
            card={botCard}
            imageUrl={getImage(assets, botCard)}
            category={category}
            value={resolution?.botValue}
            flipped={!botHidden}
            reducedMotion={reducedMotion}
            animationSpeed={animationSpeed}
            state={botState}
          />
        </div>
        <div className="flex min-h-[42px] items-center justify-center md:min-h-[50px]">
          {showResult && resolution ? (
            <LaneResult result={resolution} />
          ) : (
            <div className="rounded-full border border-cyan-300/20 bg-black/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100">
              Lane {index + 1}
            </div>
          )}
        </div>
        <div ref={playerRef}>
          <ChampionCard
            card={playerCard}
            imageUrl={getImage(assets, playerCard)}
            category={category}
            value={resolution?.playerValue}
            mode={playerCard ? "lane" : "empty"}
            state={playerState}
            label="You"
          />
        </div>
      </div>

    </div>
  );
}

function PlayerHand({
  cards,
  assets,
  selectedCardId,
  assignedCardIds,
  disabled,
  canDrag,
  reducedMotion,
  draggingCardId,
  cardRefs,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  cards: StatCheckCard[];
  assets: ReturnType<typeof useChampionAssets>["data"];
  selectedCardId: string | null;
  assignedCardIds: Set<string>;
  disabled: boolean;
  canDrag: boolean;
  reducedMotion: boolean;
  draggingCardId: string | null;
  cardRefs: RefObject<Record<string, HTMLElement | null>>;
  onSelect: (cardId: string) => void;
  onPointerDown: (card: StatCheckCard, event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const viewportWidth = useViewportWidth();
  const activeCards = cards.filter((card) => !assignedCardIds.has(card.id));
  const parameters = responsiveFanParameters(activeCards.length, viewportWidth);

  return (
    <div className="relative mx-auto h-[190px] w-full max-w-5xl overflow-visible px-3 pb-0 pt-1 sm:h-[210px] lg:h-[176px] xl:h-[190px] 2xl:h-[210px]" data-testid="stat-check-hand">
      <div className="relative mx-auto h-full min-w-[320px] max-w-full">
        {activeCards.map((card, index) => {
          const selected = selectedCardId === card.id;
          const dragging = draggingCardId === card.id;
          const layout = fanCardLayout(index, activeCards.length, parameters, selected);
          const style = {
            transform: `translate(-50%, 0) translate(${layout.x}px, ${layout.y}px) rotate(${layout.rotation}deg)`,
            zIndex: layout.zIndex,
          } as CSSProperties;
          return (
            <div
              key={card.id}
              className={cn(
                "absolute left-1/2 top-0 origin-bottom will-change-transform",
                reducedMotion ? "transition-none" : "transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none",
                canDrag && "cursor-grab active:cursor-grabbing [touch-action:pan-y]",
                dragging && "opacity-40",
              )}
              data-fan-index={index}
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
                disabled={disabled}
                onClick={() => onSelect(card.id)}
                onPointerDown={(event) => onPointerDown(card, event)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                testId={`stat-check-hand-${index}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchUtilityRail({
  match,
  assets,
  botDiscardRef,
  playerDiscardRef,
}: {
  match: MatchState;
  assets: ReturnType<typeof useChampionAssets>["data"];
  botDiscardRef: (element: HTMLElement | null) => void;
  playerDiscardRef: (element: HTMLElement | null) => void;
}) {
  return (
    <aside className="order-3 grid gap-2 rounded-md border border-cyan-300/12 bg-black/20 p-2 shadow-2xl lg:order-none lg:h-full lg:min-h-0 lg:content-start lg:overflow-y-auto">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <CountPill label="Shared pool" value={match.drawPile.length} />
        <CountPill label="Your hand" value={match.playerHand.length} />
        <CountPill label="Bot hand" value={match.botHand.length} />
      </div>
      <DiscardPile side="bot" cards={match.botDiscard} assets={assets} elementRef={botDiscardRef} />
      <DiscardPile side="player" cards={match.playerDiscard} assets={assets} elementRef={playerDiscardRef} />
    </aside>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-cyan-300/12 bg-black/28 px-2 py-1.5">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="text-lg font-black text-cyan-100">{value}</div>
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
  dragSession,
  assets,
  reducedMotion,
}: {
  travelingCards: TravelingCardState[];
  dragSession: DragSessionState | null;
  assets: ReturnType<typeof useChampionAssets>["data"];
  reducedMotion: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-testid="stat-check-motion-overlay" className="pointer-events-none fixed inset-0 z-[9999]">
      {travelingCards.map((item) => (
        <TravelingCard key={item.id} item={item} assets={assets} reducedMotion={reducedMotion} />
      ))}
      {dragSession?.status === "dragging" && (
        <DraggedCard session={dragSession} assets={assets} reducedMotion={reducedMotion} />
      )}
    </div>,
    document.body,
  );
}

function TravelingCard({
  item,
  assets,
  reducedMotion,
}: {
  item: TravelingCardState;
  assets: ReturnType<typeof useChampionAssets>["data"];
  reducedMotion: boolean;
}) {
  const midX = (item.from.x + item.to.x) / 2;
  const midY = (item.from.y + item.to.y) / 2 - STAT_CHECK_ANIMATION.arcLift;
  const duration = animationDuration(item.durationMs, reducedMotion) / 1000;
  const pickupRatio = item.pickupMs ? item.pickupMs / item.durationMs : 0;
  const travelRatio = item.pickupMs && item.travelMs ? (item.pickupMs + item.travelMs) / item.durationMs : 0.78;
  const landingRatio = item.pickupMs && item.travelMs && item.landingMs ? (item.pickupMs + item.travelMs + item.landingMs) / item.durationMs : 0.9;
  return (
    <motion.div
      data-testid={`stat-check-travel-card-${item.card.id}`}
      className="fixed left-0 top-0 origin-top-left"
      initial={{
        x: item.from.x,
        y: item.from.y,
        width: item.from.width,
        height: item.from.height,
        rotate: item.fromRotation,
        opacity: 0.96,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
      }}
      animate={{
        x: reducedMotion ? item.to.x : [item.from.x, item.from.x, midX, item.to.x, item.to.x],
        y: reducedMotion ? item.to.y : [item.from.y, item.from.y - 24, midY, item.to.y + 5, item.to.y],
        width: item.to.width,
        height: item.to.height,
        rotate: reducedMotion ? item.toRotation : [item.fromRotation, item.fromRotation, item.toRotation * 0.35, item.toRotation, item.toRotation],
        rotateX: reducedMotion ? 0 : [0, 0, 5, -2, 0],
        rotateY: reducedMotion ? 0 : [0, 0, -6, 1, 0],
        opacity: [0.96, 1, 1, 0.98],
        scale: item.kind === "discard" ? 0.45 : reducedMotion ? 1 : [1, 1.07, 1.03, 0.98, 1],
      }}
      transition={{ duration, ease: STAT_CHECK_ANIMATION.easing, times: [0, pickupRatio, travelRatio, landingRatio, 1] }}
    >
      <div className="h-full w-full overflow-hidden rounded-md shadow-[0_20px_48px_rgba(0,0,0,0.5)]">
        <ChampionCard
          card={item.card}
          imageUrl={item.imageUrl ?? getImage(assets, item.card)}
          mode="lane"
          state="idle"
        />
      </div>
    </motion.div>
  );
}

function DraggedCard({
  session,
  assets,
  reducedMotion,
}: {
  session: DragSessionState;
  assets: ReturnType<typeof useChampionAssets>["data"];
  reducedMotion: boolean;
}) {
  const x = session.x - session.sourceRect.width / 2;
  const y = session.y - session.sourceRect.height / 2;
  return (
    <motion.div
      data-testid={`stat-check-drag-card-${session.card.id}`}
      className="fixed left-0 top-0 origin-center cursor-grabbing"
      animate={{
        x,
        y,
        width: session.sourceRect.width,
        height: session.sourceRect.height,
        scale: reducedMotion ? 1 : 1.08,
        rotateX: reducedMotion ? 0 : session.tilt.rotateX,
        rotateY: reducedMotion ? 0 : session.tilt.rotateY,
        rotateZ: reducedMotion ? 0 : session.tilt.rotateZ,
      }}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 720, damping: 42, mass: 0.7 }}
    >
      <div className="h-full w-full overflow-hidden rounded-md shadow-[0_30px_70px_rgba(0,0,0,0.65)]">
        <ChampionCard card={session.card} imageUrl={session.imageUrl ?? getImage(assets, session.card)} mode="lane" state="selected" />
      </div>
    </motion.div>
  );
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
}: {
  card: StatCheckCard | null;
  imageUrl?: string | null;
  category: StatCategory;
  value?: number;
  flipped: boolean;
  reducedMotion: boolean;
  animationSpeed: StatCheckAnimationSpeed;
  state: "idle" | "winner" | "loser" | "decisive";
}) {
  if (reducedMotion) {
    return (
      <ChampionCard
        card={card}
        imageUrl={imageUrl}
        category={category}
        value={value}
        mode={flipped ? "lane" : "face-down"}
        state={state}
        label={flipped ? "Bot" : undefined}
      />
    );
  }

  return (
    <div className="relative min-h-[88px] w-full md:min-h-[96px]" style={{ perspective: "900px" }}>
      <motion.div
        className="relative min-h-[88px] w-full md:min-h-[96px]"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0, y: flipped ? -2 : 0 }}
        transition={{ duration: animationDuration(STAT_CHECK_ANIMATION.opponentFlipMs, false, animationSpeed) / 1000, ease: STAT_CHECK_ANIMATION.easing }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <ChampionCard card={null} mode="face-down" />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <ChampionCard card={card} imageUrl={imageUrl} category={category} value={value} mode="lane" state={state} label="Bot" />
        </div>
      </motion.div>
    </div>
  );
}

function ChampionCard({
  card,
  imageUrl,
  category,
  value,
  mode,
  state = "idle",
  label,
  disabled,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  testId,
}: {
  card: StatCheckCard | null;
  imageUrl?: string | null;
  category?: StatCategory;
  value?: number;
  mode: "hand" | "lane" | "face-down" | "empty";
  state?: "idle" | "selected" | "assigned" | "winner" | "loser" | "decisive";
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void;
  testId?: string;
}) {
  if (mode === "empty") {
    return (
      <div className="flex min-h-[88px] items-center justify-center rounded-md border border-dashed border-cyan-300/20 bg-black/25 px-3 text-center text-xs font-semibold text-slate-400 md:min-h-[96px]">
        Place champion
      </div>
    );
  }

  if (mode === "face-down") {
    return (
      <div className="relative min-h-[88px] overflow-hidden rounded-md border border-cyan-300/20 bg-[linear-gradient(135deg,#0b2032,#071018_45%,#1c1730)] shadow-xl md:min-h-[96px]">
        <div className="absolute inset-2 rounded border border-[#d6b55d]/30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.25),transparent_32%)]" />
        <div className="relative flex h-full min-h-[88px] flex-col items-center justify-center gap-2 text-cyan-100 md:min-h-[96px]">
          <Eye className="h-7 w-7 animate-pulse motion-reduce:animate-none" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]">Concealed</span>
        </div>
      </div>
    );
  }

  const relevant = card && category ? category.formatValue(value ?? category.getValue(card)) : null;
  const chips = card ? statChips(card) : [];
  const cardClassName = cn(
    "relative block overflow-hidden rounded-md border bg-[#071526] text-left shadow-2xl outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none",
    mode === "hand" && "h-40 w-28 shrink-0 origin-bottom hover:-translate-y-2 sm:h-44 sm:w-32 lg:h-[148px] lg:w-[108px] xl:h-40 xl:w-28 2xl:h-44 2xl:w-32",
    mode === "lane" && "min-h-[88px] w-full md:min-h-[96px]",
    state === "selected" && "border-[#f4d77d] ring-2 ring-[#f4d77d]/45",
    state === "assigned" && "opacity-50 saturate-75",
    state === "winner" && "border-[#d6b55d] shadow-[0_0_24px_rgba(214,181,93,0.3)]",
    state === "decisive" && "border-[#f4d77d] shadow-[0_0_36px_rgba(214,181,93,0.45)]",
    state === "loser" && "opacity-55 grayscale",
    disabled && "cursor-not-allowed",
  );

  const content = (
    <>
      {card && <ChampionArt card={card} imageUrl={imageUrl} />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-2">
        {label && <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/80">{label}</div>}
        <div className="truncate text-sm font-black text-white">{card?.name}</div>
        {relevant ? (
          <div className="mt-1 inline-flex rounded-full bg-[#d6b55d] px-2 py-0.5 text-xs font-black text-black">{relevant}</div>
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
        type="button"
        disabled={disabled}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={cardClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <div data-testid={testId} className={cardClassName}>
      {content}
    </div>
  );
}

function RevealSequence({
  match,
  resolution,
  revealStep,
  nextCategories,
  onNextRound,
  onRestart,
}: {
  match: MatchState;
  resolution: RoundResolution | null;
  revealStep: PresentationStep;
  nextCategories: StatCategory[];
  onNextRound: () => void;
  onRestart: () => void;
}) {
  return (
    <aside className="order-2 relative min-h-0 overflow-hidden rounded-md border border-cyan-300/15 bg-black/28 p-2.5 shadow-2xl lg:order-none lg:h-full lg:overflow-y-auto">
      <NextRoundIntel categories={nextCategories} compact />

      <div className="mt-2 h-px bg-cyan-300/10" />

      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">Round {match.round}</div>
          <div className="text-base font-black">Resolution</div>
        </div>
        <Badge variant="outline" className="border-[#d6b55d]/35 bg-[#d6b55d]/10 text-[#f4d77d]">
          {phaseLabel(revealStep)}
        </Badge>
      </div>

      {!resolution ? (
        <div className="mt-2 space-y-2">
          <div className="rounded-md bg-black/30 p-2 text-xs text-slate-300">
            Bot cards stay face-down until lock-in.
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
          <BoardResult resolution={resolution} />
          <DamageBreakdown title="You deal" amount={resolution.damage.player} side="player" damage={resolution.damage} />
          <DamageBreakdown title="Bot deals" amount={resolution.damage.bot} side="bot" damage={resolution.damage} />
          {(revealStep === "resolved" || revealStep === "match-over") && (
            <div className="space-y-2 pt-2">
              {match.phase === "resolved" && (
                <Button data-testid="stat-check-next-round" onClick={onNextRound} className="w-full bg-cyan-300 text-[#06111f] hover:bg-cyan-200">
                  Next Round <ChevronsRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
              {match.phase === "match-over" && (
                <div data-testid="stat-check-match-over" className="rounded-md border border-[#d6b55d]/35 bg-[#d6b55d]/10 p-3">
                  <div className="text-xl font-black">{match.outcome === "draw" ? "Match Draw" : match.outcome === "player" ? "Victory" : "Defeat"}</div>
                  <div className="text-xs text-slate-300">{match.endReason}</div>
                  <MatchSummaryPanel match={match} />
                  <Button onClick={onRestart} className="mt-3 w-full bg-[#d6b55d] text-[#071018] hover:bg-[#f4d77d]">
                    Restart
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
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

function HpDisplay({
  side,
  hp,
  previousHp,
  damage,
  flashKey,
  elementRef,
}: {
  side: "player" | "bot";
  hp: number;
  previousHp?: number;
  damage: number;
  flashKey: number;
  elementRef?: (element: HTMLElement | null) => void;
}) {
  const pct = Math.max(0, Math.min(100, (hp / STAT_CHECK_RULES.startingHp) * 100));
  const damaged = previousHp != null && damage > 0 && hp < previousHp;
  return (
    <div ref={elementRef} className="relative mx-auto w-full max-w-4xl rounded-md border border-cyan-300/15 bg-black/32 px-3 py-1.5 shadow-xl">
      {damaged && (
        <div key={flashKey} className="pointer-events-none absolute right-4 top-0 -translate-y-3 animate-bounce rounded-full bg-red-500 px-2 py-1 text-xs font-black text-white motion-reduce:animate-none">
          -{damage}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {side === "bot" ? <Bot className="h-4 w-4 text-cyan-200" /> : <Trophy className="h-4 w-4 text-[#f4d77d]" />}
          <div className="text-sm font-black">{side === "player" ? "You" : "Deterministic Bot"}</div>
        </div>
        <div data-testid={`stat-check-${side}-hp`} className="text-sm font-black">
          {Math.max(0, hp)} / {STAT_CHECK_RULES.startingHp} HP
        </div>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-900">
        <div className="h-full bg-gradient-to-r from-red-500 via-[#d6b55d] to-cyan-300 transition-all duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NextRoundIntel({ categories, compact = false }: { categories: StatCategory[]; compact?: boolean }) {
  const [visible, ...hidden] = categories;
  return (
    <div className={cn("rounded-md border border-[#d6b55d]/25 bg-black/28 shadow-xl", compact ? "p-2" : "p-3")}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4d77d]">Next Round Intel</div>
      <div data-testid="stat-check-next-intel" className="mt-2 rounded-md border border-[#d6b55d]/30 bg-[#d6b55d]/10 p-2">
        <div className="flex items-center gap-2">
          <CategoryIcon category={visible} />
          <div className="min-w-0">
            <div data-testid="stat-check-next-intel-label" className="truncate text-sm font-black">{statFamilyLabel(visible)}</div>
            <div className="text-[11px] text-slate-300">One upcoming stat family</div>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {hidden.map((category) => (
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
  elementRef,
}: {
  side: "player" | "bot";
  cards: StatCheckCard[];
  assets: ReturnType<typeof useChampionAssets>["data"];
  elementRef?: (element: HTMLElement | null) => void;
}) {
  return (
    <details ref={elementRef} className="rounded-md border border-cyan-300/12 bg-black/25 p-2 shadow-xl" data-testid={`stat-check-${side}-discard`}>
      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-cyan-100">
        {side === "player" ? "Your" : "Bot"} discard - {cards.length}
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

function LaneResult({ result }: { result: CategoryResult }) {
  const winnerCard = result.winner === "player" ? result.playerCard : result.winner === "bot" ? result.botCard : null;
  return (
    <div className="z-20 w-full rounded-md border border-[#d6b55d]/45 bg-black/82 px-3 py-2 text-center shadow-2xl">
      <div className="truncate text-base font-black text-white">
        {winnerCard ? `${winnerCard.name} wins` : "Lane tied"}
      </div>
      <div className="mt-0.5 text-sm font-black text-[#f4d77d]">
        {result.category.formatValue(result.playerValue)} vs {result.category.formatValue(result.botValue)}
      </div>
      <div className="text-xs font-semibold text-cyan-100">{(result.margin * 100).toFixed(1)}% margin</div>
      <div className="text-[11px] font-semibold text-slate-300">Decisive at {formatThreshold(result.category.decisiveThreshold)}</div>
      {result.decisive && <div className="mt-1 text-xs font-black uppercase text-[#f4d77d]">Decisive +1</div>}
    </div>
  );
}

function BoardResult({ resolution }: { resolution: RoundResolution }) {
  const label =
    resolution.damage.boardWinner === "tie"
      ? "Board tied"
      : resolution.damage.boardWinner === "player"
        ? resolution.damage.playerCategoryWins === 3
          ? "Player won board - Sweep"
          : "Player won board"
        : resolution.damage.botCategoryWins === 3
          ? "Bot won board - Sweep"
          : "Bot won board";
  const matchEnding =
    resolution.outcome === "draw"
      ? "Simultaneous knockout - Match draw"
      : resolution.outcome === "player"
        ? "Bot knocked out"
        : resolution.outcome === "bot"
          ? "Player knocked out"
          : null;
  return (
    <div data-testid="stat-check-board-result" className="rounded-md border border-white/10 bg-black/35 p-3">
      <div className="text-sm font-black">{label}</div>
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
    <div data-testid={`stat-check-damage-${side}`} className="rounded-md bg-black/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black">{title}</span>
        <span className="text-lg font-black text-[#f4d77d]">{amount}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-slate-300">
        {lines.map((line) => <div key={line}>{line}</div>)}
        <div className="font-black text-white">Total: {amount}</div>
      </div>
    </div>
  );
}

function CategoryIcon({ category }: { category: StatCategory }) {
  const className = "h-4 w-4";
  const icon = (() => {
    if (category.id.includes("hp")) return <Heart className={className} />;
    if (category.id.includes("ad")) return <Sword className={className} />;
    if (category.id.includes("armor")) return <Shield className={className} />;
    if (category.id.includes("mr")) return <Sparkles className={className} />;
    if (category.id.includes("move")) return <Footprints className={className} />;
    if (category.id.includes("range")) return <Crosshair className={className} />;
    return <Gauge className={className} />;
  })();
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#d6b55d]/35 bg-[#d6b55d]/10 text-[#f4d77d]">
      {icon}
    </span>
  );
}

function ChampionArt({ card, imageUrl }: { card: StatCheckCard; imageUrl?: string | null }) {
  if (imageUrl) return <img src={imageUrl} alt={card.name} className="h-full w-full object-cover" loading="lazy" />;
  return (
    <div className="flex h-full min-h-[128px] w-full items-center justify-center bg-gradient-to-br from-cyan-950 via-slate-900 to-amber-950 text-xl font-black text-[#f4d77d]">
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
    { label: "RNG", value: Math.round(card.stats.attackRange) },
  ];
}

function compactCategoryLabel(category: StatCategory) {
  const label = category.label
    .replace("level-1 ", "")
    .replace("level-18 ", "")
    .replace("base ", "")
    .replace("attack damage", "Attack Damage")
    .replace("magic resistance", "Magic Resist")
    .replace("movement speed", "Move Speed")
    .replace("attack range", "Range")
    .replace("attack speed", "Attack Speed");
  return label.charAt(0).toUpperCase() + label.slice(1);
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

function phaseLabel(step: PresentationStep) {
  return step
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clearAnimationTimers(timers: number[]) {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.length = 0;
}

function snapshotElement(element?: Element | null): DOMRectSnapshot | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
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

function dragRect(session: DragSessionState): DOMRectSnapshot {
  return {
    x: session.x - session.sourceRect.width / 2,
    y: session.y - session.sourceRect.height / 2,
    width: session.sourceRect.width,
    height: session.sourceRect.height,
  };
}

function dragTilt(deltaX: number, deltaY: number): DragTilt {
  return {
    rotateX: clamp(deltaY * -0.18, -5, 5),
    rotateY: clamp(deltaX * 0.26, -8, 8),
    rotateZ: clamp(deltaX * 0.2, -6, 6),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function viewportHeight() {
  return typeof window === "undefined" || window.innerHeight <= 0 ? 768 : window.innerHeight;
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
    return () => window.removeEventListener("resize", onResize);
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
