/**
 * PPQ2-B — Pro Play run state → the neutral Arena view, as data.
 *
 * A pure function of `ProPlayArenaState`. It decides nothing the server has
 * not already decided:
 *
 *  - OPTIONS are the server's `choices`, in the server's order, each keyed by
 *    its index (`AnswerOptionView.id = String(index)`), exactly as the module
 *    path keys a Ranked option.
 *  - THE REVEAL exists only once the server has returned a grade for the
 *    question on the stage. Before that, `surface.reveal`, `reveal`,
 *    `reportable.canonicalAnswer` and every evidence field are null by
 *    construction: the pre-answer branch never reads `result` at all.
 *  - SCORE, TOTAL and ANSWERED are the server's session counters, verbatim.
 *    The only local fact is WHICH verdicts this client received, and a
 *    position whose grade it never received is `unobserved`, not guessed.
 *  - Nothing here names an opponent, a match, HP, a rating or damage. The
 *    timeline is the canonical finite-plan strip fed with stated outcomes and
 *    no settlements, which is ARENA1 Step 5's solo-mode path.
 *
 * `question.presentation` (legacy) and `result.reveal` (legacy) are never read.
 */
import { asEvidence, asQuestionContext, RECENT_ESPORTS_TAG } from "../contract";
import type { ProPlayQuestion } from "../api";
import { projectRoundTimeline } from "@/lib/ranked-core/roundTimeline";
import {
  NO_INTERACTIONS,
  type AnswerOptionView,
  type InteractionPermissions,
  type QuestionView,
  type ResultKind,
} from "@/lib/ranked-core/viewTypes";
import type { ArenaHeaderView } from "@/lib/ranked-core/arenaView";
import type { ArenaReportIdentity } from "@/lib/ranked-core/reportSnapshot";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";
import type {
  ProPlayArenaPhase,
  ProPlayArenaProjection,
  ProPlayArenaState,
  ProPlayArenaSurfaceData,
  ProPlayDossierData,
  ProPlayErrorData,
  ProPlayNextAction,
  ProPlayRevealData,
  ProPlayRunData,
  ProPlayRunPip,
  ProPlayTerminalData,
} from "./types";

export const PRO_PLAY_ARENA_MODE = "Pro Play Quiz";

/** The arena's report identity (FB1-4). The same filing the page uses today. */
export const PRO_PLAY_REPORT_IDENTITY: ArenaReportIdentity = Object.freeze({
  mode: PRO_PLAY_ARENA_MODE,
  category: "Leaguecraft",
}) as ArenaReportIdentity;

/** Server choice order → neutral options. Order and labels are untouched. */
export function projectProPlayOptions(question: ProPlayQuestion): AnswerOptionView[] {
  return question.choices.map((label, index) => ({ id: String(index), index, label }));
}

/** The neutral question view. Only pre-answer fields are read. */
export function projectProPlayQuestion(question: ProPlayQuestion): QuestionView {
  return {
    questionId: question.question_id,
    prompt: question.question_text,
    options: projectProPlayOptions(question),
    category: question.topic || null,
  };
}

/**
 * A choice label → its option id, or null. Presentation lookup only: the
 * label it is given is always one the server sent (the player's locked choice
 * or the server's `correct_answer`); it is never compared with another.
 */
export function optionIdForLabel(question: ProPlayQuestion, label: string | null): string | null {
  if (label === null) return null;
  const index = question.choices.indexOf(label);
  return index >= 0 ? String(index) : null;
}

const SELECTABLE: InteractionPermissions = Object.freeze({
  ...NO_INTERACTIONS,
  canSelectAnswer: true,
});

/** The grade, if (and only if) the server returned one for this question. */
function gradedFor(state: ProPlayArenaState) {
  return state.question && state.result ? state.result : null;
}

function projectHeader(state: ProPlayArenaState): ArenaHeaderView {
  const q = state.question;
  const title = q
    ? `Question ${q.number} / ${q.total}`
    : state.session?.complete
      ? "Quiz complete"
      : state.busy === "starting" ? "Preparing questions…" : "";
  return {
    eyebrow: PRO_PLAY_ARENA_MODE,
    title,
    transitionNote: null,
    playtestNote: null,
    presenceNote: null,
    timer: null,
    timerLabel: "",
  };
}

function projectSurface(state: ProPlayArenaState): ProPlayArenaSurfaceData | null {
  const q = state.question;
  if (!q) return null;
  const graded = gradedFor(state);
  const open = !graded && state.busy === null && state.error === null
    && state.selected === null && !state.expired;
  const reveal: SurfaceReveal | null = graded
    ? {
      revealed: true,
      isCorrect: graded.is_correct,
      correctOptionId: optionIdForLabel(q, graded.correct_answer),
      // The prose explanation stays off the shared surface (handoff §A9):
      // it still carries internal copy (PPQ1 Q4). It travels in `reveal` below.
      explanation: null,
    }
    : null;
  return {
    kind: "question",
    question: projectProPlayQuestion(q),
    selectedOptionId: optionIdForLabel(q, state.selected),
    permissions: open ? SELECTABLE : NO_INTERACTIONS,
    reveal,
    inputOpen: open,
    reportRef: {
      sessionId: state.session?.session_id ?? null,
      questionNumber: q.number,
    },
  };
}

