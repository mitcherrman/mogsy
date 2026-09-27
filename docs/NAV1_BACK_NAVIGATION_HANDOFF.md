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

## Current NAV1-E status

The active Ranked / Daily leave-contract audit remains authoritative at NAV1-D
base `576e9dd309094d725afafc837408e329815d927c`. NAV1-E1 now implements only
its supported router, blocker, typed-bypass and accessible-dialog substrate.
The executable state, history, copy, ownership, race and batch contract is
[`NAV1_ACTIVE_FLOW_LEAVE_CONTRACT.md`](./NAV1_ACTIVE_FLOW_LEAVE_CONTRACT.md).
E3 Daily product wiring is implemented at `DailyRunPage`. E2/E2Q have not
started: standalone Ranked match and Ranked queue do not yet invoke the
blocker. Forfeit and Daily server orchestration remain unchanged.

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

Historical audit finding; standalone actions are resolved by NAV1-D below.
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
- active Ranked/Daily leave contracts, Practice boundaries and History IA
  (Premium completed in NAV1-C; standalone Ranked terminal exits in NAV1-D)

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

Remaining P1s: active Ranked leave semantics, active Daily leave semantics,
and Practice session/history boundaries. NAV1-D resolves standalone Ranked
terminal navigation.
NAV1-C now resolves Premium's contextual return without touching History IA.

## Audit conclusion

The owner report is not one bug. Mogzy currently mixes five valid mechanisms
(fixed Home, structural parent links, auth return destinations, URL-addressed
workspace state, and component-local gameplay) with three unsafe gaps: raw
history popping on direct-linkable profiles, active-flow exits with no leave
contract, and terminal/local state that browser history cannot represent.

The audit found **0 P0 and 7 P1 findings**. NAV1-B resolves the first three
(Settings/reset `/home`, Profile/UserProfile raw temporal Back); NAV1-D resolves
standalone terminal Ranked history, leaving three volatile P1s. The complete matrix, raw-history list,
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
9. **Active gameplay** needs a dedicated leave contract (UNRESOLVED). Proposed: browser Back and an
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

### NAV1-D — standalone Ranked terminal history (completed)

Standalone result controls and the terminal header now use SPA REPLACE.
`QuizRankedPage` supplies the policy to the router-independent arena; Daily
and legacy guided-playtest ownership remain unchanged. Full re-audit,
certification and integration instructions are recorded below. No active-game
Back/leave contract was implemented.

### NAV1-P — Practice session boundary (separate/deferred)

Files: `Quiz.tsx`, possibly a small practice-session route/state module, tests.
Content: one meaningful session boundary; active leave handling; no history per
question; SPA result Review.
Conflicts: HIGH. **BLOCKED** until Practice/Study Hall/Quiz Forge integration.
Parallel/cherry-pick: **no** against active shared-file work; rebase and single
owner integration required.

### NAV1-E — Ranked/Daily active-flow leave contract

Design/audit: **complete** in
[`NAV1_ACTIVE_FLOW_LEAVE_CONTRACT.md`](./NAV1_ACTIVE_FLOW_LEAVE_CONTRACT.md).
Implementation: **not started**. The contract retains explicit Forfeit
separation, puts Daily-hosted exit ownership in the parent, defines exact POP
reset/proceed behavior, rejects unload Forfeit, and identifies the current
`BrowserRouter`/data-router prerequisite. Execute only as the E1/E2/E2Q/E3/E4
batches in that document.
Conflicts: HIGH in `App.tsx`, Ranked match, Daily parent and PLAY1 queue/host
surfaces. E2 and E3 may run in parallel only after E1 lands.

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

Original implementation order (A-D are now complete): **NAV1-A, then NAV1-B**. It resolves the
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

## NAV1-D certification — standalone Ranked terminal history

### Repository and collision audit

- Dedicated managed checkout: `C:/Users/mlmit/.codex/worktrees/6cd6/mogsy`.
- Started clean/detached at NAV1-C `5d000eecb30e4ceff5452eda6cbe1fc0431947d3`.
  Created `codex/nav1-d-terminal-history` from `nav1/back-navigation-audit`;
  that branch remains checked out, clean and unchanged in `nav1-audit`.
