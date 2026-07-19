/**
 * Transition visualization (G5.2B). Renders a backend-authoritative transition
 * view. Values (magnitude, before/after, delta) are pass-through; nothing is
 * computed here. A `state_unchanged` view shows an explicit "state unchanged"
 * message and never implies a read-only question caused a transition.
 */
import { Badge } from "@/components/ui/badge";
import type { MasteryTransitionView } from "../contracts/transitionView";

function OriginBadge({ origin }: { origin: "authored_inter_step" | "question_proposed" }) {
  const label =
    origin === "authored_inter_step" ? "Authored scenario transition" : "Question-proposed transition";
  return (
    <Badge variant="secondary" className="text-[10px]" data-testid={`transition-origin-${origin}`}>
      {label}
    </Badge>
  );
}

function AppliedBadge({ applied }: { applied: boolean }) {
  return (
    <Badge variant={applied ? "default" : "outline"} className="text-[10px]">
      {applied ? "Applied" : "Proposed (not applied)"}
    </Badge>
  );
}

export function MasteryTransitionPanel({
  transition,
  beforeSnapshotId,
  afterSnapshotId,
  heading,
}: {
  transition: MasteryTransitionView;
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
  heading?: string;
}) {
  return (
    <section
      aria-label={heading ?? "State transition"}
      data-testid="mastery-transition-panel"
      className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
    >
      {heading && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h3>}

      {transition.classification === "state_unchanged" && (
        <p data-testid="transition-state-unchanged" className="text-sm">
          Canonical state unchanged.{transition.label ? ` ${transition.label}` : ""}
        </p>
      )}

      {transition.classification === "authored_effect" && (
        <div data-testid="transition-authored-effect" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <OriginBadge origin={transition.origin} />
            <AppliedBadge applied={transition.applied} />
          </div>
          <p className="text-sm font-medium">{transition.label}</p>
          <dl className="space-y-0.5 text-xs text-muted-foreground">
            <div className="flex gap-1"><dt className="font-medium">Target:</dt><dd>{transition.target}</dd></div>
            {transition.magnitude !== null && (
              <div className="flex gap-1">
                <dt className="font-medium">Effect:</dt>
                <dd>+{transition.magnitude}{transition.unit ? ` ${transition.unit}` : ""}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {transition.classification === "health_change" && (
        <div data-testid="transition-health-change" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <OriginBadge origin={transition.origin} />
            <AppliedBadge applied={transition.applied} />
          </div>
          <p className="text-sm font-medium">{transition.label}</p>
          <dl className="space-y-0.5 text-xs text-muted-foreground">
            <div className="flex gap-1"><dt className="font-medium">Target:</dt><dd>{transition.target}</dd></div>
            <div className="flex gap-1">
              <dt className="font-medium">Health:</dt>
              <dd className="tabular-nums">
                {transition.beforeValue} → {transition.afterValue}
                {transition.delta !== null && (
                  <span className="ml-1 text-destructive">({transition.delta}{transition.unit ? ` ${transition.unit}` : ""})</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {(beforeSnapshotId || afterSnapshotId) && transition.classification !== "state_unchanged" && (
        <dl className="space-y-0.5 text-[10px] text-muted-foreground">
          {beforeSnapshotId && (
            <div className="flex gap-1"><dt className="shrink-0 font-medium">Before:</dt><dd className="truncate" title={beforeSnapshotId}>{beforeSnapshotId}</dd></div>
          )}
          {afterSnapshotId && (
            <div className="flex gap-1"><dt className="shrink-0 font-medium">After:</dt><dd className="truncate" title={afterSnapshotId}>{afterSnapshotId}</dd></div>
          )}
        </dl>
      )}
    </section>
  );
}
