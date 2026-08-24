/**
 * Daily Challenge — the production arena, with the day in the opposite column.
 * (DC1 Phase 5, migrated onto `CanonicalArena` by ARENA1 Step 5.)
 *
 * WHAT THIS PAGE IS NOW
 * ─────────────────────
 * A CONTROLLER and a router of states. It reads the run, decides which of the
 * mode's five entry states it is in, projects the playing ones into an
 * `ArenaViewModel`, and hands that to the same `CanonicalArena` Ranked and the
 * Ranked Tutorial render. It draws no shell, no header, no timer, no question,
 * no answer grid, no timeline and no result frame — every one of those is the
 * arena's, and this page cannot tell you what any of them look like.
 *
 * WHAT IT WAS
 * ───────────
 * A second arena. It laid out its own 23/54/23 grid, mounted its own card
 * stage, its own answer grid, its own timeline and its own player column, and
 * two ARENA1 guards failed the moment the two lines of work were put in one
 * tree — `AnswerGrid.elimination` ("a second component started rendering answer
 * choices") and `TutorialOnCanonicalArena` ("a second file laid out the
 * 23/54/23 arena geometry"). None of that was wrong when it was written:
 * `CanonicalArena` did not exist yet. It exists now, so the duplicates are
 * deleted rather than maintained.
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
import { Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArenaShell, arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { MetaReflexSting, useEntrySting } from "@/components/ranked-arena/MetaReflexSting";
import { DailyChallengePanel } from "./DailyChallengePanel";
import { DailyResultSummary } from "./DailyResultSummary";
import { DailyRunControls } from "./DailyRunControls";
import { dailyArenaView, dailyTerminalView } from "./dailyArenaView";
import { useDailyChallengeRun } from "./useDailyChallengeRun";
import { cardPhase, projectChallenge, projectTimer } from "./dailyChallengeViews";

const LEAGUECRAFT_HREF = "/quiz";

/** The route's chrome row — the Daily's title, and the way back. */
function DailyRouteHeader({ size = "default" }: { size?: "default" | "wide" }) {
  return (
    <header className={arenaHeaderRowClass(size)}>
      <div className="flex items-baseline gap-2.5">
        <h1 className="ranked-title text-lg font-bold leading-tight">Daily Challenge</h1>
        <span className="ranked-eyebrow hidden sm:inline">Today's Challenge</span>
      </div>
      <Link to={LEAGUECRAFT_HREF} className="text-sm text-muted-foreground underline">
        Back to Quiz
      </Link>
    </header>
  );
}

/**
 * The non-playing states.
 *
 * Rendered inside the ARENA'S OWN SHELL at its reading width, so entry, an
 * outage and the scoring pause all carry the same parchment and the same frame
 * the run itself lands in. They used to be a local `<main>` with no
 * `.ranked-academy` ancestor, which meant their `ranked-folio` class was inert
 * and the mode's own skin never rendered on them.
 */
