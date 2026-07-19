/**
 * Artifact header (G5.2C). Immutable identity + counts + review/publication
 * state, with an explicit curated/non-meta warning.
 */
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { MasteryReviewArtifact, MasteryReviewRecord } from "../contracts/review";
import { IdValue } from "./_shared";

export function MasteryReviewerHeader({
  artifact,
  reviewRecord,
  patchDisplay,
}: {
  artifact: MasteryReviewArtifact;
  reviewRecord: MasteryReviewRecord;
  patchDisplay: string;
}) {
  const matchup = artifact.matchupIdentity as Record<string, unknown>;
  const authored = artifact.authoredTransitionIds.length;
  const bound = artifact.transitionChain.length - authored;

  return (
    <header className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">
            {String(matchup.champion_a)} E vs {String(matchup.champion_b)} E
          </h1>
          <p className="text-xs text-muted-foreground">{patchDisplay}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" data-testid="reviewer-status-badge" className="text-[10px]">
            Reviewer: {reviewRecord.reviewerStatus}
          </Badge>
          <Badge variant="outline" data-testid="publication-status-badge" className="text-[10px]">
            Publication: {reviewRecord.publicationStatus}
          </Badge>
        </div>
      </div>

      {!artifact.buildClassification.isProvenMeta && (
        <div
          role="note"
          data-testid="curated-warning"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            <strong>Curated teaching scenario</strong> — not verified as a popular or meta build
            (build classification <code>{artifact.buildClassification.classification}</code>,
            confidence <code>{artifact.buildClassification.confidence}</code>,{" "}
            <code>is_proven_meta = false</code>).
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Count label="Questions" value={artifact.steps.length} />
        <Count label="Transitions" value={artifact.transitionChain.length} />
        <Count label="Authored" value={authored} />
        <Count label="Step-bound" value={bound} />
      </div>

      <div className="space-y-1">
        <IdValue label="Mastery set ID" value={artifact.masterySetId} />
        <IdValue label="Artifact digest" value={artifact.artifactDigest} />
        <IdValue label="Generator ID" value={artifact.generatorId} />
        <IdValue label="Engine version" value={artifact.generationEngineVersion} />
      </div>
    </header>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold tabular-nums" data-testid={`count-${label.toLowerCase()}`}>{value}</span>
    </div>
  );
}
