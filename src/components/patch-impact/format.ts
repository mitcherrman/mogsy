/**
 * Patch Impact formatting and copy. Presentation only: every number arrives
 * already computed by the domain layer, unrounded, and is only rounded here for
 * display (the domain README: "Formatting belongs to the UI layer").
 *
 * Copy rule: Impact describes parameters and projected base stats. It never says
 * "power", "stronger", "weaker", "buff" or "nerf" (a test enforces it).
 */
import type { ImpactFamily, ImpactHalf, ParameterFact } from "@/lib/patch-impact/types";

/** U+2212, the real minus sign, not a hyphen. */
export const MINUS = "−";

function trimFixed(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/**
 * Round for display. A real, non-zero value that would round to zero is shown
 * with one more decimal rather than as a misleading "0".
 */
export function formatImpactNumber(
  value: number,
  maxDecimals: number,
  { signed = false }: { signed?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  let text = trimFixed(abs, maxDecimals);
  if (Number(text) === 0 && abs > 1e-9) text = trimFixed(abs, maxDecimals + 1);
  if (Number(text) === 0) return "0";
  if (value < 0) return `${MINUS}${text}`;
  return signed ? `+${text}` : text;
}

/** A projected base stat at a level: at most one decimal, trailing ".0" trimmed. */
export const formatStatValue = (value: number): string => formatImpactNumber(value, 1);

/** A Riot parameter value, as published (growth values carry two or three decimals). */
export function formatParameterValue(value: number, unit: ParameterFact["unit"]): string {
  const text = formatImpactNumber(value, 3);
  return unit === "percent_points" ? `${text}%` : text;
}

/** Absolute difference. Attack-speed growth is in percentage points. */
export function formatDelta(
  delta: number,
  unit: ParameterFact["unit"],
  kind: "parameter" | "projected",
): string {
  const text = formatImpactNumber(delta, kind === "parameter" ? 3 : 1, { signed: true });
  return unit === "percent_points" ? `${text} pts` : text;
}

/** Relative difference as a signed percentage; `null` when it is not defined. */
export function formatRelative(rel: number | null): string | null {
  if (rel === null || !Number.isFinite(rel)) return null;
  return `${formatImpactNumber(rel * 100, 1, { signed: true })}%`;
}

const FAMILY_NAME: Record<ImpactFamily, string> = {
  health: "health",
  ad: "AD",
  armor: "armor",
  mr: "MR",
  mana: "mana",
  attack_speed: "attack speed",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The parameter's own name: "Armor growth", "Base AD". Never a generic "power". */
export function parameterLabel(family: ImpactFamily, half: ImpactHalf): string {
  const name = FAMILY_NAME[family];
  return half === "base" ? `Base ${name}` : `${capitalize(name)} growth`;
}

/** What a projection is of: "base AD" (the champion's base stat, before items and runes). */
export function projectedStatLabel(family: ImpactFamily): string {
  return `base ${FAMILY_NAME[family]}`;
}
