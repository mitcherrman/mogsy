/**
 * PLAY1 — the match-entry flow's sound layer.
 *
 * Eight short cues for the eight moments the CHOOSE MODE record actually has:
 * the sheet unrolling and rolling shut, a step of the role stepper, a poke at
 * the mascot, a way to play being chosen, matchmaking opening, an opponent
 * turning up, and a refusal. Nothing else. There is no hover sound and no
 * matchmaking loop — a record that hums while you read it stops being a record.
 *
 * SYNTHESIZED, NOT SAMPLED — AND THAT IS A FINDING, NOT A PREFERENCE
 * ─────────────────────────────────────────────────────────────────
 * The repo's sound shelf was searched again at this baseline, not assumed:
 *
 *   public/sounds/            five meme clips (`mogged`, `amongus-death`,
 *                             `surprise-motherfucker`, `youre-chopped`) and a
 *                             violent card RIP. Card-animation material.
 *   public/quiz-broadcast/    `reveal.mp3`, owned by the broadcast pipeline.
 *   public/audio/music/       Tidecaller — music, and the radio's.
 *   public/audio/sfx/         a README and NOTHING ELSE. The main-app UI SFX
 *                             system (`src/lib/ui-sfx.ts`) has shipped with no
 *                             assets at all since it was written.
 *
 * There is no parchment, no seal, no rune and no chime anywhere in the repo,
 * and this phase was told not to generate audio. So every cue below is shaped
 * oscillators and filtered noise through the Web Audio API — which is how the
 * app already makes its swipe, shop, card-animation and Academy-welcome
 * sounds (`useSwipeSound`, `useShopSound`, `useAnimationSound`, `tomeAudio`).
 * This is the house convention, not a stand-in for it.
 *
 * NOTHING HERE IS A PLACEHOLDER WEARING A FINAL NAME. There is no
 * `play_scroll_open.mp3` pointing at a temporary file. Callers name a MOMENT
 * and never a sound, so when real assets arrive a cue's `render` becomes a
 * buffer play and no call site changes.
 *
 * ONE PLACE A SOUND STARTS
 * ────────────────────────
 * Every cue goes through `playSfxEngine.play`, so the autoplay gate, the
 * per-cue repeat guard and the fail-soft wrapper each exist exactly once, and
 * a test can watch "a cue was asked for" without standing up an AudioContext.
 * The engine is deliberately settings-BLIND: whether a cue is allowed is
 * `usePlaySfx`'s job, because that is where the app's one sound-settings store
 * lives. See `usePlaySfx.ts`.
 *
 * FAIL-SOFT, ALWAYS. No AudioContext, a context the browser refuses to resume,
 * a decode quirk, a lost gesture: all of it is silence, never an error and
 * never a thrown exception into a click handler. The record must behave
 * identically with sound and without it.
 */

/**
 * The cues, named for the MOMENT rather than for the sound.
 *
 * A closed set on purpose: adding "what a hover sounds like" is a change to
 * this file and to the app's sound settings, never something a component can
 * decide for itself.
 *
 * EIGHT ARE SPECIALISED AND ONE IS A FALLBACK. `buttonPress` is the only cue
 * that describes a CONTROL rather than a moment, and it exists so that no
 * ordinary button in the match-entry flow is silent. It never competes: a
 * control with a specialised cue uses that one and nothing else, so a mode card
 * is a seal, a role arrow is a tick, the close is a sheet rolling shut — and
 * `buttonPress` is what is left for the small neutral controls (Back, Cancel,
 * a roster row, the signup CTA).
 */
export type PlaySfxCue =
  | "scrollOpen"
  | "scrollClose"
  | "roleStep"
  | "mascotReact"
  | "modeConfirm"
  | "queueStart"
  | "opponentFound"
  | "error"
  | "buttonPress";

export const PLAY_SFX_CUES: readonly PlaySfxCue[] = [
  "scrollOpen",
  "scrollClose",
  "roleStep",
  "mascotReact",
  "modeConfirm",
  "queueStart",
  "opponentFound",
  "error",
  "buttonPress",
];

