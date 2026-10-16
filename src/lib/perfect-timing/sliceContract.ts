/**
 * PT5 — strict readers for the Mastery Slice contracts
 * (`docs/perfect-timing/PT5_HANDOFF.md` §3, implemented by backend PT5
 * `perfect_timing/slices.py` + `routes/admin_perfect_timing.py`).
 *
 *   POST /api/admin/perfect-timing/slices/deal                               → perfect_timing.slice_deal.v1
 *   POST /api/admin/perfect-timing/slices/{slice_id}/rounds/{round_id}/lock  → perfect_timing.slice_release.v1
 *
 * A slice is ONE champion ability dealt three times — foundation (rank 1),
 * rank up (rank 3), equipped (rank 3 + Sheen's canonical ability haste). The
 * v1 readers in `contract.ts` are untouched: a v1 deal still means "0 ability
 * haste, five distinct abilities".
 *
 * Like v1, both readers are allow-lists, and the deal reader is the answer-
 * isolation guard: a slice deal carrying a target, any `cooldown*` key,
 * `by_rank`, or the slice release's own calculation vocabulary ANYWHERE is
 * refused before anything renders. The deal must also keep its promise of one
 * champion ability: stages 1..3 in order, ranks 1 → 3 → 3, the item only on
 * the last.
 *
 * Nothing here grades. Every number in a release is the server's; the reader
 * checks only that the server's arithmetic agrees with itself.
 */
import { MAX_ELAPSED_MS, PATCH_SOURCES, PtContractError, type PtPatchSource, isAnswerKey } from "./contract";
import type { PtRevealView, PtSlot, PtTier } from "./viewModel";

export const SLICE_DEAL_CONTRACT = "perfect_timing.slice_deal.v1";
export const SLICE_RELEASE_CONTRACT = "perfect_timing.slice_release.v1";

export const SLICE_KINDS = ["foundation", "rank_up", "equipped"] as const;
export type PtSliceKind = (typeof SLICE_KINDS)[number];
export const SLICE_STAGES = 3;
export const SLICE_ASSUMPTIONS = ["no_cooldown_refunds"] as const;

const SLOTS: readonly PtSlot[] = ["Q", "W", "E", "R"];
const TIERS: readonly PtTier[] = ["perfect", "great", "good", "miss"];
const VERDICTS = ["ok", "exceeds_server_window"] as const;
const SLICE_ID = /^pts_[0-9a-f]{32}$/;
const ROUND_ID = /^pt_[0-9a-f]{32}$/;
/** What each stage IS; the deal must say exactly this. */
const STAGE_SHAPE: readonly { kind: PtSliceKind; rank: number; equipped: boolean }[] = [
  { kind: "foundation", rank: 1, equipped: false },
  { kind: "rank_up", rank: 3, equipped: false },
  { kind: "equipped", rank: 3, equipped: true },
];
/** The release's reveal-only vocabulary: never in a deal. */
const SLICE_RELEASE_ONLY_KEYS = new Set(["base_cooldown_ms", "exact_ms", "calculation", "formula", "target"]);

export interface PtSliceModifier {
  type: "item";
  item_id: number;
  name: string;
  ability_haste: number;
}

export interface PtSliceStage {
  stage: number;
  kind: PtSliceKind;
  /** Null for a stage closed by a resumed deal (already played or passed). */
  round_id: string | null;
  rank: number;
  ability_haste: number;
  modifier: PtSliceModifier | null;
}

export interface PtSliceDeal {
  contract: typeof SLICE_DEAL_CONTRACT;
  slice_id: string;
  data_label: { patch_label: string | null; patch_source: PtPatchSource };
  champion: string;
  slot: PtSlot;
  ability_name: string;
  rank_count: number;
  assumption: (typeof SLICE_ASSUMPTIONS)[number];
  authority: { ability_revision_id: string; item_source_revision: string };
  start_stage: number;
  expires_at: string;
  stages: PtSliceStage[];
}

