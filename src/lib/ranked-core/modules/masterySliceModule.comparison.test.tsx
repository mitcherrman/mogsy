/**
 * JOURNEY COOLDOWN COMPARISON — the Reasoning Chain for a comparison child, in
 * the DOM, on the real JP5-backend captures (Pantheon Step 2: Leona E vs
 * Pantheon E; Volibear Step 5: Lee Sin R vs Volibear R).
 *
 *   * the two cooldowns are the SERVED `comparison_values.v1` displays, joined
 *     by the relation the served winner + operator state (checked, not decided,
 *     against the served values), over paired bars with the served margin;
 *   * Journey UI only: a Journey comparison never mounts the Data Duel;
 *   * nothing before the child settles; a reveal without the block (or one that
 *     contradicts itself) keeps the served explanation.
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
import { comparisonReasoning } from "@/lib/journey/reasoning";
import { readComparisonValues, type ComparisonValues } from "@/features/mastery/contracts/comparisonValues";
import { masterySliceModule } from "./masterySliceModule";

// Each case mounts the full Journey Viewport in jsdom (seconds under the parallel
// suite), as the sibling Journey DOM suites do.
vi.setConfig({ testTimeout: 25_000 });

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const PANTHEON = "jp5/pantheon.standard";
const VOLI = "jp5/voli.standard";
const LEGACY_VOLI = "m1/voli.standard";

type Wire = Record<string, unknown>;
const revealsOf = (s: CaptureSnapshot) =>
  ((s.envelope.payload as { segment_state: Wire }).segment_state.own_challenge_reveals as Wire[]);
/** A copy of the snapshot with child `index`'s reveal rewritten. */
const withReveal = (s: CaptureSnapshot, index: number, edit: (r: Wire) => void): CaptureSnapshot => {
  const copy = JSON.parse(JSON.stringify(s)) as CaptureSnapshot;
  edit(revealsOf(copy).find((r) => r.challenge_index === index)!);
  return copy;
};

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
const reveal = () => screen.getByTestId("journey-reveal");
const chain = () => screen.getByTestId("journey-compare-working");
const nodes = () => [...chain().querySelectorAll<HTMLElement>(".journey-node")];
const noDataDuel = () => expect(document.querySelector("[data-testid^='duel-']")).toBeNull();

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("a Journey cooldown comparison reveal draws the served values", () => {
  it("Pantheon Step 2: 12s Leona E < 22s Pantheon E, paired bars, the served 10s margin", () => {
    const s = snap(PANTHEON, "child1-reveal");
    expect(revealsOf(s).find((r) => r.challenge_index === 1)!.comparison_values).toBeTruthy();
    show(s);
    expect(reveal()).toHaveAttribute("data-working", "compare");
    expect(reveal()).toHaveAttribute("data-compare", "true");
    expect(reveal()).not.toHaveAttribute("data-unfold");
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Correct · Leona");
    expect(screen.getByTestId("journey-compare-working-subject")).toHaveTextContent("E cooldown — Rank 1");
    expect(nodes().map((n) => n.textContent)).toEqual(["12sLeona E", "22sPantheon E"]);
    expect(screen.getByTestId("journey-compare-working-op-b")).toHaveAttribute("data-op", "<");
    expect(screen.getByTestId("journey-compare-working-op-b")).toHaveTextContent("is less than");
    // The winner is the answer's node; the other is not.
    expect(screen.getByTestId("journey-compare-working-a")).toHaveClass("journey-node--final");
    expect(screen.getByTestId("journey-compare-working-b")).not.toHaveClass("journey-node--final");
    const a = screen.getByTestId("journey-compare-working-pair-a");
    const b = screen.getByTestId("journey-compare-working-pair-b");
    expect(Number(a.getAttribute("data-ratio"))).toBeCloseTo(12 / 22, 10);
    expect(b).toHaveAttribute("data-ratio", "1");
    expect(a.style.getPropertyValue("--jp-ratio")).toBe(a.getAttribute("data-ratio"));
    expect(a).toHaveAttribute("data-wins", "true");
    expect(b).not.toHaveAttribute("data-wins");
    expect(screen.getByTestId("journey-compare-working-pair-delta")).toHaveTextContent(/^10s shorter$/);
    expect(a).toContainElement(screen.getByTestId("journey-compare-working-pair-delta"));
    expect(screen.getByTestId("journey-compare-working-pair"))
      .toHaveAccessibleName("Leona 12s, Pantheon 22s: 10s shorter");
    // The chain replaces the prose; the backend's sentence is not repeated.
    expect(screen.queryByTestId("journey-reveal-explanation")).toBeNull();
    noDataDuel();
  });

  it("Volibear Step 5 (R): 110s Lee Sin R < 160s Volibear R, the served 50s margin", () => {
    show(snap(VOLI, "child4-reveal"));
    expect(reveal()).toHaveAttribute("data-working", "compare");
    expect(nodes().map((n) => n.textContent)).toEqual(["110sLee Sin R", "160sVolibear R"]);
    expect(screen.getByTestId("journey-compare-working-op-b")).toHaveAttribute("data-op", "<");
    expect(screen.getByTestId("journey-compare-working-pair-delta")).toHaveTextContent(/^50s shorter$/);
    expect(Number(screen.getByTestId("journey-compare-working-pair-a").getAttribute("data-ratio"))).toBeCloseTo(110 / 160, 10);
    noDataDuel();
  });

  it("right, wrong and timed out draw the same comparison (only the verdict differs)", () => {
    const s = snap(PANTHEON, "child1-reveal");
    const drawn = () => [nodes().map((n) => n.textContent), screen.getByTestId("journey-compare-working-pair-delta").textContent];
    show(s);
    const right = drawn();
    cleanup();
    show(withReveal(s, 1, (r) => { r.player_answer = "pantheon"; r.is_correct = false; }));
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Not quite · Leona");
    expect(drawn()).toEqual(right);
    cleanup();
    show(withReveal(s, 1, (r) => { r.player_answer = null; r.is_correct = false; }));
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Time's up · Leona");
    expect(drawn()).toEqual(right);
  });

  it("nothing before the child settles: the live comparison has no values and no chain", () => {
    show(snap(PANTHEON, "child1-live"));
    expect(screen.queryByTestId("journey-reveal")).toBeNull();
    expect(document.querySelector(".journey-pair")).toBeNull();
    expect(document.body.textContent).not.toMatch(/22s|12s/);
    noDataDuel();
  });
});

