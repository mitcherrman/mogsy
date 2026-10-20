# QI1 — Question Intelligence: handoff (frontend)

**State (2026-10-20):** local branch `admin/question-intelligence-qi1`
(worktree `.claude/worktrees/intelligent-grothendieck-937b71`), base
`origin/main` f6835049. Not pushed, no PR, not merged, not published.
Backend pair: League_Combat_Simulator branch `analytics/question-intelligence-qi1`
(`C:\Users\mlmit\lcs-qintel`, 08e82986 + handoff b064e0d0) — read its
`QUESTION_INTELLIGENCE_AUDIT.md` for the table/column audit.

## Where it lives

Admin › Users › Audience (the former Analytics page) → sub-tab
**Question Intelligence** (`/admin/users?section=audience&view=questions`).
Owner-only: the sub-tabs render only for `isMasterAdmin`, and a non-owner
deep link falls back to the traffic dashboard. It is a view, not a fourth
Users section, because `src/test/guards/users2AudienceIa.test.ts` pins Users
to Audience / Accounts / Moderation.

It reads Railway (`GET /api/admin/question-intelligence`) through
`ADMIN_API_BASE_URL` + `buildAdminHeaders`, like the Daily history read.
Supabase `analytics_events` has no per-question fact, so nothing here touches
`loadAnalytics`.

## Notation

- `A1` — row label in the current view (sort/filters/page), always shown
  beside the canonical ref it stands for. Page 2 continues at `A51`.
- `A1.4` — the 4th DISPLAYED option of A1 (randomized order preserved).
- Grid: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right; a two-option
  Meta Reflex card is 1 left, 2 right; >4 options keep rows of two.

## Files

- `src/lib/admin/questionIntelligence/notation.ts` (+ test) — labels, parser, position→cell.
- `src/lib/admin/questionIntelligence/api.ts` (+ test) — types, strict parser, fetch, errors.
- `src/lib/admin/questionIntelligence/view.ts` — default filters, dominant option count.
- `src/lib/admin/__fixtures__/question-intelligence-v1.json` — the backend golden, verbatim.
- `src/components/admin/users/QuestionIntelligencePanel.tsx` (+ test) — filters, table, hover-synchronised side panel, pin, paging.
- `src/pages/admin/areas/AdminUsersPage.tsx` (+ `AdminUsersPage.questions.test.tsx`) — the owner sub-tab.
- `e2e/question-intelligence/*`, `playwright.question-intelligence.config.ts`,
  `.github/workflows/question-intelligence.yml` — 1280/1440 capture on fixture data.

## Evidence

- `npx vitest run src/lib/admin/questionIntelligence src/components/admin/users/QuestionIntelligencePanel.test.tsx src/pages/admin/areas/AdminUsersPage.questions.test.tsx` → 31 passed.
- Admin-wide run (`src/components/admin/users src/lib/admin src/pages/admin src/test/guards`):
  1011 passed, 7 failed — the same 7 fail on clean `origin/main` (registry
  routes ×2, noStaticLeagueFacts, users1AudienceIdentity ×2,
  AdminPlatformPolicies, AdminQuizReview.proPlay); none touch QI1.
- `tsc -p tsconfig.app.json`: only the 2 pre-existing errors
  (OnboardingProfile.tsx, identity/connections.ts). ESLint clean on QI1 files.
- `npm run build`: see "Build" below.
- Screenshots: see "Screenshots" below.

## Build

`npm run build` (never pnpm in worktrees) exited 0 on 1940a98b: vite build,
prerender and the 173-URL sitemap verify passed. The rewritten
`public/sitemap.xml` was restored afterwards.

## Screenshots

**PENDING owner approval.** AGENTS.md forbids local browser automation
without explicit approval, and GitHub Actions is billing-blocked. The request
(one bundled headless Chromium run, 1 worker, 1280 + 1440, fixture harness)
is with the owner. Once approved or once Actions works, run:

```bash
npx playwright test -c playwright.question-intelligence.config.ts
```

That writes `test-results/question-intelligence/qi1-{1280,1440}.png` and the
`-cell-hover` variants. In CI, the `question-intelligence` workflow uploads
them as an artifact. Nothing was captured in this pass.

## Open / next

- Owner review of the panel; push + PR on approval (Actions billing needed for CI).
- Backend must deploy before the panel has data; until then the view shows
  "could not be reached" / an HTTP error, never an empty table.
