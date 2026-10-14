# UX3B — Worlds 2026 final release acceptance

| | |
|---|---|
| Branch | `ux3b/worlds-release-acceptance` (worktree `C:\Users\mlmit\mogzy-wt\ux3b-accept`), pushed, **not merged** |
| Audited SHA | FE `origin/main` `4b13c042ef88bff0f3d261b69a3277ecf4ffc2e6` (re-verified 2026-10-14 05:19Z, matches the assignment) |
| Branch content | this handoff, one new acceptance test file (`src/pages/ProPlayHub.ux3bMidnight.test.tsx`), the browser script and its evidence (`docs/handoffs/ux3b/`). **No production file changed** |
| Production actions | none: no Lovable Publish, no `.env` change, no Railway, no Supabase write, no merge |
| Recommendation | **CONDITIONAL GO** (§9). No release blocker found. Stop for owner approval |

Audit window: 2026-10-13 22:15 → 2026-10-14 00:00 Los Angeles (2026-10-14 05:15–07:00Z). The Featured switch is at 2026-10-15T07:00Z, about 24 h after this audit.

## 1. Objective

Decide, on current evidence, whether the merged and disabled Worlds experience (UX1 + UX2 + UX2A + UX3A + HUB-NEXT1) can be enabled and published; find blockers; give the exact enable and rollback procedure. Nothing was rebuilt or redesigned.

## 2. Publication status (verified)

| Question | Answer | Evidence |
|---|---|---|
| GitHub `main` HEAD | `4b13c042` | `git fetch`; no `ux3b` branch existed before this one |
| What is published on mogzy.lol | **Production code of `4b13c042`, flag OFF** | See below |
| Flag value in the actual publication | **Absent** (therefore off) | The live bundle inlines the whole build env |
| Build-environment override | **None at the last publish** | Same object: the only `VITE_*` keys are the 4 tracked `.env` keys |
| Lovable sync vs publish | Sync never publishes; Publish is a separate manual step | Lovable docs (§2.3); not observed directly |
| Lovable editor HEAD | Not independently verified | Assignment-reported: matches `4b13c042` |

### 2.1 How the published build was identified

The published HTML (`https://mogzy.lol/`, `x-deployment-id psr2.3b9c512a-…`, Cloudflare) loads `assets/index-DIboty9_.js`. Lovable builds without git, so the release stamp is `{commit:"unknown"}`; the SHA was identified by content instead:

- The published Layout contains `n==="/dev/match-grid"` (Match Grid merge `8ac64832`, in PR #10), and the published `ProPlayHub-BbJPXWjZ.js` contains `tournament-fixture`, `next-unresolved` and "Tournament schedule" (HUB-NEXT1 `0da6d74a`). Only `4b13c042` holds both: `b7889a79` lacks Match Grid and the PR #10 branch lacks HUB-NEXT1. Between `8ac64832` and `4b13c042` the only non-test `src` changes are HUB-NEXT1's four files.
- A local production build of `4b13c042` (flag unset) was compared with the published chunks literal by literal: `ProductionExperience` (1,410 literals), `ProPlayTournament` (611/612) and `ProPlayHub` (520). The only differences are minifier identifiers and chunk-hash file names. Sizes: published 144,472 / 60,146 / 54,650 B, local 144,465 / 60,187 / 54,655 B (swc vs the esbuild JSX used locally).
- The published Hub chunk carries the PW4-B calendar (`worlds-2026`, `from:"2026-10-15"`, `America/Los_Angeles`) and the hub's 60 s clock. So **the 15 Oct switch is already live and needs no publish**.

### 2.2 The flag in the publication environment

`productionGate.ts` reads `import.meta.env?.VITE_WORLDS_EXPERIENCE_ENABLED`. Because of the optional chain, Vite inlines the entire env object, and it is readable in the published bundle:

```
{BASE_URL:"/",DEV:!1,MODE:"production",PROD:!0,SSR:!1,
 VITE_COMBAT_API_URL:"https://web-production-83e53.up.railway.app",
 VITE_SUPABASE_PROJECT_ID:"…",VITE_SUPABASE_PUBLISHABLE_KEY:"<redacted>",VITE_SUPABASE_URL:"…"}
```

Vite puts every `VITE_*` variable from `.env` **and** from the process environment into this object. `VITE_WORLDS_EXPERIENCE_ENABLED` is not in it, so it was neither in `.env` nor injected by Lovable's builder at the last publish. This is a **verified** fact about the current publication. A Lovable project setting that might be added later cannot be inspected from here; the same grep (§7, step 5) checks any future publish.

The live behaviour agrees: `https://mogzy.lol/lol/pro-play/tournament/worlds-2026/teams` and `/schedule` render the 404 page, and the Worlds page never requests the experience chunk (browser group A/B).

### 2.3 Lovable sync and publish

Lovable's documentation says a pushed or merged commit updates the editor and preview but never the live site; the live site changes only on **Publish → Publish changes**, and a dot on the Publish button marks unpublished changes. This was not observed in the Lovable UI (no access from this session). The published bundle containing `4b13c042` code about two hours after the merge (merge 20:03 PDT, observed 22:19 PDT) means someone published `4b13c042`. The audit cannot tell who did it or when.

## 3. Live tournament authority

`GET https://web-production-83e53.up.railway.app/api/live-esports/tournament/worlds-2026` (the production backend from the published env), **HTTP 200 in 0.52 s at 2026-10-14T05:20:48Z**. No credentials needed; nothing private in the body.

| Field | Value |
|---|---|
| `contract_version` | `tournament_context_v2` |
| `source` / `source_ok` / `stale` | `getSchedule` / `true` / `false`; `sources.schedule` ok, `pages_read: 2`, `page_failure: null`; `sources.standings` ok |
| Identity | `worlds-2026`, "League of Legends World Championship 2026", league `98767975604431411`, tournament `115660540725177488` (`worlds_2026`), 2026-10-15 → 2026-11-14 |
| Stages | Play-In 15–18 Oct, Los Angeles, double elimination, 6 matches; Swiss 23–31 Oct, Allen TX, 33 matches, 3 wins / 3 losses; Knockouts 3–14 Nov, Allen TX, Final in Brooklyn, single elimination, 7 matches |
| Field | **19 teams**: LPL 4, LCK 4, LEC 3, LCS 3, LCP 3, CBLOL 2; 15 enter Swiss (tiers 1/2/3 × 4, tier 4 × 3), 4 Play-In |
| Matches | **46 / 46**, unique ids; 46 `upcoming`; first 2026-10-15T18:00Z (C9 v KC), last 2026-11-14T19:00Z (Final `115660540726095133`) |
| Coverage | `complete: true`, `expected_matches: 46`, `found_matches: 46`, `basis: standings`, `missing_match_ids: []`, `unlisted_match_ids: []`, `warnings: []` |
| Swiss rounds | 8 / 8 / 8 / 6 / 3 match ids |
| Named vs TBD | Only the two Play-In upper semifinals have named teams (C9 v KC, FUR v MVK). All other 44 matches are TBD. Slots: 78 `draw`, 11 `winner_of`, 3 `loser_of` |
| Results | `phase: pre_event`; `counts` 0 completed / 0 live; no `winner_code`; `swiss_records`, `knockout_teams` empty; `champion_code` null |
| Lineups | all 19 `lineup_status: not_certified`, `lineup: []`; note "Lineups are not shown: no official Worlds 2026 registration has been published or certified" |

`dcgi-2026` also answers 200, and an unknown context answers 404 `unknown tournament context`.

**Degraded upstream** (backend source, `origin/master` `routes/live_esports.py`; not exercised live): an upstream failure never returns 5xx. The endpoint serves a cached answer marked `stale` (120 s cache, 900 s stale limit, 30 s retry cooldown after a failure, PW4-A1/A2), or an empty `matches` with `source_ok: false`; a failed later page keeps earlier pages with `coverage` saying what is missing. The frontend's handling of each of those shapes was exercised in the browser by intercepting the live response (§5 F).

The response agrees with the frontend's expectations (46 matches, 19 teams, v2, stage keys `play_in` / `swiss` / `knockout`). No disagreement was found.

## 4. Test results (current `main` + this branch's test)

All runs use this machine's workarounds (esbuild-JSX scratch config, rollup WASM hook; no pnpm).

| Check | Result |
|---|---|
| Focused Vitest: `src/pages/pro-play`, `src/lib/pro-play`, `src/components/pro-play`, `ProPlayHub.test.tsx`, the new UX3B test, `hub5Isolation`, `src/pages/dev/worlds-experience`, `src/lib/live-esports`, `src/pages/esports`, **all** `src/App.*.test.ts`, `src/components/Layout.*`, `src/lib/match-grid`, `src/components/match-grid`, `src/pages/admin/ranked`, the Ranked module `registry` and Match Grid module tests | **91 files, 2,602 tests: 2,599 pass, 3 fail** |
| The 3 failures | `App.routeGuards` › admin platform-policies gate, and `App.routing-contract` › retired multiplayer routes (×2). These are **historical**: identical on a detached `4e04448b` checkout from before UX3A (3 failed / 9 passed). They are source-text contract tests for routes that LEGACY1 removed; UX3A's and HUB-NEXT1's focused sets did not include them. Not Worlds-related |
| New UX3B test (`ProPlayHub.ux3bMidnight.test.tsx`, 9 tests) | 9 / 9. The first version failed 2 cases because its wait was shorter than the Worlds read's two retries; that was a test-timing fix, not a product change |
| `tsc --noEmit -p tsconfig.app.json` | 2 errors, both pre-existing (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`), the same as UX3A / HUB-NEXT1 |
| ESLint (App, Layout, tournament page, hub, MatchCenter, explicitFixture, featuredTournament, both Worlds dirs, the new test) | 0 errors; 8 warnings, the same set UX3A recorded (App.tsx's one + 7 `react-refresh` in the experience) |
| Production `vite build` | flag unset: ok (47.9 s); flag `true`: ok (52.7 s); the same chunk set |
| Bundle isolation (both builds) | `Prototype data`, `scenarioClock`, `Not real Worlds 2026 data`, `scenario-picker`, `play-in-live`, `WorldsExperienceDev`, `MatchGridLab`: **0 files**. `ProductionExperience` 144 KB is lazy; `ProPlayTournament` 60 KB |

## 5. Browser evidence

Headless Edge (Playwright 1.64, `channel: msedge`) against `vite preview` production builds of `4b13c042`: flag **unset** on `:5281` and **`true`** on `:5282`, both reading the **live production API**. Group A also loads **https://mogzy.lol** itself. Every group uses a fresh browser context. Script: `docs/handoffs/ux3b/ux3b-browser.cjs`. Results: `ux3b-results.json`.

**Final run: 158 / 159.** The one failure was group A's 1440 text comparison. The two page loads were two minutes apart, so the feed line read "updated 10:36 PM" against "10:38 PM". Group A was re-run unchanged and passed 16 / 16 (`ux3b-results-A-rerun.json`). Earlier runs found four checks with wrong assumptions in the script, and the script was corrected:
- the HUD selector;
- the knockout slug (§6 L1);
- the filter-chip selector;
- the refetch trigger: the app's `QueryClient` sets `refetchOnWindowFocus: false`, so the check now advances the page clock past the 120 s poll.

| Group | Result | What it covers |
|---|---|---|
| A. Flag-off build vs **published site**, 1440 and 390 | 16 / 16 (rerun) | Same TournamentV2 sections, text (1,023 / 977 words), title, canonical and description as mogzy.lol. The experience chunk is never requested. No overflow, no errors |
| B. Flag-off routes (the rollback state) | 10 / 10 | `/teams`, `/schedule`, `/stages/swiss`, `/schedule?match=` are each the 404 page with `noindex` and a link home. On **published** mogzy.lol, `/teams` and `/schedule` are the 404 page today. DCGI v1 renders. `/lol/dev/worlds-experience` and `/dev/match-grid` 404. No experience chunk requested |
| C. Flag on, **1440 × 900** | 37 / 37 | Overview at the Worlds URL with the published title and canonical. The frame spans the viewport and starts exactly at `--app-header-h`. The command bar hit-tests inside the experience at 5 points, so the global HUD does not overlap it. The frame fills the viewport below the header. One `h1`; the Footer follows the frame; no body overflow; nothing clipped outside a scroll container; no simulation UI; Discover not offered. Nav Overview → Stages → Teams → Schedule (URL, title and query-free canonical each), Back ×3, Forward. `/stages/play-in`, `/stages/swiss` and `/stages/knockouts` by direct URL plus refresh. Swiss Round 3 survives a refresh. Knockouts before the draw: empty slots, no team named. Schedule: fixture → detail with `?match=`, canonical stays `/schedule`, Match Centre link only for a listed fixture (C9 v KC → `?next=`), Escape closes, the stage filter writes `?stage=`, and a `day+match` deep link survives a refresh titled "C9 vs KC". `?team=KC` opens Karmine Corp; region LCK clears KC (UX2A). Keyboard: Tab reaches the Teams nav and Enter opens it. The schedule list scrolls its last fixture into view. DCGI is unchanged with the flag on. No Match Grid chunk; no page errors |
| C. Flag on, **1280 × 800** | 37 / 37 | Same as 1440 |
| D. Flag on, **390 × 844** (touch) | 13 / 13 | Compact frame; bar under the 48 px header; no overflow or clipping; one `h1`. Team tile → bottom sheet, Back closes it. Fixture → match sheet, its close control closes it. Refresh on a nested route. Footer reachable; no overflow after moves; no errors |
| E. Reduced motion | 3 / 3 | `data-motion="reduced"`; no transform mid-move; after the move only the new screen is exposed (no stale or inaccessible screen left visible) |
| F. Data states on a screen path | 10 / 10 | 503 (after retries), 404, unsupported contract → the page's messages. Partial, stale and `unknown` → the status-strip lines. While the read is held: a frame-shaped skeleton, then the requested screen. **Refetch failure**: "Couldn't get the latest update" with the last good data still drawn; **Retry** recovers and clears it |
| G. HUB-NEXT1, flag off / on | 7 / 7, 8 / 8 | `?next=<Final>` shows that fixture (id kept, "TBD vs TBD", Knockout Stage · Finals), read from the tournament. Event link: off → the canonical Worlds page; on → `/schedule?match=<Final>`, and clicking it opens the Final's detail. `?next=<Final>&game=<id>` shows the Final. An unknown id gets a blocking "Can't confirm that match" with no other match. An in-feed `?next=` (C9 v KC) uses the normal upcoming board. The ordinary hub board is unchanged |
| H. Midnight on an open hub (Playwright clock from 2026-10-15T06:59:40Z), off / on | 3 / 3, 3 / 3 | DCGI is featured at 23:59:40 LA. **Without a reload** the pill moves to Worlds within 70 s. It opens TournamentV2 (off) or the experience (on) |
| I. Coexistence, off / on | 6 / 6, 6 / 6 | The Pro Play hub, `/lol/pro-play/live`, `/lol/pro-play/stats` and `/lol` render, with no experience chunk outside Worlds and no page errors |

Screenshots are kept for evidence and noteworthy states only; no defects are shown.
- `ux3b-off-vs-published-{off,published}-1440`: the flag-off build and mogzy.lol, side by side.
- `ux3b-on-overview-{1440,1280}`, `ux3b-m-on-overview-390`, `ux3b-m-on-match-sheet-390`.
- `ux3b-on-schedule-match-1440`.
- `ux3b-on-hub-final-to-schedule-1440`: the Hub's Final link landing on the Final in the Schedule.
- `ux3b-off-hub-final-1440`.
- `ux3b-on-api-{503,partial}-1440`, `ux3b-on-refetch-failed-1440`.

Not exercisable with real data: live or completed Worlds matches, a live-match feed follow, and lineups. None exist yet; they are covered by the fixture-based suites (PW4-B scenarios, HUB-NEXT1 §6).

## 6. Blockers and limitations

**Release blockers: none found.**

Non-blocking findings:

- **L1. `/stages/knockout` is not a URL.** The slug is `knockouts` (`navigation.ts` `STAGE_SLUG`), and the experience's own links, titles and canonicals use it. The singular form, which the assignment lists, is treated as an unknown stage and corrects in place to the default stage (Play-In today). No in-app link produces it. Optional follow-up: a one-line alias in `parseLocation`.
- **L2. Rollback leaves nested links as 404s.** A flag-off build registers no `worlds-2026/*` route, so shared `/stages/*`, `/teams` and `/schedule?…` links land on the `noindex` 404 page with a link home. The canonical Worlds URL keeps working throughout. Indexed screen canonicals would drop out. Decision and impact: §8.
- **L3. No passive client-error telemetry.** The app has chunk-load recovery (`chunk-recovery.ts`: one reload per path per 60 s) and analytics, but no client error reporting (no Sentry-type capture). Post-publish monitoring is therefore active smoke checks, backend logs for the tournament endpoint, and user reports (§7). No new infrastructure is proposed.
- **L4. The published SHA is not stamped.** Lovable's build has no git, so `__MOGZY_FRONTEND_RELEASE__` is `unknown`. Publication identity comes from content markers and the inlined env object (§2).
- **L5. The Featured slot is empty while Worlds loads at the switch.** `TournamentSpotlight` draws nothing while its read is pending. At 00:00 LA the pill is absent for one Worlds read, and up to about 3 s if that read fails (two retries), before the configured-identity "unavailable" pill. Cosmetic.
- **L6. `matchCentreLink.ts` restriction.** Recommendation: **keep it for the initial release.** It offers the Match Centre only for fixtures the Hub's `/upcoming` lists, so today only the next ~12 matches within 14 days get the button; the Final shows the "not in the upcoming list yet" note. Since HUB-NEXT1, the Hub renders any configured-tournament fixture correctly. Relaxing the restriction to "any Worlds fixture" is safe and can be a later scoped enhancement. Keeping it changes nothing that was accepted.
- **L7. Correction to UX3A §13.** The app `QueryClient` has `staleTime: 60_000`, not React Query's default of 0. Going from the Hub pill to the page within a minute reuses the cached read rather than making two.
- **L8. Unrelated to Worlds.** `Layout.isFullBleed` lists `/dev/match-grid` in every build, but the route exists only in DEV. In production that URL's 404 page is drawn full-bleed. Cosmetic.
- Everything in UX3A §13 (other than the hub `?next=` item, now fixed by HUB-NEXT1) and UX2 §11 / UX2A still applies. The flag needs a rebuild; Today follows the viewer's clock; the clock is 30 s.

## 7. Enable procedure (owner-approved only)

1. **Baseline.** Confirm FE `main` is still `4b13c042`, or note what it is, and that mogzy.lol still serves flag-off code: `/lol/pro-play/tournament/worlds-2026/teams` shows the 404 page.
2. **Environment.** The only lever is the tracked `.env` (§2.2). Lovable injects no `VITE_*` override.
3. **Flag change.** On FE `main`, add one line to `.env`, then commit and push with the message `Enable Worlds 2026 experience (VITE_WORLDS_EXPERIENCE_ENABLED)`:
   ```
   VITE_WORLDS_EXPERIENCE_ENABLED="true"
   ```
4. **Build and publish.**
   - In Lovable, confirm the editor shows that commit; the Publish button shows the "unpublished changes" dot.
   - Click **Publish → Publish changes**.
   - Merging or pushing alone publishes nothing.
5. **Post-publish smoke, about 5 minutes.**
   - Hard-reload `https://mogzy.lol/lol/pro-play/tournament/worlds-2026`: the experience is shown. Titles follow UX3A §8.
   - Deep-link and refresh `/stages/swiss`, `/stages/knockouts`, `/teams`, `/schedule?day=2026-10-15&match=115660588583171786`.
   - `/lol/pro-play/tournament/dcgi-2026` is unchanged.
   - `/lol/dev/worlds-experience` gives the 404 page.
   - The Hub pill opens the experience.
   - On a phone, open a team sheet and a match sheet.
   - Bundle check: the published main script's env object must contain `VITE_WORLDS_EXPERIENCE_ENABLED:"true"`:
     ```bash
     curl -s https://mogzy.lol/ | grep -o 'assets/index-[^"]*\.js' | head -1 | xargs -I{} curl -s https://mogzy.lol/{} | grep -o 'VITE_WORLDS_EXPERIENCE_ENABLED[:"a-z]*' | sort | uniq -c
     ```
     Today, flag off, this prints only the bare name once (the gate's read site; verified 2026-10-14). Enabled, it must also print `VITE_WORLDS_EXPERIENCE_ENABLED:"true"`. If Lovable's chunking ever moves the env object out of `index-*.js`, rely on the behavioural checks above.
   - Optional full run: `OFF=… ON=https://mogzy.lol ONLY=C,D,F,G node docs/handoffs/ux3b/ux3b-browser.cjs`. Groups G and H assume the 13–14 Oct DCGI state for some hub expectations.
6. **Monitoring, first hours and the first live Play-In match (15 Oct 18:00Z).**
   - Watch the tournament endpoint's HTTP status and latency in Railway logs.
   - Open the Worlds URL in a fresh browser and check for console errors.
   - Watch for `__mogsy_reload=` in visited URLs (chunk-recovery reloads) in analytics or reports.
   - Check the status strip for stale or partial data.
   - Compare against the published TournamentV2 on a flag-off local build if in doubt.
7. **Rollback triggers.** Roll back if any of these occur:
   - the experience fails to render, or its chunk fails to load, for real visitors;
   - a page error on any of the four screens;
   - wrong or invented data (a team, result or winner the API does not serve);
   - a screen unusable at 390 px or on desktop;
   - a stuck loading state while the API answers.

   API outages alone are **not** a trigger: the published page shows the same data and the same errors.

## 8. Rollback procedure

1. Revert the `.env` line, or set `VITE_WORLDS_EXPERIENCE_ENABLED="false"`. Commit and push to FE `main`.
2. **Lovable Publish → Publish changes.**
3. **Not instantaneous.** Rollback takes:
   - the time to commit;
   - the time for Lovable to pick up the commit;
   - Lovable's build and publish, which this audit could not measure (a local `vite build` takes about 50 s; budget minutes, not seconds);
   - a full reload by each visitor. `index.html` is `no-cache` and assets are hashed and `immutable`, so new visits get the old page at once. Tabs already open keep running the experience until they reload; if Lovable removes the old chunks, the chunk-recovery reload moves those tabs to the rolled-back build.
4. **Post-rollback smoke.**
   - The Worlds URL renders TournamentV2 (the `section-*` blocks).
   - `/teams` gives the 404 page.
   - The bundle check above prints no `VITE_WORLDS_EXPERIENCE_ENABLED:"true"`.
   - The Hub pill opens the published page.
5. **The Featured switch is unaffected** in either direction (§5 H, `featuredSwitchUx3a.test.tsx`, `ProPlayHub.ux3bMidnight.test.tsx`).
6. **Nested links after rollback (L2).** Shared screen links return the `noindex` 404 page until the experience is re-enabled. **Assessment: acceptable for the initial release, not a blocker.**
   - Rollback is an exceptional path.
   - The canonical URL never breaks.
   - The 404 page links home.

   The cheap mitigation is a flag-off-only route in `App.tsx`: `worlds-2026/*` → `<Navigate to={WORLDS_EXPERIENCE_BASE} replace />`. It is about 3 lines plus a route-ranking test. Its impact:
   - it changes today's flag-off behaviour (those paths stop 404ing);
   - it drops the selection a link carried;
   - search engines see a client-side redirect instead of `noindex`.

   It only helps if it ships **before** activation, because rollback reuses the same code. **Owner decision.** If sharing links during Worlds matters more than keeping today's flag-off routes byte-identical, approve it as a small change before the enable.
7. **Code rollback.** Reverting the UX3A merge `9fb89ac3` is the fallback if the flag line ever proves insufficient. Not expected.

**Ownership.** The owner or command center approves the enable, the publish and any rollback. Lovable Publish is done by the owner. This audit made no production change.

## 9. Recommendation: CONDITIONAL GO

The merged frontend can safely enable the Worlds experience. Evidence:
- the current live data is complete and consistent (46 / 46, 19 teams, v2);
- every screen, state and size passed in a real browser against that data;
- the flag-off build is identical to what mogzy.lol serves today;
- the Featured switch does not depend on the flag;
- HUB-NEXT1 works in the integrated build.

Conditions:
1. Explicit owner approval of the enable and of the Lovable Publish (§7).
2. An owner decision on L2: accept 404s for nested links after a rollback, or approve the small redirect **before** enabling.
3. Run the §7 post-publish smoke right after publishing. Watch the first live Play-In match (15 Oct 18:00Z), since live and completed states have only fixture-based coverage so far. That watch overlaps PW4-C.

On timing: the 15 Oct 07:00Z Featured switch is already live and needs nothing. Enabling before or after it is independent. Enabling before 15 Oct 18:00Z means the first real live data is met on the new presentation. That is acceptable given the fixture coverage and the rollback path, but someone should be available to roll back during that match.

## 10. Next smallest action

Owner: decide L2. Then, if approved, commit the one `.env` line on FE `main` and click **Lovable Publish → Publish changes**. Then run §7 step 5.

## Verified facts / worker-reported / unknown

- **Verified here:**
  - origin/main `4b13c042`;
  - the published code equals `4b13c042`'s production source, with the flag absent from its build env;
  - the live API state (§3);
  - all test, build and browser results (§4, §5);
  - the pre-existing failures reproduce on `4e04448b`;
  - the published Hub carries the 15 Oct calendar.
- **Worker- or assignment-reported, not reproduced:**
  - the Lovable editor HEAD matches `4b13c042`, and Lovable's own `.env` view lacks the flag;
  - UX1 / UX2 / UX2A / UX3A / HUB-NEXT1 historical runs (used only as context);
  - backend degraded-mode behaviour (read from source, not triggered live).
- **Unknown:**
  - Lovable publish duration;
  - whether Lovable keeps old asset files after a publish;
  - who published `4b13c042` and when;
  - any Lovable project setting not visible in a build's output;
  - real live and completed tournament data.

### Machine notes

- Builds: `vite build` with `docs`-external scratch config (`vite.ux3b.mts`: the repo config with esbuild JSX) and the rollup WASM `--require` hook, `NODE_OPTIONS=--max-old-space-size=6144`.
- Preview: `vite preview` launch entries `ux3b-off` (:5281) and `ux3b-on` (:5282).
- Baseline: a detached worktree `mogzy-wt/ux3b-base-4e04` at `4e04448b`.
- Do not run pnpm in worktrees.
