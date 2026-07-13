// ---------------------------------------------------------------------------
// Pure state machine for the ranked 1v1 duel PROTOTYPE (/dev/ranked-duel).
//
// This is frontend mock state only. The `RoundResult` shape below is
// prototype-owned presentation data — it is NOT a proposed production API
// contract, and the damage/XP logic is fixture-driven demonstration, not the
// backend resolver's business logic.
// ---------------------------------------------------------------------------

import {
  DAMAGE,
  DuelClassId,
  FIRST_ANSWER_CUT_SECONDS,
  MOCK_QUESTIONS,
  PlayerId,
  ROUND_SECONDS,
  XP,
  getDuelClass,
  levelForXp,
} from "./fixtures";

export type DuelPhase = "setup" | "question" | "awaiting_reveal" | "reveal" | "match_over";

export type AnswerOutcome = "correct" | "incorrect" | "timed_out";

/** Per-player, per-round hidden submission state. */
export interface RoundPlayerState {
  answerIndex: number | null;
  /** Timer seconds remaining at the moment of submission (higher = faster). */
  answeredAtRemaining: number | null;
  /** Order of answer submission across both players (1 = first). */
  submissionOrder: number | null;
  timedOut: boolean;
  selectedAbilityId: string | null;
  abilityLocked: boolean;
}

/** Persistent per-player match state. */
export interface MatchPlayerState {
  classId: DuelClassId;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
}

/** Prototype mock result — frontend fixture data, not a production schema. */
export interface RoundResultPlayer {
  outcome: AnswerOutcome;
  answerIndex: number | null;
  abilityId: string | null;
  wasFaster: boolean;
  damageDealt: number;
  xpAwarded: number;
  hpAfter: number;
  levelAfter: number;
  leveledUp: boolean;
}

export interface RoundResult {
  round: number;
  questionIndex: number;
  players: Record<PlayerId, RoundResultPlayer>;
  summary: string;
}

export interface DuelState {
  phase: DuelPhase;
  round: number;
  questionIndex: number;
  timerRemaining: number;
  /** The one-time 5s cut has been applied this round. */
  timerShortened: boolean;
  players: Record<PlayerId, MatchPlayerState> | null;
  roundPlayers: Record<PlayerId, RoundPlayerState>;
  lastResult: RoundResult | null;
  log: RoundResult[];
  winner: PlayerId | null;
}

export type DuelAction =
  | { type: "START_MATCH"; classes: Record<PlayerId, DuelClassId> }
  | { type: "SUBMIT_ANSWER"; player: PlayerId; answerIndex: number }
  | { type: "SELECT_ABILITY"; player: PlayerId; abilityId: string | null }
  | { type: "LOCK_ABILITY"; player: PlayerId }
  | { type: "TICK" } // one whole second elapsed
  | { type: "RESOLVE" } // awaiting_reveal -> reveal (after deterministic delay)
  | { type: "NEXT_ROUND" }
  | { type: "RESTART_SAME_CLASSES" }
  | { type: "BACK_TO_SETUP" };

const emptyRoundPlayer = (): RoundPlayerState => ({
  answerIndex: null,
  answeredAtRemaining: null,
  submissionOrder: null,
  timedOut: false,
  selectedAbilityId: null,
  abilityLocked: false,
});

const freshRound = () => ({
  timerRemaining: ROUND_SECONDS,
  timerShortened: false,
  roundPlayers: { p1: emptyRoundPlayer(), p2: emptyRoundPlayer() },
});

export const initialDuelState: DuelState = {
  phase: "setup",
  round: 0,
  questionIndex: 0,
  players: null,
  lastResult: null,
  log: [],
  winner: null,
  ...freshRound(),
};

const PLAYER_IDS: PlayerId[] = ["p1", "p2"];
const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

/** True once a player has both answered and locked an ability. */
export const isSubmissionComplete = (rp: RoundPlayerState): boolean =>
  rp.answerIndex !== null && rp.abilityLocked;