export interface PtSliceRelease {
  contract: typeof SLICE_RELEASE_CONTRACT;
  slice_id: string;
  round_id: string;
  stage: number;
  kind: PtSliceKind;
  elapsed_ms: number;
  target_ms: number;
  error_ms: number;
  abs_error_ms: number;
  relative_error: number;
  tier: PtTier;
  points: number;
  plausibility: { server_window_ms: number; verdict: (typeof VERDICTS)[number] };
  calculation: {
    rank: number;
    base_cooldown_ms: number;
    ability_haste: number;
    formula: string;
    exact_ms: string;
    rounding: string;
  };
  authority: {
    cooldown_at_rank: string;
    /** The whole progression: only with the final stage (it would reveal a later rank). */
    cooldown_raw: string | null;
    revision_id: string;
    verified_at: string;
    item: { item_id: number; name: string; ability_haste: number; source_revision: string } | null;
  };
  slice_expires_at: string;
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

function num(v: unknown, path: string, min = 0): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min) fail(path, `expected a finite number >= ${min}`);
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

/** Throws on any v1 answer key or slice calculation key at any depth. */
export function assertNoSliceAnswerKeys(v: unknown, path = "slice_deal"): void {
  if (Array.isArray(v)) { v.forEach((x, i) => assertNoSliceAnswerKeys(x, `${path}[${i}]`)); return; }
  if (v === null || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v as Rec)) {
    if (isAnswerKey(k) || SLICE_RELEASE_ONLY_KEYS.has(k.toLowerCase())) fail(`${path}.${k}`, "answer key in a pre-reveal payload");
    assertNoSliceAnswerKeys(x, `${path}.${k}`);
  }
}

function modifier(v: unknown, path: string): PtSliceModifier {
  const m = record(v, path, ["type", "item_id", "name", "ability_haste"]);
  if (m.type !== "item") fail(`${path}.type`, "expected item");
  return {
    type: "item",
    item_id: int(m.item_id, `${path}.item_id`, 1),
    name: str(m.name, `${path}.name`),
    ability_haste: num(m.ability_haste, `${path}.ability_haste`, Number.MIN_VALUE),
  };
}

