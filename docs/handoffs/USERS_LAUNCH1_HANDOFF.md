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
- `src/pages/admin/areas/AdminUsersPage.tsx`: pulse first; all visitors and diagnostic sections collapsed by default, visitor detail opens directly from recent-feed selection; Accounts/Moderation and traffic controls untouched.

## Reliability constraints
- Human is an input signal; unknown is explicitly separate; neither is proof of person identity.
- First-time players stay 'Not yet reliable' pending authoritative parent Daily lifecycle and browser correlation validation. Never count Ranked children as Daily parents.
- Recorded signups = browser `signup_completed` events, not authoritative `auth.users` totals.
- No SQL writes or schema changes. Investigation of unexplained ~3,190 anonymous auth identities is still outstanding. Do not purge.
- Existing 50k row-cap warnings still govern partial reads. All metrics use the existing selected traffic filter.

## Potential merge conflicts
Frontend draft PR #69 touches `DailyMainResult.tsx` and `DailyCompletion.tsx` (mobile result); this branch does not touch them. #68 touches Play CSS. Other open PRs do not own these four updated files as of 2026-10-18.

## Verification state (updated 2026-10-18)
- GitHub Actions `Launch Audience Pulse Verification`: 116 focused tests passed; Vite production compilation passed on commit `42993a0b` (run `39112112956`).
- TypeScript's only diagnostics are two pre-existing TS2345 errors in `OnboardingProfile.tsx` and `identity/connections.ts`; both files were byte-identical to main. The new `scripts/ci/check-audience-typecheck.mjs` CI gate fails for ANY new diagnostics, or if either baseline source diverges. It does not silently skip type errors.
- Subsequent UI refinement `0b4d52db` keeps the full visitor list collapsed unless a visitor/population is selected; acceptance workflow run `39112435874` is pending at handoff update.
- This is not yet a browser-certified admin screenshot or a production deployment. Before merge, visually inspect pulse and its full-list disclosure on desktop and 320px mobile, visitor-detail clicks, traffic filter switches, empty/truncated cases.
- Existing backend first-play and signup conversion instrumentation remains incomplete: issue #73.

## Next work
1. Fresh Claude instance: read this handoff, `MOGZY_LAUNCH_ANALYTICS_SIGNUP_AUDIT_HANDOFF.md` (in ChatGPT artifact), USERS1/USERS2 handoffs and latest PRs. Inspect and test changes, fix all deficiencies in branch.
2. Separate Daily signup CTA PR BASED AFTER #69 resolves layout changes: guest-only nonintrusive save invitation at settled main Daily result, preserving Done for now, optional stages and upgrade UID. Add impression/click/dismiss/callback attribution with placement and return target.
3. Coordinate backend + Supabase Daily parent run lifecycle and truly joined first-play counters in isolated backend/frontend PRs. No deployment without approval.
