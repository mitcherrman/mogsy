/**
 * Combat Theater — playback correctness through the real component tree:
 * stepping, selecting, scrubbing, frame-rate-independent play, reduced
 * motion, and the Lux Q formula reveal. The champion-asset manifest is
 * mocked to "unreachable" so the glyph fallback path is what renders.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REAL_2V2_CALCULATION, REAL_TRACE_LEVELS } from "@/lib/combat-lab/team-sim/__fixtures__";
import type { TeamSimEvent } from "@/lib/combat-lab/team-sim/contract";

import { CombatTheater } from "./CombatTheater";

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: null, isLoading: false }) };
});

const full = REAL_TRACE_LEVELS.full;
const rows = full.events.filter((e) => e.source === "scheduler" && e.type === "action_executed");
const primary = (e: TeamSimEvent) =>
  ((e.meta as Record<string, unknown>).damage_accounting as { by_scope: Record<string, { hp_after: number; applied_hp_damage: number }> }).by_scope.PRIMARY;

// jsdom has no PointerEvent; React's onPointer* handlers still receive a
// MouseEvent dispatched under the pointer type name, with real clientX.
function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientX: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
  });
}

// A controllable requestAnimationFrame so playback can be driven with exact
// timestamps — the clock must read the same at the same accumulated delta no
// matter how many frames delivered it.
let frameQueue: Array<(ts: number) => void> = [];
let now = 0;
function flushFrames(count: number, stepMs: number) {
  for (let i = 0; i < count; i++) {
    const cbs = frameQueue;
    frameQueue = [];
    now += stepMs;
    act(() => {
      for (const cb of cbs) cb(now);
    });
  }
}

function renderTheater(props: Partial<React.ComponentProps<typeof CombatTheater>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CombatTheater response={full} keyboardShortcuts={false} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  frameQueue = [];
  now = 1000;
  vi.stubGlobal("requestAnimationFrame", (cb: (ts: number) => void) => {
    frameQueue.push(cb);
    return frameQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function hpOf(id: string): number {
  return Number(screen.getByTestId(`hp-${id}`).getAttribute("data-hp"));
}

describe("CombatTheater — Ashe vs Garen", () => {
  it("opens before the first beat with both champions at starting_hp", () => {
    renderTheater();
    expect(screen.getByTestId("combat-theater")).toBeInTheDocument();
    expect(hpOf("A1")).toBe(Math.round(full.effective_builds.A1.starting_hp));
    expect(hpOf("B1")).toBe(Math.round(full.effective_builds.B1.starting_hp));
    expect(screen.getByTestId("theater-clock").textContent).toBe("0.000");
    expect(screen.getByTestId("transport-readout").textContent).toContain("event 0 / 7");
    expect(screen.getByTestId("math-explainer").textContent).toMatch(/Select an action/);
  });

  it("Next / Previous step through beats, seeking the clock to each beat's own instant", () => {
    renderTheater();
    fireEvent.click(screen.getByTestId("transport-next"));
    expect(hpOf("B1")).toBe(Math.round(primary(rows[0]).hp_after));
    expect(screen.getByTestId("theater-stage").getAttribute("data-beat-seq")).toBe(String(rows[0].seq));
    expect(screen.getByTestId("transport-readout").textContent).toContain("event 1 / 7");

    fireEvent.click(screen.getByTestId("transport-next"));
    fireEvent.click(screen.getByTestId("transport-next"));
    expect(screen.getByTestId("theater-clock").textContent).toBe(rows[2].time.toFixed(3));
    expect(hpOf("B1")).toBe(Math.round(primary(rows[2]).hp_after));
    expect(hpOf("A1")).toBe(Math.round(primary(rows[1]).hp_after));

    fireEvent.click(screen.getByTestId("transport-prev"));
    expect(screen.getByTestId("theater-stage").getAttribute("data-beat-seq")).toBe(String(rows[1].seq));
    // Scrubbing back reconstructs: Garen is back at his seq-2 value.
    expect(hpOf("B1")).toBe(Math.round(primary(rows[0]).hp_after));
  });

  it("selecting a timeline marker pins that beat and reveals its math with provenance", () => {
    renderTheater();
    const markers = screen.getAllByTestId("beat-marker");
    expect(markers).toHaveLength(rows.length);
    fireEvent.click(markers[3]);
    expect(markers[3]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("theater-stage").getAttribute("data-beat-seq")).toBe(String(rows[3].seq));
    const math = screen.getByTestId("math-explainer");
    expect(within(math).getByTestId("math-step-formula")).toHaveAttribute("data-status", "limited");
    expect(within(math).getByTestId("math-step-hp").textContent).toContain("hp_before");
    expect(within(math).getByTestId("math-applied").textContent).toBe(`−${Math.round(primary(rows[3]).applied_hp_damage)}`);
    expect(hpOf("A1")).toBe(Math.round(primary(rows[3]).hp_after));
  });

  it("the damage reveal shows the applied HP damage and flags the final blow", () => {
    renderTheater();
    const markers = screen.getAllByTestId("beat-marker");
    fireEvent.click(markers[rows.length - 1]);
    const reveal = screen.getByTestId("damage-reveal");
    expect(within(reveal).getByTestId("damage-value").textContent).toBe(`−${Math.round(primary(rows[rows.length - 1]).applied_hp_damage)}`);
    // Overkill: the hit was larger than what the pool could take.
    expect(reveal.textContent).toMatch(/hit 110/);
    expect(reveal.textContent).toMatch(/Final blow/);
    expect(screen.getByTestId("portrait-B1")).toHaveAttribute("data-alive", "false");
    expect(screen.getByTestId("portrait-A1")).toHaveAttribute("data-alive", "true");
  });

  it("the timeline is a keyboard slider that nudges the clock and steps beats", () => {
    renderTheater();
    const slider = screen.getByTestId("theater-timeline");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.2");
    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(slider).toHaveAttribute("aria-valuenow", "1.2");
    // 1.2 s is after Garen's first swing (1.176 s) — Ashe has taken it.
    expect(hpOf("A1")).toBe(Math.round(primary(rows[1]).hp_after));
    fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
    expect(hpOf("A1")).toBe(Math.round(full.effective_builds.A1.starting_hp));
    fireEvent.keyDown(slider, { key: "]" });
    expect(screen.getByTestId("transport-readout").textContent).toContain("event 2 / 7");
  });

  it("pointer scrubbing on the track seeks by fraction of the duration", () => {
    renderTheater();
    const track = screen.getByTestId("timeline-track");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000, top: 0, height: 50, right: 1000, bottom: 50, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    pointer(track, "pointerdown", 500);
    const half = full.duration / 2;
    expect(Number(screen.getByTestId("theater-timeline").getAttribute("aria-valuenow"))).toBeCloseTo(half, 2);
    // Half-way (4.17 s) is after seq 10 and seq 15 but before seq 17.
    expect(hpOf("B1")).toBe(Math.round(primary(rows[2]).hp_after));
    expect(hpOf("A1")).toBe(Math.round(primary(rows[3]).hp_after));
    pointer(track, "pointermove", 0);
    // Back at t = 0 the first beat (also at t = 0) has fired: Garen at seq-2 hp_after.
    expect(hpOf("B1")).toBe(Math.round(primary(rows[0]).hp_after));
    expect(hpOf("A1")).toBe(Math.round(full.effective_builds.A1.starting_hp));
    pointer(track, "pointerup", 0);
  });

  it("play advances the clock by accumulated rAF delta, independent of frame rate", () => {
    const run = (stepMs: number, frames: number) => {
      const view = renderTheater();
      fireEvent.click(screen.getByTestId("transport-play"));
      expect(screen.getByTestId("transport-play")).toHaveAttribute("aria-pressed", "true");
      flushFrames(1, 0); // first frame only records the timestamp
      flushFrames(frames, stepMs);
      const clock = screen.getByTestId("theater-clock").textContent;
      const b1 = hpOf("B1");
      const a1 = hpOf("A1");
      view.unmount();
      return { clock, b1, a1 };
    };
    const sixty = run(16, 150); // 2400 ms in 16 ms frames
    now = 1000;
    const thirty = run(32, 75); // 2400 ms in 32 ms frames
    expect(sixty.clock).toBe("2.400");
    expect(thirty).toEqual(sixty);
    // 2.4 s is just past Ashe's second shot (2.388 s): Garen at seq-10 hp_after.
    expect(sixty.b1).toBe(Math.round(primary(rows[2]).hp_after));
    expect(sixty.a1).toBe(Math.round(primary(rows[1]).hp_after));
  });

  it("speed 2× covers twice the fight time for the same wall time, and play stops at the end", () => {
    renderTheater();
    fireEvent.click(screen.getByTestId("speed-2"));
    fireEvent.click(screen.getByTestId("transport-play"));
    flushFrames(1, 0);
    flushFrames(75, 16); // 1200 ms wall → 2400 ms fight
    expect(screen.getByTestId("theater-clock").textContent).toBe("2.400");
    flushFrames(400, 16); // run out the clock
    expect(screen.getByTestId("theater-clock").textContent).toBe(full.duration.toFixed(3));
    expect(screen.getByTestId("transport-play")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("stage-result").textContent).toMatch(/Ashe wins/);
    expect(hpOf("B1")).toBe(0);
    fireEvent.click(screen.getByTestId("transport-restart"));
    expect(screen.getByTestId("theater-clock").textContent).toBe("0.000");
    expect(screen.getByTestId("transport-play")).toHaveAttribute("aria-pressed", "true");
    // Restart follows the clock from 0, where the first beat has already fired.
    expect(hpOf("B1")).toBe(Math.round(primary(rows[0]).hp_after));
    // Previous from the first beat shows the pre-fight state.
    fireEvent.click(screen.getByTestId("transport-prev"));
    expect(hpOf("B1")).toBe(Math.round(full.effective_builds.B1.starting_hp));
    expect(screen.getByTestId("transport-prev")).toBeDisabled();
  });

  it("a burst of Next presses inside one tick advances one beat per press", () => {
    renderTheater({ keyboardShortcuts: true });
    act(() => {
      for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
    });
    expect(screen.getByTestId("transport-readout").textContent).toContain("event 3 / 7");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
    });
    expect(screen.getByTestId("transport-readout").textContent).toContain("event 2 / 7");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(screen.getByTestId("transport-play")).toHaveAttribute("aria-pressed", "true");
  });

  it("honours forced reduced motion", () => {
    renderTheater({ forceReducedMotion: true });
    expect(screen.getByTestId("combat-theater")).toHaveAttribute("data-reduced", "true");
  });
});

describe("CombatTheater — Lux Q formula scene", () => {
  it("opens pinned on Lux Q and shows the verbatim formula, bindings and the engine result", () => {
    const calcRows = REAL_2V2_CALCULATION.events.filter((e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed"));
    const luxIndex = calcRows.findIndex((e) => e.actor_id === "A2" && e.action_id === "Q");
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <CombatTheater response={REAL_2V2_CALCULATION} initialBeatIndex={luxIndex} keyboardShortcuts={false} />
      </QueryClientProvider>
    );
    const ability = REAL_2V2_CALCULATION.events.find((e) => e.seq === calcRows[luxIndex].seq + 1)!;
    const metadata = (ability.payload as Record<string, Record<string, unknown>>).metadata;
    expect(screen.getByTestId("theater-stage").getAttribute("data-beat-seq")).toBe(String(calcRows[luxIndex].seq));
    expect(screen.getByTestId("formula-text").textContent).toBe(metadata.formula_text);
    expect(screen.getByTestId("formula-text").textContent).toContain("0,75 * AP");
    expect(screen.getByTestId("formula-substituted").textContent).toBe("(40 + 40 * 5 + 0,75 * 0) * 1");
    expect(screen.getByTestId("substitution-result").textContent).toContain("240");
    expect(screen.getByTestId("math-step-mitigation").textContent).toContain("Effective magic resist");
    expect(screen.getByTestId("math-step-shield").textContent).toMatch(/No shield/);
    expect(screen.getByTestId("cast-badge")).toBeInTheDocument();
    // Four portraits: Ashe & Lux vs Garen & Soraka.
    expect(screen.getAllByTestId(/^portrait-/)).toHaveLength(4);
  });
});
