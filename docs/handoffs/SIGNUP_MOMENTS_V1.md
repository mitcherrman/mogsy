# SIGNUP-MOMENTS-V1 — handoff (2026-10-18)

## Objective
Improve new-visitor registration prompts while keeping Mogzy guest-first. This is a follow-up **draft PR only**, NOT part of the just-approved live release.

## Verified current baseline
GitHub main at 1394b7ae52e84f0bca855562745b5b0316b18034 (no-op commit, tree equals release 0f2adb93). Live QA already proved Daily main complete → save prompt → same-UID permanent account → Daily score retained.
Prompt inventory:
- Header: quiet Sign up chip for guests.
- Practice: soft nudge after 3 cumulative answered questions; hard **dismissible** gate only after completed quiz once 5 total answers reached.
- Ranked: account required on Play.
- Daily: nonblocking guest-only offer after standard/main score.
- Daily final optional recap: **full-screen, non-dismissible** old signup gate duplicated the earlier offer.

## V1 changes
1. Daily final recap becomes a guest-only **inline** save invitation. No portal / forced modal, preserves entire result recap, Back to Leaguecraft and More Challenges, uses existing authHref `returnTo=/quiz/daily-challenge`, same UID upgrade untouched. Analytics `signup_offer_shown/clicked` tagged `daily_final_recap`.
2. Practice soft nudge emits `signup_offer_shown/clicked/dismissed` placement-tagged `practice_soft_nudge`. No extra interrupt and no new auth behavior.
3. Practice completion gate remains dismissible but is capped at once per 24h (localStorage timestamp); successful signup clears cooldown. Prevents resurfacing stale soft nudge right after closing completion gate.
4. Existing header chip and Ranked account requirement untouched.

## Constraints
- This V1 proposes changing the old *explicit* Daily final no-dismiss owner policy; do not merge without owner review. Inline CTA is not a drop in Daily eligibility or gameplay scoring.
- For analytics, `signup_offer_shown` means rendered, not viewport exposure; do NOT call it a viewed human impression. All events browser-side and non-authoritative; real signup count must use registered auth state.
- No DB changes, no premium offers, no UX copy claiming a Daily streak exists, no fingerprinting.
- Not guaranteed conversion optimization; requires measurement and cautious rollout.
- Other PRs: #68 Play mobile CSS, #46 Journey UI, #45 role question, #44 Dynasty. No direct changed-file overlap as of 2026-10-18.

## Tests
Unit: Practice nudge events + return target, 24h cooldown, Daily final CTA/gating and legacy/v5 compatibility.
Browser: isolated actual DailyCompletion 320×568, 390×844, desktop; recap, account link, exit links accessible and no viewport overflow.
CI: `.github/workflows/signup-moments-v1.yml` focused tests, Vite compile, baseline-only TypeScript checker, Chromium browser acceptance.
Status: tests PENDING first run.

## Next
Review CI errors and fix only scoped behavior. Owner accepts or rejects Daily final forced-gate policy change. After release of current frontend build is confirmed, merge this separately; monitor actual registration via auth.users, not merely signup event counts. Issue #73 remains responsible for authoritative first-game attribution.
