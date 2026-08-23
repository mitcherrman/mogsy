/**
 * The tome does not move (HI1 polish).
 *
 * WHAT WENT WRONG. The scene is a centred flex column — tome, forward control,
 * rail — and the two control blocks were conditionally MOUNTED inside it. The
 * forward control is dropped on the register and on the finale, where the page
 * owns its own forward action; the rail's Back appears on chapter two and its
 * exit appears once the register is answered. A centred column whose height
 * changes re-centres, so the book slid down the screen and back up again twice
 * a visit. Measured in a real browser at 1440x900 before the fix:
 *
 *   arrival, leaguecraft, combat-lab   x 242.17  y 51.03  955.64 x 690.97
 *   registration, form visible         x 242.17  y 80.11  955.64 x 690.97
 *   finale, exits visible              x 242.17  y 80.11  955.64 x 690.97
 *
 * Same size, 29.08px lower. After the fix every one of those states measures
 * x 242.17 y 52.52 955.64 x 690.97 — one rectangle, to the pixel.
 *
 * WHY THIS FILE ASSERTS INPUTS RATHER THAN PIXELS. jsdom has no layout engine:
 * `getBoundingClientRect()` returns zeros for every element on this page, so a
 * test that compared rectangles here would compare 0 to 0 and pass whatever the
 * component did. What it CAN hold is the two things the geometry is a pure
 * function of, and they are the two things a future change would break:
 *
 *   1. the tome's own sizing input — `--tome-chrome` — is one value per
 *      viewport shape and never varies by chapter or by reveal state
 *   2. the column's height is a constant, because both control rows are ALWAYS
 *      mounted and both declare a reserved height rather than measuring their
 *      contents
 *
 * The CSS half of the same contract — that the rows actually declare `height`
 * and `flex: none`, and that the budget covers what the rows reserve — is in
 * tomeGeometry.test.ts, which reads the stylesheet. Together those two are the
 * whole of the guarantee: if the inputs are constant and the rules are as
 * written, the rectangle cannot move.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AcademyWelcomePage from "./AcademyWelcomePage";
import { ACADEMY_CHAPTERS } from "./academyChapters";
import { SCENE_PADDING, TOME_CHROME } from "./tomeChrome";

import { installLocalStorageStub } from "@/test/localStorageStub";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), adopt: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("./tomeAudio", () => ({
  useTomeAudio: () => ({ scribble: vi.fn(), stopScribble: vi.fn(), pageTurn: vi.fn() }),
}));
vi.mock("@/lib/welcome/provisional-identity", () => ({
  adoptAcademyIdentity: mocks.adopt.mockResolvedValue({ written: [], settled: false }),
}));

const resetStorage = installLocalStorageStub();

/**
 * Reduced motion throughout, which opens every chapter COMPLETE.
 *
 * That is not a shortcut past the reveal — it is how this suite reaches the
 * fully-revealed end of every chapter without a clock. The partially-revealed
 * end is reached separately, by rendering fresh with the clock running (see
 * the last describe).
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
  resetStorage();
});

const page = () => screen.getByTestId("academy-welcome");
const tome = () => page().querySelector<HTMLElement>(".academy-tome")!;
const q = (id: string) => screen.queryByTestId(id);

/** Everything the tome's rendered rectangle is a function of. */
function geometry() {
  const controls = screen.getByTestId("academy-welcome-controls");
  const rail = screen.getByTestId("academy-welcome-rail");
  const scene = screen.getByTestId("academy-welcome-scene");
  return {
    chrome: tome().style.getPropertyValue("--tome-chrome"),
    variant: tome().className.includes("tome-spread") ? "spread" : "single",
    controlsHeight: controls.style.getPropertyValue("--tome-controls-h"),
    railHeight: rail.style.getPropertyValue("--tome-rail-h"),
    scenePaddingTop: scene.style.paddingTop,
    scenePaddingBottom: scene.style.paddingBottom,
  };
}

/** One page forward, however this page happens to turn. */
function nextChapter() {
  if (q("academy-registration-form")) {
    fireEvent.change(screen.getByTestId("academy-registration-username"), {
      target: { value: "Summoner" },
    });
    fireEvent.change(screen.getByTestId("academy-registration-rank"), {
      target: { value: "gold" },
    });
    fireEvent.click(screen.getByTestId("academy-registration-submit"));
    return;
  }
  fireEvent.click(screen.getByTestId("academy-welcome-advance"));
}

/* -------------------------------------------------------------------------- */

