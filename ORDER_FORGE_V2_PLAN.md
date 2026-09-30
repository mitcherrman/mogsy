# ORDER FORGE V2 — Design contract (OF3 series)

Status: **design ACCEPTED by owner 2026-09-30 with the decisions in §0. No production code changed.** Audited 2026-09-30.

| Repo | Ref audited | Worktree |
|---|---|---|
| Backend `League_Combat_Simulator` | `origin/master` @ `de956571` (OF2 flip) | `.worktrees/of2-descending` |
| Frontend `mogsy` | `origin/main` @ `5e633009`; Order Forge code identical to `87a78f88` | `.worktrees/of2-fe` |

The current authority for everything already shipped is `ORDER_FORGE_HANDOFF.md`, especially the OF1-C "Final wire contract" and the OF2 section. Canonical order is **highest → lowest**, server-authoritative, and has no ties. Values stay hidden until reveal.

Labels used throughout: **[FACT]** = verified in code at the refs above, with a `file:line` citation. **[DECISION]** = this plan's design choice. **[UNKNOWN]** = needs data or an owner call.

Backend paths are relative to `League_Combat_Simulator/`. Frontend paths are relative to `mogsy/`.

---

## 0. Owner decisions (2026-09-30) — these override anything below

| # | Topic | Locked decision |
|---|---|---|
| O1 | Role | Order Forge **champion** families are role-aware. v2 consumes the existing frozen `RankedFormat.content_roles` and the existing `champion_roles` authority **at its own content-selection boundary**. Global comparison-family role semantics (`champion_roles.py:131-132`, `publishable_question_roles`, quiz pool weighting) are **not changed**. No parallel role system. Item families stay global unless a real authoritative item-role source exists. |
| O1a | Role fallback | Role-relevant champion pool → global champion pool **only** when the role pool cannot legally form the required board (distinctness + gap + entry_count). Deterministic, and recorded in private payload diagnostics and asserted by tests. |
| O1b | Role flag | `RANKED_ROLE_IDENTITY_ENABLED` is explicitly set on production web but its **value is unverified**. This is an **operational prerequisite** to verify before claiming role-aware behaviour live, not an assumption. |
| O2 | Analytics | Admin/playtest attempts stay queryable but are **excluded from default player/product KPIs** using existing provenance: `ranked_matches.host` / `session_preset` (`persistence.py:54-75`; `service.py:2098-2102` maps presets to `HOST_PLAYTEST` / `HOST_STUDY_HALL`) and `creation_source` (`admin_test`, `bot_playtest`; `service.py:2574, 3751`). Reuse existing analytics/history infrastructure. No browser writes for authoritative gameplay facts. |
| O3 | Weak Areas | **Not** in the first V2. First: durable identities → replay/review compatibility → certified Daily module compatibility. Weak Areas is a later product decision. |
| O4 | Daily / Standard | Make v2 technically eligible and composable for Daily hosts. **Do not change** the owner-locked Standard recipe. Insertion, frequency and position are later product decisions. |
| O5 | Art | `src/assets/ranked/base-shop.jpg` (~637×358) is the backdrop, used only as a soft, faded, darkened texture — never sharp hero art. |
| O6 | Version | The expanded semantic contract is `order_forge.v2`. v1 stays frozen and replayable. |
| O7 | Family ship set | Not guessed. Every candidate family is **disabled until a production readiness report for that family is recorded** in the handoff. §4 lists candidates, not a ship set. |

### Invariant — no host/module relevance fight
> **Order Forge role-aware selection must extend existing Ranked/Daily role and content authorities. It must not pre-filter, overwrite, or bypass host-level role/content selection in a way that causes the module and its host to fight over relevance.**

Concretely:
- The host (format / Daily recipe / preset) chooses **whether** a segment is Order Forge, **which family**, and **whether** `role_scope` applies. The module never changes its family, never re-reads roles from the account/queue, and never mutates `content_roles`.
- The module reads roles only from the frozen `fmt.content_roles` it is handed; if that is `None` (flag off, admin test, Daily without role), selection is global — no inference.
- Role affects only which champions are *eligible* for this one board, using the same full-role-set rule as `question_matches_queue_role`. It never alters quiz pool slot planning (`role_content.plan_cycle_targets`) or Meta Reflex's composer.
- `question_roles` on the segment is a **tag** for the host's existing surfaces, set only when the role pool was actually used.

---

## 1. Verified current architecture

### Backend module
- **[FACT]** `ranked_modules/order_forge.py`:
  - Identity: `MODULE_VERSION=1`, one family `FAMILY_ITEM_COST` (:56-60).
  - `parse_config` refuses unknown keys and families (:118-156). `MIN_GAP_FLOOR=100` applies to every family (:69, :147).
  - Hardcoded strings: `PROMPT`, `METRIC_LABEL`, `DIRECTION_LABELS`, `CHILD_FAMILY="order_forge:item_cost"`, `COST_SOURCE` (:84-94).
  - Display formatting: `_grams` renders `"2050 g"`, with no thousands separator (:298).
- **[FACT]** The generator is duck-typed on `.item_id`, `.name`, `.cost` (a positive int) and `.asset_path` (`eligible_items` :162, `max_selectable` :187, `_pick_items` :224, `build_challenge` :257). It sorts descending (:270).
  - The private payload already freezes `values`, `value_display`, `labels`, `entity_ids` and `source` (:363-374).
