# Perfect Timing — Implementation Handoff

**Read first:** [PT0_ARCHITECTURE_AUDIT.md](PT0_ARCHITECTURE_AUDIT.md). It holds the evidence (file:line references) behind every decision here. Do not repeat the audit. If the code you find disagrees with it, trust the code and note the drift in your PR.

**Baselines:**

| Repo | Base | Build on |
|---|---|---|
| Frontend `mitcherrman/mogsy` | `origin/main` @ `8afb0ea2` or later | — |
| Backend `mitcherrman/League_Combat_Simulator` | `origin/master` @ `9fc8a034` or later | — |

**Hard rules for every package:**
- No Docker.
- No schema migrations.
- No deployment.
- No merge to `main`/`master`. Every package opens a PR against its own branch.
- No changes to existing game modes, `CanonicalArena`, the Ranked registry, `SegmentChoice` or any Ranked contract reader.
- No cooldown values may be written into code or fixtures by hand. Values come from `champion_abilities` through the backend only.
- **Never** describe browser-measured time as tamper-proof.

---

## 1. What we are building (Phase 1)

### 1.1 The game

An **owner-only "Perfect Timing Lab"**:

1. The owner opens `/admin/perfect-timing`.
2. The backend deals a short run of rounds. Each round shows a champion ability (icon, champion, ability name and rank) with **no number shown**.
3. The owner presses **Start**. They imagine casting the ability, then press **Stop** when they believe it is off cooldown.
4. The elapsed time is measured locally with a monotonic clock and sent as integer milliseconds.
5. The server grades it: it returns the target, the signed error, a tier and points (0–100).
6. The UI reveals the result and moves to the next round. A results screen closes the run.

### 1.2 Architecture

It copies the Numeric Lab's production owner-only pattern (audit §5.2-1):

```
/admin/perfect-timing (AdminRoute)                       ← PT4
  PerfectTimingPage  — orchestrates deal → arm → run → lock → reveal → results   ← PT4
    PerfectTimingArena — lab-local ModuleRenderer inside the real CanonicalArena   ← PT1
      PerfectTimingStage / Reveal / Results (presentational)                       ← PT1
    useTimingEngine (monotonic start/stop state machine)                           ← PT2
    perfectTimingApi + contract parsers                                            ← PT4
        │  POST /api/admin/perfect-timing/deal
        │  POST /api/admin/perfect-timing/rounds/{round_id}/lock
        ▼
routes/admin_perfect_timing.py  (require_admin + PERFECT_TIMING_LAB_ENABLED)     ← PT3
  perfect_timing/{eligibility,rounds,scoring,service}.py                         ← PT3
    champion_abilities (canonical) + existing gates/fixtures — no new source
```

**Phase 2 is out of scope.** It covers Ranked integration, haste variants and persistence (§9).

---

## 2. Frozen wire contract (v1)

PT3 implements this contract and PT4 parses it. **Neither side changes it without updating this file in the same PR.**

### 2.1 Deal

`POST /api/admin/perfect-timing/deal`
- **Body:** `{"count": <int 1..10>}`. Use `extra="forbid"` and `StrictInt`.
- **Response 200:**

```json
{
  "contract": "perfect_timing.deal.v1",
  "data_label": {
    "patch_label": "26.19",
    "patch_source": "patch_operations | patch_notes_ingestion_fallback | unknown",
    "ability_haste": 0
  },
  "rounds": [
    {
      "round_id": "pt_<32 lowercase hex>",
      "champion": "Ahri",
      "slot": "R",
      "ability_name": "Spirit Rush",
      "rank": 2,
      "rank_count": 3,
      "expires_at": "2026-10-15T18:04:05.123456Z"
    }
  ]
}
```

- The values above are illustrative and are not real data.
- `rank` is `null` when the ability is rank-invariant. The UI then says "any rank".
- `patch_label` and `patch_source` come straight from `knowledge_engine.patch_identity.resolve_canonical_patch()`. If that function cannot resolve a patch, send `patch_label: null` and `patch_source: "unknown"`. Do not invent a patch.
- **Forbidden in this payload:** `target_ms`, `cooldown`, `cooldown_seconds`, `cooldown_raw`, `by_rank`, and anything listed in `answer_safety.FORBIDDEN_PRE_REVEAL_KEYS`. Before returning, run `assert_pre_reveal_safe` on the payload, together with a `PT_PRIVATE_KEYS` set of your own.
- `round_id` is opaque random: `secrets.token_hex(16)`. It must never encode the champion, slot or rank.

