# Ranked `mastery_slice` — Current-State Audit

**Audit date:** 2026-09-11
**Type:** Discovery / audit only. Nothing was implemented, refactored, fixed, migrated or deleted.
**Authority:** the repositories at the commits below, the live canonical database, and observed runtime behaviour. Handoff documents and historical notes were treated as claims to verify, never as ground truth.

---

## 0. Provenance of this audit

### 0.1 What was audited

| | Repo | Branch audited | Commit | Why this branch |
|---|---|---|---|---|
| Backend | `/Users/macmoney/League_Combat_Simulator` | `origin/master` | `11c96ab0e3ceb75753ef5cbbe082dc0a9f9251d7` | `master` is the auto-deploying production branch |
| Frontend | `/Users/macmoney/mogsy` | `origin/main` | `7d7de64379a023a5f977b8c4964d241f4b2e868c` | `main` is what Lovable publishes from |

Both were audited in **fresh read-only worktrees** created for this task, so no active branch or uncommitted work was touched:

- `/Users/macmoney/lcs-wt-audit-mastery` (detached at `11c96ab0`)
- `/Users/macmoney/mogsy-wt-audit-mastery` (detached at `7d7de643`)

### 0.2 The primary checkouts are BOTH stale and dirty — read this first

This is the first finding of the audit, because it invalidates any conclusion drawn by reading the working copies.

| Repo | Checked-out branch | Dirty? | Position vs. production branch |
|---|---|---|---|
| Backend | `live1/phase4b1-match-context` @ `28bf2ee4` | **Yes — 124 changed files** | **628 behind** / 20 ahead of `origin/master` |
| Frontend | `main` @ `e12f5900` | **Yes — 20 changed files** | **66 behind** / 3 ahead of `origin/main` |

The backend working copy's 20 "ahead" commits are the physical-penetration Mastery work, and that work **is already on master under different hashes** (`b0a728ba` "certified physical-damage + armor-penetration calc chain", `47a22662` "certify physical-penetration operation for capsule extraction"). The checked-out branch is a superseded leftover, not pending work.

The frontend working copy is missing the two most recent and most relevant commits on `origin/main`:

- `4b80c4f2` — *"refactor(admin): the Mastery slot configures a generator, not a static set"*
- `7d7de643` — *"refactor(dev): the Mastery dev launcher plays any generated set, not two"*

**Consequence:** anyone reading `/Users/macmoney/mogsy` or `/Users/macmoney/League_Combat_Simulator` directly today is looking at a pre-retirement world. All statements in this document come from the audit worktrees.

### 0.3 What could NOT be audited, and why

| Unresolved | Reason |
|---|---|
| Production's `ranked_format_configs` rows | Admin API requires a key not present in this environment (`/api/admin/db/status` → **403**). Local dev DB used instead, clearly labelled. |
| Production's `RANKED_MASTERY_SLICES_ENABLED` / capability flags | Server env not readable without admin access. |
| A live Ranked match rendering a `mastery_slice` segment | Match creation requires a real Supabase JWT; there is no bypass. See §9.3 for what was captured instead. |
| Admin Quiz Review UI | `/admin/ranked` and `/admin/quiz-content` are `AdminRoute`-gated and redirect to `/` unauthenticated. Answered by **executing the backend query instead** (§10), which is stronger evidence than a screenshot. |

---

## A. Executive current-state summary

`mastery_slice.v1` is a **runtime carrier**, not a content source. It is a registered Ranked module that, when a segment opens, calls one of **three generators** named by `module_config.mastery_mode`, freezes the resulting questions onto the round row, and renders them through the Ranked arena.

The static Mastery Set catalog (`COMPATIBLE_MASTERY_SETS`) that used to be a fourth shape **has been deleted** (workstream MC1, the newest work on master). Every selectable mode is now generator-backed.

**The three historical names are still the correct names** — Champion Mastery, Matchup Mastery and applied-chain all exist as distinct, reachable modes. But they are *not* three peer systems: two share one pipeline and one is architecturally separate (§N.4).

| System/type | Exists | Reachable where | Generator | Source authority | Patch-safe? | User renderer | Admin visibility | Status |
|---|---|---|---|---|---|---|---|---|
| **Champion Mastery** (`mastery_mode: champion`) | Yes | Ranked segment (config only); `/dev/mastery-generated`; admin preview API | `mastery.synthesis.service.synthesize_champion_mastery` | Canonical DB (`champion_stats`, `champion_abilities`) **+ a repo-committed JSON cooldown fixture** | **Partial** — patch identity is data-derived, but the cooldown fixture is a frozen month-old snapshot that fails *open* | `AtomicRecallQuestionView` (structural path) | **Invisible** | Production-capable, 173/173 champions |
| **Matchup Mastery** (`mastery_mode: matchup`) | Yes | Same as above | `synthesize_matchup_mastery` | Same as Champion, plus the Matchup Composer | **Partial** — identical to Champion | `ComparisonQuestionView` (structural path) | **Invisible** | Production-capable, 14,878 pairs |
| **Applied chain** (`mastery_mode: applied_chain`) | Yes | Ranked segment; **the only mode any saved format actually names**; admin preview API | `mastery.synthesis.applied_chain.synthesize_applied_chain_mastery` | **Hand-authored Python constants** (`mastery/data/*.py`) + `item_canonical` | **No** — stamped with a hardcoded "League 26.13" patch constant | **Prose path** → `InteractiveScenarioSurface` | **Invisible** | Works, but ceiling is 15 subjects |
| **SSM "Ranked mastery slices"** (`ranked_public/mastery_slices.py`) | Yes | Overrides ordinary `quiz` rounds; flag-gated **off by default** | Summoner-spell curriculum decorator | `mastery/chains/summoner_spell_mastery.py` | n/a (static curriculum) | Ordinary quiz renderer | **Visible — 56 rows, and the ONLY thing Admin Review calls "mastery"** | Live-capable but fail-closed OFF |
| Static Mastery Sets (`mastery_set_id`) | **No — deleted** | — | — | — | — | — | — | **Retired**; refused by the validator, decoded on read |

**The five headline findings**

1. **Public Ranked does not serve `mastery_slice` at all.** No built-in format names it (§7.1). The registry's own comment saying "no format's segment_pattern names it" is however **incomplete** — a *saved* format does (finding 2).
2. **The only saved Ranked format in the database is a Mastery Slice**, and it is still written in the **retired** `mastery_set_id` spelling. It survives only because a compatibility decoder rewrites it on read into applied-chain (Jarvan Q vs Olaf). §7.2.
3. **A frozen JSON file is load-bearing for Champion/Matchup content, and it fails open.** Proven by experiment: removing it silently changes which questions generate, with no error. §3.2.
4. **Short slices are ~97% cooldown questions** — not from a data gap (the bank is diverse) but from curriculum ordering. §5.4.
5. **Two stores disagree today about the same champions the applied chain uses**, and the tests that would catch it are currently red. §4.5.

---

## B. Architecture diagram

