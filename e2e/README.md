# Combat Sim Battles — E2E acceptance suite

Playwright browser acceptance for the authenticated Combat Sim Battles loop.
Runs the vite dev server in **`e2e` mode** (loads `.env.e2e.local` →
`VITE_E2E_AUTH=1` + local backend URL) and a **disposable** FastAPI backend.
It never touches production Supabase or a production database.

## How identity works (no production auth is weakened)

- The backend runs locally with a **test** `SUPABASE_JWT_SECRET`. Persona tokens
  are ordinary Supabase-format HS256 JWTs signed with that secret, so the backend
  verifies them through its **real** production verification path — nothing is
  bypassed server-side. The admin persona's UUID is placed in
  `MOGSY_ADMIN_USER_IDS`.
- The frontend seam (`src/lib/e2e/identity.ts`) is double-gated:
  `import.meta.env.DEV === true && import.meta.env.VITE_E2E_AUTH === '1'`. Vite
  dead-code-eliminates it from any production build, and the flag only exists in
  `.env.e2e.local` (mode `e2e`), never in the unit-test (`test`) or production
  environments. `global-setup` mints the tokens; specs inject a chosen persona
  into `localStorage` before the app boots via `useIdentity()`.

## One-time setup

The chromium browser binaries are already present (shared with the quiz
screenshot tooling). Only the test runner needs installing:

```bash
npm i -D @playwright/test   # already declared in package.json devDependencies
# browsers already installed; if not: npx playwright install chromium
```

> Not installed automatically here because `node_modules` is shared (symlinked)
> across worktrees; install it when you want to run the suite in CI/locally.

## Run

```bash
# from the frontend worktree
npm run test:e2e
```

`global-setup`:
1. copies the backend reference DB to a disposable `e2e/.artifacts/e2e.db`,
2. ensures/spawns the acceptance backend on `:8000` (test secret + admin allowlist),
3. seeds the deterministic dataset (`engine_tests/e2e_harness/seed_acceptance.py`),
4. mints persona JWTs to `e2e/.artifacts/personas.json`.

Env overrides: `E2E_BACKEND_DIR` (default `../../LCS_phase2b_settlement`),
`E2E_BACKEND_URL` (default `http://127.0.0.1:8000`), `E2E_DB_PATH`.

## Coverage (`combat-battles.spec.ts`)

1. Guest index grouped by lifecycle + sign-in CTA (void hidden)
2. Verified prediction create/edit (aria-pressed, persists across reload)
3. Rapid double-submit → single server-authoritative pick
4. Revealed result renders authoritative combat values
5. Revealed-but-unsettled → pending personal outcome
6. Settled correct → +100 + Arena Score; 6b second account privacy
7. Draw → push
8. Void → public reason + zero award (D1 regression)
9/10. Admin route gate + events + controls; non-admin denied
11. No pre-reveal leakage (locked); 11b no guest correctness
12. Mobile viewport smoke (no horizontal overflow)

## Limitations

- Exact lock/reveal *time-boundary* transitions are covered deterministically at
  the service layer (backend `engine_tests/test_combat_battle_lifecycle.py` with
  an injectable clock); the browser suite asserts the locked/revealed **states**
  rather than driving wall-clock crossings.
- Admin mutation happy-paths (create→validate→publish→settle) are proven at the
  HTTP contract layer (backend suite + Phase 3B curl acceptance). The browser
  admin spec asserts the gated UI loads and lists events.