### 2.2 Lock

`POST /api/admin/perfect-timing/rounds/{round_id}/lock`
- **Body:** `{"elapsed_ms": <StrictInt 0..600000>}`. A float, bool or string, or any extra key, returns 422.
- **Response 200:**

```json
{
  "contract": "perfect_timing.release.v1",
  "round_id": "pt_…",
  "elapsed_ms": 6830,
  "target_ms": 7000,
  "error_ms": -170,
  "abs_error_ms": 170,
  "relative_error": 0.0243,
  "tier": "perfect | great | good | miss",
  "points": 88,
  "plausibility": {
    "server_window_ms": 9412,
    "verdict": "ok | exceeds_server_window"
  },
  "authority": {
    "cooldown_raw": "7 / 7 / 7 / 7 / 7",
    "rank": 3,
    "revision_id": "4007396",
    "verified_at": "…"
  }
}
```

Field semantics:
- `error_ms = elapsed_ms - target_ms`. Negative means early.
- `relative_error` is rounded to 4 dp.
- `server_window_ms` is the server's monotonic time from deal to lock (`time.monotonic()`), as an integer.
- `verdict` is `exceeds_server_window` when `elapsed_ms > server_window_ms + 250`. It is reported only and changes no grade in v1.

Idempotency and errors:
- **Same round and same `elapsed_ms`** returns the identical body.
- **Same round with a different value** returns 409 `PT_ALREADY_LOCKED`.
- **Unknown or expired round:** 404 `PT_ROUND_NOT_FOUND`.
- **Flag off:** 404 on every route.
- **Auth:** 403 or 503 from `require_admin`.
- **Error body shape:** use the Numeric Lab's `detail.error.{code,message}` (see `src/lib/numeric-lab/api.ts:80-90`, which already parses it).

### 2.3 Scoring v1 (proposal — constants in one module, owner-tunable)

`rel = abs_error_ms / target_ms`

| Tier | rel ≤ |
|---|---|
| perfect | 0.03 |
| great | 0.07 |
| good | 0.15 |
| miss | otherwise |

`points = round(100 * max(0, 1 - rel / 0.25))`. The result is an int in 0..100, which matches the Ranked `MAX_SEGMENT_POINTS` for Phase 2 compatibility.

These are starting values for playtesting, not a researched tolerance. The release must not claim otherwise.

---

## 3. Work packages

### 3.1 Dependency graph

```
PT2 (engine) ─┐
PT1 (UI)  ────┼──► PT4 (integration + tests)
PT3 (backend)─┘
```

- PT1, PT2 and PT3 run **in parallel** and share no files.
- PT4 starts when all three are on their branches with green tests.

### 3.2 File ownership

A file appears in exactly one package.

| Package | Repo | Branch (suggested) | Owns (create unless noted) |
|---|---|---|---|
| **PT1** UI | mogsy | `perfect-timing/pt1-ui` | `src/components/perfect-timing/**` (Arena, Stage, Reveal, Results, css, tests, `__stories__`/demo data), `src/lib/perfect-timing/viewModel.ts`, **edit** `src/lib/audio/sfx-registry.ts` (additive keys only, if any) |
| **PT2** Engine | mogsy | `perfect-timing/pt2-timing-engine` | `src/lib/perfect-timing/timingEngine.ts`, `src/lib/perfect-timing/useTimingEngine.ts`, `src/lib/perfect-timing/timingEngine.test.ts`, `src/lib/perfect-timing/useTimingEngine.test.tsx` |
| **PT3** Authority + contract | LCS | `perfect-timing/pt3-cooldown-authority` | `perfect_timing/**` (`__init__`, `eligibility.py`, `rounds.py`, `scoring.py`, `service.py`, `tests/`, `fixtures/capture_v1.json`), `routes/admin_perfect_timing.py`, **edit** `api_server.py` (one import plus one `include_router`, next to `numeric_lab_router` at :70/:589) |
| **PT4** Integration | mogsy | `perfect-timing/pt4-integration` | `src/lib/perfect-timing/api.ts`, `src/lib/perfect-timing/contract.ts`, `src/lib/perfect-timing/__fixtures__/captureV1.json`, `src/pages/admin/perfect-timing/**`, **edit** `src/App.tsx` (admin route plus DEV mirror), **edit** `src/lib/admin/admin-registry.ts` (one entry), `e2e/perfect-timing-owner.spec.ts`, **edit** `playwright.arena.config.ts` (testMatch) |

