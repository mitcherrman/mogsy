# Mogzy-wide browser and process safety

**Applies to every workstream and agent** (Claude Code, ChatGPT/Codex, subagents, test runners and automation) in this repository. Read this before executing tests. These rules override historical handoff instructions that call for local browser screenshots.

## Default: no automated desktop browsers

- **Never launch local Microsoft Edge or installed Google Chrome through automation** on the user's Windows PC. Forbidden examples: Playwright `channel: "msedge"` or `channel: "chrome"`, installed-browser `executablePath`, GUI browser launch loops, personal/signed-in browser profiles and headed Playwright tests.
- Prefer **GitHub Actions** for all browser, screenshot, viewport and E2E test matrices. The browser must run on GitHub's remote runner, not on the user's PC.
- Local unit and integration tests that do not launch browsers are permitted.

## Exception: explicitly approved local headless tests only

- Before any local browser automation, **ask for and receive explicit authorization for that run**. State the browser, machine, number of cases and whether visible windows can open.
- When authorized, use **bundled headless Chromium**, not installed Edge/Chrome; **one worker maximum**, small bounded cases, no parallel sweeps and a firm timeout. Do not reuse the user's profile.
- Never leave tests, background browser processes or test dev servers running. Always use `try/finally` to close contexts, browser and owned server on error and normal exit; gracefully handle SIGINT/SIGTERM. Do not `process.exit()` before teardown.
- Never kill the user's browsers or all processes by executable name: no blanket `taskkill /IM msedge.exe /F` or `taskkill /IM chrome.exe /F`. Stop only owned processes; no production data touches.
- A forced kill / OS crash cannot be intercepted reliably; never claim otherwise.

## Legacy tests and enforcement

- Existing Edge-using test scripts are **not grandfathered in**: do not execute them locally as written. Update their default to safe headless + opt-in, or move execution to CI in a separate reviewed change.
- Check any `PW_CHANNEL`, `W3A_CHANNEL` or related environment variables before running browser tests; a safe-looking command may resolve to installed Edge.
- Do not silently start browsers using Cloud/Desktop Computer Use tools against the user's actual Windows session; require separate explicit permission.
- No agent should replace these rules with a per-issue handoff. Check and preserve this file when spinning up new instances.

**Incident motivating policy:** repeated local Edge/Chrome automation made the user's Windows desktop unusable and stole foreground focus. Safety and unattended desktop usability are more important than test speed.

## Risk-based verification (applies to every workstream and subagent)

Local verification must be proportional to risk and must never stop work because the owner is using the PC. League of Legends and Firefox with many tabs being open is the **normal** state of this machine; ordinary targeted tests are expected to run alongside them. Iterate on the narrowest test that proves the change, verify once at the end, and send exhaustive or browser suites to CI.

| Level | Use for | Local verification (targeted = up to 8 named test files, runs directly) | Remote (GitHub Actions) |
|---|---|---|---|
| **L1** isolated | copy/text, CSS-only, docs, a pure helper with its own test, typo/rename inside one module | The touched file's own test if one exists; `tsc`/ESLint on touched files only. Docs: nothing | Path-filtered workflows run on the PR; nothing extra |
| **L2** behavioral | changed component/hook/route behavior, new state, API-client change, admin/analytics logic | Targeted tests for the touched module and its direct importers. At most **one** broader run (the module folder) at the end, through the guard, only if the targeted files do not cover the behavior | The existing acceptance workflow for the touched paths (`docs/dev/TESTING_MATRIX.md`); never local browsers |
| **L3** critical / release | auth and identity, billing/Stripe/entitlements, RLS and SQL migrations, ranked/daily scoring integrity, owner/admin access control, build/bundler/dependency changes, release or merge-to-main candidates | All tests of the **affected system** once, plus one production `build` when build or tooling changed; broad parts through the guard, sequentially | All path-filtered workflows touching the system, plus any release gate named in the handoff |

