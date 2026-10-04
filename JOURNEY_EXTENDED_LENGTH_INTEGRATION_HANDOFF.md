# JLONG-INT — Extended-length Journey integration (Claude M)

Local integration candidates for the first variable-length Mastery Journey playtest.
**Not pushed. Not deployed to Railway. Not published in Lovable.**

## Bases (verified again at the rebuild)

| Repo | Remote | SHA |
|---|---|---|
| Backend `League_Combat_Simulator` | `origin/master` | `1b62f1a3ae2b7b0be2e6db4027067c6b8efb2a8b` (unchanged) |
| Frontend `mogsy` | `origin/main` | `7c699a9ae649a97bdbb58106421761414356303e` |

The frontend base moved during the first pass. It went from `30b1266f` to `7c699a9a`: four PATCHHUB-PH1 commits that touch 22 Patch Hub/report files, none shared with this integration. The candidate was then rebuilt on `7c699a9a`.

## Candidates

**Backend.** Branch `jlong-int/backend` (worktree `League_Combat_Simulator/.worktrees/jlong-int-backend`).

- Fast-forwarded to H `7c203aeb` (JLONG1), whose parent is the base.
- No integration commit was needed. The candidate is `7c203aebb297252b8a57b06237d703be0e5d6d7d`, unchanged by the rebuild.

**Frontend.** Branch `jlong-int/frontend-v2` (worktree `Desktop/mogsy-jlong-int`).

```
* <this commit>  JLONG-INT: handoff for the 7c699a9a rebuild
*   df857386     merge the integration onto origin/main 7c699a9a
|| * f1149504     JLONG-INT: >12-child guard test + first handoff
| *   ec338c14   merge K 923b94ae (Ranked-result Accuracy)
| || | * 923b94ae   K: Accuracy is question accuracy
| * | a47b0506   L: admin launch for the 11-child Extended Journey
| * | a2f9bd01   I: Journey Library moved to Admin → Ranked → Playtests
| |/
* | 7c699a9a     origin/main: PATCHHUB-PH1 (fd504e86, 59a5932f, bdae352f, 7c699a9a)
|/
* 30b1266f       Order Forge OF4-CONTINUITY
```

**How it was rebuilt.** It is a merge, not a rebase, so I, L, K and the guard-test commit keep their original SHAs. There were **no conflicts**.

**Checks on the rebuild.**

- `git diff 7c699a9a HEAD` is the same patch as the first pass's `git diff 30b1266f f1149504`.
- All 22 PATCHHUB files are byte-identical to `7c699a9a`.

**Superseded branch.** The first-pass branch `jlong-int/frontend` (`f1149504`, on `30b1266f`) is kept for reference only.

## The `1–12` step cap in `src/lib/journey/contract.ts`

`readJourneyPublicState` validates `journey.step.count` against `1–12`. It also rejects any plan other than `standard`/`survival`.

**Determination: it is an obsolete validator, used only by tests. It cannot affect a real Journey. It was left unchanged.**

**What it reads.** It reads the provisional JOURNEY-UI1 wire contract `journey.public.v0`.

- The backend never emits `journey.public.v0` (a grep of the backend finds no match).
- The live payload is `journey_public_state.v1`. It is read by `readJourneyJ3` in `j3.ts`, which takes `child_count` with **no maximum**.
- That payload is then adapted into the board's `JourneyPublicState` object directly in `adapter.ts`. Only the type is shared; no validator runs.

**Who calls it.** Only `contract.test.ts` and `JourneyModuleStage.test.tsx`, both on hand-written v0 fixtures.

- No production module imports `readJourneyPublicState` or `tryReadJourneyPublicState`.
- No admin or dev fixture path calls it either. `realFixtures` and the arena harness read real J3 captures.

**Why 12.** It has no semantic basis. It was a fixture-era sanity bound; nothing in the backend caps Journey length (see `JOURNEY_EXTENDED_LENGTH_HANDOFF.md` §1 in the backend).

**Proof the live path has no ceiling.** `masterySliceModule.extended.test.tsx` gains "no child-count ceiling on the live path". It widens the real 11-child capture to **13 and 16 children** and checks three things:

- it parses through `readPublicRound`;
- `childCount` stays N;
- the board shows `Step 11 of N` with N path nodes.

