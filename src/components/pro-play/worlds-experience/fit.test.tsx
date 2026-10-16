/**
 * UX4 — the fixed-viewport toolkit: compositions that step down until they
 * fit, lists paged to the rows their box really holds, and nested boxes that
 * tell their parent when even their tightest form does not fit.
 *
 * jsdom has no layout, so these tests give elements the sizes a browser would
 * measure (`sizes`), the same way the real layout feeds the components.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FitCascade, FitPages, Pager, rowsThatFit } from "./fit";

type Box = Partial<Record<"clientHeight" | "clientWidth" | "scrollHeight" | "scrollWidth" | "offsetHeight" | "offsetTop", number>>;

/** Gives elements browser-like sizes, chosen per element. */
function sizes(of: (el: HTMLElement) => Box) {
  const keys = ["clientHeight", "clientWidth", "scrollHeight", "scrollWidth", "offsetHeight", "offsetTop"] as const;
  const saved = keys.map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)] as const);
  for (const k of keys) {
    Object.defineProperty(HTMLElement.prototype, k, {
      configurable: true,
      get(this: HTMLElement) {
        return of(this)[k] ?? 0;
      },
    });
  }
  return () => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(HTMLElement.prototype, k, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
    }
  };
}

const ITEMS = Array.from({ length: 8 }, (_, i) => `m${i + 1}`);
const ROW = 60;

