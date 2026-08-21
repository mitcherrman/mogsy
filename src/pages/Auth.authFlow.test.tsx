/**
 * AUTH1 §2–§5 at the /auth page: the easy password policy, verification that
 * does not block, and a destination that survives the interruption.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

const sb = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue({}),
  resend: vi.fn().mockResolvedValue({ error: null }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signOut: sb.signOut, resend: sb.resend, resetPasswordForEmail: sb.resetPasswordForEmail },
    rpc: sb.rpc,
  },
}));

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/quiz/onboarding-gate", () => ({ resetGateState: vi.fn() }));
vi.mock("@/components/auth/AccountUpgradePanel", () => ({
  default: () => <div data-testid="upgrade-panel" />,
}));

import Auth from "./Auth";

const renderAuth = (search: string) => {
  // The page reads the initial mode from window.location.search directly.
  window.history.replaceState({}, "", `/auth${search}`);
  return render(
    <MemoryRouter initialEntries={[`/auth${search}`]}>
      <Auth />
    </MemoryRouter>,
  );
};

/** The form's submit button — the tab strip above it also reads "Sign In". */
const submitButton = () =>
  document.querySelector('button[type="submit"]') as HTMLButtonElement;

/** Fill the signup form and submit it. */
const submitSignup = async (password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: confirm },
  });
  await act(async () => {
    fireEvent.click(submitButton());
  });
};

beforeEach(() => {
  auth.user = null;
  auth.signIn = vi.fn().mockResolvedValue({ error: null });
  // Default: Supabase returns a session, i.e. confirmation is NOT required.
  auth.signUp = vi.fn().mockResolvedValue({ error: null, session: { access_token: "t" } });
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("password policy at signup (AUTH1 §2)", () => {
  it("accepts a 6-character password with no symbol, uppercase, or number", async () => {
    renderAuth("?mode=signup");
    await submitSignup("abcdef");
    expect(auth.signUp).toHaveBeenCalledWith("new@example.com", "abcdef");
  });

  it("accepts an all-digit password", async () => {
    renderAuth("?mode=signup");
    await submitSignup("123456");
    expect(auth.signUp).toHaveBeenCalled();
  });

  it("rejects fewer than 6 characters without calling auth", async () => {
    renderAuth("?mode=signup");
    await submitSignup("abcde");
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("6") }),
    );
  });

  it("rejects a confirmation mismatch without calling auth", async () => {
    renderAuth("?mode=signup");
    await submitSignup("abcdef", "abcdeg");
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/match/i) }),
    );
  });

  it("advertises the eased rule and no composition checklist", () => {
    renderAuth("?mode=signup");
    const copy = document.body.textContent ?? "";
    expect(copy).toMatch(/at least 6 characters/i);
    expect(copy).not.toMatch(/uppercase|special character|symbol required/i);
  });
});

describe("verification does not block signup (AUTH1 §3)", () => {
  it("routes a new account onward immediately when a session comes back", async () => {
    renderAuth("?mode=signup&returnTo=%2Fquiz%2Franked");
    await submitSignup("abcdef");
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/quiz/ranked", { replace: true }),
    );
    // No check-your-email dead end.
    expect(screen.queryByText(/confirm your email/i)).toBeNull();
  });

  it("retains the confirmation screen for a project that withholds the session", async () => {
    auth.signUp = vi.fn().mockResolvedValue({ error: null, session: null });
    renderAuth("?mode=signup&returnTo=%2Fquiz%2Franked");
    await submitSignup("abcdef");
    await waitFor(() => expect(screen.getByText(/confirm your email/i)).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("even then offers a way forward rather than only 'back to sign in'", async () => {
    auth.signUp = vi.fn().mockResolvedValue({ error: null, session: null });
    renderAuth("?mode=signup&returnTo=%2Fquiz%2Franked");
    await submitSignup("abcdef");
    const go = await screen.findByTestId("confirm-sent-continue");
    fireEvent.click(go);
    expect(navigate).toHaveBeenCalledWith("/quiz/ranked", { replace: true });
  });
});

describe("destination precedence (AUTH1 §4–§5)", () => {
  const signIn = async () => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
    await act(async () => {
      fireEvent.click(submitButton());
    });
  };

  it("sign-in returns the user to an explicit destination", async () => {
    renderAuth("?returnTo=%2Fquiz%2Franked");
    await signIn();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/quiz/ranked", { replace: true }),
    );
  });

  it("signup returns the user to an explicit destination", async () => {
    renderAuth("?mode=signup&returnTo=%2Fprofile");
    await submitSignup("abcdef");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/profile", { replace: true }));
  });

  it("falls back to the League hub only when nothing was preserved", async () => {
    renderAuth("?mode=signup");
    await submitSignup("abcdef");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/lol", { replace: true }));
  });

  it("refuses an external returnTo and uses the default instead", async () => {
    renderAuth("?returnTo=https%3A%2F%2Fevil.com");
    await signIn();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/lol", { replace: true }));
  });

  it("refuses a protocol-relative returnTo", async () => {
    renderAuth("?returnTo=%2F%2Fevil.com");
    await signIn();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/lol", { replace: true }));
  });

  it("replaces history, so Back does not return to the completed auth form", async () => {
    renderAuth("?returnTo=%2Fprofile");
    await signIn();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls[0][1]).toEqual({ replace: true });
  });
});

describe("existing unverified account can still sign in", () => {
  it("surfaces the resend path rather than a dead end when Supabase withholds it", async () => {
    // This is the one case the frontend cannot fix: if the PROJECT requires
    // confirmation, signInWithPassword itself refuses. All we can do is make
    // recovery one click away.
    auth.signIn = vi.fn().mockResolvedValue({ error: { message: "Email not confirmed" } });
    renderAuth("?returnTo=%2Fquiz");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
    await act(async () => {
      fireEvent.click(submitButton());
    });
    await waitFor(() => expect(screen.getByText(/confirm your email/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /resend confirmation/i })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs a verified account straight through to its destination", async () => {
    renderAuth("?returnTo=%2Fquiz%2Franked");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
    await act(async () => {
      fireEvent.click(submitButton());
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/quiz/ranked", { replace: true }),
    );
  });
});
