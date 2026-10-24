// Run with:  node --test tools/dev-guard/hook-pretooluse.test.mjs   (pure string logic, milliseconds, no browsers/servers)
import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "./hook-pretooluse.mjs";

const denied = (cmd, cls) => {
  const v = classify(cmd);
  assert.equal(v.decision, "deny", `expected deny: ${cmd}`);
  if (cls) assert.equal(v.cls, cls, `class for: ${cmd}`);
};
const allowed = (cmd) => assert.equal(classify(cmd).decision, "allow", `expected allow: ${cmd}`);

test("direct heavy commands are denied with the right class", () => {
  denied("npx vitest run src/foo.test.ts", "vitest");
  denied("npm test", "vitest");
  denied("npm run test -- --coverage", "vitest");
  denied("bun run build", "build");
  denied("npm run test:e2e:frontend", "e2e");
  denied("npx playwright test -c playwright.config.ts", "e2e");
  denied("python -m pytest -q test_x.py", "pytest");
  denied("py -m unittest -v knowledge_engine.tests.test_x", "pytest");
  denied("pytest engine_tests", "pytest");
  denied("npx tsc --noEmit -p tsconfig.app.json", "build");
  denied("npx vite build", "build");
  denied("npx eslint .", "build");
  denied("python C:/Users/x/lcs-mech-data/a/a_validate.py scripts", "generic");
  denied("tsx scripts/prerender-items.ts", "build");
});

test("wrappers and alternate entry points do not bypass the check", () => {
  denied('bash -c "npx vitest run"', "vitest");
  denied('cmd /c "npm test"', "vitest");
  denied('powershell -NoProfile -Command "python -m pytest -q"', "pytest");
  denied("FOO=1 npx vitest run", "vitest");
  denied("cd app && npx vitest run", "vitest");
  denied("echo hi; pytest -q", "pytest");
  denied("npx vitest run | tail -20", "vitest");
  denied("echo $(npx vitest run)", "vitest");
  denied("node node_modules/vitest/vitest.mjs run", "vitest");
  denied("node ./node_modules/typescript/bin/tsc -p .", "build");
  denied("pnpm exec vitest run", "vitest");
  denied("npm exec -- vitest run", "vitest");
  denied("uv run python -m pytest", "pytest");
});

test("guarded commands pass", () => {
  allowed("C:/Users/mlmit/AppData/Local/mogzy-dev-guard/mogzy-guard.cmd run --class vitest -- npx vitest run x.test.ts");
  allowed("mogzy-guard.cmd status");
  allowed('bash -c "mogzy-guard.cmd run --class pytest -- python -m pytest -q t.py"');
});

test("a guarded segment does not excuse an unguarded one", () => {
  denied("mogzy-guard.cmd status && npx vitest run");
});

test("mentions are not executions", () => {
  allowed("git commit -m 'speed up vitest config'");
  allowed("grep -rn vitest package.json");
  allowed("cat vitest.config.ts");
  allowed("git log --oneline -5");
  allowed("npx vitest --version");
  allowed("pytest --help");
  allowed("echo 'run npm test later'");
  allowed("eslint src/foo.ts");
  allowed("python scripts/helper.py");
  allowed("npm install");
});

test("guard-bypass attempts are denied", () => {
  denied("MOGZY_GUARD_TOKEN=abc npx vitest run");
  denied('$env:MOGZY_GUARD_ENFORCE = "0"; ls');
  denied("export MOGZY_GUARD_ACTIVE=1 && ls");
  denied("setx MOGZY_GUARD_OVERRIDE 1");
  denied("rm -rf ~/AppData/Local/mogzy-dev-guard");
});

test("blanket process killing is denied but exact-PID kills pass", () => {
  denied("taskkill /IM chrome.exe /F");
  denied("taskkill /F /IM node.exe");
  denied("Stop-Process -Name node -Force");
  denied("Get-Process node | Stop-Process");
  denied("pkill -f vitest");
  allowed("taskkill /PID 1234 /T");
  allowed("Stop-Process -Id 1234");
});

test("empty or odd input is allowed (fail open)", () => {
  allowed("");
  allowed(undefined);
  allowed("   ");
});
