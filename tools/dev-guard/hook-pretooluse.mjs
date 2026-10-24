#!/usr/bin/env node
// Claude Code PreToolUse hook (matcher: Bash|PowerShell).
//
// Denies a BROAD local test/build command unless it goes through mogzy-guard, and denies the few commands that
// would bypass or undermine the guard (forging its env vars, killing processes by image name).
//
// TARGETED test runs (<= 8 named test files, see scope.mjs) are always allowed directly: no lock, no RAM or League
// admission. Their cost is bounded by vitest.config.ts and by pytest being single-process. The 2026-10-23 version
// denied those too, and the guard then refused them whenever Firefox or League was open, which blocked ordinary work.
// It decides from the command text only (no resource probing: that is the guard's job), so it starts in ~50 ms.
//
// Fail-open on malformed input: a broken hook must never brick every tool call. The guard itself and the
// vitest/pytest enforcement backstops (MOGZY_GUARD_ENFORCE=1) still stop unguarded runs.
//
// Import `classify` for tests; run as a script to act as the hook (JSON on stdin).

import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { vitestScope, pytestScope, unittestScope } from "./scope.mjs";

const GUARD_CMD =
  process.env.MOGZY_GUARD_CMD ||
  `${(process.env.LOCALAPPDATA || "%LOCALAPPDATA%").replace(/\\/g, "/")}/mogzy-dev-guard/mogzy-guard.cmd`;

// ---------------------------------------------------------------- tokenising

