/**
 * Daily Challenge — the arena (DC1 Phase 5).
 *
 * A short solo version of modern Ranked. The three-column arena is Ranked's,
 * at Ranked's proportions, with the opponent column replaced by the DAY: you
 * on the left, the card in the middle, the challenge on the right, and the
 * finite run strip along the floor.
 *
 * NOT A RESTYLED LEGACY QUIZ. This page talks to the DC2 transport
 * (`/api/daily-challenge/*`) and shares no state, no types and no code path
 * with the Daily flow still living inside `Quiz.tsx`. That one is untouched,
 * and so is Time Trial at `/quiz/daily`.
 *
 * THE SERVER IS THE GAME. This component holds no answer, no score, no card
 * order and no timer authority — it renders a projection and sends two verbs.
 * A refresh at any point in the run is a fresh read of that projection, which
 * is why every state below (including a live six-second window and an expired
 * one) survives one without special handling.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MetaReflexSting, useEntrySting } from "@/components/ranked-arena/MetaReflexSting";
import { DailyCardStage } from "./DailyCardStage";
import { DailyCardTimeline } from "./DailyCardTimeline";
import { DailyChallengePanel } from "./DailyChallengePanel";
import { DailyPlayerPanel } from "./DailyPlayerPanel";
import { DailyResultScreen } from "./DailyResultScreen";
import { useDailyChallengeRun } from "./useDailyChallengeRun";
import {
  cardPhase,
  latestReveal,
  projectChallenge,
  projectPlayer,
  projectTimeline,
  projectTimer,
} from "./dailyChallengeViews";

const LEAGUECRAFT_HREF = "/quiz";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-3 px-3 py-4 sm:px-4 sm:py-6">
      {children}
    </main>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </Shell>
  );
}

export default function QuizDailyChallengePage() {
  const dc = useDailyChallengeRun();
  const { user } = useAuth();

  /**
   * A one-second display tick, and ONLY a display tick.
   *
   * The countdown it drives is a picture of the server's deadline. Expiry is
   * the server's decision — it locks the card at zero on the next read or
   * write — so a device whose clock drifts loses a smooth animation and
   * nothing else.
   */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const run = dc.run;
  /*
   * THE SURFACE CARD, which is not always the run's current card.
   *
   * The backend advances past a card in the same transaction that resolves it,
   * so an answer that solves card 3 returns a run whose current card is 4.
   * Rendering that straight away would replace the reveal with the next prompt
   * in the same frame. While a resolved card is held, the stage shows it and
   * the player moves on deliberately.
   */
  const held = dc.holdSequence !== null && run
    ? run.cards.find((c) => c.sequence === dc.holdSequence) ?? null
    : null;
  const card = held ?? dc.card;
  const phase = cardPhase(card);

  const timer = useMemo(
    () => projectTimer(held ? null : card, dc.timerMaxMs, tick, dc.skewMs),
    [held, card, dc.timerMaxMs, tick, dc.skewMs]);

  /**
   * A lapsed window heals on the SERVER, on contact. The client notices the
   * countdown has hit zero and asks — once per window — rather than deciding
   * the card timed out by itself.
   */
  const askedForRef = useRef<string | null>(null);
  useEffect(() => {
    const live = dc.card;
    if (!live?.timer || !timer || timer.remainingSeconds > 0) return;
    const key = `${live.sequence}:${live.timer.endsAt}`;
    if (askedForRef.current === key) return;
    askedForRef.current = key;
    dc.refresh();
  }, [timer, dc]);

  const reveal = useMemo(() => (run ? latestReveal(run) : null), [run]);
  const player = useMemo(() => (run ? projectPlayer(run) : null), [run]);
  const challenge = useMemo(
    () => (run ? projectChallenge(run, dc.today?.challenge.theme ?? null) : null),
    [run, dc.today]);
  const nodes = useMemo(
    () => (run ? projectTimeline(run, dc.today?.challenge.structure ?? null,
      dc.today?.challenge.challengeVersion ?? null) : []),
    [run, dc.today]);

  // The block's entry sting, keyed on the block rather than the card, so it
  // fires once as the spike begins and not before each of its five cards.
  const blockKey = card?.kind === "meta_reflex" && run ? `${run.runId}:reflex` : null;
  const sting = useEntrySting(blockKey);

  const displayName =
    (user?.user_metadata?.display_name as string | undefined)
    ?? (user?.user_metadata?.username as string | undefined)
    ?? null;

  // ── entry states ─────────────────────────────────────────────────────────

  if (dc.stage === "loading") {
    return (
      <Centred>
        <div data-testid="dc-loading" className="ranked-panel flex items-center gap-2 p-6">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Opening today's challenge…</p>
        </div>
      </Centred>
    );
  }

  if (dc.stage === "unavailable") {
    return (
      <Centred>
        <div data-testid="dc-unavailable" className="ranked-panel space-y-3 p-6">
          <h1 className="text-lg font-semibold">Today's challenge isn't ready</h1>
          <p className="text-sm text-muted-foreground">{dc.error}</p>
          <Button asChild variant="outline">
            <Link to={LEAGUECRAFT_HREF}>Back to Leaguecraft</Link>
          </Button>
        </div>
      </Centred>
    );
  }

  if (dc.stage === "ready") {
    const challengeInfo = dc.today?.challenge;
    return (
      <Centred>
        <div data-testid="dc-entry" className="ranked-panel ranked-folio space-y-4 p-6">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              Daily Challenge
            </p>
            <h1 className="text-xl font-bold leading-tight">Today's Challenge</h1>
            {challengeInfo && (
              <p className="text-sm text-muted-foreground">
                {challengeInfo.cardCount} cards
                {challengeInfo.theme ? ` · ${challengeInfo.theme}` : ""}
              </p>
            )}
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>Only your first answer on each card counts for score.</li>
            <li>Miss it and you keep going until you solve it — that still counts as learned.</li>
            <li>The Meta Reflex block is timed. You choose when each card starts.</li>
          </ul>
          {dc.error && (
            <p role="alert" data-testid="dc-entry-error" className="text-xs text-destructive">
              {dc.error}
            </p>
          )}
          <Button
            type="button"
            data-testid="dc-start"
            onClick={dc.start}
            disabled={dc.busy}
            className="gap-1.5"
          >
            <Swords className="h-4 w-4" aria-hidden="true" />
            {dc.busy ? "Starting…" : "Begin"}
          </Button>
        </div>
      </Centred>
    );
  }

  if (!run || !player || !challenge) {
    return (
      <Centred>
        <div data-testid="dc-loading" className="ranked-panel p-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </Centred>
    );
  }

  // ── completed ────────────────────────────────────────────────────────────
  //
  // A finished day shows its result and offers NO replay. The backend would
  // refuse a second official run anyway (`ux_dc2_official`), so a button here
  // would be a promise the server does not keep.
  if (dc.stage === "complete" && !held) {
    if (!run.result) {
      // Completed but not yet paid — the width of a crash. Every read
      // finalises, so this resolves itself; it is reported honestly rather
      // than as a grade of zero.
      return (
        <Centred>
          <div data-testid="dc-finalising" className="ranked-panel space-y-3 p-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true" />
              Scoring today's run…
            </p>
            <Button type="button" variant="outline" onClick={dc.refresh} disabled={dc.busy}>
              Refresh
            </Button>
          </div>
        </Centred>
      );
    }
    return (
      <Shell>
        <DailyResultScreen
          result={run.result}
          summary={run.summary}
          score={run.score}
          maxScore={run.maxScore}
          challengeDate={run.challengeDate}
          homeHref={LEAGUECRAFT_HREF}
        />
        <DailyCardTimeline nodes={nodes} />
      </Shell>
    );
  }

  // ── the arena ────────────────────────────────────────────────────────────

  return (
    <Shell>
      {sting && <MetaReflexSting />}
      <div
        data-testid="dc-arena"
        /* Ranked's own proportions: 23 / 54 / 23. The centre dominates, and
           the two columns are equal so neither reads as the "real" one. */
        className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)]
                   lg:items-stretch min-[1500px]:gap-4"
      >
        <div className="order-1 lg:order-1">
          <DailyPlayerPanel player={player} displayName={displayName} />
        </div>

        {/* The card takes the full width below lg, where three columns would
            make the prompt unreadable — the two side panels sit above and
            below it rather than beside it. */}
        <div className="order-3 col-span-2 lg:order-2 lg:col-span-1">
          {card && phase ? (
            <DailyCardStage
              card={card}
              phase={phase}
              timer={timer}
              beat={dc.beat}
              reveal={reveal}
              busy={dc.busy}
              onActivate={dc.activate}
              onAnswer={dc.answer}
              onContinue={held ? dc.continueToNext : null}
              continueLabel={run.status === "completed" ? "See results" : "Next card"}
              footer={
                <p
                  role={dc.error ? "alert" : "status"}
                  data-testid="dc-status"
                  className={`line-clamp-2 min-h-[1.75rem] text-xs ${
                    dc.error ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {dc.error ?? (dc.busy ? "Sending…" : "")}
                </p>
              }
            />
          ) : (
            <div className="ranked-panel p-6">
              <p className="text-sm text-muted-foreground">Preparing the next card…</p>
            </div>
          )}
        </div>

        <div className="order-2 lg:order-3">
          <DailyChallengePanel challenge={challenge} />
        </div>
      </div>

      <DailyCardTimeline nodes={nodes} />
    </Shell>
  );
}
