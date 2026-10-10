import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Reconstruct } from "./Reconstruct";
import type {
  InteractionPhase, ReconstructEvidence, ReconstructPublic, ReconstructResponse, ReconstructReveal,
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
/** The Ranked shape: every option carries the SAME limit, the socket count. */
const UNIFORM: ReconstructPublic = {
  ...B, options: B.options.map((o) => ({ ...o, maxUses: 3 })),
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

/** A host breakdown, worded by the fixture (the primitive knows none of these words). */
const EVIDENCE: ReconstructEvidence = {
  parts: [
    { token: "a", quantity: 1, valueDisplay: "100", caption: "Plain piece", children: [] },
    { token: "b", quantity: 2, valueDisplay: "50", lineTotalDisplay: "100", caption: "Made of",
      children: [{ label: "Gamma", quantity: 2, valueDisplay: "20" }], joinDisplay: "+ 10 to join" },
  ],
  equation: { terms: [{ label: "Pieces", valueDisplay: "200" }, { label: "Fee", valueDisplay: "30" }],
    result: { label: "Test Assembly", valueDisplay: "230" } },
};

function revealFor(placement: string[], extra: Partial<ReconstructReveal> = {}): ReconstructReveal {
  const g = hostGrade(placement);
  return {
    placement, slotCorrect: g.slotCorrect, settled: g.settled, isCorrect: g.isCorrect,
    evidence: EVIDENCE, ...extra,
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
const add = (...ts: string[]) => { for (const t of ts) fireEvent.click(opt(t)); };

// ---------------------------------------------------------------- pointer rig

/** jsdom 20 has no PointerEvent; testing-library builds the event from this. */
class PointerEventShim extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof PointerEventShim }).PointerEvent = PointerEventShim;
  }
});

/** Socket i is a 56px box at x = 100 + 72i, y = 100. Everything else is 0×0. */
const SOCKET = { left: 100, top: 100, size: 56, pitch: 72 };
/** jsdom 20 has no DOMRect constructor either. */
const rect = (x: number, y: number, w: number, h: number) => ({
  x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}),
}) as DOMRect;
function mockSocketRects() {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const m = /^reconstruct-socket-(\d)$/.exec(this.getAttribute("data-testid") ?? "");
    if (!m) return rect(0, 0, 0, 0);
    return rect(SOCKET.left + Number(m[1]) * SOCKET.pitch, SOCKET.top, SOCKET.size, SOCKET.size);
  });
}
const centre = (i: number) => ({
  x: SOCKET.left + i * SOCKET.pitch + SOCKET.size / 2, y: SOCKET.top + SOCKET.size / 2 });

/** A real drag: press on the card, travel, release at (x, y). Then the browser's click. */
function drag(token: string, to: { x: number; y: number }, pointerType = "mouse") {
  const card = opt(token);
  fireEvent.pointerDown(card, { pointerId: 7, pointerType, button: 0, clientX: 10, clientY: 400 });
  fireEvent.pointerMove(card, { pointerId: 7, pointerType, clientX: 40, clientY: 300 });
  fireEvent.pointerMove(card, { pointerId: 7, pointerType, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(card, { pointerId: 7, pointerType, clientX: to.x, clientY: to.y });
  fireEvent.click(card);
}

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------- the board

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

  it("socket position is free and unmarked: no empty socket carries a number", () => {
    render(<Host />);
    const row = screen.getByTestId("reconstruct-sockets");
    // R1 drew 1, 2, 3 in the empty sockets — a false ordering cue.
    expect(row.textContent).toBe("");
    expect(row.textContent).not.toMatch(/\d/);
    add("a");
    expect(row.textContent).not.toMatch(/\d/);
  });
});

