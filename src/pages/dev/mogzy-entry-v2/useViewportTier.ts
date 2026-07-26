import { useEffect, useState } from "react";

/**
 * Viewport tiers for the Academy entrance.
 *
 * The entrance is a fixed, non-scrolling composition, so its layout depends on
 * how much *vertical* room there is as much as horizontal. A phone in landscape
 * is wide but only ~390px tall, which is a different problem from a tablet, so
 * it gets its own tier rather than being lumped in with "small width".
 */
export type ViewportTier = "phone" | "phone-landscape" | "tablet" | "desktop";

function resolveTier(width: number, height: number): ViewportTier {
  // Short viewports can't stack a title, mascot and CTA at full size whatever
  // their width, so height is checked first.
  if (height < 560 && width > height) return "phone-landscape";
  if (width < 640) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(() =>
    typeof window === "undefined"
      ? "desktop"
      : resolveTier(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    const update = () => setTier(resolveTier(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return tier;
}
