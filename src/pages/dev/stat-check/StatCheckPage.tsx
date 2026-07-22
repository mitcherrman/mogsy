import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Bot, RotateCcw, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChampionAssets, getChampionSplash, getChampionIcon } from "@/hooks/useChampionAssets";
import { useChampionBaseStats } from "@/hooks/useChampionBaseStats";
import { cn } from "@/lib/utils";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import {
  STAT_CHECK_RULES,
  assignCard,
  buildCardsFromBaseStats,
  createMatch,
  isReadyToLock,
  resolveCurrentRound,
  startNextRound,
  type MatchState,
  type StatCategory,
  type StatCheckCard,
} from "./statCheckEngine";

const SEED = "stat-check-prototype-v1";

export default function StatCheckPage() {
  const { data: statRows, isLoading, isError } = useChampionBaseStats();
  const { data: assets } = useChampionAssets();
  const deck = useMemo(() => {
    const apiDeck = buildCardsFromBaseStats(statRows);
    return apiDeck.length >= 24 ? apiDeck : STAT_CHECK_FIXTURE_DECK;
  }, [statRows]);
  const dataSource = buildCardsFromBaseStats(statRows).length >= 24 ? "League Docs champion stats" : "24-card deterministic fixture fallback";
  const [matchKey, setMatchKey] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchState>(() => createMatch(STAT_CHECK_FIXTURE_DECK, `${SEED}:0`));

  useEffect(() => {
    setMatch(createMatch(deck, `${SEED}:${matchKey}`));
    setSelectedCardId(null);
  }, [deck, matchKey]);

  const selectedCard = match.playerHand.find((card) => card.id === selectedCardId) ?? null;
  const assignedCardIds = new Set(Object.values(match.assignments).filter(Boolean));

  const restart = () => setMatchKey((key) => key + 1);
  const placeCard = (category: StatCategory) => {
    if (match.phase !== "selecting") return;
    const current = match.assignments[category.id];
    if (selectedCardId) {
      setMatch((state) => assignCard(state, category.id, selectedCardId));
      setSelectedCardId(null);
    } else if (current) {
      setMatch((state) => assignCard(state, category.id, null));
    }
  };
  const lockIn = () => {
    setSelectedCardId(null);
    setMatch((state) => resolveCurrentRound(state));
  };
  const nextRound = () => {
    setSelectedCardId(null);
    setMatch((state) => startNextRound(state));
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#06111f] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(16,185,225,0.18),transparent_36%),linear-gradient(180deg,#07182d_0%,#08111f_45%,#05070d_100%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-3 py-4 sm:px-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-300/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#c9a84c]">
              <Swords className="h-4 w-4" /> Dev prototype
            </div>
            <h1 className="text-2xl font-black leading-tight sm:text-4xl">Stat Check</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              {dataSource}
            </Badge>
            {isLoading && <Badge variant="outline">Loading live stats</Badge>}
            {isError && <Badge variant="outline">Using fallback</Badge>}
            <Button size="sm" variant="outline" onClick={restart} className="border-[#c9a84c]/40 bg-black/30 text-[#f4d77d]">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Restart
            </Button>
          </div>
        </header>

        <section className="grid min-w-0 flex-1 grid-cols-1 grid-rows-[auto_1fr_auto] gap-3 py-3">
          <CombatantRail side="bot" hp={match.botHp} deck={match.botDeck.length} hand={match.botHand.length} discard={match.botDiscard.length} />

          <div className="grid min-w-0 min-h-[430px] grid-cols-1 gap-3 lg:grid-cols-[220px_1fr_220px]">
            <aside className="order-2 rounded border border-cyan-300/15 bg-black/20 p-3 lg:order-1">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Next board</div>
              <div className="mt-3 rounded border border-[#c9a84c]/30 bg-[#c9a84c]/10 p-3">
                <div className="text-[11px] uppercase text-[#f4d77d]">Preview revealed</div>
                <div className="mt-1 text-sm font-bold">{match.nextCategories[0].label}</div>
                <div className="mt-1 text-xs text-slate-300">{directionLabel(match.nextCategories[0])}</div>
              </div>
              <div className="mt-2 grid gap-2">
                <HiddenPreview />
                <HiddenPreview />
              </div>
              <div className="mt-4 text-xs leading-relaxed text-slate-400">
                Round {match.round}. Save a specialist if the preview looks valuable.
              </div>
            </aside>

            <section className="order-1 grid min-w-0 grid-cols-1 gap-3 lg:order-2">
              <div className="flex items-center justify-between rounded border border-cyan-300/15 bg-black/25 px-3 py-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Arena lanes</div>
                  <div className="text-xs text-slate-400">Assign exactly one champion to each stat.</div>
                </div>
                <Button
                  data-testid="stat-check-lock"
                  onClick={lockIn}
                  disabled={!isReadyToLock(match) || match.phase !== "selecting"}
                  className="bg-[#c9a84c] text-[#08111f] hover:bg-[#f4d77d]"
                >
                  <Zap className="mr-1.5 h-4 w-4" /> Lock in
                </Button>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
                {match.currentCategories.map((category) => {
                  const cardId = match.assignments[category.id];
                  const playerCard = match.playerHand.find((card) => card.id === cardId) ?? null;
                  const resolution = match.lastResolution?.results.find((result) => result.category.id === category.id);
                  return (
                    <button
                      data-testid={`stat-check-lane-${category.id}`}
                      key={category.id}
                      type="button"
                      onClick={() => placeCard(category)}
                      disabled={match.phase !== "selecting"}
                      className={cn(
                        "min-w-0 min-h-[290px] w-full max-w-full rounded border border-cyan-300/20 bg-[#071526]/85 p-3 text-left shadow-2xl transition",
                        selectedCard && match.phase === "selecting" && "border-[#c9a84c]/70",
                      )}
                    >
                      <div className="flex min-h-[76px] flex-col justify-between border-b border-white/10 pb-2">
                        <div className="text-sm font-black">{category.label}</div>
                        <div className="text-xs text-slate-300">{directionLabel(category)}</div>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <LaneCard
                          title="Bot"
                          card={resolution?.botCard ?? null}
                          hidden={!resolution}
                          category={category}
                          value={resolution?.botValue}
                          imageUrl={getImage(assets, resolution?.botCard)}
                          won={resolution?.winner === "bot"}
                        />
                        <LaneCard
                          title="You"
                          card={resolution?.playerCard ?? playerCard}
                          category={category}
                          value={resolution?.playerValue}
                          imageUrl={getImage(assets, resolution?.playerCard ?? playerCard)}
                          won={resolution?.winner === "player"}
                        />
                      </div>
                      {resolution && (
                        <div className="mt-3 rounded bg-black/25 p-2 text-xs text-slate-200">
                          {resolution.winner === "tie" ? "Tied category" : `${resolution.winner === "player" ? "You" : "Bot"} won by ${(resolution.margin * 100).toFixed(1)}%`}
                          {resolution.decisive && <span className="text-[#f4d77d]"> · decisive +1</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="order-3 rounded border border-cyan-300/15 bg-black/20 p-3">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Resolution</div>
              {match.lastResolution ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded border border-white/10 bg-black/25 p-3">
                    <div className="font-bold">
                      {match.lastResolution.damage.boardWinner === "tie"
                        ? "Board tied"
                        : `${match.lastResolution.damage.boardWinner === "player" ? "You" : "Bot"} won the board`}
                    </div>
                    <div className="mt-1 text-xs text-slate-300">
                      Damage: You {match.lastResolution.damage.player}, Bot {match.lastResolution.damage.bot}
                    </div>
                  </div>
                  <div className="text-xs text-slate-300">
                    HP {match.lastResolution.playerHpBefore} to {match.lastResolution.playerHpAfter} vs {match.lastResolution.botHpBefore} to{" "}
                    {match.lastResolution.botHpAfter}
                  </div>
                  {match.phase === "resolved" && (
                    <Button data-testid="stat-check-next-round" onClick={nextRound} className="w-full bg-cyan-300 text-[#06111f] hover:bg-cyan-200">
                      Next round
                    </Button>
                  )}
                  {match.phase === "match-over" && (
                    <div className="rounded border border-[#c9a84c]/30 bg-[#c9a84c]/10 p-3">
                      <div className="text-lg font-black">
                        {match.outcome === "draw" ? "Draw" : match.outcome === "player" ? "Victory" : "Defeat"}
                      </div>
                      <div className="text-xs text-slate-300">{match.endReason}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-400">Bot cards stay hidden until you lock all three lanes.</div>
              )}
            </aside>
          </div>

          <div className="rounded-t border border-cyan-300/15 bg-black/35 p-3">
            <CombatantRail side="player" hp={match.playerHp} deck={match.playerDeck.length} hand={match.playerHand.length} discard={match.playerDiscard.length} />
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2 sm:justify-center">
              {match.playerHand.map((card, index) => (
                <HandCard
                  key={card.id}
                  card={card}
                  imageUrl={getImage(assets, card)}
                  selected={selectedCardId === card.id}
                  assigned={assignedCardIds.has(card.id)}
                  disabled={match.phase !== "selecting"}
                  style={{ transform: `translateY(${Math.abs(index - 2.5) * 3}px) rotate(${(index - 2.5) * 2}deg)` }}
                  onClick={() => setSelectedCardId((current) => (current === card.id ? null : card.id))}
                  testId={`stat-check-hand-${index}`}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function CombatantRail({ side, hp, deck, hand, discard }: { side: "player" | "bot"; hp: number; deck: number; hand: number; discard: number }) {
  const pct = Math.max(0, Math.min(100, (hp / STAT_CHECK_RULES.startingHp) * 100));
  return (
    <div className="rounded border border-cyan-300/15 bg-black/25 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {side === "bot" && <Bot className="h-4 w-4 text-cyan-200" />}
          <div className="text-sm font-black">{side === "player" ? "You" : "Deterministic Bot"}</div>
        </div>
        <div className="text-xs text-slate-300">Hand {hand} · Deck {deck} · Discard {discard}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-gradient-to-r from-[#c9a84c] to-cyan-300 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs font-bold">{hp} / {STAT_CHECK_RULES.startingHp} HP</div>
    </div>
  );
}

function LaneCard({
  title,
  card,
  category,
  imageUrl,
  value,
  hidden,
  won,
}: {
  title: string;
  card: StatCheckCard | null;
  category: StatCategory;
  imageUrl?: string | null;
  value?: number;
  hidden?: boolean;
  won?: boolean;
}) {
  return (
    <div className={cn("w-full max-w-full overflow-hidden rounded border border-white/10 bg-black/30 p-2", won && "border-[#c9a84c]/70 bg-[#c9a84c]/10")}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      {hidden ? (
        <div className="mt-2 flex h-24 w-full items-center justify-center rounded bg-cyan-950/50 text-xs text-cyan-200">Hidden card</div>
      ) : card ? (
        <div className="mt-2 flex gap-2">
          <ChampionThumb card={card} imageUrl={imageUrl} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{card.name}</div>
            <div className="text-xs text-slate-300">
              {value == null ? category.formatValue(category.getValue(card)) : category.formatValue(value)}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex h-24 w-full items-center justify-center rounded border border-dashed border-white/15 text-xs text-slate-400">
          {title === "You" ? "Select a card, then tap lane" : "Hidden card"}
        </div>
      )}
    </div>
  );
}

function HandCard({
  card,
  imageUrl,
  selected,
  assigned,
  disabled,
  style,
  onClick,
  testId,
}: {
  card: StatCheckCard;
  imageUrl?: string | null;
  selected: boolean;
  assigned: boolean;
  disabled: boolean;
  style?: CSSProperties;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      data-testid={testId}
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        "relative h-40 w-28 shrink-0 overflow-hidden rounded border bg-[#071526] text-left shadow-xl transition sm:h-44 sm:w-32",
        selected ? "border-[#f4d77d] ring-2 ring-[#f4d77d]/40" : "border-cyan-300/20",
        assigned && "opacity-60",
      )}
    >
      <ChampionArt card={card} imageUrl={imageUrl} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2">
        <div className="truncate text-xs font-black">{card.name}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-1 text-[10px] text-slate-300">
          <span>HP {Math.round(card.stats.hp)}</span>
          <span>AD {Math.round(card.stats.ad)}</span>
          <span>AR {Math.round(card.stats.armor)}</span>
          <span>RNG {Math.round(card.stats.attackRange)}</span>
        </div>
      </div>
      {assigned && <div className="absolute right-1 top-1 rounded bg-[#c9a84c] px-1.5 py-0.5 text-[10px] font-bold text-black">Set</div>}
    </button>
  );
}

function ChampionThumb({ card, imageUrl }: { card: StatCheckCard; imageUrl?: string | null }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-[#c9a84c]/30 bg-slate-900">
      <ChampionArt card={card} imageUrl={imageUrl} />
    </div>
  );
}

function ChampionArt({ card, imageUrl }: { card: StatCheckCard; imageUrl?: string | null }) {
  if (imageUrl) return <img src={imageUrl} alt={card.name} className="h-full w-full object-cover" loading="lazy" />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-950 via-slate-900 to-amber-950 text-xl font-black text-[#f4d77d]">
      {card.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function HiddenPreview() {
  return <div className="rounded border border-white/10 bg-black/25 p-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Hidden category</div>;
}

function directionLabel(category: StatCategory) {
  return category.direction === "higher" ? "Higher value wins" : "Lower value wins";
}

function getImage(assets: ReturnType<typeof useChampionAssets>["data"], card?: StatCheckCard | null) {
  return getChampionSplash(assets, card?.name) || getChampionIcon(assets, card?.name);
}