**Other count bounds.** Every other count bound on the live path is a lower bound only: `j2.ts`/`j3.ts` `child_count ≥ 1`. The `1–18` bounds in `contract.ts` are champion *level*.

**If v0 is ever revived**, the cap and the plan check must be relaxed together.

## Cross-system certification (11 children)

**Fresh capture.** A fresh capture was taken from the backend candidate.

- Harness: the JP2/JREF harness with the preset `admin.ashe_jinx_extended_journey` and champions Ashe/Jinx, plus a read of `GET /matches/{id}/review`.
- It ran against the canonical DB opened read-only (`~/mogzy-data/lol_calc.db`), with Ranked tables in a scratch DB.
- Two walks were captured: all correct, and **8/11 mixed** (wrong at children 2, 5 and 11).

**Match against L's fixture.** The correct walk is **structurally identical** to L's committed `__fixtures__/jext/ashe_jinx.extended.json`. Only the match id and the ids derived from it differ.

**Frontend checks.** Both walks were run through the real frontend code (`readPublicRound`, `masterySliceModule.Viewport`, `readMatchReview`, `buildRankedResults`) in a scratch test that is not committed. 20 of 20 passed:

- **Count and plan.** Every snapshot has `plan: "extended"`, `child_count` 11 and `challenge_count` 11. No layer converts the count to 5.
- **Order.** Children arrive in authored order as a growing prefix: `w_cooldown, w_raw, jinx_armor, w_into_jinx, w_raw_pickaxe, w_into_jinx_pickaxe, w_cooldown_level6, jinx_armor_level6, w_into_jinx_level6, r_cooldown, r_vs_jinx_r`.
- **Transitions.** They are `[purchase@4, level@6]` (0-indexed), so the Pickaxe comes before child 5 and level 6 before child 7. Beat snapshots exist only at child4 and child6. In every live and reveal read, the board has no Pickaxe before child 5 and is level 3 before child 7.
- **Final R comparison.** On child 11 (open and live), Jinx R carries no cooldown field and `withheld` names `opponent abilities.R.cooldown`. No object anywhere in the envelope puts a cooldown key on a Jinx/opponent R. (Jinx R rank 1 is 85 s; Ashe R is 100 s.)
- **Rendering.** `child0-live`, `child5-live`, `child10-live`, `final-reconnect` and `finished` render on the ordinary Journey board. The board shows `Step 1/6/11 of 11` with 11 path nodes.
- **Reconnect.** The final reconnect is an ordinary `mastery_slice` read. The backend `test_jlong1` pins an equal remainder and an equal reached prefix during each reveal.
- **Review.** It has 11 challenges, with `challenge_count` 11 and `correct_count` 11 or 8.
- **Results.** Accuracy is **100%** with Modules won **1 / 1** for the correct walk, and **73%** (8/11) with **0 / 1** for the mixed walk.

**Note for future capture reviewers.** The harness labels `childN-open` are a fixed `+1750 ms` after the previous answer. The backend's reveal window is longer, so some `-open` reads land before `own_card_started_at`. Those reads correctly show the previous prefix. This is harness timing, not a product defect, and the same holds in L's fixture.

## Daily unchanged

**Files.** H's commit touches none of `daily_challenge/`, `content_sets/`, the Daily recipe catalog, `journey.py`, `journey_recipe.py` or `mastery_slice.py`. The frontend diff touches nothing under `src/lib/daily-challenge` or `src/pages/quiz-daily-challenge`.

**H's tests.** `test_jlong1` (24 passed) pins:

- the catalog digest;
- the exact 14 servable and 5 featured recipes;
- 3 days of rotations and seeds;
- the plan mapping `{5: standard, 3: survival}`;
- that an 11-child `journey_slice` request, and Daily/Library requests naming the recipe, are refused;
- that the Library/JL1 formats are still 5 children / 150 s;
- the exact keys and answers of the production five-child Standard and its Survival prefix.

**Daily/Survival suites.** `test_dcmod_*` and `test_dcsurv_*` give 281 passed, 3 failed on **both** the candidate and an untouched `1b62f1a3` (identical failure set).

**Frontend Daily tests.** `stageResultModel` and `dailyRun.boundary` pass. `DailyOnCanonicalArena.boundary` fails 2 tests, the same as on the base.

