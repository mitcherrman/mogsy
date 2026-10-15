# Role Challenge — release handoff (RC8)

_Last updated: 2026-10-14 (UTC). Owner decision required before merge/deploy._

## Current state

| Piece | Where | Head |
|---|---|---|
| Frontend release candidate | `mitcherrman/mogsy` PR #18, branch `rc7/role-challenge-hub-20261014` (same commits as `claude/relaxed-archimedes-8kq1vi`), **base retargeted to `main`** | see PR |
| Backend release candidate | `mitcherrman/League_Combat_Simulator` PR #14, branch `rc5/role-challenge-pools` | `a340b984` (code identical to `a4a96c0c`; `a340b984` adds only the acceptance script) |
| Superseded | mogsy PR #12 (RC4 transport) and PR #13 (RC6 origin) — fully contained in PR #18 | — |

**Verdict: NOT READY until the canonical 865 acceptance passes on the workstation** (everything else
below is green). Run it with one command (see *Next action*).

## What the feature does

- Quiz Hub keeps its three parchments. **Left Ranked Standing and right Academy Record are unchanged.**
- Centre parchment is a tablist: **Daily Challenge (default) · Role Challenge · Ranked**.
  `/quiz?mode=role|ranked|daily` opens that mode; `/quiz?play=1` (Ranked "Play Again") opens Ranked.
- Role Challenge: any of 173 champions × any of 5 roles (off-meta allowed and labelled), portrait grid,
  search, Free/Premium plan chip, UTC reset countdown, Premium upgrade link, active-run **Resume**,
  today's completed free run, loading skeleton, retryable catalog/status errors.
- Start → the **existing Ranked arena** (`/quiz/ranked`), labelled "Role Challenge · vs Bot · n / 12",
  12-node timeline, Role-Challenge rules copy ("12 questions · Unrated"). Result: "Match Complete ·
  Unrated", **Back to Role Challenge** → `/quiz?mode=role`; **Review Match** opens the result's own
  question review in place (Role Challenge is deliberately not in Ranked history).
- Server-authoritative: catalog, eligibility (`status.next_start`), active run, match. Free = one start
  per UTC day; Premium = unlimited; one start key per user action, reused on transport failure.
- Unrated and isolated (backend): `rating_eligible=False`; excluded from Ranked history (so from the
  Ranked Standing ledgers/role W-L, which are tallied from history); `role_challenge` host never adds to
  the permanent question library. No client-side achievement/XP writes exist in the arena.

## Decisions

1. **PR #18 preserved as the release candidate**; RC8 commits are fast-forwarded onto its branch and its
   base moved from the RC4 branch to `main` (it already contains RC4 + RC6 + current `main`).
2. **Lockfile**: `package-lock.json` gained the 84 entries `package.json` already declared
   (drizzle-kit, drizzle-orm, postgres + their esbuild/tsx). Additive only: **0 existing versions
   changed, 0 removed**. `npm ci` works again; CI no longer needs `--package-lock=false`.
3. **TypeScript**: the two previously reported errors are already fixed on current `main`; whole-app
   `tsc` (app + node projects) exits 0 on the candidate and CI now enforces it with no allowance.
4. **Champion art** uses the catalog's `riot_id` (Data Dragon key: `MonkeyKing`, `KSante`, …). The
   lowercase catalog id 404s on a case-sensitive host. Fallback rule covers a null `riot_id`.
5. **Mogzy's Ranked role guide** mounts only on the Ranked mode it points at.
6. **Review Match** for a Role Challenge opens the end screen's Match details in place instead of
   `/quiz#history` (which correctly does not contain it).
7. **Module statistics** (`/api/ranked/module-stats`, a per-module accuracy read) *do* include Role
   Challenge answers, the same policy the backend already applies to Daily-hosted matches (a genuine
   attempt is a genuine attempt). It is not rating, history, achievements or role W/L. Flip it in
   `services/ranked_module_stats.py` if the owner wants it excluded.

## Changed files (frontend, vs `main`)

