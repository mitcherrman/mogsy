/**
 * PGM2 — board reports for the other Ranked-backed bonus games, against the
 * servers' own captured snapshots.
 *
 * For every captured PUBLIC snapshot of each module: the report names the
 * board; it carries the correct board and its evidence ONLY when the viewer's
 * own reveal row (sent after their lock) is present, and never otherwise.
 */
import { describe, expect, it } from "vitest";
import reconstruct from "@/lib/ranked-public/__fixtures__/reconstructServerCapture.json";
import orderForge from "@/lib/ranked-public/__fixtures__/orderForgeServerCapture.json";
import scrub from "@/lib/ranked-public/__fixtures__/scrubServerCapture.json";
import rosterLock from "@/lib/ranked-public/__fixtures__/assemblyRosterLockServerCapture.json";
import draftMemory from "@/lib/ranked-public/__fixtures__/assemblyDraftMemoryServerCapture.json";
import { readPublicRound, type PublicRoundView } from "@/lib/ranked-public/contracts";
import { rendererForSegment } from "./registry";

type Capture = Record<string, unknown>;

const CASES: [string, Capture, "reconstruct" | "orderForge" | "scrub" | "assembly"][] = [
  ["Reconstruct", reconstruct as Capture, "reconstruct"],
  ["Order Forge", orderForge as Capture, "orderForge"],
  ["Chronoscope", scrub as Capture, "scrub"],
  ["Roster Lock", rosterLock as Capture, "assembly"],
  ["Draft Memory", draftMemory as Capture, "assembly"],
];

function publicSnapshots(capture: Capture): [string, PublicRoundView][] {
  return Object.entries(capture)
    .filter(([k, v]) => k.startsWith("public_") && v && typeof v === "object")
    .map(([k, v]) => [k, readPublicRound(JSON.parse(JSON.stringify(v)))] as [string, PublicRoundView])
    .filter(([, pub]) => pub.segmentState !== null);
}

describe.each(CASES)("PGM2 — %s board report", (_name, capture, key) => {
  const snaps = publicSnapshots(capture);

  it("has captured public snapshots to check", () => {
    expect(snaps.length).toBeGreaterThan(0);
  });

  it.each(snaps.map(([k]) => k))("%s: names the board, and the answer only after this viewer's reveal", (k) => {
    const pub = snaps.find(([name]) => name === k)![1];
    const renderer = rendererForSegment(pub.segment)!;
    expect(renderer.reportBoard).toBeTypeOf("function");
    const report = renderer.reportBoard!(pub);
    expect(report).not.toBeNull();
    expect(report!.prompt.length).toBeGreaterThan(0);
    const revealed = pub.segmentState!.ownChallengeReveals
      .some((r) => r.challengeIndex === 0 && !!(r as unknown as Record<string, unknown>)[key]);
    if (revealed) {
      expect(report!.canonical).toBeTruthy();
    } else {
      expect(report!.canonical ?? null).toBeNull();
      expect(report!.evidence ?? null).toBeNull();
    }
  });

  it("an open (unlocked) board has no selection and no answer", () => {
    const open = snaps.find(([k]) => k === "public_open");
    if (!open) return;
    const report = rendererForSegment(open[1].segment)!.reportBoard!(open[1])!;
    expect(report.selected ?? null).toBeNull();
    expect(report.canonical ?? null).toBeNull();
  });
});

describe("PGM2 — the captures exercise the revealed branch too", () => {
  it("at least one captured snapshot per module carries the viewer's own reveal", () => {
    const revealedModules = new Set<string>();
    for (const [, capture, key] of CASES) {
      for (const [, pub] of publicSnapshots(capture)) {
        if (pub.segmentState!.ownChallengeReveals.some((r) => !!(r as unknown as Record<string, unknown>)[key])) {
          revealedModules.add(key);
        }
      }
    }
    expect([...revealedModules].sort()).toEqual(["assembly", "orderForge", "reconstruct", "scrub"]);
  });
});
