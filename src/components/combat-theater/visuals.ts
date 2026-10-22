/**
 * Shared, component-free display constants and geometry helpers for the
 * theater (kept out of the component files so React Fast Refresh stays
 * whole-module).
 */
import {
  getChampionIcon,
  getChampionLoading,
  getChampionSplash,
  type ChampionManifest,
} from "@/hooks/useChampionAssets";
import { getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";
import type { DamageType, TheaterScript } from "@/lib/combat-theater/theater";

export const DAMAGE_TYPE_VAR: Record<DamageType, string> = {
  physical: "var(--ct-phys)",
  magic: "var(--ct-magic)",
  true: "var(--ct-true)",
  unknown: "var(--ct-ink-dim)",
};

export const DAMAGE_TYPE_LABEL: Record<DamageType, string> = {
  physical: "physical",
  magic: "magic",
  true: "true",
  unknown: "damage",
};

export type Anchor = { x: number; y: number };

/**
 * Percent-of-stage anchor for a combatant's portrait (display geometry only).
 * This is the FALLBACK used before the portraits have been measured (and in
 * jsdom, where every rect is zero); once mounted, `TheaterStage` measures the
 * real portrait boxes and uses those instead.
 */
export function anchorFor(script: TheaterScript, id: string | null): Anchor | null {
  if (!id) return null;
  const c = script.combatants.find((k) => k.id === id);
  if (!c) return null;
  const group = c.side === "left" ? script.left : script.right;
  const n = Math.max(1, group.length);
  const k = group.findIndex((g) => g.id === id);
  const inner = 2 + (k + 0.5) * (40 / n);
  return { x: c.side === "left" ? inner : 100 - inner, y: 46 };
}

/** portrait: loading art → splash → icon. Null when nothing resolves. */
export function resolvePortraitUrl(manifest: ChampionManifest | null, champion: string): string | null {
  return getChampionLoading(manifest, champion) ?? getChampionSplash(manifest, champion) ?? getChampionIcon(manifest, champion);
}

/** icon: manifest icon → ability-icon store square icon. */
export function resolveIconUrl(manifest: ChampionManifest | null, champion: string): string | null {
  return getChampionIcon(manifest, champion) ?? getChampionSquareIconUrl(champion);
}
