/**
 * Canonical semantic SFX vocabulary.
 *
 * Callers describe the product event, never a file or oscillator. The registry
 * owns cadence, level and the optional built-in generator. Most existing cues
 * deliberately have no generator yet: SFX1.2 will adapt their proven PLAY1
 * renderers before moving a single call site.
 */
export interface SfxRegistryEntry {
  group: "ui" | "hub" | "ranked";
  minReplayMs: number;
  relativeGain: number;
  builtInGeneratorId?: SfxGeneratorId;
}

export type SfxSynthRenderer = (
  context: AudioContext,
  output: AudioNode,
  startAt: number,
) => void;

const softTick: SfxSynthRenderer = (context, output, startAt) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(420, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(300, startAt + 0.055);
  gain.gain.setValueAtTime(0.055, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.07);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.08);
};

const softConfirm: SfxSynthRenderer = (context, output, startAt) => {
  for (const [offset, frequency] of [[0, 392], [0.07, 523.25]] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    gain.gain.setValueAtTime(0.05, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.14);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.16);
  }
};

export const SFX_GENERATORS = {
  "sfx.foundation.soft-tick": softTick,
  "sfx.foundation.soft-confirm": softConfirm,
} as const satisfies Record<string, SfxSynthRenderer>;

export type SfxGeneratorId = keyof typeof SFX_GENERATORS;

export const SFX_REGISTRY = {
  "ui.button.press": {
    group: "ui", minReplayMs: 40, relativeGain: 1,
    builtInGeneratorId: "sfx.foundation.soft-tick",
  },
  "ui.feedback.error": { group: "ui", minReplayMs: 300, relativeGain: 1 },
  "hub.book.land": { group: "hub", minReplayMs: 40, relativeGain: 1 },
  "hub.book.open": { group: "hub", minReplayMs: 220, relativeGain: 1 },
  "ranked.record.open": { group: "ranked", minReplayMs: 250, relativeGain: 1 },
  "ranked.record.close": { group: "ranked", minReplayMs: 250, relativeGain: 1 },
  "ranked.role.step": {
    group: "ranked", minReplayMs: 40, relativeGain: 0.8,
    builtInGeneratorId: "sfx.foundation.soft-tick",
  },
  "ranked.mascot.react": { group: "ranked", minReplayMs: 110, relativeGain: 1 },
  "ranked.mode.confirm": {
    group: "ranked", minReplayMs: 250, relativeGain: 1,
    builtInGeneratorId: "sfx.foundation.soft-confirm",
  },
  "ranked.queue.start": { group: "ranked", minReplayMs: 400, relativeGain: 1 },
  "ranked.opponent.found": { group: "ranked", minReplayMs: 400, relativeGain: 1 },
} as const satisfies Record<string, SfxRegistryEntry>;

export type SfxEvent = keyof typeof SFX_REGISTRY;

/** One migration map, kept beside the canonical vocabulary. SFX1.2 consumes it. */
export const LEGACY_PLAY_SFX_EVENT = {
  scrollOpen: "ranked.record.open",
  scrollClose: "ranked.record.close",
  roleStep: "ranked.role.step",
  mascotReact: "ranked.mascot.react",
  modeConfirm: "ranked.mode.confirm",
  queueStart: "ranked.queue.start",
  opponentFound: "ranked.opponent.found",
  error: "ui.feedback.error",
  buttonPress: "ui.button.press",
  bookLand: "hub.book.land",
  bookRuffle: "hub.book.open",
} as const satisfies Record<string, SfxEvent>;

export function getSfxRegistryEntry(event: string): SfxRegistryEntry | null {
  return Object.prototype.hasOwnProperty.call(SFX_REGISTRY, event)
    ? SFX_REGISTRY[event as SfxEvent]
    : null;
}

export function getSfxGenerator(id: string | null | undefined): SfxSynthRenderer | null {
  return id && Object.prototype.hasOwnProperty.call(SFX_GENERATORS, id)
    ? SFX_GENERATORS[id as SfxGeneratorId]
    : null;
}
