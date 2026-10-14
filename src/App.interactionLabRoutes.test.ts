/**
 * MIG1.1 — the Interaction Lab must not exist in a production build.
 *
 * Mirrors `App.teamSimRoutes.test.ts` (COMBAT1): the guarantee is a property
 * of what App.tsx REGISTERS, so it is asserted on the route map. The gate is
 * `import.meta.env.DEV`, the literal `false` in a production build, and it
 * guards BOTH the lazy import and the <Route> — so production has neither the
 * path nor the chunk. (The MIG1.1 handoff records the `vite build` output that
 * confirms the chunk is absent.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERACTION_LAB_ROUTE, isInteractionLabEnabled } from "@/lib/interaction-grammar/featureGate";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const appCode = stripComments(read("src/App.tsx"));

afterEach(() => vi.unstubAllEnvs());

describe("interaction lab route map", () => {
  it("gates the lazy import itself, so production emits no lab chunk", () => {
    expect(appCode).toMatch(
      /const InteractionLab = isInteractionLabEnabled\(\)\s*\?\s*lazy\(\(\) => import\("\.\/pages\/dev\/interaction-lab\/InteractionLab"\)\)\s*:\s*null;/,
    );
    // Exactly one import site of the lab module anywhere in App.
    expect(appCode.match(/pages\/dev\/interaction-lab\//g) ?? []).toHaveLength(1);
  });

  it("registers the route only behind the same gate", () => {
    expect(appCode).toMatch(
      /isInteractionLabEnabled\(\) && InteractionLab\s*\?\s*\(\s*<Route path=\{INTERACTION_LAB_ROUTE\}/,
    );
    // Declared through the constant, never a duplicated literal.
    expect(appCode).not.toMatch(/path="\/dev\/interaction-lab"/);
    expect(INTERACTION_LAB_ROUTE).toBe("/dev/interaction-lab");
  });

  it("gates on the build mode and nothing else", () => {
    const gate = stripComments(read("src/lib/interaction-grammar/featureGate.ts"));
    const fn = gate.slice(gate.indexOf("export function isInteractionLabEnabled"));
    expect(fn).toMatch(/return import\.meta\.env\?\.DEV === true;/);
    expect(fn).not.toMatch(/VITE_/);
  });

  it("is off when the build is not DEV and on when it is", () => {
    vi.stubEnv("DEV", false);
    expect(isInteractionLabEnabled()).toBe(false);
    vi.stubEnv("DEV", true);
    expect(isInteractionLabEnabled()).toBe(true);
  });

  it("is not linked from navigation or the sitemap", () => {
    for (const file of [
      "src/components/hud/GlobalHud.tsx",
      "src/pages/LolHub.tsx",
      "scripts/generate-sitemap.ts",
    ]) {
      expect(read(file), `${file} must not link to the interaction lab`).not.toMatch(/interaction-lab/);
    }
  });
});
