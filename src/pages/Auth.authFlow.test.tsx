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

/**
 * Fill the signup form and submit it.
 *
 * AUTH3 added a username to this form — signup is an identity moment, not only
 * an auth one. It is filled here so these AUTH1/AUTH2 cases keep testing what
 * they are about (the password policy, verification, the destination) rather
 * than tripping on a field they do not care about. Auth.username.test.tsx owns
 * the username's own behaviour.
 */
const submitSignup = async (
  password: string,
  email = "new@example.com",
  username = "MogzyKing",
) => {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
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
    // AUTH3: the chosen username rides along as the third argument, so
    // handle_new_user() writes it on the profile row it is already creating.
    expect(auth.signUp).toHaveBeenCalledWith("new@example.com", "abcdef", "MogzyKing");
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

  it("asks for a username, an email and a password — and nothing else (AUTH2 §13, AUTH3 §13)", () => {
    renderAuth("?mode=signup");
    // The confirmation field is gone; a reveal toggle does the job it was
    // there for, and does it for password-manager users too. AUTH3 adds the
    // username and stops there: no avatar, no rank, no role, no region, and no
    // profile-completion ceremony merely because those columns exist.
    expect(screen.queryByLabelText(/confirm password/i)).toBeNull();
    const inputs = Array.from(document.querySelectorAll("form input"));
    expect(inputs).toHaveLength(3);
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("can reveal the password so a typo is visible before submitting", async () => {
    renderAuth("?mode=signup");
    const field = screen.getByLabelText("Password") as HTMLInputElement;
    expect(field.type).toBe("password");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    });
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  });

  it("marks the password field for password managers", () => {
    renderAuth("?mode=signup");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("email");
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


/* -------------------------------------------------------------------------- */
/* AUTH2                                                                        */
/* -------------------------------------------------------------------------- */

describe("an email that already has an account leads to Sign In (AUTH2 §7)", () => {
  /** The message the auth server really returns for a duplicate signup. */
  const alreadyRegistered = {
    code: "user_already_exists",
    message: "User already registered",
  };

  it("switches to sign-in instead of dead-ending", async () => {
    auth.signUp = vi.fn().mockResolvedValue({ error: alreadyRegistered, session: null });
    renderAuth("?mode=signup&returnTo=%2Fquiz%2Franked");
    await submitSignup("abcdef", "taken@example.com");

    // The predecessor matched the literal "already been registered", which the
    // server does not say here, so this case fell through to the generic
    // handler and printed the raw string with no way forward.
    expect(submitButton().textContent).toMatch(/sign in/i);
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("keeps the typed email and the destination", async () => {
    auth.signUp = vi.fn().mockResolvedValue({ error: alreadyRegistered, session: null });
    renderAuth("?mode=signup&returnTo=%2Fquiz%2Franked");
    await submitSignup("abcdef", "taken@example.com");

    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("taken@example.com");

    auth.signIn = vi.fn().mockResolvedValue({ error: null });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
    await act(async () => { fireEvent.click(submitButton()); });
    expect(navigate).toHaveBeenCalledWith("/quiz/ranked", { replace: true });
  });

  it("never shows the raw auth string", async () => {
    auth.signUp = vi.fn().mockResolvedValue({ error: alreadyRegistered, session: null });
    renderAuth("?mode=signup");
    await submitSignup("abcdef", "taken@example.com");
    const shown = JSON.stringify(toast.mock.calls);
    expect(shown).not.toContain("User already registered");
  });
});

describe("a guest signing in keeps their guest session (AUTH2 §6)", () => {
  beforeEach(() => {
    auth.user = { id: "anon-1", is_anonymous: true };
  });

  it("does not sign the guest out before attempting sign-in", async () => {
    auth.signIn = vi.fn().mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    renderAuth("?returnTo=%2Fquiz");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrongpw" } });
    await act(async () => { fireEvent.click(submitButton()); });

    // The predecessor called signOut() BEFORE signIn, so one mistyped password
    // ended the anonymous session — and an anonymous session has no credential
    // to get back into, making that guest's progress permanently unreachable.
    expect(sb.signOut).not.toHaveBeenCalled();
    expect(auth.signIn).toHaveBeenCalled();
  });

  it("explains that guest progress does not move to the existing account", () => {
    renderAuth("?returnTo=%2Fquiz");
    expect(screen.getByTestId("guest-signin-notice").textContent).toMatch(/won.t move over/i);
  });

  it("offers the path that DOES keep the progress", async () => {
    renderAuth("?returnTo=%2Fquiz");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create an account instead/i }));
    });
    expect(screen.getByTestId("upgrade-panel")).toBeTruthy();
  });

  it("maps a wrong password to plain language", async () => {
    auth.signIn = vi.fn().mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    renderAuth("");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrongpw" } });
    await act(async () => { fireEvent.click(submitButton()); });
    const shown = JSON.stringify(toast.mock.calls);
    expect(shown).not.toContain("Invalid login credentials");
    expect(shown).toMatch(/wrong email or password/i);
  });
});
