# GR1 Phase 2 — Generator Source Authority and Integrity

**Date:** 2026-09-11
**Type:** Implementation. Scope deliberately narrow: make Champion Mastery, Matchup
Mastery and Applied-chain generation use defensible source authority, detect drift
instead of silently tolerating it, and honour their generation contract.
**Predecessor:** [`ranked-mastery-slice-current-state-audit.md`](./ranked-mastery-slice-current-state-audit.md)
(audit only, nothing implemented). This phase implements against its findings.

---

## 1. Upstream commits audited

| Repo | Branch | Audit SHA (GR1 Phase 1) | Head at Phase 2 start | Moved? |
|---|---|---|---|---|
| Backend `League_Combat_Simulator` | `origin/master` | `11c96ab0` | **`705cdefe`** | **+1 commit** |
| Frontend `mogsy` | `origin/main` | `7d7de643` | **`147c9996`** | **+1 commit** |

**Reconciliation of the two new commits — neither touches Mastery generation authority:**

- Backend `705cdefe` *"an attempt is identified by its KEY, and quiz_attempts is reset once"* —
  QR1's attempt-recording foundation. It rebuilds `quiz_attempts` and adds
  `source` / `choices_snapshot` / `source_version` / `provenance_json`. `quiz_attempts`
  integration is **explicitly out of scope** for this phase and nothing here touches it.
  Work is based on this commit.
- Frontend `147c9996` *"the summoner spell card is the item card's sibling"* — RIV2 visual
  extraction. No Mastery code. Work is based on this commit.

**Repository safety.** The owner's primary checkouts were confirmed still stale and dirty
(backend on `live1/phase4b1-match-context` @ `28bf2ee4`, 50+ modified files; frontend on
`main` @ `e12f5900`). **Neither was modified.** All work was done in fresh worktrees:

| Purpose | Path | Base |
|---|---|---|
| Backend implementation | `/Users/macmoney/lcs-wt-gr1p2` (branch `gr1/phase2-source-authority`, commit **`73ad9c00`**) | `705cdefe` |
| Backend clean baseline (for failure-set diffing) | `/Users/macmoney/lcs-wt-gr1p2-base` (detached) | `705cdefe` |
| Frontend documentation | `/Users/macmoney/mogsy-wt-gr1p2` (detached) | `147c9996` |

No Docker. No production writes. No deployment.

---

## 2. Exact files changed

### Backend — new

| File | What it is |
|---|---|
| `mastery/facts/integrity.py` | Mechanical verification of the cooldown authority artifact against `champion_abilities`. Separates SOURCE FAILURE from per-ability DRIFT. |
| `mastery/provenance/certified_provenance.py` | Drift/staleness checking for the certified applied-chain constants against `champion_ability_formulas`. Placed in `provenance`, not beside the constants: a verifier inside the store it verifies is the wrong shape, and the Mastery slice guards explicitly forbid this branch from adding to `mastery/data/`. |
| `mastery/provenance/canonical_patch.py` | Reads the current League patch from the canonical `league_patches` catalog. |
| `mastery/synthesis/preflight.py` | Per-mode source preflight (`champion`, `matchup`, `applied_chain`). |
| `mastery/tests/test_gr1_phase2_source_authority.py` | 28 targeted tests, one per behaviour this phase closed. |

### Backend — modified

| File | Change |
|---|---|
| `mastery/facts/sources.py` | Cooldown authority loads **fail-closed**; adds `CooldownAuthorityUnavailable`, `CooldownAuthorityProvenance`, `cooldown_authority_provenance()`. |
| `mastery/manifest/resolver.py` | `_seed_for` / `resolve` / `resolve_with_universe` accept an optional `selection_salt`. |
| `mastery/publication_gate/gate.py` | `gate_snapshot` / `publish` forward `selection_salt` to **both** resolutions. |
| `mastery/synthesis/service.py` | Champion + Matchup gain `selection_salt`; patch label derived from canonical data; source preflight before synthesis. |
| `mastery/synthesis/applied_chain.py` | Seeded (alternation-preserving) item rotation; canonical patch label; source preflight. |
| `mastery/synthesis/errors.py` | Adds `SourceIntegrityError` (a `SynthesisError`, **not** an `InsufficientQuestionsError`). |
| `ranked_modules/mastery_slice.py` | The match's `order_seed` now reaches generation as a per-segment selection salt. |
| `ranked_public/readiness.py` | Reports `error_kind`, `patch_display` and `source_advisories`. |
| `mastery/tests/test_cross_check_db.py` | Damage cross-checks now assert through a provenance gate. |
| `mastery/tests/test_champion_facts_isolation.py` | Architectural whitelist extended to `integrity.py`. |
| `mastery/tests/test_phase5_mastery_slice_config.py` | Prefix test compares against a same-salted artifact. |
| `test_ranked_mastery_applied_chain.py` | Determinism test asserts seed-reproducibility rather than seed-independence. |

