/**
 * RC4: strict wire readers for the RC5 Role Challenge API.
 * Conventional roles are advisory, never an eligibility gate.
 */
export type RoleChallengeRole = "top" | "jungle" | "mid" | "adc" | "support";
export type RoleChallengeSlot = "daily" | "premium";
const ROLES: readonly RoleChallengeRole[] = ["top", "jungle", "mid", "adc", "support"];

export class RoleChallengeContractError extends Error {
  constructor(message: string) {
    super("Role Challenge contract: " + message);
    this.name = "RoleChallengeContractError";
  }
}
const fail = (at: string, expectation: string): never => {
  throw new RoleChallengeContractError(at + " " + expectation);
};
function obj(value: unknown, at: string): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : fail(at, "must be an object");
}
function str(value: unknown, at: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fail(at, "must be nonempty text");
}
function optstr(value: unknown, at: string): string | null {
  return value === null ? null : str(value, at);
}
function bool(value: unknown, at: string): boolean {
  return typeof value === "boolean" ? value : fail(at, "must be boolean");
}
function array(value: unknown, at: string): unknown[] {
  return Array.isArray(value) ? value : fail(at, "must be an array");
}
function nonnegative(value: unknown, at: string): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value : fail(at, "must be a nonnegative integer");
}
function role(value: unknown, at: string): RoleChallengeRole {
  return ROLES.includes(value as RoleChallengeRole)
    ? value as RoleChallengeRole : fail(at, "is not a canonical role");
}
function literal(value: unknown, expected: string, at: string): void {
  if (value !== expected) fail(at, "must be " + expected);
}
function slotKind(value: unknown, at: string): RoleChallengeSlot {
  if (value === "daily" || value === "premium") return value;
  return fail(at, "must be daily or premium");
}
function matchStatus(value: unknown, at: string): "active" | "complete" | null {
  if (value === "active" || value === "complete") return value;
  if (value === null) return null;
  return fail(at, "must be active, complete, or null");
}
function startResult(value: unknown, at: string): "created" | "existing" {
  if (value === "created" || value === "existing") return value;
  return fail(at, "must be created or existing");
}
function twelve(value: unknown, at: string): 12 {
  if (nonnegative(value, at) !== 12) fail(at, "must equal 12");
  return 12;
}

export interface RoleChallengeChampion {
  id: string;
  name: string;
  riotId: string | null;
  conventionalRoles: RoleChallengeRole[];
  conventional: boolean;
}
export interface RoleChallengeCatalog {
  answerCount: 12;
  formatId: string;
  formatVersion: number;
  composerVersion: string;
  roles: { role: RoleChallengeRole; label: string; champions: RoleChallengeChampion[] }[];
}
export function readRoleChallengeCatalog(wire: unknown): RoleChallengeCatalog {
  const r = obj(wire, "catalog");
  literal(r.schema_version, "role_challenge_catalog.v2", "catalog.schema_version");
  const p = obj(r.product, "catalog.product");
  const seenRoles = new Set<RoleChallengeRole>();
  const roles = array(r.roles, "catalog.roles").map((input, i) => {
    const at = "catalog.roles[" + i + "]";
    const x = obj(input, at);
    const id = role(x.role, at + ".role");
    if (seenRoles.has(id)) fail(at, "contains a duplicate role");
    seenRoles.add(id);
    const seen = new Set<string>();
    const champions = array(x.champions, at + ".champions").map((entry, j) => {
      const where = at + ".champions[" + j + "]";
      const c = obj(entry, where);
      const championId = str(c.id, where + ".id");
      if (seen.has(championId)) fail(where, "contains a duplicate champion");
      seen.add(championId);
      const conventionalRoles = array(c.roles, where + ".roles")
        .map((v, k) => role(v, where + ".roles[" + k + "]"));
      if (new Set(conventionalRoles).size !== conventionalRoles.length) {
        fail(where, "has duplicate conventional roles");
      }
      const conventional = bool(c.conventional, where + ".conventional");
      if (conventional !== conventionalRoles.includes(id)) {
        fail(where, "has contradictory conventional metadata");
      }
      return {
        id: championId,
        name: str(c.name, where + ".name"),
        riotId: optstr(c.riot_id, where + ".riot_id"),
        conventionalRoles,
        conventional,
      };
    });
    return { role: id, label: str(x.label, at + ".label"), champions };
  });
  if (seenRoles.size !== ROLES.length) fail("catalog", "must include all five roles");
  const first = new Set(roles[0].champions.map(c => c.id));
  if (first.size === 0) fail("catalog", "cannot have an empty champion roster");
  for (const row of roles.slice(1)) {
    if (row.champions.length !== first.size || row.champions.some(c => !first.has(c.id))) {
      fail("catalog", "must offer every champion in every role");
    }
  }
  return {
    answerCount: twelve(p.answer_count, "catalog.product.answer_count"),
    formatId: str(p.format_id, "catalog.product.format_id"),
    formatVersion: nonnegative(p.format_version, "catalog.product.format_version"),
    composerVersion: str(p.composer_version, "catalog.product.composer_version"),
    roles,
  };
}

