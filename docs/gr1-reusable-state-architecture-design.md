# GR1 — Reusable state architecture: design proposal

**DESIGN ONLY. Nothing was implemented.** No runtime code, schema, migration, generator,
composer, tie policy, QCA behaviour, Applied-chain, Combat Lab or frontend UI was touched.
This document proposes contracts at the type level and asks the owner to decide. Owner
decisions and recommendations appear **only in §16**. The earlier sections describe the
proposal and give the reasons for it.

| | SHA | Note |
|---|---|---|
| Backend read | `origin/master` **`b1fd3510`** | The brief named `5769dee3` (the QCA8 correction). `origin/master` has moved one fast-forward commit since then, `b1fd3510` (*"shared Energize bar…"*). It touches 18 files, all items, combat and simulator; `git diff 5769dee3 b1fd3510 -- mastery/ quiz/ ranked_modules/` is empty. Read from a clean detached worktree. |
| Frontend / docs base | `origin/main` **`3c9ddfc4`** | Matches the brief. Docs worktree branched from it. |
| Inputs | `gr1-reusable-state-architecture-audit.md` (audit, `fc2e8be9`), `gr1-qca8-mastery-eligibility-intent-audit.md`, `gr1-matchup-mastery-structural-audit.md`, this repo's handoff | Every code reference below was re-read at `b1fd3510`. Line numbers are approximate where a file has moved. |

The core rule, as the owner stated it:

> **QUESTIONS CONSUME STATE. QUESTIONS DO NOT OWN OR HARDCODE STATE.**
> **ONE GENERATED QUESTION UNIVERSE → FULL composer / SLICE composer.**

---

## 0. The design in one page

```
StateTemplate ─(source resolution)→ SetupRecord per side ─(canonical normalization)→ SetupInputs
      │                                                                                │
      │                                                            (derivation authority)
      │                                                                                ▼
      │                                                   ResolvedState = inputs + derived + data_basis
      │                                                                                │
      │                                   candidate generation: Fact × ScenarioBinding  ▼
      │                                   (a family reads only the axes it declares)
      │                                                                                │
      └── identity: template_key         publication gate → Slice / Full composer → presentation
                                                                                       │
                                                        FrozenStateArtifact (private, write-once)
```

Eight load-bearing ideas:

1. **The reusable state covers SETUP only**: champion, form, level, ability ranks, items,
   runes, shards and position. **Encounter** state (current HP or resource, buffs, stacks,
   cooldowns in flight) is a separate optional layer. It is not part of the minimum. This is
   what stops the state becoming a god object (§13).
2. **Three layers, never merged.** A *template* is a request. A *resolved state* is exact
   values, computed only from inputs. A *frozen artifact* is what was served, and it never
   re-resolves.
3. **Sources feed templates. Generators never see sources.** Current default, manual,
   saved, historical and internal build sources all produce one normalized `SetupRecord`.
4. **Derived values are always recomputed from inputs, never stored or edited as inputs.**
   Each derived value carries a status: `supported`, `unsupported` or `not_applicable`.
   `unsupported` is never zero.
5. **`FactContext` stays intrinsic**, as its docstring requires. Scenario inputs travel in a
   separate **`ScenarioBinding`**. For every current family the binding is empty, so every
   existing `fact_id`, `candidate_key`, `mastery:` ref and artifact digest is unchanged.
   This is the property that makes migration additive.
6. **Question identity is the dependency projection of the resolved state.** It holds only
   the resolved inputs the answer actually depends on. It is never a hash of the whole state.
7. **A matchup is two independent side states plus one shared context and a pair-derived
   block.** Opponent and target roles belong to the *question*, not to either side.
8. **One universe for Full and Slice**: candidates are generated per state, over an ordered
   state sequence. Full walks the sequence and asks a question again only when its
   dependency projection changes. Slice picks a coherent window and runs the existing budget
   composer inside it. Today's generator is the degenerate case: an intrinsic universe with
   no sequence.

---

## 1. The minimum reusable state contract

Everything below is conceptual. The type sketches use a Python-like notation for precision
only. They are not a schema, not code and not a table.

### 1.0 Shared vocabulary

| Term | Meaning |
|---|---|
| **Axis** | One setup dimension: `level`, `ability_ranks`, `items`, `runes`, `shards`, `form`, `position`. |
| **Axis value states** | Each axis on a *resolved* side is exactly one of: `specified(value)`; `intrinsic` (the state deliberately does not model this axis, as with base stats that have no level); or `absent_unrequested` (nothing asked for it and no consumer reads it). There is **no** "unknown means zero" state. If a consumer needs an axis and it cannot be resolved, resolution **fails**. It never produces a value. |
| **Read-set** | The axes and derived values a question family declares it depends on. Resolution must satisfy the read-set of every consumer that will use the state. Unread axes do not enter question identity. |
| **Data basis** | The canonical data a state was resolved against: patch label, machine projection key and per-store revisions (§9). |

### 1.A `StateTemplate` — a reusable request for a scenario

