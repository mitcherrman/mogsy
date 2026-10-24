# dev-guard — targeted tests run freely, broad jobs one at a time

Resource control for the owner's Windows PC (16 GB RAM, 8C/16T, often running League of Legends and Firefox).
Several Claude sessions had been launching overlapping Vitest, pytest, Vite/esbuild and `*_validate.py` jobs, which
pinned CPU 94 %, RAM 98 % and disk 100 %.

> **Redesign 2026-10-24 (this branch; not installed).** The 2026-10-23 guard blocked ordinary work: the hook denied every
> `vitest`/`pytest` command, and the guard then refused even a one-file test whenever Firefox and League were open (needed
> 4.0-5.5 GB free RAM; the PC usually has <1 GB). Now:
> * **Targeted** runs (up to 8 named test files, `scope.mjs`) are allowed directly by the hook: no lock, no admission check.
>   `vitest.config.ts` bounds them (1 worker, no file parallelism, heap cap, below-normal priority); pytest is single-process
>   and `conftest.py` lowers its priority.
> * **Broad** runs still go through the guard, which only serializes them (bounded lock wait). League, Firefox, RAM, CPU, disk
>   and other sessions' processes **never refuse** a job; they only reduce workers/priority. Exit code 3 no longer exists.
> * The Vitest `globalSetup` and pytest `conftest.py` backstops (fail when `MOGZY_GUARD_ENFORCE=1`) are removed; the variable is inert.
> * Hook false positive fixed: a PowerShell assignment such as `$V = "...\vitest.mjs"` was treated as running Vitest.
>
> Installing it on the owner's PC is an owner decision (see *Updating the installed copy* below). Sections further down that
> describe RAM/League blocking describe the 2026-10-23 version and are kept as history.

