/**
 * EMAIL1 — the third guest-conversion surface (onboarding "Create an Account").
 * Same contract as the other two: unchecked, absent when off, and an unticked
 * conversion calls upgradeAnonymousEmail with exactly the arguments it always did.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  user: { id: "guest-1", is_anonymous: true },
  upgradeAnonymousEmail: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user, upgradeAnonymousEmail: auth.upgradeAnonymousEmail }) }));

const chain = (result: unknown): any => {
  const c: any = {};
  for (const m of ["select", "eq", "update", "insert", "order", "limit"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: null, error: null });
  c.single = () => Promise.resolve({ data: { id: "profile-1" }, error: null });
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => chain({ data: null, error: null }), storage: { from: () => ({}) } },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/identity/claim-username", () => ({ claimUsername: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("./OnboardingDots", () => ({ default: () => null }));

import OnboardingProfile from "./OnboardingProfile";

const fillAndContinue = async (onNext: () => void) => {
  render(<OnboardingProfile onNext={onNext} />);
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "guest@example.com" } });
  fireEvent.change(screen.getByPlaceholderText(/^Password/), { target: { value: "sixtee" } });
};
const press = async () => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /continue/i })); });
};

beforeEach(() => {
  auth.upgradeAnonymousEmail = vi.fn().mockResolvedValue({ ok: true, converted: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("onboarding conversion · optional email checkboxes", () => {
  it("are absent while the feature is off", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    await fillAndContinue(vi.fn());
    expect(screen.queryByTestId("email-optin-fields")).toBeNull();
  });

  it("render unchecked, and an unticked conversion passes exactly three arguments", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    const onNext = vi.fn();
    await fillAndContinue(onNext);
    expect(screen.getByTestId("email-optin-daily").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("email-optin-news").getAttribute("aria-checked")).toBe("false");
    await press();
    await waitFor(() => expect(auth.upgradeAnonymousEmail).toHaveBeenCalledTimes(1));
    expect(auth.upgradeAnonymousEmail.mock.calls[0]).toHaveLength(3);
    await waitFor(() => expect(onNext).toHaveBeenCalled());
  });

  it("ticking passes the choice as the fourth argument", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await fillAndContinue(vi.fn());
    await act(async () => { fireEvent.click(screen.getByTestId("email-optin-news")); });
    await press();
    await waitFor(() => expect(auth.upgradeAnonymousEmail).toHaveBeenCalledTimes(1));
    expect(auth.upgradeAnonymousEmail.mock.calls[0][3]).toEqual({ daily: false, news: true });
  });
});
