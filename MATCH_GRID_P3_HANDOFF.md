# MATCH GRID — P3 handoff: production frontend integration (MG-P3)

## Objective

Productionize the approved M1 Match Grid primitive against the frozen P2
`match.v1` backend module, admin playtest only:

P2 `match.v1` → ranked public contract → `matchGridModule` → `QuizRankedMatch`
→ `CanonicalArena`. No visual redesign, no client grading, nothing pushed,
merged, deployed or published.

## Bases

| | SHA |
|---|---|
| Frontend base (fetched, verified) | `origin/main` = `a59526b2a6af7c81c6e0efa3e886fa4aae891c75` |
| M1 reference (not cherry-picked) | `match-grid/m1-fable` `257bbe74` + `4f4f24bc` (built on `bdf4bbf1`, 23 commits behind) |
| P2 backend contract + playtest server | `match-grid/p2-module` @ `7da4f2ec` (local only; not on backend master) |
| Backend production head (untouched) | `origin/master` = `63847f4f` |
| This branch | `match-grid/p3-frontend`, worktree `mogsy/.worktrees/match-grid-p3` |

A clean detached baseline worktree is at `mogsy/.worktrees/mg-p3-baseline`
(`a59526b2`, node_modules junction to this worktree) for regression comparison.

## How M1 was ported (no wholesale restore)

The M1 diff (`bdf4bbf1..4f4f24bc`) was audited: 14 new files + 3 shared files.

* **New files** (no conflict on main): copied, then adapted —
  `src/components/match-grid/*`, `src/lib/match-grid/{board,contract,layout,reveal}.ts`,
  `src/pages/dev/match-grid/MatchGridLab.tsx`, `e2e/match-grid-continuity.spec.ts`,
  `MATCH_GRID_M1_HANDOFF.md`, `docs/MATCH_GRID_AUTHORITY_AUDIT.md`.
* **Shared files** — only the Match Grid line(s) applied onto current main:
  * `src/App.tsx`: the DEV-gated `MatchGridLab` lazy import + `/dev/match-grid` route
    (main had moved; inserted next to the existing DEV routes).
  * `src/components/Layout.tsx`: `/dev/match-grid` added to the full-bleed list.
  * `playwright.arena.config.ts`: `testMatch` gains `match-grid-(arena-)?continuity`.
* **Quarantined**: `src/lib/match-grid/runeAuthority.ts` (runeData.ts × backend
  intersection, synthetic catalogue, `gradeRuneRound`) moved to
  `src/pages/dev/match-grid/labRuneRounds.ts` with a header saying it is DEV-lab
  only; the lab is the only importer. The production module is test-pinned
  never to import it, `runeData`, or Data Dragon.

Journey, Daily, Pro Play, Scrub, Reconstruct, Order Forge, admin routing and
shared styles were not touched beyond the additive lines listed below.

## Production module

