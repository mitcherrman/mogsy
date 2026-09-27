/**
 * HUB6.3D — the ANALYTICS LAB: a deterministic player with a mature,
 * production-shaped Daily history, for developing the Premium analytics
 * against real HUB6.3B output before any production population exists.
 *
 * RAW FACTS ONLY, as for Timmy: which question was asked where, and whether
 * it was answered correctly (C), wrongly (X) or timed out (T). Everything
 * else — previous Daily, deltas, averages, records, streaks, series,
 * categories, exact-question history, strike attribution, Review linkage —
 * is computed by HUB6.3B's own route (`d4a43826`) over the rows these facts
 * build (`scripts/hub63-generate-analytics-lab.py`), frozen as
 * `analyticsLab.golden.json`, and read through the production parser.
 *
 * PRODUCTION SHAPES (`DailyAccountFacts.production`)
 * ─────────────────────────────────────────────────
 *   Standard    Splash ×4, Meta Reflex (5 cards), Splash ×3, Meta Reflex, a
 *               five-child Journey — 22 questions (fewer when the Journey's
 *               pooled clock runs out: those children have no row)
 *   Time Trial  Splash only; questions may time out on their own clock; the
 *               bank's cut-off question is the final timeout
 *   Survival    Splash, with a three-child Journey at slot 6; a timeout is a
 *               miss; the third miss ends the stage
 *
 * MARK NOTATION
 * ─────────────
 * A stage is written as its outcomes in occurrence order: `C`, `X`, `T`, with
 * an optional count (`C5` = five correct). Spaces and `|` are for reading
 * only. The helpers below place those outcomes into the production shape;
 * the builder then validates every rule again.
 *
 * THE FOURTEEN DAILIES (plan dates Sep 1 – Sep 14)
 * ────────────────────────────────────────────────
 *   L1   first Daily — four stages, no Weak Areas; every comparison a first
 *   L2   first five-stage Daily; one prior attempt per stage
 *   L3   Daily 61/80; Time Trial 23/29
 *   L4   Daily 65/85 (more correct, same displayed accuracy as L3); Time
 *        Trial 25/28 (2 more correct, 1 fewer played); Survival 26 deep
 *   L5   timeout-heavy Time Trial (6 timeouts); a Meta Reflex card timeout;
 *        a Survival timeout strike
 *   L6   high Time Trial throughput, mediocre accuracy (24/34)
 *   L7   low throughput, high accuracy (18/19); all-correct Weak Areas
 *   L8   Time Trial most-correct record (31/34)
 *   L9   Time Trial below record (26/30)
 *   L10  a 25-question Time Trial streak; Survival finishes without striking out
 *   L11  Survival depth record (33) and a 23-question Survival streak
 *   L12  Standard 22/22 — all correct: Standard score and streak records
 *   L13  tied records: Time Trial 31 correct, Standard 22/22 again
 *   L14  mature history; the Journey's clock ran out after four children
 *
 * Weak Areas serves only questions the player missed in an EARLIER run, and
 * claims nothing more (HUB6.3B projects no per-question provenance). Review
 * replays one real miss from each earlier stage that has one.
 */
import { fixtureInstant } from "./fixtureClock";
import { JOURNEY_CONCEPTS, masteryRef, quizRef, rankedRef, reflexRef } from "./questionIdentity";
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

/** `"C3 X C2 T"` → `["C","C","C","X","C","C","T"]`. */
export function marks(spec: string): Mark[] {
  const out: Mark[] = [];
  for (const token of spec.replace(/\|/g, " ").split(/\s+/).filter(Boolean)) {
    const m = /^([CXT])(\d*)$/.exec(token);
    if (!m) throw new Error(`bad mark token: ${token}`);
    for (let i = 0; i < (m[2] ? Number(m[2]) : 1); i++) out.push(m[1] as Mark);
  }
  return out;
}

// The production rulesets (contract version 1; the recipe is the format).
const STANDARD: RulesetFact = { id: "standard", version: 1, timeBankMs: null, maxStrikes: null };
const TIME_TRIAL: RulesetFact = { id: "time_trial", version: 1, timeBankMs: 90_000, maxStrikes: null };
const SURVIVAL: RulesetFact = { id: "survival", version: 1, timeBankMs: null, maxStrikes: 3 };

// ─────────────────────────────────────────────────────────────── question pools