export function parseSliceDeal(raw: unknown): PtSliceDeal {
  assertNoSliceAnswerKeys(raw);
  const top = record(raw, "slice_deal", [
    "contract", "slice_id", "data_label", "champion", "slot", "ability_name", "rank_count",
    "assumption", "authority", "start_stage", "expires_at", "stages",
  ]);
  if (top.contract !== SLICE_DEAL_CONTRACT) fail("slice_deal.contract", `expected ${SLICE_DEAL_CONTRACT}`);
  const slice_id = str(top.slice_id, "slice_deal.slice_id");
  if (!SLICE_ID.test(slice_id)) fail("slice_deal.slice_id", "expected pts_<32 hex>");
  const dl = record(top.data_label, "slice_deal.data_label", ["patch_label", "patch_source"]);
  const au = record(top.authority, "slice_deal.authority", ["ability_revision_id", "item_source_revision"]);
  const rank_count = int(top.rank_count, "slice_deal.rank_count", 3, 10);
  const start_stage = int(top.start_stage, "slice_deal.start_stage", 1, SLICE_STAGES);
  if (!Array.isArray(top.stages) || top.stages.length !== SLICE_STAGES) fail("slice_deal.stages", `expected ${SLICE_STAGES} stages`);
  const seen = new Set<string>();
  let itemHaste: number | null = null;
  const stages = top.stages.map((s, i): PtSliceStage => {
    const p = `slice_deal.stages[${i}]`;
    const o = record(s, p, ["stage", "kind", "round_id", "rank", "ability_haste", "modifier"]);
    const want = STAGE_SHAPE[i];
    const stage = int(o.stage, `${p}.stage`, i + 1, i + 1);
    const kind = oneOf(o.kind, `${p}.kind`, SLICE_KINDS);
    if (kind !== want.kind) fail(`${p}.kind`, `expected ${want.kind}`);
    const rank = int(o.rank, `${p}.rank`, want.rank, want.rank);
    const ability_haste = num(o.ability_haste, `${p}.ability_haste`);
    const mod = o.modifier === null ? null : modifier(o.modifier, `${p}.modifier`);
    if (want.equipped) {
      if (!mod) fail(`${p}.modifier`, "the equipped stage names its item");
      if (ability_haste !== mod.ability_haste || ability_haste <= 0) fail(`${p}.ability_haste`, "must be the item's ability haste");
      itemHaste = ability_haste;
    } else {
      if (mod) fail(`${p}.modifier`, "only the equipped stage carries an item");
      if (ability_haste !== 0) fail(`${p}.ability_haste`, "expected 0 before the item");
    }
    let round_id: string | null = null;
    if (stage >= start_stage) {
      round_id = str(o.round_id, `${p}.round_id`);
      if (!ROUND_ID.test(round_id)) fail(`${p}.round_id`, "expected pt_<32 hex>");
      if (seen.has(round_id)) fail(`${p}.round_id`, "duplicate round id");
      seen.add(round_id);
    } else if (o.round_id !== null) {
      fail(`${p}.round_id`, "a stage before start_stage is closed (null)");
    }
    return { stage, kind, round_id, rank, ability_haste, modifier: mod };
  });
  if (itemHaste === null) fail("slice_deal.stages", "no equipped stage");
  return {
    contract: SLICE_DEAL_CONTRACT,
    slice_id,
    data_label: {
      patch_label: dl.patch_label === null ? null : str(dl.patch_label, "slice_deal.data_label.patch_label"),
      patch_source: oneOf(dl.patch_source, "slice_deal.data_label.patch_source", PATCH_SOURCES),
    },
    champion: str(top.champion, "slice_deal.champion"),
    slot: oneOf(top.slot, "slice_deal.slot", SLOTS),
    ability_name: str(top.ability_name, "slice_deal.ability_name"),
    rank_count,
    assumption: oneOf(top.assumption, "slice_deal.assumption", SLICE_ASSUMPTIONS),
    authority: {
      ability_revision_id: str(au.ability_revision_id, "slice_deal.authority.ability_revision_id"),
      item_source_revision: str(au.item_source_revision, "slice_deal.authority.item_source_revision"),
    },
    start_stage,
    expires_at: timestamp(top.expires_at, "slice_deal.expires_at"),
    stages,
  };
}

