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
