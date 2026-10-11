# Match Grid — categorical authority audit (GM-M1)

> **Superseded for runes (MG-P1 / MG-P2 / MG-P3, 2026-10-10).** Rows A1/A2
> below describe the rune authority as it stood at M1. The production rune
> authority is now the backend's **wiki-certified `runes` table** (MG-P1:
> `rune_canonical`, 62 current runes sourced from `Template:Rune path
> infobox/<Tree>` + `Template:Rune data <Name>`, digest-sealed snapshot,
> stable id `rune_key`; Phase Rush retired), read by the backend `match.v1`
> module only through `rune_canonical.read.rune_tree_memberships(conn)`. See
> backend `MATCH_GRID_P1_HANDOFF.md` and `docs/MATCH_GRID_P1_RUNE_AUTHORITY_AUDIT.md`.
> The "33 agreed runes" intersection and the frontend `runeData.ts` reading are
> no longer used by any production path; the frontend renders the frozen
> board P2 serves and grades nothing (`MATCH_GRID_P3_HANDOFF.md`). The other
> families' classifications are unchanged.

Audited 2026-10-10 against frontend `mitcherrman/mogsy` `bdf4bbf1` and backend
`mitcherrman/League_Combat_Simulator` `63847f4f` (branch `reconstruct/r1-backend`
at `afcedd43` carries the Reconstruct module on top of that master).

MATCH asks "which entities belong together?". A content family qualifies only
if the relationship is **authoritative, exact enough to grade, freezable per
round, and real player-facing knowledge**. Each family below is classified:

* **A** — authoritative and exact enough for gameplay now
* **B** — authoritative but multi-valued / ambiguous (needs honest many-valued semantics)
* **C** — internal implementation taxonomy, not player knowledge
* **D** — insufficient or unverified

## Governing source policy

`docs/source_authority.md` (backend): Riot **DataDragon is PROHIBITED** as a
source — "must not be called, imported, registered, mocked, or used as a
fallback anywhere in Mogzy". The approved order is Riot patch notes → League
wiki → the Mogzy DB (which is "never evidence"). Anything DataDragon-derived
that still exists in either repo is **frozen legacy data**, not an authority.
This matters for runes: see A1.

## Summary table

