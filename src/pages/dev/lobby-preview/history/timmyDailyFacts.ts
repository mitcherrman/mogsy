/**
 * HUB5 — what Timmy actually played in the staged Daily. RAW FACTS ONLY.
 *
 * Each line is one question asked at one (round, challenge) of one stage's
 * child match, and whether it was answered correctly (C), wrongly (X) or
 * timed out (T). Review items name the miss they replay and how the replay
 * went. Nothing else is written here: no C/A, no accuracy, no average, no
 * trend, no signal. `dailyFixtureBuilder.ts` turns these into persistence
 * rows and HUB2.1's real projection derives everything else.
 *
 * THE SHAPE OF THE HISTORY (what each run is for)
 * ───────────────────────────────────────────────
 *  run 1   first Daily, 4 stages (not yet Weak Areas-eligible). A legacy
 *          record: its Survival stage froze no ruleset, so that stage has no
 *          analysis (not_applicable) and the run cannot be compared.
 *  run 2-3 5 stages, each on its own day's stage shuffle — saved order wins,
 *          and a different order is a different comparison cohort in HUB2.1.
 *          Run 2: Survival out of strikes, Time Trial bank ran out.
 *  run 4-11 one stage order, one cohort, so run analytics accrue:
 *          run 8 trend up · run 9 POOR (bank out, strikes out, a failed
 *          Review replay, an unserved allocation) trend down · run 10 stable ·
 *          run 11 STRONG (latest), trend up, personal best tied with run 8.
 *
 * Learning identities followed across runs (the HUB2 rules decide):
 *  - `ranked:demo-baron-respawn` misses repeatedly → recurring weakness
 *    (runs 9 and 11), repeated miss (run 9).
 *  - `quiz:rabadon-ap` missed three times (runs 2-3), then correct → recovered
 *    weakness from run 6. It is also a Practice miss (Missed bank) and a
 *    discovered question (Owned) — one identity on every surface.
 *  - run 11 Survival asks `mastery:annie-q-raw-damage` twice (two generated
 *    instances, rounds 1 and 2), several challenges per round, and its facts
 *    are listed OUT of display order on purpose.
 */
import { fixtureInstant } from "./fixtureClock";
import { masteryRef, quizRef, rankedRef, reflexRef } from "./questionIdentity";
import type {
  DailyAccountFacts,
  OccurrenceFact,
  Outcome,
  ReviewAllocationFact,
  RulesetFact,
  RunFact,
  StageFact,
} from "./dailyFixtureBuilder";

type Mark = "C" | "X" | "T";
const OUTCOME: Record<Mark, Outcome> = { C: "correct", X: "incorrect", T: "timeout" };

/** A single-answer round: `ranked:` or `quiz:` question at challenge 0. */
const ask = (round: number, ref: string, mark: Mark): OccurrenceFact =>
  ({ round, challenge: 0, ref, outcome: OUTCOME[mark] });
/** One challenge of a Mastery slice round. */
const slice = (round: number, challenge: number, concept: string, variant: number, mark: Mark): OccurrenceFact =>
  ({ round, challenge, ref: masteryRef(concept), variant, outcome: OUTCOME[mark] });
const R = rankedRef;
const Q = quizRef;
/** Replay the miss at (stage, round, challenge); null = never served. */
const replay = (stage: number, round: number, challenge: number, mark: Mark | null): ReviewAllocationFact =>
  ({ source: { stage, round, challenge }, outcome: mark === null ? null : OUTCOME[mark] });

// The frozen rulesets (`daily_challenge/run/plan.py`): Weak Areas and Review
// play the standard ruleset, shortened by their context.
const STANDARD: RulesetFact = { id: "standard", version: 3, timeBankMs: null, maxStrikes: null };
const TIME_TRIAL: RulesetFact = { id: "time_trial", version: 2, timeBankMs: 90_000, maxStrikes: null };
const SURVIVAL: RulesetFact = { id: "survival", version: 2, timeBankMs: null, maxStrikes: 3 };
/** Survival is the one stage that takes a frozen day content set. */
const SURVIVAL_SET = "combat_math";

const timeTrial = (score: number, occurrences: OccurrenceFact[], endedBy: StageFact["endedBy"] = "completed"): StageFact =>
  ({ kind: "time_trial", ruleset: TIME_TRIAL, contentSetId: null, score, endedBy, occurrences });