describe("Reconstruct — R2 tap to add (no select-then-place)", () => {
  it("one tap adds one copy straight into the next empty socket", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(opt("a"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(["a", null, null]);
    expect(live()).toHaveTextContent("Alpha added. One of three parts filled.");
  });

  it("there is no armed or selected state: no aria-pressed, no data-selected", () => {
    render(<Host />);
    fireEvent.click(opt("a"));
    for (const o of screen.getAllByTestId(/^reconstruct-option-/)) {
      expect(o).not.toHaveAttribute("aria-pressed");
      expect(o).not.toHaveAttribute("data-selected");
    }
    // A socket tap after a tray tap does not "place a selection": it removes.
    fireEvent.click(sock(0));
    expect(tokens()).toEqual([null, null, null]);
  });

  it("repeated taps add repeated copies, within the limit", () => {
    render(<Host />);
    add("b", "b");
    expect(tokens()).toEqual(["b", "b", null]);
    expect(live()).toHaveTextContent("Beta added, two placed. Two of three parts filled.");
    add("b");                                     // Beta's limit here is 2
    expect(tokens()).toEqual(["b", "b", null]);
    expect(live()).toHaveTextContent("Beta can't be added again.");
  });

  it("fills the first EMPTY socket, wherever the gap is", () => {
    render(<Host />);
    add("a", "b", "d");
    fireEvent.click(sock(1));                     // remove Beta
    expect(tokens()).toEqual(["a", null, "d"]);
    add("e");
    expect(tokens()).toEqual(["a", "e", "d"]);
  });

  it("a full board refuses a tap and says how to change it", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    add("a", "b", "d");
    onChange.mockClear();
    add("e");
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toHaveTextContent("All three parts are filled. Remove one to change the build.");
  });

  it("tapping a filled socket removes its part; an empty one says how to add", () => {
    render(<Host initial={["a", null, null]} />);
    fireEvent.click(sock(0));
    expect(tokens()).toEqual([null, null, null]);
    expect(live()).toHaveTextContent("Alpha removed. Zero of three parts filled.");
    fireEvent.click(sock(1));
    expect(live()).toHaveTextContent("That socket is empty. Choose a part from the tray to add it.");
  });

  it("three taps fill a three-socket board: the R1 six-action flow is now three", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} />);
    add("a", "b", "b");
    fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledWith({ placement: ["a", "b", "b"] });
  });
});

describe("Reconstruct — R2 quantity feedback", () => {
  const badge = (t: string) => screen.getByTestId(`reconstruct-usage-${t}`);

  it("unused shows nothing; placed copies read ×1, ×2", () => {
    render(<Host />);
    expect(badge("b").textContent).toBe("");
    add("b");
    expect(badge("b").textContent).toBe("×1");
    add("b");
    expect(badge("b").textContent).toBe("×2");
    fireEvent.click(sock(0));
    expect(badge("b").textContent).toBe("×1");
  });

  it("names the placed count, never a limit", () => {
    render(<Host />);
    expect(opt("b")).toHaveAccessibleName("Beta");
    add("b", "b");
    expect(opt("b")).toHaveAccessibleName("Beta, two placed");
  });

  it("never draws or announces the reuse limit (the Ranked uniform cap)", () => {
    render(<Host content={UNIFORM} />);
    const tray = screen.getByTestId("reconstruct-tray");
    const exposed = () => [
      tray.textContent ?? "",
      ...screen.getAllByTestId(/^reconstruct-option-/).map((o) => o.getAttribute("aria-label") ?? ""),
      live().textContent ?? "",
    ].join(" | ");
    for (const k of [1, 2, 3]) {
      add("a");
      // The socket count ("of three parts filled") is public; a LIMIT is not.
      expect(exposed()).not.toMatch(/\/|\bmax|limit|\buses?\b|\btimes\b/i);
      // The only figure in the tray is the placed count itself.
      expect(screen.getByTestId("reconstruct-usage-a").textContent).toBe(`×${k}`);
      expect((tray.textContent ?? "").replace(`×${k}`, "")).not.toMatch(/\d|three/);
    }
    add("a");                                     // a full board, not a limit
    expect(exposed()).not.toMatch(/\/|\bmax|limit|\buses?\b|\btimes\b/i);
  });
});

