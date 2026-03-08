import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback, useMemo } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Thanos-snap style disintegration into floating particles */
export default function VaporizeAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "dissolve" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("dissolve");
    const t = setTimeout(finish, 900);
    return () => clearTimeout(t);
  }, [winnerSide, finish]);

  const particles = useMemo(() =>
    Array.from({ length: 30 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      dx: (Math.random() - 0.5) * 100,
      dy: -20 - Math.random() * 80,
      size: 3 + Math.random() * 6,
      delay: Math.random() * 0.25,
      dur: 0.4 + Math.random() * 0.3,
    })), []);

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
                      "0 0 0px 0px hsla(180, 100%, 50%, 0)",
                      "0 0 18px 4px hsla(180, 100%, 60%, 0.4)",
                      "0 0 18px 4px hsla(270, 100%, 60%, 0.4)",
                      "0 0 10px 2px hsla(220, 100%, 60%, 0.2)",
                    ],
                  } : {}}
                  transition={{ duration: 0.8, delay: 0.1 }}
                >
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden">
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </div>
                  <AnimationCardStats item={item} />
                </motion.div>
              );
            }

            return (
              <div key={idx} className="flex-1 flex flex-col min-h-0 relative rounded-2xl border border-border bg-card overflow-hidden">
                <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] relative overflow-hidden">
                  <motion.div className="absolute inset-0"
                    initial={{ opacity: 1 }}
                    animate={phase === "dissolve" ? { opacity: 0 } : {}}
                    transition={{ duration: 0.6, delay: 0.1 }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </motion.div>

                  {phase === "dissolve" && particles.map((p, i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full bg-muted-foreground/40"
                      style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
                      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      animate={{ opacity: 0, x: p.dx, y: p.dy, scale: 0.2 }}
                      transition={{ duration: p.dur, delay: p.delay, ease: "easeOut" }}
                    />
                  ))}
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
