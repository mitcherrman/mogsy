import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Card gets chopped in half with a cleaver strike */
export default function ChopAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "strike" | "split" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("strike");
    const t1 = setTimeout(() => setPhase("split"), 200);
    const t2 = setTimeout(finish, 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [winnerSide, finish]);

  if (winnerSide === null || items.length < 2) return null;

  const loserIdx = winnerSide === 0 ? 1 : 0;

  return (
    <AnimatePresence>
      <motion.div className="absolute inset-0 z-50 pointer-events-none bg-background"
        initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.05 }}>
        <div className="w-full h-full flex flex-col portrait:flex-col landscape:flex-row md:flex-row gap-2 landscape:gap-4 md:gap-5 lg:gap-8 p-0">
          {items.map((item, idx) => {
            const isLoser = idx === loserIdx;
            const imageUrl = getImageUrl(item);

            if (!isLoser) {
              return (
                <motion.div key={idx} className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card overflow-hidden relative"
                  animate={phase !== "idle" ? {
                    boxShadow: [
                      "0 0 0px 0px hsla(140, 70%, 45%, 0)",
                      "0 0 20px 5px hsla(140, 70%, 45%, 0.5)",
                      "0 0 10px 3px hsla(140, 70%, 45%, 0.2)",
                    ],
                  } : {}}
                  transition={{ duration: 0.6, delay: 0.15 }}
                >
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden">
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
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
                  </div>
                  <AnimationCardStats item={item} />
                </motion.div>
              );
            }

            return (
              <div key={idx} className="flex-1 flex flex-col min-h-0 relative rounded-2xl border border-border bg-card overflow-hidden">
                <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] relative overflow-hidden">
                  {/* Left half */}
                  <motion.div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: "inset(0 50% 0 0)" }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={
                      phase === "split"
                        ? { x: -40, y: 30, rotate: -8, opacity: 0 }
                        : {}
                    }
                    transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </motion.div>

                  {/* Right half */}
                  <motion.div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: "inset(0 0 0 50%)" }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={
                      phase === "split"
                        ? { x: 40, y: 30, rotate: 8, opacity: 0 }
                        : {}
                    }
                    transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </motion.div>

                  {/* CHOPPED stamp */}
                  {(phase === "strike" || phase === "split") && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                      initial={{ scale: 3, opacity: 0, rotate: -12 }}
                      animate={{ scale: 1, opacity: 1, rotate: -12 }}
                      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span
                        className="text-4xl md:text-5xl lg:text-6xl font-black tracking-widest uppercase select-none"
                        style={{
                          color: "hsl(0 80% 50%)",
                          textShadow: "0 2px 8px hsl(0 80% 30% / 0.5)",
                          WebkitTextStroke: "1px hsl(0 60% 35%)",
                          letterSpacing: "0.15em",
                        }}
                      >
                        CHOPPED
                      </span>
                    </motion.div>
                  )}

                  {/* Chop line flash */}
                  {(phase === "strike" || phase === "split") && (
                    <motion.div
                      className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 bg-foreground/80"
                      initial={{ scaleY: 0, opacity: 1 }}
                      animate={
                        phase === "strike"
                          ? { scaleY: 1, opacity: 1 }
                          : { scaleY: 1, opacity: 0 }
                      }
                      transition={{ duration: phase === "strike" ? 0.15 : 0.4 }}
                      style={{ originY: 0 }}
                    />
                  )}

                  {/* Impact flash */}
                  {phase === "strike" && (
                    <motion.div
                      className="absolute inset-0 bg-foreground/10"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </div>
                <AnimationCardStats item={item} />
              </div>
            );
          })}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm md:text-base lg:text-lg font-black text-muted-foreground bg-background/90 border border-border rounded-full px-2.5 py-1 md:px-4 md:py-1.5 shadow-md z-10">VS</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
