import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Hearthstone-style disenchant: golden glow then dissolve from edges */
export default function BurnAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "glow" | "burn" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("glow");
    const t1 = setTimeout(() => setPhase("burn"), 200);
    const t2 = setTimeout(finish, 900);
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
                <div key={idx} className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden">
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </div>
                  <AnimationCardStats item={item} />
                </div>
              );
            }

            return (
              <div key={idx} className="flex-1 flex flex-col min-h-0 relative rounded-2xl border border-border bg-card overflow-hidden">
                <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] relative overflow-hidden">
                  <motion.div
                    className="absolute inset-0"
                    initial={{ opacity: 1, scale: 1, filter: "brightness(1)" }}
                    animate={
                      phase === "glow"
                        ? { opacity: 1, scale: 1.005, filter: "brightness(1.8) saturate(1.5)" }
                        : phase === "burn"
                        ? { opacity: 0, scale: 1.02, filter: "brightness(3) saturate(0)" }
                        : {}
                    }
                    transition={{ duration: phase === "glow" ? 0.2 : 0.5, ease: "easeOut" }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-white" draggable={false} />
                  </motion.div>

                  <motion.div
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: "radial-gradient(circle, hsla(45, 100%, 60%, 0.6), hsla(30, 100%, 50%, 0.3), transparent)" }}
                    initial={{ opacity: 0 }}
                    animate={phase === "glow" ? { opacity: 0.8 } : { opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  />

                  {phase === "burn" && (
                    <>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-1.5 h-1.5 rounded-full"
                          style={{
                            background: `hsl(${30 + Math.random() * 30}, 100%, ${50 + Math.random() * 20}%)`,
                            left: `${10 + Math.random() * 80}%`,
                            top: `${10 + Math.random() * 80}%`,
                          }}
                          initial={{ opacity: 1, y: 0, scale: 1 }}
                          animate={{ opacity: 0, y: -40 - Math.random() * 60, scale: 0.3, x: (Math.random() - 0.5) * 40 }}
                          transition={{ duration: 0.4 + Math.random() * 0.3, delay: Math.random() * 0.15, ease: "easeOut" }}
                        />
                      ))}
                    </>
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
