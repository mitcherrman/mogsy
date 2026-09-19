export interface SfxRenderOptions { durationMs?: number }
export type SfxVoiceStop = () => void;
export type SfxSynthRenderer = (
  context: AudioContext,
  output: AudioNode,
  startAt: number,
  options: SfxRenderOptions,
) => void | SfxVoiceStop;

export const MAX_SCRIBBLE_MS = 6000;
const noiseBuffers = new WeakMap<AudioContext, Map<number, AudioBuffer>>();

function noiseBuffer(context: AudioContext, seconds = 1): AudioBuffer {
  let byLength = noiseBuffers.get(context);
  if (!byLength) {
    byLength = new Map();
    noiseBuffers.set(context, byLength);
  }
  const length = Math.floor(context.sampleRate * seconds);
  const cached = byLength.get(length);
  if (cached) return cached;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  byLength.set(length, buffer);
  return buffer;
}

interface NoiseVoice {
  at?: number; dur: number; peak: number; from: number; to?: number;
  q?: number; attack?: number;
}

function noise(context: AudioContext, output: AudioNode, startAt: number, voice: NoiseVoice): void {
  const start = startAt + (voice.at ?? 0);
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context);
  source.playbackRate.value = 0.9 + Math.random() * 0.2;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = voice.q ?? 0.8;
  filter.frequency.setValueAtTime(voice.from, start);
  if (voice.to !== undefined && voice.to !== voice.from) {
    filter.frequency.exponentialRampToValueAtTime(voice.to, start + voice.dur);
  }
  const gain = context.createGain();
  const rise = voice.dur * (voice.attack ?? 0.18);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(voice.peak, start + Math.max(0.004, rise));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start, Math.random() * 0.6);
  source.stop(start + voice.dur + 0.03);
}

interface ToneVoice {
  at?: number; dur: number; peak: number; freq: number; slideTo?: number;
  type?: OscillatorType; attack?: number;
}

function tone(context: AudioContext, output: AudioNode, startAt: number, voice: ToneVoice): void {
  const start = startAt + (voice.at ?? 0);
  const oscillator = context.createOscillator();
  oscillator.type = voice.type ?? "sine";
  oscillator.frequency.setValueAtTime(voice.freq, start);
  if (voice.slideTo !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(voice.slideTo, start + voice.dur);
  }
  const gain = context.createGain();
  const rise = Math.max(0.003, voice.dur * (voice.attack ?? 0.06));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(voice.peak, start + rise);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.dur);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + voice.dur + 0.03);
}

interface DirectToneVoice {
  at?: number; envelope: number; stop: number; peak: number; freq: number;
  slideTo?: number; slideDuration?: number; type?: OscillatorType;
}

/** Older non-PLAY hooks begin at peak rather than using PLAY's tiny attack. */
function directTone(context: AudioContext, output: AudioNode, startAt: number, voice: DirectToneVoice): void {
  const start = startAt + (voice.at ?? 0);
  const oscillator = context.createOscillator();
  oscillator.type = voice.type ?? "sine";
  oscillator.frequency.setValueAtTime(voice.freq, start);
  if (voice.slideTo !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(voice.slideTo, start + (voice.slideDuration ?? voice.envelope));
  }
  const gain = context.createGain();
  gain.gain.setValueAtTime(voice.peak, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + voice.envelope);
  oscillator.connect(gain); gain.connect(output);
  oscillator.start(start); oscillator.stop(start + voice.stop);
}

