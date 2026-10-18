/**
 * EMAIL1 — the optional newsletter checkboxes on the DIRECT signup form.
 * Regression guard: unchecked by default, absent when the feature is off, and
 * an unticked signup calls signUp exactly as it did before EMAIL1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
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
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signOut: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn() },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/quiz/onboarding-gate", () => ({ resetGateState: vi.fn() }));
vi.mock("@/components/auth/AccountUpgradePanel", () => ({ default: () => <div data-testid="upgrade-panel" /> }));

import Auth from "./Auth";

const renderSignup = () => {
  window.history.replaceState({}, "", "/auth?mode=signup");
  return render(
    <MemoryRouter initialEntries={["/auth?mode=signup"]}>
      <Auth />
    </MemoryRouter>,
  );
};
const submit = async () => {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "MogzyKing" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
  await act(async () => {
    fireEvent.click(document.querySelector('button[type="submit"]') as HTMLButtonElement);
  });
};

beforeEach(() => {
  auth.user = null;
  auth.signIn = vi.fn().mockResolvedValue({ error: null });
  auth.signUp = vi.fn().mockResolvedValue({ error: null, session: { access_token: "t" } });
  navigate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("direct signup · optional email checkboxes", () => {
  it("are absent while the feature flag is off — the form is exactly what it was", () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    renderSignup();
    expect(screen.queryByTestId("email-optin-fields")).toBeNull();
    expect(document.querySelectorAll("form input")).toHaveLength(3);
  });

  it("render UNCHECKED when the feature is on", () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    renderSignup();
    for (const id of ["email-optin-daily", "email-optin-news"]) {
      const box = screen.getByTestId(id);
      expect(box.getAttribute("aria-checked")).toBe("false");
      expect(box.getAttribute("data-state")).toBe("unchecked");
    }
  });

  it("are signup-mode only — never on the sign-in form", () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    window.history.replaceState({}, "", "/auth");
    render(<MemoryRouter initialEntries={["/auth"]}><Auth /></MemoryRouter>);
    expect(screen.queryByTestId("email-optin-fields")).toBeNull();
  });

  it("a signup that ticks nothing calls signUp EXACTLY as before (three arguments)", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    renderSignup();
    await submit();
    expect(auth.signUp).toHaveBeenCalledTimes(1);
    expect(auth.signUp.mock.calls[0]).toEqual(["new@example.com", "abcdef", "MogzyKing"]);
    expect(navigate).toHaveBeenCalledWith("/lol", { replace: true });
  });

  it("ticking the Daily Challenge box carries exactly that topic group", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    renderSignup();
    await act(async () => { fireEvent.click(screen.getByTestId("email-optin-daily")); });
    await submit();
    expect(auth.signUp.mock.calls[0].slice(0, 3)).toEqual(["new@example.com", "abcdef", "MogzyKing"]);
    expect(auth.signUp.mock.calls[0][3]).toEqual({ daily: true, news: false });
  });

  it("ticking both boxes carries both", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    renderSignup();
    await act(async () => {
      fireEvent.click(screen.getByTestId("email-optin-daily"));
      fireEvent.click(screen.getByTestId("email-optin-news"));
    });
    await submit();
    expect(auth.signUp.mock.calls[0][3]).toEqual({ daily: true, news: true });
  });

  it("a signup failure does not tick anything for the retry", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    auth.signUp = vi.fn().mockResolvedValue({ error: { message: "boom" }, session: null });
    renderSignup();
    await submit();
    expect(screen.getByTestId("email-optin-daily").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("email-optin-news").getAttribute("aria-checked")).toBe("false");
  });
});
