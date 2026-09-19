import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useServerInstantWake, WAKE_SLACK_MS } from "./useServerInstantWake";
import { readReducedMotionPreference, useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";

function Probe({ iso, skewMs }: { iso: string | null; skewMs: number }) {
  useServerInstantWake(iso, skewMs);
  const open = iso !== null && Date.now() + skewMs >= Date.parse(iso);
  return <span data-testid="gate">{open ? "open" : "closed"}</span>;
}

describe("useServerInstantWake — exact wake-up at an authoritative instant", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.parse("2026-09-19T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("re-renders at the instant itself, not on a coarse tick", () => {
    render(<Probe iso="2026-09-19T12:00:02.300Z" skewMs={0} />);
    expect(screen.getByTestId("gate")).toHaveTextContent("closed");
    act(() => { vi.advanceTimersByTime(2300 - 1); });
    expect(screen.getByTestId("gate")).toHaveTextContent("closed");
    act(() => { vi.advanceTimersByTime(1 + WAKE_SLACK_MS); });
    expect(screen.getByTestId("gate")).toHaveTextContent("open");
  });

  it("converts server time through the skew", () => {
    // Server runs 1s ahead: its 12:00:02.300 is local 12:00:01.300.
    render(<Probe iso="2026-09-19T12:00:02.300Z" skewMs={1000} />);
    act(() => { vi.advanceTimersByTime(1300 + WAKE_SLACK_MS); });
    expect(screen.getByTestId("gate")).toHaveTextContent("open");
  });

  it("drops a superseded instant: no stale wake-up fires into the next round", () => {
    const { rerender, unmount } = render(<Probe iso="2026-09-19T12:00:01Z" skewMs={0} />);
    rerender(<Probe iso="2026-09-19T12:00:05Z" skewMs={0} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function MotionProbe() {
  return <span data-testid="rm">{useReducedMotionPreference() ? "reduced" : "full"}</span>;
}

describe("useReducedMotionPreference — one signal for both switches", () => {
  afterEach(() => { document.documentElement.classList.remove("reduce-motion"); vi.unstubAllGlobals(); });

  it("honours Mogzy's own Reduce Motion setting, live", async () => {
    render(<MotionProbe />);
    expect(screen.getByTestId("rm")).toHaveTextContent("full");
    await act(async () => { document.documentElement.classList.add("reduce-motion"); });
    expect(screen.getByTestId("rm")).toHaveTextContent("reduced");
  });

  it("honours the OS media query", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {},
    }));
    expect(readReducedMotionPreference()).toBe(true);
  });
});