| # | Family | Authority | Provenance | Cardinality | Exact? | Freezable / round? | Ambiguity risk | Production-safe now? | Class |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Rune → rune tree | Backend `runes.tree_name` (34 rows; `GET /api/meta/runes`; `quiz/rune_facts.py`). Frontend `live-esports/runeData.ts` (62 perks) is the art mapping | Backend: hand-typed seed (`seed_core_runes.py`), unversioned, `rune_provenance.py` marks every row UNCERTIFIED. Frontend: generated from DataDragon 16.19.1 (`runesReforged`) — legacy lineage | each rune → exactly one tree (tree → many runes) | **Yes** | Only by snapshotting into the round payload (the table has no revision column); the Reconstruct pattern | Backend knows 34 of ~62 live runes; **Phase Rush** is backend-only and absent from DataDragon 16.12/16.19 (stale); the two tables agree on tree AND keystone status for the other **33** | Limited: yes for the 33 agreed runes | **A** (agreed roster) |
| A2 | Rune → keystone / minor | Backend `runes.rune_type` ∈ {keystone, minor}; frontend `keystone: boolean` | Same as A1 | 2-value partition | Yes | Same as A1 | Precision and Sorcery carry 4 keystones each; as a stand-alone game it is a coin-flip per rune — too thin to be a round by itself | Yes as a **reveal fact**, weak as gameplay | **A** as reveal detail, not as a family |
| A3 | Rune → slot / row | None at runtime. Only `lol_runes_summoner_assets/manifest.json` `slot_index` (DataDragon 16.12.1) | Prohibited lineage; its downloader was deleted | one-to-many | Data looks right but is inadmissible | No | — | No | **D** |
| A4 | Stat shards | `mastery/runes/stat_mods.py` (wiki rev 4046438, V26.19) | Wiki, versioned | shard → row(s), many-to-many | Yes | Yes | Same shard appears in several rows; shards have no tree | Exclude from rune → tree | excluded |
| B1 | Champion → roles | `ranked_public/data/champion_roles.csv` + `champion_roles.py`; `docs/champion_roles_authority.md` | U.GG patch 26.18, Emerald+, hand-curated 2026-09-17; 173 champions | **many-to-many**: 66 champions have 1 role, 72 have 2, 29 have 3, 5 have 4, Brand has 5 | No — `roles` = relevance / eligibility, `primary_role` is informational only and "never gates eligibility" | Yes (`question_roles_json` precedent) | A single-destination lane game would falsify the authority | Yes as eligibility; **not** as a one-home answer | **B** |
| C1 | Summoner spell → mode | `summoner_spell_canonical` (`maps_json` keys sr/ha/nb/ar/tt/cs, `is_current_sr`); fixture `spell_data_rev4043910.json` | Wiki `Module:SpellData/data`, revision-stamped | many-to-many (8 spells are both SR and ARAM) | Yes for the flags | Yes | Hexflash / Recall / Empowered Recall are SR-flagged but not picks; ARAM list includes event spells; the legacy `summoner_spells` table has 5 rows and no Flash | Partly: a 9-spell SR pick population is small | **B** (A only if restricted to "quizzable SR" vs "ARAM-only") |
| D1 | Item → type tier (Basic / Epic / Legendary / Boots / Starter …) | `item_canonical.types_json` | Wiki `Module:ItemData`, `source_revision` | 229 of 237 current items single-typed; 5 dual (Elixirs = Consumable+Distributed, Slightly Magical Boots, Eye of the Herald); 3 untyped | Yes | Yes (Reconstruct already freezes item ids and revision) | Distributed / Consumable overlap | Yes with the current-SR / shop filters Reconstruct uses | **A** — strongest second family |
| D2 | Item → builds-from | `item_build_components` + `item_graph_nodes` (wiki, provenance rows) | Wiki | many-to-many with quantities | Yes | Yes (proven by Reconstruct) | Shared components, transform items | Yes, but it is a graph not a partition (and Reconstruct already owns it) | **A** but leave to Reconstruct |
| D3 | Item → stat family | `item_canonical.stats_json` via `runtime_stats.map_stats_json`; Order Forge v2 `item_stat:{ad,ap,hp,armor,mr}` | Wiki | many-to-many (most items carry several stats) | Yes for presence | Yes | Magnitude thresholds; an item in several groups | With care | **B** |
| D4 | Item shop category / class tags | none | — | — | — | — | — | No | **D** |
| E1 | Champion ability → slot (P/Q/W/E/R) | `champion_ability_canonical` (`ABILITY_KEYS`), legacy `champion_abilities.slot` | Wiki, VERIFIED / INHERITED tiers | one slot per (champion, ability) | Yes | Yes | Multi-form champions (Nidalee, Jayce, Elise, Gnar) | Yes (Meta Reflex uses it) | **A** (ability ↔ champion ownership is the honest framing) |
| E2 | Ability effect tags (CC / DAMAGE / SHIELD …) | `champion_ability_canonical/data/effects.jsonl` (AEC.1) | Wiki-derived, reviewed, 1,642 **branch** records | many-to-many per branch | Mechanically exact, but engine-facing; its own docstring: "No runtime reads it yet" | Yes | A branch is not an ability; vocabulary is implementation | No | **C** |
| E3 | Ability damage type / mechanic tags | `ability_mechanic_*` tables, `source DEFAULT 'inferred'` | Inferred | many-to-many | No | No | — | No | **C / D** |
| F1 | Champion → attack type (Melee / Ranged) | `champion_metadata.attack_type` via `quiz/champion_facts.py` | Wiki `Module:ChampionData` `rangetype` | 2-value partition | Yes, with form-swappers coerced to one value | Yes if snapshotted | Gnar, Jayce, Elise, Nidalee, Kayle | Yes (Meta Reflex) | **A** (two groups only — thin as a round) |
| F2 | Champion → resource | `champion_metadata.resource_type` (15 closed values in `meta_reflex_content.py`) | Wiki | one-to-many | Yes | Yes if snapshotted | Long tail of one-champion resources | Yes | **A** (Mana / Energy / No Mana / Fury … makes a good 3–5-group round) |
| F3 | Champion → class tags | `champion_tags` | **Mixed**: legacy DataDragon rows plus wiki KE `role_tags` (17 class/subclass labels); "used as a cross-check only" | many-to-many | No (mixed vocabulary, uncertified) | — | Class vs subclass | No | **D** |
| F4 | Champion adaptive type (AD / AP) | KE identity field | Wiki backfill | 2-value | Yes | Yes | A tie-breaker, not player-facing identity | Questionable | **C** |
| F5 | Champion `damage_type`, region / faction | column with no writer; no region authority (graph1 "region" is esports) | — | — | — | — | — | No | **D** |

## Findings in detail

### A1 — Rune → rune tree (chosen first family)

