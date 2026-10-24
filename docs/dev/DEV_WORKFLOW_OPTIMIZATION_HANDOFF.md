# Dev workflow optimization — handoff

Branch `policy/dev-resource-optimization` in both repositories (`mogsy` frontend, `League_Combat_Simulator` backend), draft PRs, based on
`origin/main` @ `9685c68d` and `origin/master` @ `890534c5`. Nothing is merged, deployed or killed. (Update 2026-10-23: the guard was later installed on the owner's PC with approval; see §6.) The existing checkouts, their
uncommitted work and all 400+ worktrees were left untouched; these branches were made in new worktrees under `C:\dev\mogzy-wt\`.

## 1. Audit findings (evidence from 2026-10-23)

**Machine:** Ryzen 7 7700X (8C/16T), 15.1 GB RAM, `C:` 94 % full. Snapshot taken read-only while the sessions below were active:
~3 GB RAM available; `claude.exe` ×19 ≈ 3.2 GB; Firefox ×12 ≈ 1.3 GB; League client open (≈0.6 GB); disk busy ≥ 95 %.

**Overlapping heavy jobs observed at once (all from other sessions, none touched):**
4 Python `*_validate.py` pipelines (each counted twice because of the Windows-Store `python.exe` stub → real `python.exe` child), 4+ `pytest` processes,
2 Vitest runs (one `npx vitest`, one in `C:\Users\mlmit\mogzy-wt\qrt2-base3`), 3 Vite dev servers (ports 8123, 8124, 5361) and 4 `esbuild --service` helpers,
three of them executing from `C:\Users\mlmit\OneDrive\Desktop\mogsy\node_modules`.

**Commands and default concurrency**

| Area | Command | Default concurrency | Problem |
|---|---|---|---|
| Frontend unit | `npm test` → `vitest run` (1,197 test files, jsdom) | Vitest 3.2: `CPU threads − 1` ≈ **15 workers** on this PC | No cap; each jsdom worker is hundreds of MB |
| Frontend browser | `npm run test:e2e*`, 26 `playwright.*.config.ts`, 73 specs | `workers: 1` in the main config | 13 files (configs, specs, probe scripts) still reference a browser `channel` or `PW_CHANNEL`; AGENTS.md already forbids running them locally |
| Frontend build | `vite build` + 4 `tsx` prerender/verify scripts | single | Heavy but sequential; no need to run per edit |
| Backend | `python -m pytest` (≈1,250 files; 837 at repo root), `unittest` in patch-ops workflows | single process (no xdist) | Many concurrent single-process runs; `*_validate.py` pipelines on top |

**Redundant / excessive verification:** full or folder-wide suites and baseline comparisons for small edits; repeated screenshot sweeps; watch-mode
Vitest; the same suite re-run after every fix. Baseline-vs-branch comparisons already exist as CI jobs (backend workflows check out `master` in a second
directory), so local copies are pure duplication.

**What really needs a browser:** viewport/screenshot/layout acceptance, E2E journeys, Playwright-driven media/recording checks. Everything else (reducers,
hooks, projections, pure TS edge-function logic, contract tests) is jsdom/pytest-level. The 38 frontend workflows already cover the browser part.

**CI status (checked, no workflow was triggered):**
* Frontend `mitcherrman/mogsy` is **public**: Actions are free. Unauthenticated API shows 1,018 runs; the last 100 completed runs were 95 success / 4 failure / 1 cancelled; latest run 2026-10-23 22:26 UTC. All 38 workflows are path-filtered `pull_request` jobs on `ubuntu-latest` (20 run targeted Vitest, 27 run Playwright). Operational; **no billing block** is visible.
* Backend `mitcherrman/League_Combat_Simulator` is **private** (404 unauthenticated) and `gh` is not installed on this PC, so run history and billing could not be verified directly. Earlier owner handoffs (GRES1, QRT1, BKP1) report its Actions as **billing-blocked**; assume backend CI does not run until the owner confirms. 17 workflows, all path-filtered `pull_request`, no schedules. Consequence: backend L2/L3 verification has to run locally, which is exactly why the guard and the "verify once" rule matter there.
* There is no repo-wide "run everything" workflow in either repo, which is why L3 explicitly lists which gates to use.

**Leftovers:** three Vite dev servers (+ esbuild helpers) are running now from other sessions; frontend `e2e/global-teardown.ts` stops only the disposable API backend it spawned (the Vite server is Playwright's `webServer`). Nothing was stopped. `mogzy-guard status` lists them with PIDs so the owning session can stop its own.

## 2. What changed (both repos unless noted)

| File | Change |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | Existing browser/process safety kept verbatim. Added L1/L2/L3 risk-based verification, required workstream declaration (level, test plan, resource impact), "do not" list, local resource-guard rules, CI-first and outside-OneDrive rules |
| `docs/dev/TESTING_MATRIX.md` | Per-task matrix (what runs locally, what runs in CI, what not to run) |
| `tools/dev-guard/**` (frontend) | Guard, policy, Claude hook, proposed settings, tests, README with install plan |
| `vitest.config.ts` (frontend) | Local `maxWorkers` = `MOGZY_VITEST_WORKERS` or 2 (CI unchanged); `globalSetup` backstop |
| `conftest.py` (backend) | `pytest_sessionstart` backstop (warn, or exit 3 when `MOGZY_GUARD_ENFORCE=1`; CI unaffected) |

## 3. Work avoided and verification preserved

**Avoided (local):** unbounded Vitest fan-out (15 workers → 1–2); concurrent heavy jobs across sessions (→ 1 machine-wide); per-edit `build`/full-suite/folder
sweeps; local baseline comparisons and screenshot sweeps (→ CI once, at the end); retry/poll loops against a saturated machine; heavy work during a League match;
duplicate worktree dependency installs/syncs once worktrees leave OneDrive.

**Preserved:** every existing CI workflow and path filter is unchanged; L3 keeps comprehensive affected-system verification for ranked/daily integrity, billing and
entitlements, RLS/migrations, auth/admin access, build/dependency changes, patch authority and releases; the existing "no local desktop browsers, CI for browser
acceptance" rules are unchanged; CI Vitest/pytest behaviour is unchanged (`CI` env bypasses the caps and backstops). Nothing in the policy lowers a gate: it only
changes *where, when and how many at once*.

## 4. Validation done (lightweight only)

* `selftest.ps1`: 14 checks pass (isolated mutex/state; only `cmd /c` and `ping`).
* `node --test tools/dev-guard/hook-pretooluse.test.mjs`: 8 groups pass; hook also driven with real stdin JSON (deny, allow, malformed → allow).
* `mogzy-guard status|check|run --dry-run` against the live machine: correctly reports BLOCKED (RAM 3.7 GB < 4.5 GB required with League client open, disk ≥ 95 %, other sessions' heavy jobs listed).
* Backend `conftest.py` backstop exercised with a no-op test in a temp directory: unguarded + `MOGZY_GUARD_ENFORCE=1` exits; token set passes.
* `vitest.config.ts` was **not executed** (that would start the suite this PR is about avoiding); it is a 8-line additive change using options documented for the installed Vitest 3.2.7 (`maxWorkers`, `minWorkers`, `globalSetup`). CI will exercise it on the first PR that touches Vitest paths. **Reviewer: confirm with `mogzy-guard.cmd run --class vitest -- npx vitest run src/lib/<one small test>` after install.**
* No remote or local exhaustive suites were run to certify this change.

## 5. Phase 5 — OneDrive and worktrees (proposal; nothing moved)

Facts: `C:\Users\mlmit\OneDrive\Desktop` is a OneDrive-synced folder. `mogsy` and `League_Combat_Simulator` main checkouts live there with `node_modules`, `.pnpm-store`,
`dist`, `test-results`, `.git`, `.worktrees\*` and `.claude\worktrees\*`. Registered worktrees: **mogsy 405** (197 inside OneDrive, 194 under `C:\Users\mlmit\mogzy-wt`),
**backend 328** (187 inside OneDrive). Both main checkouts are on feature branches with uncommitted changes (`mogsy` ≈ 92 changed entries on `docs/combat-v4-visual-prep`,
backend 4 on `envvis1-batch1-scene-channel`). 187 / 117 worktrees have branches already merged into the base branch (91 / 80 of them in OneDrive); merged ≠ clean, so none may be
removed without a per-worktree dirty/unpushed check. `C:\Users\mlmit\mogzy-wt` already exists as an out-of-OneDrive convention; the policy files now point new worktrees there.

Proposed migration (each step needs owner approval; do it with all sessions idle):
1. **Inventory (read-only):** per worktree, `git status --porcelain` + `git log @{u}..` (unpushed) + merged-into-base flag. Output a CSV; nothing is changed.
2. **Protect work:** for every worktree with uncommitted/unpushed work, owner decides: commit+push, or `git bundle`/patch into `C:\dev\backup\`. Main checkouts' uncommitted work is handled the same way before any move.
3. **New primaries outside OneDrive:** `git clone` both repos to `C:\dev\mogsy` and `C:\dev\league-combat-simulator` (new `node_modules`/venv there, `npm ci` once). New sessions use these and `C:\Users\mlmit\mogzy-wt\<name>` worktrees. The OneDrive checkouts are left in place and read-only by convention.
4. **Do not** `Move-Item` a main checkout while worktrees link to it: every worktree's `.git` file stores an absolute path to `<main>\.git\worktrees\<name>`. If a main checkout must move, use `git worktree repair` afterwards and move **one** worktree at a time with `git worktree move` (only clean, unlocked ones).
5. **Retire merged, clean, pushed worktrees** in batches of ~20 using `git worktree remove <path>` (no `--force`), from the inventory, with the owner approving each batch. Prunes disk (hundreds of `node_modules` copies), OneDrive sync load and Vitest/esbuild resolution time.
6. **OneDrive:** after step 5, pause sync during the final folder moves, then remove the repo folders from `Desktop` only when the owner confirms the new locations work. Do not rely on "Always keep on this device"; it does not stop syncing.

## 6. Remaining steps (owner decisions)

1. Review/merge the two draft PRs (merge is the owner's call).
2. **Done on the owner's PC (2026-10-23):** guard files in `%LOCALAPPDATA%\mogzy-dev-guard`, hook + enforcement variable in `~\.claude\settings.json`, hook later widened to Monitor and the Terminal tool (live-verified with a fake `vitest`). The install steps in `tools/dev-guard/README.md` remain the procedure for other machines. Known unguarded path: `preview_start` (README coverage table). **Acceptance (2026-10-23, heads c382f28d / d7025ea0):** installed guard files hash-identical to this branch (matcher unchanged, `status` works, Monitor still denies an unguarded `vitest`). The guarded one-test Vitest smoke run (`mogzy-guard.cmd run --class vitest -- npx vitest run src/lib/ads/policy.test.ts`) was **BLOCKED by the guard, exit 3**: available RAM 1,683 MB < 4,000 MB required, plus another session's unguarded pytest running; it was not retried or bypassed, so `vitest.config.ts` execution remains **UNVERIFIED**. This worktree also has no `node_modules`, so run it from a checkout with dependencies once RAM is free.
3. Confirm backend Actions billing is restored (see §1); until then backend CI-only gates are not available. Install `gh` if desired.
4. Tune `policy.json` after a week of real `mogzy-guard` output (RAM estimates are conservative guesses).
5. Approve Phase 5 steps one by one; start with the read-only inventory.
6. Follow-ups not done here: bring the 13 files that reference a browser `channel`/`PW_CHANNEL` in line with AGENTS.md in a separate reviewed change; consider a single `workflow_dispatch` "affected-system" workflow for L3 releases instead of local exhaustive runs; stop the three leftover Vite servers from their owning sessions.
