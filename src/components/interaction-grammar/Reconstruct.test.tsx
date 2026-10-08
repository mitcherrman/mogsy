import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reconstruct } from "./Reconstruct";
import type {
  InteractionPhase, ReconstructPublic, ReconstructResponse, ReconstructReveal,
} from "@/lib/interaction-grammar/types";

// Neutral, fixture-owned labels. Nothing here is item data.
const B: ReconstructPublic = {
  prompt: "Fill the three parts",
  target: { label: "Test Assembly" },
  slotCount: 3,
  options: [
    { token: "a", label: "Alpha" },
    { token: "b", label: "Beta", maxUses: 2 },
    { token: "d", label: "Delta" },
    { token: "e", label: "Epsilon" },
  ],
};
const CANON_B = [{ token: "a", quantity: 1 }, { token: "b", quantity: 2 }];

/**
 * The HOST's verdict for CANON_B, as a fixture. In Ranked the server states it;
 * the client library deliberately has no grader. First min(placed, needed)
 * copies are right; wrong sockets take the missing parts in canonical order.
 */
function hostGrade(placement: string[]) {
  const need = new Map(CANON_B.map((c) => [c.token, c.quantity]));
  const seen = new Map<string, number>();
  const slotCorrect = placement.map((t) => {
    seen.set(t, (seen.get(t) ?? 0) + 1);
    return (seen.get(t) ?? 0) <= (need.get(t) ?? 0);
  });
  const missing = CANON_B.flatMap((c) =>
    Array<string>(Math.max(0, c.quantity - Math.min(seen.get(c.token) ?? 0, c.quantity))).fill(c.token));
  const settled = [...placement];
  slotCorrect.forEach((ok, i) => { if (!ok) settled[i] = missing.shift() as string; });
  return { slotCorrect, settled, isCorrect: slotCorrect.every(Boolean) };
}

function revealFor(placement: string[], extra: Partial<ReconstructReveal> = {}): ReconstructReveal {
  const g = hostGrade(placement);
  return {
    placement, slotCorrect: g.slotCorrect, settled: g.settled, isCorrect: g.isCorrect,
    evidence: {
      values: { a: "100", b: "50" },
      annotations: { b: "×2" },
      extras: [{ label: "Fee", valueDisplay: "30" }],
      total: { label: "Total", valueDisplay: "230" },
    },
    ...extra,
  };
}

function Host({
  content = B, phase = "open", reveal = null, initial = [], onLock = () => {}, onChange, onRevealComplete,
}: {
  content?: ReconstructPublic; phase?: InteractionPhase; reveal?: ReconstructReveal | null;
  initial?: (string | null)[]; onLock?: (r: ReconstructResponse) => void;
  onChange?: (v: (string | null)[]) => void; onRevealComplete?: () => void;
}) {
  const [value, setValue] = useState<(string | null)[]>(initial);
  return (
    <Reconstruct content={content} phase={phase} value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
      onLock={onLock} reveal={reveal} onRevealComplete={onRevealComplete} />
  );
}

const opt = (t: string) => screen.getByTestId(`reconstruct-option-${t}`);
const sock = (i: number) => screen.getByTestId(`reconstruct-socket-${i}`);
const live = () => screen.getByTestId("reconstruct-live");
const lock = () => screen.getByTestId("reconstruct-lock");
const tokens = () => [0, 1, 2].map((i) => sock(i).getAttribute("data-token"));
const place = (token: string, slot: number) => { fireEvent.click(opt(token)); fireEvent.click(sock(slot)); };

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.useRealTimers();
});

