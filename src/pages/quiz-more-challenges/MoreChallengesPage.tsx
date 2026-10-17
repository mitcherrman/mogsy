/**
 * PGM1 — `/quiz/more-challenges`, the public More Challenges catalog.
 *
 * The thirteen approved bonus modes, exactly as `GET /api/game-modes` lists
 * them: the server owns which modes exist, their copy, their order and what
 * the public can launch. A card's action is decided by `resolveModeAction`
 * (lib/public-modes/launch) from the server's launch plus the player's own
 * Daily — never from the fact that a mode is approved. A mode with no public
 * launch says "Coming soon" and has no Play button.
 *
 * MC-UX1 — drawn as a GALLERY: the modes are grouped into three collections
 * (lib/public-modes/gallery, presentation only), each card carries its game's
 * own art (components/public-modes/gallery), and a card's status is what
 * `cardStatus` derives from that same action. Every launch, notice, replay
 * and analytics path below is unchanged.
 *
 * MC-UX2 — a HUB: the collections are paged one at a time (CategoryPager: arrows
 * first, tabs to jump; `?c=` remembers the page), a Random button launches one
 * of the modes playable right now through the same `play` path a card uses, and
 * the player's own history (lib/public-modes/summary, `GET /me/summary`) shows
 * as a stats strip and a line on each card.
 *
 * WAYS IN AND OUT
 * ───────────────
 * In: the Daily's main result ("Play More Challenges"), a bonus stage's result,
 * the Daily recap, and Leaguecraft's More Challenges section. Out: Play hands
 * a Daily bonus stage to the Daily page (which owns the run, the match and the
 * result; that result offers the way back here). Browsing is public; the Daily
 * itself decides who may play.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import { ModeRulesPanel } from "@/components/public-modes/ModeRulesPanel";
import { CategoryPager } from "@/components/public-modes/gallery/CategoryPager";
import { CollectionSection } from "@/components/public-modes/gallery/CollectionSection";
import { GalleryHero } from "@/components/public-modes/gallery/GalleryHero";
import {
  GameCard, GameCardSkeleton, type CardHistory, type PlayAction,
} from "@/components/public-modes/gallery/GameCard";
import { PlayerStats, RandomButton, type SummaryState } from "@/components/public-modes/gallery/HubToolbar";
import "@/components/public-modes/gallery/gallery.css";
import { track } from "@/lib/analytics/track";
import { httpDailyRunTransport } from "@/lib/daily-challenge/run/client";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { usePublicModeCatalog } from "@/lib/public-modes/client";
import {
  isPublicModeId, PUBLIC_MODE_TITLES, type PublicModeEntry, type PublicModeId,
} from "@/lib/public-modes/contracts";
import { RankedApiError, startBonusGame } from "@/lib/ranked-public/client";
import {
  BONUS_GAME_ORIGIN_ID,
  MORE_CHALLENGES_ROUTE,
  readMoreChallengesSource,
  resolveModeAction,
  type DailyContext,
} from "@/lib/public-modes/launch";
import {
  cardStatus, collectionCellClass, collectionOfMode, countReady, groupModes, initialCollection, pickRandomPlayable,
  sharePause, stepCollection, type GalleryGroup,
} from "@/lib/public-modes/gallery";
import { modeHistoryParts, usePlayerSummary } from "@/lib/public-modes/summary";
import {
  MORE_CHALLENGES_MODE_SELECTED,
  MORE_CHALLENGES_VIEWED,
  modeSelectedMetadata,
} from "@/lib/public-modes/report";
import { buildModeRules } from "@/lib/public-modes/rules";

type StartNotice =
  | { kind: "active_match"; title: string }
  /** A bonus game of ANOTHER mode is still live: name it, offer the way back. */
  | { kind: "other_game"; title: string; liveTitle: string; matchId: string }
  | { kind: "paused"; title: string }
  | { kind: "unavailable"; title: string }
  | { kind: "rate_limited"; title: string }
  | { kind: "failed"; title: string };

