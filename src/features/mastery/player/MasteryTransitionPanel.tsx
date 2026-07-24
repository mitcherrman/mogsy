/**
 * Transition summary (G5.2B; J1 player-safe pass).
 *
 * Renders a backend-authoritative state change in plain League language. Values
 * (magnitude, before/after, delta) are pass-through; nothing is computed here.
 * Player-facing only: no internal origin taxonomy ("authored/question-proposed"),
 * no A/B target codes, no snapshot ids, no stat slugs. A `state_unchanged` view
 * reads "No state change".
 */
import type { MasteryTransitionView, ProgressionTransitionView } from "../contracts/transitionView";
import { PROGRESSION_CLASSIFICATIONS } from "../contracts/transitionView";
import { championForTarget, formatNumber, humanizeUnit } from "./playerFormat";

function isProgression(t: MasteryTransitionView): t is ProgressionTransitionView {
  return (PROGRESSION_CLASSIFICATIONS as readonly string[]).includes(t.classification);
}

export function MasteryTransitionPanel({
  transition,
  championA,
  championB,
  heading = "State update",
}: {
  transition: MasteryTransitionView;
  /** Display names used to turn internal A/B target codes into champion names. */
  championA: string;
  championB: string;
  heading?: string;
}) {
  const isUnchanged = transition.classification === "state_unchanged";
  return (
    <section
      aria-label={heading}
      data-testid="mastery-transition-panel"
      className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {isUnchanged ? "State" : heading}
      </h3>

      {transition.classification === "state_unchanged" && (
        <p data-testid="transition-state-unchanged" className="text-sm">
          No state change.
        </p>
      )}

      {transition.classification === "authored_effect" && (
        <p data-testid="transition-authored-effect" className="text-sm font-medium">
          {championForTarget(transition.target, championA, championB)} gains{" "}
          {transition.magnitude !== null
            ? `+${formatNumber(transition.magnitude)} ${humanizeUnit(transition.unit)}`.trim()
            : transition.label}
        </p>
      )}

      {transition.classification === "health_change" && (
        <div data-testid="transition-health-change" className="space-y-0.5">
          <p className="text-sm font-medium">
            {championForTarget(transition.target, championA, championB)}{" "}
            {transition.delta !== null && transition.delta < 0 ? "loses" : "gains"}{" "}
            {transition.delta !== null ? formatNumber(Math.abs(transition.delta)) : ""} HP
          </p>
          {transition.beforeValue !== null && transition.afterValue !== null && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(transition.beforeValue)} → {formatNumber(transition.afterValue)} HP
            </p>
          )}
        </div>
      )}

      {isProgression(transition) && (
        <div data-testid="transition-progression" className="space-y-0.5">
          {/* The backend label is the authoritative player-facing sentence for
              progression steps (already champion-named and player-safe). */}
          <p className="text-sm font-medium">{transition.label}</p>
          {transition.beforeValue !== null && transition.afterValue !== null && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(transition.beforeValue)} → {formatNumber(transition.afterValue)}{" "}
              {humanizeUnit(transition.unit)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
