# NAV1 — Back / Navigation Semantics Audit

## Objective
Audit Mogzy's browser Back behavior and every in-product Back/Home/Parent/Close/Cancel/Exit navigation path. Produce an explicit route/state contract before changing product code.

The problem is contextual: fixed parent links, temporal browser history, local component state, auth returnTo, hosted Ranked/Daily flows, and full-document redirects currently coexist. A destination that is correct from one entry path can be wrong from another.

## Base / ownership
- Repository: `mitcherrman/mogsy`
- Audit branch: `nav1/back-navigation-audit`
- Base: `main@4b3be0cbe2767d3107f4462082755066b26b398b`
- Audit first. Do not modify product behavior until the inventory and policy matrix are complete.
- Keep NAV1 independent of active Daily/History/Practice work. One later integration pass owns shared-file reconciliation.

## Important current findings

### 1. Home is not Back
`GlobalHud` deliberately defines Mogzy's top-left hat as Home and always links to `LEAGUE_HOME_ROUTE`, currently `/lol`.
Relevant:
- `src/components/hud/GlobalHud.tsx`
- `src/components/Layout.tsx`
- `src/lib/site-config.ts`

Do not change the Home contract merely to make it behave like Back. The audit must distinguish:
- Home: fixed product home
- Parent/Up: fixed structural ancestor
- Back: inverse of a meaningful prior navigation
- Exit/Leave: abandons an active flow
- Close/Cancel: dismisses transient UI without changing page hierarchy

### 2. Definite bug: Settings points Back to a nonexistent route
`src/pages/Settings.tsx` uses `navigate("/home")` for its “Go back” button.
`src/App.tsx` has no `/home` route. Root `/` is the Mogzy entry; product home is `/lol`.

### 3. Raw temporal Back is used without a safe fallback
`src/pages/Profile.tsx` and `src/pages/UserProfile.tsx` use `navigate(-1)`.
That behaves differently for internal entry, auth return, direct links, bookmarks, new tabs, and external referrers. Inventory every such use.

### 4. Leaguecraft’s major quiz phase is local state, not browser history
`src/pages/Quiz.tsx` keeps `QuizPhase` in component state:
- sets
- loading-questions
- active
- result

Starting/completing a practice session changes `phase` without changing route/history. Therefore browser Back from an active/result view can leave `/quiz` rather than undo the meaningful Leaguecraft transition.

Do NOT solve this by adding a history entry per question. The audit must define the correct granularity of meaningful states.

### 5. Leaguecraft workspace already demonstrates the desired URL-history pattern
`src/components/quiz/LeaguecraftHub.tsx` uses URL hashes for History/Review/Trends and explicitly pushes tab changes so browser Back reverses the tab switch. It avoids pushing an identical hash twice.

This is a canonical positive example to preserve/generalize.

### 6. Ranked has a structural parent link, but active-session browser Back needs explicit policy
`src/pages/quiz-ranked/RankedRouteHeader.tsx` always links “Back to Quiz” -> `/quiz`.
`src/pages/quiz-ranked/QuizRankedPage.tsx` correctly uses `replace` for recovery/no-match redirects and preserves auth returnTo.

`src/pages/quiz-ranked/QuizRankedMatch.tsx` says route changes, close, reload, and network loss cannot communicate deliberate forfeit; only the explicit Forfeit control can. Audit whether browser Back / header Back during an active Ranked match can silently abandon the route and what product semantics should be.

Hosted Daily children deliberately suppress Ranked’s own Forfeit/rules/end screen. Preserve that host boundary.

### 7. Ranked terminal actions use full-document navigation
`src/pages/quiz-ranked/QuizRankedMatch.tsx` uses:
- `window.location.assign("/quiz?play=1")`
- `window.location.assign("/quiz#history")`
- `window.location.assign("/quiz")`
- `window.location.assign("/quiz#review")`

Audit whether each should PUSH, REPLACE, or intentionally reload. In particular, browser Back after leaving a completed match should not accidentally resurrect a stale terminal game route unless that is a deliberate contract.

### 8. Daily is one route with server/component stage state
`src/pages/quiz-daily-challenge/run/DailyRunPage.tsx` uses `/quiz/daily-challenge` for the entire run and hard-codes “Back to Leaguecraft/Quiz” -> `/quiz`.
Stage movement is not browser history and should probably not become rewindable history. Audit active-run browser Back as an Exit/Leave concern, not as stage rewind.

