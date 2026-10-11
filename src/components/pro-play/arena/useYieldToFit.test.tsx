/**
 * PPQ2-E — `useYieldToFit`: optional rows are dropped in their order, only
 * while the column overflows, and restored when room returns.
 *
 * jsdom has no layout, so the column's overflow is modelled: each visible
 * row costs 20px of content in a column whose height the test sets.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useYieldToFit } from "./useYieldToFit";

let height = 100;
let observer: (() => void) | null = null;

class FakeResizeObserver {
  constructor(cb: () => void) { observer = cb; }
  observe() {}
  disconnect() { observer = null; }
}

function Box() {
  const ref = useYieldToFit<HTMLDivElement>("k");
  return (
    <div ref={ref} data-testid="box">
      <p>name</p>
      <p data-pp-yield={2} data-row="b">b</p>
      <p data-pp-yield={1} data-row="a">a</p>
      <p data-pp-yield={3} data-row="c">c</p>
      <p>metric</p>
    </div>
  );
}

const visible = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-row]"))
    .filter((e) => e.style.display !== "none").map((e) => e.dataset.row).sort();

function install() {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === "box" ? height : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid !== "box") return 0;
    return Array.from(this.children).filter((c) => (c as HTMLElement).style.display !== "none").length * 20;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observer = null;
});

describe("useYieldToFit", () => {
  it("drops nothing when the content fits", () => {
    install();
    height = 100;
    render(<Box />);
    expect(visible()).toEqual(["a", "b", "c"]);
  });

  it("drops rows in their yield order, and only as many as needed", () => {
    install();
    height = 60; // 5 rows of 20 → two must go: order 1 (a), then 2 (b)
    render(<Box />);
    expect(visible()).toEqual(["c"]);
    expect(document.querySelector('[data-row="a"]')!.getAttribute("data-pp-yielded")).toBe("true");
  });

  it("never drops a row without a yield order, even when it still overflows", () => {
    install();
    height = 10;
    render(<Box />);
    expect(visible()).toEqual([]);
    expect(document.querySelectorAll("p:not([data-row])")).toHaveLength(2);
    for (const p of document.querySelectorAll<HTMLElement>("p:not([data-row])")) expect(p.style.display).toBe("");
  });

  it("restores rows when the box grows again", () => {
    install();
    height = 60;
    render(<Box />);
    expect(visible()).toEqual(["c"]);
    height = 100;
    act(() => observer?.());
    expect(visible()).toEqual(["a", "b", "c"]);
  });
});