- **[FACT]** Module flags: `declares_child_refs=False` (:319) and `supports_challenge_reveals=True` (:322).
  - Each settled child is `ChildOutcome(canonical_question_ref=None, family="order_forge:item_cost", answer=[ids])` (:649-652).
  - `resolve_segment` fails closed without `correct_points` (:588-595).

### Backend wiring
- **[FACT]** Pool injection happens in `ranked_public/service.py:1837-1841`: `kwargs["item_pool"] = _item_pool(cur)`, which is `load_duel_item_pool`. Meta Reflex gets `kwargs["content"] = _meta_reflex_content(cur)` instead (:1851, :1991-2003).
- **[FACT]** Readiness is item-only: `ranked_public/readiness.py:207-241` hardcodes `load_duel_item_pool` and `validate_item_pool`, and gates creation at :769.
- **[FACT]** The schema validator (`ranked_formats/schema.py:263-296`) delegates to `parse_config`, requires `challenge_count==1`, and requires an explicit `pressure_seconds`.
- **[FACT]** The only public exposure is the admin preset `admin.order_forge`, which creates format `ranked_admin_order_forge_test`: unrated, 3 segments, `family:"item_cost"`, `min_gap:100` (schema.py:2180-2210; service.py:462-480). The frontend launch lives in Ranked › Playtests (`f41ab4e9`).

### Frontend
- **[FACT]** Order Forge is fully server-driven:
  - `readOrderForgeBlock` reads `prompt`, `metric_label`, `direction_labels` and `entries` (`src/lib/ranked-public/contracts.ts:1365-1430`). It **does not read `family`**.
  - The renderer declares no `servesVersion`, so it serves every version (`src/lib/ranked-core/modules/registry.ts:43-44`, `orderForgeModule.tsx:167-175`).
  - The review kind `order_forge` is typed (`contracts.ts:2468`).

---

## 2. Exact reuse points (what V2 must plug into, not rebuild)

| Need | Canonical authority to reuse | Citation |
|---|---|---|
| Numeric entity pools (items, item stats, champion stats at level N) | `meta_reflex_content.content_for(conn).get(family_id).entities`, a per-DB cached snapshot of `CardEntity(item_id, cost:int, label, media, entity_kind)` | `meta_reflex_content.py:116-135, 154-178, 635-713, 819-837` |
| Injection of that snapshot into a module | `service._meta_reflex_content(cur)` | `service.py:1851, 1991-2003` |
| Champion stat values and levels | `factual_duel.champion_stat_variants` → `quiz/champion_stat_authority.value_at`. This is the same call League Swipe and Meta Reflex make. | `factual_duel.py:234-256`; `meta_reflex_content.py:368-413` |
| Item stats | `item_canonical.stats_json` (validated current, SR, purchasable), with ambiguous items excluded via `STAT_AMBIGUOUS_ITEMS` | `meta_reflex_content.py:219-321` |
| Item gold cost | `ranked_item_catalog.load_duel_item_pool`. Meta Reflex's `item_cost` family wraps the same loader. | `ranked_item_catalog.py:219-251`; `meta_reflex_content.py:644-648` |
| Value display units | `meta_reflex.VALUE_UNITS` and `format_card_value`: `"3,200 gold"`, `"1,984 HP"`, `" AD"`, `" MR"`… | `ranked_modules/meta_reflex.py:473-532` |
| Relative gap rule for stats | `champion_stat_authority.MIN_COMPARE_RATIO = 0.05`, meaning \|a−b\|/max ≥ 5% | `quiz/champion_stat_authority.py:206, 389-392` |
| Champion → role | `champion_roles.champion_roles()` and `wire_roles()`. The source is `ranked_public/data/champion_roles.csv` (173 champions, U.GG 26.18, owner-reviewed). | `champion_roles.py:17-43, 204-283` |
| Match role set | `role_content.content_roles_for` → `RankedFormat.content_roles`, frozen per match | `role_content.py:72-80`; `schema.py:840, 878-887`; `service.py:2462-2464` |
| Participant role | `ranked_participants.role`, frozen at creation | `migrate_add_ranked_roles.py:69-86`; `service.py:2511, 3850-3880` |
| Segment role tag | `GeneratedSegment.question_roles`, already persisted by the service | `contract.py:246-256`; `service.py:1645, 1710` |
| Durable refs | `discovery._REF_PREFIXES` and `_mint` | `ranked_public/discovery.py:97-115, 241-252` |
| Exact replay | `exact_replay` strategy registry, `plan_replay`, the per-namespace planner, and the `replay_target` segment config | `exact_replay.py:125-129, 347-397, 457-493`; `schema.py:538-575` |
| Settled per-answer facts | `ranked_segment_child_results` (outcome, family, `duration_ms` / `active_answer_ms`) | `migrate_add_ranked_child_results.py:104-121`; `persistence.py:928-983` |
| SFX | `useSfx()` plus the page-level observers `useRankedMatch` and `useRankedMatchSfx`. **This is on origin/main** via SFX1 `aa62fc22` and SFX2 `dd510777`. | §7 |

---

## 3. Role-aware contract

