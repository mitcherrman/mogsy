import type { SoundSettings } from "./sound-settings-runtime";
import type { AudioEventBinding, AudioStudioConfig } from "./audio-studio-config";
import { resolveRuntimeAsset } from "./audio-studio-runtime";
import { SFX_EVENT_BY_LEGACY_SETTING, type SfxEvent } from "./sfx-registry";

export const LEGACY_CUSTOM_SOUND_SETTINGS_KEY = "custom_sound_urls";
export const ADMIN_SFX_TAG = "admin-sounds-replacement";

export interface AdminSfxReplacementState {
  urls: Partial<Record<keyof SoundSettings, string>>;
  migratedLegacyKeys: Array<keyof SoundSettings>;
}

export interface AdminSfxReplacementPlan {
  assets: Array<{
    id: string;
    kind: "sfx";
    title: string;
    source_type: "external";
    source_url: string;
    mime_type: string;
    enabled: true;
    relative_gain: number;
    tags: string[];
    show_now_playing_notification: false;
  }>;
  bindings: Array<{
    event_key: SfxEvent;
    source_type: "asset";
    audio_asset_id: string;
    generator_id: null;
    enabled: true;
    relative_gain: number;
  }>;
  removeBindings: SfxEvent[];
  remainingLegacyUrls: Record<string, string>;
}

const mimeForUrl = (url: string): string => {
  const clean = url.split(/[?#]/, 1)[0].toLowerCase();
  if (clean.endsWith(".wav")) return "audio/wav";
  if (clean.endsWith(".ogg")) return "audio/ogg";
  if (clean.endsWith(".webm")) return "audio/webm";
  if (clean.endsWith(".m4a")) return "audio/mp4";
  return "audio/mpeg";
};

function bindingForSetting(
  bindings: AudioEventBinding[],
  key: keyof SoundSettings,
): AudioEventBinding | undefined {
  const event = SFX_EVENT_BY_LEGACY_SETTING[key];
  return event ? bindings.find((binding) => binding.eventKey === event) : undefined;
}

/**
 * Audio Studio is authoritative. Legacy URLs are surfaced only when an event
 * has no binding, so the next successful Save can migrate them without loss.
 */
export function readAdminSfxReplacements(
  config: AudioStudioConfig,
  legacyUrls: Record<string, string>,
): AdminSfxReplacementState {
  const urls: Partial<Record<keyof SoundSettings, string>> = {};
  const migratedLegacyKeys: Array<keyof SoundSettings> = [];
  for (const rawKey of Object.keys(SFX_EVENT_BY_LEGACY_SETTING)) {
    const key = rawKey as keyof SoundSettings;
    const binding = bindingForSetting(config.eventBindings, key);
    if (binding) {
      if (binding.sourceType === "asset" && binding.assetId) {
        const asset = resolveRuntimeAsset(config, binding.assetId);
        const url = asset?.kind === "sfx" ? asset.sources[0]?.src : null;
        if (url) urls[key] = url;
      }
      // Any explicit binding, including disabled/invalid, outranks migration
      // input. Never resurrect an old URL over current operator intent.
      continue;
    }
    const legacyUrl = legacyUrls[key];
    if (typeof legacyUrl === "string" && legacyUrl.trim()) {
      urls[key] = legacyUrl;
      migratedLegacyKeys.push(key);
    }
  }
  return { urls, migratedLegacyKeys };
}

export function buildAdminSfxReplacementPlan(args: {
  config: AudioStudioConfig;
  replacements: Partial<Record<keyof SoundSettings, string>>;
  removedKeys: ReadonlySet<keyof SoundSettings>;
  legacyUrls: Record<string, string>;
  labelFor: (key: keyof SoundSettings) => string;
  createId: () => string;
}): AdminSfxReplacementPlan {
  const assets: AdminSfxReplacementPlan["assets"] = [];
  const bindings: AdminSfxReplacementPlan["bindings"] = [];
  const removeBindings: SfxEvent[] = [];
  const remainingLegacyUrls = { ...args.legacyUrls };

  for (const rawKey of Object.keys(SFX_EVENT_BY_LEGACY_SETTING)) {
    const key = rawKey as keyof SoundSettings;
    const event = SFX_EVENT_BY_LEGACY_SETTING[key];
    if (!event) continue;

    if (args.removedKeys.has(key)) {
      delete remainingLegacyUrls[key];
      removeBindings.push(event);
      continue;
    }

    const url = args.replacements[key]?.trim();
    if (!url) continue;
    delete remainingLegacyUrls[key];
    const current = bindingForSetting(args.config.eventBindings, key);
    const currentAsset = current?.sourceType === "asset" && current.assetId
      ? resolveRuntimeAsset(args.config, current.assetId)
      : null;
    let assetId = currentAsset?.kind === "sfx" && currentAsset.sources[0]?.src === url
      ? currentAsset.id
      : null;
    if (!assetId) {
      assetId = args.createId();
      assets.push({
        id: assetId,
        kind: "sfx",
        title: `${args.labelFor(key)} replacement`,
        source_type: "external",
        source_url: url,
        mime_type: mimeForUrl(url),
        enabled: true,
        relative_gain: 1,
        tags: [ADMIN_SFX_TAG, key],
        show_now_playing_notification: false,
      });
    }
    bindings.push({
      event_key: event,
      source_type: "asset",
      audio_asset_id: assetId,
      generator_id: null,
      enabled: true,
      relative_gain: 1,
    });
  }

  return { assets, bindings, removeBindings, remainingLegacyUrls };
}

export function hasCanonicalSfxEvent(key: keyof SoundSettings): boolean {
  return Boolean(SFX_EVENT_BY_LEGACY_SETTING[key]);
}
