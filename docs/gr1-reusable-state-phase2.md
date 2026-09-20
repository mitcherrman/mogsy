# GR1 — Reusable state architecture: Phase 2 (resolution and derivation)

**IMPLEMENTED, COMMITTED, NOT PUSHED. Still not wired into anything a player can reach.**
Phase 2 makes `StateTemplate → ResolvedState` actually work, against Mogzy's existing
canonical data and existing formulas. No Champion Mastery, Matchup Mastery, Ranked,
composer, Full mode, slice, Journey, Combat Lab or frontend behaviour changed. No
migration, no DDL, no config key, no flag, no external provider.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`88c9f7a0`** | Phase 1. `origin/master` did not move during the phase (fetched 2026-09-19). |
| Backend commit | **`89b5ce4b`** | One commit, branch `gr1/setup-state-phase2`, worktree `~/lcs-wt-gr1-state2`. **Integrated: rebased onto `origin/master` `57016334` (one upstream items-only commit, zero file overlap) and pushed to `origin/master` on 2026-09-19.** Pre-rebase SHA was `35e08c11`. |
| Docs base | `origin/main` **`f2a3e766`** | Phase 1's docs commit. |
| Docs commit | *this document's own commit* | Branch `gr1/reusable-state-phase2-docs`, worktree `~/mogsy-wt-gr1-state2-docs`. One docs-only commit (this file + the handoff). **NOT pushed.** A commit cannot name its own SHA; the final report and the handoff table carry it. |
| Inputs | [design rev 2](./gr1-reusable-state-architecture-design.md) §§1–11, 15–17 · [Phase 1](./gr1-reusable-state-phase1.md) · [architecture audit](./gr1-reusable-state-architecture-audit.md) §§5–8 · this repo's handoff | |

**Files changed: 14, all of them inside `mastery/setup_state/` or `mastery/tests/`.**
6 new modules, 2 new test files, 4 modified package files, 2 modified test files. Zero
serving files, zero generator files, zero routes, zero frontend.

```
mastery/setup_state/basis.py        NEW   the one available data basis, named concretely
mastery/setup_state/rules.py        NEW   structural legality, as data, keyed by ruleset
mastery/setup_state/sources.py      NEW   SetupRecord, the source registry, SourcePolicy
mastery/setup_state/normalize.py    NEW   canonical ids, precedence, fail-closed refusals
mastery/setup_state/derive.py       NEW   derived values, each with a status
mastery/setup_state/resolve.py      NEW   the pipeline, and pure matchup resolution
mastery/setup_state/__init__.py     +91   exports
mastery/setup_state/errors.py       +57   Phase 2 codes and SourceIntegrityError
mastery/setup_state/identity.py     ~50   the digest correction (§11)
mastery/setup_state/validation.py   ~34   a template axis may say INTRINSIC (§5)
mastery/tests/test_setup_state_resolution.py        NEW  102 tests
mastery/tests/test_setup_state_backwards_compat.py  NEW   23 tests
mastery/tests/test_setup_state_isolation.py         ~328 reworked guard (§13)
mastery/tests/test_setup_state_identity.py          ~31  the one inverted digest test
```

---

## 1. Implementation preflight — what was reused, and what was deliberately not

Read at `88c9f7a0`. This is not the architecture audit repeated; it is the narrower
question the brief asked: *which existing function is authoritative enough to become the
new state authority, and which is a feature-specific wrapper that must not.*

### 1.1 Adopted as the authority, imported rather than copied

| Need | Implementation adopted | Why it is authoritative |
|---|---|---|
| Level-scaled base stats | `mastery.facts.projection.ChampionFactSet.resolve(metric, context=FactContext(champion_level=…))` | It IS Mastery's fact layer. A derived value here is therefore the value Mastery publishes, bit for bit, and its `NonFact` reason codes map straight onto the three statuses. |
| The growth curve | `champion_stat_profile.riot_level_multiplier`, reached through the projection | One curve, one place. The projection already names it `GROWTH_DERIVATION`. |
| Attack speed at level | `champion_stat_profile.calculate_champion_attack_speed_at_level` | Self-declared canonical, and it handles the base-vs-ratio split (55 roster champions differ) and Jhin's real `0.0` ratio. |
| Attack speed total | `champion_stat_profile.finalize_attack_speed` | The one composition: `base + growth_coefficient × growth% + ratio × external%`. Called with the exact fields it reads, never restated. |
| Item base stats | `item_canonical.runtime_stats.map_stats_json` over `validation_status = 'validated_current'` | WIKI1-1A's single item authority. The legacy `items` / `item_stats` tables still carry items the wiki no longer lists as current. |
| Ability haste → cooldown | `calculate_cooldown.haste_to_cooldown_multiplier` | The self-declared shared primitive. Its five siblings (including `mastery.calculations.cooldown`) all compute `100/(100+haste)`; they **agree**, and none was touched. |
| Movement speed | `movement_speed_model.soft_cap` + `champion_self_move_speed_percent` | The declared authority's own arithmetic, minus the terms that need a live `CombatState`. Both are pure functions. |
| Cooldown / cost progressions | `quiz.ability_question_eligibility.load_ability_rows` (+ `is_dual_form_name`, `has_secondary_gate`, `RESOURCE_LABEL`, `SCALAR_COST_RESOURCES`) | The same parse Mastery's projection reads, connection-injected. |
| Per-champion rank domain | `champion_state.ability_rank_ceiling` | Per champion AND per slot, and store-guarded by a test that asserts the table lists every four-rank ultimate `champion_abilities` holds. |
| Inventory legality | `mastery.state.validation_context.InventoryPolicy` | `slot_limit: Optional[int]` is already the right shape; it already validates duplicates and unique groups. Reading the class changes nothing in Journeys. |
| Champion identity | `mastery.identity.get_identity_registry` | The same registry `project_champion` resolves through, so a champion Mastery can project is one this state can name. |
| Patch label | `mastery.provenance.canonical_patch.canonical_patch_display` | Asks `league_patches` its own question and returns `None` rather than a plausible number. |
| Store fingerprint | `mastery.audit.repository.load_source_revisions` | The reader `projection_patch_key` already uses, so the basis and the projection cannot describe one database two ways. |
| Digests | `mastery.provenance.hashing.content_hash` | One canonical-JSON convention across the whole lineage. |

