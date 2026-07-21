/**
 * Gated dev route: live Maokai objective-progression Mastery player (first
 * TARGET-HEALTH-SCALING champion).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no champion-specific player exists. Maokai's Bramble Smash
 * deals base damage plus a certified percent of the target's MAXIMUM health, so
 * the set demonstrates that percent-of-maximum-health damage does not shrink as
 * the target's current health drops.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Maokai prototype set id (mastery/publication/registry.py _EXPECTED_MAOKAI_SET_ID).
const MAOKAI_PROGRESSION_SET_ID =
  "mset_d7456fd4fe2f1c54a10547baa592beec63f69a10849b3d1bc3bf90f719673f8c";

export default function MaokaiProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={MAOKAI_PROGRESSION_SET_ID} />
    </div>
  );
}
