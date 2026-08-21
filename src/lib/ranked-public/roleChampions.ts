/**
 * MALT — the League ANCHOR for each Ranked role: one champion per role.
 *
 * WHY THIS IS NOT IN `roles.ts`
 * ─────────────────────────────
 * The canonical role module states, in its own words, that there is
 * deliberately no mapping there between a role and anything else, in either
 * direction, so a reader looking for one finds nothing. That guarantee is
 * about GAMEPLAY meaning, and it stays exactly as it is. This module is a
 * separate, purely COSMETIC lookup that lives beside it rather than inside it,
 * so the two can never be mistaken for each other.
 *
 * WHAT THIS MAP IS
 * ────────────────
 * A picture. One recognisable League champion stands as the visual anchor for
 * each role on the lobby's role stage, so the parchment carries something from
 * the actual game beside the Mogzy mascot.
 *
 * WHAT THIS MAP IS NOT
 * ────────────────────
 * It is NOT a recommendation, NOT a restriction, and NOT a claim about what an
 * account plays. Nothing here reaches the queue, the arena, the question
 * sampler or any write. A role's champion changes nothing about a match.
 *
 * ART HONESTY
 * ───────────
 * The paths are backend-relative and resolve through the same `/assets` mount
 * every other champion image on the site uses; the directory names are the
 * canonical capitalised champion folders (`Darius`, not `darius`) because
 * macOS resolves the wrong case locally and Linux 404s on it in production.
 * The icon is decorative: the ROLE's own name is still rendered as text
 * wherever this is drawn, so identity never depends on the portrait.
 */
import type { RankedRole } from "@/lib/ranked-public/roles";

export interface RankedRoleChampion {
  /** Display name, for an accessible name and for `data-` attributes. */
  name: string;
  /** Backend-relative icon path. Resolve before use — never an `<img src>`. */
  iconPath: string;
}

export const RANKED_ROLE_CHAMPIONS: Record<RankedRole, RankedRoleChampion> = {
  top: { name: "Darius", iconPath: "assets/champions/Darius/icon.png" },
  jungle: { name: "Qiyana", iconPath: "assets/champions/Qiyana/icon.png" },
  mid: { name: "Ryze", iconPath: "assets/champions/Ryze/icon.png" },
  adc: { name: "Ashe", iconPath: "assets/champions/Ashe/icon.png" },
  support: { name: "Braum", iconPath: "assets/champions/Braum/icon.png" },
};

export function getRankedRoleChampion(role: RankedRole): RankedRoleChampion {
  return RANKED_ROLE_CHAMPIONS[role];
}