const renderers = {
  launch(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.3, stop: 0.35, peak: 0.12, freq: 600, slideTo: 1200, slideDuration: 0.15 });
    directTone(context, output, startAt, { at: 0.05, envelope: 0.3, stop: 0.35, peak: 0.06, freq: 900, slideTo: 1800, slideDuration: 0.15, type: "triangle" });
  },
  swipe(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.05, stop: 0.06, peak: 0.08, freq: 600, slideTo: 450, slideDuration: 0.035 });
    directTone(context, output, startAt, { envelope: 0.04, stop: 0.05, peak: 0.025, freq: 1800, slideTo: 1200, slideDuration: 0.03, type: "triangle" });
  },
  correct(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.12, stop: 0.13, peak: 0.07, freq: 880 });
    directTone(context, output, startAt, { at: 0.08, envelope: 0.14, stop: 0.15, peak: 0.07, freq: 1174.66 });
  },
  wrong(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.18, stop: 0.2, peak: 0.06, freq: 400, slideTo: 250, slideDuration: 0.15 });
  },
  shatter(context, output, startAt) {
    const length = context.sampleRate * 0.15;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.12, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.15);
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2000;
    source.connect(filter); filter.connect(gain); gain.connect(output);
    source.start(startAt); source.stop(startAt + 0.15);
    directTone(context, output, startAt, { envelope: 0.1, stop: 0.12, peak: 0.1, freq: 150, slideTo: 60, slideDuration: 0.08 });
  },
  burn(context, output, startAt) {
    const length = context.sampleRate * 0.4;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.5);
    const source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.35, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);
    const filter = context.createBiquadFilter(); filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, startAt);
    filter.frequency.exponentialRampToValueAtTime(2000, startAt + 0.3);
    filter.Q.value = 1;
    source.connect(filter); filter.connect(gain); gain.connect(output);
    source.start(startAt); source.stop(startAt + 0.4);
  },
  vaporize(context, output, startAt) {
    for (let i = 0; i < 5; i += 1) {
      const frequency = 1200 + Math.random() * 2000;
      directTone(context, output, startAt, { at: i * 0.06, envelope: 0.15, stop: 0.16, peak: 0.04, freq: frequency, slideTo: frequency * 0.5 });
    }
  },
  crush(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.2, stop: 0.22, peak: 0.15, freq: 100, slideTo: 30, slideDuration: 0.15 });
    const length = context.sampleRate * 0.1;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    const source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.08, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.1);
    source.connect(gain); gain.connect(output); source.start(startAt); source.stop(startAt + 0.1);
  },
  purchase(context, output, startAt) {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      directTone(context, output, startAt, { at: index * 0.08, envelope: 0.2, stop: 0.25, peak: 0.08, freq: frequency });
    });
  },
  diamond(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.08, stop: 0.1, peak: 0.05, freq: 2400, slideTo: 1800, slideDuration: 0.05, type: "triangle" });
  },
  powerup(context, output, startAt) {
    directTone(context, output, startAt, { envelope: 0.2, stop: 0.22, peak: 0.06, freq: 300, slideTo: 1200, slideDuration: 0.15 });
  },
  scrollOpen(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.44, peak: 0.07, from: 520, to: 2300, q: 0.7, attack: 0.35 });
    noise(context, output, startAt, { at: 0.4, dur: 0.12, peak: 0.045, from: 260, to: 170, q: 1.4, attack: 0.1 });
    tone(context, output, startAt, { at: 0.4, dur: 0.12, peak: 0.026, freq: 196, slideTo: 174.6, type: "triangle" });
  },
  scrollClose(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.3, peak: 0.06, from: 2000, to: 480, q: 0.7, attack: 0.22 });
    noise(context, output, startAt, { at: 0.26, dur: 0.1, peak: 0.036, from: 220, to: 150, q: 1.4, attack: 0.1 });
  },
  roleStep(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.07, peak: 0.035, from: 1700, to: 1100, q: 1.6, attack: 0.12 });
    tone(context, output, startAt, { dur: 0.09, peak: 0.02, freq: 1046.5, slideTo: 880, type: "triangle" });
  },
  mascot(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.1, peak: 0.05, freq: 620, slideTo: 980, type: "triangle" });
    tone(context, output, startAt, { at: 0.08, dur: 0.12, peak: 0.036, freq: 1180, slideTo: 840 });
  },
  modeConfirm(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.14, peak: 0.06, from: 380, to: 190, q: 1.1, attack: 0.08 });
    tone(context, output, startAt, { dur: 0.2, peak: 0.085, freq: 261.6, type: "triangle" });
    tone(context, output, startAt, { at: 0.06, dur: 0.3, peak: 0.045, freq: 392 });
  },
  queueStart(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.24, peak: 0.09, freq: 349.2, type: "triangle" });
    tone(context, output, startAt, { at: 0.11, dur: 0.3, peak: 0.075, freq: 523.3, type: "triangle" });
    tone(context, output, startAt, { at: 0.14, dur: 0.36, peak: 0.03, freq: 1046.5 });
    noise(context, output, startAt, { at: 0.1, dur: 0.4, peak: 0.018, from: 2600, to: 4200, q: 1.2, attack: 0.4 });
  },
  opponentFound(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.07, peak: 0.055, from: 3000, to: 1400, q: 0.9, attack: 0.04 });
    noise(context, output, startAt, { dur: 0.2, peak: 0.04, from: 300, to: 160, q: 1.2, attack: 0.06 });
    tone(context, output, startAt, { dur: 0.85, peak: 0.115, freq: 587.3 });
    tone(context, output, startAt, { dur: 0.6, peak: 0.05, freq: 880.9 });
    tone(context, output, startAt, { dur: 0.42, peak: 0.032, freq: 1567.2 });
    tone(context, output, startAt, { at: 0.16, dur: 0.62, peak: 0.045, freq: 1174.7 });
  },
  buttonPress(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.045, peak: 0.045, from: 900, to: 480, q: 1.5, attack: 0.1 });
    tone(context, output, startAt, { dur: 0.07, peak: 0.03, freq: 146.8, slideTo: 116.5, type: "triangle" });
  },
  error(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.12, peak: 0.03, from: 420, to: 240, q: 1.3, attack: 0.1 });
    tone(context, output, startAt, { dur: 0.16, peak: 0.07, freq: 311.1, type: "triangle" });
    tone(context, output, startAt, { at: 0.13, dur: 0.26, peak: 0.06, freq: 233.1, type: "triangle" });
  },
  bookLand(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.075, peak: 0.12, from: 340, to: 120, q: 1.1, attack: 0.06 });
    tone(context, output, startAt, { dur: 0.16, peak: 0.088, freq: 104, slideTo: 64, type: "triangle" });
    tone(context, output, startAt, { at: 0.012, dur: 0.1, peak: 0.045, freq: 208, slideTo: 150 });
    noise(context, output, startAt, { at: 0.07, dur: 0.14, peak: 0.035, from: 1500, to: 700, q: 0.9, attack: 0.3 });
  },
  bookRuffle(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.075, peak: 0.055, from: 2600, to: 1500, q: 0.9, attack: 0.12 });
    noise(context, output, startAt, { at: 0.065, dur: 0.08, peak: 0.05, from: 3100, to: 1700, q: 0.9, attack: 0.1 });
    noise(context, output, startAt, { at: 0.142, dur: 0.09, peak: 0.04, from: 2400, to: 1300, q: 0.9, attack: 0.14 });
    noise(context, output, startAt, { at: 0.05, dur: 0.16, peak: 0.024, from: 700, to: 380, q: 1.1, attack: 0.3 });
  },
  hubDestinationFocus(context, output, startAt) {
    // A fingertip across leather and one tiny brass catch: intentionally much
    // quieter and shorter than opening the book.
    noise(context, output, startAt, { dur: 0.045, peak: 0.018, from: 1450, to: 900, q: 1.5, attack: 0.1 });
    tone(context, output, startAt, { dur: 0.06, peak: 0.012, freq: 392, slideTo: 349.2, type: "triangle" });
  },
  leaguecraftSelection(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.045, peak: 0.024, from: 1150, to: 720, q: 1.4, attack: 0.08 });
    tone(context, output, startAt, { dur: 0.075, peak: 0.024, freq: 740, slideTo: 659.3, type: "triangle" });
  },
  leaguecraftStart(context, output, startAt) {
    // Short seal/rune commitment, without the weight of Ranked's mode seal.
    noise(context, output, startAt, { dur: 0.09, peak: 0.04, from: 420, to: 210, q: 1.1, attack: 0.08 });
    tone(context, output, startAt, { dur: 0.16, peak: 0.05, freq: 261.6, type: "triangle" });
    tone(context, output, startAt, { at: 0.055, dur: 0.22, peak: 0.028, freq: 392 });
  },
  answerLock(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.032, peak: 0.034, from: 820, to: 460, q: 1.6, attack: 0.08 });
    tone(context, output, startAt, { dur: 0.055, peak: 0.025, freq: 196, slideTo: 174.6, type: "triangle" });
  },
  answerCorrect(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.11, peak: 0.047, freq: 659.3, type: "triangle" });
    tone(context, output, startAt, { at: 0.075, dur: 0.16, peak: 0.05, freq: 880 });
    tone(context, output, startAt, { at: 0.13, dur: 0.15, peak: 0.022, freq: 1318.5 });
  },
  answerIncorrect(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.13, peak: 0.043, freq: 392, slideTo: 349.2, type: "triangle" });
    tone(context, output, startAt, { at: 0.1, dur: 0.18, peak: 0.038, freq: 293.7, slideTo: 261.6, type: "triangle" });
  },
  quizComplete(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.1, peak: 0.026, from: 620, to: 1250, q: 1.1, attack: 0.25 });
    tone(context, output, startAt, { dur: 0.2, peak: 0.05, freq: 392, type: "triangle" });
    tone(context, output, startAt, { at: 0.1, dur: 0.24, peak: 0.052, freq: 523.3, type: "triangle" });
    tone(context, output, startAt, { at: 0.2, dur: 0.32, peak: 0.05, freq: 659.3 });
    tone(context, output, startAt, { at: 0.24, dur: 0.28, peak: 0.018, freq: 1046.5 });
  },
  rankedModuleStart(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.06, peak: 0.025, from: 520, to: 980, q: 1.3, attack: 0.12 });
    tone(context, output, startAt, { dur: 0.14, peak: 0.034, freq: 293.7, type: "triangle" });
    tone(context, output, startAt, { at: 0.07, dur: 0.2, peak: 0.038, freq: 440, type: "triangle" });
  },
  rankedAnswerLock(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.028, peak: 0.035, from: 960, to: 520, q: 1.8, attack: 0.06 });
    tone(context, output, startAt, { dur: 0.06, peak: 0.028, freq: 220, slideTo: 196, type: "triangle" });
  },
  rankedAnswerCorrect(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.09, peak: 0.046, freq: 659.3, type: "triangle" });
    tone(context, output, startAt, { at: 0.065, dur: 0.15, peak: 0.052, freq: 987.8 });
  },
  rankedAnswerIncorrect(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.11, peak: 0.04, freq: 370, slideTo: 311.1, type: "triangle" });
    tone(context, output, startAt, { at: 0.075, dur: 0.17, peak: 0.034, freq: 277.2, slideTo: 246.9, type: "triangle" });
  },
  rankedOpponentSubmitted(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.035, peak: 0.018, from: 1300, to: 900, q: 1.7, attack: 0.08 });
    tone(context, output, startAt, { dur: 0.07, peak: 0.018, freq: 523.3, type: "triangle" });
  },
  rankedMetaAction(context, output, startAt) {
    noise(context, output, startAt, { dur: 0.022, peak: 0.024, from: 1500, to: 820, q: 1.8, attack: 0.04 });
    tone(context, output, startAt, { dur: 0.045, peak: 0.02, freq: 698.5, slideTo: 587.3, type: "triangle" });
  },
  rankedPointsAwarded(context, output, startAt) {
    // Delayed behind the verdict so a settlement reads as a sequence, not a pile.
    tone(context, output, startAt, { at: 0.18, dur: 0.1, peak: 0.038, freq: 784, type: "triangle" });
    tone(context, output, startAt, { at: 0.24, dur: 0.15, peak: 0.036, freq: 1046.5 });
  },
  rankedSpeedBonus(context, output, startAt) {
    tone(context, output, startAt, { at: 0.4, dur: 0.09, peak: 0.03, freq: 1318.5, type: "triangle" });
  },
  rankedMatchVictory(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.16, peak: 0.052, freq: 392, type: "triangle" });
    tone(context, output, startAt, { at: 0.1, dur: 0.2, peak: 0.055, freq: 523.3, type: "triangle" });
    tone(context, output, startAt, { at: 0.2, dur: 0.3, peak: 0.058, freq: 784 });
  },
  rankedMatchDefeat(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.18, peak: 0.046, freq: 392, slideTo: 349.2, type: "triangle" });
    tone(context, output, startAt, { at: 0.13, dur: 0.3, peak: 0.042, freq: 293.7, slideTo: 220, type: "triangle" });
  },
  rankedMatchDraw(context, output, startAt) {
    tone(context, output, startAt, { dur: 0.2, peak: 0.044, freq: 349.2, type: "triangle" });
    tone(context, output, startAt, { at: 0.08, dur: 0.28, peak: 0.04, freq: 440, type: "triangle" });
  },
  scribble(context, output, startAt, options) {
    const duration = Math.min(MAX_SCRIBBLE_MS, Math.max(0, options.durationMs ?? 0)) / 1000;
    if (duration <= 0) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context, 2);
    source.playbackRate.value = 0.85 + Math.random() * 0.3;
    source.loop = true;
    const band = context.createBiquadFilter(); band.type = "bandpass";
    band.frequency.value = 1500 + Math.random() * 700; band.Q.value = 0.9;
    const high = context.createBiquadFilter(); high.type = "highpass"; high.frequency.value = 900;
    const gain = context.createGain(); gain.gain.setValueAtTime(0.0001, startAt);
    const end = startAt + duration;
    let cursor = startAt;
    while (cursor < end - 0.05) {
      const stroke = 0.07 + Math.random() * 0.12;
      const peak = 0.028 + Math.random() * 0.02;
      gain.gain.exponentialRampToValueAtTime(peak, Math.min(end, cursor + stroke * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.006, Math.min(end, cursor + stroke));
      cursor += stroke + 0.02 + Math.random() * 0.06;
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
    source.connect(band); band.connect(high); high.connect(gain); gain.connect(output);
    source.start(startAt, Math.random() * 1.2); source.stop(end + 0.06);
    return () => {
      try {
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.03);
        source.stop(context.currentTime + 0.05);
      } catch { /* the source already ended */ }
    };
  },
  pageTurn(context, output, startAt) {
    const source = context.createBufferSource(); source.buffer = noiseBuffer(context, 2);
    source.playbackRate.value = 0.95 + Math.random() * 0.1;
    const band = context.createBiquadFilter(); band.type = "bandpass"; band.Q.value = 0.7;
    band.frequency.setValueAtTime(500, startAt);
    band.frequency.exponentialRampToValueAtTime(2400, startAt + 0.3);
    band.frequency.exponentialRampToValueAtTime(750, startAt + 0.55);
    const gain = context.createGain(); gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.075, startAt + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.02, startAt + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.75);
    source.connect(band); band.connect(gain); gain.connect(output);
    source.start(startAt, Math.random()); source.stop(startAt + 0.8);
  },
} satisfies Record<string, SfxSynthRenderer>;