/**
 * The shortest gap between two soundings of the SAME cue.
 *
 * BELT TO THE TRIGGER PLACEMENT'S BRACES, and never the correctness mechanism.
 * One action already produces one call — that is what the event boundaries in
 * the record, the hub and the stepper are for — so these numbers exist only to
 * absorb what a boundary cannot see: React StrictMode invoking an effect
 * twice, a double click landing inside one frame, a transition watcher
 * re-running on an unrelated re-render.
 *
 * They are NOT a rate limit on the player. `roleStep` is set at 40ms, well
 * under the ~120ms a hand needs to press an arrow twice, so hammering the
 * stepper stays fully responsive and every real step is heard. The cue itself
 * is ~90ms long, so even at machine-gun speed the voices barely overlap and
 * never pile into a drone.
 */
const MIN_REPLAY_MS: Record<PlaySfxCue, number> = {
  scrollOpen: 250,
  scrollClose: 250,
  roleStep: 40,
  mascotReact: 110,
  modeConfirm: 250,
  queueStart: 400,
  opponentFound: 400,
  error: 300,
  buttonPress: 40,
};

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
const lastPlayedAt: Partial<Record<PlaySfxCue, number>> = {};

/**
 * True once the visitor has interacted with the page.
 *
 * Before that a browser would refuse playback anyway, so nothing even tries.
 * Same pattern as `ui-sfx.ts` and `tomeAudio.ts`. It also covers the one PLAY
 * path that opens the record without a local press — arriving at `/quiz` from
 * `/quiz/ranked` with `openPlay` route state, where the click happened on a
 * page that no longer exists: the record opens in silence rather than
 * announcing itself over a cold load.
 */
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

/** One second of white noise, built once and windowed into every cue that
 *  needs a texture — paper, a seal pressing, the attack of struck metal. */
function getNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = c.sampleRate;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/* ── The voices ────────────────────────────────────────────────────────────
 *
 * Two helpers, because every cue below is some arrangement of exactly two
 * things: a shaped burst of noise (paper, leather, the scrape of a seal, the
 * attack transient of struck metal) and a shaped tone (brass, rune-light, a
 * bell partial). Peaks are held in the 0.03–0.12 range the rest of the app
 * already sits in — see `useSwipeSound` (0.08) and `tomeAudio` (0.075).
 */

interface NoiseVoice {
  /** When to start, relative to the cue's own t0. */
  at?: number;
  dur: number;
  peak: number;
  /** Bandpass centre at the start of the voice, in Hz. */
  from: number;
  /** Bandpass centre at the end. Omit for a static texture. */
  to?: number;
  q?: number;
  /** Fraction of `dur` spent rising to `peak`. */
  attack?: number;
}

function noise(c: AudioContext, t0: number, v: NoiseVoice): void {
  const t = t0 + (v.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  src.loop = true;

  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = v.q ?? 0.8;
  band.frequency.setValueAtTime(v.from, t);
  if (v.to !== undefined && v.to !== v.from) {
    band.frequency.exponentialRampToValueAtTime(v.to, t + v.dur);
  }

  const gain = c.createGain();
  const rise = v.dur * (v.attack ?? 0.18);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(v.peak, t + Math.max(0.004, rise));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);

  src.connect(band);
  band.connect(gain);
  gain.connect(c.destination);
  src.start(t, Math.random() * 0.6);
  src.stop(t + v.dur + 0.03);
}

interface ToneVoice {
  at?: number;
  dur: number;
  peak: number;
  freq: number;
  /** Glide to this frequency across `dur`. Omit to hold. */
  slideTo?: number;
  type?: OscillatorType;
  attack?: number;
}

function tone(c: AudioContext, t0: number, v: ToneVoice): void {
  const t = t0 + (v.at ?? 0);
  const osc = c.createOscillator();
  osc.type = v.type ?? "sine";
  osc.frequency.setValueAtTime(v.freq, t);
  if (v.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(v.slideTo, t + v.dur);
  }

  const gain = c.createGain();
  const rise = Math.max(0.003, v.dur * (v.attack ?? 0.06));
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(v.peak, t + rise);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + v.dur + 0.03);
}

