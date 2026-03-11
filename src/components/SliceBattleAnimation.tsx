import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback, useId, useMemo } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./animations/AnimationCardStats";

interface SliceBattleAnimationProps {
  winnerSide: 0 | 1 | null;
  items: AnimationCardItem[];
  onComplete: () => void;
}

/**
 * Full-screen opaque overlay that renders BOTH cards as replicas.
 * The loser side gets a jagged tear animation.
 * The winner side stays static.
 *
 * Best-practice behavior:
 * - Overlay visibility is controlled ONLY by winnerSide (parent).
 * - Internal phase NEVER causes the overlay to unmount early.
 * - onComplete fires once per animation run, and parent clears winnerSide later.
 * - Prevents "flash" of underlying pre-animation cards between animation end and next pair commit.
 */

function generateTearPoints(width: number, height: number, teeth: number = 14) {
  const angle = 12;
  const rad = (angle * Math.PI) / 180;
  const centerY = height / 2;
  const halfDiag = (width * Math.tan(rad)) / 2;
  const startY = centerY + halfDiag;
  const endY = centerY - halfDiag;
  const toothDepth = height * 0.025;

  const zigzagTop: string[] = [];
  const zigzagBottom: string[] = [];

  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const x = t * width;
    const baseY = startY + (endY - startY) * t;
    const offset = i % 2 === 0 ? -toothDepth : toothDepth;
    zigzagTop.push(`${x},${baseY + offset}`);
    zigzagBottom.push(`${x},${baseY + offset}`);
  }

  const topPoints = [`0,0`, `${width},0`, ...zigzagTop.reverse()].join(" ");
  const bottomPoints = [...zigzagBottom, `${width},${height}`, `0,${height}`].join(" ");

  return { topPoints, bottomPoints };
}

function getImageUrl(item: AnimationCardItem): string {
  return (
    item.imageUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`
  );
}

export default function SliceBattleAnimation({ winnerSide, items, onComplete }: SliceBattleAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "slash" | "split" | "done">("idle");

  // Stable, unique clip IDs per mounted instance
  const clipId = useId();

  // Precompute tear points once (they don't depend on runtime state)
  const W = 1000;
  const H = 1400;
  const { topPoints, bottomPoints } = useMemo(() => generateTearPoints(W, H), []);
  const topClipId = `tear-top-${clipId}`;
  const bottomClipId = `tear-bottom-${clipId}`;

  // Drives only the internal animation phases.
  // IMPORTANT: We do NOT set phase to "idle" after completion; overlay stays mounted
  // until the parent clears winnerSide.
  const finish = useCallback(() => {
    setPhase("done");
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // Parent cleared winnerSide -> fully reset internal phase
    if (winnerSide === null) {
      setPhase("idle");
      return;
    }

    // Start a new run
    setPhase("slash");
    const t1 = window.setTimeout(() => setPhase("split"), 150);
    const t2 = window.setTimeout(finish, 700);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [winnerSide, finish]);

  // Overlay existence is controlled ONLY by winnerSide and valid items.
  if (winnerSide === null || items.length < 2) return null;

  const loserIdx = winnerSide === 0 ? 1 : 0;
  const loserOnRight = winnerSide === 0;

  return (
    <AnimatePresence>
      <motion.div
        // Keep the overlay mounted (opaque) until parent clears winnerSide.
        // Exit fade happens only when this component is removed (winnerSide -> null).
        className="absolute inset-0 z-50 pointer-events-none bg-background"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.08 }}
      >
        {/* Hidden SVG defs for jagged clip-paths */}
        <svg className="absolute w-0 h-0" aria-hidden="true">
          <defs>
            <clipPath id={topClipId} clipPathUnits="objectBoundingBox" transform={`scale(${1 / W}, ${1 / H})`}>
              <polygon points={topPoints} />
            </clipPath>
            <clipPath id={bottomClipId} clipPathUnits="objectBoundingBox" transform={`scale(${1 / W}, ${1 / H})`}>
              <polygon points={bottomPoints} />
            </clipPath>
          </defs>
        </svg>

        {/* Full overlay with both cards side by side */}
        <div className="w-full h-full flex flex-col portrait:flex-col landscape:flex-row md:flex-row gap-2 landscape:gap-4 md:gap-5 lg:gap-8 p-0">
        {items.map((item, idx) => {
            const isLoser = idx === loserIdx;
            const imageUrl = getImageUrl(item);

            if (!isLoser) {
              return (
                <motion.div key={idx} className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card overflow-hidden relative"
                  animate={phase !== "idle" ? {
                    boxShadow: [
                      "0 0 0px 0px hsl(0 0% 100% / 0)",
                      "0 0 14px 3px hsl(0 0% 100% / 0.35)",
                      "0 0 6px 2px hsl(0 0% 100% / 0.1)",
                    ],
                  } : {}}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden relative">
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" draggable={false} />
                    {phase !== "idle" && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 0.85] }}
                        transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
                      >
                        <span className="text-4xl md:text-5xl drop-shadow-lg select-none">❤️</span>
                      </motion.div>
                    )}
                    {/* Steel gleam sweep */}
                    {phase !== "idle" && (
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "linear-gradient(120deg, transparent 30%, hsl(0 0% 100% / 0.25) 48%, hsl(0 0% 100% / 0.4) 50%, hsl(0 0% 100% / 0.25) 52%, transparent 70%)",
                          backgroundSize: "200% 100%",
                        }}
                        initial={{ backgroundPosition: "200% 0" }}
                        animate={{ backgroundPosition: "-200% 0" }}
                        transition={{ duration: 0.6, delay: 0.1, ease: "easeInOut" }}
                      />
                    )}
                  </div>
                  <AnimationCardStats item={item} />
                </motion.div>
              );
            }

            return (
              <div key={idx} className="flex-1 flex flex-col min-h-0 relative rounded-2xl border border-border bg-card overflow-hidden">
                <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] relative overflow-hidden">
                  {/* Top half */}
                  <motion.div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `url(#${topClipId})` }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={
                      phase === "split" || phase === "done"
                        ? {
                            x: loserOnRight ? 30 : -30,
                            y: -45,
                            rotate: loserOnRight ? 5 : -5,
                            opacity: phase === "done" ? 0 : 1,
                          }
                        : { x: 0, y: 0, rotate: 0, opacity: 1 }
                    }
                    transition={{
                      duration: phase === "done" ? 0.15 : 0.35,
                      ease: phase === "done" ? "easeIn" : [0.22, 1, 0.36, 1],
                    }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </motion.div>

                  {/* Bottom half */}
                  <motion.div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `url(#${bottomClipId})` }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={
                      phase === "split" || phase === "done"
                        ? {
                            x: loserOnRight ? -20 : 20,
                            y: 50,
                            rotate: loserOnRight ? -4 : 4,
                            opacity: phase === "done" ? 0 : 1,
                          }
                        : { x: 0, y: 0, rotate: 0, opacity: 1 }
                    }
                    transition={{
                      duration: phase === "done" ? 0.15 : 0.35,
                      ease: phase === "done" ? "easeIn" : [0.22, 1, 0.36, 1],
                    }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </motion.div>
                </div>
                <AnimationCardStats item={item} />
              </div>
            );
          })}
        </div>

        {/* VS badge replica */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm md:text-base lg:text-lg font-black text-muted-foreground bg-background/90 border border-border rounded-full px-2.5 py-1 md:px-4 md:py-1.5 shadow-md z-10">
            VS
          </span>
        </div>

        {/* Diagonal slash flash */}
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

        {/* Impact sparks */}
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