**Purpose.** To describe *which* scenario is wanted, possibly by reference ("Ahri, level 11,
curated common build path 1"), in a form that can be stored, versioned, edited and resolved
again later. A template holds no computed values.

```
StateTemplate
  template_schema_version : str              REQUIRED  e.g. "state_template.v1"
  kind                    : "champion" | "matchup"   REQUIRED
  sides                   : tuple[SideTemplate, 1..2] REQUIRED  (1 for champion, 2 for matchup)
  shared                  : SharedContextTemplate    REQUIRED
  template_ref            : TemplateRef | None       OPTIONAL  identity when saved (§8)
  label                   : str | None               OPTIONAL  display only, never identity

SideTemplate
  champion       : ChampionRef          REQUIRED  canonical slug (never display name)
  form           : str | None           OPTIONAL  only for multi-form champions
  position       : Position | None      OPTIONAL  top/jungle/mid/bottom/support; only if a consumer reads it
  setup_source   : SourceRef | None     OPTIONAL  where unspecified axes come from (§4)
  level          : int | LevelRule | None       OPTIONAL
  ability_ranks  : RankMap | RankRule | None    OPTIONAL
  items          : ItemList | None      OPTIONAL  ordered list of canonical item ids
  runes          : RuneList | None      OPTIONAL
  shards         : ShardList | None     OPTIONAL

SharedContextTemplate
  data_basis     : "current" | PinnedBasis      REQUIRED  (§9; "current" is the only resolvable value NOW)
  map_mode       : "summoners_rift"             REQUIRED  single value NOW; exists so ARAM/Arena never
                                                          silently share a state with SR
```

*Rules* such as `RankRule.max_legal_at_level` or `RankRule.from_skill_order_source`, and
`LevelRule` (for example a named checkpoint), let a template express *how* to derive an
input without writing its value down. That is how "rank = highest legal at level 11"
(Applied-chain's `applied_chain.py` rule, today hard-coded in the generator) becomes data.

**Precedence.** An axis value written literally in the template overrides the source. The
source fills only the axes the template leaves `None`. An axis that is still `None` after
the source has run ends up `absent_unrequested` or `intrinsic`, or resolution fails, as
decided by the read-sets (§11).

**Identity and version.** `template_schema_version`; `template_key` (a readable canonical
string over sides and shared, §8); for saved templates, `template_ref = {namespace, id,
revision}`. A template edit makes a new revision. Nothing is edited in place (§10).

**Must NOT own:**
- derived numbers of any kind (HP, AD, cooldown, …)
- question content, prompts, answer values, or which families to ask
- encounter state (current HP/resource, buffs, stacks)
- presentation (art, labels shown to the player beyond `label`)
- a concrete patch's *values* (it may name a basis; it never copies data)
- generator identity (a template is consumable by any generator)

### 1.B `ResolvedState` — the exact concrete state

**Purpose.** The fully specified, canonically normalized setup, with every derived value
computed by one derivation authority against a known data basis. It is the only thing a
candidate generator receives.

```
ResolvedState
  resolved_schema_version : str                    REQUIRED  "resolved_state.v1"
  kind                    : "champion" | "matchup" REQUIRED
  sides                   : tuple[ResolvedSide, 1..2] REQUIRED  canonical side order (§3.4)
  shared                  : ResolvedSharedContext  REQUIRED
  pair_derived            : PairDerived | None     matchup only (§3.3)
  resolution              : ResolutionRecord       REQUIRED  provenance of HOW it was resolved
  state_key               : str                    REQUIRED  readable input identity (§8)
  state_digest            : str                    REQUIRED  hash(state_key, data_basis machine key) (§8)

ResolvedSide
  inputs   : SetupInputs        REQUIRED  normalized, canonical ids, legality-checked
  derived  : DerivedBlock       REQUIRED  every entry has a status
  sources  : SideProvenance     REQUIRED  per-axis: which source supplied it (§4)

ResolvedSharedContext
  data_basis : DataBasis         REQUIRED  (§9)
  map_mode   : "summoners_rift"  REQUIRED

ResolutionRecord
  template_key, template_ref?     what was asked
  resolver_version                the pipeline version (provenance, never dispatch — mirrors Phase 4's generator_version rule)
  derivation_version              version of the derivation authority
  warnings                        non-fatal notes (e.g. "rune numeric effects excluded by policy")
```

**Must NOT own:**
- its template's *references*. It records them as provenance. It does not keep a live link
  that could re-resolve it.
- question content, selection, ordering or seeds
- encounter state (§2.4 and §10)
- UI or interaction state
- any value that was not derived from its own `inputs` + `data_basis` (no caller-supplied
  "derived" overrides; compare `ChampionCanonicalState.derived`, which is explicitly
  non-authoritative evidence)

A `ResolvedState` is **pure and deterministic**: the same template, the same source record
and the same data basis always give the same `state_digest`. Phase 4's `artifact_instance_id`
reproducibility depends on this.

### 1.C `FrozenStateArtifact` — what was served, forever

**Purpose.** To preserve exactly the state (and the values derived from it) behind served
questions, so history never mutates and a served question can be explained without
re-running anything.

```
FrozenStateArtifact                (lives inside the existing private mastery_artifact block — additive)
  frozen_schema_version : str                     REQUIRED
  state_key             : str                     REQUIRED
  state_digest          : str                     REQUIRED
  inputs                : per side SetupInputs    REQUIRED  as resolved (canonical ids + display names at the time)
  derived_used          : per side, only the DerivedValues some served question depended on  REQUIRED
  pair_derived_used     : same, matchup only
  data_basis            : DataBasis               REQUIRED  label + machine key + per-store revisions
  source_provenance     : per-axis source kind/id/version/confidence   REQUIRED
  template_key / template_ref : provenance only   OPTIONAL
  step_bindings         : step_index → (state_digest, ScenarioBinding)  REQUIRED when >1 state is served
```

**Must NOT own:**
- anything that is answer-revealing on the **public** side. The frozen state is private.
  Public exposure is a projection chosen field by field through the existing positive
  allow-lists (`PUBLIC_CHALLENGE_FIELDS`, `StatedContext`, `review_view`), each extended
  deliberately.
- a live pointer to a mutable template or to canonical tables
- re-resolution logic. Readers use it as written, and "absent means unknown" still applies
  to every artifact frozen before the block existed.
- attempt state (that stays in `quiz_attempts`)

**Why only `derived_used`, not the whole derived block.** Two reasons. It bounds the frozen
payload. And it states exactly what the served answers depended on, which is what review
and dispute need. The full block can be recomputed at any time only for the *current* data
basis, so the used values must be frozen.

---

## 2. Champion-side state

### 2.1 Field placement

| Field | Template input | Normalized input (`SetupInputs`) | Derived (`DerivedBlock`) | Why here |
|---|---|---|---|---|
| Champion identity | `champion` slug | slug + registry identity (`mastery/identity`) + display name at resolution | — | The slug is stable. The display name is presentation and is frozen only for history. |
| Form | `form` | canonical form key or `intrinsic` | — | Already an intrinsic `FactContext` axis. It stays one. |
| Position | `position` | position or `absent_unrequested` | — | NOW, no current family reads it. It exists so build sources keyed by role (`champion_item_builds.json` has `primary_role`) can be selected without special cases. |
| Level | int or `LevelRule` | int 1–18, or `intrinsic` | — | Level is an input and never derived. The cap is 18. Combat's clamp to 20 (`combat_helpers`) is not adopted (§11). |
| Ability ranks | map or `RankRule` | `{Q,W,E,R → int}` validated against the rank ceiling **and** the skill-point rule at that level | — | Legality is enforced at normalization, not by consumers. Today the rule has two copies: `transitions._min_level_for_rank` and `combat_scenarios.resolver.validate_rank_for_level`. §16 D-3 picks one. |
| Items / components | ordered canonical item ids | ids resolved against `item_canonical` (`validated_current`, `is_current_sr`), plus `InventoryPolicy` checks (slot limit, unique groups) | item base-stat contributions | Ids, not names. The state holds the item. Its stats come from `item_canonical` at resolution time. |
| Runes | rune keys | canonical rune key, marked `unversioned` | NOW: `unsupported` numeric contribution | No Riot perk id and no revision exists (audit §5). Runes can be **represented** but not **computed** yet. |
| Stat shards | shard keys | canonical shard key | NOW: `unsupported` | No shard table exists, only three literals in `apply_stat_shards`. Same treatment as runes. |
| Derived stats | — | — | HP, resource (max), AD base/bonus/total, AP, armor base/bonus/total, MR base/bonus/total, attack speed, movement speed, ability haste total, attack range | Always computed from inputs. Never an input. |
| Ability-derived | — | — | per slot at the side's rank: base cooldown, effective cooldown under the side's AH, cost and cost resource | Computed by the same authority that produces today's facts (the §5 sources), then adjusted by AH. |
| Provenance | `setup_source` | per-axis `SideProvenance` | per-derived-value `derivation` id + source revisions | Every number can say where it came from. |

### 2.2 Why inputs and derived values are never mixed

Keeping them in one bag, as `ChampionCanonicalState` does with `inventory` next to
`derived`, creates three failure modes that exist today:

1. **An edited derived value drifts from its inputs.** `first_ahri_syndra.py` types
   `_AP = 100.0` and `_TARGET_MR = 30.0` next to a state that does not imply them, and
   guards against drift only with asserts.
2. **Identity becomes unstable.** If derived values are part of a state's identity, a
   harmless data refresh looks like a different scenario. Keeping identity on inputs
   (`state_key`) and values on `state_digest` separates "the same scenario" from "the same
   numbers" (§8).
3. **Unsupported gets confused with zero.** A derived value computed alongside inputs
   invites `get(x, 0)`. A separate `DerivedBlock` where every entry has a status makes
   `unsupported` a first-class value.

### 2.3 `DerivedValue` shape

```
DerivedValue
  metric       : str                         e.g. "armor.total", "ability.Q.cooldown.effective"
  status       : "supported" | "unsupported" | "not_applicable"
  value        : number | None               None unless supported
  unit         : str
  derivation   : str                         which rule produced it, e.g. "level_curve.v1", "haste_multiplier.v1"
  depends_on   : tuple[str, ...]             the input axes / other derived metrics it used
  sources      : tuple[SourceRevision, ...]  store + revision (champion_stats updated_at, item_canonical source_revision, cooldown authority sha)
```

`depends_on` is what makes the dependency projection in §8 mechanical rather than
hand-written. A question that reads `ability.Q.cooldown.effective` inherits its
`depends_on`: Q rank and `ability_haste.total`. Those in turn depend on items (and, later,
runes and shards).

### 2.4 Deliberately not in the champion-side setup state

Current HP and resource, shields, buffs and debuffs, stacks, marks, charges, cooldowns in
progress, and gold. These belong to an **encounter** layer (Journeys, Applied-chain,
Combat Lab). Gold is a property of a progression, not of a setup: "has 1,300 gold"
describes a moment in a game, not a build. §10 and §14 place the encounter layer in
NEXT/LATER.

---

## 3. Matchup state

### 3.1 Composition

```
MatchupResolvedState  (= ResolvedState with kind="matchup")
  sides        : (ResolvedSide, ResolvedSide)   each fully independent: own level, ranks, items, runes, shards, form, position
  shared       : ResolvedSharedContext          ONE data basis, ONE map mode, for both sides
  pair_derived : PairDerived                    values that exist only for the pair
```

| Question | Answer |
|---|---|
| Can both sides have independent level, ranks, items and runes? | **Structurally, yes.** Each side is a complete `ResolvedSide`. This matches what `CanonicalMasteryState` (`champion_a`/`champion_b`) already allows, and what the generated path cannot express today (audit §3). *Whether asymmetric templates are allowed* is a product decision (§16 D-6). The contract should not be the thing that forbids them. |
| Where does opponent or target context belong? | **On the question, not on either side.** A side never refers to the other. "Attacker", "target", "subject" and "opponent" are *roles a question assigns* to side indices in its `ScenarioBinding`. The same pair state serves "who has more armor" (no roles), "A's Q against B" (A = attacker) and "B's Q against A" (B = attacker) without being duplicated. |
| Shared patch and context: once, or per side? | **Once.** Both sides must be resolved against the same data basis. If they come from different bases, the pair is **invalid** and does not degrade. Comparing Ahri on one table revision with Syndra on another is exactly the mixed-source condition Applied-chain has today (live item data plus frozen champion data, audit §4.5). |
| How are target-specific derived values represented? | In **`PairDerived`**, keyed by `(source_side_index, target_side_index, metric)`. Examples: effective armor after the attacker's penetration, and comparison outcomes (winner/tie/margin) for a metric at the pair's resolved state. They are computed by the same derivation authority, with the same statuses. **NOW** the only pair-derived kind is the comparison outcome, which `ComparisonOutcome` already computes. Mitigation and penetration are LATER (§14). |
| How does pair symmetry work? | Sides are stored in **canonical order**: by champion slug, then by side `state_key` for mirror matchups. `(Ahri, Syndra)` and `(Syndra, Ahri)` resolve to the same `MatchupResolvedState` and the same `state_key`. This extends today's order-independent `readiness_key` and the proven reversed-pair digest identity (structural audit §6.4). Directional questions carry direction in their *binding* (`attacker = side 0`) after canonicalization, so direction survives the reorder. |
| What makes two matchup states semantically identical? | The same unordered pair of `(champion, SetupInputs)` side keys **and** the same shared context. Setup stays **bound to its champion**: "Ahri L11 vs Syndra L6" and "Ahri L6 vs Syndra L11" are different states. |
| What makes them different? | Any side input differs (level, ranks, item multiset, runes, shards, form), or the shared context differs. **A data-basis change does not change `state_key`.** It changes `state_digest`, meaning the same scenario with different numbers (§8 and §9). |

### 3.2 Compatibility with today's Matchup

Today a comparison exists only when both facts have an **identical** `FactContext`
signature, with same-slot pairing (`SLOT_RELATIONS`). In this model that is the **symmetric
template**: both sides at the same level and the same ranks, no items. Its binding is
empty, so every current comparison key (`ability_cooldown_compare:Ahri:W:vs:Syndra:W:r2`),
the tie cap, the deprioritization and the diversity policies are unchanged. Asymmetric
templates would produce comparisons at *different* per-side inputs. Those need a distinct
binding and distinct keys, so they can never collide with a symmetric key (§8).

### 3.3 Item comparisons

An "item" comparison in a matchup ("who has more armor after these builds?") is a
`PairDerived` comparison at `armor.total`. Its read-set is `{level, items}` on both sides.
It is not a new kind of state, only a new family reading an existing derived metric. This
is why the design puts items in the state and not in the generator: the family is written
once and the builds come from data.

---

## 4. State source abstraction

### 4.1 The contract

```
SourceRef
  kind     : "literal" | "curated_default" | "saved" | "historical" | "internal_observed"
  id       : str            source-specific identifier (e.g. "champion_item_builds", path index)
  version  : str | None     source revision if the source has one; None is recorded honestly

SetupSource (conceptual protocol — NOT an adapter to build now)
  resolve(champion, position?, request) → SetupRecord | SourceRefusal

SetupRecord                    (normalized, source-independent)
  champion          : slug
  position          : Position | None
  level             : int | None
  ability_ranks     : RankMap | None
  skill_order       : tuple[slot, ...] | None      lets RankRule.from_skill_order_source work
  items             : tuple[item_id, ...] | None   ordered (purchase order kept for progression)
  runes             : tuple[rune_key, ...] | None
  shards            : tuple[shard_key, ...] | None
  provenance        : SourceProvenance

SourceProvenance
  source_kind, source_id, source_version
  classification    : "curated" | "generated" | "professional" | "common_build" | "manual" | "historical"
  confidence        : "low" | "medium" | "declared"      never "high"/"proven" (see below)
  patch_basis       : free text the source declares (e.g. "26.16/26.17 working approximation")
  observed_at       : timestamp | None
```

The generator receives a `ResolvedState`. It never receives a `SourceRef`, a
`SetupRecord` or a source-specific shape. Two templates that resolve to the same
`SetupInputs` produce the same `state_key`, whatever their sources. Source provenance is
recorded (and frozen) but is **not** part of `state_key` (§8, §16 D-8).

### 4.2 Source kinds, mapped to what exists (no external providers)

| Kind | What it is | Existing internal material | Status |
|---|---|---|---|
| `literal` | Manual or custom: the template writes the values itself | — (the template is the source) | NOW |
| `curated_default` | The current default setup for a champion | `quiz/data/champion_item_builds.json`: 173 champions, ordered `build_paths`, `primary_role`, `source_patch_basis`, `confidence`, `needs_manual_review`. Also `mastery/data/build_candidates.py` (Ahri, `CandidateClassification`) | NOW for items. No skill-order or rune-page default exists, so those axes must be literal or rule-based. |
| `saved` | A stored template revision (admin or user) | `ranked_format_configs`, `mastery_generated_recipes` store configs, not states | NEXT (needs storage, out of scope) |
| `historical` | A frozen artifact's resolved inputs, used as a source | Phase 4 `mastery_artifact` (after the §1.C block exists) | NEXT. Re-resolves the *inputs* against current data. Replaying the *frozen values* is the artifact's job, not a source's. |
| `internal_observed` | Setups observed in the project's own data | LIVE1 `live_player_state` (real level-up orders; Riot ids with no mapping). The historical pro corpus has **no** item or rune columns. | LATER. Needs an id mapping first. |

**Confidence normalization is needed.** `champion_item_builds.json` entries carry
`"confidence": "high"` **and** `"needs_manual_review": true` (e.g. Aatrox), and the file
describes itself as a *"whitelist and broad timing prior, not … pick-rate authority"*.
`BuildCandidate` rules out "high" altogether. A source adapter would map the file to
`classification=curated`, `confidence=declared`, and never pass "high" through.
Presentation may say "a common build". It must never say "the recommended" or "optimal"
build (§16 D-9).

### 4.3 Disagreement between sources

A template names **at most one source** per side. There is no merging and no voting.
Literal template fields override the source, explicitly and visibly (the per-axis
provenance records `literal`). Canonical data always overrides a source's claims about game
data: a source can name an item id, but it cannot say what that item's stats are. If a
source names something canonical data rejects (a non-current item, an illegal rank),
resolution **fails closed** with the source named in the error (§11).

---

## 5. Resolution pipeline

| # | Stage | Responsibility | Inputs | Outputs | Owns errors | Existing machinery to use |
|---|---|---|---|---|---|---|
| 1 | **Template validation** | Shape, closed vocabulary, `kind` vs side count, no unknown keys | `StateTemplate` | validated template | `TemplateInvalid` (bad shape, unknown key, 2 sources per side) | The strict unknown-key refusal pattern of `ranked_modules/mastery_config.py` (`_ALLOWED_KEYS`) and `TeamSimCombatantInput` (`_Strict`, `StrictInt`) |
| 2 | **Source resolution** | Fill the axes the template left open from its `SourceRef` | template side + `SourceRef` | `SetupRecord` per side | `SourceUnavailable`, `SourceNoRecord` | New thin readers over existing files and tables (NEXT). NOW: `literal` and `curated_default` only. |
| 3 | **Canonical normalization** | Map to canonical ids; check legality (rank ceiling + skill-point rule; inventory policy; level 1–18; form exists); resolve `LevelRule`/`RankRule` | `SetupRecord` + canonical tables | `SetupInputs` per side; one `DataBasis` for the whole state | `NormalizationError` (unknown champion or item, non-current item, illegal rank, basis mismatch) | `mastery/identity` registry; `item_canonical/runtime_stats.load_canonical_item_stats`; `ValidationContext`/`InventoryPolicy` *rules*; the one chosen skill-point rule |
| 4 | **Derivation** | Compute every `DerivedValue` with status and `depends_on`; `PairDerived` for matchups | `SetupInputs`, `DataBasis` | `ResolvedState` | **Nothing fatal.** Unsupported values are marked `unsupported`. A missing canonical *source* row (e.g. a champion's stat row) is fatal: `SourceIntegrityError`. | Level curve (`champion_stat_profile.riot_level_multiplier` / `calculate_base_champion_stats`); item stat aggregation (the canonical loader, not the name-based wrapper, §11); `calculate_cooldown.haste_to_cooldown_multiplier`; Mastery's fact sources (`mastery/facts/sources.py`) for cooldown/cost authority |
| 5 | **Candidate generation** | For each family: if the state satisfies its read-set, produce candidates as `Fact × ScenarioBinding` | `ResolvedState` + `ChampionFact`s | candidate universe (per state) | A read-set value that is `unsupported` → **skip with a reason code**, never a candidate. Same style as the composer's `no_counterpart_fact` / `collapsed_flat_comparison`. | `mastery/knowledge/bank.py`, `mastery/matchup/composer.py`, `eligible_*_pool` (unchanged for intrinsic templates) |
| 6 | **Publication gate** | Family eligibility | candidates | eligible universe | `family_mode_ineligible` etc. | `mastery/publication_gate` (unchanged) |
| 7 | **Composition** | Slice or Full over one universe (§7) | eligible universe (+ state sequence) | ordered steps | `SELECTION_EMPTY` / `SELECTION_UNDER_FILLED` | `recipe` + `resolver` (Slice, unchanged); Full composer (not built) |
| 8 | **Presentation** | Render steps; expose only allow-listed state to the public side | steps + `ResolvedState` | public/private challenge rows | Presentation refusal (a public field outside the allow-list) | `mastery_slice` renderer, `StatedContext`, `PUBLIC_CHALLENGE_FIELDS` |
| 9 | **Freeze** | Write `FrozenStateArtifact` into the private `mastery_artifact`; per-step bindings | everything above | write-once round payload | Write failure fails the segment (existing) | `mastery/serving/artifact.py` (additive block), `ranked_rounds` write-once |

**Fail-closed ownership.** Stages 1–4 refuse the whole state. Stage 5 refuses individual
candidates. Stages 6–7 refuse the segment only when nothing remains. The existing Phase 2
preflight (`mastery/synthesis/preflight.py` → `SourceIntegrityError` →
`RANKED_MODULE_DATA_UNAVAILABLE`) is where stage 1–4 errors meet the Ranked segment. No new
error channel is needed.

**One important correction to today's flow.** `resolver.publish` re-projects the universe
from the DB inside `_build_universe` (audit §10). With a state, the second half must
**receive** the universe (or the `ResolvedState` it came from), not recompute it. Otherwise
a state given to the first half never reaches the second. This is a migration step (§15),
not a design choice.

---

## 6. Reuse of existing systems

| Component | Verdict | Why |
|---|---|---|
| **`CanonicalMasteryState` / `ChampionCanonicalState`** (`mastery/state/canonical_state.py`) | **Partially reused: its ideas, not the class** | Keep: immutability, one-or-two champions, a `snapshot_id` that excludes lineage/provenance, and the single-patch-reference rule. Do not adopt it as the new contract, because it (a) mixes setup with encounter fields (vitals, buffs, stacks, cooldowns, `custom_state`), (b) holds items by **name**, (c) carries `derived` as non-authoritative caller-supplied evidence, which is the opposite of §2.2, and (d) validates only against *certified* bounds, so an uncertified champion is silently unchecked (§11). It stays the Journeys' state. LATER, a one-way projection `ResolvedState → CanonicalMasteryState` would let Applied-chain start from a resolved setup. |
| **`ValidationContext` / `InventoryPolicy`** | **Reused as rules** | Rank limits, slot limit, unique groups and consumables are exactly the normalization rules in stage 3. Reuse the policy concepts, and the values where they are data. |
| **Journey transitions** (`mastery/transitions/transitions.py`) | **Vocabulary reused; engine left separate** | `LEVEL_CHANGE`, `ABILITY_RANK_CHANGE`, `ITEM_ACQUIRE`, `ITEM_REMOVAL`, `ITEM_COMPLETION`, `COMPONENT_CONSUMPTION` name the setup deltas §10 needs. `apply_transition` mutates a state and carries evidence. The generated path instead **re-resolves** from a changed template, so derived values can never be patched. Encounter transitions (`HEALTH_CHANGE`, buffs, stacks) stay with the Journeys. `ITEM_SALE` stays refused. |
| **Combat Lab stat derivation** (`build_runtime_champion_stats`, `/build-preview`) | **Partially reused: primitives yes, entry point no** | The functions it calls (level curve, `item_canonical` loader, haste formula) become the derivation authority's parts. Its entry point is not the authority: it zero-fills a missing champion (`combat_helpers.py:288-289`), clamps level to 20, takes no ranks, shards or patch, and returns a mixed UPPER_SNAKE dict. **Combat Lab is not changed.** It keeps its path. It may *consume* `ResolvedState` later through an adapter (§12). |
| **Mastery facts / banks** (`ChampionFact`, `project_champion`, `build_bank`) | **Reused directly** | The fact stays the intrinsic unit of value, with `fact_id` value-free and `content_digest` value-bearing. Candidates become `Fact × ScenarioBinding`. The binding is empty for every current family, so nothing changes. |
| **Matchup composer** (`mastery/matchup/composer.py`) | **Reused directly; join extended later** | NOW it is the symmetric-template consumer, unchanged. NEXT, its index key widens from `(metric, subject_ref, FactContext)` to also include the pair binding. Tie cap, deprioritization, diversity and `SLOT_RELATIONS` are untouched. |
| **Ranked frozen artifact** (`mastery/serving/artifact.py`, `ranked_rounds`) | **Reused, extended additively** | An optional `state` sub-block inside `mastery_artifact` (absent means stateless or predates). The `source` sub-dict is pinned by exact equality in `test_gr1_phase4_artifact_persistence.py`, so the state goes in a **new** sub-block, never into `source`. |
| **Generator Lab** (`/admin/mastery-slice/preview`, `/coverage`) | **Reused directly** | It already runs production generators. When the config grows a template reference, the Lab shows the resolved state for free, provided the field is added to `review_view`'s allow-list. No UI in this pass. |
| **Build / loadout structures** | **Wrapped as sources, or used as shape precedents** | `TeamSimCombatantInput` is the model for `SideTemplate` strictness (validated ranks dict, `StrictInt`, no raw state). `BuildCandidate.classification` is the model for `SourceProvenance`. `champion_item_builds.json` becomes the `curated_default` item source. `CombatPayload.stat_shards` is the only shard precedent. `EffectiveBuild.data_version` (patch honestly `None`, `catalog_digest`) is the precedent for honest `DataBasis`. |
| **`StatedContext`** (`quiz/public_presentation.py`) | **Reused unchanged NOW** | It is closed at level and rank on purpose, and range-checked. Adding an item or build channel means a named field in a reviewed change (its own docstring says so). That is a NEXT decision per family, not part of the state contract. |
| **`FactContext`** | **Reused unchanged** | Its docstring forbids scenario axes, and that stays true. Scenario inputs go in `ScenarioBinding` (§8). |

---

## 7. Full vs Slice over one universe

### 7.1 The universe

```
StateSequence          ordered tuple of ResolvedState S_0 … S_n (n ≥ 0), plus the template deltas between them
CandidateUniverse      ⋃_i  candidates(S_i)          each tagged (state_index i, state_digest, binding)
                     ∪ transition candidates(S_i → S_i+1)   tagged (i, i+1)   — NEXT, none NOW
```

- **Candidate generation happens per state.** Each state is resolved on its own, and
  families run on it as they would on a single state.
- **Dedupe across states by semantic identity.** A candidate's identity is its dependency
  projection (§8). If a question's projection is the same at `S_i` and `S_{i+1}` (for
  example, Ahri's base armor does not change when she buys a Doran's Ring), it is **the
  same question** and exists once, at the earliest state where it is valid. This makes Full
  **naturally incremental**: as the game state advances, only questions whose inputs
  changed come back.
- **Transition questions** ("how much did Q's cooldown drop when you bought X?") belong to
  the **same universe** as a separate candidate *kind*. They depend on two states and carry
  both digests. They go in the same universe so Full and Slice can both see them, and in a
  separate kind so every per-state invariant stays true of per-state candidates. None exist
  NOW.

### 7.2 Champion Mastery

| | Full | Slice |
|---|---|---|
| Traversal | Walk `S_0 … S_n` in order. At each state, ask every *new* candidate (by identity), ordered by topic within the state (the existing `CATEGORY_ORDER` / `CURRICULUM_V2` is the *within-state* order). Exhaustive, no budget. | Choose a **window**: one state, or a short contiguous run `S_i…S_j`. Run the existing budget composer (round-robin allocation, `used_patterns`, adjacency, seeded rotation) *inside* the window. |
| Coherence | Guaranteed by order: state first, then topic. | A window shares context (one level, one build), so a slice reads like one situation, not a bag. |
| Today's behaviour | — | Today's Champion Slice is the **intrinsic universe**: a set of `FactContext` points (levels 6/11/18, all ranks) with no sequence. It stays valid unchanged as `n = 0` with an intrinsic template. It is **not** migrated into a sequence. |

### 7.3 Matchup Mastery

| | Full | Slice |
|---|---|---|
| Traversal | A sequence of **pair** states. Each step advances one or both sides (a level-up, an item). New comparisons and new pair-derived questions are asked at each step. | Window = one pair state (or a short run). The existing Matchup composer (comparisons first, tie cap `max(1, n // 4)`, context diversification) runs inside it unchanged. |
| Today's behaviour | — | Today's Matchup Slice = the symmetric intrinsic template, `n = 0`. Unchanged. |

### 7.4 Exhaustive vs bounded

Full and Slice share generation, gate, identity and freeze. They differ only in the
composer: **Full is a traversal** (order plus dedupe, no budget) and **Slice is bounded
sampling** (window plus budget plus seed). Slice's quality policies (tie cap, distinct
facts, context diversification) are *window-local* and never shape the universe. So a
Full-only candidate cannot exist: anything Full asks, some window could serve. Whether Full
may *include* candidates Slice's policies never pick (e.g. a tie a slice would cap) is
§16 D-11.

**Defining the actual progression data** (which levels, which skill order, which purchase
checkpoints) is out of scope. The architecture requires only that a sequence is data (a
list of template deltas), not code.

---

## 8. Question identity under state

### 8.1 Three identities, never conflated

| Identity | What it names | Built from | Example | Changes when |
|---|---|---|---|---|
| **Semantic question identity** | *What is being asked* | family + subject + metric + intrinsic `FactContext` + **`ScenarioBinding`** (the dependency projection) | `ability_cooldown_rank:ahri:Q:r3` + binding `{ah: 20}` | the question's meaning changes |
| **State identity** | *Which scenario* | `state_key` (readable, inputs only); `state_digest` = hash(`state_key`, data-basis machine key) | `ahri@11|Q3W1E1R1|items:3802,1056|runes:-|shards:-` | `state_key`: any input changes. `state_digest`: also on a data refresh. |
| **Artifact instance identity** | *This served copy* | existing Phase 4 `artifact_instance_id` (+ `state_digest` in the frozen block) | — | every serve |

### 8.2 `ScenarioBinding` — the dependency projection

```
ScenarioBinding
  roles     : {role → side_index}          only for directional questions ("attacker": 0)
  inputs    : sorted tuple of (axis_or_metric, value) — ONLY what the answer depends on
  version   : "binding.v1"
```

It is **computed** from the family's read-set and the `DerivedValue.depends_on` chain, never
written by hand. It holds the **resolved values** the answer depends on. It does not hold
the whole state and it does not hold the source.

The owner's three examples:

| Question | Intrinsic part | Binding | Same question as… |
|---|---|---|---|
| Ahri Q cooldown at rank 3, no haste | `ability_cooldown_rank:ahri:Q:r3` | **empty** | today's candidate. Identity byte-identical. |
| Ahri Q cooldown at rank 3 with 20 haste | `ability_cooldown_rank:ahri:Q:r3` | `{ability_haste.total: 20}` | any state where Ahri has Q rank 3 and 20 AH, **whatever items produced it**. The items are *state* identity and presentation, not the question's meaning. |
| Ahri vs Syndra armor at a resolved state | `champion_armor_compare:ahri:vs:syndra` | `{side0.level: 11, side0.armor_bonus: 0, side1.level: 11, side1.armor_bonus: 25}` | any pair state with the same armor-relevant inputs, in canonical side order |

**Why the binding carries resolved values, not item ids.** It is the only choice that is
stable and honest together. Two builds that give Ahri 20 AH make the cooldown question
*semantically identical*, so dedupe and analytics should treat them as one. The *prompt*
still names the items, because presentation reads the state. The price is that the
explanation cannot be derived from the binding alone. That is why the frozen artifact keeps
the state (§1.C).

**Why an empty binding is the migration key.** Every current family has an empty binding,
so its `candidate_key`, `mastery:` ref, `fact_id`, `content_digest` and artifact digests are
byte-identical. That can be proved roster-wide with the existing probes (§15 step 1).

### 8.3 Avoiding giant hashes as the only identity

- `state_key` is a **readable canonical string**: champion slug, level, rank string, sorted
  item-id multiset, rune and shard keys. Canonical side order for pairs.
- The binding is a short, sorted, readable tuple.
- Hashes (`state_digest`, `content_digest`) exist, but only as *value-bearing* digests next
  to a readable key. The `fact_id` / `content_digest` split already works this way.
- Durable refs for *new* state-bearing candidates should key on the **slug**. Today's
  `mastery:` ref embeds the display name (`Ahri`, audit §8). Legacy refs are left alone
  (§16 D-12).

---

## 9. Versioning and patch behaviour

### 9.1 `DataBasis`

```
DataBasis
  patch_label        : league_patches.patch_id + display_version (the live row) — LABEL, not identity
  machine_key        : projection_patch_key (digest of what was actually read) — the value-identity
  store_revisions    : { champion_stats: max updated_at,
                         champion_abilities: authority_revision span,
                         cooldown_authority: content_sha256,
                         item_canonical: source_revision / fetched_at,
                         runes: "unversioned" }
  resolved_at        : timestamp
```

**What "current" means:** *whatever the canonical stores hold at resolution time*, labelled
with the catalog's live patch. That is the honest definition, because canonical data is
overwritten in place and no "as of patch N" read exists (audit §8). `EffectiveBuild`'s
`patch: None` is the precedent for not pretending otherwise.

### 9.2 What re-resolves, and what stays frozen

| Change | Template | Next resolution | Served / frozen content |
|---|---|---|---|
| Champion data changes (Patch Ops) | unchanged | same `state_key`, **new** `state_digest`; candidate `content_digest`s change where values changed | **Frozen.** Never re-resolved. |
| An item's stats change | unchanged | new `state_digest`; item-dependent derived values change | Frozen |
| An item is removed from the game | unchanged (not rewritten) | **fails closed**: `item_not_current`. Never dropped silently. | Frozen, still readable |
| Runes change | unchanged | NOW no effect: rune contributions are `unsupported` | Frozen |
| The build source changes (JSON edited) | unchanged (it references the source) | new `SetupRecord` → **new `state_key`** where items differ; item-dependent questions get new bindings | Frozen; provenance shows the old source version |
| A literal/saved template's items | unchanged | re-resolved against current data | Frozen |
| A new patch goes live | unchanged | new `patch_label`. `machine_key` changes only when the stores do. | Frozen label stays as served |
| Template pinned to a past patch | — | **refused**: `historical_resolution_unavailable`. No as-of store exists. | Replay a frozen artifact instead |

**Reproducibility of history** comes from the frozen artifact, never from re-running
anything. This is Phase 4's existing principle (`generator_version` is provenance, never
dispatch), now applied to state: the frozen block holds inputs, `derived_used`, data basis
and source provenance. That is enough to display and explain any served question without a
generator.