**Shared directory:** PT1, PT2 and PT4 all create files under `src/lib/perfect-timing/`, but the file names do not overlap. Nobody creates an `index.ts` barrel there, which avoids a conflict; import by file path.

---

## 4. PT1 — Premium UI and gameplay (Fable design agent)

### 4.1 Goal

Build the presentational components and the lab arena wrapper. **No network and no timing logic.** Everything arrives through props.

### 4.2 Interfaces to implement against

PT1 defines these in `src/lib/perfect-timing/viewModel.ts`:

```ts
export type PtPhase = "loading" | "armed" | "running" | "stopped" | "submitting"
                    | "revealed" | "interrupted" | "error" | "complete";
export interface PtRoundView {
  roundId: string; championName: string; abilityName: string;
  slot: "Q" | "W" | "E" | "R"; rank: number | null; rankCount: number;
  iconUrl: string | null;            // PT4 fills via getAbilityIconUrl()
  index: number; total: number;
}
export interface PtRevealView {
  elapsedMs: number; targetMs: number; errorMs: number; absErrorMs: number;
  relativeError: number; tier: "perfect" | "great" | "good" | "miss"; points: number;
  plausible: boolean; cooldownRaw: string; rank: number | null;
}
export interface PtPressSurfaceProps {   // produced by PT2's hook, spread onto ONE element
  onPointerDown: React.PointerEventHandler; onKeyDown: React.KeyboardEventHandler;
  tabIndex: 0; role: "button"; "aria-label": string; "aria-disabled": boolean;
}
export interface PtRunSummary { rounds: { round: PtRoundView; reveal: PtRevealView | null }[];
  totalPoints: number; patchLabel: string | null; patchSource: string; }
```

### 4.3 Components

**`PerfectTimingArena.tsx`**
- Copy the lab-renderer pattern from `src/components/combat-estimate/CombatEstimateArena.tsx:64-100`:
  - a `LAB_RENDERER` with `ownsSubmission: true` and `ownsResultReveal: () => true`;
  - an inert frozen `STAGE_PUBLIC_ROUND` (schemaVersion `"perfect_timing_lab.v1"`).
- Mount the real `CanonicalArena`. **Do not modify `CanonicalArena`.**

**`PerfectTimingStage.tsx`** takes `{ round, phase, press: PtPressSurfaceProps, statusText? }`.
- One large press surface, at least 44 px and comfortably thumb-sized on mobile, with `touch-action: manipulation`.
- Visible focus ring; keyboard hint "Space".

**`PerfectTimingReveal.tsx`** takes `{ reveal: PtRevealView, onNext }`. It shows:
- a timeline comparing your stop with the true cooldown;
- the signed error in ms, early or late;
- the tier and points;
- the data provenance (`cooldownRaw`, rank);
- an "unverified timing" chip when `plausible` is false.

**`PerfectTimingResults.tsx`** takes `{ summary: PtRunSummary, onPlayAgain }`.
- Reuse `src/components/game-results/*` (`GameResultsShell`, `ResultHero`, `ResultStatGrid`, `useCountUp`).
- Show the patch label **with** its source, e.g. "Data: 26.19 (patch-notes fallback)".

### 4.4 Must preserve (audit §6.2)

- **Zero time leakage while running.** No digits, bar, pulse, animation period or audio cadence may correlate with elapsed time. A static "running" state change at start is allowed.
- Use the existing tokens, Cinzel display type and `--ranked-ink` palette, and honour `useReducedMotionPreference`.
- Reuse the SFX events `ranked.module.start`, `ranked.answer.lock` and `ranked.answer.correct`/`incorrect`. Use the tier to pick correct (perfect/great/good) or incorrect (miss).
- Do not draw any icon other than what `iconUrl` provides. No DDragon URLs.

### 4.5 Freedom

The press-surface design, the ambience per phase, the reveal choreography, the streak treatment and the results layout.

### 4.6 Tests

Vitest and React Testing Library, colocated:
- The stage renders no numeric text while `phase === "running"`. Assert that the DOM text has no digits besides the rank.
- The reveal renders a negative error as "early" and a positive one as "late".
- The results component sums points.
- Axe-style checks: role and label on the press surface.

### 4.7 Acceptance