```
                        ┌─────────────────────── DATA AUTHORITIES ───────────────────────┐
                        │                                                                 │
   champion_stats ──────┤                                       mastery/data/*.py         │
   champion_abilities ──┤  (canonical SQLite)                   (6 hand-authored          │
   champion_ability_    │                                        CERTIFIED_CHAMPIONS)     │
     formulas ──────────┤                                                │                │
                        │  fixtures/dc1_phase2f_cooldown_        item_canonical           │
                        │  authority.json  (FROZEN, fails open)  (17 penetration items)   │
                        └────────┬───────────────────────────────────────┬────────────────┘
                                 │                                       │
                    ┌────────────▼───────────┐              ┌────────────▼──────────────┐
                    │ facts.projection       │              │ chains/physical_          │
                    │  → knowledge.bank      │              │   penetration_set         │
                    │  → matchup.composer    │              │  → ranked_capsules.extract│
                    │  → publication_gate    │              │  → questions/…_rendering  │
                    │     .publish()         │              │  (NO publication gate)    │
                    └────────────┬───────────┘              └────────────┬──────────────┘
                                 │                                       │
                       synthesize_champion_mastery              synthesize_applied_
                       synthesize_matchup_mastery                 chain_mastery
                                 └───────────────┬───────────────────────┘
                                                 ▼
                                        PublishedArtifact
                                                 │
   ranked_format_configs ──► format_config.load  │   (retired_mastery_sets decodes
     (saved config)            /config_for_       │    legacy mastery_set_id here)
                                creation ─────────┤
                                                 ▼
                              ranked_modules/mastery_slice.py  ── MasterySliceModule
                                    .generate_segment(conn, config, challenge_count)
                                                 │
                             ┌───────────────────┴────────────────────┐
                             ▼                                        ▼
                  public_payload (no answers)              private_payload (answers +
                  + presentation blob                       canonical_ref, server-only)
                             │                                        │
                             └──────────► FROZEN onto ranked_rounds ◄─┘
                                  segment_payload_json / segment_private_json
                                                 │
                       ┌─────────────────────────┼─────────────────────────┐
                       ▼                         ▼                         ▼
              masterySliceModule.tsx      challenge_is_correct      ranked_segment_
              renderPathFor(challenge)    → evaluate_answer          challenges
                       │                   (frozen payload)          (player choices)
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  AtomicRecall   Comparison      InteractiveScenarioSurface
  QuestionView   QuestionView    (prose — applied chain lands here)

  ✗ NOTHING on this path writes to quiz_attempts.
  ✗ NOTHING on this path appears in Admin Quiz Review.
```

---

## C. Detailed dossier per generator

### C.1 The config contract (the one authority)

`ranked_modules/mastery_config.py` is deliberately dependency-free and is the single parser used by all four call sites (schema validator, readiness, generation, admin builder).

```python
MODE_CHAMPION      = "champion"       # {"mastery_mode":"champion","champion_id":"zed"}
MODE_MATCHUP       = "matchup"        # {"mastery_mode":"matchup","champion_a_id":"jinx","champion_b_id":"kaisa"}
MODE_APPLIED_CHAIN = "applied_chain"  # {"mastery_mode":"applied_chain","attacker_champion_id":"jarvan",
                                      #  "ability_key":"Q","target_champion_id":"olaf"}
```

- Unknown keys per mode are refused (`_ALLOWED_KEYS`, lines 99–104).
- `mastery_set_id` and `allowed_variants` are **refused with a message naming the replacement modes** (`_reject_retired_keys`, lines 176–199).
- Mirror matchups are refused at save time (lines 243–249).
- Question count is **never** in `module_config` — it is `SegmentSpec.challenge_count`.
- `MIN_CHALLENGE_COUNT = 2` (`ranked_modules/mastery_slice.py:118`): a 1-question slice is configurable but unservable, because the service routes `challenge_count == 1` down a quiz-shaped path this module does not produce.

### C.2 Champion Mastery

**Entry:** `mastery/synthesis/service.py::synthesize_champion_mastery` (lines 60–110)

```
roster-backed identity  (mastery.identity.get_identity_registry)
  → project_champion    (mastery/facts/projection.py)
  → build_bank          (mastery/knowledge/bank.py)
  → eligible_candidates (mastery/publication_gate/gate.py)
  → dedupe_by_effective_question
  → recipe.synthesize_champion_manifest   (champion-agnostic; contains no champion name)
  → publish()                             (gate; performs NO database writes)
  → PublishedArtifact
```

**Verified live** (real generation against the canonical DB):

```
manifest_id : generated.champion.ahri
set_id      : mset_257d9ae608fd9153e7d5c02f14c3e0892c2b07182310f8c06bd26d13de8a2298
digest      : martifact_7dec4a…       patch_key : patchkey_5625d14…
steps       : 3
 [0] ability_cooldown  ability_cooldown_rank:Ahri:W:r4  → "6"   (phase=recall_ability_cooldown)
 [1] ability_cooldown  ability_cooldown_flat:Ahri:E     → "12"
 [2] ability_cooldown  ability_cooldown_rank:Ahri:W:r5  → "5"
```

**A note on the `prompt` field.** The artifact's `prompt` is a terse internal label — `"Ahri W — ability_cooldown"` — and steps 0 and 2 share it verbatim while having different answers. **This is not a player-facing defect.** For `atomic_recall`, the backend deliberately never sends rendered prose; the frontend builds the sentence from `prompt_semantics` (`formatPromptSemantics.ts`). The rank *is* carried (`context.ability_rank: 4` / `5`) and *is* rendered. Confirmed on screen:

> *"At rank 4, what is Ahri W's cooldown, in seconds?"*

### C.3 Matchup Mastery

**Entry:** `synthesize_matchup_mastery` (lines 113–160).

Two behaviours worth recording, both verified:

1. **Order-independent identity.** `(maokai, gragas)` produced `generated.matchup.gragas.maokai` — the pair is normalised, so swapping presentation order yields the identical artifact and answer.
2. **The candidate universe is NOT only comparisons.** Lines 148–153 build `universe = bank.candidates + atomic candidates of BOTH champions`. A "Matchup" slice can therefore legitimately contain single-champion recall questions.

**Verified live:**

```
generated.matchup.ahri.syndra  (3 steps, all comparisons in this sample)
 [0] ability_cooldown_compare:Ahri:R:vs:Syndra:R:r1 → "syndra"
     "Ahri R: 140 seconds. Syndra R: 120 seconds. Syndra wins by 20 seconds."
generated.matchup.jinx.kaisa   → jinx / kaisa / tie
generated.matchup.gragas.maokai
```

Ties are a real third option (`('ahri','syndra','tie')`), not an error case.

### C.4 Applied chain — architecturally the odd one out

**Entry:** `mastery/synthesis/applied_chain.py::synthesize_applied_chain_mastery` (lines 226–320).

Four structural differences from the other two — all confirmed by reading the code path:

1. **It does not use the publication gate.** It constructs `PublishedArtifact(...)` directly and sets **`is_prototype=True`** (line 318). Champion/Matchup go through `publish()`.
2. **It ignores the injected `conn`** (documented at lines 235–239); the certified chain opens its own read-only canonical connection.
3. **Its subject space is bounded by hand-authored Python**, not the roster.
4. **Its patch identity is a hardcoded constant** (§3.3).

**Generation policy constants** (these are policy, not content, but they are fixed):

- `SCENARIO_LEVEL = 11` — both sides are always read at level 11.
- Ability rank = highest legal at level 11 under the skill-point rule (`scenario_ability_rank`), never a literal.
- Items are chosen by **alternating flat-lethality and percent-penetration** in canonical-name order (`scenario_items`), so a 2-question set always shows both mechanics.

**Verified live:**

