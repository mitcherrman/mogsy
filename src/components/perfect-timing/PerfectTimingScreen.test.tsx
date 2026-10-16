import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PerfectTimingBar, PerfectTimingScreen } from "./PerfectTimingScreen";
import { scrollKeyIsSwallowed } from "@/lib/perfect-timing/useFixedViewport";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
});

const bar = <PerfectTimingBar lead={<a href="/back" data-testid="lead">Back</a>} index={2} total={5}
  outcomes={["perfect", null, null, null, null]} points={90} />;

describe("PerfectTimingScreen — the fixed frame", () => {
  it("owns the viewport while mounted and gives it back exactly as found", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<PerfectTimingScreen bar={bar}><p>stage</p></PerfectTimingScreen>);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement).toHaveAttribute("data-pt-fixed-viewport", "true");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("auto");
    expect(document.documentElement).not.toHaveAttribute("data-pt-fixed-viewport");
  });

  it("renders into <body>, outside the app layout, and hides the app root while mounted", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    const { unmount } = render(<PerfectTimingScreen bar={bar}><p>stage</p></PerfectTimingScreen>, { container: root });
    const page = screen.getByTestId("perfect-timing-page");
    expect(page.parentElement).toBe(document.body);
    expect(root).toHaveAttribute("inert");
    expect(root.style.display).toBe("none");
    unmount();
    expect(root).not.toHaveAttribute("inert");
    expect(root.style.display).toBe("");
    root.remove();
  });

  it("draws the bar, the stage and nothing else: no banner, no badge, no note", () => {
    render(<PerfectTimingScreen bar={bar} stage="play"><p>stage</p></PerfectTimingScreen>);
    const page = screen.getByTestId("perfect-timing-page");
    expect(page).toHaveClass("pt-screen");
    expect(page).toHaveAttribute("data-stage", "play");
    expect(screen.getByTestId("pt-chrome").firstElementChild).toBe(screen.getByTestId("lead"));
    expect(screen.getByTestId("pt-score")).toHaveTextContent("90");
    expect(screen.queryByRole("note")).toBeNull();
    expect(page.textContent).not.toMatch(/prototype|owner lab|playtest/i);
  });

  it("swallows Space, Page and arrow keys aimed at the page, and only those", () => {
    render(<PerfectTimingScreen bar={bar}><p>stage</p></PerfectTimingScreen>);
    for (const key of [" ", "PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp"]) {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(true);
    }
    const letter = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    document.body.dispatchEvent(letter);
    expect(letter.defaultPrevented).toBe(false);
    const chord = new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(chord);
    expect(chord.defaultPrevented).toBe(false);
  });

  it("leaves Space to a button, a link and a text field that own it", () => {
    render(<PerfectTimingScreen bar={bar}><button type="button">go</button><input aria-label="t" /></PerfectTimingScreen>);
    for (const el of [screen.getByRole("button", { name: "go" }), screen.getByLabelText("t"), screen.getByTestId("lead")]) {
      const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
      expect(scrollKeyIsSwallowed(e)).toBe(false);
    }
  });

  it("cancels a one-finger drag on the screen, and leaves a pinch and the rest of the page alone", () => {
    render(<PerfectTimingScreen bar={bar}><p data-testid="inside">stage</p></PerfectTimingScreen>);
    const touchMove = (target: Element, touches: number) => {
      const e = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.defineProperty(e, "touches", { value: Array.from({ length: touches }, () => ({})) });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(touchMove(screen.getByTestId("inside"), 1)).toBe(true);
    expect(touchMove(screen.getByTestId("inside"), 2)).toBe(false);
    expect(touchMove(document.body, 1)).toBe(false);
  });

  it("stops swallowing keys once it unmounts", () => {
    const { unmount } = render(<PerfectTimingScreen bar={bar}><p>stage</p></PerfectTimingScreen>);
    unmount();
    const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it("fades the champion backdrop in on load and leaves the frame bare when the image fails", () => {
    render(<PerfectTimingScreen bar={bar} art="https://assets.test/ahri.jpg"><p>stage</p></PerfectTimingScreen>);
    const backdrop = screen.getByTestId("pt-backdrop");
    expect(backdrop).toHaveAttribute("data-art", "none");
    const img = backdrop.querySelector("img") as HTMLImageElement;
    fireEvent.load(img);
    expect(backdrop).toHaveAttribute("data-art", "loaded");
    fireEvent.error(img);
    expect(backdrop.querySelector("img")).toBeNull();
    expect(backdrop).toHaveAttribute("data-art", "none");
  });

  it("lights each pip by the tier the round settled at", () => {
    render(<PerfectTimingScreen bar={bar}><p>stage</p></PerfectTimingScreen>);
    const pips = screen.getByTestId("pt-pips");
    expect(pips).toHaveAttribute("aria-label", "Round 2 of 5");
    expect(pips.querySelectorAll(".pt-pip")).toHaveLength(5);
    expect(pips.querySelectorAll('[data-state="current"]')).toHaveLength(1);
    expect(pips.querySelector('[data-tier="perfect"]')).not.toBeNull();
    expect(pips.textContent).toBe("");
  });
});
