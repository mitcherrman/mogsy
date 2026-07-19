/**
 * Identity registry (G5.2C). Organizes all immutable IDs. IDs are displayed and
 * copyable (non-canonical) but never generated or re-hashed here.
 */
import type { MasteryReviewArtifact } from "../contracts/review";
import { IdValue, SectionHeading } from "./_shared";

export function MasteryIdentityInspector({ artifact }: { artifact: MasteryReviewArtifact }) {
  return (
    <div className="space-y-4" data-testid="identity-inspector">
      <section aria-label="Artifact identity">
        <SectionHeading>Artifact identity</SectionHeading>
        <div className="space-y-1">
          <IdValue label="artifact digest" value={artifact.artifactDigest} />
          <IdValue label="mastery set ID" value={artifact.masterySetId} />
          <IdValue label="patch key digest" value={artifact.patchKeyDigest} />
          <IdValue label="validation ctx digest" value={artifact.validationContextDigest} />
          <IdValue label="initial snapshot" value={artifact.initialSnapshotId} />
        </div>
      </section>

      <section aria-label="Step and adapter IDs">
        <SectionHeading>Steps &amp; adapters</SectionHeading>
        <div className="space-y-1">
          {artifact.steps.map((s) => (
            <IdValue key={s.stepId} label={`Q${s.sequenceIndex + 1} step`} value={s.stepId} />
          ))}
        </div>
      </section>

      <section aria-label="Transition IDs">
        <SectionHeading>Transitions</SectionHeading>
        <div className="space-y-1">
          {artifact.transitionChain.map((t, i) => (
            <IdValue key={i} label={`T${i + 1}`} value={String((t as Record<string, unknown>).transition_id)} />
          ))}
        </div>
      </section>

      <section aria-label="Capsule IDs">
        <SectionHeading>Ranked capsule IDs</SectionHeading>
        <div className="space-y-1">
          {artifact.rankedCapsules.map((c) => (
            <IdValue key={c.capsuleId} label={`Q${c.sourceSequenceIndex + 1} capsule`} value={c.capsuleId} />
          ))}
        </div>
      </section>
    </div>
  );
}
