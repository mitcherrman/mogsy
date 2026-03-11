import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Gigachad appears over the loser's card */
export default function MoggedAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "appear" | "mogged" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("appear");
    const t1 = setTimeout(() => setPhase("mogged"), 300);
    const t2 = setTimeout(finish, 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [winnerSide, finish]);

  if (winnerSide === null || items.length < 2) return null;

  const loserIdx = winnerSide === 0 ? 1 : 0;

  return (
    <AnimatePresence>
      <motion.div className="absolute inset-0 z-[70] pointer-events-none bg-background"
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
                      "0 0 0px 0px hsla(45, 100%, 50%, 0)",
                      "0 0 30px 8px hsla(45, 100%, 50%, 0.5)",
                      "0 0 15px 4px hsla(45, 100%, 50%, 0.25)",
                    ],
                  } : {}}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] overflow-hidden relative">
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain" style={item.imageStyle} draggable={false} />
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
                    {/* Golden crown halo at top */}
                    {phase !== "idle" && (
                      <motion.div
                        className="absolute top-0 left-0 right-0 h-16 pointer-events-none"
                        style={{ background: "linear-gradient(to bottom, hsla(45, 100%, 55%, 0.35), transparent)" }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0.6] }}
                        transition={{ duration: 0.6, delay: 0.25 }}
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
                  {/* Original card fading to grayscale */}
                  <motion.div
                    className="absolute inset-0"
                    initial={{ filter: "grayscale(0) brightness(1)", opacity: 1 }}
                    animate={
                      phase === "mogged" || phase === "done"
                        ? { filter: "grayscale(1) brightness(0.4)", opacity: 0.5 }
                        : {}
                    }
                    transition={{ duration: 0.5 }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain" style={item.imageStyle} draggable={false} />
                  </motion.div>

                  {/* Gigachad rising from bottom */}
                  <motion.div
                    className="absolute inset-0 flex items-end justify-center overflow-hidden"
                    initial={{ opacity: 0, y: 40 }}
                    animate={
                      phase === "appear" || phase === "mogged" || phase === "done"
                        ? { opacity: 0.7, y: 0 }
                        : {}
                    }
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <img
                      src="/images/gigachad-nobg.png"
                      alt=""
                      className="w-[90%] h-auto grayscale"
                      style={{ maskImage: "linear-gradient(to top, black 30%, transparent 90%)" }}
                      draggable={false}
                    />
                  </motion.div>

                  {/* MOGGED stamp */}
                  {(phase === "mogged" || phase === "done") && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                      initial={{ scale: 3, opacity: 0, rotate: -8 }}
                      animate={{ scale: 1, opacity: 1, rotate: -8 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span
                        className="text-4xl md:text-5xl lg:text-6xl font-black tracking-[0.15em] uppercase select-none"
                        style={{
                          color: "hsl(0, 0%, 95%)",
                          textShadow: "0 2px 12px hsl(0 0% 0% / 0.8)",
                          fontFamily: "Impact, sans-serif",
                        }}
                      >
                        MOGGED
                      </span>
                    </motion.div>
                  )}

                  {/* Vignette overlay */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={phase !== "idle" ? { opacity: 0.6 } : {}}
                    transition={{ duration: 0.4 }}
                    style={{ background: "radial-gradient(ellipse at center, transparent 20%, hsl(0,0%,0%) 100%)" }}
                  />
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
