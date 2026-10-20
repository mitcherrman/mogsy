/**
 * VIS-F3 — the Dynasty sound engine: scene-aware ambient loops, crowd
 * one-shots and the twelve signature cues from `vis_f2_support/03_AUDIO_HOOKS.md`,
 * plus `playMoment()` as the single entry point the screens call.
 *
 * PROVENANCE. Every sound here is ORIGINAL: synthesised at runtime with the
 * Web Audio API (oscillators, filtered noise, envelopes). No files are
 * loaded, nothing is licensed from anyone, nothing is Riot audio and nothing
 * is a third-party clip. Per the support package's sourcing rules this is the
 * "original" class; a licensed or recorded replacement for any cue can be
 * bound later in Audio Studio against the same `dynasty.*` id without a code
 * change here, because the cue ids match 03's table.
 *
 * Why not the shared SFX registry: it is a shared file (`src/lib/audio/`),
 * and VIS-F3 keeps its footprint inside `dynasty-v2/`. The engine honours the
 * same global contract instead: the `mogsy-sounds-muted` key and its change
 * event, the first-gesture unlock rule, and a per-cue replay guard. It also
 * adds a Dynasty volume (0..1, local storage) and a loops switch.
 *
 * Reduced motion does not silence audio (sound is not motion); the player's
 * mute and volume do.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { SceneId } from "./media";

// ───────────────────────────────────────────────────────────── settings

export const DYN_AUDIO_KEYS = { volume: "dynasty.audio.volume", loops: "dynasty.audio.loops", muted: "mogsy-sounds-muted" } as const;
const MUTE_EVENT = "mogsy-sounds-muted-changed";

export interface DynAudioSnapshot { muted: boolean; volume: number; loops: boolean; unlocked: boolean; scene: SceneId | null; tension: boolean; lastCue: string | null; supported: boolean }

const read = (k: string) => { try { return typeof localStorage === "undefined" ? null : localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* optional */ } };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface Engine {
  ctx: AudioContext | null;
  master: GainNode | null;
  loopBus: GainNode | null;
  cueBus: GainNode | null;
  loops: Map<string, { gain: GainNode; stop: () => void }>;
  scene: SceneId | null;
  tension: boolean;
  snap: DynAudioSnapshot;
  listeners: Set<() => void>;
  lastPlayed: Map<string, number>;
  unlockInstalled: boolean;
  noise: AudioBuffer | null;
}

const E: Engine = {
  ctx: null, master: null, loopBus: null, cueBus: null, loops: new Map(), scene: null, tension: false,
  snap: {
    muted: read(DYN_AUDIO_KEYS.muted) === "1",
    volume: (() => { const v = Number.parseFloat(read(DYN_AUDIO_KEYS.volume) ?? ""); return Number.isFinite(v) ? clamp01(v) : 0.6; })(),
    loops: read(DYN_AUDIO_KEYS.loops) !== "0",
    unlocked: false, scene: null, tension: false, lastCue: null,
    supported: typeof window !== "undefined" && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
  },
  listeners: new Set(), lastPlayed: new Map(), unlockInstalled: false, noise: null,
};

function emit() { E.snap = { ...E.snap }; E.listeners.forEach((l) => l()); }

function ensureCtx(): AudioContext | null {
  if (!E.snap.supported) return null;
  if (!E.ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try { E.ctx = new Ctor(); } catch { return null; }
    E.master = E.ctx.createGain(); E.master.connect(E.ctx.destination);
    E.loopBus = E.ctx.createGain(); E.loopBus.connect(E.master);
    E.cueBus = E.ctx.createGain(); E.cueBus.connect(E.master);
    applyGains();
  }
  return E.ctx;
}

function applyGains() {
  if (!E.ctx || !E.master || !E.loopBus) return;
  const t = E.ctx.currentTime;
  E.master.gain.setTargetAtTime(E.snap.muted ? 0 : E.snap.volume, t, 0.05);
  E.loopBus.gain.setTargetAtTime(E.snap.loops ? 0.9 : 0, t, 0.3);
}

