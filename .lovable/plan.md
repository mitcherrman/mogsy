# OWN1 — Owner-only admin control plane (design)

## Current state (verified on main)
- Role checks via `has_role(uid, role)` / `is_master_admin` referenced in 74 migrations (RLS + RPCs) and in `AdminRoute.tsx`, `useAdminAuthority.ts`, `useAdminRoles.ts`, `AdminShell.tsx`, `LolPopoutStyleToggle.tsx`, `FloatingFriendsButton.tsx`, `CommunityUsersTab.tsx`, `admin-registry.ts`, many `src/lib/**/api.ts` admin clients.
- Browser `X-Admin-Key` fallback: `src/lib/admin-auth/adminCredentials.ts`, `AdminAuthGate.tsx`, `src/lib/knowledge-admin/key.ts` + `api.ts`, `src/lib/quiz/api.ts`, `src/lib/quiz/demoAnalyticsApi.ts`, `src/lib/combat-battles/api.ts`, staff-duel page.
- `supabase/functions/admin-user-actions/index.ts` returns raw `action_link` (recovery + verification) to the UI (lines 62–90).
- `admin_audit_log` table exists.

## 1. Architecture decision

### Canonical owner
- New table `private.owner_config` (schema `private`, no grants to anon/authenticated, single row enforced by `id boolean primary key default true check (id)`), column `owner_user_id uuid not null`.
- Rationale: DB-resident so RLS, RPCs, Edge Functions (service role) and Railway (service role / JWT verify + RPC) share one source; not in `user_roles`, not in `profiles`, not writable by any client role. Changing it requires a migration (or SQL by the project operator) — no RPC writes it.
- Edge Function secret `OWNER_USER_ID` mirrors it as a defense-in-depth cross-check; mismatch = deny (fail closed).

### Helpers (SECURITY DEFINER, `search_path=''`, STABLE)
- `public.is_owner()` — `auth.uid() = owner_user_id`; null/missing row → false.
- `public.is_owner_aal2()` — `is_owner() and auth.jwt()->>'aal' = 'aal2'`.
- `public.is_owner_fresh_aal2(max_age interval default '10 min')` — aal2 AND newest `amr` entry with method `totp` has timestamp within window (from `auth.jwt()->'amr'`).
- `public.is_owner_trusted()` — `is_owner_aal2()` OR (`is_owner()` AND valid trusted-device claim, see below).
- `public.assert_owner(level text)` — raises `42501` unless level satisfied; used at top of every privileged RPC.
- RLS on admin data uses `is_owner_trusted()`; sensitive RPCs use `assert_owner('fresh_aal2')`.

### Trusted devices
- Cookies are not viable: the SPA calls Supabase/Railway cross-origin with Bearer tokens; Lovable hosting can't set HttpOnly cookies on the Supabase domain, and Postgres can't read them. Safe alternative:
  - Table `private.owner_trusted_devices(id, token_hash bytea, label, user_agent, created_at, last_seen_at, expires_at (30d), revoked_at, created_aal)`.
  - Edge Function `owner-device` (verify_jwt true):
    - `POST /enroll` — requires owner + fresh aal2; generates 32 random bytes, stores SHA-256, returns token once.
    - `POST /attest` — owner (aal1 ok) sends token; function verifies hash, not expired/revoked, and issues a short-lived (15 min) **device attestation** row `private.owner_device_sessions(session_id = jwt session_id claim, device_id, expires_at)`. DB helper checks `auth.jwt()->>'session_id'` has a live attestation. Token never touches Postgres from the client and is never a boolean.
    - `POST /revoke`, `GET /list` — fresh aal2.
  - Browser storage: token in IndexedDB as a non-extractable-by-design opaque value (sessionStorage not used — needs persistence). Exposure risk = XSS; mitigated by short attestation TTL, bind to session_id, revocation, and that sensitive actions still need fresh aal2.
- Unknown device: `AdminRoute` sees no attestation → forces Supabase MFA challenge (`supabase.auth.mfa.challengeAndVerify`) → aal2 → offer "Trust this device".

