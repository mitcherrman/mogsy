# OWN1.1: Admin usability on the canonical-owner model (handoff)

## Objective
Give back the day-to-day Admin usability Mogzy had before OWN1, on top of the OWN1 security model:
- **Kept:** one canonical owner, MFA on new devices, trusted devices, fresh MFA for high-risk actions, denial of every non-owner, and no admin key or legacy roles.
- **Removed:** the brittleness. That covers the contract bug, competing checks, the Admin entry hidden on refresh, attestation lapses forcing MFA, and dead legacy-role gates.

## Starting heads
- Frontend: `origin/main` **c08882f6**. Branch `own1.1/admin-usability` (worktree `C:\Users\mlmit\mogzy-wt\own11-fe`).
- Backend: `origin/master` **f3a164f1**. Branch `own1.1/admin-usability` (worktree `C:\Users\mlmit\mogzy-wt\own11-be`).
- Production at start: Railway runs OWN1 owner auth (`8322e84a` or later). The Edge Functions were deployed by Lovable on 2026-10-07 (`4eb044e4`). OWN1-A through D are applied.

## Verified root causes
1. **Contract bug.** Railway returns `auth_method: "supabase_owner"` (`routes/_auth.py` `AUTH_METHOD_SUPABASE_OWNER`), but the SPA accepted only `"supabase_user"`. Every Railway-backed admin workspace (AdminAuthGate) therefore showed "Unexpected response".
2. **The Admin entry was gated on the Railway check**, `useAdminAuth().isAuthorized`, so three things hid it:
   - the contract bug, on every load;
   - every access-token refresh: the provider rechecked on `accessToken` and passed through `"checking"`;
   - an owner who still needed MFA: Railway answered 403, the entry disappeared, and the owner had no way into the MFA screen.
3. **AdminAuthProvider never attested the trusted device.** Only `useOwnerAuth` (inside AdminRoute) did. So on an AAL1 session on a trusted device:
   - the menu got a Railway 403;
   - once inside /admin, the Railway gate stayed "No admin access" until a manual retry.
4. **Duplicated checks.** Every nested `<AdminRoute>` ran its own `owner_auth_state` and its own loading state. The provider wrapped the whole app, so every signed-in user called Railway `/api/admin/session` on every token refresh.
5. **Attestation expiry.** An attestation lasts 15 minutes, bound to the JWT `session_id`, and nothing renewed it. After 15 minutes on an AAL1 trusted session:
   - RLS admin reads (`has_role` maps to `is_owner()`) silently failed;
   - Railway returned 403;
   - the hourly token-refresh recheck turned the owner into "No admin access".
6. **Step-up was never wired.** `isStepUpRequired` had no callers. Fresh-AAL2 actions (ban, password reset, Pro grant, purge) just failed with a raw `step_up_required` toast.
7. **Legacy role remnants.** OWN1 deleted the admin, master_admin and moderator `user_roles` rows, yet owner-facing UI still read them:
   - HUD bell: the admin feed was always empty;
   - `AdminBlog`: it redirected the owner to `/` with "Access denied";
   - `BlogPost` edit link, Profile frame picker, `ChampionProfile` and `ChampionVisual` admin art tools;
   - `LolPopoutStyleToggle`: worked via `has_role`, at 2 RPCs per mount;
   - `AdminUsers` "Grant Admin/Moderator": writes are revoked and trigger-blocked, so these could only fail.
8. **Backend outage looked like a denial.** When Railway couldn't reach `owner_auth_state` (config, network, 5xx), it answered 403, which the UI showed as "not the owner".

