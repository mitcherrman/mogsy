/**
 * Gated dev route: live Syndra objective-progression Mastery player (G4 prototype).
 *
 * Authenticated (wrapped in ProtectedRoute), not linked from navigation and not in
 * the sitemap. It reuses the backend-driven MasteryPlayerLive container and starts
 * a session against the Syndra progression PROTOTYPE set id explicitly — the
 * prototype is intentionally NOT in the default `/api/mastery/sets` catalog, so it
 * is only reachable through this distinct development route.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned prototype set id — the fully replayable v2 progression
// (mastery/publication/registry.py _EXPECTED_SYNDRA_V2_SET_ID). v2 reconstructs
// every checkpoint by deterministic replay (no resolved_states) and applies the
// level-6 Unleashed Power hit so the target after-state is correct. The original
// v1 set id (…25a343e4…) remains resolvable for in-flight sessions and its
// reviewer URL, but new dev sessions use v2.
const SYNDRA_PROGRESSION_SET_ID =
  "mset_2bb607c28987c35955d2bec8683710f7b00faa61ed0fb51525cf746070326854";

export default function SyndraProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={SYNDRA_PROGRESSION_SET_ID} />
    </div>
  );
}