`DailyStageResult` correctly offers Continue only; hosted child matches do not expose Ranked’s own back/end behavior.

### 9. Welcome/auth flows contain deliberate, good history semantics
Preserve unless a test proves otherwise:
- `MogzyEntryV2` exits with `replace`.
- `AcademyWelcomePage` intentionally keeps chapters in local state; in-app Back moves chapters, browser Back leaves the route; final exit uses `replace`.
- `Auth.tsx` / `AuthCallback.tsx` validate `returnTo` and use `replace` after auth so completed auth screens do not remain behind the destination.

These are reference implementations for PUSH vs REPLACE intent.

### 10. Other likely contextual-origin problems
Audit especially:
- `src/pages/LolHistory.tsx`: hard-coded Back -> `/lol`, despite the canonical Leaguecraft History pane existing at `/quiz#history`.
- `src/pages/LolMissedQuestions.tsx`: hard-coded Back -> `/lol/history`.
- `src/pages/LolPremium.tsx`: hard-coded Back -> `/lol`, though upgrade entry can originate from Leaguecraft, Combat Lab, Profile, etc.
- Docs / Pro Play / Meta Reflex: many fixed parent links are probably correct structural “Up” navigation, but must be classified rather than blindly converted to `navigate(-1)`.
- Cross-linked detail pages can be entered from more than one parent and need a deterministic policy.

## Known good patterns
- URL-addressed meaningful state where refresh/deep link/back should agree.
- PUSH for meaningful view changes.
- REPLACE for non-semantic filter tweaks, redirects, recovery, and completed auth interruption.
- Validated `returnTo` for flows that survive document/auth round trips.
- Destination-named structural links (“Champion Index”, “Pro Play”, “Leaguecraft”) rather than ambiguous generic Back.
- Host-owned child navigation in Daily -> Ranked composition.

Examples:
- Leaguecraft workspace hash navigation.
- Pro Play Graphs: graph/focus changes push; control tweaks replace.
- Pro Play Matchup: URL is state.
- Auth returnTo.
- Daily hosted Ranked boundary.

## Audit taxonomy
Classify every navigation control/transition as one of:
1. HOME — fixed `/lol`.
2. TEMPORAL_BACK — undo prior meaningful navigation.
3. STRUCTURAL_PARENT — fixed parent/up link.
4. HOST_RETURN — child returns to parent orchestrator.
5. EXIT_ACTIVE_FLOW — leave Ranked/Daily/other transactional session.
6. CLOSE_TRANSIENT — modal/drawer/overlay close.
7. CANCEL_FLOW — abort a multi-step flow.
8. REDIRECT_RECOVERY — automatic correction/recovery.
9. TERMINAL_FORWARD — completed session -> next destination.
10. AUTH_DETOUR — validated returnTo round trip.

For each transition record:
- source route + visible state
- all legitimate entry origins
- visible label/icon
- implementation (`Link`, `navigate()`, `navigate(-1)`, hash/search params, `window.location.*`, redirect)
- browser history effect (push / replace / none / reload)
- expected browser Back result
- expected in-app Back result
- refresh/deep-link behavior
- active/unsaved server state
- mobile swipe/system Back implications
- direct-link fallback
- collision owner / active workstream
- severity + recommended policy
- tests required

## Exhaustive code-search requirements
The GitHub connector’s code-search index returned no matches even for known strings, so certification MUST be done locally with `rg` from a clean worktree. Search at minimum for:
- `navigate(-1`
- `navigate(`
- `window.location`
- `history.back`, `history.go`, `pushState`, `replaceState`
- `<Link`, `to=`, `href=`
- `setSearchParams`, `replace: true`
- `ArrowLeft`, `ChevronLeft`
- UI copy: `Back`, `Return`, `Home`, `Exit`, `Leave`, `Cancel`, `Close`
- route guards / redirects / auth `returnTo`
- React Router blockers / beforeunload listeners

Exclude generated/vendor files, but include user-facing pages/components, auth, layout, route helpers, admin if its navigation is user-visible to the owner, and e2e/unit tests.

