import {
  EMPTY_AUDIO_STUDIO_CONFIG,
  loadAudioStudioConfig,
  resolveModeBinding,
  type AudioStudioConfig,
} from "./audio-studio-config";

export interface ResolvedAudioSource { src: string; type: string }
export interface ResolvedAudioAsset {
  id: string;
  kind: "music" | "sfx" | "cinematic" | "voice";
  title: string;
  artist?: string;
  artworkUrl?: string;
  sources: ResolvedAudioSource[];
  durationMs?: number;
  relativeGain: number;
  showNowPlayingNotification: boolean;
}
export interface ResolvedAudioPlaylist {
  id: string;
  slug: string;
  name: string;
  shuffleMode: "ordered" | "shuffle";
  tracks: ResolvedAudioAsset[];
}
export type ResolvedModeSoundtrack =
  | { sourceType: "asset"; asset: ResolvedAudioAsset; startBehavior: string; exitBehavior: string; defaultAudible: boolean }
  | { sourceType: "playlist"; playlist: ResolvedAudioPlaylist; startBehavior: string; exitBehavior: string; defaultAudible: boolean }
  | { sourceType: "radio"; startBehavior: string; exitBehavior: string; defaultAudible: boolean }
  | { sourceType: "none"; reason: "configured" | "missing" | "invalid" };
export type AudioStudioRuntimeStatus = "idle" | "loading" | "available" | "unavailable" | "stale";

export interface AudioStudioRuntimeSnapshot {
  status: AudioStudioRuntimeStatus;
  config: AudioStudioConfig;
  loadedAt: number | null;
  reason: string | null;
  fromCache: boolean;
}

let snapshot: AudioStudioRuntimeSnapshot = {
  status: "idle",
  config: EMPTY_AUDIO_STUDIO_CONFIG,
  loadedAt: null,
  reason: null,
  fromCache: false,
};
let inFlight: Promise<AudioStudioRuntimeSnapshot> | null = null;
const listeners = new Set<() => void>();

function publish(next: AudioStudioRuntimeSnapshot): AudioStudioRuntimeSnapshot {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return next;
}

function validStoragePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function validBundledUrl(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  return value.split("/").every((part) => part !== "." && part !== "..");
}

function validExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function storagePublicUrl(path: string): string | null {
  if (!validStoragePath(path)) return null;
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/audio-studio/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function clampEffectiveVolume(channelVolume: number, relativeGain: number): number {
  const volume = Number.isFinite(channelVolume) ? channelVolume : 0;
  const gain = Number.isFinite(relativeGain) ? relativeGain : 1;
  return Math.min(1, Math.max(0, volume * Math.min(4, Math.max(0, gain))));
}

export function resolveRuntimeAsset(config: AudioStudioConfig, id: string): ResolvedAudioAsset | null {
  const asset = config.assets.find((candidate) => candidate.id === id && candidate.enabled);
  if (!asset) return null;
  const src = asset.sourceType === "storage"
    ? asset.storagePath ? storagePublicUrl(asset.storagePath) : null
    : asset.sourceUrl && (
      asset.sourceType === "bundled" ? validBundledUrl(asset.sourceUrl) : validExternalUrl(asset.sourceUrl)
    ) ? asset.sourceUrl : null;
  if (!src) return null;
  const artworkUrl = asset.artworkStoragePath
    ? storagePublicUrl(asset.artworkStoragePath) ?? undefined
    : asset.artworkUrl && validExternalUrl(asset.artworkUrl) ? asset.artworkUrl : undefined;
  return {
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    artist: asset.artist ?? undefined,
    artworkUrl,
    sources: [{ src, type: asset.mimeType }],
    durationMs: asset.durationMs ?? undefined,
    relativeGain: Math.min(4, Math.max(0, asset.relativeGain)),
    showNowPlayingNotification: asset.showNowPlayingNotification,
  };
}

export function resolveRuntimePlaylist(config: AudioStudioConfig, slugOrId: string): ResolvedAudioPlaylist | null {
  const playlist = config.playlists.find((candidate) =>
    candidate.enabled && (candidate.slug === slugOrId || candidate.id === slugOrId));
  if (!playlist) return null;
  const tracks = playlist.items
    .filter((item) => item.enabled)
    .flatMap((item) => {
      const asset = resolveRuntimeAsset(config, item.assetId);
      return asset?.kind === "music" ? [asset] : [];
    });
  if (tracks.length === 0) return null;
  return {
    id: playlist.id,
    slug: playlist.slug,
    name: playlist.name,
    shuffleMode: playlist.shuffleMode,
    tracks,
  };
}

export function resolveModeSoundtrack(modeKey: string, config = snapshot.config): ResolvedModeSoundtrack {
  const binding = resolveModeBinding(config, modeKey);
  if (!binding.enabled) return { sourceType: "none", reason: "configured" };
  const policy = {
    startBehavior: binding.startBehavior,
    exitBehavior: binding.exitBehavior,
    defaultAudible: binding.defaultAudible,
  };
  if (binding.sourceType === "none") {
    return { sourceType: "none", reason: binding.resolution === "canonical" ? "configured" : "missing" };
  }
  if (binding.sourceType === "radio") return { sourceType: "radio", ...policy };
  if (binding.sourceType === "asset" && binding.assetId) {
    const asset = resolveRuntimeAsset(config, binding.assetId);
    return asset?.kind === "music"
      ? { sourceType: "asset", asset, ...policy }
      : { sourceType: "none", reason: "invalid" };
  }
  if (binding.sourceType === "playlist" && binding.playlistId) {
    const playlist = resolveRuntimePlaylist(config, binding.playlistId);
    return playlist
      ? { sourceType: "playlist", playlist, ...policy }
      : { sourceType: "none", reason: "invalid" };
  }
  return { sourceType: "none", reason: "invalid" };
}

export function getAudioStudioRuntimeSnapshot(): AudioStudioRuntimeSnapshot { return snapshot; }
export function subscribeAudioStudioRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadAudioStudioRuntime(): Promise<AudioStudioRuntimeSnapshot> {
  if (snapshot.status === "available" || snapshot.status === "stale") {
    return Promise.resolve({ ...snapshot, fromCache: true });
  }
  if (inFlight) return inFlight;
  publish({ ...snapshot, status: "loading", reason: null, fromCache: false });
  inFlight = loadAudioStudioConfig()
    .then((config) => publish({
      status: "available",
      config,
      loadedAt: Date.now(),
      reason: null,
      fromCache: false,
    }))
    .catch((error: unknown) => publish({
      ...snapshot,
      status: snapshot.loadedAt ? "stale" : "unavailable",
      reason: error instanceof Error ? error.message : "Configuration request failed",
      fromCache: Boolean(snapshot.loadedAt),
    }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function refreshAudioStudioRuntime(): Promise<AudioStudioRuntimeSnapshot> {
  if (inFlight) return inFlight;
  snapshot = { ...snapshot, status: "idle", fromCache: false };
  return loadAudioStudioRuntime();
}

export function invalidateAudioStudioRuntime(): void {
  inFlight = null;
  publish({ status: "idle", config: EMPTY_AUDIO_STUDIO_CONFIG, loadedAt: null, reason: null, fromCache: false });
}

export function resetAudioStudioRuntimeForTests(): void {
  invalidateAudioStudioRuntime();
  listeners.clear();
}
