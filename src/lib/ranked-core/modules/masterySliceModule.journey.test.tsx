/**
 * JOURNEY-UI2 — the Journey module on REAL J2 captures (`lib/journey/__fixtures__/j2`),
 * through the production parser and the production `masterySliceModule` viewport.
 *
 * Server time is pinned to each capture's own instant (system time = `at`,
 * skew 0), so a beat is exactly as long as the server made it. The answer-leak
 * assertions use the private answers the capture recorded, to prove what is
 * NOT on screen.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { masterySliceModule } from "./masterySliceModule";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j2");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const answersOf = (n: string): { index: number; correct_answer: unknown }[] =>
  JSON.parse(readFileSync(join(DIR, "answers", `${n}.answers.json`), "utf8"));
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: () => {}, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
/** A fresh mount at one capture (what a refresh would see). */
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s));
}
/**
 * Play captures IN ORDER, the way a client polls: each is rendered at its own
 * instant, and fake time advances by the captured gap in between, so the
 * module's own reveal hold runs and ends exactly as it would live.
 */
function play(n: string, upTo: string) {
  const all = load(n);
  const end = all.findIndex((x) => x.label === upTo);
  if (end < 0) throw new Error(`${n}: ${upTo}`);
  const seq = all.slice(all.findIndex((x) => x.label === "child0-live"), end + 1);
  vi.setSystemTime(Date.parse(seq[0].at));
  const r = render(view(seq[0]));
  for (let i = 1; i < seq.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(seq[i].at) - Date.parse(seq[i - 1].at)); });
    vi.setSystemTime(Date.parse(seq[i].at));
    r.rerender(view(seq[i]));
  }
  return r;
}
/** Let the module's local reveal hold (one reveal window) run out. */
const afterReveal = () => act(() => { vi.advanceTimersByTime(2_000); });
const text = () => document.body.textContent ?? "";

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("one board for the whole Journey module", () => {
  it("persists across children: the same band node from child 1 to child 5", () => {
    const n = "olaf.standard.v2";
    const all = load(n);
    const from = all.findIndex((x) => x.label === "child0-live");
    vi.setSystemTime(Date.parse(all[from].at));
    const { rerender } = render(view(all[from]));
    const band = screen.getByTestId("scenario-hero");
    expect(band).toHaveAttribute("data-band-kind", "journey");
    for (let i = from + 1; i < all.length; i++) {
      act(() => { vi.advanceTimersByTime(Date.parse(all[i].at) - Date.parse(all[i - 1].at)); });
      vi.setSystemTime(Date.parse(all[i].at));
      rerender(view(all[i]));
      expect(screen.getByTestId("scenario-hero"), all[i].label).toBe(band);
    }
    afterReveal();
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 5 of 5");
  });

  it("owns the media region: the child draws no scenario band of its own and no motif art", () => {
    show(snap("olaf.standard.v2", "child2-open"));
    expect(screen.getAllByTestId("scenario-hero")).toHaveLength(1);
    expect(screen.queryByTestId("mastery-slice-opponent-progress")).toBeNull();
  });

  it("ordinary slices are untouched: no Journey block → no board, the old header line", () => {
    const s = snap("olaf.standard.v2", "child1-open");
    const e = JSON.parse(JSON.stringify(s.envelope));
    delete e.payload.segment_state.challenges.journey;
    const round = readPublicRound(e);
    vi.setSystemTime(Date.parse(s.at));
    render(
      <QueryClientProvider client={queryClient}>
        <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
          permissions={NO_INTERACTIONS} onSelect={() => {}}
          actions={{ submitChallenge: () => {}, busy: false, error: null }} skewMs={0} />
      </QueryClientProvider>);
    expect(screen.queryByTestId("journey-stage")).toBeNull();
    expect(screen.getByTestId("mastery-slice-opponent-progress")).toBeInTheDocument();
  });
});