## Workstream collision map
### HIGH collision — audit now, defer edits until owner work lands
- `src/pages/Quiz.tsx`
- `src/components/quiz/LeaguecraftHub.tsx`
- `src/components/quiz/workspace/*`
- History/Review/Trends and Daily-history presentation
Reason: current Quick Study/Practice and History analytics work owns these surfaces.

### MEDIUM/HIGH collision — audit now, contract/tests first
- `src/pages/quiz-daily-challenge/run/*`
- `src/pages/quiz-ranked/*`
- shared Ranked arena host boundaries
Reason: Daily/Journey was just integrated and PLAYTEST/Ranked work reads the same lifecycle.

### LOW collision — likely first implementation lane after audit
- `src/pages/Settings.tsx`
- `src/pages/Profile.tsx`
- `src/pages/UserProfile.tsx`
- shared navigation helper/tests in new files
Reason: obvious navigation defects with little overlap with Daily/History/Practice.

### HIGH collision for rehome decisions
- `src/pages/LolHistory.tsx`
- `src/pages/LolMissedQuestions.tsx`
Reason: History analytics/design is active; do not delete/redirect these until that workstream’s final IA is known.

### LOW/MEDIUM
- `src/pages/LolPremium.tsx`
Potential provenance fix, but first inventory every Premium entry CTA.

### Prefer no changes
- Auth returnTo code
- Welcome/entry history behavior
unless the exhaustive audit identifies a reproducible defect.

## Proposed product contract to validate
Do not implement until audit proves all cases.

1. “Home” always means `/lol`; it is never a substitute for Back.
2. A control called “Back” should reverse the last meaningful product navigation when that prior context is known.
3. A fixed structural destination should be named by destination, not presented as generic temporal Back.
4. Never rely on raw `navigate(-1)` as the only behavior for a direct-linkable page. Use explicit provenance with a deterministic fallback.
5. Do not push browser entries for transient filters, loading states, individual quiz questions, or every Daily stage.
6. Meaningful state changes that users reasonably expect Back/Forward to traverse should be URL/history-addressable.
7. Active server-backed gameplay needs an explicit leave policy. Browser Back must not silently mean “forfeit” unless the UI says so.
8. Terminal game exits should not leave stale completed gameplay as an accidental Back destination unless intentionally supported.
9. Internal SPA transitions should not use `window.location.assign` without a documented reason.
10. Auth keeps its validated `returnTo` model; do not replace it with generic history popping.

## Likely architecture after audit
Prefer a small navigation contract rather than per-page patches:
- explicit `from` / return provenance for contextual pages
- safe fallback destination
- shared helper/hook for contextual Back
- separate active-flow leave guard
- existing validated auth `returnTo` remains independent
- URL/hash/search state for meaningful reversible view state
- route/state tests encode the matrix

Do NOT propagate arbitrary unvalidated return URLs. Same-origin relative route validation should be shared with or equivalent to existing auth-safe-return rules.

## Certification matrix
At minimum test each relevant surface from:
- canonical parent entry
- cross-link entry
- direct URL/new tab
- browser refresh
- after auth detour
- browser Back
- browser Forward
- in-app Back/parent control
- terminal result exit
- mobile back swipe / system-back equivalent where supported

For active gameplay also test:
- Back during unanswered round
- Back during reveal
- Back during stage transition
- Back at terminal result
- reload/close policy separately from SPA Back
- Daily-hosted Ranked child vs standalone Ranked

Use unit/MemoryRouter tests for route-state semantics and Playwright for real browser history. The repo currently has react-router-dom ^6.30.1, Vitest ^3.2.4, and Playwright ^1.61.1.

## Current state
Completed:
- reviewed current route topology and representative navigation code on main
- identified definite Settings `/home` bug
- identified raw temporal Back on Profile/UserProfile
- identified Leaguecraft local-phase/browser-history mismatch
- identified known-good hash/query PUSH/REPLACE patterns
- traced Ranked/Daily host and terminal navigation
- reviewed auth/welcome history semantics
- reviewed representative Docs, Pro Play, Meta Reflex, History, Premium navigation
- mapped current workstream collision zones
- created this audit-only branch/handoff
- completed the exhaustive static audit and route/state matrix; see
  [`NAV1_NAVIGATION_MATRIX.md`](./NAV1_NAVIGATION_MATRIX.md)
