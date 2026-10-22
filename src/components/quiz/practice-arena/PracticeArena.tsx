/**
 * PM1 — the Practice runner, presented in the canonical Ranked arena.
 * PM2 — on a phone, the Ranked/Daily ONE-SCREEN composition, and no Next.
 *
 * `Quiz.tsx` still owns every Practice behaviour: which questions are served,
 * the one submission per question, XP, history sessions, the leave guard,
 * the report publication, replay and the results screen. This component only
 * PRESENTS the run, through the same `CanonicalArena` Ranked and the Pro Play
 * quiz render:
 *
 *  - the CHROME ROW is Practice's one line — way back, `PRACTICE`, the
 *    position on a phone, `mogzy.lol` — the Daily's header-row pattern
 *    (`DailyStageChrome`): below the HUD band on a phone, inside it from `lg`;
 *  - the CENTRE STAGE is the arena's question member (`ArenaQuestionSurface`):
 *    the canonical scenario surface, the canonical answer grid and its reveal
 *    styling, inside the same folio and three-region footprint as a Ranked
 *    round. Practice's own question art enters through `regions.media`;
 *  - the FLANKS are two `panel`s (desktop only, by the arena's rule): the
 *    subject panel and the run panel Pro Play already draws (`Your run`);
 *  - the HEADER STRIP (desktop) is the arena strip: subject eyebrow,
 *    `Question n / N`, and the graded verdict + awarded XP on the centre;
 *  - the HUD ROW holds Practice's reveal (verdict, explanation, XP, pro-data
 *    source) in a box held at one height before and after the grade;
 *  - the BOTTOM is the canonical finite round strip — on a phone, the RMOB2
 *    bottom bar (Report · a five-node window · Rules).
 *
 * PM2 — `phoneOneScreen` asks the arena for the RMOB2 phone frame Ranked and
 * the Daily use (`data-phone-arena`): viewport-tall, the header strip and
 * panels hidden, the VISCONT1/MVFIT1 stage allocation, nothing scrolling
 * inside it. Desktop is the PM1 arena unchanged apart from the chrome row and
 * the missing Next. A graded reveal advances by itself after its hold
 * (`practiceRevealHoldMs`); a failed submit holds with Try again / Skip.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY: matchmaking, an opponent, a timer, a
 * rating, damage, abilities or a settlement. `report` is null on purpose —
 * Practice publishes its own snapshot (it is the one mode with both a static
 * question id and a question key) and the arena must not publish a second,
 * poorer one over it.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Database, RotateCcw, SkipForward, Sparkles, TriangleAlert, XCircle } from "lucide-react";

import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import ProPlaySessionPanel from "@/components/pro-play/arena/ProPlaySessionPanel";
import ProDataSourceLink from "@/components/quiz/ProDataSourceLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuizAnswerResult, QuizQuestion } from "@/lib/quiz/api";
import type { ArenaQuestionSurface, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import { parseProDataSource, proDataSourceUrl } from "@/lib/league-docs/pro-data-links";
import {
  PRACTICE_ARENA_EYEBROW,
  practiceExplanationDensity,
  practiceRevealHoldMs,
  practiceXpLabel,
  projectPracticeArena,
  type PracticeOutcome,
} from "@/lib/quiz/practiceArena";
import { SITE_DOMAIN } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { PracticeQuestionMedia, practiceVisual } from "./PracticeQuestionMedia";
import { PracticeSubjectPanel, type PracticeProgressionView } from "./PracticeSubjectPanel";
import { usePracticeAutoAdvance, usePracticeRevealPause } from "./usePracticeAutoAdvance";

export interface PracticeArenaProps {
  phase: "loading-questions" | "active" | "error";
  questions: readonly QuizQuestion[];
  currentIndex: number;
  selectedAnswer: string | null;
  answerResult: QuizAnswerResult | null;
  outcomes: readonly PracticeOutcome[];
  score: number;
  subject: string | null;
  subjectIcon: string | null;
  runKind: "fresh" | "missed";
  sessionXp: number | null;
  progression: PracticeProgressionView | null;
  errorMessage?: string;
  /** Typed answers, for the (retired, still supported) fill-blank format. */
  fillBlankValue: string;
  onFillBlankChange: (value: string) => void;
  /** Submits a choice by its label — Practice's existing submission. */
  onSelectAnswer: (label: string) => void;
  /**
   * PM2 — which run is on stage. With the position it keys the reveal's
   * auto-advance, so a replay or a new session never inherits a pending one.
   */
  runKey?: string;
  /** PM2 — leave the graded question (next one, or the results after the last). */
  onAdvance: () => void;
  /** PM2 — send the same answer again after a failed submit. */
  onRetryAnswer: () => void;
  /** PM2 — leave a question whose submit failed, ungraded. */
  onSkip: () => void;
  onRetry: () => void;
  /** Where the way back goes. The leave guard intercepts it while unfinished. */
  exitTo?: string;
}

