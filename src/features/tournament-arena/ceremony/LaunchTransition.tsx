/**
 * The Host Portal's launch: gold bars sweep across, a burst, the word. Then
 * the organizer lands in the event. ~1.4 s with motion, a short fade without.
 */
import { useEffect, type CSSProperties } from "react";

import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import { ARENA_SFX } from "../audio";

export function LaunchTransition({ title, onDone, sfxId }: { title: string; onDone: () => void; sfxId: string }) {
  const motion = useMotionAllowed();
  const sfx = useSfx();
  useEffect(() => {
    sfx.play(ARENA_SFX.launch, { eventId: sfxId });
    const t = window.setTimeout(onDone, motion ? 1500 : 400);
    return () => window.clearTimeout(t);
  }, [motion, onDone, sfx, sfxId]);
  return (
    <div className={cn("ta ta-launch", motion && "ta-cine--motion ta-cine--in")} role="status" aria-live="polite" data-testid="ta-launch">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden="true" className="ta-launch__bar" style={{ top: `${8 + i * 18}%`, "--i": i } as CSSProperties} />
      ))}
      <span aria-hidden="true" className="ta-launch__burst" />
      <div className="ta-launch__word relative flex flex-col items-center gap-2 text-center">
        <p className="ta-eyebrow">Opening the Arena</p>
        <h2 className="ta-title ta-title--gold text-[28px] font-black uppercase tracking-[0.2em] sm:text-[48px]">{title}</h2>
      </div>
    </div>
  );
}
