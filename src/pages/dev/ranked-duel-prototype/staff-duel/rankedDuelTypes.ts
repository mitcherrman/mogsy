// ---------------------------------------------------------------------------
// Narrow, tolerant types for the PLAYABLE staff duel lifecycle (backend
// commits 8d9520e / de04485 / b873246).
//
// Deliberately different from @/lib/ranked-core/transport: those validators are
// exact-key-set strict (five envelope fields only), which is correct for the
// read-only inspection surface but structurally rejects the playable
// endpoints — the live public body now carries additive `question` and
// `progression_pending_players` fields. Here we model ONLY the fields this UI
// consumes and tolerate unknown additive fields, per the transport's additive
// contract.
//
// Nothing in this file computes damage, HP, XP, levels, charges, timers,
// correctness, or winners. Every value is passed through from the backend.
// ---------------------------------------------------------------------------

export type ClassId = "tank" | "mage" | "marksman";
export type ExperimentArm = "control_hp_170" | "treatment_hp_160";

export const CLASS_OPTIONS: { value: ClassId; label: string }[] = [
  { value: "tank", label: "TANK" },
  { value: "mage", label: "MAGE" },
  { value: "marksman", label: "MARKSMAN" },
];

export const EXPERIMENT_OPTIONS: ExperimentArm[] = ["control_hp_170", "treatment_hp_160"];

/** A player's public row — never contains a selected ability id or answer. */
export interface PublicPlayer {
  playerId: string;
  classId: string;
  hp: number;
  totalXp: number;
  level: number;
  hasSubmitted: boolean;
  abilitySelectionPhase: string | null;
  hasAbilitySelected: boolean | null;
}

export interface PublicActiveRound {
  roundNumber: number;
  activeDeadline: string | null;
  durationSeconds: number;
  pressureApplied: boolean;
}

/** Prompt + options only. The backend never sends the correct option here. */
export interface PublicQuestion {
  questionId: string;
  prompt: string;
  options: string[];
  category: string | null;
}

export interface PublicRoundView {
  matchId: string;
  /** Backend's authoritative active round number (envelope-level). */
  roundNumber: number;
  matchStatus: string;
  completedRounds: number;
  players: PublicPlayer[];
  activeRound: PublicActiveRound | null;
  sharedNextRoundDurationSeconds: number;
  matchOver: boolean;
  winnerId: string | null;
  completionReason: string | null;
  question: PublicQuestion | null;
  progressionPendingPlayers: string[];
}

export interface PrivatePlayerView {
  matchId: string;
  roundNumber: number;
  ownerPlayerId: string;
  /** Owner's own submitted flag, taken from the owner's public row. */
  hasSubmitted: boolean;
  level: number;
  selectionPhase: string | null;
  selectedAbilityId: string | null;
  unlockedAbilityIds: string[];
  lockedAbilityIds: string[];
  level2ChoiceMade: boolean;
  level2Choice: string | null;
  level2Options: string[];
  level3FinalUnlockId: string | null;
  level3Unlocked: boolean;
  /** ability id -> remaining charges; null = uncharged use policy. */
  remainingCharges: Record<string, number | null>;
  consecutiveCorrect: number;
}

export interface StaffMatchParticipant {
  playerId: string;
  playerToken: string;
}

export interface StaffMatchCreated {
  matchId: string;
  experiment: Record<string, unknown>;
  players: { playerId: string; classId: string; startingHp: number }[];
  participants: StaffMatchParticipant[];
}

export interface SubmissionAccepted {
  matchId: string;
  roundNumber: number;
  playerId: string;
  roundResolved: boolean;
}

export interface LevelTwoConfirmed {
  matchId: string;
  playerId: string;
  abilityId: string;
  pendingPlayers: string[];
}

// --- tolerant readers -------------------------------------------------------

export class RankedDuelParseError extends Error {
  constructor(message: string) {
    super(`Unexpected ranked-duel response: ${message}`);
    this.name = "RankedDuelParseError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const rec = (v: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(v)) throw new RankedDuelParseError(`${label} must be an object`);
  return v;
};
const str = (v: unknown, label: string): string => {
  if (typeof v !== "string" || v.length === 0) {
    throw new RankedDuelParseError(`${label} must be a non-empty string`);
  }
  return v;
};
const num = (v: unknown, label: string): number => {
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new RankedDuelParseError(`${label} must be a number`);
  }
  return v;
};
const bool = (v: unknown, label: string): boolean => {
  if (typeof v !== "boolean") throw new RankedDuelParseError(`${label} must be a boolean`);
  return v;
};
const nullableStr = (v: unknown, label: string): string | null =>
  v === null || v === undefined ? null : str(v, label);
