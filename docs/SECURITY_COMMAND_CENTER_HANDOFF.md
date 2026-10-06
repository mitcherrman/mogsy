# Mogzy Security Command Center Handoff

## Objective
Close the remaining pre-public-launch security gates using a verification-first ledger. Do not claim perfect security; require evidence for authn/authz, cross-user isolation, value-bearing state, payment/entitlement integrity, secrets, storage/RLS, rate limits, auditability, and recovery.

## Important decisions
- Owner-only privileged control plane (OWN1): one canonical owner, MFA/AAL2, server-authoritative owner checks, trusted-device attestation, no client admin-key fallback.
- Sensitive owner actions require fresh AAL2 even on trusted devices.
- Legacy admin/master_admin/moderator roles are compatibility-only and their live privileged rows are archived/deleted and recreation-blocked.
- Do not remove old Railway admin variables until the final owner flow is production-verified.
- Do not fake CSP/clickjacking with HTML meta tags; require actual response-header enforcement.
- Same-volume SQLite snapshots are useful rollback artifacts but are not sufficient disaster recovery for loss of the Railway volume.

## Relevant repositories / production
- Frontend: mitcherrman/mogsy (main)
- Backend: mitcherrman/League_Combat_Simulator (master)
- Lovable project: Match & Rank
- Railway production: web service on the production environment with /data volume

## Current verified baseline — 2026-10-06
- Frontend main: cce36fcec0df0209133e55dcd187d5d3f03c5261
- Lovable latest synced commit: cce36fcec0df0209133e55dcd187d5d3f03c5261
- Lovable project reports ready and published. This does NOT prove which commit is currently serving on the public custom domain.
- Backend master: b09eb57ac77f9469e25384531c87281aaf23482f
- Railway web deployment: SUCCESS on b09eb57ac77f9469e25384531c87281aaf23482f
- Railway production has one persistent volume mounted at /data on the web service.
- Railway production currently has zero Storage Buckets.
- Web service variable names show no configured Mogzy steward root/backup-directory override and no S3/bucket backup variables.
- Direct connector does not expose Railway volume-backup schedules, so scheduled native volume backups remain UNKNOWN rather than absent.

## OWN1 completed/live
- MFA enrolled on sole privileged account.
- Canonical owner configured server-side.
- Owner-only DB authorization live; legacy privileged rows archived/deleted; recreation blocked.
- Sensitive RPCs fresh-AAL2 guarded.
- Reserved display-name enforcement live.
- Dangerous anon/authenticated TRUNCATE/REFERENCES/TRIGGER grants removed.
- Railway owner bearer authorization live.
- Ranked legacy-admin residue fix live.
- Frontend owner-aware source merged.
- Edge owner-aware source merged but production Edge deployment is still pending.
- Profile-photo upload cap and MIME restrictions live.

## Pending OWN1 production work
1. Deploy only admin-user-actions, admin-get-emails, purge-anonymous-users.
2. Set OWNER_USER_ID Edge secret to the already configured owner UUID without exposing it.
3. Verify public frontend publish is serving the owner-aware build.
4. Verify trusted-device flow end to end.
5. Verify new/untrusted device requires MFA/AAL2.
6. Verify non-owner denial at frontend, owner RPCs, Railway admin routes, Edge functions, role insertion/self-promotion.
7. Verify sensitive actions still require fresh MFA on trusted devices.
8. Only then retire KNOWLEDGE_ADMIN_KEY, MOGSY_ADMIN_USER_IDS, MOGSY_ADMIN_EMAILS.

## Disaster-recovery finding
Existing repository backup tooling verifies SQLite copies, supports retention, and performs restore drills. The /data retention runbook explicitly governs snapshots stored on /data. Those copies do not survive catastrophic loss/wipe of that Railway volume.

Production inventory currently shows no Railway Storage Bucket and no visible bucket/offsite uploader configuration. Therefore portable off-volume recovery is NOT VERIFIED and should remain OPEN.

Railway currently supports:
- native volume backups (scheduled daily/weekly/monthly), but those restore only inside the same project/environment and wiping a volume deletes its backups;
- private S3-compatible Storage Buckets suitable for backup artifacts.

