/**
 * Academy introduction (HI1-C) behaviour.
 *
 * Two things are being protected here, and they pull in different directions.
 *
 * The FIRST is HI1's contract, which the cinematic redesign was not allowed to
 * touch: both exits record an outcome before handing off, the tutorial keeps its
 * own completion state, and the route still renders in full on replay. Those
 * assertions are carried over from HI1-1 deliberately unchanged.
 *
 * The SECOND is the interaction model, in its HI1-C2 form: one dual-purpose
 * control; a chapter that writes ITSELF but never turns itself — the finished
 * page waits for Next, indefinitely; a physical page turn during which every
 * input is ignored; writing and illustration running as two overlapping
 * channels; and sound calls that track the writing exactly. Text is in the
 * document before it is on the page, which is what makes the rest testable at
 * all: because a chapter's words are only transparent and never absent, a test
 * (like a screen reader) reads a finished chapter the moment its slot opens,
 * and nothing here has to drive animation frames jsdom does not run.
 *
 * The audio module is mocked wholesale — these tests assert WHEN the page asks
 * for sound, not what Web Audio does with it. (The settings gate has its own
 * suite in tomeAudio.test.ts.)
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AcademyWelcomePage from "./AcademyWelcomePage";
import { ACADEMY_CHAPTERS } from "./academyChapters";
import { slotCount, slotWriteMs } from "./useRevealSequence";
import {
  hasHandledAcademyWelcome,
  markAcademyWelcomeHandled,
  readAcademyWelcomeState,
} from "@/lib/welcome/academy-welcome";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

import { installLocalStorageStub } from "@/test/localStorageStub";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
const audio = vi.hoisted(() => ({
  scribble: vi.fn(),
  stopScribble: vi.fn(),
  pageTurn: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("./tomeAudio", () => ({ useTomeAudio: () => audio }));

// The pinned jsdom does not provide a working Storage — see localStorageStub.
const resetStorage = installLocalStorageStub();

/**
 * Install a matchMedia that either reports reduced motion or does not.
 *
 * The default across this suite is REDUCED, which turns the sequence clock off
 * entirely: every chapter opens complete, the physical page turn is skipped,
 * and pages turn only when the test says so. That keeps the interaction
 * assertions about the interaction rather than about a timer, and it means the
 * bulk of this file covers the accessibility path a motion-sensitive visitor
 * actually gets. The choreography tests opt back in.
 */
function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

beforeEach(() => {
  setReducedMotion(true);
  resetStorage();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  resetStorage();
});

const page = () => screen.getByTestId("academy-welcome");
const advance = () => fireEvent.click(screen.getByTestId("academy-welcome-advance"));
const stepOf = () => Number(page().getAttribute("data-step"));

/** Turn pages until the finale's exits are on screen. */
function goToFinale() {
  for (let i = 0; i < ACADEMY_CHAPTERS.length * 3; i += 1) {
    if (screen.queryByTestId("academy-welcome-explore")) return;
    advance();
  }
  throw new Error("never reached the finale");
}

/**
 * Let the sequence run for `ms` of its own time (fake timers required).
 *
 * Advanced in slices, each inside its own `act`, because every beat arms the
 * NEXT one from an effect — and React does not flush passive effects while a
 * single `advanceTimersByTime` call is still draining, nor between the timers
 * of `advanceTimersByTimeAsync` (its scheduler uses a MessageChannel that
 * fake timers do not drive). One large jump therefore advances exactly one
 * beat and looks like a stalled sequence. The `act` boundary per slice is
 * what makes the clock actually tick.
 */
const run = async (ms: number, slice = 250) => {
  for (let t = 0; t < ms; t += slice) {
    await act(async () => {
      vi.advanceTimersByTime(slice);
    });
  }
};

/* -------------------------------------------------------------------------- */