## Accuracy (K)

`rankedResultsModel.test.ts` passes on the merge:

- 2/5 gives 40% and Modules won 0 / 1;
- 5/5 gives 100% and 1 / 1;
- 4 single-question rounds give 50% (unchanged);
- the mixed case (singles + Meta Reflex 3/5 + Journey 2/5) gives 6/12 = 50% and 1 / 4.

The real 11-child review gives 100% and 73%, as above. Daily's result model was not touched.

## Placement

- **Public hub.** The Leaguecraft hub no longer renders `hub-journey-library-link`. `/quiz/mastery` keeps its own entrance.
- **Routes.** None changed (`App.tsx` untouched). `/quiz/journeys` stays routable; no route gate was added.
- **Admin → Leaguecraft → Ranked → Playtests** now holds:
  - the Reference, Pantheon/Leona and Volibear/Lee Sin launches;
  - **Ashe vs Jinx — Extended Journey**;
  - **Open Journey Library**.
- **Admin-only.** `admin.ashe_jinx_extended_journey` is in `ADMIN_ONLY_PRESETS`, with format `status="test"`, unrated. Non-admins get 403 (`test_jlong1`).
- **Role labels.** Untouched. Journey `bot` is not mapped to a Ranked participant role.

## Tests

### Rebuild on `7c699a9a` (focused set, compared with `7c699a9a`)

| Check | Candidate | `7c699a9a` |
|---|---|---|
| Focused frontend set (see list below) | 40 files; 718 passed, 1 failed | 38 files; 696 passed, 1 failed |
| `tsc -p tsconfig.app.json` | 6 errors | the same 6 errors |
| Cross-system scratch certification (backend capture unchanged) | 20 / 20 | — |

**What the focused set covers:**

- admin Ranked and areas;
- the Quiz hub;
- the Ranked result model, end screen and journey origin;
- `src/lib/journey` and `src/components/journey`;
- the extended, journey, journey5, journeyPresentation, jp4, jp5, motion and reveal mastery-slice tests;
- the Daily `stageResultModel` and `dailyRun.boundary`.

**The one failure** is Quiz.hub "keeps exactly one h1". It fails identically on `7c699a9a`.

**The extra 22 passing tests** on the candidate are the extended-Journey, admin-launch and Accuracy tests, including the 13- and 16-child guard.

**Patch Hub tests were not re-run.** The merge left every Patch Hub file byte-identical to `7c699a9a`, and no Journey/admin/result file is shared with them.

**Backend was not re-run.** It is unchanged since the first pass.

### First pass (on `30b1266f`)

| Suite | Candidate | Untouched base |
|---|---|---|
| Backend Journey set (H's list + `test_jlong1`) | 566 passed, 40 failed | 542 passed, 40 failed (identical failures) |
| Backend `test_dcmod_*` and `test_dcsurv_*` | 281 passed, 3 failed | identical |
| Frontend focused set (wider) | 6 files with failures | the same 6 fail on `30b1266f`, plus 3 load timeouts that pass alone |

**Backend failures.**

- `test_jchain1` (31) and `test_journey_k1` (1) fail on frozen bundle digests against this machine's DB.
- `test_sh11a` (8) fails with `FEATURE_DISABLED`.

## Next release / playtest steps

1. Push backend `jlong-int/backend` (= `7c203aeb`) to `master` (fast-forward), then deploy to Railway.
2. Once the backend is live, push frontend `jlong-int/frontend-v2` to `main` (it fast-forwards from `7c699a9a`) and publish in Lovable. The order matters: the frontend launch button sends a preset the old backend refuses.
3. In production, as an admin: go to Admin → Leaguecraft → Ranked → Playtests and choose **Play Ashe vs Jinx — Extended Journey**. Play through and confirm:
   - Step N of 11;
   - the Pickaxe beat before Step 5 and the level-6 beat before Step 7;
   - Step 11's R comparison;
   - an 11-child review;
   - question-level Accuracy.
4. On a phone, check H §6's visual items at 11 children:
   - the header step-chain dots;
   - the history pip row;
   - `10 / 11` in the segment result.
5. Confirm the public Leaguecraft hub has no Journey Library link and that the Daily is unchanged.
