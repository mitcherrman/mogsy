# Ranked `mastery_slice` — Handoff

> **Read this first.** The full evidence is in
> [`docs/ranked-mastery-slice-current-state-audit.md`](./ranked-mastery-slice-current-state-audit.md)
> (GR1 Phase 1 — audit only) and
> [`docs/gr1-phase2-source-authority.md`](./gr1-phase2-source-authority.md)
> (GR1 Phase 2 — implementation) and
> [`docs/gr1-phase3-generator-quality.md`](./gr1-phase3-generator-quality.md)
> (GR1 Phase 3 — generator quality and composition) and
> [`docs/gr1-phase4-generated-artifact-persistence.md`](./gr1-phase4-generated-artifact-persistence.md)
> (GR1 Phase 4 — the durable generated-question lifecycle) and
> [`docs/gr1-phase5-admin-generator-lab.md`](./gr1-phase5-admin-generator-lab.md)
> (GR1 Phase 5 — the Admin Generator Lab) and
> [`docs/gr1-champion-mastery-product-readiness.md`](./gr1-champion-mastery-product-readiness.md)
> (GR1 Champion Mastery product readiness — implementation over the Champion Mastery audit) and
> [`docs/gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md)
> (GR1 Matchup Mastery capability audit — audit only) and
> [`docs/gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md)
> (GR1 Matchup rank identity — implementation over that audit).
> Do not paste any of them into a new session; start here and open them for detail.
>
> **⚠️ These docs are UNTRACKED and were swept once already.** On 2026-09-13 a concurrent
> session realigned the shared `mogsy` checkout and the whole untracked GR1 doc set
> disappeared. It was preserved, not lost — commit **`99b34257`** on branch
> `safety/shared-checkout-preclean-20260913` holds every one of them, including
> `docs/audits/`. They were restored from there. If they vanish again, restore with
> `git show 99b34257:docs/<file> > docs/<file>`. Committing the set is still an owner call
> (open item 11 below), and it is now overdue.

## Where this workstream is

| Phase | Status |
|---|---|
| **GR1 Phase 1 — current-state audit** | Complete. Audit only; nothing implemented. |
| **GR1 Phase 2 — source authority and integrity** | **COMPLETE and ON `master`.** The owner merged it; `origin/master` contains `77bae306`. |
| **GR1 Phase 3 — generator quality and composition** | **COMPLETE and ON `master`.** The owner merged it; `origin/master` contained `b499d80f`. |
| **GR1 Phase 4 — durable generated-question lifecycle** | **COMPLETE and verified.** Branch `gr1/phase4-artifact-persistence` @ **`ed254ca6`**, base `b499d80f`. Served-artifact contract, historical immutability, `quiz_attempts` integration and review provenance. **Not yet on `master`** — one owner action remains (below). |
| **GR1 Phase 5 — the Admin Generator Lab** | **COMPLETE and verified.** Backend branch `gr1/phase5-admin-generator-lab` @ **`31c0bbe8`**, base `ed254ca6`. Frontend branch `gr1/phase5-admin-generator-lab` @ **`ec9c8bbd`**, base `147c9996`. Admin can run all three production generators, see what a player would see, read the provenance and reproduce a slice from its seed. **Neither branch is pushed** — both targets auto-deploy. |
| **GR1 Champion Mastery readiness** | **NOW MERGED IN BOTH REPOS.** Backend landed as **`36cfef96`** (ancestor of `origin/master`); frontend **`84aaf5a1`** is an ancestor of `origin/main`. The "neither is pushed" note further down is superseded. |
| **GR1 Matchup Mastery capability audit** | **COMPLETE, 2026-09-13. Audit only — nothing implemented.** Bases: backend `origin/master` **`c4f08761`**, frontend `origin/main` **`33d27b2f`**. See [`gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md) and the summary below. |
| **GR1 Matchup rank identity** | **COMPLETE and verified, 2026-09-13.** Blockers 1, 2, 4 and 5 of that audit. Backend branch `gr1/matchup-rank-identity` @ **`52f5564a`** (base `c4f08761`), frontend @ **`756b6b41`** (base `3ce50045`) — one commit each, both clean fast-forwards. **Neither pushed** (both targets auto-deploy). See [`gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md) and the summary below. |
| GR1 Phase 6+ | Not started. Public Ranked rotation and the rollout decision are still untouched. Difficulty as a composition input, and the Applied-chain generalization decision, remain the open generator items. |

## Commits

| Repo | Phase 1 audit SHA | Phase 2 | Phase 3 |
|---|---|---|---|
| Backend `League_Combat_Simulator` — `origin/master` auto-deploys to prod | `11c96ab0` | branch `gr1/phase2-source-authority` @ `77bae306`, **now on `master`** | base `db709873`; branch `gr1/phase3-generator-quality` @ **`b499d80f`** — **pushed to `origin`**, one commit, fast-forward onto `master` |
| Frontend `mogsy` — `origin/main`, Lovable publishes from it | `7d7de643` | docs only | **docs only — no code changed** |

**Phase 4:** backend branch `gr1/phase4-artifact-persistence` @ **`ed254ca6`**, base `b499d80f` (which IS `origin/master`). Frontend: **docs only — no code changed.** It is now on `origin/master`.

**Phase 5:** backend branch `gr1/phase5-admin-generator-lab` @ **`31c0bbe8`**, base **`ed254ca6`**
(which IS `origin/master`) — one commit, clean fast-forward. Frontend branch
`gr1/phase5-admin-generator-lab` @ **`ec9c8bbd`**, base **`147c9996`** (which IS `origin/main`)
— one commit, clean fast-forward, and the **first frontend code** any GR1 phase has produced.
Upstream moved **zero** commits in either repo during the phase, so no reconciliation was
required and none was performed. **Neither branch is pushed:** `origin/master` auto-deploys to
Railway and `origin/main` is what Lovable publishes from, so the push is an owner action.
Owner commands:

```bash
# backend
git -C <backend> push origin gr1/phase5-admin-generator-lab:master
# frontend — then press Publish in Lovable, which a push alone does NOT do
git -C <frontend> push origin gr1/phase5-admin-generator-lab:main
```

**Phase 4 reconciled against `origin/master` @ `27610924` (2026-09-12).** Upstream moved **five** commits during the phase — JQ1's activation record and Patch Ops Batch 7 (item stack automation). **Zero file overlap** with GR1's twelve changed files: upstream touched `knowledge_engine/apply/*`, `item_*`, `stat_modifier_engine.py` and four docs. The branch was rebased onto them anyway and the suites re-run afterwards: **3 failed, 1782 passed** across `mastery/tests` + the 5 Ranked-Mastery integration files + the 3 fast QR1 attempt suites — the same three pre-existing failures, zero introduced. Clean fast-forward (`HEAD~1 == origin/master`).

**Overlap check with QR1 (the other attempt/persistence workstream): none.** QR1's `quiz_attempts` v2 rebuild is already on `master` and Phase 4 does not modify it, its migration, or its schema. The one QR1 file Phase 4 touches is `services/attempt_recorder.py`, and the change is a single parameter with a default that leaves every existing caller byte-identical.

**Phase 3 reconciled against `origin/master` @ `db709873` (2026-09-12).** Upstream
moved **ten** commits since the Phase 3 base — all of them JQ1's Jungle Systems
question generator. **Zero file overlap** with GR1's nine changed files. The branch
was rebased onto them anyway and every suite re-run: `mastery/tests` failure set
unchanged, and the composition probe's output is **byte-identical** before and
after the rebase, so JQ1's `quiz/family_contract.py` edits do not reach Mastery
eligibility. Clean fast-forward.

**Reconciled against `origin/master` @ `705cdefe` (2026-09-12).** Upstream moved **zero** commits
since the Phase 2 base: `origin/master` *is* `705cdefe`. There was no concurrent work on Mastery
generation, Mastery provenance, Ranked `mastery_slice`, source authority or their guards, so no
reconciliation was needed and the branch is a clean **fast-forward** — `HEAD~2 == origin/master`.
No rebase was performed because none was required.

Upstream moved exactly one commit in each repo between the phases, and neither touches Mastery
generation authority (backend `705cdefe` is QR1's `quiz_attempts` rebuild — out of scope here;
frontend `147c9996` is the RIV2 summoner-spell card extraction).

**Both primary checkouts are STILL stale AND dirty and must not be read as current:**
backend on `live1/phase4b1-match-context` @ `28bf2ee4`; frontend on `main` @ `e12f5900`.
Both phases used fresh worktrees. Do the same.

## Current architecture (one paragraph)

