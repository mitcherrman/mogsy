/**
 * PT1.7 — buyer pages. The page sends only a recipient and a message, shows the
 * exact one-time $50 total before checkout, and on return waits for the
 * SERVER to report the gift paid before it shows a code.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolPremiumGift from "./LolPremiumGift";
import LolPremiumRedeem from "./LolPremiumRedeem";
import { giftNav } from "@/lib/pro/gift";

const invoke = vi.fn();
type U = { id: string; is_anonymous: boolean; email?: string; email_confirmed_at?: string | null } | null;
let authUser: U;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: authUser, session: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let assign: ReturnType<typeof vi.spyOn>;
const VERIFIED = { id: "buyer", is_anonymous: false, email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

beforeEach(() => {
  invoke.mockReset();
  authUser = VERIFIED;
  assign = vi.spyOn(giftNav, "assign").mockImplementation(() => {});
  sessionStorage.clear();
});
afterEach(() => { cleanup(); assign.mockRestore(); });

const renderGift = (search = "") =>
  render(<MemoryRouter initialEntries={[`/lol/premium/gift${search}`]}><LolPremiumGift /></MemoryRouter>);

describe("buying a gift", () => {
  it("reviews the exact $50 one-time total and sends only recipient + message", async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) =>
      body.action === "availability"
        ? { data: { available: true, email_verified: true }, error: null }
        : { data: { url: "https://checkout.stripe.com/c/pay/cs_test_1", gift_id: "g1" }, error: null });
    renderGift();
    const review = await screen.findByTestId("gift-review");
    expect(review.textContent).toContain("$50.00");
    expect(review.textContent).toContain("Total, USD");
    expect(review.textContent).toContain("never renews");
    expect(review.textContent).toContain("365 days");

    fireEvent.change(screen.getByTestId("gift-recipient"), { target: { value: " Friend@CA.example " } });
    fireEvent.change(screen.getByTestId("gift-message"), { target: { value: "Happy birthday" } });
    expect((screen.getByTestId("gift-pay") as HTMLButtonElement).disabled).toBe(true); // not yet acknowledged
    fireEvent.click(screen.getByTestId("gift-understood"));
    fireEvent.click(screen.getByTestId("gift-pay"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"));
    const call = invoke.mock.calls.find((c) => c[1].body.action === "checkout")!;
    expect(call[0]).toBe("gift-checkout");
    expect(call[1].body).toEqual({ action: "checkout", recipient_email: "friend@ca.example", message: "Happy birthday" });
  });

  it("refuses to gift to the buyer's own address", async () => {
    invoke.mockResolvedValue({ data: { available: true, email_verified: true }, error: null });
    renderGift();
    await screen.findByTestId("gift-form");
    fireEvent.change(screen.getByTestId("gift-recipient"), { target: { value: "OWNER@example.com" } });
    fireEvent.click(screen.getByTestId("gift-understood"));
    expect((screen.getByTestId("gift-pay") as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks an unverified buyer to verify first, and offers no checkout", async () => {
    authUser = { ...VERIFIED, email_confirmed_at: null };
    invoke.mockResolvedValue({ data: { available: true, email_verified: false }, error: null });
    renderGift();
    expect(await screen.findByTestId("gift-verify-email")).toBeTruthy();
    expect(screen.queryByTestId("gift-pay")).toBeNull();
  });

  it("shows nothing to buy when the server says the gift is not available", async () => {
    invoke.mockResolvedValue({ data: { available: false }, error: null });
    renderGift();
    expect(await screen.findByTestId("gift-unavailable")).toBeTruthy();
  });

  it("signed-out and guest visitors are asked to sign in, and nothing is called", async () => {
    for (const u of [null, { id: "g", is_anonymous: true }]) {
      authUser = u;
      renderGift();
      expect(await screen.findByTestId("gift-sign-in")).toBeTruthy();
      cleanup();
    }
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("returning from Stripe", () => {
  it("does not show a code just because Stripe redirected: it waits for the server", async () => {
    invoke.mockResolvedValue({ data: { gift_id: "g1", status: "pending", redeem_code: null }, error: null });
    renderGift("?gift=11111111-1111-4111-8111-111111111111&checkout=success");
    expect(await screen.findByTestId("gift-pending")).toBeTruthy();
    expect(screen.queryByTestId("gift-code")).toBeNull();
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "status", gift_id: "11111111-1111-4111-8111-111111111111" });
  });

  it("shows the code, recipient and a redeem link once the server confirms payment", async () => {
    invoke.mockResolvedValue({
      data: { gift_id: "g1", status: "paid", recipient_email: "friend@ca.example", redeem_code: "ABCDEF1234" }, error: null,
    });
    renderGift("?gift=11111111-1111-4111-8111-111111111111&checkout=success");
    const done = await screen.findByTestId("gift-confirmed");
    expect(screen.getByTestId("gift-code").textContent).toBe("ABCDEF1234");
    expect(done.textContent).toContain("friend@ca.example");
    expect(done.textContent).toContain("/lol/premium/redeem#ABCDEF1234");
  });

  it.each(["refunded", "disputed", "invalid", "expired"])("explains a %s gift", async (status) => {
    invoke.mockResolvedValue({ data: { gift_id: "g1", status, redeem_code: null }, error: null });
    renderGift("?gift=11111111-1111-4111-8111-111111111111&checkout=success");
    expect(await screen.findByTestId(`gift-${status}`)).toBeTruthy();
  });

  it("a canceled checkout says nothing was charged and offers the form again", async () => {
    invoke.mockResolvedValue({ data: { available: true, email_verified: true }, error: null });
    renderGift("?gift=11111111-1111-4111-8111-111111111111&checkout=canceled");
    expect((await screen.findByTestId("gift-canceled")).textContent).toContain("Nothing was charged");
    expect(await screen.findByTestId("gift-form")).toBeTruthy();
  });
});

describe("redeeming a gift", () => {
  const renderRedeem = (hash = "") => {
    window.history.replaceState(null, "", `/lol/premium/redeem${hash}`);
    return render(<MemoryRouter initialEntries={["/lol/premium/redeem"]}><LolPremiumRedeem /></MemoryRouter>);
  };

  it("takes the code from the link and shows Premium's end date on success", async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) =>
      body.action === "list"
        ? { data: { gifts: [] }, error: null }
        : { data: { success: true, gift_type: "pro_annual", premium_days: 365, grant_ends_at: "2027-10-17T00:00:00Z" }, error: null });
    renderRedeem("#ABCDEF1234");
    expect((await screen.findByTestId("redeem-code") as HTMLInputElement).value).toBe("ABCDEF1234");
    fireEvent.click(screen.getByTestId("redeem-submit"));
    const ok = await screen.findByTestId("redeem-success");
    expect(ok.textContent).toContain("365 days of Premium");
    expect(ok.textContent).toContain("does not renew");
    const call = invoke.mock.calls.find((c) => c[1].body.action === "redeem")!;
    expect(call[0]).toBe("redeem-gift");
    expect(call[1].body).toEqual({ action: "redeem", code: "ABCDEF1234" });
  });

  it("shows the server's refusal for the wrong account", async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) =>
      body.action === "list"
        ? { data: { gifts: [] }, error: null }
        : { data: { success: false, reason: "recipient_mismatch", error: "This gift was sent to a different email address." }, error: null });
    renderRedeem("#ABCDEF1234");
    fireEvent.click(await screen.findByTestId("redeem-submit"));
    expect((await screen.findByTestId("redeem-error")).textContent).toContain("different email address");
  });

  it("lists gifts addressed to my verified email", async () => {
    invoke.mockResolvedValue({ data: { gifts: [{ gift_id: "g1", redeem_code: "ABCDEF1234", gift_type: "pro_annual", message: "Enjoy", from: "Owner" }] }, error: null });
    renderRedeem();
    const inbox = await screen.findByTestId("redeem-inbox");
    expect(inbox.textContent).toContain("Owner sent you Mogzy Premium");
    expect(inbox.textContent).toContain("Enjoy");
  });

  it("an unverified recipient is told to verify, and nothing is called", async () => {
    authUser = { ...VERIFIED, email_confirmed_at: null };
    renderRedeem("#ABCDEF1234");
    expect(await screen.findByTestId("redeem-verify-email")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("a signed-out visitor is sent to sign in, keeping the code for the return", async () => {
    authUser = null;
    renderRedeem("#ABCDEF1234");
    expect(await screen.findByTestId("redeem-sign-in")).toBeTruthy();
    expect(sessionStorage.getItem("mogzy:gift-code")).toBe("ABCDEF1234");
  });
});
