# ADMIN-ACCOUNT-JOURNEY1 — handoff (2026-10-18)

## Objective
Daily-use admin operator experience for registered Mogzy users: elegant, accurate overview and a single chronological account journey. Preserve existing account mutations and owner authorization; no migrations, new entitlements, or speculative data joins.

## Existing truth / sources
- `AdminUsers.tsx`: existing Accounts route, `admin_list_profiles` owner/admin RPC, `admin-get-emails` trusted owner Edge auth lookup, `admin-user-actions` get_auth_info, identity links via `admin_list_identity_links`, existing premium provenance helper, leagues, purchases, notes, actions and moderation.
- `analytics_events` admin RLS supports a UID-scoped bounded read. Only events bearing exact `user_id` appear; no IP/fingerprint/cross-browser joins.
- `analytics_visitor_user_links` and `analytics_visitors` are protected under current admin RLS. The optional browser-level acquisition card uses only exact DB-recorded UID/browser links and explicitly warns that browser evidence may include shared devices; it is never merged with authenticated activity as proof of identity.
- Auth original `created_at` may predate guest→permanent signup; it is NOT claimed as registration time. Email `email_confirmed_at` is authoritative (on owner-auth detail read).
- Identity `verified_at` is authoritative for Discord/Riot connected providers.
- `purchases` historical status is not confirmed Stripe payment; Stripe subscriptions and comped grants are distinguished. No real monetary revenue is inferred.

## Implementation
- `src/lib/admin/account-journey.ts`: deterministic bounded projection with provenance labels, server-only gameplay starts, precise source semantics, and registered user KPI cohort.
- `src/components/admin/users/AdminAccountJourney.tsx`: restrained gold-accent dark theme, 6 responsive operator KPI cards and 4 per-account status tiles; acquisition context kept separate from a concise 8-most-recent timeline expandable to 80 entries.
- `src/components/admin/AdminUsers.tsx`: operator headline cards and improved list row status chips; existing secure auth read invoked on selected registered account; UID-scoped analytics query; timeline next to existing actions/tabs.
- Tests and Playwright smoke at 320/390/1280; CI checks no new TS errors vs main.

## Known limits
- Owner's email list fetch is protected by `admin-get-emails`. If it fails, UI explicitly says unavailable; does not invent verification.
- Explicit auth event is a browser signal and may not exist for older registrants. Do not mark exact permanent registration time as known unless an authoritative upgrade audit exists.
- Gameplay not attached to account uid remains unattributed; no complete pre-signup browsing timeline.
- Stripe purchase/refund verification requires billing-side trusted data integration, not old ledger rows.
- Existing admin permissions / MFA / Premium mutation/notes entirely unchanged.
- Auth reads use request tokens to avoid cross-account stale display while switching selected users.
- Known release QA addresses are explicitly labeled when they match the verified `mogzy-launch-qa-*@mogzy.lol` pattern. Other untagged QA may exist; do not interpret registered total as confirmed organic people.

## QA
GitHub Actions [Admin Account Journey Acceptance run 39129210542](https://github.com/mitcherrman/mogsy/actions/runs/39129210542) succeeded on code commit 96f722a02b7b5e3af0823fd87ca313c7f670c60e:
- 116 focused unit/integration regressions passed.
- Vite production build succeeded.
- TypeScript reported no new diagnostics beyond current main's acknowledged baseline.
- Chromium UI passed at 320, 390 and 1280px with account summary, acquisition and timeline visible and no viewport overflow.
Still required: owner-authorized account detail smoke in the actual Admin route. No production writes/deploy in this workstream.

## Next
1. Check CI and fix errors, visually inspect viewport/browser harness. Ensure authorization failures are never presented as zero activity.
2. Add authoritative profile/registration milestone service with stable chronology, Stripe webhook payment-state milestones, identity disconnect history, and deterministic pre-signup browser linking in next PR(s).
3. Add conversion dashboard source- and placement-aware after event linkage is certified (issue #73). Don't infer human users from `analytics_visitors` alone.

## Owner authorization and email confirmation extension (2026-10-18 continued)
- The existing owner-trusted `supabase/functions/admin-get-emails/index.ts` now returns an additive `email_confirmations` map alongside the unchanged `emails` response, populated solely via `ctx.service.auth.admin.getUserById` under `requireOwner(req, "trusted")`; existing rate limit, batch cap, UUID validation and `auditOwnerAction` remain unchanged.
- `AdminUsers` displays **Email confirmed**, **Email pending** and **Email status unknown** (for unavailable/older Edge response); it NEVER maps missing status to pending. Owner metrics show confirmed count over observed coverage and use a dash when no coverage exists.
- Discord/Riot directory badges and headline counts now mean `verifiedAt` is present; unverified connection rows are not counted or green-highlighted as verified.
- Focused CI now includes the existing `AdminUsers.phase1.test.tsx` owner-action harness with tests for the additive Edge payload, backward compatible unknown status, pending status, and list→detail owner-authorized auth date; checks source still calls owner gate and audit.
- **Required publishing sequence**: verify the updated protected `admin-get-emails` Edge Function is deployed (not just checked in to GitHub/Lovable editor), then confirm status labels via a real MFA-authenticated owner session. If the Edge deployment is not synchronized, the frontend gracefully reports status unknown.
- No tool in this session has the owner's browser MFA session. Never assert real signed-in Admin smoke passed solely because Playwright uses mocked auth fixtures.
