/**
 * SYNTHETIC RANKED HISTORY — demo data for `/dev/lobby-preview` ONLY.
 *
 * Nothing in this file is real. No account played these matches, no backend
 * row exists for them, and no production surface imports it — `/quiz` reads
 * the account's own Ranked history and per-match review from the backend,
 * through `ranked-public/client`. This module names no endpoint and performs
 * no I/O of any kind; `LobbyPreviewPage.test.tsx` scans it for both, so if it
 * ever grew a fetch the test would fail rather than the owner discovering
 * Timmy in their own record.
 *
 * WHY IT EXISTS
 * ─────────────
 * There are no meaningful real-player Ranked matches to look at yet, and the
 * record's whole visual payload — the question timeline, its paging, the icon
 * semantics, the review popover — only shows its shape against a full,
 * varied, internally coherent dataset. A handful of placeholder rows proves
 * the layout compiles; it does not tell you whether the surface is any good.
 *
 * WHAT IT IS BUILT TO STRESS
 * ──────────────────────────
 * Match lengths 3 / 4 / 5 / 6 / 7 / 10 / 15, which between them cover every
 * timeline paging case: no arrows at all, exactly one page, a second page
 * holding one or two icons, exactly two full pages, and three pages.
 * Outcomes cover win, loss, a forfeit whose final round never resolved, and a
 * voided no-contest that moved no rating. All five roles appear. The rating
 * chain is continuous backwards from Timmy's current 1284.
 *
 * THE SEMANTIC RULE THIS FILE OBEYS
 * ─────────────────────────────────
 * Every question declares what it is ACTUALLY about, as `subject`, and the
 * icon hint is DERIVED from that declaration rather than written beside it.
 * That is the point: a fixture where the hint is hand-written can quietly
 * disagree with its own prompt — a purchase-total question showing Doran's
 * Blade, a Summoner question showing the wrong spell — which is exactly the
 * false specificity the resolver was rewritten to refuse. Here the two cannot
 * drift, and the tests assert the declarations themselves are honest.
 *
 * A question centred on ONE entity names that entity. A question about a
 * subject AREA — purchase totals, objective timers, vision, wave management —
 * declares `category` and gets the category mark, because that is all the
 * data would prove for the real thing.
 *
 * ON THE NUMBERS
 * ──────────────
 * The League facts are chosen to be recognisable and plausible rather than
 * patch-exact. This is demo data for judging a layout, not a question bank —
 * the real bank is human-reviewed and lives behind `ranked_candidate_review`.
 * Nothing here is ever served to a player.
 */
