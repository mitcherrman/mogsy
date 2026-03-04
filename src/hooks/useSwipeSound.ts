import { useCallback, useRef, useEffect, useState } from "react";
import { useSoundSettings, SoundSettings, SOUND_DEFAULTS } from "@/hooks/useSoundSettings";

export function useSwipeSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);
  useEffect(() => { settingsRef.current = soundSettings; }, [soundSettings]);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  };

  const playSwipeSound = useCallback(() => {
    if (!settingsRef.current.swipe_tap) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(600, t);
      osc1.frequency.exponentialRampToValueAtTime(450, t + 0.035);
      g1.gain.setValueAtTime(0.08, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc1.connect(g1); g1.connect(ctx.destination);
      osc1.start(t); osc1.stop(t + 0.06);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1800, t);
      osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.03);
      g2.gain.setValueAtTime(0.025, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc2.connect(g2); g2.connect(ctx.destination);
      osc2.start(t); osc2.stop(t + 0.05);
    } catch {}
  }, []);

  const playCorrectSound = useCallback(() => {
    if (!settingsRef.current.correct_chime) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "sine"; o1.frequency.setValueAtTime(880, t);
      g1.gain.setValueAtTime(0.07, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o1.connect(g1); g1.connect(ctx.destination); o1.start(t); o1.stop(t + 0.13);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine"; o2.frequency.setValueAtTime(1174.66, t + 0.08);
      g2.gain.setValueAtTime(0.07, t + 0.08); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o2.connect(g2); g2.connect(ctx.destination); o2.start(t + 0.08); o2.stop(t + 0.23);
    } catch {}
  }, []);

  const playWrongSound = useCallback(() => {
    if (!settingsRef.current.wrong_tone) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(250, t + 0.15);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    } catch {}
  }, []);

  return { playSwipeSound, playCorrectSound, playWrongSound };
}