---

## 10. State mutability

| Layer | Mutable? | How change happens |
|---|---|---|
| **Template** | Immutable value. A *saved* template has revisions. | An edit creates a new revision. Deltas use the setup transition vocabulary: `LEVEL_CHANGE`, `ABILITY_RANK_CHANGE`, `ITEM_ACQUIRE`, `ITEM_REMOVAL`, `ITEM_COMPLETION` (components → completed item), `COMPONENT_CONSUMPTION`, and `RUNE_SET` / `SHARD_SET` (whole-page replacement). |
| **Resolved state** | Immutable. | A *transition between resolved states* = apply a template delta, then **re-resolve**. Derived values are never patched. That is the difference from Journeys' `apply_transition`, and it is intentional. A delta that produces an illegal state (a rank above the skill-point rule, a seventh item) fails at normalization, like any other template. |
| **Encounter state** (HP/resource, buffs, stacks, cooldowns in flight, gold) | Mutable per encounter, **outside this contract** | Journeys' `apply_transition` stays the engine for it. "The calculation proposes a state change; the chain applies it" stays the rule there. Not in the minimum (§14). |
| **Frozen artifact** | **Never.** | Write-once `ranked_rounds`. Corrections are new artifacts, never edits. |

---

## 11. Fail-closed behaviour

