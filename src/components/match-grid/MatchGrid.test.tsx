import { readFileSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MatchGrid } from "./MatchGrid";
import type { MatchPublic, MatchResponse, MatchReveal, MatchValue } from "@/lib/match-grid/contract";

// ---------------------------------------------------------------- jsdom shims
beforeAll(() => {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventShim extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
  }
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.useRealTimers();
});

// ---------------------------------------------------------------- fixture (neutral: no League words)
const content: MatchPublic = {
  prompt: "Seat each sigil in its discipline.",
  context: "Lab · three disciplines",
  entityNoun: "sigil",
  groupNoun: "discipline",
  membership: "one",
  groups: [
    { token: "d0", label: "Alpha", hue: 44 },
    { token: "d1", label: "Beta", hue: 200 },
    { token: "d2", label: "Gamma", hue: 300 },
  ],
  entities: [
    { token: "s0", label: "Ash" }, { token: "s1", label: "Bell" }, { token: "s2", label: "Cinder" },
    { token: "s3", label: "Dusk" }, { token: "s4", label: "Ember" }, { token: "s5", label: "Fern" },
  ],
};

/** The host: owns value/phase/reveal exactly as a Ranked module would. */
function Host({ initial = {}, reveal = null, onLock, onRevealComplete, locked = false }: {
  initial?: MatchValue;
  reveal?: MatchReveal | null;
  onLock?: (r: MatchResponse) => void;
  onRevealComplete?: () => void;
  locked?: boolean;
}) {
  const [value, setValue] = useState<MatchValue>(initial);
  const [phase, setPhase] = useState<"open" | "locked">(locked ? "locked" : "open");
  return (
    <MatchGrid
      content={content}
      phase={reveal ? "revealed" : phase}
      value={value}
      onChange={setValue}
      onLock={(r) => { setPhase("locked"); onLock?.(r); }}
      reveal={reveal}
      onRevealComplete={onRevealComplete}
    />
  );
}

const sigil = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}\\b`) });
const seal = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label},`) });
const lockButton = () => screen.getByRole("button", { name: /lock in|locked in|resolved/i });

/** jsdom has no layout: the primitive falls back to a 960px board, so group columns are 320px wide. */
const COLUMN = 960 / 3;
const pointer = (type: string, el: Element, x: number, y: number, extra: PointerEventInit = {}) =>
  fireEvent(el, new window.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: "mouse", ...extra }));

function drag(el: Element, from: [number, number], to: [number, number], pointerType = "mouse") {
  pointer("pointerdown", el, from[0], from[1], { pointerType });
  pointer("pointermove", el, from[0] + 6, from[1] + 6, { pointerType });
  pointer("pointermove", el, to[0], to[1], { pointerType });
  pointer("pointerup", el, to[0], to[1], { pointerType });
}

// ---------------------------------------------------------------- tests

describe("MatchGrid — open board", () => {
  it("draws every sigil unsorted, every seal empty, and keeps Lock disabled", () => {
    render(<Host />);
    for (const e of content.entities) expect(sigil(e.label)).toHaveAccessibleName(new RegExp("Unsorted, in the well"));
    for (const g of content.groups) expect(seal(g.label)).toHaveAccessibleName(/Holds zero/);
    expect(lockButton()).toBeDisabled();
    expect(screen.getByText(/six sigils unsorted/)).toBeInTheDocument();
  });

  it("refuses the reserved many-valued membership rather than falsify it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<MatchGrid content={{ ...content, membership: "many" as "one" }} phase="open" value={{}} onChange={() => {}} onLock={() => {}} reveal={null} />)).toThrow(/reserved/);
    spy.mockRestore();
  });
});

