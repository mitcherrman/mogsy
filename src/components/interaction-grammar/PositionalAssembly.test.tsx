import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionalAssembly, type PositionalAssemblyProps } from "./PositionalAssembly";
import type {
  InteractionPhase, PositionalAssemblyPublic, PositionalAssemblyResponse, PositionalAssemblyReveal, PositionalAssemblyValue,
} from "@/lib/interaction-grammar/types";
import { emptyBoard, ASSEMBLY_TIMING } from "@/lib/interaction-grammar/positionalAssembly";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

const POS = ["p1", "p2", "p3", "p4", "p5"];
const CARDS = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh", "Ii", "Jj"];

function makeContent(over: Partial<PositionalAssemblyPublic> = {}): PositionalAssemblyPublic {
  return {
    prompt: "Seat the five.",
    eyebrow: "Assembly · lab",
    subject: { label: "The Five", sublabel: "a test", media: null, monogram: "TF" },
    cardKind: "identity",
    positions: POS.map((id, i) => ({ id, label: `Post ${i + 1}`, short: `P${i + 1}`, emblem: null })),
    cards: CARDS.map((label, i) => ({ token: `tok${i}`, label })),
    ...over,
  };
}
const tokenOf = (label: string) => `tok${CARDS.indexOf(label)}`;

function makeReveal(assignment: Record<string, string>, canonical: Record<string, string>): PositionalAssemblyReveal {
  const positionCorrect = Object.fromEntries(POS.map((p) => [p, assignment[p] === canonical[p]]));
  const right = Object.values(positionCorrect).filter(Boolean).length;
  return {
    assignment, canonical, positionCorrect, isCorrect: right === 5,
    verdictText: right === 5 ? "Every position right." : `${right} of 5 in position.`,
    cardNotes: { tok9: "was somewhere else" },
    context: { title: "Context", lines: ["line one"], source: { label: "a source", url: null } },
  };
}

function Host({ content, initialPhase = "open", initialValue, reveal = null, onLock, onChange, ...rest }: {
  content: PositionalAssemblyPublic; initialPhase?: InteractionPhase; initialValue?: PositionalAssemblyValue;
  reveal?: PositionalAssemblyReveal | null; onLock?: (r: PositionalAssemblyResponse) => void;
  onChange?: (b: Record<string, string | null>) => void;
} & Partial<Pick<PositionalAssemblyProps, "onRevealComplete" | "maxHeight" | "onCue">>) {
  const [value, setValue] = useState<PositionalAssemblyValue>(initialValue ?? emptyBoard(content));
  return (
    <PositionalAssembly content={content} phase={initialPhase} value={value}
      onChange={(b) => { setValue(b); onChange?.(b); }} onLock={onLock ?? (() => {})} reveal={reveal} {...rest} />
  );
}

const card = (label: string) => screen.getByTestId(`pa-card-${tokenOf(label)}`);
const well = (id: string) => screen.getByTestId(`pa-well-${id}`);
const root = () => screen.getByTestId("mig-positional-assembly");
const live = () => screen.getByTestId("pa-live").textContent;

// jsdom has no PointerEvent: without this, testing-library's pointer events carry no clientX/Y.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
/** Lay the board and tray out for jsdom: wells at y 0–60, tray at y 200–400. */
function mockLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute?.("data-testid") ?? "";
    const part = this.getAttribute?.("data-part") ?? "";
    let box = { left: 0, top: 0, right: 0, bottom: 0 };
    const w = /^pa-well-(p\d)$/.exec(id);
    if (w) { const i = Number(w[1].slice(1)) - 1; box = { left: i * 70, top: 0, right: i * 70 + 60, bottom: 60 }; }
    else if (part === "board") box = { left: 0, top: 0, right: 340, bottom: 60 };
    else if (part === "tray") box = { left: 0, top: 200, right: 340, bottom: 400 };
    else if (part === "card") box = { left: 10, top: 210, right: 70, bottom: 250 };
    return { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, ...box, toJSON() {} } as DOMRect;
  });
}
beforeEach(() => {
  mockLayout();
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS); });

