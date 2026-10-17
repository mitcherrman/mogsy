/**
 * MISC-W1B F08 — THE STATED ABILITY REFERENCE in the DOM, on REAL captures
 * (`__fixtures__/jattn1/`), through the production module exactly as every
 * host draws it.
 *
 * Daily S-A "Pantheon vs Leona": c3 (Step 3, child index 2) STATES Pantheon E's
 * formula as its premise (`learner.states`, `formula: state`); c4 and c5 RECALL
 * it (`learner.established`, `source: "stated"`). K2 marks only REVEALED facts,
 * so before F08 nothing on the board let the learner look the formula up again
 * in c4 / c5 — the highlighted E tile was inert.
 *
 *   the disclosure window opens at c3's open (the child first served with
 *   its premise) and never earlier; the E tile itself is the control; its
 *   card is the served formula verbatim, "stated Step 3" (never "learned");
 *   no `!` for a merely stated fact; no unanswered value in the card; an
 *   ability that already wears a revealed formula's `!` gets no second button.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
type Wire = Record<string, unknown>;
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const answersOf = (n: string) => {
  const [dir, file] = n.split("/");
  return JSON.parse(readFileSync(join(FIX, dir, "answers", `${file}.answers.json`), "utf8")) as
    { index: number; correct_answer: string; answer_options: string[] }[];
};
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
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
function show(n: string, label: string) {
  const s = snap(n, label);
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s));
}
/** From `from` to `to` (labels), polling as a client does. */
function play(n: string, from: string, to: string) {
  const all = load(n).filter((s) => seg(s) !== null).map((s, i) => [s, i] as const)
    .sort(([x, i], [y, j]) => Date.parse(x.at) - Date.parse(y.at) || i - j).map(([s]) => s);
  const run = all.slice(all.findIndex((s) => s.label === from), all.findIndex((s) => s.label === to) + 1);
  vi.setSystemTime(Date.parse(run[0].at));
  const r = render(view(run[0]));
  for (let i = 1; i < run.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(run[i].at) - Date.parse(run[i - 1].at)); });
    vi.setSystemTime(Date.parse(run[i].at));
    r.rerender(view(run[i]));
  }
  return r;
}
const q = (id: string) => screen.queryByTestId(id);
const REFS = () => [...document.querySelectorAll<HTMLElement>('[data-testid^="journey-ability-ref-"]')]
  .map((e) => e.dataset.testid!).filter((id) => !id.endsWith("-pop")).sort();

const PAN = "jattn1/pantheon.standard";

/** The answer and every option the served formula does not itself print: absent (whole numbers). */
function expectAnswerSafe(text: string, child: { correct_answer: string; answer_options: string[] }) {
  const printed = new Set(text.match(/\d+(?:\.\d+)?/g) ?? []);
  const formula = new Set([55, 105, 155, 205, 255, 100, 150].map(String));
  expect(printed.has(child.correct_answer)).toBe(false);
  for (const v of child.answer_options) if (!formula.has(v)) expect(printed.has(v), v).toBe(false);
}
const E_REF = "journey-ability-ref-subject-E";