- [ ] Renders at 375×812 and 1440×900 with no horizontal scroll.
- [ ] Keyboard-only flow is possible.
- [ ] Reduced motion is respected.
- [ ] `npx tsc -p tsconfig.app.json` is clean.
- [ ] `npm run lint` is clean on the touched files.
- [ ] `npx vitest run src/components/perfect-timing` is green.
- [ ] Existing suites are untouched.
- [ ] A static demo page or story using fake view models. The fake values are clearly labelled "demo" and kept out of production bundles: import them only from tests or the DEV route.

---

## 5. PT2 — Timing engine

### 5.1 Goal

A pure, deterministic start/stop state machine, plus a React hook that binds it to input and page-lifecycle events.

### 5.2 `timingEngine.ts` (pure, no DOM)

**State:** `{ phase: "idle"|"armed"|"running"|"stopped"|"interrupted", roundId, t0, elapsedMs, interruptReason }`.

**Events:**

| Event | Effect |
|---|---|
| `ARM(roundId)` | Moves to `armed` |
| `PRESS(t)` in `armed` | Moves to `running` with `t0 = t` |
| `PRESS(t)` in `running` with `t - t0 < MIN_RUN_MS (250)` | **Ignored** (double-tap guard) |
| `PRESS(t)` in `running` otherwise | Moves to `stopped` with `elapsedMs = Math.round(t - t0)` |
| `PRESS` in any other phase | Ignored |
| `HIDDEN` / `PAGEHIDE` in `running` | Moves to `interrupted` |
| `RESET` | Moves to `idle` |

Rules:
- All timestamps are `DOMHighResTimeStamp` values.
- Reject non-finite values. Reject a negative delta, which can come from a mixed timeline: treat it as `interrupted` with reason `clock`.
- `elapsedMs` is clamped to `MAX_ELAPSED_MS = 600000`; anything over that is `interrupted` with reason `timeout`.

### 5.3 `useTimingEngine.ts`

It returns `{ state, arm(roundId), reset(), press: PtPressSurfaceProps }`.

**Time source**
- `t = event.timeStamp || performance.now()`.
- Never use `Date.now()`.

**Pointer and keyboard input**
- `onPointerDown`: primary button only (`e.button === 0`) and `e.isPrimary`. Call `preventDefault()` so the browser does not synthesize a click or focus.
- `onKeyDown`: Space and Enter only. Ignore `e.repeat`.
- **Same-press dedupe:** after a transition, ignore any further event whose timestamp is within 50 ms of the accepted one. This covers a pointer and a key firing for one press.

**Page lifecycle**
- Listen to `document` `visibilitychange` (hidden → `HIDDEN`) and `window` `pagehide`.
- `blur` is only logged, through an optional `onDiagnostic` callback.
- Clean up all listeners on unmount.

**Callback:** expose `onStopped(elapsedMs)` so that PT4 can submit.

### 5.4 Tests (Vitest, fake timestamps)

- The full transition table.
- The double-tap guard at 249 ms vs 250 ms.
- Ignoring key repeats.
- `visibilitychange` while running gives `interrupted`.
- A pointer and a key for the same press count once.
- Rounding: 6999.5 becomes 7000.
- Re-arming after `stopped` clears `t0`.
- No timer, `setInterval` or rAF is used for measurement. Assert this by spying.

### 5.5 Acceptance

- [ ] 100% branch coverage on `timingEngine.ts`.
- [ ] The hook works in a jsdom test with dispatched `PointerEvent`/`KeyboardEvent`.
- [ ] `tsc` is clean.
- [ ] No imports from `ranked-core`.

---

## 6. PT3 — Cooldown authority and question contracts (backend, LCS repo)

### 6.1 Goal

Build the owner-only lab router that deals certified rounds from `champion_abilities` and grades locked elapsed times.

### 6.2 `perfect_timing/eligibility.py`

**Inputs:**
- `quiz.ability_question_eligibility.load_ability_rows(conn)`.
- `gates = load_secondary_gates()`.

