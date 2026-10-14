# Numeric Mode Prototype Labs — Stat Drop + Combat Estimate

Base `7be45341` · branch `lab/numeric-mode-playtests` · **NOT certified, NOT release-ready, do not merge before the command-center integration gate.**

> Original brief: discovery/implementation required. First find exact source prototypes/handoffs and verify build status; do not invent readiness. For each mechanic separately, prove a playable workflow, correct server-authoritative numeric grading, clear source/patch authority, no answer leak, and input/touch/keyboard/reveal/mobile behaviour. Prefer an admin-only independent lab; bot/versus deferred. No public modes, no production quiz pool, no generated unsupported numeric facts.

## Verdicts

| Mechanic | Verdict | One line |
|---|---|---|
| **Stat Drop** | **PROTOTYPE-ONLY** | Original lab primitive is unrecoverable; backend has certified facts but no numeric grader, readable patch stamp or route. |
| **Combat Estimate** | **PROTOTYPE-ONLY** | No prior implementation ever existed; backend has a deterministic calc seam (physical ability damage only) but no route, no tolerance grader, no patch stamp. |

Neither is a WORKING ADMIN PLAYTEST in the authoritative sense. Both play end-to-end on an admin/dev surface, but a client-side stand-in grades them over **synthetic** values. Neither is BLOCKED, because the interaction is fully playable.

## 1. Recovery — what existed (evidence)

**Stat Drop**
- Only trace in this repo: `src/lib/interaction-grammar/types.ts:5` ("Stat Drop stayed in the lab (HOLD)"), `docs/DD1_FRONTEND_HANDOFF.md:14,91`, `docs/DD1_DATA_DUEL_CERTIFICATION.md:263`, `ORDER_FORGE_HANDOFF.md:12`.
- Its source was the MIG1.2 lab on branch `mig1/1-interaction-lab` (`9e251141` impl, `b932af4b` cert). That branch no longer exists on origin. I fetched all 211 heads and all `refs/pull/*/head`, deepened by 2000 commits, and neither commit is reachable. Only short SHAs are recorded anywhere, so the commits cannot be fetched by id.
- Backend (`League_Combat_Simulator` master `f12a7432`): "Stat Drop" and "StatDrop" appear nowhere in code, docs or `git log --all`.

**Combat Estimate**
- No mention in either repo, on any branch or in any commit message. It was a roadmap label only.

Earlier roadmap labels were not treated as proof of implementation.

## 2. Backend authority (League_Combat_Simulator master `f12a7432`)

**Stat Drop — PARTIAL authority**
- Facts: `mastery/facts/projection.py:321` `project_champion()` returns `ChampionFact` (`mastery/facts/contract.py:353`). Each fact carries `value`, `unit`, `display_precision`, `certification` (ready/ready_derived/ambiguous) and `provenance.source` (sheet/row/revision).
  - Champion coverage: base and per-level health, AD, armor, MR, mana and regen; move speed; attack range; ability cooldown and cost at rank.
  - Items: `quiz/item_cost_authority.shop_priced_items()` and `quiz/item_stat_authority.canonical_stat_rows()`. Their rows have no unit, patch or source.
- Gaps:
  1. No numeric grader. Production numeric Mastery uses an exact rounding-cell match (`mastery/questions/precision.py:257`) and explicitly allows no tolerance.
  2. `ChampionFact` carries a `patch_key_digest` hash, not a readable patch. A readable patch needs `mastery/provenance/canonical_patch.py:124 canonical_patch_display()`.
  3. No admin route.
  4. No reveal contract. New private keys must join `answer_safety.py:23 FORBIDDEN_PRE_REVEAL_KEYS`.
  5. Entities with more than one value (OF5 `AMBIGUOUS_ENTITIES`) must be excluded.
  6. No win-rate authority.

**Combat Estimate — PARTIAL authority**
- Seam: `combat_calculations/__init__.py:16 calculate()` dispatches to `physical_ability_damage.py:259`.
  - The premise is typed with no defaults, and the calculation is deterministic (no RNG; crit is refused).
  - It returns `raw_damage`, `effective_armor` and `post_mitigation_damage` as full floats. An unsupported premise returns one of 17 named refusals instead.
  - Coverage is about 76 abilities across 51 champions (`docs/GR1_COMBATQ1_HANDOFF.md`).
- Gaps:
  1. No route exposes the seam. The Combat Lab routes (`routes/combat_lab.py`) accept client-supplied stats, so they are unusable as an answer authority.
  2. Coverage is physical ability damage after armor only: no autos, magic or true damage, passives, runes, crit or time-to-kill.
  3. No tolerance grader.
  4. Provenance has formula source cells and item revisions but no patch. A patch stamp needs `canonical_patch_display()` plus a data fingerprint (pattern: `services/combat_battle_snapshots.py:79`).
  5. Generating or verifying anything needs the production `lol_calc.db`, which no checkout includes.

## 3. What this branch adds

All files are isolated. Nothing in Quiz, Daily or Ranked changes.