`mastery_slice.v1` is a **runtime carrier**, not content. When a segment opens it runs the generator
named by `module_config.mastery_mode`, freezes the questions onto `ranked_rounds`, and renders them
in the Ranked arena. Grading delegates to the single Mastery grader over the frozen payload; replay
never re-publishes. The static Mastery Set catalog is **deleted** (MC1); old ids are decoded once on
the stored-config read path.

Since GR1 Phase 2, generation is **preceded by a source preflight**, **salted by the match's own
seed**, and **stamped with the patch it was generated from**. A source that cannot be read now
refuses the segment instead of quietly producing a different one.

Since GR1 Phase 4, a segment additionally freezes **what it was generated FROM** — a
`mastery_artifact` block in the private payload naming the generator, its version, the
normalised config, the salt, the source artifact and the patch — and every challenge a real
account answers becomes one ordinary `quiz_attempts` row (`source='ranked_mastery'`, no XP).
Zero DDL: the round row was already an immutable write-once document, and `quiz_attempts` v2
was already built for a question with no stored row.

Since GR1 Phase 3, **candidate generation and slice composition are separate responsibilities and
the split is enforced**: candidate generation decides what is VALID (unchanged), composition decides
what subset is a useful sequence, and `mastery/synthesis/invariants.py` states once — over finished
steps, for all three generators — what makes any of it a usable question.

## Current generator types — exactly three

| Mode | Generator | Coverage | Notes |
|---|---|---|---|
| `champion` | `mastery.synthesis.service.synthesize_champion_mastery` | **173/173** champions, 6,690 questions | Goes through the publication gate. Since P3: round-robin allocation over the categories the pool has, one block per role |
| `matchup` | `…synthesize_matchup_mastery` | **14,878** pairs | Order-independent; universe = comparisons **+ both atomic banks**. Since P3: comparisons lead the sequence as well as the budget |
| `applied_chain` | `mastery.synthesis.applied_chain…` | 3 attacker abilities × 6 targets, **≤14 q each** (was 17) | **No publication gate**, `is_prototype=True`, level-11 scenario. Since P3: items collapsed by derived mechanic; prompt states the item's bonus AD |

Champion + Matchup are **one pipeline**. Applied-chain is architecturally separate.

## Important decisions / facts

1. **Public Ranked serves none of them.** No built-in format (`ranked_points_v2`, `ranked_modern`,
   `ranked_legacy_quiz`) names `mastery_slice`.
2. **The only saved format in the DB is a Mastery Slice**, and it is still written in the **retired**
   `mastery_set_id: chain.jarvan.physical_penetration` spelling. It works only via
   `ranked_formats/retired_mastery_sets.py`, which decodes it to applied-chain (Jarvan Q vs Olaf, n=2).
   All 29 rows are `target='admin_bot'`; **zero** `target='public'`.
   ⇒ The registry comment saying `mastery_slice` is "UNREACHABLE" is **wrong for stored configs**.
3. ~~**The cooldown JSON is load-bearing and fails OPEN.**~~ **FIXED in Phase 2.** It now **fails
   closed** (`CooldownAuthorityUnavailable` → `SourceIntegrityError` →
   `RANKED_MODULE_DATA_UNAVAILABLE`), reports its own provenance (content SHA-256, revision span,
   declared source hash) and is **mechanically verified** against `champion_abilities` by
   `mastery/facts/integrity.py`. It was NOT deleted, and the reason is measured: the value of record
   was always the DB column — the artifact *arbitrates* it — and its irreducible content is the
   **cooldown SHAPE**, which no column expresses and which holds 26 abilities out of the cooldown
   families. It is also not hand-written: `scripts/dc1_ability_semantic_audit.py` generates it via
   the approved wiki parser. `cooldown_is_static` agrees 688/688, so staticness *is* fully
   DB-supplied.
4. ~~**Applied-chain patch identity is a hardcoded Python literal.**~~ **FIXED in Phase 2.** All
   three modes now stamp the label from the canonical `league_patches` catalog
   (`mastery/provenance/canonical_patch.py`) — `"League 26.16"` today, `""` or "26.13" before.
   Identity is unaffected: `game_patch_display` is excluded from `patch_key_digest` by
   construction, verified byte-identical at runtime. The literal still exists because its
   **machine** fields are the certified-adapter registration key.
5. ~~**Certified Python champion data disagrees with the canonical DB.**~~ **RESOLVED in Phase 2 —
   no value was changed, and no owner ruling was needed.** Production (read-only, via its own public
   docs API) agrees with the certified Python on **all five** disputed values, plus a sixth the
   tests never covered (Maokai Q). The local `lol_calc.db` is a pre-CHAMPDATA snapshot: every
   `champion_ability_formulas` row is the single `2026-05-31` spreadsheet import. The guard tests
   now assert through `mastery/provenance/certified_provenance.py`, which tells "the copy drifted" apart
   from "this store predates the correction". Full reconciliation table: Phase 2 doc §5.
6. ~~**Short slices are ~97% `ability_cooldown`.**~~ **FIXED in Phase 3.** It was worse than
   "the first three": *every* slice shorter than a champion's cooldown pool was 100% cooldown,
   because `recipe._plan` drained `CATEGORY_ORDER` greedily. Allocation is now a round-robin and
   one role's categories share one block so the resolver's existing interleaving can mix them.
   Roster-wide first-three cooldowns: **503/519 → 211/519**; a 3-question slice now spans all
   three categories a champion has, and the longest same-family run at n=8 is **≤2**.
   Correction to the old note: the "3,482 base-stat" candidates are **raw**. The publication gate
   rejects the whole of `champion_base_stat` for atomic recall as `family_unmapped`, roster-wide,
   so the servable atomic bank is three categories, not four. That is a serving-policy fact and
   Phase 3 did not touch it. `champion_base_stat` IS eligible as a **comparison**, which is why
   Matchup sees it and Champion does not.
7. ~~**`seed` is ignored.**~~ **FIXED in Phase 2.** The match's server-only `order_seed` (plus the
   segment number) is now a **selection salt** mixed into the candidate rotation the resolver
   already had — no new RNG, and no change to curriculum ordering or the category plan. Same seed ⇒
   same artifact; different seeds ⇒ different valid samples; `selection_salt=None` reproduces the
   pre-phase output byte for byte, so every preview/admin/test path is unchanged.
8. ~~**Nothing writes to `quiz_attempts`**, so Personal/Premium analytics can never see these
   questions.~~ **FIXED in Phase 4.** An answered challenge is now one ordinary `quiz_attempts`
   row — `question_id` NULL, `question_key` the round's own frozen `mastery:<concept_id>` ref,
   `source='ranked_mastery'`, with `choices_snapshot` / `source_version` / `provenance_json`
   populated. **Zero DDL**: the v2 table was built for exactly this case. Written from
   `submit_challenge`'s FIRST-WRITE branch, in the same `BEGIN IMMEDIATE` transaction as the
   submission, so a duplicate is structurally impossible rather than deduplicated afterwards.
   **No quiz XP, streak, category or achievement runs** (`apply_progress=False`) — Ranked pays
   Elo, and turning that on is owner decision 5 below.
9. ~~**Admin Quiz Review shows 0 of them.**~~ **Still true, and now CORRECT rather than a gap.**
   All 56 "mastery" rows there are Summoner Spell Mastery, and generated Mastery questions are
   deliberately NOT in that table: a `mastery_slice` question is virtual until a match serves
   it, and Quiz Review is a table of STORED questions with ids you can approve and publish.
   **Phase 5 built the Generated Questions surface instead** — `/admin/ranked/generator-lab`,
   the Mastery Generator Lab — and cross-linked the two in both directions so the distinction
   is visible rather than implied. Admin Quiz Review itself is untouched.
11. **A served generated question is now explainable, not just re-readable** (Phase 4). The
    segment's PRIVATE payload carries `mastery_artifact`: generator type, generator version,
    the normalised config, the subject key, the selection salt (server-only), the source
    artifact's `mastery_set_id`/`artifact_digest`/`patch_key_digest`, and the patch label. Four
    identity levels, none conflated — `generator_type` → `mastery:<concept_id>` →
    `artifact_instance_id` → `quiz_attempts.id`. **Absent means unknown**: every segment frozen
    before Phase 4 has no block and every reader treats `None` as "predates the contract".
12. **`generator_version` is provenance, never a dispatch key.** History is reconstructed from
    the persisted content, never by rerunning an old generator. Nothing reads it and
    re-dispatches, and nothing ever should. Phase 5 DISPLAYS it and still does not dispatch on it.
13. **NEW (Phase 5) — there is exactly one per-challenge renderer, and both surfaces use it.**
    `MasterySliceChallengeSurface` was lifted out of `masterySliceModule.tsx`; the arena and the
    Generator Lab both render through it. A second renderer built to "look like" the arena is
    the specific mistake this phase existed to avoid, and the reuse is what makes "is this
    exactly what a player would see?" answerable by identity. Do not fork it.
