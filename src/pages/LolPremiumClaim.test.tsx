/**
 * PT1.6b — the private claim page. It may only ASK the server what the signed-in
 * account can do with a claim and start the one checkout; it never claims
 * Premium is active because Stripe returned, and it never sends a price.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolPremiumClaim from "./LolPremiumClaim";
import { browserNav } from "@/lib/pro/customOffer";

const TOKEN = "mgy1_" + "ab".repeat(24);
const invoke = vi.fn();
let authUser: { id: string; is_anonymous: boolean } | null = { id: "user-1", is_anonymous: false };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) }, rpc: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: authUser, session: null }),
}));

let assign: ReturnType<typeof vi.spyOn>;

function renderAt(search = "", hash = `#${TOKEN}`) {
  window.history.replaceState(null, "", `/lol/premium/claim${search}${hash}`);
  return render(
    <MemoryRouter initialEntries={[`/lol/premium/claim${search}`]}>
      <LolPremiumClaim />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invoke.mockReset();
  assign = vi.spyOn(browserNav, "assign").mockImplementation(() => {});
  sessionStorage.clear();
  authUser = { id: "user-1", is_anonymous: false };
});
afterEach(() => {
  cleanup();
  assign.mockRestore();
});

describe("LolPremiumClaim", () => {
  it("offers $50 total for 12 months, paid once, and starts checkout with the token only", async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) =>
      body.action === "status"
        ? { data: { state: "available", claim_expires_at: "2026-10-30T00:00:00Z" }, error: null }
        : { data: { url: "https://checkout.stripe.com/c/pay/cs_test_1" }, error: null });
    renderAt();
    const offer = await screen.findByTestId("claim-offer");
    expect(offer.textContent).toContain("$50");
    expect(offer.textContent).toContain("total");
    expect(offer.textContent).toContain("12 months");
    expect(offer.textContent).toContain("never renews");
    fireEvent.click(screen.getByTestId("claim-pay"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"));
    const checkoutCall = invoke.mock.calls.find((c) => c[1].body.action === "checkout")!;
    expect(checkoutCall[0]).toBe("custom-offer-checkout");
    expect(checkoutCall[1].body).toEqual({ action: "checkout", token: TOKEN });
  });

  it("asks a signed-out visitor to sign in and calls nothing", async () => {
    authUser = null;
    renderAt();
    expect(await screen.findByTestId("claim-sign-in")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("treats a guest session as signed out", async () => {
    authUser = { id: "guest", is_anonymous: true };
    renderAt();
    expect(await screen.findByTestId("claim-sign-in")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps the token across the Stripe round trip (return URLs carry none)", async () => {
    invoke.mockResolvedValue({ data: { state: "available" }, error: null });
    renderAt();
    await screen.findByTestId("claim-offer");
    cleanup();
    invoke.mockClear();
    renderAt("?checkout=canceled", "");
    expect((await screen.findByTestId("claim-offer")).textContent).toContain("Nothing was charged");
    expect(invoke.mock.calls[0][1].body.token).toBe(TOKEN);
  });

  it("after a successful return, waits for the server instead of declaring Premium", async () => {
    invoke.mockResolvedValue({ data: { state: "checkout_open" }, error: null });
    renderAt("?checkout=success");
    expect(await screen.findByTestId("claim-activating")).toBeTruthy();
    expect(screen.queryByTestId("claim-paid")).toBeNull();
  });

  it("shows the end date once the purchase is confirmed", async () => {
    invoke.mockResolvedValue({
      data: { state: "already_paid", purchase_status: "paid", entitlement_ends_at: "2027-10-16T12:00:00Z" },
      error: null,
    });
    renderAt("?checkout=success");
    const paid = await screen.findByTestId("claim-paid");
    expect(paid.textContent).toContain("Premium is active until");
    expect(paid.textContent).toContain("does not renew");
  });

  it.each([
    ["other_account", "different Mogzy account"],
    ["active_subscription", "active Premium subscription"],
    ["unavailable", "no longer available"],
    ["offer_disabled", "isn't available just yet"],
  ])("explains the %s state and offers no payment", async (state, text) => {
    invoke.mockResolvedValue({ data: { state }, error: null });
    renderAt();
    expect((await screen.findByTestId(`claim-${state}`)).textContent).toContain(text);
    expect(screen.queryByTestId("claim-pay")).toBeNull();
  });

  it("without a token it explains the page and calls nothing", async () => {
    renderAt("", "");
    expect(await screen.findByTestId("claim-no-token")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