**Frontend: no code changed.** Documentation only.

---

## 3. Cooldown authority — before and after

### What the audit proved

`fixtures/dc1_phase2f_cooldown_authority.json` is load-bearing for Champion and Matchup
generation and **failed open**: a missing or corrupt file returned `{}`, and generation
continued against a quietly different, smaller candidate set. No exception, no log line,
no readiness failure.

### Where it came from (required investigation)

It is **not** hand-written. `scripts/dc1_ability_semantic_audit.py` generates it by reading
`wiki.leagueoflegends.com` through the approved internal wiki parser
(`knowledge_engine.parsers.official_wiki_ability` + `knowledge_engine.providers.official_wiki`).
Lineage: approved wiki authority → generated artifact → generator. That is already the
architecture the phase brief asks for; what it lacked was verification and failure behaviour.

### Can the canonical DB supply it instead? — measured, not assumed

| Semantic | In `champion_abilities`? | Measured agreement |
|---|---|---|
| Cooldown value (per rank) | **Yes** (`cooldown`) | 664 agree / 2 disagree / 22 undeterminable, of 688 |
| Haste immunity | **Yes** (`cooldown_is_static`) | **688 / 688 agree — zero disagreements** |
| Wiki revision id | **Yes** (`authority_revision_id`) | 685 identical, 3 where the **store is newer** |
| **Cooldown SHAPE** | **No column exists** | 26 abilities publish a cooldown that is *not* a plain per-rank number |

**Verdict: the artifact is not a duplicate numeric authority and must not be deleted.**
The value of record was already `champion_abilities.cooldown` — the artifact never supplies
the number, it *arbitrates* it. Its irreducible content is the **shape taxonomy**:

```
RANK_PROGRESSION 493   RANK_INVARIANT 156   STATIC 13        <- projectable
CONDITIONAL 9   UNVERIFIABLE 7   NONE 5   STATIC_SECONDARY 4   AUTHORITY_DEFECT 1
```

Those last 26 are *fail-closed holds*: `mastery/facts/projection.py` refuses to project a
cooldown fact for them. `champion_abilities` cannot express that, so removing the artifact
would start asking players about abilities whose published cooldown is not the number the
row holds — a correctness regression, not a simplification.

### What changed

| | Before | After |
|---|---|---|
| Missing / corrupt / empty artifact | returns `{}`, generation continues silently | raises `CooldownAuthorityUnavailable` → `SourceIntegrityError` → `RANKED_MODULE_DATA_UNAVAILABLE` |
| Artifact provenance | unreadable from its own contents; no patch/version field | `cooldown_authority_provenance()` → content SHA-256, entry/champion counts, declared source SHA, authority host, revision min/max |
| Verification against its store | **none** | `verify_cooldown_authority(conn)` compares every ability on value, staticness, revision and coverage |
| Drift | invisible | 6 named codes, per ability, per champion, surfaced in the readiness report |

**Fail-closed proof, end to end:**

```
REFUSED: RankedServiceError | RANKED_MODULE_DATA_UNAVAILABLE |
  Champion Mastery (ahri) cannot be generated: champion Mastery for ahri
  cannot be generated from a trustworthy source: simulated: artifact not deployed
```

**Drift found on the live local store (previously invisible, now reported):**

| Code | Count | Example |
|---|---|---|
| `AUTHORITY_VALUE_DRIFT` | 2 | Camille W: store `12/11.5/11/10.5/10` vs authority `15/14/13/12/11` (rev 4007585); Kalista E: store `0/0/0/0/0` vs authority `10/9.5/9/8.5/8` |
| `AUTHORITY_REVISION_STALE` | 3 | store cites a newer wiki revision than the artifact (e.g. Ashe Q: store 4050582, artifact 4016907) |
| `STORE_ROW_UNARBITRATED` | 4 | store has an ability the artifact never audited; shape is derived and says so |