14. **NEW (Phase 5) — `seed` is an ADMIN INPUT on the preview path, and omitting it is not
    "seed zero".** No seed reproduces the pre-Phase-5 fixed preview byte for byte, which is
    what keeps the Format Builder's existing preview panel unchanged. There is still exactly
    one salt derivation (`MasterySliceModule._selection_salt`) and exactly one RNG path.
15. **NEW (Phase 5) — a coverage count and a generated slice read the SAME candidate pool.**
    `mastery.synthesis.service.eligible_champion_pool` / `eligible_matchup_pool` name the first
    half of generation, and the synthesizers call them. Never count the pool a second way: a
    coverage panel that disagrees with what the generator will serve is worse than no panel.
10. **Naming collision — internalise this:** `ranked_modules/mastery_slice.py` (the module) and
    `ranked_public/mastery_slices.py` (the SSM provider decorator, flag-gated OFF) are different systems
    sharing a name and no code path.

## Relevant files

**Backend** — `ranked_modules/mastery_slice.py` (carrier), `ranked_modules/mastery_config.py` (the config
authority), `ranked_modules/registry.py`, `ranked_formats/retired_mastery_sets.py`, `ranked_formats/schema.py`,
`ranked_public/{format_config,readiness,builder_catalog,mastery_preview,service}.py`,
`mastery/synthesis/{service,recipe,applied_chain,invariants,preflight}.py`,
`mastery/manifest/resolver.py` (selection + `CURRICULUM_V2` sequencing — Phase 3 touched
`_break_adjacent_pattern` only), `mastery/questions/physical_penetration_rendering.py`
(the applied-chain prompt), `mastery/facts/{sources,projection}.py`,
`mastery/knowledge/bank.py`, `mastery/matchup/composer.py`, `mastery/publication_gate/gate.py`,
`mastery/data/*.py` (6 certified champions), `mastery/data/slice_patch.py`,
`mastery/chains/physical_penetration_set.py`, `quiz/review_universe.py`, `routes/mastery.py`,
`mastery/serving/{artifact,attempts}.py` (Phase 4 — the served-artifact contract and the
`quiz_attempts` bridge), `mastery/synthesis/coverage.py` (Phase 5 — a COUNT, never content),
`ranked_public/review.py` (the ONE historical rendering system),
`services/attempt_recorder.py`, `migrate_quiz_attempts_v2.py` (read, not changed),
`fixtures/dc1_phase2f_cooldown_authority.json`.

**Frontend** — `src/lib/ranked-core/modules/MasterySliceChallengeSurface.tsx` (Phase 5 — THE
one per-challenge renderer, shared by the arena and the Generator Lab; holds `renderPathFor`),
`src/lib/ranked-core/modules/masterySliceModule.tsx` (the arena's match model; renders through
the shared surface), `src/pages/admin/ranked/MasteryGeneratorLab.tsx` (Phase 5 — the Lab),
`src/features/mastery/interactions/{registry.tsx,AtomicRecallQuestionView.tsx,ComparisonQuestionView.tsx,formatPromptSemantics.ts}`,
`src/features/mastery/contracts/{promptSemantics,comparisonSemantics,playerQuestion}.ts`,
`src/lib/question-surface/masterySliceScenario.ts` (current, not legacy),
`src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx`, `src/pages/admin/ranked/RankedFormatBuilder*`.

## Source authorities

- Champion/Matchup → `champion_stats` + `champion_abilities` (canonical — the VALUE of record)
  **+ the generated wiki cooldown artifact as arbiter and shape authority** (fail-closed,
  provenance-bearing, drift-verified since Phase 2).
- Applied-chain → 6 hand-authored Python modules (**provenance-checked** against
  `champion_ability_formulas` since Phase 2) + `item_canonical` (17 penetration items).
- Patch label (all three modes) → `league_patches`, the canonical patch catalog.
- Presentation/media → server-side `quiz/presentation_contract.py` + `ranked_public/presentation_render.py`.

### New in Phase 2

| Module | Answers |
|---|---|
| `mastery/facts/integrity.py` | Is the cooldown artifact readable, and does it still agree with its store? |
| `mastery/provenance/certified_provenance.py` | Do the certified constants still agree with canonical data — and if not, is the copy wrong or the store behind? |
| `mastery/provenance/canonical_patch.py` | Which League patch is live, per the canonical catalog? |
| `mastery/synthesis/preflight.py` | Can this mode's sources be trusted right now? (`SourceIntegrityError` if not.) |

### New in Phase 3

| Module | Answers |
|---|---|
| `mastery/synthesis/invariants.py` | Is this generated slice made of usable questions? (One correct answer among distinct options; no duplicate semantic question; a free-input step judged by its own shape.) |
| `mastery/synthesis/recipe.allocate` | How is a slice's budget SHARED between the categories a subject actually has? |
| `mastery/synthesis/applied_chain.item_mechanic_key` | Are these two items the same learning task? (`(bonus AD, lethality, %pen)` — the inputs that decide the answer.) |

### New in Phase 4

| Module | Answers |
|---|---|
| `mastery/serving/artifact.py` | What WAS this generated question — which generator, at which version, over which config, from which patch, out of which artifact instance? Plus the redaction a review may show. |
| `mastery/serving/attempts.py` | One answered challenge → one ordinary `quiz_attempts` row. No parallel table, no second identity. |
| `ranked_modules.mastery_slice.attempt_material` | Everything an attempt records about one challenge, drawn from the FROZEN payloads only. |
| `ranked_modules.mastery_config.normalized_config` | The inverse of the parser: the config keys the generator actually consumed. |
| `services.attempt_recorder.record_attempt(apply_progress=…)` | Record the attempt WITHOUT paying the quiz progression, for a surface that has its own. |