const standard = (score: number, occurrences: OccurrenceFact[]): StageFact =>
  ({ kind: "standard", ruleset: STANDARD, contentSetId: null, score, endedBy: "completed", occurrences });
const survival = (score: number, occurrences: OccurrenceFact[], endedBy: StageFact["endedBy"] = "completed",
  ruleset: RulesetFact | null = SURVIVAL): StageFact =>
  ({ kind: "survival", ruleset, contentSetId: SURVIVAL_SET, score, endedBy, occurrences });
const weakAreas = (score: number, occurrences: OccurrenceFact[]): StageFact =>
  ({ kind: "weak_areas", ruleset: STANDARD, contentSetId: null, score, endedBy: "completed", occurrences });
const review = (score: number): StageFact =>
  ({ kind: "review", ruleset: STANDARD, contentSetId: null, score, endedBy: "completed" });

const run = (number: number, completedAt: string, stages: StageFact[], allocations: ReviewAllocationFact[]): RunFact =>
  ({ number, completedAt, planVersion: 1, stages, review: allocations });

// ─────────────────────────────────────────────────────────────── Timmy

const TIMMY_RUNS: RunFact[] = [
  // 1 — first Daily: four stages, no Weak Areas. Legacy Survival record.
  run(1, fixtureInstant(10, 19, 20), [
    timeTrial(40, [ask(1, R("flash-cooldown"), "C"), ask(2, Q("annie-q-cooldown"), "X"), ask(3, R("infinity-edge-ad"), "C"),
      ask(4, Q("sunfire-health"), "C"), ask(5, R("caster-count"), "X"), ask(6, Q("electrocute-hits"), "C")]),
    standard(36, [ask(1, R("malphite-r-cooldown"), "C"), ask(2, Q("liandry-ap"), "C"), ask(3, R("dragon-soul"), "X"),
      slice(4, 0, "annie-q-raw-damage", 0, "C"), slice(4, 1, "physical-post-mitigation", 0, "X")]),
    survival(25, [slice(1, 0, "lux-casts-before-oom", 0, "C"), slice(1, 1, "garen-health-remaining", 0, "C"),
      slice(2, 0, "ezreal-e-haste", 0, "X"), slice(2, 1, "annie-q-raw-damage", 1, "C"),
      slice(3, 0, "physical-post-mitigation", 1, "C"), slice(3, 1, "lux-casts-before-oom", 1, "C")], "completed", null),
    review(10),
  ], [replay(0, 2, 0, "C"), replay(1, 3, 0, "X")]),

  // 2 — its own day's shuffle: Survival first. Strikes out; bank out.
  run(2, fixtureInstant(9, 20, 5), [
    survival(10, [slice(1, 0, "garen-health-remaining", 1, "X"), slice(1, 1, "ezreal-e-haste", 1, "C"),
      slice(2, 0, "lux-casts-before-oom", 0, "X"), slice(2, 1, "annie-q-raw-damage", 0, "C"),
      slice(3, 0, "physical-post-mitigation", 0, "X")], "strikes_exhausted"),
    weakAreas(20, [ask(1, Q("annie-q-cooldown"), "C"), ask(2, R("caster-count"), "C"), ask(3, R("dragon-soul"), "X")]),
    standard(36, [ask(1, R("ahri-q-cost"), "C"), ask(2, Q("rabadon-ap"), "X"), ask(3, R("ward-duration"), "C"),
      slice(4, 0, "ezreal-e-haste", 0, "C"), slice(4, 1, "lux-casts-before-oom", 1, "X")]),
    timeTrial(30, [ask(1, R("smite-charges"), "C"), ask(2, Q("bork-attack-speed"), "X"), ask(3, R("control-ward"), "C"),
      ask(4, Q("first-minions"), "C"), ask(5, R("ability-haste"), "X"), ask(6, Q("ignite-cooldown"), "T")], "time_bank_exhausted"),
    review(20),
  ], [replay(2, 2, 0, "X"), replay(1, 3, 0, "C"), replay(0, 1, 0, "C")]),

  // 3 — another shuffle: Standard first, Weak Areas third.
  run(3, fixtureInstant(8, 18, 45), [
    standard(36, [ask(1, R("infinity-edge-ad"), "C"), ask(2, Q("rabadon-ap"), "X"), ask(3, R("purchase-total"), "X"),
      slice(4, 0, "physical-post-mitigation", 1, "C"), slice(4, 1, "garen-health-remaining", 0, "C")]),
    timeTrial(50, [ask(1, R("flash-cooldown"), "C"), ask(2, Q("warmog-health"), "C"), ask(3, R("dorans-shield-cost"), "C"),
      ask(4, Q("teleport-cooldown"), "X"), ask(5, R("conqueror-stacks"), "C"), ask(6, Q("dragon-first-spawn"), "C")]),
    weakAreas(20, [ask(1, R("ability-haste"), "C"), ask(2, Q("bork-attack-speed"), "X"), ask(3, R("dragon-soul"), "C")]),
    survival(35, [slice(1, 0, "lux-casts-before-oom", 1, "C"), slice(1, 1, "ezreal-e-haste", 1, "C"),
      slice(2, 0, "annie-q-raw-damage", 1, "C"), slice(2, 1, "garen-health-remaining", 1, "X"),
      slice(3, 0, "physical-post-mitigation", 0, "C"), slice(3, 1, "lux-casts-before-oom", 0, "C"),
      slice(4, 0, "ezreal-e-haste", 0, "C"), slice(4, 1, "annie-q-raw-damage", 0, "C")]),
    review(20),
  ], [replay(0, 2, 0, "C"), replay(0, 3, 0, "C"), replay(3, 2, 1, "X")]),

  // 4-11 — one stage order: Time Trial, Standard, Survival, Weak Areas, Review.
  run(4, fixtureInstant(7, 19, 30), [
    timeTrial(30, [ask(1, R("malphite-r-cooldown"), "X"), ask(2, Q("sunfire-health"), "C"), ask(3, R("smite-charges"), "X"),
      ask(4, Q("liandry-ap"), "X"), ask(5, R("caster-count"), "C"), ask(6, Q("cannon-cadence"), "X")]),
    standard(24, [ask(1, R("ahri-q-cost"), "C"), ask(2, Q("rabadon-ap"), "C"), ask(3, R("slow-push"), "X"),
      slice(4, 0, "annie-q-raw-damage", 0, "X"), slice(4, 1, "lux-casts-before-oom", 0, "C")]),
    survival(30, [slice(1, 0, "physical-post-mitigation", 0, "C"), slice(1, 1, "garen-health-remaining", 0, "X"),
      slice(2, 0, "ezreal-e-haste", 1, "C"), slice(2, 1, "lux-casts-before-oom", 1, "X"),
      slice(3, 0, "annie-q-raw-damage", 1, "C"), slice(3, 1, "physical-post-mitigation", 1, "C"),
      slice(4, 0, "garen-health-remaining", 1, "C"), slice(4, 1, "ezreal-e-haste", 0, "C")]),
    weakAreas(10, [ask(1, Q("teleport-cooldown"), "X"), ask(2, R("purchase-total"), "C"), ask(3, Q("ignite-cooldown"), "X")]),
    review(20),
  ], [replay(0, 1, 0, "C"), replay(0, 4, 0, "X"), replay(1, 4, 0, "C")]),

  run(5, fixtureInstant(6, 20, 15), [
    timeTrial(30, [ask(1, R("baron-respawn"), "X"), ask(2, Q("annie-q-cooldown"), "C"), ask(3, R("infinity-edge-ad"), "C"),
      ask(4, Q("bork-attack-speed"), "X"), ask(5, R("flash-cooldown"), "C"), ask(6, Q("first-minions"), "X")]),
    standard(36, [ask(1, R("dorans-shield-cost"), "C"), ask(2, Q("ezreal-e-cooldown"), "X"), ask(3, R("control-ward"), "C"),
      slice(4, 0, "garen-health-remaining", 0, "C"), slice(4, 1, "physical-post-mitigation", 1, "X")]),
    survival(30, [slice(1, 0, "lux-casts-before-oom", 0, "C"), slice(1, 1, "annie-q-raw-damage", 1, "X"),
      slice(2, 0, "ezreal-e-haste", 0, "C"), slice(2, 1, "garen-health-remaining", 1, "C"),
      slice(3, 0, "physical-post-mitigation", 0, "C"), slice(3, 1, "lux-casts-before-oom", 1, "C"),
      slice(4, 0, "annie-q-raw-damage", 0, "X"), slice(4, 1, "ezreal-e-haste", 1, "C")]),
    weakAreas(20, [ask(1, Q("rabadon-ap"), "C"), ask(2, R("slow-push"), "C"), ask(3, R("smite-charges"), "X")]),
    review(20),
  ], [replay(0, 4, 0, "C"), replay(3, 3, 0, "C"), replay(1, 4, 1, "X")]),

  run(6, fixtureInstant(5, 19, 10), [
    timeTrial(40, [ask(1, R("baron-respawn"), "C"), ask(2, Q("sunfire-health"), "C"), ask(3, R("dragon-soul"), "C"),
      ask(4, Q("electrocute-hits"), "X"), ask(5, R("ward-duration"), "C"), ask(6, Q("turret-plates-fall"), "X")]),
    standard(36, [ask(1, R("malphite-r-cooldown"), "C"), ask(2, Q("rabadon-ap"), "C"), ask(3, R("ability-haste"), "X"),
      slice(4, 0, "lux-casts-before-oom", 1, "C"), slice(4, 1, "ezreal-e-haste", 0, "X")]),
    survival(35, [slice(1, 0, "annie-q-raw-damage", 0, "C"), slice(1, 1, "physical-post-mitigation", 0, "C"),
      slice(2, 0, "garen-health-remaining", 1, "C"), slice(2, 1, "lux-casts-before-oom", 0, "X"),
      slice(3, 0, "ezreal-e-haste", 1, "C"), slice(3, 1, "annie-q-raw-damage", 1, "C"),
      slice(4, 0, "physical-post-mitigation", 1, "C"), slice(4, 1, "garen-health-remaining", 0, "C")]),
    weakAreas(30, [ask(1, Q("ezreal-e-cooldown"), "C"), ask(2, R("caster-count"), "C"), ask(3, Q("first-minions"), "C")]),
    review(20),
  ], [replay(0, 4, 0, "C"), replay(1, 3, 0, "C"), replay(1, 4, 1, "X")]),

  run(7, fixtureInstant(4, 20, 40), [
    timeTrial(50, [ask(1, R("baron-respawn"), "X"), ask(2, Q("warmog-health"), "C"), ask(3, R("conqueror-stacks"), "C"),
      ask(4, Q("liandry-ap"), "C"), ask(5, R("smite-charges"), "C"), ask(6, Q("ignite-cooldown"), "C")]),
    standard(24, [ask(1, R("infinity-edge-ad"), "C"), ask(2, Q("teleport-cooldown"), "X"), ask(3, R("purchase-total"), "X"),
      slice(4, 0, "physical-post-mitigation", 0, "C"), slice(4, 1, "annie-q-raw-damage", 1, "X")]),
    survival(35, [slice(1, 0, "ezreal-e-haste", 0, "C"), slice(1, 1, "lux-casts-before-oom", 1, "C"),
      slice(2, 0, "garen-health-remaining", 0, "C"), slice(2, 1, "annie-q-raw-damage", 0, "C"),
      slice(3, 0, "lux-casts-before-oom", 0, "X"), slice(3, 1, "physical-post-mitigation", 1, "C"),
      slice(4, 0, "garen-health-remaining", 1, "C"), slice(4, 1, "ezreal-e-haste", 1, "C")]),
    weakAreas(30, [ask(1, Q("bork-attack-speed"), "C"), ask(2, R("ability-haste"), "C"), ask(3, Q("electrocute-hits"), "C")]),
    review(30),
  ], [replay(1, 2, 0, "C"), replay(1, 3, 0, "C"), replay(1, 4, 1, "C")]),

  run(8, fixtureInstant(3, 19, 55), [
    timeTrial(40, [ask(1, R("baron-respawn"), "X"), ask(2, Q("annie-q-cooldown"), "C"), ask(3, R("flash-cooldown"), "C"),
      ask(4, Q("sunfire-health"), "C"), ask(5, R("dorans-shield-cost"), "C"), ask(6, Q("cannon-cadence"), "X")]),
    standard(48, [ask(1, R("ahri-q-cost"), "C"), ask(2, Q("liandry-ap"), "C"), ask(3, R("ward-duration"), "X"),
      slice(4, 0, "lux-casts-before-oom", 0, "C"), slice(4, 1, "garen-health-remaining", 1, "C")]),
    survival(35, [slice(1, 0, "annie-q-raw-damage", 1, "C"), slice(1, 1, "ezreal-e-haste", 0, "X"),
      slice(2, 0, "physical-post-mitigation", 0, "C"), slice(2, 1, "lux-casts-before-oom", 1, "C"),
      slice(3, 0, "garen-health-remaining", 0, "C"), slice(3, 1, "annie-q-raw-damage", 0, "C"),
      slice(4, 0, "ezreal-e-haste", 1, "C"), slice(4, 1, "physical-post-mitigation", 1, "C")]),
    weakAreas(30, [ask(1, Q("teleport-cooldown"), "C"), ask(2, R("purchase-total"), "C"), ask(3, Q("turret-plates-fall"), "C")]),
    review(20),
  ], [replay(0, 6, 0, "C"), replay(1, 3, 0, "C"), replay(2, 1, 1, "X")]),

  // 9 — the POOR run: bank out, strikes out, a failed replay of a recurring
  // miss, and a fourth allocation Review never served.
  run(9, fixtureInstant(2, 21, 25), [
    timeTrial(20, [ask(1, R("baron-respawn"), "X"), ask(2, Q("ezreal-e-cooldown"), "X"), ask(3, R("smite-charges"), "C"),
      ask(4, Q("bork-attack-speed"), "C"), ask(5, R("malphite-r-cooldown"), "C"), ask(6, Q("first-strike-window"), "T")],
      "time_bank_exhausted"),
    standard(24, [ask(1, R("dragon-soul"), "X"), ask(2, Q("warmog-health"), "C"), ask(3, R("caster-count"), "C"),
      slice(4, 0, "annie-q-raw-damage", 0, "X"), slice(4, 1, "physical-post-mitigation", 1, "C")]),
    survival(20, [slice(1, 0, "lux-casts-before-oom", 1, "X"), slice(1, 1, "garen-health-remaining", 0, "C"),
      slice(2, 0, "ezreal-e-haste", 0, "C"), slice(2, 1, "physical-post-mitigation", 0, "X"),
      slice(3, 0, "annie-q-raw-damage", 1, "C"), slice(3, 1, "lux-casts-before-oom", 0, "C"),
      slice(4, 0, "garen-health-remaining", 1, "X")], "strikes_exhausted"),
    weakAreas(20, [ask(1, Q("electrocute-hits"), "X"), ask(2, R("ward-duration"), "C"), ask(3, Q("teleport-cooldown"), "C")]),
    review(10),
  ], [replay(0, 1, 0, "X"), replay(0, 2, 0, "C"), replay(2, 1, 0, "X"), replay(1, 1, 0, null)]),

  run(10, fixtureInstant(1, 19, 35), [
    timeTrial(50, [ask(1, R("infinity-edge-ad"), "C"), ask(2, Q("rabadon-ap"), "C"), ask(3, R("conqueror-stacks"), "C"),
      ask(4, Q("liandry-ap"), "C"), ask(5, R("flash-cooldown"), "C"), ask(6, Q("ignite-cooldown"), "X")]),
    standard(36, [ask(1, R("malphite-r-cooldown"), "C"), ask(2, Q("annie-q-cooldown"), "C"), ask(3, R("control-ward"), "X"),
      slice(4, 0, "garen-health-remaining", 0, "C"), slice(4, 1, "lux-casts-before-oom", 0, "C")]),
    survival(35, [slice(1, 0, "physical-post-mitigation", 0, "C"), slice(1, 1, "ezreal-e-haste", 1, "C"),
      slice(2, 0, "annie-q-raw-damage", 1, "X"), slice(2, 1, "lux-casts-before-oom", 1, "C"),
      slice(3, 0, "garen-health-remaining", 1, "C"), slice(3, 1, "physical-post-mitigation", 1, "C"),
      slice(4, 0, "ezreal-e-haste", 0, "C"), slice(4, 1, "annie-q-raw-damage", 0, "C")]),
    weakAreas(30, [ask(1, R("baron-respawn"), "C"), ask(2, Q("ezreal-e-cooldown"), "C"), ask(3, R("dragon-soul"), "C")]),
    review(20),
  ], [replay(0, 6, 0, "C"), replay(1, 3, 0, "X"), replay(2, 2, 0, "C")]),

  // 11 — the STRONG latest run. Its Survival facts are listed out of display
  // order, and ask one Mastery concept twice.
  run(11, fixtureInstant(0, 17, 10), [
    timeTrial(40, [ask(1, R("baron-respawn"), "X"), ask(2, Q("sunfire-health"), "C"), ask(3, R("dorans-shield-cost"), "C"),
      ask(4, Q("warmog-health"), "C"), ask(5, R("ahri-q-cost"), "C"), ask(6, Q("cannon-cadence"), "X")]),
    standard(48, [ask(1, R("infinity-edge-ad"), "C"), ask(2, Q("rabadon-ap"), "C"), ask(3, R("ward-duration"), "C"),
      slice(4, 0, "lux-casts-before-oom", 1, "C"), slice(4, 1, "garen-health-remaining", 1, "C")]),
    survival(25, [slice(3, 1, "garen-health-remaining", 0, "C"), slice(2, 1, "annie-q-raw-damage", 1, "X"),
      slice(1, 0, "annie-q-raw-damage", 0, "C"), slice(4, 1, "ezreal-e-haste", 1, "C"),
      slice(2, 0, "lux-casts-before-oom", 0, "C"), slice(1, 1, "physical-post-mitigation", 0, "C"),
      slice(4, 0, "physical-post-mitigation", 1, "C"), slice(3, 0, "ezreal-e-haste", 0, "C")]),
    weakAreas(30, [ask(1, Q("ignite-cooldown"), "C"), ask(2, R("control-ward"), "C"), ask(3, Q("electrocute-hits"), "C")]),
    review(30),
  ], [replay(0, 1, 0, "C"), replay(0, 6, 0, "C"), replay(2, 2, 1, "C")]),
];

