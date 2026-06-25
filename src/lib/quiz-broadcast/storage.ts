import type { BroadcastConfig, BroadcastPlaylist } from "./types";
import { DEFAULT_CONFIG } from "./types";

const PLAYLISTS_KEY = "mogsy.quizBroadcast.playlists.v1";
const CONFIG_KEY = "mogsy.quizBroadcast.config.v1";

export function loadPlaylists(): BroadcastPlaylist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlaylists(list: BroadcastPlaylist[]) {
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function upsertPlaylist(p: BroadcastPlaylist) {
  const list = loadPlaylists();
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) list[idx] = p;
  else list.unshift(p);
  savePlaylists(list);
  return list;
}

export function deletePlaylist(id: string) {
  const list = loadPlaylists().filter((p) => p.id !== id);
  savePlaylists(list);
  return list;
}

export function loadConfig(): BroadcastConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<BroadcastConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      timing: { ...DEFAULT_CONFIG.timing, ...(parsed.timing ?? {}) },
      visuals: { ...DEFAULT_CONFIG.visuals, ...(parsed.visuals ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: BroadcastConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* quota */
  }
}