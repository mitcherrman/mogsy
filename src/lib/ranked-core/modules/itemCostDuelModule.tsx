// ---------------------------------------------------------------------------
// `item_cost_duel.v1` renderer — Phase B slice 4.
//
// DELIBERATELY UTILITARIAN. This is the owner playtest surface: it must be
// correct, accessible, and refresh-safe. Production presentation is Phase C.
//
// Authority: this component computes NOTHING. The phase, the deadlines, the
// challenge index, which items are shown, which abilities are selectable, and
// whether the opponent has confirmed all come from the authoritative
// `segmentState` on every poll. The only local state is the unconfirmed
// ability draft echo and an "I just clicked this" marker, both of which are
// overwritten by the next snapshot.
//
// In particular there is no local index increment: after a submission the
// component waits for the server's next `ownNextChallengeIndex`. A refresh at
// any point therefore lands on exactly the right challenge.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { abilityName } from "@/lib/ranked-core/abilityDisplay";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import type {
  PublicRoundView,
  SegmentChallengeView,
  SegmentItemView,
  SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export const ITEM_COST_DUEL_MODULE_ID = "item_cost_duel";
export const ITEM_COST_DUEL_MODULE_VERSION = 1;
/**
 * The last version whose block is five ITEM-COST pairs answered by `item_id`.
 * v4 onwards is the mixed Meta Reflex block and is served by its own renderer.
 */
export const ITEM_COST_DUEL_MAX_VERSION = 3;

const NO_ABILITY = "__none__";

/** Whole seconds left until an ISO deadline, floored at 0. Server-anchored. */
export function secondsRemaining(
  deadlineIso: string | null, nowMs: number, skewMs: number,
): number | null {
  if (!deadlineIso) return null;
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - (nowMs + skewMs)) / 1000));
}

/** 1s tick so a server-anchored countdown moves between polls. */
function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Countdown({ deadline, skewMs, label }:
{ deadline: string | null; skewMs: number; label: string }) {
  const now = useSecondTick();
  const left = secondsRemaining(deadline, now, skewMs);
  if (left === null) return null;
  return (
    <p className="text-sm tabular-nums" data-testid="icd-countdown">
      {/* aria-live is intentionally OFF: a per-second announcement would
          drown a screen reader. The value is exposed as a label instead, and
          the phase transitions themselves are announced. */}
      <span className="sr-only">{label}: </span>
      {left}s
    </p>
  );
}

/**
 * Fixed 48×48 icon slot. The slot itself is ALWAYS rendered so a missing,
 * still-loading, or failed image can never change the card's geometry. The
 * backend sends a repo-relative `asset_path` (e.g. `assets/items/3153.png`)
 * that only exists on the combat API origin, so it must go through
 * `resolveQuizAssetUrl` — rendering it raw resolves against the frontend
 * origin and 404s. Absolute URLs pass through the resolver unchanged.
 */
function ItemIcon({ assetPath, label }: {
  assetPath: string | null;
  label: string;
}) {
  const src = resolveQuizAssetUrl(assetPath);
  const [errored, setErrored] = useState(false);
  // A new item (new URL) gets a fresh attempt.
  useEffect(() => { setErrored(false); }, [src]);
  const showImage = Boolean(src) && !errored;
  return (
    <span
      data-testid="icd-item-icon-slot"
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40"
    >
      {showImage ? (
        <img
          src={src}
          alt={`${label} item icon`}
          width={48}
          height={48}
          className="h-full w-full object-contain"
          loading="lazy"
          data-testid="icd-item-img"
          onError={() => {
            if (import.meta.env.DEV) {
              // Dev-only diagnostic; players only ever see the glyph below.
              console.warn(`[icd] item icon failed to load: "${label}" → ${src}`);
            }
            setErrored(true);
          }}
        />
      ) : (
        /* Neutral item glyph — the item name is announced by the label on
           this span, matching the alt text the image would have had. */
        <span role="img" aria-label={`${label} item icon`} data-testid="icd-item-fallback">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"
               className="text-muted-foreground" fill="none"
               stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" />
            <path d="M12 3v18M5 7l7 4 7-4" opacity="0.5" />
          </svg>
        </span>
      )}
    </span>
  );
}

function ItemCard({ item, selected, disabled, onPick }: {
  item: SegmentItemView;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const label = item.name ?? item.itemId;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={`icd-item-${item.itemId}`}
      className={`flex flex-1 flex-col items-center gap-2 rounded-lg border p-3 text-center
        disabled:cursor-not-allowed disabled:opacity-60
        ${selected ? "border-primary ring-2 ring-primary" : "border-border"}`}
    >
      <ItemIcon assetPath={item.assetPath} label={label} />
      <span className="text-sm font-medium">{label}</span>
      {item.itemType && (
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {item.itemType}
        </span>
      )}
      {/* Cost is deliberately absent: it does not exist client-side until the
          segment resolves. */}
    </button>
  );
}

