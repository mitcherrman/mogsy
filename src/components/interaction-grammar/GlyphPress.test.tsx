import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlyphPress, type GlyphPressProps } from "./GlyphPress";
import type {
  GlyphPressCell, GlyphPressLedger, GlyphPressPublic, GlyphPressResponse, GlyphPressReveal, GlyphPressValue, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import { GLYPH_PRESS_ALPHABET } from "@/lib/interaction-grammar/glyphPress";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

/** "Zephyr" as an authority would publish it: six sockets, no glyph anywhere in the content. */
function makeContent(text = "Zephyr"): GlyphPressPublic {
  const cells: GlyphPressCell[] = [];
  let n = 0;
  let gap = false;
  for (const ch of text) {
    if (ch === " ") { gap = true; continue; }
    if (gap) { cells.push({ kind: "gap" }); gap = false; }
    if (/[A-Za-z]/.test(ch)) cells.push({ kind: "glyph", index: n++ });
    else cells.push({ kind: "mark", text: ch });
  }
  return {
    prompt: "Set the name of this ability.", categoryLabel: "Ability", clue: { media: null, caption: "Janna · W", monogram: "W" },
    structure: { cells, glyphCount: n }, alphabet: GLYPH_PRESS_ALPHABET, soundingsAllowed: 3, footnote: "League Wiki · revision 1",
  };
}
const emptyLedger = (n: number): GlyphPressLedger => ({ engraved: Array.from({ length: n }, () => null), soundings: [] });

/** A 600×300 bed and a 400px drum window for jsdom, which has no layout. */
function mockBoxes() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute?.("data-testid");
    const w = id === "gp-bed" ? 600 : id === "gp-drum-window" ? 400 : 0;
    const h = id === "gp-bed" ? 300 : id === "gp-drum-window" ? 56 : 0;
    return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON() {} } as DOMRect;
  });
}

function Host({ content, ledger: initialLedger, initialPhase = "open", initialValue, reveal = null, onLock, onChange, onSound, ...rest }: {
  content: GlyphPressPublic; ledger?: GlyphPressLedger; initialPhase?: InteractionPhase; initialValue?: GlyphPressValue; reveal?: GlyphPressReveal | null;
  onLock?: (r: GlyphPressResponse) => void; onChange?: (v: GlyphPressValue) => void; onSound?: (g: string) => void;
} & Partial<Pick<GlyphPressProps, "onRevealComplete" | "revealBudgetMs" | "maxHeight" | "onCue">>) {
  const n = content.structure.glyphCount;
  const [value, setValue] = useState<GlyphPressValue>(initialValue ?? Array.from({ length: n }, () => null));
  const [ledger] = useState<GlyphPressLedger>(initialLedger ?? emptyLedger(n));
  return (
    <GlyphPress content={content} ledger={ledger} phase={initialPhase} value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }} onSound={onSound ?? (() => {})} onLock={onLock ?? (() => {})} reveal={reveal} {...rest} />
  );
}

const forme = () => screen.getByTestId("gp-forme");
const face = (i: number) => screen.getByTestId(`gp-face-${i}`).textContent;
const cell = (i: number) => screen.getByTestId(`gp-cell-${i}`);

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
beforeEach(() => {
  mockBoxes();
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
});
afterEach(() => { vi.restoreAllMocks(); document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS); });

describe("the forme", () => {
  it("lays one socket per glyph and no glyph anywhere before the reveal", () => {
    render(<Host content={makeContent("Rabadon's Deathcap")} />);
    for (let i = 0; i < 16; i++) expect(face(i)).toBe("");
    expect(screen.getAllByTestId("gp-mark")).toHaveLength(1);
    expect(screen.getByTestId("gp-mark").textContent).toBe("'");
    expect(screen.getByTestId("gp-answer").textContent).toBe("");
    expect(document.querySelectorAll("[data-result]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-verdict]")).toHaveLength(0);
  });
  it("engraves the ledger's given glyphs and parks the cursor on the first blank open socket", () => {
    const ledger: GlyphPressLedger = { engraved: ["Z", null, null, "H", null, null], soundings: [] };
    render(<Host content={makeContent()} ledger={ledger} />);
    expect(face(0)).toBe("Z");
    expect(cell(0).dataset.state).toBe("engraved");
    expect(cell(0).dataset.origin).toBe("given");
    expect(cell(1).dataset.cursor).toBe("true");
    expect(screen.getByTestId("gp-lock")).toHaveTextContent("Lock · 4 blank");
  });
  it("shows a sounded engraving as sounded and tarnishes a glyph the sounding found nowhere", () => {
    const ledger: GlyphPressLedger = { engraved: [null, "E", null, null, null, null], soundings: [{ glyph: "E", hits: 1 }, { glyph: "Q", hits: 0 }] };
    render(<Host content={makeContent()} ledger={ledger} />);
    expect(cell(1).dataset.origin).toBe("sounded");
    expect(screen.getByTestId("gp-tile-E").dataset.state).toBe("sounded");
    expect(screen.getByTestId("gp-tile-Q").dataset.state).toBe("tarnished");
    expect(screen.getByTestId("gp-sounding-record")).toHaveTextContent("E ×1 · Q —");
    expect(screen.getByTestId("gp-charges").querySelectorAll('i[data-on="true"]')).toHaveLength(1);
  });
});