### Facts
- **[FACT]** Role reaches content today **only** through quiz shared-bank pool slots. `_role_aware_source` wraps the pool provider when `fmt.content_roles` is set (`service.py:1863-1869`). This is weighting with a fallback chain, never exclusion (`role_content.py:141-243`). No module receives a role kwarg.
- **[FACT]** Item → role authority: **none exists.** `role_content.py:27-28` keeps item pools global, and `test_rq1_multi_role_authority.py:143` asserts that `item_cost:*` is global for every role.
- **[FACT]** `champion_roles.py:131-132` says: comparison, superlative and option-roster families deliberately remain global. That policy is **answer-safety driven**: `publishable_roles_for_champions` returns `()` when a champion *is* the answer (:255-270). In Order Forge, the shared role reveals nothing about the order.
- **[FACT]** `RANKED_ROLE_IDENTITY_ENABLED` defaults off. When it is off, every match freezes `role NULL` and `content_roles=None` (`roles.py:72-81`; `docs/ranked-public-service.md:304`).

### Design
1. **[DECISION]** Order Forge consumes the **same frozen `fmt.content_roles`** that quiz uses. `_generate_segment` passes one new kwarg: `content_roles=fmt.content_roles`. This is not a second role system and it reads no role from the request or the account.
2. **[DECISION]** A new `module_config.role_scope` key controls role use:
   - `"global"` (the default, which is V1 behaviour).
   - `"match"`: champion families only.
   - The host (format or recipe) decides; the module never infers it.
3. **[DECISION]** `role_scope:"match"` on a champion family works as follows:
   - Target role: `content_roles[(segment_number − 1) % len(content_roles)]`. This rotation is deterministic and replayable, and gives both roles turns when the players differ. Quiz's rotation is similar.
   - Pool: keep only champions whose **full** wire-role set contains the target role (`wire_roles(champion_roles(name))`). Never use primary role alone; this is the same rule as `question_matches_queue_role`.
   - Feasibility: if the role-filtered pool's `max_selectable` falls below `entry_count`, **fall back to the global pool**. The design never fails a match because of role, matching quiz's fallback chain.
   - Tagging: set `GeneratedSegment.question_roles = (target,)` only when the role pool was actually used, otherwise `()`. Freeze `role_scope_applied: "<role>"|null` in the **private** payload for audit and replay.
4. **[DECISION]** Item families ignore `role_scope`. `parse_config` refuses `role_scope:"match"` on an `item_*` family, so a declared but unread option fails loudly instead of doing nothing. This follows the file's own rule at :121-123.
5. **[DECISION, per O1]** Global comparison-family semantics are unchanged. The `champion_roles.py:131` comment is **not** amended to cover Order Forge; instead Order Forge documents at its own boundary that it applies role only to board eligibility.
6. **[DECISION, per O1a]** Private payload records `role_selection: {target_role, pool:"role"|"global", role_pool_max_selectable, reason}` so fallback is visible in diagnostics, review of the frozen row, and tests.
7. **[OPS PREREQUISITE, per O1b]** Verify the actual value of `RANKED_ROLE_IDENTITY_ENABLED` on production web (e.g. `GET /api/ranked/launch-readiness` → `checks.role_identity`) before claiming role-aware behaviour live. If off, role scope is correctly inert.

---

## 4. Initial content-family matrix

**Family ids = Meta Reflex family ids** [DECISION]. They are one vocabulary with one loader, so analytics, refs and content cannot drift. The child `family` becomes `order_forge:<family_id>`. The public `family` string changes, and the frontend does not read it [FACT].

| Family id | Authority | Eligible N | Ties / feasibility | Min-gap rule [DECISION] | Role | Reveal format | Durable identity | Phase |
|---|---|---|---|---|---|---|---|---|
| `item_cost` (existing) | `item_canonical.shop_price`, falling back to wiki (`ranked_item_catalog.py:77-102`) | **[FACT, prod]** 192 eligible, 50 distinct (50..3500), `max_selectable@100g = 29` | int; distinct filter plus gap | absolute **100 g** (unchanged) | global | `"3,200 gold"` via `format_card_value` (currently `"3200 g"`) | item canonical name (`ranked_item_catalog.py:246`) | shipped |
| `champion_stat:hp@lvl18` | `champion_stats.hp` + `hp_per_level` via `value_at` | **[UNKNOWN]** roster ≈172–173 | rounded to int; wide spread | relative **5%** adjacent (`MIN_COMPARE_RATIO`) | **yes** | `"2,345 HP"` | champion name | **V2 first** |
| `champion_stat:ad@lvl18` | same, `ad` | [UNKNOWN] | int-rounded (AD has 1 decimal; see note) | 5% | yes | `"123 AD"` | champion name | V2 first |
| `champion_stat:armor@lvl18` | same, `armor` | [UNKNOWN] | int-rounded | 5% | yes | `"98 armor"` | champion name | V2 |
| `champion_stat:{hp,ad,armor}@lvl1` | same | [UNKNOWN] | narrower spread | 5% | yes | as above | champion name | V2 if readiness passes |
| `champion_stat:move-speed` | `champion_stats.move_speed`, flat | [UNKNOWN] | **heavy clustering** (325–355, INFERRED) | absolute 10 | yes | `"345 MS"` | champion name | defer: readiness decides |
| `champion_stat:attack-range` | `champion_stats.attack_range`, flat | [UNKNOWN] | **heavy clustering** at 125/175/550 (INFERRED) | absolute 50 | yes | `"550 range"` | champion name | defer |
| `item_stat:ad` | `item_canonical.stats_json.ad` (`meta_reflex_content.py:260-321`) | [UNKNOWN]; legacy sheet shape 61 items / 15 distinct (non-authoritative) | int; many ties | 5%, with an absolute floor of 5 | global | `"55 AD"` | item name | V2 |
| `item_stat:ap` | `.ap` | [UNKNOWN]; ~49 / 21 | int | 5%, floor 5 | global | `"90 AP"` | item name | V2 |
| `item_stat:hp` | `.hp` | [UNKNOWN]; ~73 / 20 | int | 5%, floor 50 | global | `"400 HP"` | item name | V2 |
| `item_stat:armor`, `item_stat:mr` | `.armor` / `.mr` | [UNKNOWN]; ~27 / 9, ~24 / 10 | **thin** | 5%, floor 5 | global | `" armor"` / `" MR"` | item name | defer: likely unservable at 5 entries |
| **Rejected** | champion base MR (~39% pair ties), attack speed (float ratio), mana (resource-gated), item AH (5 distinct values), percent item stats | — | — | — | — | — | — | Meta Reflex already excludes these (`meta_reflex_content.py:206-218`; `factual_duel.py:119-123`) |