async function unlock(): Promise<boolean> {
  const ctx = ensureCtx();
  if (!ctx) return false;
  if (ctx.state !== "running") { try { await ctx.resume(); } catch { return false; } }
  const ok = ctx.state === "running";
  if (ok && !E.snap.unlocked) { E.snap.unlocked = true; emit(); if (E.scene) setScene(E.scene, true); }
  return ok;
}

/** Install the first-gesture unlock (browser autoplay rules). Idempotent. */
export function installDynastyAudioUnlock() {
  if (E.unlockInstalled || typeof window === "undefined") return;
  E.unlockInstalled = true;
  const onGesture = () => { void unlock().then((ok) => { if (ok) ["pointerdown", "keydown", "touchend"].forEach((ev) => window.removeEventListener(ev, onGesture)); }); };
  ["pointerdown", "keydown", "touchend"].forEach((ev) => window.addEventListener(ev, onGesture, { passive: true }));
  window.addEventListener(MUTE_EVENT, () => { E.snap.muted = read(DYN_AUDIO_KEYS.muted) === "1"; applyGains(); emit(); });
  window.addEventListener("storage", (e) => { if (e.key === DYN_AUDIO_KEYS.muted) { E.snap.muted = e.newValue === "1"; applyGains(); emit(); } });
}

export const dynastyAudio = {
  subscribe(l: () => void) { E.listeners.add(l); return () => { E.listeners.delete(l); }; },
  getSnapshot(): DynAudioSnapshot { return E.snap; },
  setVolume(v: number) { E.snap.volume = clamp01(v); write(DYN_AUDIO_KEYS.volume, String(E.snap.volume)); applyGains(); emit(); },
  setLoops(on: boolean) { E.snap.loops = on; write(DYN_AUDIO_KEYS.loops, on ? "1" : "0"); applyGains(); emit(); },
  setMuted(m: boolean) { E.snap.muted = m; write(DYN_AUDIO_KEYS.muted, m ? "1" : "0"); try { window.dispatchEvent(new Event(MUTE_EVENT)); } catch { /* */ } applyGains(); emit(); },
  unlock,
};

export function useDynastyAudio(): DynAudioSnapshot {
  useEffect(() => { installDynastyAudioUnlock(); }, []);
  return useSyncExternalStore(dynastyAudio.subscribe, dynastyAudio.getSnapshot, dynastyAudio.getSnapshot);
}

// ───────────────────────────────────────────────────────────── synthesis helpers

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (E.noise) return E.noise;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) { // pink-ish noise
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  E.noise = buf;
  return buf;
}

function tone(ctx: AudioContext, out: AudioNode, { type = "sine", f0, f1, t0, dur, gain = 0.3, attack = 0.01, release = 0.2 }: { type?: OscillatorType; f0: number; f1?: number; t0: number; dur: number; gain?: number; attack?: number; release?: number }) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}

function hit(ctx: AudioContext, out: AudioNode, { t0, dur = 0.5, f = 110, gain = 0.6 }: { t0: number; dur?: number; f?: number; gain?: number }) {
  tone(ctx, out, { type: "sine", f0: f * 2, f1: f * 0.5, t0, dur, gain, attack: 0.005, release: dur * 0.8 });
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = "lowpass"; bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(120, t0 + dur * 0.6);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.6);
  n.connect(bp); bp.connect(g); g.connect(out); n.start(t0); n.stop(t0 + dur);
}

