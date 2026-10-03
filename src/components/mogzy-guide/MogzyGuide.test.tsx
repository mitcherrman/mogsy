import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GUIDE_HOVER_CLEAR_DELAY_MS,
  MogzyGuide,
  createGuideStorage,
  guideStorageKey,
  useMogzyGuide,
  type GuideMessage,
  type GuidePlacements,
  type GuideStorage,
} from "./index";

const placements: GuidePlacements = {
  desktop: {
    anchor: { bottom: "16%", centerX: true },
    size: "120px",
    bubbleSide: "top",
  },
  mobile: {
    anchor: { top: "8px", right: "12px" },
    size: "84px",
    bubbleSide: "left",
    bubbleWidth: "min(160px, 42vw)",
  },
};

const memStorage = (): GuideStorage => {
  const m = new Map<string, string>();
  return createGuideStorage({
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  });
};

const ctx = (over: Partial<GuideMessage> = {}): GuideMessage => ({
  id: "ctx",
  priority: "contextual",
  text: "Heads up.",
  ...over,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("reduce-motion");
});

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

describe("MogzyGuide", () => {
  const bubble = () => screen.getByTestId("mogzy-guide-t-bubble");
  const live = () => screen.getByTestId("mogzy-guide-t-live");

  it("renders the canonical MogzyMascot, decorative, with the bubble hidden when idle", () => {
    const { container } = render(
      <MogzyGuide surface="t" message={null} placement={placements} layout="desktop" />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("data-mogzy-art-category")).toBe("mascot");
    expect(img.getAttribute("data-mogzy-art-name")).toBe("base");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(bubble().getAttribute("data-visible")).toBe("false");
    expect(live().textContent).toBe("");
    // Decorative by default: no focus stop.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows title + text; bubble is aria-hidden, contextual text is announced once via the live region", () => {
    render(
      <MogzyGuide
        surface="t"
        message={ctx({ title: "Note", text: "Ranked is open." })}
        placement={placements}
        layout="desktop"
      />,
    );
    expect(bubble().getAttribute("data-visible")).toBe("true");
    expect(bubble().getAttribute("aria-hidden")).toBe("true");
    expect(bubble().textContent).toContain("Ranked is open.");
    expect(live().getAttribute("role")).toBe("status");
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(live().textContent).toBe("Note. Ranked is open.");
    expect(live().closest("[aria-hidden='true']")).toBeNull();
  });

  it("does not announce hover or ambient messages", () => {
    const { rerender } = render(
      <MogzyGuide
        surface="t"
        message={ctx({ priority: "hover" })}
        placement={placements}
        layout="desktop"
      />,
    );
    expect(live().textContent).toBe("");
    rerender(
      <MogzyGuide
        surface="t"
        message={ctx({ priority: "ambient" })}
        placement={placements}
        layout="desktop"
      />,
    );
    expect(live().textContent).toBe("");
    expect(bubble().getAttribute("data-priority")).toBe("ambient");
  });

  it("keeps the last text while fading out", () => {
    const { rerender } = render(
      <MogzyGuide surface="t" message={ctx({ text: "Stay." })} placement={placements} layout="desktop" />,
    );
    rerender(<MogzyGuide surface="t" message={null} placement={placements} layout="desktop" />);
    expect(bubble().getAttribute("data-visible")).toBe("false");
    expect(bubble().textContent).toContain("Stay.");
    expect(live().textContent).toBe("");
  });

  it("applies authored desktop and phone placement", () => {
    const { rerender } = render(
      <MogzyGuide surface="t" message={ctx()} placement={placements} layout="desktop" />,
    );
    const root = screen.getByTestId("mogzy-guide-t");
    expect(root.getAttribute("data-layout")).toBe("desktop");
    expect(root.style.bottom).toBe("16%");
    expect(root.style.justifyContent).toBe("center");
    expect(screen.getByTestId("mogzy-guide-t-lean").style.width).toBe("120px");
    expect(root.querySelector(".mogzy-guide-bubble-pos")!.getAttribute("data-side")).toBe("top");

    rerender(<MogzyGuide surface="t" message={ctx()} placement={placements} layout="mobile" />);
    expect(root.getAttribute("data-layout")).toBe("mobile");
    expect(root.style.top).toBe("8px");
    expect(root.style.right).toBe("12px");
    expect(screen.getByTestId("mogzy-guide-t-lean").style.width).toBe("84px");
    const pos = root.querySelector<HTMLElement>(".mogzy-guide-bubble-pos")!;
    expect(pos.getAttribute("data-side")).toBe("left");
    expect(pos.style.getPropertyValue("--mogzy-guide-bubble-w")).toBe("min(160px, 42vw)");
  });

  it("sits in normal flow when no anchor is authored", () => {
    render(
      <MogzyGuide
        surface="t"
        message={null}
        placement={{ desktop: { size: "90px", bubbleSide: "right" } }}
        layout="desktop"
      />,
    );
    expect(screen.getByTestId("mogzy-guide-t").style.position).toBe("relative");
  });

  it("leans and turns toward a target, then returns to rest", () => {
    const { rerender } = render(
      <MogzyGuide
        surface="t"
        message={ctx({ target: { direction: "right", distance: "far" } })}
        placement={placements}
        layout="desktop"
      />,
    );
    const lean = screen.getByTestId("mogzy-guide-t-lean");
    const facing = screen.getByTestId("mogzy-guide-t-facing");
    expect(lean.style.getPropertyValue("--guide-lean-x")).toBe("min(96px, 18vw)");
    expect(facing.getAttribute("data-facing")).toBe("right");
    expect(facing.style.getPropertyValue("--mogzy-facing")).toBe("-1");
    expect(lean.className).toContain("mogzy-lean-glide");

    rerender(<MogzyGuide surface="t" message={null} placement={placements} layout="desktop" />);
    expect(lean.style.getPropertyValue("--guide-lean-x")).toBe("0px");
    expect(facing.getAttribute("data-facing")).toBe("left");
    expect(facing.style.getPropertyValue("--mogzy-facing")).toBe("1");
  });

  it("swaps pose per message and falls back to the rest pose", () => {
    const { rerender, container } = render(
      <MogzyGuide
        surface="t"
        message={ctx({ pose: "thinking" })}
        placement={placements}
        layout="desktop"
        pose="explaining"
      />,
    );
    const name = () => container.querySelector("img")!.getAttribute("data-mogzy-art-name");
    expect(name()).toBe("thinking");
    rerender(
      <MogzyGuide surface="t" message={ctx()} placement={placements} layout="desktop" pose="explaining" />,
    );
    expect(name()).toBe("explaining");
  });

  it("plays a hop cue when a cue message becomes active", () => {
    const { rerender } = render(
      <MogzyGuide surface="t" message={null} placement={placements} layout="desktop" />,
    );
    const react = screen.getByTestId("mogzy-guide-t-react");
    expect(react.classList.contains("mogzy-click-react")).toBe(false);
    rerender(
      <MogzyGuide surface="t" message={ctx({ cue: "hop" })} placement={placements} layout="desktop" />,
    );
    expect(react.classList.contains("mogzy-click-react")).toBe(true);
    fireEvent.animationEnd(react);
    expect(react.classList.contains("mogzy-click-react")).toBe(false);
  });

  describe("interactive", () => {
    it("renders a labelled button that hops, activates and dismisses a dismissible message", () => {
      const onActivate = vi.fn();
      const onDismiss = vi.fn();
      render(
        <MogzyGuide
          surface="t"
          message={ctx({ dismissible: true })}
          placement={placements}
          layout="desktop"
          interactive
          triggerLabel="Mogzy, Hub guide"
          onActivate={onActivate}
          onDismiss={onDismiss}
        />,
      );
      const btn = screen.getByRole("button", { name: "Mogzy, Hub guide" });
      fireEvent.click(btn);
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("mogzy-guide-t-react").classList.contains("mogzy-click-react")).toBe(true);
    });

    it("does not dismiss a non-dismissible message", () => {
      const onDismiss = vi.fn();
      render(
        <MogzyGuide
          surface="t"
          message={ctx()}
          placement={placements}
          layout="desktop"
          interactive
          onDismiss={onDismiss}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("Escape dismisses a dismissible message", () => {
      const onDismiss = vi.fn();
      render(
        <MogzyGuide
          surface="t"
          message={ctx({ dismissible: true })}
          placement={placements}
          layout="desktop"
          interactive
          onDismiss={onDismiss}
        />,
      );
      fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("reduced motion", () => {
    beforeEach(() => document.documentElement.classList.add("reduce-motion"));

    it("applies no motion layers, no lean, no hop — but the bubble and live text still appear", () => {
      const { container } = render(
        <MogzyGuide
          surface="t"
          message={ctx({ cue: "hop", target: { direction: "right", distance: "far" } })}
          placement={placements}
          layout="desktop"
          interactive
        />,
      );
      const root = screen.getByTestId("mogzy-guide-t");
      expect(root.getAttribute("data-motion")).toBe("still");
      expect(container.querySelector(".academy-mogzy-float")).toBeNull();
      expect(container.querySelector(".mogzy-lean-glide")).toBeNull();
      expect(container.querySelector(".mogzy-facing-turn")).toBeNull();
      expect(screen.getByTestId("mogzy-guide-t-lean").style.getPropertyValue("--guide-lean-x")).toBe("0px");
      expect(screen.getByTestId("mogzy-guide-t-facing").getAttribute("data-facing")).toBe("left");

      const react = screen.getByTestId("mogzy-guide-t-react");
      expect(react.classList.contains("mogzy-click-react")).toBe(false);
      fireEvent.click(screen.getByRole("button"));
      expect(react.classList.contains("mogzy-click-react")).toBe(false);

      expect(bubble().getAttribute("data-visible")).toBe("true");
      expect(live().textContent).toBe("Heads up.");
    });

    it("keeps an authored right-facing rest pose static", () => {
      render(
        <MogzyGuide
          surface="t"
          message={null}
          placement={{ desktop: { size: "90px", bubbleSide: "top", restFacing: "right" } }}
          layout="desktop"
        />,
      );
      expect(screen.getByTestId("mogzy-guide-t-facing").style.transform).toBe("scaleX(-1)");
    });
  });

  it("uses motion layers in normal mode", () => {
    const { container } = render(
      <MogzyGuide surface="t" message={ctx()} placement={placements} layout="desktop" />,
    );
    expect(screen.getByTestId("mogzy-guide-t").getAttribute("data-motion")).toBe("full");
    expect(container.querySelector(".academy-mogzy-float")).not.toBeNull();
    expect(container.querySelector(".mogzy-facing-turn")).not.toBeNull();
  });

  it("shifts the bubble back inside the viewport (measured), and not when it already fits", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 });
    // Bubble measured 40px past the right edge of a 375px viewport.
    spy.mockImplementation(function (this: HTMLElement) {
      const shifted = this.classList.contains("mogzy-guide-bubble-pos");
      return shifted
        ? ({ left: 240, right: 415, top: 100, bottom: 160, width: 175, height: 60 } as DOMRect)
        : ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect);
    });
    render(<MogzyGuide surface="t" message={ctx()} placement={placements} layout="mobile" />);
    const pos = document.querySelector<HTMLElement>(".mogzy-guide-bubble-pos")!;
    expect(pos.style.getPropertyValue("--guide-clamp-x")).toBe("-48px");
    expect(pos.style.getPropertyValue("--guide-clamp-y")).toBe("0px");
    spy.mockRestore();
  });

  it("PERF1: requests the encode named by `scale` for every pose, falling back to the source", () => {
    const { container, rerender } = render(
      <MogzyGuide surface="t" message={null} placement={placements} layout="desktop" />,
    );
    const src = () => container.querySelector("img")!.getAttribute("src");
    // Default is unchanged: the source art.
    expect(src()).toBe("/mascot/mogzy-mascot-base-v1.png");
    rerender(<MogzyGuide surface="t" message={null} placement={placements} layout="desktop" scale="medium" />);
    expect(src()).toBe("/mascot/mogzy-mascot-base-v1-512.webp");
    // A message's pose rides the same scale.
    rerender(
      <MogzyGuide surface="t" message={ctx({ pose: "explaining" })} placement={placements} layout="desktop" scale="compact" />,
    );
    expect(src()).toBe("/mascot/mogzy-explaining-transparent-192.webp");
    // No derivative for this pose at this scale: the source, never a broken image.
    rerender(
      <MogzyGuide surface="t" message={ctx({ pose: "cheering" })} placement={placements} layout="desktop" scale="compact" />,
    );
    expect(src()).toBe("/mascot/mogzy-cheering-transparent.png");
    // The interactive button renders the same encode.
    rerender(
      <MogzyGuide surface="t" message={null} placement={placements} layout="mobile" interactive scale="medium" />,
    );
    expect(src()).toBe("/mascot/mogzy-mascot-base-v1-512.webp");
  });

  it("is never a pointer target except its optional button", () => {
    render(<MogzyGuide surface="t" message={ctx()} placement={placements} layout="desktop" />);
    expect(screen.getByTestId("mogzy-guide-t").className).toContain("pointer-events-none");
    expect(bubble().className).toContain("mogzy-guide-bubble");
  });
});

/* -------------------------------------------------------------------------- */
/* Controller hook                                                            */
/* -------------------------------------------------------------------------- */

describe("useMogzyGuide", () => {
  const run = (messages: GuideMessage[], extra: Partial<Parameters<typeof useMogzyGuide>[0]> = {}) => {
    const storage = memStorage();
    const hook = renderHook(
      (props: { messages: GuideMessage[] }) =>
        useMogzyGuide({ surface: "t", storage, ...extra, messages: props.messages }),
      { initialProps: { messages } },
    );
    return { storage, ...hook };
  };

  it("returns null with no messages and when disabled", () => {
    expect(run([]).result.current.message).toBeNull();
    expect(run([ctx()], { enabled: false }).result.current.message).toBeNull();
  });

  it("follows the priority order as state changes", () => {
    const first: GuideMessage = { id: "first", priority: "first-use", text: "Hi" };
    const { result, rerender } = run([first]);
    expect(result.current.message?.id).toBe("first");

    act(() => result.current.hover({ id: "h", text: "hover" }));
    expect(result.current.message?.id).toBe("first"); // first-use outranks hover

    rerender({ messages: [ctx(), first] });
    expect(result.current.message?.id).toBe("ctx"); // contextual outranks all

    rerender({ messages: [] });
    expect(result.current.message?.id).toBe("h"); // only hover left
    expect(result.current.message?.priority).toBe("hover");
  });

  it("clears hover after the grace delay and cancels the clear on re-hover", () => {
    vi.useFakeTimers();
    const { result } = run([]);
    act(() => result.current.hover({ id: "a", text: "A" }));
    act(() => result.current.clearHover());
    act(() => void vi.advanceTimersByTime(GUIDE_HOVER_CLEAR_DELAY_MS - 10));
    expect(result.current.message?.id).toBe("a");
    act(() => result.current.hover({ id: "b", text: "B" })); // card→card: no flash to idle
    act(() => void vi.advanceTimersByTime(GUIDE_HOVER_CLEAR_DELAY_MS + 10));
    expect(result.current.message?.id).toBe("b");
    act(() => result.current.clearHover());
    act(() => void vi.advanceTimersByTime(GUIDE_HOVER_CLEAR_DELAY_MS + 1));
    expect(result.current.message).toBeNull();
  });

  it("once:'show' stays up this mount, is recorded, and is excluded on the next mount", () => {
    const m: GuideMessage = { id: "intro", priority: "first-use", text: "Welcome", once: "show" };
    const storage = memStorage();
    const first = renderHook(() => useMogzyGuide({ surface: "t", storage, messages: [m] }));
    expect(first.result.current.message?.id).toBe("intro");
    expect(storage.has(guideStorageKey("t", "intro"))).toBe(true);
    first.rerender();
    expect(first.result.current.message?.id).toBe("intro");
    first.unmount();

    const second = renderHook(() => useMogzyGuide({ surface: "t", storage, messages: [m] }));
    expect(second.result.current.message).toBeNull();
  });

  it("once:'dismiss' is recorded only on dismissal", () => {
    const m: GuideMessage = { id: "tip", priority: "first-use", text: "Tip", once: "dismiss", dismissible: true };
    const { result, storage } = run([m]);
    expect(result.current.message?.id).toBe("tip");
    expect(storage.has(guideStorageKey("t", "tip"))).toBe(false);
    act(() => result.current.dismiss());
    expect(result.current.message).toBeNull();
    expect(storage.has(guideStorageKey("t", "tip"))).toBe(true);
  });

  it("dismissal of a non-once message lasts the session only", () => {
    const { result, storage } = run([ctx({ dismissible: true })]);
    act(() => result.current.dismiss());
    expect(result.current.message).toBeNull();
    expect(storage.has(guideStorageKey("t", "ctx"))).toBe(false);
  });

  it("ttl expiry dismisses (and records a once:'dismiss')", () => {
    vi.useFakeTimers();
    const m: GuideMessage = { id: "t1", priority: "first-use", text: "x", ttlMs: 3000, once: "dismiss" };
    const { result, storage } = run([m]);
    expect(result.current.message?.id).toBe("t1");
    act(() => void vi.advanceTimersByTime(3001));
    expect(result.current.message).toBeNull();
    expect(storage.has(guideStorageKey("t", "t1"))).toBe(true);
  });

  it("rotates ambient messages on a slow cadence and yields to higher priority", () => {
    vi.useFakeTimers();
    const a: GuideMessage = { id: "a1", priority: "ambient", text: "one" };
    const b: GuideMessage = { id: "a2", priority: "ambient", text: "two" };
    const cadence = { initialDelayMs: 1000, visibleMs: 2000, gapMs: 5000 };
    const { result, rerender } = run([a, b], { ambient: cadence });
    expect(result.current.message).toBeNull();
    act(() => void vi.advanceTimersByTime(1001));
    expect(result.current.message?.id).toBe("a1");
    act(() => void vi.advanceTimersByTime(2001));
    expect(result.current.message).toBeNull();
    act(() => void vi.advanceTimersByTime(5001));
    expect(result.current.message?.id).toBe("a2");

    rerender({ messages: [a, b, ctx()] });
    expect(result.current.message?.id).toBe("ctx");
  });

  it("resetSeen forgets persisted once records", () => {
    const m: GuideMessage = { id: "intro", priority: "first-use", text: "Welcome", once: "show" };
    const { result, storage } = run([m]);
    expect(storage.has(guideStorageKey("t", "intro"))).toBe(true);
    act(() => result.current.resetSeen());
    expect(storage.has(guideStorageKey("t", "intro"))).toBe(false);
  });
});
