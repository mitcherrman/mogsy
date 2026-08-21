/**
 * RG — the round timeline's presentation.
 *
 * The strip has to do four things at once and this file holds it to all four:
 * read as PROGRESSION and never as a result; express "the marker holds still
 * while the rounds travel" in the DOM rather than only in the model;
 * distinguish past, present and future by more than colour; and say out loud —
 * to a screen reader — only what is actually known about each round.
 */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RoundTimeline, nodeLabel } from "./RoundTimeline";
import {
  TIMELINE_ANCHOR_INDEX, TIMELINE_VISIBLE_NODES, projectRoundTimeline,
  type RoundTimelineInput, type TimelineNode, type TimelineSegmentKind,
} from "@/pages/quiz-ranked/roundTimeline";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const source = readFileSync(
  resolve(process.cwd(), "src/components/ranked-arena/RoundTimeline.tsx"), "utf8");

function view(over: Partial<RoundTimelineInput> = {}) {
  return projectRoundTimeline({
    roundNumber: 8, completedRounds: 7, segmentRoundNumber: null,
    settlements: [], viewerSlot: "p1", ...over,
  });
}

const atRound = (round: number, over: Partial<RoundTimelineInput> = {}) =>
  view({ roundNumber: round, completedRounds: round - 1, ...over });

const mount = (round = 8, over: Partial<RoundTimelineInput> = {}) =>
  render(<RoundTimeline timeline={atRound(round, over)} />);

const strip = () => screen.getByTestId("ranked-round-timeline");
const node = (round: number) => screen.getByTestId(`timeline-node-${round}`);
const plate = (round: number) =>
  node(round).querySelector(".ranked-timeline-plate") as HTMLElement;
const marker = () => screen.getByTestId("ranked-timeline-marker");
/** The X offset a node/marker is parked at, in whole slots. */
const slotOffset = (el: HTMLElement) =>
  Number(/translateX\((-?\d+)%\)/.exec(el.style.transform)![1]) / 100;

/**
 * The text a SIGHTED reader sees: the strip minus the per-node screen-reader
 * sentences. `textContent` includes those, and they legitimately name what is
 * known — so asserting "no word labels" against the raw string would be
 * asserting the opposite of the accessibility contract.
 */
function visibleText(): string {
  const clone = strip().cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((el) => el.remove());
  return clone.textContent ?? "";
}

// ------------------------------------------------------------------ shape

describe("the strip's shape", () => {
  it("renders a constant number of visible slots at every round", () => {
    for (const round of [1, 2, 5, 6, 12, 13, 25, 100]) {
      const { unmount } = mount(round);
      const visible = screen.getAllByRole("listitem")
        .filter((li) => li.getAttribute("data-visible") === "true");
      expect(visible, `round ${round}`).toHaveLength(TIMELINE_VISIBLE_NODES);
      expect(strip()).toHaveAttribute("data-visible-nodes", String(TIMELINE_VISIBLE_NODES));
      unmount();
    }
  });

  it("mounts one clipped buffer node beyond each edge, so nothing pops", () => {
    mount(20);
    const items = screen.getAllByRole("listitem");
    const buffered = items.filter((li) => li.getAttribute("data-visible") === "false");
    // Round 19 window is 16..24; the buffer is 15 on the left and 25 on the right.
    expect(buffered.map((li) => li.getAttribute("data-round")).sort()).toEqual(["15", "25"]);
    expect(items).toHaveLength(TIMELINE_VISIBLE_NODES + 2);
  });

  it("keeps every node the same fixed box, whatever its state", () => {
    mount(8);
    const plates = Array.from(
      document.querySelectorAll<HTMLElement>(".ranked-timeline-plate"));
    const boxes = new Set(plates.map((p) => p.className.match(/h-\d+/)?.[0]));
    expect(boxes).toEqual(new Set(["h-8"]));
    // One slot width for every node, so the track divides the strip exactly.
    const widths = new Set(Array.from(screen.getAllByRole("listitem"))
      .map((li) => (li as HTMLElement).style.width));
    expect(widths.size).toBe(1);
  });

  it("divides the arena's width rather than growing past it", () => {
    mount(8);
    const width = (screen.getAllByRole("listitem")[0] as HTMLElement).style.width;
    // Nine slots of 1/9 each: the track can never be wider than its container.
    expect(Number.parseFloat(width)).toBeCloseTo(100 / TIMELINE_VISIBLE_NODES, 4);
    // The arena's standing rule: no surface inside it scrolls internally. The
    // track is CLIPPED, which is not a scroll container.
    expect(source).not.toMatch(/overflow-x-auto|overflow-x-scroll|overflow-auto|overflow-y-auto/);
    expect(source).toContain("overflow-hidden");
  });
});

