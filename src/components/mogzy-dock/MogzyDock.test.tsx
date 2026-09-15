/**
 * FB1-4 — Ranked Rules and the question reporter as a MIRRORED PAIR.
 *
 * This is the structural half of the "must not obscure the question" rule.
 * The behavioural half (the panel is `fixed`, outside the arena, and pauses
 * nothing) is already asserted by RankedRulesScroll.test.tsx; what is new is
 * that there are two controls with two anchors, and nothing about the CSS
 * would fail loudly if the mirror drifted or if one ran off its own edge.
 *
 * WHY THESE ASSERT CLASSES AND NOT MEASURED BOXES
 * ──────────────────────────────────────────────
 * jsdom computes no layout: every `getBoundingClientRect` here is 0x0, so a
 * test that measured overlap would pass whatever the CSS said. What CAN be
 * pinned in this environment is the DECLARATION — which anchor each control
 * portals into, which edge that anchor pins to, which way its panel expands.
 * Those are the three facts the mirror is made of, and each of them is a
 * single token that a careless edit would flip. Real geometry is verified in
 * a browser at the six widths in the workstream notes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/mascot/MogzyMascot", () => ({
  MogzyMascot: () => <span data-testid="mascot" />,
}));

import { useState, type ReactNode } from "react";

import {
  DOCK_ORDER,
  DOCK_SIDE,
  MogzyDockProvider,
  useMogzyDockOccupied,
  type MogzyDockSide,
} from "./MogzyDock";
import { MogzyExplainsPanel } from "@/components/ranked-rules/MogzyExplainsPanel";

afterEach(cleanup);

function Panel({
  testId, order, side = "right", initiallyOpen = false, onCollapse,
}: {
  testId: string;
  order: number;
  side?: MogzyDockSide;
  initiallyOpen?: boolean;
  onCollapse?: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <MogzyExplainsPanel
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onCollapse={onCollapse ? () => { onCollapse(); setOpen(false); } : undefined}
      dockOrder={order}
      side={side}
      title={testId}
      tabLabel={testId}
      openLabel={`open ${testId}`}
      testId={testId}
    >
      <p>body of {testId}</p>
    </MogzyExplainsPanel>
  );
}

const renderDocked = (children: ReactNode) =>
  render(<MogzyDockProvider>{children}</MogzyDockProvider>);

/** Report left, Rules right — the pair exactly as the shell mounts it. */
const Report = (props: { initiallyOpen?: boolean; onCollapse?: () => void }) => (
  <Panel
    testId="question-report"
    order={DOCK_ORDER.questionReport}
    side={DOCK_SIDE.questionReport}
    {...props}
  />
);
const Rules = (props: { initiallyOpen?: boolean; onCollapse?: () => void }) => (
  <Panel testId="ranked-rules" order={DOCK_ORDER.rules} side={DOCK_SIDE.rules} {...props} />
);

