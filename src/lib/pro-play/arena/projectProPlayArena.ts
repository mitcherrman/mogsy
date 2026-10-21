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

export interface ProPlayArenaProjectionOptions {
  /** The mode label to show before the server's session names a preset. */
  modeLabel?: string;
}

/**
 * W26Q — the arena's mode label. A PRESET session names itself (the server's
 * `session.preset.label`, e.g. "Worlds 2026" → "Worlds 2026 Quiz"); before
 * the session exists the caller's label stands in; otherwise "Pro Play Quiz",
 * so the general quiz renders exactly as before.
 */
export function proPlayModeLabel(
  state: ProPlayArenaState,
  options: ProPlayArenaProjectionOptions = {},
): string {
  const label = state.session?.preset?.label;
  if (typeof label === "string" && label.trim()) return `${label.trim()} Quiz`;
  return options.modeLabel || PRO_PLAY_ARENA_MODE;
}

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

function projectHeader(state: ProPlayArenaState, options: ProPlayArenaProjectionOptions): ArenaHeaderView {
  const q = state.question;
  const title = q
    ? `Question ${q.number} / ${q.total}`
    : state.session?.complete
      ? "Quiz complete"
      : state.busy === "starting" ? "Preparing questions…" : "";
  return {
    eyebrow: proPlayModeLabel(state, options),
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

/**
 * PPQ2-E — THE MARKER STAYS WITH THE QUESTION ON STAGE.
 *
 * The moment a question is graded the server's `answered` counts it, and fed
 * straight through, the strip marked that node resolved and the NEXT one
 * current while the graded question was still on stage until Next (and, on
 * the last question, dropped the marker altogether: the session is complete).
 * The strip now says what the player is looking at: while a graded reveal is
 * on stage its node stays the current one, and the marker moves when Next
 * mounts the next question (or the summary replaces the stage).
 *
 * Presentation only. It changes nothing the server said: `session.answered`,
 * `score` and `complete` are untouched everywhere else (session panel, header
 * detail, summary), and grading and progression are the controller's.
 */
function projectTimeline(state: ProPlayArenaState) {
  const session = state.session;
  if (!session || session.total <= 0) return null;
  const outcomes = new Map<number, ResultKind>();
  for (const [n, v] of Object.entries(state.outcomes)) outcomes.set(Number(n), v);
  const roundNumber = state.question?.number ?? null;
  // The graded question on stage is the one the server just counted.
  const holding = gradedFor(state) !== null && roundNumber !== null && roundNumber <= session.answered;
  return projectRoundTimeline({
    roundNumber,
    completedRounds: holding ? roundNumber - 1 : session.answered,
    segmentRoundNumber: roundNumber,
    settlements: [],
    viewerSlot: "p1",
    totalRounds: session.total,
    outcomes,
    matchOver: session.complete && !holding,
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

/** Worlds reports retain the Leaguecraft category, but have a distinct mode label. */
export function proPlayReportIdentity(state: ProPlayArenaState): ArenaReportIdentity {
  return state.session?.preset?.id === "worlds_2026"
    ? { ...PRO_PLAY_REPORT_IDENTITY, mode: "Worlds 2026 Quiz" }
    : PRO_PLAY_REPORT_IDENTITY;
}

/** The FB1-4 snapshot. The answer rides along only once the server graded. */
export function projectProPlayReportable(
  state: ProPlayArenaState,
): ReportableQuestionSnapshot | null {
  const q = state.question;
  if (!q) return null;
  const graded = gradedFor(state);
  return {
    category: proPlayReportIdentity(state).category,
    mode: proPlayReportIdentity(state).mode,
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

export function projectProPlayArena(
  state: ProPlayArenaState,
  options: ProPlayArenaProjectionOptions = {},
): ProPlayArenaProjection {
  const error = projectError(state);
  return {
    phase: projectPhase(state),
    report: proPlayReportIdentity(state),
    header: projectHeader(state, options),
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