### Rules for every family [DECISION]
- **Compare the displayed value.** Compare the same `CardEntity.cost` integer the reveal shows, so a player can never see a displayed tie. Rounding is monotonic (`meta_reflex_content.py:386-393`).
- **Pairwise distinct**, plus the family's adjacent-gap rule: `abs(a−b) ≥ max(floor, ratio·max(a,b))`. Replace the single `MIN_GAP_FLOOR` with a per-family table `{family: (abs_floor, ratio)}`. `min_gap` in config may only *raise* the floor.
- **Generalise `max_selectable` to the gap predicate.** A greedy over ascending distinct values is still optimal for a monotone gap rule.
- **Reveal-only values.** Nothing new goes into the public payload except strings: `prompt`, `metric_label`, `direction_labels`.
  - Prompt and labels are per family. Examples: "Order these champions by Health at level 18", metric "Health (lvl 18)", `{first:"Highest", last:"Lowest"}`; item cost keeps "Most expensive" / "Cheapest".
  - Every new string must pass `assert_pre_reveal_safe`.
- **Media.** `CardEntity.media` is the asset path. The adapter maps it to `asset_path` so the existing `eligible_items` rule (an image is required) holds.
  - [UNKNOWN] Whether champion asset paths resolve through the frontend's `resolveQuizAssetUrl` like item paths do. Meta Reflex champion cards already render, so this is likely, but certification must prove it.
- **Reveal formatting.** Adopt `meta_reflex.format_card_value` for all families, including `item_cost` in v2 only: `"3,200 gold"` replaces `"3200 g"`. v1 replays keep their frozen strings.

---

## 5. Analytics contract

### What is already recorded (no browser work needed) [FACT]
One `ranked_segment_child_results` row per player per Order Forge round (`persistence.py:928-983`), containing:
- `module_id='order_forge'` and `module_version`;
- `outcome ∈ correct|incorrect|timeout`;
- `family='order_forge:item_cost'`, with `category` falling back to the same string (:977);
- `answer_json` = the submitted order;
- `duration_ms` = `active_answer_ms` = the server-measured time from challenge start to accepted submit, or NULL on timeout (`segment_flow.py:424-457, 1156-1160`).

Role is joinable 1:1 on `(match_id, user_id)` → `ranked_participants.role`. `ranked_segment_challenges.choice_json` and the settled `segment_reveal` hold the rest.

### What is missing [FACT]
- **No reader groups Ranked child results by module or family.** `history/` is Daily-only (`daily.py:641-680`).
- `/api/quiz/analytics/*` excludes Ranked (`services/personal_analytics.py:113`).
- `learning_attempts` requires `canonical_question_ref IS NOT NULL` (:286), so it drops Order Forge.
- The frontend has no surface for this data.
- Browser analytics emits nothing per answer in Ranked (FUNNEL1 §14.4). **Keep it that way.**

### Design [DECISION]
1. **Projection:** add `services/ranked_module_stats.py`, a pure `SELECT` over `ranked_segment_child_results c JOIN ranked_participants p USING(match_id,user_id) JOIN ranked_matches m`.
   - Scope: self only (`c.user_id = viewer`).
   - Exclusions: `bot::%` users and Daily children (reuse the NOT EXISTS at `persistence.py:513-516`).
   - Filters: optional `module_id`, `family` and `role`.
   - Output per `(module_id, family, role)`: `attempts`, `correct`, `incorrect`, `timeout`, `accuracy = correct/attempts`, and `timed_attempts`, `median_active_answer_ms` and `mean_active_answer_ms` over non-null values only.
   - Also return `clock_basis: "server_challenge_start_to_accept"`. HISTORY_ANALYTICS_SPEC bans an unnamed `duration`.
   - Role NULL is reported as `"unknown"`.
