# USERS-LAUNCH1 — implementation handoff (2026-10-18)

## Objective
Make Admin › Users usable as the site's creator audience begins arriving; eliminate the proven daily visitor/new-visitor denominator mismatch without inventing first-time player counts. Signup timing and full canonical first-play tracking remain separate follow-up work.

## Base
`mogsy/main` 3d5cb0573b7cc23bd0951d74da1e1853771c50df.
Branch `feature/users-launch-pulse-20261018`. Draft PR; NOT merged or deployed.

## Work completed
- `src/lib/admin/analytics/metrics.ts`: computeDaily uses the UNION of browser events and sessions for active visitors per UTC day, then counts new visitors only within that day's active set. Keeps Railway starts as separate unlinked server facts.
- `src/lib/admin/analytics/metrics.test.ts`: regression scenarios for missing session rows / orphan first-touch and returning visitors.
- `src/components/admin/users/AudiencePulse.tsx`: launch KPIs (classified human vs unknown, recorded signup events, browser returning), openly unavailable first-time players; 12-row recent browser visitor feed and click into existing visitor details.
- `src/pages/admin/areas/AdminUsersPage.tsx`: pulse before existing Visitors drilldown, legacy reports in `<details>`; existing Accounts/Moderation and traffic controls untouched.

## Reliability constraints
- Human is an input signal; unknown is explicitly separate; neither is proof of person identity.
- First-time players stay 'Not yet reliable' pending authoritative parent Daily lifecycle and browser correlation validation. Never count Ranked children as Daily parents.
- Recorded signups = browser `signup_completed` events, not authoritative `auth.users` totals.
- No SQL writes or schema changes. Investigation of unexplained ~3,190 anonymous auth identities is still outstanding. Do not purge.
- Existing 50k row-cap warnings still govern partial reads. All metrics use the existing selected traffic filter.

## Potential merge conflicts
Frontend draft PR #69 touches `DailyMainResult.tsx` and `DailyCompletion.tsx` (mobile result); this branch does not touch them. #68 touches Play CSS. Other open PRs do not own these four updated files as of 2026-10-18.

## Verification state
- Pure source review and GitHub comparison only. Local environment cannot clone Github (DNS unavailable); no Vitest/TypeScript/build/browser tests run. PR must remain draft until executor runs focused + existing tests and mobile inspection.
- Confirm `src/lib/admin/analytics/metrics.test.ts` passes, `tsc` and frontend build, and visitor click flow.
- Additional fixtures needed: day-range boundaries, same-day event without session, mixed session-classes/overrides, truncated data, direct signup event-only account.

## Next work
1. Fresh Claude instance: read this handoff, `MOGZY_LAUNCH_ANALYTICS_SIGNUP_AUDIT_HANDOFF.md` (in ChatGPT artifact), USERS1/USERS2 handoffs and latest PRs. Inspect and test changes, fix all deficiencies in branch.
2. Separate Daily signup CTA PR BASED AFTER #69 resolves layout changes: guest-only nonintrusive save invitation at settled main Daily result, preserving Done for now, optional stages and upgrade UID. Add impression/click/dismiss/callback attribution with placement and return target.
3. Coordinate backend + Supabase Daily parent run lifecycle and truly joined first-play counters in isolated backend/frontend PRs. No deployment without approval.