**An ability is eligible only when all of these hold:**
1. `slot in {"Q","W","E","R"}`. Passives are out.
2. `classify_cooldown(row, gates).eligible`. Use only its returned `ranks`, or the rank-invariant flag.
3. `(champion, slot)` is **not** in `fixtures/dc1_sim2_cooldown_ownership.json["holds"]`. Read the actual key shape from the file and do not guess it.
4. `row.is_static` is false. This excludes attack-speed, level and stack scaling.
5. Its shape in `fixtures/dc1_phase2f_cooldown_authority.json["abilities"]` is `RANK_PROGRESSION` or `RANK_INVARIANT`. Read the actual shape field name from the file.
6. `authority_revision_id` is non-null. If `AbilityRow` lacks it, read it with `services.canonical_ability_facts.get_ability_facts`.
7. The target is `MIN_TARGET_MS (1000) ≤ target ≤ MAX_TARGET_MS (60000)`. These are module constants, and the owner decides the final values (audit D7).

**Additional rules:**
- `target_ms = round(seconds_at_rank * 1000)`, using the parsed progression value. Do not use haste.
- Expose `eligible_pool(conn) -> list[PtCandidate]` and a coverage report function for the PR description: counts included and counts excluded per reason.

### 6.3 `perfect_timing/rounds.py`

**Storage**
- An in-memory, thread-safe store: `dict` plus `threading.Lock`.
- Each entry holds `round_id → {candidate, rank, target_ms, issued_mono, expires_at, lock: Optional[(elapsed_ms, release)]}`.
- TTL is 15 min. There is a hard cap of 500 entries, evicting the oldest.

**Behaviour**
- On restart, everything is lost and the lock returns 404. That is by design: no DB writes.
- `Procfile` runs a single uvicorn process with no `--workers`, so this is safe today. Add a module docstring warning that horizontal scaling requires moving the store.

### 6.4 `perfect_timing/scoring.py`

- Implements §2.3 exactly, as pure functions with module constants and a `SCORING_VERSION = "pt-scoring-0.1"` string.
- Include `SCORING_VERSION` in the release under `authority` only if you also update §2.2. Otherwise keep it internal.

### 6.5 `perfect_timing/service.py` and `routes/admin_perfect_timing.py`

**Router**
- Mirror `routes/admin_numeric_lab.py:33-60`.
- `APIRouter(prefix="/api/admin/perfect-timing", dependencies=[Depends(require_admin)])`.
- `FLAG_ENV = "PERFECT_TIMING_LAB_ENABLED"`, default off. When off, return 404.

**Request models**
- Pydantic with `extra="forbid"` and `StrictInt`.

**Public payload**
- Run `assert_pre_reveal_safe` together with `PT_PRIVATE_KEYS = {"target_ms","cooldown","cooldown_raw","cooldown_seconds","by_rank"}`.

**Dealing**
- Use `secrets.SystemRandom` to choose a candidate and a rank.
- Do not deal duplicate abilities within one deal.

### 6.6 Tests (pytest, no Docker)

**Setup**
- Pattern: `numeric_lab/tests/test_admin_numeric_lab.py:17-22` (bare `FastAPI()` plus a `require_admin` override).
- Use a **temporary SQLite fixture DB** that you build in the test with a handful of rows. Copy their values from the committed ledger `audit/champdata_p11_cooldown_ledger.csv`, and cite the line in a comment.

**Required cases:**
- [ ] A non-admin gets 403. With the flag off, the result is 404 even for an admin.
- [ ] Each exclusion reason excludes its row. Use one row per reason:
  - dual-form name;
  - charge/secondary gate (Teemo R);
  - hold (Jayce Q);
  - static (Yasuo Q);
  - all-zero;
  - rank-zero rank dropped (Urgot W rank 5);
  - null revision id;
  - out-of-range target (Annie R at 130 s with the default max).
- [ ] The deal payload contains no forbidden key, checked by recursive walk.
- [ ] `round_id` is not derivable from the ability.
- [ ] Lock: floats, bools, strings and extra keys get 422. Idempotent replay returns the same body. A different value gets 409. An expired or unknown round gets 404.
- [ ] Scoring boundaries at exactly 0.03, 0.07, 0.15 and 0.25.
- [ ] The plausibility verdict, with a monkeypatched `time.monotonic`.
- [ ] The existing `knowledge_engine/tests/test_no_banned_provider.py` stays green.

**Capture:** a script `perfect_timing/tests/make_capture.py` writes `perfect_timing/fixtures/capture_v1.json` from the fixture DB: one deal plus the release for each round. PT4 consumes it.

### 6.7 Run commands

```
python -m pytest -q -p no:cacheprovider perfect_timing/tests
python -m pytest -q -p no:cacheprovider numeric_lab/tests knowledge_engine/tests/test_no_banned_provider.py
```

