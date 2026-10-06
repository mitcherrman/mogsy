# PATCH HUB PH3-A — CROSS-PATCH CONTINUITY AUDIT

This is a read-only domain audit for **Catch-Up — "What changed since patch X?"**. No application code changed. Production was read through public GETs only, and nothing was pushed, merged or deployed. Date: 2026-10-04.

**Deliverables**
- This document.
- A machine-readable fixture, originally committed as `docs/PATCH_HUB_PH3_CONTINUITY_FIXTURE.json` (audit commit `3f3eec28`). On integration its single canonical copy is [`src/lib/patch-catchup/fixtures/ph3a-continuity-fixture.json`](../src/lib/patch-catchup/fixtures/ph3a-continuity-fixture.json), byte-identical (blob `3b12643a`), and the PH3-B corpus tests read it there. It holds the report hashes, the expected links, the full SR candidate table with verdicts, the prior-rule ablation, and the expected chains for all 45 `(since, end]` ranges.

**Naming.** In this pass, PH3-A is this audit and PH3-B is the domain implementation. That renumbers the slices in `PATCH_HUB_PH3_DECISION_AUDIT.md` §9, where PH3-A was the domain.

**Answer up front.**
- The strongest safe rule is **identity first, values second**. Two Riot lines are the same parameter only when they share an exact structural key: SR scope, entity, ability slot **and** group title, and property name, after a closed set of orthographic folds. The single exception is a manually verified alias row pinned to both lines' exact raw text.
- Value continuity (later `before` equals earlier `after`) is a **required gate**. It is never an identity source.
- Across 26.10–26.19 this matcher produces **5 links (3 exact-key, 2 verified-alias), with zero known false positives**.
- The prior rule ("value continuity within entity + slot") produces 14 links across all sections. **4 of them are false.**

---

## 1. Verified repo baselines

| Repo | Ref | SHA | Verification |
|---|---|---|---|
| Frontend `mitcherrman/mogsy` | `origin/main` | `a1958ff32de9e8c621124992d2340466f56fe89e` | `git fetch` + `git rev-parse` matches the expected SHA. This audit was written on branch `patchhub/ph3a-continuity-audit` from that commit. |
| Backend `mitcherrman/League_Combat_Simulator` | `origin/master` | `7c203aebb297252b8a57b06237d703be0e5d6d7d` | `git fetch` matches. The local checkout is stale, so everything was read with `git show origin/master:<path>`. |

**Inputs read:**
- `docs/PATCH_HUB_PH3_DECISION_AUDIT.md` (untracked in the primary checkout);
- `docs/PATCH_HUB_REPORT_HANDOFF.md` and `docs/PATCH_HUB_PH2_IMPACT_HANDOFF.md`;
- `src/lib/patch-reports/**`, `src/lib/patch-impact/**` and `src/lib/patch-impact-loader/**`;
- backend `knowledge_engine/patch_report/resolver.py` (`map_patch_property`, `resolve_change`, `_BASE_STAT_LABELS`, `_ITEM_LABELS`);
- backend `patch_history/{identity,parameters,values,lineage,p2_adapter}.py` and `patch_history/historical_patch_catalog.json`;
- backend `routes/patch_reports.py`.

### Prior findings re-verified

| Claim (decision audit) | Status | Evidence |
|---|---|---|
| Reports span 26.10–26.19 | ✅ | `/api/patch-reports` lists exactly 10 versions, with no gaps and no hotfix versions |
| ≈1.9 MB uncompressed | ✅ | 1,861,960 bytes for the 10 detail payloads, plus 9,825 for the index |
| 0 classified lines in backend history | ✅ | All 1,775 lines have `historical_context.classification` null. 26.10–26.15 are `unavailable`. 26.16–26.19 are a mix of `unresolved` and `unavailable`. |
| 6 value-continuity links | ✅ **but incomplete** | The prior rule reproduces exactly 6 links when restricted to the Champions section. It misses 2 real item links and 1 cross-section item undo. Run over all sections, it adds 4 false links (§6). |
| Bel'Veth Health Growth 105 → 110 → 105 | ✅ | 26.15 / 26.16 Base Stats |
| Sylas Q "Initial Damage" → "First Lash Damage" | ✅ | 26.12 / 26.15 Q - Chain Lash |
| Mordekaiser R "Stat Steal" → "Stolen Stats" | ✅ | 26.14 / 26.15 R - Realm of Death |
| Release catalog stops at 26.16 | ✅ | `historical_patch_catalog.json` has 416 patches and ends at `26.16` (2026-08-12). It is not exposed by `routes/patch_reports.py`. |
| Pro data stops at 26.13; Combat Lab not patch-versioned | not re-verified | Not relied on: the matcher uses neither. |

---

## 2. Production corpus inventory

The corpus was captured 2026-10-04 from `GET /api/patch-reports/<v>`. SHA-256 hashes are in the fixture.

| Patch | Bytes | Cards | Lines | Card types (champion / item / rune / system) | Reconciliation | `historical_context.status` |
|---|---|---|---|---|---|---|
| 26.10 | 142,279 | 50 | 156 | 12 / 6 / 2 / 30 | PUBLISHED_NOT_RECONCILED | unavailable ×156 |
| 26.11 | 177,907 | 87 | 173 | 9 / 3 / 1 / 74 | PUBLISHED_NOT_RECONCILED | unavailable ×173 |
| 26.12 | 226,947 | 172 | 231 | 14 / 0 / 0 / 158 | PUBLISHED_NOT_RECONCILED | unavailable ×231 |
| 26.13 | 126,051 | 72 | 130 | 17 / 2 / 0 / 53 | PUBLISHED_NOT_RECONCILED | unavailable ×130 |
| 26.14 | 85,076 | 46 | 98 | 10 / 3 / 0 / 33 | PUBLISHED_NOT_RECONCILED | unavailable ×98 |
| 26.15 | 193,136 | 86 | 201 | 11 / 3 / 1 / 71 | PUBLISHED_NOT_RECONCILED | unavailable ×201 |
| 26.16 | 338,625 | 90 | 261 | 7 / 10 / 2 / 71 | RECONCILED_WITH_HELDS | unresolved 192, unavailable 69 |
| 26.17 | 235,933 | 44 | 202 | 14 / 2 / 0 / 28 | RECONCILED_WITH_HELDS | unresolved 157, unavailable 45 |
| 26.18 | 106,363 | 21 | 109 | 11 / 1 / 0 / 9 | RECONCILED_WITH_HELDS | unresolved 56, unavailable 53 |
| 26.19 | 229,643 | 50 | 214 | 17 / 1 / 0 / 32 | RECONCILED_WITH_HELDS | unresolved 129, unavailable 85 |
| **Total** | **1,861,960** | **718** | **1,775** | | | **0 classified** |

### Lines by section across all 10 reports

| Section | Lines |
|---|---|
| Arena | 564 |
| Classic | 382 |
| ARAM: Mayhem | 381 |
| Champions | 320 |
| Items | 56 |
| Support Adjustments (26.11) | 24 |
| Systems | 12 |
| Hall of Legends | 10 |
| ARAM | 9 |
| Runes | 7 |
| Locke (26.13) | 5 |
| Apex Duo | 3 |
| Aegis | 1 |
| Role Quests | 1 |

### SR Champions/Items scope

