import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rangefinder, type RangefinderProps } from "./Rangefinder";
import type { InteractionPhase, RangefinderPublic, RangefinderResponse, RangefinderReveal } from "@/lib/interaction-grammar/types";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

/** The lab field: 100..6000 by 25, opaque tokens, two lenses. */
function makeContent(): RangefinderPublic {
  const stops = [];
  for (let u = 100; u <= 6000; u += 25) stops.push({ token: `tok-${(u * 7919) % 10007}`, units: u });
  return {
    prompt: "Set the target at the cast limit of Zephyr.",
    measureLabel: "Rangefinder · Cast range",
    subject: { label: "Zephyr", sublabel: "Janna · W", slot: "W", media: null, originMedia: null, monogram: "W" },
    field: {
      unitLabel: "units", stops,
      lenses: [
        { id: "field", label: "Field", maxUnits: 1500, ringEveryUnits: 100, labelEveryUnits: 500 },
        { id: "horizon", label: "Horizon", maxUnits: 6000, ringEveryUnits: 500, labelEveryUnits: 1000 },
      ],
    },
    footnote: "Cast range as the League Wiki publishes it",
  };
}
const tokenAt = (c: RangefinderPublic, units: number) => c.field.stops.find((s) => s.units === units)!.token;

/** A field box for jsdom, which has no layout: 668×420 landscape unless told otherwise. */
function mockFieldBox(width = 668, height = 420) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const isField = this.getAttribute?.("data-testid") === "rangefinder-field";
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width: isField ? width : 0, height: isField ? height : 0, toJSON() {} } as DOMRect;
  });
}

function Host({ content, initialPhase = "open", initialValue = null, reveal = null, onLock, onChange, ...rest }: {
  content: RangefinderPublic; initialPhase?: InteractionPhase; initialValue?: string | null; reveal?: RangefinderReveal | null;
  onLock?: (r: RangefinderResponse) => void; onChange?: (t: string) => void;
} & Partial<Pick<RangefinderProps, "onRevealComplete" | "revealBudgetMs" | "maxHeight">>) {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <Rangefinder content={content} phase={initialPhase} value={value}
      onChange={(t) => { setValue(t); onChange?.(t); }} onLock={onLock ?? (() => {})} reveal={reveal} {...rest} />
  );
}

const field = () => screen.getByTestId("rangefinder-field");
const reading = () => screen.getByTestId("rangefinder-reading-value").textContent;

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
beforeEach(() => {
  mockFieldBox();
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
});
afterEach(() => { vi.restoreAllMocks(); document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS); });

describe("legal discrete placements", () => {
  it("starts unplaced: no reach ring, Lock disabled, the target docked", () => {
    render(<Host content={makeContent()} />);
    expect(reading()).toBe("—");
    expect(screen.queryByTestId("rangefinder-reach")).toBeNull();
    expect(screen.getByTestId("rangefinder-lock")).toBeDisabled();
    expect(screen.getByTestId("rangefinder-target").dataset.docked).toBe("true");
  });
  it("exposes the slider's range as the stops' span on the current lens", () => {
    render(<Host content={makeContent()} />);
    expect(field()).toHaveAttribute("aria-valuemin", "100");
    expect(field()).toHaveAttribute("aria-valuemax", "1500");
  });
  it("only ever commits a token that is one of the field's stops", () => {
    const c = makeContent();
    const tokens = new Set(c.field.stops.map((s) => s.token));
    const seen: string[] = [];
    render(<Host content={c} onChange={(t) => seen.push(t)} />);
    fireEvent.keyDown(field(), { key: "End" });
    fireEvent.keyDown(field(), { key: "ArrowLeft" });
    fireEvent.pointerDown(field(), { pointerId: 1, clientX: 300, clientY: 210, button: 0 });
    fireEvent.pointerUp(field(), { pointerId: 1, clientX: 300, clientY: 210 });
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const t of seen) expect(tokens.has(t)).toBe(true);
  });
});