- Fetched `origin`; main remains `4b3be0cbe2767d3107f4462082755066b26b398b`.
  Starting NAV1 is 5 ahead / 0 behind main; NAV1-D adds one distinct commit.
- Ranked match owner: `9be28689` (JOURNEY5 final reveal/live Daily fixes),
  already in main and NAV1. Route recovery owner: `4defb73e` (Daily redirect),
  also already present. No newer change to these files needs importing.
- PLAY1 owner: `c4958b73446d612507f91273255470d2b461b19b`, implementation
  `d9ec62a4`, two commits ahead of main. Its diff adds Playtest Director,
  participant orchestration, schema and analytics; it changes none of these
  three navigation files. Read its current handoff/checkpoint rule:
  Playtest may unmount Daily at a declared checkpoint before Daily's result.
  NAV1-D does not change that orchestration or absorb PLAY1.
- SFX2 owner: `2153d4c8c438fc1f8f48a23e464ffee0e21ce89a` following
  `02ac1b47`; changes Ranked sound observation and Daily award hierarchy,
  not terminal navigation. Its handoff and diff were checked. Keep separate.
- Read DCMOD integration and Daily stage-result handoffs, current Ranked
  history, current recovery and host code. Checked all registered worktrees
  for dirty Ranked, arena, Daily and legacy Playtest files: only this task's
  files were modified. This is a point-in-time collision check, not an owner
  lock. Recheck before integration.

### Actions and history contract

The exact label/destination/old/new/semantic matrix is in
`NAV1_NAVIGATION_MATRIX.md#nav1-d-terminal-contract-2026-09-26`.

All four standalone result callbacks now use the route's
`navigate(destination, { replace: true })`. The discovery callback covers
both **Review New Discoveries** and **Review collection**. The always-visible
**Back to Quiz** header also uses `Link replace` on the terminal frame only.
Active, loading and account-gate headers retain their old PUSH behavior.

Before: `[origin, completed Ranked, destination]` after a result action.
After: `[origin, destination]`. Back reaches the preceding meaningful entry;
Forward restores the chosen destination. No new document is loaded. This
does not delete older duplicate entries or invent a predecessor for direct
entry, and it does not intercept arbitrary Home/other navigation.

Play Again still targets `/quiz?play=1`: it opens the mode-selection dialog,
does not auto-select Ranked or queue, and leaves the query intact. Mode
selection is local; a successful queue handoff PUSHes a new `/quiz/ranked`
with the new `matchId`. Back before that handoff reaches the preceding origin;
Back after it reaches the launcher, then the origin. The old result does not
accumulate. No queue/history cleanup change was necessary.

### Why SPA teardown is safe here

The reload rationale originated in `f57ae166` (RB2): a finished match was
considered the cheapest point to discard arena state. It documented a
precaution, not a specific persistent-state dependency. Current evidence:

- `useRankedMatch` owns match snapshots/ledger/results in state and refs. Its
  cleanup sets `stoppedRef`, clears polling, heartbeat and reveal timers,
  invalidates the hold token and aborts the current poll/recovery request.
  The terminal public snapshot already stops polling. A pending presence
  request can finish, but no new heartbeat is scheduled after unmount.
- `useMatchTimeline`, `useMatchDiscoveries`, `useRankedMatchHistory` and
  progression reads abort and ignore cancelled responses. They do not keep
  a singleton live match or a query-cache match controller.
- Arena tick, server-instant wake, countdown, special transition and entry
  preparation effects clear timers or ignore late work. UI/animation state
  belongs to the unmounted subtree. No match route event listener or Zustand
  match store needs a document reset.
- `useRankedAudioBoundary` releases the match's soundtrack owner when no
  longer active or when unmounted. SFX watches are component refs; shared
  audio dedupe keys use event/match identities. Image-preparation caches hold
  asset promises rather than gameplay state. Keeping them is safe.
- The Leaguecraft hub mounts its own history/progression/queue readers on
  arrival. No explicit cache invalidation is required to dispose of the old
  arena. A browser test waits longer than the 10-second presence interval
  after exit and observes zero further requests for the completed match.
- Chromium asserts both unchanged `performance.timeOrigin` and unchanged
  history length for every standalone terminal destination; a second queue
  handoff carries `m2` and renders no `m1` result.