* Module id/version: **`match` v1** — exactly P2's id (`MATCH_MODULE_ID = "match"`),
  `servesVersion: v === 1` (a v2 fails closed to the shell's unsupported state).
* `src/lib/ranked-core/modules/matchGridModule.tsx`:
  * `toMatchPublic`: public block → M1 `MatchPublic`; tokens are P2's `e*`/`g*`
    verbatim; `glyph` picks the `RuneTreeGlyph` face and its hue (presentation
    only); `media.src` resolved through `resolveQuizAssetUrl`.
  * Draft board keyed by `(segment, challenge)`; Lock emits ONE
    `{ assignments: [{entity_id, group_id}, …] }`; a refused/failed lock reopens.
  * Locked board after refresh comes from the server echo
    (`own_submitted_choices[0].assignments`).
  * `toMatchReveal`: copies `entity_correct`, `canonical_assignments`,
    `assignments`, `is_correct` and `entity_facts.rune_type` (worded
    Keystone / Minor rune) — no comparison anywhere.
  * Everything handed to the primitive is memoised **by value**: every poll
    re-parses the snapshot, and the primitive's reveal clock keys on object
    identity (found live: the choreography restarted each second).
  * `FitToStage`: uniformly scales the whole board to the arena stage on short
    desktops (see Continuity), keyed per deal and committed before paint.
  * `ownsSubmission`, `ownsResultReveal` (once its own reveal is on the board).
* Registered additively in `registry.ts`; added to `INLINE_LOCK_REVEAL_MODULES`
  (a bot settles the lock in the same transaction; the inline
  `challenge_reveal` is attached only when it carries a `match` block).
* Host seams (additive): `centralStage.liveModuleTitle`, `SegmentTranscript`
  (title + "N of M relationships correct" from the server's own `matched` /
  `required`, never points), `QuestionReviewCard` (`MatchBody`), `ModuleSigil`
  (`Network` icon), `questionIcons` (subject + outcome), `questionTimelineParts`,
  `rankedResultsModel` (subject; one board = one question), `roundMedia`
  (preload the dealt sigils' art).
* Admin: Leaguecraft → Ranked → Playtests → **Match Grid** panel
  (`MatchGridLaunch`, preset `admin.match`, same `PresetLaunch` pattern as
  Reconstruct). Not in normal rotation, Daily or any public preset.

## SegmentChoice

```ts
| { assignments: readonly { readonly entity_id: string; readonly group_id: string }[] }
```
Additive branch on `client.ts::SegmentChoice`; `submitSegmentChallenge` sends
`{assignments:[{entity_id, group_id}]}` (ids copied field by field, nothing
else). Type-level tests: the match shape is a `SegmentChoice`; `placement`,
`order`, `selected` still are; an `{entity, group}` (name-identity) shape is
not. The primitive's own `MatchResponse` (`{entity, group}`) is deliberately
NOT a transport shape; only the wrapper converts it.

## Contract readers (`contracts.ts`)

`MatchBlockView` (pre-lock), `MatchChallengeReveal` (own lock reveal / inline
`challenge_reveal`), `MatchSettlement` (`segment_reveal`), `ReviewMatch`
(`kind: "match"`), `SegmentStateView.ownSubmittedAssignments` (optional, match
only). Fail closed: `membership` must be `"one"`, exactly one challenge,
non-empty distinct entity/group ids, strict strings/booleans, duplicate rows
refused. Inverse review guard: an unrevealed round carrying a canonical
board, mark, fact or verdict throws.

**No-leak:** added to the pre-lock forbidden walk — every P2 reveal-only key
(`canonical`, `canonical_assignments`, `settled`, `settled_assignments`,
`answers`, `entity_correct`, `correct_group`, `entity_facts`) plus the private
half's identity names (`rune_key`, `tree_key`, `is_keystone`, `rune_type`,
`tree_label`). Each is tested at block and challenge level.

## Proof there is no frontend grading

* `matchGridModule.test.tsx` source contract: the wrapper, `MatchGrid.tsx`,
  `board.ts`, `contract.ts`, `layout.ts`, `reveal.ts` contain no
  `runeData` / `labRuneRounds` / `runeAuthority` / `gradeRuneRound` /
  `RUNE_PERKS` / Data Dragon; the wrapper contains no group-id equality and
  never uses a label as a token.
* Pre-lock DOM: no `data-mark`, no Keystone/Minor/correct text (unit) and
  zero marks on a full board in the live arena.
* Live wire: the server's echo of the locked body was opaque ids only
  (`e0→g0 … e7→g0`); correctness, canonical board and facts arrived only in
  the server's `challenge_reveal`.

## Real-server playtest (P2 @ `7da4f2ec`)

Setup (all local, scratch only; nothing in either repo):
* P2's real `api_server:app` on `127.0.0.1:8077`, scratch SQLite DB, startup
  certified **62 runes** (snapshot `1aae7795ede2`). Auth through the backend's
  own test/e2e HS256 path (`SUPABASE_ALLOW_HS256` + a locally generated
  secret); the ONLY substitution is the Supabase owner-state RPC
  (`routes._auth._owner_state`) answering "owner" for the one local test user —
  the same seam P2's HTTP tests replace. Module, service, routes, grading,
  persistence and review are real.
* Frontend vite on `:8123` with the repo's own dev-only E2E identity seam
  (`VITE_E2E_AUTH=1`) and a dummy Supabase URL, so no real Supabase is contacted.
* The admin page itself could not be driven: under the E2E identity,
  `useOwnerAuth`'s dev-only branch returns a new `ensureAuthorized` each render
  and `AdminAuthProvider` loops (pre-existing on main, not touched). The admin
  launch was therefore made with the identical call `PresetLaunch` makes
  (`joinQueue(null, …, {matchWithBot: true, preset: "admin.match"})` →
  `/quiz/ranked` with the match id); the panel and request are unit-tested.

Lifecycle observed in the real `QuizRankedMatch → CanonicalArena`:
1. `admin.match` created (`rkb_211d…`, `rkb_91a2…`, …); the arena opened the
   Match Grid round with P2's dealt runes/trees.
2. Assignments by tap→tap, direct drag, keyboard digits; reassignment
   (Revitalize Sorcery→Resolve); Lock disabled until the board was full; no
   marks pre-lock.
3. Lock → server reveal: "one corrected · seven of eight stable", Cash Back
   travelled from Precision to its canonical Inspiration seal; Ranked score
   showed the canonical "Incorrect +0".
4. Next segment opened in the same host; a timed-out segment advanced
   correctly; an exact board scored +2 (P2's one-board-one-outcome).
5. Finished result: canonical result screen ("Defeat 2–6 · 1/3 modules ·
   Unrated · Bot matches do not move the ladder").
6. Review Match (Leaguecraft history) rendered the frozen review:
   "Q2 of 3 · Match Grid · 7 of 8 relationships correct", each rune with
   "You: <seal> → <canonical seal> · Keystone/Minor rune", Cash Back marked ✕.

Refresh/resume:
* Reload right after a Lock (bot already settled): resumed into the next
  segment, and on the final round into the finished result.
* "Locked, opponent still thinking" could not be held live — against the bot
  the next server read settles the segment — so it is covered by the unit
  test that rebuilds the locked board from P2's `own_submitted_choices` echo.

Frozen review guarantee: the review JSON was captured, then in the scratch DB
Cash Back was renamed, moved to Domination and made a keystone, and Fleet
Footwork renamed and retired (`is_current=0`). The re-fetched review payload
was **byte-identical** and contained neither mutated value; the mutation was
then reverted. The frontend renders that payload directly (no rune lookup).
The capture is committed as `__fixtures__/matchGridP2ReviewCapture.json`.

## Continuity (real host, real P2 server)

`e2e/match-grid-arena-continuity.spec.ts` (needs the local server; see header):
per test a fresh `admin.match`, first deal played — drag, keyboard
reassignment, partial board, full board, Lock, server reveal, settled, next
deal — sampling stage / module viewport / root / head / board / foot / status /
lock on every painted frame (read just after paint) and every DOM commit.

| Viewport | normal | reduced | worst painted movement | reveal stages reached before next deal | fit scale (trio / quartet) |
|---|---|---|---|---|---|
| 1600×900 | pass | pass | 0.00px | freeze, marks, travel, ledger | 1 / 1 |
| 1280×720 | pass | pass | 0.00px | freeze, marks, travel, ledger | 0.96 / 0.88 |
| 1366×650 | pass | pass | 0.00px | freeze, marks, travel, ledger | 0.82 / 0.75 |
| 1280×600 | pass | pass | 0.00px | freeze, marks, travel | 0.72 / 0.66 |
| 390×844 | pass | pass | 0.00px | freeze, marks, travel, ledger | 1 (ledger) |
| 360×640 | pass | pass | 0.00px | freeze, marks, travel, ledger | 1 (ledger) |

Also asserted in every case: no stage overflow, no page scroll (focus moves
included), no horizontal page overflow, no sigil clipped outside the board,
no colliding or clipped seal names. Reduced motion settles instantly to `done`.
The M1 lab spec still passes 13/13 after the primitive changes.

Primitive adaptations made because the real host differs from the lab (no
redesign; same picture):
* Composition: constellation only where the fan fits (seal pitch ≥ ring-1
  shoulder clearance, M1 sizes) and the board is wider than a phone; else
  M1's ledger. The arena stage is ~685px at 1600×900, so 4–5-seal boards use
  the ledger on desktop; trios use the constellation.
* Ledger seals centred in their 92px column (names clipped at the card edge).
* Optional `heightTier` prop; the wrapper chooses it from the arena budget.
* Pointer mapping and width measurement are transform-aware (fit scale).

Captures: `C:/Users/mlmit/OneDrive/Desktop/match-grid-p3-shots/arena/`
(`<viewport>[-rm]-01-open … 04-full … 05-reveal-f0..f3 … 06-settled … 07-next`)
and `…/review/` (unrevealed-round review, desktop + mobile).

## Accessibility (real host)

Inspected the accessibility tree in `CanonicalArena` at 1600×900: heading
"Seat each rune under its tree"; seal buttons "Sorcery, rune tree 1 of 3.
Holds zero."; sigil buttons "Grasp of the Undying. Unsorted, in the well.";
"Lock in (seat every rune first)"; one polite `role="status"` live region.
Targets 72px seals / 46px sigils / 44px lock (unscaled). Marks are glyph + text;
reduced motion honoured. See Limitations for scaled short desktops.

## Tests

* `src/lib/ranked-core/modules/matchGridModule.test.tsx` (47): SegmentChoice
  type tests; public parse with exact opaque ids; 7 malformed-board fail-closed
  cases; 13 forbidden reveal keys at two levels; echo after refresh; own
  reveal, refusal of a premature reveal, malformed reveal; settlement; review
  + inverse guard; transcript wording; registration / version fail-closed;
  inline lock reveal; open board no-leak; keyboard + tap→tap + reassignment →
  one complete opaque-id Lock payload; direct drag; refused lock reopens;
  refresh echo; 1:1 reveal mapping; partially wrong reveal (reduced motion);
  all-correct reveal; source contract (no grading / no rune data).
* `src/components/quiz/workspace/QuestionReviewCard.matchGrid.test.tsx` (4):
  the REAL P2 review capture — parse, frozen board rendering, timeout round,
  outcome/subject/tally seams.
* `src/pages/admin/ranked/MatchGridLaunch.test.tsx` (4) and an
  `AdminShell.areas` placement test.
* `registry.test.ts`: pinned module set + `match` (as Reconstruct did).
* Retained M1: `MatchGrid.test.tsx` (18), `board.test.ts` (14) — still valid;
  no prototype test depended on the quarantined adapter.
* E2E: `match-grid-arena-continuity` 12/12 (real server); M1
  `match-grid-continuity` 13/13 (lab).
* `tsc -p tsconfig.app.json`: clean.

Regression (scoped suite: ranked-core, ranked-public, ranked-arena,
quiz/workspace, quiz-ranked, admin pages, admin lib, interaction-grammar,
match-grid; `--pool=forks` ×3; the full suite OOMs a worker on this machine on
both trees):

* clean `a59526b2` baseline: **9 failed | 254 passed** files (263)
* this branch: **9 failed | 258 passed** files (267) — the **same 9** files;
  **no new failure**. (`QuizRankedMatch.rfx1b3` / `rm1Feedback` flaked once
  under load and pass in isolation; `registry.test.ts` was the expected
  pinned-set update.)

## Limitations

* **Reveal time in the arena.** P2 freezes `reveal_window_ms = 3000` for the
  `admin.match` preset; the arena (correctly) ends the hold at the next round's
  `started_at − module title`, leaving ≈1.5s — the M1 choreography's entire
  budget. Corrections visibly travel at every size, but the ledger plate is on
  screen only briefly (≈0.2s; at 1280×600 the swap lands during travel). The
  settled board remains fully available in Review Match. Recommended backend
  follow-up (not done; P2 is frozen): raise `reveal_window_ms` for `match`
  (≈5000) so the ledger can be read.
* **Short desktops scale the board.** The arena stage at 1280×720 / 1366×650 /
  1280×600 is shorter than M1's compact tier, so the board is uniformly scaled
  (0.96 → 0.66). At ≤0.95 the sigils fall below 44px (e.g. ~30px at
  1280×600); mouse/keyboard paths are unaffected but the 44px target rule is
  not met there. A denser tier or a taller stage allowance is a design call.
* **Desktop uses the ledger for 4–5 seals** because the arena stage (~685px)
  cannot hold a four- or five-seal fan without collisions.
* Admin page not driven live (pre-existing dev-only E2E loop, see above).
* "Locked, awaiting opponent" refresh verified by unit test only (bot timing).
* Full vitest suite OOMs on this machine (both trees); scoped comparison used.

## Files changed

Modified (additive): `playwright.arena.config.ts`, `src/App.tsx`,
`src/components/Layout.tsx`, `src/components/quiz/workspace/{ModuleSigil.tsx,
QuestionReviewCard.tsx, questionIcons.ts, questionTimelineParts.tsx}`,
`src/components/ranked-arena/SegmentTranscript.tsx`,
`src/lib/ranked-core/{centralStage.ts, media/roundMedia.ts,
orderForgeLockReveal.ts, modules/registry.ts, modules/registry.test.ts}`,
`src/lib/ranked-public/{client.ts, contracts.ts}`,
`src/pages/admin/areas/{AdminRankedPage.tsx, AdminShell.areas.test.tsx}`,
`src/pages/quiz-ranked/rankedResultsModel.ts`.

New: `src/lib/ranked-core/modules/matchGridModule{.tsx,.test.tsx}`,
`src/pages/admin/ranked/MatchGridLaunch{.tsx,.test.tsx}`,
`src/components/quiz/workspace/QuestionReviewCard.matchGrid.test.tsx`,
`src/lib/ranked-public/__fixtures__/matchGridP2{WireCapture,ReviewCapture}.json`,
`e2e/match-grid-arena-continuity.spec.ts`, `MATCH_GRID_P3_HANDOFF.md`, and the
ported M1 files (primitive, helpers, lab, lab spec, M1 handoff, audit).

## Final

See the commit on `match-grid/p3-frontend` (local only).

## MG-P3.1 — short-desktop layout / accessibility repair

**Root cause (measured in the real arena):** M1 stacks head (58) + instrument +
a full-width well (168–176) + foot (56). The arena stage leaves ~490 / ~420 /
~370px at 1280×720 / 1366×650 / 1280×600, but the board needed 510 / 560 /
626px (3 / 4 / 5 trees). P3 scaled the whole board to 0.96 → 0.59, which put
rune targets at 26–44px.

**Strategy:** a module-local **rail** arrangement of the approved ledger,
with no scaling (`FitToStage` removed):
- The well moves into a column beside the wires, with the prompt at its top
  (DOM order unchanged).
- Rows are 56px, with 48px seals and 44px sigils, and each tree name rides on
  its wire.
- The seat pitch is 58px, so captions never touch.
- It is selected only when the host passes `maxHeight` (the arena stage's
  room) and the stacked board would not fit. Phones and the M1 lab are
  unchanged.
- `boardPoint` remains transform-aware; with no transform it is the identity.

**Rendered targets (real host, all deals):**

| Viewport | 3 trees | 4 trees | 5 trees | min rune | min seal |
|---|---|---|---|---|---|
| 1600×900 | constellation | ledger | ledger | 44×44 (46 in constellation) | 48×48 (72 in constellation) |
| 1280×720 | rail | rail | rail | 44×44 | 48×48 |
| 1366×650 | rail | rail | rail | 44×44 | 48×48 |
| 1280×600 | rail | rail | rail | 44×44 | 48×48 |
| 390×844 | ledger | ledger | ledger | 44×44 | 48×48 |
| 360×640 | ledger | ledger | ledger | 44×44 | 48×48 |

Old (P3, 1280×600): rune 26–33px, seal 28–52px.

The spec asserts rendered box ≥44, rendered == layout size (nothing shrunk by
a transform), and a hit test at the center ±20px on every rune and seal.

**Continuity (real server, P2 `7da4f2ec`):**
- All 12 cases at 0.00px. 10 passed in a single run; the two 360×640 cases
  passed after the spec change below, in a separate run.
- The spec now plays all three deals.
- At 360×640 the 4- and 5-tree ledger is taller than the screen. The player
  must scroll to reach Lock (the arena's mobile stage scrolls by design). The
  spec marks that deliberate scroll; any scroll the page makes by itself still
  fails.

**Not done at this commit (usage limit):**
- Final reveal certification against MG-P2.1
  (`match-grid/p2.1-release-candidate` @ `2464703c`, hold 4500ms). The
  launcher `scratchpad/mg_backend/run_p21.py` and launch entry `mg-p21-be` are
  prepared but were not run.
- The M1 lab spec has not been re-run since the rail change.
- The final scoped regression run was started but not read.
