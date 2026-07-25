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

// --------------------------------------------------------------- matches

export const MATCH_PUBLIC_SCHEMA_VERSION = "stat_check.match_public.v1";
export const MATCH_PRIVATE_SCHEMA_VERSION = "stat_check.match_private.v1";
export const RESUME_SCHEMA_VERSION = "stat_check.resume.v1";

export type OnlineSeat = "p1" | "p2";

export type MatchSeatPublicView = {
  seat: OnlineSeat;
  hp: number;
  handCount: number;
  discardCardIds: string[];
  chosen: boolean;
  locked: boolean;
};

export type SeatPresenceView = { connected: boolean; reconnectDeadline: string | null };

export type MatchPublicView = {
  matchId: string;
  roomId: string;
  status: "active" | "complete";
  phase: "item-choice-opening" | "item-choice" | "selecting" | "resolved" | "match-over";
  round: number;
  completedRounds: number;
  itemChoicesCompleted: number;
  boardCategoryIds: string[];
  hintFamily: string | null;
  drawPileCount: number;
  seats: Record<OnlineSeat, MatchSeatPublicView>;
  presence: Partial<Record<OnlineSeat, SeatPresenceView>>;
  outcome: OnlineSeat | "draw" | null;
  endReason: string | null;
  latestResolvedRound: number | null;
  serverTime: string;
};

export type OnlineCard = { id: string; name: string; stats: Record<string, number> };

export type MatchPrivateView = {
  matchId: string;
  yourSeat: OnlineSeat;
  hand: OnlineCard[];
  inventory: Record<string, number>;
  pendingItemChoice: string | null;
  pendingLock: { assignments: Record<string, string>; equipped: { category_id: string; item_id: string } | null } | null;
};

export type ResolvedLaneView = {
  categoryId: string;
  p1Card: OnlineCard;
  p2Card: OnlineCard;
  p1Natural: number;
  p2Natural: number;
  p1Item: string | null;
  p2Item: string | null;
  p1Bonus: number;
  p2Bonus: number;
  p1Final: number;
  p2Final: number;
  winner: OnlineSeat | "tie";
  margin: number;
  decisive: boolean;
};

export type ResolvedRoundView = {
  roundNumber: number;
  boardCategoryIds: string[];
  hintFamily: string | null;
  results: ResolvedLaneView[];
  damage: {
    p1Dealt: number;
    p2Dealt: number;
    boardWinner: OnlineSeat | "tie";
    p1CategoryWins: number;
    p2CategoryWins: number;
    p1DecisiveDamage: number;
    p2DecisiveDamage: number;
  };
  p1HpBefore: number;
  p2HpBefore: number;
  p1HpAfter: number;
  p2HpAfter: number;
};

export type MatchResultView = {
  outcome: OnlineSeat | "draw";
  endReason: string | null;
  roundsPlayed: number;
  p1Hp: number;
  p2Hp: number;
  terminalReason: string;
};

export type ResumeView = {
  publicView: MatchPublicView;
  privateView: MatchPrivateView;
  latestResolved: ResolvedRoundView | null;
  result: MatchResultView | null;
};

const readCard = (raw: unknown, label: string): OnlineCard => {
  const record = asObject(raw, label);
  requireExactKeys(record, ["id", "name", "stats"], [], label);
  const stats = asObject(record.stats, `${label}.stats`);
  const numeric: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new StatCheckContractError(`${label}.stats.${key}: not a finite number`);
    }
    numeric[key] = value;
  }
  return { id: String(record.id), name: String(record.name), stats: numeric };
};

const readSeatId = (raw: unknown, label: string): OnlineSeat => {
  if (raw !== "p1" && raw !== "p2") throw new StatCheckContractError(`${label}: bad seat`);
  return raw;
};