import type {
  MatchHistoryEntryView,
  MatchReviewView,
  ReviewIconHint,
  ReviewRound,
  TerminalReason,
} from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import type { TimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";
import { legacyCategoryKey } from "@/lib/quiz/publicCategory";

/** What a question is centred on. `category` means "no single entity", which
 *  is a claim in its own right and the most common honest answer. */
type Subject =
  | { kind: "champion"; name: string; icon: string }
  | { kind: "item"; name: string; icon: string }
  | { kind: "summoner_spell"; name: string; icon: string }
  | { kind: "rune"; name: string; icon: string }
  | { kind: "category" };

export interface SyntheticQuestion {
  id: string;
  /** The round's stored category. Also what a `category` subject falls back to. */
  category: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** Structured review material, in the shipped candidate shape. */
  explanation: Record<string, unknown> | null;
  subject: Subject;
}

/** The hint is DERIVED, never authored beside the question — see the header. */
export function iconHintFor(q: SyntheticQuestion): ReviewIconHint {
  if (q.subject.kind === "category") {
    return { kind: "category", key: q.category, icon: null };
  }
  return { kind: q.subject.kind, key: q.subject.name, icon: q.subject.icon };
}

/**
 * RG2's topic block for one synthetic question.
 *
 * The demo's own classification, through the SAME legacy bridge a real
 * pre-RG2 round takes — so a fixture cannot print a subject the live path
 * could not. `tier` is deliberately null: this demo bank has no difficulty
 * metadata, and the node draws no strips for what it was not told.
 */
export function topicFor(q: SyntheticQuestion): TimelineTopic {
  return {
    category: legacyCategoryKey(q.category),
    tier: null,
    iconHint: iconHintFor(q),
  };
}

// ───────────────────────────────────────────────────────── the question bank

const CHAMPION = (name: string): Subject => ({
  kind: "champion", name, icon: `assets/champions/${name}/icon.png`,
});
const ITEM = (name: string, id: number): Subject => ({
  kind: "item", name, icon: `assets/items/${id}.png`,
});
const SPELL = (name: string): Subject => ({
  kind: "summoner_spell", name, icon: `assets/summoner_spells/${name}.png`,
});
const RUNE = (name: string, file: string): Subject => ({
  kind: "rune", name, icon: `assets/runes/${file}.png`,
});
const CATEGORY: Subject = { kind: "category" };

export const SYNTHETIC_QUESTIONS: Record<string, SyntheticQuestion> = {
  // ── entity-specific: a champion ability ─────────────────────────────────
  "malphite-r-cooldown": {
    id: "malphite-r-cooldown",
    category: "Champion Ability Cooldowns",
    prompt: "What is the cooldown of Malphite's Unstoppable Force at rank 1?",
    options: ["130 seconds", "115 seconds", "100 seconds", "90 seconds"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Unstoppable Force is 130 / 115 / 100 seconds at ranks 1 to 3, before "
        + "any ability haste. Rank 1 is the longest.",
    },
    subject: CHAMPION("Malphite"),
  },
  "ahri-q-cost": {
    id: "ahri-q-cost",
    category: "Champion Ability Costs",
    prompt: "How much mana does Ahri's Orb of Deception cost?",
    options: ["55 mana", "65 mana", "75 mana", "45 mana"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Orb of Deception costs a flat 55 mana at every rank — its cost does "
        + "not scale, which is what makes it Ahri's cheapest waveclear.",
    },
    subject: CHAMPION("Ahri"),
  },

  // ── entity-specific: items ──────────────────────────────────────────────
  "infinity-edge-ad": {
    id: "infinity-edge-ad",
    category: "Item Exact Stats",
    prompt: "How much attack damage does Infinity Edge grant?",
    options: ["80", "70", "65", "75"],
    correctIndex: 0,
    explanation: {
      scenario_note: "Infinity Edge grants 80 attack damage alongside its crit chance.",
    },
    subject: ITEM("Infinity Edge", 3031),
  },
  "dorans-shield-cost": {
    id: "dorans-shield-cost",
    category: "Item Costs",
    prompt: "What does Doran's Shield cost?",
    options: ["450 gold", "400 gold", "500 gold", "350 gold"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Doran's Shield is 450 gold — the same as Doran's Blade and Doran's Ring.",
    },
    subject: ITEM("Doran's Shield", 1054),
  },
  // A LONG-OPTIONS stress case, and a genuine unique-effect question.
  "moonstone-unique": {
    id: "moonstone-unique",
    category: "Item Unique Effects",
    prompt: "What is Moonstone Renewer's unique effect?",
    options: [
      "Starlit Grace — healing or shielding an ally chains the effect to the "
        + "nearest other injured ally, ramping while in combat",
      "Grants an expiring shield to the lowest-health nearby ally every 30 seconds",
      "Increases all healing and shielding received by nearby allies by a flat 25%",
      "Converts 20% of the holder's ability power into bonus health for every "
        + "ally within 1200 units",
    ],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Starlit Grace is a CHAIN, not a bonus: the heal or shield you cast is "
        + "repeated on another injured ally, so it rewards enchanters who are "
        + "already healing someone rather than adding a passive aura.",
    },
    subject: ITEM("Moonstone Renewer", 6617),
  },

  // ── entity-specific: summoner spells ────────────────────────────────────
  "flash-cooldown": {
    id: "flash-cooldown",
    category: "Summoner Spells",
    prompt: "What is Flash's base cooldown?",
    options: ["300 seconds", "240 seconds", "210 seconds", "180 seconds"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Flash is 300 seconds — the longest base cooldown of any summoner "
        + "spell, before summoner haste or Cosmic Insight.",
    },
    subject: SPELL("Flash"),
  },
  "smite-charges": {
    id: "smite-charges",
    category: "Summoner Spells",
    prompt: "How many charges of Smite can a jungler hold at once?",
    options: ["2", "1", "3", "4"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Smite stores up to 2 charges, which is what lets a jungler clear a "
        + "camp and still contest an objective moments later.",
    },
    subject: SPELL("Smite"),
  },

  // ── entity-specific: a rune ─────────────────────────────────────────────
  "conqueror-stacks": {
    id: "conqueror-stacks",
    category: "Runes",
    prompt: "How many stacks does Conqueror need to be fully stacked?",
    options: ["12", "10", "8", "6"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Conqueror reaches 12 stacks, at which point it also begins healing "
        + "the holder for a share of the damage they deal.",
    },
    subject: RUNE("Conqueror", "Conqueror"),
  },

  // ── BROAD: the false-specificity case this fixture exists to police ─────
  // States four items and is about none of them. Declaring `category` here is
  // the whole point: an earlier fixture defaulted these to one item icon and
  // every timeline repeated the same picture.
  "purchase-total": {
    id: "purchase-total",
    category: "Item Costs",
    prompt:
      "You started with Doran's Blade and a Health Potion, then bought Phage "
      + "and Kindlegem. How much gold have you spent in total?",
    options: ["2400", "2500", "2450", "2300"],
    correctIndex: 0,
    explanation: {
      calculation_steps: [
        { step: "Doran's Blade costs 450 gold", running_total: 450 },
        { step: "Health Potion costs 50 gold", running_total: 500 },
        { step: "Phage costs 1100 gold", running_total: 1600 },
        { step: "Kindlegem costs 800 gold", running_total: 2400 },
        { step: "total gold spent", value: 2400 },
      ],
      formula_id: "purchase_history_total.v1",
      rounding_rule: "no rounding",
      distractor_derivations: [
        { value: "2500", derivation: "misread one component price by 100 gold" },
        { value: "2450", derivation: "counted the Health Potion twice" },
        { value: "2300", derivation: "left the Health Potion out entirely" },
      ],
    },
    subject: CATEGORY,
  },

  // ── BROAD: objectives ───────────────────────────────────────────────────
  "baron-respawn": {
    id: "baron-respawn",
    category: "Objective Timers",
    prompt: "How long after being slain does Baron Nashor respawn?",
    options: ["6 minutes", "7 minutes", "5 minutes", "8 minutes"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Baron respawns 6 minutes after it dies, which is why the buff's own "
        + "3-minute duration leaves a 3-minute window with neither.",
    },
    subject: CATEGORY,
  },
  "dragon-soul": {
    id: "dragon-soul",
    category: "Objective Timers",
    prompt: "How many dragons must a team slay to claim a Dragon Soul?",
    options: ["4", "3", "5", "2"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "The fourth dragon grants the Soul. The Elder Dragon that follows is a "
        + "separate objective and does not count toward it.",
    },
    subject: CATEGORY,
  },

  // ── BROAD: vision ───────────────────────────────────────────────────────
  "ward-duration": {
    id: "ward-duration",
    category: "Vision",
    prompt: "How long does a Stealth Ward from a Warding Totem last at level 1?",
    options: ["90 seconds", "120 seconds", "150 seconds", "60 seconds"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "90 seconds at level 1, growing with champion level. A ward placed "
        + "before a dragon spawns will usually not survive to see it.",
    },
    subject: CATEGORY,
  },
  "control-ward": {
    id: "control-ward",
    category: "Vision",
    prompt: "What does a Control Ward do that a Stealth Ward does not?",
    options: [
      "Reveals and disables enemy wards and traps in its radius",
      "Grants permanent true sight of stealthed champions anywhere on the map",
      "Lasts indefinitely and cannot be destroyed by enemy champions",
      "Reveals the entire enemy jungle for 10 seconds when placed",
    ],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "A Control Ward's job is DENIAL: it disables enemy vision in its "
        + "radius as well as providing your own, which is why it is bought to "
        + "hold an objective pit rather than to watch a lane.",
    },
    subject: CATEGORY,
  },

  // ── BROAD: wave management ──────────────────────────────────────────────
  "caster-count": {
    id: "caster-count",
    category: "Wave Management",
    prompt: "How many caster minions are in a standard minion wave?",
    options: ["3", "4", "2", "6"],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Three casters and three melee minions, with a siege minion joining "
        + "every third wave.",
    },
    subject: CATEGORY,
  },
  // A LONG-PROMPT stress case with prose rather than a worked calculation.
  "slow-push": {
    id: "slow-push",
    category: "Wave Management",
    prompt:
      "You are even in lane and want the wave to arrive under the enemy tower "
      + "as a large group in roughly ninety seconds, so that you can recall "
      + "now and return in time to crash it. Your opponent has just recalled "
      + "and the wave is sitting in the middle of the lane. What should you do "
      + "with the next two waves?",
    options: [
      "Kill only the minions that are about to die, letting your wave build a "
        + "numbers advantage before it pushes itself in",
      "Clear each wave as fast as possible so the lane resets to the middle "
        + "before you leave",
      "Freeze the wave just outside your own tower and give up the crash "
        + "entirely",
      "Push the first wave hard into the tower and let the second one bounce "
        + "back to you",
    ],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Killing only the dying minions is a slow push: your side out-numbers "
        + "theirs slightly each wave, the advantage compounds, and the whole "
        + "stack arrives together. Fast-clearing resets the lane, and a hard "
        + "push crashes immediately — neither gives you the ninety seconds.",
    },
    subject: CATEGORY,
  },

  // ── BROAD: role knowledge with no category art at all → neutral mark ────
  "blue-sentinel": {
    id: "blue-sentinel",
    category: "Jungle Pathing",
    prompt: "What does the Blue Sentinel's buff grant?",
    options: [
      "Mana regeneration and ability haste",
      "Bonus attack damage and true damage on hit",
      "Bonus movement speed while out of combat",
      "Increased healing and shielding power",
    ],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Crest of Insight: mana regeneration plus ability haste. The attack "
        + "damage and true damage belong to the Red Brambleback.",
    },
    subject: CATEGORY,
  },

  // ── BROAD: an abilities question about the SYSTEM, not a champion ───────
  "ability-haste": {
    id: "ability-haste",
    category: "Champion Ability Cooldowns",
    prompt: "What does 100 ability haste do to a spell's cooldown?",
    options: [
      "Halves it",
      "Removes it entirely",
      "Reduces it by 40%",
      "Reduces it by 25%",
    ],
    correctIndex: 0,
    explanation: {
      scenario_note:
        "Ability haste is linear in cooldown REDUCTION rather than in time: "
        + "100 haste means the spell comes back twice as often, i.e. half the "
        + "cooldown. It never reaches zero, however much you stack.",
    },
    subject: CATEGORY,
  },
};

