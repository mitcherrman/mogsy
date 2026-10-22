# QI1 — Question Intelligence: handoff (frontend)

**Current state (2026-10-22, QI2 release review):** branch
`admin/qi2-integration-20261022` (worktree `C:\Users\mlmit\mogzy-wt\qi2-fe`)
= QI1 + main `0fd1bb6a` + the DREP1 split `b076f333` + review fix
`82af16f3`; draft PR mitcherrman/mogsy#117. **GO**, merge only after the
backend (#85) is live; then Lovable Publish. Not merged, not published.
Review fixes: the Avoidable column distinguishes `—` (nothing to split) /
`0` / `N?` (past the backend's read cap); the totals line states snapshot
coverage; served / answered / outcome counts are required by the parser
(refused as unreadable, never drawn as 0); admin-registry entry
`users-question-intelligence` (master_admin) makes the view findable in All
Tools. Full review, evidence and deployment sequence:
`QUESTION_INTELLIGENCE_QI2_PLAN.md` §6 (copy of the backend plan, in this
folder). The sections below describe the original QI1 pass; Evidence, Build
and Screenshots are brought up to date.

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

**QI2 release review (82af16f3):** QI set 77 passed (panel 13, parser 14,
notation 9, page 3, registry 36, IA guard 2). Admin-wide (`src/components/admin
src/pages/admin src/lib/admin src/test/guards`) 1,186 passed vs 1,147 on a
detached main `0fd1bb6a`, the same 7 pre-existing failures on both. tsc: the
same 2 pre-existing errors. ESLint clean. QI1 figures follow.

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

`npm run build` (never pnpm in worktrees) exited 0 on 1940a98b and again on
82af16f3: vite build, prerender and the 173-URL sitemap verify passed; the
panel ships in the `AdminUsersPage` chunk. The rewritten
`public/sitemap.xml` was restored afterwards.

## Screenshots

**Captured 2026-10-22 (owner-approved local run, AGENTS.md exception):**
bundled headless Chromium (headless shell 1248) on the owner's PC, 1 worker,
3 cases (1280 / 1440 / 1920), fixture harness, no visible window; the
Playwright-owned dev server was torn down. **3/3 passed.** Files (git-ignored):
`test-results/question-intelligence/qi1-{1280,1440,1920}.png`, the
`-cell-hover` variants and `qi2-{1280,1440,1920}-drep1-partial.png`.

The shared `@swc/core` fails here, so the run used an uncommitted local
config that imports `playwright.question-intelligence.config.ts` and swaps
only the dev-server command for a no-swc scratch Vite config. On a normal
machine or in CI:

```bash
npx playwright test -c playwright.question-intelligence.config.ts
```

## Open / next

- Merge after the backend (#85) is live; then Lovable Publish. Order and
  checks: `QUESTION_INTELLIGENCE_QI2_PLAN.md` §6.6.
- Until the backend is live, the view shows "could not be reached" / an HTTP
  error, never an empty table.
