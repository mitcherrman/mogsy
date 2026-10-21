# COMBAT-V4-PREP — Technical handoff for the Combat Theater prototype

Prepared 2026-10-21 by a read-only discovery pass (Sonnet 5.5). Audience: the Fable 5.1 instance that builds the first Combat Theater prototype.
Nothing in either repo was changed except this file (untracked, not committed). No browser, server, build or test was run.

**Evidence labels used below**
- **[code]** read in source at the stated revision.
- **[fixture]** measured in a committed real-capture response fixture.
- **[unverified]** inferred from code only, or not observed. Treat as a question, not a fact.

---

## 0. Verdict

**Ready for a fixture-driven prototype. Not ready for a live-data one.**

- A complete, authoritative, **timestamped** event stream exists today, but only on the **Team Simulator** endpoint (`/api/combat-lab/team-simulate/v1`). A 1v1 is a legal Team Sim scenario, and real 1v1 captures are committed as fixtures.
- The public 1v1 endpoints (`/api/combat-lab/basic-attack`, `/api/combat-lab/active`) give authoritative defender HP per action and a server clock, but **no per-event timestamps**.
- **No committed fixture contains a non-zero heal, a shield gain, or shield absorption.** Those presentations are unsupported by evidence until a capture is made (§5, §6).
- Build the first prototype from fixtures on an isolated dev-only route (§9). That needs no auth, no credits and no Premium entitlement.

---

## 1. Verified revisions and inspection limits

| Repo | Remote | Default branch tip inspected | Local checkout state |
|---|---|---|---|
| Frontend `mitcherrman/mogsy` | `github.com/mitcherrman/mogsy` | `origin/main` = `2c6dee3269cd80e633fe9d49ab231efd9204c0e4` (2026-10-20 23:02 -0700, "Merge pull request #110 … universal-item-rune-catalog") | `C:\Users\mlmit\OneDrive\Desktop\mogsy` was on `main` @ `0d3fbcbb`, **0 ahead / 726 behind** `origin/main`. This handoff is on new local branch `docs/combat-v4-visual-prep` cut from that stale HEAD. |
| Backend `mitcherrman/League_Combat_Simulator` | `github.com/mitcherrman/League_Combat_Simulator` | `origin/master` = `59aed69618b93a9aa54790dca8720f4c9903b7a8` (2026-10-20 23:31 -0700, "Record the universal roster release") | `…\League_Combat_Simulator` was on `envvis1-batch1-scene-channel` @ `0df11fdc`, **12 ahead / 867 behind** `origin/master`. |

**Method.** Every path and line number below was read from `git archive origin/main` and `git archive origin/master` snapshots, not from the stale local working trees. `origin/*` refs are whatever was last fetched on this machine (their tip dates are 2026-10-20, so they are recent). No `git fetch` was run.

**Do not build from either local checkout.** Cut a fresh worktree from `origin/main` (frontend) and, only if needed, `origin/master` (backend).

**Limitations**
- `gh` is not installed. Frontend open PRs came from the unauthenticated GitHub API through a summarizing fetch tool. It listed 12 open PRs across two chunks, and the last ~50 KB of the response was not read, so the list may be incomplete.
- The backend repo returned 404 to the unauthenticated API (private). Backend open PRs **could not be listed**.
- No live backend was called. Every statement about live 1v1 response shape is [code] only.
- No bundle was built, so §8's isolation claim is import-graph evidence, not a chunk analysis.
- ~370 frontend worktrees and ~278 backend worktrees are registered on this machine. Only the combat-relevant paths were scanned (§7).

---

## 2. Architecture and feature inventory (frontend, `origin/main` 2c6dee32)

### 2.1 The public 1v1 page
`src/pages/CombatLab.tsx` is **8,607 lines** and holds the page, the interactive sandbox, many dev panels and several audit panels in one file. Route `/combat-lab` (`src/App.tsx:620`), not auth-wrapped; the backend enforces credits.

