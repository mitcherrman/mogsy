# ADMIN-AUDIENCE-JOURNEYS — verification and repair handoff (2026-10-19)

## Scope
Continuation of the Lovable implementation `edc96f7d267e40ad4858bac97cbab0965dc318e3` ("Connected overview journeys", includes the PR #87 Feedback redesign). Nothing was rebuilt or redesigned. No product code, owner-only auth / MFA, database, or Railway backend was changed.

## Starting evidence (verified)
- `origin/main` HEAD was exactly `edc96f7d` when this work began; the Lovable commit is `main`'s tip.
- `AdminOverviewPage.tsx` imports and renders `OverviewVisitorJourneys` (added by that commit).
- Work was done in a fresh worktree from `origin/main` (the local `main` checkout was 642 commits behind and carries many untracked files from other workstreams; it was not touched).
- `AGENTS.md` read: no local installed-browser automation; browser verification belongs on GitHub Actions.

## Reproduced defects (local vitest, Admin + feedback + journeys + shell suites)
| Failing test | Cause (verified) | Fix |
|---|---|---|
| `AdminShell.areas.test.tsx` — 7 tests (Overview, attention queue, Arena/legacy absence, Overview-small, no archived area, Users under Overview) | `Error: No QueryClient set`. Overview now mounts `OverviewVisitorJourneys`, which uses `useQuery`; the harness rendered without a provider. `App.tsx:880` wraps the real app in `QueryClientProvider`, so production was not affected. | Wrap `renderAdmin` in a `QueryClientProvider` (`retry: false`). 62/62 pass. |
| `AdminFeedback.rfb.test.tsx` — "shows the reason and the player's own comment, kept apart" | Report body appears three times (collapsed row, "What did they report?" in the at-a-glance summary, and under "Player's comment"); the test still said two. The summary line existed before the Lovable commit (PR #87), so this predates it. | Assert three and assert one is inside `feedback-plain-summary`. 20/20 pass. |

## Failures investigated and NOT changed
- `admin-registry.routes.test.ts` (2): expects `roles={["master_admin"]}` on `premium-preview` and `/admin/knowledge`. `8253bf88` (2026-10-06) made `AdminRoute` a single owner gate (`useOwnerAuth`) and removed the prop; `App.tsx` is untouched by the Lovable commit. Stale tests, pre-existing, unrelated. Deliberately left so the owner-gate design is not second-guessed here.
- Windows-checkout artifacts: with `core.autocrlf=true`, `feedback/contract.test.ts` (5) failed on CRLF; re-checking out with LF made them pass. `AdminPlatformPolicies.test.tsx` compares `\\` vs `/` paths and still fails on Windows. Linux CI is the authority for these.
- Full local unit run (Windows): 180 failed / 18,285 passed across unrelated areas (Quiz, Pro Play/Worlds, lobby preview, source-scan guards that use Windows path separators, `/bin/sh` parser tests). My diff touches only two test files plus new CI/e2e files, so it cannot have caused them. They were not individually baselined against a Linux run; do not read this as proof they pass on CI.

## Acceptance criteria — where each is enforced
Unchanged product code already implements these; evidence is the existing unit tests (all passing locally) plus the new browser acceptance.
- Expandable histories with plain descriptions of recorded actions: `visitorJourney.ts` `describeJourneyEvent`, `OverviewVisitorJourneys.tsx`; `visitorJourney.test.ts`, `OverviewVisitorJourneys.test.tsx`.
- Guest / registered / unknown: `accountStatus` — registered/guest only with a current `admin_list_profiles` row; missing profile or failed lookup ⇒ unknown.
- Daily / Role / More Challenges only from explicit event evidence (`host`, `parent_activity_*`); route names are "page" location evidence only.
- Unknown exit/drop-off, incomplete Daily parent progress, and truncated reads are stated, not inferred.
- Feedback: who / when / where / question viewed in `feedback-plain-summary`; technical details in a closed `<details>`; denied read shows an alert, not an empty inbox.
- Owner-only gate, MFA step-up, privacy and admin actions: untouched (`AdminRoute`, `own1OwnerControlPlane.test.ts`).

## Verification run locally (no browser launched)
- Focused vitest: Admin, analytics, journeys, feedback, shell, academy-core suites — all pass except the items listed above.
- `npx vite build`: succeeded (5m35s). (`npm run build` also runs prerender scripts; not run locally.)
- `node scripts/ci/check-audience-typecheck.mjs`: "TypeScript: clean" vs main baseline.
- ESLint on changed test/e2e files: clean.
- The e2e fixture's projection was checked in vitest: guest ⇒ Guest, `u-reg` with profile ⇒ Registered, `u-missing` ⇒ "Guest or account status unverified — no current profile found", Daily child round ⇒ "Daily Challenge child round · stage 2".

## Browser verification (GitHub Actions only)
New workflow `.github/workflows/admin-audience-journeys.yml` + `playwright.admin-audience-journeys.config.ts` + `e2e/admin-audience-journeys/` run bundled headless Chromium on GitHub's runner at 320/390/1280px against the **real** `VisitorJourneysView` (fixture through the real projection) and the **real** `AdminFeedback` (Supabase REST intercepted at `e2e-supabase.test`; nothing reaches a real project). Results: **see the PR checks — not yet recorded here.**

## Limitations
- The real `/admin` Overview and Feedback routes were not rendered: they need the owner's MFA session, which no agent has. The harness proves component rendering, not the signed-in route. An owner smoke on the published site is still required.
- Journeys inherit existing data limits: no complete pre-signup history, no exit times, account-only server events are not attributed to browsers.
- Feedback profile name depends on `public_profiles`; a missing row reads "Reporter profile unavailable".

## Release state
- Branch `admin/audience-journeys-fix` pushed. PR must be opened from GitHub (`gh` and a token were unavailable in this environment).
- GitHub merge ≠ Lovable publish. After merge, the owner must confirm the Lovable project shows the new revision and publish it; verify `/admin` Overview and Feedback while signed in with MFA.
