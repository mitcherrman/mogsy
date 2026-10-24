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

Local verification must be proportional to risk. Do not repeatedly run full suites, screenshot sweeps or baseline comparisons while implementing: iterate on the narrowest check, then verify once at the end. Release-critical gates are preserved (L3) and run remotely where possible.

| Level | Use for | Local verification | Remote (GitHub Actions) |
|---|---|---|---|
| **L1** isolated | copy/text, CSS-only, docs, a pure helper with its own test, typo/rename inside one module | Only the directly affected checks: `tsc`/lint on the touched files, the touched file's own test (`vitest run <file>`) | Path-filtered workflows run automatically on the PR; nothing extra |
| **L2** behavioral | changed component/hook/route behavior, new state, API-client change, admin/analytics logic | Focused unit/integration tests for the touched module and its direct importers; **one** `vitest run <dirs>` over the affected folder at the end | The relevant existing browser acceptance workflow for the touched paths (see `docs/dev/TESTING_MATRIX.md`); never local browsers |
| **L3** critical / release | auth and identity, billing/Stripe/entitlements, RLS and SQL migrations, ranked/daily scoring integrity, owner/admin access control, build/bundler/dependency changes, release or merge-to-main candidates | Comprehensive **affected-system** verification (all tests of the affected system, one production `build`), run once, sequentially, through the guard | All path-filtered workflows touching the system, plus any release gate named in the handoff. Exhaustive or cross-system suites go to CI, not the PC |

When in doubt choose the higher level for the *system* but still run it once. Never lower a level to save time on a critical system.

**Every workstream must state, in its plan/handoff before running anything heavy:**
1. **Verification level** (L1/L2/L3) and why.
2. **Test plan**: the exact commands/files, what each proves, and what is deliberately not run locally (and where it runs instead: CI job name).
3. **Estimated local resource impact**: low (<1 min, <500 MB), medium (Vitest over a folder; ~2.5 GB, minutes) or high (build, many files; ~2.5 GB+, long). Anything medium/high goes through the guard and is never run in parallel with another heavy job.

**Do not:** rerun an unchanged suite "to be sure"; run `vitest run` (all ~1200 files) or `npm run build` to check a small edit; take screenshots or baseline comparisons during implementation (do them once, in CI, at the end); start watch mode (`vitest` without `run`); run two verification commands concurrently.

## Local resource guard (one heavy job at a time, across all Claude sessions)

The owner's PC has 16 GB RAM and is often running League of Legends and Firefox. Overlapping Vitest/pytest/Vite/esbuild jobs from several sessions have driven CPU, RAM and disk to ~100 %.

- Heavy jobs are: Vitest (any scope beyond a single small file), `npm run build`/`vite build`, `tsc` over the project, ESLint over the tree, pytest/`unittest` suites, `*_validate.py` pipelines, Playwright (see browser rules above) and prerender/video scripts.
- Run them **only** via `mogzy-guard` (`tools/dev-guard/`): `mogzy-guard.cmd run --class vitest -- npx vitest run <files>`. It serializes heavy jobs machine-wide, caps workers, and refuses to start when RAM is short, the machine is saturated, or League of Legends is in a match. Once the owner approves installation, a Claude hook enforces this; until then follow it by convention.
- If the guard prints **BLOCKED** or times out waiting for the lock: stop, report the reasons, and do something else (docs, planning, reading code) or hand verification to CI. **Do not** poll in a loop, retry repeatedly, lower thresholds, forge `MOGZY_GUARD_*` variables, or run the command directly.
- Check `mogzy-guard.cmd status` before starting a heavy job if other sessions may be active. Never kill processes you did not start; never kill by image name. Stop only a dev server/test process **you** started, by exact PID, and verify its command line first.
- Dev servers: start only when a task needs one, on a free port, record the PID, and stop it in the same task. Do not leave `vite`, `esbuild` or test servers running between tasks.
- Prefer GitHub Actions for heavyweight verification: reuse the existing path-filtered workflows (a draft PR triggers them); do not add redundant workflows. The repo is public, so Actions minutes are free.
- Worktrees and dependencies belong **outside OneDrive** (e.g. `C:\Users\mlmit\mogzy-wt\<name>`); OneDrive syncing `node_modules` and `.git` internals adds disk and CPU load. Existing worktrees are never deleted or moved by agents.

See `docs/dev/TESTING_MATRIX.md` for the per-task matrix and `tools/dev-guard/README.md` for the guard.

## Audience and report projections
- Overview browser journeys use explicit visitor/session correlation only; account-only server events stay unattributed to avoid guessed cross-device joins.
- Keep captured feedback claims in the pure admin report projection and diagnostics collapsed; this makes evidence boundaries testable without changing owner access.
