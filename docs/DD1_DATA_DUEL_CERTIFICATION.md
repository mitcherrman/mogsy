# DD1-C — Data Duel production integration and certification

Integration and certification only. No mechanics, scoring, Daily recipes, Pro Play, Order Forge or Journey redesign were added.

**Verdict: READY TO MERGE.** It is subject to the merge order in §14 and the pre-deploy canonical-DB gate in §15. Neither is a code defect in DD1.

## 1. Bases

| | SHA |
|---|---|
| Frontend `origin/main` (integration base) | `660dbfce` fix(history): HUB6.4B production reconciliation |
| Backend `origin/master` (integration base) | `26ef8829` docs(history): HUB6.4A handoff |

Both were fetched on 2026-09-28.
- The frontend base moved from DD1-B's base `3011a416` through the HUB6 History merge. It shares no file with DD1-B.
- The backend base did not move. It is DD1-A's own base.

## 2. Commits integrated

| Repo | Branch tip integrated | How | Integration commits |
|---|---|---|---|
| Backend | `dd1/a-comparison-values-backend` @ `81592066` | fast-forward from `26ef8829` | `c9eaac1a` feat, `0f8c664b` docs, `81592066` fix (A.1: omit when not applicable) |
| Frontend | `dd1/b-data-duel-frontend` @ `1ea1d110` | cherry-pick onto `660dbfce`, no conflicts | `16e2cd03` (= `a20f6cc2`) feat, `f9457b4a` (= `818e6fc6`) docs, `a891ebda` (= `1ea1d110`) fix (B.1: additive metadata) |

- **Overlap check.** The files `3011a416..origin/main` touched and the files DD1-B touched have an empty intersection, and the diff touches no CSS. No semantic resolution was needed.
- **Branches.**
  - Frontend: `dd1/c-data-duel-integration`, worktree `mogsy/.worktrees/dd1-c-integration`.
  - Backend: `dd1/c-data-duel-integration`, worktree `League_Combat_Simulator/.worktrees/dd1-c-integration`.

## 3. Final wire contract — `comparison_values.v1`

This is what the backend emits, verified against the implementation and against served HTTP bodies:

```json
{
  "contract": "comparison_values.v1",
  "sides": [
    {"token": "ahri",   "value": 12.0, "display": "12"},
    {"token": "syndra", "value": 15.0, "display": "15"}
  ],
  "unit": "seconds", "unit_label": "seconds",
  "display_precision": 1, "operator": "lesser",
  "delta": 3.0, "delta_display": "3"
}
```

| Field | Backend emits (exact) | Frontend reader accepts |
|---|---|---|
| `contract` | always `"comparison_values.v1"` | required, exact match; any other version → `null` |
| `sides` | always exactly 2, in `answer_options[0..1]` order | required, 2 objects with `token`/`value`/`display`, distinct tokens |
| `sides[].token` | non-empty string = `answer_options[i]` | non-empty string |
| `sides[].value` | finite float | finite number |
| `sides[].display` | non-empty string | non-empty string |
| `unit` | string, **never null**, may be `""` | optional: absent/null/string |
| `unit_label` | string, **never null**, may be `""` | optional: absent/null/string |
| `display_precision` | int ≥ 0, **never null** | optional: absent/null/int ≥ 0 |
| `operator` | `"greater"` \| `"lesser"`, **never null** | optional: absent/null/non-empty string |
| `delta` | finite float ≥ 0, **never null** | optional: absent/null/finite |
| `delta_display` | non-empty string, **never null** | optional: absent/null/non-empty string |

In short, the backend never emits `null`. It emits the block whole or omits it. The frontend is lenient on optional fields and strict on required ones.

