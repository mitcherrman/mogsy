import { useReducedMotion } from "framer-motion";

/** Reduced-motion aware durations; framer reads the same OS preference. */
export function useDeckMotion() {
  const reduced = useReducedMotion() ?? false;
  return {
    reduced,
    card: reduced ? 0.001 : 0.52,
    face: reduced ? 0.001 : 0.22,
    ease: [0.2, 0.7, 0.2, 1] as const,
  };
}

/** Warm the browser cache for a neighbour's art without rendering it. */
export function preloadArt(urls: Array<string | null | undefined>) {
  if (typeof Image === "undefined") return;
  for (const url of urls) {
    if (!url) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