export interface RoleChallengeRun {
  runId: string;
  matchId: string;
  challengeDate: string;
  slotKind: RoleChallengeSlot;
  role: RoleChallengeRole;
  champion: string;
  championName: string;
  answerCount: 12;
  composerVersion: string;
  createdAt: string;
  matchStatus: "active" | "complete" | null;
  outline: Record<string, unknown>[];
}
function parseRun(value: unknown, at: string): RoleChallengeRun {
  const r = obj(value, at);
  literal(r.host, "role_challenge", at + ".host");
  const kind = slotKind(r.slot_kind, at + ".slot_kind");
  const status = matchStatus(r.match_status, at + ".match_status");
  return {
    runId: str(r.run_id, at + ".run_id"),
    matchId: str(r.match_id, at + ".match_id"),
    challengeDate: str(r.challenge_date, at + ".challenge_date"),
    slotKind: kind,
    role: role(r.role, at + ".role"),
    champion: str(r.champion, at + ".champion"),
    championName: str(r.champion_name, at + ".champion_name"),
    answerCount: twelve(r.answer_count, at + ".answer_count"),
    composerVersion: str(r.composer_version, at + ".composer_version"),
    createdAt: str(r.created_at, at + ".created_at"),
    matchStatus: status,
    outline: array(r.outline, at + ".outline").map((v, i) => obj(v, at + ".outline[" + i + "]")),
  };
}

export interface RoleChallengeStatus {
  serverNow: string;
  challengeDate: string;
  resetsAt: string;
  answerCount: 12;
  dailySlot: { used: boolean; run: RoleChallengeRun | null };
  activeRun: RoleChallengeRun | null;
  otherActiveMatch: boolean;
  nextStart: { slotKind: RoleChallengeSlot | null; allowed: boolean | null; reason: string | null };
}
export function readRoleChallengeStatus(wire: unknown): RoleChallengeStatus {
  const r = obj(wire, "status");
  literal(r.schema_version, "role_challenge_status.v1", "status.schema_version");
  const daily = obj(r.daily_slot, "status.daily_slot");
  const next = obj(r.next_start, "status.next_start");
  const used = bool(daily.used, "status.daily_slot.used");
  if ((daily.run !== null) !== used) fail("status.daily_slot", "has conflicting used/run data");
  const slot = next.slot_kind === null ? null : slotKind(next.slot_kind, "status.next_start.slot_kind");
  const allowed = next.allowed === null ? null : bool(next.allowed, "status.next_start.allowed");
  return {
    serverNow: str(r.server_now, "status.server_now"),
    challengeDate: str(r.challenge_date, "status.challenge_date"),
    resetsAt: str(r.resets_at, "status.resets_at"),
    answerCount: twelve(r.answer_count, "status.answer_count"),
    dailySlot: { used, run: daily.run === null ? null : parseRun(daily.run, "status.daily_slot.run") },
    activeRun: r.active_run === null ? null : parseRun(r.active_run, "status.active_run"),
    otherActiveMatch: bool(r.other_active_match, "status.other_active_match"),
    nextStart: {
      slotKind: slot,
      allowed,
      reason: optstr(next.reason, "status.next_start.reason"),
    },
  };
}

export interface RoleChallengeStart {
  result: "created" | "existing";
  run: RoleChallengeRun;
  matchId: string;
}
export function readRoleChallengeStart(wire: unknown): RoleChallengeStart {
  const r = obj(wire, "start");
  const rc = obj(r.role_challenge, "start.role_challenge");
  literal(rc.schema_version, "role_challenge_start.v1", "start.role_challenge.schema_version");
  const result = startResult(rc.result, "start.role_challenge.result");
  const item = parseRun(rc.run, "start.role_challenge.run");
  literal(r.projection_type, "queue_status", "start.projection_type");
  const payload = obj(r.payload, "start.payload");
  literal(payload.status, "matched", "start.payload.status");
  const matchId = str(payload.match_id, "start.payload.match_id");
  if (matchId !== item.matchId) fail("start", "disagrees on match id");
  return { result, run: item, matchId };
}
