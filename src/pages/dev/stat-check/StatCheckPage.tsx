import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { fanCardLayout, responsiveFanParameters } from "./fanLayout";
import {
  STAT_CHECK_RULES,
  assignCard,
  buildCardsFromBaseStats,
  createMatch,
  isReadyToLock,
  resolveCurrentRound,
  startNextRound,
  type CategoryResult,
  type MatchState,
  type RoundDamage,
  type RoundResolution,
  type StatCategory,
  type StatCategoryId,
  type StatCheckCard,
} from "./statCheckEngine";

const SEED = "stat-check-tabletop-v2";

type RevealStep =
  | "selecting"
  | "locking"
  | "opponent-reveal"
  | "lane-one"
  | "lane-two"
  | "lane-three"
  | "board-result"
  | "damage"
  | "resolved"
  | "match-over";

const REVEAL_FLOW: RevealStep[] = [
  "opponent-reveal",
  "lane-one",
  "lane-two",
  "lane-three",
  "board-result",
  "damage",
  "resolved",
];

const STEP_DELAY_MS = 280;

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
  const [revealStep, setRevealStep] = useState<RevealStep>("selecting");
  const [damageFlashKey, setDamageFlashKey] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    clearRevealTimers(timersRef.current);
    setMatch(createMatch(deck, `${SEED}:${matchKey}`));
    setSelectedCardId(null);
    setRevealStep("selecting");
  }, [deck, matchKey]);

  useEffect(() => () => clearRevealTimers(timersRef.current), []);

  useEffect(() => {
    if (revealStep !== "locking" || !match.lastResolution) return;
    clearRevealTimers(timersRef.current);

    if (prefersReducedMotion) {
      setRevealStep(match.phase === "match-over" ? "match-over" : "resolved");
      setDamageFlashKey((key) => key + 1);
      return;
    }

    const flow = match.phase === "match-over" ? [...REVEAL_FLOW.slice(0, -1), "match-over" as RevealStep] : REVEAL_FLOW;
    timersRef.current = flow.map((step, index) =>
      window.setTimeout(() => {
        setRevealStep(step);
        if (step === "damage") setDamageFlashKey((key) => key + 1);
      }, STEP_DELAY_MS * (index + 1)),
    );
  }, [match.lastResolution, match.phase, prefersReducedMotion, revealStep]);

  const selectedCard = match.playerHand.find((card) => card.id === selectedCardId) ?? null;
  const assignedCardIds = new Set(Object.values(match.assignments).filter(Boolean));
  const canEdit = match.phase === "selecting" && revealStep === "selecting";
  const activeLaneIndex = revealLaneIndex(revealStep);
  const activeResolution = match.lastResolution?.round === match.round ? match.lastResolution : null;
  const displayHp = activeResolution && revealStepBeforeDamage(revealStep)
    ? { player: activeResolution.playerHpBefore, bot: activeResolution.botHpBefore }
    : { player: match.playerHp, bot: match.botHp };

  const restart = () => {
    clearRevealTimers(timersRef.current);
    setMatchKey((key) => key + 1);
  };

  const placeCard = (category: StatCategory) => {
    if (!canEdit) return;
    const current = match.assignments[category.id];
    if (selectedCardId) {
      setMatch((state) => assignCard(state, category.id, selectedCardId));
      setSelectedCardId(null);
    } else if (current) {
      setMatch((state) => assignCard(state, category.id, null));
    }
  };

  const lockIn = () => {
    if (!isReadyToLock(match) || !canEdit) return;
    setSelectedCardId(null);
    setRevealStep("locking");
    setMatch((state) => resolveCurrentRound(state));
  };

  const nextRound = () => {
    clearRevealTimers(timersRef.current);
    setSelectedCardId(null);
    setRevealStep("selecting");
    setMatch((state) => startNextRound(state));
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
            {isLoading && <Badge variant="outline">Loading stats</Badge>}
            {isError && <Badge variant="outline">Fallback active</Badge>}
            <Button size="sm" variant="outline" onClick={restart} className="border-[#d6b55d]/40 bg-black/30 text-[#f4d77d]">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Restart
            </Button>
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-2 lg:grid lg:min-h-0 lg:grid-cols-[172px_minmax(0,1fr)_260px] xl:grid-cols-[188px_minmax(0,1fr)_280px]">
          <MatchUtilityRail match={match} assets={assets} />

          <section className="order-1 grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-2 lg:order-none">
            <HpDisplay
              side="bot"
              hp={displayHp.bot}
              previousHp={activeResolution?.botHpBefore}
              damage={activeResolution?.damage.player ?? 0}
              flashKey={damageFlashKey}
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
                    assets={assets}
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
              reducedMotion={prefersReducedMotion}
              onSelect={(cardId) => setSelectedCardId((current) => (current === cardId ? null : cardId))}
            />

            <HpDisplay
              side="player"
              hp={displayHp.player}
              previousHp={activeResolution?.playerHpBefore}
              damage={activeResolution?.damage.bot ?? 0}
              flashKey={damageFlashKey}
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
  assets,
  onPlace,
}: {
  category: StatCategory;
  index: number;
  selectedCard: StatCheckCard | null;
  playerCard: StatCheckCard | null;
  botCard: StatCheckCard | null;
  resolution?: CategoryResult;
  canEdit: boolean;
  revealStep: RevealStep;
  active: boolean;
  assets: ReturnType<typeof useChampionAssets>["data"];
  onPlace: () => void;
}) {
  const botHidden = !resolution || revealStep === "locking";
  const showResult = Boolean(resolution && (active || revealStepAfterLane(revealStep, index)));
  const playerWon = resolution?.winner === "player";
  const botWon = resolution?.winner === "bot";

  return (
    <div
      data-testid={`stat-check-lane-${category.id}`}
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
      )}
    >
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CategoryIcon category={category} />
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{compactCategoryLabel(category)}</div>
            <div className="truncate text-[11px] text-slate-400">{scopeLabel(category)}</div>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-[#d6b55d]/30 bg-[#d6b55d]/10 px-2 py-1 text-[10px] font-black uppercase text-[#f4d77d]">
          {category.direction === "higher" ? "High" : "Low"}
        </div>
      </div>

      <div className="relative mt-2 grid flex-1 grid-rows-[minmax(78px,1fr)_auto_minmax(78px,1fr)] gap-1.5">
        <ChampionCard
          card={botCard}
          imageUrl={getImage(assets, botCard)}
          category={category}
          value={resolution?.botValue}
          mode={botHidden ? "face-down" : "lane"}
          state={botWon ? (resolution?.decisive ? "decisive" : "winner") : playerWon ? "loser" : "idle"}
          label="Bot"
        />
        <div className="flex min-h-[42px] items-center justify-center md:min-h-[50px]">
          {showResult && resolution ? (
            <LaneResult result={resolution} />
          ) : (
            <div className="rounded-full border border-cyan-300/20 bg-black/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100">
              Lane {index + 1}
            </div>
          )}
        </div>
        <ChampionCard
          card={playerCard}
          imageUrl={getImage(assets, playerCard)}
          category={category}
          value={resolution?.playerValue}
          mode={playerCard ? "lane" : "empty"}
          state={playerWon ? (resolution?.decisive ? "decisive" : "winner") : botWon ? "loser" : "idle"}
          label="You"
        />
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
  reducedMotion,
  onSelect,
}: {
  cards: StatCheckCard[];
  assets: ReturnType<typeof useChampionAssets>["data"];
  selectedCardId: string | null;
  assignedCardIds: Set<string>;
  disabled: boolean;
  reducedMotion: boolean;
  onSelect: (cardId: string) => void;
}) {
  const viewportWidth = useViewportWidth();
  const activeCards = cards.filter((card) => !assignedCardIds.has(card.id));
  const parameters = responsiveFanParameters(activeCards.length, viewportWidth);

  return (
    <div className="relative mx-auto h-[190px] w-full max-w-5xl overflow-x-hidden overflow-y-visible px-3 pb-0 pt-1 sm:h-[210px] lg:h-[176px] xl:h-[190px] 2xl:h-[210px]" data-testid="stat-check-hand">
      <div className="relative mx-auto h-full min-w-[320px] max-w-full">
        {activeCards.map((card, index) => {
          const selected = selectedCardId === card.id;
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
              )}
              data-fan-index={index}
              style={style}
            >
              <ChampionCard
                card={card}
                imageUrl={getImage(assets, card)}
                mode="hand"
                state={selected ? "selected" : "idle"}
                disabled={disabled}
                onClick={() => onSelect(card.id)}
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
}: {
  match: MatchState;
  assets: ReturnType<typeof useChampionAssets>["data"];
}) {
  return (
    <aside className="order-3 grid gap-2 rounded-md border border-cyan-300/12 bg-black/20 p-2 shadow-2xl lg:order-none lg:h-full lg:min-h-0 lg:content-start lg:overflow-y-auto">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <CountPill label="Your deck" value={match.playerDeck.length} />
        <CountPill label="Bot deck" value={match.botDeck.length} />
        <CountPill label="Your hand" value={match.playerHand.length} />
        <CountPill label="Bot hand" value={match.botHand.length} />
      </div>
      <DiscardPile side="bot" cards={match.botDiscard} assets={assets} />
      <DiscardPile side="player" cards={match.playerDiscard} assets={assets} />
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
      <button data-testid={testId} type="button" disabled={disabled} onClick={onClick} className={cardClassName}>
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
  revealStep: RevealStep;
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
        <div className="mt-2 rounded-md bg-black/30 p-2 text-xs text-slate-300">
          Bot cards stay face-down until lock-in.
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

function HpDisplay({
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
    <div className="relative mx-auto w-full max-w-4xl rounded-md border border-cyan-300/15 bg-black/32 px-3 py-1.5 shadow-xl">
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
            <div data-testid="stat-check-next-intel-label" className="truncate text-sm font-black">{compactCategoryLabel(visible)}</div>
            <div className="text-[11px] text-slate-300">{visible.direction === "higher" ? "Higher wins" : "Lower wins"}</div>
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
}: {
  side: "player" | "bot";
  cards: StatCheckCard[];
  assets: ReturnType<typeof useChampionAssets>["data"];
}) {
  return (
    <details className="rounded-md border border-cyan-300/12 bg-black/25 p-2 shadow-xl" data-testid={`stat-check-${side}-discard`}>
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

function scopeLabel(category: StatCategory) {
  if (category.id.includes("-18")) return "Level 18";
  if (category.id.includes("-1")) return "Level 1";
  return "Base";
}

function revealLaneIndex(step: RevealStep) {
  if (step === "lane-one") return 0;
  if (step === "lane-two") return 1;
  if (step === "lane-three") return 2;
  return -1;
}

function revealStepAfterLane(step: RevealStep, laneIndex: number) {
  const active = revealLaneIndex(step);
  if (active >= 0) return active > laneIndex;
  return ["board-result", "damage", "resolved", "match-over"].includes(step);
}

function revealStepBeforeDamage(step: RevealStep) {
  return ["locking", "opponent-reveal", "lane-one", "lane-two", "lane-three", "board-result"].includes(step);
}

function phaseLabel(step: RevealStep) {
  return step
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clearRevealTimers(timers: number[]) {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.length = 0;
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
