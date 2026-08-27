// ---------------------------------------------------------------------------
// VERIFY1 — security primitives for Account Connections.
//
// These cover the parts of the ceremony that live in pure TypeScript. The
// database half (single-use ticket consumption, the authenticated-user bind,
// uniqueness, consent reset, privilege ceiling) is enforced in SQL and is
// exercised by supabase/tests/verify1_identity_link_verification.sql, which is
// run against Supabase — not from this suite.
// ---------------------------------------------------------------------------

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

// The suite runs in the repo's shared jsdom environment, which does not always
// expose SubtleCrypto. Deno provides it natively; this only fills the gap here.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
import {
  DEFAULT_ALLOWED_ORIGINS,
  DISCORD_SCOPE,
  RIOT_SCOPE,
  allowedOrigin,
  buildAuthorizeUrl,
  buildReturnUrl,
  corsHeadersFor,
  generateTicket,
  hashTicket,
  providerAvailableFrom,
  providerConfigFrom,
  resolveAllowedOrigins,
  safeReturnPath,
  signState,
  verifyState,
  type EnvLookup,
  type StatePayload,
} from "./security";
import { safeReturnPath as frontendSafeReturnPath } from "../../../src/lib/auth/safe-return";

const SECRET = "verify1-test-state-secret";
const ORIGINS = resolveAllowedOrigins(null);

const envOf = (vars: Record<string, string>): EnvLookup => (k) => vars[k];

const FULL_DISCORD = {
  DISCORD_CLIENT_ID: "cid",
  DISCORD_CLIENT_SECRET: "csecret",
  DISCORD_REDIRECT_URI: "https://x.supabase.co/functions/v1/identity-link",
  IDENTITY_LINK_STATE_SECRET: SECRET,
};

// --- case 7 / 8: exact origin allowlisting ---------------------------------