* **Three rune tables exist**; M1 creates none and reads two:
  * Backend `runes` (34 rows, `init_rune_tables.py` schema `id, rune_name, tree_name, rune_type, notes` + `asset_path`), seeded by hand in `seed_core_runes.py`, served by `GET /api/meta/runes`, consumed by the Practice families `rune_tree`, `rune_type`, `rune_keystone` (`quiz/family_contract.py`). No patch, revision or provenance column; `mastery/runes/rune_provenance.py` marks every row UNVERSIONED / UNCERTIFIED and says "do not fabricate patch provenance for runes".
  * Frontend `src/lib/live-esports/runeData.ts` (62 perks, 5 trees, 7 shards), generated from DataDragon 16.19.1 for the LIVE1 esports rune line; it is the only id → art mapping in the frontend. Art is served by the backend at `/assets/runes/<Name>.png` (62 PNGs, the DataDragon-era copies).
  * `lol_runes_summoner_assets/manifest.json` (DataDragon 16.12.1, slot indexes) — prohibited lineage, not read.
* **Cross-check (this audit, scripted):** of the 34 backend rows, **33 agree with the frontend table on both tree and keystone status; 0 disagree; 1 (Phase Rush, Sorcery keystone) is backend-only** and absent from DataDragon 16.12.1 and 16.19.1 — a stale seed row. Per tree, the agreed roster is Precision 10, Domination 6, Sorcery 6, Resolve 6, Inspiration 5.
* **M1 decision:** the adapter (`src/lib/match-grid/runeAuthority.ts`) reads `runeData.ts` for ids, names, art and tree, asks the backend table at runtime, and deals only runes **both** tables agree on, so every M1 round is reproducible by production from its own `runes` table. Without the backend it falls back to the frontend table and says so in the harness chrome ("not production-reproducible").
* **Risks:** the production table covers barely half the live runes and has no freshness stamp; before Match Grid ships as Ranked content the `runes` table should be re-sourced from the wiki with a `source_revision` (the item/summoner-spell canonical pattern) and Phase Rush retired. The reveal shows **tree identity + slot status (keystone / minor)** only — both facts come from the table; no explanatory prose is written.

### A2 — Rune → keystone / minor

Exact and present in both tables, but as a round it is one binary per rune, and a 5-tree board already teaches it: the reveal prints it as the one extra fact. Not promoted to a family.

### B1 — Champion → roles

The authority document is explicit: `roles` is relevance/eligibility, several roles are intentional (Brand lists all five), and `primary_role` "never gates eligibility". A Match Grid that accepts one lane per champion would therefore be dishonest. The neutral contract reserves `membership: "many"` for exactly this (an entity may be seated under several groups and graded against a set); M1's primitive **throws** on it rather than fake it. A future champion → role board must (a) deal a champion only with its full role set gradeable, and (b) never also offer a second role the champion holds as a "wrong" seal.

### C1 — Summoner spell → mode

The canonical table is wiki-sourced and revision-stamped, so it is admissible, but the useful partition is small (9 quizzable Summoner's Rift picks; 8 also in ARAM) and needs filtering of non-pick entries (Hexflash, Recall variants) and ARAM event spells. Recommend B; an "SR pick vs ARAM-only" two-group board is possible later.

### D1 — Item → type tier (recommended second family)

Wiki-sourced, revision-stamped, 97% single-typed, already filtered to current Summoner's Rift shop by Reconstruct's catalog reader. Groups "Basic · Epic · Legendary · Boots" with real item art is an exact, freezable classification. Only the dual-typed Elixirs / Slightly Magical Boots / Eye of the Herald need exclusion or `membership: "many"`.

### E1 — Champion ability → slot

Exact and wiki-tiered, but the natural MATCH framing is "which abilities belong to which champion" (ability → champion, one-to-many), with the slot as a reveal fact; the P/Q/W/E/R partition alone is five arbitrary buckets per champion. Viable third family with champion portraits as seals.

### E2 / E3 — effect and mechanic tags

Engine taxonomy (branch-level, inferred or reviewed for item mechanics). Not player-facing knowledge; excluded.

### F1 / F2 — attack type, resource

Both wiki-sourced via the Knowledge Engine, both exact, both already used by Meta Reflex. Attack type is only two groups; resource (Mana / Energy / No Mana / Fury / …) makes a good 3–5-group board and is a candidate fourth family, once the long tail of single-champion resources is handled (group only the common resources; deal champions from those).

## Recommendation

1. **Ship first:** Rune → rune tree, agreed roster (33 runes), with the backend `runes` table as the grader's authority and `runeData.ts` as the art/ids map. Before Ranked exposure: re-source `runes` from the wiki with a revision, retire Phase Rush, extend to the full live roster.
2. **Next exact families:** item → type tier (D1), then champion → resource (F2), then ability → champion (E1).
3. **Many-valued families (champion → roles, spell → mode, item → stat family)** wait for the `membership: "many"` primitive path and a set-graded reveal.
4. **Never:** effect/mechanic tags, class tags, slot/row from the prohibited manifest.
