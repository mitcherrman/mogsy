import type { SoundSettings } from "./sound-settings-runtime";
import {
  SFX_GENERATORS,
  type SfxGeneratorId,
  type SfxSynthRenderer,
} from "./sfx-renderers";

export type { SfxSynthRenderer } from "./sfx-renderers";

export interface SfxAssetVoice {
  src: string;
  gain: number;
  at?: number;
  trimEnd?: number;
  fadeOut?: number;
}

export interface SfxRegistryEntry {
  group: "ui" | "landing" | "swipe" | "card" | "shop" | "welcome" | "hub" | "leaguecraft" | "ranked" | "combat" | "archives" | "pro-play" | "auth" | "broadcast";
  minReplayMs: number;
  relativeGain: number;
  legacySettingKey?: keyof SoundSettings;
  builtInGeneratorId?: SfxGeneratorId;
  builtInAssetVoices?: readonly SfxAssetVoice[];
}

export const SFX_REGISTRY = {
  // Migrated legacy UI requests deliberately have no built-in voice. The old
  // per-browser UI system was off by default, so these stay silent until an
  // operator authors an Audio Studio binding.
  "ui.navigation.activate": { group: "ui", minReplayMs: 40, relativeGain: 1 },
  "ui.identity.action": { group: "ui", minReplayMs: 40, relativeGain: 1 },
  "hub.application.enter": { group: "hub", minReplayMs: 500, relativeGain: 1 },
  "training.primary.activate": { group: "ui", minReplayMs: 40, relativeGain: 1 },
  "landing.enter": { group: "landing", minReplayMs: 0, relativeGain: 1, legacySettingKey: "launch_chime", builtInGeneratorId: "sfx.legacy.launch" },
  "swipe.action": { group: "swipe", minReplayMs: 0, relativeGain: 1, legacySettingKey: "swipe_tap", builtInGeneratorId: "sfx.legacy.swipe" },
  "swipe.elo.correct": { group: "swipe", minReplayMs: 0, relativeGain: 1, legacySettingKey: "correct_chime", builtInGeneratorId: "sfx.legacy.correct" },
  "swipe.elo.wrong": { group: "swipe", minReplayMs: 0, relativeGain: 1, legacySettingKey: "wrong_tone", builtInGeneratorId: "sfx.legacy.wrong" },
  "card.animation.paper-rip": { group: "card", minReplayMs: 0, relativeGain: 1, legacySettingKey: "anim_paper_rip", builtInAssetVoices: [{ src: "/sounds/card-rip.mp3", gain: 0.5 }] },
  "card.animation.shatter": { group: "card", minReplayMs: 0, relativeGain: 1, legacySettingKey: "anim_shatter", builtInGeneratorId: "sfx.legacy.shatter" },
  "card.animation.burn": { group: "card", minReplayMs: 0, relativeGain: 1, legacySettingKey: "anim_burn", builtInGeneratorId: "sfx.legacy.burn" },
  "card.animation.vaporize": { group: "card", minReplayMs: 0, relativeGain: 1, legacySettingKey: "anim_vaporize", builtInGeneratorId: "sfx.legacy.vaporize" },
  "card.animation.crush": { group: "card", minReplayMs: 0, relativeGain: 1, legacySettingKey: "anim_crush", builtInGeneratorId: "sfx.legacy.crush" },
  "card.animation.chop": { group: "card", minReplayMs: 0, relativeGain: 1, builtInAssetVoices: [{ src: "/sounds/youre-chopped.mp3", gain: 0.6 }] },
  "card.animation.mogged": { group: "card", minReplayMs: 0, relativeGain: 1, builtInAssetVoices: [{ src: "/sounds/mogged.mp3", gain: 0.6 }] },
  "card.animation.doakes": { group: "card", minReplayMs: 0, relativeGain: 1, builtInAssetVoices: [
    { src: "/sounds/mogged.mp3", gain: 0.4 },
    { src: "/sounds/surprise-motherfucker.mp3", gain: 0.6, at: 0.15, trimEnd: 0.3, fadeOut: 0.15 },
  ] },
  "card.animation.amongus": { group: "card", minReplayMs: 0, relativeGain: 1, builtInAssetVoices: [{ src: "/sounds/amongus-death.mp3", gain: 0.6 }] },
  "shop.purchase": { group: "shop", minReplayMs: 0, relativeGain: 1, legacySettingKey: "shop_purchase", builtInGeneratorId: "sfx.legacy.shop-purchase" },
  "shop.diamond.tap": { group: "shop", minReplayMs: 0, relativeGain: 1, legacySettingKey: "shop_diamond_tap", builtInGeneratorId: "sfx.legacy.shop-diamond" },
  "shop.powerup": { group: "shop", minReplayMs: 0, relativeGain: 1, legacySettingKey: "shop_powerup", builtInGeneratorId: "sfx.legacy.shop-powerup" },
  "welcome.scribble": { group: "welcome", minReplayMs: 0, relativeGain: 1, legacySettingKey: "welcome_scribble", builtInGeneratorId: "sfx.legacy.welcome-scribble" },
  "welcome.page.turn": { group: "welcome", minReplayMs: 300, relativeGain: 1, legacySettingKey: "welcome_page_turn", builtInGeneratorId: "sfx.legacy.welcome-page-turn" },
  "ui.button.press": { group: "ui", minReplayMs: 40, relativeGain: 1, legacySettingKey: "play_button_press", builtInGeneratorId: "sfx.legacy.button-press" },
  "ui.feedback.error": { group: "ui", minReplayMs: 300, relativeGain: 1, legacySettingKey: "play_error", builtInGeneratorId: "sfx.legacy.error" },
  "hub.book.land": { group: "hub", minReplayMs: 40, relativeGain: 1, legacySettingKey: "play_book_land", builtInGeneratorId: "sfx.legacy.book-land" },
  "hub.book.open": { group: "hub", minReplayMs: 220, relativeGain: 1, legacySettingKey: "play_book_ruffle", builtInGeneratorId: "sfx.legacy.book-ruffle" },
  "hub.destination.focus": { group: "hub", minReplayMs: 0, relativeGain: 0.72, builtInGeneratorId: "sfx.hub.destination-focus" },
  "leaguecraft.record.selection": { group: "leaguecraft", minReplayMs: 80, relativeGain: 0.82, builtInGeneratorId: "sfx.leaguecraft.selection" },
  "leaguecraft.quiz.start": { group: "leaguecraft", minReplayMs: 250, relativeGain: 0.92, builtInGeneratorId: "sfx.leaguecraft.quiz-start" },
  "leaguecraft.answer.lock": { group: "leaguecraft", minReplayMs: 120, relativeGain: 0.82, builtInGeneratorId: "sfx.leaguecraft.answer-lock" },
  "leaguecraft.answer.correct": { group: "leaguecraft", minReplayMs: 180, relativeGain: 0.9, builtInGeneratorId: "sfx.leaguecraft.answer-correct" },
  "leaguecraft.answer.incorrect": { group: "leaguecraft", minReplayMs: 180, relativeGain: 0.88, builtInGeneratorId: "sfx.leaguecraft.answer-incorrect" },
  "leaguecraft.quiz.complete": { group: "leaguecraft", minReplayMs: 500, relativeGain: 0.95, builtInGeneratorId: "sfx.leaguecraft.quiz-complete" },
  "ranked.record.open": { group: "ranked", minReplayMs: 250, relativeGain: 1, legacySettingKey: "play_scroll_open", builtInGeneratorId: "sfx.legacy.scroll-open" },
  "ranked.record.close": { group: "ranked", minReplayMs: 250, relativeGain: 1, legacySettingKey: "play_scroll_close", builtInGeneratorId: "sfx.legacy.scroll-close" },
  "ranked.role.step": { group: "ranked", minReplayMs: 40, relativeGain: 1, legacySettingKey: "play_role_step", builtInGeneratorId: "sfx.legacy.role-step" },
  "ranked.mascot.react": { group: "ranked", minReplayMs: 110, relativeGain: 1, legacySettingKey: "play_mascot_react", builtInGeneratorId: "sfx.legacy.mascot" },
  "ranked.mode.confirm": { group: "ranked", minReplayMs: 250, relativeGain: 1, legacySettingKey: "play_mode_confirm", builtInGeneratorId: "sfx.legacy.mode-confirm" },
  "ranked.queue.start": { group: "ranked", minReplayMs: 400, relativeGain: 1, legacySettingKey: "play_queue_start", builtInGeneratorId: "sfx.legacy.queue-start" },
  "ranked.opponent.found": { group: "ranked", minReplayMs: 400, relativeGain: 1, legacySettingKey: "play_opponent_found", builtInGeneratorId: "sfx.legacy.opponent-found" },
  "ranked.module.start": { group: "ranked", minReplayMs: 300, relativeGain: 0.82, builtInGeneratorId: "sfx.ranked.module-start" },
  "ranked.answer.lock": { group: "ranked", minReplayMs: 90, relativeGain: 0.8, builtInGeneratorId: "sfx.ranked.answer-lock" },
  "ranked.answer.correct": { group: "ranked", minReplayMs: 140, relativeGain: 0.88, builtInGeneratorId: "sfx.ranked.answer-correct" },
  "ranked.answer.incorrect": { group: "ranked", minReplayMs: 140, relativeGain: 0.84, builtInGeneratorId: "sfx.ranked.answer-incorrect" },
  "ranked.opponent.submitted": { group: "ranked", minReplayMs: 180, relativeGain: 0.58, builtInGeneratorId: "sfx.ranked.opponent-submitted" },
  "ranked.meta.action": { group: "ranked", minReplayMs: 90, relativeGain: 0.62, builtInGeneratorId: "sfx.ranked.meta-action" },
  "ranked.points.awarded": { group: "ranked", minReplayMs: 180, relativeGain: 0.78, builtInGeneratorId: "sfx.ranked.points-awarded" },
  "ranked.speed.bonus": { group: "ranked", minReplayMs: 180, relativeGain: 0.7, builtInGeneratorId: "sfx.ranked.speed-bonus" },
  // RFX1 2B3 — THE PRESENTATION BEATS. Deliberately voiceless, exactly as the
  // migrated legacy UI requests above are: the registry's own contract is that
  // an entry with no `builtInGeneratorId` and no `builtInAssetVoices` is
  // SILENT until an operator authors an Audio Studio binding, and this phase
  // adds no sound assets. What these rows buy today is the seam — one
  // canonical event name per beat, with policy, unlock, mute, cache and
  // dedupe already applied — so giving them a voice later is an Audio Studio
  // action and not a code change.
  "ranked.duel.begin": { group: "ranked", minReplayMs: 1000, relativeGain: 1 },
  "ranked.mode.shift": { group: "ranked", minReplayMs: 400, relativeGain: 1 },
  "ranked.round.final": { group: "ranked", minReplayMs: 400, relativeGain: 1 },
  "ranked.match.victory": { group: "ranked", minReplayMs: 1000, relativeGain: 0.94, builtInGeneratorId: "sfx.ranked.match-victory" },
  "ranked.match.defeat": { group: "ranked", minReplayMs: 1000, relativeGain: 0.88, builtInGeneratorId: "sfx.ranked.match-defeat" },
  "ranked.match.draw": { group: "ranked", minReplayMs: 1000, relativeGain: 0.88, builtInGeneratorId: "sfx.ranked.match-draw" },
  "combat.simulation.resolve": { group: "combat", minReplayMs: 220, relativeGain: 0.78, builtInGeneratorId: "sfx.combat.simulation-resolve" },
  "archives.reference.open": { group: "archives", minReplayMs: 120, relativeGain: 0.48, builtInGeneratorId: "sfx.archives.reference-open" },
  "pro-play.analysis.open": { group: "pro-play", minReplayMs: 160, relativeGain: 0.62, builtInGeneratorId: "sfx.pro-play.analysis-open" },
  "account.action.confirmed": { group: "auth", minReplayMs: 300, relativeGain: 0.6, builtInGeneratorId: "sfx.account.action-confirmed" },
  // Broadcast remains asset-first and session-configured. These entries give
  // its existing vocabulary canonical policy, unlock, mute, cache and dedupe
  // without inventing fallback sounds when an operator has configured none.
  "broadcast.question.start": { group: "broadcast", minReplayMs: 120, relativeGain: 1 },
  "broadcast.countdown.tick": { group: "broadcast", minReplayMs: 120, relativeGain: 1 },
  "broadcast.reveal": { group: "broadcast", minReplayMs: 180, relativeGain: 1 },
  "broadcast.answer.correct": { group: "broadcast", minReplayMs: 180, relativeGain: 1 },
  "broadcast.transition": { group: "broadcast", minReplayMs: 120, relativeGain: 1 },
} as const satisfies Record<string, SfxRegistryEntry>;

