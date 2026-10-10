/**
 * JATTN1 — THE ONE-TIME BOARD COACH, on REAL captures through the production
 * module. It replaces JP4/JP5's portrait-only coach:
 *
 *   * it is armed by the FIRST fact the board saves — any fact (an ability's
 *     cooldown, formula or raw damage), not only a portrait stat;
 *   * it shows only in clock-free Journey time (a reveal hold / the beat
 *     after it) with enough of it left to be read, else waits for the next
 *     clock-free window — and it is gone by the instant an answer window opens;
 *   * once per browser (Mogzy Guide storage, a new Journey key), never on a
 *     reload, compact Mogzy-faced pill, `role="status"`, no focus taken;
 *   * pointer / fine copy differ; tap, Escape and any board interaction
 *     dismiss it; it waits while a board popover is open.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import {
  BOARD_COACH_COPY, BOARD_COACH_KEY, BOARD_COACH_MIN_MS, BOARD_COACH_TTL_MS, resetKnowledgeCoach,
} from "@/components/journey/useKnowledgeCoach";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
type Wire = Record<string, unknown>;
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire | null }).segment_state;

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: (() => {}) as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
const ordered = (n: string) => load(n).filter((s) => seg(s) !== null).map((s, i) => [s, i] as const)
  .sort(([x, i], [y, j]) => Date.parse(x.at) - Date.parse(y.at) || i - j).map(([s]) => s);
/** Poll from `from` to `to`, `visit` after each snapshot; returns the render. */
function play(n: string, from: string, to: string, visit: (s: CaptureSnapshot) => void = () => {}) {
  const all = ordered(n);
  const run = all.slice(all.findIndex((s) => s.label === from), all.findIndex((s) => s.label === to) + 1);
  vi.setSystemTime(Date.parse(run[0].at));
  const r = render(view(run[0]));
  visit(run[0]);
  for (let i = 1; i < run.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(run[i].at) - Date.parse(run[i - 1].at)); });
    vi.setSystemTime(Date.parse(run[i].at));
    r.rerender(view(run[i]));
    visit(run[i]);
  }
  return r;
}
const coach = () => screen.queryByTestId("journey-know-coach");
/** The client instant this snapshot's next answer window opens (null: one is open). */
const nextOpen = (s: CaptureSnapshot) => {
  const st = seg(s) as { own_card_started_at?: string | null; own_finished?: boolean };
  const at = st.own_card_started_at ? Date.parse(st.own_card_started_at) : Number.NaN;
  return st.own_finished ? Infinity : at > Date.parse(s.at) ? at : null;
};
const mockCoarse = (coarse: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === "(pointer: coarse)", media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const REF = "jattn1/zed_ahri.reference";
const EXT = "jattn1/ashe_jinx.extended";
const SURVIVAL = "jattn1/voli.survival";
const DAILY = "jattn1/voli.standard";
const realMatchMedia = window.matchMedia;

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); mockCoarse(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); window.matchMedia = realMatchMedia; });

describe("the trigger: the first SAVED fact — any fact", () => {
  it("Ashe W's cooldown (an ability) arms it; its 1.75s reveal is too short, so it waits for Step 2's reveal", () => {
    expect(BOARD_COACH_MIN_MS).toBe(2000);
    const seen: string[] = [];
    play(EXT, "child0-live", "child1-reveal-end", (s) => { if (coach()) seen.push(s.label); });
    // Step 1's reveal (cooldown, 1750ms, no beat): armed, deferred.
    expect(seen.some((l) => l.startsWith("child0"))).toBe(false);
    // Step 2's reveal (raw damage, 4000ms): shown — only during it.
    expect(seen).toEqual(["child1-reveal", "child1-reveal-late", "child1-reveal-compressed", "child1-reveal-end"]
      .filter((l) => load(EXT).some((x) => x.label === l)));
    const c = coach()!;
    expect(c).toHaveTextContent(BOARD_COACH_COPY.fine);
    expect(c).toHaveAttribute("role", "status");
    expect(c.querySelector('img[data-mogzy-art-category="mascot"]')).not.toBeNull();   // Mogzy's face
    expect(c.contains(document.activeElement)).toBe(false);                           // no focus taken
    expect(window.localStorage.getItem(BOARD_COACH_KEY)).toBe("1");
  });

  it("the reference Journey: Zed E's formula arms it (no portrait stat yet), Step 2's raw reveal shows it", () => {
    const seen: string[] = [];
    play(REF, "child0-live", "child1-reveal", (s) => { if (coach()) seen.push(s.label); });
    expect(seen).toEqual(["child1-reveal"]);
    expect(screen.queryByTestId("journey-portrait-popup-subject-mark")).toBeNull();
  });

  it("a reload mid-Journey (even mid-reveal) never brings it", () => {
    play(EXT, "child1-reveal", "child1-reveal-end");
    expect(coach()).toBeNull();
  });
});