function projectDossier(question: ProPlayQuestion | null): ProPlayDossierData | null {
  if (!question) return null;
  const context = asQuestionContext(question.context);
  if (!context) return null;
  const byLabel = new Map(context.subjects.map((s) => [s.label, s]));
  const aligned = question.choices.map((label) => byLabel.get(label) ?? null);
  return {
    topic: question.topic,
    relationship: context.relationship,
    scopeTags: context.scope_tags,
    metric: context.metric,
    recent: context.editorial_tags.some((t) => t?.id === RECENT_ESPORTS_TAG),
    anchor: context.anchor,
    optionSubjects: aligned.every((s) => s !== null) ? (aligned as NonNullable<typeof aligned[number]>[]) : null,
  };
}

/** Every position of the run, from the server's counters and received grades. */
export function projectRunPips(state: ProPlayArenaState): ProPlayRunPip[] {
  const session = state.session;
  if (!session) return [];
  const current = session.complete ? null : (state.question?.number ?? null);
  const pips: ProPlayRunPip[] = [];
  for (let n = 1; n <= session.total; n += 1) {
    const observed = state.outcomes[n];
    const state_: ProPlayRunPip["state"] = observed
      ? observed
      : n === current && !state.result
        ? "current"
        : n <= session.answered ? "unobserved" : "upcoming";
    pips.push({ number: n, state: state_ });
  }
  return pips;
}

function projectRun(state: ProPlayArenaState): ProPlayRunData | null {
  const session = state.session;
  if (!session) return null;
  return {
    sessionId: session.session_id,
    questionNumber: state.question?.number ?? null,
    total: session.total,
    answered: session.answered,
    score: session.score,
    pips: projectRunPips(state),
  };
}

function projectTimeline(state: ProPlayArenaState) {
  const session = state.session;
  if (!session || session.total <= 0) return null;
  const outcomes = new Map<number, ResultKind>();
  for (const [n, v] of Object.entries(state.outcomes)) outcomes.set(Number(n), v);
  const roundNumber = state.question?.number ?? null;
  return projectRoundTimeline({
    roundNumber,
    completedRounds: session.answered,
    segmentRoundNumber: roundNumber,
    settlements: [],
    viewerSlot: "p1",
    totalRounds: session.total,
    outcomes,
    matchOver: session.complete,
  });
}

function projectReveal(state: ProPlayArenaState): ProPlayRevealData | null {
  const q = state.question;
  const graded = gradedFor(state);
  if (!q || !graded) return null;
  return {
    isCorrect: graded.is_correct,
    replayed: state.resultReplayed,
    selectedAnswer: graded.selected_answer,
    correctAnswer: graded.correct_answer,
    selectedOptionId: optionIdForLabel(q, graded.selected_answer),
    correctOptionId: optionIdForLabel(q, graded.correct_answer),
    explanation: graded.explanation,
    evidence: asEvidence(graded.evidence),
  };
}

function projectNext(state: ProPlayArenaState): ProPlayNextAction | null {
  if (!gradedFor(state)) return null;
  return {
    label: state.session?.complete ? "See results" : "Next",
    enabled: state.busy === null,
  };
}

function projectError(state: ProPlayArenaState): ProPlayErrorData | null {
  if (!state.error) return null;
  return {
    message: state.error.message,
    code: state.error.code,
    action: state.recovery?.kind ?? "restart",
    enabled: state.busy === null,
  };
}

function projectTerminal(state: ProPlayArenaState): ProPlayTerminalData | null {
  const session = state.session;
  if (!session?.complete || state.result || state.question) return null;
  return {
    sessionId: session.session_id,
    score: session.score,
    total: session.total,
    answered: session.answered,
    pips: projectRunPips(state),
  };
}

/** The FB1-4 snapshot. The answer rides along only once the server graded. */
export function projectProPlayReportable(
  state: ProPlayArenaState,
): ReportableQuestionSnapshot | null {
  const q = state.question;
  if (!q) return null;
  const graded = gradedFor(state);
  return {
    category: PRO_PLAY_REPORT_IDENTITY.category,
    mode: PRO_PLAY_REPORT_IDENTITY.mode,
    runtimeQuestionId: q.question_id,
    prompt: q.question_text,
    choices: q.choices,
    selectedAnswer: state.selected,
    canonicalAnswer: graded ? graded.correct_answer : null,
    questionType: q.topic,
    sessionId: state.session?.session_id ?? null,
    roundNumber: q.number,
  };
}

function projectPhase(state: ProPlayArenaState): ProPlayArenaPhase {
  if (state.error && !state.question) return "error";
  if (state.question) return gradedFor(state) ? "revealed" : "question";
  if (state.session?.complete) return "complete";
  if (state.error) return "error";
  return "loading";
}

export function projectProPlayArena(state: ProPlayArenaState): ProPlayArenaProjection {
  const error = projectError(state);
  return {
    phase: projectPhase(state),
    report: PRO_PLAY_REPORT_IDENTITY,
    header: projectHeader(state),
    surface: projectSurface(state),
    dossier: projectDossier(state.question),
    run: projectRun(state),
    timeline: projectTimeline(state),
    reveal: projectReveal(state),
    next: projectNext(state),
    status: error ? { text: error.message, isError: true } : null,
    error,
    terminal: projectTerminal(state),
    reportable: projectProPlayReportable(state),
  };
}
