/**
 * GM1-R2 — `?q=reconstruct&recon=bot`: the REAL Reconstruct bot-lock lifecycle
 * in a real browser, for the continuity measurements.
 *
 * Replays the bodies the real backend served for segment 2 of one admin
 * `admin.reconstruct` bot match (`reconstructServerCapture.json`, written by
 * `test_reconstruct_wire_contract.py` with `RC_WIRE_CAPTURE_PATH`), in
 * production request order: the pre-lock polls (segment 2 open, the bot
 * already locked); the lock POST, which settles the segment and carries the
 * viewer's reveal inline; then a public snapshot that is already round 3 (the
 * next Reconstruct segment, opening ~5.4 s after the lock), the resolved round
 * and the private projection.
 *
 * Only one thing is changed, and it is presentation-neutral: every timestamp
 * is shifted onto the browser clock (the pre-lock bodies from the first read,
 * the post-lock bodies from the lock), so the deadlines and round 3's start
 * keep their captured distances. Art paths are left as served
 * (`assets/items_wiki/<id>.png`): run the dev server with VITE_COMBAT_API_URL
 * pointing at a static server over the backend checkout and the board shows
 * the real wiki art.
 *
 * The lock's reveal is the server's reveal for the build it was captured
 * with: place `CAPTURED_PLACEMENT` (tap p1, p3, p2) to see it as served.
 * `&lat=<ms>` adds a per-request latency (default 120ms).
 */
import capture from "@/lib/ranked-public/__fixtures__/reconstructServerCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;

export const RECON_BOT_MATCH_ID: string = C.public_before_bot_lock.match_id;
export const RECON_BOT_VIEWER: string = C.meta.viewer_user_id;
/** The build the captured lock carried (its reveal is that build's). */
export const CAPTURED_PLACEMENT: string[] = C.meta.submitted_placement_segment_2;

export function isReconstructBotReplay(): boolean {
  const q = new URLSearchParams(window.location.search);
  return q.get("q") === "reconstruct" && q.get("recon") === "bot";
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/;

function shift(body: unknown, deltaMs: number): any {
  const walk = (v: any): any => {
    if (typeof v === "string") return ISO.test(v) ? new Date(Date.parse(v) + deltaMs).toISOString() : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, any> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(body);
}

let preDelta: number | null = null;
let postDelta: number | null = null;
const at = (s: string) => Date.parse(s);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" } });

/** Answers one ranked API path, or null when the replay does not own it. */
export async function reconstructBotReplay(path: string, init?: RequestInit): Promise<Response | null> {
  const lat = Number(new URLSearchParams(window.location.search).get("lat") ?? "120");
  if (lat > 0) await new Promise((r) => setTimeout(r, lat));
  const method = init?.method ?? "GET";
  if (preDelta === null) preDelta = Date.now() - at(C.public_before_bot_lock.server_time);
  const locked = postDelta !== null;
  const now = () => new Date().toISOString();
  const pre = (b: any) => ({ ...shift(b, preDelta!), server_time: now() });
  const post = (b: any) => ({ ...shift(b, postDelta!), server_time: now() });

  if (path.endsWith("/resume")) {
    return json({
      schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: RECON_BOT_MATCH_ID,
      round_number: 2, server_time: now(),
      payload: { match_status: "active", match_over: false,
        public: locked ? post(C.public_after_bot_lock) : pre(C.public_before_bot_lock),
        private: locked ? post(C.private_after_bot_settled) : pre(C.private_before_bot_lock),
        latest_resolved_round: null, result: null },
    });
  }
  if (/\/segments\/2\/challenges\/0$/.test(path) && method === "POST") {
    // The captured lock happened at the post-lock snapshot's server time.
    postDelta = Date.now() - at(C.public_after_bot_lock.server_time);
    return json(shift(C.submit_accepted_bot_settled, postDelta));
  }
  if (/\/rounds\/2\/resolved$/.test(path)) return locked ? json(post(C.resolved_correct)) : json({}, 404);
  if (/\/rounds\/1\/resolved$/.test(path)) return json(pre(C.resolved_incorrect));
  if (path.endsWith("/private")) {
    return json(locked ? post(C.private_after_bot_settled) : pre(C.private_before_bot_lock));
  }
  if (path.includes("/presence")) return json({ status: "active", match_id: RECON_BOT_MATCH_ID, active: true });
  if (path.endsWith(`/matches/${RECON_BOT_MATCH_ID}`) && method === "GET") {
    return json(locked ? post(C.public_after_bot_lock) : pre(C.public_before_bot_lock));
  }
  return json({});
}