describe("fail closed: the served explanation stays", () => {
  it("a reveal with no comparison_values (a backend before DD1) keeps its prose", () => {
    show(snap(LEGACY_VOLI, "child4-reveal"));
    expect(reveal()).toHaveAttribute("data-working", "explanation");
    expect(document.querySelector(".journey-pair")).toBeNull();
    cleanup();
    show(withReveal(snap(PANTHEON, "child1-reveal"), 1, (r) => { delete r.comparison_values; }));
    expect(reveal()).toHaveAttribute("data-working", "explanation");
    expect(screen.getByTestId("journey-reveal-explanation")).toHaveTextContent(/Leona wins by 10 seconds/);
  });

  it("a block that contradicts the served winner draws no chain (values are checked, never trusted to decide)", () => {
    show(withReveal(snap(PANTHEON, "child1-reveal"), 1, (r) => {
      const cv = r.comparison_values as { sides: { value: number; display: string }[] };
      cv.sides[0].value = 30; cv.sides[0].display = "30";              // Leona 30s would not be shorter
    }));
    expect(reveal()).toHaveAttribute("data-working", "explanation");
    expect(document.querySelector(".journey-pair")).toBeNull();
  });
});

describe("comparisonReasoning (served values only)", () => {
  const cv = (over: Partial<Record<string, unknown>> = {}, a = 12, b = 22): ComparisonValues => readComparisonValues({
    contract: "comparison_values.v1",
    sides: [{ token: "leona", value: a, display: String(a) }, { token: "pantheon", value: b, display: String(b) }],
    unit: "seconds", unit_label: "seconds", display_precision: 1, operator: "lesser", delta: Math.abs(b - a),
    delta_display: String(Math.abs(b - a)), ...over,
  })!;
  const sides = { championA: "Leona", championB: "Pantheon", slot: "E", rank: 1 };

  it("the relation follows the served winner and operator", () => {
    expect(comparisonReasoning(cv(), sides, "leona", "tie")!.nodes[1].op).toBe("<");
    const longer = comparisonReasoning(cv({ operator: "greater" }), sides, "pantheon", "tie")!;
    expect(longer.nodes[1].op).toBe("<");
    expect(longer.pair!.delta).toBe("10s longer");
    expect(longer.pair!.rows.map((r) => r.wins)).toEqual([false, true]);
  });

  it("a tie is `=`, with no winner and no margin", () => {
    const tie = comparisonReasoning(cv({ delta: 0, delta_display: "0" }, 12, 12), sides, "tie", "tie")!;
    expect(tie.nodes[1].op).toBe("=");
    expect(tie.nodes.some((n) => n.final)).toBe(false);
    expect(tie.pair!.delta).toBeNull();
  });

  it("refuses what it cannot state: another unit, an unknown operator, an unknown winner, a contradiction", () => {
    expect(comparisonReasoning(cv({ unit: "hitpoints" }), sides, "leona", "tie")).toBeNull();
    expect(comparisonReasoning(cv({ operator: "closer" }), sides, "leona", "tie")).toBeNull();
    expect(comparisonReasoning(cv(), sides, "syndra", "tie")).toBeNull();
    expect(comparisonReasoning(cv(), sides, null, "tie")).toBeNull();
    expect(comparisonReasoning(cv(), sides, "pantheon", "tie")).toBeNull();
    expect(comparisonReasoning(cv({}, 12, 13), sides, "tie", "tie")).toBeNull();
  });

  it("no rank is written when none is shared", () => {
    expect(comparisonReasoning(cv(), { ...sides, rank: null }, "leona", "tie")!.subject!.text).toBe("E cooldown");
  });
});

describe("the stylesheet", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\r\n/g, "\n");
  it("a bar's fill is its served share and nothing else; reduced motion stills the pair", () => {
    expect(CSS).toMatch(/\.journey-pair__fill \{[^}]*width: calc\(var\(--jp-ratio\) \* 100%\);/);
    expect(CSS).toMatch(/html\.reduce-motion \.journey-pair \* \{ animation: none !important; transition: none !important; \}/);
  });
});
