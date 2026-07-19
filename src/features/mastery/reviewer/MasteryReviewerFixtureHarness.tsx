/**
 * Non-production harness (G5.2C): parses the audited reviewer fixture and renders
 * the inspector. Not wired into routing/navigation/sitemap. Use for local render
 * and tests only.
 */
import { parseMasteryReviewArtifact } from "../contracts/parsers";
import { reviewArtifactEnvelope } from "../fixtures";
import { MasteryReviewerInspector } from "./MasteryReviewerInspector";

export function MasteryReviewerFixtureHarness() {
  const { artifact, reviewRecord } = parseMasteryReviewArtifact(reviewArtifactEnvelope());
  const rawArtifact = (reviewArtifactEnvelope().data as Record<string, unknown>).artifact;
  return (
    <MasteryReviewerInspector artifact={artifact} reviewRecord={reviewRecord} rawArtifact={rawArtifact} />
  );
}