describe("answer leaks — the reached prefix only", () => {
  const n = "olaf.standard.v2";

  it("future child text is never rendered", () => {
    show(snap(n, "child1-open"));
    // Child 3 (Combat) states 54.17 armor and the 70/120/170 formula; child 5 names Caulfield's.
    expect(text()).not.toMatch(/54\.17|Undertow \(Q\) physical|Caulfield/);
    expect(screen.queryAllByTestId("journey-child")).toHaveLength(1);
  });

  it("a future item transition is not rendered before its beat — then it is", () => {
    show(snap(n, "child2-open"));
    expect(text()).not.toContain("Caulfield");
    cleanup();
    show(snap(n, "child3-beat"));
    expect(within(screen.getByTestId("journey-board")).getByTestId("journey-item-subject-0"))
      .toHaveAttribute("aria-label", expect.stringContaining("Caulfield's Warhammer"));
  });

  it("current child premises do not appear before the child is reached", () => {
    show(snap(n, "child1-open"));
    expect(screen.queryByTestId("journey-combat-premise")).toBeNull();
    cleanup();
    show(snap(n, "child2-open"));
    afterReveal();
    expect(screen.getByTestId("journey-combat-target_armor")).toHaveTextContent("54.17");
  });

  it("a withheld asked stat is `?` on the board AND in the State sheet — its value in neither", () => {
    const v = "volibear.standard.v2";
    const answer = String(answersOf(v)[0].correct_answer);   // Garen's L3 armor, as asked
    show(snap(v, "child0-live"));
    const board = screen.getByTestId("journey-board");
    expect(within(board).getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "withheld");
    expect(board.textContent).not.toContain(answer);
    fireEvent.click(screen.getByTestId("journey-open-state"));
    const sheet = screen.getByTestId("journey-state-sheet");
    expect(within(sheet).getByTestId("journey-sheet-stat-opponent-armor")).toHaveTextContent("asked in this question");
    expect(sheet.textContent).not.toContain(answer);
    expect(sheet.textContent).not.toContain("44.195");
    // J2 publishes no max rank and no ability names: the sheet never prints a gap.
    expect(sheet.textContent).not.toMatch(/null|undefined|— ·/);
    expect(within(sheet).getByTestId("journey-sheet-ability-subject-Q")).toHaveTextContent(/^Qrank 1$/);
  });

  it("a fact revealed earlier may appear later — when the backend states it", () => {
    const v = "volibear.standard.v2";
    show(snap(v, "child0-live"));
    expect(text()).not.toContain("44.195");
    cleanup();
    show(snap(v, "child2-open"));
    afterReveal();
    expect(screen.getByTestId("journey-combat-target_armor")).toHaveTextContent("44.195");
  });

  it.each(["olaf.standard.v2", "volibear.standard.v2", "zed.standard.v2",
    "lucian.standard.v2", "senna.standard.v2", "ahri.standard.v2"])(
    "%s: no unanswered child's answer is on screen while it is being asked", (name) => {
      const answers = answersOf(name);
      for (const s of load(name).filter((x) => /-(open|live)$/.test(x.label) && x.label !== "child0-open")) {
        const i = Number(/child(\d)/.exec(s.label)![1]);
        const a = String(answers[i].correct_answer);
        const numeric = typeof answers[i].correct_answer === "number";
        const { unmount } = show(s);
        const board = screen.getByTestId("journey-board").textContent ?? "";
        const sheetBtn = screen.getByTestId("journey-open-state");
        fireEvent.click(sheetBtn);
        const sheet = screen.getByTestId("journey-state-sheet").textContent ?? "";
        // Single-choice answers are, by design, among the offered options; the
        // board and the sheet must still never carry them. A numeric answer
        // must appear nowhere at all.
        if (/^\d+(\.\d+)?$/.test(a) && a.length > 1) {
          expect(board, `${name} ${s.label}`).not.toContain(a);
          expect(sheet, `${name} ${s.label}`).not.toContain(a);
        }
        if (numeric) expect(text(), `${name} ${s.label}`).not.toContain(String(a));
        unmount();
      }
    });
});

describe("the server-timed transition beat", () => {
  it("during the beat the next child does not exist: veiled placeholder, marks on the board", () => {
    const s = snap("olaf.standard.v2", "child3-beat");
    play("olaf.standard.v2", "child3-beat");
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "active");
    expect(screen.getByTestId("journey-next-pending")).toHaveAttribute("data-child-index", "3");
    expect(screen.queryByTestId("journey-child")).toBeNull();
    expect(screen.getByTestId("journey-beat")).toHaveTextContent("Recall");
    expect(screen.getByTestId("journey-item-subject-0")).toHaveAttribute("data-new", "true");
    // The beat ends at the SERVER's open instant, not on a client timer.
    const opens = Date.parse((s.envelope.payload as { segment_state: { own_card_started_at: string } })
      .segment_state.own_card_started_at);
    expect(Date.now()).toBeLessThan(opens);
    act(() => { vi.advanceTimersByTime(opens - Date.now() + 5); });
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    // Still no question: only the next poll exposes the child.
    expect(screen.queryByTestId("journey-child")).toBeNull();
    expect(screen.getByTestId("journey-next-pending")).toHaveTextContent(/opening|opens/);
  });

  it("the next poll exposes the child; the purchase stays marked through it", () => {
    play("olaf.standard.v2", "child3-open");
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    expect(screen.getByTestId("journey-child")).toBeInTheDocument();
    expect(screen.getByTestId("journey-item-subject-0")).toHaveAttribute("data-new", "true");
  });

  it("a level-6 beat raises both levels and unlocks both Rs, as served", () => {
    play("volibear.standard.v2", "child4-beat");
    expect(screen.getByTestId("journey-level-subject")).toHaveAttribute("data-changed", "true");
    expect(screen.getByTestId("journey-ability-subject-R")).not.toHaveAttribute("data-locked");
    expect(screen.getByTestId("journey-ability-opponent-R")).toHaveAttribute("data-changed", "true");
    expect(screen.getByTestId("journey-beat")).toHaveTextContent(/Ultimate unlocked/i);
  });

  it("between a reveal and the next child, the Journey never says it is complete", () => {
    const s = snap("olaf.standard.v2", "child2-reveal");
    show(s);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByText(/Mastery Slice complete/)).toBeNull();
    expect(screen.getByTestId("journey-next-pending")).toBeInTheDocument();
  });
});