// ────────────────────────────────────────────────────── the Meta Reflex block

/** One Meta Reflex round, in the two-payload shape v4 actually freezes. */
function metaReflexRound(roundNumber: number, viewerSides: (("left" | "right") | null)[]): ReviewRound {
  const cards = [
    {
      prompt: "Which champion has more base armour?",
      kind: "magnitude", entityKind: "champion",
      left: { label: "Trundle", icon: "assets/champions/Trundle/icon.png", value: 37 },
      right: { label: "Gwen", icon: "assets/champions/Gwen/icon.png", value: 39 },
      correctSide: "right" as const,
    },
    {
      prompt: "Which item costs more gold?",
      kind: "magnitude", entityKind: "item",
      left: { label: "Infinity Edge", icon: "assets/items/3031.png", value: 3450 },
      right: { label: "Trinity Force", icon: "assets/items/3078.png", value: 3333 },
      correctSide: "left" as const,
    },
    {
      prompt: "Which champion uses Energy?",
      kind: "classification", entityKind: "champion",
      left: { label: "Akali", icon: "assets/champions/Akali/icon.png", value: null },
      right: { label: "Ahri", icon: "assets/champions/Ahri/icon.png", value: null },
      correctSide: "left" as const,
    },
    {
      prompt: "Which item gives more magic resist?",
      kind: "magnitude", entityKind: "item",
      left: { label: "Doran's Shield", icon: "assets/items/1054.png", value: 0 },
      right: { label: "Verdant Barrier", icon: "assets/items/4632.png", value: 30 },
      correctSide: "right" as const,
    },
    {
      prompt: "Which champion has more base attack range?",
      kind: "magnitude", entityKind: "champion",
      left: { label: "Ashe", icon: "assets/champions/Ashe/icon.png", value: 600 },
      right: { label: "Darius", icon: "assets/champions/Darius/icon.png", value: 175 },
      correctSide: "left" as const,
    },
  ];
  const challenges = cards.map((c, i) => ({
    challengeIndex: i,
    prompt: c.prompt,
    kind: c.kind,
    entityKind: c.entityKind,
    left: c.left,
    right: c.right,
    correctSide: c.correctSide,
    viewerSide: viewerSides[i] ?? null,
    isCorrect: viewerSides[i] == null ? null : viewerSides[i] === c.correctSide,
  }));
  const answered = challenges.filter((c) => c.viewerSide !== null).length;
  const correct = challenges.filter((c) => c.isCorrect === true).length;
  return {
    roundNumber,
    kind: "meta_reflex",
    moduleId: "item_cost_duel",
    category: null,
    canonicalQuestionRef: null,
    revealed: true,
    iconHint: { kind: "meta_reflex", key: null, icon: null },
    topic: {
      category: "meta-reflex", tier: null,
      iconHint: { kind: "meta_reflex", key: null, icon: null },
    },
    question: null,
    challenges,
    viewerSubmission: {
      answerIndex: null, isCorrect: null,
      correctCount: correct, answeredCount: answered, challengeCount: challenges.length,
    },
  };
}

