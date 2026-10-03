import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  LIFT_DELAY_MS, LIFT_SLOP_PX, OrderForge, REVEAL_DWELL_MIN_MS, REVEAL_TIMING, moveToken,
} from "./OrderForge";
import { REVEAL_HOLD_MIN_MS } from "@/lib/ranked-core/pacing";
import type {
  InteractionPhase, OrderForgePublic, OrderForgeResponse, OrderForgeReveal,
} from "@/lib/interaction-grammar/types";

/**
 * OF4 — every drag start, recorded. The real `useDragControls` is kept (Reorder
 * subscribes to it); only `start` is replaced, so a test can see WHEN a press
 * becomes a drag without running framer's pan session in jsdom.
 */
const dragStarts = vi.hoisted(() => [] as { type: string; pointerType?: string }[]);
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    useDragControls: () => {
      const c = actual.useDragControls() as ReturnType<typeof actual.useDragControls> & { spied?: true };
      if (!c.spied) {
        c.spied = true;
        c.start = ((e: { type: string; pointerType?: string }) => {
          dragStarts.push({ type: e.type, pointerType: e.pointerType });
        }) as typeof c.start;
      }
      return c;
    },
  };
});

beforeAll(() => {
  // jsdom has no PointerEvent: a MouseEvent with the pointer fields is enough.
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerType: string; pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
  }
});
afterEach(() => {
  dragStarts.length = 0;
  document.documentElement.classList.remove("reduce-motion");
  vi.useRealTimers();
});

const press = (el: Element, pointerType: "mouse" | "touch" | "pen", x = 10, y = 10) =>
  el.dispatchEvent(new window.PointerEvent("pointerdown",
    { bubbles: true, cancelable: true, button: 0, pointerType, pointerId: 7, clientX: x, clientY: y }));
const windowPointer = (type: string, x = 10, y = 10) =>
  window.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: y }));

const CONTENT: OrderForgePublic = {
  prompt: "Order these items by gold cost",
  metricLabel: "Gold cost",
  directionLabels: { first: "Most expensive", last: "Cheapest" },
  entries: [
    { token: "e0", label: "Kindlegem" },
    { token: "e1", label: "Infinity Edge" },
    { token: "e2", label: "Long Sword" },
    { token: "e3", label: "Sunfire Aegis" },
    { token: "e4", label: "Zhonya's Hourglass" },
  ],
};

const REVEAL: OrderForgeReveal = {
  order: ["e3", "e0", "e4", "e1", "e2"],
  canonicalOrder: ["e2", "e0", "e3", "e4", "e1"],
  valueDisplay: { e0: "800 g", e1: "3600 g", e2: "350 g", e3: "2700 g", e4: "3250 g" },
  positionCorrect: [false, true, false, false, false],
  isCorrect: false,
};

function Harness({ phase = "open", reveal = null, onLock = () => {}, initial }: {
  phase?: InteractionPhase; reveal?: OrderForgeReveal | null;
  onLock?: (r: OrderForgeResponse) => void; initial?: string[];
}) {
  const [value, setValue] = useState<string[]>(initial ?? CONTENT.entries.map((e) => e.token));
  return (
    <OrderForge content={CONTENT} phase={phase} value={value} onChange={setValue}
      onLock={onLock} reveal={reveal} />
  );
}

const positions = () =>
  screen.getAllByTestId(/^forge-card-e\d$/).map((el) => el.getAttribute("data-testid")!.slice(-2));

