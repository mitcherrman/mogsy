/**
 * TOURNAMENT ARENA — the frontend ↔ backend contract (handoff §6).
 *
 * SERVED by the LCS backend (`/api/arena/*`, `arena/projection.py`); the
 * fixture gateway produces the same shape for the DEV harness, so both sides
 * meet on one document. It mirrors the pro-play `SlotSource` graph on purpose
 * (edges stored on the TARGET slot), so the forked bracket logic carries over.
 *
 * Two rules the whole feature inherits from the audit:
 *   - identity hygiene: `profile_id` + `display_name` only, never an auth
 *     `user_id`;
 *   - truthfulness: a future slot says where its entrant comes from
 *     ("Winner of SF1"); a projected name is never written into it.
 */

export const ARENA_EVENT_CONTRACT = "arena_event.v1";

export type ArenaEventKind = "duel" | "match" | "tournament";
export type ArenaEventStatus = "draft" | "open" | "locked" | "running" | "complete" | "cancelled";

export type ArenaSlotSource =
  | { kind: "seed"; seed: number }
  | { kind: "winner_of"; node_id: string }
  | { kind: "loser_of"; node_id: string }
  | { kind: "bye" };

export type ArenaNodeStatus = "pending" | "ready" | "live" | "complete" | "walkover" | "bye";
/** Why the organizer must act on a node (backend B3), else null. */
export type ArenaNodeAttention = "no_show" | "draw_cap";
export type ArenaEntrantStatus = "invited" | "joined" | "checked_in" | "withdrawn" | "eliminated" | "champion";
export type ArenaEntrantRole = "organizer" | "cohost" | "player";
export type ArenaRoleEmblem = "top" | "jungle" | "mid" | "adc" | "support";
export type ArenaBestOf = 1 | 3 | 5;
export type ArenaViewerRole = ArenaEntrantRole | "spectator";

export interface ArenaEntrant {
  /** `profiles.id` — never the auth user id. */
  profile_id: string;
  display_name: string;
  seed: number | null;
  status: ArenaEntrantStatus;
  role: ArenaEntrantRole;
  /** The entrant's Ranked role identity, if they chose one. */
  role_emblem?: ArenaRoleEmblem | null;
  /** The entrant's Ranked tier name, for crown art (`resolveCrownArt`). */
  tier?: string | null;
}

export interface ArenaSlot {
  source: ArenaSlotSource;
  profile_id: string | null;
  wins: number;
}

export interface ArenaGame {
  game_index: number;
  winner_profile_id: string | null;
  outcome: "decisive" | "draw" | "forfeit" | "no_contest";
  /** Points, when the engine committed them (display only). */
  score_a: number | null;
  score_b: number | null;
}

export interface ArenaNode {
  node_id: string;
  round: number;
  position: number;
  section: "main";
  best_of: ArenaBestOf;
  status: ArenaNodeStatus;
  slots: [ArenaSlot, ArenaSlot];
  winner_profile_id: string | null;
  /** Only the viewer's own node carries one, so the viewer can jump into play. */
  current_match_id: string | null;
  ready_deadline: string | null;
  /**
   * The two-sided ready check (backend B3): who has pressed Play on a ready
   * node. Absent on fixture projections.
   */
  ready_profile_ids?: string[];
  /** Set when the organizer must resolve the node. */
  attention?: ArenaNodeAttention | null;
  games: ArenaGame[];
}

export interface ArenaBracket {
  type: "single_elimination";
  rounds: number;
  nodes: ArenaNode[];
}

export interface ArenaRules {
  /** Catalog id of the game type (`ranked_quiz`, `match_grid`, …). */
  game_type: string;
  modules: number;
  /** Seconds per question; null = the format's default. */
  question_seconds: number | null;
  ruleset: "standard" | "time_trial" | "survival";
  speed_bonus: boolean;
  difficulty: "mixed" | "easy" | "hard";
  topics: string[];
}

export interface ArenaEvent {
  contract_version: typeof ARENA_EVENT_CONTRACT;
  event_id: string;
  kind: ArenaEventKind;
  status: ArenaEventStatus;
  revision: number;
  title: string;
  game_type: string;
  rules: ArenaRules;
  best_of: ArenaBestOf;
  max_entrants: number;
  rated: boolean;
  visibility: "private" | "link" | "public";
  organizer_profile_id: string;
  viewer_profile_id: string | null;
  viewer_role: ArenaViewerRole;
  /** Organizer view only. */
  join_code?: string;
  /**
   * True only when the backend answered with the organizer view: the caller
   * holds organizer authority (the Mogzy owner, admin-only beta). Absent on
   * fixture projections, where the organizer seat stands in for it.
   */
  viewer_can_manage?: boolean;
  /** Organizer view only: pending invitations by recipient profile id. */
  invites?: ArenaPendingInvite[];
  /** The owner's admin read only: the event's audit trail, newest first. */
  audit?: ArenaAuditEntry[];
  entrants: ArenaEntrant[];
  bracket: ArenaBracket | null;
  champion_profile_id: string | null;
  /** Anchors client clocks, as the Ranked timer does. */
  server_now: string;
}