export const TIMMY_DAILY_FACTS: DailyAccountFacts = Object.freeze({
  userId: "demo-timmy",
  idPrefix: "timmy",
  runs: TIMMY_RUNS,
}) as DailyAccountFacts;

// ─────────────────────────────────────────────────────────────── first Daily

/**
 * A different account with exactly ONE completed Daily: four stages, every
 * provenance field frozen, nothing earlier to compare with, and two Review
 * replays (under HUB2's three-item floor) — so every comparison is honestly
 * insufficient. What a player sees the evening of their first run.
 */
export const FIRST_DAILY_FACTS: DailyAccountFacts = Object.freeze({
  userId: "demo-first-daily",
  idPrefix: "first",
  runs: [
    run(1, fixtureInstant(0, 16, 40), [
      timeTrial(40, [ask(1, R("flash-cooldown"), "C"), ask(2, Q("annie-q-cooldown"), "X"), ask(3, R("infinity-edge-ad"), "C"),
        ask(4, Q("sunfire-health"), "C"), ask(5, R("caster-count"), "X"), ask(6, Q("electrocute-hits"), "C")]),
      standard(36, [ask(1, R("malphite-r-cooldown"), "C"), ask(2, Q("liandry-ap"), "C"), ask(3, R("dragon-soul"), "X"),
        slice(4, 0, "annie-q-raw-damage", 0, "C"), slice(4, 1, "physical-post-mitigation", 0, "X")]),
      survival(25, [slice(1, 0, "lux-casts-before-oom", 0, "C"), slice(1, 1, "garen-health-remaining", 0, "C"),
        slice(2, 0, "ezreal-e-haste", 0, "X"), slice(2, 1, "annie-q-raw-damage", 1, "C"),
        slice(3, 0, "physical-post-mitigation", 1, "C"), slice(3, 1, "lux-casts-before-oom", 1, "C")]),
      review(20),
    ], [replay(0, 2, 0, "C"), replay(1, 3, 0, "X")]),
  ],
}) as DailyAccountFacts;