`useSafeTemporalBack` was inspected and is deliberately unused: a terminal
action chooses a forward destination and replaces its current entry; it is
not a temporal POP with fallback.

### Server state, recovery and analytics

No terminal action issues forfeit, resume, queue-join or completion writes.
The result is already server terminal. Leaving only unmounts its readers and
heartbeat; a later explicit queue join remains the existing server action.

Refreshing an intentionally open result with router handoff state preserves
the match id and loads that result again. Fresh hints remain hints; server
snapshots still decide whether recovery is needed. A direct visit with no
handoff id discovers only an active match. After completion/no active match
it REPLACEs to `/quiz` with `openPlay` state. Daily discovery still REPLACEs
to `/quiz/daily-challenge`. None of that recovery code changed.

Result callbacks currently emit no action analytics. `ranked_opened` is the
route's existing surface event; authoritative start/completion belongs to the
server. Shared action SFX still fires before its callback. No event name,
schema, callback order or analytics emission was added or removed. SPA
navigation retains the analytics runtime/queue rather than tearing it down.

### Daily and legacy Playtest ownership

The hosted terminal guard returns before standalone actions are built.
`host.onMatchSettled` hands back once after the presentation is ready; Daily
owns sync, the stage result and Continue. NAV1-D supplies no route callback
or terminal chrome to a Daily child. Chromium exercised two real hosted
controllers against deterministic API fixtures: two parent stage results,
Continue, constant `/quiz/daily-challenge`, constant history length/document,
and no standalone Ranked result or Play Again button. Existing final-reveal,
Survival and Daily boundary suites also pass. No per-stage history was added.

Legacy guided presets remain distinct: `onSessionComplete` still calls the
preset owner locally, exactly once. For other legacy embedded terminal
actions, the arena retains its existing document `assign` fallback. This is
intentional scope isolation, not a claim that legacy exit history is fixed.
`PlaytestMatchHost` itself is untouched and remains the PLAYTEST owner's work.

Internal `window.location` inventory after NAV1-D:

- `QuizRankedMatch`: one `assign(destination)` fallback for legacy embedders
  (previously four calls); the standalone route always supplies SPA REPLACE.
- Same file: one unchanged error **Retry** `reload()`.
- Ranked page, header, hooks, ranked-core/public and arena components: no
  other `assign`, `replace` or `href` writes.
- Adjacent `PlaytestMatchHost`: existing `/quiz` `assign` default exit,
  unchanged. External provider/checkout and chunk recovery are untouched.

### Verification

Run from the dedicated checkout with the existing installed dependencies.
Windows required an escalated test process because sandboxed esbuild could
not read the checkout's ancestor directories. No dependencies were installed.

```powershell
npx playwright test --config playwright.nav1.config.ts
npx vitest run src/pages/quiz-ranked src/pages/quiz-daily-challenge src/lib/ranked-public src/lib/ranked-core src/lib/daily-challenge src/lib/navigation src/components/ranked-arena src/components/audio/useRankedAudioBoundary.test.tsx src/pages/LolPremium.navigation.test.tsx --maxWorkers=3
npx vitest run src/pages/quiz-ranked/QuizRankedPage.terminalHistory.test.tsx src/pages/LolPremium.test.tsx src/pages/LegacyPremiumRedirect.test.tsx src/components/playtest src/components/quiz/play-scroll src/components/quiz/QuizRankedQueueCard.test.tsx src/lib/navigation --maxWorkers=3
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/pages/quiz-ranked/QuizRankedMatch.tsx src/pages/quiz-ranked/QuizRankedPage.tsx src/pages/quiz-ranked/RankedRouteHeader.tsx src/pages/quiz-ranked/QuizRankedPage.terminalHistory.test.tsx src/test/fixtures/rankedTerminal.ts e2e/nav1/ranked-terminal-history.spec.ts
git diff --check
```

- Chromium: **16/16**, including **9 new NAV1-D scenarios**, no page errors.
  Result lobby/History/Review/Play Again/header each prove SPA, replacement,
  Back and Forward. Refresh proves result retention until exit and teardown.
  Direct no-active recovery, next-match queue handoff, and two hosted Daily
  stages are covered. Data/identities are intercepted fixtures, not live-match
  certification. The initial terminal route seeds the queue's router state;
  the next-match scenario uses the actual launcher and queue UI.
