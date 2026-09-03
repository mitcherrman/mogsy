/**
 * Dev-only canonical Ranked arena inspector (F1 prototype visual QA).
 *
 * Renders the SHARED ranked-arena components from static, backend-shaped view
 * fixtures so every important visual state can be captured/compared without a
 * live match. There is NO gameplay engine, NO controller, NO fetch, and NO
 * database mutation here — it only maps fixtures to presentation, so it can
 * never drift into a second implementation of the game (a test asserts it
 * imports no duel/engine/service module).
 *
 * Excluded from navigation and the sitemap (a /dev route); unavailable in
 * production builds unless explicitly enabled.
 */
import { useState } from "react";
import { AbilityTray } from "@/components/ranked-arena/AbilityTray";
import { AnswerGrid } from "@/components/ranked-arena/AnswerGrid";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { DiscoveryReveal } from "@/components/ranked-arena/DiscoveryReveal";
import { MatchOverFrame } from "@/components/ranked-arena/MatchOverFrame";
import { QuestionPanel } from "@/components/ranked-arena/QuestionPanel";
import { RevealBanner } from "@/components/ranked-arena/RevealBanner";
import { RoundTimeline } from "@/components/ranked-arena/RoundTimeline";
import {
  projectRoundTimeline, TIMELINE_VISIBLE_NODES,
  type RoundTimelineView, type TimelineNode, type TimelineSegmentKind,
} from "@/pages/quiz-ranked/roundTimeline";
import type { TimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { SubmissionReview } from "@/components/ranked-arena/SubmissionReview";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import {
  ABILITY_OPTION_QUESTION, CHAMPION_OPTION_QUESTION, ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION, RUNE_OPTION_QUESTION, SUMMONER_SPELL_OPTION_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import type { BackendQuestionPayload } from "@/lib/ranked-core/adapters/optionMediaFixtures";
// Namespaced: the RA7 fixture module and this file both name a SELL_SWAP_Q,
// and the two are deliberately different questions (RA5's and RA7's).
import * as RA7 from "@/lib/question-surface/familyLayoutFixtures";
import type { QuizQuestion } from "@/lib/quiz/api";
import { adaptBackendSettlement } from "@/lib/ranked-core/backend/adaptBackendSettlement";
import {
  FIXTURE_P1_ID, FIXTURE_P2_ID, getScenario,
} from "@/lib/ranked-core/backend/backendSettlementFixtures";
import {
  AbilityView, CombatantView, InteractionPermissions, NO_INTERACTIONS,
  QuestionView, TimerView,
} from "@/lib/ranked-core/viewTypes";
// AI1 Phase 2B — the mascot bench drives the SAME projection the live match
// does, so nothing on it is a bench-only animation trigger.
import { projectMascotReactions } from "@/pages/quiz-ranked/rankedViews";
import { RANKED_ROLE_LABELS, RANKED_ROLES, type RankedRole } from "@/lib/ranked-public/roles";

// --------------------------------------------------------------- fixtures

function player(over: Partial<CombatantView> = {}): CombatantView {
  return {
    playerId: "you", name: "You", tag: "Tank", side: "player", classId: "tank",
    hp: 150, maxHp: 170, xp: 12, level: 1, nextLevelThreshold: 30,
    currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: "open",
    hasAbilitySelected: false, ...over,
  };
}
function opponent(over: Partial<CombatantView> = {}): CombatantView {
  return {
    playerId: "opp", name: "Opponent", tag: "Mage", side: "opponent",
    classId: "mage", hp: 150, maxHp: 150, xp: 9, level: 1,
    nextLevelThreshold: 30, currentLevelThreshold: 0, hasSubmitted: false,
    abilityWindow: "open", hasAbilitySelected: null, ...over,
  };
}

const QUESTION: QuestionView = {
  questionId: "q1", category: "items",
  prompt: "Darius bought Doran's Blade, a Health Potion, Phage and Kindlegem. How much gold spent?",
  options: [
    { id: "0", index: 0, label: "2400" },
    { id: "1", index: 1, label: "2500" },
    { id: "2", index: 2, label: "2450" },
    { id: "3", index: 3, label: "2300" },
  ],
};

const TIMER = (over: Partial<TimerView> = {}): TimerView => ({
  durationSeconds: 30, remainingSeconds: 22, paused: false, urgent: false, ...over,
});

const ABILITIES = (over: Partial<AbilityView>[] = []): AbilityView[] => {
  const base: AbilityView[] = [
    { id: "tank.fortify", name: "Fortify", description: "+5s next round on a correct answer.",
      unlocked: true, remainingCharges: 3, selected: false, locked: false, exhausted: false },
    { id: "tank.brace", name: "Brace", description: "Reduce incoming damage next round.",
      unlocked: false, remainingCharges: 3, selected: false, locked: false, exhausted: false,
      unavailableReason: "Unlocks at Level 2." },
    { id: "tank.barrier", name: "Barrier", description: "One-time shield.",
      unlocked: false, remainingCharges: 1, selected: false, locked: false, exhausted: false,
      unavailableReason: "Unlocks at Level 3." },
  ];
  return base.map((a, i) => ({ ...a, ...(over[i] ?? {}) }));
};

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

const NAMES = { [FIXTURE_P1_ID]: "You", [FIXTURE_P2_ID]: "Opponent" };
const settlement = (key: string) =>
  adaptBackendSettlement(getScenario(key)!.settlement,
    { p1PlayerId: FIXTURE_P1_ID, p2PlayerId: FIXTURE_P2_ID });

// ---------------------------------------------------- shared surface fixtures

const ITEM_Q: QuestionView = {
  questionId: "sq-item", category: "items",
  prompt: "Which item grants the largest single burst of Ability Power?",
  options: [
    { id: "0", index: 0, label: "Rabadon's Deathcap" },
    { id: "1", index: 1, label: "Needlessly Large Rod" },
    { id: "2", index: 2, label: "Blasting Wand" },
    { id: "3", index: 3, label: "Amplifying Tome" },
  ],
};
const CHAMP_Q: QuestionView = {
  questionId: "sq-champ", category: "champions",
  prompt: "Which region is Ahri from?",
  options: [
    { id: "0", index: 0, label: "Ionia" },
    { id: "1", index: 1, label: "Noxus" },
    { id: "2", index: 2, label: "Demacia" },
    { id: "3", index: 3, label: "Piltover" },
  ],
};
const subjectSource = (q: QuestionView, subject: Record<string, unknown>): QuizQuestion => ({
  id: q.questionId, category: q.category ?? "", question_text: q.prompt,
  format: "multiple_choice", choices: q.options.map((o) => o.label),
  metadata: { assets: { subject } },
});
const ITEM_SCENARIO = subjectSource(ITEM_Q, { type: "item", name: "Rabadon's Deathcap", icon: "assets/items/3089.png" });
const CHAMP_SCENARIO = subjectSource(CHAMP_Q, { type: "champion", name: "Ahri", icon: "assets/champions/Ahri.png" });
const BROKEN_SCENARIO = subjectSource(ITEM_Q, { type: "item", name: "Missing Icon", icon: "assets/items/does-not-exist.png" });
// A source that is PRESENT but classifies to nothing cinematic (unknown subject
// type, no icon) — must fall to the compact band, not a large empty panel.
const LOW_CONTENT_SCENARIO = subjectSource(
  { ...ITEM_Q, category: "combat" },
  { type: "mystery-unknown" },
);

// Cases exercising the REAL Ranked transport contract: a PublicQuestionSource
// (as parsed from the backend public projection) run through the shared
// scenario adapter — no hand-built ScenarioSource, no backend fixture schema.
const ABILITY_Q: QuestionView = {
  questionId: "sq-ability", category: "abilities",
  prompt: "In which ability slot does Darius cast Decimate?",
  options: [
    { id: "0", index: 0, label: "Q" }, { id: "1", index: 1, label: "W" },
    { id: "2", index: 2, label: "E" }, { id: "3", index: 3, label: "R" },
  ],
};
const RECIPE_Q: QuestionView = {
  questionId: "sq-recipe", category: "items",
  prompt: "Trinity Force builds from Sheen, Phage, and which other component?",
  options: [
    { id: "0", index: 0, label: "Kindlegem" }, { id: "1", index: 1, label: "Ruby Crystal" },
    { id: "2", index: 2, label: "Cloth Armor" }, { id: "3", index: 3, label: "Null-Magic Mantle" },
  ],
};
const COMPARISON_Q: QuestionView = {
  questionId: "sq-comparison", category: "items",
  prompt: "Which stat do BOTH Doran's Blade and Doran's Ring provide?",
  options: [
    { id: "0", index: 0, label: "Health" }, { id: "1", index: 1, label: "Mana" },
    { id: "2", index: 2, label: "Armor" }, { id: "3", index: 3, label: "Attack speed" },
  ],
};

const transportSource = (q: QuestionView, presentation: Record<string, unknown>): QuizQuestion | null =>
  scenarioSourceFromPublicQuestion({
    questionId: q.questionId, prompt: q.prompt,
    options: q.options.map((o) => o.label), category: q.category ?? null,
    presentation,
  });

// RA3-MEDIA-P5. Copied VERBATIM from ranked_public.question_media for the
// shipped `placeholder-rm-ability` card. Two absences are the point: there is
// no slot anywhere (it is the ANSWER), and the ability icon is a route rather
// than an assets/ path, because the file on disk is `Q_DariusCleave.png` and
// its name would hand the answer over. Before this the same question carried a
// bare `{type: "ability", name, champion}` subject with no icon, which
// classified as a label-only spell and rendered the empty card.
const ABILITY_SCENARIO = transportSource(ABILITY_Q, {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Darius",
      champion_icon: "assets/champions/Darius/icon.png",
      champion_splash: "assets/champions/Darius/splash/0_default.jpg",
      item_icons: [],
      ability_name: "Decimate",
      ability_icon: "api/ranked/media/ability-icon/Darius/Decimate.png",
      badge: "Champion Ability",
    },
    entities: {
      champions: [
        { type: "champion", id: "Darius", name: "Darius", role: "subject",
          icon: "assets/champions/Darius/icon.png",
          splash: "assets/champions/Darius/splash/0_default.jpg",
          loading: "assets/champions/Darius/loading/0_default.jpg", default_skin: 0 },
      ],
      items: [],
      abilities: [
        { type: "ability", id: "Darius:Decimate", name: "Decimate", champion: "Darius",
          role: "subject", icon: "api/ranked/media/ability-icon/Darius/Decimate.png" },
      ],
      runes: [], summoner_spells: [],
    },
  },
  presentation: {
    scenario_type: "combat_calculation", role: "context", timing: "question", spoiler: false,
  },
});
const RECIPE_SCENARIO = transportSource(RECIPE_Q, {
  assets: { subject: { type: "item", name: "Trinity Force", icon: "assets/items/3078.png" } },
  known_components: ["Sheen", "Phage"],
  known_component_icons: [
    { name: "Sheen", icon: "assets/items/3057.png" },
    { name: "Phage", icon: "assets/items/3044.png" },
  ],
  presentation: { scenario_type: "item", role: "context", timing: "question", spoiler: false },
});
const COMPARISON_SCENARIO = transportSource(COMPARISON_Q, {
  assets: { subject: { type: "comparison", subjects: [
    { name: "Doran's Blade", icon: "assets/items/1055.png" },
    { name: "Doran's Ring", icon: "assets/items/1056.png" },
  ] } },
  presentation: { scenario_type: "comparison", role: "context", timing: "question", spoiler: false },
});
// A subject that IS the answer (champion identification): the surface must HIDE
// it pre-reveal and reveal it only when a backend-authoritative reveal arrives.
const SPOILER_SCENARIO = transportSource(CHAMP_Q, {
  assets: { subject: { type: "champion", name: "Ahri" } },
  presentation: { scenario_type: "champion_profile", role: "answer", timing: "reveal", spoiler: true },
});