const outcomeFor = (rp: RoundPlayerState, correctIndex: number): AnswerOutcome => {
  if (rp.answerIndex === null) return "timed_out";
  return rp.answerIndex === correctIndex ? "correct" : "incorrect";
};

/**
 * Fixture-driven mock resolution. Damage/XP come from named constants in
 * fixtures.ts; abilities are revealed but have no combat effect in this
 * prototype.
 */
const resolveRound = (state: DuelState): DuelState => {
  const players = state.players!;
  const question = MOCK_QUESTIONS[state.questionIndex];

  const outcomes: Record<PlayerId, AnswerOutcome> = {
    p1: outcomeFor(state.roundPlayers.p1, question.correctIndex),
    p2: outcomeFor(state.roundPlayers.p2, question.correctIndex),
  };

  // Faster = answered with more timer remaining; submission order breaks ties.
  const faster = ((): PlayerId | null => {
    if (outcomes.p1 !== "correct" || outcomes.p2 !== "correct") return null;
    const a = state.roundPlayers.p1;
    const b = state.roundPlayers.p2;
    if (a.answeredAtRemaining! !== b.answeredAtRemaining!) {
      return a.answeredAtRemaining! > b.answeredAtRemaining! ? "p1" : "p2";
    }
    return a.submissionOrder! < b.submissionOrder! ? "p1" : "p2";
  })();

  const damageBy = (p: PlayerId): number => {
    const me = outcomes[p];
    const them = outcomes[other(p)];
    if (me === "correct" && them !== "correct") return DAMAGE.soloCorrect;
    if (me === "correct" && them === "correct") {
      return faster === p ? DAMAGE.bothCorrectFaster : DAMAGE.wash;
    }
    return DAMAGE.wash;
  };

  const xpBy = (p: PlayerId): number =>
    outcomes[p] === "correct" ? XP.correct : outcomes[p] === "incorrect" ? XP.incorrect : XP.timedOut;

  const nextPlayers = { ...players };
  const resultPlayers = {} as Record<PlayerId, RoundResultPlayer>;

  for (const p of PLAYER_IDS) {
    const opp = other(p);
    const hpAfter = Math.max(0, players[p].hp - damageBy(opp));
    const xpAfter = players[p].xp + xpBy(p);
    const levelAfter = levelForXp(xpAfter);
    nextPlayers[p] = { ...players[p], hp: hpAfter, xp: xpAfter, level: levelAfter };
    resultPlayers[p] = {
      outcome: outcomes[p],
      answerIndex: state.roundPlayers[p].answerIndex,
      abilityId: state.roundPlayers[p].selectedAbilityId,
      wasFaster: faster === p,
      damageDealt: damageBy(p),
      xpAwarded: xpBy(p),
      hpAfter,
      levelAfter,
      leveledUp: levelAfter > players[p].level,
    };
  }

  const summary = ((): string => {
    if (outcomes.p1 === "correct" && outcomes.p2 === "correct")
      return `Both correct — ${faster} was faster and deals reduced damage.`;
    if (outcomes.p1 === "correct") return "p1 correct — full damage to p2.";
    if (outcomes.p2 === "correct") return "p2 correct — full damage to p1.";
    return "Neither correct — a wash. Stable XP for both.";
  })();

  const result: RoundResult = {
    round: state.round,
    questionIndex: state.questionIndex,
    players: resultPlayers,
    summary,
  };

  const winner: PlayerId | null =
    nextPlayers.p2.hp <= 0 && nextPlayers.p1.hp > 0
      ? "p1"
      : nextPlayers.p1.hp <= 0 && nextPlayers.p2.hp > 0
        ? "p2"
        : nextPlayers.p1.hp <= 0 && nextPlayers.p2.hp <= 0
          ? (resultPlayers.p1.damageDealt >= resultPlayers.p2.damageDealt ? "p1" : "p2")
          : null;

  return {
    ...state,
    phase: "reveal",
    players: nextPlayers,
    lastResult: result,
    log: [...state.log, result],
    winner,
  };
};