// --------------------------------------- the moving track / stationary marker

describe("the marker holds still while the rounds travel", () => {
  it("parks each node at its own slot", () => {
    mount(20);   // window 16..24, buffer 15 and 25
    expect(slotOffset(node(15))).toBe(-1);
    expect(slotOffset(node(16))).toBe(0);
    expect(slotOffset(node(20))).toBe(TIMELINE_ANCHOR_INDEX);
    expect(slotOffset(node(24))).toBe(TIMELINE_VISIBLE_NODES - 1);
    expect(slotOffset(node(25))).toBe(TIMELINE_VISIBLE_NODES);
  });

  it("moves EVERY node exactly one slot left when the round advances", () => {
    const { rerender } = render(<RoundTimeline timeline={atRound(20)} />);
    const before = new Map(screen.getAllByRole("listitem")
      .map((li) => [li.getAttribute("data-round")!, slotOffset(li as HTMLElement)]));

    rerender(<RoundTimeline timeline={atRound(21)} />);
    for (const [round, offset] of before) {
      const still = screen.queryByTestId(`timeline-node-${round}`);
      if (!still) continue;             // the far-left buffer node has retired
      expect(slotOffset(still as HTMLElement), `round ${round}`).toBe(offset - 1);
    }
  });

  it("leaves the marker EXACTLY where it was across many advances", () => {
    const { rerender } = render(<RoundTimeline timeline={atRound(5)} />);
    const anchored = marker().style.transform;
    expect(slotOffset(marker())).toBe(TIMELINE_ANCHOR_INDEX);

    for (const round of [6, 7, 8, 12, 13, 25, 100]) {
      rerender(<RoundTimeline timeline={atRound(round)} />);
      expect(marker().style.transform, `round ${round}`).toBe(anchored);
      expect(strip()).toHaveAttribute("data-anchored", "true");
      // ...and it rings the round actually in play.
      expect(slotOffset(node(round))).toBe(TIMELINE_ANCHOR_INDEX);
    }
  });

  it("walks the marker out to the anchor over the opening rounds", () => {
    const { rerender } = render(<RoundTimeline timeline={atRound(1)} />);
    expect(slotOffset(marker())).toBe(0);
    expect(strip()).toHaveAttribute("data-anchored", "false");
    for (const [round, slot] of [[2, 1], [3, 2], [4, 3], [5, 4]] as const) {
      rerender(<RoundTimeline timeline={atRound(round)} />);
      expect(slotOffset(marker()), `round ${round}`).toBe(slot);
      // The window itself has not moved yet — the marker is what travels.
      expect(strip()).toHaveAttribute("data-window-start", "1");
    }
    expect(strip()).toHaveAttribute("data-anchored", "true");
  });

  it("shares one slot arithmetic between the marker and the node it rings", () => {
    mount(20);
    // Same width and same transform unit, so the ring can never drift off the
    // plate it is ringing.
    expect(marker().style.width).toBe((node(20) as HTMLElement).style.width);
    expect(marker().style.transform).toBe((node(20) as HTMLElement).style.transform);
  });

  it("keeps the marker OUTSIDE the clip so its ring cannot be shaved", () => {
    mount(8);
    const clip = strip().querySelector(".ranked-timeline-clip")!;
    expect(clip.contains(marker())).toBe(false);
    expect(clip.contains(node(8))).toBe(true);
    // The rail is fixed ground — it is not inside the moving track either.
    const track = strip().querySelector("ol")!;
    expect(track.contains(strip().querySelector(".ranked-timeline-rail")!)).toBe(false);
  });

  it("never re-bases: 12 → 13 is one ordinary slide", () => {
    const { rerender } = render(<RoundTimeline timeline={atRound(12)} />);
    expect(strip()).toHaveAttribute("data-window-start", "8");
    const markerAt12 = marker().style.transform;

    rerender(<RoundTimeline timeline={atRound(13)} />);
    expect(strip()).toHaveAttribute("data-window-start", "9");
    expect(marker().style.transform).toBe(markerAt12);
    // Round 12 did not vanish or jump — it simply moved one slot left.
    expect(slotOffset(node(12))).toBe(TIMELINE_ANCHOR_INDEX - 1);
  });
});

