/**
 * PT5.1 — the between-stage transition on its own: what it says for each
 * change, that it never shows a duration, how it hands over, reduced motion.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { PtRoundView, PtSliceItemView } from "@/lib/perfect-timing/viewModel";
import { TRANSITION_READY_MS, hasTransition } from "./presentation";
import { SliceTransition } from "./SliceTransition";

const SHEEN: PtSliceItemView = { itemId: 3057, name: "Sheen", abilityHaste: 10, iconUrl: "http://assets.test/assets/items/3057.png" };

function round(kind: "foundation" | "rank_up" | "equipped", over: Partial<PtRoundView> = {}): PtRoundView {
  const equipped = kind === "equipped";
  return {
    roundId: `pt_${kind}`,
    championName: "Ezreal",
    abilityName: "Mystic Shot",
    slot: "Q",
    rank: kind === "foundation" ? 1 : 3,
    rankCount: 5,
    iconUrl: "http://assets.test/assets/champions/Ezreal/Q_EzrealQ.png",
    splashUrl: null,
    index: kind === "foundation" ? 1 : kind === "rank_up" ? 2 : 3,
    total: 3,
    slice: {
      kind,
      stage: kind === "foundation" ? 1 : kind === "rank_up" ? 2 : 3,
      total: 3,
      abilityHaste: equipped ? SHEEN.abilityHaste : 0,
      item: equipped ? SHEEN : null,
      previous: kind === "foundation" ? null : { kind: kind === "rank_up" ? "foundation" : "rank_up", rank: kind === "rank_up" ? 1 : 3, item: null },
    },
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
});

describe("SliceTransition — what it says", () => {
  it("Rank up: the headline, Rank 1 → Rank 3, the pips, and a neutral cooldown line", () => {
    render(<SliceTransition round={round("rank_up")} onContinue={() => {}} />);
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-kind", "rank_up");
    expect(screen.getByTestId("pt-tr-title")).toHaveTextContent("Rank up");
    expect(screen.getByTestId("pt-tr-from")).toHaveTextContent("Rank 1");
    expect(screen.getByTestId("pt-tr-to")).toHaveTextContent("Rank 3");
    expect(screen.getByTestId("pt-tr-effect")).toHaveTextContent("Cooldown changed");
    expect(screen.getByTestId("pt-tr-adjust")).toHaveTextContent("Adjust your timing");
    // The supporting message is ONE line holding both phrases.
    expect(screen.getByTestId("pt-tr-support")).toHaveTextContent("Cooldown changed—Adjust your timing");
    const pips = screen.getByTestId("pt-tr-pips").querySelectorAll("i");
    expect([...pips].map((p) => p.dataset.state)).toEqual(["kept", "gained", "gained", "empty", "empty"]);
    // The rank is said by the change itself: no separate medal, no second "Rank 3 / 5" line.
    expect(screen.queryByTestId("pt-tr-rankmark")).toBeNull();
    expect(screen.getByTestId("pt-tr-rank")).not.toHaveTextContent(/rank/i);
    expect(screen.getByTestId("pt-tr-subject")).toHaveTextContent("EzrealQMystic Shot");
  });

  it("Item equipped: the item, its ability haste and icon, 'reduced', and rank unchanged", () => {
    render(<SliceTransition round={round("equipped")} onContinue={() => {}} />);
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-kind", "equipped");
    expect(screen.getByTestId("pt-tr-title")).toHaveTextContent("Item equipped");
    expect(screen.getByTestId("pt-tr-item-name")).toHaveTextContent("Sheen");
    expect(screen.getByTestId("pt-tr-haste")).toHaveTextContent("+10 Ability Haste");
    expect(screen.getByTestId("pt-tr-item-icon")).toHaveAttribute("src", SHEEN.iconUrl);
    expect(screen.getByTestId("pt-tr-effect")).toHaveTextContent("Cooldown reduced");
    // The rank stays as one quiet line; the pips are only for the rank-up change.
    expect(screen.getByTestId("pt-tr-rank")).toHaveTextContent("Rank 3 / 5");
    expect(screen.queryByTestId("pt-tr-pips")).toBeNull();
    expect(screen.queryByTestId("pt-tr-rankmark")).toBeNull();
  });

  it("draws the item's initial when its art fails, never an empty slot", () => {
    render(<SliceTransition round={round("equipped")} onContinue={() => {}} />);
    fireEvent.error(screen.getByTestId("pt-tr-item-icon"));
    expect(screen.queryByTestId("pt-tr-item-icon")).toBeNull();
    expect(screen.getByTestId("pt-tr-slot")).toHaveTextContent("S");
  });

  it("never prints a duration, a progression or a target", () => {
    for (const kind of ["rank_up", "equipped"] as const) {
      const { unmount } = render(<SliceTransition round={round(kind)} onContinue={() => {}} />);
      const text = screen.getByTestId("pt-transition").textContent ?? "";
      expect(text).not.toMatch(/\d+(\.\d+)?\s?(ms|s)\b/i);
      expect(text).not.toMatch(/target|base cooldown|5\.5|4\.545/i);
      unmount();
    }
  });

  it("renders nothing for a stage that changes no input (the foundation)", () => {
    const { container } = render(<SliceTransition round={round("foundation")} onContinue={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(hasTransition("foundation")).toBe(false);
    expect(hasTransition("rank_up")).toBe(true);
    expect(hasTransition("equipped")).toBe(true);
    expect(hasTransition(undefined)).toBe(false);
  });

  it("announces the change as one status message", () => {
    render(<SliceTransition round={round("equipped")} onContinue={() => {}} />);
    expect(screen.getByTestId("pt-tr-announce")).toHaveTextContent(
      "Item equipped. Ezreal Q, Mystic Shot. Sheen +10 Ability Haste. Cooldown reduced. Adjust your timing.",
    );
  });
});

describe("SliceTransition — the way on", () => {
  it("is inert until it is readable, then Continue works once", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    render(<SliceTransition round={round("rank_up")} onContinue={onContinue} />);
    const go = screen.getByTestId("pt-tr-continue");
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-ready", "false");
    expect(go).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(go, { detail: 1 });
    fireEvent.keyDown(document, { key: " " });
    expect(onContinue).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(TRANSITION_READY_MS + 5); });
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-ready", "true");
    expect(go).toHaveAttribute("aria-disabled", "false");
    expect(go).toHaveFocus();
    fireEvent.click(go, { detail: 1 });
    fireEvent.click(go, { detail: 2 });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith(undefined);
  });

  it("Space or Enter anywhere continues once, as a key; a held key and a field's own key do not", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    render(<div><input data-testid="field" /><SliceTransition round={round("equipped")} onContinue={onContinue} /></div>);
    act(() => { vi.advanceTimersByTime(TRANSITION_READY_MS + 5); });
    fireEvent.keyDown(document.body, { key: " ", repeat: true });
    fireEvent.keyDown(screen.getByTestId("field"), { key: "Enter" });
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.keyDown(document.body, { key: " " });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith("key");
  });

  it("a keyboard-generated click on the focused button counts as a key", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    render(<SliceTransition round={round("rank_up")} onContinue={onContinue} />);
    act(() => { vi.advanceTimersByTime(TRANSITION_READY_MS + 5); });
    fireEvent.click(screen.getByTestId("pt-tr-continue"), { detail: 0 });
    expect(onContinue).toHaveBeenCalledWith("key");
  });

  it("stops listening when it goes away", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    const { unmount } = render(<SliceTransition round={round("rank_up")} onContinue={onContinue} />);
    act(() => { vi.advanceTimersByTime(TRANSITION_READY_MS + 5); });
    unmount();
    fireEvent.keyDown(document.body, { key: " " });
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe("SliceTransition — motion", () => {
  it("animates by default and says so on the root", () => {
    render(<SliceTransition round={round("rank_up")} onContinue={() => {}} />);
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-animate", "true");
  });

  it("reduced motion (the app switch): no animation and readable almost at once", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    vi.useFakeTimers();
    render(<SliceTransition round={round("rank_up")} onContinue={() => {}} />);
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-animate", "false");
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-ready", "true");
  });
});
