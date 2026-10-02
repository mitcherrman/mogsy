// ---------------------------------------------------------------------------
// `order_forge.v1` renderer.
//
// Authority: this component grades NOTHING and knows no canonical order. The
// cards, their shuffled display order, whether the viewer has locked, and the
// post-lock reveal all come from the authoritative `segmentState`; the only
// local state is the unsubmitted draft order and an "I just locked" marker.
//
// One challenge, one Lock In. Submitting sends `{order: [ids]}` through the
// ordinary segment challenge submission. The viewer's own reveal (their order
// beside the canonical one) arrives in `ownChallengeReveals` only after their
// lock is accepted, and is drawn in the viewport by this module. The opponent's
// order is never on screen before the segment settles: nothing here reads it.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { OrderForge } from "@/components/interaction-grammar/OrderForge";
import type {
  OrderForgePublic, OrderForgeReveal,
} from "@/lib/interaction-grammar/types";
import { ORDER_FORGE_BACKDROP_URL } from "@/lib/ranked-core/media/orderForgeArt";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { msUntilServerInstant, useServerInstantWake } from "@/lib/ranked-core/flow/useServerInstantWake";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import {
  ORDER_FORGE_MODULE_ID,
  type OrderForgeBlockView,
  type PublicRoundView,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export { ORDER_FORGE_MODULE_ID };
export const ORDER_FORGE_MODULE_VERSION = 1;

/** The only challenge an `order_forge` v1 segment has. */
const CHALLENGE_INDEX = 0;

/** Public block -> the primitive's `*Public` shape. A field mapping, nothing more. */
export function toOrderForgePublic(block: OrderForgeBlockView): OrderForgePublic {
  return {
    prompt: block.prompt,
    metricLabel: block.metricLabel,
    directionLabels: block.directionLabels,
    entries: block.entries.map((e) => ({
      token: e.entryId,
      label: e.label,
      media: e.media
        ? { src: resolveQuizAssetUrl(e.media.src) ?? null, alt: e.media.alt }
        : null,
    })),
  };
}

/** The latest of the instants at which the server lets this challenge be answered. */
function opensAt(state: SegmentStateView, roundStartedAt: string | null): string | null {
  const instants = [state.challengeStartedAt, roundStartedAt]
    .filter((x): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x)));
  return instants.length === 0
    ? null : instants.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

