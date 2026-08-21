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
import { OPENING_PAUSE_MS } from "./phrases";
import { SCENE_READY_CAP_MS } from "./useSceneReady";
import { slotCount, slotWriteMs } from "./useRevealSequence";
import {
  hasHandledAcademyWelcome,
  markAcademyWelcomeHandled,
  readAcademyWelcomeState,
} from "@/lib/welcome/academy-welcome";
import { readAcademyRegistration } from "@/lib/welcome/academy-registration";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

import { installLocalStorageStub } from "@/test/localStorageStub";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn(), seed: vi.fn() }));
const audio = vi.hoisted(() => ({
  scribble: vi.fn(),
  stopScribble: vi.fn(),
  pageTurn: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("./tomeAudio", () => ({ useTomeAudio: () => audio }));
// The register's two outward effects, both stubbed for the same reason the
// audio module is: these tests assert WHEN the page reaches for them, not what
// Sonner or Supabase do next. The profile seed in particular must be mocked
// rather than merely unused — importing the real module instantiates the
// Supabase client against jsdom's storage stub and rejects on its own clock.
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/welcome/provisional-identity", () => ({
  seedProfileDisplayName: mocks.seed.mockResolvedValue({ seeded: false, reason: "no-session" }),
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
function register(
  opts: { username?: string; rank?: string; password?: string; link?: boolean } = {},
) {
  fireEvent.change(screen.getByTestId("academy-registration-username"), {
    target: { value: opts.username ?? "Summoner" },
  });
  fireEvent.change(screen.getByTestId("academy-registration-rank"), {
    target: { value: opts.rank ?? "gold" },
  });
  if (opts.password !== undefined) {
    fireEvent.change(screen.getByTestId("academy-registration-password"), {
      target: { value: opts.password },
    });
  }
  if (opts.link) fireEvent.click(screen.getByTestId("academy-registration-link"));
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
    expect(page()).toHaveAttribute("data-chapter", "the-record");
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

  it("gives the last spread the same overlapping choreography", async () => {
    // The strongest chapter visually — and now the busiest — is not exempt from
    // the shared timing model. Its reveal follows the identical two-channel
    // contract: the triangular composition develops while the copy beside it is
    // still arriving.
    render(<AcademyWelcomePage />);
    const lastIndex = ACADEMY_CHAPTERS.findIndex((c) => c.id === "the-record");
    for (let i = 0; i < lastIndex; i += 1) {
      advance(); // finish the chapter
      nextChapter(); // turn the page — or answer the register, which turns it
      await run(1_000); // let the sheet land
    }
    expect(page()).toHaveAttribute("data-chapter", "the-record");

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

  it("Skip is a real exit from any chapter — the register included", () => {
    // The one thing that keeps "required" from meaning "trapped": the rail's
    // exit is on the register exactly as it is on every other page, and it
    // still records the visitor as handled.
    render(<AcademyWelcomePage />);
    advance();
    expect(page()).toHaveAttribute("data-chapter", "registration");
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

describe("the register (HI1-C5)", () => {
  it("is the second spread, before any of the tour", () => {
    render(<AcademyWelcomePage />);
    expect(page()).toHaveAttribute("data-chapter", "arrival");
    advance();
    expect(page()).toHaveAttribute("data-chapter", "registration");
    expect(screen.getByTestId("academy-registration-form")).toBeTruthy();
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
    expect(screen.getByTestId("academy-registration-username-error").textContent).toMatch(
      /needs a name/i,
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

  it("accepts Unranked — required does not mean ranked", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Fiddle", rank: "unranked" });
    expect(readAcademyRegistration()).toMatchObject({ username: "Fiddle", rank: "unranked" });
    expect(page()).toHaveAttribute("data-chapter", "leaguecraft");
  });

  it("records the registration, turns the page, and never stores the password", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "  Summoner   Yi ", rank: "diamond", password: "correcthorse" });

    const stored = readAcademyRegistration();
    expect(stored).toMatchObject({
      // Normalised on the way in: this is the name that gets printed back.
      username: "Summoner Yi",
      rank: "diamond",
      hasPassword: true,
      wantsLinking: false,
    });
    // THE security assertion of this phase. Nothing anywhere in storage may
    // contain the password — not under our key, not under anyone's.
    const dump = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "").join("|");
    expect(dump).not.toContain("correcthorse");
    expect(page()).toHaveAttribute("data-chapter", "leaguecraft");
  });

  it("tells a visitor with no password where their account lives — as a toast", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Sona", rank: "silver" });

    expect(mocks.toast).toHaveBeenCalledWith("Account stays on this device until verified");
    // A NOTIFICATION after continuing, never inline copy under the field: the
    // page itself must not carry it, or it reads as a warning about leaving a
    // box empty.
    expect(page().textContent).not.toContain("stays on this device");
  });

  it("says nothing extra when a password was set", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Sona", rank: "silver", password: "hunter2!" });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("rejects a password too short for the one the real sign-up screen accepts", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Sona", rank: "silver", password: "abc" });
    expect(screen.getByTestId("academy-registration-password-error")).toBeTruthy();
    expect(page()).toHaveAttribute("data-chapter", "registration");
    expect(readAcademyRegistration()).toBeNull();
  });

  it("keeps the linking intent when the box is ticked, and not when it is not", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Ekko", rank: "master", link: true });
    expect(readAcademyRegistration()?.wantsLinking).toBe(true);
  });

  it("does not claim a linking intent nobody expressed", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Ekko", rank: "master" });
    expect(readAcademyRegistration()?.wantsLinking).toBe(false);
  });

  it("still exits to the hub, because the Verify page does not exist yet", () => {
    // The whole of the forward-compatibility contract. The intent is RECORDED;
    // it may not invent a destination. When resolveLinkDestination() starts
    // returning a route, this is the test that has to change with it.
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Ekko", rank: "master", link: true });
    goToFinale();
    fireEvent.click(screen.getByTestId("academy-welcome-explore"));
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("offers the chosen name to a real profile, without waiting for the answer", () => {
    render(<AcademyWelcomePage />);
    advance();
    register({ username: "Orianna", rank: "challenger" });
    expect(mocks.seed).toHaveBeenCalledWith("Orianna");
    // The page turned on the same tick; nothing waited on the network.
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
    await run(900);
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
    expect(ACADEMY_CHAPTERS.find((c) => c.id === "leaguecraft")?.marginalia).toContain("Ranked");
  });

  it("promises only surfaces that exist", () => {
    // The data chapter is grounded in the shipped pro-match explorer and live
    // esports viewer. It must never be renamed to a product a visitor cannot
    // find — GRAPH1 is a dev route and is not a destination.
    const headings = ACADEMY_CHAPTERS.map((c) => c.heading);
    expect(headings).toContain("Pro Data & the Archives");
    expect(headings).not.toContain("League Graphs");
    // The merged spread still names both halves of what it merged: every
    // docket entry is a real hub destination, spelled the way the hub spells it.
    const docket = ACADEMY_CHAPTERS.find((c) => c.id === "the-record")?.docket ?? [];
    expect(docket.map((d) => d.label)).toContain("Mogzy Archives");
    expect(docket.map((d) => d.label)).toContain("Patch reports");
  });

  it("keeps the sequence short enough to sit through", () => {
    // The redesign exists to stop this feeling like a wizard, and HI1-C5 added
    // a page that ASKS for something — so the informational chapters had to pay
    // for it. Five spreads, exactly one of which is a form. Two lines per
    // chapter remains the ceiling: this is a book being written, not a landing
    // page.
    expect(ACADEMY_CHAPTERS).toHaveLength(5);
    expect(ACADEMY_CHAPTERS.filter((c) => c.registration)).toHaveLength(1);
    for (const chapter of ACADEMY_CHAPTERS) {
      expect(chapter.lines.length).toBeLessThanOrEqual(2);
    }
  });

  it("ends on the merged spread rather than on a page that only asks", () => {
    // The finale used to be its own chapter of no copy. Folding the exits onto
    // the last informational spread is what bought the register its page back,
    // and a re-added "How would you like to begin?" page would silently undo it.
    const last = ACADEMY_CHAPTERS[ACADEMY_CHAPTERS.length - 1];
    expect(last.finale).toBe(true);
    expect(last.id).toBe("the-record");
    expect(last.lines.length).toBeGreaterThan(0);
    expect(ACADEMY_CHAPTERS.filter((c) => c.finale)).toHaveLength(1);
  });

  it("gives the last spread a triangle on the left and a docket on the right", () => {
    // The composition IS the contract here: the left page is the statistical
    // side as a deliberate triangular figure, the right is the reference side
    // as a document. Swapping either for a row of cards is the regression.
    const last = ACADEMY_CHAPTERS[ACADEMY_CHAPTERS.length - 1];
    expect(last.art.kind).toBe("triptych");
    expect(last.docket).toHaveLength(3);
    // One annotation, never two — the docket IS this page's marginalia.
    expect(last.marginalia).toBeUndefined();
  });
});