// --- normalized premise media entities (RA3-MEDIA-P4) --------------------
// A real accepted-bank question, with the payload copied VERBATIM from
// ranked_public.question_media. The two cases below are meant to be compared:
// the same question, with and without the entity collection, so the theme
// redesign can see exactly which entities the payload now makes available
// (both champions, the ability, both items) and which it never did.
const DAMAGE_Q: QuestionView = {
  questionId: "sq-damage", category: "post_mitigation_damage",
  prompt: "Syndra has Sorcerer's Shoes and Void Staff. Syndra hits Ornn with Unleashed Power "
    + "for 750 raw magic damage. Ornn has 120 magic resist. How much post-mitigation damage "
    + "is dealt after penetration?",
  options: [
    { id: "0", index: 0, label: "610" }, { id: "1", index: 1, label: "469" },
    { id: "2", index: 2, label: "455" }, { id: "3", index: 3, label: "539" },
  ],
};
const DAMAGE_SUBJECT = {
  type: "combat_cooldown", champion: "Syndra",
  champion_icon: "assets/champions/Syndra/icon.png",
  champion_splash: "assets/champions/Syndra/splash/0_default.jpg",
  item_icons: [
    { name: "Sorcerer's Shoes", icon: "assets/items/3020.png" },
    { name: "Void Staff", icon: "assets/items/3135.png" },
  ],
  ability_slot: "R", ability_name: "Unleashed Power",
  ability_icon: "assets/champions/Syndra/R_SyndraR.png",
};
const DAMAGE_FLAGS = {
  scenario_type: "combat_calculation", role: "context", timing: "question", spoiler: false,
};
const ENTITIES_SCENARIO = transportSource(DAMAGE_Q, {
  assets: {
    subject: DAMAGE_SUBJECT,
    entities: {
      champions: [
        { type: "champion", id: "Syndra", name: "Syndra", role: "attacker",
          icon: "assets/champions/Syndra/icon.png",
          splash: "assets/champions/Syndra/splash/0_default.jpg",
          loading: "assets/champions/Syndra/loading/0_default.jpg", default_skin: 0 },
        { type: "champion", id: "Ornn", name: "Ornn", role: "target",
          icon: "assets/champions/Ornn/icon.png",
          splash: "assets/champions/Ornn/splash/0_default.jpg",
          loading: "assets/champions/Ornn/loading/0_default.jpg", default_skin: 0 },
      ],
      items: [
        { type: "item", id: 3020, name: "Sorcerer's Shoes", role: "attacker", icon: "assets/items/3020.png" },
        { type: "item", id: 3135, name: "Void Staff", role: "attacker", icon: "assets/items/3135.png" },
      ],
      abilities: [
        { type: "ability", id: "Syndra:R", name: "Unleashed Power", champion: "Syndra",
          slot: "R", role: "attacker", icon: "assets/champions/Syndra/R_SyndraR.png" },
      ],
      runes: [], summoner_spells: [],
    },
  },
  presentation: DAMAGE_FLAGS,
});
// The SAME question as it was frozen before RA3-MEDIA-P4: subject only. Must
// render exactly as it always did, with no entity strip.
const LEGACY_SUBJECT_SCENARIO = transportSource(DAMAGE_Q, {
  assets: { subject: DAMAGE_SUBJECT },
  presentation: DAMAGE_FLAGS,
});