/** Splash questions, interleaved so consecutive questions change category. */
const SPLASH_POOL: readonly string[] = [
  rankedRef("infinity-edge-ad"), quizRef("annie-q-cooldown"), rankedRef("baron-respawn"), quizRef("electrocute-hits"),
  rankedRef("flash-cooldown"), quizRef("cannon-cadence"), rankedRef("dorans-shield-cost"), quizRef("rabadon-ap"),
  rankedRef("dragon-soul"), quizRef("ignite-cooldown"), rankedRef("caster-count"), quizRef("sunfire-health"),
  rankedRef("conqueror-stacks"), quizRef("dragon-first-spawn"), rankedRef("smite-charges"), quizRef("ezreal-e-cooldown"),
  rankedRef("ward-duration"), quizRef("first-minions"), rankedRef("malphite-r-cooldown"), quizRef("bork-attack-speed"),
  rankedRef("purchase-total"), quizRef("teleport-cooldown"), rankedRef("control-ward"), quizRef("first-strike-window"),
  rankedRef("slow-push"), quizRef("liandry-ap"), rankedRef("ahri-q-cost"), quizRef("baron-first-spawn"),
  rankedRef("blue-sentinel"), quizRef("warmog-health"), rankedRef("moonstone-unique"), quizRef("freeze-definition"),
  rankedRef("ability-haste"), quizRef("inhibitor-respawn"), quizRef("turret-plates-fall"), quizRef("exhaust-duration"),
];
const REFLEX_CARDS: readonly string[] = [
  "ie-vs-deathcap", "sunfire-vs-bork", "liandry-vs-warmog", "zhonya-vs-moonstone", "dshield-vs-dblade",
  "sorcs-vs-swifties", "voidstaff-vs-lordd", "bc-vs-steraks", "bt-vs-nashor", "pot-vs-boots",
].map(reflexRef);

const pick = (pool: readonly string[], start: number, n: number) =>
  Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]);

// ─────────────────────────────────────────────────────────────── stage builders

/** Time Trial: Splash only, one question per round. */
function timeTrial(run: number, spec: string): StageFact {
  const m = marks(spec);
  const refs = pick(SPLASH_POOL, run * 5, m.length);
  return {
    kind: "time_trial", ruleset: TIME_TRIAL, contentSetId: null, score: 10 * m.filter((x) => x === "C").length,
    endedBy: m[m.length - 1] === "T" ? "time_bank_exhausted" : "completed",
    occurrences: m.map((mark, i) => ({ round: i + 1, challenge: 0, ref: refs[i], outcome: OUTCOME[mark] })),
  };
}

/** Standard V1: 4 Splash · Meta Reflex · 3 Splash · Meta Reflex · Journey. */
function standard(run: number, spec: string): StageFact {
  const m = marks(spec);
  if (m.length < 18 || m.length > 22) throw new Error(`Standard L${run}: ${m.length} marks; 17 + 1–5 Journey children`);
  const splash = pick(SPLASH_POOL, run * 3 + 11, 7);
  const reflexA = pick(REFLEX_CARDS, run, 5);
  const reflexB = pick(REFLEX_CARDS, run + 5, 5);
  const occ: OccurrenceFact[] = [];
  let k = 0;
  const one = (round: number, ref: string) => occ.push({ round, challenge: 0, ref, outcome: OUTCOME[m[k++]] });
  const block = (round: number, refs: string[], variant?: number) =>
    refs.forEach((ref, challenge) => {
      if (k < m.length) occ.push({ round, challenge, ref, outcome: OUTCOME[m[k++]], ...(variant !== undefined ? { variant } : {}) });
    });
  [1, 2, 3, 4].forEach((round, i) => one(round, splash[i]));
  block(5, reflexA);
  [6, 7, 8].forEach((round, i) => one(round, splash[4 + i]));
  block(9, reflexB);
  // The Journey's children stop where the recipe's pooled clock stopped.
  block(10, JOURNEY_CONCEPTS.map(masteryRef), run % 2);
  const correct = m.filter((x) => x === "C").length;
  return { kind: "standard", ruleset: STANDARD, contentSetId: null, score: 5 * correct + 10, endedBy: "completed", occurrences: occ };
}

/** Survival: Splash per round, a three-child Journey at slot 6. The third
 *  miss ends it; fewer misses means it reached the end of its supply. */
function survival(run: number, spec: string): StageFact {
  const m = marks(spec);
  const singles = pick(SPLASH_POOL, run * 4 + 20, m.length);
  const occ: OccurrenceFact[] = [];
  let k = 0;
  for (let round = 1; k < m.length; round++) {
    if (round === 6) {
      for (let child = 0; child < 3 && k < m.length; child++) {
        occ.push({ round, challenge: child, ref: masteryRef(JOURNEY_CONCEPTS[child]), variant: (run + 1) % 2, outcome: OUTCOME[m[k++]] });
      }
    } else {
      occ.push({ round, challenge: 0, ref: singles[k], outcome: OUTCOME[m[k++]] });
    }
  }
  const misses = m.filter((x) => x !== "C").length;
  return {
    kind: "survival", ruleset: SURVIVAL, contentSetId: null, score: 3 * m.filter((x) => x === "C").length,
    endedBy: misses >= 3 ? "strikes_exhausted" : "completed", occurrences: occ,
  };
}