/** Split on unquoted && || ; | & and newlines. Returns raw segment strings. */
export function splitSegments(cmd) {
  const out = [];
  let cur = "";
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      cur += c;
      if (c === q && cmd[i - 1] !== "\\") q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "&") {
      if ((c === "|" || c === "&") && cmd[i + 1] === c) i++;
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Whitespace tokenizer that strips matching quotes. */
export function tokenize(seg) {
  const toks = [];
  let cur = "";
  let q = null;
  let has = false;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (/\s/.test(c)) {
      if (has || cur) toks.push(cur);
      cur = ""; has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has || cur) toks.push(cur);
  return toks;
}

const prog = (t) => basename(String(t).replace(/\\/g, "/")).toLowerCase().replace(/\.(exe|cmd|bat|ps1|mjs|js)$/, "");
const SHELLS = new Set(["bash", "sh", "zsh", "cmd", "powershell", "pwsh"]);
const PREFIXES = new Set(["call", "start", "time", "env", "nohup", "nice", "exec", "command", "sudo", "&"]);
const RUNNERS = new Set(["npx", "bunx", "pnpx", "pnpm", "yarn", "npm", "bun", "corepack", "node", "tsx", "ts-node", "python", "python3", "py", "uv", "uvx", "pipx", "poetry", "deno"]);
const SCRIPT_HEAVY = new Set(["test", "test:watch", "build", "build:dev", "lint", "prerender:items", "prerender:champions"]);
const INFO_ONLY = /^(-v|-V|--version|-h|--help)$/;

// ---------------------------------------------------------------- classification

/** null when the selection is targeted (allowed directly), else the class for the guard. */
const broadOnly = (cls, s) => (s.scope === "targeted" ? null : cls);

function heavyClassFor(name, args) {
  if (args.length && args.every((a) => INFO_ONLY.test(a))) return null;
  switch (name) {
    case "vitest": return broadOnly("vitest", vitestScope(args));
    case "pytest": case "py.test": return broadOnly("pytest", pytestScope(args));
    case "playwright": return "e2e";
    case "tsc": return "build";
    case "remotion": return /^(render|studio|still|compositions)$/.test(args[0] || "") ? "build" : null;
    case "vite": return args.includes("build") ? "build" : null;
    case "eslint": {
      const files = args.filter((a) => !a.startsWith("-"));
      return files.length === 0 || files.some((f) => f === "." || f === "src" || f === "./src") ? "build" : null;
    }
    default: return null;
  }
}

function scriptHeavy(path) {
  const p = path.replace(/\\/g, "/");
  if (/(^|[\/_.-])validate([_.-]|\.py$)|validate_[\w-]+\.py$/i.test(basename(p))) return "generic";
  if (/(^|\/)(prerender-(items|champions)|render-[\w-]+-video|render-quiz-video|quiz-screenshots\/index)\.[cm]?[jt]s$/.test(p)) return "build";
  if (/\/(vitest)\/(vitest|dist\/cli)[\w.-]*\.m?js$/.test(p) || /vitest\.mjs$/.test(p)) return "vitest";
  if (/\/typescript\/(bin|lib)\/tsc(\.js)?$/.test(p)) return "build";
  if (/\/vite\/bin\/vite\.js$/.test(p)) return "vite";
  if (/\/@?playwright(\/test)?\/cli\.js$/.test(p) || /playwright\/cli\.js$/.test(p)) return "e2e";
  if (/(^|\/)pytest(\.py)?$/.test(p)) return "pytest";
  return null;
}

function classifyTokens(toks, depth) {
  let t = toks.slice();
  while (t.length) {
    // FOO=1 cmd (env prefix) and PowerShell `$V = "...vitest.mjs"` (a variable holding a path is not a run;
    // `$out = npx vitest run` still is, because the tokens after the assignment are classified)
    if (/^\$?[A-Za-z_][A-Za-z0-9_:]*=/.test(t[0]) || PREFIXES.has(prog(t[0]))) { t.shift(); continue; }
    if (/^\$[A-Za-z_][A-Za-z0-9_:]*$/.test(t[0]) && t[1] === "=") {
      t.splice(0, 2);
      if (t.length === 1 && /[\\/]/.test(t[0])) return null; // `$V = "C:/x/vitest.mjs"`: a path value
      continue;
    }
    break;
  }
  if (!t.length || depth > 4) return null;
  const name = prog(t[0]);
  const args = t.slice(1);

  if (name === "mogzy-guard") return { guarded: true };

  if (SHELLS.has(name)) {
    const i = args.findIndex((a) => /^(-c|-lc|-ec|-command|-c:|\/c|\/k)$/i.test(a));
    if (i >= 0 && args[i + 1] !== undefined) return classifyCommand(args.slice(i + 1).join(" "), depth + 1);
    return null;
  }

  const direct = heavyClassFor(name, args);
  if (direct) {
    const why = direct === "vitest" ? vitestScope(args).reason : direct === "pytest" ? pytestScope(args).reason : "";
    return { cls: direct, what: why ? `${name} (${why})` : name };
  }

  if (RUNNERS.has(name)) {
    if (["npm", "pnpm", "yarn", "bun"].includes(name)) {
      const a = args.filter((x) => !x.startsWith("-"));
      const script = a[0] === "run" || a[0] === "run-script" ? a[1] : a[0];
      if (script === "test" && vitestScope(args.slice(args.indexOf(script) + 1)).scope === "targeted") return null;
      if (script && (SCRIPT_HEAVY.has(script) || /^test:e2e/.test(script))) {
        return { cls: /^test:e2e/.test(script) ? "e2e" : script.startsWith("test") ? "vitest" : "build", what: `${name} ${script}` };
      }
      if (["exec", "dlx", "x"].includes(a[0]) && a[1]) return classifyTokens(a.slice(1), depth + 1);
    }
    if (["npx", "bunx", "pnpx", "uvx", "pipx", "corepack"].includes(name)) {
      const i = args.findIndex((x) => !x.startsWith("-"));
      if (i >= 0) return classifyTokens(args.slice(i), depth + 1);
    }
    if (["python", "python3", "py", "uv", "poetry"].includes(name)) {
      const m = args.findIndex((x) => x === "-m");
      if (m >= 0 && /^(pytest|unittest)$/.test(args[m + 1] || "")) {
        const rest = args.slice(m + 2);
        const s = args[m + 1] === "pytest" ? pytestScope(rest) : unittestScope(rest);
        return s.scope === "targeted" ? null : { cls: "pytest", what: `python -m ${args[m + 1]} (${s.reason})` };
      }
      if (m >= 0 && args[m + 1] === "playwright") return { cls: "e2e", what: "python -m playwright" };
      const s = args.find((x) => /\.py$/i.test(x));
      if (s) { const c = scriptHeavy(s); if (c) return { cls: c, what: basename(s) }; }
      if (name === "uv" || name === "poetry") return classifyTokens(args.filter((x) => !["run"].includes(x)), depth + 1);
    }
    if (["node", "tsx", "ts-node", "deno"].includes(name)) {
      for (const [i, x] of args.entries()) {
        if (x.startsWith("-")) continue;
        const c = scriptHeavy(x);
        const rest = args.slice(i + 1);
        if (c === "vitest" && vitestScope(rest).scope === "targeted") return null;
        if (c === "pytest" && pytestScope(rest).scope === "targeted") return null;
        if (c && c !== "vite") return { cls: c, what: basename(x) };
        if (c === "vite" && args.includes("build")) return { cls: "build", what: "vite build" };
      }
    }
  }
  return null;
}

function classifyCommand(cmd, depth = 0) {
  // $(...) and `...` payloads are classified too
  const inner = [...cmd.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)].map((m) => m[1] || m[2]).filter(Boolean);
  for (const s of inner) { const r = classifyCommand(s, depth + 1); if (r && r.cls) return r; }
  for (const seg of splitSegments(cmd)) {
    const r = classifyTokens(tokenize(seg), depth);
    if (r && r.cls) return r;
  }
  return null;
}