- New router/controller tests: **9/9**, all six rendered action variants,
  hosted callback isolation, unchanged active header PUSH, and preset Continue.
- Broad regression: **2,147 passed / 5 failed**, 173 files. The five failures
  reproduce on clean NAV1-C: `AnswerGrid.elimination` (2 Windows path checks),
  `QuestionStageGeometry` (3 path/CRLF checks). Baseline: 75 passed / 5 failed.
- Additional launcher/Playtest/NAV1 run: **272 passed / 2 failed**, 9 files.
  The two `playModeCard.styles` CRLF-sensitive static assertions reproduce
  on NAV1-C (20 passed / 2 failed). These runs overlap; do not sum counts.
  The first broad command's old Premium filename selects no file; the second
  command explicitly runs the actual `LolPremium.test.tsx` and alias tests.
- TypeScript: two existing errors, `OnboardingProfile.tsx:180` and
  `identity/connections.ts:263`, also recorded by PLAY1; neither file changed.
- Targeted lint: zero errors; one pre-existing Fast Refresh warning for
  `rankedDetailsSummary` in `QuizRankedMatch`. Diff whitespace check passes.
- The whole frontend contains 771 test files; the 173-file gameplay run plus
  targeted launcher/navigation checks were used rather than an unrelated
  all-frontend sweep. No claim of a fully green repository suite.
- Browser observation outside scope: the fixed header link can overlap the
  terminal title at the default desktop viewport. Its history test uses
  keyboard focus + Enter, not a forced click. No layout edit was made.

### Integration and remaining work

Commit separately as `NAV1-D: clean up Ranked terminal history`; nothing is
pushed. Product changes are limited to `QuizRankedMatch`, `QuizRankedPage`
and `RankedRouteHeader`; the rest is focused tests/fixtures and these two docs.

Safest sequence: bring the existing NAV1 audit/A/B/C chain through `5d000eec`
into the integration branch, then cherry-pick NAV1-D. The original NAV1
branch can fast-forward to this task branch after its owner is ready.
No PLAY1 or SFX2 commit is a prerequisite: both have disjoint changed files.
Integrate those separately in their own owner order, retaining their Daily
checkpoint and sound policies, then rerun Ranked/Daily/browser certification.
Never port this patch by replacing the entire match component.

Still separate work:

- **P1 implementation: active Ranked Back/leave**. The NAV1-E contract is now
  decided; explicit Forfeit, reconnect, network loss and unload remain separate.
- **Resolved NAV1-E3: active Daily Exit**. The parent preserves the run,
  distinguishes canonical/hidden live children, warns about the mount-local
  result beat, preserves the original POP/PUSH destination, and cancels stale
  navigation when the run completes.
- **P1: Practice meaningful-history boundary**, pending Practice/Study Hall
  integration on shared `Quiz.tsx` and workspace files.
- Deferred Premium anchors in Practice Builder/Trends, and History/Review IA.
- Legacy guided-playtest document exits and the terminal header overlap.

Recommended next task: **NAV1-E1 supported blocker substrate**, after the owner
accepts the documented data-router prerequisite and the current PLAY1 route is
integrated/rebased. Do not begin with a surface-only browser Back handler.
PLAY1 checkpoints and SFX2 remain separate owner work; E2/E3 integration must
retain those policies. Practice remains the separate NAV1-P workstream.

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

## NAV1-E1 certification — supported blocker substrate

### Base and owner reconciliation

All refs were fetched before editing. `origin/main` is
`4b3be0cbe2767d3107f4462082755066b26b398b`. SFX2 has not landed there: its
side commit is `2153d4c8`, and merge `dd510777` integrates it only on a
separate Journey/release line. E1 neither needs nor includes that line and
does not alter SFX behavior. E2 must retain or reconcile SFX2 when its Ranked
owner surface is integrated. PLAY1 had not landed or moved: its current side
branch is the two commits `d9ec62a4` and `c4958b73`. The NAV1-E design and
PLAY1 share the same main merge base, so those two owner commits were
cherry-picked onto NAV1-E before any E1 edit. The resulting PLAY1 route additions
(`/admin/playtest-director` and `/playtest/:slug`) are retained verbatim. No
unrelated PLAY1 experiment and no SFX behavior was merged or edited.