/** Weak Areas: questions missed in EARLIER runs (most recent first), one per
 *  round. The builder re-checks every one against the earlier facts. */
function weakAreas(spec: string, earlier: RunFact[]): StageFact {
  const m = marks(spec);
  const missed: string[] = [];
  for (const r of earlier.slice().reverse()) {
    for (const s of r.stages) {
      for (const o of s.occurrences ?? []) {
        if (o.outcome === "incorrect" && /^(quiz|ranked):/.test(o.ref) && !missed.includes(o.ref)) missed.push(o.ref);
      }
    }
  }
  if (missed.length < m.length) throw new Error("Weak Areas: not enough earlier misses");
  return {
    kind: "weak_areas", ruleset: STANDARD, contentSetId: null, score: 10 * m.filter((x) => x === "C").length,
    endedBy: "completed",
    occurrences: m.map((mark, i) => ({ round: i + 1, challenge: 0, ref: missed[i], outcome: OUTCOME[mark] })),
  };
}

const review = (score: number): StageFact =>
  ({ kind: "review", ruleset: STANDARD, contentSetId: null, score, endedBy: "completed" });

/** One replay per earlier stage that has a wrong answer (its first one;
 *  Meta Reflex cards are replayed in their block, so they are skipped here). */
function allocations(stages: StageFact[], spec: string): ReviewAllocationFact[] {
  const m = marks(spec);
  const out: ReviewAllocationFact[] = [];
  stages.forEach((s, index) => {
    const miss = (s.occurrences ?? [])
      .slice().sort((a, b) => a.round - b.round || a.challenge - b.challenge)
      .find((o) => o.outcome === "incorrect" && !o.ref.startsWith("reflex:"));
    if (miss) out.push({ source: { stage: index, round: miss.round, challenge: miss.challenge }, outcome: null });
  });
  if (out.length !== m.length) throw new Error(`Review: ${out.length} allocations, ${m.length} marks`);
  return out.map((a, i) => ({ ...a, outcome: OUTCOME[m[i]] }));
}

// ─────────────────────────────────────────────────────────────── the runs

type StageSpec = ["standard" | "time_trial" | "survival" | "weak_areas", string];

function lab(number: number, day: number, hour: number, minute: number, specs: StageSpec[], reviewSpec: string,
  earlier: RunFact[]): RunFact {
  const stages = specs.map(([kind, spec]) =>
    kind === "standard" ? standard(number, spec)
      : kind === "time_trial" ? timeTrial(number, spec)
        : kind === "survival" ? survival(number, spec)
          : weakAreas(spec, earlier));
  let alloc: ReviewAllocationFact[];
  try {
    alloc = allocations(stages, reviewSpec);
  } catch (e) {
    throw new Error(`L${number}: ${(e as Error).message}`);
  }
  const replayCorrect = alloc.filter((a) => a.outcome === "correct").length;
  return {
    number, completedAt: fixtureInstant(15 - day, hour, minute), planVersion: 1,
    stages: [...stages, review(5 * replayCorrect)], review: alloc,
  };
}

/** [run, plan day of September, hour, minute, stages before Review, Review marks]. */
type RunSpec = [number, number, number, number, StageSpec[], string];