### 11.1 Rules

| Condition | Stage | Behaviour |
|---|---|---|
| Unknown champion slug | 3 | `NormalizationError(unknown_champion)`. Whole state refused. |
| Item unknown, or not `validated_current` + `is_current_sr` | 3 | `NormalizationError(item_not_current, item=…, source=…)`. Never "keep the item with zero stats". |
| Rune unknown | 3 | `NormalizationError(unknown_rune)` |
| Rune known but its effect unsupported | 4 | Rune stays in `inputs`; its contribution is `unsupported`. **Fatal only for a question whose read-set includes that contribution.** |
| Shard unknown / unsupported | 3 / 4 | Same as runes. `"UNKNOWN shard ignored"` is not acceptable (see 11.2). |
| Champion stat row missing | 4 | `SourceIntegrityError` → existing `RANKED_MODULE_DATA_UNAVAILABLE`. Never zero stats. |
| A single canonical value missing (e.g. no cooldown for a slot) | 4 / 5 | That derived value is `unsupported`. The candidate is skipped with a reason code. The state survives. |
| Requested rank above the ceiling, or illegal for the level | 3 | `NormalizationError(illegal_rank)`. Checked for **every** champion, certified or not. |
| Level outside 1–18 | 1 / 3 | `TemplateInvalid` / `NormalizationError`. No clamping. |
| Derived modifier cannot be resolved (e.g. an item's AH is in an effect, not a stat) | 4 | `unsupported` + `depends_on`, never 0. A question that needs it is skipped. |
| Two sources asked for the same side | 1 | `TemplateInvalid(multiple_sources)` |
| Source vs canonical disagreement | 3 | Canonical wins on game data. A source value canonical data rejects is an error naming the source. |
| Pair sides on different data bases | 3 | `NormalizationError(basis_mismatch)` |
| Patch or source provenance unavailable | 3 / 4 | Record it honestly (`"unversioned"`, `None`). It is fatal only if the template **pinned** a basis. Unknown provenance is never invented. |

### 11.2 Existing paths that violate the principle (observed at `b1fd3510`; not changed)

| Path | Violation |
|---|---|
| `services/combat_helpers.py:288-289` — `if not row: return default_preview_base_stats(level)` | Missing champion → default (zero) base stats, no error. |
| `calculate_build_stats.py:~92-100` | An item with no canonical row **stays in the build** contributing zero base stats. The only signal is a `warning` inside `item_details`. Totals are silently lower. |
| `calculate_loadout_stats.calculate_rune_stats` | An unknown rune yields no rows and no warning. It silently contributes nothing. |
| `champion_stat_profile.apply_stat_shards` | Unknown shard → `"UNKNOWN shard ignored"` appended and processing continues. The three shard values are code literals. |
| `ChampionCanonicalState._validate_certified` | `if limit is not None and rank > limit`: an uncertified champion's ranks are **unchecked**. |
| `ChampionCanonicalState.current_health = 0.0` default | 0.0 is the legacy default and `None` means "not modelled". A sentinel zero sits next to a real zero. |
| `ValidationContext.stat_calculation_version = "uncertified"` default | A default string stands in for missing provenance. |
| Applied-chain `physical_penetration_set.py` | `current_health` / `current_resource` placeholders of `100.0` on both sides. |
| `first_ahri_syndra.py` | `_AP = 100.0`, `_TARGET_MR = 30.0`, `_TARGET_HP_START = 480.0`: scenario values that the state does not imply. |
| `combat_helpers` level clamp 1–20 vs Mastery 1–18 | A clamp silently changes the input. |
| `mastery/calculations/mitigation.effective_resistance` vs `penetration.calculate_effective_resistances` | % penetration as 0–1 vs 0–100. A unit disagreement between two "authorities". |
| `quiz/data/champion_item_builds.json` | `"confidence": "high"` next to `"needs_manual_review": true`. |

These stay as they are. The state contract simply does not route through the first four,
and it adopts none of their semantics.

---

## 12. Reuse by current systems (without each owning its own version)

| System | How it would consume the shared resolved state | What it keeps owning |
|---|---|---|
| **Champion Mastery** | Receives `ResolvedState` (kind champion). Families declare read-sets. NOW it is the intrinsic template, identical to today. | Composition policies, curriculum |
| **Matchup Mastery** | Receives `ResolvedState` (kind matchup). NOW the symmetric template. Pair comparisons read `PairDerived`. | Tie policy, comparison join, diversity |
| **Generator Lab** | Shows the frozen `state` block through `review_view` (allow-listed fields), and later lets an admin pick a template. It still runs production generators. | Nothing state-related. It is a viewer. |
| **Combat Lab** | Optional adapter, LATER: `ResolvedState` side → `TeamSimCombatantInput` (champion, level, items, runes, ability_ranks). The shapes already line up. Combat keeps its simulator derivation and its own request forms. | Simulator runtime state, tick-level `CombatState`, its derivation path |
| **Quiz analytics / statistics** | Reads `state_key` and the binding from `quiz_attempts.provenance_json`, which Phase 4 already populates. Zero DDL NOW. Columns are a later decision. Aggregation by *semantic identity* (intrinsic + binding) naturally groups "Q r3 at 20 AH" across builds. | Attempt rows, stats queries |
| **Saved / custom question sets** | Persist a **template** (+ revision), never a resolved state. Replaying *a specific served set* uses its frozen artifact. | Set metadata, ownership |
| **Graphing (GRAPH1 stat growth / snapshot)** | A stat-growth chart is a Full traversal over a level sequence of one template. It reads `DerivedBlock` values per state. NEXT: charts "with this build" come free. | Chart datasets, rendering |
| **Mastery Journeys** | Unchanged. Optional LATER projection `ResolvedState → CanonicalMasteryState` if a Journey wants its starting setup from a template. | Its encounter state, transitions, authored content |
| **Frontend state views** | The existing rule stays: *"the frontend never derives"*. Views render backend-projected derived values. | All UI state |

---

## 13. What should NOT be unified

| Area | Why forcing the state model would harm it |
|---|---|
| **Presentation-only UI state** (selected tab, expanded panel, art variant) | It has no game meaning. Putting it in the state would change `state_key` for cosmetic reasons. |
| **User interaction state** (chosen option, timers, submit status) | It belongs to an attempt, not a scenario. Two players answering the same state must share `state_key`. |
| **Persisted quiz attempt state** (`quiz_attempts`) | It references the state (`state_key`, binding) and never embeds it. `question_key` is version-free by design and must stay that way. |
| **Journey UI progress** (step index, session) | It is progress through authored content. The Journey owns it. |
| **Transient animation / runtime state** | It is frame-level and has no identity. |
| **Simulator `CombatState`, tick timelines** | The encounter layer at a far finer grain. Combat Lab owns it. The state contract ends at setup. |
| **Ranked match state** (segments, scores, Elo) | Match orchestration. It freezes artifacts. It is not a scenario. |
| **Encounter vitals** (HP/resource/buffs) | A separate optional layer, LATER. Folding it in is how `CanonicalMasteryState` became setup + encounter + `custom_state`. |
| **Combat Lab drafts** (`CombatantDraft`) | Editor state that may be invalid mid-edit. A template must always be valid or be refused. |
| **Patch Ops staging / editorial state** | The data pipeline. The state *reads* its outputs through `DataBasis`. |

---

## 14. NOW / NEXT / LATER

**NOW — the minimum architecture** (the contracts, which could be built without any new data):

- `StateTemplate` / `ResolvedState` / `FrozenStateArtifact` for **setup** only.
- Axes: champion, form, level, ability ranks, items. Runes and shards are **representable
  but `unsupported`** in derivation. Position is representable but unread.
- Sources: `literal`, and `curated_default` for items (`champion_item_builds.json` wrapped,
  confidence normalized).
- Derivation: level-curve stats, item base stats from `item_canonical`, total ability haste
  from item stats, effective cooldown and cost per rank. All of these have canonical data
  today.
- Identity: `state_key`, `state_digest`, `ScenarioBinding`. Empty binding = today's
  identities.
- Intrinsic templates reproduce today's Champion and Matchup slices exactly.

**NEXT** (after existing fact families are wired cleanly):

- First state-reading families: cooldown under resolved AH, and level-stat and cost
  comparisons with explicit bindings (the held `champion_level_stat` / `ability_cost`
  comparison blocks, structural audit §4, per the owner's family decisions).
- State sequences plus a Slice **window**. Full composer as a traversal.
- Asymmetric matchup templates (if approved).
- The transition-candidate kind.
- `saved` and `historical` sources. Allow-listed state fields in `review_view`, the Generator
  Lab and analytics provenance.
- A `StatedContext` extension for build facts, one named, reviewed field at a time.

**LATER:**

- Rune and shard numeric effects (after rune ids and revisions and a shard table exist).
- Item passives and effects beyond base stats.
- Damage, mitigation and penetration as `PairDerived` (the Applied-chain generalization,
  gated on CHAMPDATA per handoff decision 12).
- The encounter layer (vitals, buffs) as a separate contract.
- `internal_observed` sources (LIVE1 skill orders, after id mapping).
- As-of-patch resolution (needs per-patch stores, which do not exist).

---

## 15. Migration strategy (concept only)

Every step is additive and reversible, and each ships alone.

| Step | What | Safety property |
|---|---|---|
| **0** | This document + owner decisions. | No code. |
| **1** | Introduce the three types and the resolver as **pure modules with no callers**. Express today's behaviour as the *intrinsic champion template* and the *symmetric intrinsic matchup template*. | A roster-wide probe (the existing Phase 3/structural probes) proves **byte-identical** `candidate_key`s, `content_digest`s and snapshot digests for all 173 champions and a pair sample. That is the empty-binding invariant. |
| **2** | Make `resolver.publish` **receive** its universe instead of re-projecting in `_build_universe`. | Same byte-identity probe. It is the one behavioural seam, and it is tested on its own. |
| **3** | Add the optional `state` sub-block to the private `mastery_artifact`. It is not in `source`, and not in any public allow-list. | Absent means unknown. `test_gr1_phase4_artifact_persistence` stays green unchanged. Old rounds still read. |
| **4** | The first state-reading family, **Generator Lab only**, behind a flag, with no public format. | No public exposure. Current slices do not change because intrinsic templates are unchanged. |
| **5** | A Slice window over a single non-intrinsic state (e.g. "Ahri at 11 with curated path 1"), still Lab-only. | Same. |
| **6** | Full composer (a separate phase, not in this brief). | Consumes the same universe. |

Held throughout:

- **Current slices keep working.** Intrinsic templates reproduce them exactly (step 1 proves
  it, step 2 re-proves it).
- **No giant rewrite.** Generators move one family at a time, by declaring a read-set.
  Families that declare none are intrinsic forever if the owner wants.
- **Journey content is not revived as a source of truth.** Journeys remain a separate
  consumer. Nothing reads their scenario constants. `BuildCandidate` is used as a *shape
  precedent* only, and `first_ahri_syndra`'s values are not imported.
- **Frozen artifacts stay valid.** Nothing is rewritten, and every new block is optional.
- **Combat Lab is not touched.** The derivation authority *imports* shared primitives. It
  does not edit `combat_helpers`. A Combat adapter is a later, optional consumer.
- **Mastery isolation tests** fail by construction on any branch (handoff memory). Compare
  failure *sets*, not totals, at every step.

---

## 16. Architecture decisions for owner approval

This is the only section with recommendations.

| # | Question | Options | Trade-off | **Recommended** |
|---|---|---|---|---|
| **D-1** | What does the reusable state cover? | (a) setup only; encounter is a separate layer. (b) setup + encounter in one object. | (b) matches `CanonicalMasteryState`, but mixes a scenario's identity with its moment-to-moment vitals and grows into a god object. (a) needs a second contract later for Journeys/Applied-chain. | **(a) setup only.** |
| **D-2** | New contract, or extend `CanonicalMasteryState`? | (a) new small contract; `CanonicalMasteryState` stays for Journeys, with a one-way adapter later. (b) generalize `CanonicalMasteryState`. | (b) reuses code, but inherits name-keyed items, caller-supplied `derived`, certified-only validation and Journey pinned digests (a change would move 13 pinned artifacts). (a) costs a second type. | **(a).** Reuse its ideas (§6), not the class. |
| **D-3** | Derivation authority | (a) a new pure module composed of existing primitives (curve, `item_canonical` loader, haste formula, Mastery fact sources). (b) Combat Lab's `build_runtime_champion_stats`. (c) chain calculation primitives. | (b) exists and works, but zero-fills, clamps to 20 and mixes keys, and changing it risks Combat Lab. (c) is certified-slice only. (a) adds a module but reuses every formula. It also needs **one** skill-point rule (pick `_min_level_for_rank` or `validate_rank_for_level`). | **(a)**, with fail-closed semantics and level cap 18. Adopt the transitions' `_min_level_for_rank` as the single rule after proving it equals the resolver's. |
| **D-4** | Where do scenario inputs live in question identity? | (a) a separate `ScenarioBinding`; `FactContext` unchanged. (b) widen `FactContext`. | (b) is simpler, but contradicts `FactContext`'s own contract and changes every existing `fact_id`. (a) keeps all identities byte-identical. | **(a).** |
| **D-5** | What is a question's semantic identity under state? | (a) the dependency projection (resolved values it depends on). (b) the full `state_digest`. (c) the template/source. | (b) makes every data refresh a "new question" and splits analytics by build. (c) ties meaning to where data came from. (a) needs `depends_on` bookkeeping. | **(a).** |
| **D-6** | Matchup asymmetry | (a) structurally independent sides; only symmetric templates allowed until approved. (b) independent and asymmetric allowed now. (c) contract forces symmetry. | (c) permanently forbids "Ahri L11 vs Syndra L6", which Journeys already use. (b) creates a new question space without product review. | **(a).** |
| **D-7** | What does "patch" mean in a state? | (a) `DataBasis` = `league_patches` label + machine projection key + store revisions; no as-of resolution; a pinned past basis refuses. (b) key on `league_patches.patch_id` alone. (c) certified descriptor. | (b) claims more than the data can do: values are overwritten in place, so the label does not identify values. (c) is hand-pinned. (a) is honest but has two fields. | **(a).** |
| **D-8** | Is source provenance part of state identity? | (a) no: `state_key` is inputs only; provenance is recorded and frozen. (b) yes. | (b) makes the same build from two sources two scenarios, which fragments dedupe and analytics. (a) makes "why this build" a provenance question. | **(a).** |
| **D-9** | Default build source | (a) `champion_item_builds.json` as `curated_default`, confidence normalized, presented as "a common build". (b) no default until a real authority exists (literal templates only). | (b) is the safest but blocks every item-state family. (a) uses a file that calls itself a whitelist, not pick-rate authority. | **(a)**, with confidence never "high" and wording never "recommended/optimal". |
| **D-10** | Runes and shards NOW | (a) representable, derivation `unsupported`; questions that read them are skipped. (b) compute the 9 flat `rune_stats` rows + 3 shard literals now. (c) exclude them from the contract. | (b) adopts unversioned, name-keyed data and code literals as authority. (c) forces a contract change later. | **(a).** |
| **D-11** | Full vs Slice universe | (a) one universe; Slice's quality policies are window-local, so Full may ask what a slice would cap (e.g. ties). (b) Full inherits Slice's exclusions. | (b) makes Full incomplete by construction. (a) means Full needs its own tie presentation. | **(a).** |
| **D-12** | Full traversal model | (a) through game states (setup progression), topics ordered within each state. (b) through topics over a fixed state. | (b) is simpler but is just a big slice. (a) is what "walks through changing game states" means, and dependency-projection dedupe makes it incremental. | **(a).** |
| **D-13** | Transition questions | (a) same universe, separate candidate kind, deferred. (b) a separate layer/product. | (b) splits a Full walk. (a) keeps one universe. | **(a)**, not built NOW. |
| **D-14** | What the frozen artifact preserves | (a) private `state` sub-block: inputs, `derived_used`, data basis, source provenance, per-step bindings; public unchanged. (b) the full derived block. (c) content only (today). | (c) cannot explain a stateful answer after data changes. (b) bloats payloads. | **(a).** |
| **D-15** | Identity keys | (a) new state-bearing refs key on champion **slug** and **Riot item id**; legacy `mastery:` refs untouched. (b) keep display names. | (b) moves refs on a rename. (a) means two ref styles coexist. | **(a).** |
| **D-16** | Journeys | (a) coexist, untouched; optional adapter later. (b) migrate onto the new contract. (c) retire. | (b) and (c) touch the live default `/quiz/mastery` set and 13 pinned artifacts for no generated-path gain. | **(a).** |
| **D-17** | Eligibility of new state-reading families | (a) declared through `quiz/family_contract.py` like today, each with a Mastery-side eligibility pin test (the QCA8 lesson). (b) Mastery owns its own eligibility table. | (b) isolates Mastery from mode resets but duplicates an authority. (a) keeps one authority and relies on pin tests. | **(a)**, and it is consistent with the QCA8 correction. The broader audit §13 Q1 stays open. |

---

## 17. Out of scope — confirmed not done

No runtime code. No migrations. No Slice behaviour change. No Full mode. No new Matchup
family unlocked. No tie-policy change. No QCA behaviour change. No Applied-chain change. No
external data source. No frontend UI change. No production branch touched except this docs
commit. The backend was read from a clean detached worktree at `b1fd3510` and was not
modified. No database was opened for writing.
