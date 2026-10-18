import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PLATFORM_POLICY,
  parsePlatformPolicy,
  type PlatformPolicy,
} from "@/lib/platform-policy/policy";

// LEGACY1 — this hook used to also carry `card_stats_config` (the retired
// voting product's card stat overlay) and `nav_tab_mode` (its Play/Swipe navbar
// switch). Both product surfaces are deleted and nothing read either value any
// more, so the rows are historical residue with no reader rather than settings.

interface AppSettings {
  require_auth: boolean;
  /**
   * Admin-controlled global platform policy (Combat Sim tokens + tutorial).
   * Read from the same app_settings rows the backend reads, so there is exactly
   * one storage authority. Fail-closed defaults reproduce current behaviour.
   */
  policy: PlatformPolicy;
}

const defaults: AppSettings = {
  require_auth: true,
  policy: DEFAULT_PLATFORM_POLICY,
};

// `app_settings.value` is a Json column and each key stores its own object
// shape. This describes the single-field row this hook reads, so a typo in a
// property name is a compile error instead of a silent `undefined`.
type RequireAuthValue = { enabled?: boolean };

/**
 * ACADEMY STARTUP S1 — one read per session, shared by every consumer.
 *
 * `Layout` renders nothing but the startup surface until this hook stops
 * loading, and it used to start a fresh Supabase read on every mount, so the
 * Landing's hand-off to `/lol` always paid one round trip AFTER the entrance
 * veil had gone (measured 150–220 ms, ~480 ms on slow 4G, a flat dark frame).
 * Now the first read is shared and kept for the session: the Landing starts it
 * during its hold (`prefetchAppSettings`), and a later mount finds it settled.
 *
 * Freshness: a mount after FRESH_MS revalidates in the background without
 * going back to `loading`; the admin screens that write these rows call
 * `invalidateAppSettings()` after a confirmed save. FRESH_MS is short on
 * purpose (RC1 audit): before S1 every consumer mount re-read these rows, so a
 * changed `require_auth` or policy reached the next guarded route at once. The
 * cache exists for the Landing -> /lol hand-off (a few seconds), not to hold a
 * policy for minutes; 30 s keeps the hand-off free and later navigations close
 * to the old freshness, while still rendering from the cached copy.
 *
 * A failed read (no data, or a rejected request — which used to leave
 * `loading` true forever) settles on the defaults for that consumer exactly as
 * before, and is NOT cached: the next mount reads again. A failed REVALIDATION
 * keeps the last copy the server returned this session (marked stale, so the
 * next mount tries again) rather than dropping a settled screen to defaults.
 *
 * Invalidation is generation-safe: a read that was already in flight when an
 * admin save invalidated is neither joined nor allowed to overwrite the newer
 * read's result, so the saved state is what every consumer ends up with.
 */
const FRESH_MS = 30 * 1000;

let cached: { settings: AppSettings; at: number } | null = null;
let generation = 0;
let inflight: { gen: number; promise: Promise<AppSettings | null> } | null = null;
const listeners = new Set<() => void>();

function parse(data: { key: string; value: unknown }[]): AppSettings {
  const s = { ...defaults };
  for (const row of data) {
    if (row.key === "require_auth") s.require_auth = (row.value as RequireAuthValue | null)?.enabled ?? true;
  }
  // Policy rows are parsed by the shared pure contract, not inline, so
  // the guard, the hub, the admin panel, and the tests agree by
  // construction.
  s.policy = parsePlatformPolicy(data);
  return s;
}

function read(): Promise<AppSettings | null> {
  if (inflight && inflight.gen === generation) return inflight.promise;
  const gen = generation;
  const promise = (async (): Promise<AppSettings | null> => {
    try {
      const { data } = await supabase.from("app_settings").select("key, value");
      if (!data) return null;
      const settings = parse(data as { key: string; value: unknown }[]);
      if (gen === generation) cached = { settings, at: Date.now() };
      return settings;
    } catch {
      return null;
    }
  })();
  const entry = { gen, promise };
  inflight = entry;
  void promise.then(() => {
    if (inflight === entry) inflight = null;
    // A superseded read says nothing: the current generation's read will.
    if (gen !== generation) return;
    for (const l of [...listeners]) l();
  });
  return promise;
}

/** Start (or join) the session's settings read. Never rejects; nothing waits on it. */
export function prefetchAppSettings(): void {
  if (cached && Date.now() - cached.at <= FRESH_MS) return;
  void read();
}

/** After an admin write: drop the cached copy and re-read for every mounted consumer. */
export function invalidateAppSettings(): void {
  generation += 1;
  cached = null;
  void read();
}

/** Test seam. */
export function __resetAppSettingsForTests(): void {
  cached = null;
  inflight = null;
  generation = 0;
  listeners.clear();
}

export function useAppSettings() {
  const [state, setState] = useState<{ settings: AppSettings; loading: boolean }>(() =>
    cached ? { settings: cached.settings, loading: false } : { settings: defaults, loading: true },
  );

  useEffect(() => {
    let alive = true;
    const sync = () => {
      if (!alive) return;
      const snapshot = cached;
      setState((prev) =>
        snapshot
          ? prev.settings === snapshot.settings && !prev.loading ? prev : { settings: snapshot.settings, loading: false }
          : prev.loading ? { settings: prev.settings, loading: false } : prev,
      );
    };
    listeners.add(sync);
    if (cached) sync();
    if (!cached || Date.now() - cached.at > FRESH_MS) void read();
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, []);

  return state;
}
