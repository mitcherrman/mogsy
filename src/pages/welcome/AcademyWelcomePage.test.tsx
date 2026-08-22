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
import { ACADEMY_CHAPTERS, CHAMPION_ART } from "./academyChapters";
import { BLOCK_INTERVAL_MS, HEADING_INTERVAL_MS, OPENING_PAUSE_MS } from "./cadence";
import { SCENE_READY_CAP_MS } from "./useSceneReady";
import { slotCount, slotRevealMs } from "./useRevealSequence";
import {
  hasHandledAcademyWelcome,
  markAcademyWelcomeHandled,
  readAcademyWelcomeState,
} from "@/lib/welcome/academy-welcome";
import {
  ACADEMY_SIGN_IN_ROUTE,
  LEAGUE_RANKS,
  readAcademyRegistration,
  saveAcademyRegistration,
} from "@/lib/welcome/academy-registration";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

import { installLocalStorageStub } from "@/test/localStorageStub";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), adopt: vi.fn() }));
const audio = vi.hoisted(() => ({
  scribble: vi.fn(),
  stopScribble: vi.fn(),
  pageTurn: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("./tomeAudio", () => ({ useTomeAudio: () => audio }));
// The register's one outward effect, stubbed for the same reason the audio
// module is: these tests assert WHEN the page reaches for it, not what Supabase
// does next. It must be mocked rather than merely unused — importing the real
// module instantiates the Supabase client against jsdom's storage stub and
// rejects on its own clock. Its rules have their own suite in
// lib/welcome/provisional-identity.test.ts.
vi.mock("@/lib/welcome/provisional-identity", () => ({
  adoptAcademyIdentity: mocks.adopt.mockResolvedValue({ written: [], settled: false }),
}));

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

/**
 * Fill the register in and hand it over.
 *
 * The one page in the book that answers back, so the one page a traversal
 * cannot get past with the advance control. Defaults are a valid, minimal
 * registration — a name and a rank, no password, no linking — because that is
 * the path most tests are only passing THROUGH.
 */
function register(opts: { username?: string; rank?: string } = {}) {
  fireEvent.change(screen.getByTestId("academy-registration-username"), {
    target: { value: opts.username ?? "Summoner" },
  });
  fireEvent.change(screen.getByTestId("academy-registration-rank"), {
    target: { value: opts.rank ?? "gold" },
  });
  fireEvent.click(screen.getByTestId("academy-registration-submit"));
}

/** One page forward, however this page happens to turn. */
function nextChapter() {
  if (screen.queryByTestId("academy-registration-form")) {
    register();
    return;
  }
  advance();
}

/** Turn pages until the finale's exits are on screen. */
function goToFinale() {
  for (let i = 0; i < ACADEMY_CHAPTERS.length * 4; i += 1) {
    if (screen.queryByTestId("academy-welcome-explore")) return;
    nextChapter();
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
      if (!chapter.finale) nextChapter();
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
      if (!chapter.finale) nextChapter();
    }
  });

  it("never leaves the tome empty on any chapter", () => {
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
  });

  it("survives a burst of clicks with no delay between them", () => {
    // The HI1-1 regression, kept: <AnimatePresence mode="wait"> stranded the
    // page on correct state above an empty content area when a second click
    // arrived during an exit transition. The sequence is a plain counter now,
    // so this can only fail if someone reintroduces an awaited transition.
    const burst = () => {
      for (let i = 0; i < 40; i += 1) {
        const control = screen.queryByTestId("academy-welcome-advance");
        if (!control) break;
        fireEvent.click(control);
      }
    };
    render(<AcademyWelcomePage />);

    // Forty clicks land on the register and STOP there — the gate is a real
    // gate, and forty taps is exactly the input that would find a soft one.
    burst();
    expect(page()).toHaveAttribute("data-chapter", "registration");
    expect(page()).toHaveAttribute("data-gate", "registration");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();

    // Answered, another forty clicks run to the last page and stop there
    // rather than running off the end of the chapter list.
    register();
    burst();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByTestId("academy-welcome-explore")).toBeTruthy();
    expect(page()).toHaveAttribute("data-chapter", "library");
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

  it("does not offer Next while the last block is still arriving", async () => {
    // `step` reaching the end means every slot has been RELEASED; the last
    // block is still settling. Offering "Next" there would invite the visitor
    // to turn away from words they never saw.
    //
    // The wait below is DERIVED from the last slot's own arrival window rather
    // than from a fixed number of milliseconds, so re-tuning the cadence
    // cannot quietly turn this guard into a coin flip.
    render(<AcademyWelcomePage />);
    const chapter = ACADEMY_CHAPTERS[0];
    const total = slotCount(chapter);

    for (let i = 0; i < 60 && stepOf() < total; i += 1) await run(250, 250);
    expect(stepOf()).toBe(total);
    // Everything is on the page, and the control still says so honestly.
    expect(page()).toHaveAttribute("data-complete", "false");
    expect(screen.getByTestId("academy-welcome-advance")).toHaveAttribute("data-mode", "reveal");

    // Still writing halfway through the final sentence's ink.
    await run(slotRevealMs(chapter, total - 1) / 2, 100);
    expect(page()).toHaveAttribute("data-complete", "false");

    await run(slotRevealMs(chapter, total - 1) + 1_000, 250);
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

  it("gives the last spread the same overlapping choreography", async () => {
    // The strongest chapter visually — and now the busiest — is not exempt from
    // the shared timing model. Its reveal follows the identical two-channel
    // contract: the triangular composition develops while the copy beside it is
    // still arriving.
    render(<AcademyWelcomePage />);
    const lastIndex = ACADEMY_CHAPTERS.findIndex((c) => c.id === "library");
    for (let i = 0; i < lastIndex; i += 1) {
      advance(); // finish the chapter
      nextChapter(); // turn the page — or answer the register, which turns it
      await run(1_000); // let the sheet land
    }
    expect(page()).toHaveAttribute("data-chapter", "library");

    const total = slotCount(ACADEMY_CHAPTERS[lastIndex]);
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
    // The register turns its own page, and it sounds exactly like every other
    // turn — a page that lifted for a different reason must not lift silently.
    register();
    expect(audio.pageTurn).toHaveBeenCalledTimes(2);
  });

  it("scratches while writing, and stops the moment the reveal is skipped", async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);

    // Let the first slot arrive on its own beat — it asks for a scribble
    // scoped to its own arrival window. Deliberately stopped BEFORE the last
    // block, and derived from the cadence rather than from a round number: the
    // whole chapter now lands inside a second and a half, so a fixed 2.5s wait
    // would be asserting about a page that had already finished.
    await run(OPENING_PAUSE_MS + HEADING_INTERVAL_MS + 60, 60);
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
    register();
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
    for (let i = 0; i < ACADEMY_CHAPTERS.length - 1; i += 1) nextChapter();
    expect(screen.getByTestId("academy-welcome-explore")).toBeTruthy();
    expect(screen.getByTestId("academy-welcome-tutorial")).toBeTruthy();
  });
});

describe("exits", () => {
  it("Enter the Academy records the outcome and goes to the hub", () => {
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
    expect(screen.getByTestId("academy-welcome-explore").textContent).toContain(
      "Enter the Academy",
    );
    // "Start the tutorial", not "Take the tutorial" — the tutorial must never
    // read as the price of entry.
    expect(screen.getByTestId("academy-welcome-tutorial").textContent).toContain(
      "Start the tutorial",
    );
    expect(screen.queryByText(/Take the tutorial/)).toBeNull();
  });

  it("carries two labels and no explanation — this page closes, it does not brief", () => {
    // The exits used to carry a line of description each and a footnote under
    // them. On a page whose whole job is to end the book that reads as a
    // dashboard, and it was most of what made the spread overflow.
    render(<AcademyWelcomePage />);
    goToFinale();
    const exits = screen.getByTestId("academy-welcome-explore").parentElement!;
    expect(exits.querySelector(".tome-footnote")).toBeNull();
    expect(exits.querySelector(".tome-exit-detail")).toBeNull();
    expect(screen.queryByText(/Head into the Academy/)).toBeNull();
    expect(screen.queryByText(/guided run through a Ranked duel/)).toBeNull();
    expect(screen.queryByText(/about five minutes/)).toBeNull();
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

  it("Skip is a real exit from any chapter, once the register has been answered", () => {
    render(<AcademyWelcomePage />);
    advance();
    register();
    expect(page()).toHaveAttribute("data-chapter", "leaguecraft");
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

describe("the register (HI1-C5 / C5B)", () => {
  it("is the second spread, before any of the tour", () => {
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-chapter", "arrival");
    advance();
    expect(page()).toHaveAttribute("data-chapter", "registration");
    expect(screen.getByTestId("academy-registration-form")).toBeTruthy();
  });

  it("asks for two things and only two", () => {
    // HI1-C5B removed the optional password and the linking checkbox. Removed,
    // not hidden: a password with nothing to authenticate against and a
    // checkbox with no Verify page behind it were UI for an account this screen
    // does not make.
    render(<AcademyWelcomePage />);
    advance();
    const form = screen.getByTestId("academy-registration-form");
    expect(form.querySelectorAll("input, select")).toHaveLength(2);
    expect(form.querySelector('input[type="password"]')).toBeNull();
    expect(form.querySelector('input[type="checkbox"]')).toBeNull();
    expect(form.textContent).not.toMatch(/password/i);
    expect(page().textContent).not.toMatch(/riot|discord/i);
  });

  it("will not let the tome turn past itself, by any input the page offers", () => {
    render(<AcademyWelcomePage />);
    advance();

    // The advance control is not merely inert here — it is gone, because a
    // "Next" that does nothing is worse than no Next at all.
    expect(screen.queryByTestId("academy-welcome-advance")).toBeNull();
    // A click on the scene, and the keys, mean nothing on this page either.
    fireEvent.click(screen.getByTestId("academy-tome-book"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: " " });
    expect(page()).toHaveAttribute("data-chapter", "registration");
  });

  it("refuses an empty name and an unchosen rank, and says why at the field", () => {
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-registration-submit"));

    expect(page()).toHaveAttribute("data-chapter", "registration");
    // AUTH3: the register no longer has its own sentence for this. The name it
    // takes is the same public username signup and /profile take, so the three
    // screens share one policy and one voice — see lib/identity/username.ts.
    expect(screen.getByTestId("academy-registration-username-error").textContent).toMatch(
      /between 2 and 24 characters/i,
    );
    expect(screen.getByTestId("academy-registration-rank-error")).toBeTruthy();
    expect(screen.getByTestId("academy-registration-username")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(readAcademyRegistration()).toBeNull();
  });

  it("clears an error the moment it stops being true", () => {
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-registration-submit"));
    expect(screen.getByTestId("academy-registration-username-error")).toBeTruthy();

    fireEvent.change(screen.getByTestId("academy-registration-username"), {
      target: { value: "Ashe" },
    });
    expect(screen.queryByTestId("academy-registration-username-error")).toBeNull();
    // …and the rank's error is still there, because that one is still true.
    expect(screen.getByTestId("academy-registration-rank-error")).toBeTruthy();
  });

  it("offers the whole ladder, with Unranked and Not sure as real answers", () => {
    render(<AcademyWelcomePage />);
    advance();
    const options = Array.from(
      screen.getByTestId("academy-registration-rank").querySelectorAll("option"),
    ).map((o) => o.textContent);
    for (const tier of [
      "Unranked",
      "Iron",
      "Bronze",
      "Silver",
      "Gold",
      "Platinum",
      "Emerald",
      "Diamond",
      "Master",
      "Grandmaster",
      "Challenger",
      "Not sure / Prefer not to say",
    ]) {
      expect(options).toContain(tier);
    }
  });

  it("accepts every one of the twelve ranks", () => {
    // Each is a real answer a visitor can give. A rank the form offers but the
    // page will not accept would strand someone on page two with no way past.
    for (const rank of LEAGUE_RANKS) {
      resetStorage();
      cleanup();
      render(<AcademyWelcomePage />);
      advance();
      register({ username: "Summoner", rank: rank.id });
      expect(page(), rank.id).toHaveAttribute("data-chapter", "leaguecraft");
      expect(readAcademyRegistration()?.rank, rank.id).toBe(rank.id);
    }
  });

  it("records the registration and turns the page", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "  Summoner   Yi ", rank: "diamond" });

    expect(readAcademyRegistration()).toMatchObject({
      // Normalised on the way in: this name becomes profiles.display_name.
      username: "Summoner Yi",
      rank: "diamond",
      adoptedBy: null,
    });
    expect(page()).toHaveAttribute("data-chapter", "leaguecraft");
  });

  it("asks for the profile write, without waiting for the answer", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Orianna", rank: "challenger" });
    expect(mocks.adopt).toHaveBeenCalled();
    // The page turned on the same tick; nothing waited on the network.
    expect(page()).toHaveAttribute("data-chapter", "leaguecraft");
  });

  it("survives an adoption that rejects outright", () => {
    // Fire-and-forget must mean it: a cold backend may cost the visitor the
    // durability, never the page turn.
    mocks.adopt.mockRejectedValueOnce(new Error("network"));
    render(<AcademyWelcomePage />);
    advance();
    expect(() => register()).not.toThrow();
    expect(page()).toHaveAttribute("data-chapter", "leaguecraft");
  });

  it("mirrors the answers onto the facing register card as they are given", () => {
    render(<AcademyWelcomePage />);
    advance();
    const card = () => screen.getAllByTestId("academy-register-card")[0];
    expect(card()).toHaveAttribute("data-sealed", "false");

    fireEvent.change(screen.getByTestId("academy-registration-username"), {
      target: { value: "Lulu" },
    });
    expect(card().textContent).toContain("Lulu");
    expect(card()).toHaveAttribute("data-sealed", "false");

    fireEvent.change(screen.getByTestId("academy-registration-rank"), {
      target: { value: "emerald" },
    });
    expect(card().textContent).toContain("Emerald");
    // Both halves given: the seal presses.
    expect(card()).toHaveAttribute("data-sealed", "true");
  });

  it("keeps the card out of the accessibility tree — the form is already there", () => {
    render(<AcademyWelcomePage />);
    advance();
    expect(screen.getAllByTestId("academy-register-card")[0]).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps what was typed when the visitor steps back to re-read the arrival", () => {
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.change(screen.getByTestId("academy-registration-username"), {
      target: { value: "Zilean" },
    });
    fireEvent.click(screen.getByTestId("academy-welcome-back"));
    expect(page()).toHaveAttribute("data-chapter", "arrival");
    advance();
    expect(screen.getByTestId("academy-registration-username")).toHaveValue("Zilean");
  });

  it("comes back pre-filled for someone who has answered it before", () => {
    // A reload, or a replay. Presenting a returning visitor an empty register
    // and making them retype their own name to pass a page they have already
    // passed would be the introduction forgetting them.
    saveAcademyRegistration({ username: "Ekko", rank: "master" });
    render(<AcademyWelcomePage />);
    advance();
    expect(screen.getByTestId("academy-registration-username")).toHaveValue("Ekko");
    expect(screen.getByTestId("academy-registration-rank")).toHaveValue("master");
  });

  it("does not move focus into a text field when the page turns", () => {
    // The finale moves focus because its control unmounts under the visitor.
    // Doing the same here would open the keyboard on every phone the instant
    // the page turned — over a landscape layout with ~360px of height.
    render(<AcademyWelcomePage />);
    advance();
    expect(document.activeElement).not.toBe(screen.getByTestId("academy-registration-username"));
  });

  it("carries no control on the sheet while it is turning", async () => {
    // The same rule the exits follow: a focusable control that has become
    // invisible scenery is a tab trap. The register's sheet, unlike the
    // finale's, genuinely does turn.
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);
    advance(); // finish the arrival
    advance(); // turn to the register
    await run(900);
    for (let i = 0; i < 60 && !screen.queryByTestId("academy-registration-form"); i += 1) {
      await run(250, 250);
    }
    register({ username: "Karma", rank: "gold" });
    expect(page()).toHaveAttribute("data-turning", "true");
    // One form on the live spread would be fine; the ghost must not add a
    // second one riding the paper.
    expect(screen.queryAllByTestId("academy-registration-form")).toHaveLength(0);
    expect(screen.queryAllByTestId("academy-welcome-signin")).toHaveLength(0);
    await run(900);
  });
});

describe("the register is a real gate (HI1-C5B)", () => {
  it("offers a fresh visitor no way out of the book before they answer it", () => {
    // An exit beside a required question is an invitation to answer it with a
    // shrug — and the two answers behind it are the only reason the
    // introduction asks for anything at all.
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-registered", "false");
    expect(screen.queryByTestId("academy-welcome-skip")).toBeNull();
    advance();
    expect(page()).toHaveAttribute("data-chapter", "registration");
    expect(screen.queryByTestId("academy-welcome-skip")).toBeNull();
  });

  it("opens the exit the moment the register is answered", () => {
    render(<AcademyWelcomePage />);
    advance();
    register();
    expect(page()).toHaveAttribute("data-registered", "true");
    expect(screen.getByTestId("academy-welcome-skip")).toBeTruthy();
  });

  it("keeps the exit on every chapter after that", () => {
    render(<AcademyWelcomePage />);
    advance();
    register();
    advance(); // Combat Lab
    expect(screen.getByTestId("academy-welcome-skip")).toBeTruthy();
  });

  it("gives a returning visitor their exit back on page one", () => {
    // Gated on a registration EXISTING, not on the chapter index: someone
    // replaying the introduction has already given what it is withheld for.
    saveAcademyRegistration({ username: "Ekko", rank: "master" });
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-registered", "true");
    expect(screen.getByTestId("academy-welcome-skip")).toBeTruthy();
  });

  it("is not a trap even before it is answered — Back still works", () => {
    render(<AcademyWelcomePage />);
    advance();
    expect(screen.getByTestId("academy-welcome-back")).toBeTruthy();
    fireEvent.click(screen.getByTestId("academy-welcome-back"));
    expect(page()).toHaveAttribute("data-chapter", "arrival");
  });

  it("is not a trap even before it is answered — Sign In is a real way out", () => {
    render(<AcademyWelcomePage />);
    advance();
    expect(screen.getByTestId("academy-welcome-signin")).toBeEnabled();
  });
});

describe("Sign In — the returning visitor's escape hatch (HI1-C5B)", () => {
  it("lives on the register, and nowhere else", () => {
    render(<AcademyWelcomePage />);
    expect(screen.queryByTestId("academy-welcome-signin")).toBeNull();
    advance();
    expect(screen.getByTestId("academy-welcome-signin")).toBeTruthy();
    register();
    expect(screen.queryByTestId("academy-welcome-signin")).toBeNull();
  });

  it("sits at the BOTTOM of the page, below the register and its button", () => {
    render(<AcademyWelcomePage />);
    advance();
    const writing = page().querySelector(".tome-writing")!;
    const nodes = Array.from(writing.querySelectorAll("*"));
    const submitAt = nodes.indexOf(screen.getByTestId("academy-registration-submit"));
    const signInAt = nodes.indexOf(screen.getByTestId("academy-welcome-signin"));
    expect(submitAt).toBeGreaterThan(-1);
    expect(signInAt).toBeGreaterThan(submitAt);
    // And it is the last thing in the page's writing, full stop.
    expect(writing.lastElementChild?.contains(screen.getByTestId("academy-welcome-signin"))).toBe(
      true,
    );
  });

  it("is the LAST thing the page reveals", async () => {
    // The whole placement rule: a new visitor reads the register, fills it in
    // and sees its button before this line is offered to them at all.
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);
    advance(); // finish the arrival
    advance(); // turn to the register
    await run(900);

    // The form arrives first, and the sign-in is still not live.
    for (let i = 0; i < 60 && !screen.queryByTestId("academy-registration-form"); i += 1) {
      await run(250, 250);
    }
    expect(screen.getByTestId("academy-registration-form")).toBeTruthy();
    expect(screen.getByTestId("academy-welcome-signin")).toBeDisabled();

    // …and only then does it become the visitor's to press.
    for (let i = 0; i < 20 && screen.getByTestId("academy-welcome-signin").hasAttribute("disabled"); i += 1) {
      await run(250, 250);
    }
    expect(screen.getByTestId("academy-welcome-signin")).toBeEnabled();
  });

  it("holds its space from the first frame, so it never shoves the form", () => {
    // A line appearing under a field someone is typing into would move the
    // field. The row is in the layout the whole time; only its ink waits.
    setReducedMotion(false);
    render(<AcademyWelcomePage />);
    advance();
    advance();
    const row = page().querySelector(".tome-signin");
    expect(row).toBeTruthy();
    expect(row?.closest(".tome-slot")).toHaveAttribute("data-revealed", "false");
    // Present, but reachable by nobody: not the keyboard, not a stray click,
    // not a screen reader.
    expect(screen.getByTestId("academy-welcome-signin")).toBeDisabled();
    expect(row).toHaveAttribute("aria-hidden", "true");
  });

  it("is visually secondary — quiet text beside the register's one filled control", () => {
    render(<AcademyWelcomePage />);
    advance();
    const signIn = screen.getByTestId("academy-welcome-signin");
    const submit = screen.getByTestId("academy-registration-submit");
    // The primary action is the gilt submit; this must not be a second one.
    expect(submit).toHaveClass("tome-submit");
    expect(signIn).toHaveClass("tome-signin-action");
    expect(signIn.className).not.toMatch(/tome-submit|tome-exit/);
    expect(signIn.closest(".tome-signin")?.textContent).toContain("Already have an account?");
  });

  it("hands off to the existing auth screen, returning to the hub", () => {
    // Not a second login: /auth already owns sign-in, the confirmation resend,
    // the forgotten-password path and the guest-upgrade panel.
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-welcome-signin"));
    expect(mocks.navigate).toHaveBeenCalledWith(ACADEMY_SIGN_IN_ROUTE);
    expect(ACADEMY_SIGN_IN_ROUTE).toContain("/auth?");
    expect(ACADEMY_SIGN_IN_ROUTE).toContain(`returnTo=${encodeURIComponent(LEAGUE_HOME_ROUTE)}`);
  });

  it("marks the introduction handled, so a signed-in returner is never re-shown it", () => {
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-welcome-signin"));
    expect(hasHandledAcademyWelcome()).toBe(true);
    expect(readAcademyWelcomeState()?.outcome).toBe("signed-in");
  });

  it("does not replace history — Back returns to the book, not past it", () => {
    // The finale's exits ARE decisions and replace. This is a detour.
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-welcome-signin"));
    expect(mocks.navigate).not.toHaveBeenCalledWith(expect.anything(), { replace: true });
  });

  it("does not register anybody on the way out", () => {
    render(<AcademyWelcomePage />);
    advance();
    fireEvent.click(screen.getByTestId("academy-welcome-signin"));
    expect(readAcademyRegistration()).toBeNull();
    expect(mocks.adopt).not.toHaveBeenCalled();
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

/**
 * Give jsdom a `decode()` so the readiness gate believes it is in a browser,
 * and take control of what that decode does. Without one the gate correctly
 * recognises an environment that cannot report and opens immediately — which
 * is what every other test in this file relies on.
 */
function stubDecode(impl: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: impl,
  });
}

function restoreDecode() {
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
}

describe("the opening frame (HI1-C4)", () => {
  it("reserves the book's geometry before a pixel of it has arrived", () => {
    // THE regression this pass fixed. `.tome-book` is `height: auto`, so with
    // no intrinsic ratio stated the img measures 0 until the file decodes, the
    // flex column above it measures 0 with it, and both page boxes — absolutely
    // positioned against that column — collapse into a zero-height strip with
    // the chapter's writing spilling out. The book landing then snapped the
    // whole spread into place in front of the visitor.
    render(<AcademyWelcomePage />);
    const book = screen.getByTestId("academy-tome-book");
    expect(book).toHaveAttribute("width", "1000");
    expect(book).toHaveAttribute("height", "666");
  });

  it("opens the curtain in an environment that cannot report on decoding", async () => {
    // jsdom loads no subresources and has no `decode()`. The gate must
    // recognise that and open on the first render — otherwise this suite, and
    // server rendering, would sit for ever in front of a held frame.
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-ready", "true");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("holds the clock, and the pen, until the stage is actually there", async () => {
    // With a decode that never settles, nothing may start: no slot released,
    // no scribble. The visitor is looking at a room, not at a book writing
    // itself onto a stage that has not arrived.
    setReducedMotion(false);
    stubDecode(() => new Promise<void>(() => {}));
    try {
      vi.useFakeTimers();
      render(<AcademyWelcomePage />);
      expect(page()).toHaveAttribute("data-ready", "false");
      await run(SCENE_READY_CAP_MS - 250);
      expect(page()).toHaveAttribute("data-ready", "false");
      expect(stepOf()).toBe(0);
      expect(audio.scribble).not.toHaveBeenCalled();

      // …but the hold has a ceiling, and past it the introduction runs anyway.
      // A wedged asset host may cost the visitor the polish, never the page.
      await run(500);
      expect(page()).toHaveAttribute("data-ready", "true");
    } finally {
      restoreDecode();
    }
  });

  it("starts the moment the stage lands, on the cadence HI1-C3 set", async () => {
    setReducedMotion(false);
    let land: (() => void) | undefined;
    const decoded = new Promise<void>((resolve) => {
      land = resolve;
    });
    stubDecode(() => decoded);
    try {
      vi.useFakeTimers();
      render(<AcademyWelcomePage />);
      expect(stepOf()).toBe(0);

      await act(async () => {
        land?.();
        await decoded;
      });
      expect(page()).toHaveAttribute("data-ready", "true");

      // And from there the sequence is exactly the one HI1-C3 tuned: the
      // opening pause, then the heading. Nothing about the cadence moved.
      await run(OPENING_PAUSE_MS + 60);
      expect(stepOf()).toBe(1);
    } finally {
      restoreDecode();
    }
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
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
  });

  it("uses the approved product name, not the artwork's engraved wording", () => {
    // The Leaguecraft plate has "Leaguecraft Studies" baked into its pixels.
    // The chapter must say "Leaguecraft" — and must not have been "fixed" by
    // renaming the product to match the art.
    render(<AcademyWelcomePage />);
    advance();
    register();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Leaguecraft");
    expect(screen.queryByText(/Leaguecraft Studies/)).toBeNull();
  });

  it("does not present Ranked as a peer of Leaguecraft", () => {
    // Ranked lives INSIDE Leaguecraft. Promoting it to a chapter would tell a
    // new visitor they are two products to choose between, which is wrong.
    expect(ACADEMY_CHAPTERS.map((c) => c.heading)).not.toContain("Ranked");
  });

  it("promises only surfaces that exist", () => {
    // The last chapter is grounded in the shipped pro-match explorer, the live
    // esports viewer and the archives. It must never name a product a visitor
    // cannot find — GRAPH1 is a dev route and is not a destination.
    const headings = ACADEMY_CHAPTERS.map((c) => c.heading);
    expect(headings).toContain("The Complete League Library");
    expect(headings).not.toContain("League Graphs");
  });

  it("keeps the sequence short enough to sit through", () => {
    // The redesign exists to stop this feeling like a wizard. Five spreads,
    // exactly one of which is a form, and THREE BLOCKS per chapter is the
    // ceiling — that is the pacing budget as much as the page's: one more
    // block is one more stop on every chapter that takes it.
    expect(ACADEMY_CHAPTERS).toHaveLength(5);
    expect(ACADEMY_CHAPTERS.filter((c) => c.registration)).toHaveLength(1);
    for (const chapter of ACADEMY_CHAPTERS) {
      expect(chapter.lines.length).toBeLessThanOrEqual(3);
    }
  });

});

/* -------------------------------------------------------------------------- */

/**
 * The approved copy, word for word.
 *
 * Asserted against the RENDERED page rather than against ACADEMY_CHAPTERS, so
 * these hold whatever a future refactor does to the data shape — and asserted
 * in full sentences rather than by keyword, because "the wording was approved"
 * is exactly the kind of thing a well-meaning edit erodes one clause at a time.
 * (Headings are displayed in caps by CSS; the document keeps the sentence, and
 * that is what a screen reader reads and what is checked here.)
 */
describe("the approved copy", () => {
  /** The whole page's text, whitespace-normalised. */
  const text = () => (page().textContent ?? "").replace(/\s+/g, " ");

  it("Arrival", () => {
    render(<AcademyWelcomePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome, Summoner");
    expect(text()).toContain("Welcome to Mogzy's Academy.");
    expect(text()).toContain(
      "There's always more to learn about League. Let's see how far you can go.",
    );
  });

  it("Registration", () => {
    render(<AcademyWelcomePage />);
    advance();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Every student needs a name.",
    );
    expect(text()).toContain("Choose your Academy Username.");
    expect(text()).toContain("Select your League of Legends Rank.");
  });

  it("Leaguecraft", () => {
    render(<AcademyWelcomePage />);
    advance();
    register();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Leaguecraft");
    expect(text()).toContain(
      "Quizzes designed to grow your game knowledge and test your limits.",
    );
    expect(text()).toContain("Prove you're the smartest.");
  });

  it("Combat Lab", () => {
    render(<AcademyWelcomePage />);
    advance();
    register();
    advance();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Combat Lab");
    expect(text()).toContain("Simulate any matchup.");
    expect(text()).toContain("Calculate any situation.");
    expect(text()).toContain("Master every detail of the Rift.");
  });

  it("the last page", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "The Complete League Library",
    );
    expect(text()).toContain(
      "Mogzy brings together every champion, item, rune, system, and interaction in League of Legends.",
    );
    expect(text()).toContain(
      "Explore pro data. Learn the history of League esports and your favorite players.",
    );
    expect(text()).toContain("Discover insights. Share what you find.");
  });

  it("keeps the rank placeholder exactly as approved", () => {
    // A native select's first option IS its placeholder — there is no attribute
    // to fall back on — so this string is load-bearing UI copy, not decoration.
    render(<AcademyWelcomePage />);
    advance();
    const rank = screen.getByTestId("academy-registration-rank");
    expect(rank.querySelector("option")?.textContent).toBe(
      "Select your rank in League of Legends",
    );
  });

  it("carries none of the removed pills, on any page", () => {
    // Leaguecraft and the Combat Lab each ended in a row of small-caps pills
    // naming their sub-features. They said nothing the copy above them did not,
    // and they are the "feature grid" language this redesign exists to escape.
    //
    // Asserted STRUCTURALLY, not by sweeping the page's text: "any matchup" is
    // now a phrase in the Combat Lab's own approved copy, and "Ranked" is a
    // substring of the rank picker's "Unranked". A text sweep for those labels
    // would fail on the very copy this pass introduced — the regression to
    // catch is a row of chips coming back, so the chips are what is looked for.
    const gone = [
      "quizzes",
      "mastery",
      "ranked",
      "stat check",
      "any matchup",
      "any build",
      "full breakdown",
    ];
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      expect(page().querySelector(".tome-marginalia")).toBeNull();
      for (const item of Array.from(page().querySelectorAll("li"))) {
        const label = (item.textContent ?? "").trim().toLowerCase();
        expect(gone).not.toContain(label);
      }
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The reveal advances by BLOCKS, not by words.
 *
 * The visible complaint this pass fixes, written down. A block is one authored
 * line and it arrives whole; nothing on the page is staged per word, per
 * sentence or per character, and the sequence has exactly one stop per block.
 */
describe("the block reveal", () => {
  it("stages a whole paragraph as one element, with no per-word markup", () => {
    render(<AcademyWelcomePage />);
    // The old machinery: a span per word carrying its own `--w` delay, and a
    // span per sentence gating it. Neither may come back.
    expect(page().querySelector(".tome-word")).toBeNull();
    expect(page().querySelector(".tome-phrase")).toBeNull();

    const blocks = Array.from(page().querySelectorAll<HTMLElement>(".tome-block"));
    expect(blocks.map((b) => b.textContent)).toEqual(ACADEMY_CHAPTERS[0].lines);
    // Each block is ONE gated element holding its whole paragraph as text.
    for (const block of blocks) {
      expect(block.getAttribute("data-revealed")).toBeTruthy();
      expect(block.querySelectorAll("span")).toHaveLength(0);
    }
  });

  it("releases one block per beat, in order, at the specified pace", async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<AcademyWelcomePage />);
    const blocks = () => Array.from(page().querySelectorAll(".tome-block"));
    const shown = () => blocks().filter((b) => b.getAttribute("data-revealed") === "true").length;

    // Nothing yet; then the heading; then the blocks, one at a time.
    expect(shown()).toBe(0);
    await run(OPENING_PAUSE_MS + HEADING_INTERVAL_MS + 60, 60);
    expect(shown()).toBe(1);
    await run(BLOCK_INTERVAL_MS, 60);
    expect(shown()).toBe(2);
    expect(stepOf()).toBe(slotCount(ACADEMY_CHAPTERS[0]));
  });

  it("has one stop per block and no more", () => {
    // Slot arithmetic is the cadence: a chapter's slots are its heading, its
    // blocks, and — where it has them — its controls. Anything else in there
    // is a beat the reader has to sit through for nothing.
    for (const chapter of ACADEMY_CHAPTERS) {
      const controls = (chapter.finale || chapter.registration ? 1 : 0) + (chapter.registration ? 1 : 0);
      expect(slotCount(chapter)).toBe(1 + chapter.lines.length + controls);
    }
  });
});

/* -------------------------------------------------------------------------- */

/** The champion drawings faded into the paper. */
describe("the champions in the paper", () => {
  it("prints at most one per page, everywhere in the book", () => {
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      for (const region of Array.from(page().querySelectorAll(".tome-page, .tome-sheet"))) {
        expect(region.querySelectorAll("[data-testid='tome-champion']").length).toBeLessThanOrEqual(
          1,
        );
      }
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
  });

  it("opens on Ahri behind Mogzy and Jinx behind the words", () => {
    render(<AcademyWelcomePage />);
    const verso = page().querySelector(".tome-page-verso")!;
    const recto = page().querySelector(".tome-page-recto")!;
    expect(verso.querySelector("[data-testid='tome-champion'] img")?.getAttribute("src")).toBe(
      CHAMPION_ART.ahri,
    );
    expect(recto.querySelector("[data-testid='tome-champion'] img")?.getAttribute("src")).toBe(
      CHAMPION_ART.jinx,
    );
  });

  it("closes the book with one champion, on the page that carries the copy", () => {
    render(<AcademyWelcomePage />);
    goToFinale();
    const verso = page().querySelector(".tome-page-verso")!;
    const recto = page().querySelector(".tome-page-recto")!;
    // The graph stands ALONE on the left. Nothing is printed behind it.
    expect(verso.querySelector("[data-testid='tome-champion']")).toBeNull();
    expect(recto.querySelector("[data-testid='tome-champion'] img")?.getAttribute("src")).toBe(
      CHAMPION_ART.yasuo,
    );
  });

  it("uses the approved files as they are, with no derivative in the path", () => {
    // No mask, no engraving, no processed splash: the drawings the product
    // already has, served from where they already live.
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      for (const img of Array.from(
        page().querySelectorAll<HTMLImageElement>("[data-testid='tome-champion'] img"),
      )) {
        expect(Object.values(CHAMPION_ART)).toContain(img.getAttribute("src"));
      }
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
  });

  it("keeps them out of the accessibility tree — they are paper, not content", () => {
    render(<AcademyWelcomePage />);
    for (const layer of Array.from(page().querySelectorAll("[data-testid='tome-champion']"))) {
      expect(layer.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

/* -------------------------------------------------------------------------- */

/** The restored last spread. */
describe("the last spread", () => {
  it("puts the restored Pro Data graph on the left, and only it", () => {
    // The exact approved animated graph from the Pro Data chapter, recovered
    // from 75d60da9 — ruled axes, two series and five plotted points, drawn in
    // ink with `tome-stroke` / `tome-dot`. Restoring it is the point of the
    // pass, so its parts are counted rather than merely looked for.
    render(<AcademyWelcomePage />);
    goToFinale();
    const verso = page().querySelector(".tome-page-verso")!;
    const svg = verso.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    expect(svg.querySelectorAll(".tome-stroke").length).toBe(7);
    expect(svg.querySelectorAll(".tome-dot").length).toBe(5);
    // ONE figure on that page. Not three modules, not a triangle, not cards.
    expect(verso.querySelectorAll("svg")).toHaveLength(1);
    expect(ACADEMY_CHAPTERS[ACADEMY_CHAPTERS.length - 1].art.kind).toBe("chart");
  });

  it("carries none of the dashboard the finale used to be", () => {
    // The reference docket, the panel grounds of the triangular composition and
    // the footnote all went with the rewrite. This page is a conclusion.
    render(<AcademyWelcomePage />);
    goToFinale();
    expect(screen.queryByTestId("academy-welcome-docket")).toBeNull();
    expect(page().querySelector(".tome-docket")).toBeNull();
    expect(page().querySelector(".tome-fade")).toBeNull();
    expect(page().querySelector(".tome-footnote")).toBeNull();
    const text = (page().textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toContain("Mogzy Archives");
    expect(text).not.toContain("Patch reports");
    expect(text).not.toContain("Pro Data & the Archives");
  });

  it("ends the book rather than adding a page that only asks", () => {
    const last = ACADEMY_CHAPTERS[ACADEMY_CHAPTERS.length - 1];
    expect(last.finale).toBe(true);
    expect(last.lines.length).toBeGreaterThan(0);
    expect(ACADEMY_CHAPTERS.filter((c) => c.finale)).toHaveLength(1);
  });
});

