# NAV1-WK1 — WebKit navigation certification

Status: automated certification complete on 2026-09-29. Physical iOS Safari
edge-swipe smoke testing remains.

## Base and environment

- Starting `origin/main`: `cb2ccff7c00b971806057cc5a7e0594e0d45e2b5`.
- Branch: `codex/nav1-wk1-webkit-certification` in the managed
  `nav1-wk1-webkit-certification` worktree.
- Playwright: 1.61.1.
- WebKit: 26.5, Playwright build 2311.
- Desktop project: Playwright `Desktop Safari`, 1280x720 viewport, Safari 26.5
  user agent.
- Mobile project: Playwright `iPhone 13`, touch/mobile Safari user agent,
  390x664 viewport and 390x844 screen. Existing explicit modal cases also set
  a 390x844 viewport where their contract requires it.

The NAV1 config now exposes `webkit-nav1` for the complete browser-history
matrix and `webkit-iphone-nav1` for the five explicitly mobile cases. WebKit's
slower cold module startup required longer test/expect bounds and a few
fixture-only action/load synchronizations. Cross-origin mocked responses carry
CORS headers; WebKit's exact `due to access control checks.` page-error noise
is ignored only in the two files that already assert a clean page-error list.
All other page errors still fail.

## Automated WebKit coverage

Desktop WebKit passed 44/44 cases, run in isolated file groups to avoid a
Windows-host WebKit page crash observed when the entire Vite module graph was
kept in one long process. Every case passes without retry:

- safe temporal Back: internal origins preserve pathname/search/hash, Forward
  restores the destination, and direct entries use their REPLACE fallback;
- standalone Ranked: ordinary reveal, active and locked match Back/Stay,
  retry/Leave of the exact POP, Forward recovery, terminal authority, header
  Leave, HUD Home, one dialog, and zero ordinary-navigation Forfeit;
- Daily: active Back/Continue/retry/Exit, header and HUD destinations,
  terminal authority, hidden live/settling child ownership, stage-result
  non-replay, Forward reconstruction, and no abandonment/Forfeit mutation;
- Practice: unfinished and missed replay are guarded, Stay preserves the run,
  Leave proceeds the exact POP, result is terminal/unguarded, Review remains an
  SPA transition to canonical History, and Forward reconstructs the hub;
- queue: waiting Stay, authoritative single DELETE before Leave, failure/retry,
  waiting-to-pairing and pairing-to-matched races, active-Ranked takeover,
  repeated Back, native Forward, and zero Forfeit;
- shared blocker: cancelled and confirmed POP, PUSH/REPLACE preservation,
  repeated Back retaining the first destination, and unchanged history length;
- terminal Ranked and contextual Premium history regressions.

The focused iPhone 13 WebKit project passed 5/5: Ranked, Daily, Practice, and
queue dialogs plus the mobile contextual-return case. The dialog cases prove a
single overlay, visible title/body/actions, reachable safe action, focus within
the alert dialog, and mobile viewport fit. Existing destructive-action cases in
the full WebKit matrix prove those actions remain reachable and preserve their
network invariants. No dialog redesign was necessary.

## Network and history invariants

- Waiting queue Stay: zero DELETE; confirmed cancellation: exactly one
  `DELETE /api/ranked/queue`; failure/retry: one request per deliberate attempt.
- Ranked ordinary Back/header/HUD navigation: zero Forfeit.
- Daily ordinary leave: zero abandonment, cancellation, or Forfeit write.
- Repeated Back: one pending transition, one dialog, and no duplicated write.
- Back/Forward uses the router/browser history entry; no sentinel or synthetic
  product history was added.

## Runtime and browser differences

No production runtime changed. Automated WebKit found no product defect.
Changes are limited to Playwright projects, deterministic fixture compatibility,
and test synchronization. WebKit reports some fulfilled cross-origin fixture
requests as access-control page errors; the narrowly scoped filter described
above is the only engine-specific test accommodation.

## Regression

- Desktop WebKit NAV1: 44/44 passed across isolated file runs.
- iPhone 13 WebKit mobile project: 5/5 passed.
- Chromium full NAV1: 44/44 passed in one run.
- E2Q Chromium: 8/8 within the full run.
- Practice Chromium: 6/6 within the full run.
- Ranked/Daily Chromium navigation: 19/19 within the full run.
- TypeScript: clean.
- Targeted ESLint: clean.
- `git diff --check`: clean.

## Static audit

WK1 adds no production `popstate`, `pushState`, `navigate(+1)`, Safari/user-agent
branch, edge-touch interception, unload cancellation, queue unload DELETE, or
ordinary-navigation Ranked Forfeit. Existing production findings remain as
documented: Practice has its scoped native `beforeunload` warning, queue DELETE
has one controller/client path, and Forfeit has one match controller/client
path. Unrelated touch handlers, diagnostics user-agent capture, and Safari
compatibility comments predate WK1.

## What is and is not proven

Automatically proven: Playwright WebKit POP handling, React Router blocker
ownership, exact transition reset/proceed, history integrity, Back/Forward,
network invariants, and iPhone-like touch/viewport modal behavior.

Not automatically proven: a finger edge-swipe on physical iOS Safari, Safari's
interactive snapshot/transition animation, or cancellation halfway through the
OS gesture. `history.back()`, `page.goBack()`, and protocol traversal exercise
the resulting POP; they are not labeled as physical swipes.

## Physical iPhone smoke card (5–10 minutes)

1. Active Ranked: edge-swipe, Stay; retry, Leave; return Forward.
2. Active Daily: edge-swipe, Continue; retry, Exit; return Forward.
3. Active Practice, including missed replay: Stay, then Leave; check result is
   unguarded.
4. Waiting queue: Stay, then Cancel Queue & Leave; return Forward.
5. Confirm one dialog in every case and note whether a partial/cancelled swipe
   produces unusual animation, URL, focus, or duplicate-request behavior.

**WebKit history/POP certified; physical iOS edge-swipe smoke test remains.**