- verified all seed hypotheses against `main@4b3be0cbe2767d3107f4462082755066b26b398b`
- found two additional invalid-route risks: Reset Password's `/home` fallback,
  and a likely-live-check-required `/profile/:id` sender despite the public
  profile route being `/user/:profileId`

Not yet completed:
- volatile NAV1-C+ implementation (Premium, Practice, Ranked, Daily, History)

## NAV1-A/B implementation status

Completed on this branch after the audit:

- **NAV1-A:** added `useSafeTemporalBack(fallback)` and
  `hasUsableMogzyHistory()` in `src/lib/navigation/useSafeTemporalBack.ts`.
  The helper uses React Router 6.30's router-owned `window.history.state.idx`:
  `idx > 0` performs a true POP; direct/new-tab/external initial entries use a
  validated internal fallback with REPLACE. Refresh preserves a valid positive
  index and therefore preserves a real Mogzy predecessor. Unsafe fallbacks fail
  closed to `/lol`. No route stack, storage, referrer, or global interceptor was
  introduced; auth `returnTo` remains independent.
- **NAV1-B:** Settings, Profile, both UserProfile controls and Secret Room now
  use safe temporal Back with `/lol` as the direct-entry fallback. Password
  reset success now uses `/lol` instead of nonexistent `/home` when no safe
  explicit `returnTo` exists; its completion still REPLACEs the reset entry,
  while invalid/expired reset links still return structurally to `/auth`.
- Added focused Vitest integration/call-site tests and a frontend-only
  Playwright configuration/spec. Chromium certifies internal/direct Profile,
  internal/direct UserProfile, Settings internal/direct, and normal Forward
  after the in-app Back including query/hash preservation.

Deferred P1s are unchanged: active Ranked leave semantics, active Daily leave
semantics, Practice session/history boundaries, and Ranked terminal navigation.
NAV1-C now resolves Premium's contextual return without touching History IA.

## Audit conclusion

The owner report is not one bug. Mogzy currently mixes five valid mechanisms
(fixed Home, structural parent links, auth return destinations, URL-addressed
workspace state, and component-local gameplay) with three unsafe gaps: raw
history popping on direct-linkable profiles, active-flow exits with no leave
contract, and terminal/local state that browser history cannot represent.

The audit found **0 P0 and 7 P1 findings**. NAV1-B resolves the first three
(Settings/reset `/home`, Profile/UserProfile raw temporal Back); four volatile
P1s remain. The complete matrix, raw-history list,
`window.location` write inventory, provenance list and owner questions are in
[`NAV1_NAVIGATION_MATRIX.md`](./NAV1_NAVIGATION_MATRIX.md).

The base remains appropriate: after `git fetch origin --prune`, `origin/main`
is still `4b3be0cbe2767d3107f4462082755066b26b398b`, the exact NAV1 merge base.

## Product navigation contract

1. **Home** is always `/lol`. The HUD hat stays Home and must not become Back.
2. **Temporal Back** is used only when the preceding entry is known to be a
   meaningful Mogzy location. A direct-linkable page must have a deterministic
   fallback.
3. **Contextual Back** carries a validated same-origin relative origin plus a
   route-specific fallback. Router state is preferred for an SPA round trip;
   validated query state is reserved for provenance that must survive refresh,
   auth, or a document detour.
4. **Structural Parent** is fixed and destination-named: “Champion Index”,
   “Pro Play”, “Leaguecraft”, not a generic “Back”.
5. **Direct-link fallback** never consults `document.referrer` and never pops
   unknown history. Use the page's declared safe parent/home.
6. **PUSH** only for meaningful reversible views: workspace panes, selected
   graph/focus/entity, and session entry when a user reasonably expects Back
   to leave/undo that session.
7. **REPLACE** for canonical redirects, invalid/recovery correction, URL
   normalization, transient control/filter changes, completed auth, and an
   acknowledged terminal exit that must not resurrect stale gameplay.
8. **LOCAL** for modals, drawers, confirms, individual questions/answers,
   welcome chapters, and Daily/Ranked stages. Do not create one entry per
   question or stage.
9. **Active gameplay** has a dedicated leave contract. Browser Back and an
   in-product exit converge on the same confirmation, but leaving is not
   forfeit. Only the explicit confirmed Ranked Forfeit sends the server command.
10. **Terminal gameplay** uses SPA navigation. Once a user chooses an exit or
    next action, prefer REPLACE so Back cannot resurrect a stale terminal
    controller; preserve a terminal result only when product explicitly wants
    it revisitable.
