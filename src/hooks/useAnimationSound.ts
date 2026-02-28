import { useCallback, useRef } from "react";

/**
 * Plays animation-specific sound effects.
 * - slice: plays the uploaded paper-rip MP3
 * - shatter: synthesized glass shatter
 * - burn: synthesized fire whoosh
 * - vaporize: synthesized dissolve
 * - crush: synthesized impact
 * - default: uses the existing swipe pop (no extra sound)
 */
export function useAnimationSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ripBufferRef = useRef<AudioBuffer | null>(null);
  const loadingRef = useRef(false);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  };

  // Preload rip sound
  const loadRipSound = useCallback(async () => {
    if (ripBufferRef.current || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const ctx = getCtx();
      const res = await fetch("/sounds/card-rip.mp3");
      const buf = await res.arrayBuffer();
      ripBufferRef.current = await ctx.decodeAudioData(buf);
    } catch { /* silent */ }
    loadingRef.current = false;
  }, []);

  const playRipSound = useCallback(async () => {
    try {
      const ctx = getCtx();
      if (!ripBufferRef.current) await loadRipSound();
      if (!ripBufferRef.current) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.buffer = ripBufferRef.current;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch { /* silent */ }
  }, [loadRipSound]);

  const playShatterSound = useCallback(() => {
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      // White noise burst for glass shatter
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 2000;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.15);

      // Impact thud
      const osc = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      g2.gain.setValueAtTime(0.1, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(g2);
      g2.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    } catch { /* silent */ }
  }, []);

  const playBurnSound = useCallback(() => {
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      // Fire whoosh — filtered noise sweep
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
      filter.Q.value = 1;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.4);
    } catch { /* silent */ }
  }, []);

  const playVaporizeSound = useCallback(() => {
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      // Sparkle dissolve — high sine cascade
      for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        const freq = 1200 + Math.random() * 2000;
        const delay = i * 0.06;
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + delay + 0.15);
        g.gain.setValueAtTime(0.04, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.16);
      }
    } catch { /* silent */ }
  }, []);

  const playCrushSound = useCallback(() => {
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      // Heavy impact — low thud + crunch
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.15);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);

      // Crunch noise
      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      noise.connect(g2);
      g2.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.1);
    } catch { /* silent */ }
  }, []);

  const playAnimationSound = useCallback((animationId: string) => {
    switch (animationId) {
      case "slice": playRipSound(); break;
      case "shatter": playShatterSound(); break;
      case "burn": playBurnSound(); break;
      case "vaporize": playVaporizeSound(); break;
      case "crush": playCrushSound(); break;
      default: break; // "default" uses the existing swipe pop
    }
  }, [playRipSound, playShatterSound, playBurnSound, playVaporizeSound, playCrushSound]);

  return { playAnimationSound, preloadSounds: loadRipSound };
}
