# Daily Composition Lab (lane E, 2026-10-23)

An owner-only tool in **Admin → Leaguecraft → Creator Replay** that generates
complete sample Daily V2 compositions without gameplay. It lets you inspect
each sample's questions in playing order and download a batch as one CSV for
balance analysis, for example with ChatGPT.

| | backend `League_Combat_Simulator` | frontend `mogsy` |
|---|---|---|
| branch | `daily-v2/composition-lab` | `daily-v2/composition-lab` |
| base | master `cafe953a` | main `705bfb18` (merged in `18941c7e`) |
| PR | [League_Combat_Simulator#94](https://github.com/mitcherrman/League_Combat_Simulator/pull/94) | [mogsy#132](https://github.com/mitcherrman/mogsy/pull/132) |

Not merged and not deployed. Shipping it is a separate release decision.

## 1. Using it

Creator Replay → **Composition Lab · Three Acts Daily V2**:

* **Mode:**
  * **Actual date composition** is the composition an owner take launched now
    would freeze for that UTC date, on the current bank.
  * **Experimental variations** are 1, 5 or 10 reproducible variants.
* **Generate samples:** the same date and token always give the same samples.
* **Shuffle samples:** draws a new variation token, which the page shows.
  Nothing public changes.
* **View questions:** the 21 answers in playing order, each with its answer.
* **Download CSV:** exactly the batch on screen.
* **Reproduce a sample by ID:** for example `tav2.2026-10-23.actual` or
  `tav2.2026-10-23.ef78d0ad.3`.

Each sample's summary shows:
* interaction mix, act coverage and difficulty coverage;
* family distribution;
* duplicate questions and repeated subjects inside the sample, and questions
  shared with other samples in the batch;
* quotas, and quota shortfalls or composition shortages.

**Speed** (local, while two test suites ran): 10 samples in about 3 s warm
(10 s on the first, cold call); the 10-sample CSV (210 rows) in about 3 s.

## 2. How a sample is made (no parallel generator)

1. **Compose** with `v2_recipe.compose_v2`, using the same inputs a three-act
   take uses:
   * the candidate snapshot (`v2_bank.CACHE`);
   * the certification scope;
   * the configuration (`v2_launch.composition_config`);
   * the Meta Reflex roster.
   
   The actual seed is the frozen `daily_run_plans` seed, or `plan.day_seed`.
   A variant seed is `sha256("mogzy-composition-lab:v1:<date>:<token>:<i>")`.
   No take or official run ever uses a variant seed.
2. **Materialize** every segment through
   `ranked_public.service._generate_segment`, the path a live match uses.
   * It runs on a **read-only** SQLite connection (`mode=ro`), under the
     synthetic match id `lab:<sample id>`.
   * The module path creates in-memory content pins; the lab releases them at
     once (`content_pins.release`).

**What is exact.** Every row's `resolution` says which case applies:

| resolution | where | meaning |
|---|---|---|
| `exact` | quiz (exact ref) | Prompt, choices, their order and the answer are what a take serves from this bank. Exact-ref questions have no per-match shuffle. |
| `exact_set` | Order Forge | The entities and the full correct order are exact. The display order comes from the lab seed; a real match uses its own random `order_seed`. |
| `sample` | Meta Reflex (3 cards) | The block's families are exact. The cards are drawn from them with the lab seed; a real match draws its own. |
| `unresolved` | any | The content could not be materialized. `resolution_note` says why. Nothing is padded. |

So an *actual* sample's 18 set questions are the take's questions; this is
tested against a real launched take. Its Meta Reflex cards and Order Forge
layout are representative, not the take's.

**Not built:** replaying a lab sample as a playable take. A take draws a random
`order_seed`. Pinning the lab's seed into a take would need a launch-path
change, which is a separate decision.

## 3. Export schema (`daily.composition_export.v1`)

UTF-8 CSV, CRLF line endings, one header row, then **one row per graded
answer**: 21 per V2 sample, including the 3 Meta Reflex cards. Arrays and
objects are JSON inside the cell.

| group | columns |
|---|---|
| identity | `schema_version`, `format`, `sample_id`, `mode`, `date`, `variant_seed`, `materialization_seed`, `composer_version`, `config_fingerprint`, `bank_revision`, `certification_scope`, `content_digest` |
| position | `segment_index` (1–19), `answer_index` (1–21), `challenge_index`, `act`, `set_id`, `set_position`, `difficulty_band`, `timer_seconds` |
| content | `interaction` (`mcq` / `order` / `meta_reflex`), `module_id`, `module_version`, `family`, `question_ref`, `subject`, `level_context`, `linked_set_id`, `category` |
| question | `prompt`, `choices_json` (in displayed order), `correct_answer`, `correct_index` (mcq / Meta Reflex) |
| Order Forge | `correct_order_json` (full order, highest first), `values_json`, `value_display_json` |
| Meta Reflex | `mr_kind`, `mr_left`, `mr_right`, `mr_left_value`, `mr_right_value`, `mr_left_display`, `mr_right_display` (with units), `mr_correct_side`, `mr_gap`, `mr_champion_level` |
| why | `explanation` (bank or override explanation; runtime explanation; Order Forge / Meta Reflex values), `provenance_json` (bank id, key, certainty, review status, patch / authority fields; or the runtime resolver; or the content source), `source_patch`, `media_json` |
| status | `resolution`, `resolution_note`, `row_digest` |

**Revisions.**
* `bank_revision` is the composer's membership fingerprint: active-row count,
  max id and override count.
* `content_digest` hashes every materialized row. An in-place edit of a
  question changes it, and that row's `row_digest`, even when `bank_revision`
  does not (tested).
* The lab reads the same process caches live play reads, so it shows what play
  serves *now*.

**Other formats.** The schema is format-neutral (`format`, `segment_index`,
`answer_index`, `interaction`). Classic Daily is another resolver in
`composition_lab.py`. Today the API accepts only `three_acts_v2`.

## 4. Security and isolation

* **Owner-only endpoints** (`require_admin`), separate from public Daily APIs:
  * `POST /api/daily-run/admin/composition-lab/samples` returns the JSON view
    (summaries plus question list);
  * `GET /api/daily-run/admin/composition-lab/export.csv` returns the CSV.
  
  Non-owners get 401/403 (tested). Public `/api/daily-run/today` exposes no
  seed or lab content (tested).
* Responses are `Cache-Control: no-store`, with `Pragma: no-cache` and
  `X-Content-Type-Options: nosniff`.
* CSV cells beginning `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`.
  Numbers stay numbers.
* **Bounded cost:**
  * counts are 1, 5 or 10, and dates within a year of today;
  * one batch runs at a time per process (429 `LAB_BUSY`);
  * the request body is strict (`extra="forbid"`).
* **No writes:**
  * The connection is read-only.
  * A full test run shows every table's row count and the database file's
    SHA-256 unchanged.
  * No lab content pins are left behind.
  * No run, take, child match, rating, analytics event, question history or
    bank row is created.
  * The owner-take flag (`DAILY_THREE_ACTS_V2`) does not gate the lab, and
    the lab does not read or change the public-format setting.
* **Nothing private:** no player id, session, token or anyone's answers. The
  only identity is the requesting owner's admin check.

## 5. Tests

* **Backend:** `test_daily_composition_lab.py`, 22 tests.
  * Owner-only on both endpoints; public Daily leaks nothing.
  * The actual sample equals a real launched owner take's question refs.
  * 21 rows in play order with 18/33/48 s band timers.
  * Every mcq answer is among its choices; Meta Reflex side matches values.
  * Variants are reproducible with distinct seeds; shuffle draws a new token;
    reproduce-by-ID works.
  * Summaries; input refusals; `LAB_BUSY`.
  * No writes (row counts plus file SHA); no-store; CSV integrity and formula
    safety.
  * A bank edit changes `row_digest` and `content_digest`, but not
    `bank_revision`.
  * A failing module is reported `unresolved`.
  * **Canonical bank** (copy, read-only): 10 samples × 21 rows, 0 unresolved.
    Order Forge order equals the values sorted; Meta Reflex sides match their
    values. Under 30 s.
* **Frontend:** `CompositionLabPanel.test.tsx`, 6 tests.
  * Fetches nothing until asked; actual request body; summary and question
    list.
  * Generate keeps the token, shuffle asks for a new one.
  * Download requests exactly the on-screen batch, with owner headers.
  * Refusals are surfaced; export URL for one reproduced sample.
* Baseline-differential and browser-pane results: §7.

## 6. PRs

* Backend: [League_Combat_Simulator#94](https://github.com/mitcherrman/League_Combat_Simulator/pull/94) → `master`. Code `954c341e`, handoff pointer `0bdbb127`.
* Frontend: [mogsy#132](https://github.com/mitcherrman/mogsy/pull/132) → `main`. Code `a3068792`, merged with main in `18941c7e`, handoff `7df41950` and this commit.
* Merge order: backend first. Until it is live, the panel shows the server's
  404 as an error, and Classic and V2 takes are unaffected.

## 7. Verification results

**Backend baseline-differential.**
* Same 80-file V1 Daily/format suite, plus shared-bank, DREP1, V2,
  admin-format and lab suites.
* Base master `cafe953a`: 362 failed, 2,317 passed, 9 errors.
* Head: 361 failed, 2,339 passed, 9 errors.
* **No failure is new in head.** The one failure only in base is
  `test_rp1…bot_scores_points…`, a known load flake that passes when run alone.
* Lab suite on its own: 21 passed, plus 1 canonical test that passed with
  `LOL_CALC_DB_PATH` set to a canonical copy.

**Frontend baseline-differential.**
* Daily, arena, ranked-core, quiz-ranked and admin areas; base main `705bfb18`
  vs head.
* Result: 19 / 19 failed, failure sets identical; head runs 6 more passing
  tests.
* `tsc`: only the 2 pre-existing errors. `npm run build` passes, and the lab
  is in the `CreatorReplayPage-*.js` chunk.

**Browser pane** (local backend on the playtest copy, owner test identity):
* Experimental variations × 10 → Generate: 10 samples (10.3 s cold).
* Shuffle: a new token, 10 samples in 3.3 s.
* View questions: 21 answers in order. For example, `#7 · Meta Reflex card 1
  … Answer: Hwei (97 armor vs 101 armor)`.
* The export the Download button requests: HTTP 200, `text/csv; charset=utf-8`,
  `no-store`, 211 lines (header plus 210 rows), 2.9 s.
* 360 px: no horizontal overflow.
