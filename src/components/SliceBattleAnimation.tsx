import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface SliceBattleAnimationProps {
  /** Which side won: 0 = left, 1 = right, null = no animation */
  winnerSide: 0 | 1 | null;
  onComplete: () => void;
}

export default function SliceBattleAnimation({ winnerSide, onComplete }: SliceBattleAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "elevate" | "slash" | "split">("idle");

  useEffect(() => {
    if (winnerSide === null) {
      setPhase("idle");
      return;
    }
    setPhase("elevate");
    const t1 = setTimeout(() => setPhase("slash"), 200);
    const t2 = setTimeout(() => setPhase("split"), 350);
    const t3 = setTimeout(() => {
      setPhase("idle");
      onComplete();
    }, 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [winnerSide, onComplete]);

  if (winnerSide === null || phase === "idle") return null;

  const isLeft = winnerSide === 0;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-50 pointer-events-none overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {/* Winner glow pulse */}
        <motion.div
          className="absolute top-0 bottom-0"
          style={{
            left: isLeft ? 0 : "50%",
            right: isLeft ? "50%" : 0,
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: phase === "elevate" ? 0.15 : phase === "slash" ? 0.25 : 0,
          }}
          transition={{ duration: 0.15 }}
        >
          <div className="w-full h-full bg-primary rounded-2xl" />
        </motion.div>

        {/* Slash line */}
        {(phase === "slash" || phase === "split") && (
          <motion.div
            className="absolute top-0 bottom-0 w-[3px]"
            style={{
              left: isLeft ? "calc(50% + 1rem)" : undefined,
              right: !isLeft ? "calc(50% + 1rem)" : undefined,
            }}
            initial={{
              scaleY: 0,
              opacity: 0,
            }}
            animate={{
              scaleY: 1,
              opacity: [0, 1, 1, 0],
            }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="w-full h-full bg-gradient-to-b from-transparent via-primary to-transparent" />
          </motion.div>
        )}

        {/* Slash spark effect */}
        {phase === "slash" && (
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="w-8 h-8 rounded-full bg-primary/40 blur-sm" />
          </motion.div>
        )}

        {/* Loser card split effect - top half slides up */}
        {phase === "split" && (
          <>
            <motion.div
              className="absolute overflow-hidden"
              style={{
                left: !isLeft ? 0 : "50%",
                right: isLeft ? 0 : "50%",
                top: 0,
                height: "50%",
              }}
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: -30, opacity: 0, rotateZ: isLeft ? -3 : 3 }}
              transition={{ duration: 0.3, ease: "easeIn" }}
            >
              <div className="w-full h-full bg-destructive/10 rounded-t-2xl border-b border-destructive/30" />
            </motion.div>
            {/* Bottom half slides down */}
            <motion.div
              className="absolute overflow-hidden"
              style={{
                left: !isLeft ? 0 : "50%",
                right: isLeft ? 0 : "50%",
                bottom: 0,
                height: "50%",
              }}
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: 30, opacity: 0, rotateZ: isLeft ? 3 : -3 }}
              transition={{ duration: 0.3, ease: "easeIn" }}
            >
              <div className="w-full h-full bg-destructive/10 rounded-b-2xl border-t border-destructive/30" />
            </motion.div>
          </>
        )}

        {/* Diagonal slash streak */}
        {phase === "slash" && (
          <motion.div
            className="absolute"
            style={{
              left: isLeft ? "45%" : "40%",
              top: "-10%",
              width: "4px",
              height: "120%",
              transformOrigin: "center center",
            }}
            initial={{ rotate: isLeft ? 15 : -15, scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: [0, 1, 0.8, 0] }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="w-full h-full bg-gradient-to-b from-transparent via-foreground/80 to-transparent blur-[1px]" />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