### 1.2 Deliberately NOT adopted as the state authority

| Implementation | Why not | Changed? |
|---|---|---|
| `services.combat_helpers.build_runtime_champion_stats` — the closest existing "loadout → derived stats" service | A missing champion becomes `default_preview_base_stats(level)`, i.e. **all-zero stats with no error**; level is clamped to `MAX_PREVIEW_LEVEL`; ranks are `max(1, min(ceiling, …))`. It also holds its **own copy of the level curve**. A clamp publishes a number nobody asked for. | **No.** Combat Lab and team sim keep it exactly as it is. |
| `calculate_build_stats.calculate_build_stats` | Opens its own connection, and **keeps an unresolvable item in the build at zero base stats** — correct for the simulator's effect runtime, wrong for a state. Its `MOVE_SPEED` → `MOVE_SPEED_PERCENT` re-key IS a real correction, and it is honoured (§7). | **No.** |
| `calculate_loadout_stats.calculate_rune_stats` | Sums the nine `rune_stats` rows unconditionally. Those rows are **conditional maxima** (see §9). | **No.** |
| `champion_stat_profile.apply_stat_shards` | Three code literals, an undeclared `adaptive_type` decision, and an unknown shard is *"ignored"*. | **No.** |
| `champion_stat_profile.calculate_base_champion_stats` | The arithmetic is right; the wrapper opens its own `get_connection()`. The **formulas** inside it are reused; the wrapper is not. | **No.** |
| `mastery.transitions.transitions._min_level_for_rank` and `quiz.combat_scenarios.resolver.validate_rank_for_level` | Both hardcode basics 1–5 at level `2r−1` and R at 6/11/16 with a ceiling of 3 — verified at `88c9f7a0`. Both are therefore **wrong for six champions**, and the resolver raises outright on R rank 4. Adopting either as law would have made that permanent (design D-3 withdrew exactly this). | **No.** Neither is modified. The rules layer carries the ordinary rule as a *default for ordinary champions only* (§4). |
| `services.canonical_ability_facts.get_ability_facts` | Opens its own connection to a module-level `DB_PATH` and caches globally. Not connection-injectable, so a resolver could not be given a read-only handle. | **No.** |
| `mastery.state.CanonicalMasteryState` / `ChampionCanonicalState` | Mixes setup with encounter, holds items by **name**, carries caller-supplied `derived` documented as *"NEVER used as authoritative validation evidence"*, and only validates certified champions. It stays the Journeys' state (design D-2 (a)). | **No.** |
| `mastery.calculations.mitigation.effective_resistance` vs `penetration.calculate_effective_resistances` | The known unit disagreement: percent penetration as 0–1 in one and 0–100 in the other. **Not needed** — Phase 2 derives no mitigation and no damage, so the conflict is neither resolved nor inherited. | **No.** |

---

## 2. Architecture in one page

```
StateTemplate                                                        (a REQUEST)
   │
   │  1  validate_template                     shape only          TemplateInvalid
   │  2  basis.resolve_basis                   concrete + available HistoricalBasisUnavailable
   │     sources.record_for_side               SetupRecord          SourceUnavailable
   │  3  normalize.normalize_side              canonical ids        NormalizationError
   │     rules.RulesAuthority                  legality             NormalizationError
   │  4  derive.derive_side                    statuses, no clamp   SourceIntegrityError
   │  5  identity.assemble_resolved_state      canonical order + both identities
   ▼
ResolvedState  =  sides(inputs + derived + per-axis provenance)
                  + shared(ONE concrete DataBasis, ruleset, rules_rev)
                  + resolution(resolver/derivation version, support manifest, warnings)
                  + semantic_state_key  +  resolved_state_digest
```

Stages 1–4 refuse the whole state. Stage 5 cannot fail on data. Nothing generates a
candidate, composes a segment or serves anything: those are later phases.

Three layers, three failure modes, and **a limit lives in exactly one of them**:

| Layer | Question | Where its numbers live | Failure |
|---|---|---|---|
| Contract | *can this be written down?* | the type only — **no game-rule number at all** | `TemplateInvalid` |
| Rules | *is it legal in this ruleset?* | `rules.py`, as data | `NormalizationError` |
| Derivation support | *can we compute what a consumer reads?* | a declared manifest | **not fatal** — `DerivedValue(unsupported)` |

---

## 3. Data-basis resolution

**`basis.py`.** One scheme, `store_fingerprint.v1`.

* **Machine key** — `content_hash` over the observed revisions of the stores actually
  read, prefixed `basis_`. It follows the convention `projection_patch_key` already set
  (a digest over store revisions, not a patch number) and reuses
  `load_source_revisions` for the champion stores, so the basis and the projection
  cannot describe one database two different ways. `item_canonical` contributes its
  `source_revision` span and row count.
* **Label** — `league_patches`' own live row via `canonical_patch_display`. Display text
  only; it never enters the key, exactly as `CompositePatchDescriptor` already excludes
  `game_patch_display` from `patch_key_digest`. An unresolved catalog yields `None`
  rather than a plausible number.
* **Availability** — `live_only`. Canonical stores are overwritten in place, so the live
  basis can be *identified* but never *re-read*.

Behaviour:

| Request | Answer |
|---|---|
| `current` | the live basis, as a concrete `DataBasisId` |
| `pinned(live_id)` | the same basis |
| `pinned(anything else)` | **`HistoricalBasisUnavailable`** — the whole state refuses |
| anything | a `ResolvedState` **never** stores the word `"current"` |

