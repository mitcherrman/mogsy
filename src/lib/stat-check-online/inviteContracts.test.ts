import { describe, expect, it } from "vitest";
import {
  ROOM_SCHEMA_VERSION,
  StatCheckContractError,
  readInviteAccepted,
  readInviteCreated,
  readInviteInbox,
  readInviteResolved,
} from "./contracts";

const created = (overrides: Record<string, unknown> = {}) => ({
  schema_version: ROOM_SCHEMA_VERSION,
  invite_token: "tok_abc",
  room_id: "scr_1",
  invite_code: "ABCD2345",
  expires_at: "2026-08-02T12:15:00+00:00",
  reused: false,
  join_path: "/quiz/stat-check/room/ABCD2345",
  ...overrides,
});

const inboxItem = (overrides: Record<string, unknown> = {}) => ({
  invite_token: "tok_abc",
  sender_profile_id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-08-02T12:00:00+00:00",
  expires_at: "2026-08-02T12:15:00+00:00",
  ...overrides,
});

const inbox = (overrides: Record<string, unknown> = {}) => ({
  schema_version: ROOM_SCHEMA_VERSION,
  invites: [inboxItem()],
  server_time: "2026-08-02T12:01:00+00:00",
  ...overrides,
});

const accepted = (overrides: Record<string, unknown> = {}) => ({
  schema_version: ROOM_SCHEMA_VERSION,
  room_id: "scr_1",
  invite_code: "ABCD2345",
  seat: "p2",
  join_path: "/quiz/stat-check/room/ABCD2345",
  ...overrides,
});

describe("stat-check friend invite contracts", () => {
  it("reads a create response for the sender", () => {
    const view = readInviteCreated(created());
    expect(view.inviteToken).toBe("tok_abc");
    expect(view.inviteCode).toBe("ABCD2345");
    expect(view.joinPath).toBe("/quiz/stat-check/room/ABCD2345");
    expect(view.reused).toBe(false);
  });

  it("reads an inbox listing", () => {
    const view = readInviteInbox(inbox());
    expect(view.invites).toHaveLength(1);
    expect(view.invites[0].senderProfileId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("accepts an empty inbox", () => {
    expect(readInviteInbox(inbox({ invites: [] })).invites).toEqual([]);
  });

  it("REJECTS an inbox entry that leaks a room code", () => {
    // The whole point of the token indirection: a recipient must not receive a
    // joinable room code before the server has authorized them.
    expect(() => readInviteInbox(inbox({ invites: [inboxItem({ invite_code: "ABCD2345" })] })))
      .toThrow(StatCheckContractError);
  });

  it("REJECTS any payload carrying a user_id", () => {
    expect(() => readInviteCreated(created({ user_id: "userA" }))).toThrow(StatCheckContractError);
    expect(() => readInviteInbox(inbox({ invites: [inboxItem({ user_id: "userB" })] })))
      .toThrow(StatCheckContractError);
    expect(() => readInviteAccepted(accepted({ user_id: "userB" }))).toThrow(StatCheckContractError);
  });

  it("fails closed on any unexpected key", () => {
    expect(() => readInviteCreated(created({ extra: 1 }))).toThrow(StatCheckContractError);
    expect(() => readInviteInbox(inbox({ extra: 1 }))).toThrow(StatCheckContractError);
    expect(() => readInviteAccepted(accepted({ extra: 1 }))).toThrow(StatCheckContractError);
  });

  it("fails closed on a missing key", () => {
    const { invite_code, ...withoutCode } = created();
    expect(() => readInviteCreated(withoutCode)).toThrow(StatCheckContractError);
  });

  it("fails closed on a schema mismatch", () => {
    expect(() => readInviteCreated(created({ schema_version: "stat_check.room.v2" })))
      .toThrow(StatCheckContractError);
    expect(() => readInviteInbox(inbox({ schema_version: "nope" }))).toThrow(StatCheckContractError);
    expect(() => readInviteAccepted(accepted({ schema_version: "nope" })))
      .toThrow(StatCheckContractError);
  });

  it("reads an accept response including the room code", () => {
    const view = readInviteAccepted(accepted());
    expect(view.inviteCode).toBe("ABCD2345");
    expect(view.seat).toBe("p2");
  });

  it("rejects a bad seat", () => {
    expect(() => readInviteAccepted(accepted({ seat: "p3" }))).toThrow(StatCheckContractError);
  });

  it("reads a decline/cancel response", () => {
    const view = readInviteResolved({
      schema_version: ROOM_SCHEMA_VERSION,
      invite_token: "tok_abc",
      status: "declined",
    });
    expect(view.status).toBe("declined");
  });

  it("rejects non-objects and arrays", () => {
    expect(() => readInviteInbox(null)).toThrow(StatCheckContractError);
    expect(() => readInviteInbox([])).toThrow(StatCheckContractError);
    expect(() => readInviteInbox(inbox({ invites: "nope" }))).toThrow(StatCheckContractError);
  });
});
