import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

let authUser: { id: string; is_anonymous?: boolean } | null = null;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authUser }) }));

const mutateAsync = vi.fn();
vi.mock("@/hooks/useCombatBattles", () => ({
  useSubmitPrediction: () => ({ mutateAsync }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import PredictionPanel from "./PredictionPanel";
import type { MyPrediction } from "@/lib/combat-battles/types";

afterEach(() => { cleanup(); navigate.mockReset(); mutateAsync.mockReset(); authUser = null; });

const base = {
  slug: "annie-vs-brand", leftName: "Annie", rightName: "Brand",
  openAt: "2026-01-01T00:00:00Z", lockAt: "2026-01-02T00:00:00Z",
  onServerStateChanged: () => {},
};

function renderPanel(props: Partial<React.ComponentProps<typeof PredictionPanel>> = {}) {
  return render(
    <MemoryRouter>
      <PredictionPanel {...base} status="open" myPrediction={null} {...props} />
    </MemoryRouter>,
  );
}

describe("PredictionPanel", () => {
  it("guest sees an account CTA and choosing routes to sign-in (no silent discard)", () => {
    authUser = null;
    renderPanel();
    expect(screen.getByText(/Create a free account/)).toBeTruthy();
    screen.getByRole("button", { name: /Annie/ }).click();
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/auth"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("account can pick a side; the chosen side is aria-pressed", () => {
    authUser = { id: "u1", is_anonymous: false };
    mutateAsync.mockResolvedValue({ outcome: "created", predicted_side: "left" });
    renderPanel({ myPrediction: { predicted_side: "left", created_at: "", updated_at: "", revision: 1 } as MyPrediction });
    const left = screen.getByRole("button", { name: /Annie/ });
    const right = screen.getByRole("button", { name: /Brand/ });
    expect(left.getAttribute("aria-pressed")).toBe("true");
    expect(right.getAttribute("aria-pressed")).toBe("false");
  });

  it("anonymous session is treated as a guest (gated)", () => {
    authUser = { id: "anon", is_anonymous: true };
    renderPanel();
    expect(screen.getByText(/Create a free account/)).toBeTruthy();
  });

  it("locked state shows the frozen pick and disables changes", () => {
    authUser = { id: "u1", is_anonymous: false };
    renderPanel({
      status: "locked",
      myPrediction: { predicted_side: "right", created_at: "", updated_at: "", revision: 1 } as MyPrediction,
    });
    expect(screen.getByText(/Predictions are locked/)).toBeTruthy();
    expect(screen.getByText(/Brand/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Annie/ })).toBeNull();
  });

  it("scheduled state shows when predictions open, no buttons", () => {
    renderPanel({ status: "scheduled" });
    expect(screen.getByText(/Predictions open/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
