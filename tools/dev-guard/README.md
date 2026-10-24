# dev-guard — one heavy local job at a time

Resource control for the owner's Windows PC (16 GB RAM, 8C/16T, often running League of Legends and Firefox).
Several Claude sessions had been launching overlapping Vitest, pytest, Vite/esbuild and `*_validate.py` jobs, which
pinned CPU 94 %, RAM 98 % and disk 100 %.

**Status: proposal. Nothing here is installed or active.** Merging this PR changes only repository files. The
machine-level pieces (copy to `%LOCALAPPDATA%`, Claude settings) need the owner's explicit approval; see
[Install plan](#install-plan-needs-owner-approval).

## What it does

| Piece | File | Job |
|---|---|---|
| Guard | `mogzy-guard.ps1` (+ `.cmd` shim) | Global lock, admission checks, bounded worker env, owned-process job object |
| Limits | `policy.json` | Thresholds, per-class RAM estimates, worker caps, timeouts |
| Claude hook | `hook-pretooluse.mjs` | Denies unguarded heavy commands and guard-bypass attempts before they run |
| Backstop | `vitest-guard-setup.mjs`, backend `conftest.py` | Unguarded local Vitest/pytest warns, or fails when `MOGZY_GUARD_ENFORCE=1` |
| Proposed settings | `claude-settings.proposed.json` | Hook registration + `MOGZY_GUARD_ENFORCE=1` (not installed) |
| Tests | `selftest.ps1`, `hook-pretooluse.test.mjs` | Millisecond/trivial-command validation, no real suites |

The guard source of truth lives in the frontend repo (`mogsy`). The backend repo (`League_Combat_Simulator`) only
carries its `conftest.py` backstop and policy docs; both repos use the single installed copy.

### Using it

```bash
mogzy-guard.cmd status                                    # read-only: lock, RAM, League, unguarded jobs, dev servers
mogzy-guard.cmd check --class vitest                      # would a vitest job be admitted right now?
mogzy-guard.cmd run --class vitest -- npx vitest run src/foo.test.ts
mogzy-guard.cmd run --class pytest -- python -m pytest -q test_x.py
mogzy-guard.cmd run --class vitest --dry-run -- npx vitest run     # plan + verdict, starts nothing
```

Guard options go before `--`; the job goes after it. Exit codes: `0` ok, `2` usage, `3` blocked by resources,
`4` lock wait timed out, `5` could not confine job, `124` job exceeded its wall-clock limit, anything else = the job's own code.

### Guarantees and how they are met

| Requirement | Mechanism |
|---|---|
| One heavyweight job globally across sessions | Named OS mutex `Global\mogzy-dev-guard-heavy-job` (falls back to `Local\` if `Global\` is denied, with a warning) |
| Lock recovery | The kernel frees the mutex when the holder dies (or reports it abandoned, which the guard acquires). `holder.json` is diagnostics only, so a stale file can never block anyone. The selftest kills a holder mid-run and verifies the next job proceeds |
| No unbounded waiting / retry | Lock wait ≤ `--wait` (default 120 s, max 600 s); resource re-check ≤ 3 × 10 s; job wall-clock ≤ class timeout (hard max 3600 s). Then it exits with a code and an explanation |
| Memory pressure | Needs `available RAM ≥ class estimate + reserve` (reserve 1.5 GB, 3 GB while the League client is open). Unmeasurable memory also blocks (fail safe) |
| League activity | `League of Legends.exe` (in-game) blocks all heavy jobs. `LeagueClient*` (lobby) raises the RAM reserve, lowers the CPU limit and drops workers to 1 |
| CPU / disk saturation | Blocks above 85 % CPU (70 % with client) or 95 % disk busy, averaged over 3 samples |
| Other heavy jobs not under the guard | Detected by command line (vitest, pytest, `*_validate.py`, `vite build`, tsc, prerender…) and block admission; listed with PIDs. **They are never killed** |
| Bounded concurrency inside the job | `MOGZY_VITEST_WORKERS` (read by `vitest.config.ts`), `OMP/OPENBLAS/MKL/NUMEXPR_NUM_THREADS`, `UV_THREADPOOL_SIZE`, `NODE_OPTIONS=--max-old-space-size=2048`, BelowNormal priority (children inherit), Job Object memory cap per class. pytest is single-process (no xdist) and stays so |
| No killing of unrelated processes | Only the job's own Job Object is ever terminated (timeout, or guard exit). The hook additionally denies `taskkill /IM`, `Stop-Process -Name`, `pkill`, `killall` |
| Fail safely, clear diagnostics | Every refusal prints the measured numbers, the limit, and which PIDs conflict |

### Bypass analysis (what is and is not covered)

1. **Direct, wrapped or alternate commands** (`npm test`, `npx vitest`, `node …/vitest.mjs`, `bash -c "pytest"`, `cmd /c`, `python -m pytest`, `pnpm exec`, pipes, `$( )`): the hook parses each command segment, unwraps shells/runners, and denies it unless the program is `mogzy-guard`. Covered by `hook-pretooluse.test.mjs`. Plain mentions (`grep vitest`, `git commit -m "…vitest…"`) are allowed.
2. **Child processes / scripts that start suites internally**: with `MOGZY_GUARD_ENFORCE=1` inherited from Claude's settings, Vitest (`globalSetup`) and pytest (`conftest.py`) refuse to start unless `MOGZY_GUARD_TOKEN` is present. The token exists only inside a guarded job, so a script launching Vitest/pytest unguarded fails fast; a guarded job's own children proceed.
3. **Nested guard calls** inside a guarded job reuse the token (verified against the live `holder.json`) instead of deadlocking on the lock.
4. **Forging the token/env**: the hook denies commands that set `MOGZY_GUARD_*` or delete the state dir. A human in their own terminal can still do anything; this is a guardrail against agents, not a security boundary.
5. **Not covered (documented limits)**: a Vitest run using a different `--config`, or a bespoke Node script that spawns `esbuild` directly, is only caught by the hook's command parsing (not by the backstop). Browser launches remain governed by `AGENTS.md` (CI only by default). A grandchild spawned in the microseconds before the job object is assigned is not confined. Estimates in `policy.json` are conservative guesses; tune them from observed peaks.

## Tuning

Edit `policy.json` (reviewed in a PR). Useful knobs: `classes.*.estimateMB`, `reserveFreeRamMB*`, `maxCpuPercent*`,
`maxDiskBusyPercent`, `classes.*.workers`, `classes.*.jobMemoryLimitMB`. Set `MOGZY_GUARD_POLICY=<path>` to test a different file.
The job memory cap makes an over-hungry job fail with an out-of-memory error instead of swapping the whole PC; raise it if a legitimate job hits it.

## Validation performed for this PR

* `powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-guard\selftest.ps1`: isolated mutex/state, only `cmd /c` and `ping`. Covers exit-code passthrough, argument quoting, dry-run, usage error, RAM block, in-game block, unguarded-heavy-job block, timeout (124), nested call, bounded lock wait (4), kill-on-close of only the owned child, and lock recovery after the holder is killed.
* `node --test tools/dev-guard/hook-pretooluse.test.mjs`: command classification (deny/allow/bypass cases).
* `mogzy-guard.cmd status`, `check` and `--dry-run` against the real machine (read-only).
* No Vitest, pytest, build or browser run was started to certify this change.

## Install plan (needs owner approval)

Nothing below has been executed. Review, then run it yourself or reply "approved".

1. **Copy runtime files** to a stable per-user folder outside OneDrive and outside any worktree (so every session and worktree uses one copy, and branch switches cannot disable it):

   ```powershell
   $dst = "$env:LOCALAPPDATA\mogzy-dev-guard"
   New-Item -ItemType Directory -Force $dst | Out-Null
   Copy-Item tools\dev-guard\mogzy-guard.ps1, tools\dev-guard\mogzy-guard.cmd, tools\dev-guard\policy.json, tools\dev-guard\hook-pretooluse.mjs $dst
   ```
   Creates one folder with 4 files. Re-run after a policy change merges.
2. **Register the hook and enforcement variable** in the user-level Claude settings. `~\.claude\settings.json` did not exist when this was written, so this creates it with exactly the contents of `claude-settings.proposed.json` (if the file exists by then, merge the `env` and `hooks.PreToolUse` entries instead of overwriting). Effect: every Claude Code session, subagent and worktree runs the hook before Bash/PowerShell commands; spawned processes inherit `MOGZY_GUARD_ENFORCE=1`.
3. **Optional**: add `%LOCALAPPDATA%\mogzy-dev-guard` to your user PATH so `mogzy-guard.cmd` can be called by name. Without it use the full path (the hook's denial message prints it).
4. **Rollback**: delete the settings entries (or the file) and the folder. Nothing else changes. No Windows, registry, scheduled-task or service settings are touched.

The guard never raises privileges and installs no services. The `.cmd` shim passes `-ExecutionPolicy Bypass` to its own single `powershell.exe` process only; it does not change the machine or user execution policy.