const strList = (v: unknown, label: string): string[] => {
  if (!Array.isArray(v)) throw new RankedDuelParseError(`${label} must be an array`);
  return v.map((item, i) => str(item, `${label}[${i}]`));
};

const readPlayer = (raw: unknown, label: string): PublicPlayer => {
  const p = rec(raw, label);
  return {
    playerId: str(p.player_id, `${label}.player_id`),
    classId: str(p.class_id, `${label}.class_id`),
    hp: num(p.hp, `${label}.hp`),
    totalXp: num(p.total_xp, `${label}.total_xp`),
    level: num(p.level, `${label}.level`),
    hasSubmitted: bool(p.has_submitted, `${label}.has_submitted`),
    abilitySelectionPhase: nullableStr(
      p.ability_selection_phase,
      `${label}.ability_selection_phase`,
    ),
    hasAbilitySelected:
      p.has_ability_selected === null || p.has_ability_selected === undefined
        ? null
        : bool(p.has_ability_selected, `${label}.has_ability_selected`),
  };
};

const readQuestion = (raw: unknown): PublicQuestion | null => {
  if (raw === null || raw === undefined) return null;
  const q = rec(raw, "question");
  return {
    questionId: str(q.question_id, "question.question_id"),
    prompt: str(q.prompt, "question.prompt"),
    options: strList(q.options, "question.options"),
    category: nullableStr(q.category, "question.category"),
  };
};

/** Parse the live public envelope (five base fields + additive extras). */
export function readPublicRound(body: unknown): PublicRoundView {
  const env = rec(body, "public envelope");
  if (env.projection_type !== "public_round") {
    throw new RankedDuelParseError(
      `expected projection_type "public_round" (got ${String(env.projection_type)})`,
    );
  }
  const payload = rec(env.payload, "public payload");
  const rawPlayers = payload.players;
  if (!Array.isArray(rawPlayers) || rawPlayers.length !== 2) {
    throw new RankedDuelParseError("public payload must contain exactly two players");
  }
  const activeRaw = payload.active_round;
  const activeRound: PublicActiveRound | null =
    activeRaw === null || activeRaw === undefined
      ? null
      : (() => {
          const a = rec(activeRaw, "active_round");
          return {
            roundNumber: num(a.round_number, "active_round.round_number"),
            activeDeadline: nullableStr(a.active_deadline, "active_round.active_deadline"),
            durationSeconds: num(a.duration_seconds, "active_round.duration_seconds"),
            pressureApplied: bool(a.pressure_applied, "active_round.pressure_applied"),
          };
        })();

  return {
    matchId: str(env.match_id, "match_id"),
    roundNumber: num(env.round_number, "round_number"),
    matchStatus: str(payload.match_status, "match_status"),
    completedRounds: num(payload.completed_rounds, "completed_rounds"),
    players: rawPlayers.map((p, i) => readPlayer(p, `players[${i}]`)),
    activeRound,
    sharedNextRoundDurationSeconds: num(
      payload.next_round_duration_seconds,
      "next_round_duration_seconds",
    ),
    matchOver: bool(payload.match_over, "match_over"),
    winnerId: nullableStr(payload.winner_id, "winner_id"),
    completionReason: nullableStr(payload.completion_reason, "completion_reason"),
    question: readQuestion(env.question),
    progressionPendingPlayers:
      env.progression_pending_players === undefined
        ? []
        : strList(env.progression_pending_players, "progression_pending_players"),
  };
}