const FORGERY = /(\bMOGZY_GUARD_(TOKEN|ACTIVE|ENFORCE|POLICY|STATE_DIR|OVERRIDE|CMD)\s*=)|(\$env:MOGZY_GUARD_\w+\s*=)|(set(x)?\s+MOGZY_GUARD_)|(SetEnvironmentVariable\([^)]*MOGZY_GUARD)|(Remove-Item[^\n]*mogzy-dev-guard)|(\brm\b[^\n]*mogzy-dev-guard)/i;
const NAME_KILL = /(\btaskkill\b[^\n]*\/im\b)|(\bStop-Process\b[^\n]*-Name\b)|(\bGet-Process\b[^\n|]*\|\s*Stop-Process)|(\bpkill\b)|(\bkillall\b)|(\bwmic\b[^\n]*process[^\n]*delete)/i;

/**
 * @param {string} command raw command text from the Bash/PowerShell tool
 * @returns {{decision:"allow"|"deny", rule?:string, reason?:string}}
 */
export function classify(command) {
  if (typeof command !== "string" || !command.trim()) return { decision: "allow" };

  if (FORGERY.test(command)) {
    return {
      decision: "deny",
      rule: "guard-bypass",
      reason:
        "Blocked: this command sets or clears mogzy-guard environment variables or deletes its state. Those are owner-only controls. " +
        "Run heavy jobs through the guard instead; ask the owner if policy needs to change.",
    };
  }
  if (NAME_KILL.test(command)) {
    return {
      decision: "deny",
      rule: "no-blanket-kill",
      reason:
        "Blocked: killing processes by image name or via a Get-Process pipeline can hit the owner's browsers, League client or other Claude sessions. " +
        "Stop only a process YOU started, by exact PID (taskkill /PID <pid> or Stop-Process -Id <pid>), and verify the PID's command line first.",
    };
  }

  const hit = classifyCommand(command);
  if (hit && hit.cls) {
    const cls = hit.cls === "vite" ? "build" : hit.cls;
    return {
      decision: "deny",
      rule: "unguarded-heavy-job",
      cls,
      reason:
        `Not run: '${hit.what}' is a broad local job. Options, best first:\n` +
        "  1. Narrow it to the test files that prove the change: up to 8 named *.test.* / test_*.py files run immediately, without the guard.\n" +
        "  2. If the broad run is really required (L2 end-of-task folder run, L3 affected system), run it ONCE through the guard. It serializes broad jobs across sessions but never refuses because of League, Firefox or free RAM:\n" +
        `     ${GUARD_CMD} run --class ${cls} -- <your original command>\n` +
        "  3. Exhaustive and browser suites: the path-filtered GitHub Actions workflow on the PR. If CI is unavailable, report that; it is not a pass (AGENTS.md).",
    };
  }
  return { decision: "allow" };
}

// ---------------------------------------------------------------- hook entry point

/** Tools whose `command` input is a shell command line that this hook classifies. Keep in sync with the
 *  matcher in claude-settings.proposed.json (the matcher decides what reaches the hook; this is a second check). */
export const COVERED_TOOLS = new Set(["Bash", "PowerShell", "Monitor", "mcp__terminal__run_in_terminal"]);
export const isCoveredTool = (tool) => COVERED_TOOLS.has(tool);

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch (e) {
    process.stderr.write(`mogzy hook: unparseable input, allowing (${e.message})\n`);
    return;
  }
  const tool = input.tool_name;
  const command = input.tool_input && (input.tool_input.command ?? input.tool_input.script);
  if (tool && !isCoveredTool(tool)) return;
  const v = classify(command);
  if (v.decision === "deny") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: v.reason,
        },
      }),
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => { process.stderr.write(`mogzy hook error, allowing: ${e && e.message}\n`); });
}
