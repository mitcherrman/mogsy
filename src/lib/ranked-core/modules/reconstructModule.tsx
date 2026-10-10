// ---------------------------------------------------------------------------
// `reconstruct.v1` renderer (GM1-R1).
//
// The player rebuilds a legendary item's DIRECT recipe: one target, 2–4
// sockets, a six-piece tray, explicit Lock In. Socket order carries no
// meaning; a piece may fill several sockets (every piece has the SAME reuse
// limit, the socket count, so the tray never hints which part is doubled).
//
// Authority: this component grades NOTHING and computes no gold. The tray, the
// echo of an accepted lock and the post-lock reveal (marks, settled sockets,
// canonical recipe, the level beneath it, every formatted figure) all come
// from the authoritative `segmentState`. The only local state is the
// unsubmitted draft board and an "I just locked" marker. The opponent's build
// is never read here.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Reconstruct } from "@/components/interaction-grammar/Reconstruct";
import type {
  ReconstructBreakdownPart, ReconstructEquation, ReconstructPublic, ReconstructReveal, SubjectMedia,
} from "@/lib/interaction-grammar/types";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { msUntilServerInstant, useServerInstantWake } from "@/lib/ranked-core/flow/useServerInstantWake";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import {
  RECONSTRUCT_MODULE_ID,
  type PublicRoundView,
  type ReconstructBlockView,
  type ReconstructChallengeReveal,
  type ReconstructMedia,
  type ReconstructPartView,
  type ReconstructRecipeTarget,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export { RECONSTRUCT_MODULE_ID };
export const RECONSTRUCT_MODULE_VERSION = 1;

/** The only challenge a `reconstruct` v1 segment has. */
const CHALLENGE_INDEX = 0;

/** Server art path -> the URL the page (and the preloader) requests. */
export function reconstructMedia(media: ReconstructMedia): SubjectMedia | null {
  return media ? { src: resolveQuizAssetUrl(media.src) ?? null, alt: media.alt } : null;
}

/** Public block -> the primitive's `ReconstructPublic`. A field mapping, nothing more. */
export function toReconstructPublic(block: ReconstructBlockView): ReconstructPublic {
  return {
    prompt: block.prompt,
    target: { label: block.target.label, media: reconstructMedia(block.target.media) },
    slotCount: block.slotCount,
    // The server's ONE uniform limit, applied to every piece alike.
    options: block.pieces.map((p) => ({
      token: p.pieceId, label: p.label, media: reconstructMedia(p.media), maxUses: block.maxUses,
    })),
  };
}

/**
 * One canonical part as a breakdown block (R2). The words are this module's;
 * every FIGURE is a server string frozen when the round was generated
 * (`value_display`, `combine_display`, `line_total_display`, each child's
 * `value_display`). A round generated before R2 carries none of the new
 * figures, and its block simply omits those lines — nothing is filled in.
 */
function breakdownPart(r: ReconstructChallengeReveal, part: ReconstructPartView): ReconstructBreakdownPart {
  const basic = part.partKind === "basic" || (part.partKind === null && part.subParts.length === 0);
  // The only arithmetic: COUNTING the server's own per-socket marks, to say
  // how many copies of a part the player had right.
  const matched = r.placement.filter((t, i) => t === part.pieceId && r.slotCorrect[i] === true).length;
  return {
    token: part.pieceId,
    quantity: part.quantity,
    valueDisplay: part.valueDisplay,
    lineTotalDisplay: part.lineTotalDisplay,
    caption: basic ? "Basic component" : "Built from",
    children: part.subParts.map((s) => ({
      label: s.label, media: reconstructMedia(s.media), quantity: s.quantity, valueDisplay: s.valueDisplay,
    })),
    joinDisplay: !basic && part.combineDisplay !== null ? `+ ${part.combineDisplay} to combine` : null,
    annotation: matched < part.quantity ? `${matched}/${part.quantity} placed` : null,
  };
}

/** The closing line: parts subtotal + combine = the item's price, every figure the server's. */
function breakdownEquation(t: ReconstructRecipeTarget | null): ReconstructEquation | null {
  if (!t || t.totalDisplay === null) return null;
  const terms = [{ label: "Parts", valueDisplay: t.baseDisplay }];
  if (t.combineDisplay !== null) terms.push({ label: "Combine", valueDisplay: t.combineDisplay });
  return { terms, result: { label: t.label, valueDisplay: t.totalDisplay } };
}

/** The server's reveal -> the primitive's. Every figure is the server's. */
export function toReconstructReveal(r: ReconstructChallengeReveal): ReconstructReveal {
  return {
    placement: r.placement,
    slotCorrect: r.slotCorrect,
    settled: r.settledPlacement,
    isCorrect: r.isCorrect,
    evidence: {
      parts: r.canonicalParts.map((p) => breakdownPart(r, p)),
      equation: breakdownEquation(r.target),
    },
  };
}

/** The latest of the instants at which the server lets this challenge be answered. */
function opensAt(state: SegmentStateView, roundStartedAt: string | null): string | null {
  const instants = [state.challengeStartedAt, roundStartedAt]
    .filter((x): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x)));
  return instants.length === 0
    ? null : instants.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

