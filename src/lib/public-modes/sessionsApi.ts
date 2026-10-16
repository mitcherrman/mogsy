/**
 * PGM2 — the public, player-scoped session API for the five specialized
 * bonus games (`/api/game-modes/{mode}/sessions...`).
 *
 * The response CONTRACTS are the owner labs' own (Rangefinder, Glyph Press,
 * Perfect Timing) or a thin bonus-session wrapper around them (Stat Drop,
 * Combat Estimate), so the same readers and primitives draw them. What
 * differs is who may call: any verified player. A POST mints a guest identity
 * when there is none (the Ranked write boundary); a GET only uses an existing
 * session. No admin header is ever sent from here.
 */
import { getBackendAuthHeaders } from "@/lib/backend-auth";
import { RANKED_API_BASE } from "@/lib/ranked-public/client";
import type {
  GlyphPressLockResult, GlyphPressSession, GlyphPressSoundResult, RangefinderLockResult, RangefinderSession,
} from "@/lib/playtests/api";
import { MAX_ELAPSED_MS, PtContractError, parseDeal, parseRelease, type PtDeal, type PtRelease } from "@/lib/perfect-timing/contract";
import { PerfectTimingApiError } from "@/lib/perfect-timing/api";
import type { StatDropPublicRound } from "@/lib/numeric-lab/api";
import type { PublicCapturedScenario } from "@/lib/combat-estimate/contract";

export const BONUS_SESSIONS_API = "/api/game-modes";

export class BonusSessionError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string | null) {
    super(message);
    this.name = "BonusSessionError";
  }
  get transient(): boolean {
    return this.status === null || this.status >= 500;
  }
  get expired(): boolean {
    return this.code === "SESSION_EXPIRED" || this.code === "ROUND_EXPIRED";
  }
}

/** One sentence a player can act on. Never names a flag, an owner or a deploy. */
export function describeBonusError(err: unknown): string {
  if (!(err instanceof BonusSessionError)) return "Something went wrong. Please try again.";
  if (err.status === null) return "Could not reach Mogzy. Check your connection and try again.";
  if (err.code === "BONUS_GAMES_PAUSED") return "New bonus games are paused for now. Please check back soon.";
  if (err.expired) return "This game expired. Start a new one.";
  if (err.code === "RANKED_RATE_LIMITED" || err.status === 429) return "Too many requests in a row. Wait a moment and try again.";
  if (err.status === 401 || err.status === 403) return "Your session ended. Reload the page to keep playing.";
  if (err.status >= 500) return "This game can't be played right now. Please try again later.";
  return err.message || "That didn't work. Please try again.";
}

type Fetch = typeof fetch;

