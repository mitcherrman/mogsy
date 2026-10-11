// ---------------------------------------------------------------------------
// `scrub.v1` renderer (SCRUB-S2) — the Chronoscope.
//
// The player is given one objective lane state and a rail of fifteen wave
// checkpoints; they scrub the lane through time and lock the FIRST checkpoint
// where the state holds. Explicit Lock; one checkpoint is the whole answer.
//
// Authority: this component grades NOTHING and computes no lane fact. The
// rail (every checkpoint's public state), the echo of an accepted lock and
// the post-lock reveal (verdict, canonical checkpoint, traverse path, the
// before → after proof) all come from the authoritative `segmentState`. The
// only local state is the unsubmitted draft checkpoint and an "I just
// locked" marker. The opponent's checkpoint is never read here.
//
// The primitive (`Chronoscope`, SCRUB-S1, unchanged) is content-neutral: it
// receives the public content before the lock and the reveal only after it.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Chronoscope } from "@/components/interaction-grammar/Chronoscope";
import { WaveXpLens } from "@/components/scrub/WaveXpLens";
import { msUntilServerInstant, useServerInstantWake } from "@/lib/ranked-core/flow/useServerInstantWake";
import { REVEAL_HOLD_MS } from "@/lib/ranked-core/pacing";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import {
  SCRUB_MODULE_ID,
  type PublicRoundView,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { toChronoscopePublic, toChronoscopeReveal, type WaveXpScene } from "@/lib/scrub/waveXpChronoscope";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export { SCRUB_MODULE_ID };
export const SCRUB_MODULE_VERSION = 1;

/** The only challenge a `scrub` v1 segment has. */
const CHALLENGE_INDEX = 0;

/**
 * The reveal's whole choreography (clamp → traverse → settle → proof) must
 * fit inside the arena's reveal hold, which holds this segment on screen for
 * `REVEAL_HOLD_MS` after the settlement is discovered (the server freezes a
 * 3000 ms reveal window before the next segment, so the nominal hold is the
 * one in force). A shorter hold only compresses the same shape.
 */
export const SCRUB_REVEAL_BUDGET_MS = REVEAL_HOLD_MS;

/** The latest of the instants at which the server lets this challenge be answered. */
function opensAt(state: SegmentStateView, roundStartedAt: string | null): string | null {
  const instants = [state.challengeStartedAt, roundStartedAt]
    .filter((x): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x)));
  return instants.length === 0
    ? null : instants.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

function ScrubPhase({ state, actions, skewMs, roundStartedAt }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
  roundStartedAt: string | null;
}) {
  const block = state.block?.contract === "scrub" ? state.block : null;
  const content = useMemo(() => (block ? toChronoscopePublic(block) : null), [block]);

  // Keyed on (segment, challenge), not on snapshot identity: the arena
  // re-renders with a fresh snapshot every second.
  const key = `${state.segmentNumber}:${CHALLENGE_INDEX}`;
  const [draft, setDraft] = useState<{ key: string; token: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending((p) => (p !== null && p !== key ? null : p)); }, [key]);

  // The reveal exists ONLY once the server has recorded this viewer's lock.
  const revealRow = state.ownChallengeReveals.find((r) => r.challengeIndex === CHALLENGE_INDEX);
  const served = revealRow?.scrub ?? null;
  const reveal = useMemo(
    () => (served && block ? toChronoscopeReveal(block, served) : null), [served, block]);

  // The server's echo of an accepted lock survives a refresh.
  const echoed = state.ownSubmittedChoices[CHALLENGE_INDEX];
  const lockedToken = typeof echoed === "string" ? echoed : null;
  const serverLocked = lockedToken !== null
    || state.ownNextChallengeIndex > CHALLENGE_INDEX || state.ownFinished;

  const wakeAt = opensAt(state, roundStartedAt);
  useServerInstantWake(wakeAt, skewMs);
  const notOpen = wakeAt !== null && msUntilServerInstant(wakeAt, skewMs, Date.now()) > 0;

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="scrub-loading">
        Loading the chronoscope…
      </p>
    );
  }

  const phase = reveal ? "revealed" : serverLocked || pending === key ? "locked" : "open";
  const own = draft?.key === key ? draft.token : null;
  const value = phase === "open" ? own : lockedToken ?? own;

  const onLock = ({ checkpoint }: { checkpoint: string }) => {
    if (notOpen || pending !== null || serverLocked) return;
    setPending(key);
    const result = actions.submitChallenge(CHALLENGE_INDEX, { checkpoint });
    // A refused or failed lock stored nothing: reopen so the player can retry.
    if (result && typeof (result as Promise<boolean>).then === "function") {
      void (result as Promise<boolean>).then((accepted) => {
        if (!accepted) setPending((p) => (p === key ? null : p));
      });
    }
  };

  return (
    <div data-testid="scrub-phase" data-phase={phase}
      data-not-open={phase === "open" && notOpen ? "true" : undefined}
      {...(phase === "open" && notOpen ? { inert: "" } : {})}>
      <Chronoscope<WaveXpScene> key={key} content={content} phase={phase} value={value}
        onChange={(token) => setDraft({ key, token })} onLock={onLock} reveal={reveal}
        renderScene={(frame) => <WaveXpLens frame={frame} />}
        revealBudgetMs={SCRUB_REVEAL_BUDGET_MS} />
      {/* Announced, never drawn: the instrument's geometry is fixed per tier
          and the arena's flanks already show the opponent. */}
      <p className="sr-only" role="status" data-testid="scrub-opponent-progress">
        {phase === "open" ? "" : state.opponentFinished
          ? "Both players have locked in."
          : "Waiting for the opponent to lock in…"}
      </p>
    </div>
  );
}

function ScrubViewport({ segmentState, actions, skewMs, publicRound }: ModuleViewportProps) {
  return (
    <div className="relative isolate" data-testid="scrub-viewport">
      {segmentState ? (
        <ScrubPhase state={segmentState} actions={actions} skewMs={skewMs}
          roundStartedAt={publicRound?.activeRound?.startedAt ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="scrub-loading">
          Loading the segment…
        </p>
      )}
      {/* Overlaid, not in flow: a refused lock must not move the instrument. */}
      {actions.error && (
        <p role="alert" data-testid="scrub-error"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 truncate text-center text-xs text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const scrubModule: ModuleRenderer = {
  moduleId: SCRUB_MODULE_ID,
  moduleVersion: SCRUB_MODULE_VERSION,
  // Only the contract this renderer reads; a future v2 fails closed to the
  // shell's unsupported state rather than into a mismatched input.
  servesVersion: (version) => version === SCRUB_MODULE_VERSION,
  // The module owns its input and its single Lock.
  ownsSubmission: true,
  // Once the viewer's reveal is on the instrument, the instrument IS the
  // result (both markers, the traverse, the proof, the verdict); the arena's
  // generic stamp would only repeat it on its own clock (OF4-CONTINUITY).
  ownsResultReveal: (state) => !!state?.ownChallengeReveals.some(
    (r) => r.challengeIndex === CHALLENGE_INDEX && !!r.scrub),
  Viewport: ScrubViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return state.ownNextChallengeIndex > CHALLENGE_INDEX ? "Checkpoint locked in" : "Find the checkpoint";
  },
};