Recommended architecture to evaluate next:
- retain native volume backups as fast same-platform recovery;
- create verified portable SQLite backup artifacts from the live DB using the existing online-backup/verification contract;
- upload encrypted/verified artifacts to object storage with retention;
- run a restore drill from the object artifact;
- for stronger provider/account disaster recovery, replicate at least one copy outside Railway rather than treating an in-project bucket as the final offsite layer.

Do not implement this until the copy/upload path, consistency semantics, scheduling, retention, encryption, cost, and restore test are reviewed.

## CSP / clickjacking
Historical production verification found no CSP, X-Frame-Options, or frame-ancestors. Current Lovable documentation says published apps expose a trust center at /.well-known/trust.html that reports clickjacking and CSP controls, but this has not yet been successfully fetched for mogzy.lol from the available runtime. Keep this item OPEN/UNVERIFIED until current production response headers or the live trust center are observed directly.

## Tests / evidence this takeover turn
Read-only only. No production mutation, deploy, secret change, or Lovable agent credit was used.
- GitHub current heads verified.
- Railway deployment/current environment inventory verified.
- Lovable current synced SHA verified.
- Railway variable names reviewed without exposing values.
- Existing backup/runbook implementation reviewed.
- Public Railway backup/bucket documentation reviewed.

## Next task
Before the 5 PM Lovable-credit checkpoint:
1. Continue read-only security verification and finish a concrete off-volume DR design.
2. Re-test current public headers/trust-center when a tool can reach them.
3. Do not attempt Edge deployment early or invent a deployment status.

At/after the Lovable-credit checkpoint:
1. Re-read frontend main and Lovable synced SHA first.
2. Use the Match & Rank agent only to set OWNER_USER_ID internally and deploy the three reviewed owner-only Edge functions, preserving verify_jwt semantics and making no unrelated edits.
3. Run full owner/trusted-device/non-owner production verification.
4. Retire the three old Railway admin variables only after that passes.


## Hostile-launch continuation — 2026-10-07

### Repository / CI
- Frontend repository is public; backend repository is private.
- Neither verified head contains .github/workflows. Frontend head has no commit-status checks; backend statuses observed are Railway deployment statuses rather than test/security CI gates.
- Frontend has no repository rulesets. Backend private-repo rulesets are unavailable on the current plan; classic branch-protection state is UNKNOWN because the integration cannot read it.
- Recommendation: make the frontend repository private after verifying Lovable/GitHub sync compatibility. This is reconnaissance reduction only, not an authorization boundary.
- Targeted current-code searches returned no literal committed matches for SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, OWNER_USER_ID, or RAILWAY_ANALYTICS_INGEST_SECRET. This is not a historical secret scan.

### Ranked / Daily / Team Sim abuse controls
- Ranked has a real default-on per-process token-bucket limiter and explicit 429 behavior/tests. Participant ownership and server-derived gameplay state are enforced separately.
- Team Simulation additionally has a SQLite-backed cross-process fixed-window limiter. It explicitly documents the single-volume topology boundary and keeps the credit meter as the hard resource authority.
- Daily child matches use Ranked routes, so child reads/submissions inherit Ranked throttling and ownership checks.
- P0 gap: routes/daily_run.py parent/controller endpoints do not invoke the existing daily_run_* policies defined in ranked_public/ratelimit.py.
- Daily allows verified Supabase anonymous identities. The daily_run_start policy includes an IP rule specifically to address cheap-identity abuse, but RANKED_RATELIMIT_IP_ENABLED defaults OFF.
- Do not enable trusted X-Forwarded-For blindly. RANKED_RATELIMIT_TRUST_XFF defaults OFF because proxy attribution has not been proven.
- General Ranked/Daily limiter state is process-local/reset-on-restart. It was explicitly designed for single-instance alpha. Before multi-worker/replica launch, generalize a shared/durable boundary for launch-critical actions.

