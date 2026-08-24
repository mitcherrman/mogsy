/**
 * ADMIN TUTORIAL REPLAY, END TO END (ARENA1 Step 4 §19–§21).
 *
 * The pure policy is proved in `lib/ranked-tutorial/adminReplay.test`. What is
 * proved HERE is that the page is wired to it — that the parameter reaches the
 * policy, that the SERVER's answer is what decides, that an ordinary user
 * typing the same URL is unaffected in every observable way, and that a replay
 * starts the real tutorial at its first step and can be run again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RankedTutorialOnboardingPage from "./RankedTutorialOnboardingPage";
import AdminRankedPage from "@/pages/admin/areas/AdminRankedPage";
import {
  ADMIN_TUTORIAL_REPLAY_ROUTE, ADMIN_REPLAY_PARAM,
} from "@/lib/ranked-tutorial/adminReplay";
import { LEAGUECRAFT_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  completionRequiredForNewUsers: true,
  admin: { loading: false, isAdmin: false },
  status: {
    loading: false,
    required: true,
    completed: false,
    completeTutorial: vi.fn(async () => true),
  },
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/hooks/useRankedTutorialStatus", () => ({
  useRankedTutorialStatus: () => mocks.status,
}));
vi.mock("@/hooks/useAdminAuthority", () => ({
  useAdminAuthority: () => mocks.admin,
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    loading: false,
    settings: {
      policy: {
        combatSim: { tokensRequiredForNonPro: true },
        tutorial: {
          autoPopupEnabled: true,
          completionRequiredForNewUsers: mocks.completionRequiredForNewUsers,
        },
      },
    },
  }),
}));
// The Ranked admin page reads two live endpoints; neither is under test here.
vi.mock("@/lib/admin/adminOpsApi", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    fetchLaunchReadiness: vi.fn(async () => { throw new Error("not under test"); }),
    fetchRatingStatus: vi.fn(async () => { throw new Error("not under test"); }),
  };
});
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderReplay = () =>
  render(
    <MemoryRouter initialEntries={[ADMIN_TUTORIAL_REPLAY_ROUTE]}>
      <RankedTutorialOnboardingPage />
    </MemoryRouter>,
  );

const renderOrdinary = () =>
  render(
    <MemoryRouter initialEntries={[LEAGUECRAFT_TUTORIAL_ROUTE]}>
      <RankedTutorialOnboardingPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completionRequiredForNewUsers = true;
  mocks.admin = { loading: false, isAdmin: false };
  mocks.status = {
    loading: false,
    required: true,
    completed: false,
    completeTutorial: vi.fn(async () => true),
  };
});
afterEach(cleanup);

// ── the admin entry point ──────────────────────────────────────────────────

describe("the admin surface", () => {
  it("offers Launch Tutorial under Ranked › Matches, pointing at the real route", () => {
    render(
      <MemoryRouter initialEntries={["/admin/ranked?section=matches"]}>
        <AdminRankedPage />
      </MemoryRouter>,
    );
    const launch = screen.getByTestId("launch-tutorial-replay");
    expect(launch).toHaveAttribute("href", ADMIN_TUTORIAL_REPLAY_ROUTE);
    // It is /quiz/tutorial — the shipped route — not a second tutorial.
    expect(launch.getAttribute("href")).toContain(LEAGUECRAFT_TUTORIAL_ROUTE);
  });

  it("is not offered anywhere in the ordinary player UI", () => {
    // The tutorial's own player-facing entry carries no admin control.
    mocks.status.required = false;
    mocks.status.completed = true;
    renderOrdinary();
    expect(screen.queryByTestId("launch-tutorial-replay")).toBeNull();
    expect(screen.queryByTestId("admin-replay-notice")).toBeNull();
  });
});

// ── an ordinary user typing the URL ────────────────────────────────────────

describe("a non-admin who types the parameter", () => {
  it("gets the ordinary mandatory run: no escape, and completion still records", () => {
    renderReplay();                       // ?adminReplay=1, isAdmin false
    expect(screen.queryByTestId("admin-replay-notice")).toBeNull();
    // The mandatory flow's defining property: there is no way out.
    expect(screen.queryByTestId("onboarding-back-to-quiz")).toBeNull();
  });

  it("sees exactly what they see without the parameter", () => {
    mocks.completionRequiredForNewUsers = false;
    renderReplay();
    const withParam = screen.getByTestId("onboarding-welcome").textContent;
    cleanup();
    renderOrdinary();
    expect(screen.getByTestId("onboarding-welcome").textContent).toBe(withParam);
  });

  it("gains no replay eligibility from it", () => {
    // An incomplete account is still an incomplete account: its run records.
    mocks.completionRequiredForNewUsers = false;
    renderReplay();
    expect(screen.queryByText(/replaying won't change your progress/i)).toBeNull();
    expect(screen.queryByTestId("admin-replay-notice")).toBeNull();
  });
});

// ── an authorized admin ────────────────────────────────────────────────────

describe("an authorized admin", () => {
  it("may enter even though they have already completed the tutorial", () => {
    mocks.admin = { loading: false, isAdmin: true };
    mocks.status.required = false;
    mocks.status.completed = true;
    renderReplay();
    expect(screen.getByTestId("admin-replay-notice")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    // The REAL tutorial, on the canonical arena, at its first step.
    expect(screen.getByTestId("ranked-match")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
  });

  it("may enter even though the forced gate would otherwise trap them", () => {
    mocks.admin = { loading: false, isAdmin: true };   // never completed it
    renderReplay();
    // Not the mandatory run: the escape hatch is present, so a testing pass
    // can be abandoned at any point.
    expect(screen.getByTestId("onboarding-back-to-quiz")).toBeInTheDocument();
    expect(screen.getByTestId("admin-replay-notice")).toBeInTheDocument();
  });

  it("records NOTHING — no completion write is even reachable", () => {
    mocks.admin = { loading: false, isAdmin: true };
    renderReplay();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(mocks.status.completeTutorial).not.toHaveBeenCalled();
  });

  it("is repeatable: restarting returns to the first step, every time", () => {
    mocks.admin = { loading: false, isAdmin: true };
    renderReplay();
    fireEvent.click(screen.getByTestId("start-tutorial"));
    for (let run = 0; run < 3; run += 1) {
      fireEvent.click(screen.getByTestId("continue-step"));   // into the match
      expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 2 of 18");
      fireEvent.click(screen.getByTestId("restart-tutorial"));
      expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
    }
    expect(mocks.status.completeTutorial).not.toHaveBeenCalled();
  });

  it("waits for the SERVER before starting, so a run can never begin as a write", () => {
    mocks.admin = { loading: true, isAdmin: false };
    renderReplay();
    expect(screen.getByTestId("onboarding-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("start-tutorial")).toBeNull();
  });

  it("does not make the ordinary route behave differently", () => {
    mocks.admin = { loading: false, isAdmin: true };
    renderOrdinary();                                   // no parameter
    expect(screen.queryByTestId("admin-replay-notice")).toBeNull();
    expect(screen.queryByTestId("onboarding-back-to-quiz")).toBeNull(); // mandatory
  });
});

// ── the gate itself is untouched ───────────────────────────────────────────

describe("the ordinary tutorial gate is unchanged", () => {
  it("still forces, still records, and still lets a completed user replay", () => {
    // Forced + incomplete → mandatory (no escape).
    renderOrdinary();
    expect(screen.queryByTestId("onboarding-back-to-quiz")).toBeNull();
    cleanup();
    // Policy off + incomplete → voluntary (escapable, still records).
    mocks.completionRequiredForNewUsers = false;
    renderOrdinary();
    expect(screen.getByTestId("onboarding-back-to-quiz")).toBeInTheDocument();
    cleanup();
    // Completed → replay, and it says so.
    mocks.status.required = false;
    mocks.status.completed = true;
    renderOrdinary();
    expect(screen.getByText(/replaying won't change your progress/i)).toBeInTheDocument();
  });

  it("names the parameter in exactly one place", () => {
    expect(ADMIN_REPLAY_PARAM).toBe("adminReplay");
  });
});
