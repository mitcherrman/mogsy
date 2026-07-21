/**
 * Gated dev route: live Olaf objective-progression Mastery player (first
 * TRUE-DAMAGE champion).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no champion-specific player exists.
 *
 * Olaf is the resistance-independence proof: at level 6 the same standard tank is
 * hit by Undertow (physical, reduced by 75 armor) and by Reckless Swing (true,
 * reduced by nothing), from two independently certified formulas.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Olaf prototype set id (mastery/publication/registry.py _EXPECTED_OLAF_SET_ID).
const OLAF_PROGRESSION_SET_ID =
  "mset_8e37794840bf5544c9c351d8684e647ac3a88b58118092a61cfdd3f23c2ac9ac";

export default function OlafProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={OLAF_PROGRESSION_SET_ID} />
    </div>
  );
}