### Supabase / RLS / RPC live read-only audit
- Every inspected public table reports RLS enabled. Inspected storage tables also report RLS enabled. This is baseline evidence, not proof that every policy is correct.
- profiles self-update policy preserves premium/value/admin-sensitive fields unless privileged authority is present, providing evidence against simple client-side forging of is_pro, diamonds, boost credits, elo shields, reveals, rewinds, bot state, admin notes, ads state, etc.
- OWN1 compatibility helpers are live: privileged has_role(admin/master_admin/moderator) and is_master_admin resolve to the canonical owner rather than trusting legacy privileged role rows.
- Sensitive RPCs inspected such as admin_create_bot_profile, admin_update_bot_profile and admin_set_pro_grant include assert_owner('fresh_aal2') before mutation.
- Many legacy RLS policy names still say admin/moderator/master_admin. Because the helper semantics are owner-only, names are compatibility residue, but non-owner production denial still needs end-to-end testing.
- Several SECURITY DEFINER functions are executable by anon. Most inspected examples are intentional public analytics/swipe/link helpers, but they are an abuse/cost surface.
- High-interest amplification candidate: record_league_swipe_result is anon-executable and can perform multiple writes/aggregate recomputation. Factual/practice attempts intentionally count repeatedly; no rate limiter is visible inside the function.
- analytics_promote_session_human and analytics_record_session_activity are anon-executable writes. They validate/scope supplied identifiers but need abuse-volume controls.
- Public analytics insert policies likewise need hostile-volume review.

### Supabase Edge/value endpoints
- create-checkout authenticates and uses server-owned subscription offer/price authority; arbitrary subscription Price IDs are rejected.
- redeem-gift authenticates and delegates redemption to an atomic SQL RPC.
- create-checkout, customer-portal, check-subscription and redeem-gift inspected source did not show a durable application-level limiter. check-subscription can amplify into Stripe calls plus service-role reconciliation. Treat these as P0 abuse-hardening candidates.

### Disaster recovery
- Existing take_data_snapshot.py/sqlite_online_backup.py should remain the snapshot producer: SQLite backup API, .partial staging, quick_check, receipt, writer-change detection and retention integration.
- Current production SQLite journal_mode remains UNKNOWN. Historical measured documentation reported DELETE/rollback-journal and recommended WAL rather than performing it.
- Do not schedule a large live portable snapshot until journal mode/write behavior is verified. A verified restore path is required before provisioning backup automation.
- Portable off-volume recovery remains OPEN; Railway currently has zero Storage Buckets.

### Observability
- Railway project has no webhooks configured.
- Tracing is disabled on all four production services.
- These are operational gaps, not automatically security vulnerabilities. Choose alert destination/signal policy before mutating production.

## Execution lanes

### Lovable / Supabase / publish
1. Finish OWN1: set OWNER_USER_ID Edge secret and deploy only admin-user-actions, admin-get-emails, purge-anonymous-users.
2. Verify owner trusted-device, new/untrusted MFA, fresh-AAL2 sensitive actions, and non-owner denial end-to-end.
3. Verify public frontend publish is serving owner-aware build.
4. Retire KNOWLEDGE_ADMIN_KEY, MOGSY_ADMIN_USER_IDS, MOGSY_ADMIN_EMAILS only after OWN1 production verification passes.
5. Verify CSP/clickjacking response headers/trust center.
6. Verify Lovable/private-GitHub compatibility, then make frontend repo private if compatible.
7. Apply reviewed Supabase SQL/RLS/RPC/Edge hardening that requires the production Supabase/Lovable stack.
8. Production-test anonymous/non-owner/value-bearing boundaries after changes.

### Claude Code / repository implementation
1. Wire Daily parent route throttling and add adversarial tests.
2. Generalize shared/durable rate limiting for launch-critical Ranked/Daily actions using existing Team Sim patterns where appropriate.
3. Design source-level durable throttling for create-checkout, customer-portal, check-subscription, redeem-gift; deployment remains Lovable/Supabase lane.
4. Audit/harden anon-executable and public-write surfaces, prioritizing league swipe and analytics amplification.
5. Add CI/security gates to both repos: tests, dependency audit, secret scanning where available; do not assume rulesets unavailable on plan can be used.
6. Establish deterministic Python dependency locking and verify Railway install/build path.
7. Add hostile-load harnesses for Daily, Ranked, Team Sim and expensive APIs.
8. Add/verify request-size, pagination, query/result, timeout, concurrency and backpressure bounds.
9. Implement portable backup artifact/checksum/upload/retention/restore tooling only after journal-mode/source-snapshot decision.
10. Keep this handoff current.

### Manual / Railway / account
1. Verify live SQLite PRAGMA journal_mode safely.
2. Verify Railway proxy/client-IP contract before trusting forwarded headers.
3. Verify native Railway volume-backup schedule in UI if connector remains unable to expose it.
4. Choose alert destination; then configure/test Railway alerts/webhook.
5. Run controlled prod-like load/capacity testing before a large launch.