export type SfxEvent = keyof typeof SFX_REGISTRY;

export const LEGACY_PLAY_SFX_EVENT = {
  scrollOpen: "ranked.record.open", scrollClose: "ranked.record.close",
  roleStep: "ranked.role.step", mascotReact: "ranked.mascot.react",
  modeConfirm: "ranked.mode.confirm", queueStart: "ranked.queue.start",
  opponentFound: "ranked.opponent.found", error: "ui.feedback.error",
  buttonPress: "ui.button.press", bookLand: "hub.book.land", bookRuffle: "hub.book.open",
} as const satisfies Record<string, SfxEvent>;

export const LEGACY_ANIMATION_SFX_EVENT = {
  slice: "card.animation.paper-rip", shatter: "card.animation.shatter",
  burn: "card.animation.burn", vaporize: "card.animation.vaporize",
  crush: "card.animation.crush", chop: "card.animation.chop",
  mogged: "card.animation.mogged", doakes: "card.animation.doakes",
  amongus: "card.animation.amongus",
} as const satisfies Record<string, SfxEvent>;

/** Canonical event controlled by each surviving app_settings sound toggle. */
export const SFX_EVENT_BY_LEGACY_SETTING = {
  launch_chime: "landing.enter",
  swipe_tap: "swipe.action",
  correct_chime: "swipe.elo.correct",
  wrong_tone: "swipe.elo.wrong",
  anim_paper_rip: "card.animation.paper-rip",
  anim_shatter: "card.animation.shatter",
  anim_burn: "card.animation.burn",
  anim_vaporize: "card.animation.vaporize",
  anim_crush: "card.animation.crush",
  shop_purchase: "shop.purchase",
  shop_diamond_tap: "shop.diamond.tap",
  shop_powerup: "shop.powerup",
  welcome_scribble: "welcome.scribble",
  welcome_page_turn: "welcome.page.turn",
  play_scroll_open: "ranked.record.open",
  play_scroll_close: "ranked.record.close",
  play_role_step: "ranked.role.step",
  play_mascot_react: "ranked.mascot.react",
  play_mode_confirm: "ranked.mode.confirm",
  play_queue_start: "ranked.queue.start",
  play_opponent_found: "ranked.opponent.found",
  play_error: "ui.feedback.error",
  play_button_press: "ui.button.press",
  play_book_land: "hub.book.land",
  play_book_ruffle: "hub.book.open",
} as const satisfies Partial<Record<keyof SoundSettings, SfxEvent>>;

export function getSfxRegistryEntry(event: string): SfxRegistryEntry | null {
  return Object.prototype.hasOwnProperty.call(SFX_REGISTRY, event) ? SFX_REGISTRY[event as SfxEvent] : null;
}

export function getSfxGenerator(id: string | null | undefined): SfxSynthRenderer | null {
  return id && Object.prototype.hasOwnProperty.call(SFX_GENERATORS, id)
    ? SFX_GENERATORS[id as SfxGeneratorId]
    : null;
}