describe("Reconstruct — R2 pointer drag, straight from the card", () => {
  it("a drag from an un-tapped card places it where it is dropped", () => {
    mockSocketRects();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    drag("d", centre(2));
    expect(onChange).toHaveBeenCalledTimes(1);             // the trailing click is not a tap
    expect(tokens()).toEqual([null, null, "d"]);
  });

  it("works for touch and pen too (pointer events, not HTML5 drag)", () => {
    mockSocketRects();
    render(<Host />);
    drag("a", centre(1), "touch");
    drag("e", centre(0), "pen");
    expect(tokens()).toEqual(["e", "a", null]);
    expect(opt("a").className).toMatch(/\btouch-none\b/);
  });

  it("is forgiving: a drop between two sockets snaps to the nearer one", () => {
    mockSocketRects();
    render(<Host />);
    // The gap between socket 0 (100–156) and socket 1 (172–228), nearer 1.
    drag("a", { x: 166, y: 128 });
    expect(tokens()).toEqual([null, "a", null]);
  });

  it("is forgiving: well below or above the visible socket still lands", () => {
    mockSocketRects();
    render(<Host />);
    drag("a", { x: centre(2).x, y: SOCKET.top + SOCKET.size + 50 });   // 50px under the box
    drag("b", { x: centre(0).x - 20, y: SOCKET.top - 40 });            // 40px above, off to the left
    expect(tokens()).toEqual(["b", null, "a"]);
  });

  it("a drop outside the assembly region changes nothing", () => {
    mockSocketRects();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    drag("a", { x: 128, y: 600 });
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toHaveTextContent("Alpha not added.");
  });

  it("a drop on a filled socket deliberately replaces its part", () => {
    mockSocketRects();
    render(<Host initial={["a", "d", null]} />);
    drag("e", centre(1));
    expect(tokens()).toEqual(["a", "e", null]);
    expect(live()).toHaveTextContent("Epsilon added, replacing Delta.");
  });

  it("highlights the socket a drop would land in, while dragging", () => {
    mockSocketRects();
    render(<Host />);
    const card = opt("a");
    fireEvent.pointerDown(card, { pointerId: 3, button: 0, clientX: 10, clientY: 400 });
    fireEvent.pointerMove(card, { pointerId: 3, clientX: centre(1).x, clientY: centre(1).y + 30 });
    expect(sock(1)).toHaveAttribute("data-drop-target", "true");
    expect(sock(0)).not.toHaveAttribute("data-drop-target");
    fireEvent.pointerCancel(card, { pointerId: 3 });
    expect(sock(1)).not.toHaveAttribute("data-drop-target");
  });

  it("the ghost is a fixed portal outside the board, gone after the drop", () => {
    mockSocketRects();
    render(<Host />);
    const card = opt("a");
    fireEvent.pointerDown(card, { pointerId: 4, button: 0, clientX: 10, clientY: 400 });
    fireEvent.pointerMove(card, { pointerId: 4, clientX: 60, clientY: 300 });
    const ghost = screen.getByTestId("reconstruct-drag-ghost");
    expect(screen.getByTestId("mig-reconstruct").contains(ghost)).toBe(false);
    expect(ghost.className).toMatch(/\bfixed\b/);
    expect(ghost.className).toMatch(/pointer-events-none/);
    fireEvent.pointerUp(card, { pointerId: 4, clientX: centre(0).x, clientY: centre(0).y });
    expect(screen.queryByTestId("reconstruct-drag-ghost")).toBeNull();
  });

  it("a press without travel is a tap: it adds once, through the click", () => {
    mockSocketRects();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const card = opt("a");
    fireEvent.pointerDown(card, { pointerId: 5, button: 0, clientX: 10, clientY: 400 });
    fireEvent.pointerMove(card, { pointerId: 5, clientX: 12, clientY: 402 });   // under the threshold
    fireEvent.pointerUp(card, { pointerId: 5, clientX: 12, clientY: 402 });
    fireEvent.click(card);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(tokens()).toEqual(["a", null, null]);
  });

  it("does nothing once locked", () => {
    mockSocketRects();
    const onChange = vi.fn();
    render(<Host phase="locked" initial={["a", "b", "b"]} onChange={onChange} />);
    drag("d", centre(0));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Reconstruct — R2 one canonical placement for every path", () => {
  const lockedBy = (fill: () => void) => {
    const onLock = vi.fn();
    const { unmount } = render(<Host onLock={onLock} />);
    fill();
    fireEvent.click(lock());
    unmount();
    return onLock.mock.calls[0][0] as ReconstructResponse;
  };

  it("tap, keyboard and drag build the same board and submit the same {placement}", () => {
    mockSocketRects();
    const byTap = lockedBy(() => add("a", "b", "b"));
    const byKeyboard = lockedBy(() => {
      // Enter / Space on a native button is its click: the same handler.
      for (const t of ["a", "b", "b"]) { opt(t).focus(); fireEvent.keyDown(opt(t), { key: "Enter" }); fireEvent.click(opt(t)); }
    });
    const byDrag = lockedBy(() => { drag("a", centre(0)); drag("b", centre(1)); drag("b", centre(2)); });
    expect(byTap).toEqual({ placement: ["a", "b", "b"] });
    expect(byKeyboard).toEqual(byTap);
    expect(byDrag).toEqual(byTap);
    expect(Object.keys(byDrag)).toEqual(["placement"]);
  });

  it("source: every input path goes through the ONE `place`, which alone calls placeFromTray", () => {
    const src = readFileSync(resolve(__dirname, "Reconstruct.tsx"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.match(/placeFromTray\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/\bplaceToken\(/);
    expect(code).toMatch(/onOptionClick[\s\S]*?place\(token\)/);
    expect(code).toMatch(/onOptionPointerUp[\s\S]*?place\(d\.token, target\)/);
    expect(code).not.toMatch(/draggable=\{(?!false)/);          // no HTML5 drag path
  });
});

// -------------------------------------------------------------------- lock

describe("Reconstruct — lock", () => {
  it("is disabled while the board is empty or partial, enabled when every socket is filled", () => {
    render(<Host />);
    expect(lock()).toBeDisabled();
    add("a", "b");
    expect(lock()).toBeDisabled();
    add("b");
    expect(lock()).toBeEnabled();
  });

  it("explains itself: the hint names the shortfall, and Lock points at it", () => {
    render(<Host />);
    expect(screen.getByTestId("reconstruct-lock-hint")).toHaveTextContent("Fill all 3 parts to lock in.");
    expect(lock()).toHaveAttribute("aria-describedby", screen.getByTestId("reconstruct-lock-hint").id);
    expect(screen.getByTestId("reconstruct-hint")).toHaveTextContent("Tap or drag parts in. Order doesn't matter. Zero of three filled.");
  });

  it("emits the current placement exactly once, as identity only", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} initial={["b", "a", "b"]} />);
    fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledWith({ placement: ["b", "a", "b"] });
  });

  it("a wrong full board locks just as readily: the primitive has no opinion", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} />);
    add("d", "e", "a");
    fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledWith({ placement: ["d", "e", "a"] });
  });

  it("is not offered once locked", () => {
    render(<Host phase="locked" initial={["a", "b", "b"]} />);
    expect(screen.queryByTestId("reconstruct-lock")).toBeNull();
    expect(screen.getByTestId("reconstruct-suspense")).toHaveTextContent(/Locked in/);
  });
});