No historical storage was built, no migration added, and no snapshot implied. A snapshot
store would declare its own `scheme` and answer the availability question differently;
nothing else in the contract would move.

**Stores with no revision are recorded honestly rather than defaulted:** `runes` reports
`"unversioned (n=34)"` and `stat_shards` reports `"absent"`. Those two strings are the
reason §9 exists.

### 3.1 The patch-identity mismatch that remains

The repository holds several patch identities. Phase 2 chose the smallest existing seam
and documents the rest rather than adding a competitor:

| Identity | What it is | Phase 2's use |
|---|---|---|
| `projection_patch_key` | digest over table timestamps / counts + the cooldown authority's revision span | **the convention adopted** for the machine key (composed independently, over one more store) |
| `league_patches.patch_id` / `display_version` | the official patch-notes catalog | **the label**, via `canonical_patch` |
| `SLICE_PATCH_DESCRIPTOR.patch_key_digest` | a hand-pinned literal, the certified-adapter registration key | **not used.** It identifies the six hand-transcribed champion slices, not live data. |
| `EffectiveBuild.data_version.patch` | always `None`, with a `catalog_digest` beside it | **not used.** |

**Remaining mismatch, unresolved by design:** a Mastery artifact's `patch_key_digest`
(from `projection_patch_key`) and a resolved state's `DataBasisId.key` are computed over
overlapping but not identical material, so they are not interchangeable. A state and a
Mastery artifact resolved at the same instant carry two different machine keys for the
same data. Unifying them is a Mastery-identity change and therefore out of scope here;
both are recorded, so neither is lost. Also unchanged: nothing in the repository moves a
`league_patches` row to `live` — that value comes from a build-script literal
(`scripts/build_historical_patch_catalog.py`).

---

## 4. Rules authority

**`rules.py`.** One ruleset is declared, `summoners_rift`. Everything it decides is data,
and `rules_rev` is a digest **derived from that data** (prefix `rules_`) rather than a
literal that would have to be remembered.

| Rule | Value / source | Authority |
|---|---|---|
| Level bounds | `1 … 18` | League Wiki, *Experience (champion)*. Declared as rules data; the coincidence with `projection.MAX_LEVEL` is not the reason — that constant is a statement about the projection and belongs to layer 3. |
| Rank ceiling, per champion per slot | **read** from `champion_state.ability_rank_ceiling` | The store-guarded table. Never copied. |
| Rank availability, ordinary | basics `(1,3,5,7,9)`, ultimate `(6,11,16)` | League Wiki. Applied **only** to a champion with an ordinary rank domain. |
| Rank availability, exceptions | `nidalee/R` and `karma/R` = `(1,6,11,16)` | The wiki sentences quoted inside `champion_state`: Aspect of the Cougar *"begins with one rank … levels 6, 11, and 16"*; *"Karma begins the game with one rank in Mantra"*. |
| Inventory | `slot_limit = 6`, via `InventoryPolicy` | League Wiki, *Inventory*. The value already appears as data at an existing call site (`summoner_spell_mastery.py: InventoryPolicy(slot_limit=6)`). |
| Rune page / shard row shape | **not declared** | No versioned store defines either, so no shape is invented. |

### 4.1 Rank availability is declared, or refused — never guessed

Six champions have a non-ordinary rank domain: `elise`, `jayce`, `karma`, `nidalee`,
`udyr`, `yuumi`. For any of them, a rank checked **with a level** and without a declared
exception raises `NormalizationError(rank_rule_unsupported)`. It is never measured
against the ordinary rule, which is known to be wrong for them.

The check is per **champion**, not per slot, and Jayce is the reason. His Q/W/E have six
ranks; his R *"cannot increase its rank"*; yet the ceiling table leaves his R at the
ordinary three because nothing reads it. A per-slot test would hand Jayce's R to the
6/11/16 rule and cheerfully accept a rank 2 Transform, which does not exist. One
anomalous slot therefore makes the whole champion's skill-point rule undeclared until it
is declared. This is conservative on purpose: Nidalee's and Karma's basic abilities are
also refused, and both are form-dependent kits where the claim would need its own
authority anyway.

Which ordinary rule applies is chosen by the slot's **rank count**, not its letter, so
Udyr's ultimate-in-the-R-slot cannot be mis-classified by a string comparison. A test
asserts that the only slot letter anywhere in the package is inside the declared
exception table.

### 4.2 Legality and derivation support are two different answers

Proved on Udyr:

```
rules.check_rank("Udyr", "Q", 6)                      → legal (the ceiling says six)
resolve(Udyr, ability_ranks={"Q": 6})                 → resolves
  ability.Q.cooldown.base   supported      6.0 s      ← derived at rank 6
  armor.at_level            unsupported    (no value)  reason level_not_specified
resolve(Udyr, ability_ranks={"Q": 6}, level=18)        → REFUSED rank_rule_unsupported
```

Nothing is clamped, and no state is called illegal because Phase 2 cannot derive
something about it.

---

## 5. Setup-source normalization

**`sources.py`.** The honest statement first, because the design demanded it:

> **Mogzy has no recommended-build authority.** It has no skill-order authority, no
> rune-page authority and no shard authority either.

What exists is **one** curated internal file, `quiz/data/champion_item_builds.json`,
which describes itself as *"an editable best-effort whitelist and timing prior for
realistic champion item states"*. It is registered as `curated.item_whitelist.v1`,
selectable **by name**, and it is **not the default** (design D-9 option (c)).

```
SourceDescriptor{source_id, source_kind, classification, fills, version,
                 patch_basis, confidence, presentation_phrase}
SetupRecord{champion, provenance, position?, level?, ability_ranks?, skill_order?,
            items?, runes?, shards?}                    ← normalized, source-independent
SourceRegistry.register / describe / get / ids
SourcePolicy{default_by_axis}                            ← Phase 2 ships it EMPTY
```

**Invariants, each tested:**

