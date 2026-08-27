// ---------------------------------------------------------------------------
// VERIFY1 — verified identities in the master-admin user directory.
//
// The directory's existing privacy contract is the thing under test as much as
// the new columns are: identities are keyed by the PUBLIC profile id, the auth
// id never enters the module, and nothing about a pending ceremony is
// reachable from here.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import {
  DIRECTORY_FILTERS,
  DIRECTORY_FILTER_LABELS,
  EMPTY_IDENTITIES,
  groupIdentityLinks,
  identitiesOf,
  matchesFilter,
  matchesSearch,
  riotIdLabel,
  toDirectoryProfile,
  type AdminDirectoryProfile,
} from "./admin-users";

const AUTH_ID = "aaaaaaaa-1111-2222-3333-444444444444";

function linkRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: AUTH_ID,
    profile_id: "p-1",
    provider: "discord",
    provider_user_id: "discord-snowflake-1",
    username: "mogzy_dev",
    display_name: "Mogzy",
    tag_line: null,
    contact_consent: false,
    public_on_profile: false,
    verified_at: "2026-08-27T00:00:00Z",
    ...over,
  };
}

function profile(over: Partial<AdminDirectoryProfile> = {}): AdminDirectoryProfile {
  return {
    ...toDirectoryProfile({ id: "p-1", display_name: "Someone" }),
    roles: [],
    ...over,
  };
}

describe("groupIdentityLinks", () => {
  it("groups both providers onto one profile", () => {
    const map = groupIdentityLinks([
      linkRow(),
      linkRow({ provider: "riot", username: "Mogzy", tag_line: "EUW", display_name: null }),
    ]);
    const entry = map.get("p-1")!;
    expect(entry.discord?.displayName).toBe("Mogzy");
    expect(entry.riot?.gameName).toBe("Mogzy");
    expect(entry.riot?.tagLine).toBe("EUW");
  });

  it("keys on the public profile id and never carries the auth id", () => {
    const map = groupIdentityLinks([linkRow()]);
    expect(map.has("p-1")).toBe(true);
    expect(JSON.stringify([...map.values()])).not.toContain(AUTH_ID);
  });

  it("never carries the durable provider identifier", () => {
    const map = groupIdentityLinks([linkRow()]);
    const json = JSON.stringify([...map.values()]);
    expect(json).not.toContain("discord-snowflake-1");
    expect(json).not.toContain("provider_user_id");
  });

  it("skips a link whose profile row is missing rather than inventing a key", () => {
    const map = groupIdentityLinks([linkRow({ profile_id: null })]);
    expect(map.size).toBe(0);
  });

  it("ignores a provider it does not know", () => {
    const map = groupIdentityLinks([linkRow({ provider: "steam" })]);
    expect(map.get("p-1")).toBeUndefined();
  });

  it("reads consent strictly — only true is consent", () => {
    expect(groupIdentityLinks([linkRow({ contact_consent: true })]).get("p-1")!.discord!.contactConsent).toBe(true);
    for (const v of [false, null, undefined, "true", 1]) {
      expect(
        groupIdentityLinks([linkRow({ contact_consent: v })]).get("p-1")!.discord!.contactConsent,
      ).toBe(false);
    }
  });
});

describe("riotIdLabel", () => {
  it("joins gameName and tagLine", () => {
    expect(riotIdLabel({ gameName: "Mogzy", tagLine: "EUW", verifiedAt: null })).toBe("Mogzy#EUW");
  });
  it("degrades rather than rendering a bare hash", () => {
    expect(riotIdLabel({ gameName: "Mogzy", tagLine: null, verifiedAt: null })).toBe("Mogzy");
    expect(riotIdLabel({ gameName: null, tagLine: null, verifiedAt: null })).toBeNull();
    expect(riotIdLabel(null)).toBeNull();
  });
});

describe("search reaches verified identities", () => {
  const withIdentities = profile({
    displayName: "Anonymous Wolf",
    identities: {
      discord: { username: "mogzy_dev", displayName: "Mogzy", contactConsent: true, verifiedAt: null },
      riot: { gameName: "Faker", tagLine: "KR1", verifiedAt: null },
    },
  });

  it("finds a user by Discord username or display name", () => {
    expect(matchesSearch(withIdentities, "mogzy_dev")).toBe(true);
    expect(matchesSearch(withIdentities, "Mogzy")).toBe(true);
  });

  it("finds a user by Riot game name and by the full Riot ID", () => {
    expect(matchesSearch(withIdentities, "faker")).toBe(true);
    expect(matchesSearch(withIdentities, "Faker#KR1")).toBe(true);
  });

  it("still matches the Mogzy display name", () => {
    expect(matchesSearch(withIdentities, "wolf")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(matchesSearch(withIdentities, "zzzz")).toBe(false);
  });

  it("does not throw on a profile assembled without identities", () => {
    const legacy = { ...profile(), identities: undefined } as unknown as AdminDirectoryProfile;
    expect(() => matchesSearch(legacy, "anything")).not.toThrow();
    expect(matchesSearch(legacy, "anything")).toBe(false);
    expect(identitiesOf(legacy)).toEqual(EMPTY_IDENTITIES);
  });
});

describe("Discord contact filter", () => {
  const consenting = profile({
    id: "p-yes",
    identities: {
      discord: { username: "a", displayName: null, contactConsent: true, verifiedAt: null },
      riot: null,
    },
  });
  const linkedNoConsent = profile({
    id: "p-no",
    identities: {
      discord: { username: "b", displayName: null, contactConsent: false, verifiedAt: null },
      riot: null,
    },
  });
  const unlinked = profile({ id: "p-none" });

  it("is offered as a directory filter", () => {
    expect([...DIRECTORY_FILTERS]).toContain("discord-contact");
    expect(DIRECTORY_FILTER_LABELS["discord-contact"]).toBe("Discord contact OK");
  });

  it("selects only users who actually consented", () => {
    expect(matchesFilter(consenting, "discord-contact")).toBe(true);
    expect(matchesFilter(linkedNoConsent, "discord-contact")).toBe(false);
    expect(matchesFilter(unlinked, "discord-contact")).toBe(false);
  });

  it("never treats a linked account as consent", () => {
    // Linking proves ownership. It says nothing about being willing to be
    // messaged, and conflating the two is the mistake this filter prevents.
    expect(matchesFilter(linkedNoConsent, "discord-contact")).toBe(false);
  });

  it("leaves the existing filters unchanged", () => {
    expect(matchesFilter(consenting, "real")).toBe(true);
    expect(matchesFilter(consenting, "all")).toBe(true);
  });
});