describe("Matchup and Combat render the served per-side premises", () => {
  it("Matchup: each side's own ability and rank (rank 1 vs same at every rank)", () => {
    show(snap("volibear.standard.v2", "child1-open"));
    afterReveal();
    // The backend's A side is Garen (E at rank 1), B is Volibear (E flat).
    expect(screen.getByTestId("journey-matchup-side-a")).toHaveTextContent(/Garen.*Judgment \(E\).*rank 1/);
    expect(screen.getByTestId("journey-matchup-side-b")).toHaveTextContent(/Volibear.*\(E\).*same at every rank/);
    // …drawn in the BOARD's order: the Journey's player (Volibear) on the left.
    const strip = screen.getByTestId("journey-matchup-sides");
    expect([...strip.querySelectorAll("[data-champion]")].map((e) => e.getAttribute("data-champion")))
      .toEqual(["Volibear", "Garen"]);
    // The prompt names each side's rank, never one shared rank.
    expect(screen.getByTestId("mastery-question-heading").textContent).not.toMatch(/^At rank 1,/);
    expect(screen.getByTestId("mastery-question-heading")).toHaveTextContent(/\[rank 1\].*\[same at every rank\]/);
  });

  it("Combat, stated: attacker, rank, stats, target armor and the served formula — no arithmetic", () => {
    show(snap("olaf.standard.v2", "child2-open"));
    afterReveal();
    const p = screen.getByTestId("journey-combat-premise");
    expect(within(p).getByTestId("journey-combat-ability")).toHaveTextContent("Undertow · rank 3");
    expect(within(p).getByTestId("journey-combat-bonus_attack_damage")).toHaveTextContent("0");
    expect(within(p).getByTestId("journey-combat-target_armor")).toHaveTextContent("54.17");
    const f = within(p).getByTestId("journey-combat-formula");
    expect(f.querySelector("[data-formula='stated']")).not.toBeNull();
    expect(f).toHaveTextContent("70 / 120 / 170 / 220 / 270");
    expect(f).toHaveTextContent("+ 100% bonus attack damage");
    expect(f.querySelector("[data-rank-value='3']")!.className).toContain("underline");
  });

  it("Combat, recalled: the formula's numbers are NOT restated; the teaching step is named", () => {
    show(snap("olaf.standard.v2", "child4-open"));
    afterReveal();
    const f = screen.getByTestId("journey-combat-formula");
    expect(f.querySelector("[data-formula='recalled']")).not.toBeNull();
    expect(f).toHaveTextContent("stated in step 3");
    expect(text()).not.toMatch(/70 \/ 120|170 \/ 220/);
    expect(screen.getByTestId("journey-combat-bonus_attack_damage")).toHaveTextContent("20");
    expect(screen.getByTestId("journey-reinforces")).toHaveTextContent("Builds on step 3");
  });

  it("the Combat reveal is the backend's text, verbatim — no local derivation", () => {
    show(snap("olaf.standard.v2", "child2-reveal"));
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent("110.268 damage, which rounds to 110");
  });
});

describe("Survival: strike 3 mid-Journey", () => {
  it("the stopped view is the played prefix: no pending child, no transition, no future child", () => {
    const s = snap("volibear.survival.stop", "child1-reveal");
    expect((s.envelope.payload as { ruleset: { own_stage_finished: boolean } }).ruleset.own_stage_finished).toBe(true);
    show(s);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByTestId("journey-beat")).toBeNull();
    expect(screen.queryByTestId("journey-next-pending")).toBeNull();
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 2 of 3");
    const answers = answersOf("volibear.survival.stop");
    expect(text()).not.toContain(String(answers[2].correct_answer));
  });
});
