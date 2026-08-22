/**
 * AUTH3 — a guest called 'Anonymous5472' gets a real name.
 *
 * This is the surface the placeholder policy is actually about. Before AUTH3
 * the upgrade collected an email and a password and nothing else, so a guest
 * who never went through /welcome converted to a PERMANENT account still
 * called 'Anonymous5472' — and, because `isPlaceholderUsername` stops
 * forgiving a generated name once the row is no longer anonymous, kept it
 * until they went and found the profile editor.
 *
 * The guest is the one signup case where "that name is taken" can be answered
 * before anything irreversible happens, because they already hold a session.
 * The order of operations below is the whole reason this is worth testing.
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
  useAuth: () => ({
    user: auth.user,
    loading: false,
    upgradeAnonymousEmail: auth.upgradeAnonymousEmail,
  }),
}));

const identity = vi.hoisted(() => ({
  loading: false,
  displayName: null as string | null,
  avatarUrl: null as string | null,
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => identity,
}));

const claim = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity/claim-username", () => ({
  claimUsername: claim,
  checkUsernameAvailable: vi.fn(),
}));

vi.mock("@/lib/auth/account-upgrade", () => ({
  readPendingUpgrade: () => null,
  clearPendingUpgrade: vi.fn(),
  resendUpgradeConfirmation: vi.fn(),
}));
vi.mock("@/lib/quiz/onboarding-gate", () => ({ resetGateState: vi.fn() }));

import { saveAcademyRegistration } from "@/lib/welcome/academy-registration";
import AccountUpgradePanel from "./AccountUpgradePanel";

const renderPanel = () =>
  render(
    <MemoryRouter>
      <AccountUpgradePanel returnTo="/quiz" onSignInInstead={() => {}} />
    </MemoryRouter>,
  );

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("upgrade-submit"));
  });
};

const fillAndSubmit = async (username: string) => {
  fill("Username", username);
  fill("Email", "guest@example.com");
  fill("Password", "abcdef");
  await submit();
};

beforeEach(() => {
  vi.clearAllMocks();
  resetStorage();
  auth.user = { id: "guest-1", is_anonymous: true };
  identity.loading = false;
  identity.displayName = null;
  auth.upgradeAnonymousEmail.mockResolvedValue({ ok: true, converted: true });
  claim.mockResolvedValue({ ok: true, code: "set", username: "MogzyKing" });
});

afterEach(cleanup);

describe("a guest holding only a generated placeholder", () => {
  it("is invited to choose a real name, not shown Anonymous5472", async () => {
    identity.displayName = "Anonymous5472";
    renderPanel();

    await waitFor(() =>
      expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe(""),
    );
    expect(screen.getByText(/how other players will see you/i)).toBeTruthy();
  });

  it("carries the chosen name onto the permanent account", async () => {
    identity.displayName = "Anonymous5472";
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText("Username")).toBeTruthy());

    await fillAndSubmit("MogzyKing");

    expect(claim).toHaveBeenCalledWith("MogzyKing");
    expect(auth.upgradeAnonymousEmail).toHaveBeenCalled();
  });

  it("names the guest BEFORE converting, so a taken name costs nothing", async () => {
    identity.displayName = "Anonymous5472";
    claim.mockResolvedValue({
      ok: false,
      code: "taken",
      taken: true,
      error: "That username is already taken.",
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText("Username")).toBeTruthy());

    await fillAndSubmit("MogzyKing");

    // The account is still a guest. Nothing irreversible happened, so the fix
    // is one corrected field rather than a rename after the fact.
    expect(auth.upgradeAnonymousEmail).not.toHaveBeenCalled();
    expect(screen.getByText("That username is already taken.")).toBeTruthy();
  });

  it("never shows a raw database error", async () => {
    claim.mockResolvedValue({ ok: false, code: "unavailable", error: "Couldn't save that username. Please try again." });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText("Username")).toBeTruthy());

    await fillAndSubmit("MogzyKing");

    expect(document.body.textContent).not.toMatch(/constraint|duplicate key|23505|display_name/i);
  });

  it("refuses a name that fails the shared rules without any round trip", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText("Username")).toBeTruthy());

    await fillAndSubmit("A");

    expect(claim).not.toHaveBeenCalled();
    expect(auth.upgradeAnonymousEmail).not.toHaveBeenCalled();
    expect(screen.getByText(/between 2 and 24 characters/i)).toBeTruthy();
  });
});

describe("a guest who already has a name", () => {
  it("prefills the account's own name over anything this device holds", async () => {
    saveAcademyRegistration({ username: "OldLocalName", rank: "gold" });
    identity.displayName = "RealGuestName";

    renderPanel();

    await waitFor(() =>
      expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("RealGuestName"),
    );
    expect(screen.getByText(/name you chose/i)).toBeTruthy();
  });

  it("prefills from the Welcome register when the account has no name yet", async () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "gold" });
    identity.displayName = "Anonymous5472";

    renderPanel();

    await waitFor(() =>
      expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("MogzyKing"),
    );
  });

  it("does not seed the field from a profile read that has not resolved", async () => {
    identity.loading = true;
    identity.displayName = null;
    renderPanel();
    // Seeding on the loading frame would set "" and then fight the real value.
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("");
  });
});

describe("the form asks for three things and stops", () => {
  it("collects a username, an email and a password — no confirm-password", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText("Username")).toBeTruthy());

    expect(screen.queryByLabelText(/confirm password/i)).toBeNull();
    expect(Array.from(document.querySelectorAll("form input"))).toHaveLength(3);
  });
});