describe("never on the clock", () => {
  it.each([["Daily Standard", DAILY], ["Survival", SURVIVAL], ["admin extended", EXT]])(
    "%s: absent whenever an answer window is open, and gone by the instant the next one opens", (_h, n) => {
      let shown = 0;
      play(n, ordered(n)[0].label, "finished", (s) => {
        const free = nextOpen(s);
        if (free === null) expect(coach(), `${n} ${s.label}`).toBeNull();
        if (coach()) {
          shown++;
          // Its own end is never later than the window's (the TTL is capped by it).
          expect(free, `${n} ${s.label}`).not.toBeNull();
        }
      });
      expect(shown, n).toBeGreaterThan(0);
    });

  it("the cap: shown with 3.5s of clock-free time left, it leaves at the next card's open, not at its 7s TTL", () => {
    const all = ordered(EXT);
    const reveal = all.find((s) => s.label === "child1-reveal")!;
    play(EXT, "child0-live", "child1-reveal");
    expect(coach()).not.toBeNull();
    const until = nextOpen(reveal)! - Date.parse(reveal.at);
    expect(until).toBeLessThan(BOARD_COACH_TTL_MS);
    act(() => { vi.advanceTimersByTime(until - 20); });
    expect(coach()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(40); });
    expect(coach()).toBeNull();
  });
});

describe("armed only by a genuine Saved fact", () => {
  it("a 6s damage-after-armor reveal saves nothing the board keeps: no coach, nothing stored; the next real Save brings it", () => {
    // Mount after the earlier facts exist (seeded silently), then play Step 4's
    // after-armor reveal: plenty of clock-free time, but nothing saved.
    const seen: string[] = [];
    play(EXT, "child3-live", "child3-reveal-end", (s) => { if (coach()) seen.push(s.label); });
    expect(seen).toEqual([]);
    expect(window.localStorage.getItem(BOARD_COACH_KEY)).toBeNull();
    cleanup();
    // Step 5's raw damage IS a board fact (Ashe W's `!`): that reveal arms and shows it.
    play(EXT, "child4-live", "child4-reveal", (s) => { if (coach()) seen.push(s.label); });
    expect(seen).toEqual(["child4-reveal"]);
  });
});

describe("placement: docked inside the board, over its own header line", () => {
  it("is a child of the board (no portal), so it can cover neither the match header nor the question", () => {
    play(EXT, "child0-live", "child1-reveal");
    const c = coach()!;
    expect(c.parentElement).toBe(screen.getByTestId("journey-board"));
    expect(screen.getByTestId("journey-question").contains(c)).toBe(false);
  });
});

describe("frequency, copy, dismissal", () => {
  it("once per browser: a second Journey never shows it", () => {
    const r = play(EXT, "child0-live", "child1-reveal");
    expect(coach()).not.toBeNull();
    r.unmount();
    play(DAILY, ordered(DAILY)[0].label, "finished", (s) => expect(coach(), s.label).toBeNull());
  });

  it("a coarse pointer gets the tap copy; nothing about hovering", () => {
    mockCoarse(true);
    play(EXT, "child0-live", "child1-reveal");
    expect(coach()).toHaveTextContent(BOARD_COACH_COPY.coarse);
    expect(coach()!.textContent).not.toMatch(/hover/i);
  });

  it("dismissed by a tap on it", () => {
    play(EXT, "child0-live", "child1-reveal");
    fireEvent.pointerDown(coach()!);
    expect(coach()).toBeNull();
  });

  it("dismissed by Escape", () => {
    play(EXT, "child0-live", "child1-reveal");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(coach()).toBeNull();
  });

  it("dismissed by interacting with the board (a highlighted object)", () => {
    play(EXT, "child0-live", "child1-reveal");
    fireEvent.pointerDown(screen.getByTestId("journey-know-subject-W"));
    expect(coach()).toBeNull();
    // It does not come back in this Journey.
    play(EXT, "child1-reveal-late", "child2-reveal");
    expect(coach()).toBeNull();
  });

  it("waits while a board popover is open, and starts when it closes (time permitting)", async () => {
    const all = ordered(EXT);
    const i = all.findIndex((s) => s.label === "child1-reveal");
    // Arm it at Step 1's reveal, then open W's `!` card before Step 2's reveal lands.
    const r = play(EXT, "child0-live", all[i - 1].label);
    fireEvent.click(screen.getByTestId("journey-know-subject-W"));
    expect(screen.getByTestId("journey-know-subject-W")).toHaveAttribute("data-state", "open");
    act(() => { vi.advanceTimersByTime(Date.parse(all[i].at) - Date.parse(all[i - 1].at)); });
    vi.setSystemTime(Date.parse(all[i].at));
    r.rerender(view(all[i]));
    expect(coach()).toBeNull();
    // A second click un-pins and closes the card; the board notices (a DOM observer).
    fireEvent.click(screen.getByTestId("journey-know-subject-W"));
    expect(screen.getByTestId("journey-know-subject-W")).not.toHaveAttribute("data-state", "open");
    await act(async () => { await Promise.resolve(); });
    expect(coach()).not.toBeNull();
  });
});