```
generated.applied_chain.physical_penetration.jarvan.Q.olaf      patch_key: patchkey_0784955…
 [0] post_mitigation_single_type_damage   phase="Axiom Arc"
     "Jarvan IV is level 11 with Dragon Strike rank 5 and an Axiom Arc (18 lethality).
      Jarvan IV hits a level-11 Olaf (71.855 Armor) with Dragon Strike.
      How much damage does Olaf take after Armor and penetration?"
     options ('145','192','214','330')  correct '214'
     "Raw Dragon Strike damage is 329.75. Olaf's level-11 Armor is 71.855; the Axiom Arc's
      18 lethality reduces it to 53.855 effective Armor (percent penetration applied before flat)…"
 [1] phase="Last Whisper"  (18% armor pen)  correct '176'
```

Unlike Champion/Matchup, this prompt is **finished prose**, carries no `prompt_semantics`, and therefore takes the frontend's **prose** render path.

---

## D. Source-of-truth matrix

| Value | Ultimate authority | Kind | Read dynamically? | Patch-fragile? | What catches drift |
|---|---|---|---|---|---|
| Champion base stats (hp, ad, armor, mr, regen, ms, range…) | `champion_stats` table | Canonical SQLite | Yes | Low | `projection_patch_key` changes when `source_revisions` change |
| Roster / identity / aliases | `quiz.roster_contract.supported_roster` → 173 champions | Canonical | Yes | Low | `test_identity_roster_coverage.py` |
| **Ability cooldowns (rank series, shape, staticness)** | **`fixtures/dc1_phase2f_cooldown_authority.json`** | **Repo-committed JSON, frozen** | Yes (file read, cached) | **HIGH** | **Nothing.** Fails open — see §3.2 |
| Ability rows / cost denomination / haste applicability | `champion_abilities` via `quiz.ability_question_eligibility` | Canonical | Yes | Medium | Partially, via `projection_patch_key` |
| Ability resource costs | `champion_abilities` | Canonical | Yes | Medium | As above |
| Level scaling curve | `champion_stat_profile.riot_level_multiplier` | Code | Yes | Low | `test_champion_facts_*` |
| **Applied-chain ability damage, ratios, ranks, costs, cooldowns** | **`mastery/data/{ahri,syndra,lux,jarvan,maokai,olaf}.py`** | **Hand-authored Python constants** | No — imported | **HIGH** | `mastery/tests/test_cross_check_db.py` — **currently RED** (§4.5) |
| Target champion Armor-at-level | Same 6 Python modules | Hand-authored | No | HIGH | As above |
| Penetration items (lethality / armor-pen %) | `item_canonical` (validated-current rows) | Canonical | Yes | Low | — |
| **Applied-chain patch identity** | **`mastery/data/slice_patch.py` — a Python literal** | **Hardcoded** | No | **HIGH** | **Nothing** (§3.3) |
| Champion/Matchup patch identity | Derived from observed store revisions + fixture revision span | Computed | Yes | Low | Self-detecting by construction |
| Ability display name + icon (presentation) | `champion_abilities` + asset tree via `quiz.presentation_contract` | Canonical, server-side | Yes | Low | Fail-closed renderer |
| SSM summoner-spell curriculum | `mastery/chains/summoner_spell_mastery.py` | Hand-authored Python | No | Medium | `test_summoner_spell_mastery.py` |

### D.1 The cooldown fixture — evidence

`mastery/facts/sources.py:57`

```python
COOLDOWN_AUTHORITY_PATH = REPO_ROOT / "fixtures" / "dc1_phase2f_cooldown_authority.json"
```

Provenance block inside the file:

```
abilities_audited : 688          champions : 172        (roster is 173)
authority_host    : wiki.leagueoflegends.com
derived_from      : DC1 Phase 2F ability_semantic_inventory.json
source_sha256     : 518a4dac0b3bcce2566da84870f42aec57eb307c3517e65a8faa3b3a9b794626
```

Last committed **2026-08-09** (`b8ebbff6`). Shapes: `RANK_PROGRESSION` 493, `RANK_INVARIANT` 156, `STATIC` 13, plus 26 held shapes.

**There is no patch or game-version field anywhere in the file.** Its freshness is unknowable from its own contents.

**It fails open.** `sources.py:307–311`:

```python
try:
    raw = json.loads(Path(key).read_text(encoding="utf-8"))
except (OSError, ValueError):
    _AUTHORITY_CACHE[key] = {}        # ← missing/corrupt file == empty authority
    return _AUTHORITY_CACHE[key]
```

**Experiment (in-memory only; no file was modified):**

| Condition | Ahri, 5 questions requested |
|---|---|
| With fixture | `W:r4`→6, `E:flat`→12, `W:r5`→5, `Q:flat`→7, `R:r1`→140 |
| Fixture path redirected to a nonexistent file | `Q:flat`→7, `R:r1`→140, `E:flat`→12, `R:r2`→120, `R:r3`→100 |

The W rank-progression questions **silently disappear** and different questions take their place. No exception, no log line, no readiness failure. A deployment that lost or stale-shipped this file would keep serving Mastery — quietly, with different and fewer questions.

### D.2 The applied-chain patch constant — evidence

`mastery/data/slice_patch.py` is a Python literal whose docstring states the values were copied verbatim from DB rows during an earlier phase:

```python
SLICE_PATCH_DESCRIPTOR = CompositePatchDescriptor(
    game_patch_display       = "Mixed verified snapshot — League 26.13 context",
    ddragon_version          = "16.12.1",
    champion_stats_revision  = "Champions@2026-05-23T09:14:42",
    ability_formula_revision = "Champions@2026-05-31T06:52:52",
    item_revision            = "wiki-itemdata-rev-4041705@2026-07-14",
    item_cost_revision       = "Items@2026-05-29T01:14:02",
    provenance_status        = ProvenanceStatus.MIXED_SNAPSHOT.value,
)
```

Confirmed at runtime that this is what applied-chain artifacts carry:

```
SLICE_PATCH_KEY_DIGEST                       = patchkey_0784955b687f1dd1…
applied-chain artifact patch_key_digest      = patchkey_0784955…   ← identical
champion-mastery artifact patch_key_digest   = patchkey_5625d14…   ← data-derived
champion-mastery patch_display               = ''                  (empty)
```

By contrast `mastery/facts/projection.py:274–299` computes the Champion/Matchup key from `load_source_revisions(conn)` plus the authority's revision span — so that one genuinely moves when the data moves.

**Net:** applied-chain questions are stamped, permanently, with a patch identity frozen around League 26.13. It is a literal; no patch pipeline can update it. `patch_display` for Champion/Matchup is simply empty.

---

## E. Current generator inventory

### E.1 Modes

| Mode | Generator | Subject space | Questions per subject | Gate | Prototype flag |
|---|---|---|---|---|---|
| `champion` | `synthesize_champion_mastery` | **173** champions | min 19, median 40, max 54 | publication gate | no |
| `matchup` | `synthesize_matchup_mastery` | **14,878** ordered-insensitive pairs | comparisons + both banks | publication gate | no |
| `applied_chain` | `synthesize_applied_chain_mastery` | **15** | ≤ **17** (one per penetration item) | **none** | **`is_prototype=True`** |

**Champion Mastery capacity, measured over the whole roster:** all 173 champions project successfully; **6,690** eligible, deduped, publishable candidates in total; no champion has fewer than 3.

