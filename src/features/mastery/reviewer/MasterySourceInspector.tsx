/**
 * Provenance & source inspector (G5.2C). Distinguishes original certified source
 * evidence, generator provenance, patch-descriptor provenance, and (where
 * present) reconstructed replay provenance, and carries the G6-approved note.
 */
import type { MasteryReviewArtifact } from "../contracts/review";
import { JsonDisclosure, KeyValueList, SectionHeading } from "./_shared";

export function MasterySourceInspector({ artifact }: { artifact: MasteryReviewArtifact }) {
  return (
    <div className="space-y-4">
      <section aria-label="Source records">
        <SectionHeading>Original certified source evidence</SectionHeading>
        <p className="mb-1 text-xs text-muted-foreground">
          Artifact source-record union ({artifact.sourceRecords.length}).
        </p>
        <JsonDisclosure value={artifact.sourceRecords} label="Artifact source records" testId="source-union-trigger" />
      </section>

      <section aria-label="Generator provenance">
        <SectionHeading>Generator provenance</SectionHeading>
        <KeyValueList
          entries={[
            ["generator_id", artifact.generatorId],
            ["generation_engine_version", artifact.generationEngineVersion],
          ]}
        />
      </section>

      <section aria-label="Patch descriptor provenance">
        <SectionHeading>Patch descriptor (provenance)</SectionHeading>
        <JsonDisclosure value={artifact.patchDescriptor} label="Patch descriptor" testId="patch-descriptor-trigger" />
      </section>

      <p
        data-testid="replay-provenance-note"
        className="rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground"
      >
        Replay provenance identifies reconstructed state used for verification. Original certified
        source evidence remains attached to the artifact and calculation records.
      </p>
    </div>
  );
}