/** See ProPlayArenaRun: the frame's glow bleed is trimmed at the page edge. */
const FRAME_CLIP = "overflow-x-clip";
/** 36px controls inside the reveal box, which is short by design; an invisible
 *  `::before` extends each one's hit area to 44px tall. */
const ACTION_BOX = "relative h-9 shrink-0 gap-1.5 px-3 before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";

/** Focus was left nowhere on purpose (the body, or the now-locked grid). */
function focusStranded(): boolean {
  const active = document.activeElement;
  return !active || active === document.body
    || active.closest?.('[data-surface-region="answers"]') !== null;
}

function revealBelowHud(el: HTMLElement, anchor: HTMLElement = el) {
  const hudBottom = document.querySelector("nav.global-hud")?.getBoundingClientRect().bottom ?? 0;
  const box = el.getBoundingClientRect();
  if (box.top >= hudBottom && box.bottom <= window.innerHeight) return;
  const top = anchor.getBoundingClientRect().top + window.scrollY - hudBottom - 8;
  window.scrollTo?.({ top: Math.max(0, top), behavior: "auto" });
}

/**
 * The reveal advances to a new question under the player: focus falls to the
 * body (the grid it was in is gone), and a page that had to scroll keeps its
 * offset. So on a NEW question (never the first of a run), and only when
 * focus was stranded, focus moves to the new stem — announced once — and the
 * stem is brought into view below the HUD if it is not already.
 */
function useQuestionHandoff(root: RefObject<HTMLDivElement>, questionKey: string | null) {
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    if (questionKey === null) return;
    previous.current = questionKey;
    if (before === undefined || before === questionKey) return;
    const el = root.current;
    if (!el || !focusStranded()) return;
    const stem = el.querySelector<HTMLElement>('[data-testid="ranked-question"] [data-surface-region="prompt"] h2');
    if (!stem) return;
    stem.tabIndex = -1;
    stem.focus({ preventScroll: true });
    revealBelowHud(stem, el.querySelector<HTMLElement>('[data-testid="ranked-question"]') ?? stem);
  }, [root, questionKey]);
}

/**
 * PM2 — PRACTICE'S ONE LINE. The Daily's header-row pattern, and its weights:
 * a quiet way back, the mode in the arena's title face, and the domain in the
 * Daily's screenshot blue, so a recording of any frame carries the brand.
 * Below `lg` it also carries the position (the desktop strip has its own).
 * The page's one h1 — the lobby's is its wordmark; this phase's is here.
 */
function PracticeChrome({ to, number, total }: { to: string; number: number | null; total: number }) {
  return (
    <header data-testid="practice-chrome"
      className={`${arenaHeaderRowClass("wide")} !flex-nowrap !gap-1.5 sm:!gap-2`}>
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Link to={to} aria-label="Back to League hub" title="Back to League hub" data-testid="practice-back"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground
            transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-1 focus-visible:outline-amber-300">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 aria-label={PRACTICE_ARENA_EYEBROW} data-testid="practice-title"
          className="ranked-title shrink-0 whitespace-nowrap text-sm font-bold uppercase leading-none tracking-[0.14em] sm:text-base">
          Practice
        </h1>
        {number !== null && total > 0 && (
          <span data-testid="practice-position"
            className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-muted-foreground lg:hidden">
            <span aria-hidden="true">{number} / {total}</span>
            <span className="sr-only">Question {number} of {total}</span>
          </span>
        )}
      </div>
      <span data-testid="practice-brand"
        className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold tracking-wide text-sky-200 sm:text-sm">
        {SITE_DOMAIN}
      </span>
    </header>
  );
}