async function send(path: string, init: RequestInit | undefined, fetchImpl: Fetch): Promise<Response> {
  const write = (init?.method ?? "GET") !== "GET";
  try {
    return await fetchImpl(`${RANKED_API_BASE}${path}`, {
      ...init,
      headers: {
        ...(await getBackendAuthHeaders(write ? { mint: "ranked_write" } : undefined)),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new BonusSessionError("Could not reach Mogzy.", null, null);
  }
}

async function errorFrom(res: Response): Promise<BonusSessionError> {
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  const detail = (body as { detail?: { code?: unknown; message?: unknown } } | null)?.detail;
  const code = typeof detail?.code === "string" ? detail.code : null;
  const message = typeof detail?.message === "string" ? detail.message : `Request failed (${res.status}).`;
  return new BonusSessionError(message, res.status, code);
}

async function json(path: string, init: RequestInit | undefined, fetchImpl: Fetch): Promise<unknown> {
  const res = await send(path, init, fetchImpl);
  if (!res.ok) throw await errorFrom(res);
  try { return await res.json(); } catch {
    throw new BonusSessionError("Mogzy sent a response this page could not read.", res.status, "CONTRACT");
  }
}

async function request<T>(path: string, contract: string, init: RequestInit | undefined, fetchImpl: Fetch): Promise<T> {
  const body = await json(path, init, fetchImpl);
  if ((body as { contract?: unknown } | null)?.contract !== contract) {
    throw new BonusSessionError("Mogzy sent a response this page could not read.", 200, "CONTRACT");
  }
  return body as T;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const enc = encodeURIComponent;
const sessions = (mode: string) => `${BONUS_SESSIONS_API}/${mode}/sessions`;
const roundPath = (mode: string, sid: string, index: number, action: string) =>
  `${sessions(mode)}/${enc(sid)}/rounds/${index}/${action}`;

// ── Stat Drop / Combat Estimate (bonus-session wrapper) ─────────────────────

export interface NumericSession<R> {
  contract: string;
  session_id: string;
  public: { contract: string; authority_label: string; rounds: R[] };
}

export interface NumericFeedback {
  guess: number;
  canonical: number;
  error: number;
  abs_error: number;
  relative_error: number | null;
  graded: false;
}

export interface NumericRelease {
  contract: string;
  index: number;
  release: { round_id: string; authority_label: string; released: Record<string, unknown> };
  feedback: NumericFeedback;
}

// ── the API ─────────────────────────────────────────────────────────────────

export function bonusSessionsApi(fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  return {
    status: async () => { throw new BonusSessionError("not available publicly", 404, null); },

    startRangefinder: () =>
      request<RangefinderSession>(sessions("rangefinder"), "interaction_lab.rangefinder.session.v1", post(), fetchImpl),
    lockRangefinder: (sid: string, index: number, stop: string) =>
      request<RangefinderLockResult>(roundPath("rangefinder", sid, index, "lock"),
        "interaction_lab.rangefinder.reveal.v1", post({ stop }), fetchImpl),

    startGlyphPress: () =>
      request<GlyphPressSession>(sessions("glyph_press"), "interaction_lab.glyph_press.session.v1", post(), fetchImpl),
    soundGlyphPress: (sid: string, index: number, glyph: string) =>
      request<GlyphPressSoundResult>(roundPath("glyph_press", sid, index, "sound"),
        "interaction_lab.glyph_press.ledger.v1", post({ glyph }), fetchImpl),
    lockGlyphPress: (sid: string, index: number, glyphs: readonly (string | null)[]) =>
      request<GlyphPressLockResult>(roundPath("glyph_press", sid, index, "lock"),
        "interaction_lab.glyph_press.reveal.v1", post({ glyphs }), fetchImpl),
    /** The clue is player-authenticated (an `<img>` cannot carry the bearer):
     *  fetched with the player's session and shown from a blob URL the caller
     *  revokes. `mediaPath` is the public route the session named. */
    clueImage: async (mediaPath: string): Promise<string> => {
      if (!mediaPath.startsWith(`${BONUS_SESSIONS_API}/glyph_press/`)) {
        throw new BonusSessionError("Unexpected clue path.", null, "CONTRACT");
      }
      const res = await send(mediaPath, undefined, fetchImpl);
      if (!res.ok) throw await errorFrom(res);
      return URL.createObjectURL(await res.blob());
    },

    startStatDrop: () =>
      request<NumericSession<StatDropPublicRound>>(sessions("stat_drop"), "bonus_session.stat_drop.v1", post(), fetchImpl),
    lockStatDrop: (sid: string, index: number, value: number) =>
      request<NumericRelease>(roundPath("stat_drop", sid, index, "lock"),
        "bonus_session.stat_drop.release.v1", post({ value }), fetchImpl),

    startCombatEstimate: () =>
      request<NumericSession<PublicCapturedScenario>>(sessions("combat_estimate"),
        "bonus_session.combat_estimate.v1", post(), fetchImpl),
    lockCombatEstimate: (sid: string, index: number, estimate: number) =>
      request<NumericRelease>(roundPath("combat_estimate", sid, index, "lock"),
        "bonus_session.combat_estimate.release.v1", post({ estimate }), fetchImpl),
  };
}
export type BonusSessionsApi = ReturnType<typeof bonusSessionsApi>;

// ── Perfect Timing: the owner page's `PerfectTimingApi` shape, over a run ───

const PT_RUN_ROUNDS = 5;
const LOCK_RETRY_DELAYS_MS: readonly number[] = [300, 800, 1600];

function readPt<T>(parse: (raw: unknown) => T, raw: unknown): T {
  try {
    return parse(raw);
  } catch (err) {
    const why = err instanceof PtContractError ? ` (${err.message})` : "";
    throw new PerfectTimingApiError(`Mogzy sent a response this page could not read${why}.`, 200, "PT_CONTRACT");
  }
}

/** The page reads `PerfectTimingApiError` (404 → the round expired, re-deal). */
async function ptJson(path: string, init: RequestInit, fetchImpl: Fetch): Promise<unknown> {
  try {
    return await json(path, init, fetchImpl);
  } catch (err) {
    if (err instanceof BonusSessionError) throw new PerfectTimingApiError(err.message, err.status, err.code);
    throw err;
  }
}

/**
 * The same `{deal, lock}` the Perfect Timing page drives, bound to ONE public
 * run at a time. A deal of a full run's worth (5) starts a new run; a smaller
 * deal replaces expired rounds inside the current run (the server bounds it).
 * Errors carry `status`/`code` like the owner client, so the page's existing
 * expiry handling (404 → re-deal) works unchanged.
 */
export function bonusTimingApi(options: { fetchImpl?: Fetch; sleep?: (ms: number) => Promise<void> } = {}) {
  const fetchImpl: Fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let sessionId: string | null = null;

  return {
    deal: async (count: number): Promise<PtDeal> => {
      const fresh = sessionId === null || count >= PT_RUN_ROUNDS;
      const raw = fresh
        ? await ptJson(sessions("perfect_timing"), post(), fetchImpl)
        : await ptJson(`${sessions("perfect_timing")}/${enc(sessionId!)}/deal`, post({ count }), fetchImpl);
      const { session_id: sid, ...deal } = raw as { session_id?: unknown };
      if (typeof sid !== "string" || !sid) {
        throw new PerfectTimingApiError("Mogzy sent a response this page could not read.", 200, "PT_CONTRACT");
      }
      sessionId = sid;
      return readPt(parseDeal, deal);
    },

    lock: async (roundId: string, elapsedMs: number): Promise<PtRelease> => {
      if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) {
        throw new PerfectTimingApiError("That time cannot be submitted.", null, "PT_CLIENT_RANGE");
      }
      if (!sessionId) throw new PerfectTimingApiError("This game expired. Start a new one.", 404, "SESSION_EXPIRED");
      const path = `${sessions("perfect_timing")}/${enc(sessionId)}/rounds/${enc(roundId)}/lock`;
      for (let attempt = 0; ; attempt++) {
        try {
          const release = readPt(parseRelease, await ptJson(path, post({ elapsed_ms: elapsedMs }), fetchImpl));
          if (release.round_id !== roundId || release.elapsed_ms !== elapsedMs) {
            throw new PerfectTimingApiError("Mogzy released a different round or time.", 200, "PT_CONTRACT");
          }
          return release;
        } catch (err) {
          const transient = err instanceof PerfectTimingApiError && err.transient;
          if (!transient || attempt >= LOCK_RETRY_DELAYS_MS.length) throw err;
          await sleep(LOCK_RETRY_DELAYS_MS[attempt]);
        }
      }
    },
  };
}
