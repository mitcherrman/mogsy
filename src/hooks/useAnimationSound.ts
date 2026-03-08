import { useCallback, useRef, useEffect } from "react";
import { useSoundSettings, SoundSettings } from "@/hooks/useSoundSettings";

export function useAnimationSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ripBufferRef = useRef<AudioBuffer | null>(null);
  const loadingRef = useRef(false);
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);
  useEffect(() => { settingsRef.current = soundSettings; }, [soundSettings]);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  };

  const chopBufferRef = useRef<AudioBuffer | null>(null);
  const chopLoadingRef = useRef(false);

  const loadRipSound = useCallback(async () => {
    if (ripBufferRef.current || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const ctx = getCtx();
      const res = await fetch("/sounds/card-rip.mp3");
      const buf = await res.arrayBuffer();
      ripBufferRef.current = await ctx.decodeAudioData(buf);
    } catch {}
    loadingRef.current = false;
  }, []);

  const loadChopSound = useCallback(async () => {
    if (chopBufferRef.current || chopLoadingRef.current) return;
    chopLoadingRef.current = true;
    try {
      const ctx = getCtx();
      const res = await fetch("/sounds/youre-chopped.mp3");
      const buf = await res.arrayBuffer();
      chopBufferRef.current = await ctx.decodeAudioData(buf);
    } catch {}
    chopLoadingRef.current = false;
  }, []);

  const playRipSound = useCallback(async () => {
    if (!settingsRef.current.anim_paper_rip) return;
    try {
      const ctx = getCtx();
      if (!ripBufferRef.current) await loadRipSound();
      if (!ripBufferRef.current) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.buffer = ripBufferRef.current;
      source.connect(gain); gain.connect(ctx.destination);
      source.start();
    } catch {}
  }, [loadRipSound]);

  const playShatterSound = useCallback(() => {
    if (!settingsRef.current.anim_shatter) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      const filter = ctx.createBiquadFilter(); filter.type = "highpass"; filter.frequency.value = 2000;
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(t); noise.stop(t + 0.15);
      const osc = ctx.createOscillator(); const g2 = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      g2.gain.setValueAtTime(0.1, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(g2); g2.connect(ctx.destination); osc.start(t); osc.stop(t + 0.12);
    } catch {}
  }, []);

  const playBurnSound = useCallback(() => {
    if (!settingsRef.current.anim_burn) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      const filter = ctx.createBiquadFilter(); filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, t); filter.frequency.exponentialRampToValueAtTime(2000, t + 0.3); filter.Q.value = 1;
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(t); noise.stop(t + 0.4);
    } catch {}
  }, []);

  const playVaporizeSound = useCallback(() => {
    if (!settingsRef.current.anim_vaporize) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = "sine";
        const freq = 1200 + Math.random() * 2000; const delay = i * 0.06;
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + delay + 0.15);
        g.gain.setValueAtTime(0.04, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t + delay); osc.stop(t + delay + 0.16);
      }
    } catch {}
  }, []);

  const playCrushSound = useCallback(() => {
    if (!settingsRef.current.anim_crush) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(100, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.15);
      g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t + 0.22);
      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.08, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      noise.connect(g2); g2.connect(ctx.destination); noise.start(t); noise.stop(t + 0.1);
    } catch {}
  }, []);

  const playChopSound = useCallback(async () => {
    try {
      const ctx = getCtx();
      if (!chopBufferRef.current) await loadChopSound();
      if (!chopBufferRef.current) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.6;
      source.buffer = chopBufferRef.current;
      source.connect(gain); gain.connect(ctx.destination);
      source.start();
    } catch {}
  }, [loadChopSound]);

  const playAnimationSound = useCallback((animationId: string) => {
    switch (animationId) {
      case "slice": playRipSound(); break;
      case "shatter": playShatterSound(); break;
      case "burn": playBurnSound(); break;
      case "vaporize": playVaporizeSound(); break;
      case "crush": playCrushSound(); break;
      case "chop": playChopSound(); break;
      default: break;
    }
  }, [playRipSound, playShatterSound, playBurnSound, playVaporizeSound, playCrushSound, playChopSound]);

  return { playAnimationSound, preloadSounds: loadRipSound };
}