describe("moveToken", () => {
  it("swaps with a neighbour and is a no-op at the ends", () => {
    expect(moveToken(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveToken(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveToken(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
    expect(moveToken(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
    expect(moveToken(["a", "b", "c"], "zzz", "down")).toEqual(["a", "b", "c"]);
  });
});

describe("OrderForge — open", () => {
  it("shows the cards in the dealt order with the direction stated both ends", () => {
    render(<Harness />);
    expect(positions()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(screen.getByTestId("forge-rail-first")).toHaveTextContent("Most expensive");
    expect(screen.getByTestId("forge-rail-last")).toHaveTextContent("Cheapest");
    expect(screen.getByTestId("forge-prompt")).toHaveTextContent("Order these items by gold cost");
  });

  it("reorders with the up / down buttons and announces the move", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    expect(positions()).toEqual(["e1", "e0", "e2", "e3", "e4"]);
    expect(screen.getByTestId("forge-live")).toHaveTextContent("Kindlegem moved to position 2 of 5");
    fireEvent.click(screen.getByTestId("forge-up-e4"));
    expect(positions()).toEqual(["e1", "e0", "e2", "e4", "e3"]);
  });

  it("disables up on the first card and down on the last", () => {
    render(<Harness />);
    expect(screen.getByTestId("forge-up-e0")).toBeDisabled();
    expect(screen.getByTestId("forge-down-e4")).toBeDisabled();
    expect(screen.getByTestId("forge-down-e0")).toBeEnabled();
  });

  it("reorders from the keyboard on the grip handle", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId("forge-grip-e2"), { key: "ArrowUp" });
    expect(positions()).toEqual(["e0", "e2", "e1", "e3", "e4"]);
    fireEvent.keyDown(screen.getByTestId("forge-grip-e2"), { key: "ArrowDown" });
    expect(positions()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
  });

  it("keeps focus on the control that moved the card, so a key can be pressed again", () => {
    // OF1-C: an arrow key on the grip used to hand focus to the up/down
    // button, and the next arrow key then did nothing.
    render(<Harness />);
    const grip = screen.getByTestId("forge-grip-e0");
    grip.focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("forge-grip-e0"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(positions()).toEqual(["e1", "e2", "e0", "e3", "e4"]);
    expect(document.activeElement).toBe(screen.getByTestId("forge-grip-e0"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(positions()).toEqual(["e1", "e0", "e2", "e3", "e4"]);
    // A button press keeps focus on that button...
    screen.getByTestId("forge-up-e0").focus();
    fireEvent.click(screen.getByTestId("forge-up-e0"));
    expect(positions()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    // ...until the card reaches an end and the button disables: then its grip.
    expect(document.activeElement).toBe(screen.getByTestId("forge-grip-e0"));
  });

  it("gives every control an accessible name and a 44px target", () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Move Long Sword up \(currently position 3 of 5\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Drag Long Sword, position 3 of 5/)).toBeInTheDocument();
    for (const id of ["forge-up-e1", "forge-down-e1", "forge-grip-e1"]) {
      expect(screen.getByTestId(id).className).toMatch(/h-11 w-11/);
    }
  });

  it("locks the CURRENT order, exactly once per press, as `{order}`", () => {
    const onLock = vi.fn();
    render(<Harness onLock={onLock} />);
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledWith({ order: ["e1", "e0", "e2", "e3", "e4"] });
  });

  it("allows locking the untouched order (no local judgement about it)", () => {
    const onLock = vi.fn();
    render(<Harness onLock={onLock} />);
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(onLock).toHaveBeenCalledWith({ order: ["e0", "e1", "e2", "e3", "e4"] });
  });

  it("never draws a value, rank claim or verdict before the reveal", () => {
    const { container } = render(<Harness />);
    expect(container.textContent).not.toMatch(/\bg\b|800|3600|350|Exactly right|Not quite|Correct order/);
    expect(screen.queryByTestId("forge-reveal")).toBeNull();
  });
});

describe("OrderForge — OF4 whole-card drag", () => {
  const nameOf = (token: string) => within(screen.getByTestId(`forge-card-${token}`)).getByText(
    CONTENT.entries.find((e) => e.token === token)!.label);

  it("keeps page scroll: only the grip has touch-action:none, never the card or the list", () => {
    render(<Harness />);
    expect(screen.getByTestId("forge-grip-e1").style.touchAction).toBe("none");
    expect(screen.getByTestId("forge-card-e1").style.touchAction).not.toBe("none");
    expect(screen.getByTestId("forge-up-e1").style.touchAction).not.toBe("none");
    expect(screen.getByTestId("forge-list").style.touchAction).not.toBe("none");
  });

  it("keeps the slot numbers fixed: a moved card takes the slot, the numeral stays", () => {
    render(<Harness />);
    const slots = () => screen.getAllByTestId(/^forge-slot-\d$/).map((e) => e.textContent);
    expect(slots()).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    expect(slots()).toEqual(["1", "2", "3", "4", "5"]);
    expect(screen.getByTestId("forge-card-e0")).toHaveAttribute("data-position", "2");
  });

  it("a mouse press ANYWHERE on the card starts the drag at once", () => {
    render(<Harness />);
    press(nameOf("e2"), "mouse");
    expect(dragStarts).toHaveLength(1);
    press(screen.getByTestId("forge-card-e3"), "mouse");
    expect(dragStarts).toHaveLength(2);
    expect(dragStarts[0].type).toBe("pointerdown");
  });

  it("the arrow buttons stay buttons: pressing them never starts a drag, and they still move", () => {
    render(<Harness />);
    press(screen.getByTestId("forge-down-e0"), "mouse");
    press(screen.getByTestId("forge-up-e3"), "touch");
    expect(dragStarts).toHaveLength(0);
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    expect(positions()).toEqual(["e1", "e0", "e2", "e3", "e4"]);
  });

  it("touch: the card lifts only after a still hold, then drags", () => {
    vi.useFakeTimers();
    render(<Harness />);
    press(nameOf("e2"), "touch");
    expect(dragStarts).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(LIFT_DELAY_MS - 10); });
    expect(dragStarts).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(20); });
    expect(dragStarts).toHaveLength(1);
    expect(screen.getByTestId("forge-card-e2")).toHaveAttribute("data-lifted", "true");
    act(() => { windowPointer("pointerup"); });
    expect(screen.getByTestId("forge-card-e2")).not.toHaveAttribute("data-lifted");
  });

  it("touch: moving before the hold is a page scroll and never becomes a drag", () => {
    vi.useFakeTimers();
    render(<Harness />);
    press(nameOf("e2"), "touch", 10, 100);
    act(() => { windowPointer("pointermove", 10, 100 - LIFT_SLOP_PX - 4); });
    act(() => { vi.advanceTimersByTime(LIFT_DELAY_MS * 3); });
    expect(dragStarts).toHaveLength(0);
    expect(screen.getByTestId("forge-card-e2")).not.toHaveAttribute("data-lifted");
  });

  it("touch: a jitter inside the slop still lifts", () => {
    vi.useFakeTimers();
    render(<Harness />);
    press(nameOf("e1"), "pen", 10, 100);
    act(() => { windowPointer("pointermove", 12, 103); });
    act(() => { vi.advanceTimersByTime(LIFT_DELAY_MS + 5); });
    expect(dragStarts).toHaveLength(1);
  });

  it("touch on the grip lifts at once (the grip alone cannot scroll the page)", () => {
    render(<Harness />);
    press(screen.getByTestId("forge-grip-e4"), "touch");
    expect(dragStarts).toHaveLength(1);
  });

  it("cancels the page scroll only while a card is lifted", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const list = screen.getByTestId("forge-list");
    const swipe = () => {
      const ev = new Event("touchmove", { bubbles: true, cancelable: true });
      list.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(swipe()).toBe(false);
    press(nameOf("e0"), "touch");
    act(() => { vi.advanceTimersByTime(LIFT_DELAY_MS + 5); });
    expect(swipe()).toBe(true);
    act(() => { windowPointer("pointerup"); });
    expect(swipe()).toBe(false);
  });

  it("starts nothing once locked (no draggable card is left)", () => {
    render(<Harness phase="locked" />);
    for (const row of screen.getAllByTestId(/^forge-locked-e\d$/)) press(row, "mouse");
    expect(dragStarts).toHaveLength(0);
  });
});

describe("OrderForge — locked", () => {
  it("shows the locked sequence, no controls, no lock button", () => {
    render(<Harness phase="locked" initial={["e3", "e0", "e4", "e1", "e2"]} />);
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    expect(screen.queryByTestId("forge-grip-e0")).toBeNull();
    expect(screen.queryByTestId("forge-up-e0")).toBeNull();
    const rows = screen.getAllByTestId(/^forge-locked-e\d$/);
    expect(rows.map((r) => r.getAttribute("data-testid")!.slice(-2))).toEqual(
      ["e3", "e0", "e4", "e1", "e2"]);
    expect(screen.getByTestId("forge-suspense")).toBeInTheDocument();
    expect(screen.getByTestId("forge-live")).toHaveTextContent(/locked in/i);
  });

  it("ignores a lock press that arrives after locking", () => {
    const onLock = vi.fn();
    render(<Harness phase="locked" onLock={onLock} />);
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    expect(onLock).not.toHaveBeenCalled();
  });
});

const rowsOf = () => screen.getAllByTestId(/^forge-reveal-e\d$/);
const tokensOf = () => rowsOf().map((r) => r.getAttribute("data-testid")!.slice(-2));

/** Locked first, then the authority's reveal arrives: the reveal plays. */
function LiveReveal({ reveal = REVEAL }: { reveal?: OrderForgeReveal }) {
  const [phase, setPhase] = useState<InteractionPhase>("locked");
  return (
    <>
      <button type="button" data-testid="go" onClick={() => setPhase("revealed")}>go</button>
      <OrderForge content={CONTENT} phase={phase} value={reveal.order} onChange={() => {}}
        onLock={() => {}} reveal={phase === "revealed" ? reveal : null} />
    </>
  );
}

describe("OrderForge — revealed (settled: mounted on an existing reveal)", () => {
  it("shows the CANONICAL order with every authority value, verbatim", () => {
    render(<Harness phase="revealed" reveal={REVEAL} />);
    const box = screen.getByTestId("forge-reveal");
    expect(box).toHaveAttribute("data-step", "assembled");
    expect(box).toHaveAttribute("data-motion", "settled");
    expect(tokensOf()).toEqual(REVEAL.canonicalOrder);
    for (const t of REVEAL.canonicalOrder) {
      expect(screen.getByTestId(`forge-reveal-${t}-value`)).toHaveTextContent(REVEAL.valueDisplay[t]);
    }
    expect(screen.getByTestId("forge-reveal-step")).toHaveTextContent("Correct order");
  });

  it("each card keeps the slot the player gave it and the mark the authority gave that slot", () => {
    render(<Harness phase="revealed" reveal={REVEAL} />);
    // Player: e3,e0,e4,e1,e2 with marks F,T,F,F,F.
    expect(screen.getByTestId("forge-reveal-e0")).toHaveAttribute("data-mark", "right");
    expect(screen.getByTestId("forge-reveal-e0")).toHaveAttribute("data-yours", "2");
    expect(screen.getByTestId("forge-reveal-e3")).toHaveAttribute("data-mark", "wrong");
    expect(screen.getByTestId("forge-reveal-e3")).toHaveAttribute("data-yours", "1");
    // The mistake and its fix side by side: e2 was 5th, belongs 1st, travelled up.
    expect(screen.getByTestId("forge-reveal-e2")).toHaveAttribute("data-position", "1");
    expect(screen.getByTestId("forge-reveal-e2")).toHaveAttribute("data-moved", "up");
    expect(screen.getByTestId("forge-reveal-e2-from")).toHaveTextContent(/was 5/i);
    expect(screen.getByTestId("forge-reveal-e1")).toHaveAttribute("data-moved", "down");
    // A right card gets no "was" note.
    expect(screen.queryByTestId("forge-reveal-e0-from")).toBeNull();
    // ...and each says it in words for a screen reader.
    expect(screen.getByTestId("forge-reveal-e3")).toHaveTextContent("You placed it at 1: wrong.");
    expect(screen.getByTestId("forge-reveal-e0")).toHaveTextContent("You placed it here: right.");
  });

  it("marks come from positionCorrect and are never recomputed", () => {
    render(<Harness phase="revealed" reveal={{ ...REVEAL, positionCorrect: [true, true, true, true, true] }} />);
    // Inconsistent with the two orders, drawn as stated.
    expect(screen.getByTestId("forge-reveal-e3")).toHaveAttribute("data-mark", "right");
  });

  it("draws no marks when the authority stated none, and no partial-credit text", () => {
    const { container } = render(
      <Harness phase="revealed" reveal={{ ...REVEAL, positionCorrect: [], isCorrect: null }} />);
    expect(screen.getByTestId("forge-reveal-e0")).toHaveAttribute("data-mark", "neutral");
    expect(screen.queryByTestId("forge-reveal-e0-mark")).toBeNull();
    expect(screen.queryByTestId("forge-verdict")).toBeNull();
    expect(container.textContent).not.toMatch(/partial|\d+\s*\/\s*\d+|points?\b/i);
  });

  it("states the server verdict in words", () => {
    render(<Harness phase="revealed" reveal={{ ...REVEAL, isCorrect: true }} />);
    expect(screen.getByTestId("forge-verdict")).toHaveTextContent("Exactly right");
  });

  it("announces the canonical order with its values", () => {
    render(<Harness phase="revealed" reveal={REVEAL} />);
    expect(screen.getByTestId("forge-live")).toHaveTextContent(
      "Revealed. Your order was not the correct order. Correct order: 1, Long Sword, 350 g; 2, Kindlegem, 800 g;");
  });
});

describe("OrderForge — revealed live (OF4 teaching reveal)", () => {
  it("first shows the player's own order with values and marks, then assembles the canonical order", () => {
    vi.useFakeTimers();
    render(<LiveReveal />);
    fireEvent.click(screen.getByTestId("go"));
    const box = screen.getByTestId("forge-reveal");
    expect(box).toHaveAttribute("data-step", "mine");
    expect(box).toHaveAttribute("data-motion", "full");
    expect(screen.getByTestId("forge-reveal-step")).toHaveTextContent("Your order");
    expect(tokensOf()).toEqual(REVEAL.order);
    expect(screen.getByTestId("forge-reveal-e3-value")).toHaveTextContent("2700 g");
    expect(screen.getByTestId("forge-reveal-e3-mark")).toBeInTheDocument();
    expect(screen.queryByTestId("forge-reveal-e3-from")).toBeNull();
    act(() => { vi.advanceTimersByTime(REVEAL_TIMING.assembleAtMs); });
    expect(box).toHaveAttribute("data-step", "assembled");
    expect(tokensOf()).toEqual(REVEAL.canonicalOrder);
    expect(screen.getByTestId("forge-reveal-e3-from")).toHaveTextContent(/was 1/i);
    expect(screen.getByTestId("forge-reveal-step")).toHaveTextContent("Correct order");
  });

  it("the locked rows ARE the reveal rows: same DOM nodes, no remount", () => {
    render(<LiveReveal />);
    const before = screen.getAllByTestId(/^forge-locked-e\d$/);
    fireEvent.click(screen.getByTestId("go"));
    const after = REVEAL.order.map((t) => screen.getByTestId(`forge-reveal-${t}`));
    after.forEach((el, i) => expect(el).toBe(before[i]));
  });

  it("OF4-FIX1: lands, and then dwells, inside the SHORTEST reveal the arena may give (900ms)", () => {
    // `anchoredRevealHoldMs` may shorten an ordinary reveal to REVEAL_HOLD_MIN_MS
    // when settlement is discovered late. 900, not the nominal 1500, is the budget.
    expect(REVEAL_HOLD_MIN_MS).toBe(900);
    const landed = REVEAL_TIMING.assembleAtMs + REVEAL_TIMING.moveMs;
    expect(REVEAL_TIMING.settleAtMs).toBe(landed);
    // The finished, correct order stays up for a readable beat before the release.
    expect(REVEAL_HOLD_MIN_MS - landed).toBeGreaterThanOrEqual(REVEAL_DWELL_MIN_MS);
    // The "was N" notes (150ms fade) are complete well before the release too.
    expect(landed + 150).toBeLessThan(REVEAL_HOLD_MIN_MS - REVEAL_DWELL_MIN_MS / 2);
    // Values and marks (last card's stagger + mark lag + fade) are in before the move starts.
    expect(REVEAL_TIMING.valueStaggerMs * 4 + REVEAL_TIMING.markLagMs + REVEAL_TIMING.valueFadeMs)
      .toBeLessThanOrEqual(REVEAL_TIMING.assembleAtMs + REVEAL_TIMING.moveMs / 2);
    // The player has the locked order, with values, on screen before the cards move.
    expect(REVEAL_TIMING.assembleAtMs).toBeGreaterThanOrEqual(200);
  });

  it("reduced motion (in-app setting): the settled canonical order at once", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<LiveReveal />);
    fireEvent.click(screen.getByTestId("go"));
    const box = screen.getByTestId("forge-reveal");
    expect(box).toHaveAttribute("data-step", "assembled");
    expect(box).toHaveAttribute("data-motion", "reduced");
    expect(tokensOf()).toEqual(REVEAL.canonicalOrder);
    for (const t of REVEAL.canonicalOrder) {
      expect(screen.getByTestId(`forge-reveal-${t}-value`)).toHaveTextContent(REVEAL.valueDisplay[t]);
    }
    expect(screen.getByTestId("forge-reveal-e2-from")).toHaveTextContent(/was 5/i);
  });

  it("nothing of the answer exists before the reveal boundary", () => {
    const { container } = render(<LiveReveal />);
    expect(screen.queryByTestId("forge-reveal")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+ g\b|Correct order|was \d/);
    expect(container.querySelector("[data-yours], [data-moved]")).toBeNull();
  });
});

describe("OrderForge — OF4 one footprint", () => {
  const ROW = "h-14 md:h-[60px] lg:h-[52px] lg:[@media(min-height:860px)]:h-[76px]";
  it("open, locked and revealed rows share the same fixed height classes", () => {
    const r1 = render(<Harness />);
    expect(screen.getByTestId("forge-card-e0").className).toContain(ROW);
    r1.unmount();
    const r2 = render(<Harness phase="locked" />);
    expect(screen.getByTestId("forge-locked-e0").className).toContain(ROW);
    r2.unmount();
    render(<Harness phase="revealed" reveal={REVEAL} />);
    expect(screen.getByTestId("forge-reveal-e0").className).toContain(ROW);
  });

  it("the hint line and the footer exist in every phase (no line appears or vanishes)", () => {
    for (const phase of ["open", "locked", "revealed"] as const) {
      const { unmount } = render(<Harness phase={phase} reveal={phase === "revealed" ? REVEAL : null} />);
      expect(screen.getByTestId("forge-hint").textContent).not.toBe("");
      // OF4-CONTINUITY: 4.5rem holds the open footer (48 + 8 + a 16px line), so
      // the lock no longer shrinks it.
      expect(screen.getByTestId("forge-footer").className).toContain("min-h-[4.5rem]");
      unmount();
    }
  });
});

/** Open -> locked -> revealed on ONE mount, the way a match plays it. */
function Lifecycle() {
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [value, setValue] = useState<string[]>([...REVEAL.order]);
  return (
    <>
      <button type="button" data-testid="to-locked" onClick={() => setPhase("locked")}>lock</button>
      <button type="button" data-testid="to-revealed" onClick={() => setPhase("revealed")}>reveal</button>
      <OrderForge content={CONTENT} phase={phase} value={value} onChange={setValue}
        onLock={() => {}} reveal={phase === "revealed" ? REVEAL : null} />
    </>
  );
}

describe("OrderForge — OF4-CONTINUITY one row", () => {
  const TRAIL_W = "w-[8.5rem] sm:w-[9.5rem] md:w-[11.5rem]";
  const rowFor = (t: string) => screen.getByTestId(new RegExp(`^forge-(card|locked|reveal)-${t}$`));
  const parts = (t: string) => {
    const row = rowFor(t);
    const [art, label, trail] = [...row.children] as HTMLElement[];
    return { row, art, label, trail, list: row.parentElement!, rail: row.parentElement!.previousElementSibling! };
  };

  it("open, locked and revealed are the SAME row, art, label and trailing slot (no remount at the lock)", () => {
    vi.useFakeTimers();
    render(<Lifecycle />);
    const open = Object.fromEntries(REVEAL.order.map((t) => [t, parts(t)]));
    fireEvent.click(screen.getByTestId("to-locked"));
    for (const t of REVEAL.order) {
      const now = parts(t);
      expect(now.row).toHaveAttribute("data-testid", `forge-locked-${t}`);
      for (const k of ["row", "art", "label", "trail", "list", "rail"] as const) expect(now[k]).toBe(open[t][k]);
    }
    fireEvent.click(screen.getByTestId("to-revealed"));
    act(() => { vi.advanceTimersByTime(REVEAL_TIMING.settleAtMs + 50); });
    expect(tokensOf()).toEqual(REVEAL.canonicalOrder);
    for (const t of REVEAL.order) {
      const now = parts(t);
      expect(now.row).toHaveAttribute("data-testid", `forge-reveal-${t}`);
      for (const k of ["row", "art", "label", "trail", "list", "rail"] as const) expect(now[k]).toBe(open[t][k]);
    }
  });

  it("the trailing slot keeps one width in every phase: controls, then nothing, then value and mark", () => {
    vi.useFakeTimers();
    render(<Lifecycle />);
    const trail = () => screen.getByTestId("forge-trail-e3");
    expect(trail().className).toContain(TRAIL_W);
    expect(within(trail()).getByTestId("forge-grip-e3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("to-locked"));
    expect(trail().className).toContain(TRAIL_W);
    expect(trail().children).toHaveLength(0);
    fireEvent.click(screen.getByTestId("to-revealed"));
    expect(trail().className).toContain(TRAIL_W);
    expect(within(trail()).getByTestId("forge-reveal-e3-value")).toHaveTextContent("2700 g");
    expect(within(trail()).getByTestId("forge-reveal-e3-mark")).toBeInTheDocument();
    // The label is the only flexible box, and nothing else in the row grows.
    expect(parts("e3").label.className).toContain("flex-1");
    expect(trail().className).toContain("shrink-0");
  });

  it("the same row stops dragging once locked", () => {
    render(<Lifecycle />);
    const row = rowFor("e0");
    press(row, "mouse");
    expect(dragStarts).toHaveLength(1);
    fireEvent.click(screen.getByTestId("to-locked"));
    expect(rowFor("e0")).toBe(row);
    press(row, "mouse");
    expect(dragStarts).toHaveLength(1);
    expect(screen.queryByTestId("forge-up-e0")).toBeNull();
  });

  it("reserves the prompt's two lines below lg, so a one- and a two-line round have one height", () => {
    render(<Harness />);
    const cls = screen.getByTestId("forge-prompt").className;
    expect(cls).toContain("min-h-[2.75em]");
    expect(cls).toContain("lg:min-h-0");
  });
});

describe("OrderForge — source contract", () => {
  const src = readFileSync(resolve(__dirname, "OrderForge.tsx"), "utf8");
  it("never grades: the reveal's order is never compared with the canonical one", () => {
    expect(src).not.toMatch(/canonicalOrder\s*[!=]==/);
    expect(src).not.toMatch(/positionCorrect\.(every|some|filter)/);
  });
  it("starts the drag itself (framer's own listener would set touch-action:none on the card)", () => {
    expect(src).toContain("dragListener={false}");
    expect(src).toContain("controls.start(native)");
  });
});

describe("OrderForge F1 layout", () => {
  it("keeps the wider desktop stack and big-desktop tier as literal classes", () => {
    render(<OrderForge content={CONTENT} phase="open" value={[]} onChange={() => {}} onLock={() => {}} />);
    expect(screen.getByTestId("forge-list").closest("[data-state]")!.className).toContain("xl:max-w-[52rem]");
    expect(screen.getByTestId("forge-lock").className).toContain("lg:[@media(min-height:860px)]:min-h-[56px]");
    expect(screen.getByTestId("forge-slot-1").className).toContain("rounded-full");
  });
});