## Architecture after OWN1.1
```
Supabase auth user ──► ownerSession store (src/lib/admin-auth/ownerSession.ts)  ◄── ONE answer per user
                         phases: loading | signed_out | non_owner | needs_mfa | authorized | unavailable
                         - owner_auth_state() is the only input; legacy roles never consulted
                         - not authorized + owner → present stored device token once → re-read
                         - same user id ⇒ no work (token refresh is free); new user ⇒ reset first
                         - refresh failure keeps the last proven answer (stale); first failure = unavailable
                         - aal1+attested owner: re-attest every 10 min (TTL 15) + on focus/visibility
                         - ensureOwnerAuthorized(): single-flight re-attest + re-read (used on refusals)
        │
        ├─ useOwnerAuth()  → AdminRoute (step-up / redirect / mounted children; never unmounts on refresh)
        │                  → HUD: Admin entry = isOwner (visible even when MFA needed); bell feed = authorized
        │                  → useAdminAuthority / useAdminRoles shim → blog, profile, combat-lab, popout toggle
        └─ AdminAuthProvider (Railway workspaces) → only for phase=authorized:
                 GET /api/admin/session once per user / retry / re-authorization (NOT per token refresh)
                 403 → ensureOwnerAuthorized → retry once → owner_denied   (no loop)
                 unavailable → keeps an established authorization; first time = backend_unavailable
                 malformed → malformed_response (fail closed)

Sensitive action ──► runOwnerAction (src/lib/admin-auth/ownerAction.ts)
     level "trusted": run; on step_up_required(aal2_or_trusted_device) re-attest once + retry once
     level "fresh":   if server says !fresh_aal2 → OwnerStepUpHost dialog FIRST (admin stays mounted) → run once
     post-call refusal → MFA prompt; re-send only if the caller marked the action idempotent
```
The server stays the only authority. Railway (`require_admin` with `owner_auth_state`), RLS (`has_role`/`is_owner`), the RPC guards (`assert_owner`) and the Edge Functions (`requireOwner`) are unchanged in strength.

## Action requirements
| Action | Before | After | Why |
|---|---|---|---|
| Admin pages, Railway admin reads/writes, RLS admin tables (analytics, notifications, settings, blog, users list) | trusted | trusted | Routine. A trusted session is enough, and the attestation is now kept alive. |
| `admin-get-emails` (Edge) | trusted | trusted | Audited PII read, used routinely by the Users list. |
| `admin-user-actions` `get_auth_info` | trusted | trusted | Read, audited. |
| `admin_create_bot_profile` | fresh_aal2 | **trusted** (staged 05) | Bot persona only. Reversible, audited, no real account touched. |
| `admin_update_bot_profile` | fresh_aal2 | **trusted** (staged 05) | Rename, re-skin, enable or disable a bot. Refuses non-bots. Reversible, audited. |
| `admin_link_friendship` | fresh_aal2 | **bot target: trusted; real person: fresh_aal2** (staged 05) | Bots are routine. A real person's social graph is written without their request, so it keeps fresh MFA. |
| `admin_set_pro_grant` | fresh_aal2 | fresh_aal2 | Privilege grant. |
| `send_password_reset`, `confirm_email`, `ban_user`, `unban_user` (Edge) | fresh_aal2 | fresh_aal2 | Account takeover and access control. Unban is kept fresh because it is uncertain. |
| `resend_verification` (Edge) | fresh_aal2 | fresh_aal2 (**candidate for trusted**) | Low risk, but changing it needs an Edge redeploy. Not done; owner decision. |
| `purge-anonymous-users` (Edge) | fresh_aal2 | fresh_aal2 | Destructive and irreversible. |
| `owner_device_enroll` / `owner_device_revoke` | fresh_aal2 | fresh_aal2 | Trust configuration. |
| `owner_device_list` | aal2 | aal2 | Security configuration read. No UI yet. |
| `profiles` DELETE (AdminUsers "Delete user", via RLS) | trusted | trusted (**gap**) | Destructive, yet only trusted. Making it fresh needs a DB trigger or RPC. Recommended follow-up, not done. |
| `user_roles` `demo_access` grant/revoke (AdminUsers) | broken | broken (**gap**) | OWN1-B revoked client writes on `user_roles`. It needs an owner-only RPC (fresh, since it grants access). Not done. |

