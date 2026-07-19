/**
 * Before/after snapshot comparison for the selected step (G5.2C).
 *
 * The reviewer projection carries snapshot IDs and backend-provided transition
 * params — not full snapshot bodies. This panel therefore displays the step's
 * before/after snapshot IDs and, where a transition connects them, the
 * backend-supplied delta/magnitude. It NEVER applies a game formula, reconstructs
 * a snapshot, or asserts canonical correctness. For a read-only step whose before
 * == after it states "state unchanged" and separately notes any authored
 * inter-step transition that begins where this step ends.
 */
import { Badge } from "@/components/ui/badge";
import type { MasteryReviewArtifact, MasteryReviewStep } from "../contracts/review";
import { IdValue, SectionHeading } from "./_shared";

function transitionForStep(step: MasteryReviewStep, artifact: MasteryReviewArtifact) {
  if (!step.transitionId) return null;
  return artifact.transitionChain.find((t) => (t as Record<string, unknown>).transition_id === step.transitionId) ?? null;
}

function authoredAfterStep(step: MasteryReviewStep, artifact: MasteryReviewArtifact) {
  // An authored inter-step transition that begins where this read-only step ends.
  return artifact.transitionChain.find((t) => {
    const r = t as Record<string, unknown>;
    return (
      artifact.authoredTransitionIds.includes(String(r.transition_id)) &&
      r.before_snapshot_id === step.afterSnapshotId
    );
  }) as Record<string, unknown> | undefined;
}

function TransitionDelta({ record }: { record: Record<string, unknown> }) {
  const params = (record.params ?? {}) as Record<string, unknown>;
  return (
    <ul className="text-xs text-muted-foreground">
      <li>type: <code>{String(record.transition_type)}</code></li>
      <li>target: <code>{String(record.target)}</code></li>
      {"delta" in params && <li>health delta: <span className="tabular-nums text-destructive">{String(params.delta)}</span></li>}
      {"magnitude" in params && <li>magnitude: <span className="tabular-nums">+{String(params.magnitude)}{params.stat ? ` ${String(params.stat)}` : ""}</span></li>}
    </ul>
  );
}

export function MasterySnapshotComparison({
  step,
  artifact,
}: {
  step: MasteryReviewStep;
  artifact: MasteryReviewArtifact;
}) {
  const unchanged = step.beforeSnapshotId === step.afterSnapshotId;
  const bound = transitionForStep(step, artifact);
  const authored = authoredAfterStep(step, artifact);

  return (
    <section aria-label="Snapshot comparison" className="space-y-2" data-testid="snapshot-comparison">
      <SectionHeading>State continuity</SectionHeading>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-border p-2">
          <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Before</p>
          <IdValue label="snapshot" value={step.beforeSnapshotId} />
        </div>
        <div className="rounded border border-border p-2">
          <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">After</p>
          <IdValue label="snapshot" value={step.afterSnapshotId} />
        </div>
      </div>

      {unchanged ? (
        <p data-testid="snapshot-unchanged" className="text-sm">
          <Badge variant="secondary" className="mr-1 text-[10px]">read-only</Badge>
          No authoritative state difference at this step (before snapshot equals after snapshot).
        </p>
      ) : (
        <div data-testid="snapshot-bound-transition" className="rounded border border-border bg-muted/30 p-2">
          <p className="text-xs font-medium">Step-bound transition (backend evidence)</p>
          {bound && <TransitionDelta record={bound as Record<string, unknown>} />}
        </div>
      )}

      {authored && (
        <div data-testid="snapshot-authored-note" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          This step is read-only. A <strong>separate authored inter-step transition</strong> begins where
          it ends ({String((authored.before_snapshot_id as string))} → {String(authored.after_snapshot_id as string)}):
          <TransitionDelta record={authored} />
        </div>
      )}
    </section>
  );
}
