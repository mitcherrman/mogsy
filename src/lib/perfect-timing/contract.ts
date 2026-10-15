/**
 * PT4 — strict readers for the Perfect Timing lab's two wire contracts
 * (`docs/perfect-timing/PERFECT_TIMING_HANDOFF.md` §2, implemented by backend
 * PT3 `routes/admin_perfect_timing.py` + `perfect_timing/service.py`).
 *
 *   POST /api/admin/perfect-timing/deal                    → perfect_timing.deal.v1
 *   POST /api/admin/perfect-timing/rounds/{round_id}/lock  → perfect_timing.release.v1
 *
 * Both readers are allow-lists: an unknown contract string, an unknown or
 * missing key, a wrong type or an out-of-enum value is refused, never coerced.
 * The deal reader is also the client's answer-isolation guard: a deal that
 * carries a target, any `cooldown*` key or `by_rank` ANYWHERE is refused, so a
 * backend regression cannot put the answer on screen before the lock.
 *
 * Nothing here grades. Every number in a release is the server's; the reader
 * only checks that the server's own arithmetic is self-consistent.
 */
import type { PtRevealView, PtSlot, PtTier } from "./viewModel";

export const DEAL_CONTRACT = "perfect_timing.deal.v1";
export const RELEASE_CONTRACT = "perfect_timing.release.v1";

export const PATCH_SOURCES = ["patch_operations", "patch_notes_ingestion_fallback", "unknown"] as const;
export type PtPatchSource = (typeof PATCH_SOURCES)[number];

const SLOTS: readonly PtSlot[] = ["Q", "W", "E", "R"];
const TIERS: readonly PtTier[] = ["perfect", "great", "good", "miss"];
const VERDICTS = ["ok", "exceeds_server_window"] as const;

/** Mirrors the backend's `LockIn.elapsed_ms` bounds (StrictInt 0..600000). */
export const MAX_ELAPSED_MS = 600_000;

/** `pt_` + `secrets.token_hex(16)`. */
const ROUND_ID = /^pt_[0-9a-f]{32}$/;

export interface PtDealRound {
  round_id: string;
  champion: string;
  slot: PtSlot;
  ability_name: string;
  /** Null when the ability is rank-invariant. */
  rank: number | null;
  rank_count: number;
  expires_at: string;
}

export interface PtDeal {
  contract: typeof DEAL_CONTRACT;
  data_label: { patch_label: string | null; patch_source: PtPatchSource; ability_haste: 0 };
  rounds: PtDealRound[];
}

export interface PtRelease {
  contract: typeof RELEASE_CONTRACT;
  round_id: string;
  elapsed_ms: number;
  target_ms: number;
  error_ms: number;
  abs_error_ms: number;
  relative_error: number;
  tier: PtTier;
  points: number;
  plausibility: { server_window_ms: number; verdict: (typeof VERDICTS)[number] };
  authority: { cooldown_raw: string; rank: number | null; revision_id: string; verified_at: string };
}

export class PtContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PtContractError";
  }
}

type Rec = Record<string, unknown>;

function fail(path: string, why: string): never {
  throw new PtContractError(`${path}: ${why}`);
}

function record(v: unknown, path: string, keys: readonly string[]): Rec {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail(path, "expected an object");
  const rec = v as Rec;
  for (const k of Object.keys(rec)) if (!keys.includes(k)) fail(`${path}.${k}`, "unexpected key");
  for (const k of keys) if (!(k in rec)) fail(`${path}.${k}`, "missing");
  return rec;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) fail(path, "expected a non-empty string");
  return v;
}

function int(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== "number" || !Number.isInteger(v)) fail(path, "expected an integer");
  if (v < min || v > max) fail(path, `out of range ${min}..${max}`);
  return v;
}

function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) fail(path, `expected one of ${allowed.join(", ")}`);
  return v as T;
}

function timestamp(v: unknown, path: string): string {
  const s = str(v, path);
  if (Number.isNaN(Date.parse(s))) fail(path, "expected an ISO timestamp");
  return s;
}

/** True for every key that would put the answer on screen before the lock. */
export function isAnswerKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "target_ms" || k === "by_rank" || k.startsWith("cooldown");
}

/** Throws on any answer key at any depth. Runs before the allow-list so a leak is named as one. */
export function assertNoAnswerKeys(v: unknown, path = "deal"): void {
  if (Array.isArray(v)) { v.forEach((x, i) => assertNoAnswerKeys(x, `${path}[${i}]`)); return; }
  if (v === null || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v as Rec)) {
    if (isAnswerKey(k)) fail(`${path}.${k}`, "answer key in a pre-reveal payload");
    assertNoAnswerKeys(x, `${path}.${k}`);
  }
}