`equivalent_answer_groups` is reported separately from `inspect_steps`, not folded into it: two
steps with the same answer AND the same options are a duplicate only where the prompt differs by a
label the derivation ignores (applied-chain's item name). Where the prompts name different subjects
it is coincidence.

A **valid no-content state and a source failure are now different things**: `error_kind` on the
readiness report is one of `source_integrity`, `insufficient_questions`, `publication_blocked` or
`synthesis`. A *successful* report additionally carries `patch_display` and any
`source_advisories` — so a slice can be reported servable **and** disputed at the same time,
which the pre-phase report could not say.

## Champion Mastery — capability audit (2026-09-12, audit only)

Full evidence: [`docs/gr1-champion-mastery-capability-audit.md`](./gr1-champion-mastery-capability-audit.md).
Screenshots: `docs/audits/gr1-champion-mastery/` (10 PNGs, end-to-end through the real Admin
Generator Lab). Bases: backend `origin/master` **`31c0bbe8`**, frontend `origin/main`
**`ec9c8bbd`**. Matchup and Applied-chain deliberately not audited. **Nothing was implemented.**

**What it is.** Numeric atomic recall over one champion, in **four** quiz families across three
categories: `ability_cooldown_rank`, `ability_cooldown_flat`, `ability_cost_rank`,
`champion_stat_level`. **6,690 servable candidates, 173/173 champions**, 0 generation errors
across 2,076 real probe slices. No comparison, no scenario, no calculation.

**Raw → servable: 8,801 → 6,782 (policy) → 6,690 (dedupe).** The *only* rejection reason
roster-wide is `family_unmapped`: **`champion_base_stat` is 1,702 raw / 0 servable** and flat
ability cost is 317 / 0. `champion_stat_level` alone is **52%** of the corpus.
*Correction to decision 6 above: "3,482 base-stat" is wrong — 3,482 is the servable
`champion_level_stat` count; base stat is 1,702 raw and 0 servable.*

**Coverage.** min 19 / median 40 / max 54 per champion. 125 champions have three categories, 43
have two, and **5 have ONE** (`aphelios`, `elise`, `jayce`, `nidalee`, `udyr` — level-stat only).
Root cause is upstream and *correct*: `dual_form_row` and `nonstandard_rank_count` in
`quiz/ability_question_eligibility.py`. Zero champions have zero coverage.

**Phase 3 solved the wrong half.** Category monoculture IS fixed (2.9% single-family at n=3).
Same-**fact** repetition is not: **36.8%** of 3-question slices repeat an ability slot, rising to
**97%** at n≥5; **97%** of 8-question slices repeat rank variants of one ability. Real captures:
6 of 8 Alistar questions are Alistar Q (cd r1, cost r1, cd r2, cost r2, cd r3, cost r3);
7 of 8 Garen questions are two facts. Seeds change *which* questions in all 692 (champion, n)
cells, but the **category mix is identical across every seed** — `allocate()` reads only counts
and budget, so a seed can never change a slice's shape.

**Two confirmed player-visible defects, both from screenshots, both one-line wiring:**
1. **`toPlayerQuestion` hardcodes `patchDisplay: ""`** → `patchLabel("")` returns the literal
   **`"Fixed scenario"`**, badged on *every* question, in the arena and the Lab, contradicting
   the League 26.16 label the backend already computed and returned.
2. **`MasteryAssetsProvider` is mounted only by `MasteryPlayerLive`**, so the slice path renders
   the grey initial-letter portrait fallback. (Latent behind it: the call passes
   `championDisplay.toLowerCase()`, i.e. `"lee sin"`, not the canonical `lee-sin`.)

**Worst wording defect.** `champion_stat_at_level` renders `humanizeMetric("base_armor")`, so the
prompt reads **"At level 18, what is Aatrox's Base Armor?"** for a base+growth value. Affects the
whole 3,482-candidate family and all 173 champions. The media band, from the *server's*
presentation contract, already says `HEALTH REGEN` where the prompt says "Base Health Regen" —
the two disagree. Also: an ability is **never named** (`bank._ability_name()` is `return slot`)
even though the image above prints "Infernal Chains", and a cost prompt **never names the
resource** despite `RESOURCE_LABEL` existing upstream.

**Internal taxonomy is NOT leaking**, proved from the renderer: `question_family` and the
backend's `prompt` (`"Ahri E — ability_cooldown"`) both cross the wire but
`AtomicRecallQuestionView` renders `formatRecallPrompt(promptSemantics)` and never them;
`ATOMIC_RECALL`/`ABILITY_COOLDOWN` appear only in the Lab's admin diagnostic header.
`Recall` and `Fixed scenario` ARE rendered to players.

**Difficulty is not real.** `difficulty_class` exists on every frozen step and is
`difficulty_for(certification)` — a two-entry map that splits exactly along the category line
(3,208 at 2 = cooldown+cost, 3,482 at 4 = level-stat). Nothing in generation, composition,
distractors or sequencing reads it. **Do not build it yet.**

**Persistence (Phase 4) re-verified, nothing contradicted** — frozen artifact, `mastery_artifact`
provenance, `mastery:<concept_id>` key shared with the standalone bank, one `quiz_attempts` row
per answered challenge with `apply_progress=False`, four unconflated identities, absent-means-
unknown. Note `mastery/serving/attempts.py` is **fail-soft**: a record failure is logged and
swallowed, so analytics loss is silent. The Lab writes nothing (verified in the backend log).

**Tests.** `pytest mastery/tests` → **3 failed, 1617 passed** — the documented pre-existing set,
zero introduced. GR1 P2/P3/P4 + synthesis + roster + gate → **288 passed**. `vitest` mastery +
ranked-core + Lab → **236 passed**. **New:** `test_ranked_mastery_artifact_persistence.py` passes
**21/21 alone** but fails one test when `test_ranked_mastery_reveal_e2e.py` runs before it —
cross-suite state leakage, bisected to that one culprit. **Untested:**
`formatPromptSemantics.ts` has no test file at all — the one file that writes every player-facing
sentence, and the site of the "Base Armor" defect.

**Top 5 to product-ready — ALL FIVE ARE DONE.** See
[`gr1-champion-mastery-product-readiness.md`](./gr1-champion-mastery-product-readiness.md).
Branch `gr1/champion-mastery-product-readiness` in BOTH repos, one commit each, both clean
fast-forwards: backend **`ce9ae8f6`** on base `f6d61632`, frontend **`84aaf5a1`** on base
`ec9c8bbd` rebased onto `6eafd998` (POINT1, zero file overlap). **Neither is pushed** —
`origin/master` auto-deploys and `origin/main` is what Lovable publishes from:

```bash
git -C <backend>  push origin gr1/champion-mastery-product-readiness:master
git -C <frontend> push origin gr1/champion-mastery-product-readiness:main
# then press Publish in Lovable — a push alone does NOT deploy the frontend
``` What changed, one line each:

1. **Level-stat wording.** "At level 18, what is Aatrox's **Armor**?" — `formatPromptSemantics
   .statName` drops the `base_` qualifier for the level template, and the metric slug (the
   identity everything travels under) is untouched. The server's chip agrees now too:
   `presentation_render._stat_badge` drops it wherever a level is STATED; `METRIC_LABELS` is not
   edited, so a base-stat question elsewhere still reads "Base Armor".
2. **Ability names.** `bank._ability_name` was literally `return slot`. It now reads
   `ChampionFactSet.ability_name(slot)`, off the SAME `champion_abilities` read the ability facts
   came from → "Aatrox W (Infernal Chains)". `candidate_key` is unaffected, and asserted so.
3. **Cost resources.** `PromptSemantics.resource` is the fact's own unit inverted through
   `COST_RESOURCE_UNIT` → "how much **mana** does Ahri Q (Orb of Deception) cost?".
   **Fail-closed** (`COST_RESOURCE_UNNAMEABLE`), and it costs nothing: the servable corpus is
   **6,690 before and after**, because every servable cost already carried a certified resource.
4. **Same-fact repetition.** Two changes over the definition the sequencer already had
   (`_pattern_group` = champion:subject_ref:metric): `_select_for_request` prefers unseen patterns
   with `used_patterns` threaded across the WHOLE plan, and `recipe.allocate` round-robins over
   each category's DISTINCT FACT count before its raw count. Roster-wide, 519 slices per length:
   `(metric, subject_ref)` repeats **113→0 at n=3, 498→0 at n=5, 519→24 at n=8**, with the question
   count byte-identical (1557/2595/4152) — nothing thin was lost. The residual 24 is exactly the
   five single-family champions plus `gnar`/`lee-sin`/`reksai`. A third change keeps Phase 3's win:
   `_interleave_by_key` also bounds the CATEGORY run, and gained a backward-insert move because the
   forward-only pull could never fix a run at the tail.
5. **Presentation wiring.** `patch_display` and `input_constraints` are now frozen onto each public
   challenge (`PUBLIC_CHALLENGE_FIELDS`) — the badge reads **`Patch 26.16`** instead of the literal
   `"Fixed scenario"`, and a free-input question shows the grader's own unit and precision
   instruction (same `_numeric_constraints`, same `readNumericConstraints`). `MasteryAssetsProvider`
   is mounted on the ONE shared surface, so both surfaces get portraits and there is still exactly
   one image path. Both fields are absent-means-unknown.

**Superseded — the original list:** (1) fix the level-stat prompt wording; (2) pass the real
`patchDisplay` through `toPlayerQuestion`; (3) add a per-slice cap on `(metric, subject_ref)` /
`redundancy_group` where `_break_adjacent_pattern` already lives; (4) name the ability and the
resource; (5) mount `MasteryAssetsProvider` and pass real `inputConstraints` on the slice path.

**Do NOT change yet:** difficulty; the `dual_form_row` / `nonstandard_rank_count` holds (correct
— widening them ships ambiguous questions); `champion_base_stat`'s unmapping (family-contract's
call, and unblocking it exposes a latent "base Base Armor"); the gate, preflight, freeze and
attempts contracts (all sound); Matchup; Applied-chain.

**Test-isolation defect — re-measured, and it is not what the audit thought.** The failing test is
`test_review_is_unchanged_after_the_canonical_data_moves`, not the one named; it is
**intermittent (~1 in 5), not order-deterministic**; and it reproduces **identically at the base
SHA**, so the readiness pass neither causes nor fixes it. No file that pass touches is involved —
the mechanism is the suite's own `_shift_cooldowns` monkeypatch against module-level generator
state. The five Ranked-Mastery suites pass **104/104** in natural order. Left for a separate
test-infrastructure task.

**Owner decision required (one).** Raising ability coverage for the five single-family champions
needs **dual-form rows in `champion_abilities` split into per-form rows** — a canonical-data
change owned by CHAMPDATA/Patch Ops, not GR1. Wait for that, or accept five champions shipping
with a one-family product?

## Matchup Mastery — capability audit (2026-09-13, audit only)