| File | Role |
|---|---|
| `src/lib/interaction-grammar/numericModes.ts` | `StatDropPublic`, `CombatEstimatePublic` and the shared `NumericReveal`. Pure input helpers: snap, WAI slider keys, typed-entry parse, reveal sentence. The response `{ selected: number }` is checked at compile time to be a production `SegmentChoice`. |
| `src/components/interaction-grammar/StatDrop.tsx` | Number-line primitive. Pointer/touch drop and drag (only the track is `touch-none`); WAI slider keys (arrows, PageUp/Down, Home/End, Enter locks). Geometry stays fixed through the reveal. |
| `src/components/interaction-grammar/CombatEstimate.tsx` | Premise cards and typed entry (`inputMode="decimal"`). Enter or a tap locks. An invalid entry is refused with a reason and never rewritten. |
| `src/components/interaction-grammar/NumericRevealPanel.tsx` | Shared reveal: the answer, your value, the verdict (exact / within / outside), the band, the delta, and evidence plus source. Every string comes from the authority. |
| `src/pages/dev/numeric-modes/labAuthority.ts` | Stand-in authority. **Synthetic fixtures** named "Fixture …" (no real champion, item or ability). Answers live in a closure. It grades with the lab band rule AND the production exact-cell baseline. |
| `src/pages/dev/numeric-modes/NumericModesLab.tsx` | Host page with a permanent banner: "Prototype · visual lab — not authoritatively graded." URL parameters: `?round=&state=open\|placed\|revealed-exact\|revealed-within\|revealed-outside&motion=reduce`. |
| `src/App.tsx` | Two routes: `/dev/numeric-modes` (DEV-only, stripped from production) and `/admin/numeric-modes-lab` (child of the `/admin` `AdminRoute` layout gate). |
| `src/lib/admin/admin-registry.ts` | Registry entry with status `Prototype`. |
| `src/components/Layout.tsx` | On the DEV path the lab brings its own gutters (same rule as Match Grid). |
| `e2e/numeric-modes-lab.spec.ts`, `playwright.arena.config.ts` `testMatch` | Browser acceptance and the capture matrix. |

### Historical baseline comparison
Each reveal also reports what the **production numeric rule** would say about the same guess: `precision.py`, mastery-precision-1.1.0, an exact ROUND_HALF_UP cell. It flags any disagreement with the lab band rule. Example: 660 vs 645 HP is wrong under the baseline and right under a ±5% band. The choice of grading rule is the main open product decision, and the lab shows the comparison on every round.

## 4. Validation (this branch, local)

- **Unit tests:** `npx vitest run src/lib/interaction-grammar/numericModes.test.ts src/pages/dev/numeric-modes src/components/interaction-grammar` → 170/170 pass. 21 of them are new, covering:
  - no leak before the reveal; the keyboard path; the pointer path;
  - invalid entry refused; read-only after the reveal; a content-neutral source scan;
  - grader exact/within/outside; ROUND_HALF_UP parity; the arithmetic of the fixtures.
- **Route/registry suites** (`src/App*`, `src/lib/admin`): 418 pass, 5 fail. **The same 5 fail on the untouched base**: `routeGuards` platform-policies, `routing-contract` legacy multiplayer ×2, and `admin-registry.routes` ×2.
- **Typecheck:** `npx tsc -p tsconfig.app.json --noEmit` reports no errors.
- **ESLint** on changed files: 0 errors (1 pre-existing `App.tsx` warning).
- **Browser:** `npx playwright test -c playwright.arena.config.ts numeric-modes-lab` → 9/9 pass at 1440×900, 390×844 (touch) and 360×640 (touch).
  - Full matrix of 5 rounds × 5 states. The banner is always visible and there is no horizontal overflow.
  - Stat Drop: no answer, band or verdict in the lab DOM before Lock. Keyboard (desktop) or a touch tap (phone) leads to Lock and then the reveal. The track moves at most 1px (document coordinates) from open to reveal.
  - Combat Estimate: an invalid entry is refused with a reason on Enter, and a valid entry leads to the reveal. The baseline disagreement is shown, the input is read-only after the reveal, and Next round resets.
- **Build:** `vite build` succeeds. `/dev/numeric-modes` is not registered in production; only the Layout path string remains, as for Match Grid. The lab ships as a lazy `NumericModesLab-*.js` chunk behind the `/admin` gate.
- **Container notes:**
  - Vite had to bind `127.0.0.1` (no IPv6).
  - Playwright ran against the preinstalled Chromium through a throwaway config, which is not committed.
  - Screenshots: 81 PNGs, written to `NUMERIC_MODES_SHOTS` (default `test-results/numeric-modes`, not committed).

## 5. Exact remaining dependencies (to leave PROTOTYPE-ONLY)

**Both**
1. An owner decision on the grading rule: exact cell (today's production), a relative band with a floor (the lab), or buckets. Then a versioned grader module next to `mastery/questions/precision.py`.
2. A separately scoped backend endpoint. Either a `ranked_modules/<mode>.py`, or an admin lab router modelled on `routes/admin_mastery_state_lab.py` (`require_admin` plus an env flag).
   - It freezes `{value, decimals, band rule, evidence, source, patch}` privately and returns a `NumericReveal`-shaped reveal.
   - New private keys are added to `FORBIDDEN_PRE_REVEAL_KEYS`.
3. A readable patch stamp on every value: `canonical_patch_display(conn)` plus a data fingerprint.
4. Replace `labAuthority.ts` with that endpoint. Keep the primitives unchanged; they already only display `reveal`.

**Stat Drop**
5. Fact source: `ChampionFact` with `certification ∈ {ready, ready_derived}` only. Exclude entities with more than one value. Each metric family gets a **fixed** scale, never one centred on the answer.

**Combat Estimate**
6. A route that resolves the premise server-side (no client stats) and calls `combat_calculations.calculate`. Scope v1 to its supported domain: physical ability damage after armor, with no passive items, runes or crit. Surface refusals instead of numbers.
7. Verification against the production `lol_calc.db`, which is unavailable here.

Deferred, per the brief: all bot/versus speed and scoring changes.