describe("the sequence", () => {
  it("opens on the first chapter", () => {
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-chapter", ACADEMY_CHAPTERS[0].id);
    expect(page()).toHaveAttribute("data-chapter-index", "0");
  });

  it("turns through every chapter in order and ends on the finale", () => {
    render(<AcademyWelcomePage />);
    for (const chapter of ACADEMY_CHAPTERS) {
      expect(page()).toHaveAttribute("data-chapter", chapter.id);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(chapter.heading);
      if (!chapter.finale) advance();
    }
    expect(ACADEMY_CHAPTERS[ACADEMY_CHAPTERS.length - 1].finale).toBe(true);
  });

  it("writes every chapter's words into the document, not only onto the page", () => {
    // The reveal is decoration over text that already exists. If a chapter's
    // copy were mounted late, this would be the failure — and so would every
    // screen reader.
    render(<AcademyWelcomePage />);
    for (const chapter of ACADEMY_CHAPTERS) {
      const text = (page().textContent ?? "").replace(/\s+/g, " ");
      for (const line of chapter.lines) expect(text).toContain(line);
      if (!chapter.finale) advance();
    }
  });

  it("never leaves the tome empty on any chapter", () => {
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      if (i < ACADEMY_CHAPTERS.length - 1) advance();
    }
  });

  it("survives a burst of clicks with no delay between them", () => {
    // The HI1-1 regression, kept: <AnimatePresence mode="wait"> stranded the
    // page on correct state above an empty content area when a second click
    // arrived during an exit transition. The sequence is a plain counter now,
    // so this can only fail if someone reintroduces an awaited transition.
    render(<AcademyWelcomePage />);
    for (let i = 0; i < 40; i += 1) {
      const control = screen.queryByTestId("academy-welcome-advance");
      if (!control) break;
      fireEvent.click(control);
    }
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByTestId("academy-welcome-explore")).toBeTruthy();
    // And it stops there rather than running off the end of the chapter list.
    expect(page()).toHaveAttribute("data-chapter", "beginning");
  });

  it("goes back to re-read a chapter, and offers no Back on the first", () => {
    render(<AcademyWelcomePage />);
    expect(screen.queryByTestId("academy-welcome-back")).toBeNull();
    advance();
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    fireEvent.click(screen.getByTestId("academy-welcome-back"));
    expect(page()).toHaveAttribute("data-chapter-index", "0");
  });

  it("reports position to assistive tech without carousel dots", () => {
    render(<AcademyWelcomePage />);
    const ribbon = screen.getByRole("list", { name: /chapter progress/i });
    expect(ribbon.querySelectorAll("li")).toHaveLength(ACADEMY_CHAPTERS.length);
    expect(ribbon.querySelector('[aria-current="step"]')).toBeTruthy();
  });
});

describe("the dual-purpose control", () => {
  beforeEach(() => setReducedMotion(false));

  it("finishes the current chapter first, and only then turns the page", () => {
    // The guarantee an impatient visitor depends on: the first press may never
    // cost them words they have not read.
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-complete", "false");

    advance();
    expect(page()).toHaveAttribute("data-complete", "true");
    expect(page()).toHaveAttribute("data-chapter-index", "0");

    advance();
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    // The new chapter starts writing itself again rather than arriving whole.
    expect(page()).toHaveAttribute("data-complete", "false");
  });

  it("names what it will do", () => {
    render(<AcademyWelcomePage />);
    const control = screen.getByTestId("academy-welcome-advance");
    expect(control).toHaveAttribute("data-mode", "reveal");
    expect(control.textContent).toContain("Skip reveal");
    fireEvent.click(control);
    expect(screen.getByTestId("academy-welcome-advance")).toHaveAttribute("data-mode", "next");
    expect(screen.getByTestId("academy-welcome-advance").textContent).toContain("Next");
  });

  it("treats a click anywhere on the scene as the same intent", () => {
    render(<AcademyWelcomePage />);
    fireEvent.click(screen.getByTestId("academy-tome-book"));
    expect(page()).toHaveAttribute("data-complete", "true");
  });

  it("responds to the keyboard, forwards and back", async () => {
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    // The sheet is mid-turn; Back (like every input) waits for it to land.
    await run(900);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(page()).toHaveAttribute("data-chapter-index", "0");
  });

  it("leaves a focused control to handle its own keys", () => {
    // Space on the focused advance button must fire it once, via the button —
    // not once there and once again through the window listener.
    render(<AcademyWelcomePage />);
    const control = screen.getByTestId("academy-welcome-advance");
    control.focus();
    fireEvent.keyDown(control, { key: " ", bubbles: true });
    expect(page()).toHaveAttribute("data-chapter-index", "0");
    expect(page()).toHaveAttribute("data-complete", "false");
  });
});

