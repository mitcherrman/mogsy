# MOGZY frontend testing matrix

Companion to the *Risk-based verification* and *Local resource guard* sections of [AGENTS.md](../../AGENTS.md).
"Guard" = `tools/dev-guard/mogzy-guard.cmd run --class <class> -- <command>`. "CI" = existing path-filtered GitHub Actions
workflows in `.github/workflows/` (38 today; the repo is public so minutes are free). Never run browsers locally unless the owner
authorizes that specific run (AGENTS.md).

Reality check that drives this matrix: `vitest run` is ~1,200 test files with jsdom and, unbounded, one worker per CPU thread
(~15 here). All 38 workflows are path-filtered `pull_request` jobs on `ubuntu-latest` (20 run targeted Vitest files, 27 run
Playwright, a few run `tsc`/ESLint/build for their area). None is a repository-wide "run everything" gate, so there is no
automatic remote full-suite signal: exhaustive runs have to be requested deliberately (see *Release* below), and local Vitest should stay narrow.

| Task | Level | Local (through guard) | Remote / CI | Do NOT run |
|---|---|---|---|---|
| Docs, markdown, handoff text | L1 | nothing | nothing | any tests |
| Copy / label / text change in one component | L1 | `vitest run <that component's test file>` if one exists | matching path-filtered workflow runs on PR | folder or full suite |
| CSS / Tailwind / layout-only change | L1 | `vitest run` the component's style/structure test if present | the matching `*-acceptance`/`*-fit`/`*-visibility` Playwright workflow (mobile/desktop screenshots live here) | local browser, local screenshots, baseline comparisons |
| New pure helper or util in `src/lib/**` | L1 | `vitest run <helper>.test.ts` | none needed | whole `src/lib` |
| Changed component behavior or hook state | L2 | `vitest run <component dir>` once at the end (plus direct importers' tests) | matching acceptance workflow for touched paths | per-edit full-folder reruns, watch mode |
| New route / `App.tsx` / layout change | L2 | `vitest run` for the routes test (e.g. `admin-registry.routes.test.ts`) and the touched page dir | workflows listing `src/App.tsx`/`Layout.tsx` in `paths:` | full suite |
| Admin page or analytics projection | L2 | `vitest run src/components/admin/<area> src/lib/admin/<area>` | `admin-*`, `gameplay-analytics`, `launch-audience-pulse` as path-matched | unrelated admin areas |
| Daily / Ranked / Practice / Academy gameplay UI | L2 (L3 if scoring, rewards or progression integrity changes) | `vitest run` the module folder; L3: all tests of that system once | `daily-*`, `academy-*`, `practice-*`, `ranked-*` as path-matched | other games' folders |
| Supabase edge function (pure TS part) | L2; L3 if identity/billing/entitlement | `vitest run supabase/functions/<fn>` (only functions in `vitest.config.ts` `include`) | none (Deno-native tests are not runnable here) | all `supabase/functions` |
| SQL migration / RLS / security | **L3** | `vitest run src/test/security` (PGlite) once | review by owner before apply | applying migrations to any shared DB |
| Stripe / checkout / entitlements / identity | **L3** | all tests of the billing/identity module once, sequentially | path-matched workflows + owner review | production endpoints |
| Dependency bump, `vite.config.ts`, `tsconfig`, ESLint config | **L3** | one `build` (class `build`) + `vitest run` of tests that import the changed tooling | all workflows whose paths include the tooling files | repeated builds |
| `npm run build` as a sanity check on a small edit | none | not needed: use `tsc` on touched files or the focused test | CI/build gate at release | build per edit |
| Prerender / sitemap / video scripts | L2 | run the one script (class `build`) after changing it | — | `build` end to end |
| Release / merge-to-main candidate | **L3** | affected-system Vitest once + one `build` | every path-matched workflow green, plus gates named in the release handoff | full local suite "to certify" |

## Rules of thumb

* One verification command at a time. Wait for it. Fix, then re-run **only the failed files**.
* After a green run on unchanged code, do not rerun it. Record the command, count and date in the handoff instead.
* Screenshots, viewport sweeps and baseline comparisons: CI at the end of the workstream, not during implementation.
* If you need browser coverage and no workflow's `paths:` matches your change, add the path to the existing workflow in a separate reviewed change rather than creating a new workflow or running a browser locally.
* Resource estimates (for the plan): single test file ≈ <500 MB / seconds; Vitest folder (2 workers) ≈ 2–2.5 GB / minutes; `vite build` + prerender ≈ 2.5 GB+ / minutes; full Vitest ≈ the whole PC. Treat "full Vitest" as CI-only.