export function readMatchPublic(raw: unknown): MatchPublicView {
  const record = asObject(raw, "match-public");
  assertNoForbiddenKeys(record);
  requireExactKeys(
    record,
    [
      "schema_version", "match_id", "room_id", "status", "phase", "round",
      "completed_rounds", "item_choices_completed", "board_category_ids",
      "hint_family", "draw_pile_count", "seats", "outcome", "end_reason",
      "latest_resolved_round", "presence", "server_time",
    ],
    [],
    "match-public",
  );
  if (record.schema_version !== MATCH_PUBLIC_SCHEMA_VERSION) {
    throw new StatCheckContractError("match-public: schema mismatch");
  }
  const phase = record.phase;
  if (
    phase !== "item-choice-opening" && phase !== "item-choice" &&
    phase !== "selecting" && phase !== "resolved" && phase !== "match-over"
  ) {
    throw new StatCheckContractError(`match-public: bad phase ${String(phase)}`);
  }
  // During the opening item choice the board MUST be concealed.
  const boardIds = record.board_category_ids;
  if (!Array.isArray(boardIds) || boardIds.some((id) => typeof id !== "string")) {
    throw new StatCheckContractError("match-public: bad board ids");
  }
  if (phase === "item-choice-opening" && boardIds.length !== 0) {
    throw new StatCheckContractError("match-public: opening choice leaked the board");
  }
  const seatsRaw = record.seats;
  if (!Array.isArray(seatsRaw) || seatsRaw.length !== 2) {
    throw new StatCheckContractError("match-public: bad seats");
  }
  const seats = {} as Record<OnlineSeat, MatchSeatPublicView>;
  for (const entry of seatsRaw) {
    const seatRecord = asObject(entry, "match-public.seat");
    requireExactKeys(
      seatRecord,
      ["seat", "hp", "hand_count", "discard_card_ids", "chosen", "locked"],
      [],
      "match-public.seat",
    );
    const seat = readSeatId(seatRecord.seat, "match-public.seat");
    seats[seat] = {
      seat,
      hp: Number(seatRecord.hp),
      handCount: Number(seatRecord.hand_count),
      discardCardIds: (seatRecord.discard_card_ids as unknown[]).map(String),
      chosen: seatRecord.chosen === true,
      locked: seatRecord.locked === true,
    };
  }
  if (!seats.p1 || !seats.p2) throw new StatCheckContractError("match-public: missing seat");
  const presenceRaw = asObject(record.presence ?? {}, "match-public.presence");
  const presence: Partial<Record<OnlineSeat, SeatPresenceView>> = {};
  for (const [seatId, entry] of Object.entries(presenceRaw)) {
    if (seatId !== "p1" && seatId !== "p2") throw new StatCheckContractError("match-public: bad presence seat");
    const presenceRecord = asObject(entry, "match-public.presence.seat");
    requireExactKeys(presenceRecord, ["connected", "reconnect_deadline"], [], "match-public.presence.seat");
    presence[seatId] = {
      connected: presenceRecord.connected === true,
      reconnectDeadline:
        typeof presenceRecord.reconnect_deadline === "string" ? presenceRecord.reconnect_deadline : null,
    };
  }
  return {
    matchId: String(record.match_id),
    roomId: String(record.room_id),
    status: record.status === "complete" ? "complete" : "active",
    phase,
    round: Number(record.round),
    completedRounds: Number(record.completed_rounds),
    itemChoicesCompleted: Number(record.item_choices_completed),
    boardCategoryIds: boardIds as string[],
    hintFamily: typeof record.hint_family === "string" ? record.hint_family : null,
    drawPileCount: Number(record.draw_pile_count),
    seats,
    presence,
    outcome:
      record.outcome === "p1" || record.outcome === "p2" || record.outcome === "draw"
        ? record.outcome
        : null,
    endReason: typeof record.end_reason === "string" ? record.end_reason : null,
    latestResolvedRound: typeof record.latest_resolved_round === "number" ? record.latest_resolved_round : null,
    serverTime: String(record.server_time),
  };
}

export function readMatchPrivate(raw: unknown): MatchPrivateView {
  const record = asObject(raw, "match-private");
  // Own data is allowed here; still no seed/draw-pile/future boards.
  requireExactKeys(
    record,
    ["schema_version", "match_id", "your_seat", "hand", "inventory", "pending_item_choice", "pending_lock"],
    [],
    "match-private",
  );
  if (record.schema_version !== MATCH_PRIVATE_SCHEMA_VERSION) {
    throw new StatCheckContractError("match-private: schema mismatch");
  }
  const handRaw = record.hand;
  if (!Array.isArray(handRaw) || handRaw.length > 6) throw new StatCheckContractError("match-private: bad hand");
  const inventoryRaw = asObject(record.inventory, "match-private.inventory");
  const inventory: Record<string, number> = {};
  for (const [key, value] of Object.entries(inventoryRaw)) {
    if (typeof value !== "number") throw new StatCheckContractError("match-private: bad inventory");
    inventory[key] = value;
  }
  let pendingLock: MatchPrivateView["pendingLock"] = null;
  if (record.pending_lock !== null && record.pending_lock !== undefined) {
    const lockRecord = asObject(record.pending_lock, "match-private.pending_lock");
    requireExactKeys(lockRecord, ["assignments", "equipped"], [], "match-private.pending_lock");
    const assignmentsRaw = asObject(lockRecord.assignments, "match-private.pending_lock.assignments");
    const assignments: Record<string, string> = {};
    for (const [key, value] of Object.entries(assignmentsRaw)) assignments[key] = String(value);
    let equipped: { category_id: string; item_id: string } | null = null;
    if (lockRecord.equipped !== null && lockRecord.equipped !== undefined) {
      const equippedRecord = asObject(lockRecord.equipped, "match-private.pending_lock.equipped");
      requireExactKeys(equippedRecord, ["category_id", "item_id"], [], "match-private.pending_lock.equipped");
      equipped = { category_id: String(equippedRecord.category_id), item_id: String(equippedRecord.item_id) };
    }
    pendingLock = { assignments, equipped };
  }
  return {
    matchId: String(record.match_id),
    yourSeat: readSeatId(record.your_seat, "match-private"),
    hand: handRaw.map((card, index) => readCard(card, `match-private.hand[${index}]`)),
    inventory,
    pendingItemChoice: typeof record.pending_item_choice === "string" ? record.pending_item_choice : null,
    pendingLock,
  };
}

