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
  contentScale: number,
  cta: RenderFormat["cta"],
  description: string,
): RenderFormat => ({
  key, width, height, kind, contentMaxWidth, safeAreaPadding, contentScale, cta, description,
});

export const RENDER_FORMATS: readonly RenderFormat[] = [
  // Primary content format: mobile-first 4:5 portrait — the strongest single
  // static-post shape across X / Instagram / Facebook / Reddit.
  F("mobile-social", 1080, 1350, "social", 960, 48, 2.15, "full", "Mobile-social portrait 4:5 (default content format)"),
  F("vertical", 1080, 1920, "social", 960, 72, 2.25, "full", "TikTok / Shorts / Reels 9:16"),
  F("portrait", 1080, 1350, "social", 920, 64, 2.05, "full", "Instagram feed portrait 4:5"),
  F("square", 1080, 1080, "social", 920, 56, 1.9, "compact", "Instagram / X square 1:1"),
  F("landscape", 1200, 675, "social", 680, 40, 1.35, "compact", "X / link-card landscape 16:9"),
  F("broadcast", 1920, 1080, "social", 820, 56, 1.75, "compact", "Broadcast overlay 16:9"),
  F("mobile-audit", 390, 844, "audit", 390, 0, 1, "none", "iPhone-class responsive audit"),
  F("desktop-audit", 1440, 900, "audit", 1440, 0, 1, "none", "Desktop responsive audit"),
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