**Invariants, each checked against served bodies:**
- The block carries no winner, correct token or champion field. `correct_answer` is the only correctness authority.
- The frontend never reformats a value. It prints `display` + `unit_label` verbatim; percent (`%`) is the one tight-join rule.
- The frontend never recomputes the winner. A mutation test swaps the served values, and the canonical side stays where `correct_answer` puts it.
- A tie uses the existing `tie` token. The reveal reads "Dead even — N unit each".
- Non-comparison reveals omit the key. So do legacy rows. Standalone `player_reveal` omits it for non-comparison steps (A.1).
- Unknown additive v1 keys are ignored and never copied. An unknown contract version fails closed.
- **Asymmetry (intentional).** The backend's re-read of its own frozen block (`comparison_values_reveal`) requires the exact key set. The backend is the author, so this is correct. Forward-compatibility tolerance lives only in the client.

## 4. End-to-end pipeline (certified)

The chain is:
1. `MatchupExplanation.value_a/value_b/delta/unit/display_precision` + `ComparisonOutcome.operator` (authority)
2. → `adapter.comparison_values()` (copied, never recomputed; `RenderedQuestion.comparison_values` is `compare=False`)
3. → `KnowledgeMasteryStep.comparison_values` (outside `identity_material()`)
4. → `_private_challenge` freezes the block into the PRIVATE row only
5. → the public state carries no values
6. → `POST …/challenges/{i}` with `{"selected": token}`
7. → authoritative grading (unchanged)
8. → `challenge_reveal.comparison_values` + `own_challenge_reveals[i].comparison_values`
9. → frontend `readChallengeReveals` → `readComparisonValues`
10. → `toDataDuelReveal`
11. → revealed Data Duel
12. → `GET /review` (revealed rows only)
13. → `QuestionReviewCard` values line

**How it was certified (real code, not hand-built JSON).** A capture drove the **real FastAPI app** (`api_server.app`, `routes/ranked_public.py`). Only `get_db_path`, `get_utc_now` and `require_match_identity` were overridden. The data was the synthetic `facts_support` champion tables (Ahri vs Syndra, 6 children), and each step made these calls:
- `GET /api/ranked/matches/{id}` before each answer
- `POST …/segments/1/challenges/{i}`
- `GET` after each answer
- bot drive → `GET /matches/{id}/review`

All bodies were HTTP 200. They are committed byte-exact as `src/lib/ranked-core/modules/__fixtures__/dd1_served_http.json`, with provenance, and consumed by `masterySliceModule.dataDuel.served.test.tsx` (16 tests).

**Cases covered by served bodies:**