export function readResolvedRound(raw: unknown): ResolvedRoundView {
  const record = asObject(raw, "resolved");
  assertNoForbiddenKeys(record);
  requireExactKeys(
    record,
    [
      "round_number", "board_category_ids", "hint_family", "results", "damage",
      "p1_hp_before", "p2_hp_before", "p1_hp_after", "p2_hp_after",
    ],
    [],
    "resolved",
  );
  const resultsRaw = record.results;
  if (!Array.isArray(resultsRaw) || resultsRaw.length !== 3) {
    throw new StatCheckContractError("resolved: bad results");
  }
  const results = resultsRaw.map((entry, index): ResolvedLaneView => {
    const lane = asObject(entry, `resolved.results[${index}]`);
    requireExactKeys(
      lane,
      [
        "category_id", "p1_card", "p2_card", "p1_natural", "p2_natural",
        "p1_item", "p2_item", "p1_bonus", "p2_bonus", "p1_final", "p2_final",
        "winner", "margin", "decisive",
      ],
      [],
      `resolved.results[${index}]`,
    );
    const winner = lane.winner;
    if (winner !== "p1" && winner !== "p2" && winner !== "tie") {
      throw new StatCheckContractError("resolved: bad winner");
    }
    return {
      categoryId: String(lane.category_id),
      p1Card: readCard(lane.p1_card, "resolved.p1_card"),
      p2Card: readCard(lane.p2_card, "resolved.p2_card"),
      p1Natural: Number(lane.p1_natural),
      p2Natural: Number(lane.p2_natural),
      p1Item: typeof lane.p1_item === "string" ? lane.p1_item : null,
      p2Item: typeof lane.p2_item === "string" ? lane.p2_item : null,
      p1Bonus: Number(lane.p1_bonus),
      p2Bonus: Number(lane.p2_bonus),
      p1Final: Number(lane.p1_final),
      p2Final: Number(lane.p2_final),
      winner,
      margin: Number(lane.margin),
      decisive: lane.decisive === true,
    };
  });
  const damageRecord = asObject(record.damage, "resolved.damage");
  requireExactKeys(
    damageRecord,
    [
      "p1_dealt", "p2_dealt", "board_winner", "p1_category_wins", "p2_category_wins",
      "p1_decisive_damage", "p2_decisive_damage",
    ],
    [],
    "resolved.damage",
  );
  const boardWinner = damageRecord.board_winner;
  if (boardWinner !== "p1" && boardWinner !== "p2" && boardWinner !== "tie") {
    throw new StatCheckContractError("resolved: bad board winner");
  }
  return {
    roundNumber: Number(record.round_number),
    boardCategoryIds: (record.board_category_ids as unknown[]).map(String),
    hintFamily: typeof record.hint_family === "string" ? record.hint_family : null,
    results,
    damage: {
      p1Dealt: Number(damageRecord.p1_dealt),
      p2Dealt: Number(damageRecord.p2_dealt),
      boardWinner,
      p1CategoryWins: Number(damageRecord.p1_category_wins),
      p2CategoryWins: Number(damageRecord.p2_category_wins),
      p1DecisiveDamage: Number(damageRecord.p1_decisive_damage),
      p2DecisiveDamage: Number(damageRecord.p2_decisive_damage),
    },
    p1HpBefore: Number(record.p1_hp_before),
    p2HpBefore: Number(record.p2_hp_before),
    p1HpAfter: Number(record.p1_hp_after),
    p2HpAfter: Number(record.p2_hp_after),
  };
}

export function readMatchResult(raw: unknown): MatchResultView {
  const record = asObject(raw, "result");
  assertNoForbiddenKeys(record);
  requireExactKeys(
    record,
    ["outcome", "end_reason", "rounds_played", "p1_hp", "p2_hp", "terminal_reason"],
    [],
    "result",
  );
  const outcome = record.outcome;
  if (outcome !== "p1" && outcome !== "p2" && outcome !== "draw") {
    throw new StatCheckContractError("result: bad outcome");
  }
  return {
    outcome,
    endReason: typeof record.end_reason === "string" ? record.end_reason : null,
    roundsPlayed: Number(record.rounds_played),
    p1Hp: Number(record.p1_hp),
    p2Hp: Number(record.p2_hp),
    terminalReason: String(record.terminal_reason),
  };
}

export function readResume(raw: unknown): ResumeView {
  const record = asObject(raw, "resume");
  requireExactKeys(
    record,
    ["schema_version", "public", "private", "latest_resolved", "result", "server_time"],
    [],
    "resume",
  );
  if (record.schema_version !== RESUME_SCHEMA_VERSION) {
    throw new StatCheckContractError("resume: schema mismatch");
  }
  return {
    publicView: readMatchPublic(record.public),
    privateView: readMatchPrivate(record.private),
    latestResolved:
      record.latest_resolved === null || record.latest_resolved === undefined
        ? null
        : readResolvedRound(record.latest_resolved),
    result:
      record.result === null || record.result === undefined ? null : readMatchResult(record.result),
  };
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
