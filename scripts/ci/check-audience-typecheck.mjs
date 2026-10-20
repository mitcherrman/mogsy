/**
 * USERS-LAUNCH1: allow only two verified existing main-branch type diagnostics.
 * This is NOT a blanket skip: fail on any new diagnostic or changed source.
 * Remove the allowlist as soon as the parent repo type-check is repaired.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowed = [
  "src/components/onboarding/OnboardingProfile.tsx(180,48): error TS2345:",
  "src/lib/identity/connections.ts(263,13): error TS2345:",
];

const check = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.app.json"], {
  shell: process.platform === "win32", encoding: "utf8",
});
if (check.error) throw check.error;
const output = (check.stdout || "") + (check.stderr || "");
if (check.status === 0) {
  console.log("TypeScript: clean");
  process.exit(0);
}
const diagnostics = output.split(/\r?\n/).filter(line => /^.+\(\d+,\d+\): error TS\d+:/.test(line));
if (diagnostics.length !== allowed.length ||
    allowed.some(prefix => diagnostics.filter(line => line.startsWith(prefix)).length !== 1)) {
  console.error("New or unexpected TypeScript diagnostics:\n" + output);
  process.exit(1);
}
for (const path of [
  "src/components/onboarding/OnboardingProfile.tsx",
  "src/lib/identity/connections.ts",
]) {
  const baseline = spawnSync("git", ["show", "FETCH_HEAD:" + path], { encoding: "utf8" });
  if (baseline.status !== 0 || baseline.stdout !== readFileSync(path, "utf8")) {
    console.error(path + " differs from main; cannot classify as unchanged baseline error.");
    process.exit(1);
  }
}
console.log("TypeScript: only the two verified pre-existing, byte-identical main-branch diagnostics.");
