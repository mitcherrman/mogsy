/**
 * Default animation: no overlay at all. The parent handles it with a simple opacity fade.
 * This is a no-op component that just calls onComplete immediately.
 */
import { useEffect } from "react";

interface Props {
  winnerSide: 0 | 1 | null;
  items: { imageUrl: string | null; name: string }[];
  onComplete: () => void;
}

export default function DefaultFadeAnimation({ winnerSide, onComplete }: Props) {
  useEffect(() => {
    if (winnerSide === null) return;
    // Immediately complete — the parent transition handles the fade
    const t = setTimeout(onComplete, 250);
    return () => clearTimeout(t);
  }, [winnerSide, onComplete]);

  return null;
}
