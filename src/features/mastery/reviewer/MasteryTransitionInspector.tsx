/**
 * Artifact-level transition inspector (G5.2C). Classifies every transition as
 * authored inter-step or step-bound and shows an invariant summary computed as a
 * DISPLAY count over backend evidence (not a new publication authority).
 */
import { Badge } from "@/components/ui/badge";
import type { MasteryReviewArtifact } from "../contracts/review";
import { IdValue, JsonDisclosure, SectionHeading } from "./_shared";

export function MasteryTransitionInspector({ artifact }: { artifact: MasteryReviewArtifact }) {
  const authoredIds = new Set(artifact.authoredTransitionIds);
  const boundIds = new Set(
    artifact.steps.filter((s) => s.transitionId).map((s) => String(s.transitionId)),
  );

  const rows = artifact.transitionChain.map((t) => {
    const r = t as Record<string, unknown>;
    const id = String(r.transition_id);
    const authored = authoredIds.has(id);
    const bound = boundIds.has(id);
    return { r, id, authored, bound };
  });

  const total = rows.length;
  const authoredCount = rows.filter((x) => x.authored).length;
  const boundCount = rows.filter((x) => x.bound).length;
  const doubleClassified = rows.filter((x) => x.authored && x.bound).length;
  const unclassified = rows.filter((x) => !x.authored && !x.bound).length;

  return (
    <section aria-label="Transition chain" className="space-y-3">
      <SectionHeading>Transition chain</SectionHeading>

      <dl
        data-testid="transition-invariants"
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-border bg-muted/30 p-2 text-xs sm:grid-cols-5"
      >
        <Inv label="Total" value={total} testId="inv-total" />
        <Inv label="Authored" value={authoredCount} testId="inv-authored" />
        <Inv label="Step-bound" value={boundCount} testId="inv-bound" />
        <Inv label="Double-classified" value={doubleClassified} testId="inv-double" />
        <Inv label="Unclassified" value={unclassified} testId="inv-unclassified" />
      </dl>

      <ul className="space-y-2">
        {rows.map(({ r, id, authored, bound }, i) => {
          const params = (r.params ?? {}) as Record<string, unknown>;
          const boundStep = artifact.steps.find((s) => String(s.transitionId) === id);
          return (
            <li key={id} className="space-y-1 rounded border border-border p-2" data-testid={`transition-row-${i}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-xs">T{i + 1}</span>
                <Badge variant="secondary" className="text-[10px]">{String(r.transition_type)}</Badge>
                {authored && <Badge className="text-[10px]" data-testid={`transition-authored-${i}`}>authored inter-step</Badge>}
                {bound && (
                  <Badge variant="outline" className="text-[10px]" data-testid={`transition-bound-${i}`}>
                    question-proposed · bound to Q{(boundStep?.sequenceIndex ?? 0) + 1}
                  </Badge>
                )}
              </div>
              <IdValue label="transition ID" value={id} />
              <p className="text-xs text-muted-foreground">
                target <code>{String(r.target)}</code>{" "}
                {"delta" in params && <>· delta <span className="tabular-nums">{String(params.delta)}</span></>}
                {"magnitude" in params && <>· +{String(params.magnitude)} {String(params.stat ?? "")}</>}
                {" "}· {String(r.before_snapshot_id).slice(0, 14)}… → {String(r.after_snapshot_id).slice(0, 14)}…
              </p>
            </li>
          );
        })}
      </ul>

      <JsonDisclosure value={artifact.transitionChain} label="Raw transition chain" testId="transition-chain-json-trigger" />
    </section>
  );
}

function Inv({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums" data-testid={testId}>{value}</dd>
    </div>
  );
}
