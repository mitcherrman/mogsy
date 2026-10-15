// ---------------------------------------------------------------------------
// `assembly.v1` renderer (PA2B) — Pro Play Assembly: Roster Lock and Draft
// Memory.
//
// The player seats five historical players (Roster Lock) or champions (Draft
// Memory) in the five lane positions and Locks. It mounts PAV1's
// `PositionalAssembly` primitive, unchanged, inside the real CanonicalArena —
// exactly where Reconstruct mounts its own.
//
// Authority: this component grades NOTHING. The tray, the echo of an accepted
// lock and the post-lock reveal (true lineup, per-position marks, card facts,
// historical context) all come from the authoritative `segmentState`. The only
// local state is the unsubmitted draft board and an "I just locked" marker;
// the latter is what stops a slow server from receiving a second Lock. The
// opponent's board is never read here.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { PositionalAssembly } from "@/components/interaction-grammar/PositionalAssembly";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import type { PositionalAssemblyResponse } from "@/lib/interaction-grammar/types";
import { emptyBoard } from "@/lib/interaction-grammar/positionalAssembly";
import { msUntilServerInstant, useServerInstantWake } from "@/lib/ranked-core/flow/useServerInstantWake";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import {
  ASSEMBLY_MODULE_ID,
  type PublicRoundView,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import {
  boardFromPlacement, lockLabelFor, placementFromAssignment, toPositionalAssemblyPublic,
  toPositionalAssemblyReveal,
} from "./assemblyAdapter";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export { ASSEMBLY_MODULE_ID };
export const ASSEMBLY_MODULE_VERSION = 1;

/** The only challenge an `assembly` v1 segment has. */
const CHALLENGE_INDEX = 0;

/** The latest of the instants at which the server lets this challenge be answered. */
function opensAt(state: SegmentStateView, roundStartedAt: string | null): string | null {
  const instants = [state.challengeStartedAt, roundStartedAt]
    .filter((x): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x)));
  return instants.length === 0
    ? null : instants.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

function AssemblyPhase({ state, actions, skewMs, roundStartedAt, maxHeight }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
  roundStartedAt: string | null;
  /** The stage's inner height (`useStageRoom`), measured by the viewport. */
  maxHeight: number | undefined;
}) {
  const block = state.block?.contract === "assembly" ? state.block : null;
  const content = useMemo(() => (block ? toPositionalAssemblyPublic(block) : null), [block]);
  const dealt = useMemo(() => (block ? block.cards.map((c) => c.token) : []), [block]);

  // Keyed on (segment, challenge), not on snapshot identity: the arena
  // re-renders with a fresh snapshot every second.
  const key = `${state.segmentNumber}:${CHALLENGE_INDEX}`;
  const [draft, setDraft] = useState<{ key: string; board: Record<string, string | null> } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // Synchronous twin of `pending`: two Lock activations inside one render
  // (a double click, Enter + click) must still send ONE request.
  const inFlight = useRef<string | null>(null);
  useEffect(() => {
    setPending((p) => (p !== null && p !== key ? null : p));
    if (inFlight.current !== null && inFlight.current !== key) inFlight.current = null;
  }, [key]);

  const revealRow = state.ownChallengeReveals.find((r) => r.challengeIndex === CHALLENGE_INDEX);
  const served = revealRow?.assembly ?? null;
  const reveal = useMemo(
    () => (block && served ? toPositionalAssemblyReveal(block, served) : null), [block, served]);

  // The server's echo of an accepted lock survives a refresh.
  const echoed = state.ownSubmittedChoices[CHALLENGE_INDEX];
  const lockedBoard = useMemo(
    () => (Array.isArray(echoed) ? boardFromPlacement(echoed) : null), [echoed]);
  const serverLocked = lockedBoard !== null
    || state.ownNextChallengeIndex > CHALLENGE_INDEX || state.ownFinished;

  const wakeAt = opensAt(state, roundStartedAt);
  useServerInstantWake(wakeAt, skewMs);
  const notOpen = wakeAt !== null && msUntilServerInstant(wakeAt, skewMs, Date.now()) > 0;

  if (!content || !block) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="assembly-loading">
        Loading the board…
      </p>
    );
  }

  const phase = reveal ? "revealed" : serverLocked || pending === key ? "locked" : "open";
  const own = draft?.key === key ? draft.board : emptyBoard(content);
  const value = phase === "open" ? own : lockedBoard ?? own;

  const onLock = ({ assignment }: PositionalAssemblyResponse) => {
    if (notOpen || serverLocked || pending !== null || inFlight.current === key) return;
    const placement = placementFromAssignment(assignment, dealt);
    if (placement === null) return; // incomplete / duplicated / foreign: never sent
    inFlight.current = key;
    setPending(key);
    const release = () => {
      if (inFlight.current === key) inFlight.current = null;
      setPending((p) => (p === key ? null : p));
    };
    const result = actions.submitChallenge(CHALLENGE_INDEX, { placement });
    // A refused or failed lock stored nothing: reopen so the player can retry.
    if (result && typeof (result as Promise<boolean>).then === "function") {
      void (result as Promise<boolean>).then((accepted) => { if (!accepted) release(); },
        () => release());
    }
  };

  return (
    <div className="flex min-h-0 flex-col" data-testid="assembly-phase"
      data-phase={phase} data-family={block.family}
      data-not-open={phase === "open" && notOpen ? "true" : undefined}
      {...(phase === "open" && notOpen ? { inert: "" } : {})}>
      <PositionalAssembly key={key} content={content} phase={phase} value={value}
        maxHeight={maxHeight} lockLabel={lockLabelFor(block.family)}
        onChange={(board) => setDraft({ key, board })} onLock={onLock} reveal={reveal} />
      {/* Announced, not drawn: the primitive spends the whole stage (PAV1's
          measured geometry), and its own Lock box already shows the lock. */}
      <p className="sr-only" role="status" data-testid="assembly-opponent-progress">
        {phase === "open" ? "" : state.opponentFinished
          ? "Both players have locked in."
          : "Waiting for the opponent to lock in…"}
      </p>
    </div>
  );
}