// RA5 — a sell-swap, which rendered NOTHING at all before this phase. The
// payload is verbatim `ranked_public.question_media` output for a real
// accepted-bank candidate, so the temporary status treatment (faded + struck
// sold, ringed purchase, neutral retained) is judged against what production
// actually serves rather than against a hand-written shape.
const SELL_SWAP_Q: QuestionView = {
  questionId: "sq-sell-swap", category: "flat_inventory_stat",
  prompt: "Ornn started with Doran's Shield and still has Sunfire Aegis. Later, Ornn sold "
    + "Doran's Shield and bought Abyssal Mask. How much flat health do Ornn's items "
    + "provide now?",
  options: [
    { id: "0", index: 0, label: "750" }, { id: "1", index: 1, label: "810" },
    { id: "2", index: 2, label: "700" }, { id: "3", index: 3, label: "800" },
  ],
};
const SELL_SWAP_SCENARIO = transportSource(SELL_SWAP_Q, {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Ornn",
      champion_icon: "assets/champions/Ornn/icon.png",
      champion_splash: "assets/champions/Ornn/splash/0_default.jpg",
      // The subject row asserts possession, so it is the CURRENT loadout. The
      // sold item is in the strip above, tagged — not omitted, not in this row.
      item_icons: [
        { name: "Sunfire Aegis", icon: "assets/items/3068.png" },
        { name: "Abyssal Mask", icon: "assets/items/8020.png" },
      ],
    },
    entities: {
      champions: [
        { type: "champion", id: "Ornn", name: "Ornn", role: "subject",
          icon: "assets/champions/Ornn/icon.png",
          splash: "assets/champions/Ornn/splash/0_default.jpg",
          loading: "assets/champions/Ornn/loading/0_default.jpg", default_skin: 0 },
      ],
      items: [
        { type: "item", id: 3068, name: "Sunfire Aegis", role: "subject",
          status: "retained", icon: "assets/items/3068.png" },
        { type: "item", id: 8020, name: "Abyssal Mask", role: "subject",
          status: "purchased", icon: "assets/items/8020.png" },
        { type: "item", id: 1054, name: "Doran's Shield", role: "subject",
          status: "sold", icon: "assets/items/1054.png" },
      ],
      abilities: [], runes: [], summoner_spells: [],
    },
  },
  presentation: DAMAGE_FLAGS,
});

// --- canonical answer-option media (RA6) ---------------------------------
// Payloads dumped VERBATIM from the backend (ranked_public.option_media via
// QuestionRecord.public_view) and run through the SAME transport adapters the
// live arena uses, so what renders here is what a real round would render —
// including the premise band, which this phase does not touch.
function optionMediaCase(payload: BackendQuestionPayload): {
  question: QuestionView; scenarioSource: QuizQuestion | null;
} {
  const source = {
    questionId: payload.question_id, prompt: payload.prompt,
    options: payload.options, category: payload.category,
    presentation: payload.presentation ?? null,
    optionMedia: payload.option_media ?? null,
  };
  return {
    question: questionViewFromPublicQuestion(source),
    scenarioSource: scenarioSourceFromPublicQuestion(source),
  };
}

const OM_ITEM = optionMediaCase(ITEM_OPTION_QUESTION);
const OM_CHAMPION = optionMediaCase(CHAMPION_OPTION_QUESTION);
const OM_ABILITY = optionMediaCase(ABILITY_OPTION_QUESTION);
const OM_RUNE = optionMediaCase(RUNE_OPTION_QUESTION);
const OM_SPELL = optionMediaCase(SUMMONER_SPELL_OPTION_QUESTION);
const OM_NUMERIC = optionMediaCase(NUMERIC_QUESTION);

function Surface(props: Partial<React.ComponentProps<typeof InteractiveScenarioSurface>>) {
  return (
    <InteractiveScenarioSurface
      question={ITEM_Q}
      selectedOptionId={null}
      permissions={OPEN}
      onSelectOption={() => {}}
      variant="competitive"
      {...props}
    />
  );
}

// ------------------------------------------------------------------ states

interface InspectorState {
  key: string;
  label: string;
  render: () => React.ReactNode;
}

function Combatants({ p, o }: { p: CombatantView; o: CombatantView }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CombatantPanel combatant={p} />
      <CombatantPanel combatant={o} />
    </div>
  );
}

/**
 * Full arena composition — mirrors QuizRankedMatch's shared layout (header
 * plate + You⚔Question⚔Opponent grid + compact ability hotbar + status line +
 * reveal banner) from static fixtures, so the no-scroll desktop composition
 * and responsive stack can be QA'd without a live match. Carries the SAME
 * `ranked-academy` theme class the live Frame applies, so the inspector shows
 * the pixels the route ships. Presentation only; no controller/engine import.
 */
/**
 * RG — the round timeline, driven by the REAL projection.
 *
 * A Ranked match ends on HP, so the timeline is a moving viewport over an
 * indefinite sequence rather than a fixed cycle. The one thing that has to be
 * judged by looking at it is that the CURRENT MARKER HOLDS STILL while the
 * rounds travel beneath it — which a static fixture cannot show. So the bench
 * below drives `projectRoundTimeline` from a round number the inspector can
 * step, with a deterministic synthetic history behind it.
 *
 * Every value fed in is the shape the live arena feeds: real adapted
 * settlements, and a segment-identity map with the same contents the live
 * observation would have accumulated.
 */
const BENCH_SETTLEMENT_KEYS = [
  "solo-correct", "both-correct-faster", "both-incorrect-wash", "timed-out",
] as const;

/** Rounds the "server" told this client were Meta Reflex blocks. */
const BENCH_META_REFLEX_ROUNDS = new Set([4, 9, 16, 21, 28]);

function benchObservedKinds(current: number): Map<number, TimelineSegmentKind> {
  const kinds = new Map<number, TimelineSegmentKind>();
  // Only rounds this client would actually have SEEN: the ones it played.
  for (let r = 1; r <= current; r += 1) {
    kinds.set(r, BENCH_META_REFLEX_ROUNDS.has(r) ? "meta-reflex" : "standard");
  }
  return kinds;
}

/** The last eight settlements, as the bounded live ledger would hold them. */
function benchSettlements(current: number) {
  const rows = [];
  for (let r = Math.max(1, current - 8); r < current; r += 1) {
    const key = BENCH_SETTLEMENT_KEYS[r % BENCH_SETTLEMENT_KEYS.length];
    rows.push({ ...settlement(key), roundNumber: r });
  }
  return rows;
}

/**
 * RG2 — the topics this client would have accumulated, round by round.
 *
 * Modelled on the twelve-segment Ranked pattern because that is what a real
 * match serves, but PUBLISHED ONLY FOR ROUNDS ALREADY PLAYED — which is the
 * whole point of the bench. The strip must show subjects and difficulties
 * behind the marker and nothing at all in front of it, and a fixture that
 * filled in the future would hide exactly the bug worth catching.
 */