2. **Cohort (per O2):** default KPI queries **exclude** playtest/admin provenance using existing columns only: `m.host` (playtest / study-hall hosts), `m.session_preset IS NOT NULL`, and `m.creation_source IN ('admin_test','bot_playtest')`. A `cohort=all|product|playtest` parameter (default `product`) keeps them queryable. Each group carries `format_ids[]`. Note: while Order Forge exists only as `admin.order_forge`, the default product view is **expected to be empty** — tests must assert that, not treat it as a bug.
3. **Endpoint:** `GET /api/ranked/module-stats?module_id=&family=&role=`, JWT self-scoped like `/api/ranked/history` (`routes/ranked_public.py:1050`). It is read-only with no writes and no migration.
4. **Single authority:** analytics reads `c.outcome`, never a re-derivation. The review re-derives from `choice_json` (`review.py:480-490`); that is fine for display but not an analytics source.
5. **Frontend:** a typed reader in `src/lib/ranked-public/contracts.ts` and a small "Order Forge" panel. Placement is [UNKNOWN] and needs owner design: likely the History / Study Hall ledger. Labels come from the existing `rankedResultsModel.ts:62` / `questionIcons.ts:185` wording.
6. **Public category:** map `order_forge:*` → Items or Champions in `quiz/public_category.py` `FAMILY_TO_CATEGORY` by the family's entity kind. This mirrors Meta Reflex's special case (:606-607). Today it falls to GENERAL (INFERRED).
7. **Not needed:** no new write, no new column, no role copy on the child row (the join is exact), and no PostHog event.

---

## 6. Durable refs and Daily compatibility

### Facts
- **[FACT] The Daily gate does not guard Standard.** `review_contract_gap` (`daily_challenge/wiring.py:198-233`) refuses modules without `declares_child_refs`, but it is reached only via `stage_readiness` (:236-248), for `ASSIGNED_KINDS`, which is `()` (`daily_challenge/run/plan.py:91`). `compose_standard` (`daily_challenge/recipe.py:507-549`) never calls it.
  - Standard V1 is the owner-locked `S S S S MR S S S MR JOURNEY` (`recipe.py:33-57, 139-145`).
  - **The only way into a Daily is a recipe or stage that names the module.** That is the host's decision and is out of scope here.
- **[FACT]** Frontend Daily already hosts `QuizRankedMatch` → `CanonicalArena` (`DailyRunPage.tsx:25,50`). The Daily contract validates stage `kind`, never `module_id` (`src/lib/daily-challenge/run/contracts.ts:181-182`). `orderForgeModule` would render unchanged inside a hosted Daily match (INFERRED from `rendererForSegment` plus the tolerant History parsers).
- **[FACT]** Review / exact-replay requirements:
  - A registered namespace in `discovery._REF_PREFIXES` and in `exact_replay`'s strategy registry. `REPLAYABLE_REF_PREFIXES` is pinned in `test_rr2_current_truth_review.py:980`.
  - A planner branch. Unknown namespaces fall through to `_plan_reflex` (`exact_replay.py:395-397`).
  - The module must accept `module_config.replay_target` (`schema.py:538-575`).
  - Exactly one settled child per Review round (`run/service.py:667-669`).
  - Review re-asks against **current** truth (`exact_replay.py:7-20`).
- **[FACT] Two hidden blockers for an Order Forge Review round:**
  - `_replay_segment_spec` sets no `correct_points` for generated refs (`wiring.py:499-504`), and Order Forge refuses to resolve without it (`order_forge.py:588-595`).
  - The schema requires an explicit `pressure_seconds` for Order Forge (`schema.py:263-292`), and the replay spec sets none.
- **[FACT]** Weak Areas keeps a miss only if its family maps to a quiz authority (`content_sets/authorities.py:32-72`). Order Forge would be dropped even with refs.

### Design [DECISION]
1. **Ship `order_forge` v2 as a new registered version** and keep v1 registered for replay. Versions are pinned (`contract.py:25-27`, `registry.py:1-8`), and `test_order_forge_module.py:79` pins v1's flag.
   - v2 sets `declares_child_refs = True`.
   - The public payload shape is unchanged, so the frontend needs no version change.
2. **Ref namespace `order:`** is added in `discovery.py` with `canonical_ref_for_order_set(family_id, entity_ids)` and `order_key_from_ref`.
   - **Key:** `order:<family_id>|<n>|<id_1>|…|<id_n>`, with entity ids **sorted lexicographically**. The key names the *set*, never the answer. This follows the reflex precedent of sorted sides (`meta_reflex.py:632-633`).
   - `|` is already the reflex card-key separator for the same name ids.
   - A role scope is not part of the key: it only picks the set.
3. **v2 `resolve_segment`** mints the ref from `private["entity_ids"]` for every child, including timeouts. The child `family` is `order_forge:<family_id>`.
4. **Targeted generation:** `generate_segment` accepts `module_config.replay_target.canonical_ref`, and `parse_config` allows that key for v2.
   - It rebuilds exactly those N entities from **current** content and recomputes the order.
   - It fails closed with `RANKED_MODULE_DATA_UNAVAILABLE` if any entity is gone, or the set no longer satisfies distinctness or the gap.
   - The display shuffle is re-seeded from the new match, so a replay is not a memorised card order.
   - This mirrors `meta_reflex._targeted_card` (:914-939).
5. **`exact_replay`:** register `order` → `STRATEGY_GENERATOR` and add an `_plan_order` branch *before* the reflex fall-through.
   - It verifies against current content and returns `module_config={replay_target:{canonical_ref}, family, entry_count, min_gap, reveal_window_ms}`.
   - If the set is no longer valid, it drops the miss as stale.
   - Update the pinned-prefix test.
