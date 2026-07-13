// ---------------------------------------------------------------------------
// Deterministic BACKEND-SHAPED settlement fixtures for the /dev/ranked-duel
// prototype. Every number below is a final, already-resolved value standing
// in for the backend's combat settlement output. The frontend never derives
// any of these values — `mkPlayer` only merges literal overrides over
// literal defaults (no formulas). Frontend-local; not a transport schema.
// ---------------------------------------------------------------------------

import {
  BackendPlayerSettlement,
  BackendRoundSettlement,
} from "./backendSettlementTypes";

/** Baseline shared round length the prototype uses (mirrors ROUND_SECONDS). */
const BASELINE_TIMER = { durationSeconds: 20, deltaSeconds: 0 };

/** Literal defaults for a quiet, untouched player record. */
const mkPlayer = (
  overrides: Partial<BackendPlayerSettlement>,
): BackendPlayerSettlement => ({
  answerOutcome: "incorrect",
  answerTimeMs: 9000,
  relativeSpeed: "not_applicable",
  hpBefore: 90,
  baseIncomingDamage: 0,
  shieldAbsorbed: 0,
  damageReductionAmount: 0,
  finalDamage: 0,
  hpAfter: 90,
  xpBefore: 0,
  xpAwarded: 16,
  xpAfter: 16,
  levelBefore: 1,
  levelAfter: 1,
  selectedAbility: null,
  chargesBefore: null,
  chargesConsumed: 0,
  chargesAfter: null,
  combatLabCarryover: null,
  ...overrides,
});

const mk = (
  roundId: string,
  playerOne: Partial<BackendPlayerSettlement>,
  playerTwo: Partial<BackendPlayerSettlement>,
  rest?: Partial<Omit<BackendRoundSettlement, "players" | "roundId">>,
): BackendRoundSettlement => ({
  roundId,
  matchId: "mock-match-001",
  players: { playerOne: mkPlayer(playerOne), playerTwo: mkPlayer(playerTwo) },
  sharedNextRoundTimer: BASELINE_TIMER,
  matchOver: false,
  winner: null,
  ...rest,
});

export interface SettlementScenario {
  key: string;
  label: string;
  settlement: BackendRoundSettlement;
}