| Concern | Where | Notes |
|---|---|---|
| Page layout | `CombatLab.tsx:3490` `grid gap-3 lg:grid-cols-[29fr_42fr_29fr]` | attacker panel / combat column / defender panel. The combat column is `order-last` below `lg`. |
| Sandbox state | `CombatLab.tsx:2153–2300` `InteractiveSandbox` | owns `state`, `events`, `scopes` (`remaining_by_scope`), `combatTimeline`, `selectedTimelineId`, ranks, target setup, skins |
| Champion / build config | `config: SimulateRequest` in the page (`CombatLab.tsx:728`); stats from `POST /api/combat-lab/build-preview` into `previewBuildStats` / `previewRuntimeStats` (`:2292`) | items / runes / target-profile / summoner metadata from `/api/meta/*` via `combatApi`. Item and rune `capability` is `fully_modeled \| partially_modeled \| noncombat \| not_implemented` (`api.ts:39`). |
| Ability ranks | `abilityRanks` state (`:2207`), mirrored into `attacker_stats` as `*_RANK` | `rankMode`: `sandbox` or `real_match` |
| Action dispatch | `sendStep(kind, action_id, extra)` (`CombatLab.tsx:2810`) | builds the request, calls `combatApi.basicAttack` / `combatApi.active`, applies the response, builds one `CombatTimelineEntry` |
| Action list | `GET /api/meta/combat-lab-actions` plus `groupChampionActions` (`lib/combat-lab/actionGroups.ts`) | |
| Sequencing | **client-side only**: one user click is one HTTP call. State is round-tripped in the request (`buildRequestState`, `CombatLab.tsx:2006`) and re-hydrated by the server (`hydrate_combat_state`). There is no scripted sequence or rotation on the 1v1 page. | |
| Timeline | `combatTimeline: CombatTimelineEntry[]` (`:2178`); selection via `selectedTimelineId` (`:2204`). New casts auto-select (`:2994`). | |
| Timeline strip | `components/combat-lab/CombatTimelineStrip.tsx` (191 lines), `lib/combat-lab/timelineGroups.ts` | presentational. Consecutive identical actions fold into `AA ×7`. **Display-only**; `entries` is never rewritten. Clicking a pill selects its latest member; click again to deselect. |
| Calculation inspector | `components/combat-lab/CalculationInspector.tsx` (353 lines) + `lib/combat-lab/calculationEvidence.ts` (231 lines) | read-only: formula text, collapsed "calculation inputs" table, pipeline stages, shield absorbed, HP before → after |
| Arena shell | `components/combat-lab/CombatArena.tsx` (53 lines) | a `Card` with header and slots. **Not an arena in any spatial sense.** |
| Side panels | `CombatSidePanel.tsx` (`CombatSidePanel`, `MoreSection`, `ConfigRow`) | |
| Champion art | `components/combat-lab/ChampionVisual.tsx` (319 lines) | see §2.3 |
| Defender HP | `defenderHP` memo (`CombatLab.tsx:2683`) → `DefenderHPCard`; red flash via `hpFlash` (`:2724`, 900 ms) | |
| Defeat state | `targetDefeated` (`:2758`) → `ChampionVisual defeated` | |
| Motion | `framer-motion` (`AnimatePresence` / `motion.*` in other panels), Tailwind `animate-in` and `animate-pulse`, CSS `transition` | **No motion library is wired to the HP bar, damage numbers or timeline playback.** `CombatLab.tsx` has no `useReducedMotion`; only global `@media (prefers-reduced-motion)` blocks in `src/index.css` (`:604`, `:661`). |
| Audio | `useSfx()` from `lib/audio/useSfx` | already plays `combat.simulation.resolve` and `ui.feedback.error` |

### 2.2 Team Simulator (separate surface)
- Routes: public `/combat-lab/team-sim`, registered **only if** `VITE_TEAM_SIM_ENABLED` is a true value (`team-sim/featureGate.ts`). Internal alias `/dev/combat-lab/team-sim`, **DEV builds only** (`import.meta.env.DEV`) (`App.tsx:855`).
- Page `src/pages/dev/team-sim/TeamSimPage.tsx` is `lazy()` (`App.tsx:225`). `TeamSimErrorBoundary` is imported eagerly on purpose (see its header comment).
- Client, contract and fixtures: `src/lib/combat-lab/team-sim/` (`contract.ts`, `client.ts`, `playback.ts`, `result.ts`, `draft.ts`, `catalog.ts`, …).
- **An existing playback surface already exists**: `pages/dev/team-sim/components/TeamCombatPlayback.tsx` (750 lines). It has two team lanes on a shared clock, HP bars, a roster, play/pause/reset and a click-to-inspect calculator. It is built on `lib/combat-lab/team-sim/playback.ts`. **This is the closest prior art to Combat Theater.** Read it before designing anything.
- Live use needs backend `TEAM_SIM_ENABLED`, a verified account and Premium or credits, plus an `Idempotency-Key` header ([code]: `contract.ts:46`, fixtures `err_401/402/403/503`).

### 2.3 Art, skins, responsive behaviour
- `useChampionAssets()` (`hooks/useChampionAssets.ts`) fetches the manifest `GET {API}/api/assets/champions` (1 h stale time).
- Available per champion: `getChampionCutout` (transparent PNG), `getChampionSplash`, `getChampionLoading`, `getChampionIcon`, and `getChampionSkins` (`{key,label}[]`, synthetic `"default"` first). `resolveAssetUrl` makes relative manifest paths absolute.
- `ChampionVisual` resolves in the order skin splash → skin loading → default splash → default loading → icon, then falls back to the Supabase `champion_images` bucket. It imports `supabase`, `useAdminAuthority`, `toast` and carries admin upload/remove UI. It declares `ChampionVisualMode = "splash"` and a comment anticipating "transparent cutout, animated video, 3D/WebGL model".
- Skin choice is page state (`attackerSkin`, `defenderSkin`, `CombatLab.tsx:2390/2398`).
- Ability icons: `lib/combat-lab/abilityIcons.ts` (`getAbilityIconUrl(champion, slot)`, `getChampionSquareIconUrl`, `inferActionAbilitySlot`).
- Installed but unused by Combat Lab: `three@^0.169`, `@react-three/fiber@^8.17`. `framer-motion@^12.34` is installed and used elsewhere in the page.