/**
 * What each cue sounds like.
 *
 * The hierarchy the phase asked for is carried by the PEAKS and the LENGTHS
 * here, and nowhere else — no caller passes a volume, so no surface can decide
 * its own cue is the important one:
 *
 *   roleStep        quietest   0.035  ~0.09s
 *   buttonPress     quiet      0.045  ~0.07s
 *   mascotReact     quiet      0.050  ~0.20s
 *   scrollClose     quiet-med  0.060  ~0.36s
 *   scrollOpen      quiet-med  0.070  ~0.52s
 *   error           clear      0.070  ~0.40s
 *   modeConfirm     medium     0.085  ~0.38s
 *   queueStart      medium     0.090  ~0.52s
 *   opponentFound   strongest  0.115  ~0.90s
 *
 * The mascot is deliberately well under both matchmaking cues: it is a toy,
 * and a toy that shouts over the thing saying a duel has started is a defect.
 * Nothing rings on — the longest cue is the opponent bell, and that is a
 * struck-metal decay rather than a reverb tail.
 */
const RENDER: Record<PlaySfxCue, (c: AudioContext, t: number) => void> = {
  /**
   * A sheet unrolling: paper sliding open and rising, with the soft wooden
   * knock of the rod settling on the desk under it.
   */
  scrollOpen(c, t) {
    noise(c, t, { dur: 0.44, peak: 0.07, from: 520, to: 2300, q: 0.7, attack: 0.35 });
    noise(c, t, { at: 0.4, dur: 0.12, peak: 0.045, from: 260, to: 170, q: 1.4, attack: 0.1 });
    tone(c, t, { at: 0.4, dur: 0.12, peak: 0.026, freq: 196, slideTo: 174.6, type: "triangle" });
  },

  /** The same sheet rolling shut: the sweep runs down, and it lands sooner. */
  scrollClose(c, t) {
    noise(c, t, { dur: 0.3, peak: 0.06, from: 2000, to: 480, q: 0.7, attack: 0.22 });
    noise(c, t, { at: 0.26, dur: 0.1, peak: 0.036, from: 220, to: 150, q: 1.4, attack: 0.1 });
  },

  /**
   * One notch of the role stepper: a dry parchment tick with the faintest
   * brass edge on it. The quietest thing in the set, and the shortest — this
   * fires more often than everything else put together.
   */
  roleStep(c, t) {
    noise(c, t, { dur: 0.07, peak: 0.035, from: 1700, to: 1100, q: 1.6, attack: 0.12 });
    tone(c, t, { dur: 0.09, peak: 0.02, freq: 1046.5, slideTo: 880, type: "triangle" });
  },

  /** The mascot, poked. A playful two-note hop — up, overshoot, settle. */
  mascotReact(c, t) {
    tone(c, t, { dur: 0.1, peak: 0.05, freq: 620, slideTo: 980, type: "triangle" });
    tone(c, t, { at: 0.08, dur: 0.12, peak: 0.036, freq: 1180, slideTo: 840, type: "sine" });
  },

  /**
   * A wax seal pressed onto the record: a soft low thud as it takes, and a
   * short brass fifth over it as the choice is made.
   */
  modeConfirm(c, t) {
    noise(c, t, { dur: 0.14, peak: 0.06, from: 380, to: 190, q: 1.1, attack: 0.08 });
    tone(c, t, { dur: 0.2, peak: 0.085, freq: 261.6, type: "triangle" });
    tone(c, t, { at: 0.06, dur: 0.3, peak: 0.045, freq: 392, type: "sine" });
  },

  /**
   * A rune taking light: two rising tones and a thin shimmer — the sound of
   * something being switched on rather than something arriving.
   */
  queueStart(c, t) {
    tone(c, t, { dur: 0.24, peak: 0.09, freq: 349.2, type: "triangle" });
    tone(c, t, { at: 0.11, dur: 0.3, peak: 0.075, freq: 523.3, type: "triangle" });
    tone(c, t, { at: 0.14, dur: 0.36, peak: 0.03, freq: 1046.5, type: "sine" });
    noise(c, t, { at: 0.1, dur: 0.4, peak: 0.018, from: 2600, to: 4200, q: 1.2, attack: 0.4 });
  },

  /**
   * OPPONENT FOUND — the one cue allowed to be an event.
   *
   * Struck metal: a hard noise transient for the strike, a low body under it,
   * and three inharmonic partials above the fundamental, which is what makes a
   * bell read as a bell rather than as a chord. Longest in the set at ~0.9s,
   * and it is a decay, not a tail — nothing rings under the next screen.
   */
  opponentFound(c, t) {
    noise(c, t, { dur: 0.07, peak: 0.055, from: 3000, to: 1400, q: 0.9, attack: 0.04 });
    noise(c, t, { dur: 0.2, peak: 0.04, from: 300, to: 160, q: 1.2, attack: 0.06 });
    tone(c, t, { dur: 0.85, peak: 0.115, freq: 587.3, type: "sine" });
    tone(c, t, { dur: 0.6, peak: 0.05, freq: 880.9, type: "sine" });
    tone(c, t, { dur: 0.42, peak: 0.032, freq: 1567.2, type: "sine" });
    tone(c, t, { at: 0.16, dur: 0.62, peak: 0.045, freq: 1174.7, type: "sine" });
  },

  /**
   * THE FALLBACK — an ordinary control being pressed.
   *
   * A single dry knock: a tight woody tick with a short low body under it, and
   * nothing above 1kHz to make it read as a click from a different interface.
   * Deliberately the second quietest thing in the set and comfortably under
   * both `modeConfirm` and `queueStart`, because it must never be mistaken for
   * a decision being made — it is the sound of a control acknowledging a press,
   * not of anything happening.
   *
   * It is also the shortest, which is what lets a rapid back-and-forth through
   * the record's views stay tactile without becoming a rattle.
   */
  buttonPress(c, t) {
    noise(c, t, { dur: 0.045, peak: 0.045, from: 900, to: 480, q: 1.5, attack: 0.1 });
    tone(c, t, { dur: 0.07, peak: 0.03, freq: 146.8, slideTo: 116.5, type: "triangle" });
  },

  /**
   * A refusal. CLEAR BUT NOT HARSH, which rules out the sawtooth the app's
   * older `wrong_tone` uses: this fires when a role write was declined or a
   * queue would not open, which is an ordinary thing to be told, not a
   * penalty. Two dull descending tones on a muted triangle, with a little
   * leather under them.
   */
  error(c, t) {
    noise(c, t, { dur: 0.12, peak: 0.03, from: 420, to: 240, q: 1.3, attack: 0.1 });
    tone(c, t, { dur: 0.16, peak: 0.07, freq: 311.1, type: "triangle" });
    tone(c, t, { at: 0.13, dur: 0.26, peak: 0.06, freq: 233.1, type: "triangle" });
  },
};

