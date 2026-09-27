/**
 * HUB6.1 → HUB6.2 — one stage's analytics INSIDE its expanded Daily.
 *
 * HUB6.2 (owner correction): a selected stage is never a screen of its own.
 * The expanded Daily keeps every stage row and every question rail where
 * they were; the selected stage's ROW is emphasised in place and gains its
 * quick facts (`StageLocalFacts`), and the Daily's one analytics region
 * changes to that stage's deeper visual (`StageAnalyticsView`). This file
 * owns both halves; `DailyRunRow` places them.
 *
 * HUB6.3E: with Premium analytics the region shows the stage's analytics
 * room (`analytics/TimeTrialRoom`, `StandardRoom`, `SurvivalRoom`,
 * `ReviewRoom`); HUB6.2's course / lane / path visuals are gone (one
 * analytics system). Free readers and older payloads keep the stage's exact
 * questions and results as cards. The selected row's quick facts
 * (`StageLocalFacts`) are Free, and stay on the row.
 */
import {
  Check,
  Clock,
  Flag,
  Hourglass,
  HelpCircle,
  ShieldCheck,
  ShieldX,
  Timer,
  X,
} from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import QuestionInspector from "@/components/quiz/workspace/QuestionInspector";
import ModuleSigil, { hasModuleSigil } from "@/components/quiz/workspace/ModuleSigil";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { resolveQuestionIcon } from "@/components/quiz/workspace/questionIcons";
import { PremiumInvitation, Unavailable } from "@/components/quiz/workspace/HistoryAnalysis";
import { Pips } from "@/components/quiz/workspace/historyVisuals";
import { stageCurrentFacts } from "@/components/quiz/workspace/historyViewModel";
import {
  COMPLETION_LABEL,
  correctOfPlayed,
  questionsPlayed,
  wholePercent,
} from "@/components/quiz/workspace/historyComparisons";
import { OUTCOME_INK, stageTone, type StageTone } from "@/components/quiz/workspace/stageTheme";
import { categoryLabel, endedByNote, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import type { DailyStageKind } from "@/lib/daily-challenge/run/contracts";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { DailyHistoryRecord, HistoryQuestion, HistoryRound, HistoryStage } from "@/lib/history/contracts";
import TimeTrialRoom from "@/components/quiz/workspace/analytics/TimeTrialRoom";
import StandardRoom from "@/components/quiz/workspace/analytics/StandardRoom";
import SurvivalRoom from "@/components/quiz/workspace/analytics/SurvivalRoom";
import { ReviewRoom, WeakAreasRoom } from "@/components/quiz/workspace/analytics/ReviewRoom";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";

const KNOWN: readonly string[] = ["standard", "time_trial", "survival", "weak_areas", "review"];

/** The stage's own one-sentence rule, from the Daily's stage identity — the
 *  same sentence its stage intro showed, with its frozen numbers. */
export function ruleSentence(stage: HistoryStage): string | null {
  if (!KNOWN.includes(stage.kind)) return null;
  const rulesetId = stage.ruleset.id && KNOWN.includes(stage.ruleset.id) ? stage.ruleset.id : stage.kind;
  return stageIdentity({
    kind: stage.kind as DailyStageKind,
    ruleset: {
      id: rulesetId as never,
      timeBankMs: stage.ruleset.timeBankMs,
      maxStrikes: stage.ruleset.maxStrikes,
    },
  }).rule;
}

/** Whether the server granted this stage its analytics (Premium). */
function hasAnalyticsAccess(stage: HistoryStage): boolean {
  return stage.capability.state === "available" || stage.capability.state === "insufficient_evidence";
}

// ------------------------------------------------------------ rounds

type Outcome = "correct" | "incorrect" | "timeout";

/** One question's result, exactly as persisted. An unknown outcome string is
 *  shown as unanswered rather than coerced into a verdict. */
function outcomeOf(q: HistoryQuestion): Outcome | null {
  return q.outcome === "correct" || q.outcome === "incorrect" || q.outcome === "timeout" ? q.outcome : null;
}

/** A round's mark: correct only on a clean sweep, incorrect on any miss,
 *  timeout when time ran out with nothing missed — never rounded upward. */
function roundOutcome(round: HistoryRound): Outcome | null {
  const all = round.questions.map(outcomeOf);
  if (all.some((o) => o === "incorrect")) return "incorrect";
  if (all.some((o) => o === "timeout")) return "timeout";
  if (all.length > 0 && all.every((o) => o === "correct")) return "correct";
  return null;
}

const OUTCOME_ICON = { correct: Check, incorrect: X, timeout: Clock } as const;
const OUTCOME_WORD = { correct: "correct", incorrect: "incorrect", timeout: "timed out" } as const;

function reviewRoundFor(review: MatchReviewView | null, round: HistoryRound): ReviewRound | null {
  return review?.rounds.find((r) => r.roundNumber === round.roundNumber) ?? null;
}

/**
 * A question's face. Fallback order (HUB6.2): the backend's proven entity or
 * category art; else the module's own sigil (Mastery, Meta Reflex); else the
 * "no picture" mark — only when nothing authoritative exists.
 */
function NodeArt({ round, tone, large = false }: { round: ReviewRound | null; tone: StageTone; large?: boolean }) {
  const size = large ? "h-6 w-6" : "h-5 w-5";
  if (!round) return <HelpCircle className={size} style={{ color: "rgba(96,68,28,0.4)" }} aria-hidden="true" />;
  const icon = resolveQuestionIcon(round.iconHint);
  if (icon.src) return <img src={icon.src} alt="" aria-hidden="true" loading="lazy" className="h-full w-full object-cover" />;
  if (hasModuleSigil(round)) return <ModuleSigil kind={round.kind} className={size} ink={tone.ink} />;
  return <HelpCircle className={size} style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />;
}

// ------------------------------------------------------------ exact questions (Weak Areas, Review)

/**
 * The exact questions a Weak Areas stage served, or a Review stage replayed,
 * each with its result. For Review each card is one replay; its result lands
 * after its question. Nothing here says where a question came from: the DTO
 * does not link a selection or a replay to its source (HUB6.1 audit).
 */
function QuestionCards({
  stage,
  review,
  tone,
  progress,
  testId,
}: {
  stage: HistoryStage;
  review: MatchReviewView | null;
  tone: StageTone;
  progress: number;
  testId: string;
}) {
  const rounds = stage.rounds ?? [];
  return (
    <ol className="grid gap-2 [@container(min-width:30rem)]:grid-cols-2 [@container(min-width:48rem)]:grid-cols-3" data-testid={testId}>
      {rounds.map((round, i) => {
        const r = reviewRoundFor(review, round);
        const outcome = roundOutcome(round);
        const q = round.questions[0];
        const subject = q?.subjectLabel ?? (q?.category ? categoryLabel(q.category) : null);
        const p = staggered(progress, i, Math.max(1, rounds.length), 0.6);
        const Icon = outcome ? OUTCOME_ICON[outcome] : null;
        return (
          <li
            key={round.roundNumber}
            // Wraps: on the narrowest sheet at 200% text the result drops to
            // its own line rather than past the card's edge.
            className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border px-2.5 py-2 transition-[opacity,transform] duration-300 motion-reduce:transition-none"
            style={{
              borderColor: tone.edge,
              background: tone.tint,
              opacity: p > 0.02 || progress >= 1 ? 1 : 0,
              transform: p > 0.02 || progress >= 1 ? "none" : "translateY(4px)",
            }}
            data-testid="stage-question-card"
            data-outcome={outcome ?? "unknown"}
          >
            <QuestionInspector
              round={r}
              position={i + 1}
              total={rounds.length}
              className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border-2"
              style={{ borderColor: outcome ? OUTCOME_INK[outcome] : "rgba(96,68,28,0.3)", background: LEAGUECRAFT_INK.inset }}
            >
              <NodeArt round={r} tone={tone} />
            </QuestionInspector>
            <span className="min-w-0 flex-1 basis-[6rem]">
              <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
                {i + 1} / {rounds.length}
              </span>
              <span className="block truncate text-[12px] font-semibold" style={{ color: LEAGUECRAFT_INK.strong }} title={subject ?? undefined}>
                {subject ?? stageKindLabel(stage.kind)}
              </span>
            </span>
            {outcome && Icon && (
              <span
                className="ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold transition-[opacity,transform] duration-300 motion-reduce:transition-none"
                style={{
                  borderColor: OUTCOME_INK[outcome],
                  color: OUTCOME_INK[outcome],
                  // The replay's result lands after its question.
                  opacity: p >= 0.7 || progress >= 1 ? 1 : 0,
                  transform: p >= 0.7 || progress >= 1 ? "none" : "scale(0.7)",
                }}
                data-testid="stage-question-result"
              >
                <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                {OUTCOME_WORD[outcome]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------ local facts (the selected row)

/**
 * The selected stage's QUICK facts, shown on its own row under its question
 * rail: the stage's rule sentence (frozen numbers), then the current
 * attempt's own facts, by kind (HUB6.3D):
 *
 *   Standard     score · C / played · accuracy · longest streak
 *   Time Trial   C / played · accuracy · longest streak · how it ended
 *   Survival     depth · strikes used · C / played · accuracy · longest streak
 *   Weak Areas,
 *   Review       C / played · accuracy
 *
 * Every one is a fact of THIS attempt, so every one is Free (owner tier
 * rule): the server's HUB6.3B value where it sent one, else the record's own
 * count by the server's definition (`stageCurrentFacts`). Comparisons,
 * records and series are Premium and live in the analytics region.
 */
export function StageLocalFacts({ stage }: { stage: HistoryStage }) {
  const tone = stageTone(stage.kind);
  const rule = ruleSentence(stage);
  const f = stageCurrentFacts(stage);
  const label = (text: string) => (
    <span className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: LEAGUECRAFT_INK.faint }}>{text}</span>
  );
  const fact = (testId: string, name: string, value: React.ReactNode, aria?: string) => (
    <span key={testId} className="inline-flex items-baseline gap-1.5" data-testid={testId} aria-label={aria}>
      {label(name)}
      <span className="text-[13px] font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{value}</span>
    </span>
  );
  const played = f.questionsPlayed > 0;
  const facts: React.ReactNode[] = [];
  if (stage.kind === "standard") facts.push(fact("stage-fact-score", "Score", f.score ?? stage.basic.score));
  if (stage.kind === "survival" && f.depth !== null) facts.push(fact("stage-analysis-depth", "Depth", f.depth));
  if (stage.kind === "survival" && f.strikesUsed !== null) {
    facts.push(
      <span key="strikes" className="inline-flex items-center gap-1.5" data-testid="stage-analysis-strikes">
        {label("Strikes used")}
        {f.maxStrikes !== null && <Pips used={f.strikesUsed} max={f.maxStrikes} ink={tone.ink} />}
        <span className="text-[13px] font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
          {f.maxStrikes !== null ? `${f.strikesUsed} of ${f.maxStrikes}` : String(f.strikesUsed)}
        </span>
      </span>,
    );
  }
  facts.push(
    fact(
      "stage-fact-played",
      "Correct",
      `${f.correct} / ${f.questionsPlayed}`,
      `${correctOfPlayed(f.correct, f.questionsPlayed)}, ${questionsPlayed(f.questionsPlayed)}`,
    ),
  );
  if (played && f.accuracy !== null) facts.push(fact("stage-fact-accuracy", "Accuracy", `${wholePercent(f.accuracy)}%`));
  const streakKinds = ["standard", "time_trial", "survival"];
  if (streakKinds.includes(stage.kind) && f.longestStreak !== null && played) {
    facts.push(fact("stage-fact-streak", "Longest streak", f.longestStreak));
  }
  if (stage.kind === "time_trial") {
    const ended = timeTrialEnding(f.completionReason ?? stage.basic.endedBy);
    if (ended) facts.push(fact("stage-fact-ended", "Ended", ended));
  }
  if (!rule && facts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" data-testid="stage-local-facts">
      {rule && (
        <span className="basis-full text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="stage-rule">
          {rule}
        </span>
      )}
      {facts}
    </div>
  );
}

/** How a Time Trial ended, in the recap's words. */
function timeTrialEnding(reason: string | null): string | null {
  if (!reason) return null;
  if (COMPLETION_LABEL[reason]) return COMPLETION_LABEL[reason];
  return reason === "segments_complete" || reason === "completed" ? "Every question played" : null;
}

// ------------------------------------------------------------ the region view

/** HUB6.3E: the stage carries HUB6.3B's analytics facts (an older HUB2.3
 *  payload does not, and keeps its exact question cards). */
function hasRoomData(stage: HistoryStage): boolean {
  const f = stage.analytics?.personalFacts;
  return !!f && (f.current !== null || f.categories.length > 0 || f.outcomes !== null);
}

/**
 * The analytics region's content for ONE selected stage.
 *
 * HUB6.3E: with Premium analytics, the stage's own analytics ROOM (Time
 * Trial, Standard, Survival, Review, Weak Areas — `analytics/*`), which
 * replaces HUB6.2's course / lane / path visuals: one analytics system.
 * Without them (Free, or an older payload), every stage shows its exact
 * questions and results, never a second invitation: `upgrade_required` and
 * `temporarily_unavailable` are decided for the run and said ONCE, in its
 * Daily Overview (HUB4's one-invitation rule). A stage whose own state
 * differs from its run's still says so here — a retry, never an upsell.
 */
export function StageAnalyticsView({
  record,
  stage,
  review,
  onRetry,
  runCapabilityState,
}: {
  record: DailyHistoryRecord;
  stage: HistoryStage;
  review: MatchReviewView | null;
  onRetry?: () => void;
  runCapabilityState: string;
}) {
  const tone = stageTone(stage.kind);
  const Icon = tone.icon;
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1100, delayMs: 180 });
  const access = hasAnalyticsAccess(stage);
  const drawn = stage.rounds !== null && stage.rounds.length > 0;
  const room = access && drawn && hasRoomData(stage);

  let body: React.ReactNode;
  if (room && stage.kind === "time_trial") body = <TimeTrialRoom stage={stage} />;
  else if (room && stage.kind === "standard") body = <StandardRoom stage={stage} />;
  else if (room && stage.kind === "survival") body = <SurvivalRoom stage={stage} />;
  else if (room && stage.kind === "review") body = <ReviewRoom record={record} stage={stage} />;
  else if (room && stage.kind === "weak_areas") body = <WeakAreasRoom stage={stage} />;
  else if (drawn && (stage.kind === "weak_areas" || stage.kind === "review")) {
    body = (
      <QuestionCards
        stage={stage}
        review={review}
        tone={tone}
        progress={reveal.progress}
        testId={stage.kind === "review" ? "stage-review-replays" : "stage-selected-questions"}
      />
    );
  } else if (stage.capability.state === "upgrade_required" && runCapabilityState !== "upgrade_required") {
    body = <PremiumInvitation testId="stage-analysis-upgrade" />;
  } else if (stage.capability.state === "temporarily_unavailable" && runCapabilityState !== "temporarily_unavailable") {
    body = <Unavailable onRetry={onRetry} testId="stage-analysis-unavailable" />;
  } else if (stage.questions.length > 0) {
    // No analytics of its own here: the stage's exact questions and results.
    body = drawn ? (
      <QuestionCards stage={stage} review={review} tone={tone} progress={reveal.progress} testId="stage-questions" />
    ) : (
      <QuestionTimeline className="justify-start" matchId={stage.reviewMatchId ?? ""} roundCount={0} review={review} />
    );
  } else {
    body = null;
  }

  return (
    <div
      ref={reveal.ref}
      className="min-w-0 space-y-3"
      data-testid="stage-analytics"
      data-stage-kind={stage.kind}
      data-stage-order={stage.order}
      data-state={stage.capability.state}
      data-room={room ? stage.kind : undefined}
    >
      {/* Names the stage whose row is lit above, in the same ink and glyph. */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.ink }}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>{stage.order + 1}</span>
        {stageKindLabel(stage.kind)}
        {room && <span style={{ color: LEAGUECRAFT_INK.faint }}>· analytics</span>}
      </div>
      {body}
    </div>
  );
}
