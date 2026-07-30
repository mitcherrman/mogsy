/**
 * Resolve Mogzy's stored champion ability icons for the Combat Lab.
 *
 * The images are the ones the Combat API already serves out of its champion
 * asset store (`/assets/champions/...`); `CHAMPION_ABILITY_ICON_FILES` records
 * the real directory and Riot spell key per slot because neither is derivable
 * from the champion name and the asset manifest does not list them. Nothing
 * here fabricates artwork: an unknown champion or slot resolves to `null` and
 * the caller falls back to a glyph.
 */
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import type { AbilityButtonTone } from "@/components/combat-lab/AbilityButton";
import {
  CHAMPION_ABILITY_ICON_FILES,
  type CastableAbilitySlot,
} from "@/data/championAbilityIcons";

export type AbilitySlot = "P" | CastableAbilitySlot;

/** Maps an ability slot to its accent tone; anything else stays neutral. */
export function toneForSlot(slot?: string | null): AbilityButtonTone {
  switch ((slot ?? "").toUpperCase()) {
    case "Q":
      return "q";
    case "W":
      return "w";
    case "E":
      return "e";
    case "R":
      return "r";
    default:
      return "neutral";
  }
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Champion names reach the Combat Lab from several places (`/api/meta/champions`,
 * a persisted config, a runtime payload) with inconsistent punctuation, so keys
 * are matched on their alphanumeric form.
 */
const BY_NORMALIZED_NAME: Record<string, string> = Object.fromEntries(
  Object.keys(CHAMPION_ABILITY_ICON_FILES).map((name) => [normalize(name), name]),
);

function entryFor(champion?: string | null) {
  if (!champion) return null;
  const key = BY_NORMALIZED_NAME[normalize(champion)];
  return key ? CHAMPION_ABILITY_ICON_FILES[key] : null;
}

/**
 * URL of the stored icon for one ability slot, or `null` when this champion has
 * no ability art in the asset store.
 */
export function getAbilityIconUrl(
  champion: string | undefined | null,
  slot: AbilitySlot,
): string | null {
  const entry = entryFor(champion);
  if (!entry) return null;
  const file = slot === "P" ? "passive.png" : `${slot}_${entry[slot]}.png`;
  return resolveAssetUrl(`assets/champions/${entry.folder}/${file}`);
}

/** URL of the champion's square portrait icon — the fallback art for a sub-action. */
export function getChampionSquareIconUrl(champion: string | undefined | null): string | null {
  const entry = entryFor(champion);
  return entry ? resolveAssetUrl(`assets/champions/${entry.folder}/icon.png`) : null;
}

/**
 * Slot hints for the champion-specific runtime actions whose id and label carry
 * no slot token (`/api/meta/combat-lab-actions`). Only unambiguous parent
 * abilities are listed — anything else keeps the champion icon rather than
 * borrowing another ability's art.
 */
const ACTION_SLOT_HINTS: Record<string, CastableAbilitySlot> = {
  varus_blight: "W", // Blighted Quiver
  kalista_rend: "E", // Rend
  katarina_death_lotus: "R", // Death Lotus
  zeri_burst_fire: "Q", // Burst Fire
  aphelios_moonlight_vigil: "R", // Moonlight Vigil
  sylas_hijack: "R", // Hijack
  sylas_cast_hijacked_ultimate: "R", // Hijack
};

/**
 * Leading slot token of a variant label — `"QQ - Devastating Fire"` → `"QQ"`,
 * `"Q1 Sweetspot"` → `"Q1"`, `"R - Spiraling Despair"` → `"R"`. Returns null for
 * plain names like `"Rend"`, whose leading letter is coincidental.
 */
export function abilityVariantToken(label?: string | null): string | null {
  const m = /^([QWER][0-9QWER]*)\b/.exec((label ?? "").trim().toUpperCase());
  return m ? m[1] : null;
}

/**
 * Parent ability slot behind a runtime action, inferred from its label token,
 * then its id suffix (`aphelios_q`, `aatrox_q1_sweetspot`, `hwei_qw`), then the
 * curated hints above. Null means "no confident parent" — never a guess.
 */
export function inferActionAbilitySlot(
  actionId?: string | null,
  label?: string | null,
): CastableAbilitySlot | null {
  const token = abilityVariantToken(label);
  if (token) return token[0] as CastableAbilitySlot;

  const id = (actionId ?? "").trim();
  if (id) {
    // `<champion>_q`, `<champion>_q1`, `<champion>_q1_sweetspot`
    const suffix = /(?:^|_)([qwer])(?:\d+)?(?:_[a-z0-9]+)*$/i.exec(id);
    if (suffix) return suffix[1].toUpperCase() as CastableAbilitySlot;
    // Hwei's two-key casts: `hwei_qw` reads as a Q-subject cast.
    const paired = /(?:^|_)([qwer])[qwer]$/i.exec(id);
    if (paired) return paired[1].toUpperCase() as CastableAbilitySlot;
    const hint = ACTION_SLOT_HINTS[id.toLowerCase()];
    if (hint) return hint;
  }
  return null;
}
