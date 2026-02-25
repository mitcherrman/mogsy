import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback, useId } from "react";

interface SliceBattleAnimationProps {
  winnerSide: 0 | 1 | null;
  loserImageUrl: string | null;
  loserName: string;
  onComplete: () => void;
}

/**
 * High-quality card tear animation:
 * 1. Winner lifts (scale + translateY)
 * 2. Diagonal slash sweeps across loser card
 * 3. Loser card splits into two jagged halves that drift apart
 * 4. Winner settles back down
 *
 * Uses the real loser image with inline SVG jagged clip-paths.
 * Total: ~800ms
 */

// Generate jagged tear polygon points along a diagonal line
// Returns SVG polygon points string for top half and bottom half
function generateTearPoints(width: number, height: number, teeth: number = 14) {
  const angle = 12; // degrees
  const rad = (angle * Math.PI) / 180;

  // The diagonal line goes from (0, centerY + offset) to (width, centerY - offset)
  const centerY = height / 2;
  const halfDiag = (width * Math.tan(rad)) / 2;
  const startY = centerY + halfDiag; // left edge
  const endY = centerY - halfDiag;   // right edge

  // Generate zigzag points along the diagonal
  const zigzagTop: string[] = [];
  const zigzagBottom: string[] = [];
  const toothDepth = height * 0.025; // depth of each tooth

  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const x = t * width;
    const baseY = startY + (endY - startY) * t;
    // Alternate up/down for zigzag
    const offset = i % 2 === 0 ? -toothDepth : toothDepth;
    zigzagTop.push(`${x},${baseY + offset}`);
    zigzagBottom.push(`${x},${baseY + offset}`);
  }

  // Top half: top-left → top-right → zigzag right-to-left → close
  const topPoints = [
    `0,0`,
    `${width},0`,
    ...zigzagTop.reverse(),
  ].join(" ");

  // Bottom half: zigzag left-to-right → bottom-right → bottom-left → close
  const bottomPoints = [
    ...zigzagBottom,
    `${width},${height}`,
    `0,${height}`,
  ].join(" ");

  return { topPoints, bottomPoints };
}