describe("Reconstruct — open", () => {
  it("draws the prompt, the target, one socket per part and each tray choice once", () => {
    render(<Host />);
    expect(screen.getByTestId("reconstruct-prompt")).toHaveTextContent("Fill the three parts");
    expect(screen.getByTestId("reconstruct-target")).toHaveTextContent("Test Assembly");
    expect(screen.getAllByTestId(/^reconstruct-socket-\d$/)).toHaveLength(3);
    expect(screen.getAllByTestId(/^reconstruct-option-/)).toHaveLength(4);
  });

  it("never draws a verdict, a mark or an evidence figure before the reveal", () => {
    const { container } = render(<Host initial={["a", "b", "b"]} />);
    expect(screen.queryByTestId("reconstruct-verdict")).toBeNull();
    expect(screen.queryByTestId("reconstruct-evidence")).toBeNull();
    expect(container.querySelector("[data-part=mark]")).toBeNull();
    expect(container.textContent).not.toMatch(/right|wrong|Answer|Your pick|Total/i);
  });

  it("tap a choice, tap a socket: places it, calls onChange, clears the selection", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(opt("a"));
    expect(opt("a")).toHaveAttribute("aria-pressed", "true");
    expect(opt("a")).toHaveAttribute("data-selected", "true");
    fireEvent.click(sock(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([null, "a", null]);
    expect(tokens()).toEqual([null, "a", null]);
    expect(opt("a")).toHaveAttribute("aria-pressed", "false");
  });

  it("tapping the selected choice again deselects it", () => {
    render(<Host />);
    fireEvent.click(opt("a"));
    fireEvent.click(opt("a"));
    expect(opt("a")).toHaveAttribute("aria-pressed", "false");
    expect(live()).toHaveTextContent("Alpha deselected.");
  });

  it("selecting another choice moves the selection (only one is ever selected)", () => {
    render(<Host />);
    fireEvent.click(opt("a"));
    fireEvent.click(opt("d"));
    expect(opt("a")).toHaveAttribute("aria-pressed", "false");
    expect(opt("d")).toHaveAttribute("aria-pressed", "true");
  });

  it("tapping a filled socket with nothing selected removes its part", () => {
    const onChange = vi.fn();
    render(<Host initial={["a", "d", null]} onChange={onChange} />);
    fireEvent.click(sock(1));
    expect(onChange).toHaveBeenLastCalledWith(["a", null, null]);
    expect(live()).toHaveTextContent("Delta removed from part 2 of 3. One of three parts filled.");
  });

  it("tapping an empty socket with nothing selected changes nothing and says why", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(sock(0));
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toHaveTextContent("Part 1 of 3 is empty. Select a part from the tray first.");
  });

  it("replaces an occupant when a choice is selected and an occupied socket is tapped", () => {
    render(<Host initial={["a", "d", null]} />);
    place("e", 1);
    expect(tokens()).toEqual(["a", "e", null]);
    expect(live()).toHaveTextContent("Epsilon placed in part 2 of 3, replacing Delta. Two of three parts filled.");
  });

  it("a selected choice placed over its own socket is a no-op that keeps the selection", () => {
    const onChange = vi.fn();
    render(<Host initial={["b", null, null]} onChange={onChange} />);
    fireEvent.click(opt("b")); // Beta may be used twice, so it can be selected again
    fireEvent.click(sock(0));
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toHaveTextContent("Part 1 of 3 already holds Beta.");
    expect(opt("b")).toHaveAttribute("aria-pressed", "true");
  });

  it("socket position is free: parts may go in any socket in any order", () => {
    render(<Host />);
    place("b", 2); place("a", 0); place("b", 1);
    expect(tokens()).toEqual(["a", "b", "b"]);
  });

  it("a replaced socket frees its use, so the replaced choice can be used again", () => {
    render(<Host initial={["a", null, null]} />);
    place("d", 0);
    expect(opt("a")).toHaveAttribute("data-used", "0");
    place("a", 2);
    expect(tokens()).toEqual(["d", null, "a"]);
  });
});

describe("Reconstruct — duplicates and limits", () => {
  it("shows a usage count for a reusable choice, not a second copy of it", () => {
    render(<Host initial={["b", null, null]} />);
    expect(screen.getAllByTestId("reconstruct-option-b")).toHaveLength(1);
    expect(screen.getByTestId("reconstruct-usage-b")).toHaveTextContent("1/2");
    expect(opt("b")).toHaveAccessibleName("Beta, used 1 of 2");
  });

  it("lets a choice fill sockets up to maxUses and no further", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    place("b", 0); place("b", 1);
    expect(tokens()).toEqual(["b", "b", null]);
    expect(screen.getByTestId("reconstruct-usage-b")).toHaveTextContent("2/2");
    expect(opt("b")).toHaveAttribute("data-at-limit", "true");
    expect(opt("b")).toHaveAttribute("aria-disabled", "true");
    onChange.mockClear();
    fireEvent.click(opt("b"));
    expect(opt("b")).toHaveAttribute("aria-pressed", "false");
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toHaveTextContent("Beta is already used two of two times. Remove one to use it again.");
    fireEvent.click(sock(2));
    expect(tokens()).toEqual(["b", "b", null]);
  });

  it("a choice without maxUses is limited to one socket", () => {
    render(<Host />);
    place("d", 0);
    expect(opt("d")).toHaveAttribute("data-at-limit", "true");
    fireEvent.click(opt("d"));
    expect(live()).toHaveTextContent("Delta is already placed. Remove it to use it again.");
    expect(tokens()).toEqual(["d", null, null]);
  });

  it("removing a use frees the choice again", () => {
    render(<Host initial={["b", "b", null]} />);
    fireEvent.click(sock(0));
    expect(opt("b")).toHaveAttribute("data-at-limit", "false");
    place("b", 2);
    expect(tokens()).toEqual([null, "b", "b"]);
  });

  it("a caller's over-limit or stranger value can never break a limit or hide a socket", () => {
    render(<Host initial={["b", "b", "b", "zzz"] as (string | null)[]} />);
    expect(tokens()).toEqual(["b", "b", null]);
    expect(screen.getByTestId("reconstruct-usage-b")).toHaveTextContent("2/2");
  });

  it("fails loudly on a config it cannot honour", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Host content={{ ...B, slotCount: 5 }} />)).toThrow(/slotCount/);
    expect(() => render(<Host content={{ ...B, slotCount: 1 }} />)).toThrow(/slotCount/);
    err.mockRestore();
  });
});