export function parseSliceRelease(raw: unknown): PtSliceRelease {
  const o = record(raw, "slice_release", [
    "contract", "slice_id", "round_id", "stage", "kind", "elapsed_ms", "target_ms", "error_ms",
    "abs_error_ms", "relative_error", "tier", "points", "plausibility", "calculation", "authority",
    "slice_expires_at",
  ]);
  if (o.contract !== SLICE_RELEASE_CONTRACT) fail("slice_release.contract", `expected ${SLICE_RELEASE_CONTRACT}`);
  const slice_id = str(o.slice_id, "slice_release.slice_id");
  if (!SLICE_ID.test(slice_id)) fail("slice_release.slice_id", "expected pts_<32 hex>");
  const round_id = str(o.round_id, "slice_release.round_id");
  if (!ROUND_ID.test(round_id)) fail("slice_release.round_id", "expected pt_<32 hex>");
  const stage = int(o.stage, "slice_release.stage", 1, SLICE_STAGES);
  const kind = oneOf(o.kind, "slice_release.kind", SLICE_KINDS);
  if (kind !== STAGE_SHAPE[stage - 1].kind) fail("slice_release.kind", "does not match its stage");
  const elapsed_ms = int(o.elapsed_ms, "slice_release.elapsed_ms", 0, MAX_ELAPSED_MS);
  const target_ms = int(o.target_ms, "slice_release.target_ms", 1);
  const error_ms = int(o.error_ms, "slice_release.error_ms");
  const abs_error_ms = int(o.abs_error_ms, "slice_release.abs_error_ms", 0);
  if (error_ms !== elapsed_ms - target_ms) fail("slice_release.error_ms", "is not elapsed_ms - target_ms");
  if (abs_error_ms !== Math.abs(error_ms)) fail("slice_release.abs_error_ms", "is not |error_ms|");
  const relative_error = num(o.relative_error, "slice_release.relative_error");
  const pl = record(o.plausibility, "slice_release.plausibility", ["server_window_ms", "verdict"]);
  const ca = record(o.calculation, "slice_release.calculation",
    ["rank", "base_cooldown_ms", "ability_haste", "formula", "exact_ms", "rounding"]);
  const calc = {
    rank: int(ca.rank, "slice_release.calculation.rank", STAGE_SHAPE[stage - 1].rank, STAGE_SHAPE[stage - 1].rank),
    base_cooldown_ms: int(ca.base_cooldown_ms, "slice_release.calculation.base_cooldown_ms", 1),
    ability_haste: num(ca.ability_haste, "slice_release.calculation.ability_haste"),
    formula: str(ca.formula, "slice_release.calculation.formula"),
    exact_ms: str(ca.exact_ms, "slice_release.calculation.exact_ms"),
    rounding: str(ca.rounding, "slice_release.calculation.rounding"),
  };
  // The server's own arithmetic, checked: the target is the exact value rounded to the ms.
  const exact = Number(calc.exact_ms);
  if (!Number.isFinite(exact) || Math.abs(exact - target_ms) > 0.5) fail("slice_release.calculation.exact_ms", "does not round to target_ms");
  if (calc.ability_haste === 0 && calc.base_cooldown_ms !== target_ms) fail("slice_release.calculation", "no haste but target differs from base");
  const au = record(o.authority, "slice_release.authority",
    ["cooldown_at_rank", "cooldown_raw", "revision_id", "verified_at", "item"]);
  let item: PtSliceRelease["authority"]["item"] = null;
  if (au.item !== null) {
    const it = record(au.item, "slice_release.authority.item", ["item_id", "name", "ability_haste", "source_revision"]);
    item = {
      item_id: int(it.item_id, "slice_release.authority.item.item_id", 1),
      name: str(it.name, "slice_release.authority.item.name"),
      ability_haste: num(it.ability_haste, "slice_release.authority.item.ability_haste", Number.MIN_VALUE),
      source_revision: str(it.source_revision, "slice_release.authority.item.source_revision"),
    };
    if (item.ability_haste !== calc.ability_haste) fail("slice_release.authority.item.ability_haste", "differs from the calculation");
  } else if (calc.ability_haste !== 0) {
    fail("slice_release.authority.item", "haste without its item");
  }
  return {
    contract: SLICE_RELEASE_CONTRACT,
    slice_id,
    round_id,
    stage,
    kind,
    elapsed_ms,
    target_ms,
    error_ms,
    abs_error_ms,
    relative_error,
    tier: oneOf(o.tier, "slice_release.tier", TIERS),
    points: int(o.points, "slice_release.points", 0, 100),
    plausibility: {
      server_window_ms: int(pl.server_window_ms, "slice_release.plausibility.server_window_ms", 0),
      verdict: oneOf(pl.verdict, "slice_release.plausibility.verdict", VERDICTS),
    },
    calculation: calc,
    authority: {
      cooldown_at_rank: str(au.cooldown_at_rank, "slice_release.authority.cooldown_at_rank"),
      cooldown_raw: au.cooldown_raw === null ? null : str(au.cooldown_raw, "slice_release.authority.cooldown_raw"),
      revision_id: str(au.revision_id, "slice_release.authority.revision_id"),
      verified_at: timestamp(au.verified_at, "slice_release.authority.verified_at"),
      item,
    },
    slice_expires_at: timestamp(o.slice_expires_at, "slice_release.slice_expires_at"),
  };
}

/** The shared reveal view of a slice release (the slice extras ride in `slice`). */
export function toSliceRevealBase(r: PtSliceRelease): PtRevealView {
  return {
    elapsedMs: r.elapsed_ms,
    targetMs: r.target_ms,
    errorMs: r.error_ms,
    absErrorMs: r.abs_error_ms,
    relativeError: r.relative_error,
    tier: r.tier,
    points: r.points,
    plausible: r.plausibility.verdict === "ok",
    // The value at THIS stage's rank only: the whole progression would give a later stage away.
    cooldownRaw: r.authority.cooldown_at_rank,
    rank: r.calculation.rank,
  };
}