describe("allowed origins are exact, never suffix matched", () => {
  it("accepts each approved Mogzy origin verbatim", () => {
    for (const origin of DEFAULT_ALLOWED_ORIGINS) {
      expect(allowedOrigin(origin, ORIGINS)).toBe(origin);
    }
  });

  it("rejects attacker-registrable lovable.app subdomains", () => {
    // The previous implementation accepted any hostname ending in
    // ".lovable.app". Every one of these is registrable by a stranger.
    const hostile = [
      "https://evil.lovable.app",
      "https://mogzy-attacker.lovable.app",
      "https://totally-random-project.lovable.app",
      "https://mogzy.lovable.app.evil.com",
      "https://notmogzy.lovable.app",
    ];
    for (const origin of hostile) {
      expect(allowedOrigin(origin, ORIGINS)).toBeNull();
    }
  });

  it("still accepts the one exact Mogzy preview host", () => {
    expect(allowedOrigin("https://mogzy.lovable.app", ORIGINS)).toBe("https://mogzy.lovable.app");
  });

  it("rejects lookalikes, wrong schemes, ports and trailing slashes", () => {
    for (const origin of [
      "http://mogsy.net",
      "https://mogsy.net/",
      "https://mogsy.net:8443",
      "https://mogsy.net.evil.com",
      "https://evil.com/?x=https://mogsy.net",
      "https://xn--mgsy-vqa.net",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(allowedOrigin(origin, ORIGINS)).toBeNull();
    }
  });

  it("honours explicit extra origins from configuration only", () => {
    const configured = resolveAllowedOrigins("https://staging.mogsy.net, https://qa.mogsy.net");
    expect(allowedOrigin("https://staging.mogsy.net", configured)).toBe("https://staging.mogsy.net");
    expect(allowedOrigin("https://other.mogsy.net", configured)).toBeNull();
  });
});

// --- case 9: safe return path ----------------------------------------------

describe("return path rejects every open-redirect shape", () => {
  const hostile = [
    "//evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "/\\\\evil.com",
    "https://evil.com",
    "http://evil.com",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "\t/settings",
    "\n/settings",
    " /settings",
    "/settings\n\rSet-Cookie: x=1",
    "settings",
    "",
  ];

  it("falls back rather than emitting a hostile target", () => {
    for (const raw of hostile) {
      expect(safeReturnPath(raw)).toBe("/settings");
    }
  });

  it("accepts ordinary in-app paths", () => {
    for (const raw of ["/settings", "/settings?tab=connections", "/settings#discord", "/quiz"]) {
      expect(safeReturnPath(raw)).toBe(raw);
    }
  });

  it("matches the frontend's established safe-return semantics exactly", () => {
    // Mogzy already has one rule for this (src/lib/auth/safe-return.ts). The
    // edge function must not drift into a second, weaker one.
    const corpus = [...hostile, "/settings", "/settings?a=1", "/settings#x", "/a/b/c", "/"];
    for (const raw of corpus) {
      const mine = safeReturnPath(raw, "/FALLBACK");
      const theirs = frontendSafeReturnPath(raw, "/FALLBACK");
      expect(mine).toBe(theirs);
    }
  });
});

// --- case 10: return URL construction --------------------------------------

describe("return URL preserves query and fragment", () => {
  it("appends status params to the query, never into the fragment", () => {
    // The previous implementation concatenated "?"/"&" by hand, so a path with
    // a fragment produced "/settings#tab?connect=..." and the app never saw
    // the parameters at all.
    const out = buildReturnUrl("https://mogsy.net", "/settings#connections", {
      connect: "discord",
      status: "pending",
      ticket: "abc",
    });
    const url = new URL(out);
    expect(url.origin).toBe("https://mogsy.net");
    expect(url.pathname).toBe("/settings");
    expect(url.hash).toBe("#connections");
    expect(url.searchParams.get("connect")).toBe("discord");
    expect(url.searchParams.get("status")).toBe("pending");
    expect(url.searchParams.get("ticket")).toBe("abc");
  });

  it("keeps an existing query alongside the new parameters", () => {
    const url = new URL(
      buildReturnUrl("https://mogsy.net", "/settings?tab=account&x=1#frag", {
        connect: "riot",
        status: "denied",
      }),
    );
    expect(url.searchParams.get("tab")).toBe("account");
    expect(url.searchParams.get("x")).toBe("1");
    expect(url.searchParams.get("connect")).toBe("riot");
    expect(url.searchParams.get("status")).toBe("denied");
    expect(url.hash).toBe("#frag");
  });

  it("url-encodes rather than letting a value break out of the query", () => {
    const url = new URL(
      buildReturnUrl("https://mogsy.net", "/settings", { status: "a&b=c#d", connect: "discord" }),
    );
    expect(url.searchParams.get("status")).toBe("a&b=c#d");
    expect(url.searchParams.get("connect")).toBe("discord");
  });

  it("cannot be made to emit an off-origin redirect", () => {
    expect(() => buildReturnUrl("https://mogsy.net", "https://evil.com/x", {})).toThrow();
    expect(() => buildReturnUrl("https://mogsy.net", "//evil.com/x", {})).toThrow();
  });
});

// --- cases 5 / 6: OAuth state integrity ------------------------------------

describe("OAuth state", () => {
  const payload = (over: Partial<StatePayload> = {}): StatePayload => ({
    a: "11111111-2222-3333-4444-555555555555",
    p: "discord",
    e: Date.now() + 60_000,
    ...over,
  });

  it("round-trips a valid state", async () => {
    const state = await signState(SECRET, payload());
    const out = await verifyState(SECRET, state);
    expect(out?.a).toBe("11111111-2222-3333-4444-555555555555");
    expect(out?.p).toBe("discord");
  });

  it("carries no Mogzy user identity — it is a pointer, not a credential", async () => {
    // This is the structural half of the fix for the account-linking CSRF.
    // Because the state cannot name a user, the callback cannot bind an
    // identity to one without consuming a server-side attempt row, and the
    // link itself is committed only by an authenticated redeem.
    const state = await signState(SECRET, payload());
    const decoded = JSON.parse(
      Buffer.from(state.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );
    expect(Object.keys(decoded).sort()).toEqual(["a", "e", "p"]);
    expect(JSON.stringify(decoded)).not.toMatch(/user|uid|\bu\b/);
  });

  it("rejects a tampered payload", async () => {
    const state = await signState(SECRET, payload());
    const [body, sig] = state.split(".");
    const forged = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );
    forged.a = "99999999-9999-9999-9999-999999999999";
    const tamperedBody = Buffer.from(JSON.stringify(forged))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyState(SECRET, `${tamperedBody}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const state = await signState(SECRET, payload());
    const [body, sig] = state.split(".");
    expect(await verifyState(SECRET, `${body}.${sig.slice(0, -1)}X`)).toBeNull();
    expect(await verifyState(SECRET, `${body}.`)).toBeNull();
    expect(await verifyState(SECRET, body)).toBeNull();
  });

  it("rejects a state signed with a different secret", async () => {
    const state = await signState("some-other-secret", payload());
    expect(await verifyState(SECRET, state)).toBeNull();
  });

  it("rejects an expired state, bounding any replay window", async () => {
    const state = await signState(SECRET, payload({ e: Date.now() - 1 }));
    expect(await verifyState(SECRET, state)).toBeNull();
  });

  it("rejects a malformed or absent state", async () => {
    for (const bad of [null, undefined, "", "nodot", ".", "..", "a.b.c"]) {
      expect(await verifyState(SECRET, bad as string)).toBeNull();
    }
  });

  it("refuses to sign or verify without a state secret", async () => {
    await expect(signState("", payload())).rejects.toThrow();
    const state = await signState(SECRET, payload());
    expect(await verifyState("", state)).toBeNull();
  });
});

// --- redemption ticket -----------------------------------------------------

describe("redemption ticket", () => {
  it("is high entropy and unique per issue", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTicket()));
    expect(seen.size).toBe(500);
    for (const t of seen) expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("hashes deterministically, and the hash is not the ticket", async () => {
    const ticket = generateTicket();
    const a = await hashTicket(ticket);
    const b = await hashTicket(ticket);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(ticket);
    expect(await hashTicket(generateTicket())).not.toBe(a);
  });
});

// --- cases 11 / 12: provider scopes ----------------------------------------

describe("provider scopes are exactly what the product allows", () => {
  it("requests only Discord identity", () => {
    expect(DISCORD_SCOPE).toBe("identify");
    const url = new URL(
      buildAuthorizeUrl("discord", "cid", "https://cb.example/x", "state-value"),
    );
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("scope")).toBe("identify");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("never requests email, guilds, connections, DMs or bot scopes", () => {
    const scope = new URL(
      buildAuthorizeUrl("discord", "cid", "https://cb.example/x", "s"),
    ).searchParams.get("scope")!;
    for (const forbidden of [
      "email",
      "guilds",
      "guilds.members.read",
      "guilds.join",
      "connections",
      "dm_channels.read",
      "bot",
      "messages.read",
      "applications.commands",
    ]) {
      expect(scope.split(" ")).not.toContain(forbidden);
    }
  });

  it("uses Riot's documented RSO scope pair", () => {
    // Riot's League RSO documentation specifies openid + offline_access. We
    // follow Riot's documented flow; v1 simply discards the refresh token.
    expect(RIOT_SCOPE).toBe("openid offline_access");
    const url = new URL(buildAuthorizeUrl("riot", "cid", "https://cb.example/x", "s"));
    expect(url.searchParams.get("scope")).toBe("openid offline_access");
    expect(url.searchParams.get("scope")!.split(" ").sort()).toEqual([
      "offline_access",
      "openid",
    ]);
  });
});

// --- case 13: fail closed without credentials ------------------------------

describe("providers fail closed", () => {
  it("reports unavailable when nothing is configured", () => {
    const env = envOf({});
    expect(providerConfigFrom(env, "discord")).toBeNull();
    expect(providerConfigFrom(env, "riot")).toBeNull();
    expect(providerAvailableFrom(env, "discord")).toBe(false);
    expect(providerAvailableFrom(env, "riot")).toBe(false);
  });

  it("treats a partially configured provider as absent", () => {
    for (const missing of ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI"]) {
      const vars = { ...FULL_DISCORD } as Record<string, string>;
      delete vars[missing];
      expect(providerAvailableFrom(envOf(vars), "discord")).toBe(false);
    }
  });

  it("requires the dedicated state secret, with no service-role fallback", () => {
    const withoutSecret = { ...FULL_DISCORD } as Record<string, string>;
    delete withoutSecret.IDENTITY_LINK_STATE_SECRET;
    withoutSecret.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-must-not-be-used";
    expect(providerConfigFrom(envOf(withoutSecret), "discord")).not.toBeNull();
    expect(providerAvailableFrom(envOf(withoutSecret), "discord")).toBe(false);
  });

  it("reports Riot unavailable while RSO credentials are absent", () => {
    // Riot must never present as verifiable without real RSO credentials.
    expect(providerAvailableFrom(envOf(FULL_DISCORD), "discord")).toBe(true);
    expect(providerAvailableFrom(envOf(FULL_DISCORD), "riot")).toBe(false);
  });
});

// --- CORS ------------------------------------------------------------------

describe("CORS is exact-origin", () => {
  it("never emits a wildcard", () => {
    for (const origin of [...DEFAULT_ALLOWED_ORIGINS, "https://evil.lovable.app", null]) {
      const headers = corsHeadersFor(origin, ORIGINS);
      expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
    }
  });

  it("echoes an approved origin and advertises the methods it accepts", () => {
    const headers = corsHeadersFor("https://mogsy.net", ORIGINS);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://mogsy.net");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(headers.Vary).toBe("Origin");
  });

  it("withholds CORS entirely from an unapproved origin", () => {
    const headers = corsHeadersFor("https://evil.lovable.app", ORIGINS);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
