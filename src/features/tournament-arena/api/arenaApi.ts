/**
 * TOURNAMENT ARENA — the real HTTP client for `/api/arena/*` (LCS backend,
 * `routes/arena_public.py` + `routes/arena_admin.py`).
 *
 * Rules this file keeps:
 *   - the bearer is the signed-in account's own Supabase token
 *     (`getBackendAuthHeaders()`), never minted: the Arena is for verified
 *     accounts only, and an anonymous session is refused server-side;
 *   - every event body is validated with `isArenaEvent` before anything
 *     renders it, and a body that fails is an error, never a partial render;
 *   - every mutation carries an `action_id` (minted per press, reused on a
 *     retry of the same press), so a double click or an owner re-attestation
 *     retry applies once;
 *   - nothing here decides authority. The organizer routes refuse
 *     `ARENA_ORGANIZER_REQUIRED` for anyone but the owner, whatever this
 *     client sends.
 */
import { getBackendAuthHeaders } from "@/lib/backend-auth";

import { isArenaEvent, type ArenaBestOf, type ArenaEvent, type ArenaEventKind, type ArenaRules } from "../contracts";

export const ARENA_API_BASE = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export type ArenaApiErrorKind = "backend" | "network" | "invalid_response";

export class ArenaApiError extends Error {
  kind: ArenaApiErrorKind;
  status: number;
  /** The backend's stable code (`ARENA_*`, `RANKED_*`, `ACCOUNT_REQUIRED`…). */
  code: string | null;
  detail: Record<string, unknown> | null;
  constructor(kind: ArenaApiErrorKind, status: number, message: string, code: string | null = null, detail: Record<string, unknown> | null = null) {
    super(message);
    this.name = "ArenaApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const isArenaApiError = (e: unknown): e is ArenaApiError => e instanceof ArenaApiError;

/** Codes after which polling must stop instead of retrying. */
export function isTerminalArenaError(e: unknown): boolean {
  if (!isArenaApiError(e)) return false;
  return e.code === "ARENA_DISABLED" || e.code === "ARENA_EVENT_NOT_FOUND"
    || e.code === "AUTH_REQUIRED" || e.code === "ACCOUNT_REQUIRED"
    || e.code === "ARENA_ORGANIZER_REQUIRED";
}

/** A fresh idempotency key for one press. */
export function newArenaActionId(prefix = "fe"): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${rand}`.slice(0, 64);
}

type Body = Record<string, unknown> | undefined;

async function request(method: string, path: string, body?: Body): Promise<unknown> {
  const headers: Record<string, string> = { ...(await getBackendAuthHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${ARENA_API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ArenaApiError("network", 0, "network error", "NETWORK");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const raw = (payload as { detail?: unknown } | null)?.detail;
    const detail = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const code = typeof detail?.code === "string" ? detail.code : null;
    const message = typeof detail?.message === "string" ? detail.message
      : typeof raw === "string" ? raw : `HTTP ${response.status}`;
    throw new ArenaApiError("backend", response.status, message, code, detail);
  }
  return payload;
}

function asEvent(raw: unknown): ArenaEvent {
  if (!isArenaEvent(raw)) throw new ArenaApiError("invalid_response", 200, "unexpected event shape", "ARENA_BAD_RESPONSE");
  return raw;
}

/* ── reads ──────────────────────────────────────────────────────────────── */

export interface ArenaCatalogGameType {
  id: string;
  label: string;
  description: string;
  default_rules: ArenaRules;
  settings: {
    modules: { min: number; max: number; default: number };
    question_seconds: { min: number; max: number; default: number | null; applies_to: string[] };
    ruleset: { options: ArenaRules["ruleset"][]; default: ArenaRules["ruleset"] };
    speed_bonus: { default: boolean };
    difficulty: { options: ArenaRules["difficulty"][]; applied: boolean };
    topics: { max_items: number; applied: boolean };
  };
  available?: boolean;
  unavailable_reason?: string | null;
}

export interface ArenaCatalog {
  schema_version: string;
  game_types: ArenaCatalogGameType[];
  limits: {
    kinds: ArenaEventKind[];
    max_entrants: number;
    best_of_options: ArenaBestOf[];
    ready_deadline_seconds: number;
    max_draw_replays: number;
    invite_ttl_minutes: number;
    max_pending_invites: number;
  };
  ranked_engine_enabled: boolean;
  new_starts_enabled: boolean;
  server_now: string;
}

export async function getArenaCatalog(): Promise<ArenaCatalog> {
  const raw = await request("GET", "/api/arena/catalog");
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as ArenaCatalog).game_types)) {
    throw new ArenaApiError("invalid_response", 200, "unexpected catalog shape", "ARENA_BAD_RESPONSE");
  }
  return raw as ArenaCatalog;
}

/** `{unchanged: true}` when `sinceRevision` is current. */
export type ArenaEventRead = { unchanged: true; revision: number } | { unchanged: false; event: ArenaEvent };

function readEventOrUnchanged(raw: unknown): ArenaEventRead {
  if (raw && typeof raw === "object" && (raw as { unchanged?: unknown }).unchanged === true) {
    return { unchanged: true, revision: Number((raw as { revision?: unknown }).revision) };
  }
  return { unchanged: false, event: asEvent(raw) };
}

export async function getArenaEvent(eventId: string, sinceRevision?: number | null): Promise<ArenaEventRead> {
  const q = sinceRevision != null ? `?since_revision=${sinceRevision}` : "";
  return readEventOrUnchanged(await request("GET", `/api/arena/events/${encodeURIComponent(eventId)}${q}`));
}

export async function listArenaEvents(scope: "mine" | "joined"): Promise<ArenaEvent[]> {
  const raw = await request("GET", `/api/arena/events?scope=${scope}`);
  const events = (raw as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) throw new ArenaApiError("invalid_response", 200, "unexpected list shape", "ARENA_BAD_RESPONSE");
  return events.map(asEvent);
}

export async function resolveArenaJoinCode(code: string): Promise<string> {
  const raw = await request("GET", `/api/arena/join/${encodeURIComponent(code)}`);
  const id = (raw as { event_id?: unknown } | null)?.event_id;
  if (typeof id !== "string") throw new ArenaApiError("invalid_response", 200, "unexpected join answer", "ARENA_BAD_RESPONSE");
  return id;
}

export interface ArenaInboxInvite {
  invite_id: string;
  event_id: string;
  token: string;
  status: string;
  expires_at: string;
  sender_display_name: string | null;
  event: { event_id: string; title: string; kind: ArenaEventKind; game_type: string; best_of: number; status: string };
}

export async function listArenaInvites(): Promise<ArenaInboxInvite[]> {
  const raw = await request("GET", "/api/arena/invites");
  const invites = (raw as { invites?: unknown } | null)?.invites;
  return Array.isArray(invites) ? (invites as ArenaInboxInvite[]) : [];
}

/* ── player mutations ───────────────────────────────────────────────────── */

export async function joinArenaEvent(eventId: string, code: string | null, actionId = newArenaActionId("join")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/join`, { code: code ?? undefined, action_id: actionId }));
}

