/**
 * Format registry for the quiz screenshot factory — ONE preset authority.
 *
 * Admin's format picker, the CLI parser and the render shell all read this
 * list; CON1 Step 4 deliberately extended it rather than adding a second
 * registry beside it.
 *
 * Each social format now declares the COMPOSITION it wants (`layoutFamily`)
 * and where its brand chrome sits (`ctaPlacement`), instead of every format
 * inheriting one portrait device shell. That single shell is what made
 * `landscape` publish a 334px card inside a 1200px frame: the shape of the
 * output was decided by the shell, and the format only got to pick a zoom. A
 * format that wants a horizontal composition now says so.
 *
 * Audit formats are unchanged: they render the harness page as a normal
 * responsive page at a device viewport — no social composition at all.
 */
import type { CtaPlacement, LayoutFamily, RenderFormat } from "./types";

const F = (
  key: string,
  width: number,
  height: number,
  kind: RenderFormat["kind"],
  contentMaxWidth: number,
  safeAreaPadding: number,
  contentScale: number,
  cta: RenderFormat["cta"],
  layoutFamily: LayoutFamily,
  ctaPlacement: CtaPlacement,
  description: string,
): RenderFormat => ({
  key, width, height, kind, contentMaxWidth, safeAreaPadding, contentScale, cta,
  layoutFamily, ctaPlacement, description,
});

export const RENDER_FORMATS: readonly RenderFormat[] = [
  // Primary content format: mobile-first 4:5 portrait — the strongest single
  // static-post shape across X / Instagram / Facebook / Reddit.
  F("mobile-social", 1080, 1350, "social", 980, 48, 2.25, "full", "portrait", "stacked", "Mobile-social portrait 4:5 (default content format)"),
  F("vertical", 1080, 1920, "social", 980, 72, 2.35, "full", "portrait", "stacked", "TikTok / Shorts / Reels 9:16"),
  F("portrait", 1080, 1350, "social", 960, 64, 2.2, "full", "portrait", "stacked", "Instagram feed portrait 4:5"),
  // 1:1 has the least vertical slack of any content format, so it keeps the
  // stacked column but with the tightest chrome — that, not a smaller zoom, is
  // what stops the reveal/explanation card from reaching the footer.
  F("square", 1080, 1080, "social", 960, 48, 2.15, "compact", "square", "stacked", "Instagram / X square 1:1"),
  // A genuinely horizontal composition: a narrow brand rail and a folio that
  // takes the whole remaining width AND the full frame height. The content
  // column is wide because the card is the post — at Reddit/X feed scale a
  // centred phone screenshot is unreadable.
  F("landscape", 1200, 675, "social", 830, 36, 1.98, "compact", "landscape", "rail", "X / Reddit / link-card landscape 16:9"),
  F("broadcast", 1920, 1080, "social", 1340, 56, 3.2, "compact", "landscape", "rail", "Broadcast overlay 16:9"),
  F("mobile-audit", 390, 844, "audit", 390, 0, 1, "none", "portrait", "none", "iPhone-class responsive audit"),
  F("desktop-audit", 1440, 900, "audit", 1440, 0, 1, "none", "portrait", "none", "Desktop responsive audit"),
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
