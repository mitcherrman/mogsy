/**
 * ACADEMY STARTUP RC2.2 — ask for the Orrery's late display faces during the
 * Landing, not when the Orrery mounts.
 *
 * Lora (Mogzy's speech bubble) and Space Mono (the markings) come from the
 * async `media="print"` stylesheets in index.html. Their @font-face rules are
 * registered early, but a face's FILE is only fetched once something uses it,
 * and nothing on the Landing does: the measured result was the held veil
 * waiting on `font:lora` alone until 1.26–1.44 s after the hand-off on 4G
 * phones (everything else in by ~0.3 s).
 *
 * Not a <link rel=preload>: Google Fonts serves a different file per browser
 * (desktop Chrome, Firefox and mobile each get their own Lora/Inter URL), so a
 * static URL is right for one class of browser and a wasted download for the
 * rest. `document.fonts.load()` asks the face the stylesheet registered, so
 * every browser fetches exactly its own file. Fire and forget; never throws.
 */

const LATE_FACES: ReadonlyArray<{ family: string; spec: string; sheet: string }> = [
  { family: "Lora", spec: '400 12px "Lora"', sheet: "family=Lora" },
  { family: "Space Mono", spec: '400 12px "Space Mono"', sheet: "family=Space+Mono" },
];

function hasFace(fonts: FontFaceSet, family: string): boolean {
  let found = false;
  fonts.forEach((f) => { if (f.family.replace(/["']/g, "") === family) found = true; });
  return found;
}

export function warmAcademyFonts(doc: Document = document): void {
  const fonts = doc.fonts;
  if (!fonts || typeof fonts.load !== "function") return;
  for (const face of LATE_FACES) {
    const ask = () => {
      try { void fonts.load(face.spec).catch(() => undefined); } catch { /* nothing to load */ }
    };
    if (hasFace(fonts, face.family)) { ask(); continue; }
    // Its stylesheet has not registered the face yet: ask once it has. The
    // index.html loader flips the sheet to media="all" in its own onload,
    // which runs before this listener; the next tick sees the face.
    const link = doc.querySelector<HTMLLinkElement>(`link[rel="stylesheet"][href*="${face.sheet}"]`);
    link?.addEventListener("load", () => setTimeout(ask, 0), { once: true });
  }
}