### E.2 Applied-chain coverage is data, but very small data

```
certified attacker abilities : (('jarvan','Q'), ('jarvan','R'), ('olaf','Q'))
certified targets            : ('ahri','jarvan','lux','maokai','olaf','syndra')
subjects (target != attacker): 15
penetration items            : 17
theoretical question ceiling : 255
```

The 17 items come from `item_canonical` and are genuinely dynamic. The 3 abilities and 6 targets come from `mastery/data/*.py` and are hand-authored.

**Anomaly:** `Ohmwrecker (Turret Item)` (30% armor pen) is in the penetration item pool and is therefore a legal scenario item, despite not being a champion build item.

### E.3 Hand-authored chain modules (`mastery/chains/`)

`first_ahri_syndra.py`, `haste.py`, `jarvan_cooldown_progression.py`, `jarvan_progression.py`, `lux_cooldown_progression.py`, `lux_progression.py`, `maokai_progression.py`, `olaf_cooldown_mana_progression.py`, `olaf_progression.py`, **`physical_penetration_set.py`**, `summoner_spell_mastery.py`, `syndra_branching.py`, `syndra_progression.py`, `timeline.py`.

Of these, only **two** are reachable from a Ranked `mastery_slice` today:
- `physical_penetration_set.py` — via `applied_chain`.
- `summoner_spell_mastery.py` — via the *separate* SSM decorator (§J.2), **not** via `mastery_slice`.

The remaining 12 are certified calculation modules and progression fixtures with no `mastery_slice` route. See §K.

---

## F. Ranked integration map

### F.1 Built-in formats — proven by executing the factories

| Format | Segments | Contains `mastery_slice`? |
|---|---|---|
| `ranked_points_v2` (**the production default**) | 10: 8×`quiz.v2`, 2×`item_cost_duel.v5` | **No** |
| `ranked_modern` | 12: 10×`quiz.v1`, 2×`item_cost_duel.v4` | **No** |
| `ranked_legacy_quiz` | 1×`quiz.v1` | **No** |

`_format_from_ladder` (`ranked_public/service.py:482`) resolves: explicit staff/test format → `ranked_points_v2_format()` → legacy only via `RANKED_MODERN_DEFAULT=0`.

**So a normal public Ranked player cannot currently meet a Mastery Slice.**

### F.2 The saved format — the one place it IS reachable

`ranked_format_configs` holds **29 rows, all `target='admin_bot'`, zero `target='public'`.** The newest (revision 29, saved 2026-09-11) is:

```json
{"module_id":"mastery_slice","module_version":1,"challenge_count":2,
 "module_config":{"mastery_mode":"mastery_set",
                  "mastery_set_id":"chain.jarvan.physical_penetration",
                  "allowed_variants":["lethality","percent_pen"]}}
```

That is the **retired** spelling — `parse_mastery_slice_config` refuses it outright. It works only because `ranked_formats/retired_mastery_sets.py` decodes it on the stored-config read path. Executing the real read path confirms:

```
target admin_bot → mastery_slice v1 n=2
   {'mastery_mode':'applied_chain','attacker_champion_id':'jarvan',
    'ability_key':'Q','target_champion_id':'olaf'}
target public    → load_config -> None   (no saved override; falls through to the ladder)
```

**Implications**
- The entire admin-bot Ranked match is **one Mastery Slice of 2 applied-chain questions**.
- `allowed_variants` is **dropped, not translated** (decoder lines 88–92) — the admin's variant narrowing is silently discarded.
- The decode is deliberately *not* in the validator, so the retired id cannot be re-saved; it is translated exactly once, at the stored-bytes boundary.

**This contradicts the module registry's own comment** (`ranked_modules/registry.py`), which states `mastery_slice.v1` is *"REGISTERED but currently UNREACHABLE: no format's segment_pattern names it."* True for built-in formats; **false** for stored configuration, which is what the admin-bot lane actually runs.

### F.3 Generation timing, determinism and freezing

- Generation happens at **segment open**, not format save and not match creation (`generate_segment`). Segments open lazily, so a patch landing mid-match affects only segments not yet reached.
- **`seed` is accepted and never used.** Generation is a pure function of `(module_config, canonical DB, gate/family-policy state)`. Both players get the identical slice — and **so does every future match with the same config.** There is no per-match variation.
- The result is frozen into `ranked_rounds.segment_payload_json` / `segment_private_json`. Every later read — grading, bot answers, resolution, reveal, resume, replay — uses the frozen payload, never a re-publish.

### F.4 Payload split

`public_payload` per challenge: `challenge_index`, `interaction_kind`, `question_family`, `prompt`, `answer_type`, `answer_options`, `prompt_semantics` *or* `comparison_semantics`, and `presentation` (when media resolved). Optional top-level `reveal_window_ms`.

`private_payload` per challenge: `correct_answer`, `explanation`, `answer_options`, `answer_type`, `question_family`, and `canonical_ref`.

`validate_challenge_input` explicitly rejects client-supplied `is_correct`, `correct`, `response_ms`, `response_time_ms`, `submitted_at`.

### F.5 Grading, identity, scoring

- Correctness delegates to `mastery.publication.projections.evaluate_answer` via a minimal `_GradingStep` reconstructed from the frozen private payload. **No second grader exists.**
- `canonical_ref` reuses the **standalone Mastery `candidate_key`** deliberately, so meeting "Ahri W cooldown at rank 4" in Ranked and in Mastery is *one* question, not two. Fail-closed: a step with no key gets no ref rather than a minted one.
- Reveal window: `REVEAL_WINDOW_MS = 1750`, frozen per segment. Absent means no reveal, which keeps pre-reveal segments byte-identical.
- Bot answers are deterministic and seeded; accuracy by difficulty `{easy: 0.45, standard: 0.7, hard: 0.9}`.
- Segment result vocabulary: `win` / `loss` / `draw` / `timeout`.

### F.6 Persistence — what a match actually keeps

| Store | Written | Note |
|---|---|---|
| `ranked_rounds.segment_payload_json` / `segment_private_json` | **Yes** | The frozen questions and answers |
| `ranked_segment_challenges` | **Yes** | `(match_id, round_number, user_id, challenge_index, choice_json, submitted_at)` |
| `ranked_rounds.canonical_question_ref` | **No** | One column, N challenges — refs live per-challenge in the private payload instead |
| **`quiz_attempts`** | **NO** | Verified: `grep "INSERT INTO quiz_attempts"` returns `quiz/record_attempt.py`, `routes/quiz.py`, two demo seeders and `daily_score_attack/service.py`. `ranked_public/` and `ranked_modules/` contain **zero** references to `quiz_attempts`. |

**Consequence:** anything built on `quiz_attempts` — Personal Analytics, Premium analytics, per-question history, streak/attempt reporting — **can never see a Mastery Slice question.** Resetting question-key history does not affect them either.

---

## G. Frontend component map

