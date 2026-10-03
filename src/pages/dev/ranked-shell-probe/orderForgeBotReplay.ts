/**
 * OF4-CONTINUITY — `?q=orderforge&forge=bot`: the REAL bot-lock lifecycle in a
 * real browser.
 *
 * Replays the bodies the real backend served for a wrong Order Forge lock
 * against the inline bot (`orderForgeBotLockCapture.json`, the OF4-FIX2
 * fixture), in production request order: the pre-lock polls; the lock POST,
 * which settles the segment and carries the reveal inline; then a public
 * snapshot that is already round 2 (another Order Forge segment, opening
 * ~2.7s after the lock), the resolved round and the private projection.
 *
 * Only two things are changed, both presentation-neutral:
 *   * every timestamp is shifted onto the browser clock (the pre-lock bodies
 *     from the first read, the post-lock bodies from the lock), so the round
 *     deadlines and round 2's start keep their captured distances;
 *   * card art points at bundled same-origin images (the capture's synthetic
 *     champions do not exist on the asset host), and round 1's labels are
 *     real champion names of realistic length, so wrapping is exercised.
 * `&lat=<ms>` adds a per-request latency (default 120ms).
 *
 * `?forge=live` (OF4) stays the cheap local reveal; this is the lifecycle.
 */
import capture from "@/lib/ranked-public/__fixtures__/orderForgeBotLockCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;

export const FORGE_BOT_MATCH_ID: string = C.public_before_lock.match_id;
export const FORGE_BOT_VIEWER: string = C.public_before_lock.payload.players[0].player_id;

export function isForgeBotReplay(): boolean {
  const q = new URLSearchParams(window.location.search);
  return q.get("q") === "orderforge" && q.get("forge") === "bot";
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/;
const LONG_LABELS: Record<string, string> = {
  e0: "Nunu & Willump", e1: "Aurelion Sol", e2: "Tahm Kench", e3: "Kog'Maw", e4: "Jarvan IV",
};
const ART = [
  "/images/library/champion-ahri.png", "/images/library/item-infinity-edge.png",
  "/images/library/rune-electrocute.png", "/assets/ranked/elder-dragon.webp",
  "/assets/ranked/caster-minion.webp",
];

function rewrite(body: unknown, deltaMs: number, roundOne: boolean): any {
  const walk = (v: any): any => {
    if (typeof v === "string") return ISO.test(v) ? new Date(Date.parse(v) + deltaMs).toISOString() : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, any> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      if (typeof out.entry_id === "string" && out.media && typeof out.media.src === "string") {
        const i = Number(out.entry_id.replace(/\D/g, "")) % ART.length;
        out.media = { ...out.media, src: `${window.location.origin}${ART[i]}` };
        if (roundOne && LONG_LABELS[out.entry_id]) out.label = LONG_LABELS[out.entry_id];
      }
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
export async function forgeBotReplay(path: string, init?: RequestInit): Promise<Response | null> {
  const lat = Number(new URLSearchParams(window.location.search).get("lat") ?? "120");
  if (lat > 0) await new Promise((r) => setTimeout(r, lat));
  const method = init?.method ?? "GET";
  if (preDelta === null) preDelta = Date.now() - at(C.public_before_lock.server_time);
  const locked = postDelta !== null;
  const now = () => new Date().toISOString();
  const pre = (b: any) => ({ ...rewrite(b, preDelta!, true), server_time: now() });
  const post = (b: any, roundOne: boolean) => ({ ...rewrite(b, postDelta!, roundOne), server_time: now() });

  if (path.endsWith("/resume")) {
    return json({
      schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: FORGE_BOT_MATCH_ID,
      round_number: 1, server_time: now(),
      payload: { match_status: "active", match_over: false, public: pre(C.public_before_lock),
        private: pre(C.private_before), latest_resolved_round: null, result: null },
    });
  }
  if (/\/segments\/1\/challenges\/0$/.test(path) && method === "POST") {
    // The lock: the captured lock happened just before the post-lock poll.
    postDelta = Date.now() - at(C.public_after_lock.server_time);
    return json(rewrite(C.submit, postDelta, true));
  }
  if (/\/rounds\/1\/resolved$/.test(path)) return locked ? json(post(C.resolved, true)) : json({}, 404);
  if (path.endsWith("/private")) return json(locked ? post(C.private_after, false) : pre(C.private_before));
  if (path.includes("/presence")) return json({ status: "active", match_id: FORGE_BOT_MATCH_ID, active: true });
  if (path.endsWith(`/matches/${FORGE_BOT_MATCH_ID}`) && method === "GET") {
    return json(locked ? post(C.public_after_lock, false) : pre(C.public_before_lock));
  }
  return json({});
}