describe("MatchGrid — direct assignment", () => {
  it("a digit on a focused sigil seats it in that discipline (one action per sigil)", () => {
    render(<Host />);
    fireEvent.keyDown(sigil("Ash"), { key: "2" });
    expect(sigil("Ash")).toHaveAccessibleName(/In Beta/);
    expect(seal("Beta")).toHaveAccessibleName(/Holds one: Ash/);
    expect(screen.getByRole("status")).toHaveTextContent("Ash seated in Beta. Beta holds one.");
  });

  it("tap a sigil, then tap a seal", () => {
    render(<Host />);
    const ash = sigil("Ash");
    pointer("pointerdown", ash, 10, 10);
    pointer("pointerup", ash, 10, 10);
    expect(ash).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('[data-part="status"]')).toHaveTextContent(/Holding Ash/);
    fireEvent.click(seal("Gamma"));
    expect(sigil("Ash")).toHaveAccessibleName(/In Gamma/);
    expect(sigil("Ash")).toHaveAttribute("aria-pressed", "false");
  });

  it("Enter holds a sigil; arrows walk the seals; Enter on a seal seats it", () => {
    render(<Host />);
    const bell = sigil("Bell");
    pointer("pointerdown", bell, 10, 10);
    pointer("pointerup", bell, 10, 10);
    const alpha = seal("Alpha");
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(document.activeElement).toBe(seal("Beta"));
    fireEvent.keyDown(seal("Beta"), { key: "Enter" });
    expect(sigil("Bell")).toHaveAccessibleName(/In Beta/);
  });
});

describe("MatchGrid — drag", () => {
  it("drag begins immediately on the mouse and drops into the nearest column", () => {
    render(<Host />);
    drag(sigil("Cinder"), [40, 400], [COLUMN * 2.5, 80]);
    expect(sigil("Cinder")).toHaveAccessibleName(/In Gamma/);
  });

  it("a near miss below the seals still lands (forgiving destinations)", () => {
    render(<Host />);
    const board = document.querySelector<HTMLElement>('[data-part="board"]')!;
    const instr = Number.parseFloat(board.style.getPropertyValue("--mg-instr"));
    drag(sigil("Dusk"), [40, 400], [COLUMN * 0.5, instr + 20]);
    expect(sigil("Dusk")).toHaveAccessibleName(/In Alpha/);
  });

  it("a touch swipe before the hold is a scroll, not a drag", () => {
    render(<Host />);
    const ember = sigil("Ember");
    pointer("pointerdown", ember, 40, 400, { pointerType: "touch" });
    pointer("pointermove", ember, 40, 360, { pointerType: "touch" });
    pointer("pointerup", ember, 40, 200, { pointerType: "touch" });
    expect(sigil("Ember")).toHaveAccessibleName(/Unsorted/);
    expect(sigil("Ember")).toHaveAttribute("aria-pressed", "false");
  });

  it("dropping a seated sigil back on the well returns it", () => {
    render(<Host initial={{ s0: { group: "d0", seat: 0 } }} />);
    const board = document.querySelector<HTMLElement>('[data-part="board"]')!;
    const instr = Number.parseFloat(board.style.getPropertyValue("--mg-instr"));
    drag(sigil("Ash"), [COLUMN * 0.5, 60], [480, instr + 60]);
    expect(sigil("Ash")).toHaveAccessibleName(/Unsorted/);
  });
});

describe("MatchGrid — revision before Lock", () => {
  it("a sigil moves cleanly between disciplines and never sits in two at once", () => {
    render(<Host />);
    fireEvent.keyDown(sigil("Ash"), { key: "1" });
    fireEvent.keyDown(sigil("Ash"), { key: "3" });
    expect(seal("Alpha")).toHaveAccessibleName(/Holds zero/);
    expect(seal("Gamma")).toHaveAccessibleName(/Holds one: Ash/);
    expect(screen.getByRole("status")).toHaveTextContent("Ash moved from Alpha to Gamma.");
  });

  it("Delete returns a seated sigil to the well", () => {
    render(<Host initial={{ s1: { group: "d1", seat: 0 } }} />);
    fireEvent.keyDown(sigil("Bell"), { key: "Delete" });
    expect(sigil("Bell")).toHaveAccessibleName(/Unsorted/);
    expect(screen.getByRole("status")).toHaveTextContent("Bell returned to the well from Beta.");
  });
});

