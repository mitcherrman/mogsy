# GR1 — Reusable state architecture: design (revision 2)

**DESIGN ONLY. Nothing was implemented.** No runtime code, schema, migration, generator,
composer, tie policy, QCA behaviour, Applied-chain, Combat Lab, Journey or frontend UI was
touched. This revision fixes four architectural constraints that the owner corrected. It
also defines the smallest first implementation seam (§15). **Phase 1 is proposed here and
is not implemented.** Decisions, and whether each one is approved, appear **only in §17**.

| | SHA | Note |
|---|---|---|
| Backend read | `origin/master` **`b1fd3510`** | Unchanged since revision 1 (fetched 2026-09-19). Read with `git show` / `git grep` against the ref. No worktree was modified. |
| Frontend / docs base | `origin/main` **`2ba820e1`** | Matches the brief. Revision 1 of this document is that commit. |
| Inputs | revision 1 of this doc (`2ba820e1`), `gr1-reusable-state-architecture-audit.md`, `gr1-matchup-mastery-structural-audit.md`, this repo's handoff | Code references below were re-read at `b1fd3510`. |

The core rule, as the owner stated it:

> **QUESTIONS CONSUME STATE. QUESTIONS DO NOT OWN OR HARDCODE STATE.**
> **ONE GENERATED QUESTION UNIVERSE → FULL composer / SLICE composer.**

### What changed from revision 1

| # | Owner correction (APPROVED) | Revision 1 said | Revision 2 says |
|---|---|---|---|
| **C1** | **No architectural level-18 cap.** The same applies to fixed item-slot counts and similar game-rule limits. | "int 1–18", "level cap 18", "a seventh item fails" | Level, ranks, items, runes and shards are **data** in the contract. Legality comes from a **rules authority** (§1.D). What the first derivation can compute is a separately declared **derivation support** range. **STATE MODEL CAPABILITY ≠ CURRENT DERIVATION SUPPORT.** |
| **C2** | **Matchup state supports independent sides.** | Independent sides, but "only symmetric templates" as a contract-level recommendation (old D-6) | The contract represents any per-side level, ranks, items, runes, shards and derived stats. Generating only symmetric states first is a **generator policy**, not a limit of the model (§3). |
| **C3** | **Build/setup sources stay replaceable.** | `champion_item_builds.json` proposed as the `curated_default` source | No source is foundational. Resolution consumes a normalized `SetupRecord`. The default is a **configurable source policy**, not a generator constant. **Mogzy has no recommended-build authority today**, and this document says so (§4). |
| **C4** | **The historical-patch limitation is a capability, not state-model law.** | `data_basis: "current" \| PinnedBasis`, with "current" defined as whatever the stores hold | The template asks for a basis. A resolved state always names a **concrete, generic basis identity**. Current and historical bases share one contract. Today only the current basis is **available**, so a historical request is refused (fail closed). Adding snapshots later changes the availability answer, not the contract (§9). |

---

## 0. The design in one page

```
StateTemplate ─(source policy → SetupSource)→ SetupRecord per side ─(normalize + rules authority)→ SetupInputs
   │  (a scenario REQUEST; basis REQUEST)                                                             │
   │                                                              (derivation authority, within its declared support)
   │                                                                                                  ▼
   │                                          ResolvedState = inputs + derived(status) + concrete DataBasis
   │                                                                                                  │
   │                                          candidate generation: Fact × ScenarioBinding            ▼
   │                                          (a family reads only the axes it declares)
   │                                                                                                  │
   └── identity: semantic_state_key          publication gate → Slice / Full composer → presentation
                                                                                                      │
                                                                      FrozenStateArtifact (private, write-once)
```

Ten load-bearing ideas. Items 1–8 are retained from revision 1 and reworded where C1–C4
require. Items 9–10 are new.

1. **The reusable state covers SETUP only**: champion, form, level, ability ranks, items,
   runes, shards and position. **Encounter** state (current HP or resource, buffs, stacks,
   cooldowns in flight, gold) is a separate optional layer.
2. **Three layers, never merged.** A **template** is a request. A **resolved state** is
   exact, normalized values plus derived values computed only from inputs. A **frozen
   artifact** is what was served, and it is never re-resolved.
3. **Sources feed templates. Generators never see sources.** Every source produces one
   normalized `SetupRecord`. Sources are interchangeable, and no generator can tell which
   one ran.
4. **Derived values are always recomputed from inputs.** Each one has a status:
   `supported`, `unsupported` or `not_applicable`. `unsupported` is never zero.
5. **`FactContext` stays intrinsic.** Scenario inputs travel in a separate
   **`ScenarioBinding`**. For every current family the binding is empty, so every existing
   identity is byte-identical.
6. **Semantic question identity is the dependency projection.** It holds only the resolved
   inputs the answer actually depends on.
7. **A matchup is two independent side states plus one shared context and a pair-derived
   block.** Opponent and target roles belong to the *question*, not to either side.
   Equality never depends on caller order.
8. **One universe for Full and Slice.** Full and Slice are composers. They are not separate
   question-generation systems.
9. **(new) Capability, rules and support are three separate things.** The *contract*
   decides what can be written down. The *rules authority* decides what is legal. The
   *derivation support* decides what can be computed today. A limit belongs in only one of
   them (§1.D).
10. **(new) A resolved state always names a concrete basis.** "Current" is a request alias
    and is never stored. Whether a basis is *available* is a capability question that is
    answered at resolution time (§9).

---

## 1. The reusable state contract

Everything below is conceptual. The type sketches use a Python-like notation for precision
only. They are not a schema, not code and not a table.

### 1.0 Shared vocabulary

| Term | Meaning |
|---|---|
| **Axis** | One setup dimension: `level`, `ability_ranks`, `items`, `runes`, `shards`, `form`, `position`. The axis vocabulary is closed and versioned. The **values** on each axis are open data. |
| **Axis value state** | Each axis on a resolved side is exactly one of: `specified(value)`; `intrinsic` (the state deliberately does not model it); or `absent_unrequested` (nothing asked for it and no consumer reads it). There is **no** "unknown means zero". |
| **Read-set** | The axes and derived metrics a question family declares it depends on. Unread axes never enter question identity. |
| **Rules authority** | The data-driven source of legality: level bounds, per-champion rank ceilings and rank-availability rules, inventory policy, rune-page and shard shape. It is keyed by ruleset and basis (§1.D). |
| **Derivation support** | What the current derivation authority can compute: level range, supported axes, supported metrics. It is declared as data and **never enforced as legality** (§1.D). |
| **Data basis** | A generic identity for the canonical data a state was resolved against. It can refer to current or historical data (§9). |

### 1.A `StateTemplate` — a reusable request for a scenario

**Purpose.** To describe *which* scenario is wanted, possibly by reference, in a form that
can be stored, versioned, edited and resolved again. A template holds no computed values.

```
StateTemplate
  template_schema_version : str                       REQUIRED  "state_template.v1"
  kind                    : "champion" | "matchup"    REQUIRED
  sides                   : tuple[SideTemplate, ...]  REQUIRED  count validated against kind (1 | 2)
  shared                  : SharedContextTemplate     REQUIRED
  template_ref            : TemplateRef | None        OPTIONAL  identity when saved
  label                   : str | None                OPTIONAL  display only, never identity

SideTemplate
  champion       : ChampionRef             REQUIRED  canonical slug (never display name)
  form           : str | None              OPTIONAL
  position       : Position | None         OPTIONAL
  setup_source   : SourceRef | None        OPTIONAL  fills axes left None (§4); None = source policy default or none
  level          : int | LevelRule | None           OPTIONAL  a positive int; no ceiling in the TYPE (C1)
  ability_ranks  : RankMap | RankRule | None        OPTIONAL  {slot → int ≥ 0}; slots come from the champion's kit, not a fixed QWER-with-R≤3 shape
  items          : tuple[ItemRef, ...] | None       OPTIONAL  any length; canonical item ids; optional slot positions
  runes          : tuple[RuneRef, ...] | None       OPTIONAL  any length; page shape is a rules question
  shards         : tuple[ShardRef, ...] | None      OPTIONAL  any length; shard-row shape is a rules question

SharedContextTemplate
  basis_request  : BasisRequest            REQUIRED  "current" | pinned(DataBasisId)   (§9)
  ruleset        : RulesetRef              REQUIRED  e.g. "summoners_rift"; selects the rules authority
```

