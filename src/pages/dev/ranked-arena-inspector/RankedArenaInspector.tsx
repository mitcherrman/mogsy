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
import { MatchOverFrame } from "@/components/ranked-arena/MatchOverFrame";
import { QuestionPanel } from "@/components/ranked-arena/QuestionPanel";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { SubmissionReview } from "@/components/ranked-arena/SubmissionReview";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import type { QuizQuestion } from "@/lib/quiz/api";
import { adaptBackendSettlement } from "@/lib/ranked-core/backend/adaptBackendSettlement";
import {
  FIXTURE_P1_ID, FIXTURE_P2_ID, getScenario,
} from "@/lib/ranked-core/backend/backendSettlementFixtures";
import {
  AbilityView, CombatantView, InteractionPermissions, NO_INTERACTIONS,
  QuestionView, TimerView,
} from "@/lib/ranked-core/viewTypes";

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

const ABILITY_SCENARIO = transportSource(ABILITY_Q, {
  assets: { subject: { type: "ability", name: "Decimate", champion: "Darius" } },
  presentation: { scenario_type: "ability", role: "context", timing: "question", spoiler: false },
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
 * Full arena composition — mirrors QuizRankedMatch's shared layout (top strip +
 * You⚔Question⚔Opponent grid + ability-hotbar/submission HUD) from static
 * fixtures, so the no-scroll desktop composition and responsive stack can be QA'd
 * without a live match. Presentation only; no controller/engine import.
 */
function ArenaComposition({ selected = "0", locked = false }: { selected?: string | null; locked?: boolean }) {
  const perms = locked ? NO_INTERACTIONS : OPEN;
  return (
    <div className="ranked-shell space-y-3">
      <section className="ranked-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
        <div>
          <div className="ranked-eyebrow">Ranked Duel · vs Bot</div>
          <h3 className="ranked-title text-lg font-bold leading-tight">Round 7</h3>
        </div>
        <TimerDisplay timer={TIMER({ remainingSeconds: 18 })} label="Shared round timer" />
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)] lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <CombatantPanel combatant={player()} />
        </div>
        <div className="lg:col-start-3 lg:row-start-1">
          <CombatantPanel combatant={opponent()} />
        </div>
        <section data-testid="ranked-question"
          className="ranked-panel col-span-2 p-3 sm:p-4 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <InteractiveScenarioSurface question={ITEM_Q} selectedOptionId={selected} permissions={perms}
            onSelectOption={() => {}} variant="competitive" scenarioSource={ITEM_SCENARIO} />
        </section>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-stretch">
        <section className="ranked-panel p-3 sm:p-4">
          <AbilityTray abilities={ABILITIES([{ selected: true }])} selectedAbilityId="tank.fortify"
            permissions={perms} onSelectAbility={() => {}} />
        </section>
        <section className="ranked-panel p-3 sm:p-4">
          <SubmissionReview flow="direct"
            submission={{ selectedOptionId: selected, selectedAbilityId: "tank.fortify",
              phase: locked ? "locked" : "selecting" }}
            answerLabel={selected ? "Rabadon's Deathcap" : null} abilityName="Fortify"
            permissions={perms} onReview={() => {}} onEdit={() => {}} onConfirm={() => {}} />
        </section>
      </div>
    </div>
  );
}

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

  // --- full arena composition (layout QA) ---
  { key: "arena-full", label: "Arena — full composition",
    render: () => <ArenaComposition /> },
  { key: "arena-locked", label: "Arena — sealed / locked",
    render: () => <ArenaComposition locked /> },

  // --- shared InteractiveScenarioSurface ---
  { key: "surface-text-fallback", label: "Surface — compact band (no source)",
    render: () => <Surface /> },
  { key: "surface-lowcontent", label: "Surface — compact band (low-content source)",
    render: () => <Surface question={{ ...ITEM_Q, category: "combat" }} scenarioSource={LOW_CONTENT_SCENARIO} /> },
  { key: "surface-champion", label: "Surface — champion-rich",
    render: () => <Surface question={CHAMP_Q} scenarioSource={CHAMP_SCENARIO} /> },
  { key: "surface-item", label: "Surface — item-rich",
    render: () => <Surface scenarioSource={ITEM_SCENARIO} /> },
  { key: "surface-ability", label: "Surface — ability (icon-less → compact)",
    render: () => <Surface question={ABILITY_Q} scenarioSource={ABILITY_SCENARIO} /> },
  { key: "surface-recipe", label: "Surface — item-recipe (transport)",
    render: () => <Surface question={RECIPE_Q} scenarioSource={RECIPE_SCENARIO} /> },
  { key: "surface-comparison", label: "Surface — comparison (transport, falls back)",
    render: () => <Surface question={COMPARISON_Q} scenarioSource={COMPARISON_SCENARIO} /> },
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
    <div className="mx-auto max-w-5xl p-4 space-y-4" data-testid="ranked-arena-inspector">
      <header className="space-y-1">
        <h1 className="text-lg font-bold">Ranked Arena Inspector</h1>
        <p className="text-xs text-muted-foreground">
          Canonical arena components rendered from static fixtures. No engine, no backend — visual QA only.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Viewport">
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
        <nav className="flex flex-col gap-1" aria-label="States">
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
