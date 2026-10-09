# OWN1 — Owner-only admin control plane (handoff)

## Objective
Replace the admin / master_admin / moderator hierarchy with exactly one owner. Trusted owner devices get easy access; any other device needs Supabase MFA (aal2) first. Sensitive actions always need a fresh aal2. There is no browser admin key, and nobody can promote themselves.

## Decisions
- **Owner identity:** stored in `private.owner_config` (a single row in a schema clients can't read), plus the deployment-time Edge secret `OWNER_USER_ID`. Edge Functions require the two to match, and deny access otherwise. Nothing is seeded in git.
- **Helpers:**
  - `is_owner()`: owner AND (aal2 OR a live device attestation for this session).
  - `is_owner_aal2()`, `is_owner_fresh_aal2(600s)`: the stricter levels.
  - `assert_owner(level)`: the check privileged RPCs call.
  - `owner_auth_state()`: returns booleans only, so a non-owner learns nothing.
  - `log_owner_action()`: writes the durable audit row.
- **Trusted devices:** built as SQL RPCs rather than an Edge Function. They read `session_id`, `aal` and `amr` straight from the caller's JWT, so attestation binds to the authenticated session with no extra service. They also need no deploy.
  - Tokens are 256-bit random and minted server-side. The database stores only their SHA-256 hash.
  - Enrollment requires fresh aal2.
  - Each attestation lasts 15 minutes and is tied to the JWT `session_id`. Devices expire after 30 days and can be revoked.
  - The browser keeps the opaque token in IndexedDB (never a boolean, never localStorage).
- **Why not HttpOnly cookies:** the SPA calls Supabase and Railway cross-origin with Bearer tokens. Lovable hosting can't set cookies on those origins, and Postgres can't read cookies.
- **Compatibility shims:**
  - `has_role(uid, admin|master_admin|moderator)` and `is_master_admin` now resolve only for the configured owner, only for that owner's authenticated session, and only when the session is trusted. Null-auth/service contexts fail closed. Existing user_roles rows grant nothing.
  - The other roles (`user`, `demo_access`) still read `user_roles`.
  - `useAdminRoles` is a deprecated shim over the owner check.
- **Browser key:** the X-Admin-Key fallback is removed from every production path. The staff-duel prototype sends a key only when `import.meta.env.DEV` is true, which is statically false in production builds. The E2E identity is honoured only behind `import.meta.env.DEV` plus `VITE_E2E_AUTH=1`, in the frontend only, and the backend never accepts it.

## Files
**Staged, NOT applied or deployed.** This environment can't hold unapplied migrations, and Edge Functions auto-deploy when written.
- `supabase/own1-staged/migrations/01_own1_a_owner_core.sql`: additive (tables, helpers, device RPCs, audit columns)
- `02_own1_b_owner_cutover.sql`: preflight, shims, user_roles lockdown, fresh-aal2 guard on 4 sensitive RPCs
- `03_own1_c_display_name_enforcement.sql`: trigger that stops direct writes bypassing reserved and invalid name checks
- `04_own1_d_client_privilege_hardening.sql`: removes TRUNCATE/REFERENCES/TRIGGER from anon/authenticated, now and by default
- `rollback/own1_rollback.sql`, `verification/own1_verify.sql`
- `functions/_shared/owner.ts`, `functions/_shared/owner-decision.ts`
- `functions/admin-user-actions`, `functions/admin-get-emails`, `functions/purge-anonymous-users`

**Frontend (live in source):**
- New: `src/lib/admin-auth/ownerAuth.ts`, `ownerDevice.ts`, `src/hooks/useOwnerAuth.ts`, `src/components/admin/OwnerStepUp.tsx`
- Rewritten or edited:
  - Route gate and hooks: `AdminRoute.tsx`, `useAdminAuthority.ts`, `useAdminRoles.ts`
  - Admin auth core: `adminCredentials.ts`, `AdminAuthProvider.tsx`, `types.ts`, `adminSessionClient.ts`, `AdminAuthGate.tsx`
  - API clients: `quiz/api.ts`, `quiz/demoAnalyticsApi.ts`, `knowledge-admin/api.ts`, `combat-battles/api.ts`, `rankedDuelClient.ts`
  - Pages and wiring: `AdminQuizReview.tsx`, `AdminVideoExport.tsx`, `App.tsx`, `admin-registry.ts`
- Deleted: `src/lib/knowledge-admin/key.ts`

## Migration order and rollout
1. Owner enrolls TOTP (account security screen) and confirms the factor is verified.
2. Apply **A** (additive; no behaviour change).
3. **At deployment time only**, the operator runs `INSERT INTO private.owner_config(owner_user_id) VALUES ('<owner uuid>');` and sets the Edge secret `OWNER_USER_ID` to the same UUID. Never commit either.
4. Apply **D**. It's independent, and its built-in assertion fails if any client still holds the revoked privileges.
5. Apply **B**. Its preflight aborts unless there is exactly one live, unbanned, registered owner with a verified MFA factor.
6. Apply **C**.
7. Move `supabase/own1-staged/functions/*` into `supabase/functions/` (deploys). Railway: verify the Supabase JWT, call `owner_auth_state()` with the caller's token, and reject X-Admin-Key in production.
8. Publish the frontend. **Do not publish before step 5**, or admin pages fail closed (owner sees a redirect) because `owner_auth_state` won't exist yet.
9. Run `verification/own1_verify.sql` (in a transaction, rolled back) and the checklist below.

## Rollback
`rollback/own1_rollback.sql` restores the previous `has_role`/`is_master_admin` bodies and user_roles policies/grants, strips the OWN1 guard lines from the 4 RPCs, and drops the name trigger. A and D can stay. If needed, restore the previous Edge Function sources from git.

## Lockout prevention
- B refuses to apply without a verified MFA factor for the owner.
- Break-glass is operator SQL on `private.owner_config` or `auth.mfa_factors`. No RPC can change the owner.

## Verification status (2026-10-06)
- Reconciled the stranded Lovable OWN1 follow-up onto current main without overwriting DRS1.
- Found and fixed one real OWN1 bug: privileged compatibility checks could treat the configured owner as admin when auth.uid() was NULL. Privileged shims now require a non-null authenticated owner session and fail closed in backend/service contexts.
- Added durable admin_get_emails audit logging.
- GitHub Actions branch-only verification: focused OWN1/admin suite 158/158 passed.
- Two older security inventory tests were already failing before OWN1: adminNotificationReadSemantics expects deleted src/pages/Admin.tsx; pt14EntitlementSources expects several files deleted before OWN1. They were not modified.
- Typecheck reports six errors only in three files whose blobs are identical to the pre-OWN1 base: OnboardingProfile.tsx, identity/connections.ts, and practiceLeaveContract.test.ts. No OWN1 file has a type error in that run.
- Frontend/Supabase OWN1 source is READY FOR ROLLOUT REVIEW, but production rollout remains blocked on the Railway owner-auth source change and owner MFA enrollment.

## Tests
- `src/test/security/own1OwnerControlPlane.test.ts`: static contracts (no seeded owner, shims, revokes, hashing, fresh aal2, trigger, privileges, staged functions, no X-Admin-Key, DEV-only E2E).
- `src/test/security/own1OwnerDecision.test.ts`: owner/non-owner, aal1/aal2/fresh, trusted device ≠ fresh, misconfiguration, link sanitizer.
- `src/components/AdminRoute.owner.test.tsx`: owner-only route and MFA prompt.
- Updated admin-auth, route, and quiz-review tests.
- Runtime DB checks (revoked/expired device, direct RPC bypass) live in `own1_verify.sql` and run after apply.

## Production verification checklist
- A non-owner holding an old `master_admin` row gets `has_role = false` and is redirected from /admin.
- A backend/service context with no authenticated user gets `has_role(owner, admin) = false` and `is_master_admin(owner) = false`.
- Owner at aal1 on a new device sees the MFA prompt. After verifying with "trust" checked, a reload at aal1 is attested.
- Revoking a device means the next visit asks for MFA.
- Ban, password reset, and Pro grant return `step_up_required` when MFA is more than 10 minutes old.
- Password reset sends an email, the response contains no URL, and an `admin_audit_log` row exists.
- An unsigned or non-owner call to purge returns 401/403, and the continuation still completes.
- Direct `PATCH profiles.display_name` to a reserved name is rejected.
- No client TRUNCATE grants remain.

## Delete only after production verification
- Legacy admin rows in `user_roles` (keep the enum values)
- `useAdminRoles` shim and its callers' master/moderator branches
- Moderator page and the "Roles & access" UI
- Railway key path and its secret
- The `has_role` admin-role branches (switch policies to `is_owner()`)

## Next task
OWN2: move the staged Edge Functions live, add the Railway JWT + `owner_auth_state` change, add a devices/audit owner page, and replace `has_role` call sites with `is_owner()`.

## Production rollout status — 2026-10-06

### LIVE + VERIFIED
- Owner MFA enrolled: production has one verified MFA factor on the sole privileged account.
- OWN1-A owner core applied to production; canonical owner configured.
- Live owner session verified at AAL2 with MFA AMR claim.
- owner_auth_state() verified under owner AAL2: is_owner=true, authorized=true, fresh_aal2=true, session_bound=true.
- OWN1-B cutover applied to production.
- Legacy privileged user_roles rows archived privately and removed from public.user_roles (2 archived; 0 live).
- Re-creation of admin/master_admin/moderator rows blocked by trigger.
- has_role()/is_master_admin() privileged compatibility shims verified: owner AAL2 succeeds; null-auth fails closed.
- Sensitive RPCs admin_set_pro_grant/admin_create_bot_profile/admin_update_bot_profile/admin_link_friendship verified fresh-AAL2 guarded.
- OWN1-C reserved-display-name enforcement applied; trigger present.
- OWN1-D client privilege hardening applied; residual anon/authenticated TRUNCATE/REFERENCES/TRIGGER grants in public = 0.
- Railway owner-only auth merged and deployed successfully at backend commit 8322e84a822cb6cfbdc4182a31c86de4b2997381; prior deployment removed.
- Frontend/security reconciliation merged to main.
- Reviewed owner-only Edge Function sources promoted to live supabase/functions paths and merged at commit 1d660dc549fc46f962698523a9b69ee6cf56486e.
- Focused OWN1 security suite passed after Edge source promotion.

### PENDING / BLOCKED
- Supabase Edge Function DEPLOYMENT remains pending for admin-user-actions, admin-get-emails, purge-anonymous-users.
- The staged owner gate expects OWNER_USER_ID to match private.owner_config. Lovable connector exposes no direct secret/deploy-function action.
- Lovable AI agent is out of credits, so it cannot currently set OWNER_USER_ID or deploy those three functions.
- Legacy deployed admin-user-actions/admin-get-emails now fail closed because privileged user_roles rows were removed. This is intentionally safer than leaving the old authority path active, but those admin features may be unavailable until redeployed.
- purge-anonymous-users service-role continuation remains in its staged reviewed replacement; do not alter production invocation until the replacement is deployed.
- Frontend production publish was initiated via direct Lovable deploy_project after the database/Railway cutover. Deployment id: 2a135c82-de07-4ece-aa87-5f203eaaba97. Direct connector does not expose deployment-status lookup; public runtime verification from this environment is DNS-blocked.

### NEXT TASK
1. Once Lovable credits are available, use the existing Match & Rank project agent ONLY to:
   - read public.owner_configured_id() internally;
   - set OWNER_USER_ID Edge secret to that UUID without exposing it;
   - deploy only admin-user-actions, admin-get-emails, purge-anonymous-users from current main;
   - preserve existing verify_jwt modes.
2. Verify each deployed function is owner-only and that raw recovery/action URLs are never returned.
3. Verify owner admin UI on the current trusted/AAL2 device.
4. Enroll this computer as a trusted device; confirm subsequent normal admin use does not require MFA while sensitive actions still require fresh AAL2.
5. Verify a non-owner account cannot access /admin, Railway admin routes, owner RPCs, or admin Edge Functions.
6. Verify a new/untrusted browser requires MFA before admin access.
7. Remove retired Railway KNOWLEDGE_ADMIN_KEY / MOGSY_ADMIN_USER_IDS / MOGSY_ADMIN_EMAILS variables only after the production owner flow is fully verified.


## OWN1.1 follow-up (2026-10-08)
Admin usability correction on top of this model (Railway `supabase_owner` contract fix, one shared owner session, trusted-device keep-alive, per-action fresh-MFA step-up, legacy-role remnants removed): see `docs/OWN1_1_ADMIN_USABILITY.md`.
