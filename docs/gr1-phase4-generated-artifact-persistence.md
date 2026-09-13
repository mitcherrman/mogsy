# GR1 Phase 4 — the durable generated-question lifecycle

> A generated Mastery question is **virtual before it is served**. The instant a
> real player receives one, it becomes a historical artifact, and a historical
> artifact must survive every later change to the data it was derived from.
>
> Base: backend `origin/master` @ `b499d80f` (GR1 Phase 3, merged).
> Branch: `gr1/phase4-artifact-persistence` @ `ed254ca6`, rebased onto `origin/master` @ `27610924`.

## 0. What already existed, and what actually needed building

The audit that preceded this phase found **more already in place than GR1 Phase 1
implied**, and that finding shaped every decision below.

| Property | Before this phase |
|---|---|
| The questions themselves are frozen at segment-open time | **Already true.** `generate_segment` writes the public and private payloads onto `ranked_rounds`, and every later read — validate, grade, bot, resolve, reveal, resume, review — uses only those. |
| Match review renders from the frozen payload | **Already true.** `ranked_public/review.py::_mastery_slice_round` never re-resolves the source artifact. |
| Each challenge carries a durable semantic identity | **Already true.** `PRIVATE_CANONICAL_REF` (`mastery:<concept_id>`), added by RR1 Stage 1. |
| `quiz_attempts` can represent a question with no stored row | **Already true.** QR1's v2 migration made `question_id` nullable, `question_key` NOT NULL, and added `source` / `choices_snapshot` / `source_version` / `provenance_json` — for exactly this case. |
| **Anything about the act of generation is recorded** | **False.** Which generator, at which version, over which config, with which salt, from which patch, out of which published artifact — none of it. |
| **A served generated question produces an attempt row** | **False.** Nothing wrote one. |
| **Review can say where a historical question came from** | **False.** |

So this phase builds exactly two durable records and nothing else: the
**served-artifact block** and the **attempt row**. It creates no table, changes
no schema, and adds no second historical rendering system.

## 1. The artifact contract

`mastery/serving/artifact.py`. Frozen into the segment's **private** payload
under `mastery_artifact`, at the same instant and into the same row as the
content it describes — the only instant at which any of it is knowable.

```jsonc
{
  "artifact_schema_version": 1,
  "generator_type":      "champion" | "matchup" | "applied_chain",
  "generator_version":   "champion.v1",
  "generator_config":    {"mastery_mode": "champion", "champion_id": "zed"},
  "subject_key":         "champion:zed",
  "question_count":      3,
  "artifact_instance_id": "mslice_<sha256[:32]>",
  "source": {
    "mastery_set_id":   "mset_…",        // generated artifact identity
    "artifact_digest":  "martifact_…",
    "display_revision": "disprev_generated-mastery.v1",
    "patch_key_digest": "patchkey_…",
    "patch_display":    "League 26.16",  // GR1 Phase 2's canonical label
    "title":            "Zed — Champion Mastery",
    "is_prototype":     true
  },
  "served":         {"match_id": "…", "segment_number": 1},
  "selection_salt": "<order_seed>:1"     // SERVER-ONLY
}
```

Four design points, each of which was a live choice:

**Private, not public.** The public payload is the wire contract the frontend's
Mastery renderers are tested against. Putting the block there would move a wire
field; `test_the_public_wire_payload_gained_nothing` pins the public key set at
exactly its pre-phase six. Same reasoning `PRIVATE_CANONICAL_REF` used.

**No `generated_at`.** `ranked_rounds.started_at` is already the authoritative
instant a segment was served, and duplicating it would make `build()` impure —
a regenerated segment would no longer be byte-identical, which is a property
worth more than a redundant timestamp.

**Semantic structure, not prose.** `generator_config` is the *normalised* config
(`mastery_config.normalized_config`), not the raw mapping the format was handed:
a saved format can be edited afterwards, and a raw mapping may carry keys the
parser ignored. What is stored is what the generator actually consumed.

**Not a reconstruction mechanism.** `generator_version` is **provenance**.
Nothing reads it and re-dispatches, and nothing ever should. History is
reconstructed from the persisted content, never by rerunning a generator.

### The one compatibility rule

**Absent means unknown.** Every segment frozen before this phase carries no
block; `served_artifact()` returns `None` and every caller treats that as
"predates the contract", never as an error. It is the same absent-means-none
rule `reveal_window_ms` and `canonical_ref` already use.