describe("MatchGrid — Lock", () => {
  it("enables only on a complete map and submits identity in dealt order, seats stripped", () => {
    const onLock = vi.fn();
    render(<Host onLock={onLock} />);
    const plan: Record<string, string> = { s0: "1", s1: "2", s2: "3", s3: "1", s4: "2" };
    for (const [t, k] of Object.entries(plan)) fireEvent.keyDown(sigil(content.entities.find((e) => e.token === t)!.label), { key: k });
    expect(lockButton()).toBeDisabled();
    fireEvent.keyDown(sigil("Fern"), { key: "3" });
    expect(lockButton()).toBeEnabled();
    fireEvent.click(lockButton());
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock.mock.calls[0][0]).toEqual({
      assignments: [
        { entity: "s0", group: "d0" }, { entity: "s1", group: "d1" }, { entity: "s2", group: "d2" },
        { entity: "s3", group: "d0" }, { entity: "s4", group: "d1" }, { entity: "s5", group: "d2" },
      ],
    });
    expect(screen.getByText(/Locked in · waiting/)).toBeInTheDocument();
    // Locked: nothing moves any more.
    fireEvent.keyDown(sigil("Ash"), { key: "2" });
    expect(sigil("Ash")).toHaveAccessibleName(/In Alpha/);
  });
});

describe("MatchGrid — no answer leakage", () => {
  it("before the reveal the DOM carries no mark, no verdict word and no canonical data", () => {
    render(<Host initial={{ s0: { group: "d2", seat: 0 }, s1: { group: "d0", seat: 0 } }} />);
    expect(document.querySelectorAll("[data-mark]")).toHaveLength(0);
    expect(document.querySelector('[data-part="ledger"]')).toBeNull();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/canonical|correct|misplaced|wrong/i);
    // Every seal offers itself identically while a sigil is held.
    pointer("pointerdown", sigil("Cinder"), 10, 10);
    pointer("pointerup", sigil("Cinder"), 10, 10);
    const armed = content.groups.map((g) => seal(g.label).getAttribute("data-armed"));
    expect(new Set(armed).size).toBe(1);
  });

  it("the primitive and its helpers import no grader and no domain", () => {
    const component = readFileSync(path.join(process.cwd(), "src/components/match-grid/MatchGrid.tsx"), "utf8");
    const board = readFileSync(path.join(process.cwd(), "src/lib/match-grid/board.ts"), "utf8");
    for (const src of [component, board]) {
      expect(src).not.toMatch(/runeAuthority|gradeRuneRound|RUNE_PERKS/);
      expect(src).not.toMatch(/\b(rune|champion|keystone|league|precision|domination|sorcery|resolve|inspiration)\b/i);
    }
    // Correctness is only ever READ from the reveal, never compared against the board.
    expect(component).not.toMatch(/canonical\[[^\]]+\]\s*===|===\s*reveal\.canonical/);
  });
});

// ---------------------------------------------------------------- reveal

const lockedValue: MatchValue = {
  s0: { group: "d0", seat: 0 }, s1: { group: "d0", seat: 1 }, s2: { group: "d1", seat: 0 },
  s3: { group: "d1", seat: 1 }, s4: { group: "d2", seat: 0 }, s5: { group: "d2", seat: 1 },
};
/** The authority says s1 belongs to Gamma and s4 to Alpha. */
const wrongReveal: MatchReveal = {
  assignments: { s0: "d0", s1: "d0", s2: "d1", s3: "d1", s4: "d2", s5: "d2" },
  canonical: { s0: ["d0"], s1: ["d2"], s2: ["d1"], s3: ["d1"], s4: ["d0"], s5: ["d2"] },
  entityCorrect: { s0: true, s1: false, s2: true, s3: true, s4: false, s5: true },
  isCorrect: false,
  facts: { s1: [{ label: "Slot", value: "Minor" }], s4: [{ label: "Slot", value: "Keystone" }] },
  source: "Lab authority",
};

