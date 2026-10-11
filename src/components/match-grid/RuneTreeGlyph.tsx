/**
 * Seal faces for the five rune trees: engraved monoline marks in the Academy's
 * hand. Decorative identity for a group whose NAME is always printed beside
 * it — never a gameplay property, never a hint about which runes it takes.
 * Keyed by the public `glyph` string the rune adapter puts on each group.
 */
/**
 * Each seal face's hue, keyed by the same public `glyph`. Presentation only:
 * a tree's colour is its own public identity, never a hint about membership.
 */
export const RUNE_TREE_HUE: Readonly<Record<string, number>> = {
  precision: 44, domination: 356, sorcery: 252, resolve: 142, inspiration: 186,
};

const COMMON = { fill: "none", stroke: "currentColor", strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function RuneTreeGlyph({ glyph }: { glyph: string | null | undefined }) {
  switch (glyph) {
    case "precision":
      // A drawn blade: tall point, crossguard, pommel ring.
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path {...COMMON} d="M32 6 L38 20 L32 50 L26 20 Z" />
          <path {...COMMON} d="M18 36 H46" />
          <circle {...COMMON} cx="32" cy="56" r="3.5" />
        </svg>
      );
    case "domination":
      // Three descending strikes meeting at a point.
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path {...COMMON} d="M14 12 L32 54 L50 12" />
          <path {...COMMON} d="M32 10 V34" />
          <path {...COMMON} d="M22 44 H42" strokeWidth={2.2} />
        </svg>
      );
    case "sorcery":
      // A crescent with a trailing comet.
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path {...COMMON} d="M40 10 A20 20 0 1 0 54 40 A15 15 0 1 1 40 10 Z" />
          <path {...COMMON} d="M46 14 L58 6" strokeWidth={2.4} />
          <circle fill="currentColor" cx="47" cy="19" r="2.2" />
        </svg>
      );
    case "resolve":
      // A keystone arch over a planted post.
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path {...COMMON} d="M14 30 A18 18 0 0 1 50 30 V52 H14 Z" />
          <path {...COMMON} d="M32 20 V52" strokeWidth={2.4} />
          <path {...COMMON} d="M22 40 H42" strokeWidth={2.2} />
        </svg>
      );
    case "inspiration":
      // An hourglass with a lit spark at its waist.
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path {...COMMON} d="M18 10 H46 L26 32 L46 54 H18 L38 32 Z" />
          <circle fill="currentColor" cx="32" cy="32" r="2.6" />
        </svg>
      );
    default:
      return null;
  }
}
