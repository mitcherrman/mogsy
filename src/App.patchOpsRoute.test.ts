/**
 * Routing contract for the Patch Ops admin surface (Patch Ops Phase 3G),
 * pinned against the App.tsx declarations in the same style as
 * App.routing-contract.test.ts: the declaration IS the contract.
 *
 * The point of these assertions is containment. The Patch Ops projection
 * describes production publishing — patch versions in flight, canonical writes
 * applied, operations that failed to close — and none of it may become
 * reachable from a public route by a later edit that moves the block.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

/** The `/admin/knowledge` element block, from its <Route> to its closing tag. */
function knowledgeBlock(): string {
  const start = source.indexOf('path="/admin/knowledge"');
  expect(start, "no /admin/knowledge parent route").toBeGreaterThan(-1);
  const end = source.indexOf("</Route>", start);
  expect(end, "unterminated /admin/knowledge route block").toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Patch Ops admin route", () => {
  it("declares the operation detail route with the lazy + Suspense convention", () => {
    const line = source
      .split("\n")
      .find((l) => l.includes('path="patch-ops/:operationId"') && l.includes("<Route"));
    expect(line, "no <Route> declared for the Patch Ops operation detail").toBeTruthy();
    expect(line).toContain("PatchOpsDetail");
    expect(line).toContain("Suspense");
  });

  it("lazy-loads the page from the knowledge admin tree", () => {
    expect(source).toContain(
      'lazy(() => import("./pages/admin/knowledge/PatchOpsDetail"))',
    );
  });

  it("lives INSIDE the /admin/knowledge block, which is master_admin gated", () => {
    const block = knowledgeBlock();
    expect(block).toContain('path="patch-ops/:operationId"');
    expect(block).toContain('roles={["master_admin"]}');
    expect(block).toContain("AdminRoute");
  });

  it("declares no Patch Ops route outside the admin tree", () => {
    // Every occurrence of the detail path must be the one inside the gate.
    const occurrences = source.split('path="patch-ops/:operationId"').length - 1;
    expect(occurrences).toBe(1);
    expect(source).not.toContain('path="/patch-ops');
    expect(source).not.toContain('PatchOpsCard');
  });
});