/** Parse the live private envelope for the authenticated owner. */
export function readPrivatePlayer(body: unknown, expectedOwnerId: string): PrivatePlayerView {
  const env = rec(body, "private envelope");
  if (env.projection_type !== "private_player") {
    throw new RankedDuelParseError(
      `expected projection_type "private_player" (got ${String(env.projection_type)})`,
    );
  }
  const payload = rec(env.payload, "private payload");
  const owner = str(payload.owner_player_id, "owner_player_id");
  if (owner !== expectedOwnerId) {
    // Fail closed: never render a projection that belongs to another player.
    throw new RankedDuelParseError("private projection owner does not match the joined player");
  }
  const selection = rec(payload.own_selection, "own_selection");
  const abilities = rec(payload.own_abilities, "own_abilities");
  const carryover = rec(payload.own_carryover, "own_carryover");

  const rawPlayers = payload.players;
  if (!Array.isArray(rawPlayers)) {
    throw new RankedDuelParseError("private payload must contain players");
  }
  const ownRow = rawPlayers
    .map((p, i) => readPlayer(p, `players[${i}]`))
    .find((p) => p.playerId === owner);
  if (!ownRow) throw new RankedDuelParseError("private payload is missing the owner's own row");

  const charges: Record<string, number | null> = {};
  for (const [abilityId, remaining] of Object.entries(
    rec(abilities.remaining_charges, "own_abilities.remaining_charges"),
  )) {
    charges[abilityId] =
      remaining === null || remaining === undefined
        ? null
        : num(remaining, `remaining_charges.${abilityId}`);
  }

  return {
    matchId: str(env.match_id, "match_id"),
    roundNumber: num(env.round_number, "round_number"),
    ownerPlayerId: owner,
    hasSubmitted: ownRow.hasSubmitted,
    level: ownRow.level,
    selectionPhase: nullableStr(selection.phase, "own_selection.phase"),
    selectedAbilityId: nullableStr(
      selection.selected_ability_id,
      "own_selection.selected_ability_id",
    ),
    unlockedAbilityIds: strList(
      abilities.unlocked_ability_ids,
      "own_abilities.unlocked_ability_ids",
    ),
    lockedAbilityIds: strList(abilities.locked_ability_ids, "own_abilities.locked_ability_ids"),
    level2ChoiceMade: bool(abilities.level2_choice_made, "own_abilities.level2_choice_made"),
    level2Choice: nullableStr(abilities.level2_choice, "own_abilities.level2_choice"),
    level2Options: strList(abilities.level2_options, "own_abilities.level2_options"),
    level3FinalUnlockId: nullableStr(
      abilities.level3_final_unlock_id,
      "own_abilities.level3_final_unlock_id",
    ),
    level3Unlocked: bool(abilities.level3_unlocked, "own_abilities.level3_unlocked"),
    remainingCharges: charges,
    consecutiveCorrect: num(
      carryover.consecutive_correct,
      "own_carryover.consecutive_correct",
    ),
  };
}

export function readStaffMatchCreated(body: unknown): StaffMatchCreated {
  const b = rec(body, "creation response");
  const players = Array.isArray(b.players) ? b.players : [];
  const participants = Array.isArray(b.participants) ? b.participants : [];
  if (participants.length !== 2) {
    throw new RankedDuelParseError(
      "creation response did not include two participant credentials",
    );
  }
  return {
    matchId: str(b.match_id, "match_id"),
    experiment: isRecord(b.experiment) ? b.experiment : {},
    players: players.map((raw, i) => {
      const p = rec(raw, `players[${i}]`);
      return {
        playerId: str(p.player_id, `players[${i}].player_id`),
        classId: str(p.class_id, `players[${i}].class_id`),
        startingHp: num(p.starting_hp, `players[${i}].starting_hp`),
      };
    }),
    participants: participants.map((raw, i) => {
      const p = rec(raw, `participants[${i}]`);
      return {
        playerId: str(p.player_id, `participants[${i}].player_id`),
        playerToken: str(p.player_token, `participants[${i}].player_token`),
      };
    }),
  };
}

export function readSubmissionAccepted(body: unknown): SubmissionAccepted {
  const b = rec(body, "submission response");
  return {
    matchId: str(b.match_id, "match_id"),
    roundNumber: num(b.round_number, "round_number"),
    playerId: str(b.player_id, "player_id"),
    roundResolved: bool(b.round_resolved, "round_resolved"),
  };
}

export function readLevelTwoConfirmed(body: unknown): LevelTwoConfirmed {
  const b = rec(body, "progression response");
  return {
    matchId: str(b.match_id, "match_id"),
    playerId: str(b.player_id, "player_id"),
    abilityId: str(b.ability_id, "ability_id"),
    pendingPlayers: strList(b.pending_players, "pending_players"),
  };
}
