/**
 * PGM1 — THE PUBLIC GAME-MODE CATALOG, as the client reads it.
 *
 * `GET /api/game-modes` (backend `public_game_modes.catalog`) is the one
 * authority for which bonus modes exist, their stable public ids, their copy,
 * their order, and what the public can launch right now. This module validates
 * that payload and nothing else: it never adds a mode, never invents an
 * availability, and never turns an approved mode into a playable one.
 *
 * PUBLIC IDS ARE A CONTRACT. `PublicModeId` is what every later surface keys
 * on — the Rules panel, the report snapshot's `game_mode_id`, results and
 * telemetry. A mode id the client does not know is dropped rather than drawn
 * with guessed copy; a malformed entry fails the whole read, because a
 * half-trusted catalog could put a Play button on the wrong thing.
 *
 * LAUNCH. A mode carries a `launch` only when the public can actually start
 * it. Phase 1 publishes one kind, `daily_stage` (Time Trial, Survival: stages
 * of today's Daily run). `ranked_match` and `session` are reserved for Phase 2's
 * public routes and are accepted here so a newer backend does not break an
 * older client — `resolveModeAction` (./launch) still refuses to draw a Play
 * button for a kind this client cannot launch.
 */

export const PUBLIC_MODES_CONTRACT = "public_game_modes.catalog.v1";

export const PUBLIC_MODE_IDS = [
  "time_trial",
  "survival",
  "roster_lock",
  "draft_memory",
  "chronoscope",
  "match_grid",
  "reconstruct",
  "order_forge",
  "rangefinder",
  "glyph_press",
  "perfect_timing",
  "stat_drop",
  "combat_estimate",
] as const;

export type PublicModeId = (typeof PUBLIC_MODE_IDS)[number];

/**
 * PGM2 — each mode's display title, for surfaces that must name a mode without
 * the catalog in hand (a match's result eyebrow, its report label). The
 * catalog stays the authority for everything a player reads about a mode; a
 * test pins these to the captured backend catalog.
 */
export const PUBLIC_MODE_TITLES: Readonly<Record<PublicModeId, string>> = {
  time_trial: "Time Trial",
  survival: "Survival",
  roster_lock: "Roster Lock",
  draft_memory: "Draft Memory",
  chronoscope: "Chronoscope",
  match_grid: "Match Grid",
  reconstruct: "Reconstruct",
  order_forge: "Order Forge",
  rangefinder: "Rangefinder",
  glyph_press: "Glyph Press",
  perfect_timing: "Perfect Timing",
  stat_drop: "Stat Drop",
  combat_estimate: "Combat Estimate",
};

export function isPublicModeId(value: unknown): value is PublicModeId {
  return typeof value === "string" && (PUBLIC_MODE_IDS as readonly string[]).includes(value);
}

export type PublicModeStatus = "available" | "paused" | "unavailable" | "coming_soon";
const STATUSES: readonly PublicModeStatus[] = ["available", "paused", "unavailable", "coming_soon"];

export type PublicModeLaunchKind = "daily_stage" | "ranked_match" | "session";
const LAUNCH_KINDS: readonly PublicModeLaunchKind[] = ["daily_stage", "ranked_match", "session"];

export type PublicModeLaunch =
  | { kind: "daily_stage"; stageKind: string; minPlanVersion: number }
  /** PGM2 — `guestsAllowed`: a verified guest session may start it. */
  | { kind: "ranked_match" | "session"; guestsAllowed: boolean };

export interface PublicModeAvailability {
  status: PublicModeStatus;
  reasonCode: string | null;
  /** Player-facing, from the server. Null when there is nothing to say. */
  message: string | null;
}

export interface PublicModeScoring {
  /** How the result is scored, in player words; null until the mode publishes it. */
  summary: string | null;
  affectsDailyScore: boolean;
  affectsRankedRating: boolean;
}

export interface PublicModeEntry {
  id: PublicModeId;
  order: number;
  title: string;
  theme: string;
  summary: string;
  availability: PublicModeAvailability;
  launch: PublicModeLaunch | null;
  scoring: PublicModeScoring;
  /** Key of the mode's Rules content. */
  rulesId: string;
  /** Key the mode's report snapshots carry (`game_mode_id`). */
  reportId: string;
  /** PGM2 — the mode's own Rules sections, from the server; [] until published. */
  rules: { heading: string; body: string }[];
}

