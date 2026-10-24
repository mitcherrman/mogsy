/**
 * Academy Pulse — who sees it.
 *
 * PULSE-1 is an unreleased prototype. It must never appear on the public Home
 * Hub by accident, so the default is OFF and the switch is a build-time value:
 *
 *   VITE_ACADEMY_PULSE = "off"       → disabled (emergency rollback)
 *   VITE_ACADEMY_PULSE = "preview"   → only with `?pulse=1` in the URL
 *   VITE_ACADEMY_PULSE = "on"        → always
 *   unset                           → preview in dev, on in production (public editorial feed)
 *
 * The Vite dev server (and the e2e dev server) behaves as "preview", so a
 * development preview is `/lol?pulse=1`. The preview choice is remembered for
 * the tab (sessionStorage) so a round trip through a book keeps it; `?pulse=0`
 * forgets it.
 */

export type PulseFlagMode = "off" | "preview" | "on";

export const PULSE_PREVIEW_STORAGE_KEY = "academy-pulse:preview";

export function pulseFlagMode(envValue: string | undefined, isDev: boolean): PulseFlagMode {
  const v = (envValue ?? "").trim().toLowerCase();
  if (v === "on") return "on";
  if (v === "preview") return "preview";
  if (v === "off") return "off";
  // Owner-authorized public launch. Set VITE_ACADEMY_PULSE=off to roll back.
  return isDev ? "preview" : "on";
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function resolvePulseEnabled(mode: PulseFlagMode, search: string, storage: StorageLike | null): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  const param = new URLSearchParams(search).get("pulse");
  try {
    if (param === "1") { storage?.setItem(PULSE_PREVIEW_STORAGE_KEY, "1"); return true; }
    if (param === "0") { storage?.removeItem(PULSE_PREVIEW_STORAGE_KEY); return false; }
    return storage?.getItem(PULSE_PREVIEW_STORAGE_KEY) === "1";
  } catch {
    return param === "1";
  }
}

/** Read once per page mount (the flag never flips under a mounted page). */
export function readAcademyPulseEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const mode = pulseFlagMode(import.meta.env.VITE_ACADEMY_PULSE as string | undefined, import.meta.env.DEV === true);
  let storage: StorageLike | null = null;
  try { storage = window.sessionStorage; } catch { storage = null; }
  return resolvePulseEnabled(mode, window.location.search, storage);
}
