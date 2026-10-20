# DAILY-SAVE1 — Guest save invitation (dependent on F05 PR #69)

Objective: offer an optional, free account upgrade on the **main** Daily result so a player who clicks Done for now still has a chance to save the already-earned Daily score.

Base: PR #69 branch `fix/misc-w3a-daily-mobile` at 89aa136ec5516d08bc343717502f0147cfcb30ae. Draft child PR targets that branch; do not merge until parent mobile acceptance is green.

Files:
- `DailyMainResult.tsx`: guest-only compact reserved invitation after the main score settles; existing ResultActions and optional play untouched.
- `DailyRunPage.tsx`: true anonymous-session guest check, existing authHref signup path with returnTo=/quiz/daily-challenge.
- `analytics/contract.ts`: `signup_offer_shown` and `signup_offer_clicked` telemetry distinct from `signup_viewed` and `signup_completed`.
- `DailyMainResult.signup.test.tsx`: guest, registered, pending/settled, click event.

No auth identity or Daily mutation changed; guest upgrade is still in-place (same Supabase UID).
No live deployment or Supabase changes.
Risks: F05 mobile density acceptance must be remeasured with guest eligibility true; focus and aria on 320x568; auth round-trip to Daily; impression is a rendered offer, not proof of viewport exposure. Verify analytics ingest accepts new product event names.
Next: run focused Vitest/typecheck/browser mobile, then retarget after #69 merges, QA guest account upgrade E2E.