// NOTE the icon paths: the canonical champion portrait is
// `assets/champions/<Name>/icon.png`, NOT `<Name>.png` — the latter 404s on
// the asset host, which is exactly the case-and-convention class of mistake
// the backend verifies paths on disk to prevent. A bench that gets it wrong
// certifies a blank plate.
const BENCH_PATTERN: Array<[string, string | null, string | null, string | null]> = [
  ["itemization", "easy", "item", "assets/items/1055.png"],
  ["summoner-spells", "easy", "summoner_spell", "assets/summoner_spells/Flash.png"],
  ["itemization", "medium", "item", "assets/items/3031.png"],
  ["meta-reflex", null, "meta_reflex", null],
  ["itemization", "medium", "item", "assets/items/3078.png"],
  ["abilities", "hard", "champion", "assets/champions/Aatrox/icon.png"],
  ["itemization", "easy", "item", "assets/items/1001.png"],
  ["abilities", "medium", "champion", "assets/champions/Lux/icon.png"],
  ["meta-reflex", null, "meta_reflex", null],
  ["abilities", "scenario", "champion", "assets/champions/Darius/icon.png"],
  ["champion-stats", "medium", "champion", "assets/champions/Garen/icon.png"],
  ["objectives", "easy", "category", null],
];

function benchTopics(current: number): Map<number, TimelineTopic> {
  const topics = new Map<number, TimelineTopic>();
  // Rounds this client actually SAW — up to and including the one in play.
  for (let r = 1; r <= current; r += 1) {
    const [category, tier, kind, icon] = BENCH_PATTERN[(r - 1) % 12];
    topics.set(r, {
      category: category as TimelineTopic["category"],
      tier: tier as TimelineTopic["tier"],
      iconHint: { kind: kind as string, key: null, icon },
    });
  }
  return topics;
}

function benchTimeline(current: number, matchOver = false) {
  return projectRoundTimeline({
    roundNumber: current,
    completedRounds: current - 1,
    segmentRoundNumber: current,
    matchOver,
    observedKinds: benchObservedKinds(current),
    observedTopics: benchTopics(current),
    settlements: benchSettlements(current),
    viewerSlot: "p1",
  });
}

/**
 * RG2 — every node state on one strip, for the visual certification.
 *
 * Not a projection: a hand-built window, because the point is to see all nine
 * public categories, all four difficulties, all four verdicts and all three
 * states SIDE BY SIDE and judge whether the node reads at the size it actually
 * ships at. The live behaviour is what the steppable bench above is for.
 */
const CERT_ROW: Array<Partial<TimelineNode> & { roundNumber: number }> = [
  { roundNumber: 1, state: "resolved", outcome: "correct",
    topic: t("objectives", "easy", "category", null) },
  { roundNumber: 2, state: "resolved", outcome: "incorrect",
    topic: t("wave-management", "medium", "category", null) },
  { roundNumber: 3, state: "resolved", outcome: "correct",
    topic: t("summoner-spells", "hard", "summoner_spell",
      "assets/summoner_spells/Flash.png") },
  { roundNumber: 4, state: "resolved", outcome: "both-correct",
    topic: t("itemization", "medium", "item", "assets/items/3031.png") },
  { roundNumber: 5, state: "resolved", outcome: "timed-out",
    topic: t("abilities", "scenario", "champion",
      "assets/champions/Aatrox/icon.png") },
  { roundNumber: 6, state: "resolved", outcome: "correct",
    topic: t("vision", "easy", "category", null) },
  { roundNumber: 7, state: "resolved", outcome: "incorrect",
    topic: t("champion-stats", "medium", "champion",
      "assets/champions/Garen/icon.png") },
  { roundNumber: 8, state: "resolved", outcome: "correct",
    topic: t("scenarios", "scenario", "champion",
      "assets/champions/Darius/icon.png") },
  { roundNumber: 9, state: "resolved", outcome: "correct",
    topic: t("runes", "hard", "category", null) },
  { roundNumber: 10, state: "resolved", outcome: "incorrect",
    topic: t("fundamentals", "easy", "category", null) },
  { roundNumber: 11, state: "resolved", outcome: "correct",
    topic: t("meta-reflex", null, "meta_reflex", null) },
  { roundNumber: 12, state: "current", outcome: null,
    topic: t("itemization", "medium", "item", "assets/items/3078.png") },
  { roundNumber: 13, state: "upcoming", outcome: null,
    topic: t("abilities", "hard", "category", null) },
  { roundNumber: 14, state: "upcoming", outcome: null, topic: null },
];

function t(category: string, tier: string | null, kind: string,
  icon: string | null): TimelineTopic {
  return {
    category: category as TimelineTopic["category"],
    tier: tier as TimelineTopic["tier"],
    iconHint: { kind, key: null, icon },
  };
}

function certTimeline(from: number, count: number): RoundTimelineView {
  const slice = CERT_ROW.slice(from, from + count);
  return {
    visibleNodes: count,
    anchorIndex: Math.min(4, count - 1),
    windowStart: slice[0].roundNumber,
    currentIndex: slice.findIndex((n) => n.state === "current") >= 0
      ? slice.findIndex((n) => n.state === "current") : null,
    currentRoundNumber: slice.find((n) => n.state === "current")?.roundNumber
      ?? null,
    anchored: true,
    nodes: slice.map((n, index) => ({
      index, visible: true, segmentKind: null, tag: null, outcome: null,
      topic: null, state: "resolved", ...n,
    }) as TimelineNode),
  };
}

function NodeCertificationBench() {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        RG2 — every node state at shipping size. Top edge = result, middle =
        subject (+ badge), bottom edge = difficulty metal — 1 bronze, 2 silver,
        3 gold, and never more than three. Nodes 5 and 8 are scenario-tier and
        must be indistinguishable from a hard node here; their scenario-ness
        is carried by the subject and badge instead. Round 14 is a future round
        with NO published topic: neutral, and no difficulty.
      </p>
      {[[0, 7], [7, 7]].map(([from, count]) => (
        <div key={from} className="ranked-shell ranked-academy">
          <RoundTimeline timeline={certTimeline(from, count)} />
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Row 1: Objectives easy/correct · Waves medium/incorrect · Summoners
        hard/correct · Items medium/both-correct · Abilities
        scenario/timed-out · Vision easy/correct · Champion Stats
        medium/incorrect. Row 2: Scenarios · Runes · Fundamentals · Meta Reflex
        · CURRENT · future known · future unknown.
      </p>
    </div>
  );
}

/**
 * Steppable bench. The buttons only change a round NUMBER — everything on
 * screen is then re-derived by the real projection, so what is being judged is
 * the shipped behaviour and not a mock of it.
 */
function RoundTimelineBench() {
  const [round, setRound] = useState(7);
  const step = (delta: number) => setRound((r) => Math.max(1, r + delta));
  const timeline = benchTimeline(round);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => step(-1)}
          className="rounded border border-border px-2 py-1 font-semibold">◀ prev</button>
        <button type="button" onClick={() => step(1)}
          className="rounded border border-border px-2 py-1 font-semibold">next ▶</button>
        <span className="tabular-nums text-muted-foreground">
          round {round} · window {timeline.windowStart}–
          {timeline.windowStart + TIMELINE_VISIBLE_NODES - 1} ·
          slot {timeline.currentIndex} · {timeline.anchored ? "ANCHORED" : "warming up"}
        </span>
        {[1, 2, 5, 6, 12, 13, 20, 31, 100].map((r) => (
          <button key={r} type="button" onClick={() => setRound(r)}
            className="rounded border border-border px-2 py-0.5">R{r}</button>
        ))}
      </div>
      <div className="ranked-shell ranked-academy">
        <RoundTimeline timeline={timeline} />
      </div>
      <div className="ranked-shell ranked-academy">
        <RoundTimeline timeline={benchTimeline(round, true)} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Second strip: the same round with the match OVER — no round in play, so
        no marker, and no future rounds sketched past the last one.
      </p>
    </div>
  );
}