vi.setConfig({ testTimeout: 25_000 });
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("F08 — Pantheon E's stated formula is inspectable from its own tile", () => {
  it("nothing before the formula is first stated (c1, c2, the c2 reveal)", () => {
    for (const label of ["child0-leadin", "child0-live", "child1-live", "child1-reveal-end"]) {
      cleanup();
      show(PAN, label);
      expect(REFS(), label).toEqual([]);
    }
  });

  it("the window opens with c3 (the child that states it) and stays through c4 and c5, beats included", () => {
    for (const label of ["child2-open", "child2-live", "child2-reveal-end", "child3-beat", "child3-live",
      "child3-reveal-end", "child4-beat", "child4-live", "child4-reveal-end", "finished"]) {
      cleanup();
      show(PAN, label);
      expect(REFS(), label).toEqual([E_REF]);
    }
  });

  it("c4: tapping the highlighted E tile opens the served formula, stated Step 3 — no `!`, no answer", () => {
    show(PAN, "child3-live");
    const host = q("journey-ability-host-subject-E")!;
    expect(q("journey-ability-subject-E")).toHaveAttribute("data-relevant", "true");
    const btn = q(E_REF)!;
    expect(host.contains(btn)).toBe(true);                         // the tile itself, not a corner badge
    expect(q("journey-know-subject-E")).toBeNull();                // stated ≠ saved: no `!`
    expect(btn).toHaveAccessibleName(/Pantheon E.*Aegis Assault.*formula.*stated Step 3/i);
    fireEvent.click(btn);
    const pop = q(`${E_REF}-pop`)!;
    expect(pop).toBeInTheDocument();
    const text = pop.textContent!;
    expect(text).toMatch(/55 \/ 105 \/ 155 \/ 205 \/ 255/);
    expect(text).toMatch(/100% total AD/);
    expect(text).toMatch(/150% bonus AD/);
    expect(text).toMatch(/physical/i);
    expect(text).toMatch(/stated Step 3/);
    expect(text).not.toMatch(/learned/i);
    // The current rank is the one the board shows (rank 1 in c4).
    expect(pop.querySelector('[data-current="true"]')?.textContent).toBe("55");
    // Answer-safe: c4's served answer never appears, nor any option the
    // served formula does not itself print (a distractor of 55 IS rank 1's base).
    expectAnswerSafe(text, answersOf(PAN)[3]);
  });

  it("c5: the same reference survives Leona's armor, the level-up and Pantheon's Long Sword", () => {
    show(PAN, "child4-live");
    fireEvent.click(q(E_REF)!);
    const text = q(`${E_REF}-pop`)!.textContent!;
    expect(text).toMatch(/55 \/ 105 \/ 155 \/ 205 \/ 255/);
    expect(text).toMatch(/stated Step 3/);
    expectAnswerSafe(text, answersOf(PAN)[4]);
  });

  it("keyboard: Enter opens it, a second Enter closes it, Escape closes it", () => {
    show(PAN, "child3-live");
    const btn = q(E_REF)!;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.click(btn);                                          // a button's Enter is its click
    expect(q(`${E_REF}-pop`)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(q(`${E_REF}-pop`)).toBeNull();
    fireEvent.click(btn);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(q(`${E_REF}-pop`)).toBeNull();
  });

  // Mouse hover-preview needs a real PointerEvent (`pointerType`), which jsdom
  // lacks: it is proven in the browser (handoff). Here: tap pins, tap closes.
  it("a tap pins it open, a second tap closes it, and the tile keeps its box", () => {
    show(PAN, "child3-live");
    const btn = q(E_REF)!;
    expect(btn).toHaveClass("journey-ref-btn");                    // inset: 0 over the host: no layout
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("data-state", "open");
    fireEvent.click(btn);
    expect(q(`${E_REF}-pop`)).toBeNull();
  });

  it("played live c3 → c5 (beats, reveals, the open of each child): opens nothing by itself, the tile stays put", () => {
    play(PAN, "child2-live", "child4-live");
    expect(REFS()).toEqual([E_REF]);
    expect(document.querySelector('[data-testid$="-pop"]')).toBeNull();
  });

  it("Leona's E (the other side) and Pantheon's other abilities get no reference", () => {
    show(PAN, "child3-live");
    expect(q("journey-ability-ref-opponent-E")).toBeNull();
    for (const s of ["Q", "W", "R"]) expect(q(`journey-ability-ref-subject-${s}`)).toBeNull();
  });
});

describe("F08 — the same rule for other champions", () => {
  it("Volibear Q: stated at Step 2 and restated at Step 4 — the card cites the latest statement", () => {
    show("jattn1/voli.standard", "child4-live");
    // Q also wears a `!` here (a revealed fact): the `!` is its one control.
    expect(REFS()).toEqual([]);
    fireEvent.click(q("journey-know-subject-Q")!);
    expect(q("journey-know-subject-Q-ref-formula")!.textContent).toMatch(/stated Step 4/);
    cleanup();
    show("jattn1/voli.standard", "child0-live");
    expect(REFS()).toEqual([]);
  });

  it("Ashe W already wears a `!` (its cooldown, revealed Step 1): the `!` stays the one control and its card gains the stated formula", () => {
    for (const n of ["jattn1/ashe_jinx.extended", "jattn1/ashe_jinx.extended.wrong"]) {
      cleanup();
      show(n, "child0-live");
      expect(REFS(), n).toEqual([]);
      cleanup();
      show(n, "child2-live");
      expect(REFS(), n).toEqual([]);                               // no second button over W
      const mark = q("journey-know-subject-W")!;
      fireEvent.click(mark);
      const pop = q("journey-know-subject-W-pop")!;
      // The learned lines are K2's alone: the statement adds none of them.
      const learned = pop.querySelector(".journey-know-pop__lines")!.textContent!;
      expect(learned, n).toMatch(/learned Step 1/);
      expect(learned, n).not.toMatch(/stated/);
      expect(q("journey-know-subject-W-ref-formula")!.textContent, n).toMatch(/stated Step 2/);
    }
  });

  it("Zed E's formula was REVEALED (its `!`): no second, competing stated-reference button — right, wrong or timeout", () => {
    for (const n of ["jattn1/zed_ahri.reference", "jattn1/zed_ahri.reference.wrong", "jattn1/zed_ahri.reference.timeout"]) {
      cleanup();
      show(n, "child2-live");
      expect(q("journey-know-subject-E"), n).toBeInTheDocument();
      expect(REFS(), n).toEqual([]);
    }
  });

  it("a Journey with no formula anywhere (Ahri survival) draws no reference", () => {
    show("jattn1/ahri.survival", "child2-live");
    expect(REFS()).toEqual([]);
  });
});
