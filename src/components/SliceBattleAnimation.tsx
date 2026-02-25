import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface SliceBattleAnimationProps {
  /** Which side won: 0 = left/top, 1 = right/bottom, null = no animation */
  winnerSide: 0 | 1 | null;
  onComplete: () => void;
}

/**
 * High-quality battle animation:
 * 1. Winner card rises up (scales + lifts)
 * 2. At the peak, the loser card tears diagonally into two halves
 * 3. Winner card comes back down as the loser halves slide apart and fade
 * 4. Clean exit
 *
 * Total duration: ~750ms
 */
export default function SliceBattleAnimation({ winnerSide, onComplete }: SliceBattleAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "rise" | "tear" | "settle">("idle");

  const reset = useCallback(() => {
    setPhase("idle");
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) {
      setPhase("idle");
      return;
    }

    // Phase timeline
    setPhase("rise");
    const t1 = setTimeout(() => setPhase("tear"), 250);   // peak of rise → tear
    const t2 = setTimeout(() => setPhase("settle"), 500);  // halves separate
    const t3 = setTimeout(reset, 750);                     // done

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [winnerSide, reset]);

  if (winnerSide === null || phase === "idle") return null;

  const isLeft = winnerSide === 0;

  // The angle of the diagonal cut (in degrees). Positive = top-left to bottom-right slash
  const TEAR_ANGLE = 12;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-50 pointer-events-none"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
      >
        {/* ── Winner overlay: subtle scale lift and drop ── */}
        <motion.div
          className="absolute top-0 bottom-0 overflow-hidden"
          style={{
            left: isLeft ? 0 : "50%",
            right: isLeft ? "50%" : 0,
          }}
          initial={{ scale: 1, y: 0 }}
          animate={
            phase === "rise"
              ? { scale: 1.04, y: -6 }
              : phase === "tear"
              ? { scale: 1.06, y: -10 }
              : { scale: 1, y: 0 }
          }
          transition={
            phase === "settle"
              ? { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          {/* Winner glow ring */}
          <motion.div
            className="absolute inset-0 rounded-xl"
            initial={{ opacity: 0 }}
            animate={{
              opacity: phase === "rise" ? 0.08 : phase === "tear" ? 0.18 : 0,
              boxShadow:
                phase === "tear"
                  ? "inset 0 0 40px hsl(var(--primary) / 0.3), 0 0 30px hsl(var(--primary) / 0.15)"
                  : "inset 0 0 0px transparent",
            }}
            transition={{ duration: 0.2 }}
          >
            <div className="w-full h-full bg-primary/10 rounded-xl" />
          </motion.div>
        </motion.div>

        {/* ── Loser card: diagonal tear into two halves ── */}
        {/* We use clip-path polygon to cut the loser side diagonally */}
        
        {/* Top-left half of the loser (above the diagonal cut) */}
        <motion.div
          className="absolute overflow-hidden"
          style={{
            left: !isLeft ? 0 : "50%",
            right: isLeft ? 0 : "50%",
            top: 0,
            bottom: 0,
            clipPath: `polygon(0% 0%, 100% 0%, 100% ${50 - TEAR_ANGLE}%, 0% ${50 + TEAR_ANGLE}%)`,
            transformOrigin: !isLeft ? "top left" : "top right",
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={
            phase === "tear" || phase === "settle"
              ? {
                  x: !isLeft ? -20 : 20,
                  y: -35,
                  rotate: !isLeft ? -4 : 4,
                  opacity: phase === "settle" ? 0 : 0.85,
                }
              : { x: 0, y: 0, rotate: 0, opacity: 0 }
          }
          transition={{
            duration: phase === "settle" ? 0.25 : 0.2,
            ease: phase === "settle" ? "easeIn" : [0.22, 1, 0.36, 1],
          }}
        >
          <div className="w-full h-full bg-destructive/8 backdrop-blur-[1px]" />
          {/* Tear edge glow on the cut line */}
          <div
            className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-destructive/40 to-transparent"
            style={{
              bottom: 0,
              transform: `rotate(-${TEAR_ANGLE * 0.5}deg)`,
            }}
          />
        </motion.div>

        {/* Bottom-right half of the loser (below the diagonal cut) */}
        <motion.div
          className="absolute overflow-hidden"
          style={{
            left: !isLeft ? 0 : "50%",
            right: isLeft ? 0 : "50%",
            top: 0,
            bottom: 0,
            clipPath: `polygon(0% ${50 + TEAR_ANGLE}%, 100% ${50 - TEAR_ANGLE}%, 100% 100%, 0% 100%)`,
            transformOrigin: !isLeft ? "bottom left" : "bottom right",
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={
            phase === "tear" || phase === "settle"
              ? {
                  x: !isLeft ? 15 : -15,
                  y: 35,
                  rotate: !isLeft ? 3 : -3,
                  opacity: phase === "settle" ? 0 : 0.85,
                }
              : { x: 0, y: 0, rotate: 0, opacity: 0 }
          }
          transition={{
            duration: phase === "settle" ? 0.25 : 0.2,
            ease: phase === "settle" ? "easeIn" : [0.22, 1, 0.36, 1],
          }}
        >
          <div className="w-full h-full bg-destructive/8 backdrop-blur-[1px]" />
          {/* Tear edge glow on the cut line */}
          <div
            className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-destructive/40 to-transparent"
            style={{
              top: 0,
              transform: `rotate(-${TEAR_ANGLE * 0.5}deg)`,
            }}
          />
        </motion.div>

        {/* ── Diagonal flash line at the moment of tear ── */}
        {(phase === "tear") && (
          <motion.div
            className="absolute"
            style={{
              left: !isLeft ? 0 : "50%",
              right: isLeft ? 0 : "50%",
              top: 0,
              bottom: 0,
              overflow: "hidden",
            }}
          >
            <motion.div
              className="absolute bg-foreground/20"
              style={{
                width: "150%",
                height: "2.5px",
                left: "-25%",
                top: "50%",
                transformOrigin: "center center",
                rotate: `${-TEAR_ANGLE}deg`,
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </motion.div>
        )}

        {/* ── Subtle particle burst at center of tear ── */}
        {phase === "tear" && (
          <motion.div
            className="absolute"
            style={{
              left: !isLeft ? "25%" : "75%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <motion.div
                key={angle}
                className="absolute w-1 h-1 rounded-full bg-foreground/30"
                initial={{
                  x: 0,
                  y: 0,
                  opacity: 1,
                  scale: 1,
                }}
                animate={{
                  x: Math.cos((angle * Math.PI) / 180) * 24,
                  y: Math.sin((angle * Math.PI) / 180) * 18,
                  opacity: 0,
                  scale: 0.5,
                }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