describe("tap, then tap", () => {
  it("arms a card, seats it at the tapped position, and the card leaves a hollow in the tray", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    fireEvent.click(card("Cc"));
    expect(root().dataset.armed).toBe("true");
    expect(card("Cc")).toHaveAttribute("aria-pressed", "true");
    expect(live()).toMatch(/Cc selected/);
    fireEvent.click(well("p3"));
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: null, p3: "tok2", p4: null, p5: null });
    expect(root().dataset.armed).toBeUndefined();
    expect(well("p3").dataset.token).toBe("tok2");
    expect(card("Cc").dataset.seated).toBe("true");
    expect(card("Cc")).toHaveAccessibleName(/placed at Post 3/);
    expect(live()).toMatch(/Cc placed at Post 3/);
  });
  it("tapping the armed card again puts it down; Escape puts it down too", () => {
    render(<Host content={makeContent()} />);
    fireEvent.click(card("Aa"));
    fireEvent.click(card("Aa"));
    expect(root().dataset.armed).toBeUndefined();
    fireEvent.click(card("Bb"));
    fireEvent.keyDown(root(), { key: "Escape" });
    expect(root().dataset.armed).toBeUndefined();
  });
  it("seats the armed card by its position number key", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    fireEvent.click(card("Dd"));
    fireEvent.keyDown(card("Dd"), { key: "5" });
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: null, p3: null, p4: null, p5: "tok3" });
  });
  it("a tray card tapped onto an occupied position replaces the occupant, which returns to the tray", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} initialValue={{ p1: "tok0", p2: null, p3: null, p4: null, p5: null }} onChange={onChange} />);
    fireEvent.click(card("Bb"));
    fireEvent.click(well("p1"));
    expect(onChange).toHaveBeenLastCalledWith({ p1: "tok1", p2: null, p3: null, p4: null, p5: null });
    expect(card("Aa").dataset.seated).toBeUndefined();
    expect(live()).toMatch(/replacing Aa/);
  });
  it("tapping a seated card picks it up; tapping another position moves it; an occupied one swaps", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} initialValue={{ p1: "tok0", p2: "tok1", p3: null, p4: null, p5: null }} onChange={onChange} />);
    fireEvent.click(well("p1"));
    expect(root().dataset.armed).toBe("true");
    fireEvent.click(well("p3"));
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: "tok1", p3: "tok0", p4: null, p5: null });
    fireEvent.click(well("p3"));
    fireEvent.click(well("p2"));
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: "tok0", p3: "tok1", p4: null, p5: null });
    expect(live()).toMatch(/swapping with Bb/);
  });
  it("tapping a seated card's hollow in the tray returns it", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} initialValue={{ p1: "tok0", p2: null, p3: null, p4: null, p5: null }} onChange={onChange} />);
    fireEvent.click(card("Aa"));
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: null, p3: null, p4: null, p5: null });
    expect(live()).toMatch(/Aa returned to the tray/);
  });
  it("tapping an empty position with nothing armed only explains", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    fireEvent.click(well("p2"));
    expect(onChange).not.toHaveBeenCalled();
    expect(live()).toMatch(/Choose a card from the tray first/);
  });
});