// ------------------------------------------- past / current / future states

describe("past, current and future", () => {
  it("marks each node's state, with exactly one current", () => {
    mount(20);
    for (const round of [16, 17, 18, 19]) {
      expect(node(round)).toHaveAttribute("data-state", "resolved");
    }
    expect(node(20)).toHaveAttribute("data-state", "current");
    for (const round of [21, 22, 23, 24]) {
      expect(node(round)).toHaveAttribute("data-state", "upcoming");
    }
    expect(document.querySelectorAll('[data-state="current"]')).toHaveLength(1);
  });

  it("gives the current round the strongest emphasis — and not by colour", () => {
    mount(20);
    expect(node(20)).toHaveAttribute("aria-current", "step");
    expect(node(19)).not.toHaveAttribute("aria-current");
    expect(node(21)).not.toHaveAttribute("aria-current");
    // A ring and a caret no other node has...
    expect(marker().querySelector(".ranked-timeline-marker-ring")).not.toBeNull();
    expect(marker().querySelector(".ranked-timeline-caret")).not.toBeNull();
    // ...and the ring is drawn with a spread shadow, so it costs the plate no
    // geometry and cannot nudge it.
    expect(css).toMatch(/\.ranked-timeline-marker-ring \{[^}]*box-shadow/);
  });

  it("separates the three states by FILL, not only by hue", () => {
    expect(css).toMatch(
      /\.ranked-timeline-node\[data-state="upcoming"\] \.ranked-timeline-plate \{[^}]*opacity/);
    expect(css).toMatch(
      /\.ranked-timeline-node\[data-state="resolved"\] \.ranked-timeline-plate \{[^}]*background-color/);
    expect(css).toMatch(
      /\.ranked-timeline-node\[data-state="current"\] \.ranked-timeline-plate \{[^}]*background-color/);
    // The upcoming rule sets NO fill — that absence is the cue.
    const upcoming = /\.ranked-timeline-node\[data-state="upcoming"\] \.ranked-timeline-plate \{([^}]*)\}/
      .exec(css)![1];
    expect(upcoming).not.toContain("background-color");
  });

  it("drops the marker entirely once the match is over", () => {
    render(<RoundTimeline timeline={view({
      roundNumber: 14, completedRounds: 14, matchOver: true })} />);
    expect(screen.queryByTestId("ranked-timeline-marker")).toBeNull();
    expect(strip()).toHaveAttribute("data-current-round", "");
    expect(document.querySelectorAll('[data-state="current"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-state="upcoming"]')).toHaveLength(0);
  });
});

// ------------------------------------------------------- node vocabulary

