/**
 * Admin user directory — data contract, projection, filtering and RPC clients.
 *
 * The projection tests are the security-critical ones: `admin_list_profiles()`
 * returns every column of `public.profiles`, so the guarantee that no auth id
 * and no legacy dating field can reach a component lives in `toDirectoryProfile`
 * and is asserted here rather than in a render test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import {
  DEFAULT_DIRECTORY_FILTER,
  DIRECTORY_FILTERS,
  DIRECTORY_PAGE_SIZE,
  LINK_FRIENDSHIP_MESSAGES,
  cappedSlice,
  formatDirectoryCount,
  adminCreateBotProfile,
  adminLinkFriendship,
  adminUpdateBotProfile,
  applyDirectoryView,
  fetchAdminDirectory,
  matchesFilter,
  matchesSearch,
  profileHref,
  sortByNewest,
  toDirectoryProfile,
  type AdminDirectoryProfile,
} from "./admin-users";

/** A full `profiles` row as admin_list_profiles() actually returns it. */
const RAW_ROW = {
  id: "profile-1",
  user_id: "11111111-2222-3333-4444-555555555555",
  display_name: "Nova",
  avatar_url: "https://example.test/a.png",
  profile_frame: "gold",
  created_at: "2026-08-01T00:00:00Z",
  last_seen_at: "2026-08-02T00:00:00Z",
  is_pro: true,
  is_bot: false,
  is_disabled: false,
  is_anonymous: false,
  onboarding_completed: true,
  // Everything below must NOT survive the projection.
  admin_notes: "internal note",
  is_flagged_underage: true,
  age: 29,
  location: "Berlin, DE",
  status_message: "Living my best life",
  socials: { x: "@nova" },
  custom_theme: "midnight",
  preferred_categories: ["a"],
  swipe_animation: "flip",
  elocheck_animation: "zoom",
  diamonds: 500,
  boost_credits: 3,
  elo_shields: 1,
  reveals: 2,
  rewinds: 4,
  active_boost_until: "2026-09-01T00:00:00Z",
  ads_enabled: true,
};