// ─────────────────────────────────────────────────────────── round assembly

/**
 * One played round. `answer` is the option Timmy picked (null = never
 * answered); `sealed` marks the round a forfeit abandoned, which the backend
 * withholds the answer for even inside a finished match.
 */
interface RoundSpec {
  q: keyof typeof SYNTHETIC_QUESTIONS;
  answer: number | null;
  sealed?: boolean;
}

function quizRound(roundNumber: number, spec: RoundSpec): ReviewRound {
  const q = SYNTHETIC_QUESTIONS[spec.q];
  if (!q) throw new Error(`unknown synthetic question: ${String(spec.q)}`);
  const revealed = !spec.sealed;
  return {
    roundNumber,
    kind: "quiz",
    moduleId: "quiz",
    category: q.category,
    canonicalQuestionRef: `ranked:demo-${q.id}`,
    revealed,
    iconHint: iconHintFor(q),
    topic: topicFor(q),
    question: {
      prompt: q.prompt,
      options: q.options,
      // A sealed round carries prompt and options but no answer — the bank is
      // shared, so an abandoned round must not hand out what it never showed.
      correctOptionIndex: revealed ? q.correctIndex : null,
      explanation: revealed ? q.explanation : null,
    },
    challenges: null,
    viewerSubmission: {
      answerIndex: spec.answer,
      isCorrect: revealed && spec.answer !== null ? spec.answer === q.correctIndex : null,
      correctCount: null, answeredCount: null, challengeCount: null,
    },
  };
}

