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

// Pinned prototype set id (mastery/publication/registry.py _EXPECTED_SYNDRA_SET_ID).
const SYNDRA_PROGRESSION_SET_ID =
  "mset_25a343e48ce9a53ba2d49fab6c2e5ccede01eb2507c5b68138ad331f1c6dbe78";

export default function SyndraProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={SYNDRA_PROGRESSION_SET_ID} />
    </div>
  );
}