### 6.8 Acceptance

- [ ] All of the above tests are green.
- [ ] The PR includes the eligibility coverage report, run against the dev DB if one is available; say so if it is not.
- [ ] No migration file and no DB write. Verify by grep for `INSERT|UPDATE|CREATE` in `perfect_timing/`.
- [ ] The `api_server.py` diff is at most 2 lines.

---

## 7. PT4 — Integration and tests (mogsy)

**Starts after** PT1, PT2 and PT3 have green branches. Branch from `origin/main` and merge the PT1 and PT2 branches in, or cherry-pick them.

### 7.1 `src/lib/perfect-timing/contract.ts`

- Strict parsers for `perfect_timing.deal.v1` and `perfect_timing.release.v1`. Reject an unknown contract string, a wrong type, or a `tier` outside the enum.
- **Leak guard:** throw if any deal round carries `target_ms`, `cooldown*` or `by_rank`.

### 7.2 `src/lib/perfect-timing/api.ts`

- Clone the shape of `src/lib/numeric-lab/api.ts`: an admin bearer via `buildAdminHeaders` (`src/lib/admin-auth/adminCredentials.ts`) and a typed error class.
- `deal(count)` and `lock(roundId, elapsedMs)`.
- `lock` retries up to 3 times on network or 5xx errors with backoff. It **never** retries on 4xx.

### 7.3 `src/pages/admin/perfect-timing/PerfectTimingPage.tsx`

1. Deal 5 rounds.
2. For each round, `engine.arm(roundId)`.
3. `onStopped`: `submitting`, then `lock`, then `revealed`.
4. `interrupted`: show "Run interrupted — round voided" and continue with the next round. Do not resubmit.
5. A 404 on lock means "Round expired — dealing a fresh one".
6. At the end, show results.

Also: map `champion` and `slot` to `iconUrl` with `getAbilityIconUrl` (`src/lib/combat-lab/abilityIcons.ts:59`). Confirm the champion naming matches `BY_NORMALIZED_NAME`; on `null`, fall back to `getChampionSquareIconUrl`, and then to a text plate.

### 7.4 Routes and listing

**`src/App.tsx`**
- Add a lazy page and `<Route path="/admin/perfect-timing" element={<AdminRoute>…}>` next to `:538`.
- Add a DEV-only mirror `/dev/perfect-timing` using the `import.meta.env.DEV ? lazy(...) : null` pattern (`:283-285`, `:745`). The mirror is for the e2e spec only.
- **Do not** add an ungated `/dev` route.

**`src/lib/admin/admin-registry.ts`:** add one entry modelled on `numeric-lab` (`:745-762`), with status "Prototype" and the authorization text naming `require_admin` and `PERFECT_TIMING_LAB_ENABLED`.

### 7.5 Tests

- **Contract tests** over `__fixtures__/captureV1.json`, copied verbatim from PT3's capture. Record the backend SHA in a sibling `.md` note or in the test header.
  - The fixture must not trip `src/test/guards/noStaticLeagueFacts.test.ts`. Run that guard.
- **A page test with a mocked API:** the whole run, the interrupted round, an expired round, and lock retry on 503 with no retry on 409.
- **`e2e/perfect-timing-owner.spec.ts`**, modelled on `e2e/numeric-lab-owner.spec.ts`, against the DEV mirror with a routed or mocked backend. Cover a keyboard run and a touch run (mobile viewport). Add it to the `playwright.arena.config.ts` `testMatch`.
- **Regression:** the full `npx vitest run` stays green, and `registry.test.ts` and `InteractionLab.test.tsx` are unchanged.

### 7.6 Manual device check

Record the results in the PR:
- Desktop Chrome, keyboard and mouse.
- iOS Safari.
- Android Chrome.

On each, run 3 rounds. Check that no double-fire happens and that backgrounding the tab mid-run voids the round. Report the `event.timeStamp` granularity observed (`unknown 7` in the audit).

### 7.7 Acceptance

- [ ] `tsc`, `lint` and `vitest` are green.
- [ ] The e2e spec is green.
- [ ] A non-owner visiting `/admin/perfect-timing` is redirected, through `AdminRoute`.
- [ ] The production build contains no DEV route. Check `npm run build:dev` versus a prod build by grepping for `perfect-timing` chunk imports under the DEV guard.
- [ ] The page bundle contains no cooldown values.