export async function checkInArenaEvent(eventId: string, actionId = newArenaActionId("checkin")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/check-in`, { action_id: actionId }));
}

export async function leaveArenaEvent(eventId: string, actionId = newArenaActionId("leave")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/leave`, { action_id: actionId }));
}

export async function acceptArenaInvite(token: string): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/invites/${encodeURIComponent(token)}/accept`, { action_id: newArenaActionId("accept") }));
}

export async function declineArenaInvite(token: string): Promise<void> {
  await request("POST", `/api/arena/invites/${encodeURIComponent(token)}/decline`, { action_id: newArenaActionId("decline") });
}

export interface ArenaPlayAnswer {
  /** null while the opponent has not pressed Play yet. */
  match_id: string | null;
  created: boolean;
  waiting_for_opponent: boolean;
  event: ArenaEvent;
}

/** Press Play on a node: ready check first, then the game (backend B3). */
export async function playArenaNode(eventId: string, nodeId: string, actionId = newArenaActionId("play")): Promise<ArenaPlayAnswer> {
  const raw = await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/nodes/${encodeURIComponent(nodeId)}/play`, { action_id: actionId });
  const r = raw as { match_id?: unknown; created?: unknown; waiting_for_opponent?: unknown; event?: unknown } | null;
  return {
    match_id: typeof r?.match_id === "string" ? r.match_id : null,
    created: r?.created === true,
    waiting_for_opponent: r?.waiting_for_opponent === true,
    event: asEvent(r?.event),
  };
}