---

## 3. Data contracts

### 3.1 1v1 endpoints (public page)
Frontend types: `src/lib/combat-lab/api.ts`. Backend: `routes/combat_lab.py`.

| Endpoint | Request | Response (after `unwrapInteractive`) |
|---|---|---|
| `POST /api/combat-lab/basic-attack` (`:565`) | `CombatLabBasicAttackRequest`: `champion_name, item_names, rune_names, attacker_stats, target_stats, state, current_time` + optional `target_champion_name/target_level/target_item_names/target_rune_names` + rank fields | `{ok, credits, result:{events, total_damage, remaining_hp, remaining_by_scope, damage_accounting, healing_accounting, attacker_stats, state, target_stats, target_debug}}` |
| `POST /api/combat-lab/active` (`:888`) | `CombatLabActiveRequest`: as above + `active_name, target_scope, piercing_arrow_charge_bonus_percent` | `{ok, credits, events, result:{events, active_damage, remaining_by_scope, damage_accounting, state, target_stats, target_debug, healing_accounting?, shield_accounting?, state_used?}}` |
| `POST /api/combat-lab/build-preview` | `CombatLabBuildPreviewRequest` | build and runtime stats |
| `POST /api/combat-lab/incoming` (`:1502`) | holder stats + `incoming_events` | `damage_taken, damage_prevented, shield_absorbed, hp_before/hp_after, survived`. **Not wired into `combatApi`**; the page never calls it. |

Credits: both action routes call `consume_core_1v1_credit`; a blocked free user gets `{blocked:true, credits}` (frontend throws `CombatLabCreditsExhaustedError`).

**1v1 event shape** (`runtime_effect_registry.runtime_event_to_dict`) [code]: `{type, source, state, description, raw_damage, final_damage, damage_type, metadata, mitigated}`. **There is no `time`, `seq`, actor or target on a 1v1 event.**

