import { describe, expect, it } from "vitest";
import {
  ROOM_SCHEMA_VERSION,
  StatCheckContractError,
  assertNoForbiddenKeys,
  readActiveRoom,
  readRoomCreated,
  readRoomJoined,
  readRoomView,
} from "./contracts";

const seat = (overrides: Record<string, unknown> = {}) => ({
  seat: "p1",
  ready: false,
  is_self: true,
  display_name: "You",
  ...overrides,
});

const room = (overrides: Record<string, unknown> = {}) => ({
  schema_version: ROOM_SCHEMA_VERSION,
  room_id: "scr_1",
  status: "open",
  invite_code: "ABCD2345",
  created_by_you: true,
  your_seat: "p1",
  match_id: null,
  seats: [seat()],
  server_time: "2026-07-25T12:00:00+00:00",
  ...overrides,
});

describe("stat-check online contracts", () => {
  it("reads a valid room view", () => {
    const view = readRoomView(room());
    expect(view.roomId).toBe("scr_1");
    expect(view.inviteCode).toBe("ABCD2345");
    expect(view.seats[0].isSelf).toBe(true);
  });

  it("fails closed on any unexpected key", () => {
    expect(() => readRoomView(room({ extra_field: 1 }))).toThrow(StatCheckContractError);
    expect(() => readRoomView(room({ seats: [seat({ hand: [] })] }))).toThrow(StatCheckContractError);
  });

  it("rejects forbidden hidden-information keys anywhere in a payload", () => {
    for (const key of ["seed", "draw_pile", "next_categories", "user_id", "opponent_hand", "opponent_inventory"]) {
      expect(() => readRoomView(room({ [key]: "x" })), key).toThrow(StatCheckContractError);
      expect(() => assertNoForbiddenKeys({ nested: [{ deep: { [key]: 1 } }] }), key).toThrow(
        StatCheckContractError,
      );
    }
  });

  it("rejects schema-version and status mismatches", () => {
    expect(() => readRoomView(room({ schema_version: "stat_check.room.v0" }))).toThrow(StatCheckContractError);
    expect(() => readRoomView(room({ status: "weird" }))).toThrow(StatCheckContractError);
    expect(() => readRoomView(room({ seats: [seat(), seat(), seat()] }))).toThrow(StatCheckContractError);
  });

  it("reads created/joined/active-room payloads strictly", () => {
    expect(
      readRoomCreated({
        schema_version: ROOM_SCHEMA_VERSION,
        room_id: "scr_2",
        invite_code: "XYZ23456",
        join_path: "/quiz/stat-check/room/XYZ23456",
      }).joinPath,
    ).toContain("/quiz/stat-check/room/");
    expect(() =>
      readRoomCreated({ schema_version: ROOM_SCHEMA_VERSION, room_id: "scr_2", invite_code: "A", join_path: "p", seed: "s" }),
    ).toThrow(StatCheckContractError);
    expect(
      readRoomJoined({ schema_version: ROOM_SCHEMA_VERSION, room_id: "scr_2", seat: "p2", idempotent: true }).idempotent,
    ).toBe(true);
    expect(
      readActiveRoom({ schema_version: ROOM_SCHEMA_VERSION, room_id: null, status: null, match_id: null }).roomId,
    ).toBeNull();
  });
});
