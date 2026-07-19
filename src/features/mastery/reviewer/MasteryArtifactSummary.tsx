/**
 * Artifact-level summary + patch presentation (G5.2C). Distinguishes the patch
 * DIGEST (canonical authority), the full patch DESCRIPTOR (provenance), and the
 * human patch label (display text), and shows a mixed-snapshot warning.
 */
import { AlertTriangle } from "lucide-react";
import type { MasteryReviewArtifact } from "../contracts/review";
import { IdValue, JsonDisclosure, KeyValueList, SectionHeading } from "./_shared";

export function MasteryArtifactSummary({ artifact }: { artifact: MasteryReviewArtifact }) {
  const pd = artifact.patchDescriptor as Record<string, unknown>;
  const patchLabel = String(pd.game_patch_display ?? "");
  const provenanceStatus = String(pd.provenance_status ?? "");
  const mixed = provenanceStatus === "mixed_verified" || /mixed/i.test(patchLabel);

  return (
    <div className="space-y-4">
      <section aria-label="Patch and provenance">
        <SectionHeading>Patch</SectionHeading>

        {mixed && (
          <div
            role="note"
            data-testid="mixed-snapshot-warning"
            className="my-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              Mixed verified snapshot — data is drawn from several source revisions, not a single
              unified patch source.
            </span>
          </div>
        )}

        <div className="space-y-2 text-xs">
          <div data-testid="patch-label-line">
            <span className="font-medium text-muted-foreground">Human label (display text): </span>
            {patchLabel}
          </div>
          <div data-testid="patch-digest-line" className="space-y-0.5">
            <span className="font-medium text-muted-foreground">Canonical patch authority (digest):</span>
            <IdValue label="patch_key_digest" value={artifact.patchKeyDigest} />
          </div>
        </div>

        <div className="mt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Patch descriptor (provenance)</p>
          <JsonDisclosure value={artifact.patchDescriptor} label="Full patch descriptor" testId="summary-patch-descriptor-trigger" />
        </div>
      </section>

      <section aria-label="Validation context">
        <SectionHeading>Validation context</SectionHeading>
        <IdValue label="validation ctx digest" value={artifact.validationContextDigest} />
        <JsonDisclosure value={artifact.validationContext} label="Validation context" testId="summary-vctx-trigger" />
      </section>

      <section aria-label="Build classification">
        <SectionHeading>Build classification</SectionHeading>
        <KeyValueList
          entries={[
            ["classification", artifact.buildClassification.classification],
            ["confidence", artifact.buildClassification.confidence],
            ["is_proven_meta", artifact.buildClassification.isProvenMeta],
            ["curation_statement", artifact.buildClassification.curationStatement],
          ]}
        />
      </section>
    </div>
  );
}