1. **Generators cannot tell sources apart.** Nothing past normalization sees a
   `SourceRef`. A curated setup and the same values stated literally give the *same*
   `semantic_state_key` and the *same* `resolved_state_digest`, and differ only in
   provenance.
2. **Provenance is per axis and is never identity.** `SetupInputs` has no provenance
   field at all, so it is structurally unreachable from the key material.
3. **Precedence, decided in one place.** A literal template value wins; the source fills
   only axes the template left `None`; an axis still unfilled becomes
   `absent_unrequested`. A template may also state `AxisState.INTRINSIC` — *"this state
   deliberately does not model this axis"* — and a source may not override it. All three
   of "asked for 11", "deliberately unmodelled" and "nobody asked" produce three
   different state keys.
4. **Confidence is normalized down.** The file carries `"confidence": "high"` beside
   `"needs_manual_review": true` on the same row; a reviewed-needed row is reported as
   `low` and everything else as `declared`. Its own word is never forwarded. Its
   `source_patch_basis` travels verbatim as a **claim**, never as a resolved basis.
5. **Presentation wording.** The descriptor's phrase is *"a curated build"*. A test
   asserts it says neither "recommended" nor "optimal", because no authority for either
   claim exists.
6. **One source per side, no merging.** A policy naming two sources for one side is
   `TemplateInvalid(multiple_sources)`. A source asked for an axis it does not declare
   raises `SourceUnavailable(source_axis_unsupported)` rather than returning nothing.
7. **Canonical data wins over a source's claims.** Every item name the curated file
   supplies still has to resolve against `item_canonical`; one that does not fails
   closed, and the error names the source.

`AxisState.INTRINSIC` on a template side is the one **validation** change Phase 2 makes:
Phase 1 could represent "deliberately unmodelled" on a resolved state but not *request*
it. No source adapter was written for any system that does not exist — no saved store, no
historical replay, no observed source, no external provider.

---

## 6. Normalization

**`normalize.py`.** Canonical, deterministic, and fail-closed at every reference.

| Axis | Canonical form | Unknown reference |
|---|---|---|
| Champion | `ChampionIdentity.champion_id` slug, via the Mastery registry (aliases resolve: `Nunu & Willump` → `nunu`) | `NormalizationError(unknown_champion)` |
| Form | the canonical label from `formula_state_providers.FORM_LABELS`, the repository's one Form vocabulary | `NormalizationError(unknown_form)` — including a champion that declares no form |
| Level | positive int, or a rules-evaluated `LevelRule` | `illegal_level` (rules) / `level_rule_unsupported` (no rule declared) |
| Ability ranks | `{slot → int}` over slots **read from the champion's kit** (`champion_abilities`) | `unknown_ability_slot` / `illegal_rank` / `rank_rule_unsupported` |
| Items | `item_canonical.canonical_item_id` as a string, accepted by id or by name (punctuation- and case-insensitive through the canonical normalizer), restricted to `validated_current` **and** `is_current_sr` for this ruleset, then **sorted** | `NormalizationError(item_not_current)` |
| Runes | the canonical `runes.rune_name`, then sorted | `NormalizationError(unknown_rune)` |
| Shards | — | **always** `NormalizationError(unknown_shard)` (§9) |
| Position | passed through as stated | — |

Determinism: the item and rune sequences are sorted into a canonical order, so the
`SetupInputs` a state carries — and therefore what a freeze would record — is order-free
in the same way identity already was. Purchase order is not a setup axis; an explicit
`ItemEntry.slot` is the only positional meaning there is, and it survives the sort.
Neither the template nor the `SetupRecord` is ever mutated: a test round-trips a template
through two normalizations and compares its plain projection.

One rank rule is evaluated, `max_legal_at_level`, and it is answered **by the rules
authority** — so it is correct for Karma and Udyr as well as Ahri, and refuses where their
availability rule is undeclared. An unrecognized rule id refuses; it is never ignored.

---

## 7. Derived champion state

**`derive.py`.** `derive_side(conn, inputs, rules, *, db_lookup_name, …) → DerivedBlock`.
Deterministic, and it computes nothing about combat.

Each stat family publishes up to four values, named precisely so nobody reads a level-1
number as "the" number:

```
<stat>.base       the canonical base value (what champion_stats holds)
<stat>.at_level   the base scaled to this state's level
<stat>.total      at_level composed with the item contribution
<stat>.bonus      total − at_level, so it is right for a flat item stat, a percent one
                  and a multiplicative fold alike
```

### 7.1 Supported axes

| Axis | Read for a number? |
|---|---|
| `level`, `ability_ranks`, `items` | **yes** |
| `form`, `position`, `runes`, `shards` | carried, no number read |

### 7.2 Supported derived axes

| Metric family | Status | Derivation |
|---|---|---|
| `health`, `attack_damage`, `armor`, `magic_resist` | supported | Mastery fact + level curve; item flat sum |
| `resource` (mana pool) | supported, or `not_applicable` per the canonical resource authority | same |
| `health_regen`, `resource_regen` | supported | the canonical item `hp5` / `mp5` are **percentages of base regeneration**, folded multiplicatively plus any flat per-5 |
| `attack_speed` | supported | `calculate_champion_attack_speed_at_level`, then `finalize_attack_speed` for the external percent |
| `movement_speed` | supported | `soft_cap((base + msflat) × (1 + ms%/100))`, plus the one declared champion self-percent |
| `attack_range` | supported (level-invariant) | canonical base |
| `ability_power.total` / `.bonus` | supported, item-only | canonical item stat sum |
| `ability_haste.total` / `.bonus` | supported, item-only | canonical item stat sum |
| `ability.<slot>.cooldown.base` | supported at the requested rank | canonical progression at the rank |
| `ability.<slot>.cooldown.effective` | supported | `base × haste_to_cooldown_multiplier(AH)`, or `base` when the row says haste never applies |
| `ability.<slot>.cost` | supported, in the row's **own** resource (`mana`/`energy`/`health`) | canonical progression at the rank |
| `runes.stat_contribution` | **unsupported** | §9 |
| any pair-derived metric | **none exist** | §10 |

