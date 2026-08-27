export type AudioAssetKind = "music" | "sfx" | "cinematic" | "voice";
export type ModeBindingSource = "asset" | "playlist" | "radio" | "none";

export interface AudioStudioAsset {
  id: string;
  kind: AudioAssetKind;
  title: string;
  artist: string | null;
  sourceType: "bundled" | "storage" | "external";
  storagePath: string | null;
  sourceUrl: string | null;
  artworkStoragePath: string | null;
  artworkUrl: string | null;
  mimeType: string;
  durationMs: number | null;
  enabled: boolean;
  relativeGain: number;
  tags: string[];
  showNowPlayingNotification: boolean;
}

export interface AudioStudioPlaylist {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  shuffleMode: "ordered" | "shuffle";
  items: Array<{ assetId: string; position: number; enabled: boolean }>;
}

export interface AudioModeBinding {
  modeKey: string;
  sourceType: ModeBindingSource;
  assetId: string | null;
  playlistId: string | null;
  startBehavior: "continue" | "restart" | "random";
  exitBehavior: "stop" | "fade" | "return-to-radio";
  defaultAudible: boolean;
  enabled: boolean;
  resolution: "canonical" | "code-fallback";
}

export interface AudioEventBinding {
  eventKey: string;
  sourceType: "asset" | "synthesized" | "disabled" | "legacy";
  assetId: string | null;
  generatorId: string | null;
  enabled: boolean;
  relativeGain: number;
}

