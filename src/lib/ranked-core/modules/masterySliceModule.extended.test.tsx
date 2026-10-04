/**
 * JEXT — the 11-child Ashe vs Jinx EXTENDED Journey (admin preset
 * `admin.ashe_jinx_extended_journey`, backend 7c203aeb) through the ordinary
 * Journey arena, on a REAL backend capture (`__fixtures__/jext/`). Nothing here
 * is hand-written: the frontend must read the count (11), the plan
 * (`extended`) and the pooled clock (330 s) from the payload and assume none.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const SNAPS: CaptureSnapshot[] = JSON.parse(
  readFileSync(join(FIX, "jext/ashe_jinx.extended.json"), "utf8"));
const snap = (label: string) => {
  const s = SNAPS.find((x) => x.label === label);
  if (!s) throw new Error(label);
  return s;
};
type Wire = Record<string, unknown>;
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire }).segment_state;

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  const round = readPublicRound(s.envelope);
  return render(
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: (() => {}) as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("the real extended capture", () => {
  it("is eleven children on the `extended` plan with a pooled clock sized to the plan", () => {
    const first = (seg(snap("child0-live")).challenges as { journey: Wire }).journey;
    expect(first.plan).toBe("extended");
    expect(first.child_count).toBe(11);
    expect(seg(snap("child0-live")).challenge_count).toBe(11);
    // Children are served progressively: only the reached ones are on the wire.
    expect((first.children as unknown[]).length).toBe(1);
    const last = (seg(snap("child10-live")).challenges as { journey: Wire }).journey;
    expect((last.children as unknown[]).length).toBe(11);
    expect((last.open_delays_ms as unknown[]).length).toBe(11);
    // The two mid-Journey transitions (Pickaxe, level 6) are before children 4 and 6.
    expect((last.transitions as Wire[]).map((t) => t.before_child)).toEqual([4, 6]);
  });

  it("every captured snapshot parses through the ordinary public contract", () => {
    for (const s of SNAPS) expect(() => readPublicRound(s.envelope), s.label).not.toThrow();
    const round = readPublicRound(snap("child10-live").envelope);
    expect(round.segmentState?.journey?.childCount).toBe(11);
    expect(round.segmentState?.journey?.plan).toBe("extended");
  });
});

describe("progression reads the count from the payload", () => {
  const STEPS: Array<[number, string]> = [
    [0, "child0-live"], [3, "child3-live"], [4, "child4-live"], [5, "child5-live"],
    [8, "child8-live"], [9, "child9-live"], [10, "child10-live"],
  ];
  it.each(STEPS)("Step %i is shown as `Step N of 11`, with an 11-node path and the current node marked", (index, label) => {
    show(snap(label));
    expect(screen.getByTestId("journey-step")).toHaveTextContent(`Step ${index + 1} of 11`);
    const path = screen.getByTestId("journey-path");
    expect(path.querySelectorAll("li")).toHaveLength(11);
    for (let n = 0; n < 11; n += 1) {
      const state = screen.getByTestId(`journey-path-${n}`).getAttribute("data-state");
      expect(state, `${label} node ${n}`).toBe(n < index ? "done" : n === index ? "current" : "future");
    }
  });

  it("reaches Step 10 and Step 11 with an open question and its options", () => {
    for (const label of ["child9-open", "child10-open"]) {
      show(snap(label));
      expect(screen.getByTestId("journey-child")).toBeTruthy();
      expect(screen.getAllByRole("button").length).toBeGreaterThan(2);
      cleanup();
    }
  });

  it("the pooled clock is the plan's, not five children's: 330 s", () => {
    expect(seg(snap("child0-live")).active_time_ms).toBe(330_000);
  });

  it("the final reveal and the finish still render the board at Step 11 of 11", () => {
    show(snap("child10-reveal-late"));
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 11 of 11");
    cleanup();
    show(snap("finished"));
    expect(screen.getByTestId("journey-board")).toBeTruthy();
  });
});

describe("no child-count ceiling on the live path (JLONG-INT)", () => {
  // `contract.ts` `readJourneyPublicState` still caps `journey.public.v0` at
  // 1–12 steps, but nothing on the wire speaks v0: a live Journey is read by
  // `readJourneyJ3` (no maximum) and adapted into the board directly. This pins
  // that a Journey longer than twelve children reaches the board unclamped.
  const widen = (s: CaptureSnapshot, n: number): CaptureSnapshot => {
    const copy = JSON.parse(JSON.stringify(s)) as CaptureSnapshot;
    const ss = seg(copy);
    ss.challenge_count = n;
    (ss.challenges as { journey: Wire }).journey.child_count = n;
    return copy;
  };

  it.each([13, 16])("a %i-child Journey parses and draws `Step 11 of %i` with every path node", (n) => {
    const s = widen(snap("child10-live"), n);
    const round = readPublicRound(s.envelope);
    expect(round.segmentState?.journey?.childCount).toBe(n);
    show(s);
    expect(screen.getByTestId("journey-step")).toHaveTextContent(`Step 11 of ${n}`);
    expect(screen.getByTestId("journey-path").querySelectorAll("li")).toHaveLength(n);
  });
});
