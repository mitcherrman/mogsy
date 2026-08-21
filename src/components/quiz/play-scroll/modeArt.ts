/**
 * PLAY1 — the miniature painted beside each clause of the match-entry record.
 *
 * An illuminated manuscript does not label its entries with icons; it paints a
 * MINIATURE beside them — a small framed picture that tells you what the
 * passage is about before you have read a word. The three mode cards do the
 * same, and these are the three pictures.
 *
 * THE ART IS SUPPLIED, NOT GENERATED. All three files are the owner's, live
 * under `public/assets/ranked/`, and are referenced root-absolute the way
 * every other Ranked asset in this app is (`--lc-parchment`, `--lc-seal-art`).
 * Nothing here substitutes an icon for a missing file: `onError` hides the
 * plate's picture and leaves the frame, so a card degrades to a ruled entry
 * rather than to a broken-image glyph.
 *
 * TWO KINDS OF PICTURE, AND WHY THE `fit` FIELD EXISTS
 * ────────────────────────────────────────────────────
 * The three files are not the same kind of image, and treating them as one
 * would waste two of them:
 *
 *   ranked.png   A full-bleed splash — Baron Nashor, opaque RGB, dark teal
 *                and green corner to corner. It has no transparency, so it
 *                must be CROPPED into its frame (`cover`) and married to the
 *                parchment by the plate's vignette and warm grade. This is
 *                the heaviest object on the sheet, which is the intent:
 *                Ranked is the dominant choice.
 *
 *   DC.png       A cut-out with a baked warm radial glow — Lee Sin, seated,
 *                blindfolded, hands clasped. Focus and study rather than a
 *                duel.
 *
 *   invite.png   A cut-out with a baked cool radial glow — a poro-ish
 *                creature with a question mark over it. An invitation, asked
 *                rather than declared.
 *
 * The two cut-outs already carry their own halo, so they are `contain`, are
 * inset from the frame, and are allowed to sit ON the parchment rather than
 * be cropped by it. Cropping a cut-out would clip the halo into a hard square
 * and lose the one thing that makes it read as painted onto the page.
 *
 * ACCENT IS NOT HERE. Which colour a card's ornament takes is a presentation
 * decision keyed off `data-mode` in `index.css` — see the PLAY1 MODE CARD
 * block there — so a retune of the three accents is one stylesheet edit and
 * touches no component.
 */

import type { PlayModeId } from "@/lib/quiz/playModes";

export interface PlayModeArt {
  /** Root-absolute, as every other Ranked asset is referenced. */
  readonly src: string;
  /**
   * `cover` crops a full-bleed painting into the frame; `contain` insets a
   * cut-out so its own glow stays whole. See above.
   */
  readonly fit: "cover" | "contain";
}

export const PLAY_MODE_ART: Record<PlayModeId, PlayModeArt> = {
  ranked: { src: "/assets/ranked/ranked.png", fit: "cover" },
  daily: { src: "/assets/ranked/DC.png", fit: "contain" },
  invite: { src: "/assets/ranked/invite.png", fit: "contain" },
};