**Status (2026-10-23): installed on the owner's PC; merging this PR changes only repository files.** The install plan below is the
original, *historical* proposal; it was executed with the owner's approval and the hook matcher was later widened (see
[Installed-guard verification](#installed-guard-verification-2026-10-23-l1-guard-only)). Other machines still need the install steps.

## What it does

| Piece | File | Job |
|---|---|---|
| Guard | `mogzy-guard.ps1` (+ `.cmd` shim) | Broad-job lock (bounded wait), sizing by machine state (never refuses), bounded worker env, owned-process job object with memory cap |
| Limits | `policy.json` | Advisory thresholds, per-class worker caps, timeouts, job memory caps |
| Scope | `scope.mjs` | Targeted vs broad classification, shared by the hook and `vitest.config.ts` |
| Claude hook | `hook-pretooluse.mjs` | Allows targeted test runs; redirects broad ones to the guard; denies guard-bypass attempts and kill-by-name |
| Local bounds | `vitest.config.ts`, backend `conftest.py` | 1 worker + no file parallelism for targeted Vitest, worker heap cap, below-normal priority; pytest priority drop |
| Settings | `claude-settings.proposed.json` | Hook registration (reference copy; installed on the owner's PC). `MOGZY_GUARD_ENFORCE` is inert since 2026-10-24 and can be removed |
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

Guard options go before `--`; the job goes after it. Exit codes: `0` ok, `2` usage, `4` lock wait timed out (another broad job
is running), `5` could not confine job, `124` job exceeded its wall-clock limit, anything else = the job's own code.
(Code `3`, "blocked by resources", was removed on 2026-10-24.) Targeted test runs do not need the guard at all.

### Guarantees and how they are met (2026-10-23 version; see the redesign note at the top)

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

## Updating the installed copy to the 2026-10-24 redesign (owner approval needed; not done)

```powershell
$dst = "$env:LOCALAPPDATA\mogzy-dev-guard"
New-Item -ItemType Directory -Force "$dst\backup-20261024" | Out-Null
Copy-Item "$dst\*.ps1", "$dst\*.cmd", "$dst\*.json", "$dst\*.mjs" "$dst\backup-20261024"
Copy-Item tools\dev-guard\hook-pretooluse.mjs, tools\dev-guard\scope.mjs, tools\dev-guard\mogzy-guard.ps1, tools\dev-guard\mogzy-guard.cmd, tools\dev-guard\policy.json $dst
```

`scope.mjs` is new and must sit next to the hook (the hook imports it). `~\.claude\settings.json` needs no change; optionally drop
`MOGZY_GUARD_ENFORCE` from its `env` (nothing reads it any more). The hook file is read on every tool call, so the change applies to all
sessions at once. Acceptance after install: a one-file `npx vitest run <file>` and a one-file `python -m pytest -q <file>` run
without the guard while Firefox/League are open; `npx vitest run src/lib` is redirected to the guard; `mogzy-guard.cmd check
--class vitest` prints `WOULD RUN`. Rollback: copy the files back from `backup-20261024` and delete `scope.mjs`.

## Install plan (historical proposal; already executed on the owner's PC)

Original proposal, kept as the procedure for other machines. On the owner's PC steps 1-2 were executed with approval, and the hook file and
matcher were later updated (`Bash|PowerShell|Monitor|mcp__terminal__run_in_terminal`; see the coverage section below). Do not re-run it there
unless reinstalling. "Not installed" wording elsewhere in this file describes the state at proposal time.

1. **Copy runtime files** to a stable per-user folder outside OneDrive and outside any worktree (so every session and worktree uses one copy, and branch switches cannot disable it):

   ```powershell
   $dst = "$env:LOCALAPPDATA\mogzy-dev-guard"
   New-Item -ItemType Directory -Force $dst | Out-Null
   Copy-Item tools\dev-guard\mogzy-guard.ps1, tools\dev-guard\mogzy-guard.cmd, tools\dev-guard\policy.json, tools\dev-guard\hook-pretooluse.mjs, tools\dev-guard\scope.mjs $dst
   ```
   Creates one folder with 4 files. Re-run after a policy change merges.
2. **Register the hook and enforcement variable** in the user-level Claude settings. `~\.claude\settings.json` did not exist when this was written, so this creates it with exactly the contents of `claude-settings.proposed.json` (if the file exists by then, merge the `env` and `hooks.PreToolUse` entries instead of overwriting). Effect: every Claude Code session, subagent and worktree runs the hook before Bash/PowerShell commands; spawned processes inherit `MOGZY_GUARD_ENFORCE=1`.
3. **Optional**: add `%LOCALAPPDATA%\mogzy-dev-guard` to your user PATH so `mogzy-guard.cmd` can be called by name. Without it use the full path (the hook's denial message prints it).
4. **Rollback**: delete the settings entries (or the file) and the folder. Nothing else changes. No Windows, registry, scheduled-task or service settings are touched.

The guard never raises privileges and installs no services. The `.cmd` shim passes `-ExecutionPolicy Bypass` to its own single `powershell.exe` process only; it does not change the machine or user execution policy.

## Installed-guard verification (2026-10-23, L1 guard-only)

- Installed files (`hook-pretooluse.mjs`, `mogzy-guard.ps1`, `mogzy-guard.cmd`, `policy.json`) are byte-identical (CRLF-normalised hash) to this branch.
- `hook-pretooluse.test.mjs` 8/8 and `selftest.ps1` all PASS (second heavy job refused with exit 4, kill-on-close, lock recoverable after holder death).
- Live in Claude Desktop: unguarded `vitest`/`pnpm build` denied in the Bash and PowerShell tools; `git`, `ls`, `Get-ChildItem` and `--version` allowed.

### Execution-path coverage (2026-10-23, L2; probes used a harmless fake `vitest.cmd` that only echoes its environment)

| Path | Hook intercepts today (matcher `Bash\|PowerShell`) | Inherits the enforcement variable | Evidence |
|---|---|---|---|
| Bash / PowerShell tools | Yes | Yes | **Verified** live (denials, `git`/`ls` allowed) |
| Subagents (`Agent`; `Workflow` `agent()` calls are subagents) | Yes: their Bash/PowerShell calls hit the same hook | Yes (same process tree) | **Verified**: a haiku subagent's fake `vitest.cmd` call was denied. Docs say hooks fire for subagent tool calls |
| `Monitor` | **No** (ran the fake job) | Yes (`enforce=[1]`) | **Verified** |
| Terminal panel (`run_in_terminal`) | **No** (ran the fake job in the user's shell; the app's own hook only limits it to literal command lines) | **No** (`enforce=[]`) | **Verified** |
| `preview_start` (`.claude/launch.json`) | **No** (ran the fake job) | **No** (`enforce=[]`) | **Verified** |
| Desktop scheduled tasks / `/loop` | Not tested. They start Claude sessions that should load user settings | Not tested | Theoretical |
| Cloud scheduled tasks (routines) | Do not load `~/.claude/settings.json` per Claude Code docs, but run in the cloud, not on this PC | n/a | Docs only |

Official mechanism: `PreToolUse` matchers are regexes on the tool name, including MCP tools as `mcp__<server>__<tool>` (docs; also observed: the app's own hook fires on `mcp__terminal__run_in_terminal`). Docs do not document a `Monitor` matcher or schema, and `SubagentStart` cannot block. We do not rely on anything beyond that.

**Smallest protection** (source change in this branch, **not installed**): the hook script accepts `Monitor` and `mcp__terminal__run_in_terminal` (both carry a `command` string) and `claude-settings.proposed.json` widens the matcher to `Bash|PowerShell|Monitor|mcp__terminal__run_in_terminal`. Unit-tested (9/9) and driven with stdin JSON; the live matcher behaviour for those two tools was verified after install (2026-10-23: fake vitest denied via Monitor and run_in_terminal; git allowed). No global process monitor is added.

**Remaining manual restrictions** (not enforceable by a hook without more machinery):
1. `preview_start` runs whatever `.claude/launch.json` says, with no guard and no enforcement variable. Keep launch configs to a single dev server per worktree; never put Vitest/pytest/builds/Playwright in `launch.json`; stop servers when done (`mogzy-guard status` lists them).
2. The Terminal panel and the owner's own terminals are the owner's; agents that use `run_in_terminal` for heavy jobs get blocked only after the update below.
3. Vite builds and Playwright have no in-process backstop; they rely on the hook alone.

**Minimal update plan (needs owner approval; nothing has been run):**
1. `Copy-Item tools\dev-guard\hook-pretooluse.mjs "$env:LOCALAPPDATA\mogzy-dev-guard\"` (one file; guard, policy and shim unchanged).
2. In `~\.claude\settings.json` change only the `matcher` value to `Bash|PowerShell|Monitor|mcp__terminal__run_in_terminal`.
3. Start a new session and verify with a fake `vitest.cmd` through Monitor and `run_in_terminal`: both should be denied. Rollback: restore the old matcher and file.
