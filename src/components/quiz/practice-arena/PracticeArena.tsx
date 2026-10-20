/**
 * PM1 — the Practice runner, presented in the canonical Ranked arena.
 *
 * `Quiz.tsx` still owns every Practice behaviour: which questions are served,
 * the one submission per question, XP, history sessions, the leave guard,
 * the report publication, replay and the results screen. This component only
 * PRESENTS the run, through the same `CanonicalArena` Ranked and the Pro Play
 * quiz render:
 *
 *  - the CENTRE STAGE is the arena's question member (`ArenaQuestionSurface`):
 *    the canonical scenario surface, the canonical answer grid and its reveal
 *    styling, inside the same folio and three-region footprint as a Ranked
 *    round. Practice's own question art enters through `regions.media`;
 *  - the FLANKS are two `panel`s (desktop only, by the arena's rule): the
 *    subject panel and the run panel Pro Play already draws (`Your run`);
 *  - the HEADER is the arena strip: subject eyebrow, `Question n / N`, and the
 *    graded verdict + awarded XP on the centre display;
 *  - the HUD ROW holds Practice's reveal footer (verdict, correct answer,
 *    explanation, pro-data source, XP) and the Next / See results control;
 *  - the BOTTOM is the canonical finite round strip.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY: matchmaking, an opponent, a timer, a
 * rating, damage, abilities, a reveal hold or a settlement. `report` is null
 * on purpose — Practice publishes its own snapshot (it is the one mode with
 * both a static question id and a question key) and the arena must not
 * publish a second, poorer one over it.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, TriangleAlert, XCircle } from "lucide-react";

import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import ProPlaySessionPanel from "@/components/pro-play/arena/ProPlaySessionPanel";
import ProDataSourceLink from "@/components/quiz/ProDataSourceLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuizAnswerResult, QuizQuestion } from "@/lib/quiz/api";
import type { ArenaQuestionSurface, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import {
  PRACTICE_ARENA_EYEBROW,
  practiceXpLabel,
  projectPracticeArena,
  type PracticeOutcome,
} from "@/lib/quiz/practiceArena";
import { cn } from "@/lib/utils";
import { PracticeQuestionMedia, practiceVisual } from "./PracticeQuestionMedia";
import { PracticeSubjectPanel, type PracticeProgressionView } from "./PracticeSubjectPanel";

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
  onNext: () => void;
  onRetry: () => void;
  /** Where the way back goes. The leave guard intercepts it while unfinished. */
  exitTo?: string;
}

/** See ProPlayArenaRun: the frame's glow bleed is trimmed at the page edge. */
const FRAME_CLIP = "overflow-x-clip";
/** 44px touch target below `lg`; 36px where the stage height is definite. */
const ACTION_BOX = "h-11 min-w-[8.5rem] shrink-0 lg:h-9";
/** The reveal footer's ordinary height from `lg`, held before the grade. */
const FOOTER_MIN_H = "lg:min-h-[3.25rem]";
/** Scrolled into view, a target stops above the floating Report pill. */
const DOCK_SCROLL_MARGIN = "scroll-mb-[calc(var(--mogzy-dock-clearance,0px)+0.5rem)]";

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    || document.documentElement.classList.contains("reduce-motion");
}

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
 * Next mounts a new question under the player: the Next control unmounts and
 * focus falls to the body, and below `lg` the page keeps the reveal footer's
 * scroll offset. So on a NEW question (never the first of a run), and only
 * when focus was stranded, focus moves to the new stem — announced once — and
 * the stem is brought into view below the HUD if it is not already.
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
    revealBelowHud(stem, el.querySelector<HTMLElement>('[data-testid="ranked-header"]') ?? stem);
  }, [root, questionKey]);
}

/**
 * Next / See results. Takes focus when it appears if focus was stranded, and
 * below `lg` brings the whole reveal footer into view above the dock — the
 * explanation is the point of a Practice reveal, not only the button.
 */