---

## 8. Integration gates and sequence

| Gate | Condition | Who |
|---|---|---|
| G0 | The owner accepts or tunes D7 (target range), the §2.3 scoring and the interruption policy. Packages may start on the defaults | Owner |
| G1 | PT2 is green and its interface matches §4.2 `PtPressSurfaceProps` | PT2 → PT4 |
| G2 | PT3 is green and its capture JSON is committed. The §2 contract is unchanged, or this file was updated | PT3 → PT4 |
| G3 | PT1 is green and its components consume only `viewModel.ts` types | PT1 → PT4 |
| G4 | PT4 is green end-to-end against the capture, with the device check done | PT4 |
| G5 | **Owner-only.** Review and merge the PRs, deploy the backend with `PERFECT_TIMING_LAB_ENABLED=1`, and confirm that `/admin/numeric-lab` works in production (owner auth live, audit unknown 4). Then playtest | Owner |

**Recommended sequence**
1. Launch PT1, PT2 and PT3 in parallel.
2. Run PT4.
3. The owner playtests and tunes the scoring constants (PT3 `scoring.py` only).
4. Decide on Phase 2.

---

## 9. Phase 2 (not scheduled) — notes for a future PT5

**Ranked module `perfect_timing.v1`**

This requires an **owner decision**: accept client-measured `elapsed_ms` as a Ranked answer. That contradicts `src/lib/ranked-core/modules/types.ts:34-36` and `BE:mastery_slice.py:1992-1997`, so both comments must be amended deliberately.

Touch points:

| Side | Files |
|---|---|
| Backend | `ranked_modules/perfect_timing.py` (RoundModule; outcome = correct if tier ≠ miss; points from scoring), `registry.py`, `SegmentChallengeIn` (+ `elapsed_ms` StrictInt, `_exactly_one_choice`, `as_choice`), `review.build_round_review` branch (otherwise the review falls back to "quiz"), `ADMIN_ONLY_PRESETS` (`admin.perfect_timing`), `answer_safety` keys |
| Frontend | `SegmentChoice` (`{ elapsedMs: number }` plus the `assertNever` switch, `client.ts:555-614`), `contracts.ts` readers (block type, submitted choices, challenge reveal, settlement, review kind, forbidden keys :1650), `registry.ts` (+ pins), `orderForgeLockReveal.ts` reveal sets, the labels in `centralStage.ts`/`SegmentTranscript.tsx`/`rankedResultsModel.ts`, review UI `ModuleSigil`/`questionIcons`, and `PresetLaunch` in `AdminRankedPage.tsx:306-367` |

**Other Phase 2 work**
- **Integrity upgrade:** a server-stamped `start` call plus a cross-check `|client − server window| ≤ RTT budget`. It flags but never claims tamper-proof.
- **Haste variant:** `classify_cooldown_haste` plus `calculate_cooldown.haste_to_cooldown_multiplier`, with the haste shown in the prompt.
- **Persistence:** Ranked tables already store `choice_json` and microsecond `submitted_at`. A standalone history would need a migration, which is out of Phase 1.

---

## 10. Copy-paste briefs

**PT1:**
> Implement PT1 from `docs/perfect-timing/PERFECT_TIMING_HANDOFF.md` §4 in mogsy on branch `perfect-timing/pt1-ui` from `origin/main`. Own only the files listed for PT1 in §3. Follow §4.4 strictly. Open a PR; do not merge.

**PT2:**
> Implement PT2 from `docs/perfect-timing/PERFECT_TIMING_HANDOFF.md` §5 in mogsy on branch `perfect-timing/pt2-timing-engine` from `origin/main`. Own only the files listed for PT2 in §3. Open a PR; do not merge.

**PT3:**
> Implement PT3 from `docs/perfect-timing/PERFECT_TIMING_HANDOFF.md` §6 (read it from mogsy branch `docs/perfect-timing-pt0-audit`) in League_Combat_Simulator on branch `perfect-timing/pt3-cooldown-authority` from `origin/master`. No migrations, no DB writes, no deployment. Open a PR; do not merge.

**PT4:**
> After PT1–PT3 are green, implement PT4 from `docs/perfect-timing/PERFECT_TIMING_HANDOFF.md` §7 in mogsy on branch `perfect-timing/pt4-integration`, merging the PT1 and PT2 branches and consuming PT3's `capture_v1.json`. Open a PR; do not merge.