11. **Full reload** is limited to external checkout/provider/OS handoffs and
    documented chunk recovery. Internal Mogzy routes use React Router.
12. **Auth** keeps its separately validated `returnTo` interruption contract.
    Ordinary Back provenance must not weaken or overload it.

## Smallest coherent architecture (proposal only)

- A typed `NavigationOrigin`/`ContextualBack` primitive that accepts an allowed
  relative origin and an explicit fallback. It must reuse the safety properties
  of `safeReturnPath` without making auth and ordinary Back the same concept.
- A route policy table for fallback and label, small enough to review; no Redux,
  fake global stack, or arbitrary stored URLs.
- An `ActiveFlowLeaveGuard` abstraction around React Router blocking plus a
  flow-owned confirmation callback. Ranked, Daily, Stat Check and Team Sim can
  share interception mechanics but keep different server semantics and copy.
- URL state only at meaningful session/view boundaries. Practice gets at most a
  session-level marker/identifier; question/reveal state remains local.
- A terminal-navigation helper that makes PUSH versus REPLACE explicit and
  prohibits internal `window.location.assign` by test/lint assertion.

## Workstream collision map (verified 2026-09-26)

| Area | Evidence | Conflict |
|---|---|---|
| Leaguecraft History/Review/Daily history | `hub4/history-frontend`, `hub5/timmy-history`, `histd/mobile-review-reliability`, `hub6/ranked-hub-visuals` all have 2026-09-25/26 commits | HIGH; block rehome and shared workspace edits |
| Practice / Study Hall / Quiz Forge | `sh11*`–`sh13*`, `envvis1-batch1-scene-channel`, recent `qf1/*`; overlaps `Quiz.tsx`, workspace and question surfaces | HIGH |
| Daily | `dclane-c`, `dcsurv`, `dcmod/*`, HUB6; overlaps run controller/chrome/results | HIGH |
| Ranked / PLAYTEST | active Ranked/history work and `play0/director-audit`; overlaps match terminal and host lifecycle | MEDIUM/HIGH |
| Journey / Mastery | `journey-*`, `jenh/*`, `jm1/*`, `jx2/*` dated 2026-09-25/26 | HIGH for mastery player/shared arena; otherwise no NAV1 foundation overlap |
| USERS2 analytics | integrated on current main; current branches touch lifecycle/analytics, not navigation policy except event continuity | LOW/MEDIUM; retain events while editing navigation |
| Pro Play | `pse1/unified-explorer` and current local Pro work | MEDIUM; preserve proven URL contract |
| Settings/Profile/UserProfile/auth helpers | no recent feature branch evidence touching the exact controls | LOW; safest first implementation lane |

Old branch existence alone was not treated as active; dates, handoffs and actual
surface overlap were used.

## Exact implementation batches

### NAV1-A — policy primitives and history tests

Files: new `src/lib/navigation/*`, new unit tests, Playwright navigation fixture/spec.
Content: safe contextual origin, fallback policy, terminal PUSH/REPLACE API;
tests for malicious/external origin and real Back/Forward.
Conflicts: LOW. Depends on: owner approval of the contract, not gameplay copy.
Parallel/cherry-pick: **yes**, independent instance; land first.

### NAV1-B — low-conflict account navigation

Files: `Settings.tsx`, `Profile.tsx`, `UserProfile.tsx`, `SecretRoom.tsx`,
`ResetPassword.tsx` and focused tests.
Content: remove `/home`, replace raw `-1`, add deterministic fallback.
Conflicts: LOW. Depends on: NAV1-A and reset fallback decision.
Parallel/cherry-pick: **yes** after A API is frozen; can be developed in parallel
on top of A and cherry-picked.

### NAV1-C — Premium contextual return (implemented)

The sender inventory changed the proposed design. Every LOW-conflict sender
already uses React Router navigation and therefore creates the exact history
entry Premium needs: the Home panel and mobile bulletin use `Link`, Profile uses
`navigate`, and house ads render an internal `Link`. Combat Lab and Team Sim
also use `Link`; they are MEDIUM collision and need no edit. Adding a parallel
`from` channel would create two sources of truth without preserving anything
that router history does not already preserve.