### Edge Functions
- `supabase/functions/_shared/owner.ts`: `requireOwner(req, level)` — verifies JWT via `auth.getUser`, compares to `owner_config` (service role read) and `OWNER_USER_ID`, checks aal/amr freshness or attestation via RPC `owner_auth_state()`. Returns 401/403 JSON; never trusts headers other than Authorization.
- Railway admin APIs: same contract — verify Supabase JWT (JWKS), then call `owner_auth_state()` RPC with the user's token; delete `X-Admin-Key` acceptance in production builds (`NODE_ENV=production` hard-refuses). Railway repo changes listed as an external deliverable (not in this project).

## 2. Files

### New migrations (`supabase/migrations/`)
1. `<ts>_own1_a_owner_config.sql` — `private` schema, `owner_config`, `owner_trusted_devices`, `owner_device_sessions`, helpers, `owner_auth_state()` RPC (returns `{is_owner, aal, fresh, trusted}`), preflight `DO` block asserting the target UUID exists in `auth.users` and has a verified TOTP factor (`auth.mfa_factors status='verified'`) — else RAISE, migration aborts. Additive only.
2. `<ts>_own1_b_rls_cutover.sql` — redefine `has_role(uid, role)` body to `return uid = owner_user_id` for admin/master_admin/moderator (keeps every existing policy/RPC compiling, instantly collapses hierarchy to owner). `is_master_admin` same. Revoke INSERT/UPDATE/DELETE on `user_roles` from authenticated; drop role-grant RPCs' bodies to `assert_owner('fresh_aal2')`. Add `admin_audit_log` columns `aal`, `device_id`, `request_id` (nullable) + insert-only grant via `log_owner_action()` definer.
3. `<ts>_own1_c_sensitive_rpcs.sql` — `admin_set_pro_grant`, `admin_resolve_mod_request`, `admin_create/update_bot_profile`, `admin_link_friendship`, identity-link admin fns, `purge` callers: prepend `assert_owner(...)` + `log_owner_action`.
4. Later (post-verification) `<ts>_own1_d_retire_roles.sql` — replace `has_role` call sites with `is_owner_trusted()`, comment `user_roles` admin rows DEPRECATED.

Rollback: (b) is reversible by re-creating the prior `has_role` body (saved verbatim in `supabase/verification/own1_rollback.sql`); (a) is additive.

### Edge Functions
- add `_shared/owner.ts`, `owner-device/index.ts`
- `admin-user-actions/index.ts`: `requireOwner('fresh_aal2')`; recovery/verification → `auth.resetPasswordForEmail` / resend (email delivered to user), response `{success, sent:true}` only, never `action_link`; audit row per action.
- `admin-get-emails`, `purge-anonymous-users`: swap role check for `requireOwner` (purge = fresh_aal2; self-reentry keeps its service-role secret path).
- `supabase/config.toml`: register `owner-device`.

### Frontend
- `src/lib/admin-auth/`: rewrite `AdminAuthProvider.tsx`/`types.ts` to statuses `signed_out | not_owner | needs_mfa | needs_device_or_mfa | authorized | backend_unavailable`; delete fallback key (`applyFallbackKey`, `clearFallback`); `adminCredentials.ts` → Bearer only; new `ownerDevice.ts` (IndexedDB store, enroll/attest), `stepUp.ts` (`requireFreshAal2()` opens MFA dialog, retries call on 403 `step_up_required`).
- `AdminRoute.tsx`, `useAdminAuthority.ts`: call `owner_auth_state` RPC only; drop `roles` prop. Delete `useAdminRoles.ts`; replace uses (`AdminShell`, `admin-registry` master-only flags, `AdminUsersPage` Roles panel) with owner checks.
- `AdminAuthGate.tsx`: MFA challenge + "trust this device" UI; remove X-Admin-Key dialog.
- Remove key plumbing: `knowledge-admin/key.ts` (delete), `knowledge-admin/api.ts`, `quiz/api.ts`, `quiz/demoAnalyticsApi.ts`, `combat-battles/api.ts`, staff-duel `rankedDuelClient.ts`/`StaffMatchCreator.tsx`.
- New `src/pages/admin/AdminSecurityDevices.tsx` (list/revoke devices, view audit log) registered in `admin-registry.ts`.
- Moderator surfaces (`Moderator.tsx` route, moderator panels): route to owner gate; remove role badges in `CommunityUsersTab`, `FloatingFriendsButton`, `LolPopoutStyleToggle` → `useAdminAuthority`.

