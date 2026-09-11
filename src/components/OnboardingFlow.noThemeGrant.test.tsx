/**
 * PT2E — onboarding no longer hands out a Premium cosmetic.
 *
 * The fourth step, "Choose Your Vibe", offered every new account one Premium
 * theme to try for free. It was a legacy Mogsy giveaway for a theme that
 * recoloured the whole application — the only thing that ever made the offer
 * worth making — and its entire record of the "grant" was a localStorage key
 * (`mogsy-chosen-free-theme`) that any visitor could write. Keeping it would
 * have forced a once-per-account carve-out into the server authority purely to
 * preserve an obsolete giveaway.
 *
 * What this pins: the step is gone, the finishing write carries no theme, and
 * neither localStorage key is touched.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingFlow from "./OnboardingFlow";

const mocks = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  categories: [
    { id: "c1", name: "Champions" },
    { id: "c2", name: "Items" },
    { id: "c3", name: "Runes" },
  ],
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      order: chain,
      update: (payload: Record<string, unknown>) => {
        mocks.updates.push({ table, payload });
        return b;
      },
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: table === "categories" ? mocks.categories : null,
          error: null,
        }).then(resolve),
    });
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), storage: { from: () => ({}) } } };
});

// The first two steps are other features' surfaces; this suite is about what
// the flow does with themes, so they are reduced to their "advance" control.
vi.mock("./onboarding/OnboardingWelcome", () => ({
  default: ({ onNext }: { onNext: () => void }) => (
    <button onClick={onNext}>advance-welcome</button>
  ),
}));
vi.mock("./onboarding/OnboardingProfile", () => ({
  default: ({ onNext }: { onNext: () => void }) => (
    <button onClick={onNext}>advance-profile</button>
  ),
}));
vi.mock("./onboarding/OnboardingCategories", () => ({
  // The flow refuses to finish on fewer than three categories, so the stub
  // picks three and then advances — the real step's only contract here.
  default: ({
    selected, setSelected, onNext,
  }: { selected: string[]; setSelected: (v: string[]) => void; onNext: () => void }) => (
    <button
      onClick={() => (selected.length < 3 ? setSelected(["c1", "c2", "c3"]) : onNext())}
    >
      advance-categories
    </button>
  ),
}));

/**
 * localStorage is observed through a spy rather than read back. This suite's
 * environment does not provide a complete Storage implementation (`clear` is
 * absent), and a spy is the stronger assertion anyway: it catches a WRITE even
 * if something later removes the key.
 */
let setItem: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.updates.length = 0;
  setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
});
afterEach(() => {
  setItem.mockRestore();
  cleanup();
});

/** Walk the flow to the end. */
function completeFlow() {
  render(<OnboardingFlow onComplete={vi.fn()} />);
  fireEvent.click(screen.getByText("advance-welcome"));
  fireEvent.click(screen.getByText("advance-profile"));
  fireEvent.click(screen.getByText("advance-categories")); // picks 3 categories
  fireEvent.click(screen.getByText("advance-categories")); // finishes
}

describe("onboarding has no theme step", () => {
  it("exposes no skipToTheme entry point on the component's props", () => {
    // AdminOnboarding used `<OnboardingFlow skipToTheme />` to preview the
    // theme picker in isolation. Both the prop and that preview are gone.
    expect(OnboardingFlow.length).toBeLessThanOrEqual(1);
    const src = OnboardingFlow.toString();
    expect(src).not.toContain("skipToTheme");
  });

  it("finishes on the categories step", () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText("advance-welcome"));
    fireEvent.click(screen.getByText("advance-profile"));
    expect(screen.getByText("advance-categories")).toBeTruthy();
    // No "Choose Your Vibe" heading follows it.
    fireEvent.click(screen.getByText("advance-categories"));
    fireEvent.click(screen.getByText("advance-categories"));
    expect(screen.queryByText(/Choose Your Vibe/i)).toBeNull();
    expect(screen.queryByText(/premium theme/i)).toBeNull();
  });

  it("writes no custom_theme when completing onboarding", async () => {
    completeFlow();
    await waitFor(() => expect(mocks.updates.length).toBeGreaterThan(0));
    const profileWrite = mocks.updates.find((u) => u.table === "profiles")!;
    expect(profileWrite.payload).toHaveProperty("onboarding_completed", true);
    expect(profileWrite.payload).not.toHaveProperty("custom_theme");
  });

  it("writes neither retired localStorage key", async () => {
    completeFlow();
    await waitFor(() => expect(mocks.updates.length).toBeGreaterThan(0));
    const keys = setItem.mock.calls.map((c) => c[0]);
    expect(keys).not.toContain("mogsy-chosen-free-theme");
    expect(keys).not.toContain("mogsy-active-theme");
  });
});