describe("Reconstruct — lock", () => {
  it("is disabled while the board is empty or partial, enabled when every socket is filled", () => {
    render(<Host />);
    expect(lock()).toBeDisabled();
    place("a", 0);
    expect(lock()).toBeDisabled();
    place("b", 1);
    expect(lock()).toBeDisabled();
    place("b", 2);
    expect(lock()).toBeEnabled();
  });

  it("explains itself: the hint names the shortfall, and Lock points at it", () => {
    render(<Host />);
    expect(screen.getByTestId("reconstruct-lock-hint")).toHaveTextContent("Fill all 3 parts to lock in.");
    expect(lock()).toHaveAttribute("aria-describedby", screen.getByTestId("reconstruct-lock-hint").id);
    place("a", 0); place("b", 1); place("b", 2);
    expect(screen.getByTestId("reconstruct-lock-hint")).toHaveTextContent("Final once locked.");
  });

  it("does not call onLock on a click while partial", () => {
    const onLock = vi.fn();
    render(<Host initial={["a", null, null]} onLock={onLock} />);
    fireEvent.click(lock());
    expect(onLock).not.toHaveBeenCalled();
  });

  it("emits the current placement exactly once, as identity only", () => {
    const onLock = vi.fn();
    render(<Host initial={["b", "a", "b"]} onLock={onLock} />);
    fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledWith({ placement: ["b", "a", "b"] });
    expect(Object.keys(onLock.mock.calls[0][0])).toEqual(["placement"]);
  });

  it("locks the board as it stands after a replacement", () => {
    const onLock = vi.fn();
    render(<Host initial={["a", "b", "d"]} onLock={onLock} />);
    place("b", 2);
    fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledWith({ placement: ["a", "b", "b"] });
  });

  it("a wrong full board locks just as readily: the primitive has no opinion", () => {
    const onLock = vi.fn();
    render(<Host initial={["d", "e", "d"]} onLock={onLock} />);
    // `d` is limited to one socket, so the board normalises to d, e, empty: not full.
    expect(lock()).toBeDisabled();
    render(<Host initial={["a", "d", "e"]} onLock={onLock} />);
    fireEvent.click(screen.getAllByTestId("reconstruct-lock")[1]);
    expect(onLock).toHaveBeenCalledWith({ placement: ["a", "d", "e"] });
  });

  it("is not offered once locked", () => {
    render(<Host phase="locked" initial={["a", "b", "b"]} />);
    expect(screen.queryByTestId("reconstruct-lock")).toBeNull();
    expect(screen.getByTestId("reconstruct-suspense")).toBeInTheDocument();
  });
});

