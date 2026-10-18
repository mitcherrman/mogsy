/**
 * EMAIL1 — the guest-upgrade surface: boxes unchecked by default, absent when
 * the feature is off, and an unticked submit calls upgradeAnonymousEmail with
 * the same three arguments it always has.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { installLocalStorageStub } from "@/test/localStorageStub";

const resetStorage = installLocalStorageStub();

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn() };
});
const auth = vi.hoisted(() => ({
  user: { id: "guest-1", is_anonymous: true } as { id: string; is_anonymous?: boolean } | null,
  upgradeAnonymousEmail: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: auth.user, loading: false, upgradeAnonymousEmail: auth.upgradeAnonymousEmail }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({ useProfileIdentity: () => ({ loading: false, displayName: null, avatarUrl: null }) }));
vi.mock("@/lib/identity/claim-username", () => ({ claimUsername: vi.fn().mockResolvedValue({ ok: true, username: "Guesty" }) }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackSignupStarted: vi.fn() }));
vi.mock("@/lib/quiz/onboarding-gate", () => ({ resetGateState: vi.fn() }));

import AccountUpgradePanel from "./AccountUpgradePanel";

const mount = () =>
  render(
    <MemoryRouter>
      <AccountUpgradePanel returnTo="/quiz" onSignInInstead={() => {}} />
    </MemoryRouter>,
  );

const fillAndSubmit = async () => {
  fireEvent.change(screen.getByTestId("upgrade-username-input"), { target: { value: "Guesty" } });
  fireEvent.change(screen.getByTestId("upgrade-email-input"), { target: { value: "guest@example.com" } });
  fireEvent.change(screen.getByTestId("upgrade-password-input"), { target: { value: "sixtee" } });
  await act(async () => {
    fireEvent.click(screen.getByTestId("upgrade-submit"));
  });
};

beforeEach(() => {
  resetStorage();
  auth.user = { id: "guest-1", is_anonymous: true };
  auth.upgradeAnonymousEmail = vi.fn().mockResolvedValue({ ok: true, converted: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("guest upgrade · optional email checkboxes", () => {
  it("do not exist while the feature is off", () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    mount();
    expect(screen.queryByTestId("email-optin-fields")).toBeNull();
  });

  it("render unchecked when on", () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    mount();
    expect(screen.getByTestId("email-optin-daily").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("email-optin-news").getAttribute("aria-checked")).toBe("false");
  });

  it("an unticked submit calls upgradeAnonymousEmail with exactly three arguments", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    mount();
    await fillAndSubmit();
    await waitFor(() => expect(auth.upgradeAnonymousEmail).toHaveBeenCalledTimes(1));
    expect(auth.upgradeAnonymousEmail.mock.calls[0]).toHaveLength(3);
  });

  it("a ticked submit passes the choice as the fourth argument", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("email-optin-daily"));
      fireEvent.click(screen.getByTestId("email-optin-news"));
    });
    await fillAndSubmit();
    await waitFor(() => expect(auth.upgradeAnonymousEmail).toHaveBeenCalledTimes(1));
    expect(auth.upgradeAnonymousEmail.mock.calls[0][3]).toEqual({ daily: true, news: true });
  });
});