// ───────────────────────────────────────────────────────────── the matches

interface MatchSpec {
  id: string;
  outcome: "win" | "loss" | "draw";
  terminal: TerminalReason;
  role: RankedRole;
  opponent: string | null;
  bot: boolean;
  daysAgo: number;
  /** Applied rating movement, or null for a voided result. */
  delta: number | null;
  ratingAfter: number | null;
  rounds: (RoundSpec | "meta-reflex")[];
  /** Only for the Meta Reflex block: which side Timmy picked per card. */
  metaSides?: (("left" | "right") | null)[];
}

const Q = SYNTHETIC_QUESTIONS;

/**
 * Nine matches, newest first, with a rating chain that runs continuously back
 * from Timmy's current 1284. The voided no-contest deliberately moves nothing,
 * so the chain steps over it — which is what a real void does.
 */
const MATCHES: MatchSpec[] = [
  {
    // 7 rounds → two pages, the second holding two. Mixed outcomes, one
    // unanswered round, and the long-options item question.
    id: "demo-mid-triumph", outcome: "win", terminal: "combat", role: "mid",
    opponent: "Sylvara", bot: false, daysAgo: 0, delta: 22, ratingAfter: 1284,
    rounds: [
      { q: "malphite-r-cooldown", answer: 0 },
      { q: "purchase-total", answer: 2 },
      { q: "flash-cooldown", answer: 0 },
      "meta-reflex",
      { q: "moonstone-unique", answer: 1 },
      { q: "ward-duration", answer: 0 },
      { q: "ability-haste", answer: null },
    ],
    metaSides: ["right", "left", "left", "right", "left"],
  },
  {
    // 15 rounds → three pages. The paging stress case.
    id: "demo-jungle-marathon", outcome: "loss", terminal: "combat", role: "jungle",
    opponent: "Korrin", bot: false, daysAgo: 1, delta: -14, ratingAfter: 1262,
    rounds: [
      { q: "smite-charges", answer: 0 },
      { q: "blue-sentinel", answer: 0 },
      { q: "baron-respawn", answer: 1 },
      { q: "infinity-edge-ad", answer: 0 },
      { q: "caster-count", answer: 0 },
      "meta-reflex",
      { q: "dragon-soul", answer: 2 },
      { q: "conqueror-stacks", answer: 0 },
      { q: "purchase-total", answer: 0 },
      { q: "control-ward", answer: 3 },
      { q: "ahri-q-cost", answer: 1 },
      { q: "slow-push", answer: 0 },
      { q: "dorans-shield-cost", answer: 0 },
      { q: "ability-haste", answer: 2 },
      { q: "flash-cooldown", answer: null },
    ],
    metaSides: ["right", "right", "left", "left", "left"],
  },
  {
    // 3 rounds → one page, and the arrows must not appear at all.
    id: "demo-support-short", outcome: "win", terminal: "combat", role: "support",
    opponent: "Wardenlight", bot: false, daysAgo: 2, delta: 18, ratingAfter: 1276,
    rounds: [
      { q: "moonstone-unique", answer: 0 },
      { q: "control-ward", answer: 0 },
      { q: "ward-duration", answer: 1 },
    ],
  },
  {
    // 4 rounds, FORFEIT: the last round was never played out and stays sealed.
    id: "demo-top-forfeit", outcome: "loss", terminal: "forfeit", role: "top",
    opponent: "IronGrove", bot: false, daysAgo: 3, delta: -9, ratingAfter: 1258,
    rounds: [
      { q: "dorans-shield-cost", answer: 0 },
      { q: "ability-haste", answer: 3 },
      { q: "caster-count", answer: 0 },
      { q: "baron-respawn", answer: null, sealed: true },
    ],
  },
  {
    // 10 rounds → exactly two full pages.
    id: "demo-adc-tenround", outcome: "win", terminal: "combat", role: "adc",
    opponent: "Quiverling", bot: false, daysAgo: 4, delta: 21, ratingAfter: 1267,
    rounds: [
      { q: "infinity-edge-ad", answer: 0 },
      { q: "flash-cooldown", answer: 0 },
      { q: "purchase-total", answer: 0 },
      { q: "caster-count", answer: 1 },
      { q: "slow-push", answer: 0 },
      "meta-reflex",
      { q: "conqueror-stacks", answer: 0 },
      { q: "dragon-soul", answer: 0 },
      { q: "malphite-r-cooldown", answer: 2 },
      { q: "ward-duration", answer: 0 },
    ],
    metaSides: ["right", "left", "left", "right", "left"],
  },
  {
    // 5 rounds → exactly one page. A bot match.
    id: "demo-mid-bot", outcome: "win", terminal: "combat", role: "mid",
    opponent: null, bot: true, daysAgo: 6, delta: 19, ratingAfter: 1246,
    rounds: [
      { q: "ahri-q-cost", answer: 0 },
      { q: "ability-haste", answer: 0 },
      { q: "conqueror-stacks", answer: 1 },
      { q: "infinity-edge-ad", answer: 0 },
      { q: "smite-charges", answer: 0 },
    ],
  },
  {
    // 6 rounds → two pages, the second holding ONE.
    id: "demo-jungle-loss", outcome: "loss", terminal: "combat", role: "jungle",
    opponent: "Vexmarrow", bot: false, daysAgo: 9, delta: -16, ratingAfter: 1227,
    rounds: [
      { q: "blue-sentinel", answer: 1 },
      { q: "baron-respawn", answer: 0 },
      "meta-reflex",
      { q: "dragon-soul", answer: 1 },
      { q: "smite-charges", answer: 2 },
      { q: "purchase-total", answer: 1 },
    ],
    metaSides: ["left", "left", null, null, null],
  },
  {
    // A VOIDED match: no rating movement at all, so the row prints an em dash
    // and no ladder line. The chain steps over it.
    id: "demo-support-void", outcome: "draw", terminal: "no_contest", role: "support",
    opponent: "Emberbrook", bot: false, daysAgo: 12, delta: null, ratingAfter: null,
    rounds: [
      { q: "control-ward", answer: 0 },
      { q: "ward-duration", answer: 0 },
      { q: "moonstone-unique", answer: null },
      { q: "caster-count", answer: null },
      { q: "slow-push", answer: null },
    ],
  },
  {
    // 7 rounds again, at the far end of the record.
    id: "demo-top-climb", outcome: "win", terminal: "combat", role: "top",
    opponent: "Bramblehide", bot: false, daysAgo: 15, delta: 20, ratingAfter: 1243,
    rounds: [
      { q: "dorans-shield-cost", answer: 0 },
      { q: "malphite-r-cooldown", answer: 0 },
      { q: "slow-push", answer: 3 },
      { q: "caster-count", answer: 0 },
      { q: "ability-haste", answer: 0 },
      { q: "purchase-total", answer: 3 },
      { q: "flash-cooldown", answer: 1 },
    ],
  },
];