const RUNS: RunSpec[] = [
  // L1 — first Daily: four stages.
  [1, 1, 19, 5, [
    ["time_trial", "C4 X C6 X C5 T C2 X C2 T"],
    ["standard", "C C X C | C C X C C | C X C | C C C X C | C C X C C"],
    ["survival", "C C C X C | C C C | C C X C C X"],
  ], "C X C"],
  // L2 — first five-stage Daily; a different day's shuffle.
  [2, 2, 18, 40, [
    ["standard", "C C C C | C X C C C | C X C | C C C C X | C C X C C"],
    ["time_trial", "C6 X C4 T C5 X C5 X C T"],
    ["survival", "C C C C X | C C C | C C C X C C C X"],
    ["weak_areas", "C X C"],
  ], "C C X C"],
  // L3 — Daily 61/80; Time Trial 23/29.
  [3, 3, 20, 10, [
    ["time_trial", "C6 X C5 X C4 T C5 X C3 X T"],
    ["standard", "C X C C | C C X C X | C C X | C X C C C | C X C C X"],
    ["survival", "C C C X C | C C C | C C C C X C C C C C C X"],
    ["weak_areas", "C C X C C"],
  ], "C X C X"],
  // L4 — Daily 65/85; Time Trial 25/28.
  [4, 4, 19, 30, [
    ["time_trial", "C8 X C9 T C8 T"],
    ["standard", "C X C X | C C X C X | X C C | C X C C X | C C X C C"],
    ["survival", "C C C C C | C C C | C C C X C C C C C X C C C C C C C X"],
    ["weak_areas", "C X X C X"],
  ], "X C X X"],
  // L5 — timeout-heavy Time Trial; a Meta Reflex card and a Survival strike time out.
  [5, 5, 18, 15, [
    ["survival", "C C T C C | C C C | C C X C C C C C C X"],
    ["time_trial", "C3 T C4 X C2 T C3 X C2 T C2 X T C2 X C2 T T"],
    ["standard", "C C C C | C C T C C | C C C | C X C C C | C C C C X"],
    ["weak_areas", "C C X C"],
  ], "C C C X"],
  // L6 — high throughput, mediocre accuracy (24/34).
  [6, 6, 21, 0, [
    ["standard", "C C C C | C C C X C | C C C | C C C C C | C X C C C"],
    ["survival", "C C C C C | C C X | C C C C C X C C C C C C X"],
    ["time_trial", "C3 X C2 X C4 X C3 X C2 X C3 X C4 X C2 X T C T"],
    ["weak_areas", "C C C X C"],
  ], "C X C C"],
  // L7 — low throughput, high accuracy (18/19); all-correct Weak Areas.
  [7, 7, 17, 50, [
    ["time_trial", "C18 T"],
    ["weak_areas", "C C C C"],
    ["standard", "C C C C | C C C C C | C C C | C C C C C | C C X C C"],
    ["survival", "C C C C C | C C C | C X C C C C C C X C C C C C C X"],
  ], "C C"],
  // L8 — Time Trial most-correct record (31/34).
  [8, 8, 19, 45, [
    ["standard", "C X C C | C C C X C | C C X | C C C C C | C C X C C"],
    ["time_trial", "C10 X C11 X C10 T"],
    ["weak_areas", "C X C C C"],
    ["survival", "C C X C C | C C C | C C C X C C C C X"],
  ], "C C X C"],
  // L9 — Time Trial below record (26/30).
  [9, 9, 20, 25, [
    ["survival", "C C C C C | C X C | C C C C X C C C C C C X"],
    ["standard", "C X C C | C C X X C | C C C | C X C C C | C C C X C"],
    ["time_trial", "C8 X C9 X C9 X T"],
    ["weak_areas", "C C X C C"],
  ], "C X C C"],
  // L10 — a 25-question Time Trial streak; Survival reaches the end of its supply.
  [10, 10, 18, 5, [
    ["time_trial", "C25 X C3 T"],
    ["standard", "C C C C | C C C C X | C C C | C X C C C | C C C C C"],
    ["survival", "C C C C C | C C C | C C C C X C C C C C C C C C C C C X C C"],
    ["weak_areas", "C C C"],
  ], "C C"],
  // L11 — Survival depth record (34) with a 23-question streak.
  [11, 11, 19, 20, [
    ["survival", "C C C C C | C C C | C15 X C5 X C2 X"],
    ["time_trial", "C12 X C8 X C7 X T"],
    ["standard", "C C C X | C C C C C | C X C | C C C C C | C C C X C"],
    ["weak_areas", "C X C C"],
  ], "C C C C"],
  // L12 — Standard 22/22: score and streak records.
  [12, 12, 20, 0, [
    ["standard", "C22"],
    ["time_trial", "C10 X C8 X C7 X T"],
    ["survival", "C C X C C | C C C | C C C C C C X C C C C C C C C X"],
    ["weak_areas", "C C C C X"],
  ], "C X C"],
  // L13 — tied records: Time Trial 31 correct again; Standard 22/22 again.
  [13, 13, 18, 55, [
    ["time_trial", "C15 X C16 T"],
    ["survival", "C C C C C | C C C | C C C C C X C C C C C C C C X C C C C X"],
    ["standard", "C22"],
    ["weak_areas", "C C X C C"],
  ], "C C X"],
  // L14 — mature history; the Journey's clock ran out after four children.
  [14, 14, 19, 40, [
    ["time_trial", "C6 X C7 T C6 X C5 T"],
    ["standard", "C C C C | C X C C C | C C C | C C C C C | C C C C"],
    ["survival", "C C C C C | C X C | C C C C C C C X C C C C C C C C C X"],
    ["weak_areas", "C C C X"],
  ], "C X C"],
];

const LAB_RUNS: RunFact[] = [];
for (const [number, day, hour, minute, specs, reviewSpec] of RUNS) {
  LAB_RUNS.push(lab(number, day, hour, minute, specs, reviewSpec, LAB_RUNS));
}

export const ANALYTICS_LAB_FACTS: DailyAccountFacts = Object.freeze({
  userId: "demo-analytics-lab",
  idPrefix: "lab",
  runs: LAB_RUNS,
  production: true,
}) as DailyAccountFacts;