- `src/lib/role-challenge/{contracts,client}.ts` (+tests) — RC4 transport (unchanged).
- `src/lib/role-challenge/presentation.ts` (+test) — art key, search, eligibility copy, reset countdown, mode-from-URL.
- `src/components/quiz/RoleChallengePicker.tsx` (+test) — the finished picker.
- `src/components/quiz/RankedLobbyHero.tsx`, `LeaguecraftHub.tsx`, `src/pages/Quiz.tsx` — centre tablist, Daily panel, initial mode, guide gating.
- `src/pages/quiz-ranked/{matchOrigin.ts,QuizRankedMatch.tsx}`, `src/lib/ranked-public/matchHost.ts` — origin/host, return route, rules variant, in-place review.
- `src/components/ranked-rules/*`, `src/components/game-results/openResultDetails.ts` — rules copy variant, review opener (+test).
- `package-lock.json`; `.github/workflows/role-challenge-review.yml` (replaces the RC4/RC7 diagnostic workflows).
- `e2e/role-challenge-real-backend/` — local real-backend rig + acceptance driver (dev only, never shipped).

Backend (PR #14) changes in this pass: merge of `master` `35bc16bf`; `scripts/role_challenge_canonical_acceptance.ps1`.

## Tests (this pass)

Filled from the runs in this session — see the PR descriptions for the same numbers.

- Frontend focused (Role Challenge, hub, arena, rules, results): **see PR #18** — all passing.
- Frontend full suite differential vs `main`: **see PR #18**.
- `tsc` app + node: **0 errors**. `vite build` (production): **passes**.
- ESLint on touched files: 0 new errors (the 12 `no-explicit-any` errors in `Quiz.tsx` are identical on `main`).
- Backend focused CI set on the master-merged candidate: **293 passed, 45 skipped (DB-gated), 179 subtests**; Reconstruct timing **40 passed**.
- Backend wide differential (ranked/assembly/match/journey/daily/quiz suites, 154 files) master vs candidate:
  **identical failure sets** (414 failed / 33 errors on both — inherited, mostly DB/bank-dependent);
  candidate 3739 passed vs master 3737 (+2 new isolation tests). **No regression.**
- Live acceptance (real backend app on a scratch DB, real arena, Chromium, desktop 1440×900 + mobile
  390×844): **see PR #18** for the scenario table and screenshots.

## Blockers

1. **Canonical 865 acceptance not run.** The canonical 5.9 GB `lol_calc.db` lives on the owner's Windows
   workstation; this cloud session has no access to that machine (no Docker, no production DB allowed).
   The only `lol_calc.db` reachable (Google Drive, 185 MB, July, another account) is not canonical.
   The live rig therefore replaces Blocks A/C/D Mastery content with exact-ref bank questions; the
   real Mastery segments for all 865 pairs are proven only by the canonical run below.
2. Owner approval to merge/deploy (both repos auto-deploy from their default branches).

## Next action (owner, ~10–30 min, Windows PowerShell, no Docker)

```powershell
cd <League_Combat_Simulator checkout>
git fetch origin rc5/role-challenge-pools
git checkout --detach origin/rc5/role-challenge-pools   # a340b984 or later
powershell -ExecutionPolicy Bypass -File scripts/role_challenge_canonical_acceptance.ps1 `
  -CanonicalDb C:\path\to\lol_calc.db -WorkDir C:\rc-accept
```

It copies (never links) the DB into a fresh worktree, hashes the source before/after, runs the full
865 probe and the 45 DB-gated tests, and exits non-zero on any probe exception, failure, skipped gated
test, or a changed source DB. Report: `C:\rc-accept\acceptance-report.json`. Add `-Wide` for the
wider Ranked/quiz suites. If it passes: merge backend PR #14 first (migration
`migrate_add_role_challenge_runs.py` is additive), confirm `/api/role-challenges/catalog` in
production, then merge frontend PR #18.

## Re-running the live acceptance locally

```bash
export RC_BACKEND_WORKTREE=<backend checkout at the candidate> RC_RIG_DATA=<scratch dir outside repos>
python e2e/role-challenge-real-backend/rig/setup_db.py --wipe
python e2e/role-challenge-real-backend/rig/serve.py &          # :8190, lifespan off, scratch DB only
VITE_COMBAT_API_URL=http://127.0.0.1:8190 VITE_E2E_AUTH=1 VITE_SUPABASE_URL=http://127.0.0.1:1 \
  VITE_SUPABASE_PUBLISHABLE_KEY=dummy npx vite --host 127.0.0.1 --port 8151 &
RC_PYTHON=python node e2e/role-challenge-real-backend/acceptance.mjs --out ./rc-acceptance
```
