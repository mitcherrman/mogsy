/**
 * MG-D — Mogzy voices the post-completion signup prompt, and NOTHING ELSE about
 * the prompt changed. These fence the second half as hard as the first: the
 * account CTA, the guest path, the sign-in path, `returnTo` and the analytics
 * payloads are the gate's own, with or without Mogzy.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: track }));

import QuizSignUpGate from "./QuizSignUpGate";

const PROGRESS = { xp: 120, current_streak: 3, rank_name: "Bronze" } as never;
const LINE = "Not bad. Want me to keep track of your progress?";

function Probe() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
}

function mount(props: Partial<React.ComponentProps<typeof QuizSignUpGate>> = {}) {
  const onDismiss = vi.fn();
  render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <Routes>
        <Route
          path="/quiz"
          element={
            <QuizSignUpGate progress={PROGRESS} actionCount={5} returnTo="/quiz" onDismiss={onDismiss} {...props} />
          }
        />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onDismiss };
}

beforeEach(() => track.mockClear());
afterEach(cleanup);

describe("QuizSignUpGate — Mogzy's voice", () => {
  it("puts Mogzy's line first and keeps the concrete account value beneath it", () => {
    mount({ guideLine: LINE });
    expect(screen.getByTestId("mogzy-guide-leaguecraft-signup-bubble").textContent).toContain(LINE);
    // Announced exactly once, through the substrate's single live region.
    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe(LINE);
    // …and the existing concrete value is still all there.
    expect(screen.getByRole("heading", { name: "Save your score?" })).toBeTruthy();
    expect(screen.getByText(/track your League quiz progress, streaks, and results/)).toBeTruthy();
    expect(screen.getByText(/Save your score & XP/)).toBeTruthy();
    expect(screen.getByText(/Keep your streaks/)).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
  });

  it("replaces the lock icon, not the controls", () => {
    const { container } = render(
      <MemoryRouter><QuizSignUpGate progress={PROGRESS} actionCount={5} onDismiss={() => {}} guideLine={LINE} /></MemoryRouter>,
    );
    expect(container.querySelector("svg.lucide-lock")).toBeNull();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep Playing as Guest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Already have an account\? Sign in/ })).toBeTruthy();
  });

  it("Create Account goes to the same signup URL with the same returnTo", () => {
    mount({ guideLine: LINE });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(screen.getByTestId("where").textContent).toBe("/auth?mode=signup&returnTo=%2Fquiz");
  });

  it("Sign in goes to the same auth URL with the same returnTo", () => {
    mount({ guideLine: LINE });
    fireEvent.click(screen.getByRole("button", { name: /Already have an account\? Sign in/ }));
    expect(screen.getByTestId("where").textContent).toBe("/auth?returnTo=%2Fquiz");
  });

  it("Keep Playing as Guest only dismisses — it does not navigate", () => {
    const { onDismiss } = mount({ guideLine: LINE });
    fireEvent.click(screen.getByRole("button", { name: "Keep Playing as Guest" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("where")).toBeNull();
  });

  it("adds exactly one metadata key to the existing events, and no new event", () => {
    mount({ guideLine: LINE });
    fireEvent.click(screen.getByRole("button", { name: "Keep Playing as Guest" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(track.mock.calls).toEqual([
      ["quiz_signup_gate_shown", { action_count: 5, returnTo: "/quiz", presentation: "mogzy_guide" }],
      ["quiz_guest_continue_clicked", { returnTo: "/quiz", presentation: "mogzy_guide" }],
      ["quiz_signup_clicked", { returnTo: "/quiz", presentation: "mogzy_guide" }],
    ]);
  });
});

describe("QuizSignUpGate — hosts that do not pass a guide line", () => {
  it("renders exactly as before: lock icon, no Mogzy, original payloads", () => {
    const { container } = render(
      <MemoryRouter><QuizSignUpGate progress={PROGRESS} actionCount={5} onDismiss={() => {}} /></MemoryRouter>,
    );
    expect(container.querySelector("svg.lucide-lock")).not.toBeNull();
    expect(screen.queryByTestId("signup-gate-guide")).toBeNull();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(track.mock.calls).toEqual([
      ["quiz_signup_gate_shown", { action_count: 5, returnTo: "/quiz" }],
      ["quiz_signup_clicked", { returnTo: "/quiz" }],
    ]);
  });

  it("still honours a host's own copy (the Daily Challenge's save-your-run prompt)", () => {
    render(
      <MemoryRouter>
        <QuizSignUpGate progress={null} actionCount={0} heading="Save your run?" description="Daily copy" benefits={["One"]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Save your run?" })).toBeTruthy();
    expect(screen.getByText("Daily copy")).toBeTruthy();
    expect(screen.queryByTestId("signup-gate-guide")).toBeNull();
  });
});