`LolPremium.tsx` now uses `useSafeTemporalBack('/lol')`. Internal entries POP
to the exact sender, refresh retains the router-owned positive index, and a
direct/new-tab/external initial entry REPLACEs to `/lol`. Legacy `/lol/pro` and
`/pro` aliases still canonicalize with REPLACE and preserve search/hash.

Sender classification:

- **LOW:** Home Premium panel and bulletin, Profile, and house ads. All were
  already SPA senders; no sender edit was required.
- **MEDIUM:** Combat Lab and Team Sim failure. Both already use `Link`; no edit,
  avoiding ENVVIS/Journey overlap.
- **HIGH-DEFER:** Practice Builder, Study History, Missed Questions Review and
  Performance Trends. The first and last still use full-document anchors, but
  they live in the explicitly frozen Practice/History workspace. They receive
  deterministic `/lol` fallback after a document load until that owner converts
  them to SPA links. No volatile workspace file was touched.

Complete production entry inventory (10 rendered sender call sites, plus
canonicalization and interruption returns):

| Sender | Surface / label | Mechanism and history | Conflict | NAV1-C action |
|---|---|---|---|---|
| `components/lol/HubPremiumPanel.tsx` | `/lol` desktop slip, “Explore/View Premium” | `Link` via shared presentation; PUSH | LOW | None needed |
| `components/lol/AcademyBulletin.tsx` | `/lol` mobile bulletin, “Explore/View Premium” | `Link` via shared presentation; PUSH | LOW | None needed |
| `pages/Profile.tsx` | profile customization, “Go Premium” | `navigate('/lol/premium')`; PUSH | LOW | None needed |
| `lib/ads/houseAds.ts` + `components/ads/AdSlot.tsx` | eligible house-ad placements, “Upgrade to Premium” | creative rendered as `Link`; PUSH | LOW | None needed |
| `pages/CombatLab.tsx` | exhausted free usage, “Upgrade to Mogzy Premium” | `Link`; PUSH | MEDIUM (ENVVIS/Journey) | None needed; no overlapping edit |
| `pages/dev/team-sim/components/FailureNotice.tsx` | Premium-required Team Sim failure, CTA | `Link` through `PREMIUM_ROUTE`; PUSH | MEDIUM (ENVVIS/Journey) | None needed; no overlapping edit |
| `components/quiz/builder/PracticeBuilderPanel.tsx` | Practice Builder gate, “See Mogzy Premium” | raw `<a href>`; full reload | HIGH (Practice/Study Hall) | Deferred |
| `components/quiz/workspace/MissedQuestionsReview.tsx` | Review gate, “Upgrade to Mogzy Premium” | `Link`; PUSH | HIGH (History/Review) | Deferred; already correct mechanism |
| `components/quiz/workspace/StudyHistoryLedger.tsx` | History gate, “Unlock Full History” | `Link`; PUSH | HIGH (History) | Deferred; already correct mechanism |
| `components/quiz/trends/PerformanceTrendsPane.tsx` | Trends gate, CTA | raw `<a href>`; full reload | HIGH (History/Trends) | Deferred |

`LegacyPremiumRedirect.tsx` additionally maps `/lol/pro` and `/pro` to the
canonical route with REPLACE. `LolPremium.tsx`'s auth return and
`lib/pro/checkout.ts`'s Stripe success/cancel URLs are interruption re-entries,
not ordinary product senders; their existing semantics are unchanged. There
were no LOW-conflict full-document senders to convert in this batch.

Auth and Stripe remain separate contracts. Auth still validates and returns to
`/lol/premium`; Stripe still performs an intentional external navigation and
returns to `?success`/`?canceled`. Those document detours do not claim to recover
the pre-Premium sender, so Premium safely falls back to `/lol` afterward.

### NAV1-D — terminal internal navigation

Files: `QuizRankedMatch.tsx`, `PlaytestMatchHost.tsx`, result policy tests.
Content: replace internal full reloads, apply terminal REPLACE policy.
Conflicts: MEDIUM/HIGH Ranked/PLAYTEST. Depends on: NAV1-A and terminal owner
decision.
Parallel/cherry-pick: **yes as a dedicated owner**, but do not cherry-pick until
current Ranked/PLAYTEST branches reconcile.

### NAV1-E — Practice session boundary

