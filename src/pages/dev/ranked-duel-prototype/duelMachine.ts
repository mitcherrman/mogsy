// ---------------------------------------------------------------------------
// Pure state machine for the ranked 1v1 duel PROTOTYPE (/dev/ranked-duel).
//
// This is frontend mock state only. The `RoundResult` shape below is
// prototype-owned presentation data — it is NOT a proposed production API
// contract, and the damage/XP logic is fixture-driven demonstration, not the
// backend resolver's business logic. Abilities never influence damage,
// timing, HP, XP, or correctness.
// ---------------------------------------------------------------------------

import {
  DAMAGE,
  DuelClassId,
  FIRST_ANSWER_CUT_SECONDS,
  MAX_LEVEL,
  MOCK_QUESTIONS,
  PlayerId,
  ROUND_SECONDS,
  XP,
  getDuelClass,
  levelForXp,
} from "./fixtures";

export type DuelPhase =
  | "setup"
  | "question"
  | "awaiting_reveal"
  | "reveal"
  | "progression"
  | "match_over";

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
  /**
   * The Level 2 normal ability this player locked in, once the progression
   * stop that granted it fully resolves. The unchosen option stays
   * unavailable for the rest of the mock match.
   */
  chosenLevelTwoAbilityId: string | null;
}

/**
 * Per-player state of the current `progression` phase stop. Exists only
 * while phase === "progression"; committed to MatchPlayerState when the stop
 * resolves so primary panels can't leak an in-progress choice.
 */
export interface PlayerProgression {
  /** Level reached this round, or null if this player did not level. */
  newLevel: number | null;
  /** This player must pick one of the class's two Level 2 abilities. */
  needsChoice: boolean;
  /** Current (changeable) pick — hidden from primary panels until reveal. */
  selectedAbilityId: string | null;
  /** Pick explicitly confirmed; can no longer change. */
  confirmed: boolean;
  /** The class ultimate unlocked automatically this stop (Level 3). */
  ultimateUnlocked: boolean;
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
  levelBefore: number;
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
  /** Non-null only while phase === "progression". */
  progression: Record<PlayerId, PlayerProgression> | null;
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
  | { type: "NEXT_ROUND" } // reveal -> progression | question | match_over
  | { type: "CHOOSE_LEVEL_TWO"; player: PlayerId; abilityId: string }
  | { type: "CONFIRM_LEVEL_TWO"; player: PlayerId }
  | { type: "CONTINUE_AFTER_PROGRESSION" } // acknowledged unlock reveal -> next question
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
  progression: null,
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

/** Every player who owes a Level 2 pick has confirmed it. */
export const progressionChoicesComplete = (
  progression: Record<PlayerId, PlayerProgression>,
): boolean => PLAYER_IDS.every((p) => !progression[p].needsChoice || progression[p].confirmed);

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
      levelBefore: players[p].level,
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

/** Advance from a completed round (or progression stop) into the next question. */
const startNextQuestion = (state: DuelState): DuelState => ({
  ...state,
  phase: "question",
  progression: null,
  round: state.round + 1,
  questionIndex: (state.questionIndex + 1) % MOCK_QUESTIONS.length,
  ...freshRound(),
});

/**
 * Progression check run once per round, after reveal. Detects each level
 * transition exactly once via the round result's levelBefore/levelAfter pair
 * (no repeated triggers, no skipped levels — a hypothetical 1→3 jump would
 * surface both the choice and the ultimate in one stop).
 */
const buildProgression = (
  state: DuelState,
): Record<PlayerId, PlayerProgression> | null => {
  const result = state.lastResult!;
  let any = false;
  const progression = {} as Record<PlayerId, PlayerProgression>;
  for (const p of PLAYER_IDS) {
    const { levelBefore, levelAfter } = result.players[p];
    const crossed2 = levelBefore < 2 && levelAfter >= 2;
    const crossed3 = levelBefore < MAX_LEVEL && levelAfter >= MAX_LEVEL;
    const needsChoice = crossed2 && state.players![p].chosenLevelTwoAbilityId === null;
    progression[p] = {
      newLevel: levelAfter > levelBefore ? levelAfter : null,
      needsChoice,
      selectedAbilityId: null,
      confirmed: false,
      ultimateUnlocked: crossed3,
    };
    if (needsChoice || crossed3) any = true;
  }
  return any ? progression : null;
};

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  switch (action.type) {
    case "START_MATCH": {
      const mk = (classId: DuelClassId): MatchPlayerState => {
        const cls = getDuelClass(classId);
        return {
          classId,
          hp: cls.startingHp,
          maxHp: cls.startingHp,
          xp: 0,
          level: 1,
          chosenLevelTwoAbilityId: null,
        };
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
      // Only abilities this player has actually unlocked (starter, confirmed
      // Level 2 pick, ultimate at max level) are selectable in a round.
      if (action.abilityId !== null) {
        const match = state.players![action.player];
        const cls = getDuelClass(match.classId);
        const usable =
          action.abilityId === cls.starterAbility.id ||
          action.abilityId === match.chosenLevelTwoAbilityId ||
          (match.level >= MAX_LEVEL && action.abilityId === cls.ultimate.id);
        if (!usable) return state;
      }
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
      // Match end takes precedence over progression stops.
      if (state.winner !== null) return { ...state, phase: "match_over" };
      const progression = buildProgression(state);
      if (progression) return { ...state, phase: "progression", progression };
      return startNextQuestion(state);
    }

    case "CHOOSE_LEVEL_TWO": {
      // Guards: right phase, this player owes a choice, not yet confirmed,
      // and the ability is one of THIS player's class's two Level 2 options
      // (ultimates and other classes' abilities are rejected).
      if (state.phase !== "progression" || !state.progression) return state;
      const prog = state.progression[action.player];
      if (!prog.needsChoice || prog.confirmed) return state;
      const cls = getDuelClass(state.players![action.player].classId);
      if (!cls.levelTwoChoices.some((a) => a.id === action.abilityId)) return state;
      return {
        ...state,
        progression: {
          ...state.progression,
          [action.player]: { ...prog, selectedAbilityId: action.abilityId },
        },
      };
    }

    case "CONFIRM_LEVEL_TWO": {
      if (state.phase !== "progression" || !state.progression) return state;
      const prog = state.progression[action.player];
      if (!prog.needsChoice || prog.confirmed || prog.selectedAbilityId === null) {
        return state;
      }
      return {
        ...state,
        progression: {
          ...state.progression,
          [action.player]: { ...prog, confirmed: true },
        },
      };
    }

    case "CONTINUE_AFTER_PROGRESSION": {
      // The shared unlock reveal must be acknowledged, and every required
      // Level 2 choice resolved, before the next round can begin.
      if (state.phase !== "progression" || !state.progression) return state;
      if (!progressionChoicesComplete(state.progression)) return state;
      // Commit confirmed picks to match state only now, so primary panels
      // can't show a pick while the other player is still choosing.
      const players = { ...state.players! };
      for (const p of PLAYER_IDS) {
        const prog = state.progression[p];
        if (prog.needsChoice && prog.confirmed) {
          players[p] = { ...players[p], chosenLevelTwoAbilityId: prog.selectedAbilityId };
        }
      }
      return startNextQuestion({ ...state, players });
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
