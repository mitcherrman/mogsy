/**
 * Format registry for the quiz screenshot factory.
 *
 * Social formats render a composition shell (safe-area padding, centered
 * content column) around the real quiz components at the exact platform
 * pixel size. Audit formats render the harness page as a normal responsive
 * page at a device viewport — no artificial resizing of a social card.
 */
import type { RenderFormat } from "./types";

const F = (
  key: string,
  width: number,
  height: number,
  kind: RenderFormat["kind"],
  contentMaxWidth: number,
  safeAreaPadding: number,
  description: string,
): RenderFormat => ({ key, width, height, kind, contentMaxWidth, safeAreaPadding, description });

export const RENDER_FORMATS: readonly RenderFormat[] = [
  F("vertical", 1080, 1920, "social", 880, 96, "TikTok / Shorts / Reels 9:16"),
  F("portrait", 1080, 1350, "social", 880, 80, "Instagram feed portrait 4:5"),
  F("square", 1080, 1080, "social", 880, 72, "Instagram / X square 1:1"),
  F("landscape", 1200, 675, "social", 640, 48, "X / link-card landscape 16:9"),
  F("broadcast", 1920, 1080, "social", 760, 64, "Broadcast overlay 16:9"),
  F("mobile-audit", 390, 844, "audit", 390, 0, "iPhone-class responsive audit"),
  F("desktop-audit", 1440, 900, "audit", 1440, 0, "Desktop responsive audit"),
] as const;

export const FORMAT_KEYS = RENDER_FORMATS.map((f) => f.key);

export function getFormat(key: string): RenderFormat | undefined {
  return RENDER_FORMATS.find((f) => f.key === key);
}

/** Strict CSV parser: rejects unknown or duplicate format keys. */
export function parseFormats(csv: string): RenderFormat[] {
  const keys = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!keys.length) throw new Error("No formats given");
  const seen = new Set<string>();
  return keys.map((key) => {
    if (seen.has(key)) throw new Error(`Duplicate format "${key}"`);
    seen.add(key);
    const f = getFormat(key);
    if (!f) throw new Error(`Unknown format "${key}". Valid formats: ${FORMAT_KEYS.join(", ")}`);
    return f;
  });
}