describe("the dock is a mirrored pair of anchors", () => {
  it("mounts exactly one anchor per side, however many panels occupy it", () => {
    renderDocked(<><Report /><Rules /></>);
    expect(screen.getAllByTestId("mogzy-dock-left")).toHaveLength(1);
    expect(screen.getAllByTestId("mogzy-dock-right")).toHaveLength(1);
    // Neither panel keeps a private fixed anchor once docked — that is the
    // collision this whole module exists to remove.
    expect(screen.queryByTestId("question-report-dock")).toBeNull();
    expect(screen.queryByTestId("ranked-rules-dock")).toBeNull();
  });

  it("puts Report in the LEFT corner and Rules in the RIGHT one", () => {
    // The headline of the whole change. If a future edit sends both controls
    // back to one corner, this is the assertion that says so.
    renderDocked(<><Report /><Rules /></>);
    expect(screen.getByTestId("mogzy-dock-tabs-left"))
      .toContainElement(screen.getByTestId("question-report-tab"));
    expect(screen.getByTestId("mogzy-dock-tabs-right"))
      .toContainElement(screen.getByTestId("ranked-rules-tab"));
    // And neither has leaked into the other's row.
    expect(screen.getByTestId("mogzy-dock-tabs-left"))
      .not.toContainElement(screen.getByTestId("ranked-rules-tab"));
  });

  it("pins each anchor to its own edge at the same distance from it", () => {
    // "Mirrored" means the same insets, not merely opposite ones: a left tab
    // 12px from its edge beside a right tab 24px from its own does not read as
    // a pair. Both carry bottom-4/sm:bottom-5 and a 3/sm:4 side inset.
    renderDocked(<><Report /><Rules /></>);
    const left = screen.getByTestId("mogzy-dock-left").className;
    const right = screen.getByTestId("mogzy-dock-right").className;

    expect(left).toContain("left-3");
    expect(left).toContain("sm:left-4");
    expect(right).toContain("right-3");
    expect(right).toContain("sm:right-4");
    for (const inset of ["bottom-4", "sm:bottom-5", "max-w-[calc(100vw-1.5rem)]"]) {
      expect(left).toContain(inset);
      expect(right).toContain(inset);
    }
    // Neither anchor may carry the OTHER edge, which would let a stale class
    // win the cascade and drag a corner across the viewport.
    expect(left).not.toContain("right-3");
    expect(right).not.toContain("left-3");
  });

  it("expands each side inward, away from the edge it is pinned to", () => {
    // A left stack that aligned `items-end` would grow leftward off the screen.
    renderDocked(<><Report /><Rules /></>);
    expect(screen.getByTestId("mogzy-dock-left").className).toContain("items-start");
    expect(screen.getByTestId("mogzy-dock-panels-left").className).toContain("items-start");
    expect(screen.getByTestId("mogzy-dock-tabs-left").className).toContain("justify-start");

    expect(screen.getByTestId("mogzy-dock-right").className).toContain("items-end");
    expect(screen.getByTestId("mogzy-dock-panels-right").className).toContain("items-end");
    expect(screen.getByTestId("mogzy-dock-tabs-right").className).toContain("justify-end");
  });

  it("slides each panel in from its own edge", () => {
    renderDocked(<><Report initiallyOpen /></>);
    expect(screen.getByTestId("question-report-panel").className)
      .toContain("motion-safe:slide-in-from-left-2");

    cleanup();
    renderDocked(<><Rules initiallyOpen /></>);
    expect(screen.getByTestId("ranked-rules-panel").className)
      .toContain("motion-safe:slide-in-from-right-2");
  });

  it("sorts tabs within a side deterministically rather than by mount order", () => {
    // Rules is declared FIRST here and must still sort after Report.
    renderDocked(<><Rules /><Report /></>);
    expect(screen.getByTestId("question-report-tab").style.order)
      .toBe(String(DOCK_ORDER.questionReport));
    expect(screen.getByTestId("ranked-rules-tab").style.order)
      .toBe(String(DOCK_ORDER.rules));
    expect(DOCK_ORDER.questionReport).toBeLessThan(DOCK_ORDER.rules);
  });

  it("opens a panel into its own side's panel slot, above that side's tabs", () => {
    renderDocked(<><Report /><Rules /></>);
    fireEvent.click(screen.getByTestId("ranked-rules-tab"));
    expect(screen.getByTestId("mogzy-dock-panels-right"))
      .toContainElement(screen.getByTestId("ranked-rules-panel"));

    fireEvent.click(screen.getByTestId("question-report-tab"));
    expect(screen.getByTestId("mogzy-dock-panels-left"))
      .toContainElement(screen.getByTestId("question-report-panel"));
  });
});

describe("the shell is told which corners are taken", () => {
  function Probe() {
    return (
      <span
        data-testid="probe"
        data-left={String(useMogzyDockOccupied("left"))}
        data-right={String(useMogzyDockOccupied("right"))}
      />
    );
  }

  it("reports a side occupied only while something is registered there", () => {
    // The Community trigger sits at bottom-6/left-6, under exactly where the
    // Report tab now lands. It steps aside on this signal, so the signal has
    // to be true only while the reporter is actually mounted — on every
    // non-quiz route the reporter renders nothing and the button must not move.
    const { rerender } = renderDocked(<><Probe /><Rules /></>);
    expect(screen.getByTestId("probe").dataset.left).toBe("false");
    expect(screen.getByTestId("probe").dataset.right).toBe("true");

    rerender(
      <MogzyDockProvider><Probe /><Rules /><Report /></MogzyDockProvider>,
    );
    expect(screen.getByTestId("probe").dataset.left).toBe("true");

    // And it drops back the moment the reporter unmounts.
    rerender(<MogzyDockProvider><Probe /><Rules /></MogzyDockProvider>);
    expect(screen.getByTestId("probe").dataset.left).toBe("false");
  });

  it("answers false with no dock mounted at all", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").dataset.left).toBe("false");
    expect(screen.getByTestId("probe").dataset.right).toBe("false");
  });
});