function swell(ctx: AudioContext, out: AudioNode, { t0, dur, gain = 0.35, fLo = 400, fHi = 2400 }: { t0: number; dur: number; gain?: number; fLo?: number; fHi?: number }) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8; bp.frequency.setValueAtTime(fLo, t0); bp.frequency.exponentialRampToValueAtTime(fHi, t0 + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(fLo, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(bp); bp.connect(g); g.connect(out); n.start(t0); n.stop(t0 + dur + 0.1);
}

function chord(ctx: AudioContext, out: AudioNode, { t0, freqs, dur, gain = 0.12, type = "triangle" }: { t0: number; freqs: number[]; dur: number; gain?: number; type?: OscillatorType }) {
  freqs.forEach((f, i) => tone(ctx, out, { type, f0: f, t0: t0 + i * 0.02, dur, gain, attack: 0.03, release: dur * 0.5 }));
}

// ───────────────────────────────────────────────────────────── cues (12 signature + supporting)

export type DynCue =
  | "dynasty.org.choose" | "dynasty.recruit.sign" | "dynasty.season.segment" | "dynasty.draft.lock_all" | "dynasty.draft.lock_role"
  | "dynasty.obj.dragon_start" | "dynasty.obj.baron_start" | "dynasty.obj.elder_start" | "dynasty.obj.teamfight_start"
  | "dynasty.obj.outcome_exceptional" | "dynasty.obj.outcome_success" | "dynasty.obj.outcome_partial" | "dynasty.obj.outcome_disaster"
  | "dynasty.crowd.swell" | "dynasty.crowd.roar" | "dynasty.crowd.gasp"
  | "dynasty.finals.intro" | "dynasty.end.championship" | "dynasty.end.defeat"
  | "dynasty.game.tile" | "dynasty.game.stage_open" | "dynasty.game.verdict" | "dynasty.game.closeout" | "dynasty.game.state_winning" | "dynasty.game.state_losing"
  | "dynasty.series.point" | "dynasty.series.match_point" | "dynasty.result.game_win" | "dynasty.result.game_loss" | "dynasty.ui.advance";

const MIN_REPLAY: Partial<Record<DynCue, number>> = { "dynasty.game.tile": 120, "dynasty.draft.lock_role": 80, "dynasty.ui.advance": 120, "dynasty.crowd.swell": 1500, "dynasty.crowd.roar": 2500, "dynasty.crowd.gasp": 1500 };

const VOICES: Record<DynCue, (ctx: AudioContext, out: AudioNode, t: number) => void> = {
  "dynasty.org.choose": (c, o, t) => { hit(c, o, { t0: t, f: 90, gain: 0.7 }); chord(c, o, { t0: t + 0.05, freqs: [262, 330, 392, 523], dur: 0.9, gain: 0.1, type: "sawtooth" }); },
  "dynasty.recruit.sign": (c, o, t) => { swell(c, o, { t0: t, dur: 0.25, gain: 0.15, fLo: 1200, fHi: 4000 }); hit(c, o, { t0: t + 0.22, f: 140, dur: 0.3, gain: 0.5 }); tone(c, o, { f0: 1046, t0: t + 0.3, dur: 0.5, gain: 0.12 }); tone(c, o, { f0: 1568, t0: t + 0.42, dur: 0.6, gain: 0.1 }); },
  "dynasty.season.segment": (c, o, t) => { swell(c, o, { t0: t, dur: 1.2, gain: 0.3 }); tone(c, o, { type: "sawtooth", f0: 110, f1: 220, t0: t, dur: 1.1, gain: 0.12 }); hit(c, o, { t0: t + 1.0, f: 80, dur: 0.8, gain: 0.6 }); },
  "dynasty.draft.lock_role": (c, o, t) => { tone(c, o, { type: "square", f0: 660, f1: 440, t0: t, dur: 0.07, gain: 0.08, attack: 0.002, release: 0.05 }); },
  "dynasty.draft.lock_all": (c, o, t) => { tone(c, o, { type: "square", f0: 220, f1: 110, t0: t, dur: 0.12, gain: 0.2, attack: 0.002 }); hit(c, o, { t0: t + 0.1, f: 70, dur: 0.7, gain: 0.7 }); },
  "dynasty.obj.dragon_start": (c, o, t) => { swell(c, o, { t0: t, dur: 1.3, gain: 0.4, fLo: 200, fHi: 1800 }); tone(c, o, { type: "sawtooth", f0: 65, f1: 98, t0: t + 0.2, dur: 1.2, gain: 0.14 }); },
  "dynasty.obj.baron_start": (c, o, t) => { tone(c, o, { type: "sine", f0: 120, f1: 36, t0: t, dur: 1.4, gain: 0.5, attack: 0.02, release: 0.9 }); swell(c, o, { t0: t + 0.2, dur: 1.4, gain: 0.3, fLo: 120, fHi: 900 }); tone(c, o, { type: "sawtooth", f0: 55, f1: 58, t0: t + 0.3, dur: 1.3, gain: 0.1 }); },
  "dynasty.obj.elder_start": (c, o, t) => { chord(c, o, { t0: t, freqs: [880, 1319, 1760, 2637], dur: 1.4, gain: 0.05, type: "sine" }); tone(c, o, { type: "triangle", f0: 110, t0: t, dur: 1.4, gain: 0.1 }); },
  "dynasty.obj.teamfight_start": (c, o, t) => { for (let i = 0; i < 6; i++) hit(c, o, { t0: t + i * 0.09, f: 120 + i * 10, dur: 0.18, gain: 0.3 }); swell(c, o, { t0: t, dur: 0.7, gain: 0.25, fLo: 2000, fHi: 6000 }); },
  "dynasty.obj.outcome_exceptional": (c, o, t) => { hit(c, o, { t0: t, f: 100, gain: 0.7 }); chord(c, o, { t0: t + 0.05, freqs: [392, 494, 587, 784], dur: 1.2, gain: 0.11, type: "sawtooth" }); tone(c, o, { f0: 1175, f1: 1568, t0: t + 0.5, dur: 1.0, gain: 0.08 }); },
  "dynasty.obj.outcome_success": (c, o, t) => { chord(c, o, { t0: t, freqs: [330, 415, 494, 659], dur: 0.9, gain: 0.1 }); },
  "dynasty.obj.outcome_partial": (c, o, t) => { chord(c, o, { t0: t, freqs: [294, 370, 440], dur: 0.6, gain: 0.1 }); chord(c, o, { t0: t + 0.55, freqs: [294, 392, 440], dur: 1.0, gain: 0.09 }); },
  "dynasty.obj.outcome_disaster": (c, o, t) => { swell(c, o, { t0: t, dur: 0.9, gain: 0.35, fLo: 3000, fHi: 300 }); hit(c, o, { t0: t + 0.8, f: 50, dur: 1.2, gain: 0.8 }); tone(c, o, { type: "sawtooth", f0: 110, f1: 55, t0: t + 0.8, dur: 1.2, gain: 0.08 }); },
  "dynasty.crowd.swell": (c, o, t) => swell(c, o, { t0: t, dur: 1.5, gain: 0.3, fLo: 300, fHi: 1200 }),
  "dynasty.crowd.roar": (c, o, t) => { swell(c, o, { t0: t, dur: 3.0, gain: 0.55, fLo: 250, fHi: 1600 }); swell(c, o, { t0: t + 0.1, dur: 2.6, gain: 0.3, fLo: 900, fHi: 3000 }); },
  "dynasty.crowd.gasp": (c, o, t) => { swell(c, o, { t0: t, dur: 0.5, gain: 0.3, fLo: 600, fHi: 2200 }); swell(c, o, { t0: t + 0.4, dur: 0.8, gain: 0.18, fLo: 400, fHi: 250 }); },
  "dynasty.finals.intro": (c, o, t) => { chord(c, o, { t0: t, freqs: [110, 165, 220], dur: 2.2, gain: 0.1, type: "sawtooth" }); swell(c, o, { t0: t, dur: 2.0, gain: 0.3, fLo: 300, fHi: 2400 }); tone(c, o, { type: "sawtooth", f0: 220, f1: 440, t0: t + 0.4, dur: 1.6, gain: 0.08 }); hit(c, o, { t0: t + 1.9, f: 70, dur: 1.0, gain: 0.9 }); chord(c, o, { t0: t + 1.95, freqs: [262, 392, 523, 659], dur: 1.0, gain: 0.1, type: "sawtooth" }); },
  "dynasty.end.championship": (c, o, t) => { hit(c, o, { t0: t, f: 90, dur: 0.8, gain: 0.8 }); chord(c, o, { t0: t + 0.05, freqs: [262, 330, 392], dur: 0.6, gain: 0.12, type: "sawtooth" }); chord(c, o, { t0: t + 0.65, freqs: [349, 440, 523], dur: 0.6, gain: 0.12, type: "sawtooth" }); chord(c, o, { t0: t + 1.3, freqs: [392, 494, 587, 784], dur: 1.8, gain: 0.13, type: "sawtooth" }); swell(c, o, { t0: t + 1.2, dur: 2.4, gain: 0.4, fLo: 300, fHi: 2000 }); hit(c, o, { t0: t + 1.3, f: 60, dur: 1.2, gain: 0.7 }); },
  "dynasty.end.defeat": (c, o, t) => { chord(c, o, { t0: t, freqs: [147, 175, 220], dur: 2.2, gain: 0.08 }); },
  "dynasty.game.tile": (c, o, t) => { tone(c, o, { type: "triangle", f0: 880, f1: 660, t0: t, dur: 0.06, gain: 0.07, attack: 0.002, release: 0.04 }); },
  "dynasty.game.stage_open": (c, o, t) => { swell(c, o, { t0: t, dur: 0.6, gain: 0.15 }); tone(c, o, { f0: 523, f1: 784, t0: t, dur: 0.35, gain: 0.08 }); },
  "dynasty.game.verdict": (c, o, t) => hit(c, o, { t0: t, f: 85, dur: 0.9, gain: 0.8 }),
  "dynasty.game.closeout": (c, o, t) => { hit(c, o, { t0: t, f: 80, dur: 0.9, gain: 0.8 }); chord(c, o, { t0: t + 0.1, freqs: [392, 494, 587], dur: 1.0, gain: 0.1, type: "sawtooth" }); },
  "dynasty.game.state_winning": (c, o, t) => { tone(c, o, { f0: 659, f1: 988, t0: t, dur: 0.35, gain: 0.1 }); tone(c, o, { f0: 988, t0: t + 0.3, dur: 0.4, gain: 0.08 }); },
  "dynasty.game.state_losing": (c, o, t) => { tone(c, o, { type: "triangle", f0: 220, f1: 165, t0: t, dur: 0.45, gain: 0.12 }); },
  "dynasty.series.point": (c, o, t) => { tone(c, o, { f0: 523, t0: t, dur: 0.15, gain: 0.1 }); tone(c, o, { f0: 784, t0: t + 0.14, dur: 0.3, gain: 0.1 }); },
  "dynasty.series.match_point": (c, o, t) => { tone(c, o, { type: "triangle", f0: 440, t0: t, dur: 0.25, gain: 0.12 }); tone(c, o, { type: "triangle", f0: 587, t0: t + 0.26, dur: 0.5, gain: 0.12 }); },
  "dynasty.result.game_win": (c, o, t) => { chord(c, o, { t0: t, freqs: [392, 494, 587, 784], dur: 1.1, gain: 0.1, type: "sawtooth" }); hit(c, o, { t0: t, f: 100, dur: 0.5, gain: 0.5 }); },
  "dynasty.result.game_loss": (c, o, t) => { chord(c, o, { t0: t, freqs: [220, 262, 330], dur: 1.2, gain: 0.08 }); },
  "dynasty.ui.advance": (c, o, t) => { swell(c, o, { t0: t, dur: 0.18, gain: 0.08, fLo: 800, fHi: 2400 }); },
};

/** Play a cue now. Silent while muted, locked or unsupported; replay-guarded per cue. */
export function playCue(cue: DynCue, gain = 1): boolean {
  const ctx = ensureCtx();
  if (!ctx || E.snap.muted || ctx.state !== "running") return false;
  const now = performance.now();
  if (now - (E.lastPlayed.get(cue) ?? 0) < (MIN_REPLAY[cue] ?? 250)) return false;
  E.lastPlayed.set(cue, now);
  const g = ctx.createGain(); g.gain.value = gain; g.connect(E.cueBus!);
  VOICES[cue](ctx, g, ctx.currentTime + 0.005);
  // duck the loops under a cue (−6 dB), recover over a second
  if (E.loopBus && E.snap.loops) { const t = ctx.currentTime; E.loopBus.gain.cancelScheduledValues(t); E.loopBus.gain.setValueAtTime(0.45, t); E.loopBus.gain.setTargetAtTime(0.9, t + 0.1, 0.5); }
  E.snap.lastCue = cue; emit();
  return true;
}

// ───────────────────────────────────────────────────────────── moments → cues

/** Moment ids from 01_MOMENT_MAP, mapped to cues from 03. One entry per moment the screens fire. */
export const MOMENT_CUES = {
  "dyn.run.org_choice": "dynasty.org.choose", "dyn.run.start": "dynasty.season.segment", "dyn.season.sign_player": "dynasty.recruit.sign", "dyn.season.stage_transition": "dynasty.season.segment",
  "dyn.draft.role_lock": "dynasty.draft.lock_role", "dyn.draft.lock_all": "dynasty.draft.lock_all",
  "dyn.game.stage_open": "dynasty.game.stage_open", "dyn.game.contests.tile": "dynasty.game.tile", "dyn.game.state_winning": "dynasty.game.state_winning", "dyn.game.state_losing": "dynasty.game.state_losing",
  "dyn.game.late_verdict": "dynasty.game.verdict", "dyn.game.closeout_double": "dynasty.game.closeout",
  "dyn.obj.dragon_start": "dynasty.obj.dragon_start", "dyn.obj.baron_start": "dynasty.obj.baron_start", "dyn.obj.elder_start": "dynasty.obj.elder_start", "dyn.obj.teamfight": "dynasty.obj.teamfight_start",
  "dyn.obj.outcome_3": "dynasty.obj.outcome_exceptional", "dyn.obj.outcome_2": "dynasty.obj.outcome_success", "dyn.obj.outcome_1": "dynasty.obj.outcome_partial", "dyn.obj.outcome_0": "dynasty.obj.outcome_disaster",
  "dyn.result.game_win": "dynasty.result.game_win", "dyn.result.game_loss": "dynasty.result.game_loss", "dyn.series.point": "dynasty.series.point", "dyn.series.match_point": "dynasty.series.match_point",
  "dyn.series.finals_intro": "dynasty.finals.intro", "dyn.end.championship": "dynasty.end.championship", "dyn.end.defeat": "dynasty.end.defeat",
  "dyn.crowd.swell": "dynasty.crowd.swell", "dyn.crowd.roar": "dynasty.crowd.roar", "dyn.crowd.gasp": "dynasty.crowd.gasp", "dyn.ui.advance": "dynasty.ui.advance",
} as const satisfies Record<string, DynCue>;
export type MomentId = keyof typeof MOMENT_CUES;

export function playMoment(m: MomentId, gain = 1): boolean { return playCue(MOMENT_CUES[m], gain); }

// ───────────────────────────────────────────────────────────── loops (five rooms + tension)

type LoopId = "loop.hq" | "loop.scrim" | "loop.backstage" | "loop.stage" | "loop.tension";
const SCENE_LOOP: Record<SceneId, LoopId> = { hq: "loop.hq", practice: "loop.scrim", warroom: "loop.scrim", tunnel: "loop.backstage", backstage: "loop.backstage", stadium: "loop.stage", trophy: "loop.stage" };

function makeLoop(ctx: AudioContext, id: LoopId): { gain: GainNode; stop: () => void } {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(E.loopBus!);
  const stops: (() => void)[] = [];
  const bed = (lo: number, hi: number, q: number, g: number) => {
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = (lo + hi) / 2; f.Q.value = q;
    const gg = ctx.createGain(); gg.gain.value = g; n.connect(f); f.connect(gg); gg.connect(out); n.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08 + Math.random() * 0.06; const lg = ctx.createGain(); lg.gain.value = (hi - lo) * 0.25; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    stops.push(() => { try { n.stop(); lfo.stop(); } catch { /* */ } });
  };
  const hum = (f: number, g: number, type: OscillatorType = "sine") => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(out); o.start(); stops.push(() => { try { o.stop(); } catch { /* */ } });
  };
  switch (id) {
    case "loop.hq": bed(80, 260, 0.6, 0.05); hum(60, 0.012); hum(120, 0.006); break;                    // HVAC hum, warm room tone
    case "loop.scrim": bed(600, 2600, 0.9, 0.035); bed(100, 300, 0.7, 0.03); hum(90, 0.008); break;          // keys-and-fans texture
    case "loop.backstage": bed(120, 500, 0.9, 0.05); bed(900, 1600, 2, 0.012); break;                      // muffled crowd through walls
    case "loop.stage": bed(200, 1400, 0.5, 0.11); bed(1200, 3200, 1.2, 0.03); bed(60, 180, 1, 0.04); break; // arena air + murmur
    case "loop.tension": {
      bed(50, 140, 1.4, 0.08);
      // a 70 bpm pulse: a low thump every 857 ms, scheduled by a looping oscillator envelope
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 48; const gg = ctx.createGain(); gg.gain.value = 0.0001; o.connect(gg); gg.connect(out); o.start();
      const period = 60 / 70; let t = ctx.currentTime + 0.1; const timer = window.setInterval(() => {
        const now = ctx.currentTime; while (t < now + 1.2) { gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.35, t + 0.02); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); t += period; }
      }, 500);
      stops.push(() => { window.clearInterval(timer); try { o.stop(); } catch { /* */ } });
      break;
    }
  }
  return { gain: out, stop: () => stops.forEach((s) => s()) };
}