```
SegmentStateView (wire)
  └─ src/lib/ranked-public/contracts.ts      → MasterySliceChallengeView, MASTERY_SLICE_MODULE_ID
       └─ src/lib/ranked-core/modules/registry.ts
            └─ masterySliceModule.tsx        (456 lines) — the renderer
                 │
                 ├─ renderPathFor(challenge)  ← the WHOLE dispatch rule, exported for testing
                 │     comparison_left_right + comparisonSemantics → "comparison"
                 │     atomic_recall        + promptSemantics      → "atomic_recall"
                 │     otherwise                                   → "prose"
                 │
                 ├─ STRUCTURAL → MasteryQuestionDispatch (features/mastery/interactions/registry.tsx)
                 │     ├─ AtomicRecallQuestionView.tsx   + formatPromptSemantics.ts
                 │     ├─ ComparisonQuestionView.tsx     + comparisonSemantics.ts
                 │     ├─ AtomicRecallRevealView / ComparisonRevealView / MasteryInlineReveal
                 │     └─ media: ScenarioMediaBand  ← scenarioSourceForMasteryChallenge()
                 │
                 └─ PROSE → InteractiveScenarioSurface  (the SAME component a quiz round uses)
                          scenarioSource={null}   ← line 244: prose path gets no media
```

### G.1 Do the three share a renderer?

**Partly — and the split is by *challenge shape*, not by generator.**

| Generator | `interaction_kind` | Path | Component |
|---|---|---|---|
| Champion Mastery | `atomic_recall` | structural | `AtomicRecallQuestionView` |
| Matchup Mastery | `comparison_left_right` | structural | `ComparisonQuestionView` |
| **Applied chain** | *(none)* → `legacy_combat` | **prose** | `InteractiveScenarioSurface` — borrowed from the quiz round |

The dispatch is confirmed by the semantics and not by the kind alone: a structural renderer throws when its semantics are missing, so a challenge only goes there if it actually carries what the renderer needs. Everything else — including an unknown future kind — renders as prose, which always works because `prompt` and `answerOptions` are required fields.

### G.2 Prompt text is built client-side, from data

`formatPromptSemantics.ts` is the single place the atomic-recall sentence is assembled, over a **closed set of six templates**: `ability_cooldown_at_rank`, `ability_cooldown_flat`, `ability_cost_at_rank`, `ability_cost_flat`, `champion_base_stat`, `champion_stat_at_level`. An unknown template throws rather than rendering blank.

**A real cosmetic gap.** `abilityLabel()` is written to render *"Ahri W (Fox-Fire)"*, but suppresses the parenthetical when `ability_name === subjectRef`. The backend sends `ability_name: "W"` — the slot letter — so the parenthetical is **always** suppressed for these questions. The real name is available: the server's own `presentation` block resolves the same premise to `ability_name: "Fox-Fire"`. Net effect: the media band names the ability, the sentence never does. Confirmed on screen — *"At rank 4, what is Ahri W's cooldown, in seconds?"* beside a card reading **ORB OF DECEPTION**.

### G.3 `masterySliceScenario.ts` is current, not legacy

Despite its name and history it is **70 lines that forward the server's blob verbatim** and return `null` when there is none. RR1 Stage 1 moved all media policy server-side into `quiz/presentation_contract.py` + `ranked_public/presentation_render.py`. There is deliberately **no client-side fallback** — re-deriving media locally would restore the second source of truth that change removed. It is imported by `masterySliceModule.tsx:46` and `RankedArenaInspector.tsx:36`.

Server-resolved media, captured live:

```json
"presentation": {"assets": {"subject": {
  "type":"combat_cooldown","champion":"Ahri",
  "champion_icon":"assets/champions/Ahri/icon.png",
  "ability_slot":"W","ability_name":"Fox-Fire",
  "ability_icon":"assets/champions/Ahri/W_AhriW.png",
  "badge":"Champion Mastery","ability_rank":4}},
  "presentation": {"role":"context","timing":"question","spoiler":false}}
```

### G.4 Two very different presentations of the same content

| | Ranked arena | Standalone `/dev/mastery-generated` |
|---|---|---|
| Theme | Dark arena, full combatant frame | **Light, plain document** |
| Media | Splash + ability icon + rank badge | 32px champion portrait only |
| Badge | "CHAMPION MASTERY" | "Fixed scenario" / "RECALL" |
| Reveal | `reveal_window_ms` frozen per segment | Inline, auto-advances |
| `presentation` block | Present | **Absent from the payload entirely** |

The standalone player receives no `presentation` block at all, so the same generated question is materially different to look at depending on where it is served.

---

## H. Admin Quiz Review map

### H.1 Route reality

- `/admin/quiz-review` → redirects to `/admin/quiz-content` (`QuizContentRedirect`), which is `AdminRoute`-gated.
- `/admin/quiz` does not exist (404 — captured).
- `/admin/ranked` redirects to `/` unauthenticated (captured).
- A separate `MasteryReviewerPage` exists at `admin/mastery/:artifactDigest` — a per-artifact reviewer, not a question catalogue.

Because the UI is auth-gated, visibility was answered by **running the backend query that feeds it**, which is stronger evidence than a screenshot.

### H.2 Executed result — `quiz.review_universe.build_universe()` against the canonical DB

```
row_count : 58842      collector_errors : []
source_counts:
  stored_question      58628
  family_definition       75
  mastery_question        56
  ranked_candidate        30
  meta_reflex_rule        18
  meta_reflex_specimen    18
  pro_question            12
  ranked_fallback          5

mastery rows all SSM?                                            True
rows mentioning generated.champion / matchup / applied_chain :      0
```

*(An initial run reported a `_stored_rows` collector error; that was my probe omitting `conn.row_factory`, not a product defect. The corrected run above is the accurate picture.)*

### H.3 Verdict per type

| Type | In Admin Quiz Review? | Proof |
|---|---|---|
| Normal generated `quiz.v1` questions | **Yes** — 58,628 `stored_question` rows | `_stored_rows` |
| **Champion Mastery** | **No** | 0 rows; `_mastery_rows` reads only `ranked_public.mastery_slices.declared_records()` |
| **Matchup Mastery** | **No** | as above |
| **Applied chain** | **No** | as above |
| SSM summoner-spell slices | **Yes** — all 56 `mastery_question` rows | `mastery:ssm.base.*`, `mastery:ssm.modified.*` |

**The "Mastery" an admin reviews today is not the Mastery `mastery_slice` serves.** All 56 rows are summoner-spell curriculum:

```
mastery:ssm.base.BARRIER
  "What is the base cooldown of Barrier, with no summoner spell haste?"
mastery:ssm.modified.BARRIER.cosmic-insight
  "Barrier has a 180-second base cooldown. You are running Cosmic Insight
   (18 summoner spell haste). What is Barrier's cooldown now?"
```

**Why the three generators cannot appear.** Their questions are never rows. They are synthesized at segment-open time, frozen onto one match's round, and exist nowhere else — there is no table to select from and no stable corpus to export. Admin review can reproduce what a player saw only by reading `ranked_rounds.segment_payload_json` for that specific match.

**Where they CAN be inspected instead:**
- `POST /api/admin/mastery-slice/preview` — runs the *real* generation path on the *real* data (`is_sample: true`, writes nothing).
- `GET /api/admin/module-catalog` — the `mastery_slice` entry with live readiness.
- `/dev/mastery-generated` — the standalone player (Champion/Matchup only).
- Per-match: `ranked_rounds.segment_payload_json`.

---

## I. Screenshot catalogue

All files: `/Users/macmoney/mogsy/docs/audits/ranked-mastery-slice/`. Captured with Playwright 1.61.1 + Chromium against a local dev server (`vite` on :5977) talking to a local backend (`uvicorn` on :8099) reading a **byte-exact SQLite-backup copy** of the canonical database. No screenshot was cosmetically modified.