export default function SliceBattleAnimation({
  winnerSide,
  loserImageUrl,
  loserName,
  onComplete,
}: SliceBattleAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "rise" | "slash" | "split" | "done">("idle");
  const clipId = useId();

  const reset = useCallback(() => {
    setPhase("idle");
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) {
      setPhase("idle");
      return;
    }

    setPhase("rise");
    const t1 = setTimeout(() => setPhase("slash"), 200);
    const t2 = setTimeout(() => setPhase("split"), 350);
    const t3 = setTimeout(reset, 800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [winnerSide, reset]);

  if (winnerSide === null || phase === "idle") return null;

  const isLeftWinner = winnerSide === 0;
  // Loser is on the opposite side
  const loserOnRight = isLeftWinner;

  // SVG viewBox dimensions (arbitrary, we use percentage-based polygon coords)
  const W = 1000;
  const H = 1400;
  const { topPoints, bottomPoints } = generateTearPoints(W, H);

  const topClipId = `tear-top-${clipId}`;
  const bottomClipId = `tear-bottom-${clipId}`;

  // Fallback image
  const imageUrl = loserImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(loserName)}&background=1a1a2e&color=00d4ff&size=400`;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-50 pointer-events-none"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
      >
        {/* Hidden SVG defs for jagged clip-paths */}
        <svg className="absolute w-0 h-0" aria-hidden="true">
          <defs>
            <clipPath id={topClipId} clipPathUnits="objectBoundingBox"
              transform={`scale(${1/W}, ${1/H})`}>
              <polygon points={topPoints} />
            </clipPath>
            <clipPath id={bottomClipId} clipPathUnits="objectBoundingBox"
              transform={`scale(${1/W}, ${1/H})`}>
              <polygon points={bottomPoints} />
            </clipPath>
          </defs>
        </svg>

        {/* ── Winner overlay: subtle scale lift and settle ── */}
        <motion.div
          className="absolute top-0 bottom-0 overflow-hidden"
          style={{
            left: isLeftWinner ? 0 : "50%",
            right: isLeftWinner ? "50%" : 0,
          }}
          initial={{ scale: 1, y: 0 }}
          animate={
            phase === "rise" || phase === "slash"
              ? { scale: 1.05, y: -8 }
              : phase === "split"
              ? { scale: 1.02, y: -3 }
              : { scale: 1, y: 0 }
          }
          transition={
            phase === "done"
              ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          {/* Winner glow */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{
              opacity: phase === "slash" || phase === "split" ? 0.15 : 0,
              boxShadow:
                phase === "slash" || phase === "split"
                  ? "inset 0 0 40px hsl(var(--primary) / 0.25), 0 0 25px hsl(var(--primary) / 0.12)"
                  : "inset 0 0 0px transparent",
            }}
            transition={{ duration: 0.15 }}
          >
            <div className="w-full h-full bg-primary/10 rounded-2xl" />
          </motion.div>
        </motion.div>

        {/* ── Loser card: real image torn into two jagged halves ── */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: loserOnRight ? "50%" : 0,
            right: loserOnRight ? 0 : "50%",
          }}
        >
          {/* Top half of the loser card */}
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-2xl"
            style={{
              clipPath: `url(#${topClipId})`,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={
              phase === "split" || phase === "done"
                ? {
                    x: loserOnRight ? 30 : -30,
                    y: -45,
                    rotate: loserOnRight ? 5 : -5,
                    opacity: phase === "done" ? 0 : 0.8,
                  }
                : { x: 0, y: 0, rotate: 0, opacity: phase === "slash" ? 1 : 0 }
            }
            transition={{
              duration: phase === "done" ? 0.15 : 0.3,
              ease: phase === "done" ? "easeIn" : [0.22, 1, 0.36, 1],
            }}
          >
            <img
              src={imageUrl}
              alt={loserName}
              className="w-full h-full object-contain bg-muted"
              draggable={false}
            />
            {/* Torn edge shadow along the bottom of this half */}
            <div
              className="absolute bottom-0 left-0 right-0 h-3 pointer-events-none"
              style={{
                background: "linear-gradient(to top, hsl(var(--foreground) / 0.15), transparent)",
              }}
            />
          </motion.div>

          {/* Bottom half of the loser card */}
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-2xl"
            style={{
              clipPath: `url(#${bottomClipId})`,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={
              phase === "split" || phase === "done"
                ? {
                    x: loserOnRight ? -20 : 20,
                    y: 50,
                    rotate: loserOnRight ? -4 : 4,
                    opacity: phase === "done" ? 0 : 0.8,
                  }
                : { x: 0, y: 0, rotate: 0, opacity: phase === "slash" ? 1 : 0 }
            }
            transition={{
              duration: phase === "done" ? 0.15 : 0.3,
              ease: phase === "done" ? "easeIn" : [0.22, 1, 0.36, 1],
            }}
          >
            <img
              src={imageUrl}
              alt={loserName}
              className="w-full h-full object-contain bg-muted"
              draggable={false}
            />
            {/* Torn edge shadow along the top of this half */}
            <div
              className="absolute top-0 left-0 right-0 h-3 pointer-events-none"
              style={{
                background: "linear-gradient(to bottom, hsl(var(--foreground) / 0.15), transparent)",
              }}
            />
          </motion.div>
        </div>

        {/* ── Diagonal slash flash ── */}
        {phase === "slash" && (
          <div
            className="absolute top-0 bottom-0 overflow-hidden"
            style={{
              left: loserOnRight ? "50%" : 0,
              right: loserOnRight ? 0 : "50%",
            }}
          >
            <motion.div
              className="absolute bg-foreground/40"
              style={{
                width: "160%",
                height: "3px",
                left: "-30%",
                top: "50%",
                transformOrigin: "center center",
                rotate: "-12deg",
                boxShadow: "0 0 12px 4px hsl(var(--foreground) / 0.2)",
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0.6] }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            />
          </div>
        )}

        {/* ── Impact sparks at tear center ── */}
        {(phase === "slash" || phase === "split") && (
          <motion.div
            className="absolute"
            style={{
              left: loserOnRight ? "75%" : "25%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <motion.div
                key={angle}
                className="absolute w-1.5 h-1.5 rounded-full bg-foreground/40"
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos((angle * Math.PI) / 180) * 30,
                  y: Math.sin((angle * Math.PI) / 180) * 22,
                  opacity: 0,
                  scale: 0.3,
                }}
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