describe("direct drag (mouse, touch, pen)", () => {
  it("places the target under the pointer on press, follows it, and settles onto the nearest stop on release", () => {
    const c = makeContent();
    const onChange = vi.fn();
    render(<Host content={c} onChange={onChange} />);
    // Landscape 668×420: origin at x=60, reach 582px for 1500 units → 1000 units = 388px.
    fireEvent.pointerDown(field(), { pointerId: 7, pointerType: "touch", clientX: 60 + 388, clientY: 210, button: 0 });
    expect(screen.getByTestId("rangefinder-target").dataset.dragging).toBe("true");
    expect(reading()).toBe("1\u202f000");
    // 550 units = 213.4px from the origin; take it off-axis at 0.3 rad to show the bearing does not matter.
    const r550 = (550 / 1500) * 582;
    const off = { clientX: 60 + r550 * Math.cos(0.3), clientY: 210 - r550 * Math.sin(0.3) };
    fireEvent.pointerMove(field(), { pointerId: 7, pointerType: "touch", ...off });
    expect(reading()).toBe("550");
    fireEvent.pointerUp(field(), { pointerId: 7, pointerType: "touch", ...off });
    expect(onChange).toHaveBeenLastCalledWith(tokenAt(c, 550));
    expect(screen.getByTestId("rangefinder-target").dataset.dragging).toBe("false");
    expect(screen.getByTestId("rangefinder-reach")).toBeInTheDocument();
  });
  it("ignores a secondary mouse button and a cancelled pointer commits nothing", () => {
    const onChange = vi.fn();
    render(<Host content={makeContent()} onChange={onChange} />);
    fireEvent.pointerDown(field(), { pointerId: 1, pointerType: "mouse", clientX: 400, clientY: 210, button: 2 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(field(), { pointerId: 2, pointerType: "pen", clientX: 400, clientY: 210, button: 0 });
    fireEvent.pointerCancel(field(), { pointerId: 2, pointerType: "pen" });
    expect(onChange).not.toHaveBeenCalled();
    expect(reading()).toBe("—");
  });
});

describe("keyboard — a complete path", () => {
  it("arrows step one stop, Shift steps coarse, Home / End reach the lens' ends, and the live region reads the stop", () => {
    const c = makeContent();
    render(<Host content={c} />);
    fireEvent.keyDown(field(), { key: "ArrowRight" });
    expect(reading()).toBe("100");
    fireEvent.keyDown(field(), { key: "ArrowRight" });
    expect(reading()).toBe("125");
    fireEvent.keyDown(field(), { key: "ArrowRight", shiftKey: true });
    expect(reading()).toBe("225");
    fireEvent.keyDown(field(), { key: "End" });
    expect(reading()).toBe("1\u202f500");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(reading()).toBe("1\u202f475");
    fireEvent.keyDown(field(), { key: "Home" });
    expect(reading()).toBe("100");
    expect(field()).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByTestId("rangefinder-live").textContent).toContain("100 units");
  });
  it("the vernier buttons step one stop and are real 44px-class buttons", () => {
    render(<Host content={makeContent()} initialValue={tokenAt(makeContent(), 550)} />);
    fireEvent.click(screen.getByTestId("rangefinder-farther"));
    expect(reading()).toBe("575");
    fireEvent.click(screen.getByTestId("rangefinder-nearer"));
    fireEvent.click(screen.getByTestId("rangefinder-nearer"));
    expect(reading()).toBe("525");
    expect(screen.getByTestId("rangefinder-farther")).toHaveAccessibleName("Farther by 25 units");
  });
  it("the lens is the player's: switching it re-scales the field and the slider's max, and never moves the value", () => {
    const c = makeContent();
    render(<Host content={c} initialValue={tokenAt(c, 550)} />);
    fireEvent.click(screen.getByTestId("rangefinder-lens"));
    expect(screen.getByTestId("mig-rangefinder").dataset.lens).toBe("horizon");
    expect(field()).toHaveAttribute("aria-valuemax", "6000");
    expect(reading()).toBe("550");
    fireEvent.keyDown(field(), { key: "End" });
    expect(reading()).toBe("6\u202f000");
  });
  it("Enter / Space on the field do nothing; Lock is a separate button", () => {
    const onLock = vi.fn();
    const c = makeContent();
    render(<Host content={c} initialValue={tokenAt(c, 550)} onLock={onLock} />);
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(field(), { key: " " });
    expect(onLock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("rangefinder-lock"));
    expect(onLock).toHaveBeenCalledWith({ stop: tokenAt(c, 550) });
  });
});

describe("revision before Lock, and the exact submitted token", () => {
  it("every placement is revisable until Lock; Lock submits exactly the last stop token and nothing else", () => {
    const c = makeContent();
    const onLock = vi.fn();
    render(<Host content={c} onLock={onLock} />);
    fireEvent.pointerDown(field(), { pointerId: 1, clientX: 60 + 388, clientY: 210, button: 0 });
    fireEvent.pointerUp(field(), { pointerId: 1, clientX: 60 + 388, clientY: 210 });
    expect(reading()).toBe("1\u202f000");
    fireEvent.keyDown(field(), { key: "ArrowLeft", shiftKey: true });
    expect(reading()).toBe("900");
    fireEvent.click(screen.getByTestId("rangefinder-farther"));
    expect(reading()).toBe("925");
    fireEvent.click(screen.getByTestId("rangefinder-lock"));
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock.mock.calls[0][0]).toEqual({ stop: tokenAt(c, 925) });
    expect(Object.keys(onLock.mock.calls[0][0])).toEqual(["stop"]);
  });
  it("is inert once locked: no drag, no keys, no vernier, no lens", () => {
    const c = makeContent();
    const onChange = vi.fn();
    render(<Host content={c} initialPhase="locked" initialValue={tokenAt(c, 550)} onChange={onChange} />);
    fireEvent.pointerDown(field(), { pointerId: 1, clientX: 400, clientY: 210, button: 0 });
    fireEvent.pointerUp(field(), { pointerId: 1, clientX: 400, clientY: 210 });
    fireEvent.keyDown(field(), { key: "ArrowRight" });
    fireEvent.click(screen.getByTestId("rangefinder-farther"));
    fireEvent.click(screen.getByTestId("rangefinder-lens"));
    expect(onChange).not.toHaveBeenCalled();
    expect(reading()).toBe("550");
    expect(field()).toHaveAttribute("aria-disabled", "true");
    expect(field()).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("rangefinder-lockstate").dataset.shown).toBe("true");
  });
});