/* ── organizer (owner) ──────────────────────────────────────────────────── */

export interface ArenaCreateInput {
  kind: ArenaEventKind;
  title: string;
  game_type: string;
  rules: Partial<ArenaRules>;
  best_of: ArenaBestOf;
  max_entrants?: number;
  visibility: "private" | "link";
  organizer_plays: boolean;
}

/** The rules body the server takes: everything but the echoed `game_type`. */
function rulesBody(rules: Partial<ArenaRules>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rules };
  delete out.game_type;
  return out;
}

export async function createArenaEvent(input: ArenaCreateInput, actionId = newArenaActionId("create")): Promise<ArenaEvent> {
  return asEvent(await request("POST", "/api/arena/events", {
    kind: input.kind, title: input.title, game_type: input.game_type, rules: rulesBody(input.rules),
    best_of: input.best_of, max_entrants: input.kind === "tournament" ? input.max_entrants : undefined,
    visibility: input.visibility, organizer_plays: input.organizer_plays, action_id: actionId,
  }));
}

export async function lockArenaEvent(eventId: string, opts: { seedOrder?: readonly string[]; shuffle?: boolean } = {}, actionId = newArenaActionId("lock")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/lock`, {
    seed_order: opts.seedOrder ? [...opts.seedOrder] : undefined, shuffle: opts.shuffle ?? false, action_id: actionId,
  }));
}

export async function startArenaEvent(eventId: string, actionId = newArenaActionId("start")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/start`, { action_id: actionId }));
}

export async function cancelArenaEvent(eventId: string, reason: string | null, actionId = newArenaActionId("cancel")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/cancel`, { reason: reason ?? undefined, action_id: actionId }));
}

export type ArenaResolveReason = "walkover" | "dq" | "no_show";

export async function resolveArenaNode(eventId: string, nodeId: string, winnerProfileId: string, reason: ArenaResolveReason, actionId = newArenaActionId("resolve")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/nodes/${encodeURIComponent(nodeId)}/resolve`, {
    winner_profile_id: winnerProfileId, reason, action_id: actionId,
  }));
}

export async function inviteToArenaEvent(eventId: string, recipientProfileId: string, actionId = newArenaActionId("invite")): Promise<{ reused: boolean }> {
  const raw = await request("POST", `/api/arena/events/${encodeURIComponent(eventId)}/invites`, { recipient_profile_id: recipientProfileId, action_id: actionId });
  return { reused: (raw as { reused?: unknown } | null)?.reused === true };
}

export async function withdrawArenaInvite(inviteId: string): Promise<void> {
  await request("DELETE", `/api/arena/invites/${encodeURIComponent(inviteId)}`);
}

/* ── owner moderation (/api/arena/admin) ────────────────────────────────── */

export async function adminListArenaEvents(status?: string): Promise<ArenaEvent[]> {
  const raw = await request("GET", `/api/arena/admin/events${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  const events = (raw as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) throw new ArenaApiError("invalid_response", 200, "unexpected list shape", "ARENA_BAD_RESPONSE");
  return events.map(asEvent);
}

export async function adminGetArenaEvent(eventId: string, sinceRevision?: number | null): Promise<ArenaEventRead> {
  const q = sinceRevision != null ? `?since_revision=${sinceRevision}` : "";
  return readEventOrUnchanged(await request("GET", `/api/arena/admin/events/${encodeURIComponent(eventId)}${q}`));
}

export interface ArenaEventEdit {
  title?: string;
  game_type?: string;
  rules?: Partial<ArenaRules>;
  best_of?: ArenaBestOf;
  max_entrants?: number;
  visibility?: "private" | "link";
}

export async function adminUpdateArenaEvent(eventId: string, edit: ArenaEventEdit, actionId = newArenaActionId("edit")): Promise<ArenaEvent> {
  const body: Record<string, unknown> = { ...edit, action_id: actionId };
  if (edit.rules) body.rules = rulesBody(edit.rules);
  return asEvent(await request("PATCH", `/api/arena/admin/events/${encodeURIComponent(eventId)}`, body));
}

export async function adminRemoveArenaEntrant(eventId: string, profileId: string, actionId = newArenaActionId("remove")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/admin/events/${encodeURIComponent(eventId)}/entrants/${encodeURIComponent(profileId)}/remove`, { action_id: actionId }));
}

