# Journey Enhancements — Integration & Experiential QA Handoff

Date: 2026-09-26. Scope: combine the approved post-launch Journey enhancement branches onto current production, resolve conflicts, and playtest the combined product. **No new features. Nothing pushed. Nothing deployed.** The same file is committed in both repos.

---

## 1. Production heads

| Repo | At start | At end (re-fetched) | Note |
|---|---|---|---|
| Backend `origin/master` | `f6b6f012` (J6 deploy) | `f6b6f012` | unchanged |
| Frontend `origin/main` | `61673c53` | **`3eba8494`** | advanced **during** the pass (USERS2 activity-lifecycle docs + `src/lib/analytics/activityLifecycle.*`); merged in, no overlap |

The branches were cut from backend `f6b6f012` and frontend `6a1e5282`. Frontend production since `6a1e5282`:

* `7a139751`: USERS2.1 Users audience IA;
* `61673c53`: analytics audit docs;
* `3eba8494`: activity lifecycle.

All three touch only admin/analytics/docs, with zero file overlap with Journey, SFX or Formula. All of them are preserved.

## 2. Release-candidate SHAs (local only)

| Repo | Branch / worktree | Code RC | Final (with this doc) |
|---|---|---|---|
| Backend | `jenh/integration-backend` @ `League_Combat_Simulator/.worktrees/jenh-backend` | `0e51ea8a` | the commit adding this file, on top of `0e51ea8a` |
| Frontend | `jenh/integration-frontend` @ `mogsy/.worktrees/jenh-frontend` | `f279c273` | the commit adding this file, on top of `f279c273` |

### Backend history (onto `f6b6f012`)

1. `bc4f6152`: merge `92951659` (K1 `502cbc06` + K1 handoff + JM1 `176a0630` + JM1 handoff). The merge was clean.
2. `0e51ea8a`: merge `c7667afc` (JX2 motif proof). It adds tests and a handoff only: `test_jx2_journey_motif.py` and `docs/handoffs/JX2-generated-surface-motifs.md`. It was clean, and **no motif runtime change was made**.

Runtime delta vs production is exactly the two approved files: `mastery/setup_state/journey.py` and `ranked_public/service.py`. The integrated tree differs from `92951659` only by the two JX2 test/doc files.

### Frontend history (onto `61673c53`, then `3eba8494`)

1. `3751c853`: merge `d9454d3a` (JP1 `f6d30034` → K2 `94e4ae74` → JM1 `c1b88ca6` + JM1 handoff). The merge was clean. JP1 and K2 came in only as ancestors and were not cherry-picked separately.
2. `dd510777`: merge `2153d4c8` (SFX2 `02ac1b47` + `2153d4c8`). Clean.
3. `c42f3e42`: merge `cf98dbd7` (JX2 formula `5ef9da27` + `cf98dbd7`). **Two conflicts**, see §3.
4. `f279c273`: merge `origin/main` `3eba8494`. Clean.

## 3. Conflicts and resolutions

There were two conflicts, both in `cf98dbd7` against the JM1 lineage. Both were additive on each side and were resolved as a **union**. Nothing was redesigned.

| File | JM1/K2/JP1 side | JX2 side | Resolution |
|---|---|---|---|
| `src/components/journey/JourneyStateBoard.tsx`: imports | `useState`, `useMasteryAssets`, `QuestionRoleEmblems`, `RankedRole`, `{ArrowRight, PanelTopOpen}` | adds `Calculator` | All of JM1's imports, plus `Calculator` |
| same: props | `questionRoles`, `knowledge`, `beatStamp` | `onOpenFormulas` | All four props |
| same: header control span | `flex … gap-1.5` span: role emblems, then **State** | `inline-flex … gap-1` span: **State**, then **Calc** | JM1's span unchanged (roles, then State), with JX2's **Calc** button appended after State. JM1's gap and class were kept. |
| `src/components/journey/JourneyModuleStage.tsx`: board props | `questionRoles`, `knowledge`, `beatStamp` | `onOpenFormulas` | Both. `formulasOpen` state and `<JourneyWorkbenchSheet>` were auto-merged from JX2. |

**Geometry check.** Adding Calc cost the board no height. The board rect is identical to JM1's certified table:

| Width | This pass (y / h) | JM1 table (y / h) |
|---|---|---|
| 375 | 159 / 121 | 159.3 / 121.1 |
| 390 | 159 / 127 | 159.3 / 126.5 |
| 1024 | 127 / 200 | 127.0 / 199.7 |