### Final router and provider architecture

`App.tsx` replaces `BrowserRouter` + `Routes` with a module-scope
`createBrowserRouter(createRoutesFromElements(...))` and `RouterProvider`.
The old route JSX remains line-comparable inside one pathless root route; paths,
nesting, redirects and each existing `Navigate replace` are unchanged. The
pathless root renders `AcademyRadioController` beside `Outlet`, matching its
old lifetime inside the router but outside the route tree. A focused lifetime
test proves the controller mounts once and does not restart across route
changes. QueryClient, auth and identity bridges, admin auth, premium session,
tooltips, both toaster roots and their ordering remain outside the module-scope
router exactly as before. The data-router error element rethrows the captured
route error so E1 does not introduce React Router's default route error screen.
No loader or action was added.

Changed production files:

- `src/App.tsx`
- `src/components/audio/EntryMusicController.tsx` (lifetime comment only)
- `src/lib/navigation/useTransactionalLeaveGuard.ts`
- `src/components/navigation/TransactionalLeaveDialog.tsx`

The remaining changed files are focused unit/integration/browser tests,
generic test fixtures and these two NAV1 documents.

### Blocker and bypass API

`useTransactionalLeaveGuard({ active, kind, copy, shouldBlock })` accepts only
the kinds `ranked_match`, `ranked_queue` and `daily_run`. The owner predicate
receives React Router's complete current/next location and history-action
candidate, so owner-preserving search, hash, state or nested-route transitions
can pass without a hard-coded pathname rule. The result exposes `kind`, `copy`,
`state`, `confirmationOpen`, `pendingLocation`, `stay`, `leave` and
`runWithBypass`.

Inactive guards return false for every transition. Active eligible navigation
is captured by `useBlocker`. Stay invokes `blocker.reset()` and Leave invokes
`blocker.proceed()`; the hook never constructs a replacement navigation, so
POP, PUSH, REPLACE, search, hash and state retain their original semantics.
Handled actions are locally idempotent. `blocked` and `proceeding` remain
distinct, and only `blocked` opens the confirmation. React StrictMode, repeated
Back and rapid real-browser Back/Forward render one confirmation and preserve
the first pending browser transition.

If `active` becomes false while blocked, an effect calls reset exactly once;
it never calls proceed. This is the authoritative-terminal rule: the stale
user destination is dismissed while the current route renders the terminal
state.

`runWithBypass(reason, transition)` accepts only
`AUTHORITATIVE_TERMINAL | HOST_RETURN | AUTH_RECOVERY | ROUTE_RECOVERY`. A
bypass exists only for its synchronous callback, is consumed by the first
router candidate and is cleared in `finally` if no candidate occurs. It cannot
persist into future navigation, and nested bypasses throw. When invoked while
a user transition is blocked, it resets that stale attempt before initiating
the system transition; it never proceeds the user's destination. E1 defines
this mechanism but wires no product call site.

### Dialog

`TransactionalLeaveDialog` uses the existing Radix AlertDialog wrapper. It
provides alert-dialog labelling, focus entry and containment, background
inertness/aria hiding, Escape-to-Stay, Stay-first reading and tab order,
responsive viewport sizing, busy-state disabling and a local double-submit
guard. Copy and flow policy remain owner inputs; E1 includes neutral fixtures
only.

### Verification

Commands run from the dedicated managed worktree:

```powershell
npx vitest run src/lib/navigation/useTransactionalLeaveGuard.test.tsx src/components/navigation/TransactionalLeaveDialog.test.tsx src/App.dataRouter.test.tsx --maxWorkers=1
npx vitest run src/App.dataRouter.test.tsx src/lib/navigation src/components/navigation src/components/ProtectedRoute.test.tsx src/pages/Auth.authFlow.test.tsx src/pages/AuthCallback.test.tsx src/pages/quiz-ranked src/pages/quiz-daily-challenge src/features/playtest-director src/pages/playtest --maxWorkers=3
npx playwright test --config playwright.nav1.config.ts
npx vitest run --maxWorkers=3
npx tsc --noEmit -p tsconfig.app.json
npx eslint <all changed TypeScript/TSX implementation and test files>
git diff --check
```