const NOTICE_COPY: Record<Exclude<StartNotice["kind"], "other_game">, string> = {
  active_match: "You already have a match in progress. Finish it first.",
  paused: "New bonus games are paused for now. Please check back soon.",
  unavailable: "This game can't be started right now. Try another one.",
  rate_limited: "Too many starts in a row. Wait a moment and try again.",
  failed: "That game could not be started. Please try again.",
};

/** One key per press: a retried request names the same match, never a second. */
function newStartKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.padEnd(20, "0");
}

/** The player's Daily, read once per visit. A GET: no identity is minted. */
function useTodaysDaily(): DailyContext {
  const q = useQuery<DailyRun | null>({
    queryKey: ["daily-run", "today", "more-challenges"],
    queryFn: ({ signal }) => httpDailyRunTransport.readToday(signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  if (q.isPending) return { state: "loading" };
  if (q.isError) return { state: "error" };
  return { state: "ready", run: q.data ?? null };
}

export default function MoreChallengesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [source] = useState(() => readMoreChallengesSource(location.state));
  const catalog = usePublicModeCatalog();
  const daily = useTodaysDaily();
  const [rulesFor, setRulesFor] = useState<PublicModeEntry | null>(null);
  const [startingId, setStartingId] = useState<PublicModeId | null>(null);
  const [notice, setNotice] = useState<StartNotice | null>(null);
  const startingRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(MORE_CHALLENGES_VIEWED, { metadata: { source } });
  }, [source]);

  const modes = useMemo(() => catalog.data?.modes ?? [], [catalog.data]);
  const actions = useMemo(
    () => new Map(modes.map((m) => [m.id, resolveModeAction(m, daily)] as const)),
    [modes, daily],
  );
  const statuses = useMemo(
    () => new Map(modes.map((m) => [m.id, cardStatus(m, actions.get(m.id) ?? { kind: "coming_soon" })] as const)),
    [modes, actions],
  );
  const groups = useMemo(() => groupModes(modes), [modes]);

  // MC-UX2 — the collection on screen. The URL (`?c=`) remembers it, so a
  // reload or Back lands on the same page.
  const [chosen, setChosen] = useState<GalleryGroup["id"] | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const active = chosen ?? initialCollection(groups, searchParams.get("c"), source);
  const activeGroup = groups.find((g) => g.id === active) ?? null;
  const pagerRef = useRef<HTMLDivElement>(null);
  const changeCollection = (id: GalleryGroup["id"], dir: 1 | -1) => {
    setDirection(dir);
    setChosen(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("c", id);
      return next;
    }, { replace: true, state: location.state });
  };

  // MC-UX2 — the player's own record.
  const summaryQuery = usePlayerSummary();
  const summary: SummaryState = summaryQuery.isPending ? { state: "loading" }
    : summaryQuery.isError ? { state: "error" } : { state: "ready", summary: summaryQuery.data ?? null };
  const historyOf = (id: PublicModeId): CardHistory | undefined => {
    if (summary.state === "loading") return { state: "loading" };
    if (summary.state === "error") return undefined;
    const parts = modeHistoryParts(summary.summary?.modes[id]);
    return parts.length ? { state: "ready", parts } : { state: "none" };
  };

  const start = async (entry: PublicModeEntry) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartingId(entry.id);
    setNotice(null);
    try {
      const out = await startBonusGame(entry.id, newStartKey());
      // The server handed back a bonus game of another mode that is still
      // live: say which, and let the player return to it on purpose.
      if (out.result === "resumed" && out.modeId && out.modeId !== entry.id && out.status.matchId) {
        setNotice({ kind: "other_game", title: entry.title, matchId: out.status.matchId,
          liveTitle: isPublicModeId(out.modeId) ? PUBLIC_MODE_TITLES[out.modeId] : "bonus" });
        return;
      }
      if (out.status.status === "matched" && out.status.matchId) {
        navigate("/quiz/ranked", { state: { matchId: out.status.matchId, origin: BONUS_GAME_ORIGIN_ID } });
        return;
      }
      setNotice({ kind: "failed", title: entry.title });
    } catch (e) {
      const code = e instanceof RankedApiError ? e.code : null;
      const status = e instanceof RankedApiError ? e.status : 0;
      if (code === "RANKED_ACTIVE_MATCH_EXISTS" || code === "RANKED_ALREADY_QUEUED") {
        setNotice({ kind: "active_match", title: entry.title });
      } else if (code === "BONUS_GAMES_PAUSED") {
        setNotice({ kind: "paused", title: entry.title });
        void catalog.refetch();
      } else if (code === "RANKED_RATE_LIMITED" || status === 429) {
        setNotice({ kind: "rate_limited", title: entry.title });
      } else if (code === "BONUS_NOT_LAUNCHABLE" || code === "FEATURE_DISABLED" || status === 503) {
        setNotice({ kind: "unavailable", title: entry.title });
        void catalog.refetch();
      } else {
        setNotice({ kind: "failed", title: entry.title });
      }
    } finally {
      startingRef.current = false;
      setStartingId(null);
    }
  };

  const play = (entry: PublicModeEntry, action: PlayAction) => {
    track(MORE_CHALLENGES_MODE_SELECTED, { metadata: modeSelectedMetadata(entry.id, "play", source) });
    if (action.kind === "start") void start(entry);
    else navigate(action.to, { state: action.state });
  };

  // PGM2 — "Play Again" on a bonus game's result comes back here with
  // `?play=<mode>`: start that mode once the catalog says it can be started,
  // then drop the parameter so Back or a reload never starts another.
  const playParam = searchParams.get("play");
  const playHandled = useRef(false);
  useEffect(() => {
    if (playHandled.current || !playParam || !catalog.data) return;
    playHandled.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("play");
      return next;
    }, { replace: true, state: location.state });
    if (!isPublicModeId(playParam)) return;
    const entry = modes.find((m) => m.id === playParam);
    const action = entry ? actions.get(entry.id) : undefined;
    if (entry && action?.kind === "start") play(entry, action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playParam, catalog.data]);
  // MC-UX2 — Random: one of the modes playable right now, launched through the
  // card's own path (same analytics, same start contract).
  const playable = modes.filter((m) => statuses.get(m.id)?.state === "ready");
  const [randomPick, setRandomPick] = useState<string | null>(null);
  const random = () => {
    const pick = pickRandomPlayable(modes, (m) => statuses.get(m.id), (m) => actions.get(m.id));
    if (!pick) return;
    const action = actions.get(pick.id);
    if (!action || (action.kind !== "play" && action.kind !== "start")) return;
    const where = collectionOfMode(groups, pick.id);
    if (where && where !== active) changeCollection(where, 1);
    setRandomPick(pick.title);
    play(pick, action);
  };

  const showRules = (entry: PublicModeEntry) => {
    track(MORE_CHALLENGES_MODE_SELECTED, { metadata: modeSelectedMetadata(entry.id, "rules", source) });
    setRulesFor(entry);
  };

  return (
    <>
      <SEOHead
        title="More Challenges — League of Legends Bonus Modes | Mogzy"
        description="Bonus League of Legends knowledge modes on Mogzy: Time Trial, Survival and more. None of them change your Daily score or Ranked rating."
        path={MORE_CHALLENGES_ROUTE}
      />
      <div
        className="ranked-academy mc-gallery relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-14 pt-3 sm:gap-8"
        data-testid="more-challenges"
        data-source={source}
      >
        <GalleryHero
          total={catalog.data ? modes.length : null}
          ready={catalog.data ? countReady(statuses.values()) : null}
          action={catalog.data ? (
            <RandomButton count={playable.length} busy={startingId !== null} onRandom={random} />
          ) : null}
        >
          <PlayerStats summary={summary} />
        </GalleryHero>

        <p className="sr-only" aria-live="polite" data-testid="more-challenges-random-pick">
          {randomPick ? `Random pick: ${randomPick}` : ""}
        </p>

        <div aria-live="polite" className="empty:hidden">
          {notice && (
            <section className="ranked-subpanel flex items-start justify-between gap-3 p-3 text-sm"
              data-testid={`more-challenges-notice-${notice.kind}`} role="status">
              <p>
                <span className="font-semibold">{notice.title}: </span>
                {notice.kind === "other_game"
                  ? <>Your {notice.liveTitle} game is still in progress. Finish it first.{" "}
                    <button type="button" className="underline underline-offset-2" data-testid="more-challenges-notice-return"
                      onClick={() => navigate("/quiz/ranked", {
                        state: { matchId: notice.matchId, origin: BONUS_GAME_ORIGIN_ID } })}>
                      Return to it
                    </button></>
                  : NOTICE_COPY[notice.kind]}
                {notice.kind === "active_match" && (
                  <> <Link to="/quiz/ranked" className="underline underline-offset-2"
                    data-testid="more-challenges-notice-resume">Return to it</Link></>
                )}
              </p>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"
                className="-m-2 inline-flex h-11 w-11 flex-none items-center justify-center text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </section>
          )}
        </div>

        {catalog.isPending ? (
          <CatalogSkeleton />
        ) : catalog.isError ? (
          <section className="ranked-panel p-5" data-testid="more-challenges-error">
            <div className="ranked-eyebrow ranked-eyebrow--cyan">Unavailable</div>
            <h2 className="mt-1 font-semibold">More Challenges could not be loaded.</h2>
            <Button className="mt-3 min-h-[44px]" variant="outline" onClick={() => void catalog.refetch()}
              disabled={catalog.isFetching} data-testid="more-challenges-retry">
              Try again
            </Button>
          </section>
        ) : (
          <div className="flex flex-col gap-4" data-testid="more-challenges-grid" ref={pagerRef}>
            {groups.length > 1 && active && (
              <CategoryPager groups={groups} active={active} panelId="mc-collection-panel"
                onChange={changeCollection} />
            )}
            {activeGroup && (() => {
              const g = activeGroup;
              const pause = sharePause(g.modes.map((m) => statuses.get(m.id) ?? cardStatus(m, { kind: "coming_soon" })));
              const next = groups.find((x) => x.id === stepCollection(groups, g.id, 1));
              return (
                <div id="mc-collection-panel" role="tabpanel" aria-labelledby={`mc-tab-${g.id}`}
                  key={g.id} className="mc-page" data-direction={direction > 0 ? "next" : "prev"}
                  data-testid="more-challenges-panel" data-collection={g.id}>
                  <CollectionSection group={g} pausedReason={pause.reason}>
                    {g.modes.map((m, i) => (
                      <li key={m.id} className={collectionCellClass(g.id, i, g.modes.length)}>
                        <GameCard
                          entry={m}
                          action={actions.get(m.id) ?? { kind: "coming_soon" }}
                          status={pause.statuses[i]}
                          onPlay={play}
                          starting={startingId === m.id}
                          busy={startingId !== null}
                          onRules={() => showRules(m)}
                          feature={g.id === "daily_extras"}
                          history={historyOf(m.id)}
                        />
                      </li>
                    ))}
                  </CollectionSection>
                  {next && next.id !== g.id && (
                    <div className="mt-4 flex justify-end">
                      <button type="button" className="mc-next-page" data-testid="more-challenges-next-page"
                        onClick={() => {
                          changeCollection(next.id, 1);
                          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                          pagerRef.current?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
                        }}>
                        Next: {next.title}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      {rulesFor && (
        <ModeRulesPanel
          rules={buildModeRules(rulesFor)}
          open
          onOpen={() => {}}
          onClose={() => setRulesFor(null)}
        />
      )}
    </>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="more-challenges-loading" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => <GameCardSkeleton key={i} />)}
    </div>
  );
}