Full evidence: [`docs/gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md).
Bases: backend `origin/master` **`c4f08761`**, frontend `origin/main` **`33d27b2f`**.
Champion Mastery and Applied-chain deliberately untouched. **Nothing was implemented.**

**What it is.** Two servable comparison families — `ability_cooldown_compare` and
`champion_stat_compare` — plus both sides' atomic banks. **14,878 / 14,878 pairs generatable,
0 errors.** Of the four comparison templates the composer and the renderer both know,
`ability_cost` and `champion_stat_at_level` are `family_unmapped` (no family in
`quiz/family_contract.py`), so **two of the four renderer branches are dead code**.

**Raw → policy → servable: 726,049 → 322,026 → 174,970 comparisons** (+1,150,680 atomic).
The only policy rejection roster-wide is `family_unmapped` (404,023 = all level-stat + all
cost). Per pair: comparisons **min 8 / median 12 / max 13**; total servable min 47 / median 90.

**THE FINDING — one rank-silent f-string costs coverage AND correctness.**
`adapter._comparison_prompt_and_explanation` builds `f"{a} vs {b} — {metric}"` with **no
context**, and `effective_question_key` is keyed on that prompt. So a cooldown comparison at
ranks 1–5 is ONE effective question and four are deduped away: **cooldown comparisons
192,562 → 45,506, a 76.4% loss**, which is what caps every pair at 13. Worse, the survivor is
always rank 1, and across all 14,878 pairs **43,085 collapse groups exist and 11,880 (27.6%)
disagree on the answer between ranks** — 9,880 of those are a tie at one rank and decisive at
another. The question as asked has a different correct answer at a rank it does not exclude.
Fixing the prompt fixes both. *(The media band already prints `RANK 1`; only the sentence
does not — visible in the same card of the existing capture.)*

**Ties — quantified, not removed, per instruction.** 20,296 / 174,970 servable comparisons are
ties (**11.6%**); in real slices **14.5–15.2% of questions**, and **64.4% of n=8 slices contain
≥1 tie, 31.1% contain ≥2, 15.5% ≥3**. Worst metrics: **`base_magic_resist` 39.3%**,
`movement_speed` 18.4%, `attack_range` 15.7%, `ability_cooldown` 9.9%. Two structural causes:
Riot's shared constants (MR 32, MS 345, range 125/175), and every cooldown being judged at
rank 1 where kits agree by convention. **The user's Aatrox-vs-Akali example is exactly this** —
R and W are ties at rank 1 and decisive at every higher rank.

**Composition is HEALTHY and needs nothing.** 5,016 real slices (418-pair stratified sample ×
{3,5,8} × 4 salts): **0.0% repeat a `(subject, slot, metric)` pattern at every length**,
0.0% repeat an ability slot, longest same-family run 2, **0 comparison/atomic order
violations**. The readiness pass's `used_patterns` threading is mode-agnostic and already
carries. Determinism holds (same salt ⇒ 1 slice), `(a,b) == (b,a)` digests are identical, and
12 salts give 6–11 distinct slices. **Atomic recall is unreachable at n ≤ 8** — spill begins
exactly at pool exhaustion, so slices are **100% comparative / 0% atomic fallback** at every
realistic length.

**The one un-ported half of the readiness fix:** `synthesize_matchup_manifest` passes no
`distinct_counts` to `_plan`. Free at n ≤ 8; repeats a fact up to 5× at n ≥ 16.

**Correctness is otherwise clean.** 517/517 base-stat values and winners match
`champion_stats`; 325/325 parseable cooldowns match `champion_abilities`. Phase 2 still fails
closed for matchup — `CooldownAuthorityUnavailable` ⇒ `AUTHORITY_UNAVAILABLE` ⇒
`SourceIntegrityError`, verified by injection and by recovery. Patch stamped `League 26.16`.
**One new data/semantics defect:** 22 champions have `mp5 = 0` because they use no mana, so
**3,553 pairs (23.9%) ask "which has more base Mana Regen" with one side at a structural 0**,
and 231 manaless-vs-manaless pairs serve it as a guaranteed 0–0 tie. `base_mana` already
declines correctly for those champions; `base_mana_regen` does not.

**Wording — all 10 served shapes inventoried.** No ability is ever named ("Ahri R or
Syndra R?"); no rank is stated; **7 of 10 read "more base Base X"** (the template hardcodes
`base ` and `humanizeMetric` re-emits it), while `attack_range`/`movement_speed` get the
inverse error; and the player-visible reveal leaks raw unit slugs — `per_5_seconds`,
`units_per_second`, `attack_damage`, `hitpoints`. Direction ("shorter"/"less"/"more") is
correct and leaks nothing; "which champion" is never ambiguous; internal taxonomy does not
reach a player. One oddity: the segment **header** echoes the caller's champion order while
every question inside uses canonical order.

**Presentation — two defects.** (1) `movement_speed` and `attack_range` are **absent from
`quiz.public_presentation.METRIC_NAMES`**, so `MatchupRef` refuses and those challenges ship
with **no media band at all — 29,756 of 174,970 = 17.0%**, mid-slice, beside cards that have
one. (2) `presentation_render.py:423` is literally
`subject["ability_name"] = f"Ability {ref.ability_slot}"` — the single-champion path resolves
the canonical name, the matchup path prints **"Ability W"**. The badge and portrait defects the
Champion audit found are FIXED and confirmed fixed on the live payload.

**Persistence needs nothing.** `subject_key` is canonical both ways
(`matchup:ahri:syndra`), `mastery_set_id` / `artifact_digest` / `artifact_instance_id` are
identical for either config order, `subject_kind = MATCHUP`, two `fact_refs` per comparison,
and the step's `candidate_key` (`…:W:vs:…:W:r1`) **carries the rank the prompt omits**.

**Tests.** `pytest mastery/tests` → **3 failed, 1658 passed** — the documented pre-existing
set, zero introduced. 6 Ranked-Mastery integration files → **2 failed, 151 passed**; both
failures (`test_mastery_ranked_capsule.py` pinned ids/digests) reproduce at `ed254ca6`, so they
predate the readiness pass. **`formatComparisonSemantics.ts` has no test file** — it writes
every sentence above and holds four of the wording defects.

**Top 5 blockers, in recommended implementation order:**

1. **State the rank in the comparison prompt** (backend f-string + frontend template).
   Correctness fix; also 4.2× the cooldown universe and most of the tie mass. One change,
   three blockers.
2. **Re-measure ties over the widened universe, then set a tie policy.** Do not cap before (1).
3. **Prompt wording** — name both abilities, drop the double `base`, invert the unit slugs.
4. **Presentation** — add `movement_speed`/`attack_range` to `METRIC_NAMES`/`METRIC_LABELS`;
   decide what a two-champion band says instead of `"Ability W"`.
5. **Manaless mana regen** — make `base_mana_regen` decline the way `base_mana` already does.

Then, lower: `distinct_counts` for the matchup plan, and the Lab coverage headline (it says
`total_candidates: 87` for `ahri × syndra` when the number that decides the product is
`comparison_candidates: 12`).

**Do NOT bundle in** — both are open owner decisions, neither is GR1's: the comparative
cost/level-stat **families** (404,023 held candidates, `quiz/family_contract.py`'s call), and
the **dual-form row split** (why the 10 thinnest pairs — all involving `aphelios`, `elise`,
`gnar`, `jayce`, `nidalee`, `reksai`, `udyr`, `lee-sin` — have zero ability comparisons).

**New owner decision:** manaless mana regeneration — decline it, or accept "0 vs 50" as a
legitimate question about a champion having no mana?

## Matchup rank identity — SHIPPED to branch (2026-09-13)

Full evidence: [`gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md).
Backend `gr1/matchup-rank-identity` @ **`52f5564a`** on base **`c4f08761`**; frontend
@ **`756b6b41`** on base **`3ce50045`**. One commit each, both clean fast-forwards,
**neither pushed**:

```bash
git -C /Users/macmoney/lcs-wt-gr1-rankfix   push origin gr1/matchup-rank-identity:master
git -C /Users/macmoney/mogsy-wt-gr1-rankfix push origin gr1/matchup-rank-identity:main
# then press Publish in Lovable — a push alone does NOT deploy the frontend
```

**The fix, in one paragraph.** `effective_question_key` is keyed on the rendered prompt, and
a comparison's options are always `[a, b, tie]` — so unlike atomic recall, where five ranks
yield five option sets and stay distinct for free, the prompt was the only thing that could
separate two ranks, and it carried no rank. `_comparison_context_clause` now appends
`" at rank N"`, and honours the composer's `rank_independent` (the flat pair) by stating
**no** rank there, which is the difference between stating one and fabricating one.

**Measured, all 14,878 pairs.** Collapse groups **43,085 → 0**; cross-rank answer
disagreements **11,880 (27.6%) → 0**; servable comparisons **174,970 → 322,026** (cooldown
**45,506 → 192,562**, dedupe now discards nothing); per-pair comparisons **min 8 / median 12
/ max 13 → min 8 / median 22 / max 27**. Raw candidates, policy-accepted counts, skip reasons
and the `family_unmapped` rejection are all **byte-identical** — nothing policy refused was
unlocked.

