// MG-P3.1 / MG-UX1 — the board's plan inside the Ranked arena's budgets:
// full-size targets, nothing scaled, every name set where the row has room,
// no two captions touching, and the ledger's room reserved from the start.
import { describe, expect, it } from "vitest";
import {
  captionFits, captionSpec, compositionFor, computeLayout, constellationGeometry, ledgerFit, ledgerNeed,
  minConstellationPitch, planBoard, planHeight, SEAL_NAME_BAND, wellSocket, type BoardPlan,
} from "./layout";

/** Long names from the certified roster (the worst cases for a caption). */
const LONG = [
  "Hextech Flashtraption", "Grasp of the Undying", "Stormraider's Surge", "Unsealed Spellbook", "Approach Velocity",
  "Transcendence", "Relentless Hunter", "Legend: Bloodline", "Presence of Mind", "Magical Footwear",
];

/** The arena's measured module budgets (root width × max height) per viewport. */
const ARENA = [
  { vp: "1600x900", width: 685, maxHeight: 640 },
  { vp: "1280x720", width: 584, maxHeight: 472 },
  { vp: "1366x650", width: 584, maxHeight: 402 },
  { vp: "1280x600", width: 584, maxHeight: 352 },
];
const DEALS = [[3, 7], [4, 8], [5, 10]] as const;

function overlap(a: { l: number; t: number; r: number; b: number }, c: { l: number; t: number; r: number; b: number }) {
  return Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1;
}

function checkPlan(p: BoardPlan, K: number, N: number) {
  const l = computeLayout({ width: p.instrW, height: p.instrH, groupCount: K, tier: p.tier, rows: p.rows ?? undefined });
  expect(l.sigil).toBeGreaterThanOrEqual(44);
  for (const s of l.seals) expect(2 * s.r).toBeGreaterThanOrEqual(44);
  // Three seats per group (the deal's maximum): sigils and their captions never touch.
  const boxes: { l: number; t: number; r: number; b: number; who: string }[] = [];
  for (let g = 0; g < K; g++) {
    for (let i = 0; i < 3; i++) {
      const c = l.seat(g, i);
      boxes.push({ l: c.x - l.sigil / 2, t: c.y - l.sigil / 2, r: c.x + l.sigil / 2, b: c.y + l.sigil / 2, who: `sigil ${g}.${i}` });
      const w = p.seatCaption.width;
      const band = p.seatCaption.band;
      if (band > 0) {
        const above = p.composition === "constellation";
        const t = above ? c.y - l.sigil / 2 - band : c.y + l.sigil / 2;
        boxes.push({ l: c.x - w / 2, t, r: c.x + w / 2, b: t + band, who: `caption ${g}.${i}` });
      }
      // Inside the board.
      expect(c.x - Math.max(l.sigil, w) / 2).toBeGreaterThanOrEqual(-1);
      expect(c.x + Math.max(l.sigil, w) / 2).toBeLessThanOrEqual(p.instrW + 1);
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlap(boxes[i], boxes[j]), `${boxes[i].who} touches ${boxes[j].who}`).toBe(false);
    }
  }
  if (p.rows) {
    // A row holds its seal + name and its sigil + caption.
    expect(p.rows.rowH).toBeGreaterThanOrEqual(Math.max(p.sigil + p.seatCaption.band, 2 * p.rows.sealR + SEAL_NAME_BAND));
    expect(p.seatCaption.width).toBeLessThanOrEqual(p.rows.seatPitch - 4);
  }
  // The well's sockets are distinct and inside the well; the ledger's room is reserved in it.
  const sockets = Array.from({ length: N }, (_, i) => wellSocket(p.well, i));
  for (const s of sockets) {
    expect(s.x - p.sigil / 2).toBeGreaterThanOrEqual(p.well.x);
    expect(s.x + p.sigil / 2).toBeLessThanOrEqual(p.well.x + p.well.w);
    expect(s.y + p.sigil / 2 + p.well.caption.band).toBeLessThanOrEqual(p.well.top + p.well.h);
  }
  expect(p.well.caption.width).toBeLessThanOrEqual(p.well.pitch - 4);
  expect(p.ledger.top + p.ledger.h).toBeLessThanOrEqual(p.boardH + 0.5);
  expect(p.ledger.h).toBeGreaterThanOrEqual(ledgerNeed(N, p.ledger.w));
  // Every correction fits the reserved room without scrolling.
  expect(ledgerFit(N, p.ledger.w, p.ledger.h).need).toBeLessThanOrEqual(p.ledger.h);
}