**Server clock** [code]: `CombatState.snapshot()` publishes a top-level `current_time` (`combat_state.py:71`). The server advances it once per accepted action (basic attack: `1/FINAL_ATTACK_SPEED`; active: the ability's cast time, else a default). The page stores the post-action snapshot on each entry as `state_snapshot` (`CombatLab.tsx:2984`), so per-action start and end instants (previous and current `current_time`) are recoverable. **[unverified]** against a captured live 1v1 response.

### 3.2 Team Sim endpoint (timestamped)
Types: `lib/combat-lab/team-sim/contract.ts`. `POST /api/combat-lab/team-simulate/v1`.

`TeamSimulationResponse` (`contract.ts:546`): `contract_version, scenario_id, termination{reason,winner,detail}, duration, event_count, events[], effective_builds{id→{level,items,runes,ability_ranks,crit_mode,starting_hp,starting_hp_source,max_hp}}, trace{detail,truncated,compacted,…}, credits, team_summaries, combatant_summaries{id→{alive,death_time,final_hp,max_hp,damage_taken_total,healing_applied,…}}, final_targets, pair_ledger, scheduler_assumptions, unsupported_mechanics[], warnings[]`.

`TeamSimEvent` (`contract.ts:415`): `{seq, time, source, type, actor_id, actor_team, target_id, target_team, action_id, payload, meta, repeats?}`. `source` ∈ `scheduler | kernel | targeting | lifecycle | termination`.

Event families seen in committed fixtures [fixture]:
- `scheduler/action_executed`, `action_failed`, `plan_step_skipped`, `delay`
- `targeting/target_assigned`, `target_changed`
- `kernel/damage_packet`, `champion_ability`, `champion_state_input`, `champion_state`, `champion_modifier`, `champion_stat_modifier`, `champion_passive`, `item_damage`, `rune_damage`, `rune_state`, `rune_counter`, `effect_expired`
- `lifecycle/death`, `termination/terminated`

The kernel type set is **open** (`services/team_simulation_trace.py` header lists more, e.g. `item_shield`, `item_heal`, `rune_heal`, `item_dot`). Unknown types must be tolerated.

**Trace detail levels** (`limits.trace_detail`, `services/team_simulation_trace.py`):

| Level | Keeps | Strips |
|---|---|---|
| `full` | everything | nothing |
| `calculation` | standard + pipeline stages + `formula_text` + `formula_bindings` | repeats folded |
| `standard` (default) | all event families | pipeline intermediates, formula data; all-zero `healing_accounting`; repeated magnitude-free kernel events folded into `repeats` |
| `summary` | `scheduler`, `targeting`, `lifecycle`, `termination` only | all `kernel` events |

**The prototype must request `calculation` or `full`** or the formula and mitigation presentations have no data.

---

## 4. Evidence matrix: what can drive each presentation

Legend: **FULL** = authoritative field present and exercised in a fixture. **PARTIAL** = field exists but is conditional, last-wins, or not exercised. **MISSING** = no backend field.

| Presentation | Source of truth | Fields | Status |
|---|---|---|---|
| **Action playback timeline** (Team Sim) | `scheduler/action_executed` and `action_failed` events | `seq`, `time`, `actor_id`, `target_id`, `action_id`, `meta.executed_time`, `meta.clock_after`, `meta.ok`, `meta.error`, `meta.plan_cursor` | **FULL** [fixture `sim_1v1_trace_full.json`]. Helper: `playback.ts buildPlaybackActions`, `actionSpan`. |
| Action playback timeline (public 1v1) | per-response `state.current_time` deltas | action start = previous `current_time`, end = current | **PARTIAL** [code]. No sub-action timing; events within one action have no instants. |
| **Champion HP animation** | `action_executed.meta.damage_accounting.by_scope.PRIMARY` = the **target's** pool | `hp_before`, `hp_after`, `applied_hp_damage`, `total_applied_hp_damage` | **FULL** [fixture]. Both fighters' HP is reconstructable, each step from the action that hit them. Scale bars with `effective_builds[id].max_hp`, not `starting_hp` (see §7 H5). Final state: `combatant_summaries[id].final_hp/alive/death_time`. |
| HP animation (public 1v1) | response `damage_accounting.by_scope.PRIMARY` and `remaining_by_scope.PRIMARY.{current_hp,max_hp,remaining_pct}` | same | **FULL for the defender** [code]. **The attacker has no HP** on the interactive endpoints. |
| **Damage-number reveal** | `kernel/damage_packet.payload` | `final_damage`, `raw_damage`, `damage_type`, `mitigated`; `metadata.applied_hp_damage`, `metadata.sink_accepted_damage` | **FULL** [fixture]. Overkill is visible: the killing blow in `sim_1v1_trace_full` deals 110.29 but `applied_hp_damage` is 69. Crit shows only as `crit_chance` / `crit_mode: "expected"`; there is **no per-hit crit flag** [fixture]. |
| **Ability effect presentation** | `kernel/champion_ability.payload` | `source` ("Lux Q"), `state` ("CHAMPION_LUX_Q_CAST"), `description`, `damage_type`, `final_damage` | **PARTIAL.** Identity and text are present. There is no animation, projectile, area or duration data; presentation (icon, VFX) is client-side from `abilityIcons.ts`. |
| **Item / rune effect presentation** | `kernel/item_damage`, `rune_damage`, `rune_state`, `rune_counter`, `effect_expired` | `source`, `state`, `description`, `final_damage` | **PARTIAL.** Same limits; not in the 1v1 fixture (appear in 2v2/3v3 fixtures). No item or rune icon id on events. |
| **Animated formula substitution** | `champion_ability.payload.metadata` | `formula_text`, `formula_bindings` {identifier→number}, `formula_status`, `formula_missing_required`, `formula_warnings`, `formula_error`, plus `raw_damage` | **FULL for formula-priced abilities, at `calculation`/`full` only** [fixture `sim_2v2_calculation.json`: Lux Q, `(40 + 40 * P_Q + 0,75 * AP) * MOD_Magic`, bindings `{P_Q:5, AP:0, MOD_Magic:1}`, result `raw_damage:240`]. **Absent** for champion-runtime (Python-priced) abilities and **for all basic attacks**, which have `ashe_attack_model` instead (`ad`, `crit_chance`, `frost_multiplier`…). Absence of `formula_bindings` is the only signal; never fall back to `state_used`. |
| **Mitigation breakdown** | `damage_packet` / `champion_ability` metadata | `raw_damage_before_pipeline`, `effective_armor` or `effective_magic_resist` (also `target_armor_or_mr_used`), `post_mitigation_damage`, `attacker_outgoing_damage_amp_percent` → `post_outgoing_amp_damage`, `target_damage_taken_amp_percent` → `post_amp_damage`, `target_damage_reduction_percent` → `target_damage_after_reduction`, shield trio → `target_damage_after_defenses` → `damage_after_modifiers` | **PARTIAL.** Stage sequence is present. **Penetration / lethality inputs (base armor → pen → effective) are not in the fixture metadata**, only the resulting `effective_*`. See hazard H1. Existing consumer: `calculationEvidence.pipelineStages()`. |
| **Shield transitions (absorbing damage)** | `damage_packet.metadata` | `target_shield_before`, `target_shield_absorbed`, `target_shield_after`, `target_shield_key`, `shield_absorbed` (typed + untyped), `target_typed_shield_absorbed` (`scoped_damage_application.py:631–669`) | **PARTIAL.** Fields present in every packet, but **every value is 0 in all committed fixtures** [fixture]. No exercised case. |
| **Shield gain** | 1v1 `/active` `result.shield_accounting` `{shield_generated, shield_applied, shield_before, shield_after, source_scope, target_scope}` (`shield_runtime.build_shield_accounting`); event `type:"shield"` | | **PARTIAL.** The route keeps only the **last** event carrying the block (`combat_lab.py:1378–1382`). No fixture in either surface. Self-targeted (`source_scope`/`target_scope` = `SELF`). |
| **Healing transitions** | `action_executed.meta.healing_accounting` (Team Sim); 1v1 `result.healing_accounting` | basic-attack lifesteal/omnivamp block: `total_applied_healing, lifesteal_percent, omnivamp_percent, lifesteal_heal, omnivamp_heal, total_raw_heal, contributions[]`. Ability heals (`healing_formula.build_healing_accounting`): `healing_applied`, `overheal`, `hp_before`, `hp_after`. | **PARTIAL.** Shapes known, **zero non-zero examples in any committed fixture** [fixture]. Last-wins on `/active`. At `standard` trace level all-zero blocks are dropped. |
| Death / end | `lifecycle/death`, `termination/terminated`, `combatant_summaries` | `death_time`, `cause_actor_id`, `cause_action_seq`, `termination.winner` | **FULL** [fixture] |

**Never infer** HP, damage or timing. Every value in §4 is read off the wire. The existing modules (`calculationEvidence.ts`, `playback.ts`) already state this rule; keep it.

---

## 5. Existing capabilities to reuse (do not re-derive)

1. **`lib/combat-lab/team-sim/playback.ts`** is pure TypeScript with type-only imports from `contract`. It exports `buildPlaybackActions`, `actionSpan`, `primaryHp`, `formulaDiagnostics`, `pipelineStages`, `shieldAbsorbed`, `pipelineEventFor`, `isChampionRuntimeAction`, `hasNoFormulaEvidence`, `humanizeActionId`. Tests: `playback.test.ts`.
2. **`pages/dev/team-sim/components/TeamCombatPlayback.tsx`** is the reference for lane layout, clock, HP bars and calculator sync.
3. **`lib/combat-lab/calculationEvidence.ts`** is the 1v1 analogue (`primaryHp`, `formulaEvidence`, `pipelineStages`, `shieldAbsorbed`).
4. **`lib/combat-lab/team-sim/__fixtures__/`** holds real captures (see header of `__fixtures__/index.ts`; provenance statement: "captured by driving the actual routes in-process"). Index: `sim_1v1_trace_full.json` (Ashe vs Garen, 7 basic attacks, 8.34 s, death, `trace.detail:"full"`), `sim_2v2_calculation.json` (Lux Q/E with `formula_bindings`), `sim_3v3/4v4/5v5.json`, `sim_1v1_action_failed.json`, plus matching `*.request.json`.
5. **Art:** `useChampionAssets` + `getChampionCutout/Splash/Skins` + `abilityIcons.ts`.
6. **`useSfx`** and `framer-motion` (installed).
7. **Timeline folding rule** in `timelineGroups.ts` if a compact mode is wanted.

---

## 6. Gaps preventing visual playback

1. **No non-zero heal or shield exemplar** anywhere in committed fixtures. Healing, shield-gain and shield-absorb presentations cannot be validated until one is captured (a Soraka heal, a Lux E shield, or an item shield in a Team Sim run). Soraka appears in `sim_2v2*.json` but executes no heal.
2. **No real 1v1 (`/active`, `/basic-attack`) response fixture in the frontend.** `CalculationInspector.test.tsx` uses synthetic events. Real shapes are only in backend tests (`engine_tests/test_combat_lab_action_endpoint.py` etc.; not opened).
3. **1v1 events carry no instants or actors.** Sub-action ordering (ability, then on-hit, then proc) is list order only.
4. **Formula data requires `calculation`/`full` trace detail** on Team Sim, and is absent for basic attacks and Python-priced abilities.
5. **No spatial or animation data of any kind.** Positions, ranges, projectiles, hit times inside a cast, and cast-vs-impact timing do not exist. `clock_after − executed_time` is the action's occupied span, not a wind-up.
6. **No per-hit crit flag**; crit is expected-value only (`crit_mode:"expected"`).
7. **Live Team Sim is gated** (feature flag + verified account + Premium/credits + idempotency key). A live-data prototype needs auth plumbing the dev route does not have.
8. **Attacker HP does not exist on the public 1v1 endpoints**, so a two-sided 1v1 duel animation needs Team Sim data or the unwired `/incoming` route.

---

## 7. Hazards found (verify before trusting)

- **H1: "Raw damage" mislabel for basic attacks. [fixture]** In `sim_1v1_trace_full.json`, Ashe's basic attack (seq 3) has `payload.raw_damage = 192.84`, `final_damage = 110.29`, `mitigated: true`, `effective_armor: 74.855`, but `metadata.raw_damage_before_pipeline = 110.29` (equal to the *post*-mitigation value). For Lux Q the same key is correctly `240` (pre-mitigation). `calculationEvidence.pipelineStages()` labels that key "Raw damage", so for basic attacks the existing inspector would show 110, not 193. Use `payload.raw_damage` for the pre-mitigation figure on basic attacks and **ask the backend owner** before presenting a "before armor" number.
- **H2: Decimal comma in `formula_text`. [fixture]** Real capture: `(40 + 40 * P_Q + 0,75 * AP) * MOD_Magic`. Unit-test fixtures use `0.8`. Display `formula_text` verbatim; **do not parse or evaluate it** to animate substitution. Substitute from `formula_bindings` only, and take the result from `raw_damage`.
- **H3: 1v1 timeline `hp_after` is computed client-side. [code]** `CombatLab.tsx:2950` `hpAfter = hpBefore - Σfinal_damage`. The authoritative value is `damage_accounting.by_scope.PRIMARY.hp_after` (`primaryHp()`). They disagree on overkill, shields and multi-scope.
- **H4: 1v1 timeline `shield_absorbed` is probably always 0. [code, unverified at runtime]** The page reads `ev.shield_absorbed` at event top level (`CombatLab.tsx:2941`); the backend writes it into `event.metadata` (`scoped_damage_application.py:655/669`). Use `calculationEvidence.shieldAbsorbed()`.
- **H5: Bar scale. [fixture]** `effective_builds.A1.starting_hp = 900`, `max_hp = 1496.275`. Use `max_hp` for the bar and `starting_hp` for the initial fill.
- **H6: `shield_absorbed` has two meanings.** `target_shield_absorbed` is untyped only; `shield_absorbed` is untyped + typed (`scoped_damage_application.py:652–669`).
- **H7: `PRIMARY` scope in Team Sim** is the *target's* pool for that action, not a team. [fixture: A1's attack shows `400→290`, which is B1's HP.]
- **H8: Last-wins healing/shield on `/active`** (see §4). Multi-effect casts under-report.
- **H9: The `death` event's `target_id`/`actor_id` pairing** appears to mean victim = `target_id` (matches `combatant_summaries.B1.death_time`). [fixture, single case]. Confirm with `combatant_summaries[*].death_time` rather than relying on it.
- **H10: Stale local checkouts** (§1) and a very large worktree count. Always branch from `origin/main`.

---

## 8. Team Simulator relationship and bundle isolation

**Can an isolated prototype avoid pulling Team Sim into the public 1v1 page? Yes** [code, import graph; no build run].

- `CombatLab.tsx` imports exactly one thing from `team-sim`: `isTeamSimPublicRouteEnabled` and `TEAM_SIM_ROUTE` from `featureGate.ts` (`CombatLab.tsx:59–64`), a tiny dependency-free module. Grep for other `team-sim`/`TeamSim` references in `CombatLab.tsx`, `components/combat-lab/*` (except `TeamSimErrorBoundary`) and `lib/combat-lab/*.ts` found only comments.
- `TeamSimPage` is `lazy()`; its subtree (`pages/dev/team-sim/**`) is the only large importer of `lib/combat-lab/team-sim/*`. Other importers of `team-sim` are small gate/registry files (`lib/premium/matrix.ts`, `lib/admin/admin-registry.ts`, `lib/auth/anonymous-identity.ts`, `lib/interaction-grammar/featureGate.ts`, `lib/pro-play/worldsExperience/productionGate.ts`), which almost certainly import only gate constants. **Not opened; check the import lines.**
- Safe to import into a prototype: `team-sim/playback.ts` and `team-sim/contract.ts` (type-only imports), `__fixtures__/*.json`.
- **Avoid importing:** `TeamCombatPlayback.tsx` (pulls `result.ts` formatters and UI), `team-sim/hooks.ts` and `client.ts` (network, auth, idempotency), `ChampionVisual.tsx` (Supabase, admin authority, upload UI).
- Confirm with `npx vite build` and a chunk report after the prototype exists (not run here).

---

## 9. Proposed isolated prototype boundaries

Follow the existing DEV-only lab precedent (`App.tsx:308`, `CombatEstimateLab`, `PerfectTimingDemo`):

```
src/App.tsx   (2 small hunks)
  const CombatTheaterDev = import.meta.env.DEV
    ? lazy(() => import("./pages/dev/combat-theater/CombatTheaterDev")) : null;
  {CombatTheaterDev ? <Route path="/dev/combat-theater" element={<Suspense fallback={<RouteFallback />}><CombatTheaterDev /></Suspense>} /> : null}

src/pages/dev/combat-theater/        (new; route page and fixture loader)
src/components/combat-theater/       (new; presentational components)
src/lib/combat-theater/              (new; pure adapter: TeamSimulationResponse → TheaterFrame[])
```

Rules for the first prototype:
- **Read-only consumers.** The adapter may import `team-sim/playback.ts` / `contract.ts` and read fixtures. It must not import `pages/CombatLab.tsx`, `TeamSimPage`, `hooks.ts`, `client.ts` or Supabase code.
- **Do not edit** `CombatLab.tsx`, `ChampionVisual.tsx`, `CombatTimelineStrip.tsx`, `CalculationInspector.tsx`, `calculationEvidence.ts`, any `team-sim/` file, `useChampionAssets.ts`, or shared `ui/*`. Wrap or copy a few lines instead.
- **No backend change.** Use committed fixtures; no network, no credits, no auth. A DEV build strips the route from production by dead-code elimination (same mechanism as `isTeamSimDevRouteEnabled`).
- Art: call `useChampionAssets()` and `getChampionCutout/Splash` directly. If the manifest is unreachable (no backend URL in dev), fall back to the glyph, as `CalculationInspector.test.tsx` does.
- Honour `prefers-reduced-motion` from day one (not currently handled in `CombatLab.tsx`).
- A later promotion to a public route is a separate decision and should reuse the `VITE_*` flag pattern in `featureGate.ts`. Not in scope for the prototype.

---

## 10. Collision-risk and ownership matrix

"Churn" = commits on `origin/main` touching the path since 2026-09-21.

| Path | Used by | Risk for the prototype | Evidence / owner |
|---|---|---|---|
| `src/App.tsx` | every route | **High** (hot file, merges constantly). Keep the edit to the two hunks above and rebase just before opening a PR. | 726 commits of drift on the stale local `main` |
| `src/pages/CombatLab.tsx` | public 1v1 | **Do not touch.** 7 commits in 30 days; last 2026-10-20 (Gunblade UI, universal item/rune catalog, PRs #109 and #110, both merged). Stale unmerged branches `codex/sh11a/11b/12/13`, `sc-rename1-phase1`, `dcmod/d-hub` each touch it. | worktree scan of the registered worktrees |
| `components/combat-lab/ChampionVisual.tsx`, `ChampionProfile.tsx` | public 1v1 | Avoid. Unmerged branch `own1.1/s1-int2` (1 commit, worktree `mogzy-wt/own11-int2-fe`, last commit 2026-10-09) touches both. Last change on `origin/main`: 2026-10-08 OWN1.1. | |
| `hooks/useChampionAssets.ts` | Combat Lab, Team Sim, quiz | Read-only dependency. Last change 2026-09-19. | |
| `lib/combat-lab/team-sim/**`, `pages/dev/team-sim/**` | Team Sim | Read-only dependency. Changed by SIM2 phases; covered by `combat-gunblade-capability.yml`. | |
| `lib/combat-lab/api.ts` | public 1v1 | Read-only (types). | |
| `.github/workflows/combat-gunblade-capability.yml` | CI | A PR touching `src/lib/combat-lab/team-sim/**` triggers it; a purely new-directory prototype does not. | |
| Backend `routes/combat_lab.py`, `services/combat_action_result.py`, `scoped_damage_application.py`, `team_combat/*` | production | **Do not touch.** Production is actively used; last combat-route change `e3df29e8` (2026-10-20 live-rune accuracy). | |

**Open frontend PRs** (partial list; see §1 limitation): #111 `academy/seamless-hud`, #108 `fix/stat-check-final-verdict-20261019`, #106 `fix/interaction-labs-pt-portal-assertion`, #105 `ranked/queue-paused-unavailable`, #104 `worlds26/quiz-frontend`, #95 `academy-core/hover-to-front`, #81 `ui/ranked-coming-soon-combat-beta-20261019`, #76, #59, #49, #46, #45.
Only **#81** has "combat" in its name; its diff against `origin/main` touches 9 files (`FeatureRibbon`, `AcademyHubBook`, `LeaguecraftHub`, `RankedLobbyHero`, `LolHub`, handoff doc) and **none** under `combat-lab` / `CombatLab`. The other eleven were judged by title and branch only; no diff was read.
**Backend open PRs: unknown** (private repo).

**Active worktrees of interest** (registered on this machine): `C:\Users\mlmit\mogsy-gunblade` and `C:\Users\mlmit\mogsy-universal` (branches fully merged into `origin/main`), `mogzy-wt/ce1-fable`, `ceg1-grading-audit`, `ce-collapse` (Combat *Estimate*, a different feature), `mogzy-wt/ph4c` (Patch Hub → Combat Lab handoff link). One dirty worktree (`.worktrees/jlib-admin-placement`) has staged deletions of combat-named docs/e2e files; not related.

---

## 11. Tests and commands

All frontend commands below run without a browser.

```bash
# unit / component tests (jsdom, no browser)
npx vitest run src/lib/combat-lab src/components/combat-lab src/pages/CombatLab
npx vitest run src/lib/combat-lab/team-sim/playback.test.ts
npx vitest run src/pages/dev/team-sim/components/TeamCombatPlayback.test.tsx
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npx vite build         # production bundle compile (this is what CI runs)
```
- CI reference: `.github/workflows/combat-gunblade-capability.yml` runs `vitest` on `api.capabilities`, `CombatLab.gunblade/roster/content/actionFeedback`, `team-sim/catalog` and then `npx vite build`.
- Existing combat tests of note: `CalculationInspector.test.tsx`, `actionGroups.test.ts`, `combatResult.test.ts`, `timelineGroups.test.ts`, `team-sim/playback.test.ts`, `team-sim/trace.test.ts`, `TeamSimPage.*.test.tsx`.
- **There is no Playwright spec for Combat Lab.** `e2e/` has only `combat-battles.spec.ts` (a different feature) and the Combat Estimate specs. Configs: `playwright.config.ts` (starts `vite --mode e2e --port 8080`, needs a disposable backend via `global-setup.ts`), `playwright.frontend.config.ts` (`npm run test:e2e:frontend`).
- Backend tests (not run): `engine_tests/test_combat_lab_action_endpoint.py`, `test_combat_lab_characterization.py`, `test_combat_lab_execution_equivalence.py`, `test_damage_accounting_contract.py`, `test_combat_lab_simulation_clock.py` (root). Specs: `docs/SIM2_PHASE*.md`, `docs/CS2_PHASE1.md`, `docs/CS2_PHASE2.md`, `docs/COMBAT_PRODUCT_HANDOFF.md`.

**Browser rules (mandatory, `AGENTS.md` in both repos, enforced by both `CLAUDE.md` files).**
- **Never** drive local Microsoft Edge or installed Chrome (no `channel: "msedge"/"chrome"`, no `executablePath`, no headed runs, no personal profile).
- Browser, screenshot and viewport matrices run on **GitHub Actions**. A local bundled headless Chromium run needs **explicit per-run user authorization** (state browser, machine, case count, whether windows can open), one worker, bounded cases, `try/finally` cleanup, no blanket `taskkill`.
- Check `PW_CHANNEL`-style env vars before any Playwright command.
- This also means the in-app or Chrome browser tools should not be pointed at a local prototype without asking first.
- No Docker. No Lovable publish, deploy or merge without explicit instruction.

---

## 12. Recommended first working prototype scenario

**Scenario A (build this first): Ashe vs Garen, 1v1 duel, from `sim_1v1_trace_full.json`.**
- Why: committed real capture; `trace.detail:"full"`; 30 events; 7 basic attacks alternating A1/B1 from t=0 to 8.34 s; both HP lines (A1 900 → 704.4 of max 1496.3; B1 400 → 0 of max 1549.95); a death at 7.16 s; a termination with winner. It exercises timeline, HP animation, damage numbers (including an overkill on the killing blow), the mitigation stages and a death state, using **only FULL-status fields**.
- Drive: `buildPlaybackActions(fixture)` for actions and `primaryHp()` per action. Damage packets from `kernel/damage_packet` matched to the action by `action_id` and `time`.
- Mitigation panel: use `payload.raw_damage` → `effective_armor` → `final_damage` and the shield trio (zeros), noting H1.

**Scenario B (second milestone): add formula substitution from `sim_2v2_calculation.json`.** Filter to the Lux Q action (`formula_text` + `formula_bindings`, result `raw_damage: 240`, then 166.4 after 44.2 MR). Render the full 2v2 only if cheap; a pair filter is enough.

**Defer until a capture exists:** healing, shield gain, shield absorption (§6.1). Ask the backend owner for a Team Sim request that produces them (Soraka heal, Lux E shield) captured at `trace_detail:"full"`, then add it to `__fixtures__/` in a separate PR.

**Prototype acceptance (suggested):** deterministic replay of Scenario A from the fixture at 1x/2x/pause/scrub; HP bars animate between `hp_before` and `hp_after` only; every number on screen traceable to a named field; `prefers-reduced-motion` respected; `vitest` coverage for the adapter; `vite build` still clean; `/combat-lab` bundle unchanged.

---

## 13. Not verified, ask or check first

1. Whether `/api/combat-lab/active` events ever carry a `time`-like field (the frontend `getEventTime` accepts `time|t|timestamp`). Check a real response.
2. Whether `state.current_time` is present on every live 1v1 response (code says yes).
3. H1: whether the basic-attack `raw_damage_before_pipeline` equality is intended.
4. Backend open PRs and in-flight branches (private repo; `gh` unavailable).
5. The five small gate files in §8: confirm they import only constants.
6. Whether `Idempotency-Key` plus feature-flag plumbing is wanted at all for a later live-data Theater.
