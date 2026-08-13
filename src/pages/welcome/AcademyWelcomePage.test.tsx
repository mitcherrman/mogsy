/**
 * Academy introduction (HI1) behaviour: the three stages advance, both exits
 * record an outcome BEFORE handing off, and the page stays viewable on replay.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AcademyWelcomePage from "./AcademyWelcomePage";
import { ACADEMY_MODES } from "./academyModes";
import {
  hasHandledAcademyWelcome,
  markAcademyWelcomeHandled,
  readAcademyWelcomeState,
} from "@/lib/welcome/academy-welcome";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

import { installLocalStorageStub } from "@/test/localStorageStub";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

// The pinned jsdom does not provide a working Storage — see localStorageStub.
const resetStorage = installLocalStorageStub();

/**
 * Run the suite under `prefers-reduced-motion: reduce`.
 *
 * Two reasons, both deliberate. Under animation, AnimatePresence `mode="wait"`
 * holds the outgoing stage until its exit transition reports completion, and
 * jsdom never drives those frames — the container would sit empty forever and
 * every cross-stage assertion would fail on a rendering artifact rather than on
 * behaviour. Reduced motion removes the transition entirely, so the swap is
 * synchronous. It also means these assertions cover the accessibility path a
 * motion-sensitive visitor actually gets.
 */
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
  resetStorage();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStorage();
});

/** Advance from stage 0 to the final choice stage. */
function goToChoiceStage() {
  fireEvent.click(screen.getByTestId("academy-welcome-continue"));
  fireEvent.click(screen.getByTestId("academy-welcome-continue"));
}

describe("stage flow", () => {
  it("opens on the welcome stage", () => {
    render(<AcademyWelcomePage />);
    expect(screen.getByTestId("academy-welcome")).toHaveAttribute("data-stage", "0");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Welcome to the Academy/i);
  });

  it("advances through all three stages and back again", () => {
    render(<AcademyWelcomePage />);
    const page = screen.getByTestId("academy-welcome");

    fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    expect(page).toHaveAttribute("data-stage", "1");

    fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    expect(page).toHaveAttribute("data-stage", "2");

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(page).toHaveAttribute("data-stage", "1");
  });

  it("offers no Back control on the first stage", () => {
    render(<AcademyWelcomePage />);
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
  });

  it("drops Continue and Skip on the final stage so the two choices stand alone", () => {
    render(<AcademyWelcomePage />);
    goToChoiceStage();
    expect(screen.queryByTestId("academy-welcome-continue")).toBeNull();
    expect(screen.queryByTestId("academy-welcome-skip")).toBeNull();
    expect(screen.getByTestId("academy-welcome-explore")).toBeTruthy();
    expect(screen.getByTestId("academy-welcome-tutorial")).toBeTruthy();
  });

  it("survives two Continue clicks with no delay between them", () => {
    // Regression: with <AnimatePresence mode="wait"> this stranded the page.
    // The second key change arrived while the first stage was still exiting,
    // the exit never completed, and the incoming stage never mounted — leaving
    // correct state (data-stage="2") above a completely empty content area.
    // Verified by hand in the browser before the fix, and reproduced here.
    render(<AcademyWelcomePage />);
    const continueBtn = screen.getByTestId("academy-welcome-continue");
    fireEvent.click(continueBtn);
    fireEvent.click(screen.getByTestId("academy-welcome-continue"));

    expect(screen.getByTestId("academy-welcome")).toHaveAttribute("data-stage", "2");
    // The point of the test: content, not just state.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/how do you want to start/i);
    expect(screen.getByTestId("academy-welcome-explore")).toBeTruthy();
  });

  it("never leaves the content area empty on any stage", () => {
    render(<AcademyWelcomePage />);
    for (const stage of [0, 1, 2]) {
      expect(screen.getByTestId("academy-welcome")).toHaveAttribute("data-stage", String(stage));
      // Every stage must render a heading — an empty stage is the failure mode.
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      if (stage < 2) fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    }
  });

  it("exposes step position to assistive tech", () => {
    render(<AcademyWelcomePage />);
    const steps = screen.getByRole("list", { name: /introduction progress/i });
    expect(steps.querySelectorAll("li")).toHaveLength(3);
    expect(steps.querySelector('[aria-current="step"]')).toBeTruthy();
  });
});

describe("exits", () => {
  it("Start Exploring records the outcome and goes to the hub", () => {
    render(<AcademyWelcomePage />);
    goToChoiceStage();
    fireEvent.click(screen.getByTestId("academy-welcome-explore"));

    expect(readAcademyWelcomeState()?.outcome).toBe("explored");
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("Start Tutorial records the outcome and hands off to the real tutorial route", () => {
    render(<AcademyWelcomePage />);
    goToChoiceStage();
    fireEvent.click(screen.getByTestId("academy-welcome-tutorial"));

    expect(readAcademyWelcomeState()?.outcome).toBe("tutorial");
    expect(mocks.navigate).toHaveBeenCalledWith(RANKED_TUTORIAL_ROUTE, { replace: true });
  });

  it("Skip is a real exit — it marks the visitor handled, not just hidden", () => {
    render(<AcademyWelcomePage />);
    fireEvent.click(screen.getByTestId("academy-welcome-skip"));

    expect(hasHandledAcademyWelcome()).toBe(true);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("never writes tutorial completion — that stays the tutorial's own business", () => {
    render(<AcademyWelcomePage />);
    goToChoiceStage();
    fireEvent.click(screen.getByTestId("academy-welcome-tutorial"));
    // The introduction stores its own outcome only; nothing here may imply the
    // account finished the Ranked tutorial.
    expect(JSON.stringify(readAcademyWelcomeState())).not.toMatch(/completed/i);
  });
});

describe("replay", () => {
  it("still renders in full for a visitor who already finished it", () => {
    markAcademyWelcomeHandled("explored");
    render(<AcademyWelcomePage />);

    expect(screen.getByTestId("academy-welcome")).toHaveAttribute("data-stage", "0");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("renders despite a corrupt stored value", () => {
    localStorage.setItem("mogsy.academyWelcome.v1", "{{{not json");
    expect(() => render(<AcademyWelcomePage />)).not.toThrow();
    expect(screen.getByTestId("academy-welcome")).toBeTruthy();
  });
});

describe("mode previews", () => {
  it("shows exactly four curated modes", () => {
    render(<AcademyWelcomePage />);
    fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    expect(screen.getAllByRole("figure")).toHaveLength(4);
  });

  it("names every mode for assistive tech, including the ones drawn as artwork", () => {
    render(<AcademyWelcomePage />);
    fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    for (const mode of ACADEMY_MODES) {
      expect(screen.getByRole("heading", { level: 2, name: mode.title })).toBeTruthy();
    }
  });

  it("does not present Ranked as a peer of Leaguecraft", () => {
    render(<AcademyWelcomePage />);
    fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    expect(screen.getByRole("heading", { level: 2, name: "Leaguecraft" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: /^Ranked$/ })).toBeNull();
  });

  it("keeps decorative artwork out of the accessibility tree", () => {
    render(<AcademyWelcomePage />);
    fireEvent.click(screen.getByTestId("academy-welcome-continue"));
    for (const img of Array.from(document.querySelectorAll("figure img"))) {
      expect(img.getAttribute("aria-hidden")).toBe("true");
      expect(img.getAttribute("alt")).toBe("");
    }
  });
});
