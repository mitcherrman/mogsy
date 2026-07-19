/**
 * Admin-gated route: live Mastery reviewer inspector (H1 / G7).
 *
 * Route wrapped in AdminRoute. Read-only — fetches the admin reviewer projection
 * for the artifact digest in the URL and renders the prop-driven inspector via
 * the live loader. No mutations, no sitemap entry, no navigation link.
 */
import { useParams } from "react-router-dom";

import { MasteryReviewerLive } from "@/features/mastery/live";

export default function MasteryReviewerPage() {
  const { artifactDigest } = useParams<{ artifactDigest: string }>();
  if (!artifactDigest) {
    return <div className="p-6 text-sm text-muted-foreground">Missing artifact digest.</div>;
  }
  return <MasteryReviewerLive artifactDigest={artifactDigest} />;
}
