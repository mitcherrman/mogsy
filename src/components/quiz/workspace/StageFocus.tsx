/**
 * HUB6.1 — Stage Focus: ONE stage of ONE Daily, drawn to its own rules.
 *
 * Layer 2 of History (History → Daily → Stage → Question). It occupies the
 * Daily Focus canvas in place of the Daily Overview — it is never appended
 * beneath it — and each stage kind is drawn as what its ruleset is about:
 *
 *   Standard     the course: every round in played order, each module drawn
 *                as its kind (single question, Meta Reflex, Mastery)
 *   Time Trial   the lane under the bank: settled questions in order, then
 *                how the stage ended
 *   Survival     the path until termination, and how it ended
 *   Weak Areas   the exact questions the stage served, and their results
 *   Review       the exact questions replayed, and each replay's result
 *
 * WHAT IS DRAWN IS WHAT THE RECORD SAYS
 * ─────────────────────────────────────
 * Rounds and their order are HUB2.1's `round_number` / `challenge_index`;
 * each question's result is the History DTO's `outcome`; a round's module
 * kind and art come from the stage's own frozen child-match review, joined by
 * its `match_id` and `round_number` — the documented link, never a guess.
 *
 * Deliberately NOT drawn, because the DTO does not carry them (HUB6.1 audit):
 * per-module points; which occurrence produced a Survival strike; earlier
 * compatible stages' scores, throughput or depths; why a Weak Areas question
 * was selected; which earlier miss a Review question replays. Each is a
 * backend gap, listed in HUB6_HANDOFF.md, and nothing stands in for it.
 *
 * PREMIUM
 * ───────
 * The server's capability decides. With analytics access (`available`,
 * `insufficient_evidence`) the stage's own visual is drawn — the course, the
 * lane, the path — with its ruleset facts. Without it the stage keeps its
 * basic record: result, terminal note and its exact questions on HUB3's
 * timeline. Weak Areas and Review draw their exact questions for everyone:
 * the questions served and their results ARE their basic record.
 */