export interface PublicModeCatalog {
  modes: PublicModeEntry[];
}

export class PublicModeCatalogParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicModeCatalogParseError";
  }
}

function fail(message: string): never {
  throw new PublicModeCatalogParseError(message);
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${what}: expected an object`);
  return value as Record<string, unknown>;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`${what}: expected a non-empty string`);
  return value;
}

function nullableStr(value: unknown, what: string): string | null {
  if (value === null || value === undefined) return null;
  return str(value, what);
}

function bool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") fail(`${what}: expected a boolean`);
  return value;
}

function readLaunch(value: unknown, what: string): PublicModeLaunch | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, what);
  const kind = raw.kind;
  if (!LAUNCH_KINDS.includes(kind as PublicModeLaunchKind)) fail(`${what}.kind: unknown launch kind`);
  if (kind === "daily_stage") {
    const min = raw.min_plan_version;
    if (typeof min !== "number" || !Number.isInteger(min) || min < 1) fail(`${what}.min_plan_version: expected an integer`);
    return { kind, stageKind: str(raw.stage_kind, `${what}.stage_kind`), minPlanVersion: min };
  }
  return { kind: kind as "ranked_match" | "session", guestsAllowed: raw.guests_allowed === true };
}

function readRules(value: unknown, what: string): { heading: string; body: string }[] {
  // Absent on a PGM1 backend: no mode-specific rules yet.
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${what}: expected an array`);
  return value.map((row, i) => {
    const r = obj(row, `${what}[${i}]`);
    return { heading: str(r.heading, `${what}[${i}].heading`), body: str(r.body, `${what}[${i}].body`) };
  });
}

function readEntry(value: unknown, index: number): PublicModeEntry | null {
  const what = `modes[${index}]`;
  const raw = obj(value, what);
  const id = str(raw.id, `${what}.id`);
  // A mode this client does not know is not drawn with guessed copy.
  if (!isPublicModeId(id)) return null;
  const availability = obj(raw.availability, `${what}.availability`);
  const status = availability.status;
  if (!STATUSES.includes(status as PublicModeStatus)) fail(`${what}.availability.status: unknown status`);
  const scoring = obj(raw.scoring, `${what}.scoring`);
  const order = raw.order;
  if (typeof order !== "number" || !Number.isFinite(order)) fail(`${what}.order: expected a number`);
  return {
    id,
    order,
    title: str(raw.title, `${what}.title`),
    theme: str(raw.theme, `${what}.theme`),
    summary: str(raw.summary, `${what}.summary`),
    availability: {
      status: status as PublicModeStatus,
      reasonCode: nullableStr(availability.reason_code, `${what}.availability.reason_code`),
      message: nullableStr(availability.message, `${what}.availability.message`),
    },
    launch: readLaunch(raw.launch, `${what}.launch`),
    scoring: {
      summary: nullableStr(scoring.summary, `${what}.scoring.summary`),
      affectsDailyScore: bool(scoring.affects_daily_score, `${what}.scoring.affects_daily_score`),
      affectsRankedRating: bool(scoring.affects_ranked_rating, `${what}.scoring.affects_ranked_rating`),
    },
    rulesId: str(raw.rules_id, `${what}.rules_id`),
    reportId: str(raw.report_id, `${what}.report_id`),
    rules: readRules(raw.rules, `${what}.rules`),
  };
}

export function readPublicModeCatalog(json: unknown): PublicModeCatalog {
  const raw = obj(json, "catalog");
  if (raw.contract !== PUBLIC_MODES_CONTRACT) fail("catalog.contract: unsupported contract");
  if (!Array.isArray(raw.modes)) fail("catalog.modes: expected an array");
  const seen = new Set<string>();
  const modes: PublicModeEntry[] = [];
  raw.modes.forEach((value, i) => {
    const entry = readEntry(value, i);
    if (!entry) return;
    if (seen.has(entry.id)) fail(`catalog.modes: duplicate id ${entry.id}`);
    seen.add(entry.id);
    modes.push(entry);
  });
  modes.sort((a, b) => a.order - b.order);
  return { modes };
}
