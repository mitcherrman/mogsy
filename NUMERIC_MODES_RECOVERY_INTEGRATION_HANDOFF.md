# NUM-REC1 — Original Numeric Modes Integration Handoff
Date: 2026-10-14. Status: source branches verified; integration pending.

## Verified original work
- Stat Drop: mig1/1-interaction-lab @ b932af4b65e1a2225e4adb20a87430723788b358. Read docs/MIG1_INTERACTION_GRAMMAR_HANDOFF.md. Preserve original StatDrop.tsx and InteractionLab.tsx; production grading/answer-independent scale still unresolved.
- Combat Estimate: combat-estimate/ce1-fable @ 7929f2dc4d68ac948e5dd3c0128eca7a206cee1f. Read COMBAT_ESTIMATE_CE1_HANDOFF.md. Preserve original two-beam EstimateBeam and CombatEstimateLab; local stand-in grading and historical captured authority are not a production backend.
- Grading research: combat-estimate/ceg1-grading-audit @ 14ece9460f57a196f228e7a669c7c2a2f05652b4. Read COMBAT_ESTIMATE_CEG1_HANDOFF.md. Research-only provisional tolerance; not approved for Ranked grading.
- Owner verified clean Windows worktrees, original tracked handoffs and prelim secret-pattern screening; branches are pushed unchanged.

## Preserve cloud-only numeric-lab changes
- Separate Claude worker reported commit 952e61ad and patch 0001-NUM-LAB-Stat-Drop-Combat-Estimate-prototype-playtest.patch; GitHub has neither the commit nor a numeric implementation PR as of this handoff. Save/download patch or grant worker GitHub write capability before its ephemeral container is discarded.
- Cloud worker's assertion that Combat Estimate was never implemented is contradicted by original verified source. Original designs take precedence; selective admin-routing, mobile/testing improvements from the newer patch may be reused only after code review.

## Next assignment — SAME numeric Claude instance, Opus 5.5 MEDIUM
1. Read this handoff and all three original handoffs in full, compare source and new patch. Preserve the original Stat Drop and two-beam Combat Estimate designs; do not overwrite with generic numeric widgets or made-up fixture games.
2. Integrate prototypes in an isolated worktree on lab/numeric-mode-playtests; production-build authenticated owner-only route is target. Historical /dev routes disappear in production and alone do not satisfy owner request.
3. Ensure real authorization; UI lazy-loading is not an authentication boundary. Do not publish answer-bearing fixture/stand-in-server JSON in publicly retrievable production assets. If this needs new authenticated backend routes, document exact safe backend plan and block deployment pending command center review.
4. Clearly distinguish historical verified game facts, dev fixture values, and server-authoritative grading. Never label fake fixtures as League facts; for any ungraded visual test show Prototype - not server-authoritatively graded.
5. Collect owner feedback on exact vs tolerance policy and input experience; do not silently adopt CEG1 provisional policy. No bot/versus or Ranked competitive scoring.
6. Re-run original unit/browser tests and new cross-integration tests for mobile/keyboard/touch/reveal/answer secrecy/auth/accessibility. Compare baseline regressions; preserve independent MG-UX1, Assembly, Scrub, Role Challenge and Patch Ops work.
7. Open draft PR (no merge or deploy) with screenshots, tests, feature provenance, and update handoff with status/blocks/release gates.

## Acceptance
- Both original mechanics accessible for owner review via appropriately protected live admin experience, accurately labelled for their actual grading authority, without exposing private answers or changing public game modes. Backend truth remains a separate certification gate.

---

# NUM-REC2 — integration status (2026-10-14)

Status: **owner-only playtest implemented on `lab/numeric-mode-playtests`; draft PRs open; NOT merged, NOT deployed.** Deployment is blocked on Command Center review of the backend route (§6).

## 0. Correction

My NUM-LAB report (`952e61ad`) said Combat Estimate "never had an implementation". That was wrong. `combat-estimate/ce1-fable` (CE1) and `combat-estimate/ceg1-grading-audit` (CEG1) existed but were not pushed when I searched. The original designs below take precedence over everything in `952e61ad`.

`952e61ad` is preserved unchanged on `preserve/num-lab-952e61ad`, but it is **not** merged here. Its generic `StatDrop` and `CombatEstimate` widgets and its synthetic fixtures were dropped.

## 1. Status per mechanic

