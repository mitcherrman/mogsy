/**
 * Gated dev route: live Jarvan IV objective-progression Mastery player (first
 * PHYSICAL / attack-damage champion).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no champion-specific player exists. Jarvan is a linear
 * replayable physical set (Dragon Strike / Cataclysm) that scales on bonus attack
 * damage and is mitigated by target ARMOR, proving the shared generator + player
 * generalize to physical damage and the AD model.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Jarvan prototype set id (mastery/publication/registry.py _EXPECTED_JARVAN_SET_ID).
const JARVAN_PROGRESSION_SET_ID =
  "mset_435999de21f08d74884a374e8f74afe94837898c4d92f84f108ffa63973ca005";

export default function JarvanProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={JARVAN_PROGRESSION_SET_ID} />
    </div>
  );
}
