import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { PtRevealView } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingReveal, REVEAL_BEATS } from "./PerfectTimingReveal";
import { DEMO_REVEALS } from "./__stories__/demoViewModels";

const reveal = (over: Partial<PtRevealView>): PtRevealView => ({ ...DEMO_REVEALS.early, ...over });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
});

describe("PerfectTimingReveal — the signed error", () => {
  it("renders a negative error as early", () => {
    render(<PerfectTimingReveal reveal={reveal({ elapsedMs: 6830, targetMs: 7000, errorMs: -170, absErrorMs: 170 })} onNext={() => {}} />);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-direction", "early");
    expect(screen.getByTestId("pt-error-word")).toHaveTextContent(/^early$/i);
    expect(screen.getByTestId("pt-error-ms")).toHaveTextContent("170 ms");
    expect(screen.getByTestId("pt-rail")).toHaveAttribute("aria-label", expect.stringMatching(/6\.83 s.*7\.00 s.*170 ms early/));
  });

  it("renders a positive error as late", () => {
    render(<PerfectTimingReveal reveal={reveal({ elapsedMs: 7240, targetMs: 7000, errorMs: 240, absErrorMs: 240, tier: "great", points: 72 })} onNext={() => {}} />);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-direction", "late");
    expect(screen.getByTestId("pt-error-word")).toHaveTextContent(/^late$/i);
    expect(screen.getByTestId("pt-error-ms")).toHaveTextContent("240 ms");
  });

  it("renders a zero error as exact, with no millisecond figure", () => {
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.exact} onNext={() => {}} />);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-direction", "exact");
    expect(screen.getByTestId("pt-error-word")).toHaveTextContent("Exact");
    expect(screen.queryByTestId("pt-error-ms")).toBeNull();
  });
});

describe("PerfectTimingReveal — tier, points, provenance", () => {
  it("prints the server's tier and points verbatim", () => {
    render(<PerfectTimingReveal reveal={reveal({ tier: "great", points: 72 })} onNext={() => {}} />);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-tier", "great");
    expect(screen.getByTestId("pt-tier")).toHaveTextContent("Great");
    expect(screen.getByTestId("pt-points")).toHaveTextContent("+72");
  });

  it("names a miss as a miss", () => {
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.miss} onNext={() => {}} />);
    expect(screen.getByTestId("pt-tier")).toHaveTextContent("Miss");
    expect(screen.getByTestId("pt-points")).toHaveTextContent("+0");
  });

  it("shows the authority's progression and rank, ", () => {
    render(<PerfectTimingReveal reveal={reveal({ cooldownRaw: "9 / 8 / 7 / 6 / 5", rank: 3 })} onNext={() => {}} />);
    expect(screen.getByTestId("pt-evidence")).toHaveTextContent("Cooldown 9 / 8 / 7 / 6 / 5 s · rank 3");
  });

  it("says 'any rank' for a rank-invariant reveal", () => {
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.exact} onNext={() => {}} />);
    expect(screen.getByTestId("pt-evidence")).toHaveTextContent(/any rank/);
  });

  it("flags an unverified window and only then", () => {
    const { rerender } = render(<PerfectTimingReveal reveal={DEMO_REVEALS.unverified} onNext={() => {}} />);
    expect(screen.getByTestId("pt-unverified")).toHaveTextContent(/unverified timing/i);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-plausible", "false");
    rerender(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={() => {}} />);
    expect(screen.queryByTestId("pt-unverified")).toBeNull();
  });
});

describe("PerfectTimingReveal — you against true", () => {
  it("prints both durations as plates, the server's figures verbatim", () => {
    render(<PerfectTimingReveal reveal={reveal({ elapsedMs: 6830, targetMs: 7000, errorMs: -170, absErrorMs: 170 })} onNext={() => {}} />);
    expect(screen.getByTestId("pt-you-time")).toHaveTextContent("6.83 s");
    expect(screen.getByTestId("pt-true-time")).toHaveTextContent("7.00 s");
  });
});