Files: `Quiz.tsx`, possibly a small practice-session route/state module, tests.
Content: one meaningful session boundary; active leave handling; no history per
question; SPA result Review.
Conflicts: HIGH. **BLOCKED** until Practice/Study Hall/Quiz Forge integration.
Parallel/cherry-pick: **no** against active shared-file work; rebase and single
owner integration required.

### NAV1-F — Ranked/Daily active-flow leave policy

Files: shared leave-guard UI/hook, `QuizRankedPage/Match/RankedRouteHeader`,
Daily run page/chrome, server-lifecycle tests.
Content: browser/system Back interception, truthful leave copy, retain explicit
Forfeit separation and Daily host ownership.
Conflicts: HIGH. **BLOCKED** on owner answers and current Daily/Ranked work.
Parallel/cherry-pick: mechanics can be prototyped independently after A, but
surface integrations must be one coordinated batch.

### NAV1-G — History IA reconciliation

Files: `LolHistory.tsx`, `LolMissedQuestions.tsx`, Leaguecraft workspace links,
redirects only if approved.
Conflicts: HIGH. **BLOCKED** until HUB/History work declares canonical IA.
Parallel/cherry-pick: **no** before that handoff; afterward a discrete batch.

### NAV1-H — secondary active flows and dead-route cleanup

Files: Stat Check room, Team Sim navigation shell, `RecentMatchups.tsx`,
`NavBanner.tsx`, route-contract tests.
Content: verify reachability, fix only live invalid routes, apply flow-specific
leave semantics.
Conflicts: MEDIUM. Depends on: A/F mechanics, PLAYTEST/ENVVIS ownership.
Parallel/cherry-pick: **yes** as isolated sub-batches after ownership check.

Recommended next implementation task: **NAV1-A, then NAV1-B**. It resolves the
unambiguous P1 account-navigation defects without entering the active
Daily/History/Practice collision zones.

## Certification plan

Vitest/MemoryRouter must cover policy validation, direct-entry fallback,
pathname+search+hash preservation, duplicate suppression, PUSH vs REPLACE,
auth separation, recovery redirects and each route's declared fallback.

Playwright must exercise real history for: parent→child→Back→Forward; cross-link
detail Back; direct/new-tab visible Back; external-referrer containment; refresh
then Back; auth detour then Back; workspace hash traversal; Practice result→
Review and Play Again; Ranked result actions; active Ranked unanswered/reveal;
active Daily intro/play/reveal/result; Daily-hosted Ranked; completion exits;
and mobile viewport/system-history equivalents. Assertions must check rendered
state and history behavior, not merely `href`.

## Audit mechanics and counts

Static searches excluded dependencies, build output, coverage and generated
reports, and included `src`, unit tests and `e2e`. The audit used `rg` for all
requested primitives/copy, `App.tsx` route enumeration, targeted handoff reads,
`git for-each-ref`, branch dates/history and worktree inspection.

Production (non-test) textual call-site counts at this base:

| Category | Count |
|---|---:|
| `navigate(...)` | 71 |
| actual `navigate(-1)` | 4 (5 textual including one comment) |
| `<Link>` | 291 |
| `<Navigate>` redirects | 14 |
| `window.location.assign` | 7 |
| `window.location.replace` | 1 |
| `window.location.href =` | 3 |
| `history.back/go` | 0 |
| `pushState` | 0 |
| `replaceState` | 1 |
| `setSearchParams` | 28 |
| `{ replace: true }` | 34 |
| `beforeunload` textual sites | 3 |
| `popstate` / router blocker | 0 / 0 |

Counts are lexical certification aids, not a claim that every Link is a Back
transition. The matrix classifies the meaningful user-facing transitions rather
than conflating all 291 Links.

The first audit must specifically answer:
1. Every place browser Back can produce a surprising destination.
2. Every visible Back control whose behavior differs from browser Back.
3. Every fixed parent link that is mislabeled as temporal Back.
4. Every `navigate(-1)` without a safe fallback.
5. Every internal `window.location.assign/replace/href` and whether reload semantics are intentional.
6. Every local-state view users reasonably expect Back to traverse.
7. Every active gameplay flow requiring Leave/Exit semantics.
8. Every route that needs entry provenance and its safe fallback.
9. Which current active workstream owns each conflicting file.
10. Exact implementation batches that can be developed in parallel and cherry-picked safely.