`map_mode` from revision 1 becomes **`ruleset`**. It is the key the rules authority uses
(§1.D). A state resolved under one ruleset can never silently be compared with a state
from another.

`RankRule` (e.g. `max_legal_at_level`, `from_skill_order_source`) and `LevelRule` (e.g. a
named checkpoint) let a template say *how* to fill an input without writing its value. Both
are evaluated by the rules authority, so "max legal rank at level 11" is correct for Karma
and Udyr as well as Ahri.

**Precedence.** A literal template value overrides the source. The source fills only the
axes the template leaves `None`. An axis still `None` after that becomes
`absent_unrequested` or `intrinsic`, or resolution fails, as the read-sets decide.

**Must NOT own:** derived numbers; question content, prompts, answers or family choice;
encounter state; presentation beyond `label`; any copy of game data (it may *name* a basis,
never *copy* one); generator identity; **a legality limit** (limits belong to the rules
authority, C1).

### 1.B `ResolvedState` — the exact concrete state

**Purpose.** The fully specified, normalized, rules-checked setup, with every derived value
computed by one derivation authority against one concrete data basis. It is the only thing
a candidate generator receives.

```
ResolvedState
  resolved_schema_version : str                     REQUIRED  "resolved_state.v1"
  kind                    : "champion" | "matchup"  REQUIRED
  sides                   : tuple[ResolvedSide, ...] REQUIRED  canonical side order (§3.3)
  shared                  : ResolvedSharedContext   REQUIRED
  pair_derived            : PairDerived | None      matchup only
  resolution              : ResolutionRecord        REQUIRED  provenance of HOW (not identity)
  semantic_state_key      : str                     REQUIRED  readable input identity (§8)
  resolved_state_digest   : str                     REQUIRED  value-bearing digest (§8)

ResolvedSide
  inputs   : SetupInputs     REQUIRED  normalized, canonical ids, legal under the rules authority
  derived  : DerivedBlock    REQUIRED  every entry has a status
  sources  : SideProvenance  REQUIRED  per-axis: which source supplied it (§4)

ResolvedSharedContext
  data_basis : DataBasis     REQUIRED  CONCRETE; never the alias "current" (§9)
  ruleset    : RulesetRef    REQUIRED
  rules_rev  : str           REQUIRED  revision of the rules data used for legality

ResolutionRecord
  template_key, template_ref?    what was asked (including basis_request)
  resolver_version               pipeline version: provenance, never dispatch
  derivation_version             derivation authority version
  derivation_support             the support declaration in force (§1.D)
  warnings                       non-fatal notes
```

**Must NOT own:** a live link to its template; question content, selection or seeds;
encounter state; UI state; any derived value not computed from its own `inputs` and
`data_basis`; and **no clamp**. An input outside the rules is refused. An input inside the
rules but outside derivation support is kept, and the values that need it are
`unsupported` (§1.D).

A `ResolvedState` is **pure and deterministic**. The same `SetupRecord`, basis and rules
revision always give the same `resolved_state_digest`.

### 1.C `FrozenStateArtifact` — what was served or saved, forever

```
FrozenStateArtifact      (an optional private sub-block inside the existing mastery_artifact; NOT inside `source`)
  frozen_schema_version  : str                  REQUIRED
  semantic_state_key     : str                  REQUIRED
  resolved_state_digest  : str                  REQUIRED
  inputs                 : per side SetupInputs REQUIRED  (canonical ids + display names at the time)
  derived_used           : per side, the DerivedValues some served question depended on
  pair_derived_used      : same, matchup only
  data_basis             : DataBasis            REQUIRED  concrete identity + label + availability class
  ruleset, rules_rev     :                      REQUIRED
  source_provenance      : per-axis SourceProvenance    REQUIRED
  template_key / ref     : provenance only      OPTIONAL
  step_bindings          : step_index → (resolved_state_digest, ScenarioBinding)   REQUIRED when >1 state
```

This is unchanged in principle from revision 1. It now freezes the rules revision and the
concrete basis. Public exposure is still a projection chosen field by field through the
existing positive allow-lists (`PUBLIC_CHALLENGE_FIELDS`, `StatedContext`, `review_view`).
Artifacts frozen before the block existed still read as "absent means unknown".

### 1.D STATE MODEL CAPABILITY ≠ CURRENT DERIVATION SUPPORT  *(new; C1)*

Revision 1 put game limits into the contract: "int 1–18", "slot limit 6" and "the cap is 18".
This revision splits them into three layers. Each limit lives in exactly one layer.

| Layer | Question it answers | Where its limits live | Failure it produces | Example |
|---|---|---|---|---|
| **1. Contract capability** | *Can this be written down?* | The type only: a level is a positive int, ranks are a map of non-negative ints over the champion's slots, items are a sequence of any length. **No game-rule numbers.** | `TemplateInvalid` (wrong type or shape, unknown key) | `level = "eleven"` is refused. `level = 19` is **representable**. |
| **2. Rules authority** | *Is it legal in this ruleset, at this basis?* | **Data**, keyed by `(ruleset, basis)`: level bounds, per-champion per-slot rank ceilings, rank-availability-by-level rules, inventory policy (slot count, trinket slot, unique groups), rune-page and shard shape. | `NormalizationError(illegal_level \| illegal_rank \| inventory_policy \| …)` naming the rule and its revision | Summoner's Rift says level ≤ 18, so level 19 is refused here, **by rules data**. |
| **3. Derivation support** | *Can we compute what a consumer reads?* | A declared **support manifest** of the derivation authority: supported level range, supported axes, supported metrics. | **Not fatal to the state.** The affected `DerivedValue`s get `unsupported` with reason `derivation_support_range`. A question that reads them is skipped. | If the rules ever allowed level 20 but derivation had only been certified to 18, the state resolves and level-dependent stats are `unsupported`. **Never clamped.** |

**Why the split is load-bearing, with evidence from the code at `b1fd3510`:**

- **Rank legality is already per-champion data, and the hardcoded rules are already wrong.**
  `champion_state.py` holds `BASIC_ABILITY_RANK_CEILING` (Jayce Q/W/E 6, Yuumi Q 6, Udyr
  Q/W/E/R 6) and `ULTIMATE_RANK_CEILING` (Nidalee, Elise, Karma: 4). Each is guarded by a
  test against the store. The wiki text cited there says Nidalee and Karma **begin the game
  with one rank** in their ultimate. Both skill-point rules the codebase has hardcode basic
  abilities at 1–5 and R at 6/11/16 with a ceiling of 3:
  `mastery/transitions/transitions.py::_min_level_for_rank` and
  `quiz/combat_scenarios/resolver.py::validate_rank_for_level` (which also raises on R
  rank 4). Revision 1 recommended adopting one of them as *the* rule, which would have made
  that error permanent (§17 D-3 is revised).
- **Inventory policy is already data.** `mastery/state/validation_context.InventoryPolicy.slot_limit`
  is `Optional[int]`. The six-slot value appears only as data at call sites
  (`summoner_spell_mastery.py`: `InventoryPolicy(slot_limit=6)`). The contract keeps that
  precedent and does not bake in 6.
- **Level 18 is a derivation constant today, and that is the right place for it.**
  `mastery/facts/projection.py` has `MIN_LEVEL = 1`, `MAX_LEVEL = 18` and refuses outside
  them with `LEVEL_OUT_OF_RANGE`. That is a statement about what the *projection* supports.
  It should be declared as derivation support (layer 3), not copied into the state type.
  `champion_stat_profile.riot_level_multiplier` itself has no upper bound. The curve is a
  formula, and certifying it beyond 18 would be a derivation decision.