function ReconstructPhase({ state, actions, skewMs, roundStartedAt }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
  roundStartedAt: string | null;
}) {
  const block = state.block?.contract === "reconstruct" ? state.block : null;
  const content = useMemo(() => (block ? toReconstructPublic(block) : null), [block]);

  // Keyed on (segment, challenge), not on snapshot identity: the arena
  // re-renders with a fresh snapshot every second.
  const key = `${state.segmentNumber}:${CHALLENGE_INDEX}`;
  const [draft, setDraft] = useState<{ key: string; board: (string | null)[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending((p) => (p !== null && p !== key ? null : p)); }, [key]);

  const revealRow = state.ownChallengeReveals.find((r) => r.challengeIndex === CHALLENGE_INDEX);
  const served = revealRow?.reconstruct ?? null;
  const reveal = useMemo(() => (served ? toReconstructReveal(served) : null), [served]);

  // The server's echo of an accepted lock survives a refresh.
  const echoed = state.ownSubmittedChoices[CHALLENGE_INDEX];
  const lockedBoard = Array.isArray(echoed) ? [...echoed] : null;
  const serverLocked = lockedBoard !== null
    || state.ownNextChallengeIndex > CHALLENGE_INDEX || state.ownFinished;

  const wakeAt = opensAt(state, roundStartedAt);
  useServerInstantWake(wakeAt, skewMs);
  const notOpen = wakeAt !== null && msUntilServerInstant(wakeAt, skewMs, Date.now()) > 0;

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="reconstruct-loading">
        Loading the recipe…
      </p>
    );
  }

  const phase = reveal ? "revealed" : serverLocked || pending === key ? "locked" : "open";
  const own = draft?.key === key ? draft.board : [];
  const value = phase === "open" ? own : lockedBoard ?? own;

  const onLock = ({ placement }: { placement: readonly string[] }) => {
    if (notOpen || pending !== null || serverLocked) return;
    setPending(key);
    const result = actions.submitChallenge(CHALLENGE_INDEX, { placement });
    // A refused or failed lock stored nothing: reopen so the player can retry.
    if (result && typeof (result as Promise<boolean>).then === "function") {
      void (result as Promise<boolean>).then((accepted) => {
        if (!accepted) setPending((p) => (p === key ? null : p));
      });
    }
  };

  return (
    <div className="space-y-2" data-testid="reconstruct-phase" data-phase={phase}
      data-not-open={phase === "open" && notOpen ? "true" : undefined}
      {...(phase === "open" && notOpen ? { inert: "" } : {})}>
      <Reconstruct key={key} content={content} phase={phase} value={value}
        onChange={(board) => setDraft({ key, board })} onLock={onLock} reveal={reveal} />
      {/* Reserved in every phase at ONE line's height, so the lock never adds a line. */}
      <p className={`h-4 truncate text-center text-xs leading-4 text-muted-foreground ${phase === "open" ? "invisible" : ""}`}
        role="status" aria-hidden={phase === "open" ? true : undefined}
        data-testid="reconstruct-opponent-progress">
        {phase === "open" ? "" : state.opponentFinished
          ? "Both players have locked in."
          : "Waiting for the opponent to lock in…"}
      </p>
    </div>
  );
}

function ReconstructViewport({ segmentState, actions, skewMs, publicRound }: ModuleViewportProps) {
  return (
    <div className="relative isolate space-y-3" data-testid="reconstruct-viewport">
      {segmentState ? (
        <ReconstructPhase state={segmentState} actions={actions} skewMs={skewMs}
          roundStartedAt={publicRound?.activeRound?.startedAt ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="reconstruct-loading">
          Loading the segment…
        </p>
      )}
      {actions.error && (
        <p role="alert" data-testid="reconstruct-error" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const reconstructModule: ModuleRenderer = {
  moduleId: RECONSTRUCT_MODULE_ID,
  moduleVersion: RECONSTRUCT_MODULE_VERSION,
  // Only the contract this renderer reads; a future v2 fails closed to the
  // shell's unsupported state rather than into a mismatched input.
  servesVersion: (version) => version === RECONSTRUCT_MODULE_VERSION,
  // The module owns its input and its single Lock In.
  ownsSubmission: true,
  // Once the viewer's reveal is on the board, the board IS the result (marks,
  // settled sockets, the recipe and its figures); the arena's generic stamp
  // would only repeat it on its own clock (OF4-CONTINUITY).
  ownsResultReveal: (state) => !!state?.ownChallengeReveals.some(
    (r) => r.challengeIndex === CHALLENGE_INDEX && !!r.reconstruct),
  Viewport: ReconstructViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return state.ownNextChallengeIndex > CHALLENGE_INDEX ? "Recipe locked in" : "Rebuild the recipe";
  },
};
