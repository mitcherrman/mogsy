/**
 * PPQ2-B — the typed shapes the Pro Play Arena projection produces.
 *
 * THE ARENA'S OWN QUESTION SURFACE
 * ────────────────────────────────
 * The shape PPQ2-B hands the Arena's centre stage is PPQ2-A's authoritative
 * `ArenaQuestionSurface` (`arenaView.ts`), imported rather than restated. The
 * `ProPlayArena*` names below are aliases of it, kept so PPQ2-C has one import
 * home for everything this projection produces.
 *
 * Everything else here is PRO PLAY DATA for the PPQ2-C presentation (the
 * dossier rail, the run rail, the reveal, the end summary). It is typed data,
 * never a component: this module must not import any renderer.
 */
import type { ProPlayAnswerResult, ProPlayQuestion, ProPlaySessionState } from "../api";
import type { ProPlayAnswerRequest } from "../answerFlow";
import type {
  ProPlayEvidence,
  ProPlayMetricTag,
  ProPlayRelationship,
  ProPlaySubject,
  ProPlayTag,
} from "../contract";
import type {
  ArenaHeaderView,
  ArenaQuestionSurface,
  ArenaStatusLine,
  QuestionReportRef,
} from "@/lib/ranked-core/arenaView";
import type { ArenaReportIdentity } from "@/lib/ranked-core/reportSnapshot";
import type { RoundTimelineView } from "@/lib/ranked-core/viewTypes";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";

// ───────────────────────────────────────────────────────── controller state

/** What "Try again" does, decided by the failure that produced the error. */
export type ProPlayRecovery =
  /** Resend the IDENTICAL answer request (it is idempotent server-side). */
  | { kind: "answer"; request: ProPlayAnswerRequest }
  /** Re-read the session's current question. */
  | { kind: "resync"; sessionId: string }
  /** Start a new session (the default, and the only option once expired). */
  | { kind: "restart" };

export type ProPlayBusy = "starting" | "answering" | "resyncing" | null;

/** The verdict the SERVER returned for one question. Never computed here. */
export type ProPlayObservedOutcome = "correct" | "incorrect";

/**
 * The whole client-side state of one Pro Play run. Every field is either a
 * server payload held verbatim or a fact about this client's own requests.
 * Nothing here is a score, a grade or an answer key the client derived.
 */
export interface ProPlayArenaState {
  session: ProPlaySessionState | null;
  /** The question on the stage (the answered one, while its reveal shows). */
  question: ProPlayQuestion | null;
  /** The server's grade for `question`, or null before one was received. */
  result: ProPlayAnswerResult | null;
  /** The server marked `result` as a replay of an earlier grade (PPQ0A). */
  resultReplayed: boolean;
  /** The next question, delivered with the grade; mounted only on Next. */
  pendingNext: ProPlayQuestion | null;
  /** The locked choice LABEL (the API takes the label), or null. */
  selected: string | null;
  busy: ProPlayBusy;
  error: { message: string; code: string; status: number } | null;
  recovery: ProPlayRecovery | null;
  /** The session expired server-side; only a restart helps. */
  expired: boolean;
  /**
   * Verdicts received in THIS session, by 1-based question number. Only ever
   * written from a graded response the client actually received, so a question
   * the server graded while the response was lost (and the client then
   * resynchronized past) has no entry: it is unobserved, not guessed.
   */
  outcomes: Readonly<Record<number, ProPlayObservedOutcome>>;
}

// ───────────────────────────────────────────────────────── arena surface

/** Server-side provenance for a reported question: PPQ2-A's `QuestionReportRef`. */
export type ProPlayArenaReportRef = QuestionReportRef;

/** The Arena's question member (PPQ2-A), exactly. */
export type ProPlayArenaQuestionSurface = ArenaQuestionSurface;

/** `ProPlayArenaQuestionSurface` before the controller binds its callback. */
export type ProPlayArenaSurfaceData = Omit<ProPlayArenaQuestionSurface, "onSelectOption">;

// ───────────────────────────────────────────────────────── PPQ2-C data

/**
 * The left rail: what the question IS about. Answer-independent by server
 * construction (`question.context`); null on a backend without the contract.
 */
export interface ProPlayDossierData {
  topic: string;
  relationship: ProPlayRelationship;
  /** Server order. Never re-sorted or filtered here. */
  scopeTags: ProPlayTag[];
  metric: ProPlayMetricTag;
  recent: boolean;
  anchor: ProPlaySubject | null;
  /**
   * One identity per option, aligned to `question.options` by label — or null
   * when ANY option lacks one. All or none, so no option is ever richer than
   * another before the answer.
   */
  optionSubjects: ProPlaySubject[] | null;
}

/** One position of the run, as the run rail and end summary draw it. */
export type ProPlayRunPipState =
  | ProPlayObservedOutcome
  /** The server counts it answered, but this client never saw the grade. */
  | "unobserved"
  | "current"
  | "upcoming";

export interface ProPlayRunPip {
  number: number;
  state: ProPlayRunPipState;
}

/** The right rail. `score`/`answered`/`total` are the server's, verbatim. */
export interface ProPlayRunData {
  sessionId: string;
  questionNumber: number | null;
  total: number;
  answered: number;
  score: number;
  pips: ProPlayRunPip[];
}

/** Post-grading only. Every field is the server's, verbatim. */
export interface ProPlayRevealData {
  isCorrect: boolean;
  /** The server marked this grade a replay of an earlier one. */
  replayed: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  explanation: string;
  /** The structured evidence (Step 1), or null on an older backend. */
  evidence: ProPlayEvidence | null;
}

/** The action under a revealed answer (the arena's `hudAction` slot). */
export interface ProPlayNextAction {
  label: "Next" | "See results";
  enabled: boolean;
}

/** The error panel. `action` names what Try again does; never a guess. */
export interface ProPlayErrorData {
  message: string;
  code: string;
  action: ProPlayRecovery["kind"];
  enabled: boolean;
}

/** The end summary: the server's own score and total, nothing else. */
export interface ProPlayTerminalData {
  sessionId: string;
  score: number;
  total: number;
  answered: number;
  pips: ProPlayRunPip[];
}

export type ProPlayArenaPhase =
  /** No session or question yet (first load, or a restart in flight). */
  | "loading"
  /** A question is on the stage and has not been graded. */
  | "question"
  /** The question on the stage has been graded; its reveal is showing. */
  | "revealed"
  /** The session is complete and the last reveal has been dismissed. */
  | "complete"
  /** Nothing to draw but the error panel. */
  | "error";

/**
 * Everything the Pro Play Arena renders, as data. `surface` is null unless a
 * question is on the stage; `reveal` is null unless it has been graded.
 */
export interface ProPlayArenaProjection {
  phase: ProPlayArenaPhase;
  report: ArenaReportIdentity;
  header: ArenaHeaderView;
  surface: ProPlayArenaSurfaceData | null;
  dossier: ProPlayDossierData | null;
  run: ProPlayRunData | null;
  timeline: RoundTimelineView | null;
  reveal: ProPlayRevealData | null;
  next: ProPlayNextAction | null;
  status: ArenaStatusLine | null;
  error: ProPlayErrorData | null;
  terminal: ProPlayTerminalData | null;
  /**
   * The FB1-4 snapshot for a page that publishes reports itself (today's
   * page). The arena path publishes from `report` + `surface.reportRef`
   * instead. `canonicalAnswer` is present only once the server has graded.
   */
  reportable: ReportableQuestionSnapshot | null;
}