describe("PerfectTimingReveal — the rail", () => {
  it("places the true cooldown and the stop on the same rail by one linear map", () => {
    render(<PerfectTimingReveal reveal={reveal({ elapsedMs: 4000, targetMs: 7000, errorMs: -3000, absErrorMs: 3000 })} onNext={() => {}} />);
    // longest 7000 → 7.84 s raw → the 8 s rail.
    expect(screen.getByTestId("pt-mark-true").style.getPropertyValue("--pt-x")).toBe("87.5%");
    expect(screen.getByTestId("pt-mark-you").style.getPropertyValue("--pt-x")).toBe("50%");
    expect(screen.getByTestId("pt-rail").style.getPropertyValue("--pt-true")).toBe("87.5%");
    expect(screen.getByTestId("pt-rail").style.getPropertyValue("--pt-band-left")).toBe("50%");
    expect(screen.getByTestId("pt-rail").style.getPropertyValue("--pt-band-width")).toBe("37.5%");
  });

  it("keeps a far-late stop inside the rail, past the truth", () => {
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.farLate} onNext={() => {}} />);
    const you = parseFloat(screen.getByTestId("pt-mark-you").style.getPropertyValue("--pt-x"));
    const truth = parseFloat(screen.getByTestId("pt-mark-true").style.getPropertyValue("--pt-x"));
    // 9.8 s on the 12 s rail; 4 s truth.
    expect(you).toBeCloseTo(81.67, 1);
    expect(truth).toBeCloseTo(33.33, 1);
    expect(you).toBeLessThan(100);
  });

  it("hangs each label toward the centre of the rail, so none is cut at an end", () => {
    render(<PerfectTimingReveal reveal={reveal({ elapsedMs: 200, targetMs: 7000, errorMs: -6800, absErrorMs: 6800, tier: "miss", points: 0 })} onNext={() => {}} />);
    expect(screen.getByTestId("pt-mark-you")).toHaveAttribute("data-side", "left");
    expect(screen.getByTestId("pt-mark-true")).toHaveAttribute("data-side", "right");
  });

  it("yields the end scale label to a true flag whose needle stands on it", () => {
    // 5 s on the 6 s rail: 83%, the end label stays.
    const { rerender } = render(<PerfectTimingReveal reveal={DEMO_REVEALS.miss} onNext={() => {}} />);
    expect(screen.getByTestId("pt-rail").querySelector('[data-end="end"]')).toHaveAttribute("data-hidden", "false");
    // 7 s on the 8 s rail: 87.5%, the flag's hang reaches the end.
    rerender(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={() => {}} />);
    expect(screen.getByTestId("pt-rail").querySelector('[data-end="end"]')).toHaveAttribute("data-hidden", "true");
  });
});

describe("PerfectTimingReveal — motion and the way on", () => {
  it("animates by default and rests at once under reduced motion", () => {
    const { unmount } = render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={() => {}} autoFocusNext={false} />);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-animate", "true");
    unmount();
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={() => {}} autoFocusNext={false} />);
    expect(screen.getByTestId("pt-reveal")).toHaveAttribute("data-animate", "false");
    // No count-up: the exact figure is printed from the first frame.
    expect(screen.getByTestId("pt-error-ms")).toHaveAttribute("data-landed", "true");
  });

  it("moves focus to the way on only after the choreography has settled", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} />);
    const next = screen.getByTestId("pt-next");
    expect(next).toHaveTextContent("Next round");
    expect(document.activeElement).not.toBe(next);
    act(() => { vi.advanceTimersByTime(REVEAL_BEATS.focus - 1); });
    expect(document.activeElement).not.toBe(next);
    act(() => { vi.advanceTimersByTime(2); });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("lets Space or Enter advance once the choreography has settled, and only once", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} />);
    // During the reveal the keys do nothing: a double-tap on the stop can never skip it.
    fireEvent.keyDown(document.body, { key: " " });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onNext).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(REVEAL_BEATS.focus + 1); });
    // A held key (repeat) never advances.
    fireEvent.keyDown(document.body, { key: " ", repeat: true });
    expect(onNext).not.toHaveBeenCalled();
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    document.body.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("leaves a key aimed at the button to the button, so one press advances exactly once", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} />);
    act(() => { vi.advanceTimersByTime(REVEAL_BEATS.focus + 1); });
    const next = screen.getByTestId("pt-next");
    expect(next).toHaveFocus();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    next.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("stops listening for keys when it unmounts", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    const { unmount } = render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={onNext} />);
    act(() => { vi.advanceTimersByTime(REVEAL_BEATS.focus + 1); });
    unmount();
    fireEvent.keyDown(document.body, { key: " " });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("takes a different label for the last round", () => {
    render(<PerfectTimingReveal reveal={DEMO_REVEALS.early} onNext={() => {}} nextLabel="See results" autoFocusNext={false} />);
    expect(screen.getByRole("button", { name: "See results" })).toBeInTheDocument();
  });
});
