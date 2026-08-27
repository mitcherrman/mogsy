# VERIFY1 — Account Connections (Discord / Riot)

Verified external identities linked to a Mogzy account. Discord and Riot are
**linked identities, not login providers**: the Mogzy account stays primary and
nothing in this feature mints, swaps or reads a Supabase session beyond
verifying the caller's own bearer token.

Phase 2 (this work) corrects the dormant backend architecture. **No provider is
enabled, nothing is deployed, and no production DB change has been applied.**

---

## The three-legged ceremony

A signed OAuth state alone can never create or update a verified identity.

| Leg | Endpoint | Auth | Writes |
|---|---|---|---|
| 1. start | `POST {action:"start"}` | permanent Mogzy account | `identity_link_attempts` |
| 2. callback | `GET ?code&state` | none (provider redirect carries no JWT) | `identity_link_pending` |
| 3. redeem | `POST {action:"redeem"}` | permanent Mogzy account | `user_identity_links` |

Leg 2 is unauthenticated by necessity — Discord and Riot redirect a browser to
us. It proves ownership and parks a short-lived pending identity bound to the
user who started the ceremony. Leg 3 commits it, and only for a live session
whose user id matches. That split is what closes the account-linking CSRF
described in the Phase 1 audit.

The OAuth `state` carries only an attempt id, the provider and an expiry. It
names no user, so it is a pointer rather than a credential.

---

## Required Supabase secrets

Set these as Edge Function secrets. **None are set today**, which is why both
providers report `available: false` and fail closed.

### Always required

| Secret | Purpose |
|---|---|
| `IDENTITY_LINK_STATE_SECRET` | HMAC key for the OAuth state. **Required** — there is no fallback to `SUPABASE_SERVICE_ROLE_KEY`. Without it, linking is unavailable. Use ≥32 random bytes. |

### Optional

| Secret | Purpose |
|---|---|
| `IDENTITY_LINK_ALLOWED_ORIGINS` | Comma-separated **exact** origins to allow in addition to the built-in list. No wildcards or suffix matching are supported anywhere. |
| `RIOT_RSO_AUTH_BASE` | Defaults to `https://auth.riotgames.com`. |
| `RIOT_RSO_ACCOUNT_BASE` | Defaults to `https://americas.api.riotgames.com`. Regional routing. |

### Discord — buildable today

| Secret | Value |
|---|---|
| `DISCORD_CLIENT_ID` | from the Discord Developer Portal application |
| `DISCORD_CLIENT_SECRET` | from the same application |
| `DISCORD_REDIRECT_URI` | `https://<project-ref>.supabase.co/functions/v1/identity-link` |

Developer Portal configuration:

- One application. **No bot user, no privileged intents.**
- OAuth2 redirect URI registered **exactly** as `DISCORD_REDIRECT_URI` above.
- Scope requested: `identify` and nothing else — never `email`, `guilds`,
  `guilds.members.read`, `connections`, DM or bot scopes.

### Riot — blocked on RSO approval

| Secret | Value |
|---|---|
| `RIOT_RSO_CLIENT_ID` | from an RSO-approved Riot product |
| `RIOT_RSO_CLIENT_SECRET` | same |
| `RIOT_RSO_REDIRECT_URI` | `https://<project-ref>.supabase.co/functions/v1/identity-link` |

Riot Sign On is **not** granted with a standard development API key. It requires
a Riot production registration with RSO explicitly approved, naming the exact
redirect URI. Until those credentials exist, Riot presents as unavailable and
there is no fallback path — a typed Riot ID or a public account lookup proves
nothing and is never accepted as ownership.

Scope requested: `openid offline_access`, per Riot's documented League RSO flow.
v1 discards the refresh token that yields; requesting a token and retaining one
are different things.

---

## Token handling

Provider access and refresh tokens are used once, inside the edge function, for
the identity lookup, then discarded with the request scope. They are never
returned to the browser, never written to any table (neither ceremony table has
a column for one), and never logged.

---

## Allowed return origins

Exact matching only. The built-in list lives in
`supabase/functions/identity-link/security.ts`:

```
https://mogsy.net              https://www.mogsy.net
https://mogsy.app              https://www.mogsy.app
https://mogzy.lol              https://www.mogzy.lol
https://mogzy.lovable.app      http://localhost:8080
```

`mogzy.lovable.app` is a **single exact host** — Mogzy's own preview — not a
pattern. The prior implementation trusted any hostname ending in `.lovable.app`,
and every such subdomain is registrable by a stranger. Removing the preview host
or the localhost dev origin is a code-free configuration decision.

---

## Verification

| Layer | Where | Status |
|---|---|---|
| Origins, return paths, state integrity, scopes, tickets, CORS | `supabase/functions/identity-link/security.test.ts` | runs in `npm test` |
| Ceremony semantics, privileges, RLS, consent reset, uniqueness | `supabase/tests/verify1_identity_link_verification.sql` | run manually against Supabase |

The SQL harness runs inside `BEGIN … ROLLBACK` and leaves no residue. Apply the
migration first, then run it; a clean run ends with `VERIFY1 HARNESS PASSED`.
