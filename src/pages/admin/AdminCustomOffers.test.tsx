/**
 * PT1.6b — owner tool for custom one-time offers. Minting is a privilege grant
 * (fresh MFA, never auto-replayed); the link is shown once; only links that
 * have not been paid can be revoked.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const runOwnerAction = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/components/admin/AdminAuthGate", () => ({ AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/admin-auth/ownerAction", () => ({
  runOwnerAction: (...a: unknown[]) => runOwnerAction(...a),
  ownerActionNotice: (o: { status: string }) => (o.status === "cancelled" ? "Verification cancelled — nothing was changed." : null),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import AdminCustomOffers from "./AdminCustomOffers";

const row = (status: string, id: string) => ({
  claim_id: id, note: `n-${status}`, status, created_at: "2026-10-16T00:00:00Z", expires_at: "2026-10-30T00:00:00Z",
  for_user_id: null, customer_user_id: null, customer_display_name: null, claimed_at: null, checkout_attempts: 0,
  purchase_status: null, review_reason: null, amount_cents: null, amount_refunded_cents: null,
  entitlement_starts_at: null, entitlement_ends_at: null,
});

beforeEach(() => {
  rpc.mockReset();
  runOwnerAction.mockReset();
  runOwnerAction.mockImplementation(async (_opts: unknown, fn: () => Promise<unknown>) => ({ status: "done", result: await fn() }));
  rpc.mockImplementation(async (name: string) => {
    if (name === "owner_list_custom_offer_claims") {
      return { data: [row("unclaimed", "c1"), row("paid", "c2"), row("checkout_open", "c3"), row("refunded", "c4")], error: null };
    }
    if (name === "owner_create_custom_offer_claim") return { data: { token: "mgy1_" + "cd".repeat(24) }, error: null };
    return { data: "revoked", error: null };
  });
});
afterEach(cleanup);

const renderPage = () => render(<MemoryRouter><AdminCustomOffers /></MemoryRouter>);

describe("AdminCustomOffers", () => {
  it("lists links and offers Revoke only where nothing has been paid", async () => {
    renderPage();
    await screen.findByTestId("custom-offer-table");
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
    expect(screen.getByText("Paid — Premium active")).toBeTruthy();
    expect(runOwnerAction.mock.calls[0][0]).toMatchObject({ level: "trusted" });
  });

  it("mints at the fresh-MFA level and shows the private link once", async () => {
    renderPage();
    await screen.findByTestId("custom-offer-table");
    fireEvent.click(screen.getByTestId("custom-offer-create-button"));
    const minted = await screen.findByTestId("custom-offer-minted");
    expect(minted.textContent).toContain("/lol/premium/claim#mgy1_");
    const mintCall = runOwnerAction.mock.calls.find((c) => (c[0] as { level: string }).level === "fresh")!;
    expect(mintCall[0]).not.toHaveProperty("idempotent");
    expect(rpc).toHaveBeenCalledWith("owner_create_custom_offer_claim", expect.objectContaining({ _for_user_id: null }));
  });

  it("refuses a malformed target account before calling the server", async () => {
    renderPage();
    await screen.findByTestId("custom-offer-table");
    fireEvent.change(screen.getByPlaceholderText("Restrict to user id (optional)"), { target: { value: "bob" } });
    fireEvent.click(screen.getByTestId("custom-offer-create-button"));
    await waitFor(() => expect(rpc).not.toHaveBeenCalledWith("owner_create_custom_offer_claim", expect.anything()));
    expect(screen.queryByTestId("custom-offer-minted")).toBeNull();
  });

  it("a cancelled MFA prompt creates nothing", async () => {
    runOwnerAction.mockImplementation(async (opts: { level: string }, fn: () => Promise<unknown>) =>
      opts.level === "fresh" ? { status: "cancelled" } : { status: "done", result: await fn() });
    renderPage();
    await screen.findByTestId("custom-offer-table");
    fireEvent.click(screen.getByTestId("custom-offer-create-button"));
    await waitFor(() => expect(runOwnerAction).toHaveBeenCalledTimes(2));
    expect(rpc).not.toHaveBeenCalledWith("owner_create_custom_offer_claim", expect.anything());
    expect(screen.queryByTestId("custom-offer-minted")).toBeNull();
  });
});