import {
  ArrowLeft,
  Check,
  Clock,
  Flag,
  Hourglass,
  HelpCircle,
  ShieldCheck,
  ShieldX,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import QuestionInspector from "@/components/quiz/workspace/QuestionInspector";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { resolveQuestionIcon } from "@/components/quiz/workspace/questionIcons";
import { StageAnalysis } from "@/components/quiz/workspace/HistoryAnalysis";
import { OUTCOME_INK, stageTone, type StageTone } from "@/components/quiz/workspace/stageTheme";
import { categoryLabel, endedByNote, stageKindLabel } from "@/components/quiz/workspace/historyFormat";
import { stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import type { DailyStageKind } from "@/lib/daily-challenge/run/contracts";
import { staggered, useReveal } from "@/lib/motion/useReveal";
import type { HistoryQuestion, HistoryRound, HistoryStage } from "@/lib/history/contracts";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";

const KNOWN: readonly string[] = ["standard", "time_trial", "survival", "weak_areas", "review"];

/** The stage's own one-sentence rule, from the Daily's stage identity — the
 *  same sentence its stage intro showed, with its frozen numbers. */
function ruleSentence(stage: HistoryStage): string | null {
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
function stageHasAnalyticsAccess(stage: HistoryStage): boolean {
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

/** The module's own name where the frozen review says it is a module; a
 *  single-question round needs none. The words are the inspector's own. */
function moduleName(r: ReviewRound | null): string | null {
  if (!r) return null;
  return r.kind === "meta_reflex" ? "Meta Reflex" : r.kind === "mastery_slice" ? "Mastery" : null;
}

function NodeArt({ round }: { round: ReviewRound | null }) {
  if (!round) return <HelpCircle className="h-5 w-5" style={{ color: "rgba(96,68,28,0.4)" }} aria-hidden="true" />;
  // The timeline's own resolution (`iconHint`), so a question wears the same
  // art in Stage Focus as on its History rail.
  const icon = resolveQuestionIcon(round.iconHint);
  if (icon.glyph === "meta_reflex") return <Zap className="h-5 w-5" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />;
  if (!icon.src) return <HelpCircle className="h-5 w-5" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />;
  return <img src={icon.src} alt="" aria-hidden="true" loading="lazy" className="h-full w-full object-cover" />;
}

/** A small result mark in the node's corner: shape and glyph, not colour
 *  alone. */
function OutcomeBadge({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null;
  const Icon = OUTCOME_ICON[outcome];
  return (
    <span
      aria-hidden="true"
      data-testid="stage-node-outcome"
      data-outcome={outcome}
      className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border"
      style={{ background: "#f3e6c4", borderColor: OUTCOME_INK[outcome], color: OUTCOME_INK[outcome] }}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}

/** Per-question marks for a multi-question module: filled for correct, a
 *  cross for a miss, hollow for a time-out. */
function QuestionMarks({ round }: { round: HistoryRound }) {
  if (round.questions.length < 2) return null;
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {round.questions.map((q, i) => {
        const o = outcomeOf(q);
        return o === "incorrect" ? (
          <X key={i} className="h-2.5 w-2.5" strokeWidth={3} style={{ color: OUTCOME_INK.incorrect }} />
        ) : (
          <span
            key={i}
            className="block h-2 w-2 rounded-full border"
            style={{
              borderColor: o ? OUTCOME_INK[o] : "rgba(96,68,28,0.3)",
              background: o === "correct" ? OUTCOME_INK.correct : "transparent",
            }}
          />
        );
      })}
    </span>
  );
}

function RoundNode({
  round,
  review,
  position,
  total,
  shown,
  tone,
  showModule,
}: {
  round: HistoryRound;
  review: ReviewRound | null;
  position: number;
  total: number;
  shown: boolean;
  tone: StageTone;
  showModule: boolean;
}) {
  const coarse = useCoarsePointer();
  const outcome = roundOutcome(round);
  const correct = round.questions.filter((q) => q.outcome === "correct").length;
  const module = showModule ? moduleName(review) : null;
  return (
    <div
      className="flex flex-col items-center gap-1 transition-[opacity,transform] duration-300 motion-reduce:transition-none"
      style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(4px) scale(0.85)" }}
      data-testid="stage-path-node"
      data-round={round.roundNumber}
      data-outcome={outcome ?? "unknown"}
      data-module={review?.kind ?? "unknown"}
    >
      <QuestionInspector
        round={review}
        position={position}
        total={total}
        className={`relative grid ${coarse ? "h-12 w-12" : "h-11 w-11"} place-items-center rounded-lg border-2 ${
          review?.kind === "meta_reflex" ? "rounded-full" : ""
        }`}
        style={{
          borderColor: outcome ? OUTCOME_INK[outcome] : "rgba(96,68,28,0.3)",
          background: LEAGUECRAFT_INK.inset,
          boxShadow: review?.kind === "mastery_slice" ? `0 0 0 2px #efe0bb, 0 0 0 3.5px ${tone.edge}` : undefined,
        }}
      >
        <span className={`grid h-full w-full place-items-center overflow-hidden ${review?.kind === "meta_reflex" ? "rounded-full" : "rounded-md"}`}>
          <NodeArt round={review} />
        </span>
        <OutcomeBadge outcome={outcome} />
      </QuestionInspector>
      {(module || round.questions.length > 1) && (
        <span className="flex flex-col items-center gap-0.5 text-[9.5px] leading-none" style={{ color: LEAGUECRAFT_INK.faint }}>
          {module && <span className="font-bold uppercase tracking-[0.1em]" style={{ color: tone.ink }}>{module}</span>}
          {round.questions.length > 1 && (
            <span className="flex items-center gap-1 tabular-nums">
              <QuestionMarks round={round} />
              <span aria-label={`${correct} of ${round.questions.length} correct`}>
                {correct}/{round.questions.length}
              </span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * A stage's rounds in played order, joined by a rule in the stage's ink that
 * reaches each node before it resolves. `start` and `end` are the lane's own
 * markers (Time Trial's bank; the way a stage ended).
 */
function RoundPath({
  stage,
  review,
  tone,
  progress,
  showModule = false,
  start,
  end,
  testId,
}: {
  stage: HistoryStage;
  review: MatchReviewView | null;
  tone: StageTone;
  progress: number;
  showModule?: boolean;
  start?: React.ReactNode;
  end?: React.ReactNode;
  testId: string;
}) {
  const rounds = stage.rounds ?? [];
  const n = rounds.length + (end ? 1 : 0);
  const at = (i: number) => staggered(progress, i, Math.max(1, n), 0.75) > 0.02 || progress >= 1;
  const connector = (shown: boolean, key: string) => (
    <span
      key={key}
      aria-hidden="true"
      className="mt-[22px] block h-[2px] w-3 shrink-0 origin-left self-start rounded-full transition-transform duration-200 motion-reduce:transition-none sm:w-4"
      style={{ background: tone.edge, transform: `scaleX(${shown ? 1 : 0})` }}
    />
  );
  return (
    <ol className="flex flex-wrap items-start gap-y-3" data-testid={testId} aria-label={`${stageKindLabel(stage.kind)} questions`}>
      {start && <li className="flex items-start">{start}{connector(at(0), "c-start")}</li>}
      {rounds.map((round, i) => (
        <li key={round.roundNumber} className="flex items-start">
          {i > 0 && connector(at(i), `c${i}`)}
          <RoundNode
            round={round}
            review={reviewRoundFor(review, round)}
            position={i + 1}
            total={rounds.length}
            shown={at(i)}
            tone={tone}
            showModule={showModule}
          />
        </li>
      ))}
      {end && (
        <li className="flex items-start">
          {rounds.length > 0 && connector(at(n - 1), "c-end")}
          <span
            className="transition-[opacity,transform] duration-300 motion-reduce:transition-none"
            style={{ opacity: at(n - 1) ? 1 : 0, transform: at(n - 1) ? "none" : "scale(0.8)" }}
          >
            {end}
          </span>
        </li>
      )}
    </ol>
  );
}

/** A lane marker: a glyph in the stage's ink, with an optional word under it. */
function Marker({ icon: Icon, tone, word, testId }: { icon: typeof Flag; tone: StageTone; word?: string | null; testId: string }) {
  return (
    <span className="flex flex-col items-center gap-1" data-testid={testId}>
      <span
        className="grid h-11 w-11 place-items-center rounded-full border-2"
        style={{ borderColor: tone.edge, background: tone.tint, color: tone.ink }}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {word && (
        <span className="max-w-[5.5rem] text-center text-[9.5px] font-semibold italic leading-tight" style={{ color: LEAGUECRAFT_INK.faint }}>
          {word}
        </span>
      )}
    </span>
  );
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
            className="flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-[opacity,transform] duration-300 motion-reduce:transition-none"
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
              <NodeArt round={r} />
            </QuestionInspector>
            <span className="min-w-0 flex-1">
              <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
                {i + 1} / {rounds.length}
              </span>
              <span className="block truncate text-[12px] font-semibold" style={{ color: LEAGUECRAFT_INK.strong }} title={subject ?? undefined}>
                {subject ?? stageKindLabel(stage.kind)}
              </span>
            </span>
            {outcome && Icon && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold transition-[opacity,transform] duration-300 motion-reduce:transition-none"
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

// ------------------------------------------------------------ the stage

function StageBand({ stage, tone }: { stage: HistoryStage; tone: StageTone }) {
  const Icon = tone.icon;
  const note = endedByNote(stage.basic.endedBy);
  const rule = ruleSentence(stage);
  const played = stage.basic.answered > 0 || stage.basic.score > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="stage-focus-band">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2"
        style={{ borderColor: tone.edge, background: tone.tint, color: tone.ink }}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
          Stage {stage.order + 1}
        </div>
        <h4 className="text-[19px] font-extrabold leading-tight" style={{ color: tone.ink, textShadow: LEAGUECRAFT_INK.press }}>
          {stageKindLabel(stage.kind)}
        </h4>
        {rule && (
          <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="stage-focus-rule">
            {rule}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-end gap-4 tabular-nums" data-testid="stage-focus-result">
        {played ? (
          <>
            {stage.kind === "standard" && (
              <div className="text-right leading-none">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>
                  Score
                </div>
                <div className="mt-1 text-[24px] font-black" style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}>
                  {stage.basic.score}
                </div>
              </div>
            )}
            <div className="text-right leading-none">
              <div
                className="text-[24px] font-black"
                style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
                aria-label={`${stage.basic.correct} of ${stage.basic.answered} correct`}
              >
                {stage.basic.correct}/{stage.basic.answered}
              </div>
              {note && (
                <div className="mt-1 text-[11px] italic" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="stage-focus-ended">
                  {note}
                </div>
              )}
            </div>
          </>
        ) : (
          <span style={{ color: LEAGUECRAFT_INK.faint }}>—</span>
        )}
      </div>
    </div>
  );
}

/** The stage's own visual, by kind, for a reader with analytics access. */
function StageVisual({
  stage,
  review,
  tone,
  progress,
}: {
  stage: HistoryStage;
  review: MatchReviewView | null;
  tone: StageTone;
  progress: number;
}) {
  const note = endedByNote(stage.basic.endedBy);
  switch (stage.kind) {
    case "standard":
      return <RoundPath stage={stage} review={review} tone={tone} progress={progress} showModule testId="stage-course" />;
    case "time_trial":
      return (
        <RoundPath
          stage={stage}
          review={review}
          tone={tone}
          progress={progress}
          testId="stage-lane"
          start={<Marker icon={Timer} tone={tone} testId="stage-lane-start" />}
          end={
            <Marker
              icon={stage.basic.endedBy === "time_bank_exhausted" ? Hourglass : Flag}
              tone={tone}
              word={note}
              testId="stage-lane-end"
            />
          }
        />
      );
    case "survival":
      return (
        <RoundPath
          stage={stage}
          review={review}
          tone={tone}
          progress={progress}
          showModule
          testId="stage-survival-path"
          end={
            <Marker
              icon={stage.basic.endedBy === "strikes_exhausted" ? ShieldX : ShieldCheck}
              tone={tone}
              word={note}
              testId="stage-survival-end"
            />
          }
        />
      );
    default:
      return null;
  }
}

export default function StageFocus({
  stage,
  review,
  onBack,
  onRetry,
  runCapabilityState,
}: {
  stage: HistoryStage;
  review: MatchReviewView | null;
  onBack: () => void;
  onRetry?: () => void;
  /** The run's capability state: a stage that merely inherits an upsell or an
   *  outage from its run does not repeat it (the run's overview says it once). */
  runCapabilityState: string;
}) {
  const tone = stageTone(stage.kind);
  const reveal = useReveal<HTMLDivElement>({ durationMs: 1100, delayMs: 80 });
  const access = stageHasAnalyticsAccess(stage);
  const exact = stage.kind === "weak_areas" || stage.kind === "review";
  const drawn = stage.rounds !== null && stage.rounds.length > 0;

  let body: React.ReactNode;
  if (drawn && exact) {
    body = (
      <QuestionCards
        stage={stage}
        review={review}
        tone={tone}
        progress={reveal.progress}
        testId={stage.kind === "review" ? "stage-review-replays" : "stage-selected-questions"}
      />
    );
  } else if (drawn && access && KNOWN.includes(stage.kind)) {
    body = <StageVisual stage={stage} review={review} tone={tone} progress={reveal.progress} />;
  } else if (stage.questions.length > 0) {
    // The basic record: the stage's exact questions on HUB3's own timeline.
    body = (
      <QuestionTimeline
        className="justify-start"
        matchId={stage.reviewMatchId ?? ""}
        roundCount={stage.rounds?.length ?? 0}
        review={review}
      />
    );
  } else {
    body = null;
  }

  const inheritsRunState =
    (stage.capability.state === "upgrade_required" || stage.capability.state === "temporarily_unavailable") &&
    stage.capability.state === runCapabilityState;

  return (
    <div
      ref={reveal.ref}
      className="space-y-4"
      data-testid="stage-focus"
      data-stage-kind={stage.kind}
      data-stage-order={stage.order}
    >
      <button
        type="button"
        onClick={onBack}
        data-testid="stage-focus-back"
        className="-ml-1.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-[rgba(96,68,28,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-[44px]"
        style={{ color: LEAGUECRAFT_INK.brass }}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Daily Overview
      </button>

      <div
        className="rounded-lg border px-3 py-3"
        style={{ borderColor: tone.edge, background: `linear-gradient(180deg, ${tone.tint}, transparent 70%)`, borderTopWidth: 3 }}
      >
        <StageBand stage={stage} tone={tone} />
        {body && <div className="mt-4 min-w-0">{body}</div>}
        {access || !inheritsRunState ? (
          <div className="mt-4 border-t pt-3 empty:hidden" style={{ borderColor: tone.edge }}>
            <StageAnalysis stage={stage} onRetry={onRetry} progress={reveal.progress} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