The header controls stay inside the board at every width.

## 4. Backend verification

**Semantic checks (on the integrated tree):**

* `STATE_BEAT_MS = 900` and `GROUPED_STATE_BEAT_MS = 1300`, with `BEAT_POLICY = "journey.beat.semantic.v1"`.
* K1 `knowledge_object_contract`, `object` / `context` / `unit`, and `asks_fact` are present.
* The reveal ends at its own window.
* Production changes are preserved: production equals the merge base, so nothing is lost.

**Real re-capture from the integrated backend.** The committed K2/JM1 capture harnesses were re-run against `jenh-backend`, using real Bot matches, the real HTTP route and the unmodified guard.

* Compared with the committed `m1/` fixtures, every **contract** field is identical: `open_delays_ms`, `beat_ms`, `beat_policy`, K1 keys, reveal fields and the answer keys. The only differences are Bot-opponent progress and score, which are nondeterministic.
* Compared with the pre-JM1 `k1/` fixtures, the only differences are the intended JM1 changes: beats go from 2500/1500 ms to 900 ms, and the reveal no longer spans the beat.
* The `olaf` capture fails in both harnesses (`answer must be a number`). This is a limitation of the harness's wrong-answer generator on a choice child. It is not a product issue, and `olaf` is also absent from the committed K1/M1 fixture sets.

**Suites.** Each file ran in its own process, with `LOL_CALC_DB_PATH=C:\Users\mlmit\mogzy-data\lol_calc.db`. 48 files: **1391 passed, 33 failed**.

Passing (all green):

| Area | Files |
|---|---|
| K1 / JM1 / JX2 | `journey_k1_knowledge_objects` 42, `journey_motion_v1_beats` 12, `jx2_journey_motif` 12 |
| J2–J5 release suites | J2 49, J3 46, J4 47, J5 25 |
| PQ1 | `pq1` 37 |
| Daily / Survival | DCMOD a/b/integration/retired/stage-length; DCSURV ×4; DSC1; TTC1; CON1; composed-stages migration; DCGR products/foundation |
| Review | `ranked_mastery_reveal_e2e` / `_secrecy`, `segment_timer_base`, RQ1 slice/review roles, RR2 current-truth review, match-review API, historical records |
| Ranked / Bot | Meta Reflex reveal, item P5 timers, answerable boundary, public service, bot presence/recovery, bot result parity, RBOT2, segments foundation |
| setup_state | isolation 157, persistence 63, contract, backwards-compat, footprint guard |

The 33 failures are **identical, test ID for test ID, on a pristine `f6b6f012`**. They are pre-existing and environmental, not integration-caused:

| File | Failures |
|---|---|
| `test_ranked_admin_bot_match.py` | 27 (admin-bot routes return 503 in this environment) |
| `test_dcmod_c_content_sets.py` | 3 |
| `test_ranked_public_lifecycle.py` | 2 |
| `test_ranked_public_routes.py` | 1 (`test_submission_flow_and_resume`) |

## 5. Frontend verification

**Typecheck.** `tsc -p tsconfig.app.json` reports 2 errors: `OnboardingProfile.tsx` and `identity/connections.ts` (Supabase typing). Both are **identical on production `3eba8494`**.

**Production build.** `npm run build` succeeds, including Vite, item prerender with 213 verified pages and champion prerender with 173 verified pages. The build regenerated `public/sitemap.xml`; that change was reverted and not committed.

**Vitest battery** (on `c42f3e42`):

* Scope: Journey, `lib/journey`, ranked-core, quiz-ranked, ranked-arena, ranked-public, dev pages, audio, Daily run, question-surface / QF1, mastery.
* Result: **4226 tests: 4209 passed, 13 failed, 4 skipped**.
* 12 of the 13 failures are **exactly JM1's recorded pre-existing set**:

| Test file | Failures |
|---|---|
| `AnswerGrid.elimination` | 2 |
| `QuestionStageGeometry` | 3 |
| `LobbyPreviewPage` | 2 |
| `syntheticRankedHistory` | 1 |
| `StatCheckPage` | 3 |
| `statCategoryIcons` | 1 |

* The 13th is `QuestionMotifLayer.qf1` "Champion/Combat is unchanged by the Rift art". It string-matches `index.css` for a literal `\n`, and this Windows checkout is CRLF (`core.autocrlf=true`).
  * It fails identically on the approved JM1 tip `d9454d3a`.
  * The CSS blob is byte-identical on `origin/main`, `d9454d3a` and HEAD.
  * With an LF copy of `index.css`, it passes 22/22.
  * It is environmental; it was not fixed.