| Mechanic | Status | Grading authority |
|---|---|---|
| **Stat Drop** (MIG1.2 original) | **WORKING OWNER PLAYTEST** at `/admin/numeric-lab?mode=stat-drop`, pending backend deploy + flag | **None.** It shows values from a historical capture. MIG1.2 held Stat Drop (HOLD) for lack of a closeness policy and of published scales, and both are still missing. |
| **Combat Estimate** (CE1 original, two-beam balance) | **WORKING OWNER PLAYTEST** at `/admin/numeric-lab?mode=combat-estimate`, pending backend deploy + flag | **None adopted.** The values are CE1's certified-seam capture at backend `8829fc3c`, released by the server after Lock. The reveal is CE1's descriptive comparison. CEG1's tolerance is still research. |

Labels on screen:
- **Arena header (every device):** "Prototype · historical capture"; desktop also shows "Prototype — not server-authoritatively graded".
- **Banner below the arena:** names each capture's branch, commit, implementation and scale policy.
- **Wording:** no "Correct", "Incorrect", points or pass mark anywhere. The browser spec asserts this.

## 2. Feature provenance

| What | Source | State |
|---|---|---|
| `StatDrop.tsx` (+ test), Interaction Lab (`/dev/interaction-lab`), fixtures, renderers, cues, route gate | `mig1/1-interaction-lab` @ `b932af4b` | Verbatim in `6d66943`. Adapted in `6512932`: DD1 removed `content.margin`; registry list; margin wording; the route test's comment stripper. |
| `EstimateBeam` (+ css/test), `estimate.ts`, `useStageRoom`, `CombatEstimateStage`, `contract.ts`, capture JSON, CE1 lab, capture script, continuity e2e | `combat-estimate/ce1-fable` @ `7929f2dc` | Verbatim in `6d66943`. Capture-free pieces split out in `9648474`, behaviour unchanged. |
| Grading research (`scripts/combat-estimate/grading/*`) | `combat-estimate/ceg1-grading-audit` @ `14ece946` | Verbatim. Nothing in `src/` imports it. |
| From the cloud lab `952e61ad` | — | Kept only: the admin-registry entry pattern, the browser-spec style (viewports, leak scan, no side scroll, screenshots) and the IPv4 / preinstalled-Chromium run notes. Nothing else. |

## 3. How it is protected

**Backend** (`League_Combat_Simulator` branch `claude/numeric-modes-playtest-qmyogj`, commit `NUM-REC2: owner-only numeric playtest lab endpoints`):
- **Routes:**
  - `GET /api/admin/numeric-lab/{stat-drop|combat-estimate}/rounds`
  - `POST …/rounds/{id}/lock` with body `{value}` or `{estimate}`
- **Gate:** the router-wide `require_admin` (owner Supabase session; `X-Admin-Key` is ignored), plus `NUMERIC_LAB_ENABLED`, which is **off by default** and answers 404 when unset.
- **Public rounds:** an **allow-listed** projection, checked by the shared `answer_safety.assert_pre_reveal_safe` and by a lab-local deny-list. Fields added to a capture later stay private (tested).
- **Lock:** validates the value against the round's public scale (`StrictInt` on the beam, or within the scale's range and precision), then **releases** that round's private block. It grades nothing and writes nothing.
- **Fixtures:**
  - `numeric_lab/fixtures/combat_estimate_ce1_capture.json`: CE1's capture, byte-identical.
  - `numeric_lab/fixtures/stat_drop_mig1_rounds.json`: MIG1.2's six rounds, exported by MIG1's own `labFixturesFor("stat-drop")`.
  - Both fail closed on load and sit outside every static mount (tested).

**Frontend:**
- **Routes:** `/admin/numeric-lab` sits behind `AdminRoute`; that is UX, not the boundary. `/dev/numeric-lab` mounts the same page in DEV only, for browser specs.
- **No answers in the bundle:** the page chunk imports no fixture, capture or lab authority. A unit test walks the page's whole static import graph and fails on any `__fixtures__`, `labFixtures`, `labAuthority` or `.json`. That walk caught CE1's arena placeholder pulling Ranked's probe fixture JSON, which is now replaced by an inert placeholder.
- **Production `vite build` scan:**
  - All 12 CE1 exact answers, multipliers and formula texts, and the capture contract string, appear in **0** emitted assets.
  - `/dev/numeric-lab`, `/dev/combat-estimate` and `/dev/interaction-lab` are not registered; only Layout/Footer path strings remain.
  - The owner chunk `NumericLabPage-*.js` contains no answer value.
