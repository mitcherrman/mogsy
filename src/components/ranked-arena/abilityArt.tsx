/**
 * RA10 — presentation-only ability iconography for the Ranked hotbar.
 *
 * A local art registry keyed by backend ability id, so the AbilityTray never
 * hardcodes visuals: it asks this module for a glyph and renders whatever
 * comes back. Unknown ids (any future class or boss roster) fall back to a
 * neutral academy sigil rather than an empty slot, which keeps the tray
 * roster-neutral.
 *
 * The glyphs are hand-drawn inline SVG in the Mogzy Academy language —
 * heraldry, wards, tomes and combat theory, not League spell art. They stroke
 * in `currentColor` so the slot's state styling (available / armed / locked /
 * spent) tints the art with no per-state assets.
 */

interface GlyphProps {
  className?: string;
}

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Heraldic shield with a rising chevron — Fortify. */
function FortifyGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M12 3 L19 5.5 V11.5 C19 16 16.2 19.4 12 21 C7.8 19.4 5 16 5 11.5 V5.5 Z" />
      <path d="M8.6 12.2 L12 9.2 L15.4 12.2" />
      <path d="M8.6 15.6 L12 12.6 L15.4 15.6" />
    </svg>
  );
}

/** Open warding tome with a rune — Brace (study and preparation). */
function BraceGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M12 6.2 C10.1 5 7.6 4.7 5 5.2 V17.6 C7.6 17.1 10.1 17.4 12 18.6 C13.9 17.4 16.4 17.1 19 17.6 V5.2 C16.4 4.7 13.9 5 12 6.2 Z" />
      <path d="M12 6.2 V18.6" />
      <path d="M8.4 9.9 L9.7 11.2 L8.4 12.5 L7.1 11.2 Z" />
      <path d="M14.8 10.4 H16.8 M14.8 12.4 H16.8" />
    </svg>
  );
}

/** Protective ward dome over a keystone — Barrier. */
function BarrierGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M5 14.6 A7 7 0 0 1 19 14.6" />
      <path d="M3.8 17.6 H20.2" />
      <path d="M12 4.1 V5.9" />
      <path d="M12 10.4 L13.4 11.9 L12 13.4 L10.6 11.9 Z" />
    </svg>
  );
}

/** Charged orb with an orbit spark — Arcane Charge. */
function ArcaneChargeGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <circle cx="11.4" cy="13.4" r="4.2" />
      <path d="M5.4 17.2 A7.4 7.4 0 0 0 18.2 15" />
      <path d="M16.8 4.6 L17.5 6.1 L19 6.8 L17.5 7.5 L16.8 9 L16.1 7.5 L14.6 6.8 L16.1 6.1 Z" />
    </svg>
  );
}

/** Radiant overloaded orb — Overload. */
function OverloadGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <circle cx="12" cy="12" r="3.7" />
      <path d="M12 3.4 V6 M12 18 V20.6 M3.4 12 H6 M18 12 H20.6" />
      <path d="M6 6 L7.8 7.8 M16.2 16.2 L18 18 M18 6 L16.2 7.8 M7.8 16.2 L6 18" />
    </svg>
  );
}

/** Scholar's eye — Insight. */
function InsightGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M3.6 12 C6.1 8.1 9 6.5 12 6.5 C15 6.5 17.9 8.1 20.4 12 C17.9 15.9 15 17.5 12 17.5 C9 17.5 6.1 15.9 3.6 12 Z" />
      <path d="M12 9.7 L13.9 12 L12 14.3 L10.1 12 Z" />
    </svg>
  );
}

/** Hourglass with pace lines — Tempo. */
function TempoGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M9 4.6 H17 L13 11.4 Z" />
      <path d="M9 19.4 H17 L13 12.6 Z" />
      <path d="M4 8 H6.2 M3.2 12 H5.4 M4 16 H6.2" />
    </svg>
  );
}

/** A volley of three arrows — Suppressing Fire. */
function SuppressingFireGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M7 20 V8.4 M7 8.4 L5.2 10.6 M7 8.4 L8.8 10.6" />
      <path d="M12 19 V5.4 M12 5.4 L10.2 7.6 M12 5.4 L13.8 7.6" />
      <path d="M17 20 V8.4 M17 8.4 L15.2 10.6 M17 8.4 L18.8 10.6" />
    </svg>
  );
}

/** Marksman's ringed sight — Focus. */
function FocusGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <circle cx="12" cy="12" r="6.6" />
      <circle cx="12" cy="12" r="2.9" />
      <path d="M12 2.6 V4.8 M12 19.2 V21.4 M2.6 12 H4.8 M19.2 12 H21.4" />
    </svg>
  );
}

/** Restrained empty-slot mark for the explicit no-ability choice. */
function ClearGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <circle cx="12" cy="12" r="6.8" />
      <path d="M7.8 16.2 L16.2 7.8" />
    </svg>
  );
}

/** Neutral academy sigil for ids this registry does not know. */
function SigilGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...S}>
      <path d="M12 4 L19 12 L12 20 L5 12 Z" />
      <path d="M12 9.4 L14.4 12 L12 14.6 L9.6 12 Z" />
    </svg>
  );
}

type AbilityGlyph = (props: GlyphProps) => React.JSX.Element;

const ABILITY_GLYPHS: Record<string, AbilityGlyph> = {
  "tank.fortify": FortifyGlyph,
  "tank.brace": BraceGlyph,
  "tank.barrier": BarrierGlyph,
  "mage.arcane_charge": ArcaneChargeGlyph,
  "mage.overload": OverloadGlyph,
  "mage.insight": InsightGlyph,
  "marksman.tempo": TempoGlyph,
  "marksman.suppressing_fire": SuppressingFireGlyph,
  "marksman.focus": FocusGlyph,
};

/** Glyph for a backend ability id; unknown ids get the neutral sigil. */
export function abilityGlyphFor(abilityId: string): AbilityGlyph {
  return ABILITY_GLYPHS[abilityId] ?? SigilGlyph;
}

/**
 * RA11 — resting art-tile treatment per ability FAMILY (the id's dot-prefix),
 * so each class's slots carry a quiet identity tint inside the shared spine
 * dock. Complete class strings (Tailwind JIT needs literals). Unknown
 * families fall back to the neutral navy tile, keeping the tray
 * roster-neutral; the armed state overrides all of these with brass.
 */
const FAMILY_TILE_ACCENTS: Record<string, string> = {
  tank: "bg-gradient-to-b from-[#173349] to-[#0a1a2a] text-[#a8d4e8]",
  mage: "bg-gradient-to-b from-[#2d1f4a] to-[#150f26] text-[#c7b3ee]",
  marksman: "bg-gradient-to-b from-[#3f2a12] to-[#1d1206] text-[#e9ca8d]",
};
const NEUTRAL_TILE_ACCENT = "bg-gradient-to-b from-[#16283f] to-[#0a1626] text-[#d8c58e]";

/** Resting tile classes for a backend ability id (family-derived). */
export function abilityTileAccentFor(abilityId: string): string {
  const family = abilityId.split(".")[0] ?? "";
  return FAMILY_TILE_ACCENTS[family] ?? NEUTRAL_TILE_ACCENT;
}

/** Glyph for the explicit no-ability slot. */
export const clearAbilityGlyph: AbilityGlyph = ClearGlyph;
