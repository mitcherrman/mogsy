// ---------------------------------------------------------------------------
// VERIFY1 — Account Connections client helpers.
//
// The pure half: how a callback URL is read and cleaned, and how a verified
// identity is named. The ceremony's security lives in the edge function and in
// SQL and is covered there.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";

// The module under test imports the Supabase client for its network calls.
// Only the pure helpers are exercised here, so the client is stubbed to keep
// the real one from opening a session during the run.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));
import {
  CALLBACK_PARAM_KEYS,
  confirmationPrompt,
  identityLabel,
  isIdentityProvider,
  readCallbackParams,
  stripCallbackParams,
  toIdentityLink,
} from "./connections";

describe("readCallbackParams", () => {
  it("reads a Discord confirmation return", () => {
    const out = readCallbackParams("?connect=discord&status=pending&ticket=abc123");
    expect(out).toEqual({ provider: "discord", status: "pending", ticket: "abc123" });
  });

  it("reads a denied return with no ticket", () => {
    const out = readCallbackParams("?connect=riot&status=denied");
    expect(out).toEqual({ provider: "riot", status: "denied", ticket: null });
  });

  it("reports no provider on an ordinary settings visit", () => {
    expect(readCallbackParams("").provider).toBeNull();
    expect(readCallbackParams("?tab=audio").provider).toBeNull();
  });

  it("refuses an unknown provider rather than trusting the query", () => {
    expect(readCallbackParams("?connect=evil&status=pending&ticket=x").provider).toBeNull();
    expect(readCallbackParams("?connect=DISCORD").provider).toBeNull();
  });
});

describe("stripCallbackParams", () => {
  it("removes every callback field", () => {
    const out = stripCallbackParams(
      "https://mogsy.net/settings?connect=discord&status=pending&ticket=SECRET",
    );
    expect(out).toBe("https://mogsy.net/settings");
    for (const key of CALLBACK_PARAM_KEYS) expect(out).not.toContain(key);
    expect(out).not.toContain("SECRET");
  });

  it("keeps unrelated query parameters and the fragment", () => {
    const out = new URL(
      stripCallbackParams(
        "https://mogsy.net/settings?tab=audio&connect=discord&ticket=SECRET&x=1#connections",
      ),
    );
    expect(out.searchParams.get("tab")).toBe("audio");
    expect(out.searchParams.get("x")).toBe("1");
    expect(out.searchParams.get("ticket")).toBeNull();
    expect(out.hash).toBe("#connections");
  });

  it("is a no-op on a URL it cannot parse", () => {
    expect(stripCallbackParams("not a url")).toBe("not a url");
  });
});

describe("identityLabel", () => {
  it("renders a Riot ID as gameName#tagLine", () => {
    expect(
      identityLabel({ provider: "riot", username: "Mogzy", tagLine: "EUW", displayName: null }),
    ).toBe("Mogzy#EUW");
  });

  it("prefers the Discord global name over the username", () => {
    expect(
      identityLabel({ provider: "discord", username: "mogzy_dev", displayName: "Mogzy", tagLine: null }),
    ).toBe("Mogzy");
    expect(
      identityLabel({ provider: "discord", username: "mogzy_dev", displayName: null, tagLine: null }),
    ).toBe("mogzy_dev");
  });

  it("degrades to a generic name rather than rendering empty", () => {
    expect(
      identityLabel({ provider: "discord", username: null, displayName: null, tagLine: null }),
    ).toBe("Discord account");
    expect(
      identityLabel({ provider: "riot", username: null, displayName: null, tagLine: null }),
    ).toBe("Riot account");
  });
});

describe("confirmationPrompt", () => {
  it("names the exact account the user is about to attach", () => {
    expect(
      confirmationPrompt({
        provider: "discord",
        username: "mogzy_dev",
        displayName: "Mogzy",
        tagLine: null,
        avatarUrl: null,
      }),
    ).toBe("Link Discord account Mogzy?");
    expect(
      confirmationPrompt({
        provider: "riot",
        username: "Mogzy",
        displayName: null,
        tagLine: "EUW",
        avatarUrl: null,
      }),
    ).toBe("Link Riot account Mogzy#EUW?");
  });
});

describe("toIdentityLink", () => {
  const row = {
    id: "l1",
    provider: "discord",
    username: "mogzy_dev",
    display_name: "Mogzy",
    tag_line: null,
    avatar_url: null,
    verified_at: "2026-08-27T00:00:00Z",
    contact_consent: null,
    public_on_profile: null,
  };

  it("defaults both switches to false when the row says nothing", () => {
    const link = toIdentityLink(row)!;
    expect(link.contactConsent).toBe(false);
    expect(link.publicOnProfile).toBe(false);
  });

  it("drops a row whose provider is not one we support", () => {
    expect(toIdentityLink({ ...row, provider: "steam" })).toBeNull();
  });

  it("carries no durable provider identifier into the browser model", () => {
    const link = toIdentityLink(row)!;
    expect(Object.keys(link).sort()).toEqual([
      "avatarUrl",
      "contactConsent",
      "displayName",
      "id",
      "provider",
      "publicOnProfile",
      "tagLine",
      "username",
      "verifiedAt",
    ]);
    expect(JSON.stringify(link)).not.toContain("provider_user_id");
  });
});

describe("isIdentityProvider", () => {
  it("accepts only the two supported providers", () => {
    expect(isIdentityProvider("discord")).toBe(true);
    expect(isIdentityProvider("riot")).toBe(true);
    for (const v of ["steam", "twitch", "", null, undefined, 1, {}]) {
      expect(isIdentityProvider(v)).toBe(false);
    }
  });
});