/** Pro-data provenance as one quiet chip, for the phone's short reveal box. */
function CompactSourceLink({ metadata }: { metadata?: Record<string, unknown> | null }) {
  const source = parseProDataSource(metadata?.pro_data_source);
  if (!source) return null;
  return (
    <Link to={proDataSourceUrl(source)} data-testid="practice-source-compact"
      title="Source data reflects Mogsy's imported dataset; coverage may be incomplete for historical years."
      className="inline-flex shrink-0 items-center gap-1 rounded border border-[#c9a84c]/40 px-1.5 py-0.5 text-[10px]
        font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/10 lg:hidden">
      <Database className="h-3 w-3" aria-hidden />
      Source
    </Link>
  );
}

/**
 * The reveal box's height, held from the first frame of a question, so the
 * reveal draws INTO a box that already exists and nothing above it moves.
 * Below `lg` the height is `--practice-reveal-h` (index.css, PM2); from `lg`
 * it is the verdict row and two lines of explanation (~210 characters at the
 * centre track's width — the bank's 95th percentile is ~185).
 */
const REVEAL_SLOT = "practice-reveal-slot w-full min-w-0 lg:min-h-[4.625rem]";

/**
 * The reveal footer. Built only from the backend's grade (or, for a failed
 * submit, from the honest "could not verify" notice — never a verdict).
 */
