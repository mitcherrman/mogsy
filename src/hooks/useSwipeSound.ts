import { useCallback, useRef } from "react";

// Generate a subtle, satisfying "pop" sound using Web Audio API
export function useSwipeSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const playSwipeSound = useCallback(() => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;

      // Main pop tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);

      // Subtle harmonic
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.03);
      osc2.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0.03, ctx.currentTime + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.03);
      osc2.stop(ctx.currentTime + 0.18);
    } catch {
      // Silently fail if audio isn't available
    }
  }, []);

  return { playSwipeSound };
}
