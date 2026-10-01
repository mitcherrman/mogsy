/**
 * OF3-F3 — Order Forge V2 against the REAL server capture.
 *
 * `__fixtures__/orderForgeServerCapture.json` is the backend's
 * `fixtures/order_forge_v2_wire_capture.json` (B3, `of3/b3-durable-refs`,
 * sha256 c924338c…5048 as committed LF), written by
 * `test_order_forge_v2_wire_capture.py`. Three segments over the families
 * `champion_stat:hp@lvl18`, `item_cost`, `champion_stat:ad@lvl18`: wrong /
 * right / never locked. Never edit it; regenerate it.
 *
 * This file pins ONLY what V2 changes on the wire. V1 behaviour is pinned by
 * `contracts.orderForge.v1ServerCapture.test.tsx` against the frozen V1
 * capture. No reader or renderer is V2-specific: the same readers, the same
 * `orderForgeModule` and the same `resolveQuizAssetUrl` read both.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentTranscript } from "@/components/ranked-arena/SegmentTranscript";
import { orderForgeModule } from "@/lib/ranked-core/modules/orderForgeModule";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import v1 from "./__fixtures__/orderForgeV1ServerCapture.json";
import capture from "./__fixtures__/orderForgeServerCapture.json";
import {
  readMatchReview, readPrivatePlayer, readPublicRound, readResolvedEnvelope,
  readSegmentSettlement, type PrivatePlayerView,
} from "./contracts";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));

const VIEWER = capture.meta.viewer_user_id;
const [HP, , AD] = capture.meta.families;

type RawEntry = { entry_id: string; label: string; media?: { src: string; alt: string } | null };
type RawState = { challenges: { family: string; challenges: { entries: RawEntry[] }[] } };
const raw = (body: { payload: { segment_state: unknown } }) =>
  body.payload.segment_state as RawState;

function viewport(view: PrivatePlayerView) {
  return render(
    <orderForgeModule.Viewport publicRound={view} selection={null}
      permissions={NO_INTERACTIONS} onSelect={vi.fn()}
      segmentState={view.segmentState} skewMs={0}
      actions={{ submitChallenge: vi.fn(), busy: false, error: null }} />,
  );
}

/** Every leaf key path; array indices and participant-id map keys collapsed. */
function leafPaths(v: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => leafPaths(x, `${prefix}[]`, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      leafPaths(x, `${prefix}.${/^([0-9a-f]{8}-|p_[0-9a-f]+$)/.test(k) ? "<id>" : k}`, out);
    }
  } else out.add(prefix);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe("V2 capture — provenance and shape", () => {
  it("is a V2 capture over two champion families and an item family", () => {
    expect(capture.meta.module_version).toBe(2);
    expect(capture.meta.families)
      .toEqual(["champion_stat:hp@lvl18", "item_cost", "champion_stat:ad@lvl18"]);
    expect((v1.meta as { module_version?: number }).module_version).toBeUndefined();
  });

  it("adds only two meta fields over the frozen V1 capture's key paths", () => {
    const v1Paths = leafPaths(v1);
    const added = [...leafPaths(capture)].filter((p) => !v1Paths.has(p)).sort();
    expect(added).toEqual([".meta.families[]", ".meta.module_version"]);
  });

  it("puts no ref or value string in the pre-reveal public payload", () => {
    const text = JSON.stringify([capture.private_open, capture.public_open]);
    expect(text).not.toContain("order:");
    expect(text).not.toContain("replay_target");
    expect(text).not.toMatch(/\d (HP|AD|gold)/);
  });
});

