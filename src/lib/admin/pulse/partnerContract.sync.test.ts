// PULSE-2B ⇄ PULSE-2C: the mirrored partner records must stay byte-identical
// to 2C's contract. Until #153 is merged the source file is absent and the
// comparison is skipped (reported as such); after integration it runs on
// every CI build, so the two can never drift silently.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");
const MIRROR = resolve(root, "src/lib/admin/pulse/partnerContract.ts");
const SOURCE = resolve(root, "src/features/academy-pulse/content/partners/partner-contract.ts");

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

function mirrorBlocks(): string[] {
  const text = norm(readFileSync(MIRROR, "utf8"));
  return [...text.matchAll(/\/\* mirror:begin \*\/\n([\s\S]*?)\n\/\* mirror:end \*\//g)].map((m) => m[1].trim());
}

describe("partner contract mirror", () => {
  it("has the two mirrored blocks (creator records, sponsor records)", () => {
    const blocks = mirrorBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("export interface CreatorRecord");
    expect(blocks[1]).toContain("export interface SponsorCampaignRecord");
  });

  it.skipIf(!existsSync(SOURCE))("is byte-identical to PULSE-2C partner-contract.ts", () => {
    const source = norm(readFileSync(SOURCE, "utf8"));
    for (const block of mirrorBlocks()) expect(source).toContain(block);
  });
});