describe("MatchGrid — reveal", () => {
  it("stages marks, travel and ledger from the authority's reveal, then reports completion once", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    render(<Host initial={lockedValue} reveal={wrongReveal} onRevealComplete={done} />);
    const root = document.querySelector('[data-mig-primitive="match-grid"]')!;
    expect(root).toHaveAttribute("data-reveal-stage", "freeze");
    expect(document.querySelectorAll("[data-mark]")).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(330); });
    expect(root).toHaveAttribute("data-reveal-stage", "marks");
    expect(sigil("Ash")).toHaveAttribute("data-mark", "stable");
    expect(sigil("Bell")).toHaveAttribute("data-mark", "fractured");
    expect(sigil("Bell")).toHaveAccessibleName(/In Alpha\. Misplaced/);

    act(() => { vi.advanceTimersByTime(450); });
    expect(root).toHaveAttribute("data-reveal-stage", "travel");
    expect(sigil("Bell")).toHaveAttribute("data-mark", "corrected");
    expect(sigil("Bell")).toHaveAccessibleName(/Moved to Gamma/);
    expect(sigil("Ember")).toHaveAccessibleName(/Moved to Alpha/);
    // Ember left Gamma for Alpha; Bell arrived in the seat Ember freed, Fern kept its own.
    expect(seal("Gamma")).toHaveAccessibleName(/Holds two: Bell, Fern/);
    expect(seal("Alpha")).toHaveAccessibleName(/Holds two: Ash, Ember/);
    expect(document.querySelector('[data-part="ledger"]')).not.toHaveAttribute("data-shown");

    act(() => { vi.advanceTimersByTime(600); });
    expect(root).toHaveAttribute("data-reveal-stage", "ledger");
    const ledger = document.querySelector('[data-part="ledger"]')!;
    expect(ledger).toHaveAttribute("data-shown");
    expect(ledger).toHaveTextContent("two corrected");
    expect(ledger).toHaveTextContent("four of six relationships stable");
    expect(ledger).toHaveTextContent("Bell");
    expect(ledger).toHaveTextContent("Gamma");
    expect(ledger).toHaveTextContent("was in Alpha");
    expect(ledger).toHaveTextContent("Lab authority");
    expect(done).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(root).toHaveAttribute("data-reveal-stage", "done");
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("four of six relationships stable. Bell belongs to Gamma, not Alpha. Ember belongs to Alpha, not Gamma.");
  });

  it("a fully correct board resolves without travel and lists the finished classification", () => {
    vi.useFakeTimers();
    const right: MatchReveal = {
      ...wrongReveal,
      canonical: { s0: ["d0"], s1: ["d0"], s2: ["d1"], s3: ["d1"], s4: ["d2"], s5: ["d2"] },
      entityCorrect: { s0: true, s1: true, s2: true, s3: true, s4: true, s5: true },
      isCorrect: true,
    };
    render(<Host initial={lockedValue} reveal={right} />);
    act(() => { vi.advanceTimersByTime(1200); });
    const ledger = document.querySelector('[data-part="ledger"]')!;
    expect(ledger).toHaveAttribute("data-shown");
    expect(ledger).toHaveTextContent("Classification resolved");
    expect(ledger).toHaveTextContent("Alpha");
    expect(ledger).toHaveTextContent("Ash · Bell");
    expect(document.querySelectorAll('[data-mark="fractured"], [data-mark="corrected"]')).toHaveLength(0);
  });

  it("reduced motion shows the settled frame at once, every fact included", () => {
    document.documentElement.classList.add("reduce-motion");
    const done = vi.fn();
    render(<Host initial={lockedValue} reveal={wrongReveal} onRevealComplete={done} />);
    const root = document.querySelector('[data-mig-primitive="match-grid"]')!;
    expect(root).toHaveAttribute("data-reduced-motion");
    expect(root).toHaveAttribute("data-reveal-stage", "done");
    expect(sigil("Bell")).toHaveAttribute("data-mark", "corrected");
    expect(document.querySelector('[data-part="ledger"]')).toHaveAttribute("data-shown");
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("MatchGrid — continuity", () => {
  it("the board keeps one height and the same sigil nodes from open through reveal", () => {
    vi.useFakeTimers();
    const props = { content, value: lockedValue, onChange: () => {}, onLock: () => {} };
    const { rerender } = render(<MatchGrid {...props} phase="open" reveal={null} />);
    const board = () => document.querySelector<HTMLElement>('[data-part="board"]')!;
    const heightOpen = board().style.height;
    const nodeOpen = sigil("Bell");
    expect(heightOpen).toMatch(/px$/);
    rerender(<MatchGrid {...props} phase="locked" reveal={null} />);
    expect(board().style.height).toBe(heightOpen);
    rerender(<MatchGrid {...props} phase="revealed" reveal={wrongReveal} />);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(board().style.height).toBe(heightOpen);
    expect(sigil("Bell")).toBe(nodeOpen);
    // The ledger lives inside the reserved well footprint, never below it.
    const ledger = document.querySelector<HTMLElement>('[data-part="ledger"]')!;
    expect(Number.parseFloat(ledger.style.top) + Number.parseFloat(ledger.style.height)).toBeLessThanOrEqual(Number.parseFloat(heightOpen) + 0.5);
  });
});

// ---------------------------------------------------------------- MG-P3.1 rail
describe("MatchGrid — host height budget (rail)", () => {
  const props = { content, phase: "open" as const, value: {}, onChange: () => {}, onLock: () => {}, reveal: null };

  it("without a budget keeps the stacked composition", () => {
    const { container } = render(<MatchGrid {...props} />);
    expect(container.querySelector("[data-mig-primitive]")!.hasAttribute("data-rail")).toBe(false);
  });

  it("a budget the stacked board cannot meet selects the rail, with the well beside the wires", () => {
    const { container } = render(<MatchGrid {...props} heightTier="compact" maxHeight={360} />);
    const root = container.querySelector("[data-mig-primitive]")!;
    expect(root.hasAttribute("data-rail")).toBe(true);
    expect(root.getAttribute("data-composition")).toBe("ledger");
    // Every target is still reachable by name and the board is shorter than the budget.
    for (const e of content.entities) expect(sigil(e.label)).toBeInTheDocument();
    const board = container.querySelector<HTMLElement>('[data-part="board"]')!;
    expect(parseFloat(board.style.height)).toBeLessThanOrEqual(360 - 56 - 2);
  });

  it("a generous budget keeps the stacked composition", () => {
    const { container } = render(<MatchGrid {...props} heightTier="compact" maxHeight={2000} />);
    expect(container.querySelector("[data-mig-primitive]")!.hasAttribute("data-rail")).toBe(false);
  });

  it("the rail plays the same game: keyboard, tap→tap and Lock payload", () => {
    const onLock = vi.fn();
    function RailHost() {
      const [value, setValue] = useState<MatchValue>({});
      return <MatchGrid content={content} phase="open" value={value} onChange={setValue} onLock={onLock} reveal={null}
        heightTier="compact" maxHeight={360} />;
    }
    render(<RailHost />);
    fireEvent.keyDown(sigil("Ash"), { key: "2" });
    expect(sigil("Ash")).toHaveAccessibleName(/In Beta/);
    const bell = sigil("Bell");
    pointer("pointerdown", bell, 10, 10);
    pointer("pointerup", bell, 10, 10);
    fireEvent.click(seal("Gamma"));
    expect(sigil("Bell")).toHaveAccessibleName(/In Gamma/);
    for (const [i, e] of content.entities.slice(2).entries()) fireEvent.keyDown(sigil(e.label), { key: String((i % 3) + 1) });
    fireEvent.click(lockButton());
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock.mock.calls[0][0].assignments).toHaveLength(content.entities.length);
  });
});