// ---------------------------------------------------------------- keyboard

describe("Reconstruct — keyboard", () => {
  it("every control is a native button, so Enter and Space activate it", () => {
    render(<Host initial={["a", null, null]} />);
    for (const b of screen.getAllByRole("button")) expect(b.tagName).toBe("BUTTON");
  });

  it("has one tab stop in the tray and one in the sockets (roving tabindex)", () => {
    render(<Host />);
    expect(screen.getAllByTestId(/^reconstruct-option-/).filter((o) => o.tabIndex === 0)).toHaveLength(1);
    expect(screen.getAllByTestId(/^reconstruct-socket-/).filter((s) => s.tabIndex === 0)).toHaveLength(1);
  });

  it("arrows move focus through the tray (Down/Up by a row) and Home/End jump", () => {
    render(<Host />);
    opt("a").focus();
    fireEvent.keyDown(opt("a"), { key: "ArrowRight" });
    expect(opt("b")).toHaveFocus();
    fireEvent.keyDown(opt("b"), { key: "ArrowLeft" });
    expect(opt("a")).toHaveFocus();
    fireEvent.keyDown(opt("a"), { key: "ArrowDown" });     // three columns: a → e
    expect(opt("e")).toHaveFocus();
    fireEvent.keyDown(opt("e"), { key: "ArrowUp" });
    expect(opt("a")).toHaveFocus();
    fireEvent.keyDown(opt("a"), { key: "End" });
    expect(opt("e")).toHaveFocus();
    fireEvent.keyDown(opt("e"), { key: "Home" });
    expect(opt("a")).toHaveFocus();
    fireEvent.keyDown(opt("a"), { key: "End" });
    expect(opt("e")).toHaveFocus();
  });

  it("arrows move between sockets; Delete and Backspace remove the focused part", () => {
    render(<Host initial={["a", "b", null]} />);
    sock(0).focus();
    fireEvent.keyDown(sock(0), { key: "ArrowRight" });
    expect(sock(1)).toHaveFocus();
    fireEvent.keyDown(sock(1), { key: "Delete" });
    expect(tokens()).toEqual(["a", null, null]);
    fireEvent.keyDown(sock(0), { key: "Backspace" });
    expect(tokens()).toEqual([null, null, null]);
    fireEvent.keyDown(sock(2), { key: "Delete" });   // empty: ignored
    expect(tokens()).toEqual([null, null, null]);
  });

  it("focus stays put through adding and removing", () => {
    render(<Host />);
    opt("b").focus();
    fireEvent.click(opt("b"));
    expect(opt("b")).toHaveFocus();
    sock(0).focus();
    fireEvent.click(sock(0));
    expect(sock(0)).toHaveFocus();
  });

  it("the keyboard alone fills and locks a board", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} />);
    for (const t of ["b", "a", "b"]) { opt(t).focus(); fireEvent.click(opt(t)); }
    lock().focus();
    fireEvent.click(lock());
    expect(onLock).toHaveBeenCalledWith({ placement: ["b", "a", "b"] });
  });
});