describe("no answer leak", () => {
  it("before the reveal the DOM holds no stop that is special, no canonical figure and no verdict", () => {
    const c = makeContent();
    const { container } = render(<Host content={c} initialValue={tokenAt(c, 550)} />);
    const html = container.innerHTML;
    // (`rf-canon-grad` / `rf-hatch` are static <defs>; the drawn canon layers are what must be absent.)
    expect(html).not.toMatch(/data-verdict|rangefinder-canon|rf-canon-ring|rf-canon-sweep|rf-canon-glow|rf-gap-band|rf-fuse/);
    expect(screen.queryByTestId("rangefinder-canon")).toBeNull();
    expect(screen.queryByTestId("rangefinder-canon-mark")).toBeNull();
    expect(screen.getByTestId("mig-rangefinder").dataset.verdict).toBeUndefined();
    expect(screen.getByTestId("rangefinder-proof").dataset.shown).toBe("false");
    // The calibration is the same set of rings whatever the round: nothing marks one distance.
    const rings = container.querySelectorAll(".rf-ring");
    expect(rings.length).toBe(15);
    expect(new Set([...rings].map((r) => r.getAttribute("data-labelled"))).size).toBeLessThanOrEqual(2);
  });
  it("behaves identically at every stop: the same markup shape at 550 and at 1200", () => {
    const c = makeContent();
    const shape = (units: number) => {
      const { container, unmount } = render(<Host content={c} initialValue={tokenAt(c, units)} />);
      const s = container.innerHTML.replace(/\u202f/g, "").replace(/\d+(\.\d+)?/g, "#").replace(/tok-#/g, "tok").replace(/:r[a-z0-9]+:/g, ":id:");
      unmount();
      return s;
    };
    expect(shape(550)).toBe(shape(1200));
  });
  it("the content type cannot carry an answer", () => {
    const c = makeContent();
    const keys = Object.keys(c).sort();
    expect(keys).toEqual(["field", "footnote", "measureLabel", "prompt", "subject"]);
    expect(Object.keys(c.field).sort()).toEqual(["lenses", "stops", "unitLabel"]);
    expect(Object.keys(c.field.stops[0]).sort()).toEqual(["token", "units"]);
  });
});

describe("reveal comparison", () => {
  const revealFor = (c: RangefinderPublic, locked: number, canonical: number): RangefinderReveal => ({
    lockedToken: tokenAt(c, locked), canonicalToken: tokenAt(c, canonical),
    verdict: locked === canonical ? "exact" : locked < canonical ? "short" : "long",
    measurement: { label: "Cast range", valueText: String(canonical) },
    lockedText: String(locked), deltaText: locked === canonical ? null : `${locked > canonical ? "+" : "−"}${Math.abs(locked - canonical)} units`,
    source: { label: "League Wiki", url: "https://wiki.leagueoflegends.com/x" },
  });

  it("draws both rings from the same map and the band between them, and names the fact on the plate (reduced motion: first frame)", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const c = makeContent();
    render(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 1175)} reveal={revealFor(c, 1175, 550)} />);
    const root = screen.getByTestId("mig-rangefinder");
    expect(root.dataset.revealStage).toBe("done");
    expect(root.dataset.verdict).toBe("long");
    const reach = screen.getByTestId("rangefinder-reach").querySelector(".rf-reach-ring")!;
    const canon = screen.getByTestId("rangefinder-canon").querySelector(".rf-canon-ring")!;
    const rReach = Number(reach.getAttribute("r"));
    const rCanon = Number(canon.getAttribute("r"));
    expect(rReach / rCanon).toBeCloseTo(1175 / 550, 6);
    expect(screen.getByTestId("rangefinder-gap")).toBeInTheDocument();
    expect(screen.getByTestId("rangefinder-canon-mark")).toBeInTheDocument();
    expect(screen.getByTestId("rangefinder-proof").dataset.shown).toBe("true");
    expect(screen.getByTestId("rangefinder-proof-value").textContent).toBe("550");
    expect(screen.getByTestId("rangefinder-proof").textContent).toContain("Your mark 1175");
    expect(screen.getByTestId("rangefinder-proof").textContent).toContain("+625 units");
    expect(screen.getByTestId("rangefinder-lockstate").textContent).toMatch(/Long \+625 units/);
    expect(screen.getByTestId("rangefinder-live").textContent).toMatch(/Cast range is 550 units/);
  });
  it("an exact lock: the rings coincide, there is no band and no true-mark, the plate says so", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const c = makeContent();
    render(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 550)} reveal={revealFor(c, 550, 550)} />);
    const reach = screen.getByTestId("rangefinder-reach").querySelector(".rf-reach-ring")!;
    const canon = screen.getByTestId("rangefinder-canon").querySelector(".rf-canon-ring")!;
    expect(reach.getAttribute("r")).toBe(canon.getAttribute("r"));
    expect(screen.queryByTestId("rangefinder-gap")).toBeNull();
    expect(screen.getByTestId("mig-rangefinder").dataset.verdict).toBe("exact");
    expect(screen.getByTestId("rangefinder-lockstate").textContent).toMatch(/Exact reach/);
  });
  it("refocuses the lens once when the truth is beyond the current lens, so the scene can show it", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const c = makeContent();
    render(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 1200)} reveal={revealFor(c, 1200, 3500)} />);
    expect(screen.getByTestId("mig-rangefinder").dataset.lens).toBe("horizon");
    const reach = screen.getByTestId("rangefinder-reach").querySelector(".rf-reach-ring")!;
    const canon = screen.getByTestId("rangefinder-canon").querySelector(".rf-canon-ring")!;
    expect(Number(canon.getAttribute("r")) / Number(reach.getAttribute("r"))).toBeCloseTo(3500 / 1200, 6);
  });
  it("displays the verdict it is handed and never derives one from the tokens", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const c = makeContent();
    // A deliberately inconsistent reveal: equal tokens but the host says "short". The primitive shows "short".
    const odd: RangefinderReveal = { ...revealFor(c, 550, 550), verdict: "short", deltaText: "−0 units" };
    render(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 550)} reveal={odd} />);
    expect(screen.getByTestId("mig-rangefinder").dataset.verdict).toBe("short");
  });
});