### Why drift does not block generation

Blocking a whole champion because one of its abilities is disputed would **delete working
content to punish a fact that is already withheld** — the projection certifies a drifted
cooldown as `AMBIGUOUS` and never turns it into a question. The gap was never the refusal;
it was that nobody was told. So:

- `AUTHORITY_UNAVAILABLE` (the artifact itself) → **refuses generation**.
- Everything else → reported as `source_advisories` on a *successful* readiness report.

Verified: a Camille slice remains servable **and** its drift is now printed beside it.

---

## 4. Applied-chain numeric authority — before and after

### Before

Champion numbers come from six hand-authored modules in `mastery/data/`, each ability
carrying a `SourceBinding`. Five `test_cross_check_db` tests were **red** against
`champion_ability_formulas`, and the guard could not distinguish "the certified copy
drifted" from "this database has not received a correction the copy already carries".

### The decisive measurement

**Every** damage row in the local `lol_calc.db` reads `source_sheet='Champions'` at
`2026-05-31 06:52:52` — one spreadsheet import, with **none** of the CHAMPDATA corrections
applied. Production, queried through its own public docs API
(`GET /api/docs/champions/{slug}/abilities` on `web-production-83e53.up.railway.app`,
read-only, no admin key — see the DB-convergence note), **agrees with the certified Python
on every disputed value**. See §5.

### After

`mastery/provenance/certified_provenance.py` classifies each comparison before asserting on it:

| Code | Meaning | Blocking |
|---|---|---|
| `CERTIFIED_AGREES` | copy and store agree | — |
| `STORE_PREDATES_CORRECTION` | the store predates the correction the copy cites, **or** the whole store predates the newest correction the certified set carries | no (advisory) |
| `CERTIFIED_DRIFT` | a store at/after the correction still disagrees | **yes** |
| `BINDING_UNSOURCED` | a **current** store disagrees and the binding names no correction | no — reported loudly (see §11) |
| `STORE_ROW_MISSING` | no damage row for a certified ability | no |