function fadeLoop(id: LoopId, target: number, ms = 400) {
  const ctx = E.ctx; if (!ctx) return;
  let l = E.loops.get(id);
  if (!l && target > 0) { l = makeLoop(ctx, id); E.loops.set(id, l); }
  if (!l) return;
  const t = ctx.currentTime;
  l.gain.gain.cancelScheduledValues(t); l.gain.gain.setValueAtTime(l.gain.gain.value, t); l.gain.gain.linearRampToValueAtTime(target, t + ms / 1000);
  if (target === 0) { const ref = l; window.setTimeout(() => { if (E.loops.get(id) === ref && ref.gain.gain.value < 0.01) { ref.stop(); E.loops.delete(id); } }, ms + 200); }
}

/** Move the ambience to a scene: 400 ms crossfade between rooms. Worlds nodes may pass `loud` for +3 dB on stage. */
export function setScene(scene: SceneId, force = false, loud = false) {
  const changed = E.scene !== scene;
  E.scene = scene; E.snap.scene = scene;
  if (!E.ctx || E.ctx.state !== "running") { emit(); return; }
  if (!changed && !force) return;
  const want = SCENE_LOOP[scene];
  const level = scene === "trophy" ? 0.35 : want === "loop.stage" ? (loud ? 1.0 : 0.75) : 0.6;
  (["loop.hq", "loop.scrim", "loop.backstage", "loop.stage"] as LoopId[]).forEach((id) => fadeLoop(id, id === want ? level : 0));
  emit();
}

