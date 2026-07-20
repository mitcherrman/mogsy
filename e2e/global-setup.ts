// Playwright global setup for Combat Sim Battles acceptance.
//
// Responsibilities (all against a DISPOSABLE local backend — never prod):
//   1. Ensure the acceptance backend (FastAPI/uvicorn) is running on :8000 with
//      the test JWT secret + admin allowlist + disposable DB. If not already up,
//      spawn it.
//   2. Seed the deterministic acceptance dataset (real services).
//   3. Mint persona JWTs and write them to e2e/.artifacts/personas.json for the
//      specs to inject.
//
// Env (with defaults):
//   E2E_BACKEND_DIR   backend worktree            (default: ../LCS_phase2b_settlement)
//   E2E_DB_PATH       disposable sqlite copy       (default: e2e/.artifacts/e2e.db, copied from backend lol_calc.db)
//   E2E_BACKEND_URL   backend base url             (default: http://127.0.0.1:8000)
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ARTIFACTS = path.join(HERE, ".artifacts");
const BACKEND_DIR = process.env.E2E_BACKEND_DIR || path.resolve(HERE, "../../LCS_phase2b_settlement");
const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://127.0.0.1:8000";
const JWT_SECRET = "combat-sim-battles-e2e-test-secret-do-not-use-in-prod";
const ADMIN_UUID = "0000e2e0-0000-4000-8000-0000000000ad";

async function isUp(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/combat-battles`);
    return r.ok;
  } catch {
    return false;
  }
}

async function waitUp(url: string, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await isUp(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`backend never came up at ${url}`);
}

export default async function globalSetup(_config: FullConfig) {
  mkdirSync(ARTIFACTS, { recursive: true });
  const dbPath = process.env.E2E_DB_PATH || path.join(ARTIFACTS, "e2e.db");

  // Disposable DB copy so seeding never mutates the committed reference DB.
  if (!existsSync(dbPath)) {
    const ref = path.join(BACKEND_DIR, "lol_calc.db");
    if (!existsSync(ref)) throw new Error(`reference DB not found at ${ref}`);
    copyFileSync(ref, dbPath);
  }

  const env = {
    ...process.env,
    LOL_CALC_DB_PATH: dbPath,
    SUPABASE_JWT_SECRET: JWT_SECRET,
    MOGSY_ADMIN_USER_IDS: ADMIN_UUID,
    MOGSY_ADMIN_EMAILS: "e2e-admin@example.test",
  };

  if (!(await isUp(BACKEND_URL))) {
    const proc = spawn("python", ["-m", "uvicorn", "api_server:app", "--host", "127.0.0.1",
      "--port", "8000", "--log-level", "warning"], { cwd: BACKEND_DIR, env, stdio: "inherit" });
    // Record pid so teardown can stop it.
    writeFileSync(path.join(ARTIFACTS, "backend.pid"), String(proc.pid));
    await waitUp(BACKEND_URL);
  }

  // Seed dataset + mint tokens using the backend's own harness modules.
  execFileSync("python", ["-m", "engine_tests.e2e_harness.seed_acceptance", "--reset"],
    { cwd: BACKEND_DIR, env, stdio: "inherit" });
  const tokensJson = execFileSync("python", ["-m", "engine_tests.e2e_harness.mint_tokens",
    "--secret", JWT_SECRET, "--ttl-seconds", "7200"], { cwd: BACKEND_DIR, env }).toString();

  const toks = JSON.parse(tokensJson);
  const personas: Record<string, unknown> = {};
  for (const [k, v] of Object.entries<any>(toks)) {
    personas[k] = {
      token: v.token,
      user: { id: v.sub, email: v.email, is_anonymous: v.is_anonymous },
      admin: v.admin,
    };
  }
  writeFileSync(path.join(ARTIFACTS, "personas.json"), JSON.stringify(personas, null, 2));
}
