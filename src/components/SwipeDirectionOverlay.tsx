import { motion } from "framer-motion";

interface SwipeDirectionOverlayProps {
  /** Current drag X offset in pixels */
  dragX: number;
  /** Threshold at which overlay starts appearing */
  threshold?: number;
}

/**
 * Shows a "MOG 👑" or "PASS 👎" overlay on a card during drag,
 * with opacity proportional to drag distance.
 */
export default function SwipeDirectionOverlay({
  dragX,
  threshold = 20,
}: SwipeDirectionOverlayProps) {
  const absDrag = Math.abs(dragX);
  if (absDrag < threshold) return null;

  const opacity = Math.min((absDrag - threshold) / 80, 0.85);
  const isRight = dragX > 0;

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-[15] pointer-events-none"
      initial={false}
      animate={{ opacity }}
    >
      <div
        className={`px-4 py-2 rounded-xl border-2 font-black text-lg md:text-xl uppercase tracking-wider select-none rotate-[-12deg] ${
          isRight
            ? "border-primary text-primary bg-primary/10"
            : "border-destructive text-destructive bg-destructive/10"
        }`}
        style={{ backdropFilter: "blur(2px)" }}
      >
        {isRight ? "👑 MOG" : "👎 PASS"}
      </div>
    </motion.div>
  );
}