### E2E/dev
- Keep `getE2EIdentity()` path but compile it out: guard with `import.meta.env.VITE_E2E_AUTH === "1" && import.meta.env.DEV`; add a build guard test asserting the string is absent in `vite build` output. Backend never has a bypass; E2E runs mock the RPC.

## 3. Rollout sequence
1. Owner enrolls TOTP in the existing account security UI (`TwoFactorAuth.tsx`); confirm factor verified.
2. Set `OWNER_USER_ID` secret; apply migration (a) (preflight asserts). Deploy `owner-device`, `_shared/owner.ts`.
3. Ship frontend gate in "shadow" mode (logs owner state, old gate still decides). Owner enrolls a device.
4. Apply (b)+(c); deploy updated Edge Functions; switch gate to owner-only; Railway deploys JWT+RPC auth with key disabled.
5. Verify (checklist below) for ≥7 days, then (d) and deletions.

## 4. Risks / lockout prevention
- Preflight refuses migration without a verified TOTP factor for the owner UUID.
- Break-glass: owner_config is editable only via migration/SQL by the project operator — documented in `docs/OWN1_BREAK_GLASS.md`; MFA factor reset through backend auth admin by operator.
- `has_role` redefinition keeps every policy valid — no policy breaks mid-rollout; rollback SQL restores the old body.
- Lost TOTP device: recovery = operator unenrolls factor via SQL, owner re-enrolls.
- XSS steals device token → still blocked from sensitive actions (fresh aal2), attestation bound to session, revocable.
- Service-role reentry in purge must keep working (not user JWT) — tested.

## 5. Tests
- SQL (`supabase/verification/own1_*.sql` + `src/test/security/own1*.test.ts` static checks): non-owner with `user_roles` admin row → denied on every former admin RPC/RLS; owner aal1 no device → denied; aal2 → allowed; fresh vs stale amr for sensitive RPCs; revoked/expired device; attestation for different session_id rejected; authenticated cannot write `user_roles`/`owner_config`/device tables; direct RPC calls to `admin_set_pro_grant` etc. without aal2 fail.
- Edge (`supabase/functions/*/*_test.ts`): `owner-device` enroll requires fresh aal2, token returned once, hash only stored; `admin-user-actions` 403 for non-owner/aal1, response never contains `action_link`/`http`, audit row written; header `X-Admin-Key` ignored.
- Frontend (vitest): `AdminRoute`/`AdminAuthGate` per status; no `X-Admin-Key` anywhere (extend `pt17bBuilderBoundaries.test.ts` repo-wide); step-up retry flow; E2E identity absent in prod build.
- Railway: contract test spec handed off (JWT required, key rejected in production, aal levels).
- Playwright: owner on trusted device enters admin; new device prompted for MFA.

## 6. Delete only after production verification
- `user_roles` admin/master_admin/moderator rows and enum values (leave enum; comment DEPRECATED), `has_role` legacy semantics, `is_master_admin`.
- `useAdminRoles.ts`, Moderator page/panel, Roles & access UI, master-only registry flags.
- Railway `X-Admin-Key` code path and its secret; `knowledge-admin/key.ts`.
- Old `AdminAuthGate` fallback tests (`AdminAuthGate.test.tsx`, `adminCredentials.test.ts` key cases).

## Open assumptions
- Owner = the account behind `mlmitchaman@gmail.com` (to be confirmed; UUID filled in at migration time).
- Trusted-device TTL 30 days, attestation 15 min, fresh-aal2 window 10 min.