This is the scope Catch-Up V1 renders.
- **376 lines**: 320 champion and 56 item.
- **153 cards**.
- **113 distinct entities**: 85 champions and 28 items.
- 359 lines are numeric with both raw values.

### Payload facts that shape the rule (all verified)

- **Card IDs are not stable.** `card.id` is a DB row id. The backend has no per-change id.
- **`mogzy_entity_ref` is unreliable for identity.**
  - For champions it equals the name. Locke's is null.
  - For items it is the numeric item id, but `entity_slug` is inconsistent: Stormrazor has ref `3097` and slug `3095`, and Heartsteel's slug `223084` is an Arena id.
  - Runes have a null ref.
- **No duplicate cards.** Within one patch, `(section_id, entity_type, entity_name)` never repeats.
- **Slot is not unique within a card.** Slot is consistent for each `(entity, group_title)` across patches. But two Riot groups in one card can share a slot *and* a property name: 26.15 Riven has `R - Blade of the Exile` and `R - Wind Slash`, each with "Bonus Attack Damage Ratio".
- **Slotless champion groups exist.** Examples: Aphelios weapons, Lee Sin `Q1`/`Q2`, LeBlanc `RW - Mimic: Distortion`, and 26.10 Quinn/Zed `P - …`. Quinn's passive is `P - Harrier` (no slot) in 26.10 but `Passive - Harrier` (slot P) in 26.11.
- **`change_kind: "numeric"` does not guarantee a number.** Values include `Removed`, `Every attack`, `On Hit`, `Passive removed when swapping targets`, and one truncated value, Viego 26.18 `2% (+…. )`.
- **Riot text contains errors.** Naafiri 26.10 has before `60 / 90 / 120 / 450 / 180` (450 is a typo) and a trailing ` -` artifact.
- **Riot's own prose is not a reliable machine authority.** The 26.13 Doran's Helm context says "the 26.11 Doran's Helm buff". The buff is in the 26.10 notes, and Riot's 26.11 notes (fetched read-only) contain no Doran's Helm entry.
- **No re-promotion drift.** All 322 lines in PH2's frozen corpus (captured 2026-10-03) still match production byte-for-byte.

---

## 3. Multi-patch entities and groups

### Entities changed in two or more patches

Identity here is `(mode, entity_type, entity_name)`. There are 576 entities, and **103** of them changed in two or more patches:

| Scope | Count | Entities |
|---|---|---|
| SR champion | 34 | Aatrox, Aphelios, Azir, Bard, Bel'Veth, Brand, Cassiopeia, Draven, Ekko, Gwen, Kai'Sa, Kassadin, LeBlanc, Lee Sin, Locke, Master Yi, Mordekaiser, Naafiri, **Nasus (3)**, **Nocturne (3)**, **Poppy (3)**, Qiyana, Quinn, Rumble, Ryze, Senna, Seraphine, Smolder, Sylas, Syndra, Volibear, Xin Zhao, Zaahen, Zeri |
| SR item | 3 | Doran's Helm (26.10, 26.13), Immortal Path (26.10, 26.14), Sundered Sky (26.16, 26.17) |
| SR rune | 1 | Deathfire Touch (26.10, 26.11) |
| Arena system | 40 | Not in Catch-Up scope. Listed in the fixture's source reports. |
| ARAM: Mayhem system | 24 | Same as Arena. |
| Classic system | 1 | `Classic — General` (26.17–26.19). It is a parser bucket that merges every Classic change and loses champion identity. |

**Name collisions across modes.** 56 of the 113 SR Champions/Items names *also* appear as `system` cards in a mode section (Arena / ARAM / ARAM: Mayhem / Classic) or in another SR section. Examples:
- Bel'Veth, Mordekaiser, Nasus, Locke and Sundered Sky;
- Imperial Mandate in Arena **and** in the 26.11 "Support Adjustments" section.

### Groups changed in two or more patches (SR Champions/Items)

Under the prior `slot | group_title` key there are 25 such groups (22 champion and 3 item). Under the proposed `(slot, group_title)` key there are 23, because Naafiri R and Qiyana Q changed their group titles.

| Group | Patches |
|---|---|
| Aphelios Calibrum / Crescendum / Infernum / Severum | 26.13, 26.19 |
| Bel'Veth Base Stats; Bel'Veth R | 26.15, 26.16 |
| Brand Base Stats | 26.11, 26.13 |
| Kassadin Q | 26.11, 26.18 |
| Locke Q; Locke W | 26.14, 26.15 |
| Mordekaiser E; Mordekaiser R | 26.14, 26.15 |
| Naafiri R (title changed) | 26.10, 26.15 |
| Nasus Q | 26.16, 26.19 |
| Poppy Q | 26.13, 26.16, 26.19 |
| Qiyana Q (title changed) | 26.13, 26.17 |
| Quinn Q | 26.10, 26.11 |
| Ryze Base Stats | 26.12, 26.19 |
| Senna P; Senna Q | 26.13, 26.14 |
| Sylas Q | 26.12, 26.15 |
| Xin Zhao P | 26.11, 26.12 |
| Doran's Helm, Immortal Path, Sundered Sky (item group) | see above |

**Exact-key recurrence.** Only **3 exact keys** (scope + entity + slot + title + property) recur across patches anywhere in SR Champions/Items: Bel'Veth Base Stats / Health Growth, Doran's Helm / Health, and Sundered Sky / Health. Riot renames properties more often than it repeats them: 5 of the 8 continuity-holding SR pairs are renames.

---

## 4. Candidate-link table

**What counts as a candidate.** Every earlier → later pair of lines on the same SR Champions/Items entity that has any of the following:
- the same slot or group;
- a manually identified relationship;
- value continuity under any normaliser, including a numbers-only one.

**93 candidate pairs.** Every row, with raw values and the reason for its verdict, is in `candidate_table` in the fixture. The 75 "rejected" rows are pairs of different properties with no continuity, or pairs involving a mechanical line. The 18 rows that matter:

| # | Entity | Patches | Group | Property a → b | Continuity (canonical) | Verdict |
|---|---|---|---|---|---|---|
| 1 | Bel'Veth | 26.15→26.16 | Base Stats | Health Growth → Health Growth | ✓ `110` | **proven (A)** |
| 2 | Doran's Helm | 26.10→26.13 | item | Health → Health | ✓ `140` | **proven (A)** |
| 3 | Sundered Sky | 26.16→26.17 | item | Health → Health | ✓ `450` | **proven (A)** |
| 4 | Sylas | 26.12→26.15 | Q - Chain Lash | Initial Damage → First Lash Damage | ✓ `40/65/90/115/140 (+45% AP)` (AP ≡ Ability Power) | **proven (B, verified alias)** |
| 5 | Mordekaiser | 26.14→26.15 | R - Realm of Death | Stat Steal → Stolen Stats | ✓ `13%` | **proven (B, verified alias)** |
| 6 | Bel'Veth | 26.15→26.16 | R - Endless Banquet | Total Attack Speed → True Form Total Attack Speed | ✓ `5 / 15 / 25%` | plausible, unsafe |
| 7 | Poppy | 26.13→26.16 | Q - Hammer Shock | Monster Damage Cap → Target Maximum Health Monster Cap | ✓ `75/105/135/165/195` | plausible, unsafe |
| 8 | Poppy | 26.16→26.19 | Q - Hammer Shock | Target Maximum Health Monster Cap → Minion/Monster Maximum Health Cap | ✓ `85/120/155/190/225` | plausible, unsafe |
| 9 | Qiyana | 26.13→26.17 | Q (Edge of Ixtal → Elemental Wrath) | Monster Damage → Monster Damage Modifier | ✗ `175%` vs `175% against Monsters` | plausible, unsafe |
| 10 | Xin Zhao | 26.11→26.12 | Passive - Determination | Heal Amount → Healing | ✗ (drops `(Levels 1 / 6 / 11)`) | plausible, unsafe |
| 11 | Locke | 26.14→26.15 | Q - Ritual Nails | Nail Damage → Base Damage - Nail | ✗ (ratio omitted in 26.14) | plausible, unsafe |
| 12 | Locke | 26.14→26.15 | W - Soul Ignition | Damage Taken Grey Health Cap → Grey Health Base Value | ✗ (ratio omitted; "Cap" vs "Base Value") | plausible, unsafe |
| 13 | LeBlanc | 26.13→26.17 | R - Mimic → RW - Mimic: Distortion (slotless) | RW Damage → Damage | ✗ (ratio omitted, cross-group) | plausible, unsafe |
| 14–15 | Naafiri | 26.10→26.15 | R (Hounds' Pursuit → The Call of the Pack) | Physical Damage → Damage / Damage per Packmate | ✗ (one line split into two; `120% bonus AD` vs `+120% Attack Damage`) | unclassifiable |
| 16 | Senna | 26.13→26.14 | Passive - Absolution | Crit Damage → Critical Strike Damage Modifier | ✗ (`-15% (170% …)` vs `85%`: same quantity, different representation) | unclassifiable |
| 17–18 | Quinn | 26.10→26.11 | P - Harrier → Passive - Harrier; Q | Bonus Monster Damage (mechanical, `is_new`) → Monster Damage | ✗ | unclassifiable |

### Candidates outside the Champions/Items scope

These are relevant because a looser scope or key would reach them.

| Entity | Where | Lines | Under the prior rule | Verdict |
|---|---|---|---|---|
| Imperial Mandate | 26.11 *Support Adjustments* (`system` card, no ref) → 26.13 Items | AP `60→65` → `65→60` | not linked (types differ) | plausible, unsafe (cross-section identity). This is a real undo hidden from an Items-only view. |
| Imperial Mandate | same | AH `20→15` vs "Unique - Control" `15 AH …→20 AH …` | numbers-only match | **rejected** (different parameters; `15` coincides) |
| Protein Shake | Arena 26.11→26.19 | "Heal Shield Power:" `25→15` → "Base Health Scaling" `15→25` | **linked; would show a false "undone"** | **rejected (false positive)** |
| Serylda's Grudge | Arena 26.12→26.17 | "Slow Amount:" `30%→50%` → "Slow Threshold" `50%→60%` | **linked** | **rejected (false positive)** |
| Classic — General | Classic 26.17→26.19 | "Cast Range" `1200→1100` → "Missile Range" `1100→1175` | **linked** | **rejected (false positive)**. The bucket also has no champion identity. |
| Classic — General | Classic 26.17→26.19 | "Attack Damage" `55.5→60` → "Missile Width" `60→160` | **linked** | **rejected (false positive)** |
| Redemption | Arena 26.11→26.17 | "Heal & Shield Power:" → "Heal and Shield Power" `12%` | linked | plausible (orthographic rename). Out of scope. |
| Now You See Me | Arena 26.12→26.16 | "Movespeed After Blink:" `50%/75%` → "Move Speed Boost" `50% / 75%` | linked | plausible. Out of scope. |
| Locke | SR W 26.14 → **Arena** 26.15 | after `40 / 70 / 100 / 130 / 160` = Arena "Base Health Restored" before | would link under a name-only key | **rejected (cross-mode false positive)** |
| Nasus | Classic 26.16 / SR 26.17 | both "Life Steal", both after `10 / 15 / 20%` | — | collision hazard. Equal values in two modes. |
| Sundered Sky | Arena 26.16 / SR 26.16–26.17 | Arena Health `350→400` while SR Health is `400→450` | — | proves mode values diverge |

---

## 5. Proven links

Each proven link satisfies every Tier A gate (§7, §13). Tier B links satisfy every Tier A gate except property-name equality, and that one is replaced by a verified alias row.

### P1. Bel'Veth — Base Stats / Health Growth — 26.15 `105 → 110`, 26.16 `110 → 105`

- **Gates passed:**
  - exact key in `sr.champions`;
  - continuity `110 = 110`;
  - the key appears once in each patch;
  - 26.15 and 26.16 are contiguous and both loaded;
  - `mogzy_property` is `health_growth` on both lines (no veto);
  - both values are eligible.
- **Classification:** exact undo (`105` → `105`).
- **Concurrent mechanical line.** 26.15 Base Stats also has the mechanical line "Total Attack Animation", so the chain sets `concurrentMechanical: true`.
- **Hazard handled.** The same 26.15 card has *Attack Speed* and *Attack Speed Ratio*, both `0.85 → 0.67`. A value-only or slot-only key would make them interchangeable. The exact property key separates them.

### P2. Doran's Helm — Health — 26.10 `110 → 140`, 26.13 `140 → 150`

- **Gates passed:** exact key in `sr.items`; continuity `140`; unique; `stat_hp` on both lines.
- **No intermediate change.**
  - The 26.11 and 26.12 reports carry no Doran's Helm line.
  - Riot's 26.11 notes contain no Doran's Helm entry, fetched read-only to resolve Riot's own "26.11 buff" misreference.
- **Classification:** continued (both steps raise the value). Net `110 → 150`.

### P3. Sundered Sky — Health — 26.16 `400 → 450`, 26.17 `450 → 400`

- **Gates passed:** exact key in `sr.items`; continuity `450`; unique; `stat_hp` on both lines.
- **Classification:** exact undo.
- **Mode check.** Arena Sundered Sky also changed Health in 26.16, but with *different* values (`350 → 400`). Mode scope keeps it out.

### P4. Sylas — Q - Chain Lash — "Initial Damage" (26.12) → "First Lash Damage" (26.15). Tier B.

- **Lines:**
  - 26.12: `40 / 60 / 80 / 100 / 120 (+40% AP)` → `40 / 65 / 90 / 115 / 140 (+45% AP)`
  - 26.15: `40 / 65 / 90 / 115 / 140 (+45% Ability Power)` → `40 / 60 / 80 / 100 / 120 (+40% Ability Power)`
- **Why the alias is safe:**
  1. Same entity, scope, slot and group title.
  2. It is a rename, not a coexistence. "Initial Damage" does not appear in 26.15, and "First Lash Damage" does not appear in 26.12.
  3. Exactly one Q line in each card.
  4. Continuity covers 6 numbers (5 ranks plus the ratio) under the closed `AP ≡ Ability Power` token rule.
  5. A second authority: Riot's 26.15 context reads "After his buff in 26.12 … pulling back the chains a tad", and the 26.12 card's only Q line is this one.
- **Classification:** exact undo under the canonical form.

### P5. Mordekaiser — R - Realm of Death — "Stat Steal" (26.14 `10% → 13%`) → "Stolen Stats" (26.15 `13% → 10%`). Tier B.

- **Why the alias is safe:**
  - Same entity, scope, slot and title.
  - A rename, not a coexistence.
  - One R line in each card (the 26.15 R "Bugfix" line is mechanical).
  - Continuity `13%`.
  - A second authority: Riot's 26.15 context says Riot "decided to instead revert the R buff entirely", and the entire 26.14 R buff is this one line.
- **Classification:** exact undo.
- **Concurrent mechanical line.** The 26.15 R Bugfix line sets `concurrentMechanical: true` on the chain (§11).

**Why the two Tier B links need a second authority.** Value continuity only proves that the later parameter had the earlier `after` value *before* the later patch. An unchanged sibling parameter with the same value would be invisible in the reports. For these two links the risk is negligible: Sylas matches on 6 numbers, and for Mordekaiser Riot states the revert in words. Both rows are recorded as **auditor-verified; owner sign-off required** (§8).

### Expected chains per range (end = 26.19)

| `since` | Chains |
|---|---|
| < 26.10 (clamped to the floor; 26.10 included) | Doran's Helm (continued), Bel'Veth HG, Sundered Sky, Sylas Q, Mordekaiser R (exact undo) |
| 26.10, 26.11 | Bel'Veth HG, Sundered Sky, Sylas Q, Mordekaiser R |
| 26.12, 26.13 | Bel'Veth HG, Sundered Sky, Mordekaiser R |
| 26.14 | Bel'Veth HG, Sundered Sky |
| 26.15 | Sundered Sky |
| 26.16 – 26.18 | none |

All 45 `(since, end]` combinations are in the fixture.

---

## 6. Rejected and unsafe links, and why

### A. False positives that a looser rule produces

All of these were verified by running the prior rule. They are in the fixture's `prior_rule_ablation`.

| Rule | Links | False | Unsafe | Proven |
|---|---|---|---|---|
| Prior rule (`entity_type, entity_name, slot\|title` + unique value continuity), Champions only | 6 | 0 | 3 (Bel'Veth R, Poppy ×2) | 3 |
| Same rule over **all sections** | 14 | **4** (Protein Shake, Serylda's Grudge, Classic Cast Range → Missile Range, Classic Attack Damage → Missile Width) | 5 (+ Redemption, Now You See Me) | 5 |
| Same rule restricted to the Champions/Items scope | 8 | 0 | 3 | 5 |
| **Proposed (Tier A + B)** | **5** | **0** | 0 | 5 |
| Proposed Tier A with the scope allowlist removed (every section) | 3 | 0 | 0 | 3 |

The last row matters. Even if the scope allowlist were dropped by mistake, the exact-key and ambiguity gates still produce no false link in any mode section. They refuse:
- 21 adjacent pairs whose key repeats within a patch (Arena Elise and Warwick "Cooldown", the `Arena — General`, `ARAM: Mayhem — General` and `Classic — General` buckets, …);
- 3 before-mismatches in `Classic — General`.

### B. Plausible but unsafe: not linked in V1

| Pair | Why it is unsafe |
|---|---|
| Bel'Veth R Total Attack Speed → **True Form** Total Attack Speed | The rename adds a qualifier. 26.15 reworked R, and no line in the data says whether a separate True Form attack-speed parameter existed with the same `5 / 15 / 25%`. If linked, it classifies as **mixed** (rank 1 partial, rank 2 new movement, rank 3 exact), so it would only ever have produced a net line. Needs wiki or game-data confirmation before an alias row. |
| Poppy Q Monster Damage Cap → Target Maximum Health Monster Cap → **Minion/**Monster Maximum Health Cap | Two renames; the second widens the wording to minions. Riot 26.19 says it reverts "a previous buff to jungle clear", but the values revert nothing exactly. If linked: net `50/80/110/140/170 → 70/105/140/175/210`, every rank a partial undo relative to the chain start. Needs owner verification. |
| Qiyana Q Monster Damage → Monster Damage Modifier | Title changed (Edge of Ixtal → Elemental Wrath), property renamed, and the value gained text (`175%` vs `175% against Monsters`). |
| Xin Zhao P Heal Amount → Healing | Format drift: the later `before` drops `(Levels 1 / 6 / 11)`. The normaliser never drops parentheticals. |
| Locke Q Nail Damage → Base Damage - Nail; W Grey Health Cap → Grey Health Base Value | The 26.14 `after` omits the AP ratio that the 26.15 `before` states. The W pair may be two different quantities. Its array also equals the Arena Locke value. |
| LeBlanc R "RW Damage" → slotless "RW - Mimic: Distortion" / Damage | Crosses groups and omits a ratio. |
| Imperial Mandate AP (Support Adjustments → Items) | Cross-section, and cross-`entity_type` (`system` vs `item`). The 26.11 card has no ref. |

### C. Unclassifiable: never linkable by any rule

- **Naafiri R** (26.10 → 26.15): an ability rename, a one-line-to-two-line split, and a contradicted ratio basis (`120% bonus AD` vs `+120% Attack Damage`).
- **Senna** crit (26.13 → 26.14): the unit representation changed.
- **Quinn** P/Q (26.10 → 26.11): the earlier lines are mechanical and `is_new`.

### D. Numbers-only coincidences

A numeric-vector normaliser would match these, and they are all wrong:
- Bel'Veth Armor Growth `5` vs R `5 / 15 / 25%`;
- Ryze Base AD `55` vs E mana `… / 55 / …`;
- Quinn R mana `50 / 25 / 0` vs P `50`;
- Imperial Mandate AH `15` vs `15 AH For Immobilizing Abilities`.

**Numbers-only matching is banned.**

---

## 7. Property identity authority ladder

These are the rungs evaluated against the data, best first.

| Rung | Authority | Verdict for PH3 | Evidence |
|---|---|---|---|
| 1 | `mogzy_property` | **Veto only. Never a source of identity.** | (a) Coverage is 103 of 376 in-scope lines (27%). (b) It is coarse: every ability damage, heal or shield line maps to one property per *effect kind* (`ability_damage_formula`, …), so two different damage lines in one ability share it (`resolver.py` `_formula_property`). (c) It is stale: it is computed at build time by that day's resolver, so the same label resolves differently across reports. Bel'Veth 26.15 "Attack Speed" → `null`, but today's `_BASE_STAT_LABELS` maps it to `base_attack_speed`. The same goes for LeBlanc "Attack Speed Ratio", Brand "Base Mana Regeneration" and Poppy "Health Regeneration". Rule: if both lines carry a non-null value and they differ, refuse the link. |
| 2 | Backend semantic identity (`patch_history` `parameter_key`) | **Unavailable.** | It produces 0 classifications in production, covers 11 pilot champions, and is not in the payload. |
| 2′ | Backend closed label tables (`_BASE_STAT_LABELS`, `_ITEM_LABELS`) used as label-equivalence classes (e.g. "Health per level" ≡ "Health Growth") | **Deferred to V2.** It is sound in principle (a reviewed, closed map), but it adds **0 links** in this corpus, so it cannot be validated on real data. If adopted, it must mirror the property-level map. **Do not reuse PH2's `BASE_STAT_LABEL_FAMILY`**: it collapses to *family*, which would equate "Health" with "Health Growth". |
| 3 | **Exact structural key** (§9) | **Primary rule (Tier A).** | 3 links, all correct. Even with every section in scope it stays 3 links and 0 false. |
| 4 | **Verified alias rows**, pinned to both lines' verbatim raw text (§8) | **Tier B.** Requires owner sign-off. | 2 rows (Sylas, Mordekaiser), both backed by a second authority. |
| 5 | Value continuity | **A gate on every link. Never identity.** | It produces the 4 false positives in §6A whenever it is used for identity. |
| — | Fuzzy or numbers-only property matching, prose (`context_text`) parsing | **Banned.** | §6D; Riot's misnumbered "26.11" Doran's Helm reference. |

---

## 8. Alias policy

1. **No automatic aliasing, ever.** A renamed property produces no link unless a verified alias row matches.
2. **An alias row is a verified link, not a general synonym.** It pins:
   - `scope`, `entity`, `slot`, `group` (verbatim);
   - `from {patch, property, before, after}` and `to {patch, property, before, after}`, all verbatim raw strings;
   - `evidence` (human-readable), `verifiedBy`, `verifiedOn`.

   If re-promotion or a backend fix changes any pinned string, the row stops matching and the link disappears. That is fail-closed.
3. **Evidence standard before a row may be added.** All of these must hold:
   - same entity and scope;
   - same slot **and** the same group title;
   - a rename, not a coexistence: the old property is absent from the later card, and the new property is absent from the earlier card;
   - exactly one line with each key in its patch;
   - exact canonical continuity;
   - no occurrence of either key in a report strictly between;
   - **a second authority**: a Riot context sentence that names the change or the patch and agrees with the values, League Wiki ability history, or game data. Value continuity alone never qualifies.
4. **Runtime re-checks.** The matcher re-checks every Tier A gate on an alias row at runtime. A row that resolves to anything other than exactly one line pair is ignored.
5. **Ownership.** V1 keeps rows in a reviewed frontend constant (`verified-aliases.ts`) that only the owner may extend. A backend-owned table is a later option.
6. **Rows proposed in this audit:**
   - `sylas-q-26.12-26.15` and `mordekaiser-r-26.14-26.15`: verified, pending owner sign-off.
   - Bel'Veth R and Poppy Q ×2: candidates that need an external authority.

---

## 9. Continuity-key contract

Every field below is required by evidence in this corpus.

```ts
type ContinuityScope = "sr.champions" | "sr.items";

type PatchContinuityKey = {
  /** Closed map from (section_id, entity_type); anything else is out of scope. */
  scope: ContinuityScope;      // ("patch-champions","champion") | ("patch-items","item")
  /** canonLabel(entity_name). Refs may veto (conflict) but never identify. */
  entity: string;
  /** normalizeAbilitySlot(ability_slot) (PH1 helper): "P"|"Q"|"W"|"E"|"R" or null. */
  slot: string | null;
  /** canonLabel(group_title). Required together with slot (26.15 Riven). */
  group: string;
  /** canonLabel(property_name). */
  property: string;
};
```

### Why each field is there

| Field | Evidence that requires it |
|---|---|
| `scope` (mode and section) | 56 SR names reappear as mode `system` cards. Locke SR W → Arena collision; Nasus equal values across Classic and SR; Sundered Sky with different Arena values in the same patch. Today, `entity_type` separating modes is an accident of how the backend types mode cards. |
| `entity` | Obvious. An item ref is not safe (slug and ref disagree), and Locke's ref is null. |
| `slot` **and** `group` | Riven 26.15: one slot, two groups, the same property. A title change (Naafiri R rework, Qiyana Q) must break identity. |
| `property` | Bel'Veth Attack Speed vs Attack Speed Ratio carry identical values. All four false positives in §6A have different property names. |

### What is deliberately not in the key

- **Unit and value kind.** A unit change cannot pass the exact-continuity gate, and comparability is checked separately for classification (§10).
- **`mogzy_property`.** It is a veto only.
- **`card.id`.** It is unstable.

### `canonLabel`

Applied to entity, group and property:
- NFKC;
- curly quotes to straight;
- Unicode dashes and minus to `-`;
- whitespace collapsed and trimmed;
- trailing `:` stripped;
- casefold.

**No** token rewriting. Not `&`→`and`, not abbreviations, no plural folding.

### String form

The key's string form is a JSON array of the five canonical fields, which keeps it injective.

---

## 10. Numeric normalization rules

There are two separate functions. **Equality** (`canonicalValue`) decides continuity and exact undo. **Comparability** (`valueTemplate`) decides whether per-component arithmetic is allowed.

### `canonicalValue(raw)`: an enumerated list, nothing else

1. NFKC; curly quotes to straight; Unicode dashes and minus `‐ ‑ ‒ – — −` to `-`.
2. Collapse whitespace and trim.
3. Spacing only: `\s*/\s*` → ` / `; `( ` → `(`; ` )` → `)`; `(+ ` → `(+`.
4. Casefold.
5. Whole-token synonyms, exactly two: `ability power` → `ap`, `attack damage` → `ad`. Qualifiers survive, so `bonus attack damage` becomes `bonus ad`, **never** `ad`.
6. A seconds unit attached to a digit: `s | sec | secs | second | seconds` → `s`. A unit's presence vs its absence is **not** folded: `5` ≠ `5s`.
7. Decimal literal canonical form, via exact decimal parsing and never binary floats: `0.60` → `0.6`, `.6` → `0.6`.

**Never:**
- drop or reorder parentheticals, ratios, `%`, `g`, `/level` or qualifiers (`bonus`, `base`, `total`, `max`, `missing`, `True Form`, `Minion/`);
- fold `AD` with `bonus AD` or `total AD`, or `HP` with `Health`;
- strip trailing text (`against Monsters`, `(Levels 1 / 6 / 11)`, ` -`).

### Value eligibility

A raw value is chain-eligible only if:
- it is non-null;
- it contains at least one digit;
- it contains no `…` or `...` (truncation);
- it is not a sentinel (`Removed`, `Unchanged`, `None`, `N/A`).

A line is eligible only if `change_kind === "numeric"` and both sides are eligible.

### `valueTemplate(canonical)`

Replace every numeric literal with `#` and keep the numbers as exact decimals, in order. Two values are **comparable** iff their templates are identical and they hold the same count of numbers. A template captures:
- rank-array length;
- `%` placement;
- ratio basis words;
- level ranges;
- trailing qualifiers.

### Arithmetic

Arithmetic uses exact decimals: decimal strings scaled to `BigInt`, never `number`. Display delta text in V1 is **not required**. Endpoints are shown verbatim (§11).

---

## 11. Net and undo classification rules

**Chain.** A maximal sequence of in-range lines `s1…sn` (n ≥ 2), where each adjacent pair is a proven link.
- Start value `v0 = s1.before`. End value `vn = sn.after`.
- Peak before the last step is `vm = sn.before`, which is canonically equal to `s(n-1).after`.

**What Mogzy claims.**
- **Identity** (the steps are one parameter). Proven by §7–§9.
- **Endpoints** `v0 → vn`, quoted verbatim from Riot with their patches.
- **At most one classification label.**

Mogzy never claims a direction (buff or nerf) from the numbers, and never claims a step count as complete. A chain lists the *linked* steps only. Unlinked lines for the same entity stay visible as Riot lines.

| Case | Rule | Corpus or synthetic example |
|---|---|---|
| **A. Net change** | Always allowed for a valid chain: show `v0` (before `s1.patch`) → `vn` (after `sn.patch`) verbatim. A numeric delta is optional, and only when `v0` and `vn` are comparable. | Doran's Helm `110 → 150` (synthetic: `100 → 110`, `110 → 105`: net `100 → 105`) |
| **B. Exact undo** | `canonicalValue(vn) === canonicalValue(v0)`. This is checked first, needs no comparability, and has label `exact_undo`. | Bel'Veth HG, Sundered Sky, Sylas Q, Mordekaiser R |
| **C. Partial undo** | Comparable `v0, vm, vn`. For every component that moved (`d0 = vm − v0`, `dn = vn − v0`, ignoring components where both are 0): `d0 ≠ 0`, `sign(dn) = sign(d0)` and `\|dn\| < \|d0\|`. | synthetic `100 → 110 → 105` |
| **D. Over-revert** | Comparable. Every moved component has `d0 ≠ 0` and `sign(dn) = −sign(d0)`. | synthetic `100 → 110 → 95` |
| — **Continued** | Comparable. Every moved component has `sign(dn) = sign(d0)` and `\|dn\| > \|d0\|`. | Doran's Helm `110 → 140 → 150` |
| **E. Non-monotonic multi-step** | The label is computed **relative to the chain start** (`v0`), using `vm` (just before the final step) and `vn`. Intermediate oscillations are not labelled. Net endpoints are always shown. | synthetic `100 → 110 → 120 → 105`: partial undo relative to 100. Poppy, if ever linked: every rank partial relative to the 26.13 start. |
| **F. Arrays / rank values** | Component-wise and unanimous. If moved components fall into different classes, or a component that never moved before starts moving (`d0 = 0, dn ≠ 0`), there is **no label** (`net_only: mixed_components`). A rank-count or shape change makes the values not comparable, so `net_only: incomparable_shape`. | Bel'Veth R, if ever linked: mixed. Synthetic `5 ranks → scalar`. |
| **G. Percent / ratio values** | `%` and ratio-basis words are part of the template, so `13% → 10%` is comparable while `10` vs `10%` and `+40% AD` vs `+40% bonus AD` are not. Deltas on percent components are percentage points, never relative percent. V1 shows endpoints only. A ratio-basis change inside a chain is still a valid chain, with endpoints shown verbatim, but it is never comparable. | Mordekaiser `10% → 13% → 10%`; Naafiri basis change (never linked) |
| **H. Before mismatch** | Two adjacent occurrences of one identity where `canonicalValue(b.before) ≠ canonicalValue(a.after)` are **not linked**. In addition, if any in-range adjacent pair of an identity breaks, or any in-range occurrence is ambiguous or ineligible, that identity gets **no chain at all in that range**. Fragments are never presented as "net since X". | synthetic `A 100→110, B 115→120, C 120→100`: no net for the range |
| **Gap** | A link requires both reports loaded and every version strictly between them listed, loaded and ordinal-contiguous (§12). There is no net across a gap. | synthetic: drop 26.14 from the input, so Mordekaiser 26.14→26.15 does not link, and nothing links across a missing 26.14 |
| No-op line | A line with `canonicalValue(before) === canonicalValue(after)` is not a step. If it shares a key with a chain in range, the identity is unclassifiable for that range. | Cassiopeia E "Total Ability Power Ratio" `65% → 65%` (26.18) |
| Mechanical in group | Mechanical lines never chain. A mechanical line in the same entity and group at any step's patch sets `concurrentMechanical: true`. Presentation must word labels as value statements ("Value back to 10%"), not "the change was undone". | Mordekaiser R 26.15 Bugfix |

**Precedence:** `exact_undo` › comparability check › unanimous component class › `net_only`.

---

## 12. Patch-range semantics

| Question | Rule |
|---|---|
| Is `since=X` inclusive? | **Exclusive.** The user has seen X. Display and chains use reports `V` with `X < V ≤ E`. |
| End `E` | Defaults to the latest version listed by `/api/patch-reports`. A future `until=E` uses the same rules: `E` must be listed and `E > X`. Chains are limited to `(X, E]`. |
| X below the floor (older than 26.10) | Clamp: the range becomes `[floor, E]` with the floor **included**, and is flagged `clampedToFloor`. The UI must say coverage starts at 26.10. Nothing before the floor is implied. |
| X not listed but within `[floor, latest]`, unparseable (e.g. `25.S1.1`, `26.12b`), or ≥ E | `range_invalid`. X = latest means "up to date". |
| Can chains start before X? | **No (V1).** Both endpoints of every link must be in range. A chain whose earlier steps fall before X is cut to its in-range part, and is only shown if that part still has ≥ 2 steps. Rationale: the first in-range step's `before` is Riot's statement of the value at X. "Reverts a change from before your range" context is V2. |
| Chains made only of changes after X | Yes. That is the only kind of chain. |
| A missing or failed report in range | Riot lines from the loaded reports may still render, with the failure shown, as the decision audit specifies. **Every** continuity claim in the range is withheld (`history_incomplete`), not just claims across the gap. Simplest fail-closed rule. |
| An index hole (a version absent from the list) | A link from `a` to `b` requires the ordinals between them to be contiguous: the same `YY` and plain `YY.N` form, `N` increasing by 1. Riot's real numbering changes form at year boundaries (catalog: `14.24 → 25.S1.1 → … 25.S1.3 → 25.04`, `25.24 → 26.1`). **No link may cross a year boundary or a non-`YY.N` version** until the backend exposes `chronological_order` (the catalog). Display is unaffected. |
| Release dates | Not used. The catalog stops at 26.16 and is not in the API. A patch picker only. |
| Determinism | Results must not depend on the order of the input reports. Reports are sorted by `comparePatchVersions`. A duplicate version means `history_incomplete`. |

---

## 13. Fail-closed rules

Each rule below produces **no link**, and the listed reason.

| # | Condition | Refusal reason |
|---|---|---|
| 1 | The card's `(section_id, entity_type)` is not in the scope map | `out_of_scope` |
| 2 | `change_kind !== "numeric"` | `not_numeric` |
| 3 | Either raw value fails eligibility (null, no digit, truncated, sentinel) | `value_ineligible` |
| 4 | A no-op line | `no_op_line` |
| 5 | The key occurs more than once in either patch (any card, any line kind) | `key_ambiguous_in_patch` |
| 6 | The key occurs in a report strictly between `a` and `b` (then `b` is not the next occurrence) | — (structural) |
| 7 | A report between `a` and `b` is missing or unloaded, or the ordinals are not contiguous, or a version is unparseable | `report_gap` / `contiguity_unverifiable` |
| 8 | Both lines carry a non-null `mogzy_entity_ref` and they differ | `entity_ref_conflict` |
| 9 | Both lines carry a non-null `mogzy_property` and they differ | `mogzy_property_conflict` |
| 10 | `canonicalValue(b.before) !== canonicalValue(a.after)` | `before_mismatch` |
| 11 | The property names differ and no verified alias row resolves to exactly this pair | (no link) |
| 12 | An alias row whose pinned strings do not match the payload, or which matches 0 or more than 1 line pair, or which fails gates 5–10 or the rename-not-coexistence test | `alias_row_unresolved` / `alias_evidence_failed` |
| 13 | Any identity whose in-range occurrences include a refusal from 3–10 | No chain for that identity in the range |
| 14 | Any in-range report fails to load | No chains in the range |
| 15 | Backend `historical_context` | **Ignored** by the matcher. If it ever becomes `analyzed` and disagrees with a Catch-Up label for the same line, suppress the Catch-Up label. This needs a test once data exists. |

---

## 14. Recommended PH3-B domain API and types

All of this is pure, with no React and no I/O, under `src/lib/patch-catchup/continuity/`. It reuses `comparePatchVersions` and `parsePatchVersion` (`patch-impact/continuity.ts`), `normalizeAbilitySlot` (`report-structure.ts`) and `cardAnchors` (`semantic-ids.ts`) by import only.

```ts
// types.ts
export type ContinuityScope = "sr.champions" | "sr.items";
export type PatchContinuityKey = {
  scope: ContinuityScope; entity: string; slot: string | null; group: string; property: string;
};
export type LineRef = {
  patch: string; cardIndex: number; changeIndex: number;
  /** PH1 change anchor (cardAnchors) for ?patch=<patch>#<anchor> links. */
  anchor: string;
};
export type ContinuityLine = {
  ref: LineRef; key: PatchContinuityKey;
  beforeRaw: string; afterRaw: string;            // verbatim Riot
  before: string; after: string;                  // canonicalValue
  mogzyProperty: string | null; entityRef: string | null;
};
export type LinkBasis = { kind: "exact_key" } | { kind: "verified_alias"; aliasId: string };
export type ContinuityLink = { from: LineRef; to: LineRef; basis: LinkBasis };

export type ContinuityRefusalReason =
  | "out_of_scope" | "not_numeric" | "value_ineligible" | "no_op_line"
  | "key_ambiguous_in_patch" | "report_gap" | "contiguity_unverifiable"
  | "entity_ref_conflict" | "mogzy_property_conflict" | "before_mismatch"
  | "alias_row_unresolved" | "alias_evidence_failed";
export type ContinuityRefusal = { reason: ContinuityRefusalReason; lines: LineRef[]; aliasId?: string };

export type ChainLabel =
  | { kind: "exact_undo" } | { kind: "partial_undo" } | { kind: "over_revert" } | { kind: "continued" }
  | { kind: "net_only"; why: "incomparable_shape" | "mixed_components" };

export type ContinuityChain = {
  identity: string;                 // JSON key string of steps[0]
  steps: ContinuityLine[];          // ≥ 2, oldest first, all in range
  links: ContinuityLink[];          // steps.length − 1
  start: { patch: string; raw: string };  // value before steps[0].patch (verbatim)
  end: { patch: string; raw: string };    // value after the last step (verbatim)
  label: ChainLabel;
  concurrentMechanical: boolean;
};

export type CatchupRange = { since: string; end: string; versions: string[]; clampedToFloor: boolean };
export type RangeResult = { ok: true; range: CatchupRange } | { ok: false; reason: "range_invalid" | "up_to_date" };

export type VerifiedAlias = {
  id: string; scope: ContinuityScope; entity: string; slot: string | null; group: string;
  from: { patch: string; property: string; before: string; after: string };
  to:   { patch: string; property: string; before: string; after: string };
  evidence: string[]; verifiedBy: string; verifiedOn: string;
};

export type ContinuityResult =
  | { ok: true; range: CatchupRange; chains: ContinuityChain[];
      unclassified: Array<{ identity: string; reason: ContinuityRefusalReason }>; refusals: ContinuityRefusal[] }
  | { ok: false; reason: "range_invalid" | "history_incomplete" };
```

```ts
// functions
canonicalLabel(s: string | null | undefined): string
canonicalValue(raw: string | null | undefined): string | null      // §10, null if ineligible
valueTemplate(canonical: string): { template: string; numbers: string[] /* exact decimals */ }
continuityKey(card: PatchReportCard, change: PatchReportChange): PatchContinuityKey | null
continuityKeyString(k: PatchContinuityKey): string
resolveCatchupRange(listed: readonly string[], since: string, end?: string): RangeResult
collectContinuityLines(report: PatchReportDetail): { lines: ContinuityLine[]; refusals: ContinuityRefusal[] }
linkContinuity(args: {
  range: CatchupRange;
  reports: readonly PatchReportDetail[];   // must cover range.versions exactly once
  aliases: readonly VerifiedAlias[];
}): ContinuityResult
classifyChain(steps: readonly ContinuityLine[]): ChainLabel
```

**Contract notes.**
- `linkContinuity` returns `history_incomplete` when the reports do not match `range.versions` exactly.
- No function reads `context_text`, `detail_text`, `editorial_direction`, `mogzy_status`, `historical_context` or `card.id`.
- `VERIFIED_ALIASES` ships with the two rows from §5, behind owner sign-off.

---

## 15. Exact test corpus for implementation

### Fixtures

- **Real corpus.** Copy `docs/PATCH_HUB_PH3_CONTINUITY_FIXTURE.json` into `src/lib/patch-catchup/continuity/fixtures/`. *(Done in PH3-B as `src/lib/patch-catchup/fixtures/ph3a-continuity-fixture.json`; that copy is now the only one in the tree.)* Then capture the 10 reports trimmed to the fields the matcher reads (`section_id`, `entity_type`, `entity_name`, `mogzy_entity_ref`, and per change `group_title`, `ability_slot`, `property_name`, `change_kind`, `before_raw`, `after_raw`, `mogzy_property`).
  - Keep **every** section, not just Champions/Items: the collision tests need the mode and Support Adjustments lines.
  - Pin the report SHA-256 hashes from the fixture.
  - PH2's corpus fixture is not enough: it has no `section_id`, no items and no mode lines.

### Real-corpus assertions

1. With aliases, exactly the 5 `expected_links` (basis, endpoints, raws). Without aliases, exactly the 3 Tier A links.
2. Every `candidate_table` row with a verdict other than `proven` produces no link.
3. The 4 false positives of the prior rule (Protein Shake, Serylda's Grudge, Classic ×2) produce no link, **including** with a test-only scope override that admits every section, where the result is still exactly 3 links.
4. Locke SR W 26.14 vs Arena Locke 26.15: no link. Nasus Classic/SR: no link. Imperial Mandate 26.11 system vs 26.13 item: no link.
5. All 45 `expected_chains_by_range` entries match: chain identity, steps and label. The labels are: Bel'Veth HG, Sundered Sky, Sylas and Mordekaiser `exact_undo`; Doran's Helm `continued` (only when `since` < floor).
6. `concurrentMechanical` is true for Mordekaiser (26.15 R "Bugfix") and Bel'Veth Health Growth (26.15 Base Stats "Total Attack Animation"), and false for the other 3.
7. The 7 `value_ineligible` in-scope lines (Senna `On Hit`; Bel'Veth `Removed` ×2, `Every attack`, prose ×2; Viego `2% (+…. )`) are refused with `value_ineligible`.
8. Determinism: shuffled input report order gives an identical result.

### Synthetic cases

Built with the `mkCard`/`mkChange` builders.

| Case | Expected |
|---|---|
| A `100→110`, `110→105` | net `100 → 105`; `partial_undo` |
| B `100→110`, `110→100` | `exact_undo` |
| C `100→110`, `110→105` | `partial_undo` |
| D `100→110`, `110→95` | `over_revert` |
| E `100→110`, `110→120`, `120→105` | one chain of 3 steps; `partial_undo` relative to 100 |
| F `10/15/20%→5/15/25%`, `5/15/25%→6/13/20%` (same key) | `net_only: mixed_components` |
| F′ `70/75/80/85/90 → 90`, `90 → 80` | chain with endpoints verbatim; `net_only: incomparable_shape` |
| G `10%→13%`, `13%→10%` | `exact_undo` |
| G′ `10→13`, `13%→10%` | `before_mismatch` (`13` ≠ `13%`) |
| G″ `(+40% AD)` vs `(+40% bonus AD)` continuity | `before_mismatch` |
| H `100→110`, `115→120`, `120→100` | identity unclassified in range; no chain |
| Tokens: `(+45% AP)` vs `(+45% Ability Power)` | equal |
| Tokens: `(+ 80% AP)` vs `(+80% AP)` | equal |
| Tokens: `10/14/18` vs `10 / 14 / 18` | equal |
| Tokens: `.6%` vs `0.60%` | equal |
| Units: `18 / 16s` vs `18 / 16 seconds` | equal |
| Units: `5` vs `5s` | not equal |
| Text: `175%` vs `175% against Monsters` | not equal |
| Text: `x (Levels 1 / 6 / 11)` vs `x` | not equal |
| Text: trailing ` -` | not equal |
| Rename with no alias | no link |
| Alias row with one pinned raw edited | `alias_row_unresolved` |
| Alias where the old property still exists in the later card | `alias_evidence_failed` |
| The same key twice in one patch (two groups sharing a slot and property, Riven-style) | both titles distinct, so no collision; the same title twice gives `key_ambiguous_in_patch` |
| The same key twice across two cards in one patch | `key_ambiguous_in_patch` |
| A key in 26.13 and 26.15 with the 26.14 report absent from input | `history_incomplete` |
| `listed` missing 26.14, so 26.13 → 26.15 is not contiguous | `contiguity_unverifiable`; display still allowed |
| `25.24 → 26.1` | `contiguity_unverifiable` |
| `26.12b` or `25.S1.1` in the range | `range_invalid` / unparseable |
| `mogzy_property` `cooldown` vs `mana_cost` with matching values | `mogzy_property_conflict` |
| `mogzy_property` null vs `stat_hp` | allowed |
| Refs `3097` vs `3095` | `entity_ref_conflict` |
| Mode collision: SR item and Arena system with the same name, key and matching values | no link |
| A mechanical line with the same property between two numeric lines | no link (`not_numeric` on the pair) |
| No-op `65%→65%` inside a chain's key in range | identity unclassified |
| `since` = latest | `up_to_date` |
| `since` < floor | `clampedToFloor`, with the floor included |
| `since` not listed | `range_invalid` |

---

## 16. Unresolved risks

1. **Tier B is human-maintained.** In this corpus, 5 of 8 continuity-holding SR pairs are renames, so recall depends on alias review. If the owner withholds the two rows, V1 has 3 chains, of which only Bel'Veth HG appears for `since` ≥ 26.12.
2. **SR changes published outside Champions/Items** (a display-completeness gap, not a matcher false positive):
   - 26.11 "Support Adjustments" carries 10 SR item and rune cards typed `system` (Imperial Mandate, Locket, Knight's Vow, Guardian, Aftershock…) plus one general card. None has a usable ref.
   - 26.16 Systems "ADC MAGIC RESISTANCE" changes base MR for 27 champions with no per-champion card. The affected champions include Senna, Zeri, Kai'Sa, Smolder, Aphelios, Draven and Quinn.

   Value continuity keeps chains true, but Catch-Up must surface these sections ("Also changed in Systems / Support Adjustments") so a per-entity view is not read as complete. Imperial Mandate 60 → 65 → 60 is a real undo that V1 will not show.
3. **Report re-promotion.** If it rewrites raw text, links and alias rows vanish (fail-closed). There is no drift today: 322 of 322 lines match since 2026-10-03.
4. **Riot text errors propagate to chain starts.** `v0` is single-sourced (Naafiri's `450` typo). A later mismatch breaks the chain, but a wrong `v0` with no earlier step cannot be detected.
5. **Unchanged coincident parameters** are invisible. This is why value continuity can never identify, and why Bel'Veth R stays out.
6. **The `mogzy_property` veto depends on build-time mappings.** A future re-mapping could veto a true link. That costs recall only.
7. **Backend `historical_context`** may start classifying later. §13 rule 15 suppresses disagreeing labels. The reconciliation test is still to be written.
8. **Year-boundary and hotfix versions** are not linkable until `chronological_order` is exposed.
9. **Label reuse across a rework under an unchanged group title** (Tier A). See the riskiest case below.

---

## Acceptance bar

**"Across every plausible link in 26.10–26.19, can this matcher produce zero known false positives?"**
**Yes.** Over all 1,775 lines in all 10 reports:
- Tier A produces 3 links. It still produces 3 links and 0 false ones with the scope allowlist removed.
- Tier B adds 2 links, each pinned to verbatim text and backed by a second authority.
- Every known false positive is refused: 4 from the prior rule, 1 cross-mode, and 4 numbers-only coincidences.

To get here the rule was tightened from the prior proposal:
- the key gained the group title and the property name;
- the key gained mode scope;
- value continuity was demoted to a gate;
- renames moved to verified alias rows.

The cost is recall. Of the prior rule's 8 SR links, 5 survive; Bel'Veth R and Poppy Q ×2 are withheld.

## Summary

| Measure | Result |
|---|---|
| **Proven chains** | **5**: 3 exact-key (Bel'Veth Health Growth, Doran's Helm Health, Sundered Sky Health) and 2 verified-alias (Sylas Q, Mordekaiser R) |
| **Rejected plausible chains** | **16 withheld**: 8 plausible but unsafe in SR, 5 unclassifiable, Imperial Mandate cross-section, and 2 in-mode renames (Redemption, Now You See Me). In addition, **5 false links** that looser rules create are refused: 4 from the prior rule and 1 cross-mode (Locke). |
| **Matcher precision confidence** | **0.97.** Zero known false positives. The residual is the unobserved label-reuse-after-rework case, plus the human alias review. |
| **Matcher recall confidence** | **Low, about 0.4.** Measured recall is 5 of the 13 true-looking SR relationships (0.38); with aliases withheld it is 3 of 13 (0.23). Renames and format drift dominate the misses. |
| **PH3-B** | **GO**, under three conditions: (1) Tier A is implemented exactly as specified, with the test corpus in §15; (2) the two Tier B alias rows ship only after owner sign-off, otherwise V1 ships with Tier A only; (3) the Catch-Up presentation surfaces the SR content in Systems and Support Adjustments as Riot lines, without chains. |
| **Single riskiest remaining case** | **A Tier A exact-key link across an ability rework that kept its group title and property label.** Bel'Veth 26.15 is the template: "Q - Void Surge / Damage" was rebuilt from `0/5/10/15/20 (+100% AD)` to `12/14/16/18/20 (+105% AD)` under the same title and label. A later line restoring the old value would be labelled "exact undo" of a parameter whose meaning changed. The endpoints are still true Riot values, so the claim stays factual about the value. Mitigations: `concurrentMechanical` plus value-scoped label wording. The case is not observed in this corpus and no gate can detect it from payload data alone. |