**Re-run on the final tip `f279c273`**, after the production merge:

* Scope: Journey, `lib/journey`, ranked-core modules, SFX observer, Daily run, audio, analytics, QF1.
* Result: **976/977**. The one failure is the same CRLF item.

Relevant green files on the integrated tree:

| Feature | File | Result |
|---|---|---|
| JP1 | `masterySliceModule.journeyPresentation` | 20/20 |
| K2 | `masterySliceModule.knowledge` | 30/30 |
| JM1 | `masterySliceModule.motion` | 20/20 |
| J3/J5 Journey | `masterySliceModule.journey` / `.journey5` | 25/25 and 18/18 |
| JX2 stage + sheet | `JourneyModuleStage` | 18/18, including the "opens from the board header" test |
| JX2 sheet | `JourneyWorkbenchSheet` | 3/3 |
| JX2 logic | `calculator` / `formulas` | 4/4 and 5/5 |
| SFX2 | `useRankedMatchSfx` | 11/11 |
| SFX2 Daily | `DailyRunPage` | 27/27 |

The Playwright `e2e/ranked-sfx.spec.ts` was not run (SFX2 changed only its comments).

## 6. Combined playtest (real browser)

**Method.** This is the established QA harness: `/dev/journey-arena` on a Vite dev server of `jenh-frontend`. It replays the **real** backend captures through the production path `readPublicRound` → `masterySliceModule` → `CanonicalArena`, with server time pinned to each capture.

The captures used:

* `m1/*`: proven identical in contract to fresh captures from `jenh-backend` (§4);
* `k1/*`: wrong-answer and timeout cases;
* `j4/*`: the current-production backend contract.

Probes read the DOM and timers directly: `data-beat`, board rects, marks and popovers, and sheet rects.

### A. Parchment / media

Every Champion (`atomic_recall`), Matchup (`comparison`) and Combat child in `j4-lucian`, `j4-pantheon` and `m1-voli` renders with:

* the **`champ-combat` QF1 pencil-art motif** layer;
* **2 splash underlays**;
* **role emblems** beside "Step N of 5";
* the persistent **state board**, present at every step (open, live, reveal, beat, final, finished);
* **focus media** of the right kind (`ability` / `champion` / `matchup`).

The focus media is large at phone widths (the full-width 352×112 plate with ability art) and at 1440×900.

⚠ **At 1024×768 and 1280×800** the focus media is `display:none` for most children. The Ability child at 1280 shows a 52 px slim plate.

* This is JP1's own container query: `@container journey-focus (max-height: 3.25rem) { display:none }`, commented "Nothing useful fits: draw nothing rather than a squeezed plate".
* `index.css` and the focus files are byte-identical to `d9454d3a`, so this is approved behavior and not integration-caused.
* It is flagged for the owner in §9.

### B. Knowledge marks

The chain used: Volibear Q base cooldown (child 0) → Caulfield's +10 AH purchase beat (before child 2) → Q cooldown at 10 AH (child 2).

| Step | Mark on Volibear Q |
|---|---|
| child0 open/live | **none** |
| child0 reveal | `Q · R1 · 12s ①` |
| child2 beat (purchase) | `12s ①` survives |
| child2 open/live | still only `12s ①`, with no `11` shown (no answer leak) |
| child2 reveal | `12s ①` and `11s · 10 AH ③` |
| child3 → finished | both facts persist |

Other checks:

* **Wrong reveal** (`k1-voli`, children 0 and 2 answered wrong): the same marks appear at the same reveal steps.
* **Timeout** (`k1-voli-timeout`): `12s ①` appears at the timeout-reveal and survives the reconnect.
* **Final child wrong** (`k1-ahri-survival`): `R · R1 140s ②` then `127s · 10 AH ③` appears only at the final reveal.
* **Sizes:** the badge is 12×12 px on desktop and **8×8 px on phone**. The popover is about 104–110 × 55–58 px, with two short lines per fact. It stayed inside the viewport at every width.

### C. Motion

Visible `data-beat` active span, sampled every 10 ms at 1280, from the previous reveal into `beat-start` (server beat +10 ms):

