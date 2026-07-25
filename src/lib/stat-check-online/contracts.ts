/**
 * Fail-closed contracts for Stat Check multiplayer payloads.
 *
 * Mirrors the ranked-core envelope discipline: every reader validates the
 * EXACT key set — any unexpected key (which is how hidden information would
 * leak: a stray `seed`, `next_categories`, opponent hand/inventory, or raw
 * account id) rejects the payload instead of passing it through. Forbidden
 * key names are additionally rejected by a deep scan as defense in depth.
 */

export const ROOM_SCHEMA_VERSION = "stat_check.room.v1";

export class StatCheckContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatCheckContractError";
  }
}

/** Keys that must NEVER appear anywhere in a client payload. */
const FORBIDDEN_KEY_PATTERN = /^(seed|draw_pile|drawpile|next_categories|nextcategories|user_id|opponent_hand|opponent_inventory)$/i;

export function assertNoForbiddenKeys(value: unknown, path = "$", depth = 0): void {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new StatCheckContractError(`forbidden key ${key} at ${path}`);
    }
    assertNoForbiddenKeys(entry, `${path}.${key}`, depth + 1);
  }
}

export function requireExactKeys(
  raw: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  for (const key of required) {
    if (!(key in raw)) throw new StatCheckContractError(`${label}: missing key ${key}`);
  }
  for (const key of Object.keys(raw)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new StatCheckContractError(`${label}: unexpected key ${key}`);
    }
  }
}

const asObject = (raw: unknown, label: string): Record<string, unknown> => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StatCheckContractError(`${label}: not an object`);
  }
  return raw as Record<string, unknown>;
};

// ---------------------------------------------------------------- rooms

export type RoomSeatView = {
  seat: "p1" | "p2";
  ready: boolean;
  isSelf: boolean;
  displayName: string;
};

export type RoomView = {
  roomId: string;
  status: "open" | "active" | "completed" | "cancelled";
  inviteCode: string;
  createdByYou: boolean;
  yourSeat: "p1" | "p2" | null;
  matchId: string | null;
  seats: RoomSeatView[];
  serverTime: string;
  /** Present only on ready responses. */
  started?: boolean;
};

export function readRoomView(raw: unknown): RoomView {
  const record = asObject(raw, "room");
  assertNoForbiddenKeys(record);
  requireExactKeys(
    record,
    ["schema_version", "room_id", "status", "invite_code", "created_by_you", "your_seat", "match_id", "seats", "server_time"],
    ["started"],
    "room",
  );
  if (record.schema_version !== ROOM_SCHEMA_VERSION) {
    throw new StatCheckContractError(`room: schema ${String(record.schema_version)}`);
  }
  const status = record.status;
  if (status !== "open" && status !== "active" && status !== "completed" && status !== "cancelled") {
    throw new StatCheckContractError(`room: bad status ${String(status)}`);
  }
  const seatsRaw = record.seats;
  if (!Array.isArray(seatsRaw) || seatsRaw.length > 2) {
    throw new StatCheckContractError("room: bad seats");
  }
  const seats = seatsRaw.map((entry): RoomSeatView => {
    const seat = asObject(entry, "room.seat");
    requireExactKeys(seat, ["seat", "ready", "is_self", "display_name"], [], "room.seat");
    if (seat.seat !== "p1" && seat.seat !== "p2") throw new StatCheckContractError("room.seat: bad id");
    return {
      seat: seat.seat,
      ready: seat.ready === true,
      isSelf: seat.is_self === true,
      displayName: String(seat.display_name),
    };
  });
  return {
    roomId: String(record.room_id),
    status,
    inviteCode: String(record.invite_code),
    createdByYou: record.created_by_you === true,
    yourSeat: record.your_seat === "p1" || record.your_seat === "p2" ? record.your_seat : null,
    matchId: typeof record.match_id === "string" ? record.match_id : null,
    seats,
    serverTime: String(record.server_time),
    ...(typeof record.started === "boolean" ? { started: record.started } : {}),
  };
}

export type RoomCreated = { roomId: string; inviteCode: string; joinPath: string };

export function readRoomCreated(raw: unknown): RoomCreated {
  const record = asObject(raw, "room-created");
  assertNoForbiddenKeys(record);
  requireExactKeys(record, ["schema_version", "room_id", "invite_code", "join_path"], [], "room-created");
  return {
    roomId: String(record.room_id),
    inviteCode: String(record.invite_code),
    joinPath: String(record.join_path),
  };
}

export type RoomJoined = { roomId: string; seat: "p1" | "p2"; idempotent: boolean };

export function readRoomJoined(raw: unknown): RoomJoined {
  const record = asObject(raw, "room-joined");
  assertNoForbiddenKeys(record);
  requireExactKeys(record, ["schema_version", "room_id", "seat", "idempotent"], [], "room-joined");
  if (record.seat !== "p1" && record.seat !== "p2") throw new StatCheckContractError("room-joined: bad seat");
  return { roomId: String(record.room_id), seat: record.seat, idempotent: record.idempotent === true };
}

export type ActiveRoomView = { roomId: string | null; status: string | null; matchId: string | null };

export function readActiveRoom(raw: unknown): ActiveRoomView {
  const record = asObject(raw, "active-room");
  assertNoForbiddenKeys(record);
  requireExactKeys(record, ["schema_version", "room_id", "status", "match_id"], [], "active-room");
  return {
    roomId: typeof record.room_id === "string" ? record.room_id : null,
    status: typeof record.status === "string" ? record.status : null,
    matchId: typeof record.match_id === "string" ? record.match_id : null,
  };
}