export const SETTLEMENT_SCENARIOS: SettlementScenario[] = [
  {
    key: "solo-correct",
    label: "Solo correct — full base damage, no modifiers",
    settlement: mk(
      "r-solo-correct",
      { answerOutcome: "correct", answerTimeMs: 4200, xpAwarded: 20, xpAfter: 20 },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "both-correct-faster",
    label: "Both correct — faster player deals reduced base damage",
    settlement: mk(
      "r-both-correct",
      { answerOutcome: "correct", answerTimeMs: 3100, relativeSpeed: "faster", xpAwarded: 20, xpAfter: 20 },
      {
        answerOutcome: "correct",
        answerTimeMs: 6400,
        relativeSpeed: "slower",
        xpAwarded: 20,
        xpAfter: 20,
        baseIncomingDamage: 18,
        finalDamage: 18,
        hpAfter: 72,
      },
    ),
  },
  {
    key: "both-incorrect-wash",
    label: "Both incorrect — wash",
    settlement: mk("r-wash", {}, {}),
  },
  {
    key: "shield-absorb",
    label: "Shield absorbs part of incoming damage",
    settlement: mk(
      "r-shield",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      { baseIncomingDamage: 30, shieldAbsorbed: 12, finalDamage: 18, hpAfter: 72 },
    ),
  },
  {
    key: "damage-reduction",
    label: "Damage reduction lowers final damage",
    settlement: mk(
      "r-reduction",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      { baseIncomingDamage: 30, damageReductionAmount: 10, finalDamage: 20, hpAfter: 70 },
    ),
  },
  {
    key: "shield-plus-reduction",
    label: "Shield + damage reduction in one settlement",
    settlement: mk(
      "r-shield-reduction",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      {
        baseIncomingDamage: 30,
        shieldAbsorbed: 8,
        damageReductionAmount: 7,
        finalDamage: 15,
        hpAfter: 75,
      },
    ),
  },
  {
    key: "charge-consumed",
    label: "Selected ability consumes a charge",
    settlement: mk(
      "r-charge-consumed",
      {
        answerOutcome: "correct",
        xpAwarded: 20,
        xpAfter: 20,
        selectedAbility: { abilityId: "tank.fortify", name: "Fortify" },
        chargesBefore: 2,
        chargesConsumed: 1,
        chargesAfter: 1,
      },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "charge-not-consumed",
    label: "Ability selected but no charge consumed",
    settlement: mk(
      "r-charge-kept",
      {
        answerOutcome: "correct",
        xpAwarded: 20,
        xpAfter: 20,
        selectedAbility: { abilityId: "marksman.suppressing_fire", name: "Suppressing Fire" },
        chargesBefore: 1,
        chargesConsumed: 0,
        chargesAfter: 1,
      },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "timer-increased",
    label: "Next-round shared timer increased (25s)",
    settlement: mk(
      "r-timer-up",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
      { sharedNextRoundTimer: { durationSeconds: 25, deltaSeconds: 5 } },
    ),
  },
  {
    key: "timer-decreased",
    label: "Next-round shared timer decreased (18s)",
    settlement: mk(
      "r-timer-down",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
      { sharedNextRoundTimer: { durationSeconds: 18, deltaSeconds: -2 } },
    ),
  },
  {
    key: "carryover-created",
    label: "Combat Lab carryover created",
    settlement: mk(
      "r-carryover-created",
      {
        answerOutcome: "correct",
        xpAwarded: 20,
        xpAfter: 20,
        combatLabCarryover: {
          key: "insight_unlock",
          summary: "Insight: Combat Lab unlocks 5s earlier on the next eligible question",
          status: "created",
        },
      },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "carryover-consumed",
    label: "Combat Lab carryover consumed",
    settlement: mk(
      "r-carryover-consumed",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      {
        baseIncomingDamage: 30,
        finalDamage: 30,
        hpAfter: 60,
        combatLabCarryover: {
          key: "insight_unlock",
          summary: "Insight consumed: Combat Lab unlocked 5s earlier this question",
          status: "consumed",
        },
      },
    ),
  },
  {
    key: "level-up",
    label: "Level-up from XP award (Lv1 → Lv2)",
    settlement: mk(
      "r-level-up",
      {
        answerOutcome: "correct",
        xpBefore: 20,
        xpAwarded: 20,
        xpAfter: 40,
        levelBefore: 1,
        levelAfter: 2,
      },
      { xpBefore: 16, xpAwarded: 16, xpAfter: 32, baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "match-over",
    label: "Match over — Player 1 wins",
    settlement: mk(
      "r-match-over",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      { hpBefore: 30, baseIncomingDamage: 30, finalDamage: 30, hpAfter: 0 },
      { matchOver: true, winner: "playerOne" },
    ),
  },
  {
    key: "plain-round",
    label: "Plain non-match-over round (no winner)",
    settlement: mk(
      "r-plain",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      { baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "timed-out",
    label: "Player 2 timed out",
    settlement: mk(
      "r-timed-out",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20 },
      {
        answerOutcome: "timed_out",
        answerTimeMs: null,
        xpAwarded: 14,
        xpAfter: 14,
        baseIncomingDamage: 30,
        finalDamage: 30,
        hpAfter: 60,
      },
    ),
  },
  {
    key: "no-ability",
    label: "No active ability selected by either player",
    settlement: mk(
      "r-no-ability",
      { answerOutcome: "correct", xpAwarded: 20, xpAfter: 20, selectedAbility: null },
      { selectedAbility: null, baseIncomingDamage: 30, finalDamage: 30, hpAfter: 60 },
    ),
  },
  {
    key: "zero-final-damage",
    label: "Both players take zero final damage after modifiers",
    settlement: mk(
      "r-zero-final",
      { baseIncomingDamage: 18, shieldAbsorbed: 18, finalDamage: 0, answerOutcome: "correct", relativeSpeed: "slower", answerTimeMs: 7000, xpAwarded: 20, xpAfter: 20 },
      {
        answerOutcome: "correct",
        relativeSpeed: "faster",
        answerTimeMs: 2500,
        xpAwarded: 20,
        xpAfter: 20,
        baseIncomingDamage: 30,
        shieldAbsorbed: 20,
        damageReductionAmount: 10,
        finalDamage: 0,
      },
    ),
  },
];

export const getScenario = (key: string): SettlementScenario | undefined =>
  SETTLEMENT_SCENARIOS.find((s) => s.key === key);
