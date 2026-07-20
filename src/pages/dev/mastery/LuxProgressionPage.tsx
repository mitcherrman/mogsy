/**
 * Gated dev route: live Lux objective-progression Mastery player (second champion).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no champion-specific player exists. Lux is a linear
 * replayable set (Light Binding / Lucent Singularity / Final Spark), proving the
 * shared generator + player generalize to a second certified champion.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Lux prototype set id (mastery/publication/registry.py _EXPECTED_LUX_SET_ID).
const LUX_PROGRESSION_SET_ID =
  "mset_fe14174267bf7b0183b74fc07b042ffc9550b59d2fd96879f7b7a4deaec09827";

export default function LuxProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={LUX_PROGRESSION_SET_ID} />
    </div>
  );
}