// ------------------------------------------------ legacy ability phase
//
// R3 removed the ability window from the Item Cost Duel format, so no segment
// created from now on can be in this phase. A match created BEFORE R3 froze the
// old format in its snapshot and could still be sitting in one, so this renders
// a neutral waiting state rather than crashing or offering controls the client
// no longer implements. The server expires the window on its own (5s), so the
// next poll moves the segment on with No Ability for both sides.

function LegacyAbilityPhase({ state, skewMs }: {
  state: SegmentStateView;
  skewMs: number;
}) {
  return (
    <div className="space-y-2" data-testid="icd-legacy-ability-phase">
      <h4 className="font-semibold">Item Cost Duel</h4>
      <p className="text-sm text-muted-foreground" role="status">
        Starting the challenges…
      </p>
      <Countdown deadline={state.abilityDeadline} skewMs={skewMs}
                 label="Time until the challenges start" />
    </div>
  );
}

// -------------------------------------------------------- challenge phase

function ChallengePhase({ state, actions, skewMs }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
}) {
  const index = state.ownNextChallengeIndex;
  // v1–v3 only. A v4 block never reaches this renderer (the registry resolves
  // it to the Meta Reflex viewport), so a non-item block here means the segment
  // and the renderer disagree — which reads as "no card", not as a guess.
  const challenges: SegmentChallengeView[] =
    state.block?.contract === "item_cost" ? state.block.challenges : [];
  const current: SegmentChallengeView | undefined = challenges[index];
  // "I clicked this" marker, cleared as soon as the server moves the index.
  const [pending, setPending] = useState<{ index: number; itemId: string } | null>(null);
  useEffect(() => { setPending((p) => (p && p.index !== index ? null : p)); }, [index]);

  if (state.ownFinished || !current) {
    return (
      <div className="space-y-2" data-testid="icd-waiting">
        <h4 className="font-semibold">All five submitted</h4>
        <p className="text-sm text-muted-foreground" role="status">
          {state.opponentFinished
            ? "Both players are done — scoring the segment…"
            : `Waiting for the opponent (${state.opponentChallengesCompleted} of ${state.challengeCount} done)…`}
        </p>
        <Countdown deadline={state.challengeDeadline} skewMs={skewMs}
                   label="Time left in this segment" />
      </div>
    );
  }

  const submitting = actions.busy || pending !== null;
  const pick = (itemId: string) => {
    setPending({ index, itemId });
    actions.submitChallenge(index, { itemId });
  };

  return (
    <div className="space-y-3" data-testid="icd-challenge-phase">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h4 className="font-semibold" data-testid="icd-progress">
            Challenge {index + 1} of {state.challengeCount}
          </h4>
          <p className="text-sm text-muted-foreground">
            {state.prompt ?? "Which item costs more?"}
          </p>
        </div>
        <Countdown deadline={state.challengeDeadline} skewMs={skewMs}
                   label="Time left in this segment" />
      </header>

      <div className="flex gap-3">
        <ItemCard item={current.left}
                  selected={pending?.itemId === current.left.itemId}
                  disabled={submitting} onPick={() => pick(current.left.itemId)} />
        <ItemCard item={current.right}
                  selected={pending?.itemId === current.right.itemId}
                  disabled={submitting} onPick={() => pick(current.right.itemId)} />
      </div>

      <p className="text-xs text-muted-foreground" data-testid="icd-opponent-progress">
        Opponent: {state.opponentChallengesCompleted} of {state.challengeCount} done
        {state.opponentFinished ? " — finished" : ""}
      </p>
      {state.pressureApplied && (
        <p className="text-xs font-medium" role="status" data-testid="icd-pressure">
          Timer shortened — the opponent finished first.
        </p>
      )}
      {/* No correctness feedback here: it does not exist until settlement. */}
    </div>
  );
}

// --------------------------------------------------------------- viewport

function ItemCostDuelViewport(
  { segmentState, actions, skewMs }: ModuleViewportProps,
) {
  if (!segmentState) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="icd-loading">
        Loading the segment…
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {segmentState.phase === "ability"
        ? <LegacyAbilityPhase state={segmentState} skewMs={skewMs} />
        : <ChallengePhase state={segmentState} actions={actions} skewMs={skewMs} />}
      {actions.error && (
        <p role="alert" data-testid="icd-error" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const itemCostDuelModule: ModuleRenderer = {
  moduleId: ITEM_COST_DUEL_MODULE_ID,
  moduleVersion: ITEM_COST_DUEL_MODULE_VERSION,
  servesVersion: (version) => version <= ITEM_COST_DUEL_MAX_VERSION,
  // The module runs its own ability window and submits its own challenges, so
  // the shell must not also render the quiz confirm strip or ability tray.
  ownsSubmission: true,
  Viewport: ItemCostDuelViewport,
  // Not a question-shaped module: the shell drives the viewport from
  // `segmentState`, so there is no `QuestionView` to project.
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    // No "Choosing an ability" status: there is no ability step to be in. A
    // legacy segment still transitioning simply reads as starting.
    if (state.phase === "ability") return "Starting…";
    return `Challenge ${Math.min(state.ownNextChallengeIndex + 1, state.challengeCount)} of ${state.challengeCount}`;
  },
};

export const NO_ABILITY_OPTION_ID = NO_ABILITY;
