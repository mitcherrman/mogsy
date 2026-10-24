// Scope of a test command: "targeted" (a few named test files) or "broad" (directories, substring filters,
// whole suites, related/changed graphs, parallel pytest).
//
// Why scope and not executable name: `vitest run src/lib/x.test.ts` costs one jsdom worker for seconds, while
// `vitest run` is ~1,200 files. Treating both as "heavy" made the guard block every ordinary test whenever
// Firefox or League was open (2026-10-23 regression). Targeted runs need no lock or admission check; their cost is
// bounded by vitest.config.ts (1 worker, no file parallelism, heap cap, below-normal priority).
//
// Shared by hook-pretooluse.mjs (decides allow/deny) and vitest.config.ts (decides worker caps). Pure, no I/O.

export const TARGETED_MAX_FILES = 8;

const VITEST_VALUE_FLAGS = new Set([
  "-c", "--config", "-r", "--root", "--dir", "--reporter", "--outputFile", "--project", "-t", "--testNamePattern",
  "--pool", "--environment", "--maxWorkers", "--minWorkers", "--shard", "--exclude", "--mode", "--testTimeout",
  "--hookTimeout", "--retry", "--bail", "--sequence.seed",
]);
const VITEST_SUBCOMMANDS = new Set(["run", "watch", "dev", "bench", "related", "list", "init"]);
const VITEST_BROAD_FLAGS = /^--(changed|coverage|related|ui|watch)(=|$)|^-w$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

const PYTEST_VALUE_FLAGS = new Set([
  "-k", "-m", "-p", "-c", "-o", "-W", "--rootdir", "--junitxml", "--junit-xml", "--tb", "--maxfail", "--basetemp",
  "--deselect", "--ignore", "--ignore-glob", "--durations", "--confcutdir", "--import-mode", "--log-level", "-r",
  "--capture", "--cov",
]);
const PYTEST_FILE = /\.py(::\S+)?$/i;

/** Positional (non-option) arguments, skipping the values of flags that take one. */
function positionals(args, valueFlags) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === "--") continue;
    if (a.startsWith("-")) {
      if (!a.includes("=") && valueFlags.has(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * @param {string[]} args vitest CLI arguments after the `vitest` program name
 * @returns {{scope:"targeted"|"broad", files:string[], reason:string}}
 */
export function vitestScope(args) {
  const a = args.map(String);
  if (a.some((x) => VITEST_BROAD_FLAGS.test(x))) return { scope: "broad", files: [], reason: "watch/coverage/changed/related mode" };
  let pos = positionals(a, VITEST_VALUE_FLAGS);
  if (pos[0] === "related") return { scope: "broad", files: [], reason: "related-file graph" };
  if (VITEST_SUBCOMMANDS.has(pos[0])) pos = pos.slice(1);
  if (pos.length === 0) return { scope: "broad", files: [], reason: "no file filter (whole suite)" };
  if (pos.length > TARGETED_MAX_FILES) return { scope: "broad", files: pos, reason: `${pos.length} filters > ${TARGETED_MAX_FILES}` };
  const notFile = pos.find((p) => !TEST_FILE.test(p));
  if (notFile) return { scope: "broad", files: pos, reason: `'${notFile}' is a directory or substring filter, not a test file` };
  return { scope: "targeted", files: pos, reason: `${pos.length} named test file(s)` };
}

/**
 * @param {string[]} args pytest arguments after `pytest` / `python -m pytest`
 * @returns {{scope:"targeted"|"broad", files:string[], reason:string}}
 */
export function pytestScope(args) {
  const a = args.map(String);
  if (a.some((x) => /^-n(\d|=|$)|^--numprocesses/.test(x))) return { scope: "broad", files: [], reason: "parallel pytest (-n): keep pytest single-process" };
  const pos = positionals(a, PYTEST_VALUE_FLAGS);
  if (pos.length === 0) return { scope: "broad", files: [], reason: "no test file (collects the whole tree)" };
  if (pos.length > TARGETED_MAX_FILES) return { scope: "broad", files: pos, reason: `${pos.length} paths > ${TARGETED_MAX_FILES}` };
  const notFile = pos.find((p) => !PYTEST_FILE.test(p));
  if (notFile) return { scope: "broad", files: pos, reason: `'${notFile}' is a directory, not a test file or node id` };
  return { scope: "targeted", files: pos, reason: `${pos.length} named test file(s)/node id(s)` };
}

/** `python -m unittest a.b.TestX` is targeted; `discover` or no target is broad. */
export function unittestScope(args) {
  const pos = positionals(args.map(String), new Set(["-k", "-s", "-p", "-t"]));
  if (pos.length === 0 || pos[0] === "discover") return { scope: "broad", files: [], reason: "unittest discovery" };
  if (pos.length > TARGETED_MAX_FILES) return { scope: "broad", files: pos, reason: `${pos.length} targets > ${TARGETED_MAX_FILES}` };
  return { scope: "targeted", files: pos, reason: `${pos.length} named unittest target(s)` };
}

/** Vitest CLI arguments of the current process (for vitest.config.ts): argv after the vitest entry script. */
export function currentVitestArgs(argv = process.argv) {
  const i = argv.findIndex((x) => /vitest([\\/](vitest|dist[\\/]cli)[\w.-]*)?\.m?js$|[\\/]vitest$/i.test(String(x)));
  return i >= 0 ? argv.slice(i + 1) : argv.slice(2);
}