**Ties, re-measured and NOT suppressed.** Roster-wide **11.60% → 9.50%**. In 5,016 real
slices: questions that are ties **14.5/14.8/15.2% → 12.9/14.0/14.6%** at n=3/5/8; n=8 slices
with ≥1 tie **64.4% → 63.4%**, ≥2 **31.1% → 30.8%**, ≥3 **15.5% → 14.0%**. The slice-level
gain is small **and the reason is measured**: selection still meets each slot at **rank 1**
(79% of ability comparisons at n=8), and rank 1 ties at **21.5%** against 8.1–11.5% at every
other rank. ⇒ **The rank collapse was worth ~2 points roster-wide and ~1–1.6 in a slice. The
rest is rank-1 preference plus genuinely shared base constants (`base_magic_resist` 39.3%),
so rank diversity in selection is a cheaper first lever than tie suppression.**

**Composition preserved — and one change was REQUIRED to preserve it.** Multiplying the raw
cooldown count by five without changing its DISTINCT-FACT count made `recipe.allocate`'s
raw-count round-robin repeat a fact in **43.1%** of 8-question slices.
`synthesize_matchup_manifest` now passes `distinct_facts_by_category`, which Champion Mastery
has had since the readiness pass and Matchup never did — free before this commit,
load-bearing after it. Re-measured: repeated `(subject, slot, metric)` **0.0% at n=3/5/8**,
repeated slot 0, longest family run 2, zero atomic fallback at n ≤ 8, zero order violations,
same salt ⇒ one slice, reversed pair ⇒ identical digest, 4 salts ⇒ 4 distinct slices for 319
of 418 pairs (was 254).

**Wording and presentation.** Both abilities named — `MatchupPromptSemantics` carries a
**pair**, because a same-slot comparison is the one shape where the slot is shared and the
name is not. `"more base Base Armor"` → `"more base Armor"`, and no "base" at all for
`movement_speed`/`attack_range`, which have no base-vs-scaled distinction. `per_5_seconds` →
`per 5 seconds` via `UNIT_LABELS` in `mastery/facts/contract.py`, applied **only** on the
comparison path so Champion explanations stay byte-identical. `movement_speed` and
`attack_range` added to `METRIC_NAMES`/`METRIC_LABELS` — they were absent, so `MatchupRef`
refused and **17.0% of comparisons shipped with no media band**. The band emits both ability
names or neither, and keeps the old `"Ability W"` key as a fallback for an un-shipped client.

**Do NOT reuse `_subject_label` for comparisons.** The atomic one *replaces* the slot with
the name; `_comparison_subject_label` keeps both. Keeping them apart is exactly what kept
this pass off Champion Mastery's prompts, and therefore off its dedupe.

**Tests.** `mastery/tests` → **3 failed, 1677 passed** (the documented pre-existing set, zero
introduced). 7 Ranked-Mastery integration files → 2 failed / 200 passed, both pre-existing at
`ed254ca6`. 8 presentation/media suites → failure set **byte-identical at the base SHA**.
Footprint guards **166 passed** against the real commit. `vitest` → **70 files / 951 tests, all
green**. New: 19 backend tests (`test_gr1_matchup_rank_identity.py`) and 15 frontend tests for
`formatComparisonSemantics.ts`, **which had no test file at all**. Three existing tests changed
and all three are stronger — most notably `test_distinct_candidate_ids_that_render_alike_are_deduped`,
which asserted a pair "still contains colliding candidates" **and the collision it pinned WAS
this defect**; it is inverted and now proves the mechanism over a duplicate it supplies itself.

`GR1_RUNTIME_FILES` grew by exactly three presentation files, re-pinned by exact set equality.
No other workstream's footprint moved.

**Still open for Matchup:** tie policy (decide after reading §4 of the rank-fix doc); the
comparative cost/level-stat families; manaless mana regen (deliberately untouched); the
dual-form split (why 1,480 pairs are base-stat-only); the Lab coverage headline; and no fresh
screenshot.

## Screenshots / artifacts

`docs/audits/gr1-matchup-mastery/` — **2 PNGs (Matchup Mastery capability audit).** Both are
the Phase 5 Generator Lab captures reproduced here because they are the only real Matchup
captures that exist: `matchup-generator-lab-phase5.png` (Ahri vs Syndra, n=3, seed `lab-demo`,
through the real Lab at backend `31c0bbe8` / frontend `ec9c8bbd`) and
`matchup-mirror-refusal-phase5.png`. **They predate the Champion readiness pass**, so the
`Fixed scenario` badge and the grey initial-letter portraits in them are STALE — both were
fixed, and the audit re-verified the fix against the live wire payload instead. Everything
else in them — the rank-silent prompt beside a `RANK 1` chip, `ABILITY R`, "more base Base
Armor", the two-champion layout, the three answer controls and the reveal — is current.
**No new capture was taken:** the session's permission classifier refused both the Browser pane
and a Playwright harness. A fresh capture would add only a mobile-width check and confirmation
of the post-readiness portrait path.

`docs/audits/gr1-champion-mastery/` — **10 PNGs (Champion Mastery capability audit).** All
end-to-end through the real Admin Generator Lab against a local backend serving the canonical
database. Note: reaching `/admin/ranked/generator-lab` required a throwaway Vite alias on
`components/AdminRoute` only (its Supabase-admin guard redirects to `/`, and the `X-Admin-Key`
fallback authorizes the backend but not the route); every rendering file was the real one, and
the harness was deleted after capture.

`docs/audits/gr1-phase5-generator-lab/` — **9 PNGs (Phase 5), and these are the end-to-end
ones now.** Captured with Playwright against a LOCAL backend serving the real canonical
database: every champion, number, option and explanation came out of the production generator
through the real Admin page. All three generators, plus coverage, the provenance panel, the raw
response, mobile width, and a refusal in the backend's own words. **Applied-chain has a
capturable UI for the first time** (`gr1p5-05`) — the note below saying it has none is
superseded.

`docs/audits/ranked-mastery-slice/` — 25 PNGs. The genuinely end-to-end ones are the `*-live-*` files
(real generation via `/dev/mastery-generated`, backend 201s): Champion Mastery (Ahri, Zed) and Matchup
(Ahri vs Syndra), unanswered + reveal + mobile. The `arena` ones come from `/dev/ranked-arena-inspector`
— **real components and real server-shaped media, but bench fixture answer options**.
Applied-chain has **no capturable UI** here (needs a real Supabase JWT); its exact render path is
documented instead (prose → `InteractiveScenarioSurface`, no media band).

## Tests run

| Suite | Phase 1 (audit) | Phase 2 (after) |
|---|---|---|
| `pytest mastery/tests` | 8 failed, 1422 passed, 13 skipped | **3 failed, 1466 passed, 10 skipped** — a strict SUBSET of the 8 |
| `pytest` 8 Ranked-Mastery integration files | 160 passed | **160 passed** |
| `pytest mastery/tests/test_gr1_phase2_source_authority.py` | — | **28 passed** (new) |
| `pytest` all `test_ranked*.py` + capsule, vs a clean baseline worktree | — | **61 failed on BOTH — `diff` of the failure sets is EMPTY, zero introduced** |
| The 4 branch-footprint guards + `test_footprint_guard_split.py` | 4 failed | **166 passed, 0 failed** — resolved, see below |
| 8 Ranked `mastery_slice` integration files | — | **164 passed, 3 failed** — all 3 pre-existing on the clean baseline |
| `vitest` mastery + ranked-core modules | 422 passed (43 files) | not re-run — **no frontend code changed** |

### Phase 3 (after)

| Suite | Result |
|---|---|
| `pytest mastery/tests` | **3 failed, 1605 passed, 10 skipped** — failure-set `diff` vs a clean `origin/master` worktree is **EMPTY** |
| `pytest mastery/tests/test_gr1_phase3_composition.py` | **139 passed** (new) |
| 8 Ranked `mastery_slice` integration files | **158 passed, 0 failed** |
| 16 mastery chain/rendering/parity root files | **27 failed, 377 passed** — failure-set `diff` vs the baseline is **EMPTY** (the legacy static-set suites MC1 retired) |
| The 4 footprint guards + `test_footprint_guard_split.py` | **166 passed, 0 failed** (run against a real commit, not a dirty tree) |

**Zero regressions introduced**, by failure-**set** comparison against a clean baseline worktree at
`origin/master` with the same symlinked `lol_calc.db`. Two existing tests were updated and both are
strictly stronger afterwards — see Phase 3 doc §7. Phase 3 grew `GR1_RUNTIME_FILES` by exactly one
entry (`mastery/questions/physical_penetration_rendering.py`, the prompt fix — a rendering file, not
a generator one), pinned by exact set equality. `GR1_PACKAGES`, `BANNED_PREFIXES` and
`ALLOWED_UNDER_BANNED_PREFIXES` are unchanged, and no other workstream's footprint moved.

