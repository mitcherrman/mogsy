import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Card gets crushed/crumpled inward with a heavy slam */
export default function CrushAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "impact" | "crush" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("impact");
    const t1 = setTimeout(() => setPhase("crush"), 120);
    const t2 = setTimeout(finish, 800);
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
                    scale: [1, 1.02, 1],
                    boxShadow: [
                      "0 0 0px 0px hsl(0 0% 100% / 0)",
                      "0 0 24px 8px hsl(0 0% 100% / 0.5)",
                      "0 0 0px 0px hsl(0 0% 100% / 0)",
                    ],
                  } : {}}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden relative">
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" style={item.imageStyle} draggable={false} />
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
                  <motion.div
                    className="absolute inset-0 origin-center"
                    initial={{ scaleX: 1, scaleY: 1, opacity: 1, rotateX: 0 }}
                    animate={
                      phase === "impact"
                        ? { scaleX: 1.01, scaleY: 0.99, opacity: 1, rotateX: 0 }
                        : phase === "crush"
                        ? { scaleX: 0.3, scaleY: 0.15, opacity: 0, rotateX: 10 }
                        : {}
                    }
                    transition={{
                      duration: phase === "impact" ? 0.1 : 0.45,
                      ease: phase === "crush" ? [0.55, 0, 1, 0.45] : "easeOut",
                    }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" style={item.imageStyle} draggable={false} />
                  </motion.div>

                  {(phase === "impact" || phase === "crush") && (
                    <motion.div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        className="rounded-full border-2 border-foreground/20"
                        initial={{ width: 10, height: 10, opacity: 0.8 }}
                        animate={{ width: 300, height: 300, opacity: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </motion.div>
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
