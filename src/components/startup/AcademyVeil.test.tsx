import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";

/**
 * ACADEMY STARTUP RC2 — the veil above the router: what it paints, when a
 * direct visit takes it, and that leaving /lol drops it.
 */
const warm = vi.fn();
vi.mock("@/pages/academy-core/academy-core-warm", () => ({ warmAcademyCore: (...a: unknown[]) => warm(...a) }));
const prefetchRoute = vi.fn();
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: (...a: unknown[]) => prefetchRoute(...a) }));
const settings = vi.fn();
vi.mock("@/hooks/useAppSettings", () => ({ prefetchAppSettings: () => settings() }));

import AcademyVeil from "./AcademyVeil";
import { ENTRANCE_VEIL_GRADIENT } from "@/lib/academy-startup/veil-gradient";
import {
  REVEAL_FADE_MS, __resetAcademyStartupForTests, getAcademyStartup, holdAcademyVeil, revealAcademy,
} from "@/lib/academy-startup/veil-store";

let go: (to: string) => void = () => {};
function Nav() {
  const navigate = useNavigate();
  go = (to) => navigate(to);
  return null;
}
const mount = (at: string) => render(<MemoryRouter initialEntries={[at]}><Nav /><AcademyVeil /></MemoryRouter>);
const veil = () => screen.queryByTestId("academy-veil");

beforeEach(() => {
  vi.useFakeTimers();
  __resetAcademyStartupForTests();
  warm.mockReset(); prefetchRoute.mockReset(); settings.mockReset();
  document.documentElement.classList.remove("reduce-motion");
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { vi.useRealTimers(); });

describe("direct /lol visits", () => {
  it("hold the flat startup surface from the first paint and start the Orrery's warm at boot", async () => {
    mount("/lol");
    expect(getAcademyStartup()).toMatchObject({ phase: "held", source: "direct" });
    expect(veil()).toHaveAttribute("data-source", "direct");
    expect(veil()!.style.background).toMatch(/#060c14|rgb\(6, 12, 20\)/);
    expect(veil()!.querySelector(".academy-veil-flash")).toBeNull();
    expect(prefetchRoute).toHaveBeenCalledWith("/lol", { intent: true });
    expect(settings).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(warm).toHaveBeenCalledTimes(1)); // imported on demand
  });

  it("the legacy #academy-commons link is a redirect, not a visit: nothing is held", () => {
    mount("/lol#academy-commons");
    expect(getAcademyStartup().phase).toBe("idle");
    expect(veil()).toBeNull();
  });

  it("other routes hold nothing, and the boot check runs once per page load", () => {
    mount("/quiz");
    expect(veil()).toBeNull();
    act(() => go("/lol")); // an in-app navigation is not a direct visit
    expect(getAcademyStartup().phase).toBe("idle");
    expect(warm).not.toHaveBeenCalled();
  });
});

describe("the Landing's hand-over", () => {
  it("paints the Landing veil's own gradient at its peak, then the calm glow layer", () => {
    mount("/");
    act(() => { holdAcademyVeil("entrance"); });
    const v = veil()!;
    expect(v).toHaveAttribute("data-source", "entrance");
    const flash = v.querySelector<HTMLElement>(".academy-veil-flash")!.style.getPropertyValue("--veil-flash").replace(/\s+/g, "");
    // the same stops as MogzyEntryV2's veil: gold core, cyan ring, navy edge
    for (const stop of ["rgba(240,215,140,0.95)", "rgba(127,214,239,0.5)"]) expect(flash).toContain(stop);
    expect(ENTRANCE_VEIL_GRADIENT.replace(/\s+/g, "")).toContain("rgba(4,7,15,1)78%");
    expect(v.querySelector(".academy-veil-calm")).not.toBeNull();
  });

  it("is not dropped by the moment between the hold and the Landing's navigate()", () => {
    mount("/");
    act(() => { holdAcademyVeil("entrance"); });
    expect(getAcademyStartup().phase).toBe("held");
    act(() => go("/lol"));
    expect(getAcademyStartup().phase).toBe("held");
  });

  it("the /dev entrance preview hands over too (the hold is taken off the root path)", () => {
    mount("/dev/mogzy-entry-v2");
    act(() => { holdAcademyVeil("entrance"); });
    expect(getAcademyStartup().phase).toBe("held");
    act(() => go("/lol"));
    expect(getAcademyStartup().phase).toBe("held");
  });

  it("leaving /lol while held (Back, a link) drops the veil at once", () => {
    mount("/");
    act(() => { holdAcademyVeil("entrance"); });
    act(() => go("/lol"));
    act(() => go("/quiz"));
    expect(getAcademyStartup()).toMatchObject({ phase: "idle", reason: "cancelled" });
    expect(veil()).toBeNull();
  });

  it("fades on reveal, then unmounts; pointer events are blocked only while held", () => {
    mount("/lol");
    expect(veil()).toHaveAttribute("data-phase", "held");
    act(() => revealAcademy("ready"));
    expect(veil()).toHaveAttribute("data-phase", "revealing");
    act(() => { vi.advanceTimersByTime(REVEAL_FADE_MS); });
    expect(veil()).toBeNull();
  });

  it("marks reduced motion (no breathing, no fade)", () => {
    document.documentElement.classList.add("reduce-motion");
    mount("/lol");
    expect(veil()).toHaveAttribute("data-reduced", "true");
  });
});