/**
 * The engine, as one spyable object — the same shape `tomeAudioEngine` uses,
 * and for the same reason: a test can assert that a cue was ASKED FOR without
 * a fake AudioContext, and the admin panel can preview a cue without going
 * anywhere near a React tree.
 */
export const playSfxEngine = {
  /**
   * Sound one cue. Never throws, never rejects, never returns a promise a
   * caller has to handle: a click handler calls this and carries on.
   *
   * SETTINGS ARE NOT CHECKED HERE. This is the raw voice; `usePlaySfx` is the
   * gate. The one thing that IS enforced here is the repeat guard, because it
   * has to hold across components — the hub, the record and the stepper all
   * sound cues from the same set, and a guard living in a hook instance would
   * not see the others.
   */
  play(cue: PlaySfxCue): void {
    try {
      if (!hasUserInteracted) return;
      const now = Date.now();
      if (now - (lastPlayedAt[cue] ?? 0) < MIN_REPLAY_MS[cue]) return;
      const c = getCtx();
      if (!c) return;
      // Only stamp once the sound has actually been handed to a running
      // context. A cue dropped for a suspended context has not been heard, and
      // must not lock out the next attempt.
      lastPlayedAt[cue] = now;
      RENDER[cue](c, c.currentTime);
    } catch {
      // Best-effort sound playback; failure is intentionally silence.
    }
  },
};

/** Clear the cross-component repeat guard. Used by the admin panel, so a
 *  deliberate second press of Preview actually sounds twice, and by tests so
 *  one case's cue cannot silence the next case's identical cue. */
export function resetPlaySfxGuards(): void {
  for (const cue of PLAY_SFX_CUES) delete lastPlayedAt[cue];
}