### Redaction

`review_view()` is a **positive list**, not a blacklist: a field added to
`build()` is invisible to readers until someone adds it on purpose. It drops
`selection_salt`, which is derived from the match's server-only `order_seed`.

## 2. Identity model — four levels, four keys

```
generator_type          "champion"                         the family
  ↓
semantic_question_key   "mastery:ability_cooldown_rank:Zed:E:r3"
  ↓                     (the step's own candidate_key, minted once by
  ↓                      ranked_public.discovery, frozen on the challenge)
generated_artifact_id   "mslice_<sha256[:32]>"             this frozen instance
  ↓                     = H(match_id, segment_number, mastery_set_id,
  ↓                         artifact_digest, question_count)
attempt_id              quiz_attempts.id                    one player, one answer
```

Beside those, `subject_key` (`champion:zed`, `matchup:ahri:syndra` — order
independent) names **what the slice is about**, and `mastery_set_id` /
`artifact_digest` name the generated artifact **as content**, independent of
where it was served.

Everything here reuses an existing project convention:
`MasterySliceConfig.readiness_key()` is the subject key; `mastery:<concept_id>`
is LC1's namespace; `mslice_<hex>` is the project's `<prefix>_<hex>` idiom.
The only new key is the artifact **instance** id, which is the one level that
genuinely had no name.

`artifact_instance_id` is deterministic rather than random, so a segment
regenerated from identical inputs yields an identical id — a replay diffs empty
where it should. Two matches of one configuration never collide, because the
match id is in the material.

## 3. Persistence model — no new table, and why

`ranked_rounds.segment_private_json` is **already an immutable per-segment
document, written exactly once and never rewritten**. A separate artifact table
would duplicate that guarantee, need its own migration, cold start and orphan
story, and would have to be joined back to the round row to mean anything. The
artifact *is* the round row; this phase widens what that row remembers.

Write path:

```
segment opens  →  MasterySliceModule.generate_segment
                    → mastery.serving.artifact.build(…)
                    → private_payload["mastery_artifact"]
                    → persisted with the content on ranked_rounds
```

## 4. `quiz_attempts` integration

### Before → after

| | Before | After |
|---|---|---|
| Rows written for a generated Mastery answer | **0** | 1 per answered challenge, per human player |
| `question_id` | — | `NULL` (generated: no stored row, and none is invented) |
| `question_key` | — | the round's own frozen `mastery:<concept_id>` ref |
| `source` | — | `ranked_mastery` (new value) |
| `source_version` | — | the patch the segment was generated at |
| `provenance_json` | — | redacted artifact block + challenge coordinates |
| XP / streak / category / achievements | — | **unchanged — none applied** |
| Every other surface's rows | unchanged | **unchanged** |

### Where it is called, and why duplicates are structurally impossible

`ranked_public/service.py::submit_challenge`, in the **first-write branch** —
past the `stored is not None` idempotent-retry return and past the
`insert_segment_challenge` that just succeeded, inside the same
`BEGIN IMMEDIATE` transaction. That is the identical placement LC1 discovery
uses in `submit`, for the identical reason:

* a reconnect, a resume and a client replay all return **before** that line;
* a racing writer hits the PK collision branch and rolls back;
* the attempt commits or rolls back with the answer that caused it.

Duplicate prevention is therefore a property of the position, not a
deduplication pass afterwards.

### Correctness is server-derived

Re-graded at record time through `module.challenge_is_correct` over the frozen
private payload — the identical call `resolve_segment` makes. The client's
claim is never used, and there is no second correctness rule.

### The one behavioural decision: no quiz XP

`services/attempt_recorder.record_attempt` gained a single parameter,
`apply_progress=True`. Ranked calls it with `False`: the attempt row is
written, and no XP, streak, category progress or achievement check runs.

Ranked pays **Elo**. Paying the quiz progression too would be a change to the
XP rules, which this phase is explicitly out of scope for. It is one flag away
if the owner wants it (**owner decision 1** below). The default preserves every
existing caller byte-identically; `progress` in the return value is `None`
rather than a zeroed dict, so "not applied" can never be read as "applied and
unchanged".

### Bots

Excluded via `discovery.is_discoverable_user` — the **same predicate** the
permanent library uses. A `bot::` uid never authenticates, so its row would be
junk in every report that reads the table.

### Best-effort, on purpose

