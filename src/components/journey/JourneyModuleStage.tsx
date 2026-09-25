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
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { JourneyPublicState } from "@/lib/journey/contract";
import { ScenarioMediaBand } from "@/components/question-surface/ScenarioMediaBand";
import { MasteryAssetsProvider } from "@/features/mastery/live/MasteryAssetsProvider";
import { JourneyStateBoard } from "./JourneyStateBoard";
import { JourneyStateSheet } from "./JourneyStateSheet";
import { JourneyTransitionBeat } from "./JourneyTransitionBeat";
import { useJourneyBeat } from "./useJourneyBeat";

export function JourneyModuleStage({ state, skewMs = 0, holdPrevious = false, children }: {
  /** The viewer's current canonical public Journey state. */
  state: JourneyPublicState;
  skewMs?: number;
  /** The module is still revealing the previous child. */
  holdPrevious?: boolean;
  /** The current child's question (the caller keys it per child). */
  children: ReactNode;
}) {
  // The state last drawn while NOT holding — what the board keeps during a hold.
  const shown = useRef<JourneyPublicState>(state);
  if (!holdPrevious || shown.current.journeyKey !== state.journeyKey) shown.current = state;
  const board = shown.current;

  const beatActive = useJourneyBeat(board.transition, skewMs, holdPrevious);
  const [sheetOpen, setSheetOpen] = useState(false);

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
          <JourneyStateBoard state={board} beatActive={beatActive} onOpenDetail={() => setSheetOpen(true)}>
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
        <JourneyStateSheet state={board} open={sheetOpen} onOpenChange={setSheetOpen} />
      </div>
    </MasteryAssetsProvider>
  );
}