// ---------------------------------------------------------- accessibility

describe("Reconstruct — accessibility", () => {
  it("names the groups, the sockets and the choices, with state", () => {
    render(<Host initial={["a", null, null]} />);
    expect(screen.getByRole("group", { name: "Build of Test Assembly" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Parts" })).toBeInTheDocument();
    expect(sock(0)).toHaveAccessibleName("Socket 1 of 3: Alpha. Press to remove.");
    expect(sock(1)).toHaveAccessibleName("Socket 2 of 3, empty.");
    expect(opt("a")).toHaveAccessibleName("Alpha, one placed");
  });

  it("the tray says what a press does, and that order does not matter", () => {
    render(<Host />);
    const tray = screen.getByRole("group", { name: "Parts" });
    expect(tray).toHaveAccessibleDescription("Press a part to add it. Order doesn't matter.");
  });

  it("meets the 44px touch-target convention: 56px sockets, fixed 92px tray cells, 48px Lock", () => {
    render(<Host />);
    expect(sock(0).className).toMatch(/\bh-14 w-14\b/);
    expect(opt("a").className).toMatch(/h-\[92px\]/);
    expect(lock().className).toMatch(/min-h-\[48px\]/);
  });

  it("the prompt is a focusable heading a host can move focus to", () => {
    render(<Host />);
    const h = screen.getByTestId("reconstruct-prompt");
    expect(h.tagName).toBe("H2");
    expect(h).toHaveAttribute("tabindex", "-1");
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
    expect(live().textContent).toBe("");
    add("a");
    expect(live()).toHaveTextContent("Alpha added. One of three parts filled.");
  });

  it("announces the lock being available when the last socket fills", () => {
    render(<Host />);
    add("a", "b", "b");
    expect(live()).toHaveTextContent("Three of three parts filled. Lock is available.");
  });

  it("never names a socket position when adding (position has no meaning)", () => {
    render(<Host />);
    add("a", "d");
    expect(live().textContent).not.toMatch(/socket|part \d|\bin (part|socket)/i);
  });

  it("says Build locked once locked, and never carries the open-phase text over", () => {
    const { rerender } = render(<Host />);
    add("a");
    rerender(<Host phase="locked" initial={["a", "b", "b"]} />);
    expect(live()).toHaveTextContent("Build locked. Waiting for the reveal.");
  });
});

describe("Reconstruct — locked", () => {
  it("shows the placed board, no controls, a disabled tray", () => {
    render(<Host phase="locked" initial={["a", "b", "b"]} />);
    expect(tokens()).toEqual(["a", "b", "b"]);
    expect(screen.getByTestId("reconstruct-tray")).toHaveAttribute("data-state", "locked");
    for (const b of screen.queryAllByRole("button")) expect(b).toBeDisabled();
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
    expect(screen.getByTestId("reconstruct-verdict")).toHaveTextContent("2 of 3 parts right");
    expect(screen.getByTestId("reconstruct-pick-1")).toHaveAttribute("data-shown", "false");
    expect(screen.queryByTestId("reconstruct-evidence")).toBeNull();
    expect(screen.getByTestId("reconstruct-tray")).toHaveAttribute("data-state", "locked");
  });

  it("settle stage: the wrong pick demotes to a small 'your pick' and the missing part fills the socket", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(450);
    expect(shownTokens()).toEqual(["a", "b", "b"]);
    expect(sock(1)).toHaveAttribute("data-state", "settled");
    const pick = screen.getByTestId("reconstruct-pick-1");
    expect(pick).toHaveAttribute("data-shown", "true");
    expect(pick).toHaveTextContent("Your pick");
    expect(pick).toHaveTextContent("Delta");
  });

  it("evidence stage: one breakdown block per part, in the host's words, the equation last", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(1050);
    const ev = screen.getByTestId("reconstruct-evidence");
    expect(screen.getAllByTestId(/^reconstruct-evidence-[ab]$/)).toHaveLength(2);
    const a = screen.getByTestId("reconstruct-evidence-a");
    expect(a).toHaveTextContent("Alpha");
    expect(within(a).getByTestId("reconstruct-evidence-value-a")).toHaveTextContent("100");
    expect(within(a).getByTestId("reconstruct-evidence-caption-a")).toHaveTextContent("Plain piece");
    expect(screen.queryByTestId("reconstruct-children-a")).toBeNull();
    const b = screen.getByTestId("reconstruct-evidence-b");
    expect(within(b).getByTestId("reconstruct-evidence-qty-b")).toHaveTextContent("×2");
    expect(within(b).getByTestId("reconstruct-evidence-value-b")).toHaveTextContent("50 each · 100");
    expect(within(b).getByTestId("reconstruct-evidence-caption-b")).toHaveTextContent("Made of");
    expect(within(b).getByTestId("reconstruct-children-b")).toHaveTextContent("Gamma×220");
    expect(within(b).getByTestId("reconstruct-evidence-join-b")).toHaveTextContent("+ 10 to join");
    const eq = screen.getByTestId("reconstruct-evidence-total");
    expect(eq).toHaveTextContent("Pieces200+Fee30=Test Assembly230");
    const order = [...ev.querySelectorAll("[data-part=breakdown-part], [data-part=equation]")]
      .map((n) => n.getAttribute("data-testid"));
    expect(order[order.length - 1]).toBe("reconstruct-evidence-total");
  });

  it("the breakdown's text is legible: nothing below 12px but the corner note", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(1500);
    const sizes = [...screen.getByTestId("reconstruct-evidence").querySelectorAll("*")]
      .flatMap((n) => [...(n.getAttribute("class") ?? "").matchAll(/(?:^|\s)text-\[(\d+(?:\.\d+)?)px\]/g)]
        .map((m) => ({ px: Number(m[1]), part: n.getAttribute("data-part") })));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      if (s.part === "annotation" || s.part === "children") continue;
      expect(s.px).toBeGreaterThanOrEqual(12);
    }
  });

  it("the settled board is the canonical result at EVERY moment after settle, and at the end", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    advance(450);
    for (let t = 450; t <= 1700; t += 50) {
      expect(shownTokens()).toEqual(["a", "b", "b"]);
      advance(50);
    }
  });

  it("a fully correct build skips settle: no 'your pick', marks then evidence, done by 900 ms", () => {
    const done = vi.fn();
    render(<Host phase="revealed" initial={RIGHT} reveal={revealFor(RIGHT)} onRevealComplete={done} />);
    expect(screen.getByTestId("reconstruct-verdict")).toHaveTextContent("Every part right");
    expect(screen.queryByTestId("reconstruct-pick-0")).toBeNull();
    advance(450); expect(stage()).toBe("evidence");
    advance(449); expect(done).not.toHaveBeenCalled();
    advance(1); expect(done).toHaveBeenCalledTimes(1);
  });

  it("with no evidence the reveal ends when settle ends", () => {
    const done = vi.fn();
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG, { evidence: null })} onRevealComplete={done} />);
    advance(1049); expect(done).not.toHaveBeenCalled();
    advance(1); expect(done).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("reconstruct-evidence")).toBeNull();
  });

  it("every reveal completes within 1.5 s, whatever the mix of wrong sockets", () => {
    for (const placement of [["d", "e", "d"], ["a", "d", "e"], ["a", "b", "b"], ["e", "e", "e"], ["b", "b", "b"]]) {
      const done = vi.fn();
      const { unmount } = render(<Host phase="revealed" initial={placement} reveal={revealFor(placement)} onRevealComplete={done} />);
      advance(1500);
      expect(done).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("a re-render with an equal reveal does not restart the clock", () => {
    const done = vi.fn();
    const { rerender } = render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    advance(700);
    rerender(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    expect(stage()).toBe("settle");
    advance(800);
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
      "2 of 3 parts right. The build is: Alpha; Beta, 2 of the 3 parts. Pieces 200 plus Fee 30 equals Test Assembly 230.");
    const text = live().textContent;
    advance(2000);
    expect(live().textContent).toBe(text);
  });

  it("gives each socket a text status for assistive tech", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(screen.getByTestId("reconstruct-slot-status-0")).toHaveTextContent("Socket 1 of 3: Alpha. Right part.");
    expect(screen.getByTestId("reconstruct-slot-status-1")).toHaveTextContent("Socket 2 of 3: Delta. Wrong part.");
    advance(450);
    expect(screen.getByTestId("reconstruct-slot-status-1")).toHaveTextContent(
      "Socket 2 of 3: Beta. Your pick, Delta, was wrong.");
  });

  it("the breakdown is stacked over the tray in the SAME fixed region; the tray stays mounted", () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    const region = screen.getByTestId("reconstruct-tray-box");
    const before = region.className;
    expect(screen.queryByTestId("reconstruct-lock")).toBeNull();
    for (const b of screen.queryAllByRole("button")) expect(b).toBeDisabled();
    advance(1050);
    expect(region.className).toBe(before);
    const ev = within(region).getByTestId("reconstruct-evidence");
    expect(ev.className).toMatch(/\babsolute inset-0\b/);
    // Not removed: hidden in place, so its removal cannot move anything.
    const trayLayer = region.querySelector("[data-part=tray-layer]")!;
    expect(trayLayer.className).toMatch(/\binvisible\b/);
    expect(trayLayer).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("reconstruct-tray")).toBeInTheDocument();
  });

  it("draws marks and tags from the reveal as stated: it never re-derives correctness", () => {
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
});

