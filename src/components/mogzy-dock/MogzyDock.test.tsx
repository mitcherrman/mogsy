/**
 * FB1-4 — Ranked Rules and the question reporter share one corner.
 *
 * This is the structural half of the "must not obscure the question" rule.
 * The behavioural half (the panel is `fixed`, outside the arena, and pauses
 * nothing) is already asserted by RankedRulesScroll.test.tsx; what is new is
 * that there are now TWO controls wanting the same coordinates, and nothing
 * about the CSS would fail loudly if one covered the other.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/mascot/MogzyMascot", () => ({
  MogzyMascot: () => <span data-testid="mascot" />,
}));

import { useState, type ReactNode } from "react";

import { DOCK_ORDER, MogzyDockProvider } from "./MogzyDock";
import { MogzyExplainsPanel } from "@/components/ranked-rules/MogzyExplainsPanel";

afterEach(cleanup);

function Panel({
  testId, order, initiallyOpen = false, onCollapse,
}: {
  testId: string;
  order: number;
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

describe("the dock is a single shared anchor", () => {
  it("mounts exactly one fixed corner, however many panels occupy it", () => {
    renderDocked(
      <>
        <Panel testId="question-report" order={DOCK_ORDER.questionReport} />
        <Panel testId="ranked-rules" order={DOCK_ORDER.rules} />
      </>,
    );
    expect(screen.getAllByTestId("mogzy-dock")).toHaveLength(1);
    // Neither panel keeps a private fixed anchor once docked — that is the
    // collision this whole module exists to remove.
    expect(screen.queryByTestId("question-report-dock")).toBeNull();
    expect(screen.queryByTestId("ranked-rules-dock")).toBeNull();
  });

  it("puts both tabs in the tab row, not on top of each other", () => {
    renderDocked(
      <>
        <Panel testId="question-report" order={DOCK_ORDER.questionReport} />
        <Panel testId="ranked-rules" order={DOCK_ORDER.rules} />
      </>,
    );
    const tabs = screen.getByTestId("mogzy-dock-tabs");
    expect(tabs).toContainElement(screen.getByTestId("question-report-tab"));
    expect(tabs).toContainElement(screen.getByTestId("ranked-rules-tab"));
  });

  it("sorts the tabs deterministically rather than by mount order", () => {
    // Rules is declared FIRST here and must still sort after Report.
    renderDocked(
      <>
        <Panel testId="ranked-rules" order={DOCK_ORDER.rules} />
        <Panel testId="question-report" order={DOCK_ORDER.questionReport} />
      </>,
    );
    expect(screen.getByTestId("question-report-tab").style.order)
      .toBe(String(DOCK_ORDER.questionReport));
    expect(screen.getByTestId("ranked-rules-tab").style.order)
      .toBe(String(DOCK_ORDER.rules));
    expect(DOCK_ORDER.questionReport).toBeLessThan(DOCK_ORDER.rules);
  });

  it("opens a panel into the panel slot, above the tabs", () => {
    renderDocked(<Panel testId="ranked-rules" order={DOCK_ORDER.rules} />);
    fireEvent.click(screen.getByTestId("ranked-rules-tab"));
    expect(screen.getByTestId("mogzy-dock-panels"))
      .toContainElement(screen.getByTestId("ranked-rules-panel"));
  });
});

describe("only one panel is open at a time", () => {
  it("collapses the other panel when one opens", () => {
    renderDocked(
      <>
        <Panel testId="ranked-rules" order={DOCK_ORDER.rules} initiallyOpen />
        <Panel testId="question-report" order={DOCK_ORDER.questionReport} />
      </>,
    );
    expect(screen.getByTestId("ranked-rules-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("question-report-tab"));

    // Two open panels stack past the height of a phone. Exactly one survives.
    expect(screen.getByTestId("question-report-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("ranked-rules-panel")).toBeNull();
  });

  it("collapses through onCollapse, not onClose", () => {
    // Ranked's close IS its acknowledgement. Being shoved aside by a control
    // the player reached for instead must not spend it.
    const onCollapse = vi.fn();
    renderDocked(
      <>
        <Panel testId="ranked-rules" order={DOCK_ORDER.rules} initiallyOpen
          onCollapse={onCollapse} />
        <Panel testId="question-report" order={DOCK_ORDER.questionReport} />
      </>,
    );
    fireEvent.click(screen.getByTestId("question-report-tab"));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

describe("narrow layouts stay playable", () => {
  it("keeps the corner from spanning wider than a phone", () => {
    renderDocked(<Panel testId="question-report" order={DOCK_ORDER.questionReport} />);
    const dock = screen.getByTestId("mogzy-dock");
    // The anchor is bounded by the viewport minus its own insets, and the tab
    // row wraps rather than overflowing — so a third control could never push
    // one off the right edge of a 375px screen.
    expect(dock.className).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(screen.getByTestId("mogzy-dock-tabs").className).toContain("flex-wrap");
  });

  it("never takes the pointer except on its live controls", () => {
    renderDocked(<Panel testId="question-report" order={DOCK_ORDER.questionReport} />);
    // The empty middle of the corner must not eat a click meant for an answer
    // tablet underneath it.
    expect(screen.getByTestId("mogzy-dock").className).toContain("pointer-events-none");
    expect(screen.getByTestId("mogzy-dock-panels").className).toContain("pointer-events-none");
    expect(screen.getByTestId("question-report-tab").className).toContain("pointer-events-auto");
  });

  it("an open sheet still fits above the tab row on a 375x667 phone", () => {
    // 72vh panel + a 44px tab row + gaps + the dock's bottom inset. Asserted
    // as the declared budget rather than a measured height, because jsdom
    // computes no layout — the point is that the budget is stated and small
    // enough, not that this environment can render it.
    renderDocked(<Panel testId="question-report" order={DOCK_ORDER.questionReport} initiallyOpen />);
    const panel = screen.getByTestId("question-report-panel");
    expect(panel.className).toContain("max-h-[min(72vh,34rem)]");
    expect(panel.className).toContain("overscroll-contain");
    expect(panel.className).toContain("w-[calc(100vw-1.5rem)]");
  });
});

describe("undocked fallback", () => {
  it("keeps its own fixed anchor when no dock is mounted", () => {
    // Every existing test renders a panel with no provider. That path must
    // stay exactly as it was.
    render(<Panel testId="ranked-rules" order={DOCK_ORDER.rules} />);
    const anchor = screen.getByTestId("ranked-rules-dock");
    expect(anchor.className).toContain("fixed");
    expect(anchor).toContainElement(screen.getByTestId("ranked-rules-tab"));
  });
});