| Case | Source | Result |
|---|---|---|
| A wins (Ahri) | served child 0 (`12` vs `15 seconds`, lesser) | canonical left, "Ahri by 3 seconds" |
| B wins (Syndra) | served child 4 (`21` vs `25 armor`, greater) | canonical right |
| Wrong pick | served child 1 (picked Ahri; Syndra `80` < `100 seconds`) | left `incorrect-selected`, right `correct`, "Syndra by 20 seconds" |
| Actual tie | served child 5 (`550` vs `550 units`) | tie tablet canonical, "Dead even — 550 units each" |
| Decimal values | real generator (`2.5` vs `6.5 per 5 seconds`, first service capture) and real composer (`6.53` vs `6.5`) | verbatim |
| Close values → widened precision | **real composer → adapter → freeze** with two fixture stats set below display precision (`facts_support.build_db_with_overrides`, the fixture's own hook for this): Ahri armor `25.04` vs `25` → `display_precision: 2`, `"25.04"`/`"25"`, `delta_display "0.04"`; hp5 `6.53` vs `6.5` → `"6.53"`/`"6.5"`, `"0.03"` | verbatim, no client formatting |
| Percentage-style | **no real generator path produces a percent unit.** The matchup composer has no percent metric (grep), and a 150-seed generator sweep saw units `seconds, armor, magic_resist, attack_damage, mana, hitpoints, units, units_per_second, per_5_seconds` only | builder-level test only (`test_percentage_style_values_stay_in_display_units`), not certified end-to-end |
| No-art identity | served bodies (synthetic DB has no media) + manifest 404 | monogram tablets; the block has no champion fields |
| Legacy frozen row | same app, private rows stripped of the key before answering | submit, GET reveal and Review all omit the key; tags + prose render |
| Pre-DD1 backend | same capture against `origin/master` `26ef8829` | frontend-first case, see §14 |

## 5. Pre-reveal security proof

This was the highest-priority gate. **It passes.**

**Cross-layer (served HTTP).**
- On the DD1 backend there were 9 `GET` bodies taken before answering: 6 live children and 3 legacy. The 6 children of an earlier service-level capture were checked too. None of them carries `comparison_values` outside `own_challenge_reveals`.
- `own_challenge_reveals` never contains the unanswered child's index. It holds only indices < i.
- The key first appears in the submit response for child i, then in the next `GET`, and only inside `own_challenge_reveals`.
- Review carries it only once the round is `resolved`.
- `segment_payload_json` (the stored public payload) never contains the key. Separately, a real-composer public payload was checked and does not contain the raw widened values (`25.04`, `6.53`).

**Backend (DD1-A suite, 53 passed in the integrated tree).** The suite checks:
- the public payload, `public_view` and the standalone `player_question`
- `FORBIDDEN_PRE_REVEAL_KEYS`
- the structural guard at challenge, nested, list and top-level positions
- `_segment_state_view` transport, and `_assert_challenge_reveals` (index ≥ active refused)
- the live service before and after the first submit
- a mutation: removing the forbidden key fails 6 tests (A's record)

**Frontend.**
- `_FORBIDDEN_SEGMENT_KEYS` and `hiddenInfoGuard` refuse the key.
- A served pre-reveal body with the block injected into a live challenge throws `RankedPublicParseError`.
- The pre-answer DOM contains no `display + unit` for either side, no "wins by", no `comparison_values`, no margin element, and no `correct*` choice state.
- An unrevealed Review row carrying the block throws.

**Mutation checks on the served test (C).**
- Loosening the reader's contract check fails 7 of 15 tests.
- Removing `comparison_values` from the frontend pre-reveal forbidden list fails the injection test.
- Both mutations were reverted.

## 6. Canonical-DB status

**Canonical-DB certification did NOT occur.** No legitimate canonical DB is available on this machine.
- The main backend checkout's `lol_calc.db` is 0 bytes (dated 2026-09-20).
- Every backend worktree's copy is a 16–36 KB schema shell.
- A search of Desktop, Documents and Downloads found no populated `.db`/`.sqlite`.
- `lol_calc.db` is untracked by policy (`CLAUDE.md`). Its old git history is a stale snapshot, not canonical data, and was not used.
- Nothing was fabricated.

**Evidence preserved instead:**
- the real composer / gate / adapter / freeze / service / HTTP path on the repository's own synthetic `facts_support` tables (§4)
- a real-composer widening case

The canonical-DB-dependent suites error or fail identically on the pristine base (§12).

**Mandatory before deploy** (run with a populated `lol_calc.db` or `LOL_CALC_DB_PATH`):
- `mastery/tests/test_gr1_matchup_tie_policy.py`
- `mastery/tests/test_gr1_matchup_rank_identity.py`
- `mastery/tests/test_gr1_matchup_rank_diversity.py`
- `mastery/tests/test_synthesis_matchup.py`
- `mastery/tests/test_gr1_matchstate1.py`
- `mastery/tests/test_gr1_phase3_composition.py`
- `test_mastery_live_api.py`
- `test_ranked_public_routes.py`
- `test_ranked_public_lifecycle.py`
- `test_dd1_comparison_values.py` (again, as a smoke check)
- one canonical end-to-end: open a real Matchup Mastery match, check the pre-answer `GET` has no key, answer, check the reveal block equals the frozen private block, then check Review. The throwaway capture used here (§4) is the template: route-level `TestClient` with only DB/clock/identity overridden.

## 7. Legacy and replay

**Legacy.**
- A row frozen before DD1 has no key.
- The served submit response, the `GET` reveal and the Review all omit it, with no `null`.
- Grading is identical, and the prose explanation is present.
- The frontend renders tags + prose, with no value row and no margin.
- Values are never parsed from prose.

**Malformed stored blocks** are dropped and never raise. Ten mutation forms are covered by DD1-A.

**Replay.**
- The original segment's Review keeps its own frozen values.
- A new segment freezes its own values from the current truth.
- `test_original_review_keeps_its_values_and_a_new_segment_freezes_its_own` simulates a +7s cooldown patch between the two segments. It passes in the integrated tree.

**Identity.**
- `mastery_set_id` and `artifact_digest` are pinned to pre-DD1 golden values.
- `step_id` and `effective_question_key` do not move.
- These pass.

## 8. Review

- Revealed rows print one "Values: Ahri 12 seconds · Syndra 15 seconds" line from the frozen block, alongside the explanation. This is certified on the served `GET /review` body: every row's block equals the one its submit disclosed.
- Old or legacy rows print no values line and keep the explanation.
- There is no new persistence, table or migration.
- Standalone `mastery_player_reveal` carries the block for comparison steps only, as covered by DD1-A and DD1-B tests.

## 9. Journey / JP2

- `jp2/journey-stage-grammar` (tip `50f9ff88`) is **not merged**.
  - It is 3 commits on `3011a416`.
  - A temporary combined tree was built: DD1-C + JP2, merged with no conflict. It was scratch and has been deleted.
  - Suites run: `features/mastery`, `interaction-grammar`, `ranked-core`, `ranked-public`, `components/journey`, `lib/journey` and `QuestionReviewCard`.
  - Result: 123 files, 1592/1593 tests. The single failure, `masterySliceModule.stageGrammar` "Step 4 culmination", passes 26/26 alone twice, so it is a parallel-load flake.
- **With JP2:** Journey comparisons dispatch to `JourneyStageQuestion`, which keeps its own `Tie / Same` buttons. There is no Data Duel and no duplicate art. Journey shows no structured values, which is fine.
- **Today's main without JP2:** a Journey child renders `JourneyMatchupSides` and then `MasteryQuestionDispatch`, which is now the Data Duel (`MasterySliceChallengeSurface.tsx` ~l.405). That **draws both champions twice**.
- No Journey file was edited.
- **F-J (the post-JP2 slice):** adopt Data Duel, or its values, inside `JourneyStageQuestion`. See §14 for merge order.

## 10. Visual QA

**Host.** The real `masterySliceModule.Viewport`, inside the production host markup:
- `ArenaShell` (`.ranked-shell.ranked-academy`, `phoneArena` below 768 as `CanonicalArena` sets it)
- `.ranked-arena-grid`
- `ranked-focus-column`
- `section.ranked-panel.ranked-folio.ranked-question-stage`

It was fed the served bodies, rendered in the vite dev server and driven by Playwright (Edge). The harness was throwaway and was deleted, not committed.

**Matrix.** 6 viewports × 9 states, plus a reduced-motion pass at 390 (63 rows). The metrics are in `docs/audits/dd1-data-duel/qa-metrics.json`.
- **Viewports:** 375×812, 390×844, 768×1024, 1024×768, 1280×720, 1440×900.
- **States:** pre, locked, correct, incorrect, tie, close, legacy, no-art, long labels.

| Check | Result |
|---|---|
| Horizontal scroll | 0 at 375/390/1280/1440. At 768/1024 the document is 4px wider than the viewport in every state. The cause is the host's `.ranked-shell::before` glow bleed (`inset: 0 -4px`), which is present with the Viewport's content hidden. DD1 changes no CSS, so this is **pre-existing host behaviour**. The host already neutralises it on phones (`[data-phone-arena]`, RMOB2). |
| Elements past viewport edge | 0 in all 63 rows |
| Clipped controls | none; long labels wrap inside the tablets and the prompt (375: tablets grow to 250px) |
| Result stamp over values/margin | 0 overlaps |
| Values and margin readable | yes, on the parchment folio: e.g. "100 seconds / 80 seconds · SYNDRA BY 20 SECONDS" |
| Selected readable without colour | yes: a `LOCKED` text chip with a lock glyph, `✓ ANSWER` on the canonical side, and `aria-checked` |
| Focus visible | 2px solid `#d5b66f` outline |
| Keyboard | one tab stop (roving radio group). Arrows pick left, right and tie; Tab goes to lock; Enter locks. |
| Touch targets | min 44px (tie and lock); side tablets 161–250px |
| Reduced motion | the same states, values and margin read correctly |

**Screenshots** (`docs/audits/dd1-data-duel/`):
- 390×844: `390x844-pre.jpg`, `390x844-correct.jpg`, `390x844-incorrect.jpg`, `390x844-tie.jpg`, `390x844-close.jpg`, `390x844-legacy.jpg`, `390x844-noart.jpg`, `390x844-rm-correct.jpg`
- 375×812: `375x812-locked.jpg`, `375x812-long.jpg`
- 768 and 1024: `768x1024-close.jpg`, `1024x768-incorrect.jpg`
- 1280×720: `1280x720-pre.jpg`, `1280x720-keyboard-focus.jpg`
- 1440×900: `1440x900-correct.jpg`, `1440x900-tie.jpg`

**Caption notes:**
- The `close` shots place the real-composer widened armor block on a served cooldown reveal. The explanation prose beneath therefore belongs to the cooldown question. This is a harness composite.
- The `long` shots substitute long display names. The art stays Ahri/Syndra.

**Non-blocking observations:**
- (a) After Enter on lock, the lock button unmounts and focus falls to `<body>`. This is minor and inherited from the certified primitive.
- (b) When two values differ below the declared precision, the **pre-existing composer prose** reads "Ahri wins by 0 armor". The duel now correctly shows "by 0.04 armor". This is a prose bug outside DD1, and a follow-up is recommended.

## 11. Sound, bundle and performance

**Sound.**
- `DataDuel.tsx` and `ComparisonQuestionView.tsx` emit no audio, and `DataDuel.test.tsx` asserts this.
- No DD1 file imports `lib/audio`.
- The Ranked answer cues stay owned by `pages/quiz-ranked/useRankedMatch.ts`, which is untouched, so nothing is duplicated.
- The lab's cue hook was not ported.

**Bundle** (`vite build`, same machine, integration vs `origin/main`):
- The build is OK.
- Total JS is +18 KB raw (13.994 MB vs 13.976 MB). `registry-*.js` grows from 33.0 KB to 46.2 KB, and `comparisonValues-*.js` is a new small chunk.
- None of `InteractionLab`, `labFixtures`, `labCues`, `interaction-lab`, `StatDrop`, the served fixture or the harness is in the bundle.
- DD1 adds no fetch, beacon or analytics event.

## 12. Tests and build

**Backend** (integrated tree vs a pristine `origin/master` `26ef8829` worktree, the same 140 files: `mastery/tests` + 139 root Ranked/Mastery/Review/safety/Journey suites):

| | passed | failed | errors | skipped |
|---|---|---|---|---|
| integration | 4641 | 416 | 699 | 1105 |
| baseline | 4642 | 408 | 699 | 1112 |

- `test_dd1_comparison_values.py`: **53 passed**. It is not part of the table above.
- By failing test ID, there are **0 new functional failures**. There are 8 new failures, and every one is a branch-scope footprint guard that diffs `origin/master...HEAD` or `merge-base(HEAD, origin/master)`:
  - `test_gr1_champion_slice_profiles::test_the_footprint_stays_inside_the_package_and_its_tests`
  - `test_gr1_slice_composition_v2::test_the_footprint`
  - `test_gr1_slice_distribution_experiment::test_the_footprint`
  - `test_gr1_state_aware_champion_stats::test_the_footprint`
  - `test_champion_facts_isolation::test_no_existing_mastery_or_quiz_file_was_modified`
  - `test_knowledge_bank_isolation::test_only_slice_1_and_slice_2_files_differ_from_the_base`
  - `test_manifest_isolation::test_only_slice_footprint_files_differ_from_the_base`
  - `test_matchup_isolation::test_only_slice_files_differ_from_the_base`
- **Final status, verified rather than assumed:**
  - These guards fail on any unmerged branch that touches `adapter.py`, `mastery_slice.py` and similar files.
  - After merge, `origin/master == HEAD`. In the integration worktree, `git diff --name-only HEAD` is empty and there are no untracked `mastery/` files, so every guard's `changed` set is empty and its `⊆ ALLOWED` assertion holds.
  - DD1-A's fifth guard, `test_setup_state_backwards_compat`, **skips** here (24 skipped), because it depends on the canonical DB.
- The remaining 408 failures and 699 errors are identical on base. They are canonical-DB environment failures (`lol_calc.db` is 0 bytes).

**Frontend:**
- Broad slice (`features/mastery`, `interaction-grammar`, `ranked-core`, `ranked-public`, `quiz/workspace`, `journey`, `question-surface`): **1861/1877 passed** in 135 files. The 16 failures break down as:
  - `QuestionTimeline` ×14 and `QuestionMotifLayer` Rift art ×1: both **fail identically on `origin/main`**.
  - `QuestionReviewHost` "renders exactly the markup…" ×1: passes on base, and passes **16/16 alone ×3** on integration. It has a 60s timeout and flakes only under the full parallel load. **Not a regression.**
- The DD1-C served cross-layer test passes **16/16**.
- `tsc -p tsconfig.app.json`: the 2 errors (`OnboardingProfile.tsx`, `identity/connections.ts`) are **identical on `origin/main`**.
- ESLint on the 26 changed and new TS/TSX files: **0 errors** and 9 warnings, all `react-refresh/only-export-components`.
- `vite build`: OK.

## 13. Migrations and versioning

- **No migration.**
- **No module-version bump**: `mastery_slice` stays `module_version 1`.
- No change to `KnowledgeMasteryStep.v1`, `REVEAL_FIELDS`, `PUBLIC_CHALLENGE_FIELDS` or the answer transport (`{"selected": token}`).

## 14. Deployment order

Both orders were proven on real bodies.
- **Backend first.** The current production frontend (`origin/main`) parsed and rendered the NEW backend's served pre-reveal body, four post-reveal bodies (correct, wrong, B-wins, tie) and the Review. That is 6/6 in a throwaway test on a pristine `origin/main` worktree. The block is ignored, never parsed and never fatal.
- **Frontend first.** The NEW frontend opened, revealed (correct and wrong picks) and reviewed bodies served by the PRE-DD1 backend (`origin/master`) with no values and no crash. This is committed as the `old_backend` case of the served test.

**Recommended order:**
1. **Backend** `dd1/c-data-duel-integration` → `master`. It is invisible to today's frontend, and new segments begin freezing values.
2. **JP2** (`jp2/journey-stage-grammar`) → `main`, if it is going to land. The trial merge with DD1 is clean.
3. **Frontend** `dd1/c-data-duel-integration` → `main`.

- If the frontend has to ship before JP2, Journey comparisons show duplicate champion art (`JourneyMatchupSides` above the duel) until JP2 lands. That is an accepted interim state. F-J owns it.
- Segments frozen before the backend deploy render as legacy for as long as they live.

## 15. Remaining blockers

None of them is code. These are the gates before **deploy**:
1. Run the canonical-DB suites and the one canonical end-to-end in §6 against a populated `lol_calc.db`. This could not be done on this machine.
2. Keep the merge order in §14 (JP2 before the frontend), or accept the interim duplicate Journey art.

## 16. Production verdict

**READY TO MERGE.**