function ArenaComposition({
  selected = "0",
  locked = false,
  question = ITEM_Q,
  scenarioSource = ITEM_SCENARIO,
}: {
  selected?: string | null;
  locked?: boolean;
  question?: QuestionView;
  scenarioSource?: QuizQuestion | null;
}) {
  const perms = locked ? NO_INTERACTIONS : OPEN;
  return (
    <div className="ranked-shell ranked-academy space-y-3">
      <section className="ranked-panel ranked-header-plate flex min-h-[3.5rem] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
        <div>
          <div className="ranked-eyebrow">Ranked Duel · vs Bot</div>
          <h3 className="ranked-title text-lg font-bold leading-tight">Round 7</h3>
        </div>
        <div className="flex items-center gap-3 sm:border-l sm:border-[#b9934c]/30 sm:pl-4">
          <TimerDisplay timer={TIMER({ remainingSeconds: 18 })} label="Shared round timer" />
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,14rem)] lg:items-start xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)] min-[1500px]:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,17rem)] min-[1500px]:gap-4">
        <div className="lg:col-start-1 lg:row-start-1">
          <CombatantPanel combatant={player()} />
        </div>
        <div className="lg:col-start-3 lg:row-start-1">
          <CombatantPanel combatant={opponent()} />
        </div>
        <section data-testid="ranked-question"
          className="ranked-panel ranked-folio col-span-2 p-3 sm:p-5 min-[1500px]:px-7 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <InteractiveScenarioSurface question={question} selectedOptionId={selected} permissions={perms}
            onSelectOption={() => {}} variant="competitive" scenarioSource={scenarioSource} />
        </section>
      </div>
      <div className="flex flex-col gap-1.5">
        {/* RA11: no panel wrapper — the tray renders its own spine dock. */}
        <section>
          <AbilityTray abilities={ABILITIES([{ selected: true }])} selectedAbilityId="tank.fortify"
            permissions={perms} onSelectAbility={() => {}} noAbilityLabel="Clear ability" />
        </section>
        <p className="line-clamp-2 min-h-[2.25rem] px-1 text-xs text-muted-foreground">
          {locked ? "Answer locked — waiting for opponent…" : "Choose an answer to lock it in."}
        </p>
      </div>
      {/* RG — the arena's real BOTTOM region: the round timeline. Fed by the
          same projection the live arena uses, so what is judged here is the
          shipped strip rather than a mock of it. Round 7, still walking out
          toward the anchor, with the settled rounds carrying their verdicts.
          The steppable bench (a case of its own) is where the SLIDE is
          judged. */}
      <RoundTimeline timeline={benchTimeline(7)} />
      {/* RETAINED COMPONENT FIXTURE — NOT part of the live arena.
          `RevealBanner` was removed from the bottom of the arena (the region
          above now belongs to the timeline, continuously). It survives here so
          the component itself stays inspectable. */}
      <RevealBanner settlement={settlement("solo-correct")} viewerSlot="p1"
        namesByPlayerId={NAMES} />
    </div>
  );
}

// -------------------------------------------------- AI1 mascot bench (2B)

/**
 * AI1 Phase 2B mascot bench.
 *
 * The one surface where the mascot presentation can be judged the way the
 * owner judges it — by looking at it. It renders the REAL `CombatantPanel` in
 * the REAL arena proportions, and every reaction on screen is produced by the
 * REAL projection (`projectMascotReactions`) reading a REAL backend-shaped
 * settlement out of `backendSettlementFixtures`. There is no bench-only
 * animation trigger and no hand-written reaction object anywhere below: if the
 * projection would not move a mascot in a live match, nothing here moves it
 * either.
 *
 * Still fixtures, still no engine, no controller, no fetch — the buttons
 * choose WHICH settled round to look at, they do not settle one.
 */