/** Both answers submitted ends the question phase immediately (abilities optional). */
const bothAnswered = (state: DuelState): boolean =>
  PLAYER_IDS.every((p) => state.roundPlayers[p].answerIndex !== null);

const endQuestionPhase = (state: DuelState): DuelState => {
  const roundPlayers = { ...state.roundPlayers };
  for (const p of PLAYER_IDS) {
    if (roundPlayers[p].answerIndex === null) {
      roundPlayers[p] = { ...roundPlayers[p], timedOut: true };
    }
  }
  return { ...state, roundPlayers, phase: "awaiting_reveal" };
};

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  switch (action.type) {
    case "START_MATCH": {
      const mk = (classId: DuelClassId): MatchPlayerState => {
        const cls = getDuelClass(classId);
        return { classId, hp: cls.startingHp, maxHp: cls.startingHp, xp: 0, level: 1 };
      };
      return {
        ...initialDuelState,
        phase: "question",
        round: 1,
        questionIndex: 0,
        players: { p1: mk(action.classes.p1), p2: mk(action.classes.p2) },
        ...freshRound(),
      };
    }

    case "SUBMIT_ANSWER": {
      if (state.phase !== "question") return state;
      const me = state.roundPlayers[action.player];
      if (me.answerIndex !== null) return state; // answers are one-shot

      const isFirstSubmission = !state.timerShortened;
      // First answer of the round cuts the shared timer by 5s, exactly once.
      const timerRemaining = isFirstSubmission
        ? Math.max(0, state.timerRemaining - FIRST_ANSWER_CUT_SECONDS)
        : state.timerRemaining;

      const order =
        (state.roundPlayers[other(action.player)].submissionOrder ?? 0) + 1;

      const next: DuelState = {
        ...state,
        timerRemaining,
        timerShortened: true,
        roundPlayers: {
          ...state.roundPlayers,
          [action.player]: {
            ...me,
            answerIndex: action.answerIndex,
            // Record pre-cut remaining so "faster" reflects actual answer time.
            answeredAtRemaining: state.timerRemaining,
            submissionOrder: order,
          },
        },
      };
      return bothAnswered(next) ? endQuestionPhase(next) : next;
    }

    case "SELECT_ABILITY": {
      if (state.phase !== "question") return state;
      const me = state.roundPlayers[action.player];
      if (me.abilityLocked) return state;
      return {
        ...state,
        roundPlayers: {
          ...state.roundPlayers,
          [action.player]: { ...me, selectedAbilityId: action.abilityId },
        },
      };
    }

    case "LOCK_ABILITY": {
      if (state.phase !== "question") return state;
      const me = state.roundPlayers[action.player];
      if (me.abilityLocked || me.selectedAbilityId === null) return state;
      return {
        ...state,
        roundPlayers: {
          ...state.roundPlayers,
          [action.player]: { ...me, abilityLocked: true },
        },
      };
    }

    case "TICK": {
      // Timer only runs during the question phase.
      if (state.phase !== "question") return state;
      const timerRemaining = Math.max(0, state.timerRemaining - 1);
      const next = { ...state, timerRemaining };
      return timerRemaining === 0 ? endQuestionPhase(next) : next;
    }

    case "RESOLVE":
      if (state.phase !== "awaiting_reveal") return state;
      return resolveRound(state);

    case "NEXT_ROUND": {
      if (state.phase !== "reveal") return state;
      if (state.winner !== null) return { ...state, phase: "match_over" };
      return {
        ...state,
        phase: "question",
        round: state.round + 1,
        questionIndex: (state.questionIndex + 1) % MOCK_QUESTIONS.length,
        ...freshRound(),
      };
    }

    case "RESTART_SAME_CLASSES": {
      if (!state.players) return state;
      return duelReducer(initialDuelState, {
        type: "START_MATCH",
        classes: { p1: state.players.p1.classId, p2: state.players.p2.classId },
      });
    }

    case "BACK_TO_SETUP":
      return initialDuelState;

    default:
      return state;
  }
}