export interface AudioStudioConfig {
  assets: AudioStudioAsset[];
  playlists: AudioStudioPlaylist[];
  eventBindings: AudioEventBinding[];
  modeBindings: AudioModeBinding[];
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const text = (value: unknown): string | null => typeof value === "string" ? value : null;
const flag = (value: unknown, fallback = true): boolean => typeof value === "boolean" ? value : fallback;
const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function parseAudioStudioConfig(raw: {
  assets?: unknown;
  playlists?: unknown;
  playlistItems?: unknown;
  eventBindings?: unknown;
  modeBindings?: unknown;
}): AudioStudioConfig {
  const assets = (Array.isArray(raw.assets) ? raw.assets : []).flatMap((entry) => {
    const row = record(entry);
    const id = text(row?.id);
    const kind = text(row?.kind);
    const title = text(row?.title);
    const sourceType = text(row?.source_type);
    const mimeType = text(row?.mime_type);
    if (
      !id || !title || !mimeType ||
      !["music", "sfx", "cinematic", "voice"].includes(kind ?? "") ||
      !["bundled", "storage", "external"].includes(sourceType ?? "")
    ) return [];
    return [{
      id,
      kind: kind as AudioAssetKind,
      title,
      artist: text(row?.artist),
      sourceType: sourceType as AudioStudioAsset["sourceType"],
      storagePath: text(row?.storage_path),
      sourceUrl: text(row?.source_url),
      artworkStoragePath: text(row?.artwork_storage_path),
      artworkUrl: text(row?.artwork_url),
      mimeType,
      durationMs: typeof row?.duration_ms === "number" && Number.isFinite(row.duration_ms) && row.duration_ms > 0
        ? row.duration_ms
        : null,
      enabled: flag(row?.enabled),
      relativeGain: finite(row?.relative_gain, 1),
      tags: Array.isArray(row?.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      showNowPlayingNotification: flag(row?.show_now_playing_notification),
    }];
  });

  const itemsByPlaylist = new Map<string, AudioStudioPlaylist["items"]>();
  for (const entry of Array.isArray(raw.playlistItems) ? raw.playlistItems : []) {
    const row = record(entry);
    const playlistId = text(row?.playlist_id);
    const assetId = text(row?.audio_asset_id);
    const position = row?.position;
    if (!playlistId || !assetId || typeof position !== "number" || !Number.isInteger(position) || position < 0) continue;
    const items = itemsByPlaylist.get(playlistId) ?? [];
    items.push({ assetId, position, enabled: flag(row?.enabled) });
    itemsByPlaylist.set(playlistId, items);
  }
  itemsByPlaylist.forEach((items) => items.sort((left, right) => left.position - right.position));

  const playlists = (Array.isArray(raw.playlists) ? raw.playlists : []).flatMap((entry) => {
    const row = record(entry);
    const id = text(row?.id);
    const slug = text(row?.slug);
    const name = text(row?.name);
    const shuffleMode = text(row?.shuffle_mode);
    if (!id || !slug || !name || !["ordered", "shuffle"].includes(shuffleMode ?? "")) return [];
    return [{
      id,
      slug,
      name,
      description: text(row?.description) ?? "",
      enabled: flag(row?.enabled),
      shuffleMode: shuffleMode as AudioStudioPlaylist["shuffleMode"],
      items: itemsByPlaylist.get(id) ?? [],
    }];
  });

  const modeBindings = (Array.isArray(raw.modeBindings) ? raw.modeBindings : []).flatMap((entry) => {
    const row = record(entry);
    const modeKey = text(row?.mode_key);
    const sourceType = text(row?.source_type);
    const startBehavior = text(row?.start_behavior);
    const exitBehavior = text(row?.exit_behavior);
    if (
      !modeKey ||
      !["asset", "playlist", "radio", "none"].includes(sourceType ?? "") ||
      !["continue", "restart", "random"].includes(startBehavior ?? "") ||
      !["stop", "fade", "return-to-radio"].includes(exitBehavior ?? "")
    ) return [];
    return [{
      modeKey,
      sourceType: sourceType as ModeBindingSource,
      assetId: text(row?.audio_asset_id),
      playlistId: text(row?.playlist_id),
      startBehavior: startBehavior as AudioModeBinding["startBehavior"],
      exitBehavior: exitBehavior as AudioModeBinding["exitBehavior"],
      defaultAudible: flag(row?.default_audible),
      enabled: flag(row?.enabled),
      resolution: "canonical" as const,
    }];
  });

  const eventBindings = (Array.isArray(raw.eventBindings) ? raw.eventBindings : []).flatMap((entry) => {
    const row = record(entry);
    const eventKey = text(row?.event_key);
    const sourceType = text(row?.source_type);
    if (!eventKey || !["asset", "synthesized", "disabled", "legacy"].includes(sourceType ?? "")) return [];
    const assetId = text(row?.audio_asset_id);
    const generatorId = text(row?.generator_id);
    if (sourceType === "asset" && !assetId) return [];
    if (sourceType === "synthesized" && !generatorId) return [];
    if (["disabled", "legacy"].includes(sourceType) && (assetId || generatorId)) return [];
    return [{
      eventKey,
      sourceType: sourceType as AudioEventBinding["sourceType"],
      assetId,
      generatorId,
      enabled: flag(row?.enabled),
      relativeGain: finite(row?.relative_gain, 1),
    }];
  });

  return { assets, playlists, eventBindings, modeBindings };
}

export function resolveModeBinding(config: AudioStudioConfig, modeKey: string): AudioModeBinding {
  return config.modeBindings.find((binding) => binding.modeKey === modeKey) ?? {
    modeKey,
    sourceType: "none",
    assetId: null,
    playlistId: null,
    startBehavior: "restart",
    exitBehavior: "return-to-radio",
    defaultAudible: true,
    enabled: true,
    resolution: "code-fallback",
  };
}

type QueryResult = { data: unknown; error: { message: string } | null };
interface AudioStudioQuery { select(columns: string): PromiseLike<QueryResult> }
interface AudioStudioClient { from(table: string): AudioStudioQuery }

export async function loadAudioStudioConfig(): Promise<AudioStudioConfig> {
  const { supabase } = await import("@/integrations/supabase/client");
  const client = supabase as unknown as AudioStudioClient;
  const tables = [
    "audio_assets",
    "audio_playlists",
    "audio_playlist_items",
    "audio_event_bindings",
    "audio_mode_bindings",
  ];
  const results = await Promise.all(tables.map((table) => client.from(table).select("*")));
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  return parseAudioStudioConfig({
    assets: results[0].data,
    playlists: results[1].data,
    playlistItems: results[2].data,
    eventBindings: results[3].data,
    modeBindings: results[4].data,
  });
}

export const EMPTY_AUDIO_STUDIO_CONFIG: AudioStudioConfig = {
  assets: [],
  playlists: [],
  eventBindings: [],
  modeBindings: [],
};