function profile(over: Partial<AdminDirectoryProfile> = {}): AdminDirectoryProfile {
  return {
    id: "p",
    displayName: "Someone",
    avatarUrl: null,
    profileFrame: null,
    createdAt: "2026-01-01T00:00:00Z",
    lastSeenAt: null,
    isPro: false,
    isBot: false,
    isDisabled: false,
    isAnonymous: false,
    onboardingCompleted: false,
    roles: [],
    ...over,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("toDirectoryProfile", () => {
  it("keeps exactly the safe fields and nothing else", () => {
    const out = toDirectoryProfile(RAW_ROW);
    expect(Object.keys(out).sort()).toEqual(
      [
        "avatarUrl",
        "createdAt",
        "displayName",
        "id",
        "isAnonymous",
        "isBot",
        "isDisabled",
        "isPro",
        "lastSeenAt",
        "onboardingCompleted",
        "profileFrame",
        "roles",
      ].sort(),
    );
  });

  it("never carries the auth user id, in any casing", () => {
    const out = toDirectoryProfile(RAW_ROW) as Record<string, unknown>;
    expect(out.user_id).toBeUndefined();
    expect(out.userId).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain(RAW_ROW.user_id);
  });

  it.each([
    "admin_notes",
    "is_flagged_underage",
    "age",
    "location",
    "status_message",
    "socials",
    "custom_theme",
    "diamonds",
    "boost_credits",
    "elo_shields",
    "reveals",
    "rewinds",
    "ads_enabled",
  ])("drops the legacy/private field %s", (field) => {
    const out = toDirectoryProfile(RAW_ROW) as Record<string, unknown>;
    expect(out[field]).toBeUndefined();
  });

  it("does not leak private values anywhere in the serialized output", () => {
    const json = JSON.stringify(toDirectoryProfile(RAW_ROW));
    for (const secret of ["internal note", "Berlin, DE", "Living my best life", "@nova"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("coerces missing booleans to false rather than undefined", () => {
    const out = toDirectoryProfile({ id: "x" });
    expect(out.isPro).toBe(false);
    expect(out.isBot).toBe(false);
    expect(out.isDisabled).toBe(false);
    expect(out.isAnonymous).toBe(false);
    expect(out.onboardingCompleted).toBe(false);
    expect(out.displayName).toBeNull();
  });
});

describe("filters", () => {
  const real = profile({ id: "real" });
  const anon = profile({ id: "anon", isAnonymous: true });
  const bot = profile({ id: "bot", isBot: true });
  const offBot = profile({ id: "offbot", isBot: true, isDisabled: true });
  const pro = profile({ id: "pro", isPro: true });
  const admin = profile({ id: "admin", roles: ["master_admin"] });
  const all = [real, anon, bot, offBot, pro, admin];

  it("exposes every documented filter, with the default first", () => {
    expect([...DIRECTORY_FILTERS]).toEqual([
      "real",
      "all",
      "anonymous",
      "bots",
      "disabled-bots",
      "pro",
      "admins",
    ]);
  });

  it("defaults to real users", () => {
    expect(DEFAULT_DIRECTORY_FILTER).toBe("real");
    expect(DIRECTORY_FILTERS).toContain(DEFAULT_DIRECTORY_FILTER);
  });

  it("the default filter excludes both anonymous accounts and bots", () => {
    expect(matchesFilter(profile({ isAnonymous: true }), DEFAULT_DIRECTORY_FILTER)).toBe(false);
    expect(matchesFilter(profile({ isBot: true }), DEFAULT_DIRECTORY_FILTER)).toBe(false);
    expect(
      matchesFilter(profile({ isBot: true, isDisabled: true }), DEFAULT_DIRECTORY_FILTER),
    ).toBe(false);
    expect(matchesFilter(profile({}), DEFAULT_DIRECTORY_FILTER)).toBe(true);
  });

  it("every population remains reachable through an explicit filter", () => {
    const anon = profile({ id: "a", isAnonymous: true });
    const bot = profile({ id: "b", isBot: true });
    const off = profile({ id: "c", isBot: true, isDisabled: true });
    expect(matchesFilter(anon, "anonymous")).toBe(true);
    expect(matchesFilter(bot, "bots")).toBe(true);
    expect(matchesFilter(off, "disabled-bots")).toBe(true);
    for (const p of [anon, bot, off]) expect(matchesFilter(p, "all")).toBe(true);
  });

  it("'all' keeps everything", () => {
    expect(all.filter((p) => matchesFilter(p, "all"))).toHaveLength(6);
  });

  it("'real' excludes bots and anonymous accounts", () => {
    const ids = all.filter((p) => matchesFilter(p, "real")).map((p) => p.id);
    expect(ids).toEqual(["real", "pro", "admin"]);
  });

  it("'anonymous' selects only anonymous accounts", () => {
    expect(all.filter((p) => matchesFilter(p, "anonymous")).map((p) => p.id)).toEqual(["anon"]);
  });

  it("'bots' includes disabled bots, so a retired bot is never invisible", () => {
    expect(all.filter((p) => matchesFilter(p, "bots")).map((p) => p.id)).toEqual(["bot", "offbot"]);
  });

  it("'disabled-bots' narrows to retired bots only", () => {
    expect(all.filter((p) => matchesFilter(p, "disabled-bots")).map((p) => p.id)).toEqual([
      "offbot",
    ]);
  });

  it("'pro' selects Pro accounts", () => {
    expect(all.filter((p) => matchesFilter(p, "pro")).map((p) => p.id)).toEqual(["pro"]);
  });

  it("'admins' matches both admin and master_admin", () => {
    const plain = profile({ id: "plain-admin", roles: ["admin"] });
    const mod = profile({ id: "mod", roles: ["moderator"] });
    expect([...all, plain, mod].filter((p) => matchesFilter(p, "admins")).map((p) => p.id)).toEqual(
      ["admin", "plain-admin"],
    );
  });
});

describe("search", () => {
  it("matches display name case-insensitively", () => {
    expect(matchesSearch(profile({ displayName: "Nova" }), "nov")).toBe(true);
    expect(matchesSearch(profile({ displayName: "Nova" }), "zed")).toBe(false);
  });

  it("an empty or whitespace query matches everything", () => {
    expect(matchesSearch(profile({ displayName: "Nova" }), "   ")).toBe(true);
  });

  it("an unnamed profile does not throw and simply does not match", () => {
    expect(matchesSearch(profile({ displayName: null }), "a")).toBe(false);
  });
});

describe("sortByNewest", () => {
  it("orders newest account first", () => {
    const out = sortByNewest([
      profile({ id: "old", createdAt: "2026-01-01T00:00:00Z" }),
      profile({ id: "new", createdAt: "2026-08-01T00:00:00Z" }),
      profile({ id: "mid", createdAt: "2026-04-01T00:00:00Z" }),
    ]);
    expect(out.map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("sorts rows with no timestamp last instead of to the top", () => {
    const out = sortByNewest([
      profile({ id: "none", createdAt: null }),
      profile({ id: "dated", createdAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(out.map((p) => p.id)).toEqual(["dated", "none"]);
  });

  it("does not mutate its input", () => {
    const input = [
      profile({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      profile({ id: "b", createdAt: "2026-08-01T00:00:00Z" }),
    ];
    sortByNewest(input);
    expect(input.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("applyDirectoryView", () => {
  it("filters, searches and sorts together", () => {
    const out = applyDirectoryView(
      [
        profile({ id: "b1", displayName: "Bot Alpha", isBot: true, createdAt: "2026-01-01T00:00:00Z" }),
        profile({ id: "b2", displayName: "Bot Beta", isBot: true, createdAt: "2026-08-01T00:00:00Z" }),
        profile({ id: "h", displayName: "Bot Human Fan", createdAt: "2026-09-01T00:00:00Z" }),
      ],
      "bots",
      "bot",
    );
    expect(out.map((p) => p.id)).toEqual(["b2", "b1"]);
  });
});

describe("cappedSlice", () => {
  const list = [1, 2, 3, 4, 5];

  it("returns the first `cap` entries in order", () => {
    expect(cappedSlice(list, 3)).toEqual([1, 2, 3]);
  });

  it("is harmless when the cap exceeds the list", () => {
    expect(cappedSlice(list, 99)).toEqual(list);
  });

  it("returns nothing for a zero or negative cap", () => {
    expect(cappedSlice(list, 0)).toEqual([]);
    expect(cappedSlice(list, -5)).toEqual([]);
  });

  it("does not mutate its input", () => {
    cappedSlice(list, 2);
    expect(list).toEqual([1, 2, 3, 4, 5]);
  });

  it("caps AFTER sorting, so the newest rows are the ones kept", () => {
    const sorted = sortByNewest([
      profile({ id: "old", createdAt: "2026-01-01T00:00:00Z" }),
      profile({ id: "new", createdAt: "2026-08-01T00:00:00Z" }),
      profile({ id: "mid", createdAt: "2026-04-01T00:00:00Z" }),
    ]);
    expect(cappedSlice(sorted, 2).map((p) => p.id)).toEqual(["new", "mid"]);
  });
});

describe("formatDirectoryCount", () => {
  it("matches the requested wording when nothing is filtered out", () => {
    expect(formatDirectoryCount(100, 4791, 4791)).toBe("Showing 100 of 4,791 profiles");
  });

  it("says so when a filter or search narrowed the set", () => {
    expect(formatDirectoryCount(11, 11, 4791)).toBe(
      "Showing 11 of 11 profiles (filtered from 4,791)",
    );
  });

  it("reports the capped count, not the matched count, as `shown`", () => {
    expect(formatDirectoryCount(100, 187, 4791)).toBe(
      "Showing 100 of 187 profiles (filtered from 4,791)",
    );
  });

  it("singularises one profile", () => {
    expect(formatDirectoryCount(1, 1, 1)).toBe("Showing 1 of 1 profile");
  });

  it("handles an empty result", () => {
    expect(formatDirectoryCount(0, 0, 4791)).toBe("Showing 0 of 0 profiles (filtered from 4,791)");
  });
});

describe("DIRECTORY_PAGE_SIZE", () => {
  it("is a sane positive render increment", () => {
    expect(DIRECTORY_PAGE_SIZE).toBe(100);
  });
});

describe("profileHref", () => {
  it("links to /user/:profileId, not the non-existent /profile/:id route", () => {
    expect(profileHref({ id: "abc" })).toBe("/user/abc");
    expect(profileHref({ id: "abc" })).not.toContain("/profile/");
  });
});

describe("LINK_FRIENDSHIP_MESSAGES", () => {
  it("has a distinct message for every structured code", () => {
    const values = Object.values(LINK_FRIENDSHIP_MESSAGES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("covers every code the RPC can return", () => {
    expect(Object.keys(LINK_FRIENDSHIP_MESSAGES).sort()).toEqual(
      [
        "already_friends",
        "blocked",
        "created",
        "error",
        "no_actor_profile",
        "pending_exists",
        "self",
        "target_disabled",
        "target_not_found",
      ].sort(),
    );
  });
});

describe("fetchAdminDirectory", () => {
  beforeEach(() => {
    mocks.from.mockReturnValue({
      select: async () => ({
        data: [
          { user_id: RAW_ROW.user_id, role: "master_admin" },
          { user_id: RAW_ROW.user_id, role: "admin" },
        ],
        error: null,
      }),
    });
  });

  it("joins roles by auth id but never returns that id", async () => {
    mocks.rpc.mockResolvedValue({ data: [RAW_ROW], error: null });
    const out = await fetchAdminDirectory();
    expect(out).toHaveLength(1);
    expect(out[0].roles.sort()).toEqual(["admin", "master_admin"]);
    expect(JSON.stringify(out)).not.toContain(RAW_ROW.user_id);
  });

  it("propagates an RPC failure rather than rendering an empty directory", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Not authorized" } });
    await expect(fetchAdminDirectory()).rejects.toBeTruthy();
  });
});

describe("adminLinkFriendship", () => {
  it("sends only the target profile id — never an actor id", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, code: "created", friendship_id: "f1" },
      error: null,
    });
    await adminLinkFriendship("target-1");
    expect(mocks.rpc).toHaveBeenCalledWith("admin_link_friendship", {
      _target_profile_id: "target-1",
    });
    const [, args] = mocks.rpc.mock.calls[0];
    expect(Object.keys(args as object)).toEqual(["_target_profile_id"]);
  });

  it("returns the structured outcome", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: false, code: "pending_exists", friendship_id: "f9" },
      error: null,
    });
    await expect(adminLinkFriendship("t")).resolves.toEqual({
      ok: false,
      code: "pending_exists",
      friendshipId: "f9",
    });
  });

  it("maps a transport error to 'error' and never to a success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(adminLinkFriendship("t")).resolves.toEqual({ ok: false, code: "error" });
  });

  it("treats a malformed body as an error rather than trusting it", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(adminLinkFriendship("t")).resolves.toEqual({ ok: false, code: "error" });
  });
});

describe("adminCreateBotProfile", () => {
  it("defaults add_to_my_friends to false when the flag is absent", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, code: "created", profile_id: "b1", friendship: null },
      error: null,
    });
    await adminCreateBotProfile({ displayName: "Nova" });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ _add_to_my_friends: false });
  });

  it("passes the auto-friend flag through only when explicitly true", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: "created",
        profile_id: "b1",
        friendship: { ok: true, code: "created", friendship_id: "f1" },
      },
      error: null,
    });
    const out = await adminCreateBotProfile({ displayName: "Nova", addToMyFriends: true });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ _add_to_my_friends: true });
    expect(out.friendship).toEqual({ ok: true, code: "created", friendshipId: "f1" });
  });

  it("surfaces a failed friendship step separately from the bot creation", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: "created",
        profile_id: "b1",
        friendship: { ok: false, code: "blocked", friendship_id: null },
      },
      error: null,
    });
    const out = await adminCreateBotProfile({ displayName: "N", addToMyFriends: true });
    expect(out.ok).toBe(true);
    expect(out.friendship?.ok).toBe(false);
    expect(out.friendship?.code).toBe("blocked");
  });
});

describe("adminUpdateBotProfile", () => {
  it("sends null for omitted fields so the server leaves them unchanged", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, code: "updated" }, error: null });
    await adminUpdateBotProfile({ profileId: "b1", isDisabled: true });
    expect(mocks.rpc.mock.calls[0][1]).toEqual({
      _profile_id: "b1",
      _display_name: null,
      _avatar_url: null,
      _profile_frame: null,
      _is_disabled: true,
    });
  });

  it("never sends an is_bot field, so the UI cannot demote a bot", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, code: "updated" }, error: null });
    await adminUpdateBotProfile({ profileId: "b1", displayName: "Renamed" });
    expect(Object.keys(mocks.rpc.mock.calls[0][1] as object)).not.toContain("_is_bot");
  });

  it("reports not_a_bot without claiming success", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, code: "not_a_bot" }, error: null });
    await expect(adminUpdateBotProfile({ profileId: "x", isDisabled: true })).resolves.toEqual({
      ok: false,
      code: "not_a_bot",
    });
  });
});
