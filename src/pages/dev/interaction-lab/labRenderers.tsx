/**
 * MIG1.1 — the Interaction Lab's two LAB-ONLY module renderers.
 *
 * They satisfy the production `ModuleRenderer` contract so `CanonicalArena`
 * mounts them exactly where it mounts `quiz`, Meta Reflex and Mastery — and
 * they are NEVER registered: `ranked-core/modules/registry.ts` does not import
 * this file, so `rendererForSegment` cannot resolve them and no real segment
 * can reach them (a test pins both facts).
 *
 * One renderer per MECHANIC, not per fixture: switching the Lab's domain from
 * Pro Play to Leaguecraft swaps the content under the same renderer and the
 * same primitive.
 *
 * What rides where
 *   * selection / onSelect / permissions / actions.submitChallenge — the
 *     arena's own props, exactly as a production viewport uses them.
 *   * reveal — the arena's `SurfaceReveal`. Data Duel reads its comparison
 *     evidence (the two deciding values + the server's winner), which is the
 *     slot RG3 designed for it. `SurfaceReveal` has no numeric-answer slot, so
 *     Stat Drop takes its reveal from the stage below, and only while the
 *     arena says `revealed`.
 *   * content — the lab stage context. It stands in for the `publicRound`
 *     projection a real module would parse; the Lab has no transport to parse.
 */
import { createContext, useContext } from "react";
import { DataDuel } from "@/components/interaction-grammar/DataDuel";
import { StatDrop } from "@/components/interaction-grammar/StatDrop";
import type { ModuleRenderer, ModuleViewportProps } from "@/lib/ranked-core/modules/types";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type {
  DataDuelReveal, InteractionPhase, StatDropReveal,
} from "@/lib/interaction-grammar/types";
import type { DuelFixture, DropFixture, LabFixture, LabMechanic } from "./labFixtures";

/** What the lab controller lends the viewport: public content + its phase. */
export interface LabStage {
  fixture: LabFixture;
  phase: InteractionPhase;
  /** Stat Drop's reveal. Null until the controller reveals. */
  dropReveal: StatDropReveal | null;
}

const LabStageContext = createContext<LabStage | null>(null);
export const LabStageProvider = LabStageContext.Provider;

/** Map the arena's `SurfaceReveal` onto the Data Duel reveal props. */
export function duelRevealFromSurface(fixture: DuelFixture, reveal: SurfaceReveal | null | undefined): DataDuelReveal | null {
  if (!reveal?.revealed || !reveal.correctOptionId) return null;
  const ev = reveal.evidence;
  const values: Record<string, string> = {};
  if (ev?.kind === "comparison") {
    if (ev.left.valueDisplay) values[fixture.content.left.token] = ev.left.valueDisplay;
    if (ev.right.valueDisplay) values[fixture.content.right.token] = ev.right.valueDisplay;
  }
  return {
    canonicalToken: reveal.correctOptionId,
    values,
    // `SurfaceReveal`'s comparison evidence carries DISPLAY strings only, so
    // the numbers the margin bar draws from ride the fixture's reveal. This is
    // the second reveal-contract gap MIG1.2 records (structured side values).
    numericValues: fixture.hidden.numericValues ?? null,
    evidence: reveal.explanation ?? null,
    source: fixture.hidden.source ?? null,
  };
}

function DataDuelViewport({ selection, permissions, onSelect, actions, reveal }: ModuleViewportProps) {
  const stage = useContext(LabStageContext);
  if (!stage || stage.fixture.mechanic !== "data-duel") return null;
  const fixture = stage.fixture;
  return (
    // THE STAMP GUTTER. The arena's verdict stamp sits at the stage's top
    // (0.75rem, ~2.3rem tall). Whenever the duel is tall enough to reach the
    // stage top — every phone, and any desktop once the tie row, margin and
    // evidence are all present — it landed on the metric chips. A CONSTANT top
    // reserve here, not a reveal-only one (which would jump the layout at the
    // verdict), clears it at every size without touching the arena. It steps
    // up at `lg` because the stamp's type scales with the viewport (2.4vw).
    <div data-testid="lab-duel-stamp-gutter" className="pt-10 sm:pt-8 lg:pt-11">
      <DataDuel content={fixture.content} phase={stage.phase}
        value={typeof selection === "string" ? selection : null}
        onChange={(token) => { if (permissions.canSelectAnswer) onSelect(token); }}
        onLock={(choice) => { if (permissions.canConfirmSubmission) void actions.submitChallenge(0, choice); }}
        reveal={duelRevealFromSurface(fixture, reveal)} />
    </div>
  );
}

function StatDropViewport({ selection, permissions, onSelect, actions, reveal }: ModuleViewportProps) {
  const stage = useContext(LabStageContext);
  if (!stage || stage.fixture.mechanic !== "stat-drop") return null;
  const fixture: DropFixture = stage.fixture;
  return (
    <StatDrop content={fixture.content} phase={stage.phase}
      value={typeof selection === "number" ? selection : null}
      onChange={(v) => { if (permissions.canSelectAnswer) onSelect(v); }}
      onLock={(choice) => { if (permissions.canConfirmSubmission) void actions.submitChallenge(0, choice); }}
      reveal={reveal?.revealed ? stage.dropReveal : null} />
  );
}

export const LAB_DATA_DUEL_RENDERER: ModuleRenderer = {
  moduleId: "mig_lab.data_duel",
  moduleVersion: 1,
  ownsSubmission: true,
  Viewport: DataDuelViewport,
  projectQuestion: () => null,
  summaryLabel: (_pub, selection) => (typeof selection === "string" ? selection : null),
};

export const LAB_STAT_DROP_RENDERER: ModuleRenderer = {
  moduleId: "mig_lab.stat_drop",
  moduleVersion: 1,
  ownsSubmission: true,
  Viewport: StatDropViewport,
  projectQuestion: () => null,
  summaryLabel: (_pub, selection) => (typeof selection === "number" ? String(selection) : null),
};

/** The renderer for a mechanic. Takes no domain, by design. */
export function labRendererFor(mechanic: LabMechanic): ModuleRenderer {
  return mechanic === "data-duel" ? LAB_DATA_DUEL_RENDERER : LAB_STAT_DROP_RENDERER;
}
