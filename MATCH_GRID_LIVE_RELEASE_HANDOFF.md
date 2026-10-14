# MATCH GRID — Live Release Integration (admin-only) — Handoff

Date 2026-10-13/14. Claude Opus 5.5, fresh instance. The same file is committed in
both release branches.

## Status: READY FOR ADMIN RELEASE

Match Grid (`match.v1`, preset `admin.match`) is integrated on current backend
`master` and frontend `main` by itself, without Scrub, Assembly or any other
RANKED-INT1 stage. The data/startup gate is satisfied **without any migration**:
Match Grid reads the committed, digest-sealed wiki rune snapshot in-process and
never reads or writes the `runes` table. On a disposable copy of the production
database, the release branch's startup leaves the schema, all four rune tables
and `GET /api/meta/runes` byte-identical to clean master's startup.

Nothing was merged or deployed. No production, Railway or Supabase database was
touched. The branches are pushed and the PRs are drafts (§8).

---

## 1. Bases and sources (verified at start and again at the end)

| | SHA |
|---|---|
| Backend `origin/master` | `aa8c041e23a4ffb7c4bd50a41be2a9e103f2d907` (PR #15, Reconstruct R3C release) |
| Frontend `origin/main` | `9fb89ac3bf0a8f5883ab1ffbdf4555f6b741f739` (UX3A Worlds merge) |
| Match Grid backend RC `match-grid/p2.1-release-candidate` | `2464703c` (worktree `.worktrees/mg-p21-rc`, clean) |
| Match Grid frontend `match-grid/p3-frontend` (P3.1) | `453aa333` (worktree `mogsy/.worktrees/match-grid-p3`, clean) |
| RANKED-INT1 backend / frontend (reference only, not merged) | `ea7645d9` / `9ff45c49` (clean; the FE keeps its own untracked local Playwright config) |

Handoffs read: RANKED-INT1 integration handoff, its rune-migration checklist,
MG-P1, MG-P2 (+P2.1), MG-P3 (+P3.1), Reconstruct R3B §9 (environment). No newer
Match Grid P2.1/P3.1 or INT1 release handoff exists.

## 2. Branches and worktrees

| | Branch | Worktree | Baseline worktree |
|---|---|---|---|
| Backend | `match-grid/live-release-backend` | `League_Combat_Simulator/.worktrees/mg-live-be` | `.worktrees/mg-live-be-base` (detached `aa8c041e`) |
| Frontend | `match-grid/live-release-frontend` | `C:/Users/mlmit/mogzy-wt/mg-live-fe` | `C:/Users/mlmit/mogzy-wt/mg-live-fe-base` (detached `9fb89ac3`) |

Both frontend worktrees hold a `node_modules` **junction** to the main checkout:
`rmdir` it before any `git worktree remove`. Upstream tracking was unset on both
new branches (no bare `git push` reaches master/main).

## 3. Included commits

Backend (`aa8c041e` →):
1. `a0608387` — port `match.v1` from the P2.1 RC by file: `ranked_modules/match.py`;
   registry; `admin.match` preset + `match_test_format`; readiness; review;
   projections; answer-safety keys; the `assignments` choice schema; the two
   pinned-set tests; the MG test suite and wire capture; MG-P1/P2 handoffs; and the
   read-only half of `rune_canonical` (`fetch`, `normalize`, the 2026-10-10
   snapshot, byte-identical blob `30f36af6`). **Not ported:** the `api_server`
   lifespan hook, `migrate_add_rune_canonical.py`, `rune_canonical`
   `apply/read/audit/testing`, and MG-P1's `routes/meta.py`, `quiz/rune_facts.py`,
   `quiz/recognition_authority.py`, `mastery/runes/rune_provenance.py` and QCA test edits.
2. `a92c283c` — Match Grid reads the snapshot (`rune_canonical/snapshot.py`,
   `service._rune_catalog`), exact-case icon paths, `rune_canonical.cli` reduced to
   `--check` / `--capture`, MG tests adapted, new `test_match_grid_live_release.py`.
3. `ee46dc06` — wire capture regenerated from this branch's server.
4. this handoff.

Frontend (`9fb89ac3` →):
1. `8ac64832` — `git merge --no-ff 453aa333` (MG-P3.1 alone), conflicts resolved by
   hand (§4).
2. `1a776535` — wire fixture regenerated from the release backend; RANKED-INT1's two
   Match Grid test/harness fixes (`9ff45c49`: capture-driven trio test, 60 s arena
   mount wait).
3. `40d3a4cc` — `e2e/match-grid-live-release.spec.ts` (live, score check).
4. this handoff.

## 4. Integration decisions

- **Match Grid only.** INT1 was not merged; its Scrub/Assembly stages, Assembly
  hold, builder-test repairs and multi-mode spec are absent. `PLACEMENT_MAX_SLOTS`
  stays 4 (Assembly's 5 is not needed).
- **Settlement hold: reused, not duplicated.** Master already carries the shared
  hook (`97c58c66`: `pacing.module_transition_ms(hold_ms=)` + the `getattr` in
  `service._resolve`); the port did not re-apply it. `MatchModule.settlement_hold_ms`
  (4500 wrong/timeout, 3000 exact) simply declares into it, beside Reconstruct.
  Frontend main already carries `SERVER_PACED_REVEAL_MODULES` and the final-round
  `finalServerPacedHoldMs`; MG-P3.1's Match-only `!!segment?.reveal.match` flag was
  dropped in favour of adding `match` to that set. Pins updated: hook holders
  `["match", "reconstruct"]`, Reconstruct preset window 4000 (R3B), FE set
  `{match, reconstruct}`.
- **Frontend conflicts** (6 files): `App.tsx`/`Layout.tsx` (DEV `/dev/match-grid` lab
  beside main's Pro Play Arena + Worlds dev routes — union, shared closers kept),
  `playwright.arena.config.ts` (spec list union), `pacing.ts`/`useRankedMatch.ts`
  (main's side), `useRankedMatch.revealHold.test.ts` (main's suite, set pin and a
  Match final-round case). Auto-merged `contracts.ts` was checked: both `kind !==`
  guards and the `isOrderForge || isReconstruct || isMatch` chains carry `match`.
- **Unchanged:** scoring (one board = one outcome, 2 + speed 1), bot, grading,
  answer secrecy, review, presentation/animations, mobile behaviour (360×640 still
  scrolls to Lock — accepted), admin-only unrated preset, every other module.

## 5. Rune-data safety gate (the principal finding)

**Current production shape.** The `runes` table is the legacy seed: DDL
`(id, rune_name UNIQUE, tree_name, rune_type, notes, asset_path)`, no tree/slot
structure, no provenance. The newest local production snapshot
(`C:/Users/mlmit/mogzy-data/lol_calc.db`, 2026-09-26) holds **34 rows incl. Phase
Rush**. Master's `seed_core_runes.py` (since `8677bf32`/`837ee990`/`474dd6a4`,
2026-10-12) seeds **35** (Phase Rush deleted; Deathfire Touch and Stormraider's
Surge added; ids and icons preserved) — whether production was reseeded is not
known here. **Nothing on master writes `runes` at startup** (`api_server.py` has no
rune hook); the seed runs only via `rebuild_database.py` / manual. Patch Ops does
not write `runes` (its rune touchpoints, `knowledge_engine/patch_report/*`, read it).

**What the INT1 migration would do** (unchanged from its checklist): on every boot,
+15 columns, an index, a ledger table, +27–29 rows, Phase Rush flagged `retired`,
`/api/meta/runes` filtered (and 503 when uncertified), quiz rune readers switched to
certified-only. No down-migration.

**Why it is not needed.** Match Grid needs exactly one thing from the authority:
the certified rune → tree roster with art. That roster is already a committed,
digest-sealed artifact (`rune_canonical/data/rune_wiki_snapshot_20261010.json`,
digest `1aae7795…0914`) which `normalize` proves against both of the wiki's own
statements (path infobox + per-rune data page). `rune_canonical.snapshot` loads,
verifies and normalizes it in-process; `service._rune_catalog` reads only that.
It opens no connection and runs nothing at startup. So production's `runes`,
`/api/meta/runes`, quiz rune generation/recognition, the seed scripts and Patch Ops
are untouched — verified, not assumed (§6, §7).

**Content currency, verified against the source today.** A fresh read-only capture
of the League wiki (2026-10-14T00:35Z, `python -m rune_canonical.cli --capture`
equivalent, written to the scratchpad only) produced the **same digest
`1aae7795…`** — zero added, removed or re-revisioned pages; Phase Rush still
`removed = true` (rev 4013285). Roster: 62 runes, Precision 13 / Domination 12 /
Sorcery 13 / Resolve 12 / Inspiration 12, three rows of three minors per tree.
Every one of master's 35 seed runes is in the snapshot with the same tree and
keystone/minor type (pinned by `test_the_master_rune_seed_agrees_with_the_snapshot`,
so a future seed edit that contradicts the wiki fails CI instead of shipping two
truths).

**Fail-closed.** Missing/tampered/self-contradicting snapshot, or a certified rune
with no checked-in icon → `RuneAuthorityUnavailable` → readiness refuses the format
(`RANKED_FORMAT_UNSERVABLE`) / generation raises `RANKED_MODULE_DATA_UNAVAILABLE`;
no match row is created. No seed, Data Dragon or fixture fallback.

**Latent INT1 defect avoided.** The wiki spells "Jack **of** All Trades"; the
checked-in art is `Jack_Of_All_Trades.png`. INT1's apply resolved art with
`Path.is_file()` (case-insensitive on Windows), so on Linux it would have stored a
path that 404s from the case-sensitive `/assets` mount. The snapshot reader resolves
against the directory listing and serves `assets/runes/Jack_Of_All_Trades.png`.

**Refresh procedure (when the wiki changes).** `python -m rune_canonical.cli
--capture rune_canonical/data/<new>.json` → `--check --snapshot <new>` → point
`snapshot.CERTIFIED_SNAPSHOT` at it → run the MG suites → commit → deploy. Frozen
rounds keep the digest they were dealt from, so a refresh never re-grades history.
There is no automatic freshness alarm; this is the same refresh model MG-P1 had.

**Production-equivalent validation (disposable copy).** The 2026-09-26 production
snapshot was copied read-only (SQLite backup API, 6.2 GB) into the session
scratchpad. Sequence and results:

| step | runes / rune_stats / rune_effects / rune_effect_scalings | schema | `/api/meta/runes` |
|---|---|---|---|
| before any boot | 34 / 9 / 34 / 11 | 603 objects | — |
| boot clean master `aa8c041e` | identical | 618 (master's own non-rune migrations) | 34 runes incl. Phase Rush |
| boot release branch | **identical** | **identical to master boot** | **byte-identical to master** |
| after 29 live admin Match Grid matches (+2 Reconstruct / Order Forge) | **identical to pre-boot** | identical | — |

No `rune_canonical*` table or `idx_runes_current` index exists afterwards. Master
answers `admin.match` with 422 `RANKED_UNKNOWN_PRESET`; the release serves it.
Idempotence: there is no migration to repeat — the release adds no startup work, so
any number of boots behaves as master's. Startup time and locks: unchanged from master.

## 6. Test evidence

**Backend** — 123 files (`test_ranked*`, `test_reconstruct*`, `test_order_forge*`,
`test_of*`, `test_match_grid*`, `test_jref2*`, `test_qca*`,
`test_meta_reflex_card_reveal`, answer-safety, every `test_*rune*`), base then branch,
sequential:

| | passed | failed (incl. 7 errors) | skipped |
|---|---|---|---|
| base `aa8c041e` | 2750 | 273 | 486 |
| branch | 2808 | 273 | 486 |

**Identical failure set, 0 branch-only, 0 base-only.** The 58 new tests all pass
(`test_match_grid_module` 47, `test_match_grid_live_release` 11). The shared failures
are the known environmental baseline (empty question banks / canonical tables on a
fresh DB, stale OWN1 admin harnesses, etc., as INT0/INT1 recorded).

**Frontend** — vitest `--pool=forks` over `lib/ranked-public`, `lib/ranked-core`,
`pages/quiz-ranked`, `components/ranked-arena`, `components/interaction-grammar`,
`lib/interaction-grammar`, `components/quiz/workspace`, `pages/admin`,
`components/match-grid`, `lib/match-grid`, `App.routeGuards`, `App.routing-contract`:

| | passed | failed |
|---|---|---|
| base `9fb89ac3` | 3706 | 16 |
| branch | 3807 | 16 |

**Identical failure set** (QuestionStageGeometry 4, App.routing-contract 2,
AnswerGrid.elimination 2, DailyOnCanonicalArena.boundary 2, masterySliceModule
visualLanguage 2, CanonicalArena.boundary 1, App.routeGuards 1,
AdminPlatformPolicies 1, AdminQuizReview.proPlay 1 — INT0's documented baseline).
`tsc -p tsconfig.app.json`: only the 2 pre-existing errors on both. ESLint on every
changed file: 0 errors. (Vitest/vite ran natively this session; the R3B rollup WASM
hook was not needed.)

**Live, real backend on the production copy + real browser** (headless shell 1228):
- `match-grid-live-release` **8/8**: full plan (correct / timeout / wrong) at
  1280×720 and 390×844; three wrong boards at 1600×900, 1366×650, 1280×600, 360×640,
  and reduced motion at 1280×600 and 390×844. Every case: no horizontal overflow,
  every rune icon loaded (no 4xx on `/assets/runes`), final correction held
  **4559–4603 ms** before the outro (server hold 4500; INT1 measured 4541–4577),
  reveal `done` ≥ 3050 ms before the outro (reduced motion: the whole 4.56 s),
  outro → end 1208–1220 ms, Review outcomes = the plays, match in history, no
  contract/parse errors. **End-screen score = server-stored `score_after` = the sum
  of every round's `points_awarded`** in all 8 (e.g. full plan 2–8; quick 0–3 … 0–7).
- `match-grid-arena-continuity` (MG-P3.1, `MG_REQUIRE_SETTLE=1`) **12/12**: six
  viewports × both motion modes; structural regions ≤1 px, no stage overflow, ≥44 px
  targets.
- HTTP: non-owner `admin.match` → 403 `RANKED_PRESET_NOT_AUTHORIZED`; anonymous → 401;
  owner → 200; owner admin module catalog = `item_cost_duel, mastery_slice, quiz`
  (no `match`); non-owner module catalog → 403.
- Reconstruct and Order Forge: one live match each on the release stack launched,
  rendered, settled round 1 by timeout and opened round 2, no console contract errors.

## 7. Exact release steps

1. Owner reviews the two draft PRs (§8). Backend first, frontend second.
2. Merge backend PR → deploy the backend (`Procfile` → `uvicorn api_server:app`).
   No migration runs. Verify on production:
   - startup completes as before; `GET /api/meta/runes` returns the same rows as
     before the deploy (compare count + names);
   - as the owner, `POST /api/ranked/queue {"match_with_bot":true,"preset":"admin.match"}`
     → 200; as a non-owner → 403. Forfeit the probe match if not playing it.
3. Merge frontend PR → deploy the frontend. As the owner: Admin → Leaguecraft →
   Ranked → Playtests → **Match Grid** → play one match to the end screen; confirm
   rune icons load and the scoreline matches Review.
4. Do not add `match` to any format, builder list or rotation (it stays admin-only).

## 8. PRs (drafts, not merged)

- Backend: `mitcherrman/League_Combat_Simulator`, `match-grid/live-release-backend` → `master`.
- Frontend: `mitcherrman/mogsy`, `match-grid/live-release-frontend` → `main`.

(Links are in the PR list; see the session's final report.)

## 9. Rollback

- **Frontend:** revert the frontend merge and redeploy. No data involved; the backend
  keeps serving other modules.
- **Backend:** first find and forfeit any ACTIVE admin Match Grid match **while the
  release is still deployed** (`SELECT match_id, p1_user_id FROM ranked_matches WHERE
  status='active' AND format_id='ranked_admin_match_test'` → owner `POST
  /api/ranked/matches/{id}/forfeit`). Measured with master's code on a temp DB: an
  active `match` round cannot be rehydrated or forfeited once the module is
  unregistered (`FormatValidationError … no registered Ranked module match.v1`), which
  would block that admin's Ranked queue. Completed Match Grid matches stay readable
  after a revert (Review degrades to a generic round). Then revert the backend merge and
  redeploy. **No rune data to restore** — nothing was written.

## 10. Remaining items (none blocks the admin release)

1. **Owner decision (carried from INT1 §9):** the owner-only
   `PUT /api/ranked/admin/format-config/{target}` accepts any registered module, so with
   `match` registered the owner could put it into a public format by raw API (as with
   Reconstruct today). Decide before any public launch whether saves are limited to
   `BUILDER_MODULES`.
2. MG-P1's full `runes` migration (INT1 checklist) remains **unapproved and is not part
   of this release**. It becomes relevant only if the owner wants `/api/meta/runes` and
   quiz rune sources moved to the certified 62-rune roster; that is a separate decision.
3. Snapshot freshness is manual (§5 refresh procedure). A patch that adds/moves a rune
   needs a recapture + commit; until then Match Grid deals the last certified roster.
4. Carried MG limitations: 360×640 scrolls to Lock (accepted); no durable child refs;
   the DEV-only `/dev/match-grid` lab still reads the legacy `runeData.ts` (404s in
   production builds).

## 11. Not committed (by design)

`playwright.mglive.local.config.ts` (FE, local headless-shell path); `.claude/launch.json`
entries `mg-live-be-base`, `mg-live-be`, `mg-live-fe` (ignored file); the session
scratchpad: production-DB copy `proddb/lol_calc.db` (6.2 GB, delete when done),
launchers `e2e/run_backend.py` / `run_vite.cjs`, personas + locally generated HS256
secret, `oracle.py`, `dbstate.py`, state JSONs, fresh wiki capture
`rune_wiki_snapshot_fresh_20261013.json`, screenshots `shots/`, logs.