`record_served_attempt` never raises. A failure to record an analytics row must
never cost a player a submission the server has already accepted. Failures are
logged at ERROR **with a traceback**, not swallowed — a persistently missing
attempt log is a real defect and has to be visible as one.

Proved, not asserted:
`test_a_submission_still_succeeds_when_the_attempt_cannot_be_recorded` runs a
match on a Ranked database with **no `quiz_attempts` table at all** and checks
that the answer is still accepted, still graded, and that the durable
submission row survives — i.e. the recorder's failure does not roll the
transaction back with it.

### No key is ever fabricated

A step that declares no durable identity produces **no attempt row**, rather
than one under an invented key — `discovery._mint`'s rule, because a fabricated
identity is indistinguishable from a real one forever after. All three
generators supply `candidate_key` on every step today, so this path is a guard,
not a live gap.

## 5. Historical reconstruction path

```
quiz_attempts row ──question_key──▶ mastery:<concept_id>  (the semantic question)
        │
        └──provenance_json.artifact_instance_id, match_id, segment_number
                    │
                    ▼
        ranked_rounds(match_id, round_number)
             segment_payload_json   → prompt, options, semantics, presentation
             segment_private_json   → correct answer, explanation, mastery_artifact
        ranked_segment_challenges   → the player's own pick
                    │
                    ▼
        ranked_public.review.build_round_review  ── the ONE review surface
```

Nothing on that path consults canonical data, the manifest, the publication
gate or a generator. `get_match_review` already returned the exact question,
exact choices, the player's answer and the correct answer; this phase adds
`mastery_artifact` (redacted) to the same entry, so a future history surface
gets generator type, generator version, config, subject and patch from the
place it already reads. **No second historical rendering system was built.**

The block is read from the private half and therefore follows the same reveal
rule the correct answer does — absent until the segment resolves. A patch label
is not answer-revealing, but a reader who can enumerate the generator config of
a segment still in play learns more about it than a player should.

## 6. Analytics behaviour

Generated attempts are **ordinary attempts**. Everything that reads
`quiz_attempts` sees them with no change: missed-questions, PT1.7B weakness
targeting, PT1.8 Premium longitudinal reading, `quiz/question_performance.py`.

The questions the owner asked to be able to answer, and the column that answers
each:

| Question | Answered by |
|---|---|
| How often is a generated semantic question served? | `COUNT(*) GROUP BY question_key` |
| Its correctness rate | `AVG(is_correct) GROUP BY question_key` |
| Champion vs Matchup vs Applied-chain performance | `provenance_json.generator_type` |
| Performance by family | `category` (the Mastery question family) |
| Performance by champion / subject | `provenance_json.subject_key` |
| Patch / source context | `source_version`, `provenance_json.patch_key_digest` |
| Only this surface | `WHERE source = 'ranked_mastery'` |

`category` is the question **family**, not the champion: that is the grain
analytics actually asks about, and putting 173 champion names into the column
the quiz category reports group by would make those reports unreadable. The
champion lives in `subject_key`, where a subject belongs.

Analytics operates on **served attempts**, never on the virtual universe.

## 7. No mass materialization — verified, not asserted

`test_serving_a_slice_creates_no_stored_question_rows` counts `quiz_questions`
before and after serving and answering two slices, and asserts equality. No
champion question, matchup pair or applied-chain candidate becomes a permanent
row. Preview and readiness paths open no segment and therefore freeze no
artifact and write no attempt.

## 8. Migrations / schema changes

**None. Zero DDL.**

* `quiz_attempts` v2 already has every column needed — it was designed for this
  case. No migration was added, and `migrate_quiz_attempts_v2` is untouched.
* `ranked_rounds.segment_private_json` is JSON; a new key is additive.
* No historical field was dropped, renamed or repurposed.
* Old persisted matches keep working: `served_artifact()` returns `None` for
  them and both the review and the attempt path handle that explicitly.
* Cold start is unchanged, so migration ORDER is unchanged.

The e2e fixture runs `migrate_quiz_attempts_v2` because a temp **Ranked**
database is not the production database — in production the Ranked tables and
`quiz_attempts` are the same sqlite file. Without it the suite would silently
exercise the recorder's failure path instead of its success path.

## 9. Files changed

