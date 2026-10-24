# Dev workflow optimization — handoff

> **2026-10-24:** the guard admission design below (RAM/League/CPU/disk refusals, enforcement backstops) blocked ordinary targeted tests and is superseded by **§7**. §1 audit facts remain valid.

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

## 7. Redesign 2026-10-24: targeted tests never blocked (supersedes the admission design in §2-§4)

**Confirmed regression.** The 2026-10-23 guard stopped ordinary work. The hook denied every `vitest`/`pytest` command, and the guard then refused
even a one-file test unless 4.0-5.5 GB of RAM was free, the disk was below 95 % busy, no other session's test was running and League was not in a match.
On this PC, with Firefox and League open, those conditions are almost never met. The owner must never have to close Firefox or League for Claude to keep working.

**Verification level of this change:** L1 for the policy text; L2 for the execution behaviour (hook, guard, `vitest.config.ts`, backend `conftest.py`).

### 7.1 Evidence measured today (read-only snapshots, no suites started)

| Measurement (2026-10-24) | Value |
|---|---|
| Available RAM / total | 641-747 MB / 15,510 MB (three snapshots) |
| Firefox | 15 processes, 5,141 MB working set |
| Claude sessions | 34 `claude` processes, 4,675 MB working set |
| Disk busy | 89-100 % |
| League | not running at snapshot time |
| Other sessions | 1 pytest run (another session) |
| **Installed** guard, `check --class vitest` | `WOULD BLOCK`, exit 3: "available RAM 641 MB < required 4,000 MB", "disk busy 99.7 % >= 95 %" |
| **Redesigned** guard, `check --class vitest` | `WOULD RUN`, exit 0: 1 worker, BelowNormal, low-RAM note only |
| **Installed** hook false positive | denied a PowerShell line that only *assigned* `$V = "...\vitest.mjs"` (no run). The redesigned hook allows it (`scope-check`) |
| `selftest.ps1` (redesigned guard) | 14/14 PASS, 43 s wall; trivial `cmd`/`ping` children only |
| `node --test hook-pretooluse.test.mjs` | 11/11 PASS, ~0.3 s |
| Per-session duplicate tooling | 3 session scratchpads each hold their own `@rollup/wasm-node` install (≈4 MB each), plus many copied scratch Vitest configs |

**Not measured (owner chose "no runs" on 2026-10-24).** The installed hook denies `vitest`/`pytest`, and the installed guard refuses them (exit 3 above),
so no real Vitest or pytest execution was measured. The planned bounded set was: one 1-file Vitest run, a 4-file run with the redesigned bounds and the
same 4 files with Vitest defaults, and one 1-file pytest run, each sampled for peak process-tree memory, CPU seconds, wall time and worker priority
(harness `measure.ps1`, kept in the session scratchpad). Run it after the redesign is installed. Until then **no claim is made that peak memory or speed
improved**. The expected trade-off, unmeasured: a targeted multi-file run uses one worker instead of up to N parallel ones, so peak memory goes down and
wall time goes up (roughly the sum of the per-file times instead of the slowest one). Below-normal priority makes runs slower when League or Firefox
needs the CPU, and never blocks them.

**Also UNVERIFIED:** `vitest.config.ts` was not executed. On this PC the real config cannot load anyway: the shared `@swc/core` 1.16.13 fails its DACL check
and Windows Application Control blocks rollup's native binary, so local Vitest currently needs an esbuild/WASM scratch shim. No CI workflow lists
`vitest.config.ts` in `paths:`, and CI skips the local branch (`CI` is set), so CI only proves that the config and `scope.mjs` import load. The options used
(`maxWorkers`, `minWorkers`, `fileParallelism`, `poolOptions.forks|threads.execArgv`) are documented for Vitest 3.2. `os.setPriority` inheritance by fork
workers follows Windows priority-class inheritance; it is not observed yet. The scope decisions `vitest.config.ts` makes were checked with plain Node on
real argv shapes: 1 and 4 named files → targeted (1 worker); `run` and `run src/lib` → broad.

### 7.2 Command classification by actual scope (`tools/dev-guard/scope.mjs`)

