import { useEffect, useMemo, useRef } from "react";

import { useSoundSettings, type SoundSettings } from "@/hooks/useSoundSettings";

// ---------------------------------------------------------------------------
// The tome's two sounds (HI1-C2): a quill scratching while a phrase is being
// written, and a sheet of paper turning when the visitor presses Next.
//
// SYNTHESIZED, NOT SAMPLED. The repo's sound shelf was searched first —
// public/sounds/ holds meme clips and a card RIP (violent, wrong texture for a
// quiet page), and public/quiz-broadcast/audio/ belongs to the broadcast
// pipeline. Nothing there is a quill or a page. Rather than introduce media of
// uncertain licence, both sounds are shaped noise through the Web Audio API —
// exactly how the app already makes its shatter/burn/crush effects (see
// useAnimationSound). Variation is built in: every scribble reads a different
// window of the noise buffer at a slightly different rate through a slightly
// different filter, so nothing loops.
//
// GATED BY THE EXISTING SETTINGS. No new preference store: two keys in the
// app's one SoundSettings object (welcome_scribble / welcome_page_turn),
// admin-toggled with everything else and silenced by the same global mute.
//
// FAIL-SOFT, ALWAYS. No AudioContext, a suspended context (autoplay policy —
// the introduction starts writing before the visitor has touched anything),
// a decode quirk: all of it is silence, never an error. The page must behave
// identically with sound and without it.
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let scribbleStop: (() => void) | null = null;
let lastPageTurnAt = 0;

/** True once the visitor has interacted — before that, autoplay would be
 * blocked anyway, so nothing even tries. Same pattern as ui-sfx.ts. */
let hasUserInteracted = false;
if (typeof window !== "undefined") {
  const mark = () => {
    hasUserInteracted = true;
  };
  window.addEventListener("pointerdown", mark, { once: true, passive: true });
  window.addEventListener("keydown", mark, { once: true, passive: true });
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx.state === "running" ? ctx : null;
  } catch {
    return null;
  }
}

/** Two seconds of white noise, built once and windowed into forever. */
function getNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * The engine, as one spyable object. The hook below is what components use;
 * the object exists so tests can observe "a scribble was asked for" without
 * standing up a fake AudioContext.
 */
export const tomeAudioEngine = {
  /**
   * A quill laying down one phrase: `ms` of faint scratching, shaped into a
   * handful of irregular strokes. Starting a new scribble silences the previous
   * one — only one pen writes at a time.
   */
  scribble(ms: number): void {
    this.stopScribble();
    if (!hasUserInteracted || ms <= 0) return;
    try {
      const c = getCtx();
      if (!c) return;
      const t0 = c.currentTime;
      const dur = Math.min(2.2, ms / 1000);

      const src = c.createBufferSource();
      src.buffer = getNoise(c);
      // A different window at a different speed each time — no two phrases
      // sound alike, and nothing reads as a loop.
      src.playbackRate.value = 0.85 + Math.random() * 0.3;

      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1500 + Math.random() * 700;
      band.Q.value = 0.9;
      const high = c.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 900;

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      // Irregular strokes: quick swells with tiny gaps, the way a hand writes —
      // never a flat hiss.
      let t = t0;
      const end = t0 + dur;
      while (t < end - 0.05) {
        const stroke = 0.07 + Math.random() * 0.12;
        const peak = 0.028 + Math.random() * 0.02;
        gain.gain.exponentialRampToValueAtTime(peak, Math.min(end, t + stroke * 0.35));
        gain.gain.exponentialRampToValueAtTime(0.006, Math.min(end, t + stroke));
        t += stroke + 0.02 + Math.random() * 0.06;
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);

      src.connect(band);
      band.connect(high);
      high.connect(gain);
      gain.connect(c.destination);
      src.start(t0, Math.random() * 1.2);
      src.stop(end + 0.06);

      scribbleStop = () => {
        try {
          gain.gain.cancelScheduledValues(c.currentTime);
          gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.03);
          src.stop(c.currentTime + 0.05);
        } catch {
          // Already stopped — nothing to silence.
        }
      };
      src.onended = () => {
        scribbleStop = null;
      };
    } catch {
      // Best-effort sound playback; failure is intentionally silence.
    }
  },

  /** Silence the pen at once — the visitor skipped the reveal. */
  stopScribble(): void {
    if (scribbleStop) {
      scribbleStop();
      scribbleStop = null;
    }
  },

  /**
   * One sheet turning: a soft noise swish that rises as the page lifts and
   * lands with the faintest settle. Debounced so a burst of clicks cannot
   * stack flips — though the page-turn state machine already prevents that.
   */
  pageTurn(): void {
    if (!hasUserInteracted) return;
    const now = Date.now();
    if (now - lastPageTurnAt < 300) return;
    lastPageTurnAt = now;
    try {
      const c = getCtx();
      if (!c) return;
      const t = c.currentTime;

      const src = c.createBufferSource();
      src.buffer = getNoise(c);
      src.playbackRate.value = 0.95 + Math.random() * 0.1;

      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 0.7;
      // The lift: the sheet sliding up through the air…
      band.frequency.setValueAtTime(500, t);
      band.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
      // …and over, falling back toward the paper.
      band.frequency.exponentialRampToValueAtTime(750, t + 0.55);

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.075, t + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.02, t + 0.45);
      // The settle — a soft press as the sheet lands.
      gain.gain.exponentialRampToValueAtTime(0.045, t + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);

      src.connect(band);
      band.connect(gain);
      gain.connect(c.destination);
      src.start(t, Math.random() * 1.0);
      src.stop(t + 0.8);
    } catch {
      // Best-effort sound playback; failure is intentionally silence.
    }
  },
};

export interface TomeAudio {
  /** Scratch for roughly `ms` while a phrase writes. No-op if disabled. */
  scribble: (ms: number) => void;
  /** Stop the scratching immediately (skip pressed, chapter turned). */
  stopScribble: () => void;
  /** One paper turn, as the page begins lifting. No-op if disabled. */
  pageTurn: () => void;
}

/**
 * The tome's sounds, gated by the app's one sound-settings store. Settings are
 * read through a ref so the callbacks stay stable — the page wires them into
 * effects that must not re-fire on a settings fetch resolving.
 */
export function useTomeAudio(): TomeAudio {
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);
  useEffect(() => {
    settingsRef.current = soundSettings;
  }, [soundSettings]);

  return useMemo(
    () => ({
      scribble(ms: number) {
        if (settingsRef.current.welcome_scribble) tomeAudioEngine.scribble(ms);
      },
      stopScribble() {
        tomeAudioEngine.stopScribble();
      },
      pageTurn() {
        if (settingsRef.current.welcome_page_turn) tomeAudioEngine.pageTurn();
      },
    }),
    [],
  );
}
