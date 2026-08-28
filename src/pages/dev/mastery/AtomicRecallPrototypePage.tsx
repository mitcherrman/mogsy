/**
 * Gated dev route: atomic-recall Mastery interaction prototype (Phase 4C1).
 *
 * Authenticated (route wrapped in ProtectedRoute). Not linked from navigation
 * and not present in the sitemap. Fixture-driven only — no live backend, no
 * public serving. Proves the one-champion / non-combat interaction renders
 * and grades end to end through the same dispatcher used by the live and
 * fixture-prototype legacy paths.
 */
import { AtomicRecallPrototype } from "@/features/mastery/interactions/AtomicRecallPrototype";

export default function AtomicRecallPrototypePage() {
  return (
    <div className="min-h-[60vh]">
      <AtomicRecallPrototype />
    </div>
  );
}
