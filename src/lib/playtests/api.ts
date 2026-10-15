/**
 * UGMP — the owner Playtests hub's backend clients.
 *
 * * `GET /api/admin/playtests/status` — whether each hub mode can be served by
 *   THIS backend, and the real reason when it cannot.
 * * `/api/admin/interaction-lab/*` — the server-held Rangefinder and Glyph
 *   Press playtests. The client only ever receives PUBLIC rounds; the canonical
 *   stop / glyphs arrive only as the reveal to that round's own Lock.
 *
 * Every call carries the owner's admin headers (`buildAdminHeaders`), so the
 * backend's `require_admin` is the authorization boundary — the hub, the route
 * gate and the lazy chunk are presentation, not security. Nothing here grades,
 * scores or stores.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import type { GlyphPressCell, GlyphPressLedger, GlyphPressReveal } from "@/lib/interaction-grammar/types";

export const PLAYTESTS_STATUS_API = "/api/admin/playtests/status";
export const INTERACTION_LAB_API = "/api/admin/interaction-lab";

export class PlaytestApiError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string | null) {
    super(message);
    this.name = "PlaytestApiError";
  }
}

export type LabStatusKey = "rangefinder" | "glyph_press" | "stat_drop" | "combat_estimate";

export interface LabStatus {
  available: boolean;
  rounds: number;
  authority_label: string;
  reason: string | null;
}

export interface PresetStatus {
  available: boolean;
  reason: string | null;
}

export interface PlaytestStatus {
  contract: "admin_playtests.status.v1";
  labs: Partial<Record<LabStatusKey, LabStatus>>;
  presets: Record<string, PresetStatus>;
}

// ---------------------------------------------------------------- Rangefinder

export interface RangefinderPublicRound {
  index: number;
  content: {
    prompt: string;
    measureLabel: string;
    subject: { label: string; sublabel: string; slot: string; monogram: string };
    field: { unitLabel: string; stops: { token: string; units: number }[] };
    footnote: string;
  };
  art: { champion: string; slot: string };
  locked: boolean;
}

export interface RangefinderSession {
  contract: "interaction_lab.rangefinder.session.v1";
  session_id: string;
  authority_label: string;
  pool_size: number;
  rounds: RangefinderPublicRound[];
}

export interface RangefinderServerReveal {
  lockedToken: string;
  canonicalToken: string;
  verdict: "exact" | "short" | "long";
  measurementLabel: string;
  canonicalUnits: number;
  lockedUnits: number;
  deltaUnits: number;
  note: string | null;
  source: { label: string; url: string | null } | null;
}

export interface RangefinderLockResult {
  contract: "interaction_lab.rangefinder.reveal.v1";
  session_id: string;
  index: number;
  reveal: RangefinderServerReveal;
}

// ---------------------------------------------------------------- Glyph Press

export interface GlyphPressPublicRound {
  index: number;
  content: {
    prompt: string;
    categoryLabel: string;
    clue: { caption: string | null; monogram: string; mediaPath: string };
    structure: { cells: GlyphPressCell[]; glyphCount: number };
    alphabet: string;
    soundingsAllowed: number;
    footnote: string;
  };
  ledger: GlyphPressLedger;
  locked: boolean;
}

export interface GlyphPressSession {
  contract: "interaction_lab.glyph_press.session.v1";
  session_id: string;
  authority_label: string;
  pool_size: number;
  rounds: GlyphPressPublicRound[];
}

export interface GlyphPressSoundResult {
  contract: "interaction_lab.glyph_press.ledger.v1";
  session_id: string;
  index: number;
  ledger: GlyphPressLedger;
}

export interface GlyphPressLockResult {
  contract: "interaction_lab.glyph_press.reveal.v1";
  session_id: string;
  index: number;
  reveal: GlyphPressReveal;
}

type Fetch = typeof fetch;

async function send(url: string, init: RequestInit | undefined, fetchImpl: Fetch): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      headers: { ...(await buildAdminHeaders(url)), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch {
    throw new PlaytestApiError("Could not reach the admin backend.", null, null);
  }
}

async function errorFrom(res: Response): Promise<PlaytestApiError> {
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  const detail = (body as { detail?: unknown } | null)?.detail;
  const err = (detail as { error?: { code?: string; message?: string } } | undefined)?.error;
  const message = err?.message ?? (typeof detail === "string" ? detail : `Backend returned ${res.status}.`);
  return new PlaytestApiError(message, res.status, err?.code ?? null);
}

async function request<T>(url: string, expectContract: string, init: RequestInit | undefined, fetchImpl: Fetch): Promise<T> {
  const res = await send(url, init, fetchImpl);
  if (!res.ok) throw await errorFrom(res);
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  if ((body as { contract?: string } | null)?.contract !== expectContract) {
    throw new PlaytestApiError("Backend returned a response this page could not read.", res.status, null);
  }
  return body as T;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const lab = (path: string) => `${ADMIN_API_BASE_URL}${INTERACTION_LAB_API}${path}`;
const round = (mode: string, sid: string, index: number, action: string) =>
  lab(`/${mode}/sessions/${encodeURIComponent(sid)}/rounds/${index}/${action}`);

export function playtestsApi(fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  return {
    status: () =>
      request<PlaytestStatus>(`${ADMIN_API_BASE_URL}${PLAYTESTS_STATUS_API}`, "admin_playtests.status.v1", undefined, fetchImpl),

    startRangefinder: () =>
      request<RangefinderSession>(lab("/rangefinder/sessions"), "interaction_lab.rangefinder.session.v1", post(), fetchImpl),
    lockRangefinder: (sid: string, index: number, stop: string) =>
      request<RangefinderLockResult>(round("rangefinder", sid, index, "lock"), "interaction_lab.rangefinder.reveal.v1", post({ stop }), fetchImpl),

    startGlyphPress: () =>
      request<GlyphPressSession>(lab("/glyph-press/sessions"), "interaction_lab.glyph_press.session.v1", post(), fetchImpl),
    soundGlyphPress: (sid: string, index: number, glyph: string) =>
      request<GlyphPressSoundResult>(round("glyph-press", sid, index, "sound"), "interaction_lab.glyph_press.ledger.v1", post({ glyph }), fetchImpl),
    lockGlyphPress: (sid: string, index: number, glyphs: readonly (string | null)[]) =>
      request<GlyphPressLockResult>(round("glyph-press", sid, index, "lock"), "interaction_lab.glyph_press.reveal.v1", post({ glyphs }), fetchImpl),
    /**
     * The clue image is owner-authenticated (an `<img src>` cannot carry the
     * bearer), so it is fetched with the admin headers and shown from a blob
     * URL. The caller revokes it.
     */
    clueImage: async (mediaPath: string): Promise<string> => {
      const res = await send(lab(mediaPath), undefined, fetchImpl);
      if (!res.ok) throw await errorFrom(res);
      return URL.createObjectURL(await res.blob());
    },
  };
}
export type PlaytestsApi = ReturnType<typeof playtestsApi>;

/**
 * One sentence an owner can act on, for any failure of these endpoints. A 404
 * with no error code means the route itself is missing: the backend predates
 * the hub.
 */
export function describePlaytestError(err: unknown, what: string): string {
  if (!(err instanceof PlaytestApiError)) return `${what} failed unexpectedly.`;
  if (err.status === null) return "Could not reach the admin backend. Check the connection and retry.";
  if (err.status === 401 || err.status === 403) return "The backend did not accept an owner session. Sign in again as the owner (with MFA) and retry.";
  if (err.status === 503 && err.code === null) return "Owner authorization is temporarily unavailable on the backend. Retry shortly.";
  if (err.status === 404 && err.code === null) return "This backend does not serve the owner playtests yet. Deploy the current League_Combat_Simulator master, then retry.";
  if (err.code === "session_expired") return "This playtest session expired (the backend restarted or it sat idle). Start a new session.";
  return err.message;
}