Two staleness rules, because a store can be behind in two ways: **per binding** (the row's
`updated_at` predates the date that binding's `champdata-<pass>:<date>` revision declares)
and **wholesale** (the newest write anywhere in the table predates the newest correction the
certified set carries — which is exactly the local snapshot: store `2026-05-31`, newest
correction `2026-09-03`).

Result on the live local store: **8 `CERTIFIED_AGREES`, 5 `STORE_PREDATES_CORRECTION`,
0 blocking.**

### What was deliberately NOT done

**No certified value was changed.** Making a red test green by picking whichever number is
convenient is the failure mode the brief names, and the evidence says the Python is right
in all five cases. The applied chain's authored calculation structure, suppressions and
certified-operation lists are pedagogy and remain authored, as the brief permits.

---

## 5. Full DB-vs-Python reconciliation table

Arbiter: **production** (`champion_ability_formulas` as served by the live canonical API),
which is where the CHAMPDATA correction lane wrote. Local = `/Users/macmoney/League_Combat_Simulator/lol_calc.db`.

| Champion | Field | Python (certified) | Local DB | Production | Approved source | Correct value | Why divergence exists | Remediation |
|---|---|---|---|---|---|---|---|---|
| Syndra | Q damage | `(55 + 35*P_Q + 0,7*AP) * MOD_Magic` | `(45 + 35*P_Q + 0,65*AP)` | **`(55 + 35*P_Q + 0,7*AP)`** | wiki `Template:Data_Syndra/Dark_Sphere`, CHAMPDATA p5 (2026-09-03) | **Python** | local snapshot predates p5 | none to the value; test now skips naming p5 |
| Syndra | Q `ap_ratio` | `0.70` | `0.65` | **`0.7`** | as above | **Python** | as above | as above |
| Syndra | R damage / per-sphere base | `(40 + 40*P_R + …)` → 80/120/160 | `(50 + 40*P_R + …)` → 90/130/170 | **`(40 + 40*P_R + …)`** | wiki `Template:Data_Syndra/Unleashed_Power`, CHAMPDATA p7Q (`a9632568`, 2026-09-06) | **Python** | local predates p7Q; **and the binding still names the superseded sheet** | value correct; binding re-sourcing deferred — see §11 |
| Olaf | Q damage | `(20 + 50*P_Q + BO_AD) * MOD_Phys` | `(10 + 50*P_Q + BO_AD)` | **`(20 + 50*P_Q + BO_AD)`** | wiki, CHAMPDATA p5 (2026-09-03) | **Python** | local predates p5 | none |
| Olaf | E damage | `(25 + 45*P_E + 0,5*AD) * MOD_True` | `(25 + 45*P_E + 0,4*AD)` | **`(25 + 45*P_E + 0,5*AD)`** | wiki, CHAMPDATA p6E (2026-09-03) | **Python** | local predates p6E | none |
| Maokai | Q damage | `(30 + 45*P_Q + 0,5*AP + …) * MOD_Magic` | `(20 + 45*P_Q + 0,4*AP + …)` | **`(30 + 45*P_Q + 0,5*AP + …)`** | wiki `Template:Data_Maokai/Bramble_Smash`, CHAMPDATA p7Q | **Python** | local predates p7Q; **binding still names the sheet** | value correct; binding re-sourcing deferred — see §11 |
| Ahri | R cooldown rank 1 | test expected store `130` | `140 / 120 / 100` | **`140 / 120 / 100`** | wiki rev 4007764 (also in the cooldown artifact) | **140 — the conflict is resolved** | the test pinned a *disagreement* as a permanent fact; the data got better and the test failed because of it | test rewritten to assert the resolution (store == sheet == authority == 140) |
| Ahri | E, base stats, E mana | — | — | — | — | agree | — | already green, untouched |
| Lux Q/E/R, Jarvan Q/R, Maokai R, Syndra E, Ahri E | damage | — | — | — | — | **agree in all three stores** | — | none |

**Maokai Q was not covered by any cross-check test.** It was found by the new provenance
checker — the class of silent divergence this phase exists to end.

Additional cooldown-authority divergences (separate from the certified set, §3): Camille W
and Kalista E disagree between `champion_abilities` and the wiki artifact. Both are outside
the applied chain and outside this phase's scope; they are now **reported**, and the
projection already refuses to certify them. Logged as debt in §11.

---

## 6. Patch identity — before and after

| | Before | After |
|---|---|---|
| Applied-chain | `mastery/data/slice_patch.py` literal → **"Mixed verified snapshot — League 26.13 context"**, permanently, updatable only by editing Python | `canonical_patch_display(conn)` → **"League 26.16"**, read from `league_patches` |
| Champion / Matchup | `patch_display = ""` — said nothing at all | same derived label |
| `patch_key_digest` (applied-chain) | `patchkey_0784955b687f1dd…` | **unchanged** |
| `patch_key_digest` (champion/matchup) | `patchkey_5625d14af6314d4…` | **unchanged** |

**No second patch system was invented.** `mastery/provenance/canonical_patch.py` asks the
existing canonical catalog (`league_patches`, owned by Patch Architecture / `patch_history.*`,
documented in `knowledge_engine.patch_identity`) one question, using the catalog's own answer:
the row whose `lifecycle_status` is `live`, else the highest `chronological_order`. It never
parses a version out of display text — that heuristic is precisely what
`knowledge_engine.patch_identity` exists to forbid. If the catalog cannot answer it returns
`"Patch identity unresolved"`; **it never substitutes a plausible number.**

**Why this is identity-safe, by construction.** `CompositePatchDescriptor` excludes
`game_patch_display` from `_KEY_MATERIAL_FIELDS`, so the label is not identity. Verified at
runtime: all seven probe artifacts kept a byte-identical `patch_key_digest` and
`mastery_set_id`. Old persisted matches are unaffected twice over — they are frozen payloads
that are never re-synthesized, and the digest they reference did not move.

**The literal still exists and was deliberately left alone.** `SLICE_PATCH_DESCRIPTOR`'s
machine revision fields are the **registration key for every certified adapter**
(`mastery/runtime/certified_adapters/registry.py`). Re-sourcing them would change
`patch_key_digest` and break adapter routing. That is a re-certification decision, not a
labelling one — see §11.

---

## 7. Seed behaviour — before and after

### What `seed` actually is

Not a `module_config` field — `ranked_modules/mastery_config.py` would reject one. It is the
`RankedModule.generate_segment(..., seed, ...)` contract parameter: the match's **server-only
`order_seed`**. `item_cost_duel` requires it; `quiz` and `meta_reflex` use it. `mastery_slice`
accepted it and used it **only for bot answers**, never for content. It is a live contract
parameter, not decorative — so it was implemented.

### Before

Generation was `steps[:n]` over an artifact whose candidate rotation was seeded purely by
`(manifest_id, revision, universe)`. Consequence: **every match of a given configuration
dealt byte-identical questions to every player, forever.**

### After

The salt is threaded into the seed material of the rotation that **already existed**:

```
generate_segment(seed, segment_number)
  -> MasterySliceModule._selection_salt  ->  "<order_seed>:<segment_number>"
  -> synthesize_*(selection_salt=…)
  -> publish(selection_salt=…) -> gate_snapshot(…)  [both resolutions]
  -> resolver._seed_for(manifest, universe, selection_salt)
  -> pool sorted by candidate_key, rotated by one offset      <- unchanged mechanism
```

Applied-chain salts `scenario_items` instead, rotating the flat-lethality and
percent-penetration lists **independently** so the declared alternation policy survives
exactly (a rotation of the combined list would break it whenever the lists differ in length).

| Contract requirement | Status |
|---|---|
| same source + config + seed → same output | **Yes** — proven for artifacts and for full Ranked segments |
| different seeds → different valid samples where the pool permits | **Yes** — and both samples are 5 distinct publishable questions |
| question identity stable and explainable | **Yes** — `candidate_key` / `candidate_id` never contained the seed or the patch key; `canonical_ref` still reuses the standalone Mastery key |
| persisted matches frozen, unaffected by regeneration | **Yes** — unchanged; every later read uses the frozen payload |
| resume/reconnect must not regenerate a different segment | **Yes** — unchanged for the same reason, and a segment is now *reproducible* from its own seed if it ever must be rebuilt |
| no nondeterministic global RNG | **Yes** — no `random`, no global state; the same content-hash-modulo idiom the resolver already used |

**Compatibility:** `selection_salt=None` reproduces the pre-phase seed byte for byte. Every
preview, admin-preview, dev-launcher and test path passes no seed and is therefore unchanged.

---

## 8. Integrity / fail-closed behaviour

The brief's central distinction — a valid no-content state must not become a crash, and a
source failure must not look like scarcity — is now explicit in the type system and in the
readiness report.

| Condition | Type | `error_kind` | Outcome |
|---|---|---|---|
| Authority artifact missing / corrupt / empty | `SourceIntegrityError` | `source_integrity` | **refuse**, named |
| Applied-chain item pool unreadable/empty | `SourceIntegrityError` | `source_integrity` | **refuse**, named |
| Certified copy contradicts a current store | `SourceIntegrityError` | `source_integrity` | **refuse**, named |
| Subject has fewer questions than requested | `InsufficientQuestionsError` | `insufficient_questions` | legitimate product state, unchanged |
| Serving policy refused the recipe | `PublicationBlocked` | `publication_blocked` | unchanged |
| Unsupported champion / uncertified ability / invalid config | `SynthesisError` / `UnsupportedMechanicError` / `MasteryConfigError` | `synthesis` | unchanged |
| Per-ability cooldown drift | — | — | **reported** as `source_advisories` on a *successful* report |
| Store behind the correction lane | — | — | **reported** as `source_advisories` |
| Malformed rank / held shape | — | — | already fail-closed per fact in the projection; unchanged |

`SourceIntegrityError` subclasses `SynthesisError` on purpose: every existing caller
(`ranked_public.readiness`, `ranked_modules.mastery_slice`, `routes/mastery.py`) already maps
that base class to its own typed refusal, so an integrity failure became diagnosable
everywhere without a new branch anywhere.

**A successful readiness report now also carries what it could not state before:**

```
-- camille: problems=[]
    {"available_steps": 5, "required": 5, "patch_display": "League 26.16"}
    ADVISORY: AUTHORITY_VALUE_DRIFT Camille W | champion_abilities states
              12 / 11.5 / 11 / 10.5 / 10 but the official-wiki authority (rev 4007585) …
```

Servable **and** disputed, at the same time.

---

## 9. Compatibility considerations

- **No schema change. No migration. No production write. No deployment.**
- **Frozen match payloads are untouched**; nothing re-synthesizes a persisted segment.
- **`patch_key_digest` and `mastery_set_id` are byte-identical** for unsalted generation.
- **Pinned legacy artifact identities were preserved.** An earlier attempt re-sourced the two
  mislabelled bindings (Syndra R, Maokai Q); it changed the pinned `mastery_set_id` of the
  legacy `first_ahri_syndra` artifacts and broke 78 tests. It was **reverted**, and the debt is
  recorded in §11 rather than paid by rewriting pinned identity.
- **`conn=None` remains legal** for `synthesize_applied_chain_mastery` — its contract always
  allowed a caller with no canonical handle. The new readers tolerate it and report
  "store unavailable", never agreement.
- **RB3 boundaries preserved.** No static Ranked Mastery catalog, no `playtest.*`, no `chain.*`
  source ids, no `mset_*` sources, no old progression curricula, no deleted generated-playtest
  infrastructure. Nothing was reintroduced; `mastery_config.py`'s refusals are untouched.
- **Out-of-scope items were not touched:** no public Ranked rotation change, no format design
  change, no question selection/order redesign, no fix to the cooldown-heavy first-three
  curriculum, no Matchup content policy change, no coverage expansion, no frontend visual
  change, no question cards, no media, no Admin Quiz Review, no `quiz_attempts`, no XP/Elo/
  streak change, no SSM rename.

---

## 10. Tests and runtime probes

### Commands and results

```
# Backend — Mastery suite (worktree /Users/macmoney/lcs-wt-gr1p2)
LOL_CALC_DB_PATH=…/lol_calc.db PYTHONPATH=… python -m pytest mastery/tests -q
  BEFORE: 8 failed, 1422 passed, 13 skipped
  AFTER:  3 failed, 1457 passed, 17 skipped
```

The 5 resolved failures are the `test_cross_check_db` set. The 3 remaining are **pre-existing
and unrelated**, exactly as the GR1 audit characterised them:
`test_audit_db::test_pool_and_certified_counts`, `test_audit_db::test_json_roundtrips_and_schema`
(the audit's "needs triage" pair) and
`test_phase4f_ranked_mastery_slice::test_format_for_creation_is_unaffected_by_this_module`
(stale `ranked_modern` vs `ranked_points_v2` expectation). Excluding the 4 structural guards, the
after-set is a strict subset of the before-set.

```
# Backend — the 8 Ranked-Mastery integration files the audit ran
python -m pytest test_ranked_mastery_applied_chain.py test_ranked_mastery_on_demand.py \
  test_ranked_mastery_reveal_e2e.py test_ranked_mastery_reveal_secrecy.py \
  test_ranked_phase_one_mastery.py test_mc1_static_content_retirement.py \
  test_ranked_builder_catalog.py test_rr1_mastery_identity.py -q
  -> 160 passed          (identical to the audit's baseline)

# Backend — GR1 Phase 2 targeted tests
python -m pytest mastery/tests/test_gr1_phase2_source_authority.py -q
  -> 28 passed

# Backend — the 8 integration files + the new suite, on the committed tree
  -> 188 passed

# Backend — ALL 33 ranked suites, run identically on a clean baseline worktree
#           (/Users/macmoney/lcs-wt-gr1p2-base @ 705cdefe) and on the branch
python -m pytest $(ls test_ranked*.py) test_mastery_ranked_capsule.py -q
  BASELINE: 61 failed, 2276 passed, 2 skipped
  BRANCH:   61 failed, 2276 passed, 2 skipped
  diff of the FAILED sets: IDENTICAL — zero failures introduced
```

Per project rule, failure **sets** were diffed, not totals. The 61 pre-existing failures are
unrelated to Mastery source authority: stale API signatures
(`create_bot_match() got an unexpected keyword argument 'difficulty'` — 41 of them across
`test_ranked_admin_bot_match.py` / `test_ranked_admin_bot_display_name.py`), moved capsule
digest pins, and media-freezing expectations. **Not hidden, not fixed — out of scope.**

Frontend tests were **not** run: no frontend code changed.

### Runtime probes — before / after, same script, same database

Direct artifact generation (no seed — the preview/admin/test path):

| Artifact | `patch_display` | `patch_key_digest` | `mastery_set_id` | steps | answers |
|---|---|---|---|---|---|
| `champion:ahri` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |
| `champion:zed` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |
| `champion:olaf` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |
| `matchup:ahri:syndra` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |
| `matchup:jinx:kaisa` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |
| `applied_chain:jarvan:Q:olaf` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |
| `applied_chain:olaf:Q:ahri` | `''` → **`League 26.16`** | SAME | SAME | SAME | SAME |

**Exactly one field moved, and it is the one the phase set out to move.** Generation order,
persisted payload structure, question identity and every answer are unchanged.

Ranked segments (which *do* now receive the match seed) changed their sample, as intended;
`canonical_ref` is present on every challenge before and after, and the payload structure is
identical.

Seed probe (`champion:ahri`, 5 questions): seed A twice → identical; seed B → a different,
equally valid sample.

Champion generation verified for **Ahri, Zed and Olaf**; matchup for **Ahri vs Syndra** and the
unrelated pair **Jinx vs Kai'Sa**; applied-chain for **Jarvan Q vs Olaf** and **Olaf Q vs Ahri**.
All remain servable.

---

## 11. Remaining known authority debt

1. **Two certified damage bindings name a superseded source.** Syndra R and Maokai Q carry
   values re-derived from the wiki by CHAMPDATA pass 7Q (`a9632568`, 2026-09-06) — confirmed
   correct against production — but their `SourceBinding` still names the `Champions`
   spreadsheet at `2026-05-31`. Correcting the label changes the pinned `mastery_set_id` of
   legacy `first_ahri_syndra` artifacts (verified: 78 tests fail). **Owner decision:
   re-certify and re-pin, or leave labelled.** The checker reports it either way.
2. **`SLICE_PATCH_DESCRIPTOR`'s machine revision fields remain pinned literals**
   (`ddragon_version 16.12.1`, `champion_stats_revision Champions@2026-05-23T09:14:42`, …).
   They are the certified-adapter registration key; re-sourcing them changes
   `patch_key_digest` and breaks routing. **Owner decision: a re-certification pass.**
3. **Camille W and Kalista E** disagree between `champion_abilities` and the wiki authority.
   Reported; the projection refuses to certify them. A CHAMPDATA correction-lane item.
4. **Three abilities cite a newer wiki revision in the store than in the artifact.** The
   remedy is mechanical: re-run `scripts/dc1_ability_semantic_audit.py`. Not run here — it
   makes live network requests to the wiki and rewrites a committed artifact, which is an
   operator action.
5. **Four `champion_abilities` rows were never audited** by the artifact
   (`STORE_ROW_UNARBITRATED`); their shape is derived and labelled `READY_DERIVED`.
6. **The local `lol_calc.db` is a pre-CHAMPDATA snapshot.** Every
   `champion_ability_formulas` row is the `2026-05-31` spreadsheet import. This is not a
   product defect, but it means local runs of the damage cross-checks will keep skipping
   until the snapshot is refreshed from production.
7. **Four Mastery branch-footprint guards fail on this branch and were deliberately not
   silenced.** `SLICE_FOOTPRINT` in `mastery/tests/facts_support.py` predates
   `mastery/synthesis/` — the production generator package — so any commit touching the
   generators trips it (proven on clean master). **Owner decision:** add a third named
   `GR1_FOOTPRINT` tuple the way `RANKED_BUILDER_FOOTPRINT` was added, or accept that these
   guards are scoped to their own workstreams' branches. Note `test_footprint_guard_split.py`
   asserts `SLICE_FOOTPRINT` by exact set equality, so widening it is a deliberate, testable act,
   not a quiet one.
8. **The cooldown artifact still has no game-version field.** Freshness is now inferable
   (content digest + revision span + comparison against the store) but not stated. Adding one
   requires changing `scripts/dc1_ability_semantic_audit.py`'s output contract.

---

## 12. Explicit confirmation — what was NOT changed

- **Public Ranked was not changed.** No built-in format names `mastery_slice`; none was added,
  removed or edited. No rotation change, no format design change.
- **Admin Quiz Review was not changed.** `quiz/review_universe.py` is untouched; Mastery
  questions remain invisible there, exactly as the audit found.
- **Visuals were not changed.** No frontend code was modified at all — this phase's only
  frontend artifacts are these two documents. No question cards, no item/champion/ability
  media, no layout.
- **`quiz_attempts` was not touched.** Mastery still writes nothing to it.
- **XP / Elo / streak behaviour is unchanged.**
- **SSM was not renamed.** `ranked_public/mastery_slices.py` is untouched.
- **No production data was written and nothing was deployed.**
