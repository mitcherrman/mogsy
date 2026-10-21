# DAILY V2 — Lane A handoff: post-answer Meta Reflex value display (FRONTEND)

Date: 2026-10-20 · Branch `daily-v2/a-meta-values-fe` · rooted at frontend `main` `9ca661186954fca615cedc5295d4f9d51b7fb4fa` (`origin/main` re-checked at start: unchanged).
Code commit: **`f2bc0b16`**. Docs/handoff commit: the commit that follows it on the branch (`git log -2`).
**Not pushed. No PR opened** — see §7 (open draft PR #108 touches the same two files). Nothing merged, published, or deployed.

Sources read: the owner orchestration handoff (`MOGZY_DAILY_V2_IMPLEMENTATION_ORCHESTRATION_2026-10-20.md`, section A). The companion spec `MOGZY_DAILY_V2_THREE_ACTS_SPEC_2026-10-20.md` was **not available**; nothing here depends on it (open questions in §8).

## 1. What changed

After a Meta Reflex card **settles**, each side of the held card reveal now shows the **server's own display text** for that side, drawn on the card the player was just looking at:

| card kind | caption on each side | source |
|---|---|---|
| magnitude / classification | the compared value with its unit, e.g. `3,450 gold`, `1,984 HP`, `Ranged` | `own_card_reveals[].left/right.value_display` (→ `SettledCardReveal.left/right.valueDisplay`) |
| recognition | the ability's name (compares nothing, so `value_display` is null) | `own_card_reveals[].left/right.label` |

Outcomes covered: `correct`, `incorrect`, `timeout`, `unanswered`, and a mixed five-card block. The correct side stays green, the player's own wrong pick stays red; the untaken side shows its value too.

Files (3, all frontend, 454 + / 12 −):

| file | change |
|---|---|
| `src/lib/ranked-core/modules/metaReflexModule.tsx` | `ChoiceCard` gets an optional `caption`; new `settledCaption()`; `SettledCard` passes it; card reserves bottom padding; two recognition-art sizes step down; tag nudged up 1–3 px |
| `src/lib/ranked-core/modules/metaReflexModule.reveal.test.tsx` | +33 tests (19 → 52) |
| `src/components/ranked-arena/QuestionStageGeometry.test.tsx` | **one expectation** updated (§6) — the only file touched outside the lane's owned set |

Not touched: `contracts.ts`, backend, scoring, shared timing, arena shell / timeline / registry, any other branch.

### Behavioural rules (all pinned by tests)
- **Nothing before settlement.** A live card has no `caption`: no DOM node, no text, no digits in its `aria-label` (tests `no value before settlement`). The contract reader already refuses a payload that discloses the active card; this adds the render-side proof.
- **No gap, ever.** The caption is opaque text: never parsed, re-formatted, or subtracted. Test feeds `3,450 gold` vs `3,400 gold` and asserts `50` / "gap" / "more than" appear nowhere; another feeds unparseable text (`about 3.4k`, `n/a`) and asserts it is drawn verbatim.
- **Null / blank / missing display (historical rows) → omission**, not a placeholder; the side is drawn exactly as before and is *spoken* exactly as before (`Hexdrinker, your answer, correct answer`). Whitespace-only is treated as absent; one side present / other null draws one plate.
- **Single verdict stays in the arena header.** No result plate in the viewport; existing tests asserting that still pass, plus a new one with values on.
- **Screen reader:** the visible plate is `aria-hidden`; the button's `aria-label` now carries it: `Hexdrinker, 3,450 gold, correct answer`, `Giant's Belt, 3,400 gold, your answer, incorrect`, neutral side `Giant's Belt, 3,400 gold`; settled recognition: `Xerath W, correct answer` (instead of `Left option`).
- **Reduced motion:** the plate has no transition/animation at all (test asserts no `animate-|transition|duration-|motion-` class), so there is nothing to strip; it is in the **first commit** of the reveal (test with fake timers).
- **Readability inside the 1.5 s hold:** server freezes `CARD_REVEAL_WINDOW_MS = 1500` (`ranked_modules/meta_reflex.py:102`). The values appear on the same paint as the reveal, are 13 px/900-weight (16 px on `lg`) on a dark chip, 1–2 tokens long, and sit beside the header verdict. I did **not** change timing. A 1.5 s read of two short numbers is feasible but is a human-factors judgement I could not make from a screenshot: recommended owner mobile playtest (§8).

## 2. Geometry ("no reflow") — design and proof

The caption is `position:absolute` in a strip of bottom padding the card **reserves in every phase** (`px-3 pb-6 pt-3`, `lg:px-5 lg:pb-7 lg:pt-5`, previously `p-3` / `lg:p-5`). Live and settled cards are therefore the same box with the same art/label positions; the plate adds no height and moves no sibling. `CARD_ROW_H` (`h-[9rem] lg:h-[13rem]`) is unchanged, so the block's surface height is unchanged.

Side effects, both within the module and both necessary to fit the reserved room:
- recognition art: **no `sm:` bump** (was 112 px; the 144 px card holds 104 px) and **152 px (`9.5rem`) not 160 px at ≥1500 px** (the 208 px card holds 156 px). Phone (96 px) and `lg` (144 px) unchanged.
- live card content sits ≤6 px higher on phones (3 px at `lg`) because of the larger bottom padding.
- tag moved `top-1` → `top-px` below `lg` so a two-line label does not make it overlap the art.

Measured in a real browser (Browser pane, Vite dev server, cwd = worktree) with the real `metaReflexModule.Viewport` fed backend-shaped fixtures, via same-origin iframes at true viewport widths (`docs/daily-v2-lane-a/harness/`):

| width | card (w×h) | row h | surface h | horizontal overflow | plate inside card | plate truncated | label→plate gap (2-line label) | recognition art→plate gap |
|---|---|---|---|---|---|---|---|---|
| 320 | 140×144 | 144 | 305 | none (`scrollWidth`=320) | yes | no | 3 px | 4 px |
| 360 | 160×144 | 144 | 305 | none | yes | no | 3 px | 4 px |
| 390 | 175×144 | 144 | 305 | none | yes | no | 3 px | 4 px |
| 640 / 768 / 1023 | 298–338×144 | 144 | 313 | none | yes | no | 4 px | 4 px |
| 1024 / 1280 | 338×208 | 208 | 377 | none | yes | no | 16 px | 4 px |
| 1500+ (1600 tested) | 338×208 | 208 | 377 | none | yes | no | 8 px | 0 px |

Seven cases per width (correct item, wrong with a 2-line 28-char label + 14-char values, timeout, classification, recognition, legacy-null, `1,984 HP`): row and surface heights were identical across **all** of them including the legacy-null case (omitted plate keeps the reserved room). Live-vs-reveal position probe (surface, prompt, row, card, art, label, status `top/height/left`) was **identical** for an item card and a recognition card at 320 and 1280 px.

Honest limits: no two-line label was exercised at 640–1023 px (cards are ≥298 px wide there; a >30-char label would be needed); 1500 px exactly and 1499 px were not sampled (1600 was); the recognition-art→plate gap at 1600 is 0 px (touching, not overlapping).

## 3. Screenshots

`docs/daily-v2-lane-a/arena-{320,360,390,1280}-{correct,wrong,timeout}.jpg` — the **real arena** (`/dev/ranked-shell-probe?mrlive=1&host=daily`, step 4: first card's held reveal) at each width, with the header verdict ("CORRECT / INCORRECT / TIMED OUT") and the values on both sides. Wrong/timeout were produced by wrapping `window.fetch` in the page to rewrite the served `own_card_reveals[last]` (outcome + selected/correct ids); the arena computes the verdict from that, so the header shows the real projection. The probe's own dev chip bar was hidden for the shots. Caveats: the Browser pane here is not on screen, so screenshots needed retries; the 1280 shots are the pane's scaled 800×500 render; the 1280 timeout frame was caught before its header plate faded in; the "Back to Quiz" bar overlays the top of the desktop header.

Note (pre-existing, not changed): at desktop the arena shows the verdict twice (centre plate over the card **and** the header strip). That is arena chrome (`central-result` + header), outside this lane.

## 4. Frozen assumptions about the server `own_card_reveals`

Audited read-only at backend `origin/master` `a018bc0ccfbebc72c4f4f50c0ac15ffedbe83ffa`, `ranked_modules/meta_reflex.py`.

**Correction to the orchestration text:** `reveal_challenges` (line 1115) is the *post-resolution* module reveal and carries **raw** `left_value` / `right_value` / `gap` — it has no `value_display`. The `value_display` the frontend consumes comes from **`settled_card_reveals`** (line ~1180, `supports_card_reveals = True`), which feeds `segment_state.own_card_reveals`. This lane uses only the latter.

Frozen per entry of `own_card_reveals[]`:
```
challenge_index, kind, entity_kind, family_id, champion_level (frozen row),
outcome: "correct"|"incorrect"|"timeout"|"unanswered"   (server word; client never re-derives)
selected_card_id|null, correct_card_id|null              (positional tokens "c{i}:left|right")
left:  { label, value_display }   right: { label, value_display }
```
- `value_display = format_card_value(family_id, kind, value)`: `None` for recognition (and null value); classification = the word verbatim; magnitude = `f"{int(round(v)):,}{VALUE_UNITS suffix}"` (` gold`, ` HP`, ` AD`, ` armor`, ` MS`, ` range`, ` AP`, ` MR`; level variants share the stat's unit via `value_unit()`); an **unknown family renders the bare grouped number** (no unit) — by design in the backend.
- Recognition `label` is disclosed only here; `value_display` is null for it.
- **Not** sent: opponent's choice, `gap`, `family_id` is sent but ignored by the frontend reader (`readSettledCardReveal` keeps `kind`, `entityKind`, outcome, ids, `left/right.{label,valueDisplay}`); `champion_level` is in the row but the reader drops it (the card already has it). Entries exist only for cards the viewer has **finished**; the frontend reader additionally throws if an entry's index ≥ the viewer's active index.
- Historical replies: `value_display` may be null or missing (reader → `null`); the reveal must still render (tested, both shapes).
- The frontend reader needed **no change** (`contracts.ts` untouched); there was no failing test demonstrating need.

**PR #68** (`audit/daily-cross-day-question-frequency-20261020`, head `01bcfeea`, base = master `a018bc0c`, draft): its `meta_reflex.py` diff touches only `build_cards` / `_build_cards` (DREP1 `avoid` re-deal, `AVOID_REDEALS`), `_card_ref`, and `generate_segment(avoid_refs=…)`. **`settled_card_reveals`, `format_card_value`, `VALUE_UNITS` and `reveal_challenges` are untouched** — the reveal payload is unchanged by #68.

Version note: the module's `servesVersion(v) = v >= META_REFLEX_MIXED_VERSION (4)`, so a `item_cost_duel.v5` block is served by the same renderer; `challengeCount` is read from state, so a 3-card sprint reads `n / 3` with no change here (not exercised against a real v5 payload — none available locally).

## 5. Commands and results (all local; GitHub Actions is billing-blocked, so CI absence is not a pass)

Tooling kept **outside the repo** (scratchpad): `vitest.scratch.mts` (plain object, react-swc dropped, `esbuild.jsx = "automatic"`, `root`=worktree, `@`→`<worktree>/src`), `vite.scratch.mts`, and `hook.cjs` (`Module._resolveFilename` maps `@rollup/rollup-win32-x64-msvc` → `@rollup/wasm-node@4.64.3`, same as `node_modules/rollup`). `pnpm` was never run. `node_modules` is a junction to the primary checkout's.

```
# focused (97 tests)
ROOT=<worktree> NODE_OPTIONS="--require hook.cjs" npx vitest run --config vitest.scratch.mts src/lib/ranked-core/modules/metaReflexModule
  -> Test Files 3 passed (3) · Tests 97 passed (97)        (level 23, module 22, reveal 52)

# negative control: new reveal tests against the UNMODIFIED module (git show HEAD~:… copied over, then restored)
  -> 17 failed | 30 passed (47 at that time)               (the 30 = the 19 originals + absence/legacy/no-leak tests that must pass on old code too)

# related suites, one process per chunk set, --maxWorkers=4
#   src/lib/ranked-core src/components/ranked-arena src/lib/ranked-public src/lib/question-feedback
#   src/components/question-feedback src/pages/quiz-ranked        (224 files)
  BASELINE (pre-edit, 9ca66118): 9 failed | 215 passed files · 17 failed | 3011 passed tests
  AFTER   (f2bc0b16 + later test additions): same 9 failing files, same 17 failing tests (diff of × lines empty)
# src/test (guards/security)
  detached baseline checkout at 9ca66118: 23 failing tests
  AFTER: 20 failing tests, all a subset of the baseline's (the 3 only-in-baseline are in src/test/guards: noStaticLeagueFacts, users1AudienceIdentity ×2 — they do not fail in my tree; I did not investigate why)
# tsc
npx tsc --noEmit -p tsconfig.app.json  -> 2 errors, both in files this lane does not touch:
  src/components/onboarding/OnboardingProfile.tsx(180,48) TS2345, src/lib/identity/connections.ts(263,13) TS2345
  (present independent of this change; I did not run tsc on a second checkout — the two files are unmodified and no error mentions a touched file)
# build
vite build --config vite.scratch.mts --outDir <scratch>  -> "built in 41.89s" (scratch config: no react-swc/componentTagger; `public/sitemap.xml` untouched)
```
Pre-existing failures are the CRLF/source-reading family (`core.autocrlf=true` leaves CRLF in the working copy; stylesheet/source tests match `\n`), e.g. the 4 in `QuestionStageGeometry.test.tsx`, the masterySlice JP4/JP5 stylesheet tests, `orderForgeModule` OF4 scene, migration byte-identity tests. **Reported, not fixed.** Caveat: because those tests fail before *and* after, they cannot detect a regression in the assertions they contain; the four `QuestionStageGeometry` ones were read — none references the ChoiceCard classes I changed.

## 6. The one edit outside the owned files (for E)

`QuestionStageGeometry.test.tsx` pins the recognition-art class string of `metaReflexModule.tsx` (`"h-24 w-24 sm:h-28 sm:w-28 lg:h-36 lg:w-36"`). Fitting the reserved caption room required dropping the `sm:` step, so that single `toContain` now reads `"h-24 w-24 lg:h-36 lg:w-36 min-[1500px]:h-[9.5rem] min-[1500px]:w-[9.5rem]"`. Intent of the test (a fixed square slot per breakpoint, never sized by the asset) is unchanged. If you prefer to keep the old art sizes, the alternative is to raise `CARD_ROW_H`, which is a frame-height change for the whole arena — I did not take it.

## 7. Open PR collision — why nothing was pushed

Open frontend PRs checked (16) via the GitHub REST API (token from `git credential fill`): only **#108 `fix/stat-check-final-verdict-20261019`** (draft, head `85f02189`, base `7a4ebed2`) touches `metaReflexModule.tsx` and `metaReflexModule.reveal.test.tsx`. Per the brief I did **not** push the branch or open a PR.

Merge analysis (throwaway detached worktree, since removed): `git merge-tree` and a real merge of #108 into `f2bc0b16` are **textually clean** (its hunk is in `BlockPhase`'s waiting status; mine are in `CardArt`/`ChoiceCard`/`SettledCard`); after the merge the three Meta Reflex test files and `QuestionStageGeometry` give 185 pass / the same 4 pre-existing failures.
**Semantic note for E / owner:** #108 adds a coloured `CORRECT / INCORRECT / TIMED OUT` word to the *final-card waiting status line* inside the viewport. That is a second textual verdict beside the header's (the module's own comment and the POINT1 tests say the header is the one result slot). Whichever lands, decide that once; this lane's tests do not forbid #108's line (they assert the absence of a verdict only for the mid-reveal state).

## 7b. Remaining PR collisions elsewhere
PR #104 (W26Q, `worlds26/quiz-frontend`) and #110/#45/#46 etc. do not touch the module, `ranked-arena/` or `contracts.ts`.

## 8. Open questions / spec-dependent items (not guessed)
1. **Spec unavailable.** Anything the three-acts spec says about the Meta Reflex sprint's reveal copy (e.g. whether the value line should carry a level or "unusual pair" caption, show a unit legend, or reveal a *server-supplied gap* — the orchestration says a gap would need its own server contract) is untouched.
2. Whether the 3-card V2 sprint runs on `item_cost_duel.v5` with the same `own_card_reveals` shape (assumed; renderer serves v≥4).
3. Reveal hold: V1 server window is 1.5 s; does V2 keep it? Needs an owner mobile playtest for readability of two values + the header verdict in 1.5 s. If too short the fix is a server-frozen window (backend `PAYLOAD_REVEAL_WINDOW_MS`), not this lane.
4. Recognition reveal now names the abilities (labels the server already discloses). Confirm product wants that on the card; the alternative is values-only, which would show nothing on a recognition card.
5. `format_card_value` leaves unknown families without a unit (bare number) — a content/backend concern surfaced here, not changed.
6. PR #108's second verdict (§7).
7. Unverified: two-line labels at 640–1023 px; exactly 1500/1499 px; a real v5 payload; real device (only emulated viewport widths in the in-app Browser pane); the pane's DPR/scrim rendering of the desktop arena.

## 9. What E needs
- Take `f2bc0b16` (3 files). It is independent of B/C/D. Rebase onto whatever `main` is then; expect a trivial or no conflict with #108 (see §7) and decide the verdict-line question.
- No registry/shell/timeline/contract change is required for this lane; `QuestionStageGeometry.test.tsx` has the one-line expectation change (§6) — keep it if arena tests are rebased.
- Re-run after integration: `metaReflexModule*` (97) and the `ranked-arena` chunk; the visual probe is `/dev/ranked-shell-probe?mrlive=1&host=daily` (advance to step 4 / 6 / 8 for first / middle / final reveal).
- Reproducing the screenshots/matrix: `docs/daily-v2-lane-a/harness/` (`index.html`, `main.tsx`, `matrix.js`) → copy into `<worktree>/.harness-a/`, start Vite with the scratch config and cwd = the worktree, open `/.harness-a/index.html?card=0&outcome=incorrect[&long=1|&null=1|&phase=live]`, and run `window.__runMatrix([320,360,390], window.__cases)` in the page. (The harness imports `../src/index.css`, so it must sit one level under the worktree root.)
- Not done: no push, no PR, no deploy, no merge. Lane state recorded in memory.
