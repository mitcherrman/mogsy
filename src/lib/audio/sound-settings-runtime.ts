import { supabase } from "@/integrations/supabase/client";

export interface SoundSettings {
  launch_chime: boolean;
  swipe_tap: boolean;
  correct_chime: boolean;
  wrong_tone: boolean;
  anim_paper_rip: boolean;
  anim_shatter: boolean;
  anim_burn: boolean;
  anim_vaporize: boolean;
  anim_crush: boolean;
  shop_purchase: boolean;
  shop_diamond_tap: boolean;
  shop_powerup: boolean;
  welcome_scribble: boolean;
  welcome_page_turn: boolean;
  play_scroll_open: boolean;
  play_scroll_close: boolean;
  play_role_step: boolean;
  play_mascot_react: boolean;
  play_mode_confirm: boolean;
  play_queue_start: boolean;
  play_opponent_found: boolean;
  play_error: boolean;
  play_button_press: boolean;
  play_book_land: boolean;
  play_book_ruffle: boolean;
}

export const SOUND_DEFAULTS: SoundSettings = {
  launch_chime: true, swipe_tap: true,
  correct_chime: true, wrong_tone: true,
  anim_paper_rip: true, anim_shatter: true, anim_burn: true,
  anim_vaporize: true, anim_crush: true,
  shop_purchase: true, shop_diamond_tap: true, shop_powerup: true,
  welcome_scribble: true, welcome_page_turn: true,
  play_scroll_open: true, play_scroll_close: true, play_role_step: true,
  play_mascot_react: true, play_mode_confirm: true, play_queue_start: true,
  play_opponent_found: true, play_error: true, play_button_press: true,
  play_book_land: true, play_book_ruffle: true,
};

export const SOUND_LABELS: Record<keyof SoundSettings, { label: string; group: string; description: string }> = {
  launch_chime: { label: "Launch Chime", group: "General", description: "Sound when tapping the Mogsy logo to enter" },
  swipe_tap: { label: "Swipe Tap", group: "Swiping", description: "Haptic pop sound on each swipe action" },
  correct_chime: { label: "Correct Chime", group: "Swiping", description: "Ascending two-note chime on correct Elo guess" },
  wrong_tone: { label: "Wrong Tone", group: "Swiping", description: "Descending tone on wrong Elo guess" },
  anim_paper_rip: { label: "Paper Rip", group: "Card Animations", description: "Ripping sound for the Slice animation" },
  anim_shatter: { label: "Shatter", group: "Card Animations", description: "Glass shatter sound for the Shatter animation" },
  anim_burn: { label: "Burn", group: "Card Animations", description: "Fire whoosh sound for the Burn animation" },
  anim_vaporize: { label: "Vaporize", group: "Card Animations", description: "Sparkle dissolve sound for the Vaporize animation" },
  anim_crush: { label: "Crush", group: "Card Animations", description: "Heavy impact sound for the Crush animation" },
  shop_purchase: { label: "Purchase Chime", group: "Shop", description: "Ascending arpeggio on purchases" },
  shop_diamond_tap: { label: "Diamond Tap", group: "Shop", description: "Quick clink when tapping diamond items" },
  shop_powerup: { label: "Power-Up Whoosh", group: "Shop", description: "Rising whoosh for power-up actions" },
  welcome_scribble: { label: "Quill Scribble", group: "Academy Welcome", description: "Faint writing scratch while the welcome book writes itself" },
  welcome_page_turn: { label: "Page Turn", group: "Academy Welcome", description: "Soft paper turn when a welcome chapter's page is turned" },
  play_scroll_open: { label: "Record Unrolls", group: "Match Entry", description: "Parchment unrolling when PLAY opens the Choose Mode record" },
  play_scroll_close: { label: "Record Rolls Shut", group: "Match Entry", description: "The sheet rolling closed when the record is dismissed" },
  play_role_step: { label: "Role Step", group: "Match Entry", description: "Quiet parchment tick as the record's role stepper moves one notch" },
  play_mascot_react: { label: "Mascot Poke", group: "Match Entry", description: "Playful blip when the record's role mascot is tapped" },
  play_mode_confirm: { label: "Seal Pressed", group: "Match Entry", description: "Wax seal when a way to play is chosen on the record" },
  play_queue_start: { label: "Queue Opens", group: "Match Entry", description: "Rune taking light once the Ranked queue accepts the entry" },
  play_opponent_found: { label: "Opponent Found", group: "Match Entry", description: "Struck bell when the academy has paired the duel" },
  play_error: { label: "Match Entry Refused", group: "Match Entry", description: "Restrained negative cue when a role write or queue entry is refused" },
  play_button_press: { label: "Button Press", group: "Match Entry", description: "Quiet wooden knock for the record's ordinary controls — Back, Cancel, roster rows, the signup action" },
  play_book_land: { label: "Book Landing", group: "Academy Hub", description: "Heavy bound volume settling onto its shelf — one per book during the hub entrance" },
  play_book_ruffle: { label: "Book Page Ruffle", group: "Academy Hub", description: "Short page flick when a hub destination volume is opened" },
};

export type SoundSettingsRuntimeStatus = "idle" | "loading" | "available" | "unavailable";
export interface SoundSettingsRuntimeSnapshot {
  status: SoundSettingsRuntimeStatus;
  settings: SoundSettings;
}

let snapshot: SoundSettingsRuntimeSnapshot = { status: "idle", settings: SOUND_DEFAULTS };
let inFlight: Promise<SoundSettingsRuntimeSnapshot> | null = null;
const listeners = new Set<() => void>();

function publish(next: SoundSettingsRuntimeSnapshot): SoundSettingsRuntimeSnapshot {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return next;
}

export function getSoundSettingsRuntimeSnapshot(): SoundSettingsRuntimeSnapshot { return snapshot; }
export function subscribeSoundSettingsRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadSoundSettingsRuntime(): Promise<SoundSettingsRuntimeSnapshot> {
  if (snapshot.status === "available") return Promise.resolve(snapshot);
  if (inFlight) return inFlight;
  publish({ ...snapshot, status: "loading" });
  inFlight = Promise.resolve(supabase.from("app_settings").select("value").eq("key", "sound_settings").maybeSingle())
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      const stored = data?.value as Partial<SoundSettings> | null;
      return publish({ status: "available", settings: stored ? { ...SOUND_DEFAULTS, ...stored } : { ...SOUND_DEFAULTS } });
    })
    .catch(() => publish({ ...snapshot, status: "unavailable" }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function refreshSoundSettingsRuntime(): Promise<SoundSettingsRuntimeSnapshot> {
  inFlight = null;
  snapshot = { ...snapshot, status: "idle" };
  return loadSoundSettingsRuntime();
}

export function invalidateSoundSettingsCache(): void { void refreshSoundSettingsRuntime(); }
export function publishSoundSettings(settings: SoundSettings): void {
  publish({ status: "available", settings: { ...settings } });
}
export function resetSoundSettingsRuntimeForTests(): void {
  inFlight = null;
  snapshot = { status: "idle", settings: SOUND_DEFAULTS };
}