// ────────────────────────────────────────────────────────────────── exports

function isoDaysAgo(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Timmy's synthetic Ranked record, newest first. */
export const SYNTHETIC_RANKED_HISTORY: readonly MatchHistoryEntryView[] = Object.freeze(
  MATCHES.map((m) => ({
    matchId: m.id,
    viewerOutcome: m.outcome,
    terminalReason: m.terminal,
    completionReason: m.terminal === "combat" ? "hp_depleted" : m.terminal,
    // Match LENGTH, never a score: the contract carries the round a duel
    // ended on and no per-round results.
    finalRoundNumber: m.rounds.length,
    completedAt: isoDaysAgo(m.daysAgo, 20 - (m.daysAgo % 8)),
    isBotMatch: m.bot,
    viewerClass: "mage",
    opponentClass: "marksman",
    viewerRole: m.role,
    opponentRole: null,
    opponentDisplayName: m.opponent,
    opponentIsBot: m.bot,
    ratingDelta: m.delta,
    ratingAfter: m.ratingAfter,
  })) satisfies MatchHistoryEntryView[],
);

/** The review payload for each of those matches, by match id. */
export const SYNTHETIC_RANKED_REVIEWS: Readonly<Record<string, MatchReviewView>> =
  Object.freeze(
    Object.fromEntries(
      MATCHES.map((m) => {
        const rounds = m.rounds.map((r, i) =>
          r === "meta-reflex"
            ? metaReflexRound(i + 1, m.metaSides ?? [null, null, null, null, null])
            : quizRound(i + 1, r),
        );
        return [
          m.id,
          {
            schemaVersion: "ranked_duel.match_review.v1",
            serverTime: isoDaysAgo(m.daysAgo, 21),
            matchId: m.id,
            finalRoundNumber: rounds.length,
            roundCount: rounds.length,
            rounds,
          } satisfies MatchReviewView,
        ];
      }),
    ),
  );

/** Exported for the fixture-semantics tests, which assert the declarations in
 *  `SYNTHETIC_QUESTIONS` are honest about their own prompts. */
export const SYNTHETIC_MATCH_SPECS = MATCHES;
export { Q as SYNTHETIC_QUESTION_BANK };