function AssemblyViewport({ segmentState, actions, skewMs, publicRound }: ModuleViewportProps) {
  // Measured on the always-mounted root so the room is known before the
  // board's first frame (the hook measures once, on mount, then on resize).
  const ref = useRef<HTMLDivElement>(null);
  const maxHeight = useStageRoom(ref);
  return (
    <div ref={ref} className="relative isolate flex min-h-0 flex-col" data-testid="assembly-viewport">
      {segmentState ? (
        <AssemblyPhase state={segmentState} actions={actions} skewMs={skewMs} maxHeight={maxHeight}
          roundStartedAt={publicRound?.activeRound?.startedAt ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="assembly-loading">
          Loading the segment…
        </p>
      )}
      {actions.error && (
        <p role="alert" data-testid="assembly-error"
          className="absolute inset-x-0 bottom-0 z-10 bg-background/90 text-center text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const assemblyModule: ModuleRenderer = {
  moduleId: ASSEMBLY_MODULE_ID,
  moduleVersion: ASSEMBLY_MODULE_VERSION,
  // Only the contract this renderer reads; a future v2 fails closed to the
  // shell's unsupported state rather than into a mismatched input.
  servesVersion: (version) => version === ASSEMBLY_MODULE_VERSION,
  // The module owns its input and its single Lock.
  ownsSubmission: true,
  // Once the viewer's reveal is on the board, the board IS the result (marks,
  // the true card risen into each wrong position, the context plate).
  ownsResultReveal: (state) => !!state?.ownChallengeReveals.some(
    (r) => r.challengeIndex === CHALLENGE_INDEX && !!r.assembly),
  Viewport: AssemblyViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    const family = state.block?.contract === "assembly" ? state.block.family : null;
    if (state.ownNextChallengeIndex > CHALLENGE_INDEX) {
      return family === "draft_memory" ? "Draft locked in" : "Lineup locked in";
    }
    return family === "draft_memory" ? "Rebuild the draft" : "Rebuild the lineup";
  },
};