describe("only one panel is open at a time — across both sides", () => {
  it("collapses the panel in the OTHER corner when one opens", () => {
    // Two open parchments either side of a live question would physically fit
    // on a desktop. Exclusivity is a property of the dock, not of a side.
    renderDocked(<><Rules initiallyOpen /><Report /></>);
    expect(screen.getByTestId("ranked-rules-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("question-report-tab"));
    expect(screen.getByTestId("question-report-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("ranked-rules-panel")).toBeNull();

    // And back the other way.
    fireEvent.click(screen.getByTestId("ranked-rules-tab"));
    expect(screen.getByTestId("ranked-rules-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("question-report-panel")).toBeNull();
  });

  it("collapses through onCollapse, not onClose", () => {
    // Ranked's close IS its acknowledgement. Being shoved aside by a control
    // the player reached for instead must not spend it.
    const onCollapse = vi.fn();
    renderDocked(<><Rules initiallyOpen onCollapse={onCollapse} /><Report /></>);
    fireEvent.click(screen.getByTestId("question-report-tab"));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

describe("narrow layouts stay playable", () => {
  it("keeps each corner from spanning wider than a phone", () => {
    renderDocked(<><Report /><Rules /></>);
    for (const side of ["left", "right"]) {
      // The anchor is bounded by the viewport minus its own insets, and the
      // tab row wraps rather than overflowing — so a third control could never
      // push one off the edge of a 375px screen.
      expect(screen.getByTestId(`mogzy-dock-${side}`).className)
        .toContain("max-w-[calc(100vw-1.5rem)]");
      expect(screen.getByTestId(`mogzy-dock-tabs-${side}`).className).toContain("flex-wrap");
    }
  });

  it("never takes the pointer except on its live controls", () => {
    renderDocked(<><Report /><Rules /></>);
    // The empty middle of either corner must not eat a click meant for an
    // answer tablet underneath it.
    for (const side of ["left", "right"]) {
      expect(screen.getByTestId(`mogzy-dock-${side}`).className)
        .toContain("pointer-events-none");
      expect(screen.getByTestId(`mogzy-dock-panels-${side}`).className)
        .toContain("pointer-events-none");
    }
    expect(screen.getByTestId("question-report-tab").className).toContain("pointer-events-auto");
    expect(screen.getByTestId("ranked-rules-tab").className).toContain("pointer-events-auto");
  });

  it("budgets the panel against the viewport, not against a flat cap", () => {
    // The regression this replaces: `max-h-[min(72vh,34rem)]` clamped the
    // parchment to 544px on an 1800x800 desktop that had 688px to spare, so a
    // ~600px report form grew its own scrollbar with the page not scrolling.
    // The ceiling has to be a function of the viewport for the fallback to
    // engage only when the screen is genuinely short.
    //
    // Asserted as the declared budget rather than a measured height, because
    // jsdom computes no layout.
    renderDocked(<><Report initiallyOpen /></>);
    const panel = screen.getByTestId("question-report-panel");

    expect(panel.className).toContain("max-h-[min(calc(100dvh-7rem),44rem)]");
    expect(panel.className).not.toContain("34rem");
    // `dvh`, not `vh`: on mobile `vh` measures the chrome-expanded state, which
    // is the one where the panel does not fit.
    expect(panel.className).not.toContain("72vh");
    expect(panel.className).toContain("overscroll-contain");
    expect(panel.className).toContain("w-[calc(100vw-1.5rem)]");
  });

  it("reserves room for the tab row it sits above", () => {
    // 7rem = the dock's bottom inset (1.25rem) + a 44px tab + the gap between
    // them, plus a margin so the parchment's top edge is never flush against
    // the HUD. If the panel ever claimed the full viewport height it would
    // cover its own tab.
    renderDocked(<><Report initiallyOpen /></>);
    expect(screen.getByTestId("question-report-panel").className).toContain("100dvh-7rem");
  });
});

describe("undocked fallback", () => {
  it("keeps its own fixed anchor when no dock is mounted", () => {
    // Every existing test renders a panel with no provider. That path must
    // stay exactly as it was.
    render(<Panel testId="ranked-rules" order={DOCK_ORDER.rules} />);
    const anchor = screen.getByTestId("ranked-rules-dock");
    expect(anchor.className).toContain("fixed");
    expect(anchor.className).toContain("right-3");
    expect(anchor).toContainElement(screen.getByTestId("ranked-rules-tab"));
  });

  it("mirrors the fallback anchor too, so an undocked panel lands in its own corner", () => {
    render(<Panel testId="question-report" order={DOCK_ORDER.questionReport} side="left" />);
    const anchor = screen.getByTestId("question-report-dock");
    expect(anchor.className).toContain("left-3");
    expect(anchor.className).toContain("items-start");
    expect(anchor.className).not.toContain("right-3");
  });
});