### Phase 4 (after)

| Suite | Result |
|---|---|
| `mastery/tests/test_gr1_phase4_artifact_persistence.py` | **19 passed** (new — the pure contract: shape, the four identities, redaction, absent-means-unknown) |
| `test_ranked_mastery_artifact_persistence.py` | **21 passed** (new — live end-to-end: serve→persist ×3 generators, resume, submit, historical immutability, identity, analytics, no materialization, fail-soft) |
| The 4 footprint guards + `test_footprint_guard_split.py` | **166 passed, 0 failed** (run against the real commit `ed254ca6`, not a dirty tree) |
| 12 QR1 attempt/persistence suites, vs a clean `origin/master` baseline worktree | **17 failed, 230 passed on BOTH — failure-set `diff` is EMPTY, zero introduced** |

The 17 QR1 failures are **all** in the three suites that build a fixture through
`db_fixture_support.clone_for_test`, and they fail **inside the fixture builder, before any
product code runs**: `MAX_FIXTURE_BYTES` is 200 MB while `HEAVY_TABLES` excludes only two
esports tables, so the current `lol_calc.db` clones over the ceiling. That is the pre-existing
`combat1-db-fixture-heavy-tables-stale` defect, and it is branch-independent. **Every fast QR1
suite passed** — including `test_attempt_recorder.py` (16) and
`test_quiz_attempts_v2_migration.py` (14), which ARE the attempt contract this phase touches.

> Both sides were run **serially**, not in parallel: concurrent pytest runs against the shared
> 5.7 GB `lol_calc.db` fabricate failures. A first, parallel attempt was discarded for that
> reason.

**The historical-immutability proof is a double assertion, not a single one.** The test
freezes a Zed slice, plays it to completion, shifts the cooldown values at the seam the
generator reads through, and asserts (a) the match review is byte-identical and the attempt
rows are unchanged, AND (b) a freshly generated slice for the same champion now has
*different* answers. Without (b), the equality in (a) would also be satisfied by a mutation
that never happened.

**Phase 4 grew `GR1_PACKAGES` by exactly one entry** (`mastery/serving/`) and
`GR1_RUNTIME_FILES` by three (`ranked_public/review.py`,
`services/attempt_recorder.py`, `test_ranked_mastery_artifact_persistence.py`), each
re-pinned by exact set equality in `test_footprint_guard_split.py` so the growth is a
deliberate, reviewable edit. `BANNED_PREFIXES`, `ALLOWED_UNDER_BANNED_PREFIXES` and the
Mastery and Builder footprints are unchanged, and no other workstream's footprint moved.

### The footprint guards — RESOLVED (`77bae306`)

**Root cause, verified independently.** The four guards run `git diff --name-only
origin/master...HEAD` and assert every changed file starts with `SLICE_FOOTPRINT`
(`mastery/tests/facts_support.py`). Exactly **seven** of the branch's 17 changed files fell outside
it: `mastery/provenance/{canonical_patch,certified_provenance}.py`,
`mastery/synthesis/{applied_chain,errors,preflight,service}.py` and the root file
`test_ranked_mastery_applied_chain.py`. Not one of them is a boundary violation — `SLICE_FOOTPRINT`
was written as the union of the Mastery redesign slices and the Ranked Admin Builder, and it
**predates `mastery/synthesis/` and `mastery/provenance/` entirely**. The guards were never told the
production generator package exists.

**Fix — the smallest one that keeps the guards honest.** A third named workstream footprint,
`GR1_FOOTPRINT`, declared alongside the other two rather than widening either of them:

- `GR1_PACKAGES = ("mastery/provenance/", "mastery/synthesis/")`
- `GR1_RUNTIME_FILES = ("test_ranked_mastery_applied_chain.py",)`
- `SLICE_FOOTPRINT` becomes the union of **four** lists.

Nothing was weakened. `BANNED_PREFIXES` is byte-identical and `ALLOWED_UNDER_BANNED_PREFIXES` is
**unchanged** — GR1 touches no banned prefix at all, which is itself the evidence.
`test_footprint_guard_split.py` now runs its non-overlap guard **pairwise over all three**
workstreams, checks the shared file against all three, and pins `GR1_PACKAGES` and
`GR1_RUNTIME_FILES` by **exact set equality**, so any later growth of GR1's allowance is a
deliberate, reviewable edit and never a quiet one. Neither the Mastery nor the Builder footprint
gained a single entry, and no product behaviour was changed to satisfy a test.

**Result: 166 passed, 0 failed** across the four guards and the split test.

### The remaining 3 failures are pre-existing — proven, not asserted

A clean detached worktree at `origin/master` (with the same `lol_calc.db`) fails **8**:
2 x `test_audit_db`, 5 x `test_cross_check_db`, and the stale
`ranked_modern`/`ranked_points_v2` expectation in `test_phase4f`. The branch fails **3** — the
`test_audit_db` pair and the `test_phase4f` expectation. The 5 `test_cross_check_db` failures are
**resolved by Phase 2 without changing a value**. The branch's failure set is a strict subset of
the baseline's: **zero introduced.**

> A fresh worktree auto-creates an empty stub `lol_calc.db` and fails 85. The baseline was only
> valid once its `lol_calc.db` was symlinked to the primary checkout's. Do not compare against an
> unlinked worktree.

### Historical identities — untouched, deliberately

Syndra R and Maokai Q keep their legacy `SourceBinding` provenance labels. Correcting them would
move the pinned `mastery_set_id` of the `first_ahri_syndra` artifacts (78 tests). No
re-certification and no historical-ID migration was performed. Owner decision 6 below stands open.

**(Superseded — kept for history.) 4 of those 7 were branch-footprint guards, and they were
structural.** The Mastery isolation
guards run `git diff origin/master...HEAD` and assert every changed file falls inside
`SLICE_FOOTPRINT` (`mastery/tests/facts_support.py`); they **skip when nothing is committed**,
so they pass on a dirty tree and fail once you commit. That footprint belongs to the Mastery
redesign slices and the Ranked Admin Builder — it **predates `mastery/synthesis/`**, the
production generator package that is GR1's whole subject. Proven on the clean baseline worktree:
a one-line commit touching only `mastery/synthesis/service.py` fails all four identically, while
one touching only `ranked_public/readiness.py` passes. **They were not widened** — doing so
silently would be another workstream's boundary moved to suit this one. See Phase 2 doc §11 item 7.