describe("Reconstruct — reduced motion", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("the first reveal frame is the settled frame: settled sockets, 'your pick', breakdown, complete", () => {
    document.documentElement.classList.add("reduce-motion");
    const done = vi.fn();
    const { container } = render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} onRevealComplete={done} />);
    expect(screen.getByTestId("mig-reconstruct")).toHaveAttribute("data-reveal-stage", "done");
    expect([0, 1, 2].map((i) => sock(i).getAttribute("data-token"))).toEqual(["a", "b", "b"]);
    expect(screen.getByTestId("reconstruct-pick-1")).toHaveAttribute("data-shown", "true");
    expect(screen.getByTestId("reconstruct-evidence-total")).toHaveTextContent("Test Assembly230");
    expect(container.querySelector(".animate-in")).toBeNull();
    expect(container.querySelector(".transition-opacity")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("carries every fact the animated reveal does", () => {
    const facts = () => {
      const t = screen.getByTestId("mig-reconstruct").textContent ?? "";
      return ["Test Assembly", "Alpha", "Beta", "Delta", "Gamma", "Your pick", "Answer", "×2", "100", "50 each",
        "+ 10 to join", "Fee", "230", "2 of 3 parts right"].filter((s) => t.includes(s));
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

  it("flipping reduced motion mid-reveal jumps straight to the settled frame", async () => {
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(screen.getByTestId("mig-reconstruct")).toHaveAttribute("data-reveal-stage", "marks");
    await act(async () => { document.documentElement.classList.add("reduce-motion"); await Promise.resolve(); });
    expect(screen.getByTestId("mig-reconstruct")).toHaveAttribute("data-reveal-stage", "done");
  });
});

// ------------------------------------------------------------------ geometry

describe("Reconstruct — R2 fixed geometry in every phase", () => {
  const boxes = () => ({
    header: screen.getByTestId("reconstruct-target").className,
    status: (screen.queryByTestId("reconstruct-hint") ?? screen.getByTestId("reconstruct-verdict")).className,
    region: screen.getByTestId("reconstruct-tray-box").className,
    regionStyle: screen.getByTestId("reconstruct-tray-box").getAttribute("style"),
    label: screen.getByTestId("reconstruct-label-0").className,
  });

  it("the header, status line, socket labels and stage region carry the same fixed boxes open, locked and revealed", () => {
    document.documentElement.classList.add("reduce-motion");
    const { unmount } = render(<Host />);
    const open = boxes();
    unmount();
    const locked = render(<Host phase="locked" initial={["a", "b", "b"]} />);
    expect(boxes()).toEqual(open);
    locked.unmount();
    render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    expect(boxes()).toEqual(open);
    expect(open.header).toMatch(/(^|\s)h-14(\s|$)/);
    expect(open.status).toMatch(/\bh-\[34px\]/);
    expect(open.label).toMatch(/\bh-\[2\.5em\]/);
    expect(open.region).toMatch(/\bh-\[var\(--rc-region-narrow\)\]/);
    expect(open.region).toMatch(/\bsm:h-\[var\(--rc-region-wide\)\]/);
    expect(open.regionStyle).toContain("--rc-region-wide: 248px");
    expect(open.regionStyle).toContain("--rc-region-wide-tall: 280px");
    expect(open.regionStyle).toContain("--rc-region-narrow: 288px");
    expect(open.region).toMatch(/sm:\[@media\(min-height:800px\)\]:h-\[var\(--rc-region-wide-tall\)\]/);
  });

  it("R2: a short desktop stage (< 720px tall) gets ONE compact size per box, in every phase", () => {
    // The owner's live jump: at 1366x650 the R1 board (478px) overflowed the
    // clipped stage body (424px); clicking Lock focused a half-hidden button,
    // Chrome scrolled the overflow:hidden stage to show it and the board
    // jumped 16px. Measured in a real browser on R1 and fixed by FITTING.
    const C = "lg:[@media(max-height:719px)]:";
    document.documentElement.classList.add("reduce-motion");
    const states = [
      () => render(<Host />),
      () => render(<Host phase="locked" initial={["a", "b", "b"]} />),
      () => render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />),
    ];
    for (const mount of states) {
      const { unmount } = mount();
      expect(screen.getByTestId("reconstruct-target").className).toContain(`${C}h-11`);
      expect(sock(0).className).toContain(`${C}h-11`);
      expect(screen.getByTestId("reconstruct-label-0").className).toContain(`${C}h-[1.25em]`);
      expect((screen.queryByTestId("reconstruct-hint") ?? screen.getByTestId("reconstruct-verdict")).className)
        .toContain(`${C}h-[30px]`);
      const region = screen.getByTestId("reconstruct-tray-box");
      expect(region.className).toContain(`${C}h-[var(--rc-region-compact)]`);
      expect(region.getAttribute("style")).toContain("--rc-region-compact: 188px");
      expect(screen.getByTestId("reconstruct-option-a").className).toContain(`${C}h-[64px]`);
      unmount();
    }
    // The budget: header 44 + sockets 64 + status 30 + region 188 + 3 gaps of
    // 8 + the host's 24px progress line = 374, the body a 600px window leaves.
    expect(44 + 64 + 30 + 188 + 3 * 8 + 24).toBe(374);
    // Every compact class is a LITERAL (Tailwind generates only what it reads).
    const src = readFileSync(resolve(__dirname, "Reconstruct.tsx"), "utf8");
    expect(src).not.toMatch(/\$\{COMPACT\}/);
  });

  it("a wrong pick, the answer tag and the marks take no layout (absolute)", () => {
    document.documentElement.classList.add("reduce-motion");
    const { container } = render(<Host phase="revealed" initial={WRONG} reveal={revealFor(WRONG)} />);
    for (const part of ["pick", "answer-tag", "mark", "annotation"]) {
      for (const n of container.querySelectorAll(`[data-part=${part}]`)) {
        expect(n.className).toMatch(/\babsolute\b/);
      }
    }
  });

  it("the reserved region fits the tray, the Lock footer and the widest breakdown", () => {
    // Wide: 2 tray rows (92 + 8 + 92) + 8 + 48 footer. The breakdown's tallest
    // block (three children) is ~164px + the 40px equation + gaps.
    expect(2 * 92 + 8 + 8 + 48).toBe(248);
    expect(164 + 8 + 40).toBeLessThanOrEqual(248);
    // Narrow (2×2 blocks): two ~118px rows + gap + the equation.
    expect(2 * 118 + 6 + 40).toBeLessThanOrEqual(288);
  });
});

describe("Reconstruct — layout at 390px", () => {
  it("the widest board (4 sockets) fits a 358px inner width (390 − 2×16 gutters)", () => {
    render(<Host content={{ ...B, slotCount: 4, options: [...B.options, { token: "f", label: "Zeta" }] }} />);
    const slot = screen.getByTestId("reconstruct-slot-0").className;
    expect(slot).toMatch(/max-w-\[76px\]/);
    expect(slot).toMatch(/\bflex-1\b/);
    expect(slot).toMatch(/\bmin-w-0\b/);
    expect(4 * 76 + 3 * 8).toBeLessThanOrEqual(358);
  });

  it("the tray is a three-column grid whose cells are at least 104px wide at 358px", () => {
    render(<Host />);
    expect(screen.getByTestId("reconstruct-tray").className).toMatch(/grid-cols-3/);
    expect((358 - 2 * 8) / 3).toBeGreaterThanOrEqual(104);
  });

  it("carries no fixed width wider than the phone, and nothing that forces horizontal scroll", () => {
    const src = readFileSync(resolve(__dirname, "Reconstruct.tsx"), "utf8");
    const widths = [...src.matchAll(/\bw-\[(\d+)px\]/g)].map((m) => Number(m[1]));
    expect(Math.max(0, ...widths)).toBeLessThanOrEqual(358);
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
    for (const part of ["target", "sockets", "slot", "socket", "stage-region", "tray", "option", "usage", "lock"]) {
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
    expect(imports).toContain("@/lib/interaction-grammar/reconstruct");
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
