# PT0 — Perfect Timing Architecture Audit

**Status:** Read-only audit. Nothing was implemented.
**Date:** 2026-10-15
**Audited heads:**

| Repo | Ref | SHA |
|---|---|---|
| Frontend `mitcherrman/mogsy` | `origin/main` | `8afb0ea2` (Merge PR #36) |
| Backend `mitcherrman/League_Combat_Simulator` | `origin/master` | `9fc8a034` (Merge PR #31) |

Both heads were checked out clean from the remote; the local `main` checkout of the frontend was 327 commits behind and was not used. Backend paths below are relative to the backend repo root and prefixed `BE:`. Frontend paths are relative to this repo.

The companion document, [PERFECT_TIMING_HANDOFF.md](PERFECT_TIMING_HANDOFF.md), turns these findings into assignable work packages. Read this one for the evidence and that one for the tasks.

---

## 0. Summary

1. **The cooldown data needs no new source.** `champion_abilities.cooldown` is the canonical, wiki-verified progression. The live quiz generators already use an eligibility gate (`classify_cooldown`) that rejects most of the cases that would make a timing question wrong. Perfect Timing can build certified questions from it. It must add three exclusions on top of that gate: the reviewed hold list, static/conditional cooldowns, and rows without a per-row wiki revision stamp.
2. **Ranked transport forbids what this mode needs.** Ranked deliberately never accepts client timing. The frontend contract says a module never "measures timing" (`src/lib/ranked-core/modules/types.ts:34-36`). The backend rejects `response_ms`/`submitted_at` from the client (`BE:ranked_modules/mastery_slice.py:1992-1997`). A Perfect Timing answer is a client-measured duration, so putting it into Ranked is a trust decision for the owner. It is not a plumbing task.
3. **There is a precedent for the owner-only playtest.** The owner-only Numeric Lab uses three pieces:
   - a backend admin router behind `require_admin` plus a default-off env flag;
   - a frontend page under `AdminRoute`;
   - a lab-local `ModuleRenderer` mounted in the real `CanonicalArena` (`CombatEstimateArena.tsx`).

   That combination ships a mode to production for the owner only. It needs no Ranked transport change, no DB write, no migration, and no change to any existing mode.
4. **Decision (see §8):** Phase 1 builds a "Perfect Timing Lab" on the Numeric Lab pattern. A Ranked `RoundModule` is deferred until the owner decides how much client timing to trust.
5. **No timing engine exists.** Nothing in the frontend measures a player-controlled interval: there is no stopwatch, no `visibilitychange` handling for a running interval, and no double-tap guard. PT2 builds it from scratch.

---

## 1. Existing game-mode architecture (frontend)

### 1.1 Layering
Documented in `docs/MIG1_INTERACTION_GRAMMAR_HANDOFF.md` §3–4 and confirmed against the code:

```
backend RoundModule → ModuleRenderer (+ registry) → Interaction Grammar primitive → CanonicalArena (ArenaViewModel)
```

### 1.2 `ModuleRenderer` contract
`src/lib/ranked-core/modules/types.ts`:
- **`ModuleSegmentActions`** (38-55): `submitChallenge(challengeIndex, choice: SegmentChoice) => void | Promise<boolean>`, plus `busy` and `error`.
- **`ModuleViewportProps`** (58-126): `publicRound`, `selection`, `permissions`, `onSelect`, `segmentState`, `actions`, `skewMs`, and optional `reveal`, `feedback`, `surfaceVerdict`, `surfaceSettings`, `entryPresentationMs`.
- **`ModuleRenderer`** (133-181): `moduleId`, `moduleVersion`, `servesVersion?`, `ownsSubmission`, `ownsResultReveal?`, `Viewport`, `projectQuestion`, `summaryLabel`.
- **Lines 34-36 (verified):** *"A module NEVER advances its own index, decides correctness, or measures timing."*

### 1.3 Registry
- `src/lib/ranked-core/modules/registry.ts:33-49` holds the `RENDERERS` map. Its keys are `quiz`, `item_cost_duel`, `mastery_slice`, `order_forge`, `reconstruct`, `match`, `assembly` and `scrub`.
- An unknown id or version returns `null`, and the arena then fails closed with an "unsupported module" panel (`src/components/ranked-arena/CanonicalArena.tsx:823-834`).
- The id list is pinned in two tests: `registry.test.ts:27-28` and `src/pages/dev/interaction-lab/InteractionLab.test.tsx:140`.
- **Phase 1 adds nothing to this registry.**

### 1.4 `CanonicalArena`
- File: `src/components/ranked-arena/CanonicalArena.tsx`.
- It mounts the renderer's `Viewport` in the question stage (774-812). It suppresses the generic result overlay when `ownsResultReveal()` is true (819-820).
- Its input type is `ArenaModuleSurface` (`src/lib/ranked-core/arenaView.ts:263-327`).

### 1.5 Lab-local renderer: the reuse path
`src/components/combat-estimate/CombatEstimateArena.tsx` (verified at 64-100) has three parts:
- `LAB_RENDERER`, with `ownsSubmission: true` and `ownsResultReveal: () => true`;
- `STAGE_PUBLIC_ROUND`, an inert frozen `PublicRoundView` that pulls in no fixtures;
- placeholder combatant rails.

It mounts the real `CanonicalArena` with no change to the registry or the transport. **Perfect Timing Phase 1 copies this pattern.**

### 1.6 Interaction grammar
- Types are in `src/lib/interaction-grammar/types.ts`:
  - the `*Public` / `*Reveal` / `*Response` type boundary;
  - `InteractionPhase = "open" | "locked" | "revealed"` (33);
  - `SubjectMedia` (36);
  - `EstimateReveal` (518-554), whose verdict and error block (`exact|under|over`, signed, absolute and relative error) is the closest existing shape to a timing reveal.
- Primitives are in `src/components/interaction-grammar/`: Chronoscope, DataDuel, EstimateBeam, GlyphPress, OrderForge, PositionalAssembly, Rangefinder, Reconstruct, StatDrop.
- `shared.tsx` exports `SubjectArt`, `EvidencePlate` and `SuspenseDots`, which can be reused.

### 1.7 Reveal and grading display
- Generic result components live in `src/components/ranked-arena/`: `QuestionResultOverlay`, `RevealPanel`, `SegmentResultBeat`, `CardResultBeat` and `MatchOverFrame`.
- Results screens are in `src/components/game-results/` (`GameResultsShell`, `ResultHero`, `ResultStatGrid`, `ResultTimeline`, `useCountUp`).
- **The client never grades**; every module renders the verdict the server sends.

### 1.8 Pre-reveal leak guard (frontend)
- `src/lib/ranked-public/contracts.ts:1650-1730` defines `_FORBIDDEN_SEGMENT_KEYS` and `assertSegmentIsPreRevealSafe`.
- This applies only on the Ranked path. Phase 1 needs its own guard in the lab API parser instead (see the handoff, PT4).

---

## 2. Cooldown data authority (backend)

### 2.1 Canonical store
**`champion_abilities.cooldown`** in SQLite `lol_calc.db` is the canonical store.
- Schema: `BE:init_wiki_tables.py:25-40`.
- Values are text progressions such as `"140 / 120 / 100"`.
- **Ownership contract** (verified): `BE:services/canonical_cooldown.py:1-60`.
  - Canonical owns the *base cooldown progression*.
  - The simulator owns forms, resets, refunds, recasts, charges and per-target gates.
  - 43 abilities are held back in `BE:fixtures/dc1_sim2_cooldown_ownership.json` (top-level keys `holds`, `released`, `contract`, …).
- **Additional columns:**
  - `cooldown_is_static` and `cooldown_is_static_basis` (`BE:migrate_add_ability_cooldown_static.py`);
  - `max_charges`, `recharge_time`, `per_target_cooldown` and `charge_semantics_basis` (`BE:migrate_add_ability_charge_model.py`);
  - per-row provenance `authority_source_url`, `authority_revision_id` and `authority_verified_at` (`BE:services/canonical_ability_facts.py:86-94`).
- **Readers:**
  - `get_ability_facts(champion, slot, db_path=None)` (`BE:services/canonical_ability_facts.py:196`), which raises on a missing row and never returns a zero;
  - `resolve_cooldown` (`BE:services/canonical_cooldown.py:187`);
  - `load_ability_rows(conn)` (`BE:quiz/ability_question_eligibility.py:441`).
- **Allowed rank counts:** 1, 3, 4, 5 or 6 values. Elise R, Karma R and Nidalee R have 4; Jayce, Udyr, Aphelios and Yuumi Q have 6.

### 2.2 Second store: do not use for questions
`champion_ability_formulas` (`formula_type='cooldown'`) is the simulator's formula. Its source is `BE:champion_ability_canonical/data/formulas.jsonl`, with tiers VERIFIED, INHERITED and UNRESOLVED. 112 of 688 abilities have drifted from the canonical store.

### 2.3 Source policy (verified)
- `BE:docs/source_authority.md:20-35`: Data Dragon "must not be called, imported, registered, mocked, or used as a fallback anywhere in Mogzy".
- The wiki is the authority for values, and patch notes are the authority for patch identity.
- **Perfect Timing must not use DDragon `cooldownBurn` or anything similar.**

### 2.4 Existing eligibility gate
Verified in `BE:quiz/ability_question_eligibility.py`.

`classify_cooldown(row, gates)` (280) blocks:
- dual-form names;
- secondary gates (`has_secondary_gate`: charge columns or `load_secondary_gates()`);
- non-standard rank counts and unparseable rows;
- all-zero rows.

It also drops individual ranks whose value is 0.

`classify_cooldown_haste` (307) additionally blocks static cooldowns.

The live generator wires it up as `gates = load_secondary_gates()` and then `classify_cooldown(row, gates)` (`BE:quiz/generate_ability_cooldown_family.py:201-212`). This already drives the live families `ability_cooldown_rank`, `ability_cooldown_flat` and `ability_cooldown_compare`.

### 2.5 Cases the gate does not fully cover
Perfect Timing must exclude these as well. Not every cooldown is a simple per-rank number:

| Case | Example (from `BE:audit/champdata_p11_cooldown_ledger.csv`, 2026-09-07) | Why it breaks a timing question | Exclusion |
|---|---|---|---|
| Form-dependent | Jayce Q `16/14/12/10/8/6`, formula `IF(Form; 18-2*P_Q; 8)`; Nidalee W; Elise E; Kayn E; Kled Q | The column holds one form only | Ownership `holds` (B_SIM_RICHER) |
| Attack-speed, level or stack scaling | Yasuo Q `4/4/4/4/4` ("4 – 1.33 based on bonus AS"); Zeri Q `0/…`; Veigar W; Aphelios R (based on level) | No single true duration | `cooldown_is_static = 1` and the 2F shape `CONDITIONAL` |
| Ammo / charges | Teemo R `0.25` gate vs 35/30/25 recharge; Corki R `2` vs 20; Kalista W `30` vs 90…50 | The column is only the inter-cast gate | Already blocked by `has_secondary_gate` |
| Unknown or defective authority | Aphelios Q ("authority publishes no cooldown"); Lissandra E (AUTHORITY_DEFECT) | Not certifiable | Ownership `holds` (E_UNKNOWN) and 2F shapes `UNVERIFIABLE`/`AUTHORITY_DEFECT`/`NONE` |
| Rank-zero entries | Urgot W `12/9/6/3/0` | Rank 5 is not a cooldown | `classify_cooldown` drops rank 5 |
| Ultimate haste, resets, refunds, "starts on cooldown" | — | Runtime-only; not modelled (`ULTIMATE_HASTE` is unread, `BE:ability_cooldowns.py:99-104`) | Ask about the *base* cooldown only, with 0 haste |

The 2F shape fixture is `BE:fixtures/dc1_phase2f_cooldown_authority.json`, with keys `abilities` and `provenance`. Its counts are RANK_PROGRESSION 493, RANK_INVARIANT 156, STATIC 13, CONDITIONAL 9, UNVERIFIABLE 7, NONE 5, STATIC_SECONDARY 4 and AUTHORITY_DEFECT 1.

**Conclusion:** certified timing questions *can* be generated from the existing store with no new data source. Use the canonical row, filtered by `classify_cooldown` with the secondary gates, minus ownership holds, minus `cooldown_is_static`, restricted to 2F shapes `RANK_PROGRESSION` and `RANK_INVARIANT`, and requiring a non-null `authority_revision_id`. Ask at 0 ability haste.

### 2.6 Patch identity
- **`champion_abilities` has no patch column.** Freshness is per row, through `authority_revision_id` and `authority_verified_at`.
- `resolve_canonical_patch()` (`BE:knowledge_engine/patch_identity.py:225`) returns the latest closed-successful Patch Ops operation. When there is none, it falls back to the newest ingested patch notes and labels the result `patch_notes_ingestion_fallback`.
- `latest_reconciled_patch()` (187) always returns `None`.
- In `authority.json`, the `patch` field is the patch that *last changed* a value. It is not the current patch.
- **Unknown:** which patch production last closed. `26.20#1` stopped at FAILED_AUTHORITY according to the backend's `docs/PATCH_HUB_PHSR5_FRESHNESS_HANDOFF.md`.
- The Perfect Timing UI must therefore label its data with `resolve_canonical_patch()`'s label *and* its `source`. It must not show a bare "Patch 26.x" claim.

### 2.7 Ability haste
- The shared primitive is `haste_to_cooldown_multiplier(h) = 100/(100+h)` (`BE:calculate_cooldown.py:7`).
- Copies exist in `BE:mastery/calculations/cooldown.py:16,22` and in several quiz modules.
- The precision families are `cooldown_with_haste` at 2 dp and `summoner_spell_cooldown` at 1 dp (`BE:mastery/questions/precision.py:122-133`, verified).
- **Phase 1 is haste-free.** A haste variant (Phase 2) must use `classify_cooldown_haste` and the shared primitive, and must never re-derive the formula.

### 2.8 Existing APIs
- `GET /api/docs/champions/{slug}/abilities` (`BE:routes/docs.py:567`) returns `cooldown {raw, by_rank}`, `cooldown_is_static`, the charge fields and the formulas.
- The frontend already calls it: `getChampionDoc` in `src/lib/league-docs/api.ts:473`.
- **It must not be the question source.** It exposes the answer, and it applies no eligibility.

### 2.9 Data visibility limit
The production DB is not in git (`BE:.gitignore:78`). Every value quoted here comes from committed ledgers and fixtures dated 2026-09-07/08. Production values may have changed since. PT3's tests must use a fixture DB; they must not assert production values.

---

## 3. Timer architecture

### 3.1 What exists
- **Server-anchored countdowns:** `src/lib/ranked-core/timerMath.ts` and `src/lib/ranked-core/flow/useCountdownNow.ts:51-92`, which snaps on `visibilitychange`.
- **rAF reveal clocks:** `src/lib/motion/usePlaybackClock.ts`, which clamps hidden-tab steps to `MAX_STEP_MS=100`.
- **Not reusable as-is:** none of these measures a player-controlled interval.

### 3.2 Design (PT2)
**Clock**
- Use `event.timeStamp` from the start and stop input events. It is a `DOMHighResTimeStamp` on the same monotonic timeline as `performance.now()`.
- Fall back to `performance.now()` when `timeStamp` is 0 (synthetic events).
- Never use `Date.now()`, which is wall-clock and jumps when the system time changes.
- Rendering is decoupled from measuring. No rAF loop is needed to *measure*, and the timer is invisible anyway.

**State machine (pure reducer):**
```
idle → armed (round dealt, input enabled) → running (start event t0)
     → stopped (stop event t1, elapsed = round(t1 - t0)) → submitting → revealed
       running → interrupted (visibility hidden / pagehide / blur policy) → void
```

**Input**
- Start and stop listen on `pointerdown` (primary button only), not `click`. This avoids the 300 ms tap delay and the touchend/click double-fire.
- The stage sets `touch-action: manipulation`.
- Keyboard: Space and Enter, with `event.repeat` ignored.

**Double taps:**
- Ignore any stop that arrives within `MIN_RUN_MS = 250` of start. Every eligible target is at least 1 s, so this is safe.
- After `stopped`, ignore all input until the reveal.
- Handle a pointer and a key event for the same press by accepting only the first event per state transition.

**Interruption policy**
- `visibilitychange → hidden` while running makes the attempt `interrupted`. It is voided and never submitted.
- Do not try to "resume": the monotonic clock keeps running while the tab is hidden, so the measurement is still correct, but the player's sense of time was broken.
- `pagehide` or a refresh loses the attempt. The round is dealt again; the server round expires on its own TTL.
- `blur` alone (a devtools click, an OS overlay) only logs. It does not void. This is open for owner tuning.

**Network failures**
- The measured `elapsed_ms` is kept in memory.
- The lock is idempotent per `round_id` on the server, so the client retries the same body with backoff (3 attempts).
- A 404 or "expired" response means the round is gone: show "round expired" and deal a new one.

### 3.3 Integrity: what we can and cannot claim
- **Local accuracy:** `event.timeStamp` resolution is typically 0.1–1 ms. Browsers coarsen timers to mitigate Spectre (≥100 µs; 1 ms or more in some contexts such as Firefox's resistFingerprinting). Input-to-event latency is display- and OS-dependent, typically 8–50 ms, and roughly constant between the start and stop events, so it largely cancels. Integer-ms precision is therefore honest; sub-ms is not.
- **Server verification:** the server cannot verify a browser-reported duration.
  - It *can* bound it from above: elapsed cannot exceed `submit_time − issue_time`. The server already stamps times at microsecond precision (`BE:ranked_public/persistence.py:28-31`), and server-measured windows include network RTT (`BE:segment_flow.py:501-536`).
  - Anything under that bound is plausible, so a tampered client can submit any value inside the window.
  - **Browser-supplied elapsed time is not tamper-proof and must never be described as such.**
- **Competitive-integrity option (Phase 2):** server-stamped start and stop requests. These are tamper-resistant only up to RTT jitter (tens to hundreds of ms on mobile), which is comparable to the scoring tolerance. That makes them unsuitable as the primary measure, but usable as a plausibility cross-check: `|client − server| ≤ RTT budget`.

---

## 4. Transport and grading

### 4.1 Existing numeric contracts
| Contract | Shape | Grading | Usable for elapsed ms? |
|---|---|---|---|
| Ranked `mastery_slice` `{selected: number}` (`src/lib/ranked-public/client.ts:555-580`; `BE:schemas/ranked_public_schemas.py:202-310`, StrictInt/StrictFloat) | Raw number | Binary: exact integer, or the same rounded cell (`BE:mastery/questions/precision.py:257-281`, max 6 dp) | **No.** It is binary, a duration is semantically the wrong thing to send there, and the module forbids timing |
| Ranked outcome model (`BE:ranked_modules/contract.py:38-62`) | `correct\|incorrect\|timeout` plus points 0..100 | Module-derived points | Closeness can be expressed only through points |
| Numeric Lab `{value}` / `{estimate: StrictInt}` (`BE:routes/admin_numeric_lab.py:61-68`; `src/lib/numeric-lab/api.ts:95-107`) | JSON number | **None**: the lock only releases the private block | The transport pattern is reusable; the endpoint is not |
| Legacy quiz `time_taken_ms` (`BE:schemas/quiz_schemas.py:14-29`) | Client-reported, unchecked | Exact string | No |

**Finding:** no current contract represents "elapsed milliseconds graded by closeness". A **new typed response** is required: `{elapsed_ms: StrictInt}`, an integer number of milliseconds with no floats. A new grading function is also required: tolerance tiers plus a points curve. No grading code in either repo has a tolerance band; all existing grading is binary.

### 4.2 Reveal semantics
- Every stack withholds answers server-side until the lock.
- The shared backend guard is `BE:answer_safety.py:70-86`: `FORBIDDEN_PRE_REVEAL_KEYS` (which already includes `final_cooldown`) and `assert_pre_reveal_safe`.
- The Numeric Lab adds `LAB_PRIVATE_KEYS` on top (`BE:numeric_lab/service.py:53-66`).
- Perfect Timing must run `assert_pre_reveal_safe` over its public payload and add `target_ms` and `cooldown_seconds` to its own private-key set.

### 4.3 Persistence and replay
- **Phase 1 persists nothing.** Like the Numeric Lab, it writes no DB rows, so there is no migration and no replay surface to break.
- **For a future Ranked module:** replay re-runs raw choices through the pinned `(module_id, module_version)` (`BE:ranked_modules/contract.py:20-27`; `BE:ranked_modules/registry.py:1-9`). Adding a new module id and a new `SegmentChallengeIn` field is *additive* and does not break old matches. It does have known touch points:
  - the `_exactly_one_choice`/`as_choice` branches (`BE:schemas/ranked_public_schemas.py:265-310`);
  - the `review.build_round_review` fallback, which renders unknown modules as "quiz" (`BE:ranked_public/review.py:1093-1116`, verified);
  - the child-result outcome CHECK constraint, which only allows correct/incorrect/timeout;
  - the frontend `SegmentChoice` union and its `assertNever` switch;
  - the frontend `contracts.ts` readers (≈10 sites; see the handoff, Phase 2 notes).

---

## 5. Owner-only deployment

### 5.1 Backend authority (verified)
- `BE:routes/_auth.py:129-150` `require_admin` requires a verified Supabase bearer. It then calls the RPC `owner_auth_state()` and requires `is_owner && authorized`.
- There is no email allowlist, and `X-Admin-Key` is ignored.
- If the owner state is unavailable it returns 503; otherwise it returns 403.

### 5.2 Production owner-only patterns
1. **Admin router plus a default-off flag.** This is the Numeric Lab:
   - routes `/api/admin/numeric-lab/*` with `dependencies=[Depends(require_admin)]`;
   - flag `NUMERIC_LAB_ENABLED` (off returns 404) (`BE:routes/admin_numeric_lab.py:33-50`);
   - frontend page `/admin/numeric-lab` under `<AdminRoute>` (`src/App.tsx:280-285, 475, 538`).

   **Phase 1 uses this pattern.**
2. **Admin-only Ranked bot presets.** `ADMIN_ONLY_PRESETS` (`BE:ranked_public/service.py:587-596`, verified) are launched by `PresetLaunch` (`src/pages/admin/ranked/PresetLaunch.tsx:20-59`, verified) and listed at `src/pages/admin/areas/AdminRankedPage.tsx:306-367`. **This is the pattern for Phase 2.**
3. **The `playtest` grant** (`profiles.pro_grant_kind`) is for testers. It is not owner-only and must not be used.

### 5.3 Frontend gate
- `src/components/AdminRoute.tsx` uses `useOwnerAuth` (`src/hooks/useOwnerAuth.ts:38-85`), which calls the RPC `owner_auth_state()`. This gate is UX only; the real boundary is `require_admin`.
- `useOwnerAuth.ts:54-62` has a bypass that is DEV/E2E-only (`import.meta.env.DEV && VITE_E2E_AUTH`) and is stripped from production builds.

### 5.4 Development routes are not owner routes
- **DEV-only routes** use the pattern `import.meta.env.DEV ? lazy(...) : null` and 404 in production (`src/App.tsx:247-301, 714-749`).
- **Warning:** several `/dev/*` routes are *not* DEV-gated and do ship to production: `/dev/ranked-shell-probe`, `/dev/journey-arena`, `/dev/ranked-duel`, `/dev/stat-check` and others (`src/App.tsx:705-713, 750-752, 789-790`).
- **Perfect Timing must not use a `/dev/*` route as its owner surface.** A DEV-only `/dev/perfect-timing` mirror (the Numeric Lab precedent at App.tsx:281-285) is acceptable for browser specs.

### 5.5 "Unified playtests" branches
- `ugmp/unified-playtests-fe` equals `origin/main`, with zero commits of its own.
- `ugmp/unified-playtests-be` exists only locally, at the master tip. It is not on the remote.
- Neither carries work; neither should be relied on.

---

## 6. Visual architecture

### 6.1 Reusable assets
| Concern | Reuse |
|---|---|
| Arena shell | `CanonicalArena`, `ArenaShell`, `CentralStage`, `CombatantPanel`, `MobileMatchBar`/`MobileBottomBar` (`src/components/ranked-arena/`) via the lab-renderer pattern |
| Ability icon | `getAbilityIconUrl(champion, slot)` / `getChampionSquareIconUrl` (`src/lib/combat-lab/abilityIcons.ts:59-73`, verified). These come from the backend asset store `assets/champions/<folder>/<SLOT>_<key>.png`, unversioned, with no DDragon. Each slot has one icon, so form-switch champions have no per-form art; those are excluded anyway |
| Subject art | `SubjectArt`, `EvidencePlate`, `SuspenseDots` (`src/components/interaction-grammar/shared.tsx`) |
| Reveal metaphor | `EstimateReveal` error block and verdict (`src/lib/interaction-grammar/types.ts:518-554`); `EstimateBeam` for a closeness visual |
| Results | `src/components/game-results/*` (`GameResultsShell`, `ResultHero`, `ResultStatGrid`, `ResultTimeline`, `useCountUp`) |
| Typography | Cinzel headings (`index.html:24`), Inter body (`tailwind.config.ts:237`), Space Mono for numerals; tokens `--ranked-ink`/`--ranked-ink-muted` (`src/index.css:877-878`) |
| Motion | framer-motion ^12, `src/lib/motion/{usePlaybackClock,useReveal,easing}.ts`, `useReducedMotionPreference` |
| SFX | `useSfx().play(event)` with events in `src/lib/audio/sfx-registry.ts:27-132` (`ranked.answer.lock`, `ranked.answer.correct/incorrect`, `ranked.module.start`). There is no tick cue, which is correct: the timer is invisible |
| Responsive | `useIsMobile` (768 px), `useCoarsePointer`, `useStageRoom` |

### 6.2 What the Fable design agent must preserve
- Stage the mode inside the `CanonicalArena` and do not build a bespoke page shell.
- Use the existing type scale, the `--ranked-*` tokens, Cinzel for display text and the parchment ink palette.
- The timer must stay **invisible** while running. No digits, progress bar, pulse or audio may leak elapsed time. This is the mode's core rule.
- Honour `prefers-reduced-motion`.
- Use only existing SFX events, or add new keys to `sfx-registry.ts` with a silent fallback.
- Every input must have a target of at least 44 px and work with keyboard alone (Space/Enter).
- The client shows the server's verdict and never computes the score.

### 6.3 Where the design agent has freedom
- The start/stop control itself. One large press surface is suggested.
- The "armed", "running" and "stopped" ambience, as long as it carries no time information.
- The reveal choreography: a timeline that compares your stop with the true cooldown, the error in ms, tier lettering and the run streak.
- The session results screen.

---

## 7. Verified file inventory (touch points)

| Area | Frontend (mogsy) | Backend (LCS) |
|---|---|---|
| Owner gate | `src/components/AdminRoute.tsx`, `src/hooks/useOwnerAuth.ts` | `routes/_auth.py:129` |
| Lab precedent | `src/pages/admin/numeric-lab/`, `src/lib/numeric-lab/api.ts`, `src/components/combat-estimate/CombatEstimateArena.tsx` | `routes/admin_numeric_lab.py`, `numeric_lab/service.py`, `numeric_lab/tests/test_admin_numeric_lab.py` |
| Route mount | `src/App.tsx` (≈283, 475-538) | `api_server.py` (imports 13-80, `include_router` 549-617) |
| Admin listing | `src/lib/admin/admin-registry.ts:745-778`, `src/pages/admin/areas/AdminRankedPage.tsx:306-367` | — |
| Cooldown authority | — | `quiz/ability_question_eligibility.py`, `services/canonical_ability_facts.py`, `services/canonical_cooldown.py`, `fixtures/dc1_sim2_cooldown_ownership.json`, `fixtures/dc1_phase2f_cooldown_authority.json`, `knowledge_engine/patch_identity.py` |
| Leak guard | lab parser (new) | `answer_safety.py:70-86` |

---

## 8. Architectural decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Phase 1 is an owner-only Lab** (`/api/admin/perfect-timing/*` plus `/admin/perfect-timing`), on the Numeric Lab pattern | It works in production, is owner-gated on the server, and needs no Ranked trust change, no migration, and no change to existing modes |
| D2 | Elapsed time is measured on the client with `event.timeStamp` (monotonic) and sent as an integer `elapsed_ms` | It is the only accurate option. Server-only timing is dominated by RTT jitter |
| D3 | The server grades: target, error, tier and points. The client never computes the verdict | Matches every existing mode (§1.7) |
| D4 | The server stores the issued round in memory with a TTL and makes the lock idempotent. It writes no DB rows | No migration; acceptable for a single owner on one instance. It must fail closed on restart (404, deal again) |
| D5 | An upper-bound plausibility check is reported in the release, not enforced | Honest integrity: flag what is implausible and claim nothing else |
| D6 | Questions use base cooldown, 0 haste, from `champion_abilities`, filtered as in §2.5 | No new data source; certified per row |
| D7 | Target range is bounded (proposed 1 s ≤ target ≤ 60 s, owner-tunable constant) | Annie R at 130 s is a tedious invisible wait. **Owner decision** |
| D8 | Ranked integration (Phase 2) is deferred and needs the owner to accept client-timed answers in Ranked | The contract says modules never measure timing |

---

## 9. Unknowns

1. The production values in `champion_abilities`: the DB is not in git, and the snapshots are from 2026-09-07/08.
2. Which patch production last closed successfully. `26.20#1` is at FAILED_AUTHORITY.
3. Whether `NUMERIC_LAB_ENABLED` is set in production, i.e. whether the owner has exercised the lab-flag pattern live. There is no env file in the repo.
4. Whether the OWN1 SQL (`supabase/own1-staged/migrations/01_own1_a_owner_core.sql`) is applied in production. `require_admin` depends on `owner_auth_state()`, and the frontend doc says "staged, NOT applied". Confirm by logging into `/admin/numeric-lab` in production before PT4.
5. The scoring tolerance and curve. A proposal is in the handoff; the owner must tune it by playtest.
6. The backend runs as a single instance (the rate limiter assumes this, `BE:ranked_public/ratelimit.py`). If Railway scales horizontally, the in-memory round store (D4) breaks, and a lock can land on a different worker. The mitigation is in the handoff (PT3).
7. iOS Safari's `event.timeStamp` precision under Low Power Mode has not been measured. PT4 includes a device check.

---

## 10. Regression risks

| Risk | Mitigation |
|---|---|
| Editing `CanonicalArena`, the registry or `SegmentChoice` breaks existing modes | Phase 1 must not modify them. Registry pins (`registry.test.ts`, `InteractionLab.test.tsx:140`) must stay green and unchanged |
| A shared-file merge conflict in `src/App.tsx`, `api_server.py`, `admin-registry.ts` or `sfx-registry.ts` | Each is owned by exactly one package (see the handoff) and changed additively in one place |
| Answer leaks pre-reveal | `assert_pre_reveal_safe` on the backend public payload, a frontend parser guard, and tests that assert the absence of `target_ms` |
| A banned provider is introduced (DDragon) | The backend `test_no_banned_provider` guard already exists; PT3 adds no network calls |
| A static-fact guard trips (`src/test/guards/noStaticLeagueFacts.test.ts`) | Frontend fixtures carry no `correct_answer` literals; use backend-captured JSON under `__fixtures__` |
| Owner route reachable by non-owners | `require_admin` plus a flag on every endpoint, and a test that a non-admin gets 403 or 404 |
| A wrong cooldown is presented as truth | §2.5 exclusions, a non-null revision stamp, and the patch label with its source shown in the UI |
