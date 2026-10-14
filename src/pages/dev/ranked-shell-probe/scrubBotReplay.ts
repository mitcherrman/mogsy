/**
 * SCRUB-S2 — `?q=scrub`: the REAL Chronoscope bot-lock lifecycle, segment 1
 * through segment 3 opening, in a real browser, for the continuity
 * measurements and the owner's screenshots.
 *
 * Replays the bodies the real backend served for one admin `admin.scrub` bot
 * match (`scrubServerCapture.json`, written by `test_scrub_wire_contract.py`
 * with `SCRUB_WIRE_CAPTURE_PATH`), in production request order:
 *
 *   A  segment 1 open (the bot already locked)            pre-lock bodies
 *   B  lock POST → settled inline; round 2 in its lead-in  post-lock bodies
 *   C  segment 2 open (the bot already locked)             pre-lock bodies
 *   D  lock POST → settled inline; round 3 in its lead-in  post-lock bodies
 *
 * Segment 1's captured lock was EXACT (the confirmation reveal); segment 2's
 * was WRONG at the checkpoint farthest from the first one (the longest
 * traverse). Lock those checkpoints (`SCRUB_CAPTURED`) to see the server's
 * reveals as served — the replay answers any lock with the captured ack.
 *
 * Only one thing is changed, and it is presentation-neutral: every timestamp
 * is shifted onto the browser clock — one delta from the first read (A, and C,
 * which shares the capture's timeline with B) and one from each lock (B, D) —
 * so deadlines and next-round starts keep their captured distances.
 * `&lat=<ms>` adds a per-request latency (default 120ms).
 */
import capture from "@/lib/ranked-public/__fixtures__/scrubServerCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;

export const SCRUB_BOT_MATCH_ID: string = C.meta.match_id;
export const SCRUB_BOT_VIEWER: string = C.meta.viewer_user_id;
/** The checkpoints the captured locks carried: segment 1 exact, segment 2 wrong. */
export const SCRUB_CAPTURED: { 1: string; 2: string } = {
  1: C.meta.submitted["1"], 2: C.meta.submitted["2"],
};

export function isScrubBotReplay(): boolean {
  return new URLSearchParams(window.location.search).get("q") === "scrub";
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

const at = (s: string) => Date.parse(s);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" } });

/** Replay state, module-scoped (one probe mount per page load). */
const replay = {
  deltaA: null as number | null,
  deltaB: null as number | null,
  deltaD: null as number | null,
};

/** Where in the lifecycle the browser clock now is. */
function phase(): "A" | "B" | "C" | "D" {
  if (replay.deltaD !== null) return "D";
  if (replay.deltaB === null) return "A";
  // Segment 2 opens at its own captured start, on the B timeline.
  const seg2Start = C.private_after_bot_settled_correct.payload.segment_state?.challenge_started_at
    ?? C.private_before_bot_lock_wrong.payload.segment_state.challenge_started_at;
  return Date.now() >= at(seg2Start) + replay.deltaB ? "C" : "B";
}

function bodies(p: "A" | "B" | "C" | "D") {
  switch (p) {
    case "A": return { pub: C.public_before_bot_lock_correct, priv: C.private_before_bot_lock_correct,
      delta: replay.deltaA!, round: 1 };
    case "B": return { pub: C.public_after_bot_lock_correct, priv: C.private_after_bot_settled_correct,
      delta: replay.deltaB!, round: 2 };
    case "C": return { pub: C.public_before_bot_lock_wrong, priv: C.private_before_bot_lock_wrong,
      delta: replay.deltaB!, round: 2 };
    default: return { pub: C.public_after_bot_lock_wrong, priv: C.private_after_bot_settled_wrong,
      delta: replay.deltaD!, round: 3 };
  }
}

/** Answers one ranked API path, or null when the replay does not own it. */
export async function scrubBotReplay(path: string, init?: RequestInit): Promise<Response | null> {
  const lat = Number(new URLSearchParams(window.location.search).get("lat") ?? "120");
  if (lat > 0) await new Promise((r) => setTimeout(r, lat));
  const method = init?.method ?? "GET";
  if (replay.deltaA === null) replay.deltaA = Date.now() - at(C.public_before_bot_lock_correct.server_time);
  const now = () => new Date().toISOString();
  const p = phase();
  const b = bodies(p);
  const served = (body: any) => ({ ...shift(body, b.delta), server_time: now() });

  if (path.endsWith("/resume")) {
    return json({
      schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: SCRUB_BOT_MATCH_ID,
      round_number: b.round, server_time: now(),
      payload: { match_status: "active", match_over: false, public: served(b.pub), private: served(b.priv),
        latest_resolved_round: null, result: null },
    });
  }
  if (/\/segments\/1\/challenges\/0$/.test(path) && method === "POST") {
    replay.deltaB = Date.now() - at(C.public_after_bot_lock_correct.server_time);
    return json(shift(C.submit_accepted_bot_settled_correct, replay.deltaB));
  }
  if (/\/segments\/2\/challenges\/0$/.test(path) && method === "POST") {
    replay.deltaD = Date.now() - at(C.public_after_bot_lock_wrong.server_time);
    return json(shift(C.submit_accepted_bot_settled_wrong, replay.deltaD));
  }
  if (/\/rounds\/1\/resolved$/.test(path)) {
    return replay.deltaB === null ? json({}, 404) : json(shift(C.resolved_correct, replay.deltaB));
  }
  if (/\/rounds\/2\/resolved$/.test(path)) {
    return replay.deltaD === null ? json({}, 404) : json(shift(C.resolved_wrong, replay.deltaD));
  }
  if (path.endsWith("/private")) return json(served(b.priv));
  if (path.includes("/presence")) return json({ status: "active", match_id: SCRUB_BOT_MATCH_ID, active: true });
  if (path.endsWith(`/matches/${SCRUB_BOT_MATCH_ID}`) && method === "GET") return json(served(b.pub));
  return json({});
}
