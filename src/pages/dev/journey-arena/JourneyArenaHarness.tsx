/**
 * JOURNEY-UI1 — dev-only full-arena harness for the Journey state board.
 *
 * The REAL `CanonicalArena` — banner flanks on a desktop, the phone match bar
 * below `lg`, the fixed stage height, the question card — fed a fixture view,
 * with a fixture module whose viewport is the real `JourneyModuleStage` above
 * the real `InteractiveScenarioSurface` (its own band switched off with
 * `mediaScale: "none"`, so there is exactly one media band: the board).
 *
 * THE SERVER IS SIMULATED EXPLICITLY. Stepping to a child plays the part of a
 * poll that has just moved the viewer: the fixture's transition gets its
 * canonical `beat.until` stamped from the step instant (`withBeat`), and the
 * board, the beat gate and the rails react to that exactly as they will to
 * the backend's own instant. No engine, no controller, no fetch.
 *
 *   /dev/journey-arena?arc=a&step=2      (arc: a | c | f; step: 0-based)
 */
import { createContext, useContext, useMemo, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { JourneyModuleStage } from "@/components/journey/JourneyModuleStage";
import { readJourneyPublicState, type JourneyPublicState } from "@/lib/journey/contract";
import { journeyRailIdentity } from "@/lib/journey/rail";
import { withBeat } from "@/lib/journey/fixtures";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type CombatantView, type QuestionView } from "@/lib/ranked-core/viewTypes";
import { JOURNEY_HARNESS_ARCS, type HarnessArc } from "./journeyHarnessFixtures";

const combatant = (over: Partial<CombatantView>): CombatantView => ({
  playerId: "you", name: "You", tag: "Jungle", side: "player", classId: "tank",
  roleId: "jungle", identityMode: "role", score: 14,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});

function rail(state: JourneyPublicState, which: "player" | "opponent"): ArenaRail {
  return {
    kind: "combatant",
    combatant: which === "player" ? combatant({})
      : combatant({ playerId: "opp", name: "Bot", side: "opponent", roleId: "top", tag: "Top", score: 11 }),
    presentation: "banner",
    damage: [],
    outcome: null, damageDealt: null, feedback: null, reaction: null, award: null,
    journey: journeyRailIdentity(state, which === "player" ? "subject" : "opponent"),
  };
}

interface StageInput { state: JourneyPublicState; question: QuestionView; step: number }
const StageContext = createContext<StageInput | null>(null);

/** The fixture module: the real Journey stage over the real question surface. */
function JourneyFixtureViewport() {
  const input = useContext(StageContext);
  const [selected, setSelected] = useState<string | null>(null);
  if (!input) return null;
  return (
    <JourneyModuleStage state={input.state}>
      <InteractiveScenarioSurface key={input.step} question={input.question}
        selectedOptionId={selected} permissions={{ ...NO_INTERACTIONS, canSelectAnswer: true, canChangeAnswer: true }}
        onSelectOption={(option) => setSelected(option.id)} variant="competitive"
        settings={{ mediaScale: "none" }} scenarioSource={null} />
    </JourneyModuleStage>
  );
}

const JOURNEY_FIXTURE_MODULE: ModuleRenderer = {
  moduleId: "journey_fixture",
  moduleVersion: 1,
  ownsSubmission: true,
  Viewport: JourneyFixtureViewport,
  projectQuestion: () => null,
  summaryLabel: () => null,
};

function arenaView(state: JourneyPublicState): ArenaViewModel {
  return {
    header: {
      eyebrow: "", title: `Module 10 / 10`, transitionNote: null,
      playtestNote: null, presenceNote: null,
      timer: { durationSeconds: 150, remainingSeconds: 118, paused: false, urgent: false },
      timerLabel: "Journey timer",
      centralResult: null, moduleTitle: null, moduleEventId: null,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left: rail(state, "player"), right: rail(state, "opponent"),
    surface: {
      renderer: JOURNEY_FIXTURE_MODULE,
      publicRound: null as never, segmentState: null, selection: null,
      permissions: NO_INTERACTIONS, actions: { submitChallenge: () => {}, busy: false, error: null },
      skewMs: 0, reveal: null, onSelect: () => {}, ownsSubmission: true,
      inputOpen: true, hasContent: true,
    },
    abilityHud: null, status: null, hudAction: null,
    // The module rail: one node, module 10, current.
    timeline: {
      visibleNodes: 1, anchorIndex: 0, windowStart: 9, currentIndex: 0, currentRoundNumber: 10,
      anchored: true,
      nodes: [{ roundNumber: 10, index: 0, visible: true, state: "current",
        segmentKind: null, outcome: null, tag: null, topic: null }],
    },
    revealHold: false, progressionEnabled: false,
  } as ArenaViewModel;
}

function readParams(): { arc: HarnessArc; step: number } {
  const p = new URLSearchParams(window.location.search);
  const arcKey = (p.get("arc") ?? "a") as keyof typeof JOURNEY_HARNESS_ARCS;
  const arc = JOURNEY_HARNESS_ARCS[arcKey] ?? JOURNEY_HARNESS_ARCS.a;
  const step = Math.min(Math.max(0, Number(p.get("step") ?? "0") || 0), arc.steps.length - 1);
  return { arc, step };
}

export default function JourneyArenaHarness() {
  const initial = useMemo(readParams, []);
  const [arc, setArc] = useState<HarnessArc>(initial.arc);
  const [step, setStep] = useState(initial.step);
  // The simulated poll instant: when the viewer "arrived" on this child.
  const [arrivedAt, setArrivedAt] = useState(() => Date.now() - 60_000);

  const go = (next: number) => {
    setStep(next);
    setArrivedAt(Date.now());
  };
  const s = arc.steps[step];
  const state = useMemo(() => readJourneyPublicState(withBeat(s.wire, arrivedAt)), [s, arrivedAt]);
  const input = useMemo(() => ({ state, question: s.question, step }), [state, s, step]);

  return (
    <div data-testid="journey-arena-harness" className="relative">
      <nav aria-label="Journey fixture controls"
        className="fixed bottom-2 left-1/2 z-[60] flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-md border border-white/15 bg-black/80 px-2 py-1 text-[11px] text-white">
        {Object.entries(JOURNEY_HARNESS_ARCS).map(([key, a]) => (
          <button key={key} type="button" data-testid={`harness-arc-${key}`}
            className={`rounded px-1.5 ${a === arc ? "bg-white/20" : ""}`}
            onClick={() => { setArc(a); setStep(0); setArrivedAt(Date.now() - 60_000); }}>
            {a.label}
          </button>
        ))}
        <span className="px-1 text-white/40">|</span>
        <button type="button" data-testid="harness-prev" disabled={step === 0} onClick={() => go(step - 1)}
          className="rounded px-1.5 disabled:opacity-30">◀</button>
        <span data-testid="harness-step">{step + 1}/{arc.steps.length}</span>
        <button type="button" data-testid="harness-next" disabled={step === arc.steps.length - 1}
          onClick={() => go(step + 1)} className="rounded px-1.5 disabled:opacity-30">▶</button>
        <button type="button" data-testid="harness-replay" onClick={() => go(step)} className="rounded px-1.5">
          Replay beat
        </button>
      </nav>
      <StageContext.Provider value={input}>
        <CanonicalArena view={arenaView(state)}
          chrome={<p className="text-sm font-semibold">Daily Challenge · Standard · Module 10 (fixture)</p>} />
      </StageContext.Provider>
    </div>
  );
}