/** A new account: no Daily at all. */
export const NEWCOMER_DAILY_FACTS: DailyAccountFacts = Object.freeze({
  userId: "demo-newcomer",
  idPrefix: "newcomer",
  runs: [],
}) as DailyAccountFacts;

// ─────────────────────────────────────────────────────────────── full-length Daily

/**
 * HUB6.2 — a player whose Dailies are FULL LENGTH, to certify History at the
 * real stage shapes rather than Timmy's compact ones:
 *
 *  - Standard is the recipe's owner-locked ten modules
 *    (`daily_challenge/recipe.py::STANDARD_V1_UNITS`): four Splash questions,
 *    a five-card Meta Reflex block, three Splash, a second Meta Reflex block,
 *    then one four-question Mastery slice.
 *  - Time Trial settles 22 (run 1, completed) and 28 (run 2, the bank ran out
 *    on its last question) questions.
 *  - Survival mixes single questions with multi-question slices; run 2 goes
 *    out of strikes on its third miss.
 *
 * Run 1 is this player's FIRST Daily (four stages, no Weak Areas); run 2 is
 * five stages, and its Weak Areas are three of run 1's misses.
 */
const splash = ask;
/** A five-card Meta Reflex block at `round`, one mark per card. */
const reflexBlock = (round: number, keys: string[], marks: Mark[]): OccurrenceFact[] =>
  keys.map((key, challenge) => ({ round, challenge, ref: reflexRef(key), outcome: OUTCOME[marks[challenge]] }));

