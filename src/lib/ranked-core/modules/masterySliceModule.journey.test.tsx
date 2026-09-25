/**
 * JOURNEY-UI3 — the Journey module on REAL J3 captures (`lib/journey/__fixtures__/j3`),
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

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j3");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const answersOf = (n: string): { index: number; correct_answer: unknown }[] =>
  JSON.parse(readFileSync(join(DIR, "answers", `${n}.answers.json`), "utf8"));
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
/** The captures whose match is still live (a settled match has no segment state to render). */
const live = (n: string) => load(n).filter((s) =>
  (s.envelope.payload as { segment_state: unknown }).segment_state !== null);

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
  const all = live(n);
  const end = all.findIndex((x) => x.label === upTo);
  if (end < 0) throw new Error(`${n}: ${upTo}`);
  const seq = all.slice(all.findIndex((x) => x.label === "child0-open"), end + 1);
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
const STANDARD = ["voli.standard", "zed.standard", "olaf.standard", "lucian.standard", "pantheon.standard"];

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("one board for the whole Journey module", () => {
  it("persists across children: the same band node from child 1 to child 5", () => {
    const all = live("zed.standard");
    const from = all.findIndex((x) => x.label === "child0-open");
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

  it("owns the media region: the child draws no scenario band of its own", () => {
    show(snap("zed.standard", "child2-open"));
    expect(screen.getAllByTestId("scenario-hero")).toHaveLength(1);
    expect(screen.queryByTestId("mastery-slice-opponent-progress")).toBeNull();
  });

  it("ordinary slices are untouched: no Journey block → no board, the old header line", () => {
    const s = snap("zed.standard", "child1-open");
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
  it("future child text is never rendered", () => {
    show(snap("zed.standard", "child1-open"));
    // Child 3 states Shadow Slash's formula (70 / 92.5 / …); child 4 follows Serrated Dirk.
    expect(text()).not.toMatch(/92\.5|Serrated Dirk/);
    expect(screen.queryAllByTestId("journey-child")).toHaveLength(1);
  });

  it("a future item transition is not rendered before its beat — then it is", () => {
    show(snap("zed.standard", "child2-reveal-late"));
    expect(text()).not.toContain("Serrated Dirk");
    cleanup();
    show(snap("zed.standard", "child3-beat"));
    expect(within(screen.getByTestId("journey-board")).getByTestId("journey-item-subject-0"))
      .toHaveAttribute("aria-label", expect.stringContaining("Serrated Dirk"));
  });

  it("a withheld asked stat is `?` on the board AND in the State sheet — its value in neither", () => {
    const v = "voli.standard";
    const answer = String(answersOf(v)[0].correct_answer);   // Lee Sin's L3 armor, as asked
    show(snap(v, "child0-live"));
    const board = screen.getByTestId("journey-board");
    expect(within(board).getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "withheld");
    expect(board.textContent).not.toContain(answer);
    fireEvent.click(screen.getByTestId("journey-open-state"));
    const sheet = screen.getByTestId("journey-state-sheet");
    expect(within(sheet).getByTestId("journey-sheet-stat-opponent-armor")).toHaveTextContent("asked in this question");
    expect(sheet.textContent).not.toContain(answer);
    // No max rank on the wire: the sheet prints the rank, never a gap.
    expect(sheet.textContent).not.toMatch(/null|undefined|— ·/);
  });

  it("a RECALLED armor names its teaching step on the board, the sheet and the premise — never the number", () => {
    show(snap("zed.standard", "child2-open"));
    afterReveal();
    const chip = within(screen.getByTestId("journey-board")).getByTestId("journey-stat-opponent-armor");
    expect(chip).toHaveAttribute("data-face", "recalled");
    expect(chip).toHaveTextContent(/recall · step 1/i);
    expect(screen.getByTestId("journey-combat-target_armor")).toHaveTextContent(/recall · revealed in step 1/i);
    fireEvent.click(screen.getByTestId("journey-open-state"));
    expect(screen.getByTestId("journey-sheet-stat-opponent-armor")).toHaveTextContent(/recall it — revealed in step 1/);
    expect(text()).not.toMatch(/27\.195|27\.2\b/);
  });

  it.each(STANDARD)("%s: no unanswered child's answer is on the board or sheet while it is being asked", (name) => {
    const answers = answersOf(name);
    for (const s of live(name).filter((x) => /-(open|live)$/.test(x.label) && x.label !== "child0-open")) {
      const i = Number(/child(\d)/.exec(s.label)![1]);
      const a = String(answers[i].correct_answer);
      const { unmount } = show(s);
      const board = screen.getByTestId("journey-board").textContent ?? "";
      fireEvent.click(screen.getByTestId("journey-open-state"));
      const sheet = screen.getByTestId("journey-state-sheet").textContent ?? "";
      // Single-choice answers are, by design, among the offered options; the
      // board and the sheet must still never carry them.
      if (/^\d+(\.\d+)?$/.test(a) && a.length > 1) {
        expect(board, `${name} ${s.label}`).not.toContain(a);
        expect(sheet, `${name} ${s.label}`).not.toContain(a);
      }
      unmount();
    }
  });
});

describe("the server-timed transition beat", () => {
  it("during the beat the next child does not exist: veiled placeholder, marks on the board", () => {
    const s = snap("zed.standard", "child3-beat");
    play("zed.standard", "child3-beat");
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "active");
    expect(screen.getByTestId("journey-next-pending")).toHaveAttribute("data-child-index", "3");
    expect(screen.queryByTestId("journey-child")).toBeNull();
    expect(screen.getByTestId("journey-beat")).toHaveTextContent("First back");
    expect(screen.getByTestId("journey-beat")).toHaveTextContent(/\+20 AD \(Serrated Dirk\)/);
    expect(screen.getByTestId("journey-beat")).not.toHaveTextContent(/\d+g\b|gold/i);
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

  it("the next poll exposes the child; the purchase and its stat delta stay marked through it", () => {
    play("zed.standard", "child3-open");
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    expect(screen.getByTestId("journey-child")).toBeInTheDocument();
    expect(screen.getByTestId("journey-item-subject-0")).toHaveAttribute("data-new", "true");
    // The server's delta is marked beside the server's value — never summed.
    expect(screen.getByTestId("journey-stat-subject-lethality")).toHaveTextContent(/10/);
    const chip = screen.getByTestId("journey-stat-subject-lethality");
    expect(chip).toHaveAttribute("data-face", "gained");
    expect(chip).toHaveAttribute("data-gain", "10");
    expect(chip).toHaveAccessibleName(/Lethality: 10 \(\+10 from the last change\)/);
  });

  it("a level-6 beat raises both levels and unlocks both Rs, as served", () => {
    play("pantheon.standard", "child3-beat");
    expect(screen.getByTestId("journey-level-subject")).toHaveAttribute("data-changed", "true");
    expect(screen.getByTestId("journey-ability-subject-R")).not.toHaveAttribute("data-locked");
    expect(screen.getByTestId("journey-ability-opponent-R")).toHaveAttribute("data-changed", "true");
    expect(screen.getByTestId("journey-beat")).toHaveTextContent(/Ultimate unlocked/i);
  });

  it("between a reveal and the next child, the Journey never says it is complete", () => {
    show(snap("zed.standard", "child2-reveal"));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByText(/Mastery Slice complete/)).toBeNull();
    expect(screen.getByTestId("journey-next-pending")).toBeInTheDocument();
  });
});

describe("Matchup and Combat render the served per-side premises", () => {
  it("Matchup: each side's own ability and rank, in the board's side order", () => {
    show(snap("olaf.standard", "child1-open"));
    afterReveal();
    expect(screen.getByTestId("journey-matchup-side-a")).toHaveTextContent(/Olaf.*Reckless Swing \(E\).*rank 1/);
    expect(screen.getByTestId("journey-matchup-side-b")).toHaveTextContent(/Sett.*Facebreaker \(E\).*rank 1/);
    const strip = screen.getByTestId("journey-matchup-sides");
    expect([...strip.querySelectorAll("[data-champion]")].map((e) => e.getAttribute("data-champion")))
      .toEqual(["Olaf", "Sett"]);
  });

  it("Matchup: the backend's A/B order is re-read into the BOARD's order (opponent first on the wire)", () => {
    show(snap("pantheon.standard", "child3-open"));
    afterReveal();
    // The wire's A side is Leona (the opponent); the Journey player (Pantheon) is drawn left.
    const strip = screen.getByTestId("journey-matchup-sides");
    expect([...strip.querySelectorAll("[data-champion]")].map((e) => e.getAttribute("data-champion")))
      .toEqual(["Pantheon", "Leona"]);
    expect(screen.getByTestId("journey-matchup-side-a")).toHaveAttribute("data-rank", "1");
    expect(screen.getByTestId("journey-matchup-side-b")).toHaveAttribute("data-rank", "1");
  });

  it("the Matchup reveal states BOTH exact values, verbatim", () => {
    show(snap("olaf.standard", "child1-reveal"));
    expect(screen.getByTestId("mastery-reveal-explanation"))
      .toHaveTextContent("Olaf E (Reckless Swing) at rank 1: 11 seconds. Sett E (Facebreaker) at rank 1: 16 seconds.");
  });

  it("Combat, stated: attacker, rank, stats and the served formula — no arithmetic", () => {
    show(snap("voli.standard", "child2-open"));
    afterReveal();
    const p = screen.getByTestId("journey-combat-premise");
    expect(within(p).getByTestId("journey-combat-ability")).toHaveTextContent("Thundering Smash · rank 1");
    expect(within(p).getByTestId("journey-combat-attack_damage")).toHaveTextContent("70.1625");
    // The board states the SAME served number — every digit, never rounded
    // (it once printed 70.162) — so from `lg` the premise does not repeat it.
    expect(screen.getByTestId("journey-stat-subject-attack_damage")).toHaveTextContent("70.1625");
    expect(within(p).getByTestId("journey-combat-attack_damage")).toHaveAttribute("data-on-board", "true");
    // The recalled armor is NOT a board number: the premise keeps naming its source.
    expect(within(p).getByTestId("journey-combat-target_armor")).not.toHaveAttribute("data-on-board");
    expect(within(p).getByTestId("journey-combat-target_armor")).toHaveTextContent(/recall · revealed in step 1/);
    const f = within(p).getByTestId("journey-combat-formula");
    expect(f.querySelector("[data-formula='stated']")).not.toBeNull();
    expect(f).toHaveTextContent("10 / 20 / 30 / 40 / 50");
    expect(f).toHaveTextContent("+ 100% attack damage");
    expect(f).toHaveTextContent("+ 160% bonus attack damage");
    expect(f.querySelector("[data-rank-value='1']")!.className).toContain("underline");
  });

  it("Combat, recalled formula AND recalled armor: neither number is restated; the teaching steps are named", () => {
    show(snap("voli.standard", "child4-open"));
    afterReveal();
    const f = screen.getByTestId("journey-combat-formula");
    expect(f.querySelector("[data-formula='recalled']")).not.toBeNull();
    expect(f).toHaveTextContent("stated in step 3");
    expect(text()).not.toMatch(/10 \/ 20 \/ 30/);
    expect(screen.getByTestId("journey-combat-bonus_attack_damage")).toHaveTextContent("20");
    expect(screen.getByTestId("journey-reinforces")).toHaveTextContent("Builds on step 1 and 3");
  });

  it("the Combat reveal is the backend's text, verbatim — no local derivation", () => {
    show(snap("zed.standard", "child2-reveal"));
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent("55.034 damage, which rounds to 55");
    // J3 serves no structured working (raw → effective armor → mitigation → final).
    expect(screen.queryByTestId("journey-combat-working")).toBeNull();
  });
});

describe("Daily Review: a re-asked Journey child renders (captured live)", () => {
  it("one self-contained child on the board: Step 1 of 1, the asked stat withheld, the answer absent", () => {
    show(snap("review.reask", "reask-live"));
    expect(screen.getByTestId("journey-board")).toBeInTheDocument();
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 1 of 1");
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "withheld");
    expect(screen.getByTestId("journey-board").textContent).not.toContain(String(answersOf("review.reask")[0].correct_answer));
  });
});

describe("reconnect while the next child is open", () => {
  it("does not replay the previous reveal over an open child (the pooled clock is running)", () => {
    const s = snap("voli.standard", "child4-live");
    const seg = (s.envelope.payload as { segment_state: { own_revealing_card_index: number | null } }).segment_state;
    expect(seg.own_revealing_card_index).toBeNull();
    show(s);
    const phase = screen.getByTestId("mastery-slice-challenge-phase");
    expect(phase).toHaveAttribute("data-challenge-index", "4");
    expect(phase).not.toHaveAttribute("data-revealing");
  });

  it("a reconnect DURING the server's reveal still shows it", () => {
    show(snap("zed.standard", "child2-reveal"));
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-revealing", "true");
  });
});