/** A list region `h` px tall, rows of 60 px in one column. */
function listBoxes(h: number) {
  return (el: HTMLElement): Box => {
    if (el.hasAttribute("data-fit-region")) return { clientHeight: h, clientWidth: 300, scrollHeight: h, scrollWidth: 300 };
    if (el.parentElement?.hasAttribute("data-fit-list")) {
      const i = [...el.parentElement.children].indexOf(el);
      return { offsetHeight: ROW, offsetTop: i * ROW };
    }
    return {};
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe("rowsThatFit", () => {
  it("counts whole rows with their gaps, and reports an unmeasured box as such", () => {
    expect(rowsThatFit(200, 60, 0)).toBe(3);
    expect(rowsThatFit(192, 60, 6)).toBe(3);
    expect(rowsThatFit(191, 60, 6)).toBe(2);
    expect(rowsThatFit(40, 60, 6)).toBe(0);
    expect(rowsThatFit(200, 0, 0)).toBeNull();
  });
});

describe("FitPages", () => {
  const renderList = (props: Partial<Parameters<typeof FitPages<string>>[0]> = {}) =>
    render(<FitPages items={ITEMS} keyOf={(s) => s} noun="Matches" render={(s) => <span data-testid="row">{s}</span>} {...props} />);
  const rows = () => screen.getAllByTestId("row").map((r) => r.textContent);

  it("without a layout (no measurement) draws every item and no pager", () => {
    renderList();
    expect(rows()).toEqual(ITEMS);
    expect(screen.queryByTestId("pager")).toBeNull();
  });

  it("shows as many rows as the measured box holds, and pages the rest with visible controls", () => {
    restore = sizes(listBoxes(200));
    const onPage = vi.fn();
    renderList({ onPage });
    expect(rows()).toEqual(["m1", "m2", "m3"]);
    expect(screen.getByTestId("pager-range")).toHaveTextContent("Matches 1–3 of 8");
    expect(screen.getByTestId("pager-prev")).toBeDisabled();
    fireEvent.click(screen.getByTestId("pager-next"));
    expect(rows()).toEqual(["m4", "m5", "m6"]);
    expect(onPage).toHaveBeenLastCalledWith(["m4", "m5", "m6"]);
    fireEvent.click(screen.getByTestId("pager-next"));
    expect(rows()).toEqual(["m7", "m8"]);
    expect(screen.getByTestId("pager-range")).toHaveTextContent("Matches 7–8 of 8");
    expect(screen.getByTestId("pager-next")).toBeDisabled();
  });

  it("opens on the selected item's page", () => {
    restore = sizes(listBoxes(200));
    renderList({ focusKey: "m7" });
    expect(rows()).toEqual(["m7", "m8"]);
  });

  it("starts again on the first page when its subject changes", () => {
    restore = sizes(listBoxes(200));
    const { rerender } = renderList({ resetKey: "a" });
    fireEvent.click(screen.getByTestId("pager-next"));
    expect(rows()[0]).toBe("m4");
    rerender(<FitPages items={ITEMS} keyOf={(s) => s} noun="Matches" render={(s) => <span data-testid="row">{s}</span>} resetKey="b" />);
    expect(rows()[0]).toBe("m1");
  });

  it("rows of different heights settle on one page size (no oscillation)", () => {
    // m3 is taller (a wrapped line). Sizing by the rows on screen alone would
    // flip forever: 2 rows (m1, m2 short) → 3 fit → m3 back → 2 fit → …
    restore = sizes((el) => {
      if (el.hasAttribute("data-fit-region")) return { clientHeight: 200, clientWidth: 300, scrollHeight: 200, scrollWidth: 300 };
      if (el.parentElement?.hasAttribute("data-fit-list")) {
        const kids = [...el.parentElement.children];
        const i = kids.indexOf(el);
        const h = (k: Element) => (k.textContent === "m3" ? 80 : ROW);
        return { offsetHeight: h(el), offsetTop: kids.slice(0, i).reduce((t, k) => t + h(k), 0) };
      }
      return {};
    });
    renderList();
    expect(rows()).toEqual(["m1", "m2"]);
    fireEvent.click(screen.getByTestId("pager-next"));
    expect(rows()).toEqual(["m3", "m4"]);
  });

  it("a pinned page size is honoured (and every item stays reachable)", () => {
    renderList({ pageSize: 5 });
    expect(rows()).toHaveLength(5);
    fireEvent.click(screen.getByTestId("pager-next"));
    expect(rows()).toEqual(["m6", "m7", "m8"]);
  });

  it("the pager names its range for one item and many", () => {
    render(<Pager noun="Teams" from={19} to={19} total={19} />);
    expect(screen.getByTestId("pager-range")).toHaveTextContent("Teams 19 of 19");
  });
});

describe("FitCascade", () => {
  it("draws the first composition whose content fits its box", () => {
    restore = sizes((el) => {
      if (el.hasAttribute("data-fit-level")) {
        const level = Number(el.querySelector("[data-level]")?.getAttribute("data-level"));
        return { clientHeight: 200, clientWidth: 300, scrollHeight: level === 0 ? 400 : level === 1 ? 260 : 180, scrollWidth: 300 };
      }
      return {};
    });
    render(<FitCascade levels={4} testId="fit">{(l) => <div data-level={l} />}</FitCascade>);
    expect(screen.getByTestId("fit")).toHaveAttribute("data-fit-level", "2");
    expect(screen.getByTestId("fit")).toHaveAttribute("data-fit-exhausted", "false");
  });

  it("stops at its last composition and says it is exhausted", () => {
    restore = sizes((el) => (el.hasAttribute("data-fit-level") ? { clientHeight: 100, clientWidth: 300, scrollHeight: 400, scrollWidth: 300 } : {}));
    render(<FitCascade levels={2} testId="fit">{(l) => <div data-level={l} />}</FitCascade>);
    expect(screen.getByTestId("fit")).toHaveAttribute("data-fit-level", "1");
    expect(screen.getByTestId("fit")).toHaveAttribute("data-fit-exhausted", "true");
  });

  it("a nested list that cannot hold its minimum rows moves the enclosing composition on", () => {
    // Outer level 0 gives the list 40 px (not even one row); level 1 gives it 200 px.
    restore = sizes((el) => {
      if (el.hasAttribute("data-fit-region")) {
        const outer = el.closest("[data-testid='outer']")!;
        const h = outer.getAttribute("data-fit-level") === "0" ? 40 : 200;
        return { clientHeight: h, clientWidth: 300, scrollHeight: h, scrollWidth: 300 };
      }
      if (el.parentElement?.hasAttribute("data-fit-list")) return { offsetHeight: ROW, offsetTop: [...el.parentElement.children].indexOf(el) * ROW };
      return {};
    });
    render(
      <FitCascade levels={2} testId="outer">
        {(l) => <FitPages key={l} items={ITEMS} keyOf={(s) => s} noun="Matches" minRows={2} render={(s) => <span data-testid="row">{s}</span>} />}
      </FitCascade>,
    );
    expect(screen.getByTestId("outer")).toHaveAttribute("data-fit-level", "1");
    expect(screen.getAllByTestId("row")).toHaveLength(3);
  });
});