describe("drag (mouse, touch, pen)", () => {
  it("drags a tray card onto a position; the ghost follows and the drop seats it", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    const c = card("Ee");
    fireEvent.pointerDown(c, { pointerId: 3, pointerType: "touch", clientX: 20, clientY: 220, button: 0 });
    fireEvent.pointerMove(c, { pointerId: 3, pointerType: "touch", clientX: 22, clientY: 222 });
    expect(screen.queryByTestId("pa-drag-ghost")).toBeNull(); // under the threshold
    fireEvent.pointerMove(c, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 30 });
    expect(screen.getByTestId("pa-drag-ghost")).toBeInTheDocument();
    expect(root().dataset.dragging).toBe("true");
    expect(screen.getByTestId("pa-position-p2").dataset.dropTarget).toBe("true");
    fireEvent.pointerUp(c, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 30 });
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: "tok4", p3: null, p4: null, p5: null });
    expect(screen.queryByTestId("pa-drag-ghost")).toBeNull();
    // The click that follows a drag is not a tap.
    fireEvent.click(c);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it("a drop just below the board still lands (forgiving); a drop far away cancels", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    const c = card("Aa");
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 20, clientY: 220, button: 0 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 290, clientY: 90 });
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 290, clientY: 90 });
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: null, p3: null, p4: null, p5: "tok0" });
    const d = card("Bb");
    fireEvent.pointerDown(d, { pointerId: 2, clientX: 20, clientY: 220, button: 0 });
    fireEvent.pointerMove(d, { pointerId: 2, clientX: 600, clientY: 600 });
    fireEvent.pointerUp(d, { pointerId: 2, clientX: 600, clientY: 600 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(live()).toMatch(/Bb not moved/);
  });
  it("drags a seated card back onto the tray to return it, and a cancelled pointer changes nothing", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} initialValue={{ p1: "tok0", p2: null, p3: null, p4: null, p5: null }} onChange={onChange} />);
    const w = well("p1");
    fireEvent.pointerDown(w, { pointerId: 4, clientX: 30, clientY: 30, button: 0 });
    fireEvent.pointerMove(w, { pointerId: 4, clientX: 100, clientY: 300 });
    expect(screen.getByTestId("pa-tray").dataset.dropTarget).toBe("true");
    fireEvent.pointerUp(w, { pointerId: 4, clientX: 100, clientY: 300 });
    expect(onChange).toHaveBeenLastCalledWith({ p1: null, p2: null, p3: null, p4: null, p5: null });
    const c = card("Cc");
    fireEvent.pointerDown(c, { pointerId: 5, pointerType: "pen", clientX: 20, clientY: 220, button: 0 });
    fireEvent.pointerMove(c, { pointerId: 5, pointerType: "pen", clientX: 100, clientY: 30 });
    fireEvent.pointerCancel(c, { pointerId: 5, pointerType: "pen" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pa-drag-ghost")).toBeNull();
  });
  it("ignores a secondary mouse button", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    const c = card("Aa");
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 20, clientY: 220, button: 2 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 100, clientY: 30 });
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 100, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("keyboard — a complete path", () => {
  it("arrows rove inside the tray and the positions; Enter arms and seats; Delete returns; Lock submits", () => {
    const onLock = vi.fn();
    render(<Host content={makeContent()} onLock={onLock} />);
    const first = card("Aa");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(card("Bb"));
    fireEvent.keyDown(card("Bb"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(card("Gg"));
    fireEvent.keyDown(card("Gg"), { key: "Home" });
    expect(document.activeElement).toBe(card("Aa"));
    // Enter on a button is its click.
    fireEvent.click(card("Aa"));
    well("p1").focus();
    fireEvent.keyDown(well("p1"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(well("p2"));
    fireEvent.click(well("p2"));
    expect(well("p2").dataset.token).toBe("tok0");
    fireEvent.keyDown(well("p2"), { key: "Delete" });
    expect(well("p2").dataset.token).toBeUndefined();
    // Fill all five by number keys, then Lock.
    for (let i = 0; i < 5; i++) {
      fireEvent.click(card(CARDS[i]));
      fireEvent.keyDown(card(CARDS[i]), { key: String(i + 1) });
    }
    expect(root().dataset.filled).toBe("5");
    expect(screen.getByTestId("pa-lock")).toBeEnabled();
    fireEvent.click(screen.getByTestId("pa-lock"));
    expect(onLock).toHaveBeenCalledWith({ assignment: { p1: "tok0", p2: "tok1", p3: "tok2", p4: "tok3", p5: "tok4" } });
  });
  it("Lock stays disabled until every position is filled, and never submits an incomplete board", () => {
    const onLock = vi.fn();
    render(<Host content={makeContent()} onLock={onLock} initialValue={{ p1: "tok0", p2: "tok1", p3: "tok2", p4: "tok3", p5: null }} />);
    expect(screen.getByTestId("pa-lock")).toBeDisabled();
    fireEvent.click(screen.getByTestId("pa-lock"));
    expect(onLock).not.toHaveBeenCalled();
    expect(screen.getByTestId("pa-status").textContent).toMatch(/Four of five placed/);
  });
});

describe("phases and the reveal boundary", () => {
  const assignment = { p1: "tok0", p2: "tok1", p3: "tok2", p4: "tok3", p5: "tok9" };
  const canonical = { p1: "tok0", p2: "tok2", p3: "tok1", p4: "tok3", p5: "tok4" };
  it("carries nothing that could hold an answer before the reveal: no marks, no verdict, no context, cards inert when locked", () => {
    const { container } = render(<Host content={makeContent()} initialPhase="locked" initialValue={assignment} />);
    expect(container.querySelectorAll("[data-mark]").length).toBe(0);
    expect(container.querySelectorAll("[data-verdict]").length).toBe(0);
    expect(screen.getByTestId("pa-context").dataset.shown).toBe("false");
    expect(screen.getByTestId("pa-context").textContent).toBe("");
    expect(card("Aa")).toBeDisabled();
    expect(screen.getByTestId("pa-lockstate").dataset.shown).toBe("true");
    expect(screen.getByTestId("pa-status").textContent).toMatch(/Locked/);
  });
  it("draws the reveal in stages: marks, then the canonical cards settle with the wrong picks demoted, then the context plate", () => {
    vi.useFakeTimers();
    const onRevealComplete = vi.fn();
    const reveal = makeReveal(assignment, canonical);
    render(<Host content={makeContent()} initialPhase="revealed" initialValue={assignment} reveal={reveal} onRevealComplete={onRevealComplete} />);
    expect(root().dataset.revealStage).toBe("marks");
    expect(screen.getByTestId("pa-position-p2").dataset.mark).toBe("wrong");
    expect(screen.getByTestId("pa-position-p1").dataset.mark).toBe("right");
    expect(well("p2").dataset.token).toBe("tok1"); // the player's card still shows during marks
    expect(screen.getByTestId("pa-pick-p2").dataset.shown).toBe("false");
    act(() => { vi.advanceTimersByTime(ASSEMBLY_TIMING.marksEnd + 1); });
    expect(root().dataset.revealStage).toBe("settle");
    expect(well("p2").dataset.token).toBe("tok2"); // the canonical card has settled in
    expect(screen.getByTestId("pa-pick-p2").dataset.shown).toBe("true");
    expect(screen.getByTestId("pa-pick-p2").textContent).toMatch(/Bb/);
    expect(screen.getByTestId("pa-pick-p1").dataset.shown).toBe("false");
    expect(screen.getByTestId("pa-context").dataset.shown).toBe("false");
    act(() => { vi.advanceTimersByTime(ASSEMBLY_TIMING.settleEnd - ASSEMBLY_TIMING.marksEnd); });
    expect(root().dataset.revealStage).toBe("context");
    expect(screen.getByTestId("pa-context").dataset.shown).toBe("true");
    expect(screen.getByTestId("pa-context-notes").textContent).toMatch(/Jj — was somewhere else/);
    expect(root().dataset.verdict).toBe("wrong");
    expect(screen.getByTestId("pa-status").textContent).toBe("2 of 5 in position.");
    expect(onRevealComplete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(ASSEMBLY_TIMING.contextEnd - ASSEMBLY_TIMING.settleEnd + 1); });
    expect(root().dataset.revealStage).toBe("done");
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pa-lockstate").textContent).toBe("2 / 5");
  });
  it("an all-right reveal has no settle stage and keeps every card where the player put it", () => {
    vi.useFakeTimers();
    const reveal = makeReveal(canonical, canonical);
    render(<Host content={makeContent()} initialPhase="revealed" initialValue={canonical} reveal={reveal} />);
    act(() => { vi.advanceTimersByTime(ASSEMBLY_TIMING.marksEnd + 1); });
    expect(root().dataset.revealStage).toBe("context");
    expect(root().dataset.verdict).toBe("right");
    for (const p of POS) expect(screen.getByTestId(`pa-pick-${p}`).dataset.shown).toBe("false");
  });
  it("reduced motion: the first revealed frame is the settled frame and the reveal completes at once", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const onRevealComplete = vi.fn();
    render(<Host content={makeContent()} initialPhase="revealed" initialValue={assignment} reveal={makeReveal(assignment, canonical)} onRevealComplete={onRevealComplete} />);
    expect(root().dataset.reduced).toBe("true");
    expect(root().dataset.revealStage).toBe("done");
    expect(well("p2").dataset.token).toBe("tok2");
    expect(screen.getByTestId("pa-context").dataset.shown).toBe("true");
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });
  it("keeps the same structural parts in every phase (nothing is added or removed by knowledge)", () => {
    const parts = (el: HTMLElement) => [...el.querySelectorAll("[data-part]")].map((e) => e.getAttribute("data-part")).sort().join(",");
    const a = render(<Host content={makeContent()} initialValue={assignment} />);
    const open = parts(a.container);
    a.unmount();
    const b = render(<Host content={makeContent()} initialPhase="locked" initialValue={assignment} />);
    const locked = parts(b.container);
    b.unmount();
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const c = render(<Host content={makeContent()} initialPhase="revealed" initialValue={assignment} reveal={makeReveal(assignment, canonical)} />);
    const revealed = parts(c.container).replace(/,mark/g, "");
    expect(locked).toBe(open);
    expect(revealed).toBe(open);
  });
  it("takes a definite height from the host and spends it", () => {
    render(<Host content={makeContent()} maxHeight={520} />);
    expect(root().style.height).toBe("520px");
    expect(root().dataset.sized).toBe("true");
  });
  it("draws icon cards with art and identity cards with a seal", () => {
    const { unmount } = render(<Host content={makeContent({ cardKind: "icon", cards: CARDS.map((label, i) => ({ token: `tok${i}`, label, media: { src: `/x/${i}.png`, alt: "" } })) })} />);
    expect(card("Aa").querySelector("img")).toHaveAttribute("src", "/x/0.png");
    unmount();
    render(<Host content={makeContent()} />);
    expect(card("Aa").querySelector(".pa-seal-text")?.textContent).toBe("Aa");
  });
});

describe("source contract", () => {
  const src = readFileSync(resolve(__dirname, "PositionalAssembly.tsx"), "utf8");
  it("never grades: it imports no authority, no fixture, no lab, and compares no tokens for a verdict", () => {
    const imports = (src.match(/^import[\s\S]*?;\s*$/gm) ?? []).join(" ");
    expect(imports).toContain("@/lib/interaction-grammar/positionalAssembly");
    expect(imports).not.toMatch(/pro-play-assembly|__fixtures__|pages\/dev|labAuthority|ranked-public|ranked-core|pro-play\//);
    expect(src).not.toMatch(/assignment\[[^\]]+\]\s*===\s*(reveal\.)?canonical\[/);
    expect(src).not.toMatch(/\bisCorrect\s*=/);
  });
  it("names no League domain", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/league|champion|roster|draft|jungle|support|worlds|samsung/i);
  });
});