const FULL_RUNS: RunFact[] = [
  // 1 — first Daily: four stages.
  run(1, fixtureInstant(1, 19, 5), [
    timeTrial(180, [
      ask(1, R("flash-cooldown"), "C"), ask(2, Q("rabadon-ap"), "X"), ask(3, R("infinity-edge-ad"), "C"),
      ask(4, Q("sunfire-health"), "C"), ask(5, R("caster-count"), "C"), ask(6, Q("electrocute-hits"), "C"),
      ask(7, R("smite-charges"), "X"), ask(8, Q("warmog-health"), "C"), ask(9, R("ward-duration"), "C"),
      ask(10, Q("ignite-cooldown"), "C"), ask(11, R("conqueror-stacks"), "C"), ask(12, Q("teleport-cooldown"), "X"),
      ask(13, R("baron-respawn"), "C"), ask(14, Q("first-minions"), "C"), ask(15, R("blue-sentinel"), "C"),
      ask(16, Q("cannon-cadence"), "X"), ask(17, R("ahri-q-cost"), "C"), ask(18, Q("liandry-ap"), "C"),
      ask(19, R("slow-push"), "C"), ask(20, Q("exhaust-duration"), "C"), ask(21, R("moonstone-unique"), "C"),
      ask(22, Q("dragon-first-spawn"), "C"),
    ]),
    standard(118, [
      splash(1, R("malphite-r-cooldown"), "C"), splash(2, Q("annie-q-cooldown"), "C"), splash(3, R("dragon-soul"), "X"),
      splash(4, Q("bork-attack-speed"), "C"),
      ...reflexBlock(5, ["ie-vs-deathcap", "sunfire-vs-bork", "liandry-vs-warmog", "zhonya-vs-moonstone", "dshield-vs-dblade"],
        ["C", "C", "X", "C", "C"]),
      splash(6, R("control-ward"), "C"), splash(7, Q("inhibitor-respawn"), "C"), splash(8, R("purchase-total"), "X"),
      ...reflexBlock(9, ["sorcs-vs-swifties", "voidstaff-vs-lordd", "bc-vs-steraks", "bt-vs-nashor", "pot-vs-boots"],
        ["C", "X", "C", "C", "C"]),
      slice(10, 0, "annie-q-raw-damage", 0, "C"), slice(10, 1, "physical-post-mitigation", 0, "C"),
      slice(10, 2, "lux-casts-before-oom", 0, "X"), slice(10, 3, "ezreal-e-haste", 0, "C"),
    ]),
    survival(45, [
      ask(1, R("dorans-shield-cost"), "C"),
      slice(2, 0, "garen-health-remaining", 0, "C"), slice(2, 1, "annie-q-raw-damage", 1, "C"),
      ask(3, Q("first-strike-window"), "X"),
      slice(4, 0, "lux-casts-before-oom", 1, "C"), slice(4, 1, "ezreal-e-haste", 1, "C"), slice(4, 2, "physical-post-mitigation", 1, "C"),
      ask(5, R("ability-haste"), "C"),
      slice(6, 0, "garen-health-remaining", 1, "X"), slice(6, 1, "annie-q-raw-damage", 0, "C"),
    ]),
    review(20),
  ], [replay(0, 2, 0, "C"), replay(1, 3, 0, "X"), replay(2, 3, 0, "C")]),

  // 2 — five stages, the long shapes: a 28-question Time Trial whose bank ran
  // out, and a Survival that goes out of strikes.
  run(2, fixtureInstant(0, 17, 40), [
    timeTrial(210, [
      ask(1, R("infinity-edge-ad"), "C"), ask(2, Q("sunfire-health"), "C"), ask(3, R("flash-cooldown"), "X"),
      ask(4, Q("annie-q-cooldown"), "C"), ask(5, R("dorans-shield-cost"), "C"), ask(6, Q("electrocute-hits"), "C"),
      ask(7, R("caster-count"), "C"), ask(8, Q("rabadon-ap"), "C"), ask(9, R("smite-charges"), "C"),
      ask(10, Q("warmog-health"), "X"), ask(11, R("conqueror-stacks"), "C"), ask(12, Q("liandry-ap"), "C"),
      ask(13, R("purchase-total"), "C"), ask(14, Q("ezreal-e-cooldown"), "C"), ask(15, R("baron-respawn"), "X"),
      ask(16, Q("bork-attack-speed"), "C"), ask(17, R("dragon-soul"), "C"), ask(18, Q("first-strike-window"), "C"),
      ask(19, R("ward-duration"), "C"), ask(20, Q("dragon-first-spawn"), "C"), ask(21, R("control-ward"), "X"),
      ask(22, Q("baron-first-spawn"), "C"), ask(23, R("slow-push"), "C"), ask(24, Q("turret-plates-fall"), "C"),
      ask(25, R("blue-sentinel"), "C"), ask(26, Q("freeze-definition"), "X"), ask(27, R("ability-haste"), "C"),
      ask(28, Q("exhaust-duration"), "T"),
    ], "time_bank_exhausted"),
    standard(131, [
      splash(1, Q("liandry-ap"), "C"), splash(2, R("ahri-q-cost"), "C"), splash(3, Q("inhibitor-respawn"), "C"),
      splash(4, R("moonstone-unique"), "X"),
      ...reflexBlock(5, ["bt-vs-nashor", "pot-vs-boots", "ie-vs-deathcap", "voidstaff-vs-lordd", "sorcs-vs-swifties"],
        ["C", "C", "C", "X", "C"]),
      splash(6, Q("cannon-cadence"), "C"), splash(7, R("malphite-r-cooldown"), "C"), splash(8, Q("ignite-cooldown"), "C"),
      ...reflexBlock(9, ["zhonya-vs-moonstone", "bc-vs-steraks", "dshield-vs-dblade", "liandry-vs-warmog", "sunfire-vs-bork"],
        ["C", "C", "X", "C", "C"]),
      slice(10, 0, "garen-health-remaining", 0, "C"), slice(10, 1, "lux-casts-before-oom", 1, "C"),
      slice(10, 2, "physical-post-mitigation", 1, "C"), slice(10, 3, "annie-q-raw-damage", 1, "X"),
    ]),
    survival(60, [
      ask(1, R("conqueror-stacks"), "C"),
      slice(2, 0, "ezreal-e-haste", 0, "C"), slice(2, 1, "garen-health-remaining", 1, "C"),
      ask(3, Q("teleport-cooldown"), "X"),
      slice(4, 0, "annie-q-raw-damage", 0, "C"), slice(4, 1, "physical-post-mitigation", 0, "X"), slice(4, 2, "lux-casts-before-oom", 0, "C"),
      ask(5, R("ward-duration"), "C"),
      slice(6, 0, "lux-casts-before-oom", 1, "C"), slice(6, 1, "ezreal-e-haste", 1, "C"),
      ask(7, Q("first-minions"), "C"),
      slice(8, 0, "garen-health-remaining", 0, "C"), slice(8, 1, "annie-q-raw-damage", 1, "X"),
    ], "strikes_exhausted"),
    // Three of run 1's misses, served again.
    weakAreas(20, [ask(1, Q("rabadon-ap"), "C"), ask(2, R("dragon-soul"), "C"), ask(3, Q("cannon-cadence"), "X")]),
    review(30),
  ], [replay(0, 3, 0, "C"), replay(1, 4, 0, "C"), replay(2, 3, 0, "X"), replay(0, 10, 0, "C")]),
];

export const FULL_DAILY_FACTS: DailyAccountFacts = Object.freeze({
  userId: "demo-full-daily",
  idPrefix: "full",
  runs: FULL_RUNS,
}) as DailyAccountFacts;