## Files changed
**Frontend (`own1.1/admin-usability`):**
- New:
  - `src/lib/admin-auth/ownerSession.ts`, `ownerAction.ts`, `ownerStepUpRequest.ts`
  - `src/components/admin/OwnerStepUpHost.tsx`
- Rewritten:
  - `src/hooks/useOwnerAuth.ts` (now over the store)
  - `src/lib/admin-auth/AdminAuthProvider.tsx`
  - `src/lib/admin-auth/types.ts` (`supabase_owner`; `needs_step_up` and `owner_denied`)
  - `src/components/AdminRoute.tsx`
- Edited:
  - Auth core: `adminSessionClient.ts` (`VALID_METHODS = ["supabase_owner"]`), `ownerAuth.ts` (`fetchOwnerAuthStateResult`, `stepUpKind`)
  - Gates and step-up: `AdminAuthGate.tsx`, `OwnerStepUp.tsx`, `App.tsx` (mounts the host)
  - HUD: `MogzyIdentityMenu.tsx`, `GlobalHud.tsx` (comment only)
  - Former legacy-role checks: `AdminBlog.tsx`, `BlogPost.tsx`, `Profile.tsx`, `ChampionProfile.tsx`, `ChampionVisual.tsx`, `LolPopoutStyleToggle.tsx`
  - Users: `AdminUsers.tsx` (step-up wiring; the dead admin/moderator grants are removed), `src/lib/admin/admin-users.ts`
- Staged SQL, NOT applied:
  - `supabase/own1-staged/migrations/05_own11_routine_owner_rpcs.sql`
  - `rollback/own11_rollback.sql`
  - `verification/own11_verify.sql`

**Backend (`own1.1/admin-usability`):**
- `routes/_auth.py`: raises `OwnerStateUnavailable` when the RPC can't be reached (config, network, timeout, 5xx), and `require_admin` turns it into 503. A 4xx or malformed answer is still 403.
- `routes/ranked_public.py`: `is_request_admin` catches `OwnerStateUnavailable` and returns `False`, so it stays fail-closed.
- `test_admin_auth.py`: adds the contract pin plus the 503 and fail-closed tests.

**Not changed:** `supabase/functions/**`, so there is no Edge deploy. No production DB change. No Railway env vars, including the retired KNOWLEDGE_ADMIN_KEY, MOGSY_ADMIN_USER_IDS and MOGSY_ADMIN_EMAILS.

## Deployment surfaces
- **Frontend.** A merge to `main` syncs to Lovable. The site goes live only on Lovable **Publish**. The branch touches no `supabase/functions` path, so a merge deploys no Edge Function.
- **Backend.** Railway deploys `master` on push. The change is additive and safe for the old frontend: it returns 503 only where a 403 used to mean "owner state unreachable", and both frontends treat 5xx as "unavailable".
- **Order.** Either order works. The frontend fix alone clears "Unexpected response". Ship the backend 503 change any time.
- **SQL 05 is optional.** Before it is applied, bot and friendship edits still demand fresh MFA, and the UI handles that by prompting. Apply it through the Supabase SQL editor in a transaction, then run `own11_verify.sql` (all rows `ok`). Rollback is `own11_rollback.sql`. The OWN1 rollback also still strips the line.

## Tests
- Full frontend suite, run in chunks (it OOMs as one process here). The branch ran against a detached checkout of `c08882f6` with the same commands, and the two failure sets are **identical: zero new failures**. Branch numbers:
  - `src/pages`: 4,468 pass, 20 fail. Base had 21 fail; the extra one, `LobbyPreviewPage` premiumAnalytics, is an unrelated base flake.
  - `src/lib`: 4,930 pass, 18 fail (base 4,896 pass, 18 fail).
  - `src/components`: 3,535 pass, 35 fail (base 3,521 pass, 35 fail).
  - `src/features`: 423 pass. `src/hooks`: 176 pass.
  - App routes plus `graph1`/`video`: 433 pass, 3 fail (same as base).
  - `src/test`: 525 pass, 26 fail (base 508 pass, 26 fail).
  - `pt2cProfileFrameAuthority.test.ts` OOMs on both, even alone at a 6 GB heap.
