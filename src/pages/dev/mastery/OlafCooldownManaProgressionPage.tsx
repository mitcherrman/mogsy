/**
 * Gated dev route: live Olaf cooldown / mana Mastery player (first combined
 * cooldown + resource set).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the SAME backend-driven MasteryPlayerLive container as every
 * other Mastery set — no cooldown- or mana-specific player exists.
 *
 * Where the Lux and Jarvan cooldown sets taught ability haste on rank-varying
 * cooldowns, this contrasts Olaf's FLAT 9-second Undertow with Reckless Swing's
 * 11/10/9/8/7 rank fall, and adds mana as a real budget: Undertow's rising cost
 * against a level-scaled mana pool drives casts-before-OOM questions whose
 * inputs are all visible on screen. Caulfield's Warhammer (+20 attack damage,
 * +10 ability haste) is the same certified item the Jarvan set introduced.
 *
 * Registered non-default and addressable only through this explicit route; the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned Olaf cooldown/mana set id (registry.py _EXPECTED_OLAF_CDMANA_SET_ID).
const OLAF_COOLDOWN_MANA_SET_ID =
  "mset_5216fd2f6956b5ae5f76cf036fd63439f59c2c9b867fa96fe49cd46298d14bb5";

export default function OlafCooldownManaProgressionPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={OLAF_COOLDOWN_MANA_SET_ID} />
    </div>
  );
}
