/**
 * Static guards for the live layer (H1 / G7): live code must never import a
 * fixture and must contain no formula/correctness math or canonical ID generation
 * (identities are validated + preserved by the G5 parsers, never minted here).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_SOURCES = ["api.ts", "MasteryPlayerLive.tsx", "MasteryReviewerLive.tsx", "index.ts"];

function read(name: string): string {
  return readFileSync(join(HERE, name), "utf8");
}

describe("live layer static guards", () => {
  it("no live source imports a fixture", () => {
    for (const f of LIVE_SOURCES) {
      const src = read(f);
      expect(src, `${f} imports fixtures`).not.toMatch(/from\s+["'][^"']*__fixtures__/);
      expect(src, `${f} imports ../fixtures`).not.toMatch(/from\s+["'][^"']*\/fixtures["']/);
    }
  });

  it("no live source hashes or generates canonical IDs or computes formulas", () => {
    for (const f of LIVE_SOURCES) {
      const src = read(f);
      expect(src, `${f} references hashing`).not.toMatch(/createHash|sha256|content_hash|subtle\.digest/i);
      // No home-grown minting of canonical ids (prefixes are only ever parsed).
      expect(src, `${f} mints a snap_/txn_/mset_ id`).not.toMatch(/["'`](snap_|txn_|mset_|martifact_|mqstep_|rankcapsule_)\$\{/);
    }
  });
});
