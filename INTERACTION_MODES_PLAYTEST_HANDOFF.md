# Interaction Mode Prototype Labs — Rangefinder + Glyph Press / Word Puzzle

**INT1 status: owner-only production playtest entry implemented; draft, not merged,
not deployed.** Both labs are `Prototype • not server-authoritatively graded`.
Neither is a Ranked/Daily module, and neither has a server grader.

| | |
|---|---|
| Work branch | `claude/interaction-mode-playtests-dbs3xz` → draft PR #19 into `lab/interaction-mode-playtests` |
| Frontend base | `main` `7be45341` |
| Rangefinder source | `rangefinder/r1-fable` @ `3ab7c0fbcd4f536a78e2ceae4ead04b471d71911` (base `a59526b2`), merged unchanged |
| Glyph Press source | `word-puzzle/wp1-fable` @ `af6507a86c319da725293d16de987730402ddcfa` (base `12054aab`), merged unchanged |
| Original handoffs | `RANGEFINDER_R1_HANDOFF.md`, `WORD_PUZZLE_WP1_HANDOFF.md` (both on this branch, unedited) |
| Backend | `League_Combat_Simulator` `f12a7432` — read only, nothing changed |
| Owner entry (production build) | `/admin/interaction-labs` → `/rangefinder`, `/word-puzzle` (behind `AdminRoute`) |
| DEV entry (unchanged paths) | `/dev/rangefinder`, `/dev/word-puzzle` (404 in production, as before) |

## 1. Verdicts

| Candidate | Verdict | Meaning |
|---|---|---|
| **Rangefinder (GM-R1)** | **WORKING ADMIN PLAYTEST — prototype grading** | Original mechanic recovered and playable by the owner on a production build. Grading is the original lab's stand-in in the owner's tab, over a frozen capture that still reproduces exactly from current backend master. |
| **Glyph Press / Word Puzzle (WP1.1)** | **WORKING ADMIN PLAYTEST — prototype grading, not answer-secret** | Original mechanic recovered and playable by the owner. The answer bank never ships in the production bundle, but the lab grades in the browser and the clue image paths spell some answers (L3), so it is **only** fit for the owner's own playtest. |
| Either as a public / graded mode | **BLOCKED on backend** | Needs a server-side module, grader and opaque assets (§6). Not attempted; no insecure workaround shipped. |

## 2. Recovery (verified)