| Scope | Examples | Local handling |
|---|---|---|
| Targeted | `npx vitest run a.test.ts b.test.tsx` (up to 8 named test files, `-t` allowed); `npm test -- a.test.ts`; `python -m pytest -q test_x.py::T::t`; `python -m unittest pkg.test_x` | Runs directly. Hook allows it; no lock, no admission check. Vitest gets 1 worker, no file parallelism, heap cap 2 GB/worker (`MOGZY_VITEST_HEAP_MB`), below-normal priority. pytest stays single-process at below-normal priority |
| Broad | `vitest run` (no files), directories or substring filters, more than 8 files, `--coverage`/`--changed`/`related`/watch; `npm test`; pytest with no file, with directories or with `-n`; `unittest discover`; build, project-wide `tsc`, tree ESLint, Playwright, validators | Hook redirects to the guard: one broad job at a time machine-wide, bounded lock wait (120 s default). It never refuses because of League, Firefox, RAM, CPU, disk or other sessions; those only reduce workers to 1 and priority (Idle during a League match). Job memory cap per class |
| Not a test | `node --test <file>`, `--version`, `grep vitest`, `git commit -m "...vitest..."`, path assignments | Allowed |

### 7.3 Safeguards evaluated against "could this stop Claude from completing work or force closing Firefox/League?"

| Safeguard | Verdict | Why |
|---|---|---|
| Free-RAM admission threshold | **Rejected** (removed) | PC routinely has <1 GB free with Firefox open; it blocked one-file tests |
| League in-match refusal | **Rejected** → Idle priority + 1 worker | Would stop work for a whole match |
| CPU/disk-busy refusal | **Rejected** → advisory note | Disk is 89-100 % busy routinely (OneDrive, other sessions) |
| "Another test is running outside the guard" refusal | **Rejected** → advisory note | Every other session's targeted run would block yours |
| Global lock for every test | **Rejected for targeted**, kept for broad | Targeted runs are cheap and must run concurrently across sessions |
| `MOGZY_GUARD_ENFORCE` backstops (Vitest `globalSetup`, pytest `conftest.py` exit 3) | **Rejected** (removed) | They failed ordinary runs started by scripts/subagents |
| Resource re-check sleep loop (3 × 10 s) | **Rejected** (removed) | Waiting with nothing to wait for |
| Broad-job lock with bounded wait (exit 4 on timeout) | Kept | Bounded; targeted tests and CI remain available while waiting; prevents the observed multi-suite overlap |
| Per-job memory cap (Job Object) | Kept | Fails only the oversized job, never blocks a start; raise per class if a legitimate job hits it |
| Per-worker heap cap 2 GB | Kept, overridable | A single test file needing >2 GB heap would fail with an explicit OOM; `MOGZY_VITEST_HEAP_MB` raises it |
| Below-normal / Idle priority | Kept | Slower under contention, never blocked |
| Hook denial of kill-by-name and `MOGZY_GUARD_*` forging | Kept | Protects the owner's browsers/game; does not block testing |

### 7.4 What is omitted vs kept

* **Eliminated locally:** automatic full-suite runs, folder runs per edit, repeated baselines, routine screenshot/viewport sweeps, builds for small edits, watch mode, reruns of green unchanged tests, per-session dependency installs.
* **Safe to omit at L1:** folder/full Vitest, build, screenshots, baseline comparisons, project-wide `tsc` (AGENTS.md lists the reasons).
* **Never omitted (L2/L3):** the changed behaviour's tests; affected-system tests for auth/identity, billing/Stripe/entitlements, RLS/migrations (`src/test/security`), Ranked/Daily scoring integrity; one `build` for tooling or dependency changes; every path-matched CI workflow before release. A gate that cannot run is reported **NOT RUN**, never as a pass. Backend CI is reported billing-blocked, so backend L2/L3 gates run locally, once and sequentially.
* **No new paid infrastructure:** frontend Actions are free (public repo); nothing new is added.

### 7.5 Owner decisions left

1. Install the redesign (README *Updating the installed copy*: back up and copy 5 files; no settings change needed). Until then the installed 2026-10-23 guard keeps blocking targeted tests.
2. After install, run the bounded measurement set in §7.1 (4 runs) as acceptance.
3. Repair the local toolchain once (shared `@swc/core` DACL failure, rollup native binary blocked by App Control), or approve one shared WASM shim under `%LOCALAPPDATA%`, so sessions stop installing their own copies.
4. Optionally remove `MOGZY_GUARD_ENFORCE` from `~\.claude\settings.json` (inert after the redesign).