6. **Fix the two Review blockers inside the wiring, not the module.** `_replay_segment_spec` sets `correct_points=2` and `pressure_seconds=0.0` for `order` refs. These are the preset's values (handoff §OF1-A "Behaviour notes"). Do not add a silent default inside `resolve_segment`, which would break the "no point value nobody chose" rule.
7. **Compatibility:** v2 passes `review_contract_gap`, Time Trial (`challenge_count==1`) and non-mistake-counting rules without any other flag.
   - A host adds it with one `SegmentSpec(module_id="order_forge", module_version=2, challenge_count=1, timer_seconds=30, pressure_seconds=0.0, correct_points=2, module_config={family, role_scope, …})`.
   - **This plan does not insert it into Standard.**
8. **Weak Areas is out of the first V2 (O3).** Tests assert `order_forge:*` misses are *not* Weak Areas candidates.
9. **Daily compatibility certification (O4)** — without touching `recipe.py` Standard: a test composes a synthetic Daily-hosted format containing one v2 `SegmentSpec`, runs it through `review_contract_gap`, schema validation under standard and time-trial rulesets, `create_bot_match(format_override=…)`, settlement, child rows with `order:` refs, and a Review re-ask of the miss. A test also pins `STANDARD_V1_UNITS` unchanged.

---

## 7. Presentation and audio boundary

### Visual [FACT → DECISION]
- **[FACT]** The Viewport mounts inside `CanonicalArena.tsx:663-701` (`ranked-question-body`) under the stage panel. That panel is `.ranked-panel { position:relative; overflow:hidden }` (`src/index.css:720-722`).
  - `ownsSubmission:true` suppresses the answer grid and tray (`:775`).
  - The stage dims to `opacity-60` during `revealHold` (`:652-656`).
- **[FACT]** No ranked-core module has a backdrop yet. The precedent is `CompactScenarioBand.tsx:52, 131-151`: `import academyHall from "@/assets/ranked/academy-hall.jpg"` rendered as `<img aria-hidden class="pointer-events-none absolute … object-cover opacity-40">`.
- **[FACT]** Boundary tests allow a module to import `@/assets/*` and `@/lib/*`, but not `@/pages/**` (`sharedLayer.boundary.test.ts:68-92`). The arena may not name a mode (`CanonicalArena.boundary.test.tsx:192-205`).
- **[DECISION] The visual pass is module-local.** Make `OrderForgeViewport`'s root `relative isolate` and add one `aria-hidden`, `pointer-events-none`, `absolute inset-0 -z-10` `<img src={baseShop}>`.
  - Treatment: `object-cover`, `opacity ~0.18–0.25`, `blur(2–4px)`, `saturate(0.8)`, plus a `bg-gradient` scrim from the stage colour. It supports the cards and never dominates.
  - Scope it to the module box, not the whole panel, so the arena's own chrome is never tinted.
  - No motion on the backdrop. Reduced-motion is therefore unaffected. Card contrast must stay AA over the scrim.
  - **No `CanonicalArena` / `ArenaShell` / `QuizRankedMatch` change.**
- **[FACT]** `base-shop.jpg` is 637×358, a 67 KB progressive JPEG. It is **untracked in the primary checkout only** (`mogsy/src/assets/ranked/`); the implementation branch must add it.
  - [UNKNOWN] Whether a higher-resolution source exists. It is acceptable blurred, but will look soft at 1920 px.

### Audio [FACT]
- The SFX system is on origin/main. Local `main`'s `183ceecd…e882e48a` are older unpushed SHAs of the same work; **do not build from local main.**
- **API:** `useSfx() → { play(event, {eventId}) }`. It dedupes on `eventId` globally (`src/lib/audio/sfx.ts:188-193, 369`).
- **Cues** (`sfx-registry.ts:74-97`): `ranked.answer.lock`, `ranked.answer.correct`, `ranked.answer.incorrect`, `ranked.points.awarded` and others. There is **no reveal, reorder, drag or hover cue** in Ranked.
- **All cues fire at page level.** No module or arena file calls `useSfx`.
  - Lock for segment modules: `useRankedMatch.submitSegmentChallenge` `onAccepted` (`src/pages/quiz-ranked/useRankedMatch.ts:1235-1246`). Today it plays only `ranked.meta.action` for Meta Reflex, so **Order Forge is silent on lock.**
  - Verdicts: `useRankedMatchSfx.observeRankedSfx` has Meta Reflex and Journey per-child branches (:258), and nulls the settlement verdict for segment rounds (:265). **Order Forge has no verdict cue.**
  - SFX2 rule: one cue per settlement. A light verdict per child is allowed while the module keeps the award (the Journey precedent, `2153d4c8`).