describe("V2 capture — the existing readers accept it", () => {
  it("reads module_version 2 through the same renderer and block shape", () => {
    const view = readPrivatePlayer(capture.private_open);
    expect(view.segment.moduleId).toBe("order_forge");
    expect(view.segment.moduleVersion).toBe(2);
    expect(rendererForSegment(view.segment)).toBe(orderForgeModule);
    const r = raw(capture.private_open);
    expect(r.challenges.family).toBe(HP);
    expect(view.segmentState!.block).toEqual({
      contract: "order_forge",
      prompt: "Order these champions by Health at level 18",
      metricLabel: "Health (lvl 18)",
      directionLabels: { first: "Highest", last: "Lowest" },
      entries: r.challenges.challenges[0].entries.map((e) => ({
        entryId: e.entry_id, label: e.label, media: e.media })),
    });
    expect(readPublicRound(capture.public_open).segmentState!.block)
      .toEqual(view.segmentState!.block);
  });

  it("reads the second champion family (AD) once the bot settles segment 2", () => {
    const view = readPrivatePlayer(capture.private_after_bot_settled);
    expect(raw(capture.private_after_bot_settled).challenges.family).toBe(AD);
    expect(view.segmentState!.segmentNumber).toBe(3);
    expect(view.segmentState!.block).toMatchObject({
      contract: "order_forge",
      prompt: "Order these champions by Attack Damage at level 18",
    });
  });

  it("reads the own reveal with the server's champion-stat strings", () => {
    const forge = readPrivatePlayer(capture.private_locked)
      .segmentState!.ownChallengeReveals[0].orderForge!;
    expect(forge.isCorrect).toBe(false);
    expect(forge.valueDisplay).toEqual({
      e1: "2,878 HP", e4: "2,494 HP", e3: "2,250 HP", e0: "1,982 HP", e2: "1,690 HP" });
  });

  it.each([
    ["resolved_incorrect", capture.resolved_incorrect, "2,878 HP"],
    ["resolved_correct", capture.resolved_correct, "3,200 gold"],
    ["resolved_timeout", capture.resolved_timeout, "131 AD"],
  ] as const)("reads %s settlement strings", (_n, body, first) => {
    const reveal = readSegmentSettlement(readResolvedEnvelope(body).payload)!.reveal;
    expect(reveal.moduleId).toBe("order_forge");
    expect(reveal.orderForge!.valueDisplay[reveal.orderForge!.canonicalOrder[0]]).toBe(first);
    expect(Object.keys(reveal.orderForge!.valueDisplay)).toHaveLength(5);
  });

  it("renders the transcript for the item and the AD segments", () => {
    for (const body of [capture.resolved_correct, capture.resolved_timeout]) {
      const settlement = readSegmentSettlement(body.payload)!;
      const rev = body.payload.segment_reveal;
      const opp = Object.keys(rev.players).find((id) => id !== VIEWER)!;
      const { unmount } = render(<SegmentTranscript reveal={settlement.reveal}
        viewerUserId={VIEWER} opponentUserId={opp} />);
      const first = rev.entries.find((e) => e.entry_id === rev.canonical_order[0])!;
      expect(screen.getByTestId("of-transcript-correct")).toHaveTextContent(first.label);
      unmount();
    }
  });

  it("reads the review: three order_forge rounds, one per family", () => {
    const review = readMatchReview(capture.review);
    expect(review.rounds.map((r) => r.kind)).toEqual(Array(3).fill("order_forge"));
    expect(review.rounds.map((r) => r.orderForge!.outcome))
      .toEqual(["incorrect", "correct", "timeout"]);
    expect(review.rounds.map((r) => r.orderForge!.entries[0].valueDisplay))
      .toEqual(["1,982 HP", "850 gold", "114 AD"]);
  });
});

describe("V2 capture — champion media through the existing asset path", () => {
  it("serves repo-relative champion paths, in the same form as item paths", () => {
    for (const body of [capture.private_open, capture.private_after_bot_settled]) {
      for (const e of raw(body).challenges.challenges[0].entries) {
        expect(e.media!.src).toBe(`assets/champions/${e.label}/icon.png`);
      }
    }
    for (const e of capture.review.payload.rounds[1].entries) {
      expect(e.media.src).toMatch(/^assets\/items\/\d+\.png$/);
    }
  });

  it("resolveQuizAssetUrl resolves a champion path on the same base as an item path", () => {
    const champ = resolveQuizAssetUrl("assets/champions/Sona/icon.png")!;
    const item = resolveQuizAssetUrl("assets/items/3108.png")!;
    expect(champ).toMatch(/^https?:\/\/[^/]+\/assets\/champions\/Sona\/icon\.png$/);
    expect(champ.slice(0, champ.indexOf("/assets/")))
      .toBe(item.slice(0, item.indexOf("/assets/")));
  });

  it("renders every open-segment champion card with the resolved image", () => {
    for (const body of [capture.private_open, capture.private_after_bot_settled]) {
      const { unmount } = viewport(readPrivatePlayer(body));
      for (const e of raw(body).challenges.challenges[0].entries) {
        const img = screen.getByTestId(`forge-card-${e.entry_id}`).querySelector("img")!;
        expect(img.getAttribute("src")).toBe(resolveQuizAssetUrl(e.media!.src));
        expect(img.getAttribute("src")).toContain(`/assets/champions/${e.label}/icon.png`);
      }
      unmount();
    }
  });

  it("the review reader keeps each entry's media path, which resolves like any other", () => {
    // The review card renders no entry art (V1 and V2 alike); the reader still
    // carries the server's path, so the same resolver covers it if that changes.
    const review = readMatchReview(capture.review);
    review.rounds.forEach((round, i) => {
      round.orderForge!.entries.forEach((e, j) => {
        const served = capture.review.payload.rounds[i].entries[j].media.src;
        expect(e.media).toBe(served);
        expect(resolveQuizAssetUrl(e.media)).toMatch(/\/assets\/(champions\/.+\/icon|items\/\d+)\.png$/);
      });
    });
  });

  it("falls back to the monogram, not a broken URL, for an entry with no media", () => {
    const body = structuredClone(capture.private_open);
    raw(body).challenges.challenges[0].entries[0].media = null;
    viewport(readPrivatePlayer(body));
    expect(screen.getByTestId("forge-card-e0").querySelector("img")).toBeNull();
  });
});