- E1 route/blocker/dialog tests: **40/40**.
- Route/auth/Ranked/Daily/PLAY1 regression slice: **783/783** across 71 files
  after including the final unknown-route assertion.
- NAV1 Chromium: **20/20**, including four generic E1 browser-history cases.
  Cancel keeps B with unchanged history and permits a new Back attempt;
  confirm replays POP to A and Forward returns to B; PUSH and REPLACE retain
  their history actions; repeated Back/Forward leaves one dialog and the first
  pending POP; Stay receives initial focus.
- TypeScript retains four base errors: `OnboardingProfile.tsx:180`,
  `lib/identity/connections.ts:263`, and two `includes` errors in
  `RankedShellProbe.test.tsx:32`. None of those files changed in E1; the first
  two were already recorded by PLAY1/NAV1-D and the probe test is byte-identical
  to the reconciled PLAY1 base.
- Targeted ESLint: zero errors and four Fast Refresh warnings. One is the
  intentional module-scope router export used by route regression tests, two
  are existing `EntryMusicController` exports, and one is a test fixture.
- `git diff --check` passes.
- The broad all-frontend run is baseline evidence, not a green-suite claim. A
  three-worker attempt exposed unchanged static/platform failures and then a
  worker reached Node's heap limit. Every reported failing test file is
  byte-identical to the reconciled PLAY1 base; the stale multiplayer source
  test also fails there because the asserted redirects are absent on that
  base. No unrelated failure was changed in E1. A single-worker retry with an
  8 GB heap also exhausted its heap before producing a final aggregate.

One test-harness observation does not change the design: firing opposite
`router.navigate(-1)`/`router.navigate(1)` calls directly at MemoryRouter can
replace its in-memory pending POP because it lacks browser POP restoration.
The required behavior was therefore certified in real Chromium, where rapid
Back/Forward preserves the first pending transition. No custom registry,
history shim or product workaround was added.

### Scope and next owners

NAV1-A safe temporal Back, NAV1-B Profile/Settings/UserProfile/reset fallbacks,
NAV1-C Premium contextual return and NAV1-D terminal REPLACE all pass their
unit/browser regression suites. Ranked, Daily and the Ranked queue are not
guarded. Forfeit and global HUD semantics are unchanged. No `beforeunload`,
`pagehide`, `unload`, `popstate`, beacon, keepalive, fake entry or history
repair was added.

E2 and E3 are safe to start in parallel after this commit because their owner
surfaces are disjoint. E2Q still requires explicit PLAY1 owner scheduling and
must not run concurrently with further PLAY1 queue edits.

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

## NAV1-E2 certification — standalone Ranked active leave

E2 now guards only the standalone `/quiz/ranked` owner. Its known-match
predicate begins before the first snapshot and remains true through active,
locked/reveal presentation, recovery and known nonterminal errors. Server
authority turns it off at `match_outro` or `match_over`; if a dialog is open,
the E1 hook resets that stale transition and keeps the authoritative result on
screen. The active header is **Leave Match** (ordinary PUSH `/quiz`), while the
terminal header and result actions retain NAV1-D REPLACE.

All router navigation away shares the same captured transition, including
browser POP, HUD Home and programmatic PUSH/REPLACE. Exact-owner search/hash/
state changes are allowed. A fresh queue handoff retains its match id but is
marked recovered after the first mount, so refresh/Forward resumes rather than
replaying the fresh intro. Current no-match and Daily-host discovery redirects
occur before the standalone owner is known, so they remain unguarded recovery
REPLACEs; no global disable or ad hoc bypass was introduced.

Hosted Ranked remains entirely parent-owned: no child blocker, standalone
dialog, standalone header, or Forfeit change. Explicit Forfeit remains the
only POST concession path. No unload handler was added.

SFX2 reconciliation replayed only `02ac1b47` and owner tip `2153d4c8` onto E1;
the unrelated release-line merge parent of `dd510777` was not absorbed. E2
does not change the sound observer or arena/audio ownership.

Deferred exactly as before: E2Q Ranked queue, E3 Daily parent guarding, and
PLAY1 user-exit policy.
