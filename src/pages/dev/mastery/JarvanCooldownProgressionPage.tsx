/**
 * Gated dev route: live Jarvan IV ability-haste / cooldown Mastery player (first
 * AD cooldown set).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no cooldown-specific player exists.
 *
 * Where the Lux cooldown set taught ability haste on an AP champion with Fiendish
 * Codex, this teaches it on an attack-damage champion with Caulfield's Warhammer
 * (+20 attack damage, +10 ability haste). The haste is real and item-derived, so
 * it is visible in the state panel and each cooldown answer is derivable on screen.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Jarvan cooldown set id (registry.py _EXPECTED_JARVAN_CD_SET_ID).
const JARVAN_COOLDOWN_SET_ID =
  "mset_033c4c8593883d477da3e788890770bb02bf1c12cef190bc51e8d48743f4130f";

export default function JarvanCooldownProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={JARVAN_COOLDOWN_SET_ID} />
    </div>
  );
}
