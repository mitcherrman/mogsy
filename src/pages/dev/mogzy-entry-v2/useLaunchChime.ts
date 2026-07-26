import { useCallback, useEffect, useRef } from "react";

import { useSoundSettings, type SoundSettings } from "@/hooks/useSoundSettings";

/**
 * The original pre-Mogzy entrance chime, preserved verbatim.
 *
 * Ported unchanged from src/pages/Index.tsx (introduced 3363e3a, gated on the
 * `launch_chime` sound setting in 5eee213) so the V2 entrance keeps the exact
 * same sound. This is a copy rather than a refactor on purpose: the legacy
 * page must stay untouched while V2 is explored.
 *
 * Bright ascending sine 600 -> 1200 Hz plus a triangle shimmer 900 -> 1800 Hz.
 * No audio file is involved — it is synthesized through the Web Audio API.
 */
export function useLaunchChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);

  useEffect(() => {
    settingsRef.current = soundSettings;
  }, [soundSettings]);

  useEffect(
    () => () => {
      // Dev prototype: release the context when the route unmounts so repeated
      // visits during visual iteration don't leak AudioContexts.
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    },
    [],
  );

  return useCallback(() => {
    if (!settingsRef.current.launch_chime) return;
    try {
      const ctx = ctxRef.current || new AudioContext();
      ctxRef.current = ctx;
      const t = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(600, t);
      osc1.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
      g1.gain.setValueAtTime(0.12, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc1.connect(g1);
      g1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.35);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(900, t + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(1800, t + 0.2);
      g2.gain.setValueAtTime(0.06, t + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t + 0.05);
      osc2.stop(t + 0.4);
    } catch {
      /* silent */
    }
  }, []);
}