function MascotBench() {
  // `null` is a real, permanently-supported value here, not a placeholder: a
  // bot has no role and never gets one invented for it. It is on the bench
  // because the MIXED match — one side with a role, one without — is the state
  // that used to break the two columns' symmetry, and the only way the owner
  // can judge the repair is by looking at it.
  const [playerRole, setPlayerRole] = useState<RankedRole | null>("top");
  const [opponentRole, setOpponentRole] = useState<RankedRole | null>("mid");
  // A settled round: the scenario, plus the round number it settled as. The
  // number is bumped on every press so consecutive presses of the SAME button
  // are two different events — exactly what a live match produces, and what
  // the mascot's edge-triggered playback needs to retrigger.
  const [round, setRound] = useState<{ key: string; n: number } | null>(null);

  const resolved = round === null ? null : {
    ...settlement(round.key), roundNumber: round.n,
  };
  // Gated on `true` — the bench IS the reveal beat.
  const reactions = projectMascotReactions(resolved, true);

  const fire = (key: string) => setRound((r) => ({ key, n: (r?.n ?? 0) + 1 }));
  const combatantFor = (side: "player" | "opponent") => {
    const role = side === "player" ? playerRole : opponentRole;
    const identity = {
      // A role match, decided once for BOTH columns — exactly as
      // `projectCombatants` decides it from the snapshot.
      identityMode: "role" as const,
      roleId: role,
      tag: role === null ? undefined : RANKED_ROLE_LABELS[role],
    };
    return side === "player"
      ? player({ playerId: FIXTURE_P1_ID, ...identity })
      : opponent({ playerId: FIXTURE_P2_ID, ...identity });
  };
  const roleButtons = (
    value: RankedRole | null, set: (r: RankedRole | null) => void, label: string,
  ) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-20 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {RANKED_ROLES.map((r) => (
        <button key={r} type="button" onClick={() => set(r)}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            r === value ? "border-primary bg-primary/15" : "border-white/15"}`}>
          {RANKED_ROLE_LABELS[r]}
        </button>
      ))}
      <button type="button" onClick={() => set(null)}
        className={`rounded border px-2 py-0.5 text-[11px] ${
          value === null ? "border-primary bg-primary/15" : "border-white/15"}`}>
        No role (bot)
      </button>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-lg border border-white/10 p-2.5">
        {roleButtons(playerRole, setPlayerRole, "You")}
        {roleButtons(opponentRole, setOpponentRole, "Opponent")}
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <span className="w-20 text-[11px] uppercase tracking-widest text-muted-foreground">Settle</span>
          {[
            ["solo-correct", "You deal 30 (they recoil)"],
            ["timed-out", "They time out"],
            ["shield-absorb", "Shielded hit"],
            ["both-incorrect-wash", "Wash — nobody moves"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => fire(key)}
              className="rounded border border-white/15 px-2 py-0.5 text-[11px] hover:border-primary">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setRound(null)}
            className="rounded border border-white/15 px-2 py-0.5 text-[11px]">Reset</button>
        </div>
        <p className="pt-1 text-[11px] text-muted-foreground">
          Round {round?.n ?? 0} ·{" "}
          {Object.entries(reactions).map(([id, r]) => `${id}: ${r.action}`).join("  ·  ")
            || "no reaction"}{" "}
          · click a mascot for its own reaction
        </p>
      </div>
      {/* QuizRankedMatch's own arena grid proportions (23 / 54 / 23). */}
      <div className="ranked-shell ranked-academy">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)] lg:items-stretch min-[1500px]:gap-4">
          <div className="lg:col-start-1 lg:row-start-1 lg:h-full">
            <CombatantPanel combatant={combatantFor("player")} progressionEnabled={false}
              damage={[
                { roundNumber: 1, outcome: "correct", dealt: 30, taken: 0,
                  absorbed: 0, hpBefore: 170, hpAfter: 170, timeExpired: false },
                { roundNumber: 2, outcome: "incorrect", dealt: 0, taken: 12,
                  absorbed: 0, hpBefore: 170, hpAfter: 158, timeExpired: false },
              ]}
              reaction={reactions[FIXTURE_P1_ID] ?? null} />
          </div>
          <div className="lg:col-start-3 lg:row-start-1 lg:h-full">
            <CombatantPanel combatant={combatantFor("opponent")} progressionEnabled={false}
              damage={[
                { roundNumber: 1, outcome: "incorrect", dealt: 0, taken: 30,
                  absorbed: 0, hpBefore: 150, hpAfter: 120, timeExpired: false },
                { roundNumber: 2, outcome: "correct", dealt: 12, taken: 0,
                  absorbed: 0, hpBefore: 120, hpAfter: 120, timeExpired: false },
              ]}
              reaction={reactions[FIXTURE_P2_ID] ?? null} />
          </div>
          <section data-testid="ranked-question"
            className="ranked-panel ranked-folio col-span-2 p-3 sm:p-5 lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <InteractiveScenarioSurface question={ITEM_Q} selectedOptionId={null} permissions={OPEN}
              onSelectOption={() => {}} variant="competitive" scenarioSource={ITEM_SCENARIO} />
          </section>
        </div>
      </div>
    </div>
  );
}

// PT1.3 — the post-match discovery ceremony, in the frame's existing summary
// slot. A FIXTURE shaped exactly like the backend's own payload, so the layout
// QA judges the real component rather than a stand-in.
const DISCOVERY_FIXTURE = {
  schemaVersion: "ranked_duel.match_discoveries.v1",
  serverTime: "2026-09-03T12:00:05Z",
  matchId: "rkb_demo",
  scope: "ranked_discoveries",
  includesDefaultLibrary: false,
  newDiscoveries: [
    { canonicalQuestionRef: "ranked:v2-030", firstSeenAt: "2026-09-03T12:00:00Z",
      firstRoundNumber: 1, metadataStatus: "resolved" as const,
      metadataSource: "frozen_round",
      question: { prompt: "What is Flash's base cooldown at level 1?",
        category: "Summoner Spells" } },
    { canonicalQuestionRef: "ranked:v2-031", firstSeenAt: "2026-09-03T12:01:00Z",
      firstRoundNumber: 3, metadataStatus: "resolved" as const,
      metadataSource: "frozen_round",
      question: { prompt: "How much gold is a Doran's Shield plus two Health Potions?",
        category: "Item Costs" } },
    { canonicalQuestionRef: "ranked:retired", firstSeenAt: "2026-09-03T12:02:00Z",
      firstRoundNumber: 5, metadataStatus: "unavailable" as const,
      metadataSource: "current_serving_bank", question: null },
  ],
  newCount: 3,
  collectionTotal: 423,
  collectionTotalBefore: 420,
  truncated: false,
};

const STATES: InspectorState[] = [
  { key: "level1", label: "Level 1 — initial",
    render: () => <Combatants p={player()} o={opponent()} /> },
  { key: "answer-unselected", label: "Answer — unselected",
    render: () => (
      <QuestionPanel question={QUESTION}>
        <AnswerGrid options={QUESTION.options} selectedOptionId={null}
          permissions={OPEN} onSelectOption={() => {}} />
      </QuestionPanel>
    ) },
  { key: "answer-selected", label: "Answer — selected",
    render: () => (
      <QuestionPanel question={QUESTION}>
        <AnswerGrid options={QUESTION.options} selectedOptionId="0"
          permissions={OPEN} onSelectOption={() => {}} />
      </QuestionPanel>
    ) },
  { key: "submission-review", label: "Submission review",
    render: () => (
      <SubmissionReview
        submission={{ selectedOptionId: "0", selectedAbilityId: "tank.fortify", phase: "reviewing" }}
        answerLabel="2400" abilityName="Fortify" permissions={OPEN}
        onReview={() => {}} onEdit={() => {}} onConfirm={() => {}} />
    ) },
  { key: "locked", label: "Locked / waiting",
    render: () => (
      <>
        <Combatants p={player({ hasSubmitted: true, abilityWindow: "locked", hasAbilitySelected: true })}
          o={opponent({ hasSubmitted: false })} />
        <SubmissionReview
          submission={{ selectedOptionId: "0", selectedAbilityId: null, phase: "locked" }}
          answerLabel="2400" abilityName={null} permissions={NO_INTERACTIONS}
          onReview={() => {}} onEdit={() => {}} onConfirm={() => {}}
          statusMessage={{ tone: "info", text: "Submitted — waiting for opponent…" }} />
      </>
    ) },
  { key: "timer-urgent", label: "Timer — urgent",
    render: () => <TimerDisplay timer={TIMER({ remainingSeconds: 4, urgent: true, modifierNotices: ["-5s pressure"] })} /> },
  { key: "ability-selected", label: "Ability — selected",
    render: () => (
      <AbilityTray abilities={ABILITIES([{ selected: true }])} selectedAbilityId="tank.fortify"
        permissions={OPEN} onSelectAbility={() => {}} />
    ) },
  { key: "ability-exhausted", label: "Ability — depleted charge",
    render: () => (
      <AbilityTray abilities={ABILITIES([{ remainingCharges: 0, exhausted: true, unavailableReason: "Out of charges." }])}
        selectedAbilityId={null} permissions={OPEN} onSelectAbility={() => {}} />
    ) },
  { key: "reveal-solo", label: "Reveal — player correct / opponent wrong",
    render: () => <RevealPanel settlement={settlement("solo-correct")} viewerSlot="p1" namesByPlayerId={NAMES} /> },
  { key: "reveal-both", label: "Reveal — both correct",
    render: () => <RevealPanel settlement={settlement("both-correct-faster")} viewerSlot="p1" namesByPlayerId={NAMES} /> },
  { key: "reveal-wash", label: "Reveal — both wrong (wash)",
    render: () => <RevealPanel settlement={settlement("both-incorrect-wash")} viewerSlot="p1" namesByPlayerId={NAMES} /> },
  { key: "reveal-timeout", label: "Reveal — opponent timed out",
    render: () => <RevealPanel settlement={settlement("timed-out")} viewerSlot="p1" namesByPlayerId={NAMES} /> },
  { key: "reveal-shield", label: "Reveal — shield / mitigation",
    render: () => <RevealPanel settlement={settlement("shield-absorb")} viewerSlot="p1" namesByPlayerId={NAMES} /> },
  { key: "level2", label: "Level 2 — choice",
    render: () => (
      <LevelUpPanel gatesNextRound
        event={{ kind: "level2-choice", pendingOptionId: "tank.brace", confirmedOptionId: null,
          options: [
            { id: "tank.brace", name: "Brace", description: "Reduce incoming damage." },
            { id: "tank.barrier", name: "Barrier", description: "One-time shield." },
          ] }}
        permissions={{ ...NO_INTERACTIONS, canSelectAbility: true, canConfirmSubmission: true }}
        onSelectOption={() => {}} onConfirmOption={() => {}} />
    ) },
  { key: "level3", label: "Level 3 — auto-unlock",
    render: () => (
      <LevelUpPanel event={{ kind: "level3-unlock", ability: { id: "tank.barrier", name: "Barrier", description: "One-time shield unlocked automatically at 66 XP." } }}
        permissions={NO_INTERACTIONS} />
    ) },
  { key: "low-hp", label: "Low HP tension",
    render: () => <Combatants p={player({ hp: 20, xp: 66, level: 3, nextLevelThreshold: null, currentLevelThreshold: 66 })}
      o={opponent({ hp: 10, xp: 54, level: 2, nextLevelThreshold: 66, currentLevelThreshold: 30 })} /> },
  { key: "victory", label: "Match over — victory",
    render: () => <MatchOverFrame result="victory" player={player({ hp: 40 })} opponent={opponent({ hp: 0 })}
      primaryAction={{ label: "Back to Quiz", onClick: () => {} }} /> },
  { key: "defeat", label: "Match over — defeat",
    render: () => <MatchOverFrame result="defeat" player={player({ hp: 0 })} opponent={opponent({ hp: 30 })}
      primaryAction={{ label: "Back to Quiz", onClick: () => {} }} /> },
  { key: "draw", label: "Match over — draw",
    render: () => <MatchOverFrame result="draw" player={player({ hp: 0 })} opponent={opponent({ hp: 0 })}
      subheading="No contest — both players left."
      primaryAction={{ label: "Back to Quiz", onClick: () => {} }} /> },
  { key: "discovery-reveal", label: "Match over — new questions discovered",
    render: () => <MatchOverFrame result="victory" player={player({ hp: 40 })} opponent={opponent({ hp: 0 })}
      summary={<DiscoveryReveal view={DISCOVERY_FIXTURE} onReview={() => {}} />}
      primaryAction={{ label: "Back to Quiz", onClick: () => {} }} /> },
  { key: "discovery-none", label: "Match over — no new discoveries",
    render: () => <MatchOverFrame result="defeat" player={player({ hp: 0 })} opponent={opponent({ hp: 30 })}
      summary={<DiscoveryReveal onReview={() => {}}
        view={{ ...DISCOVERY_FIXTURE, newDiscoveries: [], newCount: 0,
          collectionTotalBefore: 423 }} />}
      primaryAction={{ label: "Back to Quiz", onClick: () => {} }} /> },

  // --- full arena composition (layout QA) ---
  // RA10: one state per representative question surface, so centre prominence,
  // hotbar compactness and combatant identity are judged against the real band
  // families, not just the cinematic item card.
  { key: "arena-full", label: "Arena — full composition (cinematic item)",
    render: () => <ArenaComposition /> },
  { key: "arena-locked", label: "Arena — sealed / locked",
    render: () => <ArenaComposition locked /> },
  { key: "arena-combat", label: "Arena — combat family band",
    render: () => <ArenaComposition question={RA7.PHYSICAL_DAMAGE_Q}
      scenarioSource={RA7.PHYSICAL_DAMAGE_SCENARIO} selected={null} /> },
  { key: "arena-lifecycle", label: "Arena — item lifecycle band",
    render: () => <ArenaComposition question={RA7.SELL_SWAP_Q}
      scenarioSource={RA7.SELL_SWAP_SCENARIO} selected={null} /> },
  { key: "arena-compact", label: "Arena — compact fallback (no source)",
    render: () => <ArenaComposition scenarioSource={null} selected={null} /> },

  // --- shared InteractiveScenarioSurface ---
  { key: "surface-text-fallback", label: "Surface — compact band (no source)",
    render: () => <Surface /> },
  { key: "surface-lowcontent", label: "Surface — compact band (low-content source)",
    render: () => <Surface question={{ ...ITEM_Q, category: "combat" }} scenarioSource={LOW_CONTENT_SCENARIO} /> },
  { key: "surface-champion", label: "Surface — champion-rich",
    render: () => <Surface question={CHAMP_Q} scenarioSource={CHAMP_SCENARIO} /> },
  { key: "surface-item", label: "Surface — item-rich",
    render: () => <Surface scenarioSource={ITEM_SCENARIO} /> },
  { key: "surface-ability", label: "Surface — ability premise (champion + ability)",
    render: () => <Surface question={ABILITY_Q} scenarioSource={ABILITY_SCENARIO} /> },
  { key: "surface-recipe", label: "Surface — item-recipe (transport)",
    render: () => <Surface question={RECIPE_Q} scenarioSource={RECIPE_SCENARIO} /> },
  { key: "surface-comparison", label: "Surface — comparison (transport, falls back)",
    render: () => <Surface question={COMPARISON_Q} scenarioSource={COMPARISON_SCENARIO} /> },
  { key: "surface-media-entities", label: "Surface — premise media entities (all)",
    render: () => <Surface question={DAMAGE_Q} scenarioSource={ENTITIES_SCENARIO} /> },
  { key: "surface-media-legacy", label: "Surface — same question, pre-entities payload",
    render: () => <Surface question={DAMAGE_Q} scenarioSource={LEGACY_SUBJECT_SCENARIO} /> },
  { key: "surface-media-statuses", label: "Surface — premise statuses (sell-swap)",
    render: () => <Surface question={SELL_SWAP_Q} scenarioSource={SELL_SWAP_SCENARIO} /> },
  // --- RA7: family-specific premise layouts --------------------------------
  // The payloads are shared with the RA7 unit tests (familyLayoutFixtures), so
  // the pixels reviewed here and the DOM those tests assert on are one source.
  // Each family is paired with the case that must FALL BACK, because the
  // fallback is the contract that keeps this phase additive.
  { key: "family-combat-physical", label: "Family — post-mitigation (physical, armor 60→100)",
    render: () => <Surface question={RA7.PHYSICAL_DAMAGE_Q} scenarioSource={RA7.PHYSICAL_DAMAGE_SCENARIO} /> },
  { key: "family-combat-magic", label: "Family — post-mitigation (magic, single MR)",
    render: () => <Surface question={RA7.MAGIC_DAMAGE_Q} scenarioSource={RA7.MAGIC_DAMAGE_SCENARIO} /> },
  { key: "family-combat-passive", label: "Family — post-mitigation (passive, no ability entity)",
    render: () => <Surface question={RA7.PASSIVE_DAMAGE_Q} scenarioSource={RA7.PASSIVE_DAMAGE_SCENARIO} /> },
  { key: "family-combat-selected", label: "Family — post-mitigation, selected (geometry must not move)",
    render: () => <Surface question={RA7.PHYSICAL_DAMAGE_Q} scenarioSource={RA7.PHYSICAL_DAMAGE_SCENARIO}
      selectedOptionId="2" /> },
  { key: "family-combat-reveal", label: "Family — post-mitigation, revealed (geometry must not move)",
    render: () => <Surface question={RA7.PHYSICAL_DAMAGE_Q} scenarioSource={RA7.PHYSICAL_DAMAGE_SCENARIO}
      selectedOptionId="0" reveal={{ revealed: true, isCorrect: false, correctOptionId: "2" }} /> },
  { key: "family-combat-fallback", label: "Family — same damage question, pre-RA7 payload (falls back)",
    render: () => <Surface question={RA7.MAGIC_DAMAGE_Q} scenarioSource={RA7.LEGACY_DAMAGE_SCENARIO} /> },
  { key: "family-lifecycle-sellswap", label: "Family — item lifecycle (kept / bought / sold)",
    render: () => <Surface question={RA7.SELL_SWAP_Q} scenarioSource={RA7.SELL_SWAP_SCENARIO} /> },
  { key: "family-lifecycle-purchases", label: "Family — item lifecycle (multi starting + multi bought)",
    render: () => <Surface question={RA7.PURCHASE_HISTORY_Q} scenarioSource={RA7.PURCHASE_HISTORY_SCENARIO} /> },
  { key: "family-lifecycle-history", label: "Family — one item with a history (started with, then sold)",
    render: () => <Surface question={RA7.SELL_SWAP_Q} scenarioSource={RA7.ITEM_HISTORY_SCENARIO} /> },
  { key: "family-lifecycle-fallback", label: "Family — static inventory, no transaction (falls back)",
    render: () => <Surface question={RA7.STATIC_INVENTORY_Q} scenarioSource={RA7.STATIC_INVENTORY_SCENARIO} /> },
  // --- RA6: canonical media on the ANSWER OPTIONS --------------------------
  { key: "surface-option-media-item", label: "Options — item icons (recipe, premise + options)",
    render: () => <Surface {...OM_ITEM} /> },
  { key: "surface-option-media-champion", label: "Options — champion icons",
    render: () => <Surface {...OM_CHAMPION} /> },
  { key: "surface-option-media-ability", label: "Options — ability icons (slot-neutral)",
    render: () => <Surface {...OM_ABILITY} /> },
  { key: "surface-option-media-rune", label: "Options — rune icons",
    render: () => <Surface {...OM_RUNE} /> },
  { key: "surface-option-media-spell", label: "Options — summoner-spell icons",
    render: () => <Surface {...OM_SPELL} /> },
  { key: "surface-option-media-none", label: "Options — numeric control (text-only)",
    render: () => <Surface {...OM_NUMERIC} /> },
  { key: "surface-option-media-selected", label: "Options — selected (geometry must not move)",
    render: () => <Surface {...OM_CHAMPION} selectedOptionId="2" /> },
  // Deliberately the SAME `competitive` variant as the two states above, so
  // the three are a like-for-like geometry comparison; `standard` would change
  // the column strategy for a reason that has nothing to do with reveal.
  { key: "surface-option-media-reveal", label: "Options — revealed (geometry must not move)",
    render: () => <Surface {...OM_CHAMPION} selectedOptionId="0"
      reveal={{ revealed: true, isCorrect: false, correctOptionId: "2" }} /> },

  { key: "surface-prereveal-spoiler", label: "Surface — pre-reveal spoiler-safe",
    render: () => <Surface question={CHAMP_Q} scenarioSource={SPOILER_SCENARIO} /> },
  { key: "surface-postreveal-rich", label: "Surface — post-reveal rich subject",
    render: () => <Surface variant="standard" question={CHAMP_Q} scenarioSource={SPOILER_SCENARIO}
      selectedOptionId="0" reveal={{ revealed: true, isCorrect: true, correctOptionId: "0",
        explanation: "Ahri is a champion from Ionia." }} /> },
  { key: "surface-selecting", label: "Surface — selecting",
    render: () => <Surface scenarioSource={ITEM_SCENARIO} selectedOptionId="1" /> },
  { key: "surface-missing-asset", label: "Surface — missing-asset fallback",
    render: () => <Surface scenarioSource={BROKEN_SCENARIO} /> },
  { key: "surface-reveal-correct", label: "Surface — correct reveal + explanation",
    render: () => <Surface variant="standard" scenarioSource={ITEM_SCENARIO} selectedOptionId="0"
      reveal={{ revealed: true, isCorrect: true, correctOptionId: "0",
        explanation: "Rabadon's Deathcap gives 130 AP flat plus a 35% amplifier." }} /> },
  { key: "surface-reveal-incorrect", label: "Surface — incorrect reveal",
    render: () => <Surface variant="standard" scenarioSource={ITEM_SCENARIO} selectedOptionId="2"
      reveal={{ revealed: true, isCorrect: false, correctOptionId: "0",
        explanation: "Blasting Wand gives only 45 AP." }} /> },
  { key: "surface-standard-hero", label: "Surface — standard (hero)",
    render: () => <Surface variant="standard" question={CHAMP_Q} scenarioSource={CHAMP_SCENARIO} /> },
  { key: "surface-tutorial", label: "Surface — tutorial variant",
    render: () => <Surface variant="tutorial" scenarioSource={ITEM_SCENARIO} /> },
  { key: "surface-speed", label: "Surface — speed (no media)",
    render: () => <Surface variant="speed" /> },
  { key: "ai1-mascots", label: "AI1 — role mascots",
    render: () => <MascotBench /> },
  { key: "rg-timeline", label: "RG — round timeline (steppable)",
    render: () => <RoundTimelineBench /> },
  { key: "rg2-nodes", label: "RG2 — timeline node states",
    render: () => <NodeCertificationBench /> },
];

const VIEWPORTS: { key: string; label: string; width: number | null }[] = [
  { key: "mobile", label: "Mobile 375", width: 375 },
  { key: "narrow", label: "Narrow 1024", width: 1024 },
  { key: "desktop", label: "Full", width: null },
];

// ------------------------------------------------------------------- page

export default function RankedArenaInspector() {
  const [stateKey, setStateKey] = useState(STATES[0].key);
  const [viewport, setViewport] = useState(VIEWPORTS[2]);

  if (!import.meta.env.DEV) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-sm text-muted-foreground">
        The Ranked arena inspector is a development-only tool.
      </div>
    );
  }

  const active = STATES.find((s) => s.key === stateKey) ?? STATES[0];

  return (
    // `relative z-10` on the chrome: the arena states carry the real
    // `ranked-academy` theme, whose backdrop is a fixed full-viewport layer —
    // the inspector's own controls must stack above it to stay usable.
    // RA11: the page container widened (max-w-5xl → 105rem) so the "Full"
    // viewport can genuinely reach the arena's 1500px+ stage tier — the old
    // cap silently clamped every wide-desktop QA pass to ~1024px.
    <div className="mx-auto max-w-[105rem] p-4 space-y-4" data-testid="ranked-arena-inspector">
      <header className="relative z-10 space-y-1">
        <h1 className="text-lg font-bold">Ranked Arena Inspector</h1>
        <p className="text-xs text-muted-foreground">
          Canonical arena components rendered from static fixtures. No engine, no backend — visual QA only.
        </p>
      </header>

      <div className="relative z-10 flex flex-wrap gap-2" role="group" aria-label="Viewport">
        {VIEWPORTS.map((v) => (
          <button key={v.key} type="button" data-testid={`inspector-viewport-${v.key}`}
            aria-pressed={viewport.key === v.key} onClick={() => setViewport(v)}
            className={`min-h-[36px] rounded-md border px-3 text-xs ${
              viewport.key === v.key ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav className="relative z-10 flex flex-col gap-1" aria-label="States">
          {STATES.map((s) => (
            <button key={s.key} type="button" data-testid={`inspector-state-${s.key}`}
              aria-pressed={stateKey === s.key} onClick={() => setStateKey(s.key)}
              className={`rounded-md border px-3 py-2 text-left text-xs ${
                stateKey === s.key ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="rounded-lg border border-border bg-background p-3 overflow-x-auto">
          <div className="mx-auto space-y-3"
            style={viewport.width ? { maxWidth: viewport.width } : undefined}
            data-testid="inspector-stage" data-viewport={viewport.key}>
            {active.render()}
          </div>
        </div>
      </div>
    </div>
  );
}
