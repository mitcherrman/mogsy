/**
 * PERFECT TIMING — the arena's parts: the lab renderer's Viewport and the two
 * flank panels the projected view mounts. Components only; the projection
 * that places them is `arenaView.tsx`.
 *
 * THE VIEWPORT shows the stage until a reveal exists and the reveal after it,
 * both under the same round plate, so the ability the player timed is still
 * on the sheet when its cooldown is disclosed.
 */
import { useContext, useEffect, useRef, useState } from "react";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import type { PtRunHud, PtStageModel, PtTier } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingReveal } from "./PerfectTimingReveal";
import { PerfectTimingRoundPlate, PerfectTimingStage } from "./PerfectTimingStage";
import { TIER_WORD, dataLabelText } from "./presentation";
import { PerfectTimingStageContext } from "./stageContext";
import "./perfectTiming.css";

/**
 * From `lg` the arena's question stage has a DEFINITE height (the viewport
 * lock), so its measured room is a real cap. Below `lg` the stage is sized by
 * its content, and capping the content to a box the content itself defines
 * is a loop that freezes the stage at its first paint. So the room is applied
 * only where the stage is definite.
 */
const DEFINITE_STAGE_QUERY = "(min-width: 1024px)";
function useDefiniteStage(): boolean {
  const read = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(DEFINITE_STAGE_QUERY)?.matches);
  const [definite, setDefinite] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia?.(DEFINITE_STAGE_QUERY);
    const sync = () => setDefinite(read());
    sync();
    mq?.addEventListener?.("change", sync);
    return () => mq?.removeEventListener?.("change", sync);
  }, []);
  return definite;
}

export function LabViewport() {
  const s = useContext(PerfectTimingStageContext);
  const ref = useRef<HTMLDivElement>(null);
  // The host measures the stage and hands the primitive a definite height, as a Ranked module does —
  // where the stage IS definite. Elsewhere (a phone, jsdom) the stage keeps its natural height.
  const room = useStageRoom(ref);
  const definite = useDefiniteStage();
  const stageHeight = definite && typeof room === "number" && Number.isFinite(room) ? room : undefined;
  // The phase the viewport drew last: a round armed straight after a reveal
  // (or a voided round) has just taken the player's focused control away.
  const prevPhase = useRef<PtStageModel["phase"] | null>(null);
  const cameFrom = prevPhase.current;
  useEffect(() => { prevPhase.current = s?.phase ?? null; });
  if (!s) return null;
  const focusSeal = s.phase === "armed" && (cameFrom === "revealed" || cameFrom === "interrupted" || cameFrom === "error");
  const revealed = s.phase === "revealed" && s.reveal !== null;
  const lastRound = s.round !== null && s.round.index >= s.round.total;
  return (
    <div ref={ref} data-testid="perfect-timing-lab-viewport" data-phase={s.phase} className="flex min-h-0 flex-col">
      {revealed && s.reveal ? (
        <div className="pt-stage" data-testid="pt-reveal-stage" style={stageHeight !== undefined ? { maxHeight: stageHeight } : undefined}>
          <PerfectTimingRoundPlate round={s.round} compact />
          <PerfectTimingReveal key={s.round?.roundId ?? "reveal"} reveal={s.reveal} onNext={s.onNext}
            nextLabel={lastRound ? "See results" : "Next round"} />
        </div>
      ) : (
        <PerfectTimingStage key={s.round?.roundId ?? "stage"} round={s.round} phase={s.phase} press={s.press}
          statusText={s.statusText ?? null} stageHeight={stageHeight} autoFocusSeal={focusSeal} />
      )}
    </div>
  );
}

const outcomeWord = (o: PtTier | "voided" | null): string => (o === null ? "" : o === "voided" ? "Voided" : TIER_WORD[o]);

/** The left flank: the run so far. */
export function RunFlank({ model }: { model: PtStageModel }) {
  const hud = model.hud ?? null;
  const total = model.round?.total ?? hud?.outcomes.length ?? 0;
  const current = model.round?.index ?? 0;
  return (
    <section className="ranked-panel pt-flank" data-testid="pt-flank-run" aria-label="Run">
      <p className="ranked-eyebrow">Perfect Timing</p>
      <h3 className="pt-flank-title">The run</h3>
      <p className="pt-flank-figure" data-testid="pt-flank-points">
        {hud?.pointsSoFar ?? "—"}<small>pts</small>
      </p>
      {total > 0 && (
        <ol className="pt-flank-list" aria-label="Rounds">
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const outcome = hud?.outcomes[i] ?? null;
            const state = n === current && model.phase !== "complete" ? "current" : outcome !== null ? "done" : "pending";
            return (
              <li key={n} data-state={state}>
                <span className="pt-pip" data-state={state === "current" ? "current" : state === "done" ? "done" : "upcoming"} aria-hidden />
                <span>Round {n}</span>
                <span data-tier={outcome ?? undefined}>{outcomeWord(outcome)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The right flank: where the truth comes from, and what is deliberately absent. */
export function ArchiveFlank({ hud }: { hud: PtRunHud | null }) {
  return (
    <section className="ranked-panel pt-flank" data-testid="pt-flank-archive" aria-label="Archive">
      <p className="ranked-eyebrow ranked-eyebrow--cyan">Archive</p>
      <h3 className="pt-flank-title">Base cooldown</h3>
      <p className="pt-flank-note"><b>0 ability haste.</b> Rank as dealt. The cooldown is the authority's own progression; the client never grades.</p>
      <hr className="pt-flank-rule" />
      <p className="pt-flank-note" data-testid="pt-flank-data">
        {hud ? dataLabelText(hud.patchLabel, hud.patchSource) : "Data: awaiting the deal"}
      </p>
      <p className="pt-flank-note"><b>Hidden clock.</b> Nothing on this screen shows time while you are timing.</p>
    </section>
  );
}