export async function adminOverrideArenaNode(eventId: string, nodeId: string, winnerProfileId: string, note: string | null, actionId = newArenaActionId("override")): Promise<ArenaEvent> {
  return asEvent(await request("POST", `/api/arena/admin/events/${encodeURIComponent(eventId)}/nodes/${encodeURIComponent(nodeId)}/override`, {
    winner_profile_id: winnerProfileId, note: note ?? undefined, action_id: actionId,
  }));
}

/* ── copy ───────────────────────────────────────────────────────────────── */

const COPY: Record<string, string> = {
  NETWORK: "The Arena could not be reached. Check your connection and try again.",
  ARENA_BAD_RESPONSE: "The Arena answered in an unexpected shape. Nothing was changed on this screen.",
  ARENA_DISABLED: "The Tournament Arena is not open right now.",
  ARENA_PAUSED: "The Arena is paused for new events. Events already running can continue.",
  ARENA_PUBLIC_DISABLED: "Public events are not available. Use an invite-only or join-code event.",
  ARENA_ORGANIZER_REQUIRED: "Only a Mogzy administrator can do this.",
  ARENA_ADMIN_UNAVAILABLE: "Administrator authorization could not be confirmed right now. Try again shortly.",
  ARENA_COMMUNITY_UNAVAILABLE: "Your Mogzy profile could not be confirmed. Try again shortly.",
  AUTH_REQUIRED: "Sign in to use the Tournament Arena.",
  ACCOUNT_REQUIRED: "The Tournament Arena needs a Mogzy account. Sign in or create one to join.",
  ARENA_EVENT_NOT_FOUND: "This event does not exist, or it is private and you are not in it.",
  ARENA_BAD_JOIN_CODE: "That join code is not right for this event.",
  ARENA_EVENT_FULL: "This event is full.",
  ARENA_ALREADY_ENTRANT: "You are already in this event.",
  ARENA_WRONG_STATUS: "This event has moved on; the action no longer applies.",
  ARENA_REVISION_CONFLICT: "The event changed while you were looking. It has been refreshed; try again.",
  ARENA_TOO_FEW_ENTRANTS: "A bracket needs at least two players.",
  ARENA_NODE_NOT_READY: "This match is waiting on an earlier result.",
  ARENA_NODE_LIVE: "A game is in progress. Wait for it to end.",
  ARENA_NODE_DECIDED: "This match is already decided.",
  ARENA_NODE_NEEDS_RESOLUTION: "This match needs the organizer to resolve it.",
  ARENA_NODE_NOT_OVERRIDABLE: "This result can no longer be changed: the next match has been played.",
  ARENA_NOT_AN_ENTRANT: "You are not a player in this match.",
  ARENA_INVITE_NOT_FRIENDS: "You can only invite accepted friends.",
  ARENA_INVITE_BLOCKED: "This invite is not available.",
  ARENA_INVITE_EXPIRED: "This invitation has expired.",
  ARENA_INVITE_RESOLVED: "This invitation was already answered.",
  ARENA_INVITE_LIMIT: "Too many invitations are pending. Withdraw some first.",
  ARENA_INVALID_FORMAT: "Those rules are not a valid format for this game type.",
  ARENA_INVALID_EVENT: "Those event settings are not valid.",
  ARENA_ORGANIZER_CANNOT_LEAVE: "The organizer seat cannot be removed.",
  RANKED_ACTIVE_MATCH_EXISTS: "A player is still in another match. Finish it first, then press Play again.",
  FEATURE_DISABLED: "Matches cannot start right now: the Ranked engine is off.",
  RANKED_RATE_LIMITED: "Too many presses. Wait a moment and try again.",
};

/** Player-facing copy for an Arena failure. Never raw exception text. */
export function arenaErrorCopy(e: unknown): string {
  if (isArenaApiError(e)) {
    if (e.code && COPY[e.code]) return COPY[e.code];
    if (e.status === 403) return COPY.ARENA_ORGANIZER_REQUIRED;
    if (e.status >= 500) return "The Arena had a problem. Try again shortly.";
    return e.kind === "network" ? COPY.NETWORK : "That did not work. Try again.";
  }
  return "That did not work. Try again.";
}
