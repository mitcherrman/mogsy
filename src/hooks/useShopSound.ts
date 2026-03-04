import { useCallback, useRef, useEffect } from "react";
import { useSoundSettings, SoundSettings } from "@/hooks/useSoundSettings";

export function useShopSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);
  useEffect(() => { settingsRef.current = soundSettings; }, [soundSettings]);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  };

  const playPurchaseSound = useCallback(() => {
    if (!settingsRef.current.shop_purchase) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        gain.gain.setValueAtTime(0.08, t + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.25);
      });
    } catch {}
  }, []);

  const playDiamondTap = useCallback(() => {
    if (!settingsRef.current.shop_diamond_tap) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(2400, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.05);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.1);
    } catch {}
  }, []);

  const playPowerUpSound = useCallback(() => {
    if (!settingsRef.current.shop_powerup) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.22);
    } catch {}
  }, []);

  return { playPurchaseSound, playDiamondTap, playPowerUpSound };
}