function PracticeRevealFooter({
  result, unverified, question, holdMs, paused, footerRef, onRetryAnswer, onSkip, isLast,
}: {
  result: QuizAnswerResult;
  unverified: boolean;
  question: QuizQuestion;
  holdMs: number | null;
  paused: boolean;
  footerRef: RefObject<HTMLDivElement>;
  onRetryAnswer: () => void;
  onSkip: () => void;
  isLast: boolean;
}) {
  const tone = unverified ? "neutral" : result.is_correct ? "positive" : "negative";
  const xp = practiceXpLabel(result);
  const TONE = {
    positive: "border-emerald-400/35 bg-emerald-500/[0.08]",
    negative: "border-[#c0584f]/45 bg-[#c0584f]/[0.08]",
    neutral: "border-amber-300/35 bg-amber-300/[0.07]",
  } as const;
  const HEAD = {
    positive: "text-emerald-300",
    negative: "text-[#f09a90]",
    neutral: "text-amber-200",
  } as const;
  const Icon = tone === "positive" ? CheckCircle2 : tone === "negative" ? XCircle : TriangleAlert;
  const explanation = result.explanation?.trim() || null;
  return (
    <div
      ref={footerRef}
      data-practice-reveal-footer
      data-quiz-answer-feedback
      data-verdict-tone={tone}
      data-auto-advance={holdMs !== null ? "pending" : "held"}
      data-advance-paused={paused ? "true" : "false"}
      className={cn(
        REVEAL_SLOT,
        "relative flex flex-col gap-0.5 overflow-hidden rounded-lg border px-3 py-1.5 text-left lg:py-2",
        TONE[tone],
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <p role="status" className={cn("flex min-w-0 items-center gap-1.5 text-sm font-semibold", HEAD[tone])}>
          <Icon aria-hidden className="h-4 w-4 shrink-0" />
          {unverified ? "Answer not verified" : result.is_correct ? "Correct!" : "Incorrect"}
        </p>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {!unverified && <CompactSourceLink metadata={question.metadata} />}
          {xp && (
            <span data-testid="practice-xp-earned"
              className="inline-flex items-center gap-1 rounded-full border border-[#c9a84c]/45 bg-[#c9a84c]/10 px-2 py-0.5 text-xs font-bold text-[#f0d78c] lg:text-sm">
              <Sparkles aria-hidden className="h-3 w-3" />
              {xp}
            </span>
          )}
        </span>
      </div>
      {/* No "Correct answer:" line: the revealed grid already marks the right
          tablet, as on Ranked and the Daily, and the line cost the box a row
          on every miss. The results review still lists it per question. */}
      {unverified ? (
        // Short on purpose: with the two actions it has to sit inside the same
        // held box as an ordinary reveal on a 360x640 phone.
        <p data-testid="practice-unverified-note" className="text-[11px] leading-snug text-[#f0e6d2]/85">
          Couldn't check your answer — check your connection.
        </p>
      ) : explanation && (
        <p data-testid="practice-explanation" data-explanation-density={practiceExplanationDensity(explanation)}
          className="practice-explanation text-xs leading-snug text-[#f0e6d2]/85">
          {explanation}
        </p>
      )}
      {!unverified && (
        <div className="hidden lg:block [&>div]:mt-1 [&>div]:pt-1">
          <ProDataSourceLink metadata={question.metadata} />
        </div>
      )}
      {unverified && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <Button type="button" variant="outline" data-testid="practice-skip" onClick={onSkip}
            className={cn(ACTION_BOX, "border-white/20 bg-transparent")}>
            <SkipForward aria-hidden className="h-4 w-4" />
            {isLast ? "Skip to results" : "Skip question"}
          </Button>
          <Button type="button" data-testid="practice-retry-answer" onClick={onRetryAnswer} className={ACTION_BOX}>
            <RotateCcw aria-hidden className="h-4 w-4" />
            Try again
          </Button>
        </div>
      )}
      {holdMs !== null && (
        // How long until the run moves on — a draining hairline, paused with
        // the hold. Decorative: the verdict is announced, the drain is not.
        <span aria-hidden data-testid="practice-advance-meter"
          className="practice-advance-meter"
          data-paused={paused ? "true" : "false"}
          style={{ "--practice-hold-ms": `${holdMs}ms` } as CSSProperties} />
      )}
    </div>
  );
}

/** Before the grade: the reveal's box, holding its height (and the typed
 *  input for the fill-blank format), so revealing never resizes the stage. */
function PracticeHudReserve({
  question, checking, fillBlankValue, onFillBlankChange, onSubmitTyped,
}: {
  question: QuizQuestion;
  checking: boolean;
  fillBlankValue: string;
  onFillBlankChange: (value: string) => void;
  onSubmitTyped: () => void;
}) {
  const typed = question.format === "fill_blank";
  return (
    <div data-practice-hud-reserve className={cn(REVEAL_SLOT, "flex items-center justify-center gap-2")}>
      {typed ? (
        <form className="flex w-full flex-col gap-2 sm:flex-row" onSubmit={(e) => {
          e.preventDefault();
          if (fillBlankValue.trim() && !checking) onSubmitTyped();
        }}>
          <Input value={fillBlankValue} onChange={(e) => onFillBlankChange(e.target.value)}
            placeholder="Type your answer..." aria-label="Your answer" disabled={checking}
            autoFocus className="h-11 text-sm lg:h-9" />
          <Button type="submit" disabled={!fillBlankValue.trim() || checking} className={ACTION_BOX}>
            Submit answer
          </Button>
        </form>
      ) : checking ? (
        <span role="status" data-testid="practice-checking" className="text-xs text-muted-foreground">
          Checking your answer…
        </span>
      ) : null}
    </div>
  );
}

function FramePanel({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="ranked-panel mx-auto w-full max-w-xl space-y-3 p-6 text-center">
      <div className="ranked-eyebrow">{PRACTICE_ARENA_EYEBROW}</div>
      {children}
    </div>
  );
}

export default function PracticeArena({
  phase, questions, currentIndex, selectedAnswer, answerResult, outcomes, score,
  subject, subjectIcon, runKind, sessionXp, progression, errorMessage,
  fillBlankValue, onFillBlankChange, onSelectAnswer, runKey = "0", onAdvance, onRetryAnswer, onSkip,
  onRetry, exitTo = "/lol",
}: PracticeArenaProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const projection = projectPracticeArena({
    questions, currentIndex, selectedAnswer, answerResult, outcomes, score, subject,
  });
  const question = phase === "active" ? questions[currentIndex] ?? null : null;
  const surfaceData = question ? projection.surface : null;
  useQuestionHandoff(rootRef, surfaceData ? `${runKey}:${currentIndex}:${surfaceData.question.questionId}` : null);

  // PM2 — the auto-advance. Armed only for a graded reveal on stage.
  const holdMs = question ? practiceRevealHoldMs(answerResult) : null;
  const revealKey = holdMs !== null ? `${runKey}:${currentIndex}` : null;
  const paused = usePracticeRevealPause(footerRef, revealKey !== null);
  usePracticeAutoAdvance({ revealKey, holdMs, paused, onAdvance });

  const chrome = (
    <PracticeChrome to={exitTo} number={question ? currentIndex + 1 : null} total={questions.length} />
  );

  let view: ArenaViewModel | null = null;
  if (question && surfaceData) {
    const visual = practiceVisual(question);
    const onSelectOption = (option: AnswerOptionView) => onSelectAnswer(option.label);
    const surface: ArenaQuestionSurface = {
      kind: "question",
      ...surfaceData,
      onSelectOption,
      regions: visual ? { media: <PracticeQuestionMedia key={`${currentIndex}:${visual.src}`} visual={visual} /> } : null,
    };
    const hudAction = answerResult ? (
      <PracticeRevealFooter result={answerResult} unverified={projection.unverified}
        question={question} holdMs={holdMs} paused={paused} footerRef={footerRef}
        onRetryAnswer={onRetryAnswer} onSkip={onSkip} isLast={projection.isLast} />
    ) : (
      <PracticeHudReserve question={question} checking={selectedAnswer !== null}
        fillBlankValue={fillBlankValue} onFillBlankChange={onFillBlankChange}
        onSubmitTyped={() => onSelectAnswer(fillBlankValue.trim())} />
    );
    view = {
      report: null,
      header: projection.header,
      roundBeat: null,
      segmentBeat: null,
      cardBeat: null,
      left: {
        kind: "panel",
        node: (
          <PracticeSubjectPanel subject={subject} subjectIcon={subjectIcon} runKind={runKind}
            total={questions.length} question={question} sessionXp={sessionXp}
            progression={progression} />
        ),
      },
      right: {
        kind: "panel",
        node: (
          <ProPlaySessionPanel number={currentIndex + 1} total={questions.length} score={score}
            answered={projection.answered} outcomes={projection.outcomesByNumber} />
        ),
      },
      surface,
      abilityHud: null,
      status: null,
      hudAction,
      timeline: projection.timeline,
      revealHold: false,
      progressionEnabled: false,
      phoneOneScreen: true,
    };
  }

  let intro: ReactNode = null;
  if (!view) {
    intro = phase === "error" ? (
      <FramePanel testId="practice-error">
        <h2 className="ranked-title text-lg font-semibold">Something went wrong</h2>
        <p role="alert" className="text-sm text-muted-foreground">{errorMessage || "Failed to load questions."}</p>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-center">
          <Button type="button" onClick={onRetry} className="min-h-[44px]">Try again</Button>
        </div>
      </FramePanel>
    ) : (
      <FramePanel testId="practice-loading">
        <p role="status" className="text-sm text-muted-foreground">
          {subject ? `Preparing ${subject} questions…` : "Preparing your questions…"}
        </p>
        <div aria-hidden className="mx-auto grid max-w-sm gap-2 pt-1">
          <div className="h-3 rounded bg-white/[0.06] motion-safe:animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-white/[0.06] motion-safe:animate-pulse" />
        </div>
      </FramePanel>
    );
  }

  return (
    <div ref={rootRef} data-testid="practice-arena"
      data-practice-phase={view ? (answerResult ? "revealed" : "question") : phase}
      className={cn("practice-arena", FRAME_CLIP)}>
      {/* ONE arena element for every Practice frame, so loading → question →
          error never remounts it (and with it the arena's report hook). */}
      <CanonicalArena view={view} chrome={chrome}
        recovering={{ eyebrow: PRACTICE_ARENA_EYEBROW, message: "", intro }} />
    </div>
  );
}
