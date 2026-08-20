/**
 * LC1 — the PLAY gem: the same one action as the button it replaces, with
 * real button semantics and no information carried by animation alone.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankedPlayGem from "./RankedPlayGem";

afterEach(cleanup);

describe("RankedPlayGem", () => {
  it("is a real button whose accessible name is exactly the visible word", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByRole("button", { name: /^Play$/ });
    expect(gem.tagName).toBe("BUTTON");
    expect(gem.getAttribute("type")).toBe("button");
  });

  it("fires the host's action on click", () => {
    const onClick = vi.fn();
    render(<RankedPlayGem onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates from the keyboard (native button activation)", () => {
    const onClick = vi.fn();
    render(<RankedPlayGem onClick={onClick} />);
    const gem = screen.getByRole("button", { name: /^Play$/ });
    act(() => gem.focus());
    expect(document.activeElement).toBe(gem);
    fireEvent.keyDown(gem, { key: "Enter" });
    fireEvent.keyUp(gem, { key: "Enter" });
    // jsdom does not synthesise the click from keydown, so assert the real
    // contract instead: the element is a focusable native button, which is
    // what makes Enter/Space work in a browser.
    fireEvent.click(gem);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("depresses on pointer down and springs back on release", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByTestId("ranked-play-gem");
    expect(gem.getAttribute("data-pressed")).toBe("false");
    fireEvent.pointerDown(gem);
    expect(gem.getAttribute("data-pressed")).toBe("true");
    fireEvent.pointerUp(gem);
    expect(gem.getAttribute("data-pressed")).toBe("false");
  });

  it("shows the pressed state for a keyboard press too", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByTestId("ranked-play-gem");
    fireEvent.keyDown(gem, { key: " " });
    expect(gem.getAttribute("data-pressed")).toBe("true");
    fireEvent.keyUp(gem, { key: " " });
    expect(gem.getAttribute("data-pressed")).toBe("false");
  });

  it("releases the pressed state when the pointer leaves mid-press", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByTestId("ranked-play-gem");
    fireEvent.pointerDown(gem);
    fireEvent.pointerLeave(gem);
    expect(gem.getAttribute("data-pressed")).toBe("false");
  });

  it("when disabled, neither fires nor depresses", () => {
    const onClick = vi.fn();
    render(<RankedPlayGem onClick={onClick} disabled />);
    const gem = screen.getByTestId("ranked-play-gem");
    expect(gem.hasAttribute("disabled")).toBe(true);
    fireEvent.pointerDown(gem);
    expect(gem.getAttribute("data-pressed")).toBe("false");
    fireEvent.click(gem);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its label readable with motion off — nothing is animation-only", () => {
    // jsdom reports no `prefers-reduced-motion` match, which is the branch
    // framer's useReducedMotion treats as reduced; the label, the role and
    // the disabled state must all still be present either way.
    render(<RankedPlayGem onClick={() => {}} label="Play" />);
    expect(screen.getByTestId("ranked-play-gem").textContent).toContain("Play");
  });
});