The other 3 are **pre-existing and unrelated**, and are a strict subset of the original 8:
2 × `test_audit_db` (the audit's "needs triage" pair) and the stale `ranked_modern` vs
`ranked_points_v2` expectation. The 5 certified-vs-DB failures are resolved **without changing a
value**. The 61 ranked failures are pre-existing on clean master too — mostly a stale
`create_bot_match(difficulty=…)` signature — and are out of scope. Nothing is hidden.

Failure **sets** were diffed against a clean baseline worktree, not totals, per project rule.

## Unresolved (need owner/admin access, or an owner decision)

1. Does **production** have a `target='public'` format row? (Admin API returned **403**.) *Open.*
2. Is `RANKED_MASTERY_SLICES_ENABLED` set in production? Are the modern capability flags set? *Open.*
3. Has an admin-bot Mastery Slice match ever been played in production? *Open.*
4. ~~For each certified-vs-DB divergence, which store wins?~~ **ANSWERED by measurement:** the
   certified Python wins in all six cases, production agrees with it, and the local DB is stale.
5. **Should a Ranked Mastery answer pay quiz XP, streak and category progress?** Phase 4 records
   the attempt but applies **none** of them (`apply_progress=False`), because Ranked already pays
   Elo and changing the XP rules was explicitly out of that phase's scope. It is one argument
   away if the owner wants it. *Open — owner decision.*
6. **Should `time_taken_ms` be recorded on a generated attempt?** It is `NULL` today. Per-challenge
   response time with reveal compensation is derived by `segment_flow` at RESOLVE, not at submit,
   and moving the attempt write to resolve time would forfeit the first-write idempotency
   guarantee that makes duplicates structurally impossible. *Open — needs a design call, not just
   a yes.*
7. **Should `difficulty` be frozen onto the step so attempts can carry it?** It is `NULL` today
   because `difficulty_class` exists on every candidate but not on the frozen step. This is the
   same data the largest open composition lever needs (difficulty as a composition input), so the
   two belong in one phase. *Open.*
5. Should `mastery_slice` enter a public format at all, and in which mode? *Open — the single
   largest remaining decision. Phase 5 gives an operator everything needed to answer it by
   looking: run any subject, see the real questions, read the coverage.*
8. **NEW — should the Phase 5 branches be pushed?** Both targets auto-deploy (`origin/master`
   → Railway; `origin/main` → what Lovable publishes from, and a push alone does not publish).
   The commands are in the Commits section above. *Open — owner action.*
6. **NEW — owner decision.** Syndra R and Maokai Q carry correct values under a `SourceBinding`
   that names the superseded spreadsheet. Correcting the label changes the pinned `mastery_set_id`
   of the legacy `first_ahri_syndra` artifacts (78 tests fail). Re-certify and re-pin, or leave
   labelled? The checker reports it either way.
7. **NEW — owner decision.** `SLICE_PATCH_DESCRIPTOR`'s machine revision fields are still pinned
   literals and are the certified-adapter registration key. Re-sourcing them moves
   `patch_key_digest` and breaks adapter routing — that is a re-certification pass.
8. **NEW — operator action.** Three abilities cite a newer wiki revision in `champion_abilities`
   than the cooldown artifact does. Remedy is mechanical: re-run
   `scripts/dc1_ability_semantic_audit.py` (live wiki requests; rewrites a committed artifact).
9. **NEW — data.** Camille W and Kalista E disagree between `champion_abilities` and the wiki
   authority. Now reported; the projection already refuses to certify them. CHAMPDATA lane item.
10. ~~**Four Mastery branch-footprint guards fail on any branch that touches
    `mastery/synthesis/`.**~~ **RESOLVED in `77bae306`** — a third named `GR1_FOOTPRINT` tuple was
    added the way `RANKED_BUILDER_FOOTPRINT` was, pinned by exact set equality. Full reasoning in
    "The footprint guards — RESOLVED" above. No other workstream's boundary moved.
11. **housekeeping.** This handoff, the Phase 1 audit, `docs/audits/` and the Phase 2 and Phase 3
    docs are all **untracked** in `mogsy`. Phases 2 and 3 kept that convention rather than committing
    the set unilaterally. Committing them is an owner call.
12. **NEW — owner decision, blocks Applied-chain expansion.** Widen the 6-champion certified slice by
    hand (linear, safe, keeps Phase 2's provenance guarantee), or source the applied-chain generator
    from canonical `champion_ability_formulas` / `champion_stats` (roster-wide in one step, but it
    becomes a second consumer of canonical ability formulas and inherits CHAMPDATA's open defects —
    including the AD-ratio *kind* gap pass 6D found, which would produce wrong answers rather than
    refusing). Full reasoning: Phase 3 doc §9. **The canonical route is not available until the
    ratio-kind field is canonical and CHAMPDATA's confirmed defects are closed for the abilities in
    scope** — both CHAMPDATA lane items, not GR1's.
13. **NEW — serving policy.** `champion_base_stat` is rejected for **atomic** recall roster-wide as
    `family_unmapped`, so Champion Mastery diversity is capped at three categories and a genuinely
    diverse part of the bank is unservable. (It IS eligible as a **comparison**, which is why Matchup
    uses it.) Mapping the family is a serving-policy decision with its own owner; Phase 3 measured it
    and did not touch it.
14. **NEW — data.** `Ohmwrecker (Turret Item)` sits in the canonical penetration item pool (0 AD,
    30% armour pen) and is offered as a champion applied-chain scenario. It survives Phase 3's
    mechanic collapse because its derivation is genuinely unique. An `item_canonical` classification
    question, not a composition one.

## GR1 Phase 2 is COMPLETE and MERGED

Reconciled against `origin/master` @ `705cdefe` — no concurrent overlap existed. Guards resolved
without weakening them. Historical `mastery_set_id`s untouched. Branch
`gr1/phase2-source-authority` @ `77bae306` is **on `origin/master`** — the owner performed the
merge. Nothing further is outstanding for Phase 2.

## GR1 Phase 3 is COMPLETE

Reconciled against `origin/master` @ **`db709873`** — upstream moved ten JQ1 commits with **zero
file overlap**; rebased onto them anyway and re-verified, with a **byte-identical** composition
probe before and after. Verification clean by failure-**set** comparison against a clean baseline
worktree: **zero regressions introduced**. Branch `gr1/phase3-generator-quality` @ **`b499d80f`**
is **pushed to `origin`** and is a clean **fast-forward** onto `master`.

**What Phase 3 changed, in one line each:** a short Champion slice spans every category the champion
has instead of being all cooldowns (503/519 → 211/519 roster-wide); a Matchup slice leads with
comparisons in the sequence as well as the budget; applied-chain no longer publishes one arithmetic
problem four times, and its prompt now states the item bonus AD the answer depends on; and one
shared invariant module states what makes any of the three generators' output a usable question.

### ONE OWNER ACTION REMAINS — the merge to `master`

The final `git push origin gr1/phase3-generator-quality:master` was **not performed**: pushing
`master` auto-deploys to production, and the agent session's safety classifier blocks that push.
The merge is otherwise ready and requires no rebase, no conflict resolution and no further review.

**Phase 3 is already merged** — `origin/master` contained `b499d80f`. The command below is the
**Phase 4** one.

```bash
git -C /Users/macmoney/lcs-wt-gr1p4 push origin gr1/phase4-artifact-persistence:master
```

Or open the PR: `gr1/phase4-artifact-persistence` → `master`. Either way it is a fast-forward of
one commit (`ed254ca6`).

**What deploying Phase 4 actually changes in production.** No visual, no wire field and no
mechanic: the public segment payload is pinned at its pre-phase six keys by a test. Two things
start happening, both invisible to a player:

* every `mastery_slice` segment opened from now on freezes a `mastery_artifact` block into its
  private payload (a few hundred bytes on the round row);
* every challenge answered by a real account in one of those segments writes one
  `quiz_attempts` row with `source='ranked_mastery'` — **no XP, no streak, no category
  progress, no achievements**.

Because no public Ranked format names `mastery_slice` and all 29 stored configs are
`target='admin_bot'`, that means admin-bot matches only, today. **Zero DDL**, so there is no
migration to run and nothing to sequence: `quiz_attempts` v2 is already live in production, and
`segment_private_json` is JSON. Segments frozen before the deploy are unaffected — every reader
treats a missing block as "predates the contract".

**(Superseded — kept for history: the Phase 3 owner command was
`git -C /Users/macmoney/lcs-wt-gr1p3 push origin gr1/phase3-generator-quality:master`.)**

**What deploying actually changes in production:** nothing a player can currently reach, because no
public Ranked format names `mastery_slice` (fact 1 above) and all 29 stored Mastery-Slice format rows
are `target='admin_bot'`. For those admin-bot matches the behavioural delta is real and is the point:
a generated Champion slice draws from every category the champion has instead of only cooldowns, a
Matchup slice never opens on single-champion recall, and an applied-chain request beyond 14 questions
is refused instead of served with a repeat. Generated `mastery_set_id`s and `artifact_digest`s move
for Champion and Matchup, because the composition they identify changed — that is correct, and no
historical or hand-authored artifact identity is affected (the applied-chain prompt change moves no
identity at all, since prompt text is not in `identity_material`).

## Next task

**GR1 Phase 5 — not yet scoped.** (Phase 4 is done; see below.)

**Superseded note, kept for history — GR1 Phase 4 — not yet scoped.** The generators now compose sensibly and the foundation under them
is trustworthy. Still untouched, each needing its own phase: public Ranked rotation, Admin Quiz
Review support, `quiz_attempts` integration, user history, and visuals.

**Before anything else:** confirm whether the owner has merged
`gr1/phase4-artifact-persistence` into `master` (the owner command is at the end of this file).
Phase 3 is already merged — `origin/master` contained `b499d80f`. Pushing to `master`
auto-deploys to production.

The two open **generator** items, in priority order:

1. **Difficulty is not a composition input.** `difficulty_class` is on every candidate and
   `SelectionRequest` can already filter on it; nothing does, so a slice has no easy→hard
   progression. This is the largest untaken composition lever and it needs no new data.
2. **The Applied-chain generalization decision** — see Phase 3 doc §9. Coverage is gated by the
   6-champion certified slice, not by the generic chain code. Widening it by hand is linear and safe;
   sourcing the chain from canonical data is roster-wide in one step but makes applied-chain a second
   consumer of canonical ability formulas and **cannot be done until the AD-ratio *kind* is canonical
   and CHAMPDATA's confirmed defects are closed for the abilities in scope**. Owner decision 12 below.
   Phase 3 built nothing toward either.

Also open, and not GR1's to decide: **`champion_base_stat` is unservable as atomic recall**
roster-wide (`family_unmapped`), which caps Champion diversity at three categories. Owner decision 13.