- `git fetch` of both branches; heads equal the Command Center SHAs above.
- Both original handoffs read in full.
- Merged with `--no-ff` so the original commits (`0a2290d1`, `3ab7c0fb`, `8798b2dc`,
  `af6507a8`) are in this branch's history byte-for-byte. Conflicts were only in
  shared registration files and were resolved **additively** (main's entries kept):
  `App.tsx`, `Layout.tsx`, `Footer.tsx`, `playwright.arena.config.ts`; `types.ts`
  keeps both the Rangefinder and Glyph Press sections; `useStageRoom.ts` code was
  byte-identical on both sides (only a comment differed; WP1's, which names both).
- Re-ran the original unit suites on the merged tree: **124/124** (= Rangefinder 59 +
  WP1.1 65, exactly the counts both handoffs report).
- **Authority re-verification.** Re-ran both original capture scripts against
  backend `origin/master` `f12a7432` into scratch and compared:
  - Rangefinder: `range_authority.json` is unchanged since the capture commit
    `679173bf`; recapture gives the same 692 population / **227 eligible / 465
    excluded**, `eligible`, `excluded` and `rules` deep-equal to the frozen file.
  - WP1: all 10 `rounds` deep-equal (9 verified, `shurima` still unverified/dev-only).
  - The committed fixtures were restored afterwards (unchanged on this branch).
  - This re-verifies against the backend's wiki-stamped authority files, not
    against the live wiki. Any **graded public** use must re-capture first.

## 3. What INT1 changed (and why)

The Command Center requires a genuinely owner-gated entry on the live build with no
publicly reachable answer bank. `AdminRoute` is a UX gate (the server enforces admin
rules on RPC/RLS/Edge Functions); the page's JS chunks are public static files. So
the gate alone cannot protect a fixture bundled into those chunks. INT1 therefore
**removes the fixtures from every production-reachable module** and has the owner
load the fixture file from their own disk at runtime.

| File | Change |
|---|---|
| `src/pages/dev/rangefinder/labAuthority.ts` | Fixture import removed; `findRecord(capture, id)` / `roundOrder(capture, seed)` take the capture as a parameter. Grading logic unchanged. |
| `src/pages/dev/word-puzzle/labAuthority.ts` | Fixture import removed; `findRound(rounds, id)` / `roundOrder(rounds, seed)` take the rounds; `WordPuzzleRoundFile` type. Grading/sounding logic unchanged. |
| `src/pages/dev/rangefinder/RangefinderLab.tsx` | Takes `capture` prop; header title "Prototype"; first chrome element is the `Prototype • not server-authoritatively graded` label. |
| `src/pages/dev/word-puzzle/WordPuzzleLab.tsx` | Takes `rounds` prop; same title and label. |
| `src/pages/dev/rangefinder/RangefinderDevLab.tsx` *(new)* | DEV-only host: the **only** importer of `rangeAuthorityCapture.json`. |
| `src/pages/dev/word-puzzle/WordPuzzleDevLab.tsx` *(new)* | DEV-only host: the **only** importer of `wordPuzzleRounds.json`. |
| `src/lib/interaction-labs/packs.ts` *(new)* | `PROTOTYPE_LABEL`; strict validators for both pack files (shape, lattice, slot/targeting enums, slug ids, League-Wiki-https-only source URLs, "verified ⇒ sourced", duplicates, 2 MB cap, invalid JSON). |
| `src/pages/admin/interaction-labs/InteractionLabPage.tsx` *(new)* | Index + per-lab pack loader (accessible `<label>`ed file input, `role=alert` errors, ≥44px targets), then mounts the original lab. Pack is held in React state only: never uploaded, persisted or logged; a refresh asks again. |
| `src/App.tsx` | DEV routes now lazy-load the `*DevLab` hosts (still behind `import.meta.env.DEV`); two new routes `/admin/interaction-labs` and `/admin/interaction-labs/:lab`, each `<AdminRoute>`-wrapped, outside the admin shell (the labs own the arena frame, as `/admin/quiz-content` does). |
| `src/components/Layout.tsx` | Arena page frame for `/admin/interaction-labs/*` (Footer already hides on `/admin`). |
| Tests *(new)* | `src/lib/interaction-labs/packs.test.ts` (10), `src/pages/admin/interaction-labs/InteractionLabPage.test.tsx` (6), `e2e/interaction-labs-access.spec.ts` + `playwright.interaction-labs.config.ts`. |

Untouched: primitives (`Rangefinder.tsx`, `GlyphPress.tsx`, css), `lib/interaction-grammar/*`,
`lib/word-puzzle/authority.ts`, `lib/rangefinder/eligibility.ts`, fixtures, capture
scripts, original e2e specs, every Ranked/Daily module, registry, `SegmentChoice`,
admin shell/catalog, backend, database, Supabase.

### Owner playtest steps (live, once deployed)
1. Sign in as the owner (MFA step-up as usual) and open `/admin/interaction-labs`.
2. Pick a lab, then choose the file named on the page from a local checkout of this
   branch: `src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json` or
   `src/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json`.
3. Play. The lab chrome keeps the original tools (`round`, `state=…`, `seed`,
   Reduced motion, Reset, Next) — these are owner tools and reveal answers on demand.

## 4. Answer-exposure audit

| Surface | Rangefinder | Glyph Press |
|---|---|---|
| Public contract (`*Public`) | No field can hold the answer (original tests). | No field can hold the answer (original tests). |
| DOM before reveal | Canonical units absent (original jsdom + browser tests). | Answer in no text/attribute except image `src` (original tests + INT1 e2e on the admin route). |
| Production JS bundle | **No capture data** (§5 build check). | **No round data / answers** (§5 build check). |
| Signed-out visitor on live | Route redirects; chunk has primitives + loader only. | Same. |
| Owner's tab after loading the pack | Full capture in memory (devtools). Acceptable: the owner is the only viewer. | Full answer bank in memory (L5). Owner-only. |
| Clue images | Ability/champion art; not answer-bearing for cast range. | **L3: `Kaisa/icon.png`, `Heimerdinger/W_…png` spell the answer.** Owner-only acceptable; blocks public use. |
| Reveal source links | Post-reveal only. | Post-reveal only. |
| GitHub | **Repo `mitcherrman/mogsy` is public**, so both fixtures (including the WP1 answer bank) are publicly readable on GitHub since the branches were pushed, and on this branch. Treat both content sets as **burned for any competitive/public graded use**; a public mode needs server-held content. | same |

## 5. Verification

All runs in this cloud container (Linux, Chromium 1194 via `executablePath`). Its
egress proxy blocks `*.supabase.co`, Data Dragon, fonts and the Railway API, and the
app shell waits on Supabase, so browser runs answer every non-local request locally
(see 5.3). Commands are in 5.6.

### 5.1 Unit / component (vitest)

| Suite | Result |
|---|---|
| Original Rangefinder suites (`rangefinder.test.ts`, `Rangefinder.test.tsx`, `eligibility.test.ts`) | **59/59** (handoff: 59) |
| Original WP1.1 suites (`glyphPress.test.ts`, `GlyphPress.test.tsx`, `authority.test.ts`) | **65/65** (handoff: 65) |
| INT1 `packs.test.ts` (validators, file reading, production-boundary source guards) | **10/10** |
| INT1 `InteractionLabPage.test.tsx` (index, unknown lab, loader, wrong pack refused, both labs mount) | **6/6** |
| All interaction-grammar + labs + Layout/Footer/AdminRoute suites | **375/375** |
| `tsc -p tsconfig.app.json` | only the 2 pre-existing errors on `main` (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`); 0 in INT1/GM-R1/WP1 files |
| ESLint (all touched files) | clean |

**Baseline comparison (full vitest, this branch vs `main` `7be45341` in a separate worktree):**
branch 16,720 tests / 30 failed; main 16,580 / 29 failed (+140 = 124 recovered + 16 INT1).
**No branch-only failing file.** The test-level difference is entirely
`LobbyPreviewPage.premiumAnalytics.test.tsx` (and `QuizRankedMatch.rfx1b3` on main),
which fail a varying 1–2 tests on *both* trees on repeated isolated runs, and which INT1
neither touches nor imports. The route-table guards (`App.routeGuards`,
`App.routing-contract`, `admin-registry.routes`) fail the identical 5 tests on `main`
and on this branch.

### 5.2 Original browser suites (`playwright.arena.config.ts` specs, unchanged)

| Spec | Result | Original |
|---|---|---|
| `e2e/rangefinder-continuity.spec.ts` (6 viewports × 2 motion modes + exact lock) | **13/13** | 13/13 |
| `e2e/word-puzzle-continuity.spec.ts` (lifecycles, fit, Next, late answer, punctuation, reveal labels, reduced motion, leak, touch) | **22/22** | 22/22 |

These assert ≤1px structural movement on every frame, ≥44px targets, no overflow, no
answer in the open DOM, zero console errors/warnings, keyboard + touch paths and
reduced-motion parity, now with the prototype label in the chrome row.

### 5.3 INT1 access suite on the production bundle (`e2e/interaction-labs-access.spec.ts`)

`npx vite build` then `vite preview`: **9/9**.

| Case | Result |
|---|---|
| Non-owner session (`owner_auth_state` → not owner) at `/admin/interaction-labs/word-puzzle` | redirected to `/`; no loader |
| Owner: index → Glyph Press → Rangefinder file refused with reason → real file loads → answer absent from open DOM → exact answer typed by keyboard → **solved** → Next → wrong lock → not solved → **refresh returns to the loader** (pack not persisted) | pass |
| Owner: Rangefinder Janna W by keyboard to 550 → **exact**; End → **long**; phone 390×844 touch tap → lock → reveal | pass |
| Signed out: `/admin/interaction-labs`, `/word-puzzle`, `/rangefinder` | no loader, no primitive |
| `/dev/word-puzzle`, `/dev/rangefinder` in production | not routes; nothing mounts |
| Every JS asset reachable from the production entry | no fixture markers (capture timestamps, wiki revision URLs, round notes, `castRangeUnits`) |

Owner/non-owner is simulated by answering the one server question `AdminRoute`
asks (`owner_auth_state`) with a stored session; the real server-side check was
not exercised (no owner credentials here). The owner should confirm once on a
deploy preview.

Build-output grep (independent of the spec): fixture markers in `dist/` = **0**;
the only fixture-path hit is the file-name hint string in `InteractionLabPage-*.js`.
Lab chunks: `InteractionLabPage` 11 KB, `RangefinderLab` 28 KB, `WordPuzzleLab` 31 KB.
`npm run build` itself stops at the post-build prerender step, which fetches the
Railway API (`ENOTFOUND` here); `vite build` succeeds.

### 5.4 Screenshots

`docs/audits/int1-interaction-labs/` (28 JPGs):
- `owner-*` / `prod-signed-out-*`: production bundle (clue/ability art blank because
  the bundle's asset host is stubbed offline in this run).
- `dev-rangefinder-*`, `dev-word-puzzle-*`: original continuity specs with art served
  locally from the backend repo (`VITE_COMBAT_API_URL`), 1600×900 … 360×640, reveals,
  exact lock, long phrase at 360×640.

### 5.5 Found, not fixed (outside this lane)

- **DEV E2E admin persona render loop.** `src/hooks/useOwnerAuth.ts` (DEV/E2E branch)
  returns a new `ensureAuthorized` closure every render, and `AdminAuthProvider`'s
  effect depends on it and calls `setRailway`. So with `VITE_E2E_AUTH=1` and an admin
  persona, every page logs "Maximum update depth exceeded" and the tab eventually
  dies. DEV-only (compiled out of production). This is why the INT1 spec simulates
  the owner RPC instead. Fix: a stable function in that branch. Shared admin-auth
  code, so not changed here.
- The app shell renders blank while Supabase is unreachable (seen in this offline
  container on `main`'s `/dev/match-grid` too).

### 5.6 Reproduce

```
npx vitest run src/lib/interaction-grammar src/components/interaction-grammar src/lib/rangefinder src/lib/word-puzzle src/lib/interaction-labs src/pages/admin/interaction-labs
npx playwright test -c playwright.arena.config.ts rangefinder-continuity word-puzzle-continuity   # networked machine
npx vite build && npx playwright test -c playwright.interaction-labs.config.ts
```
On a machine without outbound network, the original specs need the same hermetic
routing as the INT1 spec, plus `VITE_E2E_AUTH=1` on the dev server (it only stops
the analytics heartbeat, whose cancelled requests trip the spec's console gate).

## 6. Blockers for anything beyond the owner playtest (not done; separate approval)

Both original handoffs already scope this; INT1 confirms it is required, not optional:

1. **Backend modules** `rangefinder.v1` / `glyph_press.v1` in `League_Combat_Simulator`
   (`ranked_modules/`), Reconstruct/Scrub pattern: server-minted per-round tokens,
   public payload without canonical values, server grading, reveal contract.
2. **`SegmentChoice` widening** (`{ stop }`, `{ glyphs }`) and the client seams
   listed in `RANGEFINDER_R1_HANDOFF.md` §18.2 — shared Ranked files, so a
   coordinated change, not this lane.
3. **WP1:** server-side sounding ledger; opaque clue assets (L3); fresh content not
   published on GitHub; a decision on L2 (sounding a given glyph).
4. **Rangefinder:** re-capture from the live authority at productionization time.
5. If the owner wants the pack served in-app instead of loaded from disk: an
   owner-only Supabase Storage object or Edge Function (RLS / `require_admin`) —
   a database/infra change, so out of scope here.

## 7. History of this lane

- Discovery (PR #19 first commits): no source on any remote ref; recorded BLOCKED.
- Command Center located the two local Windows branches; owner pushed them
  (verified heads above). Cloud agent could not reach the Windows checkout, which
  is why recovery went through the owner.
- INT1 (this revision): merged originals, owner-only production entry, audit, tests.

## INT1.2 — Command Center integration (2026-10-14)
Original prototype branch `a4400ccb` merged onto `main` `ecc6fcbe`, preserving Assembly, Scrub, Numeric, Creator Replay and mobile arena regression work. Added owner `/admin/interaction-labs` routes and Leaguecraft → Ranked → Playtests registry entry; DEV-only originals remain. Shared stage hook retained from main because implementation body is identical. Original 124+16 unit and 44 browser tests need rerun against merged main. Not public Ranked/Daily, not server-graded. Owner must choose historic pack from disk each session; content was already public on GitHub. Real owner MFA smoke still required.