describe("Reconstruct — keyboard", () => {
  it("every control is a native button, so Enter and Space activate it", () => {
    render(<Host initial={["a", null, null]} />);
    for (const el of [opt("a"), opt("b"), sock(0), sock(1), lock()]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el).toHaveAttribute("type", "button");
    }
  });

  it("has one tab stop in the tray and one in the sockets (roving tabindex)", () => {
    render(<Host />);
    const stops = (group: HTMLElement) => within(group).getAllByRole("button").filter((b) => b.tabIndex === 0);
    expect(stops(screen.getByRole("group", { name: "Parts" }))).toHaveLength(1);
    expect(stops(screen.getByRole("group", { name: /^Build of/ }))).toHaveLength(1);
  });

  it("arrows move focus through the tray (Down/Up by a row) and Home/End jump", () => {
    render(<Host />);
    opt("a").focus();
    fireEvent.keyDown(opt("a"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(opt("b"));
    fireEvent.keyDown(opt("b"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(opt("d"));
    fireEvent.keyDown(opt("d"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(opt("b"));
    fireEvent.keyDown(opt("b"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(opt("b")); // no cell below column 2 of a 4-option tray
    opt("a").focus();
    fireEvent.keyDown(opt("a"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(opt("e")); // 0 + 3 columns
    fireEvent.keyDown(opt("e"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(opt("a"));
    fireEvent.keyDown(opt("a"), { key: "End" });
    expect(document.activeElement).toBe(opt("e"));
    fireEvent.keyDown(opt("e"), { key: "Home" });
    expect(document.activeElement).toBe(opt("a"));
  });

  it("does not run off either end of the tray", () => {
    render(<Host />);
    opt("a").focus();
    fireEvent.keyDown(opt("a"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(opt("a"));
    opt("e").focus();
    fireEvent.keyDown(opt("e"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(opt("e"));
  });

  it("the roving stop follows focus, so Tab returns to where you were", () => {
    render(<Host />);
    act(() => opt("d").focus());
    expect(opt("d").tabIndex).toBe(0);
    expect(opt("a").tabIndex).toBe(-1);
  });

  it("arrows move focus between sockets", () => {
    render(<Host />);
    sock(0).focus();
    fireEvent.keyDown(sock(0), { key: "ArrowRight" });
    expect(document.activeElement).toBe(sock(1));
    fireEvent.keyDown(sock(1), { key: "End" });
    expect(document.activeElement).toBe(sock(2));
    fireEvent.keyDown(sock(2), { key: "ArrowRight" });
    expect(document.activeElement).toBe(sock(2));
    fireEvent.keyDown(sock(2), { key: "Home" });
    expect(document.activeElement).toBe(sock(0));
  });

  it("Delete and Backspace remove the focused socket's part; an empty socket ignores them", () => {
    render(<Host initial={["a", "d", null]} />);
    sock(1).focus();
    fireEvent.keyDown(sock(1), { key: "Delete" });
    expect(tokens()).toEqual(["a", null, null]);
    sock(0).focus();
    fireEvent.keyDown(sock(0), { key: "Backspace" });
    expect(tokens()).toEqual([null, null, null]);
    fireEvent.keyDown(sock(2), { key: "Delete" });
    expect(tokens()).toEqual([null, null, null]);
  });

  it("Escape clears the selection", () => {
    render(<Host />);
    fireEvent.click(opt("a"));
    fireEvent.keyDown(opt("a"), { key: "Escape" });
    expect(opt("a")).toHaveAttribute("aria-pressed", "false");
    expect(live()).toHaveTextContent("Selection cleared.");
  });

  it("focus stays put through a whole placement: selecting, placing and removing never move it", () => {
    render(<Host />);
    opt("a").focus();
    fireEvent.click(opt("a"));
    expect(document.activeElement).toBe(opt("a"));
    sock(1).focus();
    fireEvent.click(sock(1));
    expect(document.activeElement).toBe(sock(1));
    fireEvent.click(sock(1)); // remove
    expect(document.activeElement).toBe(sock(1));
  });

  it("the same keyboard-only path fills and locks a board", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} />);
    // Enter/Space on a native button is its click; arrows pick the target.
    opt("a").focus(); fireEvent.click(opt("a"));
    sock(0).focus(); fireEvent.click(sock(0));
    opt("b").focus(); fireEvent.click(opt("b"));
    sock(1).focus(); fireEvent.click(sock(1));
    opt("b").focus(); fireEvent.click(opt("b"));
    sock(2).focus(); fireEvent.click(sock(2));
    lock().focus(); fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledWith({ placement: ["a", "b", "b"] });
  });
});

describe("Reconstruct — accessibility", () => {
  it("names the groups, the sockets and the choices, with state", () => {
    render(<Host initial={["a", null, null]} />);
    expect(screen.getByRole("group", { name: "Build of Test Assembly" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Parts" })).toBeInTheDocument();
    expect(sock(0)).toHaveAccessibleName("Part 1 of 3: Alpha. Press to remove.");
    expect(sock(1)).toHaveAccessibleName("Part 2 of 3, empty.");
    expect(sock(2)).toHaveAccessibleName("Part 3 of 3, empty.");
    expect(opt("a")).toHaveAccessibleName("Alpha, used");
    expect(opt("d")).toHaveAccessibleName("Delta, not used");
  });

  it("socket names say what a press will do once a choice is selected", () => {
    render(<Host initial={["a", null, null]} />);
    fireEvent.click(opt("d"));
    expect(sock(1)).toHaveAccessibleName("Part 2 of 3, empty. Press to place Delta.");
    expect(sock(0)).toHaveAccessibleName("Part 1 of 3: Alpha. Press to replace it with Delta.");
  });

  it("selected state is exposed as aria-pressed", () => {
    render(<Host />);
    expect(opt("a")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(opt("a"));
    expect(opt("a")).toHaveAttribute("aria-pressed", "true");
  });

  it("meets the 44px touch-target convention: 56px sockets, fixed 92px tray cells, 48px Lock", () => {
    render(<Host />);
    expect(sock(0).className).toMatch(/\bh-14 w-14\b/); // 56px
    expect(opt("a").className).toMatch(/\bh-\[92px\]/);
    expect(lock().className).toMatch(/min-h-\[48px\]/);
  });

  it("the prompt is a focusable heading a host can move focus to", () => {
    render(<Host />);
    const h = screen.getByRole("heading", { level: 2 });
    expect(h).toHaveAttribute("tabindex", "-1");
  });

  it("long names wrap rather than truncate", () => {
    render(<Host content={{ ...B, options: [{ token: "a", label: "Extraordinarily Long Part Name" }, ...B.options.slice(1)] }} />);
    const name = within(opt("a")).getByText("Extraordinarily Long Part Name");
    expect(name.className).toMatch(/line-clamp-2/);
    expect(name.className).toMatch(/break-words/);
    expect(name.className).not.toMatch(/\btruncate\b/);
  });
});

describe("Reconstruct — one controlled live region", () => {
  it("is a single polite status region", () => {
    render(<Host />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(live()).toHaveAttribute("aria-live", "polite");
  });

  it("says nothing until the player acts, then one sentence per action", () => {
    render(<Host />);
    expect(live()).toHaveTextContent("");
    fireEvent.click(opt("a"));
    expect(live()).toHaveTextContent("Alpha selected. Choose a part to place it in.");
    fireEvent.click(sock(1));
    expect(live()).toHaveTextContent("Alpha placed in part 2 of 3. One of three parts filled.");
  });

  it("announces the lock being available when the last socket fills", () => {
    render(<Host initial={["a", "b", null]} />);
    place("b", 2);
    expect(live()).toHaveTextContent("Beta placed in part 3 of 3. Three of three parts filled. Lock is available.");
  });

  it("does not change on a re-render with no action", () => {
    const { rerender } = render(<Host initial={["a", null, null]} />);
    fireEvent.click(opt("d"));
    const before = live().textContent;
    rerender(<Host initial={["a", null, null]} />);
    expect(live().textContent).toBe(before);
  });

  it("says Build locked once locked, and never carries the open-phase text over", () => {
    const { rerender } = render(<Host initial={["a", "b", "b"]} />);
    fireEvent.click(opt("d"));
    expect(live().textContent).not.toBe("");
    rerender(<Host initial={["a", "b", "b"]} phase="locked" />);
    expect(live()).toHaveTextContent("Build locked. Waiting for the reveal.");
  });
});

describe("Reconstruct — locked", () => {
  it("shows the placed board, no controls, a disabled tray", () => {
    render(<Host phase="locked" initial={["b", "a", "b"]} />);
    expect(screen.queryByRole("button", { name: /Lock in/ })).toBeNull();
    expect(screen.getAllByTestId(/^reconstruct-socket-\d$/).every((s) => s.tagName !== "BUTTON")).toBe(true);
    expect(opt("a")).toBeDisabled();
    expect([0, 1, 2].map((i) => sock(i).getAttribute("data-token"))).toEqual(["b", "a", "b"]);
    expect(sock(0)).toHaveAttribute("data-state", "locked");
  });

  it("a locked board ignores taps", () => {
    const onChange = vi.fn();
    render(<Host phase="locked" initial={["b", "a", "b"]} onChange={onChange} />);
    fireEvent.click(opt("a"));
    fireEvent.click(sock(0));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Reconstruct — drag (progressive enhancement)", () => {
  const dt = () => ({ setData: vi.fn(), effectAllowed: "" });

  it("dropping a tray choice on a socket places it through the same path as a tap", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.dragStart(opt("a"), { dataTransfer: dt() });
    fireEvent.dragOver(sock(2), { dataTransfer: dt() });
    fireEvent.drop(sock(2), { dataTransfer: dt() });
    expect(onChange).toHaveBeenLastCalledWith([null, null, "a"]);
  });

  it("respects the limit on drop, and an at-limit choice is not draggable", () => {
    const onChange = vi.fn();
    render(<Host initial={["a", null, null]} onChange={onChange} />);
    expect(opt("a")).toHaveAttribute("draggable", "false");
    expect(opt("d")).toHaveAttribute("draggable", "true");
    fireEvent.drop(sock(1), { dataTransfer: dt() }); // nothing is being dragged
    expect(onChange).not.toHaveBeenCalled();
  });

  it("nothing depends on it: the tap path is complete without any drag event", () => {
    render(<Host />);
    place("a", 0); place("b", 1); place("b", 2);
    expect(lock()).toBeEnabled();
  });
});

// ------------------------------------------------------------------- the reveal

const WRONG = ["a", "d", "b"]; // canonical a ×1, b ×2 → slot 1 wrong; settled a, b, b
const RIGHT = ["b", "a", "b"];

describe("Reconstruct — revealed (animated)", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  const root = () => screen.getByTestId("mig-reconstruct");
  const stage = () => root().getAttribute("data-reveal-stage");
  const shownTokens = () => [0, 1, 2].map((i) => sock(i).getAttribute("data-token"));
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it("runs marks → settle → evidence → done on one clock that ends by 1.5 s", () => {
    const done = vi.fn();
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    expect(stage()).toBe("marks");
    advance(449); expect(stage()).toBe("marks");
    advance(1); expect(stage()).toBe("settle");
    advance(599); expect(stage()).toBe("settle");
    advance(1); expect(stage()).toBe("evidence");
    advance(449); expect(stage()).toBe("evidence");
    expect(done).not.toHaveBeenCalled();
    advance(1); expect(stage()).toBe("done");
    expect(done).toHaveBeenCalledTimes(1);
    advance(5000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("marks stage: the submitted picks stay visible, each with a right or wrong mark", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(shownTokens()).toEqual(["a", "d", "b"]);
    expect(sock(0)).toHaveAttribute("data-mark", "right");
    expect(sock(1)).toHaveAttribute("data-mark", "wrong");
    expect(sock(2)).toHaveAttribute("data-mark", "right");
    expect(sock(1)).toHaveAttribute("data-state", "wrong");
    expect(screen.getByTestId("reconstruct-verdict")).toHaveTextContent("2 of 3 parts right");
    // Nothing from later stages yet.
    expect(screen.getByTestId("reconstruct-pick-1")).toHaveAttribute("data-shown", "false");
    // The evidence has not taken the tray box yet: the inert tray still holds it.
    expect(screen.queryByTestId("reconstruct-evidence")).toBeNull();
    expect(screen.getByTestId("reconstruct-tray")).toHaveAttribute("data-state", "locked");
  });

  it("settle stage: the wrong pick demotes to a small 'your pick' and the missing part fills the socket", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(450);
    expect(shownTokens()).toEqual(["a", "b", "b"]);
    expect(sock(1)).toHaveAttribute("data-state", "settled");
    expect(sock(0)).toHaveAttribute("data-state", "correct");
    const pick = screen.getByTestId("reconstruct-pick-1")!;
    expect(pick).toHaveAttribute("data-shown", "true");
    expect(pick).toHaveTextContent("Your pick");
    expect(pick).toHaveTextContent("Delta");
    // The correct picks did not move or change.
    expect(sock(0).getAttribute("data-token")).toBe("a");
    expect(sock(2).getAttribute("data-token")).toBe("b");
  });

  it("evidence stage: the host's figures appear, verbatim, with the bracket and the total last", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(1050);
    const ev = screen.getByTestId("reconstruct-evidence");
    expect(ev).toHaveAttribute("data-shown", "true");
    expect(within(screen.getByTestId("reconstruct-evidence-b")).getByText("×2")).toBeInTheDocument();
    expect(screen.getByTestId("reconstruct-evidence-b")).toHaveTextContent("50");
    expect(screen.getByTestId("reconstruct-evidence-a")).toHaveTextContent("100");
    expect(screen.getByTestId("reconstruct-evidence-extra-0")).toHaveTextContent("Fee30");
    expect(screen.getByTestId("reconstruct-evidence-total")).toHaveTextContent("Total230");
    const order = [...ev.querySelectorAll("li, p")].map((n) => n.getAttribute("data-testid"));
    expect(order[order.length - 1]).toBe("reconstruct-evidence-total");
  });

  it("the settled board is the canonical result at EVERY moment after settle, and at the end", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    // Step through the whole clock and check every frame after settle begins.
    advance(450);
    for (let t = 450; t <= 1700; t += 50) {
      expect(shownTokens()).toEqual(["a", "b", "b"]);
      advance(50);
    }
    expect([...shownTokens()].sort()).toEqual(["a", "b", "b"]);
  });

  it("a fully correct build skips settle: no 'your pick', marks then evidence, done by 900 ms", () => {
    const done = vi.fn();
    render(<Host phase="revealed" initial={RIGHT} reveal={revealFor(RIGHT)} onRevealComplete={done} />);
    expect(screen.getByTestId("reconstruct-verdict")).toHaveTextContent("Every part right");
    expect(screen.queryByTestId("reconstruct-pick-0")).toBeNull();
    advance(450); expect(stage()).toBe("evidence");
    expect(shownTokens()).toEqual(RIGHT);
    advance(449); expect(done).not.toHaveBeenCalled();
    advance(1); expect(done).toHaveBeenCalledTimes(1);
    expect(stage()).toBe("done");
  });

  it("with no evidence the reveal ends when settle ends", () => {
    const done = vi.fn();
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG, { evidence: null })} onRevealComplete={done} />);
    expect(screen.queryByTestId("reconstruct-evidence")).toBeNull();
    advance(1049); expect(done).not.toHaveBeenCalled();
    advance(1); expect(done).toHaveBeenCalledTimes(1);
  });

  it("every reveal completes within 1.5 s, whatever the mix of wrong sockets", () => {
    for (const placement of [["d", "e", "d"], ["a", "d", "e"], ["a", "b", "b"], ["e", "e", "e"], ["b", "b", "b"]]) {
      const done = vi.fn();
      const { unmount } = render(<Host phase="revealed" initial={placement} reveal={revealFor(placement)} onRevealComplete={done} />);
      advance(1500);
      expect(done).toHaveBeenCalledTimes(1);
      expect(stage()).toBe("done");
      unmount();
    }
  });

  it("a re-render with an equal reveal does not restart the clock", () => {
    const done = vi.fn();
    const { rerender } = render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    advance(700);
    expect(stage()).toBe("settle");
    rerender(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    expect(stage()).toBe("settle");
    advance(800);
    expect(stage()).toBe("done");
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("animates only what changes: a correct socket carries no entrance animation, a replaced one does", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(450);
    expect(sock(0).querySelector(".slide-in-from-bottom-6")).toBeNull();
    expect(sock(1).querySelector(".slide-in-from-bottom-6")).not.toBeNull();
  });

  it("states the whole reveal once, in the single live region", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(live()).toHaveTextContent(
      "2 of 3 parts right. The build is: Alpha; Beta, 2 of the 3 parts. Fee 30. Total 230.");
    const text = live().textContent;
    advance(2000);
    expect(live().textContent).toBe(text);
  });

  it("states a correct build as 'Every part right'", () => {
    render(<Host phase="revealed" initial={RIGHT} reveal={revealFor(RIGHT)} />);
    expect(live()).toHaveTextContent(/^Every part right\./);
  });

  it("gives each socket a text status for assistive tech", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(screen.getByTestId("reconstruct-slot-status-0")).toHaveTextContent("Part 1 of 3: Alpha. Right part.");
    expect(screen.getByTestId("reconstruct-slot-status-1")).toHaveTextContent("Part 2 of 3: Delta. Wrong part.");
    advance(450);
    expect(screen.getByTestId("reconstruct-slot-status-1")).toHaveTextContent(
      "Part 2 of 3: Beta. Your pick, Delta, was wrong.");
  });

  it("keeps the tray box: the inert tray until evidence, then the evidence in the same reserved box", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    const reserved = screen.getByTestId("reconstruct-tray-box").style.minHeight;
    expect(reserved).toBe("192px"); // 4 options → two rows of fixed 92px cells + one 8px gap
    expect(screen.queryByTestId("reconstruct-lock")).toBeNull();
    for (const b of screen.queryAllByRole("button")) expect(b).toBeDisabled();
    advance(1050);
    expect(screen.queryByTestId("reconstruct-tray")).toBeNull();
    const box = screen.getByTestId("reconstruct-tray-box");
    expect(within(box).getByTestId("reconstruct-evidence")).toBeInTheDocument();
    expect(box.style.minHeight).toBe(reserved);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("draws marks and tags from the reveal as stated: it never re-derives correctness", () => {
    // Deliberately inconsistent with the placement: slot 1 (a wrong pick) is stated right.
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG, { slotCorrect: [true, true, true], isCorrect: true })} />);
    expect(sock(1)).toHaveAttribute("data-mark", "right");
    expect(screen.getByTestId("reconstruct-verdict")).toHaveTextContent("Every part right");
  });

  it("draws no verdict and no marks when the host stated none", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG, { slotCorrect: [], isCorrect: null, evidence: null })} />);
    expect(screen.queryByTestId("reconstruct-verdict")).toBeNull();
    expect(sock(0)).not.toHaveAttribute("data-mark");
    expect(live()).toHaveTextContent(/^Revealed\./);
  });

  it("leaves nothing out of order when the reveal arrives after the open phase", () => {
    const { rerender } = render(<Host initial={WRONG} />);
    expect(stage()).toBeNull();
    rerender(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(stage()).toBe("marks");
  });
});

describe("Reconstruct — reduced motion", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("the first reveal frame is the settled frame: settled sockets, 'your pick', evidence, complete", () => {
    document.documentElement.classList.add("reduce-motion");
    const done = vi.fn();
    const { container } = render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    const root = screen.getByTestId("mig-reconstruct");
    expect(root).toHaveAttribute("data-reveal-stage", "done");
    expect([0, 1, 2].map((i) => sock(i).getAttribute("data-token"))).toEqual(["a", "b", "b"]);
    expect(screen.getByTestId("reconstruct-pick-1")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("reconstruct-pick-1")).toHaveTextContent("Delta");
    expect(screen.getByTestId("reconstruct-evidence")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("reconstruct-evidence-total")).toHaveTextContent("Total230");
    expect(screen.getByTestId("reconstruct-verdict")).toHaveTextContent("2 of 3 parts right");
    // No travel, no tween: nothing carries an animation.
    expect(container.querySelector(".animate-in")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("carries every fact the animated reveal does", () => {
    const facts = () => {
      const t = screen.getByTestId("mig-reconstruct").textContent ?? "";
      return ["Test Assembly", "Alpha", "Beta", "Delta", "Your pick", "Answer", "×2", "100", "50", "Fee", "30", "Total", "230", "2 of 3 parts right"]
        .filter((s) => t.includes(s));
    };
    const { unmount } = render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    act(() => { vi.advanceTimersByTime(2000); });
    const animated = facts();
    unmount();
    document.documentElement.classList.add("reduce-motion");
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(facts()).toEqual(animated);
    expect(animated).toHaveLength(14);
  });

  it("a fully correct reveal is instant too, and says so in the live region", () => {
    document.documentElement.classList.add("reduce-motion");
    const done = vi.fn();
    render(<Host phase="revealed" initial={RIGHT} reveal={revealFor(RIGHT)} onRevealComplete={done} />);
    expect(screen.getByTestId("mig-reconstruct")).toHaveAttribute("data-reveal-stage", "done");
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("reconstruct-live")).toHaveTextContent(/^Every part right\./);
  });

  it("flipping reduced motion mid-reveal jumps straight to the settled frame", async () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(screen.getByTestId("mig-reconstruct")).toHaveAttribute("data-reveal-stage", "marks");
    await act(async () => { document.documentElement.classList.add("reduce-motion"); await Promise.resolve(); });
    expect(screen.getByTestId("mig-reconstruct")).toHaveAttribute("data-reveal-stage", "done");
  });
});

describe("Reconstruct — layout at 390px", () => {
  it("the widest board (4 sockets) fits a 358px inner width (390 − 2×16 gutters)", () => {
    // Slot columns are at most 76px and shrink to fit (flex-1, min-w-0), gap 8px:
    // 4×76 + 3×8 = 328, and a column never drops below the 64px socket until the
    // row is narrower than 4×64 + 3×8 = 280px.
    render(<Host content={{ ...B, slotCount: 4, options: [...B.options, { token: "f", label: "Zeta" }] }} />);
    const row = screen.getByTestId("reconstruct-sockets");
    expect(row.className).toMatch(/gap-2/);
    const slot = screen.getByTestId("reconstruct-slot-0").className;
    expect(slot).toMatch(/max-w-\[76px\]/);
    expect(slot).toMatch(/\bflex-1\b/);
    expect(slot).toMatch(/\bmin-w-0\b/);
    expect(4 * 76 + 3 * 8).toBeLessThanOrEqual(358);
    expect(4 * 64 + 3 * 8).toBeLessThanOrEqual(320 - 2 * 16); // a 320px phone still fits four sockets
  });

  it("the tray is a three-column grid whose cells are at least 104px wide at 358px", () => {
    render(<Host />);
    expect(screen.getByTestId("reconstruct-tray").className).toMatch(/grid-cols-3/);
    expect((358 - 2 * 8) / 3).toBeGreaterThanOrEqual(104);
    expect(screen.getByTestId("reconstruct-tray").className).toMatch(/gap-2\b/);
  });

  it("carries no fixed width wider than the phone, and nothing that forces horizontal scroll", () => {
    const src = readFileSync(resolve(__dirname, "Reconstruct.tsx"), "utf8");
    const widths = [...src.matchAll(/\bw-\[(\d+)px\]/g)].map((m) => Number(m[1]));
    expect(Math.max(...widths)).toBeLessThanOrEqual(358);
    expect(src).not.toMatch(/overflow-x-(auto|scroll)/);
    expect(src).not.toMatch(/min-w-\[\d{3,}px\]/);
  });
});

describe("Reconstruct — stable hooks for a host scene", () => {
  it("exposes data-mig-primitive, data-phase and data-part hooks, and takes no styling props", () => {
    render(<Host initial={["a", null, null]} />);
    const root = screen.getByTestId("mig-reconstruct");
    expect(root).toHaveAttribute("data-mig-primitive", "reconstruct");
    expect(root).toHaveAttribute("data-phase", "open");
    for (const part of ["target", "sockets", "slot", "socket", "tray", "option", "lock"]) {
      expect(root.querySelector(`[data-part=${part}]`)).not.toBeNull();
    }
    const src = readFileSync(resolve(__dirname, "Reconstruct.tsx"), "utf8");
    const props = src.slice(src.indexOf("export interface ReconstructProps"), src.indexOf("/** Tray columns"));
    expect(props).not.toMatch(/className|style|theme|color/i);
  });
});

describe("Reconstruct — source contract", () => {
  const src = readFileSync(resolve(__dirname, "Reconstruct.tsx"), "utf8");

  it("never grades: it does not import the grader, and never compares the reveal's lists", () => {
    const imports = (src.match(/^import[\s\S]*?;\s*$/gm) ?? []).join(" ");
    expect(imports).toContain("@/lib/interaction-grammar/reconstruct"); // the placement helpers
    expect(imports).not.toContain("gradeAssembly");
    expect(src).not.toMatch(/settled\s*[!=]==|placement\s*[!=]==\s*reveal/);
    expect(src).not.toMatch(/slotCorrect\.(every)/);
  });

  it("knows nothing of the domain: no League, item, recipe, cost or gold words", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/league|champion|recipe|legendary|gold|combine|import[^;]*@\/lib\/items/i);
  });

  it("imports nothing from Studio", () => {
    expect(src).not.toMatch(/@\/studio|studio\//);
  });
});

describe("Reconstruct — GM1-R1 fixed geometry and the level beneath", () => {
  it("reserves the status line and footer; a wrong pick takes no layout", () => {
    render(<Host />);
    // The wrong pick is an absolute corner badge (no layout); the status
    // line and the footer are fixed boxes in every phase.
    for (const i of [0, 1, 2]) expect(screen.queryByTestId(`reconstruct-pick-${i}`)).toBeNull();
    expect(screen.getByTestId("reconstruct-hint").className).toMatch(/\bh-\[34px\]/);
    expect(document.querySelector("[data-part=footer]")!.className).toMatch(/\bh-12\b/);
  });

  it("the usage line is quiet until a piece is used", () => {
    render(<Host />);
    expect(screen.getByTestId("reconstruct-usage-b").textContent).toBe("");
    place("b", 0);
    expect(screen.getByTestId("reconstruct-usage-b").textContent).toBe("1/2");
  });

  it("with host parts, lists each canonical part once with its count and its own parts", () => {
    document.documentElement.classList.add("reduce-motion");
    const reveal = revealFor(WRONG, {
      evidence: {
        parts: [{ token: "a", quantity: 1 }, { token: "b", quantity: 2 }],
        values: { a: "100", b: "50" },
        children: { a: [], b: [{ label: "Gamma", quantity: 2 }] },
        total: { label: "Total", valueDisplay: "230" },
      },
    });
    render(<Host phase="revealed" initial={WRONG} reveal={reveal} />);
    expect(screen.getAllByTestId(/^reconstruct-evidence-[ab]$/)).toHaveLength(2);
    expect(screen.getByTestId("reconstruct-evidence-qty-b").textContent).toBe("×2");
    expect(screen.queryByTestId("reconstruct-evidence-qty-a")).toBeNull();
    expect(screen.getByTestId("reconstruct-children-a")).toHaveAttribute("data-basic", "true");
    expect(screen.getByTestId("reconstruct-children-b").textContent).toContain("Gamma");
    expect(screen.getByTestId("reconstruct-children-b").textContent).toContain("×2");
  });

  it("reduced motion: the first revealed frame already has the evidence in the tray box", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(within(screen.getByTestId("reconstruct-tray-box")).getByTestId("reconstruct-evidence"))
      .toBeInTheDocument();
    expect(screen.queryByTestId("reconstruct-tray")).toBeNull();
  });
});