/** The held-breath pulse under an objective encounter. Ducks the stage bed; stops on the outcome. */
export function setTension(on: boolean, level = 1) {
  E.tension = on; E.snap.tension = on;
  if (!E.ctx || E.ctx.state !== "running") { emit(); return; }
  fadeLoop("loop.tension", on ? 0.55 + 0.15 * Math.max(0, Math.min(3, level)) : 0, on ? 600 : 300);
  if (E.scene) { const st = E.loops.get(SCENE_LOOP[E.scene]); if (st) { const t = E.ctx.currentTime; st.gain.gain.cancelScheduledValues(t); st.gain.gain.setValueAtTime(st.gain.gain.value, t); st.gain.gain.linearRampToValueAtTime(on ? 0.2 : 0.75, t + 0.5); } }
  emit();
}

/** Silence before a decisive moment (04): every loop ducks to near-nothing for `ms`, then recovers over 600 ms. Cues still play. */
export function hush(ms = 400) {
  const ctx = E.ctx; if (!ctx || !E.loopBus || ctx.state !== "running" || !E.snap.loops) return;
  const t = ctx.currentTime; const g = E.loopBus.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.04, t + 0.08); g.setValueAtTime(0.04, t + ms / 1000); g.linearRampToValueAtTime(0.9, t + ms / 1000 + 0.6);
}

/** Stop everything (route unmount). */
export function stopAllDynastyAudio() {
  E.loops.forEach((l) => l.stop()); E.loops.clear(); E.scene = null; E.snap.scene = null; E.tension = false; E.snap.tension = false; emit();
}

// Dev-only inspection hook for browser verification (the route itself is registered only under DEV).
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __dynastyAudio?: unknown }).__dynastyAudio = { dynastyAudio, playCue, playMoment, setScene, setTension, hush };
