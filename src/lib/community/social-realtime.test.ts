/**
 * COM1-2B — the social realtime channel.
 *
 * What matters here is not that a subscription exists but WHICH one:
 *
 *   * the tables and filters must be the ones RLS already scopes to the caller,
 *     because realtime authorises frames with those same policies,
 *   * a repeated mount must SHARE one topic (this is mounted from Layout, which
 *     remounts on every shell change),
 *   * an account switch and a logout must tear the old topic down,
 *   * a frame must invalidate, never carry, relationship state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: { new?: Record<string, unknown> }) => void;

const mocks = vi.hoisted(() => ({
  /** Every `.on()` registration, in order, per channel name. */
  registrations: [] as { channel: string; config: Record<string, unknown>; handler: Handler }[],
  created: [] as string[],
  removed: [] as string[],
  notified: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel(name: string) {
      mocks.created.push(name);
      const api = {
        on(_event: string, config: Record<string, unknown>, handler: Handler) {
          mocks.registrations.push({ channel: name, config, handler });
          return api;
        },
        subscribe() {
          return api;
        },
        __name: name,
      };
      return api;
    },
    removeChannel(channel: { __name: string }) {
      mocks.removed.push(channel.__name);
      return Promise.resolve("ok");
    },
  },
}));

vi.mock("@/lib/community/friends-refresh", () => ({
  notifyFriendsChanged: () => {
    mocks.notified += 1;
    return Promise.resolve();
  },
}));

import {
  openSocialChannelCount,
  socialChannelName,
  startSocialRealtime,
} from "./social-realtime";

const ME = "profile-me";

const configsFor = (name: string) =>
  mocks.registrations.filter((r) => r.channel === name).map((r) => r.config);

beforeEach(() => {
  mocks.registrations = [];
  mocks.created = [];
  mocks.removed = [];
  mocks.notified = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("social realtime subscription shape", () => {
  it("subscribes to exactly the tables RLS scopes to the caller", () => {
    const stop = startSocialRealtime(ME);
    const configs = configsFor(socialChannelName(ME));

    expect(configs).toEqual([
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `requester_id=eq.${ME}`,
      },
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `addressee_id=eq.${ME}`,
      },
      {
        event: "*",
        schema: "public",
        table: "user_blocks",
        filter: `blocker_profile_id=eq.${ME}`,
      },
      {
        event: "INSERT",
        schema: "public",
        table: "user_notifications",
        filter: `profile_id=eq.${ME}`,
      },
    ]);
    stop();
  });

  it("watches friendships for BOTH sides — one filter per listener, never an OR", () => {
    const stop = startSocialRealtime(ME);
    const friendship = configsFor(socialChannelName(ME)).filter(
      (c) => c.table === "friendships",
    );
    // Two listeners is the point: postgres_changes takes one filter each, so a
    // single "requester OR addressee" subscription is not expressible. Dropping
    // either one silently half-breaks sync for one party.
    expect(friendship).toHaveLength(2);
    stop();
  });

  it("covers deletes, not only inserts — unfriend/decline/cancel/block are DELETEs", () => {
    const stop = startSocialRealtime(ME);
    const relational = configsFor(socialChannelName(ME)).filter(
      (c) => c.table === "friendships" || c.table === "user_blocks",
    );
    expect(relational.every((c) => c.event === "*")).toBe(true);
    stop();
  });

  it("never subscribes to blocks another user created — that would disclose being blocked", () => {
    const stop = startSocialRealtime(ME);
    const blocks = configsFor(socialChannelName(ME)).filter((c) => c.table === "user_blocks");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].filter).toBe(`blocker_profile_id=eq.${ME}`);
    stop();
  });
});

describe("frames are signals, not state", () => {
  const fire = (table: string, payload: { new?: Record<string, unknown> } = {}) => {
    mocks.registrations
      .filter((r) => (r.config as { table: string }).table === table)
      .forEach((r) => r.handler(payload));
  };

  it("turns any friendship or block frame into one canonical re-read", () => {
    const stop = startSocialRealtime(ME);
    fire("friendships", { new: { id: "f1", status: "accepted" } });
    // Two friendship listeners, so one row that matched both would notify twice
    // — invalidation is idempotent, which is exactly why the payload is unused.
    expect(mocks.notified).toBe(2);

    mocks.notified = 0;
    fire("user_blocks", { new: { id: "b1" } });
    expect(mocks.notified).toBe(1);
    stop();
  });

  it("re-reads for a social notification and ignores every other type", () => {
    const stop = startSocialRealtime(ME);

    fire("user_notifications", { new: { type: "friend_accepted" } });
    expect(mocks.notified).toBe(1);

    fire("user_notifications", { new: { type: "friend_request" } });
    expect(mocks.notified).toBe(2);

    // An admin announcement changes no relationship and must not trigger a
    // friends re-read.
    fire("user_notifications", { new: { type: "general" } });
    fire("user_notifications", { new: {} });
    expect(mocks.notified).toBe(2);
    stop();
  });
});

describe("channel lifecycle", () => {
  it("shares ONE topic across repeated mounts and frees it on the last release", () => {
    const a = startSocialRealtime(ME);
    const b = startSocialRealtime(ME);
    expect(mocks.created).toEqual([socialChannelName(ME)]);
    expect(openSocialChannelCount()).toBe(1);

    a();
    expect(mocks.removed).toEqual([]);
    expect(openSocialChannelCount()).toBe(1);

    b();
    expect(mocks.removed).toEqual([socialChannelName(ME)]);
    expect(openSocialChannelCount()).toBe(0);
  });

  it("is idempotent on release — a double cleanup cannot free a live channel", () => {
    const a = startSocialRealtime(ME);
    const b = startSocialRealtime(ME);
    a();
    a();
    a();
    expect(mocks.removed).toEqual([]);
    b();
    expect(mocks.removed).toEqual([socialChannelName(ME)]);
  });

  it("keys on the profile, so an account switch never reuses the old topic", () => {
    const first = startSocialRealtime(ME);
    const second = startSocialRealtime("profile-other");
    expect(mocks.created).toEqual([socialChannelName(ME), socialChannelName("profile-other")]);

    first();
    expect(mocks.removed).toEqual([socialChannelName(ME)]);
    second();
    expect(mocks.removed).toEqual([
      socialChannelName(ME),
      socialChannelName("profile-other"),
    ]);
    expect(openSocialChannelCount()).toBe(0);
  });

  it("opens nothing without a profile id (guests have no social state)", () => {
    const stop = startSocialRealtime("");
    expect(mocks.created).toEqual([]);
    expect(openSocialChannelCount()).toBe(0);
    stop();
  });
});