describe("setting type — keyboard", () => {
  it("letters set at the cursor and advance it; Backspace clears back; arrows move; Delete clears in place", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    fireEvent.keyDown(forme(), { key: "z" });
    fireEvent.keyDown(forme(), { key: "E" });
    expect(face(0)).toBe("Z");
    expect(face(1)).toBe("E");
    expect(cell(2).dataset.cursor).toBe("true");
    expect(onChange).toHaveBeenLastCalledWith(["Z", "E", null, null, null, null]);
    fireEvent.keyDown(forme(), { key: "Backspace" });
    expect(face(1)).toBe("");
    expect(cell(1).dataset.cursor).toBe("true");
    fireEvent.keyDown(forme(), { key: "ArrowLeft" });
    expect(cell(0).dataset.cursor).toBe("true");
    fireEvent.keyDown(forme(), { key: "Delete" });
    expect(face(0)).toBe("");
    fireEvent.keyDown(forme(), { key: "End" });
    expect(cell(5).dataset.cursor).toBe("true");
    fireEvent.keyDown(forme(), { key: "ArrowRight" });
    expect(cell(5).dataset.cursor).toBe("true");
    fireEvent.keyDown(forme(), { key: "Home" });
    expect(cell(0).dataset.cursor).toBe("true");
  });
  it("skips engraved sockets and refuses a sounded or tarnished glyph", () => {
    const ledger: GlyphPressLedger = { engraved: ["Z", null, "P", null, null, null], soundings: [{ glyph: "P", hits: 1 }, { glyph: "Q", hits: 0 }] };
    render(<Host content={makeContent()} ledger={ledger} />);
    expect(cell(1).dataset.cursor).toBe("true");
    fireEvent.keyDown(forme(), { key: "e" });
    expect(cell(3).dataset.cursor).toBe("true");
    fireEvent.keyDown(forme(), { key: "p" });
    fireEvent.keyDown(forme(), { key: "q" });
    expect(face(3)).toBe("");
    fireEvent.keyDown(forme(), { key: "h" });
    expect(face(3)).toBe("H");
  });
  it("Enter on the forme submits nothing", () => {
    const onLock = vi.fn();
    render(<Host content={makeContent()} onLock={onLock} initialValue={["Z", "E", "P", "H", "Y", "R"]} />);
    fireEvent.keyDown(forme(), { key: "Enter" });
    expect(onLock).not.toHaveBeenCalled();
  });
});

describe("setting type — the drum", () => {
  it("a tap on a tile sets that glyph; the clearing tile clears back; the drum turns with the keys", () => {
    render(<Host content={makeContent()} />);
    const win = screen.getByTestId("gp-drum-window");
    const tile = screen.getByTestId("gp-tile-E");
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 100, clientY: 20, button: 0 });
    fireEvent.pointerUp(win, { pointerId: 1, clientX: 100, clientY: 20 });
    expect(face(0)).toBe("E");
    expect(tile.dataset.centred).toBe("true");
    const clear = screen.getByTestId("gp-tile-clear");
    fireEvent.pointerDown(clear, { pointerId: 2, clientX: 100, clientY: 20, button: 0 });
    fireEvent.pointerUp(win, { pointerId: 2, clientX: 100, clientY: 20 });
    expect(face(0)).toBe("");
    fireEvent.keyDown(win, { key: "ArrowRight" });
    fireEvent.keyDown(win, { key: "ArrowRight" });
    expect(screen.getByTestId("gp-tile-G").dataset.centred).toBe("true");
    fireEvent.keyDown(win, { key: "Enter" });
    expect(face(0)).toBe("G");
    fireEvent.click(screen.getByTestId("gp-drum-prev"));
    expect(screen.getByTestId("gp-tile-F").dataset.centred).toBe("true");
    fireEvent.click(screen.getByTestId("gp-drum-next"));
    fireEvent.click(screen.getByTestId("gp-drum-next"));
    expect(screen.getByTestId("gp-tile-H").dataset.centred).toBe("true");
  });
  it("a drag turns the drum and sets nothing", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    const win = screen.getByTestId("gp-drum-window");
    fireEvent.pointerDown(screen.getByTestId("gp-tile-A"), { pointerId: 3, clientX: 200, clientY: 20, button: 0 });
    fireEvent.pointerMove(win, { pointerId: 3, clientX: 200 - 96, clientY: 20 });
    expect(win.dataset.dragging).toBe("true");
    fireEvent.pointerUp(win, { pointerId: 3, clientX: 200 - 96, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();
    expect(win.dataset.dragging).toBe("false");
    expect(screen.getByTestId("gp-tile-C").dataset.centred).toBe("true");
  });
});