function Centred({ children }: { children: React.ReactNode }) {
  return (
    <ArenaShell header={<DailyRouteHeader />}>
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </ArenaShell>
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
   * in the same frame. While a resolved card is held, the arena's surface shows
   * it and the player moves on deliberately — the hold lives HERE, in
   * presentation state around the arena, and the arena is simply handed the
   * card it should be drawing.
   */
  const heldCard = dc.holdSequence !== null && run
    ? run.cards.find((c) => c.sequence === dc.holdSequence) ?? null
    : null;
  const card = heldCard ?? dc.card;
  const phase = cardPhase(card);

  const timer = useMemo(
    () => projectTimer(heldCard ? null : card, dc.timerMaxMs, tick, dc.skewMs),
    [heldCard, card, dc.timerMaxMs, tick, dc.skewMs]);

  /**
   * A lapsed window heals on the SERVER, on contact. The client notices the
   * countdown has hit zero and ASKS — it never decides the card timed out by
   * itself, and it never writes anything.
   *
   * IT HAS TO BE ABLE TO ASK TWICE, and that is the whole of this ref.
   *
   * The backend allows a 750ms grace past the deadline, deliberately, so an
   * answer already in flight when the clock struck is still honoured. The
   * client's countdown reaches zero BEFORE that grace elapses — so the first
   * ask can legitimately be answered "still live", and a single-shot ask left
   * the player looking at a frozen 0:00 on a card the server had not locked
   * yet, with nothing scheduled to look again. Observed in a browser against a
   * real backend; it is a race the tests could not see, because a stubbed
   * fetch answers instantly and always agrees.
   *
   * So: ask, and keep asking about once a second until the card stops being a
   * timed one. BOUNDED, because an unbounded retry against a server that
   * disagrees is a poll: five asks is well past a 750ms grace, and if the card
   * is still live after that the server means it.
   */
  const expiryAskRef = useRef<{ key: string; at: number; asks: number } | null>(null);
  useEffect(() => {
    const live = dc.card;
    if (!live?.timer || !timer || timer.remainingSeconds > 0) return;
    const key = `${live.sequence}:${live.timer.endsAt}`;
    const previous = expiryAskRef.current;
    if (previous?.key === key) {
      if (previous.asks >= 5 || tick - previous.at < 1000) return;
      expiryAskRef.current = { key, at: tick, asks: previous.asks + 1 };
    } else {
      expiryAskRef.current = { key, at: tick, asks: 1 };
    }
    dc.refresh();
  }, [timer, tick, dc]);

  const challenge = useMemo(
    () => (run ? projectChallenge(run, dc.today?.challenge.theme ?? null) : null),
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
          <h2 className="text-lg font-semibold">Today's challenge isn't ready</h2>
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
            <p className="ranked-eyebrow">Daily Challenge</p>
            <h2 className="ranked-title text-xl font-bold leading-tight">Today's Challenge</h2>
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
          <Button type="button" data-testid="dc-start" onClick={dc.start}
            disabled={dc.busy} className="gap-1.5">
            <Swords className="h-4 w-4" aria-hidden="true" />
            {dc.busy ? "Starting…" : "Begin"}
          </Button>
        </div>
      </Centred>
    );
  }

  if (!run || !challenge) {
    // The arena owns the placeholder, so the shell, the skin and the geometry
    // are the same ones the run will land in.
    return (
      <CanonicalArena view={null} chrome={<DailyRouteHeader size="wide" />}
        recovering={{ eyebrow: "Daily Challenge", message: "Opening today's challenge…" }} />
    );
  }

  // ── completed ────────────────────────────────────────────────────────────
  //
  // A finished day shows its result and offers NO replay. The backend would
  // refuse a second official run anyway (`ux_dc2_official`), so a button here
  // would be a promise the server does not keep. It waits for the HOLD to be
  // released first, so the last card's explanation is read before the result
  // takes the screen.
  if (dc.stage === "complete" && !heldCard) {
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
    const terminal = dailyTerminalView({
      run, today: dc.today, card: null, held: false, beat: null, busy: dc.busy,
      error: dc.error, timer: null, skewMs: dc.skewMs, displayName,
      summary: (
        <DailyResultSummary result={run.result} summary={run.summary}
          score={run.score} maxScore={run.maxScore} />
      ),
      onHome: () => { window.location.assign(LEAGUECRAFT_HREF); },
    });
    return (
      <CanonicalArena view={null} terminal={terminal}
        chrome={<DailyRouteHeader size="wide" />} />
    );
  }

  // ── the arena ────────────────────────────────────────────────────────────

  const view = dailyArenaView({
    run,
    today: dc.today,
    card,
    held: heldCard !== null,
    beat: dc.beat,
    busy: dc.busy,
    error: dc.error,
    timer,
    skewMs: dc.skewMs,
    displayName,
    targetPanel: <DailyChallengePanel challenge={challenge} />,
    onAnswer: dc.answer,
  });

  return (
    <>
      {sting && <MetaReflexSting />}
      <CanonicalArena
        view={view}
        chrome={<DailyRouteHeader size="wide" />}
        guidance={
          <DailyRunControls
            reflexGate={phase === "reflex_ready"}
            onContinue={heldCard ? dc.continueToNext : null}
            continueLabel={run.status === "completed" ? "See results" : "Next card"}
            busy={dc.busy}
            onActivate={dc.activate}
          />
        }
      />
    </>
  );
}