describe("captions", () => {
  it("two lines hold every certified name from 82px (10.5px type); one line holds the longest from 122px (11px type)", () => {
    const two = captionSpec(86, 2);
    expect(two.font).toBeGreaterThanOrEqual(10.5);
    for (const n of LONG) expect(captionFits(n, two), n).toBe(true);
    for (const n of LONG) expect(captionFits(n, captionSpec(126, 1)), n).toBe(true);
    expect(captionFits("Transcendence", captionSpec(70, 2))).toBe(false);
  });

  it("type never drops below 10px and a caption is never wider than its pitch", () => {
    for (const pitch of [64, 72, 80, 88, 96, 112, 124]) {
      for (const lines of [1, 2] as const) {
        const c = captionSpec(pitch, lines);
        expect(c.font).toBeGreaterThanOrEqual(10);
        expect(c.width).toBeLessThanOrEqual(pitch - 4);
      }
    }
  });
});

describe("the arena plan", () => {
  for (const a of ARENA) {
    for (const [K, N] of DEALS) {
      it(`${a.vp}, ${K} groups × ${N}: fits the stage, full-size targets, nothing touches`, () => {
        const p = planBoard({ width: a.width, maxHeight: a.maxHeight, groupCount: K, labels: LONG.slice(0, N), tier: "compact" });
        expect(planHeight(p)).toBeLessThanOrEqual(a.maxHeight);
        checkPlan(p, K, N);
      });
    }
  }

  it("uses the stage: four and five groups fill most of the budget", () => {
    for (const a of ARENA) {
      for (const [K, N] of DEALS.slice(1)) {
        const p = planBoard({ width: a.width, maxHeight: a.maxHeight, groupCount: K, labels: LONG.slice(0, N), tier: "compact" });
        expect(planHeight(p) / a.maxHeight, `${a.vp} ${K}`).toBeGreaterThan(0.75);
      }
    }
  });

  it("sets every name in full wherever the budget allows (1280×720 and up)", () => {
    for (const a of ARENA.slice(0, 2)) {
      for (const [K, N] of DEALS) {
        const p = planBoard({ width: a.width, maxHeight: a.maxHeight, groupCount: K, labels: LONG.slice(0, N), tier: "compact" });
        expect(p.truncated, `${a.vp} ${K}`).toBe(0);
      }
    }
  });

  it("keeps the constellation for three groups where it fits, rows for four and five", () => {
    const three = planBoard({ width: 685, maxHeight: 640, groupCount: 3, labels: LONG.slice(0, 7), tier: "compact" });
    expect(three.composition).toBe("constellation");
    const five = planBoard({ width: 685, maxHeight: 640, groupCount: 5, labels: LONG, tier: "compact" });
    expect(five.composition).toBe("ledger");
    expect(five.rail).toBe(true);
  });
});

describe("phones and hosts without a budget", () => {
  for (const width of [322, 352]) {
    for (const [K, N] of DEALS) {
      it(`${width}px, ${K} × ${N}: stacked rows, two-line names, nothing touches`, () => {
        const p = planBoard({ width, groupCount: K, labels: LONG.slice(0, N), tier: "compact" });
        expect(p.rail).toBe(false);
        expect(p.composition).toBe("ledger");
        expect(p.seatCaption.lines).toBe(2);
        checkPlan(p, K, N);
      });
    }
  }

  it("the rail is never chosen without a host budget", () => {
    expect(planBoard({ width: 584, groupCount: 5, labels: LONG, tier: "compact" }).rail).toBe(false);
  });
});

describe("constellation fan", () => {
  it("a shoulder's caption clears the top sigil and stays in its own column", () => {
    for (const tier of ["compact", "normal", "tall"] as const) {
      for (const pitch of [194, 228, 320]) {
        if (pitch < minConstellationPitch(tier)) continue;
        const c = constellationGeometry(tier, pitch);
        expect(c.shoulderX - c.caption.width / 2).toBeGreaterThanOrEqual(c.sigil / 2 + 2);
        expect(c.shoulderX + c.caption.width / 2).toBeLessThanOrEqual(pitch / 2);
        expect(c.top - c.shoulderY).toBeGreaterThanOrEqual(c.caption.band);
      }
    }
  });

  it("is never chosen by the composition rule for a narrow frame", () => {
    expect(compositionFor(584, 5, "compact")).toBe("ledger");
    expect(compositionFor(685, 3, "compact")).toBe("constellation");
    expect(minConstellationPitch("compact")).toBeGreaterThan(584 / 4);
  });
});

describe("phones stay as short as M1's board", () => {
  // M1/MG-P3 measured these roots in the arena (322px wide): 494 / 560 / 626.
  for (const [K, N, m1] of [[3, 7, 494], [4, 8, 560], [5, 10, 626]] as const) {
    it(`${K} × ${N}: three-tree boards match M1, larger ones stay within ~20%`, () => {
      const h = planHeight(planBoard({ width: 322, groupCount: K, labels: LONG.slice(0, N), tier: "compact" }));
      expect(h).toBeLessThanOrEqual(K === 3 ? m1 : Math.round(m1 * 1.2));
    });
  }
});