**Safe to omit at L1** (and why): folder or full Vitest runs (the touched file's own test is the evidence), `npm run build` (no tooling change), screenshots and viewport sweeps (the path-filtered CI workflow covers visuals), baseline-vs-branch comparisons (no behavior change), `tsc` over the whole project (type-check touched files instead).

**Never omitted** (L2/L3 keep them, whatever the machine load): the tests of the changed behavior; for L3 the affected-system tests, the security/RLS PGlite tests (`src/test/security`) for SQL, migration or entitlement changes, the billing/identity module tests for payment or auth changes, Daily/Ranked scoring tests for gameplay integrity changes, one `build` for tooling/dependency changes, and every path-matched CI workflow before release. If a required gate cannot run (CI unavailable, billing-blocked, tool broken on this PC), the handoff says **NOT RUN** with the reason. An unavailable CI run is never reported as a pass, and a required release gate is never silently dropped.

**Every workstream states in its plan/handoff:** (1) verification level and why; (2) the exact test files/commands, what each proves, and what is deliberately not run locally (and the CI job that covers it); (3) expected local impact: targeted (one jsdom worker, typically <0.6 GB and seconds) or broad (guarded; minutes, ~1-2.5 GB).

**Do not:** rerun an unchanged, already-green test "to be sure"; repeat a full-suite or baseline comparison after a fix (re-run only the failed files); run `vitest run` (all ~1,200 files) or `npm run build` to check a small edit; take screenshots or baseline comparisons during implementation; start watch mode; install dependencies per worktree or per session (reuse the shared install; ask before adding a new one).

## Local resources: targeted tests run freely, broad jobs are serialized

The owner's PC has 16 GB RAM and usually has League of Legends and Firefox (12+ tabs) open; free RAM is often below 1 GB. Overlapping broad jobs from several sessions (15-worker Vitest, many pytest processes, validators, dev servers) are what saturated it. Targeted runs are not the problem and are never gated.

- **Targeted tests** (up to 8 named `*.test.*` files, e.g. `npx vitest run src/lib/x.test.ts src/components/Y.test.tsx`): run them directly. No lock, no RAM, CPU, disk or League admission check. `vitest.config.ts` bounds them locally: 1 worker, no file parallelism, a per-worker heap cap (`MOGZY_VITEST_HEAP_MB`, default 2048) and below-normal CPU priority (workers inherit it), so the game and the browser are scheduled first. Several sessions may run targeted tests at the same time.
- **Broad jobs** (Vitest with directories, substring filters, more than 8 files, `--coverage`/`--changed`/`related`; `npm test` without files; `npm run build`/`vite build`; `tsc` over the project; ESLint over the tree; Playwright; prerender/video scripts): run them only when the level requires it, once, via `tools/dev-guard/mogzy-guard.cmd run --class <vitest|build|e2e> -- <command>`. The guard holds one machine-wide broad-job lock (bounded wait, default 120 s) and **never refuses a job because of League, Firefox or low free RAM**. Those conditions only shrink the job (1 worker; Idle priority while League is in a match) inside a per-job memory cap. If the lock wait times out, keep working on targeted tests or use CI and run the broad job once later. Do not poll it in a loop.
- The Claude hook (owner-installed) lets targeted runs through and redirects broad ones to the guard. Do not forge `MOGZY_GUARD_*` variables or wrap a broad job in a script to get past it.
- Never kill processes you did not start; never kill by image name. Stop only a dev server/test process **you** started, by exact PID, after checking its command line.
- Dev servers: start one only when a task needs it, record the PID, stop it in the same task. Do not leave `vite`, `esbuild` or test servers running (`mogzy-guard.cmd status` lists them).
- Prefer the existing path-filtered GitHub Actions workflows for broad and browser verification (a draft PR triggers them; the repo is public so minutes are free). Do not add redundant workflows.
- Worktrees belong **outside OneDrive** (e.g. `C:\Users\mlmit\mogzy-wt\<name>`) and reuse the shared `node_modules`; agents never delete or move existing worktrees.

See `docs/dev/TESTING_MATRIX.md` for the per-task matrix and `tools/dev-guard/README.md` for the guard and hook.

## Audience and report projections
- Overview browser journeys use explicit visitor/session correlation only; account-only server events stay unattributed to avoid guessed cross-device joins.
- Keep captured feedback claims in the pure admin report projection and diagnostics collapsed; this makes evidence boundaries testable without changing owner access.
