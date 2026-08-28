/**
 * Gated dev route: comparison Mastery interaction prototype (Phase 4C2).
 *
 * Authenticated (route wrapped in ProtectedRoute). Not linked from navigation
 * and not present in the sitemap. Fixture-driven only — no live backend, no
 * public serving. Proves the two-champion comparative interaction renders
 * and grades end to end through the same dispatcher used by the live,
 * atomic-recall, and legacy fixture-prototype paths.
 */
import { ComparisonPrototype } from "@/features/mastery/interactions/ComparisonPrototype";

export default function ComparisonPrototypePage() {
  return (
    <div className="min-h-[60vh]">
      <ComparisonPrototype />
    </div>
  );
}