| Beat | Measured | Server remaining | Stamp |
|---|---|---|---|
| Single purchase (voli child 2) | **883 ms** | 890 ms | `FIRST BACK` |
| Grouped: level 6 + R unlock + rank + item (voli child 4) | **1282 ms** | 1290 ms | `LV 6 · R UNLOCKED` |

Other checks:

* **Board rect** is identical before, during and after both beats at all 5 widths. There is no scrim; the board stays visible.
* **Item gain tags** stay inside the board, and the stamp is never clipped.
* Grouped beats peak at 19 concurrent board animations, all short (at most 900 ms each, per JM1).
* **Question open:** the next child opens on the client poll at `own_card_started_at + 60 ms` (`useRankedMatch`, untouched by this integration). The server opens it at exactly settle + 1750 + beat.

### D. Formula / Calculator

The sheet opens from the **Calc** button in the board header, beside State. The question stays mounted behind it. It shows the four formulas:

* **AH → cooldown**;
* **armor penetration & lethality**, in percent-then-flat order;
* **armor → physical**;
* **MR → magic**.

Each formula comes with a worked example.

The calculator works:

* the AH example `10×100÷(100+25)` gives **8**;
* the armor example `200×100÷146` gives **136.98630137**;
* `5÷0` and an incomplete `(+` are refused with the red error border, as designed.

Keys are 44 px, with no horizontal overflow and no clipped controls at any width. The sheet is a bottom sheet (`max-h: 90dvh`) with its content centred in `max-w-md`. It scrolls internally when the viewport is short:

| Viewport | Internal scroll |
|---|---|
| 375 | 271 px |
| 390 | 206 px |
| 1024 | 195 px |
| 1280 | 166 px |
| 1440 | 76 px |

### E. SFX: technical ordering (perceptual quality NOT judged)

**Real-capture replay.** Every capture was replayed through the production `observeRankedSfx`: `m1-voli`, `k1-voli`, `m1-ahri-survival`, and a fresh integrated-backend `voli`.

* Each child fires **exactly one** light verdict (`ranked.answer.correct` / `.incorrect`) at its reveal.
* Nothing fires during beats, opens, late reveals or the final reconnect.
* **No points, award or speed cue fires on any child.**
* This confirms that SFX2's child-verdict logic, which keys on `ownChallengeReveals`, is unaffected by JM1's shortened reveal window.

**Unit coverage on the integrated tree** (`useRankedMatchSfx` 11/11, `DailyRunPage` 27/27):

* A Standard correct gives a verdict only (no award or speed stacking).
* A Journey or module completion gives the award phrase, plus a speed accent when earned.
* When the final child and the module settlement arrive in one poll, you get one verdict and one award.
* Daily stage completion plays `daily.stage.complete` once per watched stage, and is silent on reload.
* The Ranked match-result sting is unchanged: after live play only, held until the outcome moment.

**No audio output was available to this worker. No perceptual approval is claimed.** See §9.

## 7. Responsive: 375 / 390 / 1024 / 1280 / 1440

The probe was run on `m1-voli` at each width. It covered:

* single and grouped beats;
* the Ability, Combat and Matchup questions;
* the knowledge popover;
* the Formula sheet;
* the State sheet;
* the final reveal and the final reconnect.

| Check | 375 | 390 | 1024 | 1280 | 1440 |
|---|---|---|---|---|---|
| Page horizontal overflow | 0 | 0 | 0 | 0 | 0 |
| Clipped controls (any state) | none | none | none | none | none |
| Header (roles + State + Calc) inside board | ✅ | ✅ | ✅ | ✅ | ✅ |
| Board stable through single / grouped beat | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gain tags outside board | 0 | 0 | 0 | 0 | 0 |
| `!` badge / popover in viewport | ✅ | ✅ | ✅ | ✅ | ✅ |
| Formula sheet in viewport, no x-overflow | ✅ | ✅ | ✅ | ✅ | ✅ |
| State sheet in viewport | ✅ | ✅ | ✅ | ✅ | ✅ |
| Motif / splash ×2 / roles on every child | ✅ | ✅ | ✅ | ✅ | ✅ |
| Focus media visible | ✅ | ✅ | hidden (JP1 rule) | Ability child only (52 px) | ✅ |
| Question-card internal scroll | 0 | 0 | 0 | 0 | 0 |

On phones, the Combat child's focus plate sits below the fold and is reached by page scroll. This is the known small scroll behavior, unchanged from the approved branches.

No new overflow or clipped controls were found.