function NextControl({ label, onNext }: { label: string; onNext: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focusStranded()) el.focus({ preventScroll: true });
    const target = el.closest<HTMLElement>("[data-practice-reveal-footer]") ?? el;
    const margin = parseFloat(getComputedStyle(target).scrollMarginBottom) || 0;
    if (target.getBoundingClientRect().bottom > window.innerHeight - margin) {
      target.scrollIntoView?.({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }, []);
  return (
    <Button ref={ref} type="button" data-testid="practice-next" onClick={onNext}
      className={cn(ACTION_BOX, DOCK_SCROLL_MARGIN, "gap-2")}>
      {label}
      <ArrowRight aria-hidden className="h-4 w-4" />
    </Button>
  );
}

function ActionReserve() {
  return <span aria-hidden data-practice-action-reserve className={`invisible inline-block ${ACTION_BOX}`} />;
}

/**
 * The reveal footer. Built only from the backend's grade (or, for a failed
 * submit, from the honest "could not verify" notice — never a verdict).
 */
function PracticeRevealFooter({
  result, unverified, question, action,
}: {
  result: QuizAnswerResult;
  unverified: boolean;
  question: QuizQuestion;
  action: ReactNode;
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
  return (
    <div
      data-practice-reveal-footer
      data-quiz-answer-feedback
      data-verdict-tone={tone}
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 rounded-lg border px-3 py-2 text-left sm:flex-row sm:items-center sm:gap-4",
        FOOTER_MIN_H, DOCK_SCROLL_MARGIN, TONE[tone],
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn("flex items-center gap-1.5 text-sm font-semibold", HEAD[tone])}>
          <Icon aria-hidden className="h-4 w-4 shrink-0" />
          {unverified ? "Answer not verified" : result.is_correct ? "Correct!" : "Incorrect"}
        </p>
        {!unverified && !result.is_correct && result.correct_answer && (
          <p className="text-xs text-[#f0e6d2]/90">
            Correct answer: <span className="font-semibold">{result.correct_answer}</span>
          </p>
        )}
        {result.explanation && (
          <p data-testid="practice-explanation" className="text-xs leading-relaxed text-[#f0e6d2]/80">
            {result.explanation}
          </p>
        )}
        {!unverified && <ProDataSourceLink metadata={question.metadata} />}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        {xp && (
          <span data-testid="practice-xp-earned"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a84c]/45 bg-[#c9a84c]/10 px-2.5 py-1 text-sm font-bold text-[#f0d78c]">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            {xp}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

/** Before the grade: the footer's box, holding the action slot (and the typed
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
    <div data-practice-hud-reserve className={cn("flex w-full items-center justify-end gap-2", FOOTER_MIN_H)}>
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
      ) : (
        <>
          {checking && (
            <span role="status" className="mr-auto text-xs text-muted-foreground">Checking your answer…</span>
          )}
          <ActionReserve />
        </>
      )}
    </div>
  );
}

/** The way back, for phones: beside the HUD hat, scrolling with the page. */
function PracticeRouteChrome({ to }: { to: string }) {
  return (
    <div className="h-0 shrink-0">
      {/* The page's one h1 (the lobby's is its wordmark; this phase's is here). */}
      <h1 className="sr-only">{PRACTICE_ARENA_EYEBROW}</h1>
      <Link
        to={to}
        aria-label="Back to League hub"
        data-testid="practice-back"
        className="absolute -top-[calc(var(--app-header-h)+0.75rem)] left-10 z-40 flex h-[var(--app-header-h)]
          items-center gap-1 text-xs text-muted-foreground/80 underline underline-offset-2 transition-colors
          hover:text-muted-foreground lg:hidden"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        League Hub
      </Link>
    </div>
  );
}

/** The same way back, inside the subject panel from `lg`. */
function PanelExit({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="Back to League hub"
      data-testid="practice-back-panel"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#c9a84c]/35 bg-[#0a1428]/70 px-2 py-0.5
        text-[10px] font-semibold text-[#c9a84c] transition-colors hover:border-[#c9a84c] hover:text-[#f0d78c]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70"
    >
      <ArrowLeft aria-hidden className="h-3 w-3" />
      League Hub
    </Link>
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
  fillBlankValue, onFillBlankChange, onSelectAnswer, onNext, onRetry, exitTo = "/lol",
}: PracticeArenaProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const projection = projectPracticeArena({
    questions, currentIndex, selectedAnswer, answerResult, outcomes, score, subject,
  });
  const question = phase === "active" ? questions[currentIndex] ?? null : null;
  const surfaceData = question ? projection.surface : null;
  useQuestionHandoff(rootRef, surfaceData ? `${currentIndex}:${surfaceData.question.questionId}` : null);

  const chrome = <PracticeRouteChrome to={exitTo} />;

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
    const action = answerResult ? (
      <NextControl label={projection.isLast ? "See results" : "Next question"} onNext={onNext} />
    ) : null;
    const hudAction = answerResult ? (
      <PracticeRevealFooter result={answerResult} unverified={projection.unverified}
        question={question} action={action} />
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
            progression={progression} exit={<PanelExit to={exitTo} />} />
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
    <div ref={rootRef} data-testid="practice-arena" data-practice-phase={view ? (answerResult ? "revealed" : "question") : phase}
      className={FRAME_CLIP}>
      {/* ONE arena element for every Practice frame, so loading → question →
          error never remounts it (and with it the arena's report hook). */}
      <CanonicalArena view={view} chrome={chrome}
        recovering={{ eyebrow: PRACTICE_ARENA_EYEBROW, message: "", intro }} />
    </div>
  );
}
