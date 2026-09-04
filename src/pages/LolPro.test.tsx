/**
 * Mogzy Pro page banner: Pro comes from the backend entitlement endpoint
 * (the same interpretation that gates history and the missed bank), with
 * the client-side entitlement resolver as a fallback only when the lookup
 * is unavailable.
 *
 * PT1.4: that fallback is the `my_pro_entitlement` RPC — effective Pro,
 * Stripe OR a valid manual grant — not a raw `profiles.is_pro` read, which
 * would report a comped playtester as Free.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolPro from "./LolPro";

const getEntitlement = vi.fn();
const entitlementRpc = vi.fn();

vi.mock("@/lib/quiz/api", () => ({
  quizApi: { getEntitlement: (...args: unknown[]) => getEntitlement(...args) },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => entitlementRpc(...args) },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user-1", is_anonymous: false },
    session: null,
  }),
}));
vi.mock("@/lib/pro/checkout", () => ({
  startLolProCheckout: vi.fn(),
  isLolProCheckoutAvailable: () => false,
  LOL_PRO_MONTHLY_PRICE: 5,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LolPro />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getEntitlement.mockReset();
  entitlementRpc.mockReset();
});
afterEach(cleanup);

describe("LolPro entitlement banner", () => {
  it("shows You're Pro from the backend entitlement", async () => {
    getEntitlement.mockResolvedValue({
      ok: true, user_id: "user-1", is_pro: true, pro_lookup_configured: true,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/You’re Pro — everything below is unlocked/)).toBeTruthy(),
    );
    expect(entitlementRpc).not.toHaveBeenCalled();
  });

  it("shows pricing when the backend says Free", async () => {
    getEntitlement.mockResolvedValue({
      ok: true, user_id: "user-1", is_pro: false, pro_lookup_configured: true,
    });
    renderPage();
    await waitFor(() => expect(getEntitlement).toHaveBeenCalled());
    expect(screen.queryByText(/You’re Pro/)).toBeNull();
    expect(screen.getAllByText(/Upgrade to Mogzy Pro/).length).toBeGreaterThan(0);
  });

  it("falls back to the entitlement resolver when the lookup is unavailable", async () => {
    getEntitlement.mockRejectedValue(new Error("Quiz API 503: Entitlement lookup failed"));
    entitlementRpc.mockResolvedValue({ data: [{ effective_pro: true }], error: null });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/You’re Pro — everything below is unlocked/)).toBeTruthy(),
    );
    expect(entitlementRpc).toHaveBeenCalledWith("my_pro_entitlement");
  });

  it("the fallback honours a grant-only entitlement, not the Stripe flag", async () => {
    getEntitlement.mockRejectedValue(new Error("Quiz API 503: Entitlement lookup failed"));
    // A comped playtester: no Stripe subscription, valid manual grant.
    entitlementRpc.mockResolvedValue({
      data: [{ effective_pro: true, stripe_pro: false, grant_kind: "playtest" }],
      error: null,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/You’re Pro — everything below is unlocked/)).toBeTruthy(),
    );
  });
});