describe("soundings", () => {
  it("arming the press makes the next glyph a sounding, spent through onSound, never through onChange", () => {
    const onSound = vi.fn();
    const onChange = vi.fn();
    render(<Host content={makeContent()} onSound={onSound} onChange={onChange} />);
    const root = screen.getByTestId("mig-glyph-press");
    fireEvent.click(screen.getByTestId("gp-sound"));
    expect(root.dataset.armed).toBe("true");
    expect(screen.getByTestId("gp-sound")).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(forme(), { key: "e" });
    expect(onSound).toHaveBeenCalledWith("E");
    expect(onChange).not.toHaveBeenCalled();
    expect(root.dataset.armed).toBe("false");
    expect(screen.getByTestId("gp-tile-E").dataset.state).toBe("pending");
    // While a sounding is pending the press cannot be armed again.
    expect(screen.getByTestId("gp-sound")).toBeDisabled();
  });
  it("Escape disarms; with no soundings left the control is disabled", () => {
    render(<Host content={makeContent()} />);
    fireEvent.click(screen.getByTestId("gp-sound"));
    fireEvent.keyDown(forme(), { key: "Escape" });
    expect(screen.getByTestId("mig-glyph-press").dataset.armed).toBe("false");
    const spent: GlyphPressLedger = { engraved: [null, null, null, null, null, null], soundings: [{ glyph: "A", hits: 0 }, { glyph: "B", hits: 0 }, { glyph: "C", hits: 0 }] };
    render(<Host content={makeContent()} ledger={spent} />);
    expect(screen.getAllByTestId("gp-sound")[1]).toBeDisabled();
  });
});

describe("lock", () => {
  it("submits one glyph per socket, engraved ones from the ledger, blanks as null", () => {
    const onLock = vi.fn();
    const ledger: GlyphPressLedger = { engraved: ["Z", null, null, null, null, null], soundings: [] };
    render(<Host content={makeContent()} ledger={ledger} onLock={onLock} initialValue={[null, "E", "P", null, "Y", "R"]} />);
    expect(screen.getByTestId("gp-lock")).toHaveTextContent("Lock · 1 blank");
    fireEvent.click(screen.getByTestId("gp-lock"));
    expect(onLock).toHaveBeenCalledWith({ glyphs: ["Z", "E", "P", null, "Y", "R"] });
  });
  it("closes every input once locked, and the status reads locked", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} initialPhase="locked" initialValue={["Z", "E", "P", "H", "Y", "R"]} onChange={onChange} />);
    fireEvent.keyDown(forme(), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("gp-lock")).toBeDisabled();
    expect(screen.getByTestId("gp-sound")).toBeDisabled();
    expect(screen.getByTestId("gp-lockstate").dataset.shown).toBe("true");
    expect(screen.getByTestId("gp-status")).toHaveTextContent("Locked");
  });
});

const revealFor = (locked: (string | null)[]): GlyphPressReveal => {
  const glyphs = ["Z", "E", "P", "H", "Y", "R"];
  const results = glyphs.map((g, i) => (i === 2 ? "given" : locked[i] === null ? "missing" : locked[i] === g ? "right" : "wrong"));
  const right = results.filter((r) => r === "right").length;
  return {
    glyphs, results, locked, verdict: right === 5 ? "solved" : right === 0 ? "missed" : "partial",
    answerText: "Zephyr", scoreText: `${right} of 5 glyphs set right`, note: "Zephyr is Janna's W.", source: { label: "League Wiki" },
  };
};
const givenP: GlyphPressLedger = { engraved: [null, null, "P", null, null, null], soundings: [] };