describe("the internal reveal", () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });

  it("writes the page by itself, then STOPS and waits for Next", async () => {
    // HI1-C2's core interaction change: a chapter reveals itself, but the page
    // NEVER turns itself. However long the finished spread sits there, the
    // visitor is exactly where they left themselves.
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-complete", "false");

    await run(20_000);
    expect(page()).toHaveAttribute("data-chapter-index", "0");
    expect(page()).toHaveAttribute("data-complete", "true");

    await run(60_000, 1000);
    expect(page()).toHaveAttribute("data-chapter-index", "0");
    expect(mocks.navigate).not.toHaveBeenCalled();

    // Next — and only Next — turns the page.
    advance();
    expect(page()).toHaveAttribute("data-chapter-index", "1");
  });

  it("does not offer Next while the last sentence is still being written", async () => {
    // `step` reaching the end means every slot has been RELEASED; the ink of
    // the final sentence is still landing. Offering "Next" there would invite
    // the visitor to turn away from words they never saw.
    //
    // The wait below is DERIVED from the last slot's own write window rather
    // than a fixed number of milliseconds. HI1-C3 writes a whole sentence per
    // slot, so that window depends on the copy — a hard-coded budget here
    // would pass or fail on how long someone made the last line, which is
    // exactly the coupling this test exists to catch.
    render(<AcademyWelcomePage />);
    const chapter = ACADEMY_CHAPTERS[0];
    const total = slotCount(chapter);

    for (let i = 0; i < 60 && stepOf() < total; i += 1) await run(250, 250);
    expect(stepOf()).toBe(total);
    // Everything is on the page, and the control still says so honestly.
    expect(page()).toHaveAttribute("data-complete", "false");
    expect(screen.getByTestId("academy-welcome-advance")).toHaveAttribute("data-mode", "reveal");

    // Still writing halfway through the final sentence's ink.
    await run(slotWriteMs(chapter, total - 1) / 2, 100);
    expect(page()).toHaveAttribute("data-complete", "false");

    await run(slotWriteMs(chapter, total - 1) + 1_000, 250);
    expect(page()).toHaveAttribute("data-complete", "true");
  });

  it("overlaps the writing and the illustration on one spread", async () => {
    // The two-channel choreography: the painting starts while the writing is
    // still arriving — never text, then image, then text.
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-art", "false");

    const total = slotCount(ACADEMY_CHAPTERS[0]);
    for (let i = 0; i < 60 && page().getAttribute("data-art") !== "true"; i += 1) {
      await run(250, 250);
    }
    expect(page()).toHaveAttribute("data-art", "true");
    // The illustration is developing while most of the page is still unwritten.
    expect(stepOf()).toBeLessThan(total);
    expect(page()).toHaveAttribute("data-complete", "false");
  });

  it("gives Pro Data & Esports the same overlapping choreography", async () => {
    // The strongest chapter visually is not exempt from the shared timing
    // model — its reveal follows the identical two-channel contract.
    render(<AcademyWelcomePage />);
    const proDataIndex = ACADEMY_CHAPTERS.findIndex((c) => c.id === "pro-data");
    for (let i = 0; i < proDataIndex; i += 1) {
      advance(); // finish the chapter
      advance(); // turn the page
      await run(1_000); // let the sheet land
    }
    expect(page()).toHaveAttribute("data-chapter", "pro-data");

    const total = slotCount(ACADEMY_CHAPTERS[proDataIndex]);
    for (let i = 0; i < 60 && page().getAttribute("data-art") !== "true"; i += 1) {
      await run(250, 250);
    }
    expect(page()).toHaveAttribute("data-art", "true");
    expect(stepOf()).toBeLessThan(total);
    expect(page()).toHaveAttribute("data-complete", "false");
  });
});