export function parseDeal(raw: unknown): PtDeal {
  assertNoAnswerKeys(raw);
  const top = record(raw, "deal", ["contract", "data_label", "rounds"]);
  if (top.contract !== DEAL_CONTRACT) fail("deal.contract", `expected ${DEAL_CONTRACT}`);
  const dl = record(top.data_label, "deal.data_label", ["patch_label", "patch_source", "ability_haste"]);
  const patch_label = dl.patch_label === null ? null : str(dl.patch_label, "deal.data_label.patch_label");
  const patch_source = oneOf(dl.patch_source, "deal.data_label.patch_source", PATCH_SOURCES);
  // v1 deals base cooldowns only, and the lab's copy says "0 ability haste".
  if (dl.ability_haste !== 0) fail("deal.data_label.ability_haste", "expected 0 (v1 deals base cooldowns)");
  if (!Array.isArray(top.rounds) || top.rounds.length === 0) fail("deal.rounds", "expected a non-empty array");
  const seen = new Set<string>();
  const rounds = top.rounds.map((r, i): PtDealRound => {
    const p = `deal.rounds[${i}]`;
    const o = record(r, p, ["round_id", "champion", "slot", "ability_name", "rank", "rank_count", "expires_at"]);
    const round_id = str(o.round_id, `${p}.round_id`);
    if (!ROUND_ID.test(round_id)) fail(`${p}.round_id`, "expected pt_<32 hex>");
    if (seen.has(round_id)) fail(`${p}.round_id`, "duplicate round id");
    seen.add(round_id);
    const rank_count = int(o.rank_count, `${p}.rank_count`, 1, 10);
    return {
      round_id,
      champion: str(o.champion, `${p}.champion`),
      slot: oneOf(o.slot, `${p}.slot`, SLOTS),
      ability_name: str(o.ability_name, `${p}.ability_name`),
      rank: o.rank === null ? null : int(o.rank, `${p}.rank`, 1, rank_count),
      rank_count,
      expires_at: timestamp(o.expires_at, `${p}.expires_at`),
    };
  });
  return { contract: DEAL_CONTRACT, data_label: { patch_label, patch_source, ability_haste: 0 }, rounds };
}

export function parseRelease(raw: unknown): PtRelease {
  const o = record(raw, "release", [
    "contract", "round_id", "elapsed_ms", "target_ms", "error_ms", "abs_error_ms",
    "relative_error", "tier", "points", "plausibility", "authority",
  ]);
  if (o.contract !== RELEASE_CONTRACT) fail("release.contract", `expected ${RELEASE_CONTRACT}`);
  const round_id = str(o.round_id, "release.round_id");
  if (!ROUND_ID.test(round_id)) fail("release.round_id", "expected pt_<32 hex>");
  const elapsed_ms = int(o.elapsed_ms, "release.elapsed_ms", 0, MAX_ELAPSED_MS);
  const target_ms = int(o.target_ms, "release.target_ms", 1);
  const error_ms = int(o.error_ms, "release.error_ms");
  const abs_error_ms = int(o.abs_error_ms, "release.abs_error_ms", 0);
  if (error_ms !== elapsed_ms - target_ms) fail("release.error_ms", "is not elapsed_ms - target_ms");
  if (abs_error_ms !== Math.abs(error_ms)) fail("release.abs_error_ms", "is not |error_ms|");
  const relative_error = o.relative_error;
  if (typeof relative_error !== "number" || !Number.isFinite(relative_error) || relative_error < 0) {
    fail("release.relative_error", "expected a finite non-negative number");
  }
  const pl = record(o.plausibility, "release.plausibility", ["server_window_ms", "verdict"]);
  const au = record(o.authority, "release.authority", ["cooldown_raw", "rank", "revision_id", "verified_at"]);
  return {
    contract: RELEASE_CONTRACT,
    round_id,
    elapsed_ms,
    target_ms,
    error_ms,
    abs_error_ms,
    relative_error,
    tier: oneOf(o.tier, "release.tier", TIERS),
    points: int(o.points, "release.points", 0, 100),
    plausibility: {
      server_window_ms: int(pl.server_window_ms, "release.plausibility.server_window_ms", 0),
      verdict: oneOf(pl.verdict, "release.plausibility.verdict", VERDICTS),
    },
    authority: {
      cooldown_raw: str(au.cooldown_raw, "release.authority.cooldown_raw"),
      rank: au.rank === null ? null : int(au.rank, "release.authority.rank", 1),
      revision_id: str(au.revision_id, "release.authority.revision_id"),
      verified_at: timestamp(au.verified_at, "release.authority.verified_at"),
    },
  };
}

/** The PT1 reveal view of a server release. Every number is copied, none computed. */
export function toRevealView(r: PtRelease): PtRevealView {
  return {
    elapsedMs: r.elapsed_ms,
    targetMs: r.target_ms,
    errorMs: r.error_ms,
    absErrorMs: r.abs_error_ms,
    relativeError: r.relative_error,
    tier: r.tier,
    points: r.points,
    plausible: r.plausibility.verdict === "ok",
    cooldownRaw: r.authority.cooldown_raw,
    rank: r.authority.rank,
  };
}
