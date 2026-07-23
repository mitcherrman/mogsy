/**
 * Gated dev route: live Lux ability-haste / cooldown Mastery player (first
 * COOLDOWN-focused set).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no cooldown-specific player exists.
 *
 * Every other retained set teaches damage; this one teaches how often an ability
 * is actually available. Ability haste here is real rather than hypothetical: the
 * journey buys Fiendish Codex (10 ability haste), so the haste driving each
 * cooldown answer is visible in the state panel.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Lux cooldown set id (mastery/publication/registry.py _EXPECTED_LUX_CD_SET_ID).
const LUX_COOLDOWN_SET_ID =
  "mset_2f02e445523e415103c2d7e27524fac596e169d93f665369a8383407f0b57d14";

export default function LuxCooldownProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={LUX_COOLDOWN_SET_ID} />
    </div>
  );
}
