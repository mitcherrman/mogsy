/**
 * JOURNEY-UI1 — THE JOURNEY AT MODULE LEVEL: one board for the whole slice,
 * the child questions beneath it.
 *
 *   ┌ ScenarioMediaBand ─────────────────────────────┐   mounted ONCE per
 *   │  JourneyStateBoard  (+ the beat, while it runs) │   journey (keyed on
 *   └─────────────────────────────────────────────────┘   `journeyKey`)
 *   ┌ the current child's question ───────────────────┐   the caller keys this
 *   │  (inert and veiled while the beat runs)          │   per child, as today
 *   └─────────────────────────────────────────────────┘
 *
 * WHY MODULE LEVEL. The mastery slice remounts its challenge surface for every
 * child (`key={challengeIndex}`), and today each child draws its own scenario
 * band from its own prose. A Journey's state outlives its children, so the
 * board sits ABOVE the keyed question: it persists, and a transition animates
 * from one node to the next instead of a new card popping in. It is fed only
 * the server's canonical public state (`segment_state.journey`) — never
 * assembled from question prose.
 *
 * THE BEAT (JOURNEY-MOTION-V1). No overlay: the board stays fully visible, the
 * objects that changed animate in place, and one compact stamp sits in the
 * board's header. The status region keeps every event line for screen readers.
 *
 * THE BEAT GATE. While the server's beat runs (`useJourneyBeat`, server time
 * against `beat.until`), the next question is `inert`, `aria-hidden` and
 * veiled. It stays MOUNTED in its own box, so nothing lays out differently
 * when the beat ends. No clock is paused: the server does not open the child's
 * answer window before `until`, and this only declines to present it early.
 *
 * THE REVEAL HOLD. While the module is still showing the previous child's
 * reveal (`holdPrevious`), the board keeps showing the state that child was
 * asked against, and the beat waits — the transition follows the reveal.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { JourneyPublicState } from "@/lib/journey/contract";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { NO_KNOWLEDGE, type JourneyKnowledge } from "@/lib/journey/knowledge";
import { journeyChain } from "@/lib/journey/chain";
import type { JourneyChildContext } from "@/lib/journey/adapter";
import { ScenarioMediaBand } from "@/components/question-surface/ScenarioMediaBand";
import { MasteryAssetsProvider } from "@/features/mastery/live/MasteryAssetsProvider";
import { JourneyStateBoard } from "./JourneyStateBoard";
import { JourneyStateSheet } from "./JourneyStateSheet";
import { JourneyBeatStamp, JourneyTransitionBeat } from "./JourneyTransitionBeat";
import { useJourneyBeat } from "./useJourneyBeat";
import { JourneyWorkbenchSheet } from "./workbench/JourneyWorkbenchSheet";

export function JourneyModuleStage({
  state, skewMs = 0, holdPrevious = false, questionRoles = null, knowledge = NO_KNOWLEDGE,
  reached = null, answeredThrough = 0, children,
}: {
  /**
   * JP3 — the reached children (their served asks name the micro-chain's
   * nodes). Null draws no chain.
   */
  reached?: readonly Pick<JourneyChildContext, "index" | "asks">[] | null;
  /**
   * JP3 — the server's next challenge index for this viewer (`own_next_challenge_index`):
   * every step before it is answered and revealed, so it reads as done.
   */
  answeredThrough?: number;
  /** The viewer's current canonical public Journey state. */
  state: JourneyPublicState;
  skewMs?: number;
  /** The module is still revealing the previous child. */
  holdPrevious?: boolean;
  /**
   * JOURNEY-PRES-V1 — the RQ1 roles of the question on screen (its own
   * `challenge.roles`), drawn in the board's step header. Null/empty → none.
   */
  questionRoles?: readonly RankedRole[] | null;
  /**
   * K2 — established facts to mark on the board. Computed from the LIVE
   * segment state (not the held board), so a child's own fact is marked
   * during its reveal hold.
   */
  knowledge?: JourneyKnowledge;
  /** The current child's question (the caller keys it per child). */
  children: ReactNode;
}) {
  // The state last drawn while NOT holding — what the board keeps during a hold.
  const shown = useRef<JourneyPublicState>(state);
  if (!holdPrevious || shown.current.journeyKey !== state.journeyKey) shown.current = state;
  const board = shown.current;

  const beatActive = useJourneyBeat(board.transition, skewMs, holdPrevious);
  // JP3 — the chain follows the BOARD ON SCREEN (the held child during its
  // reveal), which is done once its reveal shows.
  const chain = useMemo(() => (reached
    ? journeyChain(reached, board.step.count, board.step.index, holdPrevious || board.step.index < answeredThrough)
    : null), [reached, board.step.count, board.step.index, holdPrevious, answeredThrough]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formulasOpen, setFormulasOpen] = useState(false);

  // `inert` is set on the element: React 18 has no typed prop for it.
  const questionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = questionRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = beatActive;
  }, [beatActive]);

  return (
    <MasteryAssetsProvider>
      <div data-testid="journey-stage" data-journey-key={board.journeyKey}
        data-beat={beatActive ? "active" : "idle"} className="journey-stage flex flex-col gap-2">
        <ScenarioMediaBand key={board.journeyKey} aspect="band" compact data-band-kind="journey"
          className="journey-band">
          <JourneyStateBoard state={board} beatActive={beatActive} onOpenDetail={() => setSheetOpen(true)}
            questionRoles={beatActive ? null : questionRoles} knowledge={knowledge} chain={chain}
            beatStamp={beatActive ? <JourneyBeatStamp key={board.step.index} state={board} /> : null}
            onOpenFormulas={() => setFormulasOpen(true)}>
            {beatActive && <JourneyTransitionBeat key={board.step.index} state={board} />}
          </JourneyStateBoard>
        </ScenarioMediaBand>
        <div ref={questionRef} data-testid="journey-question"
          data-veiled={beatActive ? "true" : undefined}
          aria-hidden={beatActive ? true : undefined}
          className="journey-question relative">
          <div className={beatActive ? "journey-question__content--veiled" : undefined}>{children}</div>
          {beatActive && (
            <div data-testid="journey-question-veil" aria-hidden
              className="journey-question__veil pointer-events-none absolute inset-0 flex items-start justify-center pt-6">
              <span className="rounded-md border border-[#d4b35a]/40 bg-black/70 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#f3dca0]">
                Board updating…
              </span>
            </div>
          )}
        </div>
        <JourneyStateSheet state={board} open={sheetOpen} onOpenChange={setSheetOpen} knowledge={knowledge} />
        <JourneyWorkbenchSheet open={formulasOpen} onOpenChange={setFormulasOpen} />
      </div>
    </MasteryAssetsProvider>
  );
}

/**
 * JP2 — THE STAGE BEFORE ITS FIRST CHILD (the lead-in). No child is reached,
 * so there is no state to draw — but the stage's two regions are already
 * there, the board's as an empty box of the board's own size, so the first
 * child opens INTO the stage instead of the stage appearing around it.
 */
export function JourneyStageLeadIn({ children }: { children: ReactNode }) {
  return (
    <div data-testid="journey-stage" data-beat="idle" className="journey-stage flex flex-col gap-2">
      <div aria-hidden data-testid="journey-band-placeholder" className="journey-band journey-band--empty" />
      <div data-testid="journey-question" className="journey-question relative">{children}</div>
    </div>
  );
}
