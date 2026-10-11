/**
 * Splash art focal points (PHD1-R2). Authored by hand from the manifest's own
 * `splash/0_default.jpg` files on 2026-10-10, each read on a 10% grid; never
 * guessed at runtime. `x`/`y` are the champion's face (or the one point the
 * eye must find) as a fraction of the 1215×717 splash.
 *
 * The deck does not crop blindly around a face. It decides the CARD's
 * composition from the focal point: a champion painted right of centre gets
 * the mirrored layout (art on the right, information on the left), so the
 * face sits in the open art and the veil falls on the scene, not the subject.
 * Within the chosen side the image is then positioned so the face lands on a
 * fixed anchor of the visible art.
 *
 * A champion without an entry falls back to a centred composition; nothing
 * here invents data for art it has not seen.
 */

export type Focal = { x: number; y: number };

export const SPLASH_W = 1215;
export const SPLASH_H = 717;

export const DEFAULT_FOCAL: Focal = { x: 0.5, y: 0.3 };

/** Manifest key → focal point. Keep sorted for review. */
export const SPLASH_FOCAL: Readonly<Record<string, Focal>> = {
  Aatrox: { x: 0.74, y: 0.3 },
  Ambessa: { x: 0.51, y: 0.18 },
  Aphelios: { x: 0.58, y: 0.26 },
  Ashe: { x: 0.73, y: 0.22 },
  Aurora: { x: 0.5, y: 0.18 },
  Bard: { x: 0.58, y: 0.32 },
  "Bel'Veth": { x: 0.46, y: 0.22 },
  Cassiopeia: { x: 0.62, y: 0.3 },
  Diana: { x: 0.68, y: 0.3 },
  "Dr Mundo": { x: 0.48, y: 0.2 },
  Draven: { x: 0.74, y: 0.3 },
  Elise: { x: 0.64, y: 0.22 },
  Ezreal: { x: 0.7, y: 0.2 },
  Fiora: { x: 0.6, y: 0.16 },
  Garen: { x: 0.8, y: 0.32 },
  "K'Sante": { x: 0.33, y: 0.18 },
  Kennen: { x: 0.63, y: 0.36 },
  "Kha'Zix": { x: 0.62, y: 0.36 },
  Kindred: { x: 0.42, y: 0.45 },
  "Lee Sin": { x: 0.58, y: 0.18 },
  Lillia: { x: 0.46, y: 0.2 },
  Locke: { x: 0.58, y: 0.2 },
  Lucian: { x: 0.74, y: 0.42 },
  "Master Yi": { x: 0.82, y: 0.2 },
  Mordekaiser: { x: 0.44, y: 0.22 },
  Nasus: { x: 0.55, y: 0.22 },
  Neeko: { x: 0.5, y: 0.28 },
  Nocturne: { x: 0.7, y: 0.4 },
  Ornn: { x: 0.48, y: 0.22 },
  Poppy: { x: 0.74, y: 0.28 },
  Rammus: { x: 0.56, y: 0.32 },
  Rell: { x: 0.48, y: 0.24 },
  Rumble: { x: 0.48, y: 0.3 },
  Ryze: { x: 0.74, y: 0.26 },
  Sion: { x: 0.6, y: 0.36 },
  Smolder: { x: 0.57, y: 0.22 },
  Swain: { x: 0.67, y: 0.22 },
  "Tahm Kench": { x: 0.62, y: 0.42 },
  Thresh: { x: 0.58, y: 0.24 },
  Vayne: { x: 0.82, y: 0.2 },
  Veigar: { x: 0.64, y: 0.28 },
  Vi: { x: 0.66, y: 0.34 },
  Volibear: { x: 0.52, y: 0.24 },
  Yunara: { x: 0.65, y: 0.22 },
  Zed: { x: 0.64, y: 0.2 },
  Zeri: { x: 0.56, y: 0.24 },
};

export type ArtSide = "left" | "right";

export function focalFor(champion: string | null | undefined): Focal {
  return (champion && SPLASH_FOCAL[champion]) || DEFAULT_FOCAL;
}

/** Right of this fraction the face would sit under the panel; mirror the card instead. */
export const SIDE_THRESHOLD = 0.56;

export function artSideFor(focal: Focal): ArtSide {
  return focal.x >= SIDE_THRESHOLD ? "right" : "left";
}

/**
 * Where the face should land inside the art box, as fractions of the box:
 * a third of the way in from the open edge, and a little above centre, which
 * is where a poster puts a face.
 */
export function anchorFor(side: ArtSide): Focal {
  return { x: side === "left" ? 0.36 : 0.64, y: 0.4 };
}

/**
 * The CSS `object-position` (as fractions) that puts `focal` on `anchor` for
 * an image of `img` size covering a box of `box` size. Pure geometry: with
 * `object-fit: cover` the image is scaled to the larger ratio, and
 * object-position distributes the overflow. The result is clamped, so a face
 * that cannot reach the anchor without zooming comes as close as the crop
 * allows; the deck never scales art above cover.
 */
export function objectPositionFor(
  focal: Focal,
  anchor: Focal,
  box: { width: number; height: number },
  img: { width: number; height: number } = { width: SPLASH_W, height: SPLASH_H },
): Focal {
  if (box.width <= 0 || box.height <= 0) return { x: 0.5, y: 0.5 };
  const scale = Math.max(box.width / img.width, box.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const px = w - box.width > 0.5 ? (focal.x * w - anchor.x * box.width) / (w - box.width) : 0.5;
  const py = h - box.height > 0.5 ? (focal.y * h - anchor.y * box.height) / (h - box.height) : 0.5;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(px), y: clamp(py) };
}

export const toObjectPosition = (p: Focal): string => `${(p.x * 100).toFixed(2)}% ${(p.y * 100).toFixed(2)}%`;
