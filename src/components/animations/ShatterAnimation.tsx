import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback, useMemo } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Card shatters into grid fragments that fly outward */
export default function ShatterAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "shatter" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("shatter");
    const t = setTimeout(finish, 800);
    return () => clearTimeout(t);
  }, [winnerSide, finish]);

  const fragments = useMemo(() => {
    const cols = 4, rows = 5;
    const frags = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) / cols - 0.5;
        const cy = (r + 0.5) / rows - 0.5;
        const angle = Math.atan2(cy, cx);
        const dist = 80 + Math.random() * 120;
        frags.push({
          r, c,
          clipPath: `inset(${(r / rows) * 100}% ${((cols - c - 1) / cols) * 100}% ${((rows - r - 1) / rows) * 100}% ${(c / cols) * 100}%)`,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          rotate: (Math.random() - 0.5) * 60,
          delay: Math.random() * 0.08,
        });
      }
    }
    return frags;
  }, []);

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
                      "0 0 0px 0px hsl(0 0% 100% / 0)",
                      "0 0 20px 4px hsl(0 0% 100% / 0.4)",
                      "0 0 8px 2px hsl(0 0% 100% / 0.15)",
                    ],
                  } : {}}
                  transition={{ duration: 0.6, delay: 0.1 }}
                >
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden relative">
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
                    {/* Diamond sparkle particles */}
                    {phase !== "idle" && Array.from({ length: 8 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1.5 h-1.5 bg-foreground/60 rounded-full"
                        style={{
                          left: `${10 + (i * 12)}%`,
                          top: i % 2 === 0 ? "5%" : "90%",
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], y: i % 2 === 0 ? -8 : 8 }}
                        transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease: "easeOut" }}
                      />
                    ))}
                  </div>
                  <AnimationCardStats item={item} />
                </motion.div>
              );
            }

            return (
              <div key={idx} className="flex-1 flex flex-col min-h-0 relative rounded-2xl border border-border bg-card overflow-hidden">
                <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] relative overflow-hidden">
                  {fragments.map((f, fi) => (
                    <motion.div
                      key={fi}
                      className="absolute inset-0"
                      style={{ clipPath: f.clipPath }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                      animate={phase === "shatter" ? {
                        x: f.x, y: f.y, rotate: f.rotate, opacity: 0, scale: 0.6,
                      } : {}}
                      transition={{ duration: 0.5, delay: f.delay, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                    </motion.div>
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