- New frontend tests:
  - Unit: `ownerSession.test.ts` (12), `ownerAction.test.ts` (12), `OwnerStepUpHost.test.tsx` (5)
  - Static contract: `own11OwnerUsability.test.ts`
  - Rewritten and extended: `AdminAuthProvider.test.tsx` (18), `adminSessionClient.test.ts` (contract pin), `AdminRoute.owner.test.tsx` (nested routes share one check; MFA then entry without reload), `AdminUsers.entitlement.test.tsx` (fresh-MFA preflight, cancel, no prompt when fresh), the HUD menu tests (owner session, legacy rows irrelevant, entry visible when MFA is needed, guest never sees Admin).
- Backend: `test_admin_auth.py` 28/28. On every owner-auth-related test file (34 files), the branch and base failure sets are **identical** (75 failed and 17 errors already on base); the branch adds 12 new passes.
- Typecheck: `tsc -p tsconfig.app.json` shows only the 2 errors already on base (`OnboardingProfile.tsx`, `identity/connections.ts`).

## Runtime verification (this session)
- Live Railway `/api/admin/session` returns 403 "Owner authorization required" for no auth, `X-Admin-Key` alone, and a bad bearer.
- Local preview of the branch against production Supabase and Railway, signed out:
  - `/admin` and `/admin/users` redirect to the hub;
  - there is no Admin entry;
  - **zero** Railway admin calls, zero `owner_*` RPCs, zero `user_roles` reads;
  - no new console errors.
- Not verifiable here, because it needs the owner's or a non-owner's real session: every signed-in matrix row (see below).

## Remaining human verification (owner, after Publish)
1. Signed in on this trusted computer: the Admin entry shows, /admin opens with no MFA, and Railway workspaces such as Quiz Content and Pro Coverage load with no "Unexpected response".
2. Leave Admin open for over 20 minutes, then use a routine action (open Users, edit a bot after SQL 05). There should be no MFA prompt.
3. Open a private window and sign in: the Admin entry is visible, /admin asks for MFA, and after verifying with "trust" checked, Admin works.
4. Ban a test account, or grant Premium to one, more than 10 minutes after MFA: a "Verify it's you" dialog appears over the page. After the code, the action runs once.
5. The bell shows owner notifications.
6. A non-owner test account: no Admin entry, /admin redirects, and Railway admin returns 403.

## Remaining OWN1 brittleness
- Railway calls `owner_auth_state` on every admin request (3 s timeout, no cache). A slow Supabase means slow admin, now shown as 503 rather than "not the owner".
- Individual Railway admin API clients don't do the re-attest-and-retry-once themselves. The keep-alive makes a lapse unlikely; a lapse shows as that call's own 403 until the next keep-alive or focus.
- `owner_device_list` and `owner_device_revoke` have no UI (OWN2).
- The gaps from the table above: profile DELETE is trusted-only, demo_access grants are broken, and `resend_verification` could be trusted.
- The legacy `AdminModeratorConfig` page and the "Moderators" filter in Users still read moderator rows. They are display-only and empty since OWN1; delete them with OWN2.

## Rollback
- Frontend: revert the branch commit. It is self-contained; no data migration.
- Backend: revert the commit. Before the revert, a 503 means "owner state unreachable"; after it, that case is a 403.
- SQL 05: `supabase/own1-staged/rollback/own11_rollback.sql`.

## Next task
1. Owner: review, merge FE and Publish, merge BE, run the human checks above.
2. Optionally apply SQL 05.
3. OWN2: a devices and audit page; profile DELETE moved behind fresh MFA; an owner RPC for demo_access; retire the moderator UI; then the legacy Railway env vars.