### I.1 Real generated content — standalone Mastery player

Route `/dev/mastery-generated`; backend `POST /api/mastery/dev/generated-mastery-session` (HTTP **201** observed each time); flag `MASTERY_GENERATED_SYNTHESIS_DEV=1`.

| File | Generator | Subject | What it proves |
|---|---|---|---|
| `champion-mastery-ahri-live-unanswered.png` | champion | ahri, n=3 | Prompt built from semantics: *"At rank 4, what is Ahri W's cooldown, in seconds?"* — rank present, ability name absent (§G.2) |
| `champion-mastery-ahri-live-reveal.png` | champion | ahri | Reveal: `Answer: 6` / *"Ahri W: 6 seconds."* |
| `champion-mastery-ahri-live-after-submit-next-question.png` | champion | ahri | Auto-advance to Q2 — *no persistent answered state* |
| `champion-mastery-zed-live-unanswered.png` | champion | zed, n=3 | Second champion, same shape |
| `matchup-mastery-ahri-syndra-live-unanswered.png` | matchup | ahri vs syndra | *"Which has the shorter cooldown: Ahri R or Syndra R?"*, options Ahri / Syndra / **Tie / Same**, dual portraits, `COMPARISON` badge |
| `matchup-mastery-ahri-syndra-live-reveal.png` | matchup | ahri vs syndra | *"Ahri R: 140 seconds. Syndra R: 120 seconds. Syndra wins by 20 seconds."* |
| `*-mobile-*.png` (375×812) | both | — | Mobile width for each of the above |

### I.2 Ranked arena rendering