export interface ArenaPendingInvite {
  invite_id: string;
  recipient_profile_id: string;
  status: "pending";
  expires_at: string;
}

export interface ArenaAuditEntry {
  kind: string;
  revision: number | null;
  at: string;
  /** null for a system action (a terminal result, a deadline). */
  actor_profile_id: string | null;
  system: boolean;
  payload: Record<string, unknown>;
}

/** May this viewer run the event? The backend's word when it gave one; on a
 *  fixture projection, the organizer seat. */
export function canManageEvent(ev: Pick<ArenaEvent, "viewer_can_manage" | "viewer_role">): boolean {
  if (typeof ev.viewer_can_manage === "boolean") return ev.viewer_can_manage;
  return ev.viewer_role === "organizer" || ev.viewer_role === "cohost";
}

/* ── validation (the style of `src/lib/ranked-public/contracts.ts`) ─────── */

const KINDS: readonly ArenaEventKind[] = ["duel", "match", "tournament"];
const STATUSES: readonly ArenaEventStatus[] = ["draft", "open", "locked", "running", "complete", "cancelled"];
const NODE_STATUSES: readonly ArenaNodeStatus[] = ["pending", "ready", "live", "complete", "walkover", "bye"];
const BEST_OF: readonly number[] = [1, 3, 5];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";

export function isArenaSlotSource(v: unknown): v is ArenaSlotSource {
  if (!isRecord(v)) return false;
  switch (v.kind) {
    case "seed": return typeof v.seed === "number";
    case "winner_of":
    case "loser_of": return isStr(v.node_id);
    case "bye": return true;
    default: return false;
  }
}

function isSlot(v: unknown): v is ArenaSlot {
  return isRecord(v) && isArenaSlotSource(v.source) && (v.profile_id === null || isStr(v.profile_id)) && typeof v.wins === "number";
}

export function isArenaNode(v: unknown): v is ArenaNode {
  return (
    isRecord(v) &&
    isStr(v.node_id) &&
    typeof v.round === "number" &&
    typeof v.position === "number" &&
    BEST_OF.includes(v.best_of as number) &&
    NODE_STATUSES.includes(v.status as ArenaNodeStatus) &&
    Array.isArray(v.slots) && v.slots.length === 2 && v.slots.every(isSlot) &&
    (v.winner_profile_id === null || isStr(v.winner_profile_id)) &&
    Array.isArray(v.games)
  );
}

export function isArenaEvent(v: unknown): v is ArenaEvent {
  if (!isRecord(v) || v.contract_version !== ARENA_EVENT_CONTRACT) return false;
  if (!isStr(v.event_id) || !isStr(v.title) || !isStr(v.game_type)) return false;
  if (!KINDS.includes(v.kind as ArenaEventKind) || !STATUSES.includes(v.status as ArenaEventStatus)) return false;
  if (typeof v.revision !== "number" || !BEST_OF.includes(v.best_of as number)) return false;
  if (!Array.isArray(v.entrants) || !v.entrants.every((e) => isRecord(e) && isStr(e.profile_id) && isStr(e.display_name))) return false;
  if (v.bracket !== null) {
    if (!isRecord(v.bracket) || v.bracket.type !== "single_elimination") return false;
    if (!Array.isArray(v.bracket.nodes) || !v.bracket.nodes.every(isArenaNode)) return false;
  }
  // The one hygiene rule a client can check: no auth user ids on the wire.
  if ("user_id" in v || (v.entrants as unknown[]).some((e) => isRecord(e) && "user_id" in e)) return false;
  return true;
}

/** Round names from the count, never a hardcoded Worlds list. */
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/** Short node label: "QF2", "SF1", "F". */
export function nodeLabel(node: Pick<ArenaNode, "round" | "position">, totalRounds: number): string {
  const fromEnd = totalRounds - node.round;
  if (fromEnd === 0) return "Final";
  const prefix = fromEnd === 1 ? "SF" : fromEnd === 2 ? "QF" : `R${2 ** (fromEnd + 1)}-`;
  return `${prefix}${node.position + 1}`;
}

/** "Winner of SF1" / "Seed 3" / "Bye" — what an unfilled slot says about itself. */
export function slotSourceLabel(source: ArenaSlotSource, nodes: readonly ArenaNode[], totalRounds: number): string {
  switch (source.kind) {
    case "seed": return `Seed ${source.seed}`;
    case "bye": return "Bye";
    case "winner_of":
    case "loser_of": {
      const n = nodes.find((x) => x.node_id === source.node_id);
      const who = source.kind === "winner_of" ? "Winner" : "Loser";
      return n ? `${who} of ${nodeLabel(n, totalRounds)}` : "TBD";
    }
  }
}

export const MAX_ENTRANTS_V1 = 32;
