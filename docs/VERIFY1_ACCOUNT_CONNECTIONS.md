# VERIFY1 — Account Connections (Discord / Riot)

Verified external identities linked to a Mogzy account. Discord and Riot are
**linked identities, not login providers**: the Mogzy account stays primary and
nothing in this feature mints, swaps or reads a Supabase session beyond
verifying the caller's own bearer token.

**No provider is enabled, nothing is deployed, and no production DB change has
been applied.** Everything below is a local candidate awaiting activation.

---

## The ceremony

A signed OAuth state alone can never create or update a verified identity.

| Leg | Endpoint | Auth | Writes |
|---|---|---|---|
| 1. start | `POST {action:"start"}` | permanent Mogzy account | `identity_link_attempts` |
| 2. callback | `GET ?code&state` | none (provider redirect carries no JWT) | `identity_link_pending` |
| 3. preview | `POST {action:"preview"}` | permanent Mogzy account | **nothing** |
| 4. redeem | `POST {action:"redeem"}` | permanent Mogzy account | `user_identity_links` |

Leg 2 is unauthenticated by necessity — Discord and Riot redirect a browser to
us. It proves ownership and parks a short-lived pending identity bound to the
user who started the ceremony. Leg 4 commits it, and only for a live session
whose user id matches. That split is what closes the account-linking CSRF
described in the Phase 1 audit.

Leg 3 is a read. It exists so the user sees *which* account they are attaching
before an irreversible write, and so a ticket cannot redeem silently just
because a URL was reopened. It is bound to the same user as redemption, it does
not consume the ticket, and it returns display-safe fields only — never
`provider_user_id`, the Discord snowflake or Riot PUUID.

The OAuth `state` carries only an attempt id, the provider and an expiry. It
names no user, so it is a pointer rather than a credential.

## Ticket handling in the browser

The redemption ticket arrives as a query parameter and is read exactly once. The
address bar is cleaned with `history.replaceState` in the same tick, before any
async work, so the ticket cannot survive a reload or be copied out of the URL.
It lives in React state for the seconds the confirmation takes and is written to
**no** localStorage, sessionStorage, database, log or telemetry. `funnel-analytics`
records `location.pathname` only, never the query.

`/settings` is ad-free by existing policy (`src/lib/ads/policy.ts`), so no
third-party script runs on the page while a ticket is in memory, and
`index.html` states `referrer: strict-origin-when-cross-origin` explicitly.

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
| Callback URL hygiene, identity labels, client projection | `src/lib/identity/connections.test.ts` | runs in `npm test` |
| Settings UX: confirmation, cancel, defaults, Riot unavailable | `src/components/settings/AccountConnections.test.tsx` | runs in `npm test` |
| Admin identity columns, search, contact filter | `src/lib/admin/admin-users.identity.test.ts` | runs in `npm test` |
| Ceremony semantics, preview, privileges, RLS, consent reset, uniqueness | `supabase/tests/verify1_identity_link_verification.sql` | **run manually against Supabase** |

The SQL harness runs inside `BEGIN … ROLLBACK` and leaves no residue. Apply the
migration first, then run it; a clean run ends with `VERIFY1 HARNESS PASSED`.


---

## Consent and visibility

Three independent facts, three independent columns:

| | Meaning | Default |
|---|---|---|
| verified identity | this person proved they own the account | written by redemption only |
| `contact_consent` | Mogzy may message them on Discord | **OFF** |
| `public_on_profile` | the identity may appear on their public profile | **OFF** |

Connecting an account never turns either switch on. Re-verifying the *same*
provider account preserves both. Linking a *different* provider account resets
both to false — permission granted for account A was never granted for B.

Riot has no contact-consent switch: there is no Riot channel Mogzy would message
someone on, so the control is not rendered.

`public_on_profile` is stored but **nothing renders it yet**. The switch says so
in its own hint text rather than implying the identity is already visible.
Public rendering is a later product decision.

## Admin

The master-admin user directory gains Discord and Riot columns, sourced from
`admin_list_identity_links()` — a third parallel call merged in memory, exactly
as roles already are. Identities are keyed on the **public profile id**; the
auth id the RPC also returns is deliberately not carried into the module, for
the same reason `toDirectoryProfile` drops it.

Search matches Discord username/display name and the Riot ID (both `gameName`
and `gameName#tagLine`). A `Discord contact OK` filter selects users who have
actually consented — never merely those who linked an account.

No token, ticket hash, pending record or secret is reachable from any admin
surface.
