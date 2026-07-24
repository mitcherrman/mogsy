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

  useEffect(() => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    setMatch(createMatch(deck, `${SEED}:${matchKey}`));
    setSelectedCardId(null);
    dispatchRevealStep({ type: "cancel" });
  }, [deck, matchKey]);

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
    if (!selectedCardId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelectedCardId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCardId]);

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
  // Cards currently flying toward a lane: the real board card stays hidden under a
  // receiving slot until the clone lands exactly on top of it.
  const inFlightToLaneIds = new Set(
    travelingCards.filter((item) => item.kind === "place" || item.kind === "lane-move").map((item) => item.card.id),
  );
  const returningIds = new Set(travelingCards.filter((item) => item.kind === "return").map((item) => item.card.id));
  const departingIds = new Set(handGapIds);
  const canEdit = match.phase === "selecting" && allowsPreLockInteraction(revealStep);
  const activeLaneIndex = activeResolvedLane(revealStep);
  const activeResolution = match.lastResolution?.round === match.round ? match.lastResolution : null;
  const displayHp = activeResolution && stepBeforeDamage(revealStep)
    ? { player: activeResolution.playerHpBefore, bot: activeResolution.botHpBefore }
    : { player: match.playerHp, bot: match.botHp };

  const restart = () => {
    clearAnimationTimers(timersRef.current);
    setTravelingCards([]);
    setHandGapIds([]);
    setLaneReaction(null);
    setMatchKey((key) => key + 1);
  };

  const placeCard = (category: StatCategory) => {
    if (!canEdit) return;
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
    dispatchRevealStep({ type: "lock" });
    setMatch((state) => resolveCurrentRound(state));
  };

  const nextRound = () => {
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
    setTravelingCards((items) => [...items, { id, card, imageUrl, from, to, fromRotation, toRotation, durationMs, phaseDurations, kind }]);
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
    for (const result of activeResolution.results) {
      queueCardTravel({
        card: result.playerCard,
        imageUrl: getImage(assets, result.playerCard),
        fromElement: slotElement(lanePlayerRefs.current[result.category.id]),
        toElement: discardRefs.current.player,
        fromRotation: 0,
        toRotation: -8,
        kind: "discard",
        durationMs: animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      });
      queueCardTravel({
        card: result.botCard,
        imageUrl: getImage(assets, result.botCard),
        fromElement: slotElement(laneBotRefs.current[result.category.id]),
        toElement: discardRefs.current.bot,
        fromRotation: 0,
        toRotation: 8,
        kind: "discard",
        durationMs: animationDuration(STAT_CHECK_ANIMATION.discardMs, prefersReducedMotion, animationSpeed),
      });
    }
  };

  return (
    <main
      data-anim-phase={revealStep}
      className="relative min-h-screen overflow-hidden bg-[#050b12] text-slate-100 [@media(min-width:1024px)_and_(min-height:840px)]:h-[calc(100svh-56px)] [@media(min-width:1024px)_and_(min-height:840px)]:min-h-0"
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

      <div className="relative mx-auto flex min-h-screen max-w-[1920px] flex-col gap-2 px-3 py-2 sm:px-4 lg:h-full lg:min-h-0 lg:px-2">
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

        <section className="flex flex-1 flex-col gap-2 lg:grid lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)_160px] xl:grid-cols-[300px_minmax(0,1fr)_176px]">
          <MatchupRail
            match={match}
            displayHp={displayHp}
            resolution={activeResolution}
            flashKey={damageFlashKey}
          />

          <section className="order-1 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-2 lg:order-none">
            <div
              className={cn(
                "relative min-h-0 rounded-2xl border border-[#d6b55d]/20 p-2 md:p-3",
                // Carved-stone arena floor: layered dark gradients with a brass
                // hairline and deep inset lighting so it reads as constructed
                // material rather than a flat panel.
                "bg-[radial-gradient(ellipse_at_50%_18%,rgba(30,58,92,0.55),transparent_62%),radial-gradient(ellipse_at_50%_108%,rgba(76,50,150,0.32),transparent_55%),linear-gradient(180deg,#0b1526_0%,#070d18_48%,#05080f_100%)]",
                "shadow-[inset_0_1px_0_rgba(214,181,93,0.12),inset_0_0_60px_rgba(0,0,0,0.65),0_24px_60px_rgba(0,0,0,0.45)]",
              )}
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
              <div className="relative z-10 grid h-full min-h-0 grid-flow-col auto-cols-[minmax(200px,70vw)] gap-2 overflow-x-auto pb-2 md:grid-flow-row md:grid-cols-[repeat(3,minmax(210px,340px))] md:justify-center md:gap-8 md:overflow-visible md:pb-0 xl:gap-12">
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
              {/* player apron: a receiving structure that docks the hand onto
                  the arena's player edge instead of floating below it */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-[8%] -top-3 bottom-1 rounded-b-[34px] border-x border-b border-[#d6b55d]/15 bg-[linear-gradient(180deg,rgba(10,19,34,0.85),rgba(4,7,13,0.35))] shadow-[inset_0_1px_0_rgba(214,181,93,0.14),inset_0_12px_26px_rgba(0,0,0,0.5)] sm:inset-x-[16%]"
              />
              <div aria-hidden className="pointer-events-none absolute -top-3 left-1/2 h-2.5 w-48 -translate-x-1/2 rounded-b-md bg-gradient-to-b from-[#d6b55d]/30 to-transparent" />
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
                  setSelectedCardId((current) => (current === cardId ? null : cardId));
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-semibold text-cyan-100/70" data-testid="stat-check-instruction">
                {selectedCard ? `Click a lane to play ${selectedCard.name}.` : "Click a champion, then click a lane."}
              </p>
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
            </div>
          </section>

          <aside className="order-2 relative min-h-0 space-y-2 overflow-hidden rounded-md border border-cyan-300/15 bg-black/28 p-2.5 shadow-2xl lg:order-none lg:h-full lg:overflow-y-auto lg:p-1.5">
            <RevealSequence
              match={match}
              resolution={activeResolution}
              revealStep={revealStep}
              nextCategories={match.nextCategories}
              onNextRound={nextRound}
              onRestart={restart}
            />
            <UtilityStack
              match={match}
              assets={assets}
              botDiscardRef={(element) => { discardRefs.current.bot = element; }}
              playerDiscardRef={(element) => { discardRefs.current.player = element; }}
            />
          </aside>
        </section>
      </div>
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
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <style>{`
        @keyframes sc-drift { 0%,100% { transform: translateY(0); opacity: .12 } 50% { transform: translateY(-30px); opacity: .4 } }
        @keyframes sc-core-pulse { 0%,100% { opacity: .6; transform: scale(1) } 50% { opacity: 1; transform: scale(1.04) } }
        @keyframes sc-flow { from { background-position: 0 0 } to { background-position: 220px 0 } }
        @keyframes sc-verdict { 0% { opacity: .55; transform: scale(.995) } 100% { opacity: 0; transform: scale(1.012) } }
      `}</style>
      {/* magical haze */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_44%,rgba(56,189,248,0.08),transparent_56%),radial-gradient(ellipse_at_18%_100%,rgba(124,92,246,0.09),transparent_45%),radial-gradient(ellipse_at_82%_100%,rgba(124,92,246,0.09),transparent_45%)]" />
      {/* faint carved striations */}
      <div className="absolute inset-0 opacity-50 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.014)_0px,rgba(255,255,255,0.014)_2px,transparent_2px,transparent_10px)]" />
      {/* engraved edge ring + corner architecture */}
      <div className="absolute inset-2 rounded-xl border border-cyan-200/[0.06]" />
      <div className="absolute left-2 top-2 h-9 w-9 rounded-tl-xl border-l-2 border-t-2 border-[#d6b55d]/35" />
      <div className="absolute right-2 top-2 h-9 w-9 rounded-tr-xl border-r-2 border-t-2 border-[#d6b55d]/35" />
      <div className="absolute bottom-2 left-2 h-9 w-9 rounded-bl-xl border-b-2 border-l-2 border-[#d6b55d]/35" />
      <div className="absolute bottom-2 right-2 h-9 w-9 rounded-br-xl border-b-2 border-r-2 border-[#d6b55d]/35" />
      {/* comparison mechanism: brass rail with flowing energy channel */}
      <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2">
        <div className="h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,rgba(214,181,93,0.45)_10%,rgba(214,181,93,0.6)_50%,rgba(214,181,93,0.45)_90%,transparent)] shadow-[0_1px_0_rgba(0,0,0,0.6),0_0_12px_rgba(214,181,93,0.16)]" />
        <div
          className={cn("mt-[1px] h-[2px]", intense ? "opacity-90" : "opacity-60", !reducedMotion && (intense ? "animate-[sc-flow_2.2s_linear_infinite]" : "animate-[sc-flow_5s_linear_infinite]"))}
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, rgba(34,211,238,0) 0px, rgba(34,211,238,0.55) 12px, rgba(34,211,238,0) 28px)",
            backgroundSize: "220px 100%",
          }}
        />
        <div className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-[#d6b55d]/60 bg-[#0b1526]" />
        <div className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border border-[#d6b55d]/60 bg-[#0b1526]" />
      </div>
      {/* layered hextech core the middle plaque mounts onto */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={cn("absolute -inset-14 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.14),transparent_62%)]", intense && "bg-[radial-gradient(circle,rgba(34,211,238,0.22),transparent_62%)]")} />
        <div
          className={cn(
            "relative grid h-36 w-36 place-items-center rounded-full border-2 shadow-[0_0_44px_rgba(34,211,238,0.16),inset_0_0_26px_rgba(0,0,0,0.55)]",
            intense ? "border-[#d6b55d]/60" : "border-[#d6b55d]/40",
            !reducedMotion && (intense ? "animate-[sc-core-pulse_2.6s_ease-in-out_infinite]" : "animate-[sc-core-pulse_5.5s_ease-in-out_infinite]"),
          )}
        >
          <div className="absolute inset-2 rounded-full border border-cyan-300/15" />
          <div className={cn("absolute h-24 w-24 rotate-45 rounded-[8px] border border-cyan-300/30", !reducedMotion && "animate-[spin_30s_linear_infinite]")} />
          <div
            className="absolute h-16 w-16 rotate-45 rounded-[4px] border border-[#d6b55d]/35"
            style={!reducedMotion ? { animation: "spin 22s linear infinite reverse" } : undefined}
          />
        </div>
      </div>
      {/* one-shot gold perimeter flash when damage lands */}
      {verdict && !reducedMotion && (
        <div key={verdictKey} className="absolute inset-1 rounded-2xl border-2 border-[#f4d77d]/50" style={{ animation: "sc-verdict 700ms ease-out forwards" }} />
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
  const placementHint = canEdit && selectedCard
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
      aria-label={`Lane ${index + 1}: ${categoryAccessibleLabel(category)} ${placementHint}`.trim()}
      onClick={onPlace}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlace();
        }
      }}
      className={cn(
        // Lanes are open light zones on the shared arena floor: no rectangles
        // at all — a faint vertical light column plus low-contrast washes when
        // the zone is targeted or reacting. Sockets and lighting separate them.
        "group relative flex min-h-[420px] flex-col rounded-xl p-2 outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200 md:min-h-[400px]",
        "bg-[radial-gradient(ellipse_62%_52%_at_50%_50%,rgba(56,189,248,0.035),transparent_74%)]",
        canEdit && selectedCard && !playerCard && "bg-[#d6b55d]/[0.05]",
        active && "bg-cyan-300/[0.06]",
        reaction === "charging" && "bg-cyan-200/[0.05]",
        reaction === "impact" && "translate-y-[2px] bg-[#f4d77d]/[0.08]",
        reaction === "accept" && "bg-[#d6b55d]/[0.07]",
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
        <div ref={botRef} className="flex min-h-0 min-w-0 items-center justify-center py-0.5">
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
        <div className="flex min-h-[64px] min-w-0 items-center justify-center">
          {showResult && resolution ? (
            <LaneResult result={resolution} />
          ) : (
            <CategoryMarker category={category} />
          )}
        </div>
        <div ref={playerRef} className="flex min-h-0 min-w-0 items-center justify-center py-0.5">
          <ChampionCard
            card={playerCardInFlight ? null : playerCard}
            imageUrl={getImage(assets, playerCardInFlight ? null : playerCard)}
            category={category}
            value={resolution?.playerValue}
            mode={playerCard && !playerCardInFlight ? "board" : "empty"}
            state={playerState}
            label="You"
            emptyPrompt={playerCardInFlight ? "" : canEdit && selectedCard ? "Place here" : "Place champion"}
            emptyActive={Boolean(canEdit && selectedCard) || playerCardInFlight}
            emptyCharging={playerCardInFlight || reaction === "charging"}
          />
        </div>
      </div>
    </div>
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
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent via-[#d6b55d]/45 to-[#d6b55d]/70" />
      <div className="relative flex min-w-[112px] max-w-full flex-col items-center gap-0.5 rounded-lg border border-[#d6b55d]/45 bg-black/80 px-3 py-2 shadow-[0_10px_34px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(214,181,93,0.28)] sm:px-4">
        <span aria-hidden className="absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border border-[#d6b55d]/60 bg-[#0b1526]" />
        <span aria-hidden className="absolute -right-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border border-[#d6b55d]/60 bg-[#0b1526]" />
        <span className="flex items-center gap-1.5 sm:gap-2" aria-hidden>
          {higher ? (
            <ArrowUp className="h-6 w-6 text-[#f4d77d] sm:h-7 sm:w-7" strokeWidth={2.75} />
          ) : (
            <ArrowDown className="h-6 w-6 text-cyan-300 sm:h-7 sm:w-7" strokeWidth={2.75} />
          )}
          <CategoryGlyph category={category} className="h-5 w-5 text-[#f4d77d]" />
          <span className="whitespace-nowrap text-base font-black uppercase tracking-[0.06em] text-white sm:text-lg">
            {category.shortLabel}
          </span>
        </span>
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5" aria-hidden>
          <span className="rounded bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">
            {scopeLabel(category)}
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#f4d77d]">
            Decisive {formatThreshold(category.decisiveThreshold)}
          </span>
        </span>
      </div>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent via-[#d6b55d]/45 to-[#d6b55d]/70" />
      <span className="sr-only">{categoryAccessibleLabel(category)}</span>
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
    <div className="relative mx-auto h-[190px] w-full max-w-4xl overflow-visible px-3 pb-0 pt-1 sm:h-[210px] lg:h-[176px] xl:h-[188px] 2xl:h-[200px]" data-testid="stat-check-hand">
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
  botDiscardRef,
  playerDiscardRef,
}: {
  match: MatchState;
  assets: ReturnType<typeof useChampionAssets>["data"];
  botDiscardRef: (element: HTMLElement | null) => void;
  playerDiscardRef: (element: HTMLElement | null) => void;
}) {
  return (
    <div className="grid gap-2">
      <CountPill label="Shared pool" value={match.drawPile.length} />
      <CountPill label="Your hand" value={match.playerHand.length} />
      <CountPill label="Bot hand" value={match.botHand.length} />
      <DiscardPile side="bot" cards={match.botDiscard} assets={assets} elementRef={botDiscardRef} />
      <DiscardPile side="player" cards={match.playerDiscard} assets={assets} elementRef={playerDiscardRef} />
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
        card={flipped ? card : null}
        imageUrl={imageUrl}
        category={category}
        value={value}
        mode={flipped ? "board" : "face-down"}
        state={state}
        label={flipped ? "Bot" : undefined}
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
          {flipped && <ChampionCard card={card} imageUrl={imageUrl} category={category} value={value} mode="board" state={state} label="Bot" fill />}
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
const BOARD_CARD_SIZE = "h-[148px] w-auto shrink-0 [aspect-ratio:7/10] md:h-[clamp(150px,calc(50svh_-_240px),340px)]";

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
  emptyPrompt = "Place champion",
  emptyActive = false,
  emptyCharging = false,
}: {
  card: StatCheckCard | null;
  imageUrl?: string | null;
  category?: StatCategory;
  value?: number;
  mode: "hand" | "board" | "face-down" | "empty";
  state?: "idle" | "selected" | "assigned" | "winner" | "loser" | "decisive";
  label?: string;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
  testId?: string;
  /** Fill the parent box (used by flip faces and the motion overlay) instead of self-sizing. */
  fill?: boolean;
  emptyPrompt?: string;
  emptyActive?: boolean;
  emptyCharging?: boolean;
}) {
  if (mode === "empty") {
    // In-world receiving socket: a recessed card-shaped pad carved into the
    // arena floor with a dormant rune, waking up when a card is selected.
    return (
      <div
        className={cn(
          BOARD_CARD_SIZE,
          "relative flex items-center justify-center overflow-hidden rounded-lg border px-2 text-center text-[11px] font-semibold transition",
          "bg-[radial-gradient(ellipse_at_50%_42%,rgba(24,48,74,0.55),transparent_72%),linear-gradient(180deg,rgba(6,12,20,0.85),rgba(12,24,38,0.5))] shadow-[inset_0_3px_16px_rgba(0,0,0,0.6),inset_0_-1px_0_rgba(214,181,93,0.08)]",
          emptyActive
            ? "border-[#f4d77d]/55 text-[#f4d77d] shadow-[inset_0_3px_16px_rgba(0,0,0,0.55),0_0_26px_rgba(214,181,93,0.24)]"
            : "border-cyan-200/15 text-slate-400 group-hover:border-cyan-200/35 group-hover:text-slate-300",
          emptyCharging && "animate-pulse border-[#f4d77d]/75 motion-reduce:animate-none",
        )}
      >
        {/* dormant summoning ring + rune */}
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <span className={cn("grid h-20 w-20 place-items-center rounded-full border transition", emptyActive ? "border-[#f4d77d]/30" : "border-cyan-200/15 group-hover:border-cyan-200/25")}>
            <Swords className={cn("h-9 w-9 transition", emptyActive ? "text-[#f4d77d]/35" : "text-cyan-200/20 group-hover:text-cyan-200/30")} />
          </span>
        </span>
        {/* engraved socket corners */}
        <span aria-hidden className="absolute left-1.5 top-1.5 h-3.5 w-3.5 rounded-tl border-l border-t border-[#d6b55d]/25" />
        <span aria-hidden className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded-tr border-r border-t border-[#d6b55d]/25" />
        <span aria-hidden className="absolute bottom-1.5 left-1.5 h-3.5 w-3.5 rounded-bl border-b border-l border-[#d6b55d]/25" />
        <span aria-hidden className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-br border-b border-r border-[#d6b55d]/25" />
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-4 bottom-3 h-9 rounded-full blur-md transition",
            emptyActive ? "bg-[#d6b55d]/25" : "bg-cyan-400/10",
          )}
        />
        {emptyPrompt && <span className="relative z-10 rounded bg-black/40 px-1.5 py-0.5">{emptyPrompt}</span>}
      </div>
    );
  }

  if (mode === "face-down") {
    return (
      <div className={cn(fill ? "h-full w-full" : BOARD_CARD_SIZE, "relative overflow-hidden rounded-lg border border-cyan-300/20 bg-[linear-gradient(150deg,#0b2032,#071018_48%,#1c1730)] shadow-xl")}>
        <div className="absolute inset-[6px] rounded-md border border-[#d6b55d]/30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.22),transparent_46%)]" />
        <div className="relative flex h-full flex-col items-center justify-center gap-1.5 text-cyan-100">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#d6b55d]/40 bg-black/40 text-[#f4d77d]">
            <Swords className="h-5 w-5" />
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200/80">Concealed</span>
        </div>
      </div>
    );
  }

  const relevant = card && category ? category.formatValue(value ?? category.getValue(card)) : null;
  const chips = card ? statChips(card) : [];
  const cardClassName = cn(
    "relative block overflow-hidden rounded-lg border border-cyan-300/20 bg-[#071526] text-left shadow-2xl outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-cyan-200 motion-reduce:transition-none",
    mode === "hand" && "h-40 w-28 shrink-0 origin-bottom hover:-translate-y-2 sm:h-44 sm:w-32 lg:h-[148px] lg:w-[104px] xl:h-40 xl:w-28 2xl:h-44 2xl:w-32",
    mode === "board" && (fill ? "h-full w-full" : BOARD_CARD_SIZE),
    state === "selected" && "-translate-y-2 scale-[1.08] border-[#f4d77d] shadow-[0_22px_48px_rgba(0,0,0,0.65),0_0_30px_rgba(244,215,125,0.4)] ring-2 ring-[#f4d77d]/75",
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
    <div>
      <NextRoundIntel categories={nextCategories} compact />

      <div className="mt-2 h-px bg-cyan-300/10" />

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Round {match.round}</div>
          <div className="text-sm font-black">Resolution</div>
        </div>
        <Badge variant="outline" className="border-[#d6b55d]/35 bg-[#d6b55d]/10 px-1.5 text-[10px] text-[#f4d77d]">
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
                <div data-testid="stat-check-match-over" className="rounded-md border border-[#d6b55d]/35 bg-[#d6b55d]/10 p-2">
                  <div className="text-lg font-black">{match.outcome === "draw" ? "Match Draw" : match.outcome === "player" ? "Victory" : "Defeat"}</div>
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

function MatchupRail({
  match,
  displayHp,
  resolution,
  flashKey,
}: {
  match: MatchState;
  displayHp: { player: number; bot: number };
  resolution: RoundResolution | null;
  flashKey: number;
}) {
  const lastRound = match.roundHistory[match.roundHistory.length - 1] ?? null;
  return (
    <aside className="order-3 flex min-h-0 flex-col gap-2 lg:order-none lg:h-full lg:overflow-y-auto">
      <ProfilePanel side="bot" />
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
      <ProfilePanel side="player" />
      <LastRoundDamage resolution={lastRound} />
      <MatchHistoryPanel history={match.roundHistory} />
    </aside>
  );
}

function ProfilePanel({ side }: { side: "player" | "bot" }) {
  // Cosmetic matchup dressing for the dev prototype (mock rank/record flavor).
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
        <div className="truncate text-sm font-black text-white">{bot ? "Deterministic Bot" : "mogsy"}</div>
        <div className="truncate text-[11px] text-slate-400">
          {bot ? "Platinum IV - 63% WR - 412 games" : "Diamond II - 57% WR - 892 games"}
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

function LastRoundDamage({ resolution }: { resolution: RoundResolution | null }) {
  return (
    <div className="rounded-md border border-cyan-300/12 bg-black/28 p-2.5 shadow-xl">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Last round damage</div>
      {resolution ? (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center justify-between rounded bg-black/30 px-2 py-1 text-xs">
            <span className="font-semibold text-slate-300">Bot dealt</span>
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

function MatchHistoryPanel({ history }: { history: RoundResolution[] }) {
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
                  {winner === "player" ? "You won" : winner === "bot" ? "Bot won" : "Tied"}
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

function NextRoundIntel({ categories, compact = false }: { categories: StatCategory[]; compact?: boolean }) {
  const [visible, ...hidden] = categories;
  return (
    <div className={cn("rounded-md border border-[#d6b55d]/25 bg-black/28 shadow-xl", compact ? "p-2" : "p-3")}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4d77d]">Next Round Intel</div>
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

export function LaneResult({ result }: { result: CategoryResult }) {
  const headline = result.winner === "player" ? "You win" : result.winner === "bot" ? "Bot wins" : "Lane tied";
  const accent = result.winner === "player" ? "text-[#f4d77d]" : result.winner === "bot" ? "text-cyan-200" : "text-slate-200";
  const lineAccent = result.winner === "player" ? "via-[#f4d77d]/60" : result.winner === "bot" ? "via-cyan-300/50" : "via-slate-400/40";
  return (
    <div className="z-20 flex w-full items-center gap-2">
      <span aria-hidden className={cn("h-px flex-1 bg-gradient-to-r from-transparent to-white/30", lineAccent)} />
      <div
        className={cn(
          "relative flex min-w-[112px] max-w-full flex-col items-center gap-0.5 rounded-lg border bg-black/85 px-3 py-2 text-center shadow-[0_10px_34px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(214,181,93,0.28)] sm:px-4",
          result.decisive ? "border-[#f4d77d]/80 shadow-[0_0_30px_rgba(214,181,93,0.3)]" : "border-[#d6b55d]/45",
        )}
      >
        <span aria-hidden className="absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border border-[#d6b55d]/60 bg-[#0b1526]" />
        <span aria-hidden className="absolute -right-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border border-[#d6b55d]/60 bg-[#0b1526]" />
        <div className={cn("whitespace-nowrap text-lg font-black uppercase tracking-[0.08em]", accent)}>{headline}</div>
        <div className="whitespace-nowrap text-base font-black text-white">
          {result.category.formatValue(result.playerValue)} vs {result.category.formatValue(result.botValue)}
        </div>
        {result.decisive && (
          <div className="rounded bg-[#d6b55d]/20 px-2 py-0.5 text-xs font-black uppercase tracking-[0.1em] text-[#f4d77d]">
            Decisive +1
          </div>
        )}
        <div className="text-[10px] font-semibold text-slate-400">
          {(result.margin * 100).toFixed(1)}% margin - Decisive at {formatThreshold(result.category.decisiveThreshold)}
          {result.category.direction === "lower" ? " - Lower wins" : ""}
        </div>
      </div>
      <span aria-hidden className={cn("h-px flex-1 bg-gradient-to-l from-transparent to-white/30", lineAccent)} />
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
