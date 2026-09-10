/**
 * The Combat Lab champion deep-link — Matchup Explorer Step 10.
 *
 * WHAT THIS IS. Combat Lab has always held its champion selection in
 * localStorage and nothing else: the attacker is `config.champion`
 * (`combat-lab:last-config`) and the defender is
 * `targetSetup.targetChampionName` (`combat-lab:target-setup`). That is fine
 * for a returning theorycrafter and useless as a destination — a link could
 * name the page but not the matchup. This module is the narrow contract that
 * lets ONE page ask Combat Lab to open on two named champions:
 *
 *     /combat-lab?attacker=olaf&defender=ksante
 *
 * IT SAYS WHICH CHAMPIONS, AND NOTHING ELSE. No level, no items, no runes, no
 * ability ranks, no sequence, no target profile — Combat Lab's own defaults
 * (and whatever the reader last configured) survive untouched. The claim the
 * link makes is "compare these two champions mechanically", NOT "recreate the
 * game they were in". Pro Play evidence and mechanical simulation are separate
 * authorities and this link deliberately carries nothing across the seam:
 * no player, no team, no patch, no date, no build.
 *
 * THE KEY IS THE CHAMPION SLUG, NEVER THE DISPLAY STRING. Matchup Explorer
 * speaks Leaguepedia's `champion_key` ("K'Sante", "Dr. Mundo"); Combat Lab's
 * manifest is `/api/meta/champions`, which is the `champions` table verbatim
 * ("K'Sante", "Dr Mundo" — the period really does differ). Comparing those two
 * strings would silently drop a champion. `championSlug` — the mapper the
 * League Docs pages and the backend's own `champion_slug` already share —
 * collapses both spellings to `dr-mundo`, and every one of the 172 champion
 * keys in the pro corpus resolves that way, with no collisions across all 173
 * champions.
 *
 * TOTAL PARSING. Every malformed, unknown, over-long or absent value resolves
 * to "no champion requested" rather than an error: a hand-edited URL leaves
 * Combat Lab exactly as it found it.
 */
import { championSlug } from "@/lib/league-docs/api";

export const COMBAT_LAB_ROUTE = "/combat-lab";

/** The parameter names this contract owns. Stable and readable. */
export const COMBAT_LAB_PARAM = {
  attacker: "attacker",
  defender: "defender",
} as const;

/**
 * A plausible champion slug. Deliberately narrower than "any string": the
 * slugs `championSlug` produces are lowercase alphanumerics and hyphens, and
 * the longest real one ("aurelion-sol") is twelve characters. The bound exists
 * so a pasted essay never reaches a manifest scan.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 40;

function cleanSlug(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_SLUG_LENGTH) return null;
  return SLUG_PATTERN.test(trimmed) ? trimmed : null;
}

/** The two champions a Combat Lab URL asks for. Either side may be absent. */
export type CombatLabMatchup = {
  attacker: string | null;
  defender: string | null;
};

/**
 * Build the destination URL from two champion names (Explorer `champion_key`
 * values, or any spelling `championSlug` understands).
 *
 * A side that does not produce a usable slug is simply omitted — a link that
 * can only name one champion still opens Combat Lab on that one, and never
 * emits `?defender=` with nothing after it.
 */
export function buildCombatLabMatchupUrl({
  attacker,
  defender,
}: {
  attacker?: string | null;
  defender?: string | null;
}): string {
  const params = new URLSearchParams();
  // Stable parameter order: attacker, then defender. Two readers who opened
  // the same matchup share one URL.
  const a = cleanSlug(attacker ? championSlug(attacker) : null);
  if (a) params.set(COMBAT_LAB_PARAM.attacker, a);
  const d = cleanSlug(defender ? championSlug(defender) : null);
  if (d) params.set(COMBAT_LAB_PARAM.defender, d);
  const query = params.toString();
  return query ? `${COMBAT_LAB_ROUTE}?${query}` : COMBAT_LAB_ROUTE;
}

/** The exact inverse, and total: unusable values read as absent. */
export function parseCombatLabMatchup(params: URLSearchParams): CombatLabMatchup {
  return {
    attacker: cleanSlug(params.get(COMBAT_LAB_PARAM.attacker)),
    defender: cleanSlug(params.get(COMBAT_LAB_PARAM.defender)),
  };
}

/**
 * Resolve a slug against Combat Lab's own champion manifest, returning the
 * name the simulator identifies a champion by — `id ?? name`, which is the key
 * every selector, portrait and request in the page already uses.
 *
 * Returns null for an unknown slug, which is the whole failure mode: a
 * champion Combat Lab does not carry leaves the current selection alone.
 */
export function resolveCombatLabChampion(
  champions: readonly { id?: string; name: string }[],
  slug: string | null,
): string | null {
  if (!slug) return null;
  const match = champions.find((c) => championSlug(c.name) === slug);
  return match ? (match.id ?? match.name) : null;
}
