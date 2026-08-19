import { useState } from "react";
import { resolveCrownArt } from "@/lib/ranked/crowns";

export type RankCrownSize = "hero" | "profile" | "row";

/**
 * Crown art is horizontally wide, unlike the legacy square rank crests, so
 * sizing is width-driven with `object-contain` rather than fixed square dims.
 */
const SIZE_CLASSES: Record<RankCrownSize, string> = {
  hero: "w-28 md:w-36",
  profile: "w-20 md:w-24",
  row: "w-10",
};

/**
 * Presentation-only. Renders a canonical Mogzy crown when crown art exists
 * for `rankName`, otherwise falls back to the existing backend-supplied
 * rank crest. Renders nothing if neither is available.
 */
export default function RankCrown({
  rankName,
  fallbackSrc,
  alt,
  size = "profile",
  className,
}: {
  rankName?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  size?: RankCrownSize;
  className?: string;
}) {
  const crownSrc = resolveCrownArt(rankName);
  const [src, setSrc] = useState<string | null>(crownSrc ?? fallbackSrc ?? null);

  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={[SIZE_CLASSES[size], "h-auto object-contain", className].filter(Boolean).join(" ")}
      onError={() => {
        if (src === crownSrc && fallbackSrc) {
          setSrc(fallbackSrc);
        } else {
          setSrc(null);
        }
      }}
    />
  );
}
