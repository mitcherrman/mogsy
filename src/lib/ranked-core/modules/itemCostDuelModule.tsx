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
      {item.assetPath && (
        <img src={item.assetPath} alt={`${label} item icon`} className="h-12 w-12"
             loading="lazy" />
      )}
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

// ---------------------------------------------------------- ability phase

function AbilityPhase({ state, actions, skewMs }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
}) {
  const own = state.ownAbility;
  const locked = own.confirmed || actions.busy;
  // Local echo so a click feels immediate; the authoritative value always
  // wins on the next snapshot.
  const [draft, setDraft] = useState<string | null>(own.selectedAbilityId);
  const serverDraft = useRef(own.selectedAbilityId);
  useEffect(() => {
    if (serverDraft.current !== own.selectedAbilityId) {
      serverDraft.current = own.selectedAbilityId;
      setDraft(own.selectedAbilityId);
    }
  }, [own.selectedAbilityId]);
  const shown = own.confirmed ? own.selectedAbilityId : draft;

  const pick = (abilityId: string | null) => {
    setDraft(abilityId);
    actions.draftAbility(abilityId);
  };

  const unavailable = Object.entries(own.unavailableAbilityIds);

  return (
    <div className="space-y-3" data-testid="icd-ability-phase">
      <header>
        <h4 className="font-semibold">Item Cost Duel</h4>
        <p className="text-sm text-muted-foreground">
          Pick an ability for this segment, then confirm. Five item questions
          follow — the more expensive item wins each one.
        </p>
      </header>
      <Countdown deadline={state.abilityDeadline} skewMs={skewMs}
                 label="Time left to choose an ability" />

      <fieldset disabled={locked} className="space-y-2">
        <legend className="text-sm font-medium">Ability</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => pick(null)} disabled={locked}
                  aria-pressed={shown === null}
                  data-testid={`icd-ability-${NO_ABILITY}`}
                  className={`rounded border px-3 py-1.5 text-sm disabled:opacity-60
                    ${shown === null ? "border-primary ring-2 ring-primary" : "border-border"}`}>
            No Ability
          </button>
          {own.availableAbilityIds.map((id) => (
            <button key={id} type="button" onClick={() => pick(id)} disabled={locked}
                    aria-pressed={shown === id} data-testid={`icd-ability-${id}`}
                    className={`rounded border px-3 py-1.5 text-sm disabled:opacity-60
                      ${shown === id ? "border-primary ring-2 ring-primary" : "border-border"}`}>
              {abilityName(id)}
            </button>
          ))}
        </div>
      </fieldset>

      {unavailable.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground"
            data-testid="icd-unavailable-abilities">
          {unavailable.map(([id, reason]) => (
            <li key={id}>
              <span className="font-medium">{abilityName(id)}</span>: {reason}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={actions.confirmAbility}
                disabled={own.confirmed || actions.busy}
                data-testid="icd-confirm-ability"
                className="rounded bg-primary px-4 py-2 text-sm font-semibold
                           text-primary-foreground disabled:opacity-60">
          {own.confirmed ? "Locked in" : actions.busy ? "Confirming…" : "Confirm"}
        </button>
        <p className="text-xs text-muted-foreground" data-testid="icd-ability-status">
          {own.confirmed
            ? `Locked: ${own.selectedAbilityId ? abilityName(own.selectedAbilityId) : "No Ability"}`
            : "You can change this until you confirm."}
        </p>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="icd-opponent-ready">
        {state.opponentAbilityConfirmed
          ? "Opponent is ready."
          : "Waiting for the opponent to choose…"}
        {/* Only readiness — never WHAT they chose. */}
      </p>
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
  const current: SegmentChallengeView | undefined = state.challenges[index];
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
    actions.submitChallenge(index, itemId);
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
        ? <AbilityPhase state={segmentState} actions={actions} skewMs={skewMs} />
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
    if (state.phase === "ability") {
      return state.ownAbility.confirmed ? "Ability locked" : "Choosing an ability";
    }
    return `Challenge ${Math.min(state.ownNextChallengeIndex + 1, state.challengeCount)} of ${state.challengeCount}`;
  },
};

export const NO_ABILITY_OPTION_ID = NO_ABILITY;