The `MOVE_SPEED` / `FLAT_MOVE_SPEED` pair is honoured the way `calculate_build_stats`
already re-keys it at its own sum: canonical `ms` is a **percent** despite its name.
Reading that pair the wrong way round is a real unit defect, and it is avoided here.

### 7.3 Unsupported axes, and the exact blocker for each

| Not derived | Blocker |
|---|---|
| Rune numeric effects | no revision on the `runes` store; the nine `rune_stats` rows are conditional maxima (§9) |
| Stat shard numeric effects | no shard store, no id space, so no identity to resolve (§9) |
| Item passives and actives (Rabadon's ×1.3, spellblades, on-hit, shields) | mechanics, not base stats. The design defers them to LATER; `item_effects` is empty locally and the behaviour lives in ~30 runtime modules. |
| Bonus HP / armor / MR *beyond the item sum* | nothing in the build path derives them; not needed |
| Crit chance, crit damage, lethality, penetration, lifesteal, omnivamp, heal power, tenacity, gold/10 | present on canonical items and **recorded as a resolution warning**, never dropped in silence and never folded into a metric whose semantics are contested (the two existing penetration helpers disagree on 0–1 vs 0–100; crit composition is a combat rule) |
| Damage, mitigation, effective resistance, any pair value | combat. Out of scope for Phase 2 by the brief. |
| Summoner spells, encounter state (current HP, buffs, stacks, cooldowns in flight, gold) | not setup state at all |

### 7.4 One place Phase 2 derives MORE than Mastery does, on purpose

Mastery's projection publishes an ability cooldown only for the ranks its
**question-eligibility** gate admits, and `_rank_frame` refuses any progression whose
length is not 5/5/5/3 (`nonstandard_rank_count`). That is a publication policy, not a
derivation limit. Measured across all 692 ability rows, only **three** rows have a stored
progression whose length disagrees with the declared rank ceiling — Aphelios Q/W/E, whose
six values are five weapons and a pad.

So cooldown and cost are read from the canonical row **at the rank**, with one
precondition that keeps the index honest: the progression's length must equal the rank
ceiling the rules authority declares for that slot. Results:

```
Udyr   Q rank 6   cooldown 6.0 s   cost 20     supported
Yuumi  Q rank 6   cooldown 6.5 s   cost 75     supported   (wiki: "50 to 75 6")
Karma  R rank 4   cooldown 34.0 s              supported   (the number champion_state
                                                            records League giving where
                                                            the old 3-rank clamp said 36)
Aphelios Q rank 3                              unsupported(rank_domain_mismatch)
Jayce  Q rank 6                                unsupported(cooldown_shape_unsupported)
```

The gate's **shape** predicates are reused unchanged, because those say the column is not
a cooldown at all: a dual-form row (Jayce's slots hold two different spells in one
column) and a column holding an inter-cast gate rather than the cooldown that governs
sustained use.

**Zero is read the way the store means it in that column.** The eligibility gate treats
an all-zero progression as `no_cooldown` and drops an individual zero rank, so a zero
here is `unsupported(no_canonical_value)` — the exact opposite of the AP rule below, and
deliberately so: AP has no sentinel and this column has one.

---

## 8. Derived-value status, and no silent zero

Every entry carries one of three statuses, and the Phase 1 contract enforces the shape:
a `supported` value must have a number, an `unsupported` or `not_applicable` value must
**not**, and an `unsupported` value must carry a reason.

| Case | Status | Note |
|---|---|---|
| Ahri with no AP item: `ability_power.total = 0` | **supported**, `value = 0.0`, `reason = None` | Zero really is the answer. The brief's own example. |
| Garen's resource pool | **not_applicable**, `reason = resource_not_held` | Per the canonical resource authority — *not* per `champion_stats.mp`, which is populated for manaless champions (a test asserts that column is non-null for Garen). |
| Rune numeric contribution | **unsupported**, `rune_effects_unsupported` | no number, ever |
| Level 19 (if the rules ever allowed it) | **unsupported**, `derivation_support_range` | never clamped |
| No level in the state | **unsupported**, `level_not_specified` | |
| Aphelios Q at rank 3 | **unsupported**, `rank_domain_mismatch` | |
| A free ability's cost | **not_applicable**, `ability_has_no_cost` | a property of the ability |
| Rank 0 (not learned) | **not_applicable**, `ability_not_learned` | |
| Movement speed "at level" | **not_applicable**, `stat_not_level_scaled` | Mastery's own metric spec refuses a level axis for it |
| A missing `champion_stats` row | **`SourceIntegrityError`** | none of the three. The inputs named a champion the data cannot describe, and it is never answered with zeros. |

The existing unsafe behaviours the architecture audit listed — missing champion → zero
base stats, unknown item → zero stats, unknown rune silently ignored, unknown shard
ignored, ranks and levels clamped — are **not inherited**. None of the modules that
exhibit them was changed; the strictness is enforced at the new boundary while the
low-level formulas inside them are reused.

---

## 9. Runes and stat shards

| | Represented in `StateTemplate`? | Canonical identity resolvable? | Numeric derivation supported? | Exact blocker |
|---|---|---|---|---|
| **Runes** | **yes** | **yes** — by name, against `runes.rune_name`, refusing anything else | **no** | Two independent reasons. (1) `mastery.runes.rune_provenance` is the repository's own statement: the table has *"no source revision, no captured effect values, no patch binding"*, every rune is `UNVERSIONED` + `UNCERTIFIED`, and *"rune numerical effects must be excluded from authoritative calculations"*. The basis therefore cannot name a version for a rune value. (2) The nine `rune_stats` rows are **conditional maxima**, not unconditional stats — Absolute Focus 30 AP below a health threshold, Gathering Storm 48 AP after a game-clock delay, Legend: Alacrity 18% AS at full stacks, Magical Footwear 10 MS only once boots arrive. Summing them unconditionally, which `calculate_rune_stats` does, would publish a number the state never reaches. |
| **Stat shards** | **yes** | **NO** | **no** | There is no `stat_shards` table and no shard id space anywhere. The only shard knowledge in the repository is three literals inside `champion_stat_profile.apply_stat_shards`, which also silently ignores an unrecognized shard and needs an `adaptive_type` decision no authority supplies. Accepting a shard key would be inventing an identity space, so normalization refuses with `unknown_shard` and says exactly that. |

A state carrying runes resolves fully; only `runes.stat_contribution` is unsupported, and
everything else in the block is derived normally. One unsupported rune effect never
delays a `ResolvedState`.

---

## 10. Matchup resolution

Each side resolves **independently** — its own champion, form, position, level, ranks,
items, runes and its own `DerivedBlock` — against **one** shared concrete `DataBasis`,
one ruleset and one `rules_rev`.

* **Asymmetry is ordinary.** Ahri level 7 against Syndra level 6 is a state. So are
  different ranks, different items and different runes per side. Tested as four separate
  cases.
* **Caller order is not an input.** Sides are put in canonical order by
  `(champion slug, side setup key)` before either identity is computed. `(Ahri, Syndra)`
  and `(Syndra, Ahri)` give the same key, the same digest, and the same ordered sides.
* **A setup never detaches from its champion.** Whole sides move. "Ahri 7 / Syndra 6" is
  a *different* state from "Ahri 6 / Syndra 7", and a test reads the levels back per
  champion slug to prove which one is which.
* **No attacker/target direction is in state identity.** A test projects the whole state
  to plain data and asserts the words `attacker`, `target`, `defender` and `source_side`
  do not appear in it. Direction belongs to a question's `ScenarioBinding`.
* **Mirror matchups** with different setups resolve, ordered deterministically by setup
  key.
* **`pair_derived` is `None` for every Phase 2 state.** No pair metric is in the support
  manifest, because every pair value the design lists (damage, mitigation, penetration)
  is combat.

No Matchup question generation is wired, and the Matchup composer is untouched.

---

## 11. Identity — one focused correction

| Identity | Built from | Excludes |
|---|---|---|
| `semantic_state_key` | ruleset + per-side canonical setup inputs, sides in canonical order | basis, derived values, provenance, template, label |
| `resolved_state_digest` | the key + **every derived value** (metric, status, reason, value, unit, derivation, dependencies) | provenance, basis id and label, per-value store revisions, **and now the rules / derivation revisions** |
| question identity | `bind_identity(material, binding)`; an empty binding returns the same object | provenance (structurally unreachable) |

### 11.1 What changed, and why

Phase 1 hashed `rules_rev` and `derivation_version` alongside the values, because the
design's §8.2 listed them (recorded as Phase 1 ambiguity A-6). The consequence: a
refactor of the derivation code, or a rules-data edit that moved no number a state reads,
moved the digest of a state whose every resolved value was identical. That makes an
implementation change indistinguishable from new data.

Phase 2 applies the owner's preferred rule:

```
semantic_state_key       = setup identity
resolved_state_digest    = the exact meaningful resolved VALUES
rules_rev / derivation_version / resolver_version / basis = PROVENANCE
```

The revisions are still recorded — on `ResolvedSharedContext` and `ResolutionRecord` —
so *"which rules ran"* stays answerable. The material now carries an explicit
`digest_contract: "resolved_state_digest.v2"` marker, so a change of rule can never be
mistaken for a change of value.

**Nothing consumed the Phase 1 digest** (the package had no importer), so this is a
contract correction, not a migration. The guarantee that matters is untouched and tested:
a value that moves moves the digest, and a status changing from `supported` to
`unsupported` moves it too.

The one Phase 1 test that pinned the old behaviour was inverted and its docstring now
records why. **No existing Mastery question identity changed** — `fact_id`,
`candidate_id`, `candidate_key`, `content_digest` and `FactContext` are untouched (§12).

### 11.2 Verified

* Same setup → same key and same digest.
* Manual and curated sources with the same resolved values → same key, same digest,
  different provenance.
* A changed derived value → same key, different digest.
* A rules revision, a derivation version, a basis fingerprint and a patch label all
  changed together, values identical → **same digest**.
* `absent_unrequested`, `intrinsic` and a specified value give three different keys.
* `template_key` is provenance: two different templates (literal ranks vs
  `max_legal_at_level`) that resolve to the same state share both identities and differ
  only in `template_key`.
* `verify_resolved_state` recomputes both identities from the state's own contents and
  asserts canonical side order.

---

## 12. Backwards compatibility

**Nothing a player sees moved.** Phase 2 has no consumer, so the only ways it could have
changed an answer are import-time mutation or authority drift. Both are checked.

| Check | Result |
|---|---|
| A **subprocess that never imports `mastery.setup_state`** (asserted inside the subprocess) builds Champion banks and Matchup comparisons for 7 champions and 3 pairs | every `candidate_id`, `candidate_key` and `content_digest` equals the run that *does* import the package |
| Champion Mastery output | unchanged |
| Matchup Mastery output | unchanged |
| `bind_identity(material, EMPTY_BINDING)` on every live candidate for 7 champions | returns the **same object**, the canonical JSON is byte-equal, and `content_hash` reproduces `candidate_id()` |
| A non-empty binding | does change identity, and never mutates the original material |
| The resolver's values vs Mastery's facts, 7 champions | every `.base` equals the Mastery fact with no context; every `.at_level` equals the Mastery fact at that level |
| Ability cooldowns vs Mastery's facts, 7 champions | identical wherever Mastery publishes one |
| Shared authorities after importing the package | `riot_level_multiplier`, `finalize_attack_speed` and `haste_to_cooldown_multiplier` are the same objects — nothing is monkeypatched |
| `git status` shape | every changed `.py` file is under `mastery/setup_state/` or `mastery/tests/` |
| `FactContext`, `identity_material`, `candidate_key`, `_key_for`, `BANK_LEVELS`, `projection.MAX_LEVEL`, the generator registry, the publication gate, `resolver.publish`, `mastery_slice`, `mastery_config`, the Generator Lab, `mastery_artifact`, `CanonicalMasteryState`, Journeys, Combat Lab, the frontend | **all unchanged** |

---

## 13. No serving wiring — the guard, reworked deliberately

Phase 1's rule was *"no importer at all, and the package loads nothing"*. Phase 2
legitimately needs to read canonical data and reuse existing formulas, so a rule
forbidding `import champion_state` would force the resolver to **copy** the per-champion
rank ceilings — the exact duplication this workstream exists to remove. The guard is
therefore split along the direction of the dependency, which is where the safety lives:

```
setup_state  →  canonical services    ALLOWED, and the point of Phase 2
serving      →  setup_state           FORBIDDEN
tests        →  setup_state           allowed
```

`mastery/tests/test_setup_state_isolation.py`, 55 tests, checks all of this mechanically:

1. **No serving importer.** An AST scan plus a text scan (which catches `importlib`
   strings) over every tracked or untracked non-ignored `.py` file, restricted to a
   serving prefix set **derived from the repository's own declared footprints**
   (`facts_support.MASTERY_PACKAGES + GR1_PACKAGES`, minus this package) plus `quiz/`,
   `routes/`, `api_server.py`, `schemas/`, `ranked_modules/`, `ranked_public/`,
   `services/`, `team_combat/` and the four Journey packages (`mastery/state/`,
   `mastery/transitions/`, `mastery/chains/`, `mastery/publication/`). A separate test
   asserts the prefix set actually covers the paths that matter, so it cannot silently
   shrink. A negative control proves the scan is not vacuous, with and without a prefix.
2. **The stronger claim, still true today:** *no* production module imports it at all.
   Keeping this means the first wire-up in a later phase has to edit this file on
   purpose.
3. **Tests may import it**, and the whole stack resolves.
4. **The contract half keeps every Phase 1 property.** `contract`, `errors`, `identity`
   and `validation` import only the stdlib and `mastery.provenance.hashing`, perform no
   I/O, and contain no integer literal other than 0, 1 and 2. A **static import closure**
   over those four modules proves they cannot reach `sqlite3` or any forbidden package —
   which the Phase 1 runtime check can no longer show on its own, since the package
   `__init__` now loads the resolution half too.
5. **Every canonical read is deferred.** Importing *any* module of the package loads no
   generator, gate, route, Ranked module, Journey package or web framework — the heavy
   authorities are imported inside the functions that need them. A negative control
   proves the detector sees a real leak.
6. **Game-rule numbers live in exactly one module.** No resolution module except
   `rules.py` may contain 18, 16, 11, 9, 7, 6, 5 or 3 as an integer literal. `rules.py`
   *names* the ceiling table and does not restate it; the derivation's level range is
   read from `projection` and a test asserts `MAX_LEVEL` is not a literal in `derive.py`.
7. **No ability-slot letter appears in any logic.** The only place `"Q"`, `"W"`, `"E"` or
   `"R"` appears in the package is inside the declared rank-availability table, and a
   test asserts that is the only assignment anywhere that names one.
8. **The module set is pinned**, split into its contract and resolution halves.

The no-serving-importer claim is additionally asserted from
`test_setup_state_backwards_compat.py`, so it does not live in a single file.

---

## 14. Test results

Run with `~/League_Combat_Simulator/.venv/bin/python -m pytest` in
`~/lcs-wt-gr1-state2`, with `lol_calc.db` symlinked (gitignored, opened read-only).

| Run | Result |
|---|---|
| New `test_setup_state_resolution.py` | **102 passed** |
| New `test_setup_state_backwards_compat.py` | **23 passed** |
| Reworked `test_setup_state_isolation.py` | **55 passed** (was 26) |
| Phase 1 `test_setup_state_{contract,identity,legacy_invariance}.py` | **78 passed** |
| Focused suites (34 files: knowledge bank, champion facts, every `test_gr1_*`, identity, footprint guard, Ranked mastery, Generator Lab) **at the base `88c9f7a0`** | 994 passed, 5 skipped, **0 failed** |
| The same 34 suites **+ the 2 new files** at `35e08c11` | 1149 passed, 5 skipped, **0 failed** |
| **Whole `mastery/tests` at the base `88c9f7a0`** | **5 failed**, 1830 passed, 13 skipped |
| **Whole `mastery/tests` at `35e08c11`** | **5 failed**, 1985 passed, 13 skipped |

**The failure set is byte-identical**, and every one of the five predates Phase 2:

```
test_audit_db.py::test_pool_and_certified_counts              (audit-DB drift)
test_audit_db.py::test_lux_q_cooldown_conflict_surfaced        (audit-DB drift)
test_audit_db.py::test_json_roundtrips_and_schema              (audit-DB drift)
test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
                                        ('ranked_points_v2' == 'ranked_modern')
```

The counts reconcile exactly: 1830 + 102 + 23 + 29 (isolation growth) + 1 (one new
identity test) = 1985.

---

## 15. Roster-wide validation

Read-only, against the real `lol_calc.db` (local patch 26.16), **not committed** per the
project rule. Four levels — 1, 6, 11, 18 — with max-legal ranks where the rules authority
can answer them and level only where it refuses.

```
roster in the identity registry                            173
champions structurally resolvable                      173/173
(champion, level) states fully derived on the core axes 692/692
distinct resolved_state_digest values                      692
FAILURES                                                     0
SILENT-ZERO / STATUS VIOLATIONS                              0

derived value statuses    supported 34,343 · not_applicable 3,378 · unsupported 599
```

Core axes: `health.total`, `armor.total`, `magic_resist.total`,
`attack_damage.total`, `attack_speed.total`, `movement_speed.total`,
`ability_power.total`, `ability_haste.total`.

**Unsupported, by reason** (599 of 38,320 values, 1.6%):

| Reason | n | What it is |
|---|---|---|
| `cooldown_shape_unsupported` | 328 | 53 (champion, slot) rows: a dual-form name or a column holding an inter-cast gate |
| `no_canonical_value` | 136 | a zero or absent progression entry — the store's own sentinel |
| `cost_resource_unsupported` | 111 | 29 rows whose `cost_resource` is absent, unrecognized or non-scalar |
| `rank_domain_mismatch` | 24 | Aphelios Q/W/E only |

**Not applicable, by reason** (3,378): `stat_not_level_scaled` 1,384 (movement speed and
attack range), `no_item_stat_contributes_to_this_stat` 692 (attack range), 
`ability_not_learned` 492, `resource_not_held` 448 (manaless champions), 
`ability_has_no_cost` 362.

**Rank-availability coverage.** 6 of 173 champions have a non-ordinary rank domain
(`elise`, `jayce`, `karma`, `nidalee`, `udyr`, `yuumi`); 2 of their slots have a declared
availability rule (`karma/R`, `nidalee/R`). The rest refuse with
`rank_rule_unsupported` when a level is present, which is the designed answer.

**Item-bearing states**, via the curated source at level 18, all 173 champions:

```
curated build path lengths            6 items: 146 champions · 7 items: 27 champions
resolved with the whole path          146   (27 refused: inventory_policy, 7 > 6 slots)
resolved truncated to six items       173   (0 refused)
item resolution failures                0   (no stale item name in the whitelist)
```

The 27 refusals are the inventory rule working: the curated file's paths run to seven
entries for those champions, and the boundary refuses rather than dropping one. Unmodelled
item stats present across those builds, each recorded as a resolution warning:
`TENACITY` 50, `MAGIC_PEN` 43, `MAGIC_PEN_PERCENT` 39, `HEAL_POWER_PERCENT` 10,
`ARMOR_PEN_PERCENT` 9, `LETHALITY` 8, `LIFESTEAL_PERCENT` 7, `CRIT_CHANCE` 2,
`CRIT_DAMAGE_PERCENT` 2, `GOLD_PER_10` 1, `OMNIVAMP_PERCENT` 1.

**Matchup sample**, 60 random pairs (seed 0), asymmetric levels 11 vs 6:

```
resolved                60/60
failures                    0
reversal mismatches         0   (same key AND same digest from either call order)
```

---

## 16. Out of scope — confirmed not done

No serving wiring of any kind. No Champion Mastery or Matchup Mastery serving change. No
slice composition change. No Full mode. No state-aware question family. No tie-policy
change. No QCA change. No Journey change. No Combat Lab change. No combat, damage,
mitigation or penetration chain. No frontend. No DB migration, no DDL, no schema change.
No external data provider. No frozen-artifact persistence redesign — `mastery_artifact`
is untouched and `FrozenStateArtifact` is still written nowhere. No config key, no flag,
no deploy-time state. Phase 3 not begun.

---

## 17. Phase 3 boundary and remaining blockers

**Phase 3** is the first real consumer: a state-aware family in the **Generator Lab**,
admin-only and behind a flag, with `resolver.publish` receiving its universe instead of
re-projecting it inside `_build_universe`. When that lands, the isolation guard's
`test_no_production_module_imports_the_package_at_all` must be removed **deliberately**;
`test_no_serving_module_imports_the_package` stays true forever.

Blockers and decisions Phase 3 will meet:

1. **No per-metric precision registry exists** (carried from Phase 1 ambiguity A-4). A
   `ScenarioBinding` keeps integral floats as ints and everything else exactly, so the
   producer must round. The first state-reading family has to declare precision per
   metric or two answer-equivalent states will get two identities.
2. **`resolver.publish` re-projects its universe.** Until the second half *receives* the
   universe, a resolved state handed to the first half cannot reach composition. The
   design flags this as Stage 3's first job; a byte-identity probe should be run alone.
3. **`FrozenStateArtifact` is not written anywhere**, and it is one block per state. A
   multi-state container (a slice window or a sequence) is a Stage 3/4 decision;
   `StepBinding` already carries the digest, so it can be added without changing the type.
4. **The patch-identity mismatch of §3.1** — a state's `DataBasisId` and a Mastery
   artifact's `patch_key_digest` are not interchangeable. Unifying them is a Mastery
   identity change.
5. **The identity registry can fall back to the curated six.** `get_identity_registry`
   opens its own read-only connection from `LOL_CALC_DB_PATH` or the repo root and falls
   back to `CURATED_CHAMPION_IDENTITIES` when it cannot read the roster. The resolver
   uses the same registry Mastery does, so it inherits that behaviour; fixing it would
   change Mastery too, and it is out of scope here.
6. **Rank availability is undeclared for 4 champions' anomalous slots** (`elise/R`,
   `jayce/*`, `udyr/*`, `yuumi/Q`). Each needs a wiki sentence, not a guess. Until then a
   state combining a level with one of those ranks refuses — which is correct, and is
   also a coverage limit a generator policy has to know about.
7. **Runes and shards stay unsupported** until a versioned store exists (§9). Runes need
   a revision column *and* a conditional model; shards need a table at all.
8. **Open design decisions Phase 2 did not settle:** D-6 (asymmetric matchup
   *generation* policy), D-11 (may Full ask what Slice's window-local policies cap),
   D-12/D-13 (Full traversal, transition candidates), D-14 (frozen payload), D-17
   (eligibility of state-reading families), D-20 (`{AH: 0}` vs intrinsic as a composition
   policy).

**Rollback:** `git revert 89b5ce4b`. Nothing to un-migrate, and no caller exists to break.