Route `/dev/ranked-arena-inspector` (not auth-gated; the repo's sanctioned visual-QA bench).

| File | What it proves |
|---|---|
| `champion-mastery-ahri-ability-unanswered.png` | The Ranked Champion Mastery band: `CHAMPION MASTERY` badge, Ahri splash, **ORB OF DECEPTION · ABILITY · SLOT Q**, `RANK 3`, question *"What is the cooldown of Ahri's Q at rank 3?"* — i.e. the server-side premise→media resolution working end to end |
| `champion-mastery-champion-stat-unanswered.png` | The champion-stat subject variant |
| `matchup-mastery-slice-unanswered.png` | The matchup band (champion vs champion) |
| `ssm-slice-spell-haste-unanswered.png` | The **separate** SSM slice presentation, for contrast |
| `mastery-compact-fallback-no-media.png` | The `null`-media compact fallback (what a pre-RR1 segment renders as) |
| `*-mobile.png` | Mobile width for each |

> **Honest caveat, stated because it matters:** the inspector renders the **real shared arena components** and a **real server-shaped `presentation` blob**, but its *answer options* come from the bench's generic fixture — which is why the cooldown question is shown beside item answers. The premise/media path is real; the answer grid in those five images is not. The genuinely end-to-end content screenshots are the ones in §I.1.

### I.3 Route-reachability evidence

| File | Proves |
|---|---|
| `dev-mastery-generated-launcher.png` | The rebuilt generic launcher (champion / optional opponent / count) — the `7d7de643` commit, absent from the stale working copy |
| `admin-ranked-builder.png` | `/admin/ranked` redirects to `/` unauthenticated |
| `admin-quiz-review.png` | `/admin/quiz` is a 404 |

### I.4 Not captured, and why

**Applied-chain in the Ranked renderer.** It is reachable only inside a real Ranked match under the `admin_bot` format, and match creation requires a genuine Supabase JWT with admin role — there is no bypass. Its exact rendering is nonetheless fully determined and documented: `interaction_kind` is absent → `renderPathFor` returns `"prose"` → `InteractiveScenarioSurface` with `scenarioSource={null}` (line 244), i.e. **no media band**, backend prose verbatim, four numeric options. The real payload is in §C.4.

---

## J. Reference / usage map

| Relationship | Classification | Evidence |
|---|---|---|
| Ranked Builder (`/admin/ranked`, `RankedFormatBuilder.mastery.test.tsx`) | **Direct runtime dependency** | `builder_catalog._mastery_entry` offers the three modes from live data |
| `GET /api/admin/module-catalog` | Direct runtime | allow-list, not a registry projection |
| `POST /api/admin/mastery-slice/preview` | Direct runtime | runs the real generator; writes nothing |
| Production public Ranked | **Not connected** | no built-in format names `mastery_slice` (§F.1) |
| Admin-bot Ranked lane | **Direct runtime** | the sole saved config is a Mastery Slice (§F.2) |
| Champion facts / Knowledge Bank / Matchup Composer | **Data dependency** | the Champion/Matchup pipeline |
| `mastery/data/*.py` certified champions | **Data dependency** | applied-chain only |
| `item_canonical` | **Data dependency** | penetration items |
| `quiz.presentation_contract` + `ranked_public.presentation_render` | **Presentation dependency** | shared with every pooled Ranked family |
| `mastery.publication.projections.evaluate_answer` | **Shared utility** | the single grader |
| `ranked_public.discovery.canonical_ref_for_concept` | Shared utility | per-challenge identity |
| Quiz Review / `review_universe` | **Compatibility only** | shows SSM, never the generators (§H) |
| `quiz_attempts`, Personal Analytics, Premium analytics | **Not connected** | no writer (§F.6) |
| XP / Elo / streaks / points | Indirect | via ordinary segment outcome, not Mastery-specific |
| Match review / replay | Direct runtime | reads the frozen payload |
| Daily Challenge | **Unrelated** | separate system |
| Combat Lab / Combat Simulator | **Shared data, divergent values** | §4.5 — no shared calculation code with applied-chain |
| Pro Play, Graph1, LIVE1 | **Unrelated despite adjacency** | no `mastery_slice` reference |
| **`ranked_public/mastery_slices.py` (SSM)** | **Unrelated despite near-identical terminology** | §J.2 |

### J.2 The naming collision — the most important thing to internalise

Two entirely different systems are both called "Ranked mastery slice":

| | `ranked_modules/mastery_slice.py` | `ranked_public/mastery_slices.py` |
|---|---|---|
| What it is | A Ranked **module** (`mastery_slice.v1`) | A **question-provider decorator** |
| Mechanism | Owns a multi-challenge segment | Overrides ordinary `quiz` slots with curriculum phases |
| Content | Champion / Matchup / applied-chain generators | Summoner Spell Mastery curriculum |
| Enabled by | A format naming it | `RANKED_MASTERY_SLICES_ENABLED` — **fail-closed, off by default** |
| Admin Review | **Invisible** | **All 56 "mastery" rows** |
| Schema | New segment columns | **No schema change at all** |

They share no code path. `service.py:145` wraps the provider with the SSM decorator; the module registry registers the carrier. Any sentence containing "Ranked mastery slice" is ambiguous until you say which.

---

## K. Legacy / dead / compatibility inventory

Nothing here was deleted or modified.

| Item | Status | Notes |
|---|---|---|
| `ranked_formats/retired_mastery_sets.py` | **Safe compatibility — actively load-bearing** | Without it the only saved Ranked config fails to load. Maps 3 retired ids; drops `allowed_variants` |
| `COMPATIBLE_MASTERY_SETS` catalog | **Deleted** | Referenced only by the decoder's docstring |
| `mastery_set_id` / `allowed_variants` config keys | **Retired, actively refused** | Named in `mastery_config.py` solely so refusal can be specific |
| `mastery_mode: "mastery_set"` | **Retired** | Still present in all 29 saved DB rows; only the decoder rescues them |
| `src/lib/question-surface/masterySliceScenario.ts` | **Current, not legacy** | Reduced to a 70-line forwarder post-RR1 |
| `LEGACY_INTERACTION_KIND = "legacy_combat"` | **Operational** | The applied-chain path relies on it |
| `mastery/chains/` — 12 of 14 modules | **Unreachable from `mastery_slice`** | Certified calc + progression modules; still used by tests/other seams |
| `mastery/fixtures/synthetic.py`, `mastery/testdata/` | **Test-only** | |
| `capturedPlaytestPayloads.ts` | **Test-only, deliberately frozen** | Wire-shape fixture; the `7d7de643` message states it is kept intentionally |
| `AtomicRecallPrototype.tsx`, `ComparisonPrototype.tsx` | **Prototype/bench** | Not on the Ranked path |
| Backend `GET /dev/generated-playtest-sets`, `POST /dev/generated-playtest-session` | **Deleted** | Removed with the static sets |
| `ranked_modules/registry.py` comment on `mastery_slice` | **Stale/misleading** | Says "UNREACHABLE: no format's segment_pattern names it" — untrue for stored configs (§F.2) |
| `mastery/data/slice_patch.py` docstring | **Stale scope name** | Says "the Ahri/Syndra slice"; now stamps every applied-chain artifact |
| `mastery/tests/test_phase4f_…::test_format_for_creation_is_unaffected_by_this_module` | **Stale expectation — currently failing** | Asserts `ranked_modern`; the ladder returns `ranked_points_v2` since RP1 Step 5 |
| `quiz.v1`, `item_cost_duel.v1–v4`, `meta_reflex` v4 | **Safe compatibility** | Retained so replay resolves historical matches |

---

## L. Test matrix and runtime probes

### L.1 Commands and results

**Backend — Mastery suite**
```
cd /Users/macmoney/lcs-wt-audit-mastery
LOL_CALC_DB_PATH=…/lol_calc.db PYTHONPATH=… python -m pytest mastery/tests -q
→ 8 failed, 1422 passed, 13 skipped   (25.20s)
```

**Backend — Ranked Mastery integration**
```
python -m pytest test_ranked_mastery_applied_chain.py test_ranked_mastery_on_demand.py \
  test_ranked_mastery_reveal_e2e.py test_ranked_mastery_reveal_secrecy.py \
  test_ranked_phase_one_mastery.py test_mc1_static_content_retirement.py \
  test_ranked_builder_catalog.py test_rr1_mastery_identity.py -q
→ 160 passed   (10.03s)
```

**Frontend**
```
cd /Users/macmoney/mogsy-wt-audit-mastery
npx vitest run src/features/mastery src/lib/ranked-core/modules \
  src/lib/question-surface/masterySliceScenario.test.ts
→ 43 files, 422 tests, all passed   (6.88s)
```

### L.2 The 8 backend failures, characterised (not fixed)

| Test | Cause | Severity |
|---|---|---|
| `test_phase4f_…::test_format_for_creation_is_unaffected_by_this_module` | Asserts `ranked_modern`; ladder now returns `ranked_points_v2` | **Stale test**, product correct |
| `test_cross_check_db::test_syndra_qer_match_db_formulas` | certified AP ratio **0.70** vs DB **0.65** | **Real data divergence** |
| `test_cross_check_db::test_syndra_q_captured_formula_matches_db` | `(55 + 35*P_Q + 0.7*AP)` vs DB `(45 + 35*P_Q + 0.65*AP)` | Real divergence |
| `test_cross_check_db::test_syndra_r_per_sphere_matches_db` | per-sphere base **90** vs DB **80** | Real divergence |
| `test_cross_check_db::test_olaf_q_matches_db_formula` | `(20 + 50*P_Q + BO_AD)` vs DB `(10 + …)` | Real divergence |
| `test_cross_check_db::test_ahri_r_cooldown_conflict_is_real` | DDragon **140** vs expected **130** | Real divergence |
| `test_audit_db` ×2 | pool / certified counts and schema roundtrip | Needs triage |

### L.3 Coverage gaps — behaviour with no test

- **No test asserts the cooldown fixture is present or fresh.** Its fail-open branch has no coverage, and the silent content change proven in §D.1 would not fail any suite.
- **No test asserts `SLICE_PATCH_DESCRIPTOR` matches current canonical revisions** — by construction it cannot, being a literal.
- **No test asserts the saved `ranked_format_configs` row is loadable.** The single production-shaped config depends entirely on the retired-set decoder.
- **No test covers question-family balance.** The 97%-cooldown property of short slices (§5.4) is invisible to the suite.
- **No end-to-end test renders an applied-chain challenge through the frontend prose path.**
- **No test asserts Mastery questions are absent from `quiz_attempts`** — the omission is unguarded and could be "fixed" accidentally.

### L.4 Runtime probes performed

| Probe | Result |
|---|---|
| Generate champion/matchup/applied-chain artifacts against canonical DB | All three succeeded (§C) |
| `MasterySliceModule.generate_segment()` for all three modes | Full public/private payloads captured → `wire.json` |
| `format_config.load_config(cur,'admin_bot' / 'public')` | admin_bot decodes to applied-chain; public → `None` |
| Execute `ranked_points_v2_format()` / `modern_ranked_format()` / `legacy_quiz_format()` | No `mastery_slice` in any |
| `build_universe()` over canonical DB | 58,842 rows; 0 generator rows |
| Roster-wide capacity sweep (173 champions) | 6,690 candidates; min 19 / median 40 / max 54 |
| Roster-wide family + first-3-step distribution | 503/519 first-three slots are `ability_cooldown` |
| Cooldown-fixture removal experiment | Content silently changed; no error |
| `POST /api/mastery/dev/generated-mastery-session` ×6 | HTTP 201; real sessions |
| `POST /api/mastery/sessions/{id}/answer` | `mastery_player_reveal` projection with explanation + `source_summary` |
| Production `GET /api/version` | `{"ok":true,"version":"hp-source-fix-local-001"}` — alive |
| Production `GET /api/admin/db/status` | **403** — admin probes not possible |
| Local backend boot | Logged: *"cannot resolve a creation format — new matches will be REFUSED"* without capability flags |

---

## M. Risks, anomalies and unanswered questions

**Risks**

1. **The cooldown fixture is a single frozen file, load-bearing, patch-unaware and fail-open.** Month-old, 172/173 champions, no version field, silently degrades.
2. **Applied-chain patch identity is a Python literal frozen near League 26.13** and cannot be updated by any patch pipeline.
3. **The only saved Ranked config is written in a retired spelling** and survives on one compatibility shim. If the decoder is ever removed or the id typo'd, the admin-bot lane fails closed.
4. **Certified Python champion data and the canonical DB disagree** for Syndra, Olaf and Ahri — the exact champions applied-chain uses — with the guard tests red.
5. **Generation is fully deterministic with no seed**, so the same config always produces the same questions for every player and every match.
6. **Mastery questions are invisible to analytics and to admin review**, so there is no feedback loop on their quality.

**Anomalies**

7. `Ohmwrecker (Turret Item)` is a legal applied-chain scenario item.
8. `ability_name` on the wire is the slot letter, so the prose never names the ability even though the server resolved it.
9. `patch_display` is empty for Champion/Matchup artifacts.
10. The registry comment asserting unreachability is contradicted by stored configuration.
11. `allowed_variants` is silently dropped when decoding a retired config.
12. `applied_chain` artifacts are flagged `is_prototype=True` while being the only mode any saved format serves.
13. The standalone player shows a reveal then auto-advances; there is no persistent answered state.
14. `MIN_CHALLENGE_COUNT = 2`, yet `DEFAULT_CHALLENGE_COUNT = 3` and the saved format uses 2.

**Unanswered — require access this audit did not have**

15. Does production have a `target='public'` row in `ranked_format_configs`? (Needs admin key.)
16. Is `RANKED_MASTERY_SLICES_ENABLED` set in production?
17. Are `RANKED_MODULE_ITEM_COST_DUEL_ENABLED` / `RANKED_SHARED_BANK_ENABLED` set in production?
18. Has an admin-bot Mastery Slice match ever actually been played in production?
19. For each cross-check divergence, which store should win? (Olaf/Syndra comments claim the Python side is the 2026-09-03 wiki-verified correction and the DB is stale 2026-05-31 spreadsheet inheritance — but that is a claim in a comment, and the DB was never updated.)

---

## N. Exact current-state conclusions

**1. What is Champion Mastery today?**
A `mastery_slice` **mode** (`{"mastery_mode":"champion","champion_id":…}`) that synthesizes a champion's own recall questions on demand from canonical data, at segment-open time. It covers all 173 champions with 6,690 eligible questions (median 40 per champion). It is not a set, a file, or a catalogue entry.

**2. What is Matchup Mastery today?**
The same pipeline over a normalised champion **pair**, whose candidate universe is comparison candidates **plus both champions' atomic banks**. 14,878 pairs. Order-independent; ties are a real answer.

**3. What are applied-chain / combat-style slices today?**
One mode running **one certified operation** — physical damage through item penetration — at a fixed level-11 scenario, one question per canonical penetration item. Coverage is 3 attacker abilities × 6 targets = **15 subjects**, ≤17 questions each. It bypasses the publication gate, is flagged `is_prototype=True`, and carries a hardcoded patch identity.

**4. Are those truly three separate systems?**
**No — they are two.** Champion and Matchup are the *same* generator family (shared projection → bank → gate → recipe → `publish()`; Matchup adds the composer). Applied-chain is genuinely separate: different data authority, no publication gate, its own patch descriptor, its own rendering path. A fourth thing — **SSM** — also calls itself a "Ranked mastery slice" and is architecturally unrelated to all three.

**5. What data does each use?**
- Champion / Matchup → `champion_stats` + `champion_abilities` (canonical) **+ the frozen cooldown JSON fixture**.
- Applied-chain → 6 hand-authored Python modules + `item_canonical`.

**6. Which parts are dynamically canonical?**
Champion base stats, ability rows/costs, roster identity, penetration items, ability display names and icons. Champion/Matchup patch identity is genuinely derived from observed revisions.

**7. Which parts are patch-fragile?**
The cooldown fixture (frozen, fail-open, unversioned); all six certified champion modules; `SLICE_PATCH_DESCRIPTOR`; the SSM curriculum. And the DB's ability-formula rows are themselves stale relative to the CHAMPDATA corrections.

**8. Where can each be served today?**
- **Public Ranked: none of them.** No built-in format names `mastery_slice`.
- **Admin-bot Ranked: applied-chain only** — the one saved config, 2 questions, Jarvan Q vs Olaf.
- **Admin preview API:** all three.
- **`/dev/mastery-generated`:** Champion + Matchup only.

**9. What exactly does the player see?**
In Ranked: a dark arena card with a server-resolved media band (champion splash, real ability name and icon, rank badge) above a sentence the *client* assembles from typed semantics, and a four-option grid. In the standalone dev player: a light, plain page with a 32px portrait, no media band, and the same sentence. Applied-chain instead shows backend prose with no media band at all. See §I.

**10. What exactly does an admin see?**
For these three generators: **nothing**, in Admin Quiz Review — 0 of 58,842 rows. All 56 rows labelled "mastery" are Summoner Spell Mastery. Admins can only inspect the generators through the preview endpoint, the module catalog, the dev player, or a specific match's frozen round payload.

**11. What persists for a match/attempt?**
The frozen `segment_payload_json` / `segment_private_json` on `ranked_rounds` (questions, answers, explanations, per-challenge `canonical_ref`, optional `reveal_window_ms`), and player choices in `ranked_segment_challenges`. **Nothing in `quiz_attempts`.** `ranked_rounds.canonical_question_ref` stays null for slices.

**12. What is actually ready to continue developing?**
Solid and ready: the carrier module, the config contract, the freeze/replay discipline, the payload split and answer-safety guards, the shared server-side presentation layer, the grading delegation, per-challenge canonical identity, and the Champion/Matchup generators at full roster scale (422 frontend tests and 160 Ranked-integration tests green).
Not ready without decisions: applied-chain breadth (15 subjects) and its data authority; the cooldown-fixture dependency; question-family balance for short slices; admin visibility; analytics integration; and putting `mastery_slice` into any public format.

**13. Which assumptions from the old mental model are false today?**

| Old belief | Reality |
|---|---|
| "There are static Mastery Sets you pick by id." | **Deleted.** The key is refused; old ids are decoded once on read. |
| "Champion / Matchup / applied-chain are three peer systems." | Two share one pipeline; applied-chain is structurally different. |
| "`mastery_slice` is unreachable" (the registry comment). | True for built-in formats; **false** — the one saved config runs it. |
| "Mastery Slice is a Champion/Matchup feature." | The only config that exists in the DB is **applied-chain**. |
| "Generated content means patch-current content." | The dominant question family rides a frozen month-old JSON file; applied-chain carries a hardcoded 26.13 patch stamp. |
| "Mastery questions show up in Admin Quiz Review." | They never have. What is shown there is SSM. |
| "Mastery attempts feed analytics / `quiz_attempts`." | No writer exists. |
| "Slices are varied." | Short slices are ~97% `ability_cooldown` — an ordering effect, not a data gap. |
| "Each match generates different questions." | `seed` is ignored; identical config ⇒ identical questions, always. |
| "The working checkouts show current state." | Backend is 628 behind, frontend 66 behind; both dirty. |

---

## Appendix — audit artifacts

| Artifact | Location |
|---|---|
| Screenshots (25) | `/Users/macmoney/mogsy/docs/audits/ranked-mastery-slice/` |
| Captured wire payloads (all three modes) | scratchpad `probes/wire.json` |
| Backend audit worktree | `/Users/macmoney/lcs-wt-audit-mastery` @ `11c96ab0` |
| Frontend audit worktree | `/Users/macmoney/mogsy-wt-audit-mastery` @ `7d7de643` |
| DB copy used for probes | `/Users/macmoney/lcs-wt-audit-mastery/lol_calc.db` (SQLite backup API, never `cp`) |

**Cleanup note for the owner:** the two audit worktrees, the DB copy, the hardlinked `node_modules`, the `_audit_*.mjs` capture scripts and `.env.local` in the frontend audit worktree, and the `mastery-audit-fe` entry in the gitignored `.claude/launch.json` are all disposable. No tracked file in either repository was modified by this audit.