describe("the reveal", () => {
  it("under reduced motion the first revealed frame is the settled frame: every socket printed, the plaque turned, complete fired", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const onRevealComplete = vi.fn();
    const reveal = revealFor(["Z", "A", "P", null, "Y", "R"]);
    render(<Host content={makeContent()} ledger={givenP} initialPhase="revealed" initialValue={["Z", "A", null, null, "Y", "R"]} reveal={reveal} onRevealComplete={onRevealComplete} />);
    const root = screen.getByTestId("mig-glyph-press");
    expect(root.dataset.revealStage).toBe("done");
    expect(root.dataset.verdict).toBe("partial");
    expect(cell(0).dataset.result).toBe("right");
    expect(cell(1).dataset.result).toBe("wrong");
    expect(face(1)).toBe("E");
    expect(cell(1).querySelector(".gp-cell-wrong")?.textContent).toBe("A");
    expect(cell(2).dataset.result).toBe("given");
    expect(cell(3).dataset.result).toBe("missing");
    expect(face(3)).toBe("H");
    expect(screen.getByTestId("gp-proof").dataset.shown).toBe("true");
    expect(screen.getByTestId("gp-answer")).toHaveTextContent("Zephyr");
    expect(screen.getByTestId("gp-score")).toHaveTextContent("3 of 5 glyphs set right · Zephyr is Janna's W.");
    expect(screen.getByTestId("gp-lockstate")).toHaveTextContent("Partly set");
    expect(screen.getByTestId("gp-live")).toHaveTextContent("Partly set. 3 of 5 glyphs set right. The answer is Zephyr.");
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });
  it("with motion, inks left to right then turns the plaque, and completes once", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const rafs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { rafs.push(cb); return rafs.length; });
    const onRevealComplete = vi.fn();
    const onCue = vi.fn();
    const reveal = revealFor(["Z", "E", "P", "H", "Y", "R"]);
    render(<Host content={makeContent()} ledger={givenP} initialPhase="revealed" initialValue={["Z", "E", null, "H", "Y", "R"]} reveal={reveal} onRevealComplete={onRevealComplete} onCue={onCue} revealBudgetMs={1800} />);
    const root = screen.getByTestId("mig-glyph-press");
    const step = (ms: number) => { now += ms; const cb = rafs.shift(); act(() => { cb?.(now); }); };
    step(0);
    expect(root.dataset.revealStage).toBe("ink");
    expect(screen.getByTestId("gp-proof").dataset.shown).toBe("false");
    expect(onCue).toHaveBeenCalledWith("ink");
    step(60);
    // The ink reaches the first socket before the last.
    expect(cell(0).dataset.result).toBe("right");
    expect(cell(5).dataset.result).toBeUndefined();
    step(1000);
    expect(cell(5).dataset.result).toBe("right");
    expect(root.dataset.revealStage).toBe("verdict");
    expect(root.dataset.verdict).toBe("solved");
    expect(onRevealComplete).not.toHaveBeenCalled();
    step(1000);
    expect(root.dataset.revealStage).toBe("done");
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
    expect(onCue).toHaveBeenCalledWith("resolve");
    vi.useRealTimers();
  });
  it("keeps the same parts in every phase", () => {
    const parts = () => [...document.querySelectorAll("[data-part]")].map((e) => e.getAttribute("data-part")).join(",");
    const { unmount } = render(<Host content={makeContent()} ledger={givenP} />);
    const open = parts();
    unmount();
    const { unmount: u2 } = render(<Host content={makeContent()} ledger={givenP} initialPhase="locked" initialValue={["Z", "E", null, "H", "Y", "R"]} />);
    expect(parts()).toBe(open);
    u2();
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(<Host content={makeContent()} ledger={givenP} initialPhase="revealed" initialValue={["Z", "E", null, "H", "Y", "R"]} reveal={revealFor(["Z", "E", "P", "H", "Y", "R"])} />);
    expect(parts()).toBe(open);
  });
});

describe("the reveal boundary", () => {
  it("before the reveal the DOM carries no glyph beyond the ledger's, even with the answer typed in", () => {
    const ledger: GlyphPressLedger = { engraved: [null, null, "P", null, null, null], soundings: [] };
    render(<Host content={makeContent()} ledger={ledger} initialValue={["Z", "E", null, "H", "Y", "R"]} />);
    // The proof layer is empty and nothing is marked.
    expect(screen.getByTestId("gp-answer").textContent).toBe("");
    expect(screen.getByTestId("gp-score").textContent).toBe("");
    expect(document.querySelectorAll("[data-result], [data-verdict]")).toHaveLength(0);
    // The only "truth" visible is what the ledger engraved; the player's own type is marked as theirs.
    for (let i = 0; i < 6; i++) expect(cell(i).dataset.state).toBe(i === 2 ? "engraved" : "set");
  });
  it("the content type cannot carry an answer: a structure is kinds and indices only", () => {
    const c = makeContent("Life Form Disintegration Ray");
    expect(JSON.stringify(c.structure.cells).replace(/"(kind|index|text|glyph|mark|gap)"/g, "")).not.toMatch(/[A-Za-z]/);
  });
});

describe("the host's height", () => {
  it("takes a definite height when the host measured its stage", () => {
    render(<Host content={makeContent()} maxHeight={420} />);
    expect(screen.getByTestId("mig-glyph-press").style.height).toBe("420px");
  });
});
