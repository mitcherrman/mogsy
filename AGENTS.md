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

## Audience and report projections
- Overview browser journeys use explicit visitor/session correlation only; account-only server events stay unattributed to avoid guessed cross-device joins.
- Keep captured feedback claims in the pure admin report projection and diagnostics collapsed; this makes evidence boundaries testable without changing owner access.