describe("the page turn", () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });

  it("holds the incoming chapter and ignores every input while the sheet is mid-turn", async () => {
    render(<AcademyWelcomePage />);
    advance(); // finish chapter 0
    advance(); // turn the page — the sheet is now in the air
    expect(page()).toHaveAttribute("data-turning", "true");
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    // Nothing writes itself under a turning sheet.
    expect(stepOf()).toBe(0);

    // A burst of clicks while the sheet is in the air does nothing at all:
    // no second turn, no skipped chapter, no finished reveal.
    for (let i = 0; i < 10; i += 1) advance();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    expect(stepOf()).toBe(0);

    // The sheet lands; the chapter begins writing itself.
    await run(900);
    expect(page()).toHaveAttribute("data-turning", "false");
    await run(2_000);
    expect(stepOf()).toBeGreaterThan(0);
  });

  it("cannot stack turns — one page per press, however fast the presses", async () => {
    render(<AcademyWelcomePage />);
    advance(); // finish
    advance(); // turn
    for (let i = 0; i < 10; i += 1) advance();
    expect(audio.pageTurn).toHaveBeenCalledTimes(1);
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    await run(900);
    expect(page()).toHaveAttribute("data-chapter-index", "1");
  });
});

describe("sound", () => {
  it("asks for the page-turn sound exactly once per successful turn", () => {
    // Reduced motion (suite default): no turning sheet, but the turn itself
    // still sounds — it is the visitor's own action, not an animation.
    render(<AcademyWelcomePage />);
    advance();
    expect(audio.pageTurn).toHaveBeenCalledTimes(1);
    advance();
    expect(audio.pageTurn).toHaveBeenCalledTimes(2);
  });

  it("scratches while writing, and stops the moment the reveal is skipped", async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);

    // Let a couple of slots arrive on their own beat — each asks for a
    // scribble scoped to its own write window.
    await run(2_500);
    expect(audio.scribble).toHaveBeenCalled();
    expect(stepOf()).toBeGreaterThan(0);
    expect(page()).toHaveAttribute("data-complete", "false");

    audio.stopScribble.mockClear();
    advance(); // skip the active reveal
    expect(audio.stopScribble).toHaveBeenCalled();
  });

  it("never scratches under reduced motion — there is no writing to scratch for", () => {
    render(<AcademyWelcomePage />);
    advance();
    advance();
    expect(audio.scribble).not.toHaveBeenCalled();
  });
});

describe("reduced motion", () => {
  it("opens every chapter complete and runs no clock", async () => {
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-complete", "true");
    expect(page()).toHaveAttribute("data-instant", "true");

    for (let i = 0; i < 200; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
    }
    // Two minutes later, still exactly where the visitor left it.
    expect(page()).toHaveAttribute("data-chapter-index", "0");
  });

  it("turns pages instantly — no sheet ever takes to the air", () => {
    render(<AcademyWelcomePage />);
    advance();
    expect(page()).toHaveAttribute("data-chapter-index", "1");
    expect(page()).toHaveAttribute("data-turning", "false");
    // And the new chapter is already complete, ready to read.
    expect(page()).toHaveAttribute("data-complete", "true");
  });

  it("still reaches both exits, one press per chapter", () => {
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length - 1; i += 1) advance();
    expect(screen.getByTestId("academy-welcome-explore")).toBeTruthy();
    expect(screen.getByTestId("academy-welcome-tutorial")).toBeTruthy();
  });
});