function OrderForgePhase({ state, actions, skewMs, roundStartedAt }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
  roundStartedAt: string | null;
}) {
  const block = state.block?.contract === "order_forge" ? state.block : null;
  const content = useMemo(() => (block ? toOrderForgePublic(block) : null), [block]);

  // The draft is keyed on (segment, challenge), NOT on snapshot identity: the
  // arena re-renders every second with a fresh snapshot object, and a draft
  // keyed on that would snap back to the shuffle mid-drag.
  const key = `${state.segmentNumber}:${CHALLENGE_INDEX}`;
  const [draft, setDraft] = useState<{ key: string; order: string[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending((p) => (p !== null && p !== key ? null : p)); }, [key]);

  const revealRow = state.ownChallengeReveals.find((r) => r.challengeIndex === CHALLENGE_INDEX);
  const forge = revealRow?.orderForge ?? null;
  const reveal: OrderForgeReveal | null = forge ? {
    order: forge.order,
    canonicalOrder: forge.canonicalOrder,
    valueDisplay: forge.valueDisplay,
    positionCorrect: forge.positionCorrect,
    isCorrect: forge.isCorrect,
  } : null;

  // The server's echo of an accepted lock: survives a refresh, so a reloaded
  // page shows the locked sequence rather than a fresh shuffle.
  const echoed = state.ownSubmittedChoices[CHALLENGE_INDEX];
  const lockedOrder = Array.isArray(echoed) ? [...echoed] : null;
  const serverLocked = lockedOrder !== null
    || state.ownNextChallengeIndex > CHALLENGE_INDEX || state.ownFinished;

  const wakeAt = opensAt(state, roundStartedAt);
  useServerInstantWake(wakeAt, skewMs);
  const notOpen = wakeAt !== null && msUntilServerInstant(wakeAt, skewMs, Date.now()) > 0;

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="order-forge-loading">
        Loading the cards…
      </p>
    );
  }

  const phase = reveal ? "revealed" : serverLocked || pending === key ? "locked" : "open";
  const initial = content.entries.map((e) => e.token);
  const value = phase === "open"
    ? (draft?.key === key ? draft.order : initial)
    : lockedOrder ?? (draft?.key === key ? draft.order : initial);

  const onLock = ({ order }: { order: readonly string[] }) => {
    // Never sent before the challenge opens (the input is inert until then).
    if (notOpen || pending !== null || serverLocked) return;
    setPending(key);
    const result = actions.submitChallenge(CHALLENGE_INDEX, { order });
    // A refused or failed lock stored nothing: reopen so the player can retry.
    if (result && typeof (result as Promise<boolean>).then === "function") {
      void (result as Promise<boolean>).then((accepted) => {
        if (!accepted) setPending((p) => (p === key ? null : p));
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="order-forge-phase" data-phase={phase}
      data-not-open={phase === "open" && notOpen ? "true" : undefined}
      // React 18 has no boolean `inert`; the attribute's presence is what counts.
      {...(phase === "open" && notOpen ? { inert: "" } : {})}>
      <OrderForge key={key} content={content} phase={phase} value={value}
        onChange={(order) => setDraft({ key, order })} onLock={onLock} reveal={reveal} />
      {/* Reserved in every phase (OF4): appearing at the lock used to add a
          line and shift the centred stage. Hidden, not absent, while open. */}
      <p className={`min-h-[1rem] text-center text-xs text-muted-foreground ${phase === "open" ? "invisible" : ""}`}
        role="status" aria-hidden={phase === "open" ? true : undefined}
        data-testid="order-forge-opponent-progress">
        {phase === "open" ? "" : state.opponentFinished
          ? "Both players have locked in."
          : "Waiting for the opponent to lock in…"}
      </p>
    </div>
  );
}

/**
 * OF4 — the scene. Decorative base-shop art behind the cards: module-local,
 * static, inert to every pointer, and mounted for the module's whole life
 * (including its loading states), so lock, reveal and a late snapshot never
 * remount or re-crop it. The module's height is constant across its phases
 * (fixed rows, one footer footprint, a reserved status line), so the
 * `inset-0` box, and with it the `object-cover` crop, does not move either.
 *
 * Treatment: the art is MULTIPLIED onto a parchment base inside its own
 * layer, so it tints the parchment (colour, never a grey veil), then fades to
 * the folio at every edge and stays quiet behind the prompt.
 */
export function OrderForgeBackdrop() {
  return (
    <div aria-hidden data-testid="order-forge-backdrop"
      className="order-forge-backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-lg">
      <img src={ORDER_FORGE_BACKDROP_URL} alt="" aria-hidden draggable={false}
        className="order-forge-backdrop__art h-full w-full object-cover" />
    </div>
  );
}

function OrderForgeViewport({ segmentState, actions, skewMs, publicRound }: ModuleViewportProps) {
  return (
    <div className="relative isolate space-y-3" data-testid="order-forge-viewport">
      <OrderForgeBackdrop />
      {segmentState ? (
        <OrderForgePhase state={segmentState} actions={actions} skewMs={skewMs}
          roundStartedAt={publicRound?.activeRound?.startedAt ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="order-forge-loading">
          Loading the segment…
        </p>
      )}
      {actions.error && (
        <p role="alert" data-testid="order-forge-error" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const orderForgeModule: ModuleRenderer = {
  moduleId: ORDER_FORGE_MODULE_ID,
  moduleVersion: ORDER_FORGE_MODULE_VERSION,
  // The module owns its input and its single Lock In, so the shell must not
  // also render the quiz answer flow or ability tray.
  ownsSubmission: true,
  Viewport: OrderForgeViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return state.ownNextChallengeIndex > CHALLENGE_INDEX ? "Order locked in" : "Order the cards";
  },
};