Probe caveat: the pane was hidden, so CSS animations were paused. The probe finished them (`Animation.finish()`) before measuring. Rects were read in the settled state.

## 8. Compatibility (executed, not inferred)

Each snapshot was read with each frontend's real `readPublicRound`:

| Reader \ backend output | j4 (current prod backend) | k1 | m1 (K1 + JM1) | fresh `jenh-backend` capture |
|---|---|---|---|---|
| **Old production FE** `3eba8494` | 24/24 ✅ | **0/25 ❌** | **0/29 ❌** | **0/29 ❌** |
| **New integrated FE** `f279c273` | 24/24 ✅ | 25/25 ✅ | 29/29 ✅ | 29/29 ✅ |

* **Old frontend on the new backend fails.** It throws `journey carries a field J3 does not publish: "knowledge_object_contract"` on **every** Journey poll, so the round would not render.
* **New frontend on the old backend works.** In the browser the j4 captures render fully with 0 marks (fail-closed), and there is no error state.

This supersedes the JM1 backend handoff's line "Deploy the backend with or before the frontend". That line predates K1's strict-reader impact.

## 9. OWNER EXPERIENCE CHECK (judge personally; nothing was changed for preference)

1. **`!` size.** It is 12 px on desktop and **8 px on phone**. Is it too small to notice or tap on a phone?
2. **Popover.** It is about 105×56 px, e.g. `Q · R1 / 12s ① / 11s · 10 AH ③`. Is it minimal enough, and are the ①③ step markers clear?
3. **Focal images.**
   * On phones the plate is 112 px tall, with large ability art under the answers. Is it too dominant?
   * At **1024×768 and 1280×800 it is mostly hidden** by JP1's "nothing useful fits" rule. Is that acceptable on common laptop sizes?
4. **Splash underlays.** They sit behind each board side, darkened and masked. Are they too bright or too dark?
5. **Beat speed.** Single is 0.9 s and grouped is 1.3 s. Do they feel fast enough, and is the grouped `LV 6 · R UNLOCKED` stamp readable in 1.3 s?
6. **Formula sheet.**
   * It is a full-width bottom sheet covering about 90% of the viewport.
   * The calculator needs 76–271 px of scroll below the formulas.
   * Does it feel like a notecard or tool, or intrusive?
   * Is "Calc" the right label?
7. **Correct SFX lightness.** Does the new correct cue actually sound lighter (gain 0.72, verdict only)?

### OWNER LISTEN CHECKLIST (speakers and headphones)

1. **Standard correct**: one light two-note verdict, with nothing stacked after it (no points or speed phrase).
2. **Journey correct**: each child reveal gives one light verdict, the same weight as Standard; incorrect is equally light.
3. **Journey completion**: the award phrase after the final child's verdict, plus the speed accent only when earned. It should be clearly heavier than a single verdict.
4. **Daily stage completion**: the fuller completion cue. It should be heavier than module completion and play once per stage (silent on refresh).

Also confirm that the Ranked victory/defeat stings sound unchanged.

## 10. Exact future deployment order

1. **Frontend first.** Push `jenh/integration-frontend` (final commit on top of `f279c273`) to `main` and deploy.
2. **Verify live**, with the backend still on `f6b6f012`:
   * a Journey renders (Daily module 10 or a Survival Journey);
   * there are no `!` marks (old contract, fail-closed);
   * the Calc sheet opens;
   * the SFX cues fire as in §9;
   * there are no reader errors in the console.
3. **Backend second.** Push `jenh/integration-backend` (final commit on top of `0e51ea8a`) to `master` and deploy.
   * There is no migration and no environment variable.
   * Rounds already frozen keep their old beat lengths until they finish.
4. **Verify live again:**
   * a new Journey shows `!` marks after reveals;
   * beats are about 0.9 s single and 1.3 s grouped;
   * the next question opens right after the beat.

**Never deploy the backend before the frontend.** The old frontend rejects every K1 Journey poll (§8).

## 11. Not done / notes

* No push, no deploy, and no new features. No tests were "fixed". The pre-existing failures are listed in §4 and §5.
* The Playwright `ranked-sfx` e2e was not re-run.
* A fully live server-plus-browser session (Supabase auth) was not run. The playtest used real server captures, including captures freshly produced by the integrated backend.
* Local artifacts that were not committed:
  * the scratch capture outputs;
  * the probes;
  * the temporary baseline worktrees, which were removed.
* The original `j6-backend` worktree's own uncommitted K1 files were left untouched.
