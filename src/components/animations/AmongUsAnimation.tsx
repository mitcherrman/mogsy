import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import AnimationCardStats, { type AnimationCardItem } from "./AnimationCardStats";

interface Props { winnerSide: 0 | 1 | null; items: AnimationCardItem[]; onComplete: () => void; }

function getImageUrl(item: AnimationCardItem): string {
  return item.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1a2e&color=00d4ff&size=400`;
}

/** Among Us backstab — loser gets stabbed and fades to red, GIF flashes over them */
export default function AmongUsAnimation({ winnerSide, items, onComplete }: Props) {
  const [phase, setPhase] = useState<"idle" | "stab" | "dead" | "done">("idle");

  const finish = useCallback(() => { setPhase("done"); onComplete(); }, [onComplete]);

  useEffect(() => {
    if (winnerSide === null) { setPhase("idle"); return; }
    setPhase("stab");
    const t1 = setTimeout(() => setPhase("dead"), 400);
    const t2 = setTimeout(finish, 1200);
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
                      "0 0 0px 0px hsla(0, 100%, 50%, 0)",
                      "0 0 20px 5px hsla(0, 100%, 50%, 0.4)",
                      "0 0 10px 3px hsla(0, 100%, 50%, 0.15)",
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
                  </div>
                  <AnimationCardStats item={item} />
                </motion.div>
              );
            }

            return (
              <div key={idx} className="flex-1 flex flex-col min-h-0 relative rounded-2xl border border-border bg-card overflow-hidden">
                <div className="w-full portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4] relative overflow-hidden">
                  {/* Loser image fades and turns red */}
                  <motion.div className="absolute inset-0"
                    initial={{ opacity: 1 }}
                    animate={phase === "stab" ? { opacity: 0.7 } : phase === "dead" ? { opacity: 0 } : {}}
                    transition={{ duration: phase === "dead" ? 0.5 : 0.2 }}
                  >
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-contain bg-muted/30" draggable={false} />
                  </motion.div>

                  {/* Red blood overlay */}
                  {(phase === "stab" || phase === "dead") && (
                    <motion.div
                      className="absolute inset-0 bg-red-600/60"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: phase === "dead" ? 0.8 : 0.4 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}

                  {/* Among Us GIF overlay — appears on stab */}
                  {(phase === "stab" || phase === "dead") && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center z-10"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: phase === "dead" ? 0 : 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      <img
                        src="/images/amongus-backstab.gif"
                        alt="Among Us backstab"
                        className="w-3/4 h-3/4 object-contain drop-shadow-2xl"
                        draggable={false}
                      />
                    </motion.div>
                  )}

                  {/* "EJECTED" text */}
                  {phase === "dead" && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center z-20"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    >
                      <span className="text-2xl md:text-3xl font-black text-white tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] select-none"
                        style={{ textShadow: "0 0 20px rgba(255,0,0,0.6)" }}>
                        EJECTED
                      </span>
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