### Audio design [DECISION]
- **Lock:** in `submitSegmentChallenge` `onAccepted`, add `order_forge` → `play("ranked.answer.lock", {eventId:\`ranked:${matchId}:segment:${n}:card:0:lock\`})`.
- **Correct / incorrect (reveal):** add an `order_forge` branch in `useRankedMatchSfx`, modelled on Journey.
  - Key it on the first appearance of `ownChallengeReveals[0].orderForge.isCorrect` → `ranked.answer.correct` / `ranked.answer.incorrect`, with `eventId:\`ranked:${matchId}:segment:${n}:card:0:verdict\``.
  - In a bot match the segment usually settles on the lock and the in-viewport reveal is skipped (handoff "Known non-blocking issues" #1). The same branch must therefore also fire once from the settled `segment_reveal.players[viewer].correct` when no own reveal was observed. It uses the **same eventId**, so it never double-fires.
  - Keep `points.awarded` per the SFX2 hierarchy.
- **No sound on reorder, drag or up/down.** There is no precedent in the registry, and the only focus-like cue is Hub navigation.
- **No `useSfx` inside `OrderForge.tsx` or `orderForgeModule.tsx`.**

---

## 8. Implementation sequence (independently assignable)

Each task branches from **origin** trunks (`origin/master`, `origin/main`), never local trunks, and carries its own handoff section.

| # | Task | Repo | Depends on | Size |
|---|---|---|---|---|
| **B1** | **Family authority adapter.**<br>• Inject `content=_meta_reflex_content(cur)` for order_forge.<br>• Add a per-family table `{family_id: (entity_kind, prompt, metric_label, direction_labels, abs_floor, ratio)}` limited to the V2 families in §4.<br>• Generalise the gap predicate and `max_selectable`; use `format_card_value`.<br>• Readiness dispatch per family, and generalise `order_forge_readiness_report.py`.<br>• **Ship as module v2** (v1 untouched). Preset stays on v1 until B4. | BE | — | M |
| **B2** | **Role scope.**<br>• `content_roles` kwarg; `role_scope` config.<br>• Champion filter via `champion_roles`, with the global fallback.<br>• `question_roles` tag; private `role_scope_applied`.<br>• Private `role_selection` diagnostics; deterministic fallback tests. `champion_roles.py` unchanged (O1). | BE | B1 | S |
| **B3** | **Durable refs and replay.**<br>• `order:` namespace; v2 mints refs.<br>• `replay_target` generation; `_plan_order`.<br>• `_replay_segment_spec` points and pressure; pinned-prefix test.<br>• Regenerate the wire-capture fixture. | BE | B1 | M |
| **B4** | **Preset and readiness in production.**<br>• `admin.order_forge` → v2 with a family rotation, one champion `role_scope:"match"` segment, and one item segment.<br>• Run the readiness report against prod (read-only) for **every** candidate family and record it in the handoff.<br>• Enable only families whose report passes (O7); verify the role flag value (O1b). | BE, ops | B1–B3 | S |
| **B5** | **Module stats projection and endpoint** (§5). Read-only, no migration. | BE | — (independent) | S |
| **F1** | **Visual pass:** backdrop plus scrim, module-local, with the asset committed. | FE | — (independent) | S |
| **F2** | **SFX:** lock, verdict with one eventId, and the settled fallback. | FE | — (independent) | S |
| **F3** | **Fixture refresh:**<br>• Consume B3's regenerated `orderForgeServerCapture.json` (a champion family, `"3,200 gold"` strings).<br>• Prove the champion media resolve path.<br>• Confirm no reader change. | FE | B3 | S |
| **F4** | **Module stats reader and panel.** Placement needs an owner call. | FE | B5 | S–M |
| **H1** *(future, owner-gated)* | Put a v2 `SegmentSpec` into a Daily host (a new recipe version or stage), plus `unit_of` / `historyFormat` labels. | BE+FE | B3 | — |

**Deploy order:** the frontend first when a payload changes (F3), then the backend (the handoff rule: old clients throw on unknown shapes). F1, F2 and B5 are order-free.

---

## 9. Files likely touched

**Backend**
- `ranked_modules/order_forge.py`: v2 class, family table, gap predicate, role scope, `replay_target`, refs.
- `ranked_modules/registry.py`: register v2.
- `ranked_public/service.py` (`_generate_segment` ≈:1837): `content`, `content_roles`.
- `ranked_public/readiness.py` (:207-241): per-family dispatch.
- `ranked_formats/schema.py` (:263-296, :2180-2210): config keys, preset v2.
- `ranked_public/discovery.py` (:97-115): `order:` namespace.
- `exact_replay.py` (:125-129, :347-397): `order` strategy and `_plan_order`.
- `daily_challenge/wiring.py` (:495-505): generated-ref points and pressure for `order:`.
- `ranked_public/champion_roles.py`: **read only, not modified** (O1).
- `quiz/public_category.py`: `order_forge:*` mapping.
- `services/ranked_module_stats.py` (new) and `routes/ranked_public.py`: endpoint.
- `order_forge_readiness_report.py`.
- Tests: `test_order_forge_module.py`, `test_order_forge_flow.py`, `test_order_forge_wire_contract.py`, `test_ranked_modules_quiz_parity.py` (registry pin), `test_rr2_current_truth_review.py:980`, and new `test_order_forge_v2_*.py` / `test_ranked_module_stats.py`.

**Frontend**
- `src/lib/ranked-core/modules/orderForgeModule.tsx` (backdrop) or `src/components/interaction-grammar/OrderForge.tsx`.
- `src/assets/ranked/base-shop.jpg` (add).
- `src/pages/quiz-ranked/useRankedMatch.ts` (:1235-1246).
- `src/pages/quiz-ranked/useRankedMatchSfx.ts`.
- `src/lib/ranked-public/__fixtures__/orderForgeServerCapture.json` and its capture test.
- `src/lib/ranked-public/contracts.ts` (module-stats reader only, F4).

**Not touched:** `CanonicalArena*`, `ArenaShell`, `QuizRankedMatch`, timers, `points.py`, `points_view`, migrations, `daily_challenge/recipe.py` (Standard), `role_content.py`, and `meta_reflex_content.py` loaders, which are read, not changed.

---

## 10. Tests and certification

**Backend: new or extended**
- **Per family** (fixture DBs):
  - determinism;
  - strict descending canonical order;
  - pairwise distinct plus gap on the *displayed* integer;
  - fails closed on a thin pool;
  - `max_selectable` equals readiness;
  - public payload passes `assert_pre_reveal_safe` and holds no value, rank or entity id;
  - reveal strings match `format_card_value`.
- **Role:**
  - `role_scope:"match"` picks only champions whose full role set contains the target;
  - the rotation over two roles;
  - fallback to global when the role pool is thin, with the tag set to `()`;
  - `content_roles=None` gives global;
  - item family plus `"match"` is refused by config;
  - replay reproduces the same set.
- **Refs:**
  - v2 child rows carry `order:` refs for correct, incorrect and timeout;
  - the key is set-sorted, so it cannot encode the answer;
  - `_plan_order` rebuilds the same entities and recomputes the order from current data;
  - a stale set is dropped;
  - a Review format containing an `order:` ref **validates and settles** (proves the points and pressure fix);
  - `review_contract_gap` passes for v2 and still refuses v1.
- **v1 regression:** existing v1 matches replay byte-identically, and the v1 wire capture is unchanged.
- **Stats:**
  - counts, accuracy and median over a seeded DB;
  - bots and Daily children excluded;
  - timeouts excluded from timing but counted in attempts;
  - role NULL reported as `"unknown"`;
  - another user's rows are never returned.
- **Prod readiness (ops):** the report output per family is recorded in the handoff before B4 ships.

**Frontend**
- The server-capture test is re-run on the regenerated v2 capture.
- Probe `?q=orderforge` with a champion fixture. Images must resolve.
- Backdrop:
  - `aria-hidden`;
  - no pointer capture (the grip drag and touch scroll e2e still pass);
  - no arena file in the diff;
  - `CanonicalArena.boundary`, `sharedLayer.boundary` and `masterySlice.generic` stay green;
  - the Playwright fit spec (`-g "Order Forge"`) passes at all 10 desktop sizes plus 360×740 and 360×800.
- SFX:
  - lock plays once;
  - the verdict plays once whether it arrives by own reveal or by settlement (same eventId);
  - nothing plays on reorder;
  - `points.awarded` hierarchy per the SFX2 tests.
- Human smoke (owner): an admin preset v2 match on desktop and phone. Screenshots of the champion family and the backdrop go into the handoff.

---

## 11. Explicit non-goals: do not duplicate

- **No second role system.** Order Forge reads frozen `fmt.content_roles` only: no per-request role, no account lookup, no new role table.
- **No item-role relevance.** Items stay global until an authoritative item→role source exists. None does today.
- **No parallel content loaders.** Use the `meta_reflex_content` snapshot; do not re-query `champion_stats` or `item_canonical` from Order Forge.
- **No browser analytics** for answers, and no new write tables. Analytics is a read model over `ranked_segment_child_results`.
- **No partial credit and no module-level grading on the client.**
- **No change to Daily Standard's recipe or cadence.** Hosts decide *when*; that is a separate owner decision (H1).
- **No Weak Areas integration** until the owner decides on non-quiz family authorities.
- **No `CanonicalArena` / `ArenaShell` / `QuizRankedMatch` / timer changes.**
- **No SFX on reorder or drag**, and no `useSfx` inside the module.
- **No editing of shipped v1 semantics.** v2 is a new registered version.
- **No builds from local `main` / `master`.** Both are stale or divergent from origin.

## 12. Dependency graph (authoritative, supersedes §8 "Depends on" column)

- **B1** (v2 module + family table + per-family readiness) → no deps.
- **B2** (role selection) → B1.
- **B3** (`order:` refs, replay, Review wiring, Daily-compat certification) → B1. Independent of B2 (role is not in the ref key), but if both land, B3's replay test must include a role-scoped board → rebase B3 after B2 or add that test in B4.
- **B4** (prod readiness per family, then enable passing families in the preset) → B1, B2, B3, **plus** the ops prerequisites (role flag value; readiness report run).
- **B5** (module stats read model, cohort defaults) → none. Picks up `order:` refs / new families automatically; B3 only enriches it.
- **F1** (backdrop) → none. **F2** (SFX) → none.
- **F3** (fixture refresh / champion media proof) → B3 (and B2 if the capture includes a role board).
- **F4** (stats reader + panel) → B5; panel placement needs an owner call.
- Deploy: F3 before B4 goes live; F1/F2/B5 any order.

## 13. Remaining genuine unknowns

1. Actual value of `RANKED_ROLE_IDENTITY_ENABLED` on production web (ops prerequisite, O1b).
2. Production readiness per candidate family (`max_selectable`, eligible/distinct counts, missing media) — decides the ship set (O7).
3. Whether champion `asset_path`s resolve through the frontend `resolveQuizAssetUrl` like item paths (F3 proves it).
4. Role-pool feasibility per role (e.g. Support/Jungle champion counts at 5% gap) — known only after B4's readiness run; fallback covers it either way.
5. Placement of the module-stats panel in the frontend (F4).
6. Later product decisions, explicitly deferred: Weak Areas inclusion, Standard insertion/frequency/position.
