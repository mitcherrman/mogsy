/**
 * AUTH3 at /auth — "choose your Mogzy identity once".
 *
 * The behaviour this suite exists to hold:
 *
 *   - a visitor who named themselves at /welcome is NOT asked again;
 *   - a returning user signing in is never asked for a username at all;
 *   - a taken name is a corrected field, not a lost account.
 *
 * The guest-upgrade half of the same story lives in
 * components/auth/AccountUpgradePanel.username.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { installLocalStorageStub } from "@/test/localStorageStub";

const resetStorage = installLocalStorageStub();

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => navigate };
});

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; is_anonymous?: boolean },
  signIn: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: auth.user, signIn: auth.signIn, signUp: auth.signUp }),
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const claim = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity/claim-username", () => ({
  claimUsername: claim,
  checkUsernameAvailable: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      resend: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/quiz/onboarding-gate", () => ({ resetGateState: vi.fn() }));
vi.mock("@/components/auth/AccountUpgradePanel", () => ({
  default: () => <div data-testid="upgrade-panel" />,
}));

import { saveAcademyRegistration } from "@/lib/welcome/academy-registration";
import Auth from "./Auth";

const renderAuth = (search: string) => {
  window.history.replaceState({}, "", `/auth${search}`);
  return render(
    <MemoryRouter initialEntries={[`/auth${search}`]}>
      <Auth />
    </MemoryRouter>,
  );
};

const submitButton = () => document.querySelector('button[type="submit"]') as HTMLButtonElement;

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = async () => {
  await act(async () => {
    fireEvent.click(submitButton());
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  resetStorage();
  auth.user = null;
  auth.signUp.mockResolvedValue({ error: null, session: { user: { id: "u1" } } });
  auth.signIn.mockResolvedValue({ error: null });
  claim.mockResolvedValue({ ok: true, code: "set", username: "MogzyKing" });
});

afterEach(cleanup);

describe("carry-forward from the Welcome register", () => {
  it("prefills the username someone already chose, so they never retype it", () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "gold" });

    renderAuth("?mode=signup");

    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("MogzyKing");
  });

  it("says the name is theirs already rather than asking for a new one", () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "gold" });
    renderAuth("?mode=signup");
    expect(screen.getByText(/name you chose/i)).toBeTruthy();
  });

  it("still lets them change it — a typo is cheapest to fix now", async () => {
    saveAcademyRegistration({ username: "Mogzyking", rank: "gold" });
    renderAuth("?mode=signup");

    fill("Username", "MogzyKing");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();

    expect(auth.signUp).toHaveBeenCalledWith("new@example.com", "abcdef", "MogzyKing");
  });

  it("leaves the field empty and inviting when nothing was ever chosen", () => {
    renderAuth("?mode=signup");
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/how other players will see you/i)).toBeTruthy();
  });
});

describe("sign in never asks for a username", () => {
  it("shows email and password only", () => {
    renderAuth("?mode=signin");
    expect(screen.queryByLabelText("Username")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("keeps it away even when this device is holding a Welcome name", () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "gold" });
    renderAuth("?mode=signin");
    expect(screen.queryByLabelText("Username")).toBeNull();
  });

  it("signs in on email and password alone", async () => {
    renderAuth("?mode=signin");
    fill("Email", "back@example.com");
    fill("Password", "abcdef");
    await submit();
    expect(auth.signIn).toHaveBeenCalledWith("back@example.com", "abcdef");
  });
});

describe("the rules are enforced before anything irreversible happens", () => {
  it("refuses a one-character name without creating an account", async () => {
    renderAuth("?mode=signup");
    fill("Username", "A");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();

    expect(auth.signUp).not.toHaveBeenCalled();
    expect(screen.getByText(/between 2 and 24 characters/i)).toBeTruthy();
  });

  it("refuses a name past the maximum without creating an account", async () => {
    renderAuth("?mode=signup");
    // The input caps typing at 24; a paste or an autofill is not so polite.
    const field = screen.getByLabelText("Username") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "a".repeat(30) } });
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();

    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("stays quiet about an empty field until the user tries to submit", () => {
    renderAuth("?mode=signup");
    expect(screen.queryByText(/between 2 and 24 characters/i)).toBeNull();
  });

  it("clears the error as soon as the name is corrected", async () => {
    renderAuth("?mode=signup");
    fill("Username", "A");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();
    expect(screen.getByText(/between 2 and 24 characters/i)).toBeTruthy();

    fill("Username", "MogzyKing");
    expect(screen.queryByText(/between 2 and 24 characters/i)).toBeNull();
  });
});

describe("a name someone else already holds", () => {
  beforeEach(() => {
    claim.mockResolvedValue({ ok: false, code: "taken", taken: true, error: "That username is already taken." });
  });

  it("says so in plain language, never as a database error", async () => {
    renderAuth("?mode=signup");
    fill("Username", "MogzyKing");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();

    await waitFor(() => {
      expect(screen.getByText("That username is already taken.")).toBeTruthy();
    });
    expect(document.body.textContent).not.toMatch(/constraint|duplicate key|23505/i);
  });

  it("keeps the account that was created and asks only for a new name", async () => {
    renderAuth("?mode=signup");
    fill("Username", "MogzyKing");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();

    await waitFor(() => expect(screen.getByText(/Pick your username/i)).toBeTruthy());
    // The credentials are already set; re-asking for them would be nonsense,
    // and re-submitting them would hit "User already registered".
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never calls signUp a second time — the account exists", async () => {
    renderAuth("?mode=signup");
    fill("Username", "MogzyKing");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();
    await waitFor(() => expect(screen.getByText(/Pick your username/i)).toBeTruthy());

    claim.mockResolvedValue({ ok: true, code: "set", username: "MogzyKing2" });
    fill("Username", "MogzyKing2");
    await submit();

    expect(auth.signUp).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenLastCalledWith("MogzyKing2", { onlyIfUnset: true });
  });

  it("continues to the destination once a free name is chosen", async () => {
    renderAuth("?mode=signup&returnTo=%2Fquiz");
    fill("Username", "MogzyKing");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();
    await waitFor(() => expect(screen.getByText(/Pick your username/i)).toBeTruthy());

    claim.mockResolvedValue({ ok: true, code: "set", username: "MogzyKing2" });
    fill("Username", "MogzyKing2");
    await submit();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/quiz", { replace: true }));
  });
});

describe("a name the trigger accepted", () => {
  it("routes onward without a second prompt", async () => {
    saveAcademyRegistration({ username: "MogzyKing", rank: "gold" });
    claim.mockResolvedValue({ ok: true, code: "already_set", username: "MogzyKing" });

    renderAuth("?mode=signup&returnTo=%2Fquiz");
    fill("Email", "new@example.com");
    fill("Password", "abcdef");
    await submit();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/quiz", { replace: true }));
    expect(screen.queryByText("That username is already taken.")).toBeNull();
  });
});