| File | Change |
|---|---|
| `mastery/serving/__init__.py` | **new** — the package's boundary |
| `mastery/serving/artifact.py` | **new** — the contract: build, read, identity, redaction |
| `mastery/serving/attempts.py` | **new** — one answered challenge → one attempt row |
| `ranked_modules/mastery_slice.py` | stamps the block; adds `served_artifact_of` + `attempt_material`; declares `supports_generated_attempts` |
| `ranked_modules/mastery_config.py` | `normalized_config()` — the inverse of the parser |
| `ranked_public/service.py` | `_record_generated_attempt`, called from `submit_challenge`'s first-write branch |
| `ranked_public/review.py` | projects the redacted block into the mastery-slice review entry |
| `services/attempt_recorder.py` | `apply_progress` parameter (default `True`) |
| `mastery/tests/facts_support.py` | GR1 footprint: `+mastery/serving/`, +3 runtime files |
| `mastery/tests/test_footprint_guard_split.py` | re-pins GR1 by exact set equality |
| `mastery/tests/test_gr1_phase4_artifact_persistence.py` | **new** — 19 pure contract tests |
| `test_ranked_mastery_artifact_persistence.py` | **new** — 21 live end-to-end tests |

The Ranked service names a **capability** (`supports_generated_attempts`), not a
module id — the way `supports_challenge_reveals` already works — so a future
generated module opts in by declaring it and no other module's submit path
changes by a single statement.

## 9a. Tests and results

| Suite | Branch | Clean `origin/master` baseline | Verdict |
|---|---|---|---|
| `mastery/tests/test_gr1_phase4_artifact_persistence.py` (new) | 19 passed | — | new |
| `test_ranked_mastery_artifact_persistence.py` (new) | 21 passed | — | new |
| `mastery/tests` | 3 failed, 1624 passed | 3 failed, 1598 passed | failure sets **identical** |
| 4 Ranked-Mastery integration files | 83 passed | 83 passed | — |
| 4 footprint guards + `test_footprint_guard_split.py` | 166 passed, 0 failed | — | run against a real commit |
| 12 QR1 attempt/persistence suites | 17 failed, 230 passed | 17 failed, 230 passed | **diff EMPTY** |
| Post-rebase re-run (`mastery/tests` + 5 Ranked-Mastery + 3 fast QR1) | 3 failed, 1782 passed | — | same 3 pre-existing |

**Zero regressions introduced**, by failure-**set** comparison against a clean baseline worktree
with the same symlinked `lol_calc.db`, per project rule.

Two details worth stating rather than leaving to be rediscovered:

* **The `mastery/tests` pass delta (+26) is not 26 new tests.** It is 19 new tests plus 7
  isolation guards that *skip* on the baseline (`"nothing committed on this branch yet"` — they
  diff `origin/master...HEAD` and skip when nothing is committed) and *run and pass* on the
  committed branch. Verified by reading the baseline's skip reasons, not inferred from the count.
* **The 17 QR1 failures are environmental and branch-independent.** All 17 are in the three
  suites using `db_fixture_support.clone_for_test`, and they fail in the fixture builder before
  product code: `MAX_FIXTURE_BYTES` is 200 MB while `HEAVY_TABLES` excludes only two esports
  tables, so today's `lol_calc.db` clones over the ceiling — the pre-existing
  `combat1-db-fixture-heavy-tables-stale` defect. The fast QR1 suites that *are* the attempt
  contract — `test_attempt_recorder.py` (16) and `test_quiz_attempts_v2_migration.py` (14) —
  passed completely.

Both sides were run **serially**. Concurrent pytest runs against the shared 5.7 GB
`lol_calc.db` fabricate failures; a first parallel attempt was discarded for that reason.

## 10. Remaining limitations

1. **`time_taken_ms` is not recorded.** Per-challenge response time with reveal
   compensation is derived by `segment_flow` at resolve, not at submit, and
   plumbing it into the attempt would mean either a second timing rule or
   moving the record to resolve time — where the first-write idempotency
   guarantee no longer holds. Deferred deliberately; the column is nullable.
2. **`difficulty` is `NULL`.** `difficulty_class` exists on every candidate but
   is not on the frozen step. It is also GR1's largest open composition lever
   (Phase 3 doc); recording it belongs with the phase that uses it.
3. **Public Ranked still serves none of this.** No built-in format names
   `mastery_slice`; all 29 stored configs are `target='admin_bot'`. In
   production the immediate effect of this phase is on admin-bot matches only.
4. **Nothing backfills.** Segments frozen before this commit have no block, by
   construction — the information was never captured and cannot be recovered.
5. **No Admin surface.** Out of scope, as instructed.
