// Vitest globalSetup backstop for tools/dev-guard (see README.md).
//
// Why: the Claude PreToolUse hook only sees command text. A script, wrapper or alternate command that ends up
// starting Vitest would escape it. When MOGZY_GUARD_ENFORCE=1 (set in the owner's Claude settings) this makes
// an unguarded local run fail fast instead of competing for RAM. Otherwise it only prints one warning line.
// CI (GitHub Actions) and guarded runs (MOGZY_GUARD_TOKEN, set by mogzy-guard) are never affected.
export default function setup() {
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.MOGZY_GUARD_TOKEN) return;
  const msg =
    "[dev-guard] Vitest started outside mogzy-guard: no global one-heavy-job lock, no RAM/League check. " +
    "Use: mogzy-guard.cmd run --class vitest -- npx vitest run <files>  (see tools/dev-guard/README.md)";
  if (process.env.MOGZY_GUARD_ENFORCE === "1") throw new Error(msg);
  console.warn(msg);
}