describe("the tome's geometry is the same on every page of the book", () => {
  it("does not vary by chapter, in either direction", () => {
    render(<AcademyWelcomePage />);
    const first = geometry();
    const seen: string[] = [];

    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      seen.push(page().getAttribute("data-chapter") ?? "");
      expect(geometry()).toEqual(first);
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
    // Every chapter, and the finale among them.
    expect(seen).toEqual(ACADEMY_CHAPTERS.map((c) => c.id));

    // And back again, which is the direction the register is re-entered from.
    for (let i = 0; i < ACADEMY_CHAPTERS.length - 1; i += 1) {
      fireEvent.click(screen.getByTestId("academy-welcome-back"));
      expect(geometry()).toEqual(first);
    }
    expect(page()).toHaveAttribute("data-chapter", ACADEMY_CHAPTERS[0].id);
  });

  it("does not vary with which controls happen to be on screen", () => {
    // The four states that used to move it: no Back (chapter one), Back but no
    // exit (before the register), Back and exit (after it), and the two pages
    // with no forward control at all.
    render(<AcademyWelcomePage />);
    const first = geometry();
    const states: Record<string, boolean[]> = {};

    const note = (label: string) => {
      states[label] = [!!q("academy-welcome-back"), !!q("academy-welcome-skip"), !!q("academy-welcome-advance")];
      expect(geometry()).toEqual(first);
    };

    note("arrival");
    nextChapter();
    note("register, unanswered");
    nextChapter();
    note("leaguecraft, registered");
    nextChapter();
    nextChapter();
    note("finale");

    // The states really were different — otherwise this test proves nothing.
    expect(states["arrival"]).toEqual([false, false, true]);
    expect(states["register, unanswered"]).toEqual([true, false, false]);
    expect(states["leaguecraft, registered"]).toEqual([true, true, true]);
    expect(states["finale"]).toEqual([true, false, false]);
  });

  it("keeps both control rows mounted whether or not they hold anything", () => {
    // The fix itself. A row that unmounts takes its height with it, and a
    // centred column re-centres around what is left.
    render(<AcademyWelcomePage />);
    for (let i = 0; i < ACADEMY_CHAPTERS.length; i += 1) {
      expect(screen.getByTestId("academy-welcome-controls")).toBeTruthy();
      expect(screen.getByTestId("academy-welcome-rail")).toBeTruthy();
      if (i < ACADEMY_CHAPTERS.length - 1) nextChapter();
    }
    // The finale: no forward control inside the row, and the row still there.
    expect(q("academy-welcome-advance")).toBeNull();
    expect(screen.getByTestId("academy-welcome-controls")).toHaveAttribute(
      "data-occupied",
      "false",
    );
  });

  it("reserves exactly what tomeChrome declares, and inside the budget", () => {
    render(<AcademyWelcomePage />);
    const g = geometry();
    // jsdom reports the desktop viewport, so this is the `regular` chrome.
    expect(g.controlsHeight).toBe(`${TOME_CHROME.regular.controls}px`);
    expect(g.railHeight).toBe(`${TOME_CHROME.regular.rail}px`);
    expect(g.chrome).toBe(`${TOME_CHROME.regular.budget}px`);
    expect(g.scenePaddingTop).toBe(`${SCENE_PADDING.regular / 2}px`);
    expect(g.scenePaddingBottom).toBe(`${SCENE_PADDING.regular / 2}px`);
  });

  it("budgets at least the room the two rows and the padding take, at every size", () => {
    // The budget is what the tome subtracts from the viewport before sizing
    // itself. If it were ever less than the chrome actually standing under the
    // book, the book would size itself into the controls — which is the failure
    // the budget exists to prevent, and the one a well-meant "tighten the
    // spacing" edit would reintroduce.
    for (const key of ["regular", "compact"] as const) {
      const spec = TOME_CHROME[key];
      expect(spec.budget).toBeGreaterThanOrEqual(
        spec.controls + spec.rail + SCENE_PADDING[key],
      );
    }
  });
});

describe("nor does it vary with how much of the page has been written", () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("is the same at step zero as it is on a finished page", () => {
    render(<AcademyWelcomePage />);
    // Nothing written yet.
    expect(page()).toHaveAttribute("data-step", "0");
    const blank = geometry();

    // Turn onto the register — the one page a press lands but cannot turn — so
    // the finished state can be reached without leaving the chapter.
    fireEvent.click(screen.getByTestId("academy-welcome-advance"));
    expect(page()).toHaveAttribute("data-chapter", "registration");
    expect(geometry()).toEqual(blank);

    act(() => vi.advanceTimersByTime(1_200)); // let the sheet land
    expect(page()).toHaveAttribute("data-turning", "false");
    expect(geometry()).toEqual(blank);

    fireEvent.click(screen.getByTestId("academy-welcome-advance"));
    expect(page()).toHaveAttribute("data-complete", "true");
    expect(geometry()).toEqual(blank);
  });

  it("is the same while a sheet is physically in the air", () => {
    render(<AcademyWelcomePage />);
    const still = geometry();
    fireEvent.click(screen.getByTestId("academy-welcome-advance"));
    expect(page()).toHaveAttribute("data-turning", "true");
    expect(geometry()).toEqual(still);
  });
});
