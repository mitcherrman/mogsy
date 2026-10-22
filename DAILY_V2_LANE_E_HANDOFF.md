# Daily V2 (three acts) — lane E handoff: serial integration (FRONTEND)

Date: 2026-10-21. Branch `daily-v2/e-integration`, worktree
`mogsy\.worktrees\daily-v2-e` (`node_modules` = junction to `mogsy\node_modules`),
base `origin/main` **`657b4a913d4ca8dbd43349aa1386efdb464eaaf7`** (moved from the
lanes' `9ca66118` by #107 Admin Daily history; no overlap).
Backend counterpart and the full gate/release write-up:
`League_Combat_Simulator\.worktrees\daily-v2-e\DAILY_V2_LANE_E_HANDOFF.md`
(read that first; this file covers the frontend).

**Not pushed. No PR. Nothing merged, published or deployed.** `pnpm` never run.
Spec `MOGZY_DAILY_V2_THREE_ACTS_SPEC_2026-10-20.md` absent; nothing guessed.
Naming: "Daily V2" already means plan v5 here; the new recipe is **three acts**.

## 1. Commits

| SHA | What |
|---|---|
| `4cb84c8c` | merge lane A `daily-v2/a-meta-values-fe` @ `a02e212c` (code `f2bc0b16` + docs) — incl. its one `QuestionStageGeometry.test.tsx` expectation |
| `a902933a` | merge lane D `daily-v2/d-mode-reuse-fe` @ `3334decd` |
| `ba2297b1` | E: plan reader, set grouping, allow-listed renderers, owner take entry |
| `6d87a1fb` | E: CSS fix found in the 360 px playtest (superseded by the next commit) |
| `0541485e` | E: sets become a VIEW MODEL of the one arena strip (guard tests); arena/CSS files back to main byte for byte |
| (this file) | handoff + playtest screenshots |

Draft PR **#108** (second verdict line in `metaReflexModule.tsx`) is NOT merged
(owner gate 6); `git merge-tree` shows it still merges cleanly on top.

## 2. What E changed

| File | Change |
|---|---|
| `src/lib/daily-v2/threeActsPlan.ts` (new) | strict reader of the server's `content.composition` when `recipe === "three_acts"` (units, counts, bands, timers — refuses a plan that breaks its own 19/21 counts); `projectSetTimeline` groups the arena's OWN round timeline into 6 sets + the sprint; `windowSetTimeline` keeps whole sets |
| `src/lib/daily-v2/__fixtures__/threeActsComposition.ts` | the backend `v2_launch.stage_shape()` verbatim — compared key-for-key against the backend output: **identical** |
| `src/lib/ranked-core/viewTypes.ts` | `RoundTimelineView.sets?` (another view model of the one strip) |
| `src/lib/ranked-core/roundTimeline.ts` | `windowTimelineView` also windows sets (5-node phone window → 3 sets) |
| `src/components/ranked-arena/RoundTimeline.tsx` | draws the set variant when `timeline.sets` is present (7 groups desktop, 3 in the phone bar), same `ranked-round-timeline` test id / CSS / phone hiding; aria: "Early, set 2: easy correct, medium current, hard upcoming" |
| `src/lib/ranked-core/flow/matchHost.ts` | `MatchHost.threeActsPlan?` |
| `src/pages/quiz-daily-challenge/run/DailyRunPage.tsx` | passes the hosted stage's plan to the host |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | with a plan: attaches `sets` to the timeline and resolves renderers ONLY through lane D's allow-list (`rendererForDailyV2Segment`); without one: unchanged |
| `src/lib/daily-challenge/run/contracts.ts` | `DailyStageContent.plan?` read only on a three-act Standard; V1 content objects unchanged |
| `src/pages/admin/CreatorReplayPage.tsx` | "Daily three acts (owner preview) — Play a three-act take" (POST `/api/daily-run/admin/three-acts`; 404 → "not enabled on this server"); plays via the existing creator run route |

Not changed: `CanonicalArena.tsx`, `MobileBottomBar.tsx`, `arenaView.ts`,
`index.css`, `registry.ts`, every mode module, scoring, the Daily result pages
(they show the backend's per-answer counts for a three-act stage).
`registry.ts` needed no edit: D's allow-list delegates to it.

## 3. Commands and results (local; GitHub Actions billing-blocked — CI absence is NOT a pass)

Tooling: scratch `vitest.e.mts` (repo config minus react-swc, `esbuild.jsx =
"automatic"`, root/alias = worktree) + `NODE_OPTIONS=--require hook.cjs`
(rollup native → `@rollup/wasm-node` 4.64.3). Full suite as four fresh
processes per tree (`src/pages`, `src/lib`, `src/components`, rest + `scripts`),
`--maxWorkers=4`, excluding `src/test/security/pt2cProfileFrameAuthority.test.ts`,
on detached checkouts `.worktrees/daily-v2-e-base` (657b4a91) and
`.worktrees/daily-v2-e-head` (ba2297b1).

| run | files | failing tests | vs baseline |
|---|---|---|---|
| baseline 657b4a91 | 44 failed / 1,071 passed (1,115) | 180 | — |
| head ba2297b1 | 43 failed / 1,077 passed (1,120) | 182 | +3: arena guard tests (`only RoundTimeline draws the round strip`, `the timeline is still the arena's floor…`, `keeps the Module Rail mounted…`) → **fixed in `0541485e`**; −1 `LobbyPreviewPage.premiumAnalytics` (fails on base only; timing) |
| `0541485e` targeted: `src/lib/daily-v2 src/components/ranked-arena src/lib/ranked-core/roundTimeline src/lib/daily-challenge src/pages/quiz-daily-challenge` | 4 failed / 71 passed (75); 1,039 / 1,048 tests | 9 | **all 9 in the baseline failing set** (CRLF/source-reading guards) |
| new E tests | `threeActsPlan` 8, `RoundTimeline.sets` 4, `threeActsContract` 3 | 0 | — |
| `npx tsc --noEmit -p tsconfig.app.json` | 2 errors, both pre-existing (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`) | | unchanged |
| `npm run build` (with the rollup hook), then `git checkout -- public/sitemap.xml` | ✓ vite 38 s; item/champion prerender verify OK | | — |

## 4. Local end-to-end playtest (screenshots: `docs/daily-v2-lane-e/`)

Real stack, local only: the backend worktree's app on 127.0.0.1:8711 against
a COPY of the canonical DB (flag `owner`, serveable scope, playtest caps
2/act 6/day — a proposal, see the backend gates), and this worktree's Vite
dev server (cwd = worktree) with `VITE_E2E_AUTH=1` → the repo's own e2e persona
(HS256 test token; no Supabase call). Driven in the in-app Browser pane (not
local Edge/Chrome automation). Two takes:

| file | what it shows |
|---|---|
| `pane-360-before-fix-two-strips.jpg` | the defect found: phone bar window AND the desktop strip both drawn |
| `pane-360-early-set1-after-refactor.jpg` | take started from the admin button; one strip; `E1 · E2 · MR`; real bank question (Easy, 18 s) |
| `pane-360-meta-reflex-sprint.jpg` | segment 7: 3-card Meta Reflex (`1 / 3`), window `E2 · MR · M1` |
| `pane-320-mid-set1.jpg` | 320 px, `MR · M1 · M2`, no horizontal overflow (`scrollWidth` 320) |
| `pane-390-late-set1-resume.jpg` | 390 px after a reload: resumed the same child at 15/19 (entry beat dims the card) |
| `pane-1280-desktop-seven-sets-resume.jpg` | desktop: all seven groups `E1 E2 MR M1 M2 L1 L2` (pane scaled 1280→800) |
| `pane-360-stage-result-21-answers.jpg` | stage result **Correct 2 / 21 · Missed 19** (after backend fix `df563436`; the first take read 2 / 19) |

Verified on the server for take 1: 21 child results / 21 distinct refs /
18 misses, `creator_replay` match, 0 official runs for the test owner.

Not captured: the Meta Reflex 1.5 s value reveal (pane screenshots are slower
than the hold; lane A's screenshots cover it) and the **video** — skipped by
the user on 2026-10-21. Local browser automation needs explicit owner
authorization for each run (`AGENTS.md`).

The harness is kept in `docs/daily-v2-lane-e/harness/` (LOCAL ONLY, never
deploy it):

* `server.py` — runs the backend worktree's app on 127.0.0.1:8711 against a DB
  copy at `<harness dir>/../dbcopy/lol_calc.db` (make it with
  `sqlite3.backup` from the canonical DB opened `mode=ro`); flag `owner`,
  serveable scope, playtest caps; a fresh random HS256 secret per start;
  removes every `SUPABASE_*` variable; overrides `require_admin` to a local
  test owner; writes the e2e persona to `persona.json` beside itself. Edit
  `WT`/`DB` for your paths.
* `record.cjs` — the ONE bounded run, once approved: bundled headless Chromium
  (no channel, no profile), one context, 390×844, recorded video, 9-minute
  deadline, browser closed in `finally`. Starts a take from the admin page and
  plays it to the stage result. Run with `WT=<frontend worktree> node record.cjs`
  after the backend and `VITE_E2E_AUTH=1 VITE_COMBAT_API_URL=http://127.0.0.1:8711`
  Vite (cwd = worktree, rollup hook) are up; stop both afterwards.

## 5. Owner gates touching the frontend (proposals; full table in the backend handoff)

* **4 — 1.5 s reveal** for two values: decide from the video/phone playtest.
* **5 — names on recognition cards**: cannot occur in a three-act take (V2's
  Meta Reflex policy excludes recognition families); V1 keeps lane A's names.
* **6 — #108's second verdict line**: take / reject / move to header.
* **7 — interlude placement**: server config; the timeline follows the plan
  automatically (no frontend change for any position).
* A set chip shows the sprint as ONE verdict pip (segment-level); per-card
  verdicts stay in the arena's top beat. Say if the strip should show three.

## 6. Release (frontend side)

Deploy order is free: an old frontend ignores the new composition fields; a
new frontend shows nothing new until the backend flag is `owner`. Before
release: owner phone playtest (gate 4), CI or explicit acceptance of local
evidence, PR review. Lovable publish only on explicit owner approval.

---

## Pass 2 — integration readiness (2026-10-21)

Backend readiness report (why no day composes, deficits, exact gate 8/9/10 text):
`League_Combat_Simulator\.worktrees\daily-v2-e\docs\daily_v2_lane_e\READINESS_2026-10-21.md`.

### Commits (frontend)

| SHA | What |
|---|---|
| `9628cd0c` | merge `origin/main` @ `2c6dee32` (3 commits: Combat Lab roster, #110) — clean |
| `3555fd96` | Meta Reflex: the final card's verdict holds through the wait — reconciles draft PR #108 with ONE verdict |
| (this commit) | this section |

### #108 reconciliation (one verdict, both values)

Root cause of #108's "missing final verdict": a card's verdict appears on the
centre stamp (`QuestionResultOverlay`, every viewport) only during its 1.5 s
reveal window, and the header's per-card plate (`CardResultBeat`) is
`hidden md:flex`. After the LAST card's window the player waits for the
opponent and, **below 768 px, no verdict was shown at all**. #108 added a
second verdict word in the waiting line (a duplicate on desktop, where the
header shows it).

Integration fix (`QuizRankedMatch.tsx`, ~15 lines): the centre stamp keeps the
final card's verdict — same element, same event id, so nothing is
re-announced — until the block settles, for a card this mount watched being
revealed (a page restored mid-wait stays restored, as before). Phone: one
verdict (stamp). Desktop: unchanged (stamp + header plate, the pre-existing
pairing during every card reveal). Lane A's two server values stay on the
settled card; nothing derives a value or a gap. #108 is **not** merged; if it
is merged later, its inline word would be a duplicate — recommend closing it
as superseded (owner gate 6).

New test `QuizRankedMatch.metaReflexFinalVerdict.test.tsx` (2): the hold test
**fails on the previous code and passes now** (negative control run); a
restored wait does not re-stamp.

### Tests (local; CI billing-blocked)

| run | result | vs baseline `657b4a91` |
|---|---|---|
| full vitest, 4 chunks, `3555fd96` (detached `.worktrees/daily-v2-e-head`) | 43 failed / 1,079 passed files (1,122); 179 failing tests | **0 new**; 1 base-only (`LobbyPreviewPage.premiumAnalytics` stopwatch, timing) |
| targeted Meta Reflex + header + flow | 145 / 145 | — |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors, both pre-existing | unchanged |
| `npm run build` (+ `git checkout -- public/sitemap.xml`) | ✓ 39.8 s, prerender verify OK | — |

Browser acceptance and video: not run (needs a separately approved bounded
headless Chromium run). Harness in `docs/daily-v2-lane-e/harness/`.

---

## Pass 4 (2026-10-21)

Frontend: `c1feda3f` merges `origin/main` @ `d3854e5f` (Worlds 2026 quiz #104,
seamless HUD #111, Lovable sync) — clean; no Daily V2 frontend change this pass.
`tsc`: the 2 errors already on main. Ranked/Daily vitest chunk
(`src/pages/quiz-ranked src/components/ranked-arena src/lib/ranked-core
src/lib/daily-v2 src/lib/daily-challenge src/pages/quiz-daily-challenge`):
17 failing of 2,986, all in the baseline failing set. Backend pass 4 report:
`League_Combat_Simulator\.worktrees\daily-v2-e\docs\daily_v2_lane_e\READINESS_PASS4_2026-10-21.md`.

---

## Pass 5 (2026-10-21)

The backend now serves two- and three-option quiz rounds and Order Forge v2
boards inside three-act takes. No renderer change is needed:
* the answer grid is count-agnostic (`data-answer-count`, the two-way "pair"
  layout, already covered by `CanonicalArena.regionsSeam.test.tsx`);
* `order_forge@2` was already in lane D's Daily V2 allow-list.

| SHA | What |
|---|---|
| `c374a28e` | `modeReuse.test.ts`: a two-option Daily V2 quiz round reads and projects exactly its two options |
| (this commit) | Harness `server.py`: the launch config (strict caps + pass-5 quotas), no cap override; `E_DB` picks the database copy. This section |

Tests: `src/lib/daily-v2` + the arena seam: 64 passed.

Owner entry point (unchanged): `/admin/creator-replay` → **Play a three-act take**.

Backend pass 5 report:
`League_Combat_Simulator\.worktrees\daily-v2-e\docs\daily_v2_lane_e\READINESS_PASS5_2026-10-21.md`
(§9 has the exact local and private-preview steps).