describe("exits", () => {
  it("Start Exploring records the outcome and goes to the hub", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    fireEvent.click(screen.getByTestId("academy-welcome-explore"));

    expect(readAcademyWelcomeState()?.outcome).toBe("explored");
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("Start Tutorial records the outcome and hands off to the real tutorial route", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    fireEvent.click(screen.getByTestId("academy-welcome-tutorial"));

    expect(readAcademyWelcomeState()?.outcome).toBe("tutorial");
    expect(mocks.navigate).toHaveBeenCalledWith(RANKED_TUTORIAL_ROUTE, { replace: true });
  });

  it("labels the two paths as approved, and gives neither the air of a penalty", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    expect(screen.getByTestId("academy-welcome-explore").textContent).toContain("Start Exploring");
    // "Start the tutorial", not "Take the tutorial" — both exits are framed as
    // something you START, so neither reads as the price of entry.
    expect(screen.getByTestId("academy-welcome-tutorial").textContent).toContain(
      "Start the tutorial",
    );
    expect(screen.queryByText(/Take the tutorial/)).toBeNull();
  });

  it("drops the advance and skip controls once the two choices stand alone", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    expect(screen.queryByTestId("academy-welcome-advance")).toBeNull();
    expect(screen.queryByTestId("academy-welcome-skip")).toBeNull();
  });

  it("puts focus on the choice when the last page opens", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    expect(document.activeElement).toBe(screen.getByTestId("academy-welcome-explore"));
  });

  it("Skip is a real exit from any chapter — it marks the visitor handled", () => {
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-welcome-skip"));

    expect(hasHandledAcademyWelcome()).toBe(true);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("never writes tutorial completion — that stays the tutorial's own business", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    fireEvent.click(screen.getByTestId("academy-welcome-tutorial"));
    expect(JSON.stringify(readAcademyWelcomeState())).not.toMatch(/completed/i);
  });
});

describe("replay", () => {
  it("still renders in full for a visitor who already finished it", () => {
    markAcademyWelcomeHandled("explored");
    render(<AcademyWelcomePage />);

    expect(page()).toHaveAttribute("data-chapter-index", "0");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("renders despite a corrupt stored value", () => {
    localStorage.setItem("mogsy.academyWelcome.v1", "{{{not json");
    expect(() => render(<AcademyWelcomePage />)).not.toThrow();
    expect(screen.getByTestId("academy-welcome")).toBeTruthy();
  });
});

describe("content contract", () => {
  it("keeps every illustration decorative", () => {
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      for (const img of Array.from(page().querySelectorAll("img"))) {
        expect(img.getAttribute("aria-hidden")).toBe("true");
        expect(img.getAttribute("alt")).toBe("");
      }
      if (i < ACADEMY_CHAPTERS.length - 1) advance();
    }
  });

  it("uses the approved product name, not the artwork's engraved wording", () => {
    // The Leaguecraft plate has "Leaguecraft Studies" baked into its pixels.
    // The chapter must say "Leaguecraft" — and must not have been "fixed" by
    // renaming the product to match the art.
    render(<AcademyWelcomePage />);
    advance();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Leaguecraft");
    expect(screen.queryByText(/Leaguecraft Studies/)).toBeNull();
  });

  it("does not present Ranked as a peer of Leaguecraft", () => {
    // Ranked lives INSIDE Leaguecraft. Promoting it to a chapter would tell a
    // new visitor they are two products to choose between, which is wrong.
    expect(ACADEMY_CHAPTERS.map((c) => c.heading)).not.toContain("Ranked");
    expect(ACADEMY_CHAPTERS.find((c) => c.id === "leaguecraft")?.marginalia).toContain("Ranked");
  });

  it("promises only surfaces that exist", () => {
    // The data chapter is grounded in the shipped pro-match explorer and live
    // esports viewer. It must never be renamed to a product a visitor cannot
    // find — GRAPH1 is a dev route and is not a destination.
    const headings = ACADEMY_CHAPTERS.map((c) => c.heading);
    expect(headings).toContain("Pro Data & Esports");
    expect(headings).not.toContain("League Graphs");
  });

  it("keeps the sequence short enough to sit through", () => {
    // The redesign exists to stop this feeling like a wizard; a seventh chapter
    // would put it back. Two lines per chapter is the ceiling for the same
    // reason — this is a book being written, not a landing page.
    expect(ACADEMY_CHAPTERS.length).toBeLessThanOrEqual(6);
    for (const chapter of ACADEMY_CHAPTERS) {
      expect(chapter.lines.length).toBeLessThanOrEqual(2);
    }
  });
});