- **Pre-existing observation, not introduced here:** MIG1's three Leaguecraft Stat Drop evidence sentences also appear in `olaf.standard-*.js` and `zed.standard-*.js`. `main` already emits those from `src/lib/journey/__fixtures__/j3/*.json`. The owner chunk does not import them.

## 4. Owner feedback (exact vs tolerance, input experience)

- **No pass mark.** The lab shows none and evaluates no candidate policy; this keeps the owner's call blind, as CEG1 §10 requires.
- **Gut call per round:** after each reveal the owner records `fair-correct`, `fair-incorrect` or `unsure`, plus a note on input feel, premise clarity and the reveal. Device and time-to-lock are recorded automatically.
- **Combat Estimate log:** downloads in **CEG1's exact CSV format** and is graded offline by CEG1's own script: `npx tsx scripts/combat-estimate/grading/grade_playtest.ts <log>.csv`. It prints each candidate policy's agreement with the gut calls; ≥ 80% is CEG1's bar. A unit test parses the export with CEG1's own `parsePlaytestCsv`.
- **Stat Drop log:** downloads as feedback only, since no Stat Drop grading research exists.
- **Storage:** nothing is stored server-side; the log lives in the page until downloaded.

## 5. Evidence

**Backend** (`python -m pytest numeric_lab/tests`): **26 passed**. Coverage:
- non-owner refused on every route, including with `X-Admin-Key` or a bad bearer;
- flag off answers 404;
- behavioural registration on the real `api_server.app`;
- no answer or result before Lock, and the projection is an allow-list;
- release after Lock, with the pinned Jarvan Q case at 199 raw and 144.2259 after armor;
- 12 refusal shapes; unknown round answers 404; a tampered capture refuses to load; no static mount.

Adjacent guard and route suites show **the same 16 failures with and without** this change (253 pass either way).

**Frontend:**
- **Original suites after the port:**
  - MIG1 89/89 on its own branch;
  - CE1 + CEG1 95/95 on theirs;
  - on this branch, the interaction-grammar, labs, combat-estimate and grading suites at **360/360** before integration.
- **Owner lab unit tests:** 10/10.
- **`App*`, admin, `pages/dev`, ranked-arena, ranked-core, journey, guards and grading together:** the only failures beyond the base's 19 are 3 timing assertions in `LobbyPreviewPage.premiumAnalytics.test.tsx`. Run alone, that file fails identically on base and branch (1 of 39).
- **`tsc -p tsconfig.app.json`:** clean. ESLint: 0 errors.
- **Browser** (Chromium, `-c playwright.arena.config.ts`):
  - `numeric-lab-owner`: **7/7** at 1440×900, 390×844 (touch) and 360×640 (touch), plus a refused-session case.
  - CE1's original `combat-estimate-continuity`: **15/15** after the host extraction (≤1px movement budget, 6 viewports × 2 motion modes).
- **Screenshots:** `docs/audits/numeric-rec2-owner-lab/` (open and revealed states for both mechanics at all three sizes, plus the refused state). MIG1's and CE1's original captures are in their handoffs.

## 6. Blockers and release gates (Command Center)

1. **Backend review + deploy:** review and merge the backend draft PR, deploy it, and set `NUMERIC_LAB_ENABLED=1` on the owner's backend only. Until then `/admin/numeric-lab` shows "not enabled on this backend".
2. **Frontend review:** review the draft PR from `lab/numeric-mode-playtests`. Merge only after (1), at the command-center integration gate.
3. **Grading decision:** owner playtest per §4. Choose exact-cell, CEG1 hybrid (`max(±2, 2.5%)`), the fallback or strict, then implement it **server-side** as a versioned policy. None is adopted here.
4. **Stat Drop return-from-HOLD:** a closeness policy (product memo), plus authority-published, answer-independent scales per metric family. Today's are MIG1's lab scales.
5. **Current-patch authority:**
   - Combat Estimate: re-capture at a current backend with the production DB (CE1's capture script), and replace the dev `4×AD` beam policy (CEG1 T6).
   - Stat Drop: production values would come from `mastery/facts` `ChampionFact` (ready/ready_derived) with a readable patch stamp.
6. **Productionising as a game mode:** a `combat_estimate.v1` / numeric RoundModule, `SegmentChoice` widening and a registry entry, per CE1 §15 and CEG1 §11. Out of scope here.

Deferred, as instructed: bot, versus, Ranked scoring and speed changes. Untouched: MG-UX1, Assembly, Scrub, Role Challenge and Patch Ops files.