- **The silent clamp stays excluded.** `services/combat_helpers.py` clamps level to
  `MAX_PREVIEW_LEVEL` and ranks to ceilings. Combat Lab is not changed. The state contract
  never clamps: layer 2 refuses and layer 3 marks `unsupported`.

**What the first implementation supports.** Ruleset `summoners_rift` only. Levels 1–18 (the
projection's current support). Rank ceilings from the existing `champion_state` tables.
Rank availability from the ordinary rule **plus declared per-champion exceptions**. A
champion whose rank-availability rule is not yet declared as data gets
`NormalizationError(rank_rule_unsupported)`. It is never silently checked against the
ordinary rule. Everything else in this list is capability that is not yet supported.

---

## 2. Champion-side state

### 2.1 Field placement

| Field | Template input | Normalized input (`SetupInputs`) | Derived | Limit lives in |
|---|---|---|---|---|
| Champion | slug | slug + registry identity (`mastery/identity`) + display name at resolution | — | rules: must exist in the registry for the basis |
| Form | `form` | canonical form key or `intrinsic` | — | rules: form must exist for the champion |
| Position | `position` | position or `absent_unrequested` | — | none NOW (no consumer reads it) |
| Level | int or `LevelRule` | positive int, or `intrinsic` | — | **rules** (bounds per ruleset); **support** (what derivation computes) |
| Ability ranks | map or `RankRule` | `{slot → int}` over the champion's actual slots | — | **rules**: per-champion ceiling (`champion_state` tables) + per-champion availability-by-level rule |
| Items | canonical ids, optional slot positions | a multiset of canonical ids (+ slot positions if a consumer reads them), current per the basis (`item_canonical`: `validated_current`, `is_current_sr` for the SR ruleset) | item stat contributions | **rules**: inventory policy (slot count, trinket, unique groups) as data |
| Runes | rune refs | canonical rune key, marked `unversioned` | NOW: `unsupported` | **rules**: page shape; **support**: numeric effects not yet supported |
| Stat shards | shard refs | canonical shard key | NOW: `unsupported` | same as runes |
| Derived stats | — | — | HP, max resource, AD / armor / MR base+bonus+total, AP, AS, MS, AH, range | **support** manifest |
| Ability-derived | — | — | per slot at the side's rank: base cooldown, effective cooldown under AH, cost + resource | **support** manifest |
| Provenance | `setup_source` | per-axis `SideProvenance` | per-value `derivation` + source revisions | — |

### 2.2 Why inputs and derived values are never mixed (retained)

1. **An edited derived value drifts from its inputs.** An example is
   `first_ahri_syndra.py`'s `_AP = 100.0` / `_TARGET_MR = 30.0`.
2. **Identity becomes unstable.** Identity stays on inputs (`semantic_state_key`), and
   values stay on `resolved_state_digest` (§8).
3. **Unsupported gets confused with zero.** Every derived entry has a status.

### 2.3 `DerivedValue` shape (retained, one field added)

```
DerivedValue
  metric       : str                          "armor.total", "ability.Q.cooldown.effective"
  status       : "supported" | "unsupported" | "not_applicable"
  reason       : str | None                   required when unsupported: e.g. "derivation_support_range", "rune_effects_unsupported", "no_canonical_value"
  value        : number | None                None unless supported
  unit         : str
  derivation   : str                          "level_curve.v1", "haste_multiplier.v1", …
  depends_on   : tuple[str, ...]              input axes / derived metrics used
  sources      : tuple[SourceRevision, ...]   store + revision
```

### 2.4 Not in setup state (retained)

Current HP and resource, shields, buffs and debuffs, stacks, charges, cooldowns in flight
and gold belong to the **encounter** layer (Journeys, Applied-chain, Combat Lab).

---

## 3. Matchup state  *(revised; C2)*

### 3.1 Composition

```
MatchupResolvedState  (= ResolvedState, kind="matchup")
  sides        : (ResolvedSide, ResolvedSide)   FULLY INDEPENDENT: own level, ranks, items, runes, shards, form, position, derived block
  shared       : ResolvedSharedContext          ONE concrete basis, ONE ruleset, ONE rules revision
  pair_derived : PairDerived                    keyed (source_side, target_side, metric)
```

### 3.2 What the contract must represent, and what the first generator will use

**The contract** (capability) can represent every one of these as an ordinary state:

| State | Representable? |
|---|---|
| Ahri L6 vs Syndra L6 | yes |
| Ahri L7 vs Syndra L6 | yes. Levels are per side. |
| Ahri Q-max vs Syndra W-max at the same level | yes. Ranks are per side, and each is checked by that champion's own rules. |
| Different items / different item timings | yes. Items are per side. "Timing" is a *sequence* of states (§7), each one a full pair state. |
| Different runes / shards | yes. They are per side (derivation `unsupported` NOW). |
| Different derived stats | yes, by construction. Each side has its own `DerivedBlock`. |
| Mirror matchup, Ahri L11 vs Ahri L6 | yes. Sides are ordered by setup key when champions match (§3.3). |

**The first generator migration** may keep generating only today's cases: both sides at the
same `FactContext`, same-slot pairing (`SLOT_RELATIONS`), no items. That is a
**generator/policy limitation**, declared in the generator's own configuration, and it is
reversible without any contract change. It is not a property of the state. The old D-6
("only symmetric templates allowed until approved") is withdrawn as a contract-level rule
and replaced by an open generator-policy decision (§17 D-6).

**How today's comparisons map.** A comparison currently exists only when both facts share
an identical `FactContext` signature (`mastery/matchup/composer.py`). In this model it is a
pair candidate whose two sides happen to agree on every axis the metric reads, and its
binding is empty. So every current comparison key (e.g.
`ability_cooldown_compare:Ahri:W:vs:Syndra:W:r2`), the tie cap, deprioritization and
diversity stay byte-identical. An asymmetric comparison ("Ahri's armor at 7 vs Syndra's at
6") is a `PairDerived` comparison with a **non-empty** binding carrying per-side values. So
it can never collide with a symmetric key (§8.4).

### 3.3 Order independence: equality never depends on caller order

- **Canonical side order** is by `(champion slug, side setup key)`. The second term exists
  only to order mirror matchups. `(Ahri, Syndra)` and `(Syndra, Ahri)` produce the same
  `semantic_state_key` and the same `resolved_state_digest`. This extends the existing
  behaviour: `compose_matchup` sorts the pair by `champion_id` before doing anything
  (`composer.py:431`), `test_matchup_identity.py` proves that reversal yields an identical
  bank, and `mastery_config.readiness_key` sorts the pair.
- **Setup stays bound to its champion.** Canonical ordering moves whole sides. It never
  re-pairs a setup with the other champion. "Ahri L7 vs Syndra L6" ≠ "Ahri L6 vs Syndra L7".
- **Directional questions** ("Ahri's Q against Syndra") carry direction in their binding's
  `roles` (`{attacker: side_index}`), expressed **after** canonicalization. So direction
  survives the reorder, and "Ahri → Syndra" ≠ "Syndra → Ahri".
- **Symmetric questions stay symmetric.** "Who has more armor" has no roles, so it has one
  identity per pair state regardless of order. A mirror state with *identical* sides
  canonicalizes a directional role to the lower index, so it does not get two identities
  for one question.

---

## 4. Setup source abstraction  *(revised; C3)*

### 4.1 Honest statement of what exists

**Mogzy has no recommended-build authority today.** It also has no skill-order authority,
no rune-page authority and no shard authority. What exists:

| Material | What it actually is | What it is not |
|---|---|---|
| `quiz/data/champion_item_builds.json` | 173 champions of curated `build_paths`, `primary_role`, `source_patch_basis`. It calls itself a *whitelist and broad timing prior*. Entries carry `"confidence": "high"` next to `"needs_manual_review": true`. | Not a recommendation, not pick-rate data, not an authority. At most **one curated internal source** among several. |
| `mastery/data/build_candidates.py` | Curated Ahri `BuildCandidate`s with `CandidateClassification` | A shape precedent for provenance, one champion |
| LIVE1 `live_player_state` | Observed level-up orders, Riot ids with no mapping | Unusable until ids map |
| Historical pro corpus | No item or rune columns | Unusable for setup |

### 4.2 The contract

```
SourceRef                       what a template names (or what the source POLICY selects)
  source_id  : str               e.g. "curated.item_whitelist.v1", "manual", "saved:<ns>/<id>@<rev>"
  version    : str | None        honest None when the source has none

SetupSource   (conceptual protocol — adapters are Stage 2, not Phase 1)
  describe()                                   → SourceDescriptor (id, kind, classification, what axes it can fill)
  resolve(champion, ruleset, request)          → SetupRecord | SourceRefusal

SetupRecord                     NORMALIZED and SOURCE-INDEPENDENT
  champion, position?, level?, ability_ranks?, skill_order?, items?, runes?, shards?
  provenance : SourceProvenance

SourceProvenance
  source_id, source_kind, source_version
  classification : open vocabulary, e.g. "curated" | "manual" | "saved" | "historical" | "observed"
  confidence     : "declared" | "low" | "medium"      never passes a source's own "high" through
  patch_basis    : what the source claims, verbatim (free text)
  observed_at    : timestamp | None

SourcePolicy                    CONFIGURATION, not code in a generator
  default_by_axis : {axis → source_id | None}   None = the axis must be literal or rule-derived
```

**Kinds are an open, registered vocabulary**, not a closed enum. Revision 1's
`"literal" | "curated_default" | …` is replaced. The brief's list maps as follows:

| Brief's kind | Represented as |
|---|---|
| curated internal setup | a registered source; `champion_item_builds.json` would be **one** such adapter (`curated.item_whitelist`) |
| manual / custom | the template's literal values (the per-axis provenance records `manual`) |
| saved | a `saved:` source reading a stored template revision (storage is a later stage) |
| historical | a `historical:` source reading a frozen artifact's **inputs** (replaying frozen *values* is the artifact's job, not a source's) |
| another internal source | registering a new `source_id`. **No contract change, no generator change.** |

### 4.3 The replaceability invariants

1. **Resolution consumes only `SetupRecord`.** Nothing past stage 2 of §5 sees a
   `SourceRef` or a source-specific shape.
2. **Generators cannot tell sources apart.** A generator receives `ResolvedState`, and two
   sources that yield equal `SetupInputs` give equal `semantic_state_key` and
   `resolved_state_digest`.
3. **Provenance is preserved** per axis, frozen with the artifact, and **never** part of
   state identity.
4. **The default is configuration.** `SourcePolicy.default_by_axis` names the default. The
   first implementation may leave every axis `None` (literal only). Changing or replacing
   the default is a policy/config change, and no generator is touched.
5. **Presentation wording derives from provenance classification**, through a presentation
   policy, never from the generator. It may say "a curated build". It never says "the
   recommended" or "the optimal" build, because no authority for that claim exists.
6. **One source per side, no merging.** Literal values override the source visibly.
   Canonical data overrides a source's claims about game data. A source value that the
   rules or canonical data reject fails closed, and the error names the source.

---

## 5. Resolution pipeline (retained; stage 3 reworded for C1 and C4)

| # | Stage | Responsibility | Owns errors |
|---|---|---|---|
| 1 | Template validation | Shape, closed axis vocabulary, types, `kind` vs side count, one source per side, unknown keys refused. **No game-rule numbers here.** | `TemplateInvalid` |
| 2 | Basis + source resolution | Resolve `basis_request` to a **concrete available** basis, or refuse (§9). Apply `SourcePolicy` and fill open axes from the named source. | `HistoricalBasisUnavailable`, `SourceUnavailable`, `SourceNoRecord` |
| 3 | Normalization + legality | Canonical ids. **Legality by the rules authority at `(ruleset, basis)`**: level bounds, per-champion rank ceilings and availability, inventory policy. Evaluate `LevelRule` / `RankRule`. | `NormalizationError(unknown_champion \| item_not_current \| illegal_level \| illegal_rank \| rank_rule_unsupported \| inventory_policy \| basis_mismatch)` |
| 4 | Derivation | Every `DerivedValue`, with status, reason and `depends_on`, within the **declared support**. `PairDerived` for matchups. | Nothing fatal except a missing canonical source row (`SourceIntegrityError`) |
| 5 | Candidate generation | `Fact × ScenarioBinding` per family whose read-set the state satisfies | Per-candidate skip with a reason code |
| 6 | Publication gate | Family eligibility (unchanged) | `family_mode_ineligible` |
| 7 | Composition | Slice or Full over one universe | `SELECTION_EMPTY` / `SELECTION_UNDER_FILLED` |
| 8 | Presentation | Allow-listed public projection | Presentation refusal |
| 9 | Freeze | Optional private `state` block | Write failure fails the segment (existing) |

Stages 1–4 refuse the whole state. Stage 5 refuses individual candidates. Stages 6–7
refuse a segment only when nothing remains. Errors reach Ranked through the existing
preflight → `SourceIntegrityError` → `RANKED_MODULE_DATA_UNAVAILABLE` channel. Revision 1's
correction still stands: `resolver.publish` re-projects its universe inside
`_build_universe`, so the second half must eventually **receive** it (Stage 3 of §16).

---

## 6. Reuse of existing systems (retained, with C1/C3 edits)

| Component | Verdict |
|---|---|
| `CanonicalMasteryState` / `ChampionCanonicalState` | **Ideas, not the class.** It mixes setup with encounter, holds items by name, carries caller-supplied `derived`, and validates only certified bounds. It stays the Journeys' state. |
| `ValidationContext` / `InventoryPolicy` | **Reused as rules data.** `slot_limit: Optional[int]` is already the right shape for C1. |
| `champion_state` rank-ceiling tables | **Reused as rules data (new in rev 2).** They are store-guarded, per champion and per slot, and they are the correct ceiling source. Reading them does not modify Combat Lab. |
| `_min_level_for_rank` / `validate_rank_for_level` | **Not adopted as law (revised).** Both encode the ordinary rule only and are wrong for Nidalee, Elise, Karma, Jayce, Yuumi and Udyr. The rules authority carries the ordinary rule as a *default* plus declared per-champion exceptions. Neither function is changed. |
| Journey transitions | Vocabulary reused (`LEVEL_CHANGE`, `ABILITY_RANK_CHANGE`, `ITEM_ACQUIRE`, …); the engine stays separate. **Journeys are not the source of truth** and are not migrated. |
| Combat Lab derivation | Primitives reused (level curve, `item_canonical` loader, haste formula). The entry point is not reused. **Combat Lab is not modified.** |
| Mastery facts / banks / matchup composer | Reused directly. Candidates become `Fact × ScenarioBinding`, and the binding is empty for every current family. |
| Ranked frozen artifact | Extended additively in a later stage: a new optional sub-block, never inside `source`. |
| Generator Lab | Reused directly as the first consumer of state-aware candidates. |
| `champion_item_builds.json` | **One possible curated source adapter, not a default authority (revised).** |
| `CompositePatchDescriptor.patch_key_digest` / `canonical_patch.CanonicalPatch` | Reused as the **machine** and **label** parts of a current-basis identity (§9). |
| `mastery.provenance.hashing.content_hash` | Reused for every digest, so new digests share the existing canonical-JSON convention. |

---

## 7. Full vs Slice over one universe (retained)

- **One universe.** Candidates are generated per resolved state, over an ordered
  `StateSequence` (n ≥ 0). They are deduped by semantic identity, so a question whose
  dependency projection does not change between states exists once, at the earliest state.
- **Full is a traversal.** It walks states in order and topics within each state, with no
  budget. **Slice is bounded sampling.** It picks a coherent window and runs the existing
  budget composer inside it. They share generation, gate, identity and freeze.
- **Transition candidates** (depending on two states) are a separate candidate *kind* in
  the same universe. None exist now.
- **Today's slices** are the intrinsic universe, `n = 0`: Champion is levels
  `BANK_LEVELS = (6, 11, 18)` × all ranks; Matchup is the symmetric intrinsic join. They
  stay valid unchanged and are not migrated into sequences.
- **Independent sides extend naturally (C2).** A matchup sequence step may advance one side
  only (Ahri reaches 7 while Syndra stays at 6). That is exactly the asymmetric pair state
  §3 makes representable.
- **The progression data itself** (which levels, skill orders and purchase checkpoints) is
  out of scope. It is data (a list of template deltas), not code.

---

## 8. Identity  *(revised)*

### 8.1 Three identities

| # | Identity | Names | Built from | Excludes |
|---|---|---|---|---|
| 1 | **Semantic question identity** | *what is asked* | the existing intrinsic `identity_material` (fact / candidate / comparison) + **`ScenarioBinding`** when non-empty | answer values, patch/basis, sources, the rest of the state |
| 2 | **State identity**, in three parts | *which scenario* | see 8.2 | — |
| 3 | **Artifact instance identity** | *this served copy* | the existing Phase 4 `artifact_instance_id`, with the frozen block recording (2) | — |

### 8.2 The three parts of state identity

| Part | Answers | Built from | Excludes |
|---|---|---|---|
| **`semantic_state_key`** | *Is this the same scenario?* | Readable canonical string: ruleset; per side (in canonical order) champion slug, form, level, rank string, sorted item-id multiset (+ slot positions only if some consumer reads them), rune keys, shard keys. | data basis, derived values, sources, template, label |
| **`resolved_state_digest`** | *Are these the same exact numbers?* | `content_hash({semantic_state_key, derived values + statuses + reasons, derivation_version, rules_rev})` | source provenance, template, **basis label** |
| **Provenance / source metadata** | *Where did it come from, and against what?* | per-axis `SourceProvenance`, `ResolutionRecord`, concrete `DataBasis` | — it is never identity |

**Why the digest is value-bearing rather than `hash(state_key, basis key)` as revision 1
had it.** This follows the precedent the code already uses: `ChampionFact.fact_id`
excludes the value and `content_digest` includes it, and `ChampionQuestionCandidate` and
`MatchupQuestionCandidate` do the same with `candidate_id` / `content_digest`. None of them
include the patch key. A basis change that alters nothing the state reads leaves the digest
alone. A basis change that alters a number moves it. The concrete basis is still frozen
next to the digest, so "which data" is always answerable.

### 8.3 What changes each identity — the owner's examples

| Scenario | Semantic question id | `semantic_state_key` | `resolved_state_digest` | Provenance |
|---|---|---|---|---|
| **Same Ahri setup, resolved against newer canonical values** (a patch changed Ahri's base armor) | unchanged (the fact/candidate id already excludes value; the binding is unchanged unless a bound *value* moved) | **unchanged** | **changes**, because a derived value changed | basis changes |
| … and the patch changed nothing this state reads | unchanged | unchanged | **unchanged** | basis changes |
| **Same exact resolved setup from a manual vs a saved source** | unchanged | **unchanged** | **unchanged** | **differs** (`manual` vs `saved:…@rev`) |
| **Same intrinsic question under different ability haste** (Ahri Q r3 at 0 AH vs 20 AH, in a family that reads AH) | **differs**: same intrinsic part, bindings `{ability_haste.total: 0}` vs `{…: 20}` | differs (the items differ) | differs | — |
| … two different builds that both give 20 AH | **same** (the binding holds the resolved value, not the items) | differs | differs | — |
| … the intrinsic family (today's, reads no AH) | today's identity, **byte-identical**, empty binding | n/a (intrinsic) | n/a | — |
| **Same matchup state passed as `(Ahri, Syndra)` vs `(Syndra, Ahri)`** | same for symmetric questions. Directional questions keep direction in `roles` after canonicalization, so "Ahri → Syndra" is one identity from either call order. | **same** | **same** | same |
| Ahri L7 vs Syndra L6, compared with Ahri L6 vs Syndra L7 | differs where the answer depends on level | **differs** (setup is bound to champion) | differs | — |

**One case this revision records as a decision rather than deciding it.** Take "Ahri Q r3
at 0 AH" from a state-aware family (binding `{ability_haste.total: 0}`) and today's
intrinsic "Ahri Q r3" (empty binding). They have the same answer and different identities.
The design keeps them distinct, because empty means "did not read the axis" and `0` means
"read it and found zero". The two must not be conflated in identity. Whether a composer
should treat them as duplicates is a composition policy. It is §17 D-20, and it is OPEN.

### 8.4 Binding canonicalization rules (the Phase 1 helpers implement exactly these)

1. `ScenarioBinding = {roles: {role → side_index}, inputs: sorted((key, value)), version}`.
2. **Empty binding ⇒ identity material is returned unchanged.** No `"binding": {}` key is
   added. This is what keeps every existing `fact_id`, `candidate_id`, `candidate_key`,
   `content_digest`, `mastery:` ref and artifact digest byte-identical.
3. A non-empty binding is added under one new key. Since no current identity material has
   that key, a bound identity can never collide with an unbound one.
4. Keys in `inputs` are `side<i>.<metric_or_axis>` for pair states, with `i` a
   **canonical** index. Values are normalized (ints as ints, floats rounded to the metric's
   declared precision, never display-rounded for identity).
5. Roles are remapped whenever sides are reordered. When the sides are identical, roles
   collapse to the lowest index.
6. New state-bearing refs key on **slug and canonical item id**. Legacy display-name
   `mastery:` refs are untouched (§17 D-15, OPEN).

---

## 9. Data basis and versioning  *(revised; C4)*

### 9.1 A generic basis identity

```
BasisRequest       = "current" | pinned(DataBasisId)          (template side: a REQUEST)

DataBasisId        generic, opaque-but-readable identity of a canonical data version
  scheme           : str       e.g. "store_fingerprint.v1" today; "snapshot.v1" if snapshots ever exist
  key              : str       the scheme's identity (today: patch_key_digest-style digest over store revisions)

DataBasis          (resolved side: ALWAYS concrete)
  id               : DataBasisId
  patch_label      : league_patches patch_id + display_version — a LABEL, never identity
  store_revisions  : { champion_stats, champion_abilities, cooldown_authority, item_canonical, runes: "unversioned", … }
  availability     : "live_only" | "retrievable"    can this basis be re-read later?
  resolved_at      : timestamp
```

- **The contract is the same for current and historical.** A resolved state never stores
  `"current"`. It stores the concrete `DataBasisId` that "current" meant at that moment.
  A historical request, if it could be served, would produce a `DataBasis` of the same
  shape.
- **Availability is a capability, answered at stage 2.** Canonical stores are overwritten
  in place today, so exactly one basis is available: the live one. Its `availability` is
  `live_only`. The fingerprint identifies it, but it cannot be re-read later.
  `pinned(id)` is served only if `id` equals the live basis's id. Otherwise the request is
  refused with **`HistoricalBasisUnavailable`**. This keeps the current fail-closed rule
  exactly as it is.
- **If historical canonical snapshots are ever added**, a new `scheme` (or the same one
  with `availability = "retrievable"`) answers the availability question differently.
  `StateTemplate`, `ResolvedState`, `FrozenStateArtifact`, identity and every generator
  stay as they are. **No historical storage system is designed or implied here.**
- The basis label is `canonical_patch.current_canonical_patch()`: the catalog's live row,
  or `None` rendered as unresolved, never a guessed number. The machine key follows the
  `CompositePatchDescriptor.patch_key_digest` convention (the label is excluded from key
  material, as that module already does).

### 9.2 What re-resolves, and what stays frozen

| Change | Template | Next resolution | Served / frozen |
|---|---|---|---|
| Champion or item data changes | unchanged | same `semantic_state_key`; digest moves only if a read value moved | frozen, never re-resolved |
| Item removed from the game | unchanged | fails closed: `item_not_current` | frozen, readable |
| Rules data changes (e.g. a rank ceiling) | unchanged | `rules_rev` moves; a state newly illegal is refused | frozen with its `rules_rev` |
| Derivation support widens | unchanged | values that were `unsupported` become `supported`; the digest moves | frozen |
| Source content changes | unchanged | new `SetupRecord` → new `semantic_state_key` where inputs differ | frozen, with the old source version in provenance |
| New patch goes live | unchanged | new label; basis id moves only if stores moved | frozen label stays |
| Pinned basis ≠ live basis | — | **refused** (`HistoricalBasisUnavailable`) | replay a frozen artifact instead |

History is reproducible from the frozen artifact, never from re-running anything. This is
the Phase 4 principle applied to state.

---

## 10. State mutability (retained)

The template is immutable, and saved templates get revisions. A resolved state is
immutable, and a transition means applying a template delta and **re-resolving**, so
derived values are never patched. A delta that yields a state the rules forbid fails at
normalization, under the **rules authority**, not a hardcoded "seventh item" or "level 19"
rule. Encounter state stays outside this contract (Journeys' `apply_transition`). Frozen
artifacts are never mutable.

---

## 11. Fail-closed behaviour

### 11.1 Rules (revised rows marked ★)

| Condition | Stage | Behaviour |
|---|---|---|
| Unknown champion slug | 3 | `NormalizationError(unknown_champion)` |
| Item unknown or not current under the basis/ruleset | 3 | `NormalizationError(item_not_current, item, source)`. Never kept with zero stats. |
| ★ Level outside the **ruleset's** bounds | 3 | `NormalizationError(illegal_level, rule=…, rules_rev=…)`, from rules data. **No clamp.** A non-int level is `TemplateInvalid` at stage 1. |
| ★ Level inside the rules but outside **derivation support** | 4 | State resolves. Level-dependent values are `unsupported(derivation_support_range)`. Questions that read them are skipped. |
| ★ Rank above the champion's ceiling, or unavailable at the level | 3 | `NormalizationError(illegal_rank)`, using the per-champion ceiling tables and availability rule. Checked for every champion. |
| ★ Champion whose rank-availability rule is not declared as data | 3 | `NormalizationError(rank_rule_unsupported)`. **Never** falls back to the ordinary 2r−1 / 6-11-16 rule. |
| ★ Inventory violates inventory policy | 3 | `NormalizationError(inventory_policy, rule=…)`, from policy data (slot count, unique groups) |
| Rune / shard unknown | 3 | `NormalizationError(unknown_rune \| unknown_shard)` |
| Rune / shard known, effect unsupported | 4 | kept in inputs; contribution `unsupported`; fatal only for a question that reads it |
| Champion stat row missing | 4 | `SourceIntegrityError` → `RANKED_MODULE_DATA_UNAVAILABLE`. Never zero stats. |
| A single canonical value missing | 4 / 5 | `unsupported(no_canonical_value)`; the candidate is skipped with a reason |
| Two sources for one side | 1 | `TemplateInvalid(multiple_sources)` |
| Source vs canonical disagreement | 3 | Canonical wins on game data; the error names the source |
| Pair sides on different bases | 3 | `NormalizationError(basis_mismatch)` |
| ★ Requested historical basis not available | 2 | `HistoricalBasisUnavailable`. Never silently served from current data. |
| Provenance unavailable | 3 / 4 | recorded honestly (`"unversioned"`, `None`); never invented |

### 11.2 Existing paths that violate the principle (observed at `b1fd3510`; not changed)

| Path | Violation |
|---|---|
| `services/combat_helpers.py` — missing champion → `default_preview_base_stats(level)` | zero base stats, no error |
| `services/combat_helpers.py` — level clamp to `MAX_PREVIEW_LEVEL`; rank `max(1, min(ceiling, …))` | a silent clamp changes the input |
| `calculate_build_stats.py` | an item with no canonical row stays in the build at zero stats |
| `calculate_loadout_stats.calculate_rune_stats` | an unknown rune contributes nothing, silently |
| `champion_stat_profile.apply_stat_shards` | an unknown shard is "ignored"; shard values are code literals |
| ★ `transitions._min_level_for_rank`, `combat_scenarios.resolver.validate_rank_for_level` | the ordinary rule only. Wrong for four-rank ultimates that start at rank 1 (Nidalee, Karma, Elise) and six-rank basics (Jayce, Yuumi, Udyr). The resolver raises on R rank 4. |
| `ChampionCanonicalState._validate_certified` | uncertified champions' ranks unchecked |
| `ChampionCanonicalState.current_health = 0.0` default | a sentinel zero next to a real zero |
| Applied-chain `physical_penetration_set.py` | `100.0` HP/resource placeholders |
| `first_ahri_syndra.py` | scenario values the state does not imply |
| `mitigation.effective_resistance` vs `penetration.calculate_effective_resistances` | % penetration as 0–1 vs 0–100 |
| `quiz/data/champion_item_builds.json` | `"confidence": "high"` next to `"needs_manual_review": true` |

These stay as they are. The state contract does not route through them and adopts none of
their semantics.

---

## 12. Reuse by current systems (retained)

| System | Consumes | Keeps owning |
|---|---|---|
| Champion Mastery | `ResolvedState` (champion). Intrinsic NOW, identical to today. | composition, curriculum |
| Matchup Mastery | `ResolvedState` (matchup). Symmetric generator policy NOW. | tie policy, join, diversity |
| Generator Lab | the frozen `state` block via allow-listed `review_view` fields; later a template picker | nothing state-related |
| Combat Lab | optional later adapter `ResolvedSide → TeamSimCombatantInput`. **Not changed.** | simulator state and derivation |
| Quiz analytics | `semantic_state_key` + binding via `quiz_attempts.provenance_json` (Phase 4 already populates it); zero DDL | attempt rows |
| Saved / custom sets | persist a **template** revision, never a resolved state | set metadata |
| GRAPH1 stat growth | a Full traversal over a level sequence, reading `DerivedBlock` | datasets, rendering |
| Mastery Journeys | unchanged; optional later projection to `CanonicalMasteryState` | encounter state, authored content |
| Frontend | "the frontend never derives" | UI state |

## 13. What should NOT be unified (retained)

Presentation-only UI state, interaction state, `quiz_attempts` rows, Journey progress,
animation state, simulator `CombatState` and tick timelines, Ranked match state, encounter
vitals, Combat Lab drafts, and Patch Ops staging. Revision 1's reasons all still hold.

---

## 14. NOW / NEXT / LATER (revised for C1–C4)

**NOW — contracts + identity, inert (Phase 1, §15):** types, identity and canonicalization,
structural validation, the refusal vocabulary, and a basis-request contract that refuses
historical requests. No resolution, no derivation, no source reads, no callers.

**NEXT:** the rules authority (from existing tables); current-basis resolution; source
adapters behind `SourcePolicy`; the derivation authority with a declared support manifest;
the first state-aware family in the Generator Lab; a single-state Slice window; the
optional frozen `state` block.

**LATER:** Full composer; asymmetric matchup generation (policy); transition candidates;
rune/shard numeric effects; item passives; damage, mitigation and penetration as
`PairDerived`; the encounter layer; observed sources; historical bases (only if snapshots
are ever built, with no contract change).

---

## 15. The smallest Phase 1 implementation seam  *(new — PROPOSED, NOT IMPLEMENTED)*

### 15.1 Shape

**A new, pure, import-isolated package with no callers.** It holds the contract types, the
identity and canonicalization helpers, the structural validation and refusal vocabulary,
and the basis-request contract. It also carries tests proving that, with no binding, it
reproduces every existing Mastery identity exactly. It performs **no I/O** and has **no
importer** outside its own tests.

### 15.2 Files likely involved (backend, all NEW; zero existing files modified)

| File | Adds |
|---|---|
| `mastery/setup_state/__init__.py` | Public names. The package name avoids `mastery/state/`, which is `CanonicalMasteryState` (Journeys) and must not be confused with this. Name is §17 D-18, OPEN. |
| `mastery/setup_state/contract.py` | Frozen dataclasses: `StateTemplate`, `SideTemplate`, `SharedContextTemplate`, `BasisRequest`, `DataBasisId`, `DataBasis`, `SetupInputs`, `SetupRecord`, `SourceRef`, `SourceProvenance`, `SourcePolicy` (type only), `DerivedValue`, `DerivedBlock`, `PairDerived` (type only), `ResolvedSide`, `ResolvedState`, `ScenarioBinding`, `FrozenStateArtifact` (type only), `DerivationSupport` (type only). The closed axis vocabulary. **No game-rule numbers anywhere** (C1). |
| `mastery/setup_state/identity.py` | `semantic_state_key(...)`; `canonical_side_order(...)` with role remapping; `canonical_binding(...)`; `bind_identity(material, binding)` (empty → material returned unchanged, §8.4 rule 2); `resolved_state_digest(...)` via `mastery.provenance.hashing.content_hash` |
| `mastery/setup_state/validation.py` | Structural validation only: types, shapes, unknown keys refused, `kind` vs side count, one source per side, closed axis vocabulary. `check_basis_request(request, available_ids)` refuses any pinned id not in the supplied set. **No DB, no rules data.** |
| `mastery/setup_state/errors.py` | `TemplateInvalid`, `NormalizationError` (codes only, raised later), `HistoricalBasisUnavailable`, `SourceUnavailable`, reason-code constants |
| `mastery/tests/test_setup_state_contract.py` | Construction, immutability, C1–C4 representability (below) |
| `mastery/tests/test_setup_state_identity.py` | Canonicalization, order independence, the §8.3 table as tests |
| `mastery/tests/test_setup_state_legacy_invariance.py` | The empty-binding invariance proof over existing banks |
| `mastery/tests/test_setup_state_isolation.py` | Architectural guard rails, on the `test_champion_facts_isolation.py` pattern |

### 15.3 Explicitly NOT wired in Phase 1

No import of the package from `mastery/knowledge`, `mastery/matchup`, `mastery/synthesis`
(`resolver`, `recipe`, `service`, `preflight`), `mastery/serving`, `mastery/publication_gate`,
`quiz/`, `ranked_modules/` (`mastery_slice`, `mastery_config`), `routes/`, Combat Lab
modules, or `mastery/state` / `mastery/transitions`. No change to `FactContext`,
`identity_material`, `candidate_key`, `_key_for`, `BANK_LEVELS` or `projection.MAX_LEVEL`.
No rules authority, no derivation, no source adapter (`champion_item_builds.json` is **not
read**), no basis resolution against the DB. No frozen block is written. No config key. No
flag. No frontend. No migration. No Generator Lab change.

### 15.4 Acceptance tests

1. **Legacy identity invariance (the key test).** Build Champion knowledge banks and
   Matchup banks from the existing synthetic fixtures (`mastery/tests/facts_support.py`,
   every `SHAPES` entry, and `test_matchup_identity`'s pairs). For **every** fact,
   candidate and comparison, check that `bind_identity(x.identity_material(),
   EMPTY_BINDING)` is `==` to the original, and that `content_hash` of it reproduces
   `fact_id()`, `candidate_id()` and `content_digest()` byte-for-byte. `candidate_key`s are
   compared as a set before and after.
2. **Bound ≠ unbound.** Any non-empty binding changes the id, and two different bindings
   give two different ids.
3. **Order independence.** `(Ahri, Syndra)` ≡ `(Syndra, Ahri)`: equal `semantic_state_key`
   for both symmetric and **asymmetric** side setups. Directional roles are remapped. A
   mirror pair with identical sides collapses roles.
4. **C2 representability.** Ahri L7 vs Syndra L6, differing ranks, items, runes and
   shards all construct. "Ahri L7 / Syndra L6" ≠ "Ahri L6 / Syndra L7".
5. **C1 representability.** Level 19, a rank of 6, a four-rank R and a seven-item sequence
   all **construct** (the contract has no game-rule limit). The isolation test asserts
   that no numeric game limit (18, 6 slots, rank 3/5) appears in the package source.
6. **C3.** Two `SetupRecord`s equal except for provenance give equal
   `semantic_state_key`. Provenance is absent from key material.
7. **C4.** `BasisRequest.pinned(X)` with `X` not in the available set →
   `HistoricalBasisUnavailable`. `pinned(live_id)` passes. `DataBasis` has one shape for
   both `availability` values.
8. **Isolation.** The package's module set is pinned. No module outside `mastery/tests`
   imports `mastery.setup_state` (an AST scan of the repo). No `sqlite3.connect`, no route,
   no import of `quiz.family_contract`, the generator registry or the mode gate. No import
   of `mastery.data`, and no numeric literal that could be a champion value.
9. **No behaviour moved.** `test_knowledge_bank_*`, `test_matchup_*`,
   `test_gr1_phase3_composition`, `test_gr1_phase4_artifact_persistence`,
   `test_gr1_champion_mastery_product_readiness`, `test_gr1_matchup_*` and
   `test_phase4f_ranked_mastery_slice` produce the **same failure set** as the base commit
   (compare sets, not totals; the Mastery isolation tests fail by construction on any
   branch). `git diff --stat base..phase1` lists only new files.

A read-only roster-wide probe (173 champions + a pair sample) may be run as evidence. It
is not committed (project rule: no diagnostics in commits).

### 15.5 Rollback surface

One commit that adds files only. Rollback is `git revert` of that commit, or deleting the
package and its four tests. Nothing to un-migrate, no data, no config, no flag, no
deploy-time state. Since nothing imports the package, removing it cannot break a caller.

### 15.6 Why this is a safe seam

- **Additive and uncalled.** Test 8 enforces the "no importers" claim mechanically, so a
  later careless wire-up fails CI.
- **No I/O.** It cannot read a stale DB, write anything, or depend on canonical data
  freshness.
- **It fixes the one invariant everything later depends on**: an empty binding preserves
  every existing identity. It proves that on the real bank builders before any generator
  is touched.
- **It commits the contract to C1–C4** while it is still cheap to change. Nothing
  downstream has been built on it yet.
- **Zero player-facing difference**: no Champion Slice, Matchup Slice, composition, family,
  Full mode, frontend, persistence, Combat Lab or Journey change.

---

## 16. Migration stages (revised: five substantial stages)

| Stage | Scope | Player-facing change | Safety property |
|---|---|---|---|
| **1 — Contracts + identity (inert)** | §15 | none | files-only diff; empty-binding invariance proven on real banks |
| **2 — Resolution + derivation (uncalled by serving)** | Rules authority composed from existing data (`champion_state` ceilings, declared rank-availability rules, `InventoryPolicy`) keyed by ruleset + basis. Current-basis resolution, where historical requests refuse. `SetupSource` protocol + `SourcePolicy` (default = none/literal) + one curated adapter, if §17 D-9 approves one. Derivation authority from existing primitives, with a declared support manifest (levels 1–18 initially). | none | still no serving importer; derivation parity tests against `mastery/facts/projection.py` values at the intrinsic points |
| **3 — First state-aware family in the Generator Lab** | `resolver.publish` receives its universe instead of re-projecting (byte-identity probe, tested alone). One family declares a read-set (e.g. cooldown under resolved AH). Admin-only, behind a flag. Optional private frozen `state` block. | none (admin Lab only) | intrinsic families unchanged; `test_gr1_phase4_artifact_persistence` green unchanged; public allow-lists untouched |
| **4 — Slice consuming a resolved state / window** | A Slice window over one non-intrinsic state (then a short run), Lab first. Public exposure is a separate owner decision. Matchup may add asymmetric *generation* here if §17 D-6 approves it. | none until the owner opens it | the existing budget composer runs inside the window unchanged |
| **5 — Full composer** | Traversal over a `StateSequence` with semantic-identity dedupe. Separate phase. | per owner | consumes the same universe; no second generation system |

Held throughout: current slices keep working; Journeys are not the source of truth and are
not migrated; Combat Lab is not modified; frozen artifacts stay valid; generators move one
family at a time.

---

## 17. Decisions

**Status key.** **APPROVED** = the owner approved it in this conversation (2026-09-19 brief),
either as a correction or as a retained concept. **OPEN** = a recommendation only. Where
the owner approved the principle and left a sub-question, the row says so.

### 17.1 Owner-approved architectural constraints

| # | Decision | Status |
|---|---|---|
| **A-1** | **No architectural level-18 cap.** Level (and slot count, rank ceilings, page shapes) is data. Legality comes from a rules authority. Derivation support is declared separately. STATE MODEL CAPABILITY ≠ CURRENT DERIVATION SUPPORT. | **APPROVED** |
| **A-2** | **Matchup state supports independent sides** (level, ranks, items, runes, shards, derived stats). Symmetric-only generation is a generator policy. Pair-order equality never depends on caller order. | **APPROVED** |
| **A-3** | **Build/setup source remains replaceable.** Resolution consumes normalized `SetupRecord`. Generators are source-blind. Provenance is preserved. The default is configuration. `champion_item_builds.json` is not a foundational authority. | **APPROVED** |
| **A-4** | **The historical-patch limitation is capability, not state-model law.** Generic `DataBasisId`. Current and historical share one contract. Unavailable bases are refused. | **APPROVED** |

### 17.2 Retained concepts the owner confirmed

| # | Decision | Status |
|---|---|---|
| R-1 | Questions consume state; they do not own or hardcode it. | **APPROVED** |
| R-2 | `StateTemplate` = request; `ResolvedState` = exact normalized + derived; `FrozenStateArtifact` = what was served/saved. | **APPROVED** |
| R-3 (old D-4) | `FactContext` stays intrinsic; scenario inputs go in a separate `ScenarioBinding`. | **APPROVED** |
| R-4 (old D-8) | Source provenance is not semantic state identity. | **APPROVED** |
| R-5 (old D-11, principle) | One generated universe feeds Full and Slice; they are composers, not generation systems. | **APPROVED** (sub-question D-11 below stays OPEN) |
| R-6 | Existing generated artifact history remains valid. | **APPROVED** |
| R-7 (old D-16, principle) | Journey concepts may inform the design; Journey is not the source of truth; no Journey migration in the first implementation. | **APPROVED** (long-term adapter question stays OPEN) |
| R-8 | Combat Lab is not modified as part of the first state implementation. | **APPROVED** |
| R-9 | Fail closed; never silently substitute zero/default values. | **APPROVED** |

### 17.3 Open decisions

| # | Decision | Options | Recommendation | Status |
|---|---|---|---|---|
| **D-1** | Scope of the reusable state | (a) setup only; encounter is a separate later layer. (b) setup + encounter. | **(a)**. (b) grows into `CanonicalMasteryState`'s god object. | OPEN |
| **D-2** | New contract vs extending `CanonicalMasteryState` | (a) new small contract; `CanonicalMasteryState` stays for Journeys. (b) generalize it. | **(a)**. (b) inherits name-keyed items, caller-supplied `derived`, certified-only checks and 13 pinned Journey artifacts. R-7 leans this way but does not decide it. | OPEN |
| **D-3** (revised) | Rank legality and derivation authority | (a) a new rules authority (per-champion ceiling tables from `champion_state` + ordinary availability rule + declared per-champion exceptions, keyed by ruleset/basis) and a new pure derivation module from existing primitives with a declared support manifest. (b) adopt `_min_level_for_rank` as *the* rule (revision 1's recommendation). (c) reuse Combat Lab's `build_runtime_champion_stats`. | **(a)**. (b) is withdrawn: it is wrong for six champions today. (c) clamps and zero-fills. | OPEN |
| **D-5** | Semantic question identity under state | (a) dependency projection (resolved values the answer reads). (b) full state digest. (c) template/source. | **(a)**. (b) splits analytics per build and per data refresh. (c) contradicts R-4. | OPEN |
| **D-6** (revised) | Matchup **generation** policy (not the contract, which A-2 settles) | (a) first migration generates only today's symmetric cases; asymmetric generation is a later owner-approved policy. (b) generate asymmetric pairs from the start. | **(a)**. It keeps the first migration byte-identical and puts asymmetric generation behind product review, with no contract change either way. | OPEN |
| **D-7** (revised) | Shape of the basis identity | (a) `DataBasisId{scheme, key}` + label + store revisions + `availability`; "current" is a request alias only. (b) key on `league_patches.patch_id`. | **(a)**. (b) claims values are identified by a label, which in-place overwrites make false. The principle is A-4 (APPROVED); this row is only the field shape. | OPEN |
| **D-9** (revised) | Initial `SourcePolicy` default | (a) no default: literal/manual only until a real authority exists. (b) register `champion_item_builds.json` as one `curated.item_whitelist` adapter and name it the default for items, with confidence normalized and "curated" wording. (c) (b) but not the default: selectable only by name. | **(c)**. It makes the file available without elevating it. The default stays none until the owner names one, and changing that is config only (A-3). | OPEN |
| **D-10** | Runes/shards now | (a) representable, derivation `unsupported`. (b) compute the existing flat rows and literals. (c) exclude. | **(a)** | OPEN |
| **D-11** (sub-question) | May Full ask what Slice's window-local policies cap (e.g. ties)? | (a) yes; policies are window-local. (b) Full inherits Slice's exclusions. | **(a)** | OPEN |
| **D-12** | Full traversal model | (a) through game states, topics within each state. (b) through topics over a fixed state. | **(a)** | OPEN |
| **D-13** | Transition questions | (a) same universe, separate candidate kind, deferred. (b) a separate product. | **(a)**, not built now | OPEN |
| **D-14** | Frozen state payload | (a) private sub-block: inputs, `derived_used`, concrete basis, rules revision, provenance, step bindings. (b) the full derived block. | **(a)**. The principle of freezing what was served is R-2 (APPROVED); this row is only the payload. | OPEN |
| **D-15** | Keys for new state-bearing refs | (a) slug + canonical item id; legacy `mastery:` refs untouched. (b) display names. | **(a)** | OPEN |
| **D-16** (remainder) | Journeys long-term | (a) coexist, optional one-way adapter later. (b) migrate. (c) retire. | **(a)** | OPEN (the principle is R-7, APPROVED) |
| **D-17** | Eligibility of new state-reading families | (a) `quiz/family_contract.py` + a Mastery-side pin test per family (the QCA8 lesson). (b) Mastery-owned table. | **(a)** | OPEN |
| **D-18** (new) | Phase 1 package name / location | (a) `mastery/setup_state/`. (b) `mastery/scenario/`. (c) extend `mastery/state/`. | **(a)**. (c) collides with the Journeys' `CanonicalMasteryState`. | OPEN |
| **D-19** (new) | Initial derivation support | (a) SR, levels 1–18, level curve + item base stats + AH + cooldown/cost, declared as a manifest. (b) a narrower first slice (level curve only). | **(a)**. Every one of these has canonical data today. | OPEN |
| **D-20** (new) | Answer-equivalent identities: bound `{AH: 0}` vs intrinsic (empty) | (a) distinct identities; a composer may dedupe by answer-equivalence as a policy. (b) elide zero-valued bindings into the intrinsic identity. | **(a)**. (b) makes "did not read" and "read zero" indistinguishable. | OPEN |
| **D-21** (new) | Proceed with Phase 1 as specified in §15 | approve / amend / defer | **approve** | OPEN |

---

## 18. Out of scope — confirmed not done

No runtime code. No schema, no migration. No Mastery, Matchup or QCA behaviour change. No
tie-policy change. No family unlocked. No Full mode. No Combat Lab or Journey change. No
external data source. No frontend UI change. **Phase 1 is not implemented.** The backend
was read at `b1fd3510` with `git show` / `git grep` only. No database was opened. Only
this document and the handoff were edited.
