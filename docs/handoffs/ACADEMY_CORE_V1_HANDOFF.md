# Academy Core V1 — Handoff

**Status:** built, tested, inspected; **waiting for the owner's visual acceptance**. Nothing merged, deployed or changed in production.

| | |
|---|---|
| Branch | `design/academy-core-v1` (worktree `.worktrees/academy-core-v1`) |
| Base | `origin/main` @ `7be45341` (the brief's `4b13c042` baseline is an ancestor; base was advanced per the brief) |
| Head | see `git log -1 design/academy-core-v1` (two commits: implementation, then this handoff + plate fix) |
| Preview route | **`/lol/dev/academy-core`** — alias **`/dev/academy-core`** redirects there |
| Run locally | `npx vite --host 127.0.0.1 --port 8125` from the worktree, open `http://127.0.0.1:8125/dev/academy-core` |

## Objective

One complete, economical **Academy Core Home Hub** inside the real React frontend: an authored precision instrument, four permanently legible room entrances, and an obvious way to start playing — the approved concept, built once.

## Decisions (and why)

- **Route under `/lol/`.** The League theme, HUD palette and the pre-paint colour in `index.html` all key on the `/lol/`, `/quiz/`, `/combat-lab/` prefixes. Existing dev previews that need the theme (`/lol/dev/pro-play-arena`, `/lol/dev/worlds-experience` + `/dev/worlds-experience` alias) set the pattern, so the page is `/lol/dev/academy-core` and `/dev/academy-core` is a `<Navigate>` alias. Always registered (like `/dev/play-scroll`), `noindex`, so a PR preview deployment can show it.
- **2D SVG + CSS + Framer springs, no WebGL.** Three articulated parts (index cursor, six-blade iris, vernier carriage) are driven by `useSpring` values writing SVG attributes directly; everything else is CSS transitions and three very slow keyframes. No rAF loop, no canvas.
- **Daily** = `<Link to="/quiz/daily-challenge" state={DAILY_START_STATE}>` — the Quiz page's own start-or-resume contract. **Ranked** = `<Link to="/quiz?play=1">` — the lobby opens its Play record on mount and applies every account/role/availability gate itself. `/quiz/ranked` is never linked.
- **Hub-visited parity.** The Quiz lobby's onboarding gate bounces a first session that has not seen the hub back to `/lol`. The page sets the same `sessionStorage` flag the Hall sets (`markHubVisited()`), so Ranked and the Leaguecraft bay are not answered with a detour. Client-side only.
- **Real data, two reads, nothing invented.** Daily status via the existing one-shot `useDailyChallengeStatus` (same request the lobby makes; a guest gets 401 and the page shows no status). Patch label via the Hall's own `["patch-reports"]` query key (shared cache, one list request; no detail/manifest fetch). Status copy renders only when the service has answered.
- **Analytics.** No `hub_entered` from a preview route (it would inflate the real Hall's count). The diagnostic `leaguecraft_cta_clicked` is reused for the two doors into `/quiz` with distinct `cta` values (`academy_core_bay`, `academy_core_ranked`); the canonical open fires on `/quiz` itself, as today.
- **Commons not embedded.** The Commons is a 2.2 MB painted full-viewport room owned by `LolHub`; it is linked as `/lol#academy-commons` exactly as the brief allows. **Tradeoff:** the app has no hash-scroll handler and the Hall mounts lazily, so the link lands on the Hall's first screen with the Commons one "Explore the Academy" step below. Adding a hash handler would mean editing the production Hall, which the brief forbids; left for a follow-up decision.
- **Mogzy** is the existing `peeking` plate (192 px WebP) peeking over the chassis; no new mascot art. The full guide substrate was not mounted (the readout strip carries the one-line previews instead).
- **Scoped styles** in `src/pages/dev/academy-core/academy-core.css` (`.acore-*`); `index.css` untouched (asserted by a test).

## The design, in five details

1. **The D-chassis.** A brushed-metal body that is rectangular on the left (maker's plate, vernier column, readout) and semicircular on the right, concentric with the aperture. The four bays mount on brackets outside the arc, wired by conduits to contact pads the cursor sweeps to.
2. **Six-blade iris.** Each blade is a half-plane in its own rotated frame, so one spring value opens a true hexagonal aperture: wide for INQUIRY, stopped down for MEASURE, open for STRATA / OBSERVE.
3. **Measurement language per room**, inside the lens: a sweeping probe wedge and pulsing rings (Leaguecraft), caliper jaws closing on a dimension line (Combat), five translucent strata fanning apart (Archives), a reticle squaring up with a tracking mark (Pro Play). Distinguished by form, not only colour.
4. **The bezel-riding cursor and lit conduit.** Focus a bay: the cursor swings to its angle, the pad and the bay's lamp light, the conduit goes teal, the carriage slides to a new reading, the readout changes word. Leave: it all settles back to STANDBY.
5. **Mogzy peeking over the edge**, hidden below the chassis top — one cheap plate, a lot of personality.

## Files

| File | What |
|---|---|
| `src/pages/dev/academy-core/academy-core-destinations.ts` | Registry: four rooms, CTA routes, readouts, previews (reuses `HUB_GUIDE_MODES` copy), bay angles |
| `src/pages/dev/academy-core/AcademyCoreInstrument.tsx` | The SVG instrument; five states; springs → attributes; `compact` crop for phones |
| `src/pages/dev/academy-core/AcademyCorePage.tsx` | Page: console (brand, Daily, Ranked, status), stage, mounted bays / bay rows, broadcast gateway, Commons/Hall links |
| `src/pages/dev/academy-core/academy-core.css` | All styles, scoped; reduced-motion overrides |
| `src/pages/dev/academy-core/AcademyCorePage.test.tsx` | 25 rendered contract tests (MemoryRouter + probe routes) |
| `src/pages/dev/academy-core/academyCoreRoute.test.ts` | Route isolation pinned against source |
| `e2e/academy-core.spec.ts` | Playwright inspection at six viewports + interactions; writes the evidence below |
| `src/App.tsx` | +9 lines: lazy import, route, alias |
| `src/components/Layout.tsx` | +1 path in the full-bleed list (the only shared touch) |
| `docs/handoffs/academy-core-v1/*.png` | Evidence |

## Tests and results

| Suite | Result |
|---|---|
| `vitest run src/pages/dev/academy-core` | **25 / 25 pass** |
| `vitest run src/App. src/components/Layout dailyChallengeEntry ads/policy` | 207 pass, **3 fail — baseline** (reproduced on untouched `origin/main` `App.tsx`: `App.routing-contract` ×2 expect `/multiplayer` routes that no longer exist; `App.routeGuards` admin platform-policies regex) |
| `tsc --noEmit -p tsconfig.app.json` | 0 errors in changed files; **2 baseline** errors in untouched `OnboardingProfile.tsx` and `lib/identity/connections.ts` (Supabase `RejectExcessProperties`) |
| `playwright test -c playwright.frontend.config.ts e2e/academy-core.spec.ts` | **14 / 14 pass** (needed `npx playwright install chromium` once; build 1248) |
| Full `vitest run` | See "Full suite" below |

What the Playwright suite asserts: no horizontal overflow at any size; Daily, Ranked, all four bays, patch link and Commons link inside the first screen on desktop; hover drives all five states and the readout; Tab reaches every entrance with a visible outline; Enter navigates on the first action; Daily → `/quiz/daily-challenge`, Ranked → `/quiz?play=1`; alias redirect; OS reduced-motion → `data-ambient="off"` and zero running animations inside the page; phones: actions precede the instrument, every target ≥ 44 px, no overlapping targets, a touch press engages the state and the tap routes; 200 % text zoom keeps every label with no overflow.

### Full suite

The full `vitest run` (≈ 1,900 files) was attempted twice on this machine and **did not complete either time**: a worker died with `FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory` (first with the default threads pool, then with `--pool=forks --maxWorkers=3` and a 6 GB heap), after which vitest reported `ERR_IPC_CHANNEL_CLOSED` and produced no summary. The crash happens inside existing suites (the log shows the `quiz-ranked` settlement suites running at the time) and is unrelated to this change, whose files are leaf modules nothing else imports. The repo's own CI scopes runs rather than running everything (see recent `ci(daily)` commits). The targeted suites above are the authoritative result for this change; a full-suite count is **unknown** here.

## Verified routing (browser, guest session)

- **Daily:** click → `/quiz/daily-challenge` with the start intent; the Daily page attempted to start immediately (no Begin screen). In this isolated browser profile the guest had no anonymous session, so the page showed its own "We couldn't start a session" state — identical to pressing Play in the lobby from the same session.
- **Ranked:** click → `/quiz?play=1` → the Leaguecraft Play record ("Choose Mode" scroll) opened in place with the role carousel and Ranked/Daily/Invite rows. Before the hub-visited parity was added, the same click bounced to `/lol` (the lobby's gate) — that is why the flag is set.
- **Rooms:** first click/Enter/tap → `/quiz`, `/combat-lab`, `/lol/docs`, `/lol/pro-play`.
- **Alias:** `/dev/academy-core` → `/lol/dev/academy-core`.
- **Commons:** `/lol#academy-commons` lands on the Hall (see Decisions).
- **Authenticated behaviour** was not exercised: the frontend e2e persona seam needs a minted token (`e2e/.artifacts/personas.json`, absent here). No evidence was manufactured.

## Performance notes

| Measure | Observed |
|---|---|
| Added bundle (lazy, route-only) | `AcademyCorePage` JS 19.1 kB (6.2 kB gzip) + CSS 18.3 kB (4.2 kB gzip); no new dependencies |
| Network added by the page | 2 reads: `GET /api/patch-reports`, `GET /api/daily-run/today` (401 for a guest). Everything else is the shell's own (Supabase app settings/audio catalogue). Route prefetch on bay hover is the existing `prefetchRoute` convention. |
| Layout shift | CLS **0** (buffered `layout-shift` entries, 1366×768) |
| Idle rendering | 3 CSS animations inside the page at idle (lens breathe 7 s, idle sweep 40 s, caret blink); all pause when the stage leaves the viewport (IntersectionObserver) or under reduced motion. Springs settle and stop. No rAF loop. Baseline for comparison: the shell itself runs 12 other animations on League pages (Hextech ambience). |
| Transitions | Spring swings settle in ≈ 0.6 s; CSS state transitions 300–560 ms |

Known mobile limitation: a touch press flips the instrument state in the ~100 ms before navigation, so phones mostly see the rows' lamp light rather than the full choreography. The row composition carries the previews permanently for that reason.

## Risks / open items

- The `/lol#academy-commons` hash does not scroll (needs a decision: a small hash handler in the Hall, or keep the link).
- Scale numerals on the bezel are decorative markings (not data).
- `.claude/launch.json` was created for the in-app browser; it is git-ignored.
- `node_modules` in the worktree is a junction to the main checkout's (the repo's e2e README describes this sharing).

## Explicit statement

No merge into `main`, no deployment, no migration, no backend/Supabase/Railway/billing change, no production route change. `/lol` and `/` are untouched (asserted by `academyCoreRoute.test.ts`). Only the isolated branch was pushed.

## Next task

Owner visual acceptance on `/dev/academy-core` at desktop and phone. If accepted: decide the Commons hash handling, then plan the swap of `/lol` (the Hall's broadcast centerpiece, guide substrate and Commons would move in as real sections rather than links).