export const SFX_GENERATORS = {
  "sfx.legacy.launch": renderers.launch,
  "sfx.legacy.swipe": renderers.swipe,
  "sfx.legacy.correct": renderers.correct,
  "sfx.legacy.wrong": renderers.wrong,
  "sfx.legacy.shatter": renderers.shatter,
  "sfx.legacy.burn": renderers.burn,
  "sfx.legacy.vaporize": renderers.vaporize,
  "sfx.legacy.crush": renderers.crush,
  "sfx.legacy.shop-purchase": renderers.purchase,
  "sfx.legacy.shop-diamond": renderers.diamond,
  "sfx.legacy.shop-powerup": renderers.powerup,
  "sfx.legacy.scroll-open": renderers.scrollOpen,
  "sfx.legacy.scroll-close": renderers.scrollClose,
  "sfx.legacy.role-step": renderers.roleStep,
  "sfx.legacy.mascot": renderers.mascot,
  "sfx.legacy.mode-confirm": renderers.modeConfirm,
  "sfx.legacy.queue-start": renderers.queueStart,
  "sfx.legacy.opponent-found": renderers.opponentFound,
  "sfx.legacy.button-press": renderers.buttonPress,
  "sfx.legacy.error": renderers.error,
  "sfx.legacy.book-land": renderers.bookLand,
  "sfx.legacy.book-ruffle": renderers.bookRuffle,
  "sfx.hub.destination-focus": renderers.hubDestinationFocus,
  "sfx.leaguecraft.selection": renderers.leaguecraftSelection,
  "sfx.leaguecraft.quiz-start": renderers.leaguecraftStart,
  "sfx.leaguecraft.answer-lock": renderers.answerLock,
  "sfx.leaguecraft.answer-correct": renderers.answerCorrect,
  "sfx.leaguecraft.answer-incorrect": renderers.answerIncorrect,
  "sfx.leaguecraft.quiz-complete": renderers.quizComplete,
  "sfx.ranked.module-start": renderers.rankedModuleStart,
  "sfx.ranked.answer-lock": renderers.rankedAnswerLock,
  "sfx.ranked.answer-correct": renderers.rankedAnswerCorrect,
  "sfx.ranked.answer-incorrect": renderers.rankedAnswerIncorrect,
  "sfx.ranked.opponent-submitted": renderers.rankedOpponentSubmitted,
  "sfx.ranked.meta-action": renderers.rankedMetaAction,
  "sfx.ranked.points-awarded": renderers.rankedPointsAwarded,
  "sfx.ranked.speed-bonus": renderers.rankedSpeedBonus,
  "sfx.ranked.match-victory": renderers.rankedMatchVictory,
  "sfx.ranked.match-defeat": renderers.rankedMatchDefeat,
  "sfx.ranked.match-draw": renderers.rankedMatchDraw,
  "sfx.legacy.welcome-scribble": renderers.scribble,
  "sfx.legacy.welcome-page-turn": renderers.pageTurn,
} as const satisfies Record<string, SfxSynthRenderer>;

export type SfxGeneratorId = keyof typeof SFX_GENERATORS;