describe("reduced motion and the reveal clock", () => {
  it("under reduced motion the first revealed frame is the settled frame and onRevealComplete fires once", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    const c = makeContent();
    const done = vi.fn();
    const reveal: RangefinderReveal = {
      lockedToken: tokenAt(c, 600), canonicalToken: tokenAt(c, 550), verdict: "long",
      measurement: { label: "Cast range", valueText: "550" }, lockedText: "600", deltaText: "+50 units",
    };
    const { rerender } = render(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 600)} reveal={reveal} onRevealComplete={done} />);
    expect(screen.getByTestId("mig-rangefinder").dataset.revealStage).toBe("done");
    expect(screen.getByTestId("mig-rangefinder").dataset.reduced).toBe("true");
    expect(done).toHaveBeenCalledTimes(1);
    rerender(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 600)} reveal={reveal} onRevealComplete={done} />);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("with motion, the canonical ring grows from the origin through charge → project → settle → proof → done", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const rafs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { rafs.push(cb); return rafs.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const tick = (ms: number) => { now = ms; const cbs = rafs.splice(0); act(() => { for (const cb of cbs) cb(now); }); };
    const c = makeContent();
    const done = vi.fn();
    const reveal: RangefinderReveal = {
      lockedToken: tokenAt(c, 1175), canonicalToken: tokenAt(c, 550), verdict: "long",
      measurement: { label: "Cast range", valueText: "550" }, lockedText: "1175", deltaText: "+625 units",
    };
    render(<Host content={c} initialPhase="revealed" initialValue={tokenAt(c, 1175)} reveal={reveal} onRevealComplete={done} />);
    const root = screen.getByTestId("mig-rangefinder");
    tick(0);
    expect(root.dataset.revealStage).toBe("charge");
    expect(screen.queryByTestId("rangefinder-canon")).toBeNull(); // nothing projected yet
    expect(root.dataset.verdict).toBeUndefined();
    tick(500);
    expect(root.dataset.revealStage).toBe("project");
    const mid = Number(screen.getByTestId("rangefinder-canon").querySelector(".rf-canon-ring")!.getAttribute("r"));
    tick(1000);
    expect(root.dataset.revealStage).toBe("settle");
    const full = Number(screen.getByTestId("rangefinder-canon").querySelector(".rf-canon-ring")!.getAttribute("r"));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(full);
    expect(root.dataset.verdict).toBe("long");
    expect(screen.getByTestId("rangefinder-proof").dataset.shown).toBe("false");
    tick(1300);
    expect(root.dataset.revealStage).toBe("proof");
    expect(screen.getByTestId("rangefinder-proof").dataset.shown).toBe("true");
    expect(done).not.toHaveBeenCalled();
    tick(1600);
    expect(root.dataset.revealStage).toBe("done");
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("structural continuity", () => {
  it("keeps the same regions in the same order through open → locked → revealed", () => {
    const c = makeContent();
    const parts = (phase: InteractionPhase, reveal: RangefinderReveal | null) => {
      const { container, unmount } = render(<Host content={c} initialPhase={phase} initialValue={tokenAt(c, 550)} reveal={reveal} />);
      const list = [...container.querySelectorAll("[data-part]")].map((e) => e.getAttribute("data-part"))
        .filter((p) => !["canon", "canon-mark", "reach", "calibration"].includes(p!)); // scene layers live INSIDE the field box
      unmount();
      return list;
    };
    const reveal: RangefinderReveal = {
      lockedToken: tokenAt(c, 550), canonicalToken: tokenAt(c, 600), verdict: "short",
      measurement: { label: "Cast range", valueText: "600" }, lockedText: "550", deltaText: "−50 units",
    };
    expect(parts("open", null)).toEqual(parts("locked", null));
    expect(parts("open", null)).toEqual(parts("revealed", reveal));
    expect(parts("open", null)).toEqual(["head", "field", "reading", "proof", "origin", "target", "plate", "vernier-in", "vernier-out", "lens", "lock", "status"]);
  });
  it("takes a definite height from the host and spends it", () => {
    render(<Host content={makeContent()} maxHeight={480} />);
    expect(screen.getByTestId("mig-rangefinder").style.height).toBe("480px");
  });
});

describe("source contract", () => {
  const src = readFileSync(resolve(__dirname, "Rangefinder.tsx"), "utf8");
  it("never grades: it imports no authority, no fixture, no lab, and compares no tokens for a verdict", () => {
    const imports = (src.match(/^import[\s\S]*?;\s*$/gm) ?? []).join(" ");
    expect(imports).toContain("@/lib/interaction-grammar/rangefinder");
    expect(imports).not.toMatch(/rangefinder\/eligibility|__fixtures__|pages\/dev|labAuthority|ranked-public|ranked-core/);
    expect(src).not.toMatch(/lockedToken\s*===\s*reveal\.canonicalToken|canonicalToken\s*===\s*reveal\.lockedToken/);
    expect(src).not.toMatch(/\bverdict\s*=\s*(lockedIndex|canonicalIndex|lockedUnits|canonicalUnits)/);
  });
  it("names no League domain", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/league|champion|wiki|cast range|janna|ability/i);
  });
});