describe("the node vocabulary", () => {
  const KINDS = new Map<number, TimelineSegmentKind>([
    [16, "standard"], [17, "meta-reflex"], [18, "standard"], [20, "meta-reflex"],
  ]);

  it("draws three marks and no more: block, ordinary round, unknown", () => {
    mount(20, { observedKinds: KINDS });
    // Meta Reflex: the SAME four-point star the block's own sting draws — one
    // system, not a second emblem invented for the strip.
    expect(plate(17).querySelector("path")!.getAttribute("d"))
      .toBe("M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z");
    expect(node(17)).toHaveAttribute("data-segment", "meta-reflex");
    // A server-named ordinary round: a solid engraved diamond.
    expect(node(16)).toHaveAttribute("data-segment", "standard");
    expect(plate(16).querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    // Never told: a hollow placeholder, NOT the ordinary-round mark.
    expect(node(19)).toHaveAttribute("data-segment", "");
    expect(plate(19).querySelector("circle")!.getAttribute("fill")).toBe("none");
    expect(plate(19).querySelector("path")).toBeNull();
  });

  it("leaves every future node neutral", () => {
    mount(20, { observedKinds: KINDS });
    for (const round of [21, 22, 23, 24]) {
      expect(node(round), `round ${round}`).toHaveAttribute("data-segment", "");
      expect(plate(round).querySelector("circle")).not.toBeNull();
      expect(node(round)).toHaveAttribute("data-outcome", "");
    }
  });

  it("carries no word labels under the nodes — only the ordinal", () => {
    mount(20, { observedKinds: KINDS });
    for (const round of [16, 20, 24]) {
      expect(node(round).querySelector(".ranked-timeline-ordinal")!.textContent)
        .toBe(String(round));
    }
    // And nothing from the retired schedule vocabulary survives anywhere.
    expect(visibleText()).not.toMatch(
      /easy|medium|hard|scenario|reflex|wave|cycle/i);
    expect(source).not.toMatch(/\bWAVE\b|RANKED_WAVE|waveCycle|waveSlot|scheduledKind/);
  });
});

// --------------------------------------------------------------- outcomes

describe("resolved outcomes", () => {
  const NODES: TimelineNode[] = [
    { roundNumber: 16, index: 0, visible: true, state: "resolved",
      segmentKind: "standard", outcome: "correct", tag: null },
    { roundNumber: 17, index: 1, visible: true, state: "resolved",
      segmentKind: "standard", outcome: "both-correct", tag: null },
    { roundNumber: 18, index: 2, visible: true, state: "resolved",
      segmentKind: "standard", outcome: "incorrect", tag: null },
    { roundNumber: 19, index: 3, visible: true, state: "resolved",
      segmentKind: "meta-reflex", outcome: "timed-out", tag: null },
    { roundNumber: 15, index: -1, visible: false, state: "resolved",
      segmentKind: null, outcome: null, tag: null },
    { roundNumber: 20, index: 4, visible: true, state: "current",
      segmentKind: "standard", outcome: null, tag: null },
  ];

  const mountNodes = () => render(<RoundTimeline timeline={{
    visibleNodes: TIMELINE_VISIBLE_NODES, anchorIndex: TIMELINE_ANCHOR_INDEX,
    windowStart: 16, currentIndex: 4, currentRoundNumber: 20, anchored: true,
    nodes: NODES }} />);

  const mark = (round: number) =>
    node(round).querySelector(".relative > svg:last-child") as SVGElement | null;

  it("marks each settled verdict in a distinct SHAPE per outcome", () => {
    mountNodes();
    expect(node(16)).toHaveAttribute("data-outcome", "correct");
    expect(node(17)).toHaveAttribute("data-outcome", "both-correct");
    expect(node(18)).toHaveAttribute("data-outcome", "incorrect");
    expect(node(19)).toHaveAttribute("data-outcome", "timed-out");
    // filled dot / ringed dot / cross / hollow ring — four drawings, so the
    // verdict is never carried by colour alone.
    expect(mark(16)!.querySelectorAll("circle")).toHaveLength(1);
    expect(mark(17)!.querySelectorAll("circle")).toHaveLength(2);
    expect(mark(18)!.querySelectorAll("path")).toHaveLength(1);
    expect(mark(19)!.querySelector("circle")!.getAttribute("fill")).toBe("none");
  });

  it("shows a resolved round whose verdict has aged out with NO mark", () => {
    mountNodes();
    expect(node(15)).toHaveAttribute("data-state", "resolved");
    expect(node(15)).toHaveAttribute("data-outcome", "");
    expect(mark(15)).toBeNull();
    // ...and the current round, which has not settled, likewise.
    expect(mark(20)).toBeNull();
  });

  it("keeps the verdict OUT of the recessed plate so it does not fade with it", () => {
    // Opacity composites a whole subtree. Nested inside the plate, a settled
    // node's verdict would dim with it — and the verdict is the one thing on a
    // past node worth reading.
    mountNodes();
    expect(plate(16).querySelector("circle")).toBeNull();
    expect(mark(16)).not.toBeNull();
  });

  it("reports NO damage, no HP and no score anywhere in the strip", () => {
    // Damage belongs to the top result beat and the duelist ledgers; a block's
    // 5-card scoreline belongs to the beat's transcript.
    mountNodes();
    expect(strip().textContent ?? "")
      .not.toMatch(/damage|dealt|taken|absorbed|\bhp\b|\d\s*\/\s*5/i);
  });
});

// ---------------------------------------------------------- accessibility

describe("accessible labels", () => {
  it("names round and state, and the segment ONLY when it is known", () => {
    mount(20, {
      observedKinds: new Map<number, TimelineSegmentKind>([
        [17, "meta-reflex"], [20, "meta-reflex"]]),
    });
    expect(screen.getByText("Round 20, current round, Meta Reflex")).toBeInTheDocument();
    expect(screen.getByText("Round 17, resolved, Meta Reflex")).toBeInTheDocument();
    // Never told: the label says nothing about the kind rather than guessing.
    expect(screen.getByText("Round 18, resolved")).toBeInTheDocument();
    expect(screen.getByText("Round 22, upcoming")).toBeInTheDocument();
  });

  it("adds the viewer's settled verdict to a resolved node's label", () => {
    const base = { roundNumber: 3, index: 0, visible: true,
      state: "resolved" as const, segmentKind: null, tag: null };
    expect(nodeLabel({ ...base, outcome: "correct" }))
      .toBe("Round 3, resolved, you answered correctly");
    expect(nodeLabel({ ...base, outcome: "both-correct" }))
      .toBe("Round 3, resolved, both correct");
    expect(nodeLabel({ ...base, outcome: "incorrect" }))
      .toBe("Round 3, resolved, you answered incorrectly");
    expect(nodeLabel({ ...base, outcome: "timed-out" }))
      .toBe("Round 3, resolved, you ran out of time");
    expect(nodeLabel({ ...base, segmentKind: "meta-reflex", outcome: "correct" }))
      .toBe("Round 3, resolved, Meta Reflex, you answered correctly");
  });

  it("has a label for every node, and hides the drawings from the reader", () => {
    mount(20);
    for (const item of screen.getAllByRole("listitem")) {
      const sr = item.querySelector(".sr-only")!;
      expect(sr.textContent).toMatch(/^Round \d+, /);
      for (const child of Array.from(item.children)) {
        if (child === sr) continue;
        expect(child.getAttribute("aria-hidden")).toBe("true");
      }
    }
    expect(strip()).toHaveAttribute("aria-label", "Round timeline");
    expect(marker()).toHaveAttribute("aria-hidden");
  });

  it("renders a future question tag into the label ONLY if one is ever supplied", () => {
    // The seam, exercised. Nothing in the live projection produces this today
    // (see the model's tests) — it exists so a later phase has a shape to fill
    // rather than a reason to reach for `metadata_json`.
    expect(nodeLabel({
      roundNumber: 8, index: 4, visible: true, state: "current",
      segmentKind: null, outcome: null, tag: { kind: "role", role: "jungle" },
    })).toBe("Round 8, current round, jungle question");
  });
});

// ------------------------------------------------------------------ motion

describe("motion", () => {
  it("moves the track and the marker with one shared, bounded transition", () => {
    expect(css).toMatch(
      /\.ranked-timeline-node,\s*\n\.ranked-timeline-marker \{\s*transition: transform 320ms/);
    // Ease-out, no overshoot: deliberate rather than bouncy.
    const curve = /transition: transform 320ms (cubic-bezier\([^)]*\))/.exec(css)![1];
    expect(curve).toBe("cubic-bezier(0.22, 0.61, 0.36, 1)");
  });

  it("runs nothing forever and nothing on a loop", () => {
    const block = css.slice(css.indexOf("RG — the round timeline"),
      css.indexOf("---- Question folio"));
    expect(block).not.toMatch(/infinite|alternate/);
    expect(block).not.toMatch(/@keyframes/);
    expect(block).not.toMatch(/animation-name|animation:/);
  });

  it("drops the horizontal travel entirely for reduced motion", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.ranked-timeline-node,\s*\n\s*\.ranked-timeline-marker \{\s*\n\s*transition: none;/;
    expect(css).toMatch(reduced);
    // The state change is still perceptible — it simply cross-fades instead.
    const block = css.slice(css.indexOf("Reduced motion: the strip still UPDATES"));
    expect(block).toMatch(/\.ranked-timeline-plate,[\s\S]*?transition: opacity 160ms linear/);
  });
});

describe("no obsolete Ranked progression concepts", () => {
  it("mentions no XP, level, mastery or ability hotbar — this is not a progress bar", () => {
    mount(20);
    const text = strip().textContent ?? "";
    expect(text).not.toMatch(/\bxp\b|level|mastery|rank up|unlock|ability|hotbar|progress/i);
    expect(source).not.toMatch(/\bXP\b|levelUp|totalXp|nextLevelThreshold|AbilityTray|hotbar/);
    // And it is not a bar: discrete nodes, no filled track.
    expect(source).not.toMatch(/role="progressbar"|aria-valuenow/);
  });
});
