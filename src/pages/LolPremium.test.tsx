/**
 * Mogzy Premium page banner: Premium comes from the backend entitlement endpoint
 * (the same interpretation that gates history and the missed bank), with
 * the client-side entitlement resolver as a fallback only when the lookup
 * is unavailable.
 *
 * PT1.4: that fallback is the `my_pro_entitlement` RPC — effective Premium,
 * Stripe OR a valid manual grant — not a raw `profiles.is_pro` read, which
 * would report a comped playtester as Free.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolPremium from "./LolPremium";
import {
  PREMIUM_MATRIX,
  freeBenefits,
  populatedGroups,
  premiumBenefits,
  presentableBenefits,
} from "@/lib/premium/matrix";

const getEntitlement = vi.fn();
const entitlementRpc = vi.fn();
const openBillingPortal = vi.fn();

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
// PT1.5: the page no longer knows a price — it renders the offer the server
// catalog defines. Only the network half is mocked; the pure offer helpers are
// re-exported from the real module so the rendered price is the real one.
vi.mock("@/lib/pro/checkout", async () => {
  const offers = await vi.importActual<typeof import("@/lib/pro/offers")>("@/lib/pro/offers");
  return {
    startLolProCheckout: vi.fn(),
    fetchPricingMode: vi.fn().mockResolvedValue("standard"),
    // Availability is a server answer. `available: null` is the UNKNOWN case,
    // which the page must treat as purchasable — the default these banner
    // tests want, since they assert on the ordinary upgrade CTA.
    fetchOfferAvailability: vi.fn().mockResolvedValue({ mode: "standard", available: null }),
    openBillingPortal: (...args: unknown[]) => openBillingPortal(...args),
    isOfferPurchasable: (id: string, a: { available: string[] | null }) =>
      a.available === null ? false : a.available.includes(id),
    formatOfferPrice: offers.formatOfferPrice,
    offerForInterval: offers.offerForInterval,
    LOL_PRO_SUCCESS_PATH: "/lol/premium?success=true",
    LOL_PRO_CANCEL_PATH: "/lol/premium?canceled=true",
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LolPremium />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getEntitlement.mockReset();
  entitlementRpc.mockReset();
  openBillingPortal.mockReset();
});
afterEach(cleanup);

describe("LolPremium entitlement banner", () => {
  it("shows You're Premium from the backend entitlement", async () => {
    getEntitlement.mockResolvedValue({
      ok: true, user_id: "user-1", is_pro: true, pro_lookup_configured: true,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/You’re Premium — everything below is unlocked/)).toBeTruthy(),
    );
    // The verdict came from the backend, not from the RPC fallback. PT1.5B does
    // call the RPC afterwards, but only for PROVENANCE — which billing action a
    // member is offered — and only once the backend has already said Premium.
    expect(getEntitlement).toHaveBeenCalled();
  });

  it("shows pricing when the backend says Free", async () => {
    getEntitlement.mockResolvedValue({
      ok: true, user_id: "user-1", is_pro: false, pro_lookup_configured: true,
    });
    renderPage();
    await waitFor(() => expect(getEntitlement).toHaveBeenCalled());
    expect(screen.queryByText(/You’re Premium/)).toBeNull();
    expect(screen.getAllByText(/Upgrade to Mogzy Premium/).length).toBeGreaterThan(0);
  });

  it("falls back to the entitlement resolver when the lookup is unavailable", async () => {
    getEntitlement.mockRejectedValue(new Error("Quiz API 503: Entitlement lookup failed"));
    entitlementRpc.mockResolvedValue({ data: [{ effective_pro: true }], error: null });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/You’re Premium — everything below is unlocked/)).toBeTruthy(),
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
      expect(screen.getByText(/You’re Premium — everything below is unlocked/)).toBeTruthy(),
    );
  });
});

/**
 * PT1.5B — the membership area. Which action a member is offered is decided by
 * WHERE the entitlement came from, never by the fact that they have it: a
 * comped account has no Stripe customer, so the billing portal would be a dead
 * end dressed as a feature.
 */
describe("LolPremium — manage-billing entry point", () => {
  const premiumFromBackend = () =>
    getEntitlement.mockResolvedValue({
      ok: true, user_id: "user-1", is_pro: true, pro_lookup_configured: true,
    });

  it("offers Manage billing to a paid Stripe subscriber", async () => {
    premiumFromBackend();
    entitlementRpc.mockResolvedValue({
      data: [{ effective_pro: true, stripe_pro: true, grant_kind: null }], error: null,
    });
    renderPage();
    const btn = await screen.findByTestId("premium-manage-billing");
    expect(btn).toBeTruthy();
    expect(screen.queryByTestId("premium-grant-line")).toBeNull();
  });

  it("opens the portal with no client-supplied identifier", async () => {
    premiumFromBackend();
    entitlementRpc.mockResolvedValue({
      data: [{ effective_pro: true, stripe_pro: true, grant_kind: null }], error: null,
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("premium-manage-billing"));
    await waitFor(() => expect(openBillingPortal).toHaveBeenCalledTimes(1));
    expect(openBillingPortal).toHaveBeenCalledWith();
  });

  it("gives a comped playtester the truth and NO billing action", async () => {
    premiumFromBackend();
    entitlementRpc.mockResolvedValue({
      data: [{
        effective_pro: true, stripe_pro: false, grant_kind: "playtest",
        grant_expires_at: "2027-09-05T00:00:00Z",
      }],
      error: null,
    });
    renderPage();
    const line = await screen.findByTestId("premium-grant-line");
    expect(line.textContent).toContain("Complimentary Premium");
    expect(line.textContent).toContain("playtest");
    expect(line.textContent).toContain("nothing to manage");
    expect(screen.queryByTestId("premium-manage-billing")).toBeNull();
  });

  it("shows a member who has both that they are billed, and names the grant", async () => {
    premiumFromBackend();
    entitlementRpc.mockResolvedValue({
      data: [{ effective_pro: true, stripe_pro: true, grant_kind: "manual" }], error: null,
    });
    renderPage();
    const line = await screen.findByTestId("premium-source-line");
    expect(line.textContent).toContain("Billed through Stripe");
    expect(line.textContent).toContain("manual grant");
    expect(screen.getByTestId("premium-manage-billing")).toBeTruthy();
  });

  it("offers no billing action to a Free user, and asks for no provenance", async () => {
    getEntitlement.mockResolvedValue({
      ok: true, user_id: "user-1", is_pro: false, pro_lookup_configured: true,
    });
    renderPage();
    await waitFor(() => expect(getEntitlement).toHaveBeenCalled());
    expect(screen.queryByTestId("premium-membership")).toBeNull();
    expect(screen.queryByTestId("premium-manage-billing")).toBeNull();
    expect(entitlementRpc).not.toHaveBeenCalled();
  });

  it("offers neither action while provenance is unresolved", async () => {
    premiumFromBackend();
    entitlementRpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    renderPage();
    await screen.findByTestId("premium-membership");
    expect(screen.queryByTestId("premium-manage-billing")).toBeNull();
    expect(screen.queryByTestId("premium-grant-line")).toBeNull();
  });
});

// ─────────────────────────────────────────── PT1.13 — the page reads the matrix

describe("PT1.13 — the comparison is rendered FROM the canonical matrix", () => {
  beforeEach(() => {
    getEntitlement.mockResolvedValue({ ok: true, is_pro: false });
    entitlementRpc.mockResolvedValue({ data: null, error: null });
  });

  it("renders one comparison row per presentable benefit, and no others", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    const shown = presentableBenefits().map((b) => b.id);
    for (const id of shown) {
      expect(screen.getByTestId(`premium-row-${id}`), id).toBeTruthy();
    }
    // Nothing outside the presentable set reached the page.
    for (const b of PREMIUM_MATRIX) {
      if (shown.includes(b.id)) continue;
      expect(screen.queryByTestId(`premium-row-${b.id}`), b.id).toBeNull();
    }
  });

  it("prints both columns, so a reader can see what Free already covers", async () => {
    renderPage();
    const row = await screen.findByTestId("premium-row-study-history");
    expect(row.textContent).toContain("10 most recent");
    expect(row.textContent).toContain("Every session you have ever completed");
  });

  it("marks the rows where Premium adds nothing as identical, not as a lock", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    for (const b of freeBenefits()) {
      expect(screen.getByTestId(`premium-same-${b.id}`), b.id).toBeTruthy();
    }
    for (const b of premiumBenefits()) {
      expect(screen.queryByTestId(`premium-same-${b.id}`), b.id).toBeNull();
    }
  });

  it("groups the comparison, in the matrix's own order", async () => {
    renderPage();
    const table = await screen.findByTestId("premium-comparison");
    const rendered = Array.from(table.querySelectorAll("tbody[data-testid^='premium-group-']"))
      .map((el) => el.getAttribute("data-testid"));
    expect(rendered).toEqual(populatedGroups().map((g) => `premium-group-${g.id}`));
  });

  it("leads with four benefits, each a shipped differentiator", async () => {
    renderPage();
    await screen.findByText("What Premium adds");
    const sellable = new Set(premiumBenefits().map((b) => b.id));
    const leads = Array.from(document.querySelectorAll("[data-testid^='premium-lead-']"));
    expect(leads).toHaveLength(4);
    for (const el of leads) {
      const id = el.getAttribute("data-testid")!.replace("premium-lead-", "");
      expect(sellable.has(id), id).toBe(true);
    }
  });
});

describe("PT1.13 — nothing unshipped is advertised as available", () => {
  beforeEach(() => {
    getEntitlement.mockResolvedValue({ ok: true, is_pro: false });
    entitlementRpc.mockResolvedValue({ data: null, error: null });
  });

  it("names no planned or partial benefit anywhere on the page", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    const body = document.body.textContent ?? "";
    for (const b of PREMIUM_MATRIX) {
      if (b.status === "shipped") continue;
      expect(body, b.id).not.toContain(b.label);
    }
  });

  it("has no 'Coming soon' badge left to hang a claim on", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    expect(document.body.textContent).not.toMatch(/coming soon/i);
  });

  it("does not promise to withdraw the free, unlimited 1v1 Combat Lab", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/Unlimited Combat Lab|Unlimited Saves/);
    // It appears instead as a row that says Free already has it.
    expect(screen.getByTestId("premium-free-combat-lab-1v1").textContent)
      .toMatch(/free and unlimited/i);
  });
});

describe("PT1.13 — the analytics wording matches PT1.11/PT1.12", () => {
  beforeEach(() => {
    getEntitlement.mockResolvedValue({ ok: true, is_pro: false });
    entitlementRpc.mockResolvedValue({ data: null, error: null });
  });

  it("gives Free the snapshot and Premium the reading of it", async () => {
    renderPage();
    const snapshot = await screen.findByTestId("premium-row-performance-snapshot");
    expect(snapshot.textContent).toMatch(/50/);
    expect(snapshot.textContent).toMatch(/answers/i);
    const trends = screen.getByTestId("premium-row-performance-trends");
    expect(trends.textContent).toMatch(/7, 30 or 90/);
    expect(trends.textContent).toMatch(/improving, steady or declining/i);
  });

  it("states the Practice/Time-Trial scope beside the analytics rows", async () => {
    renderPage();
    const trends = await screen.findByTestId("premium-row-performance-trends");
    expect(trends.textContent).toMatch(/Ranked rounds are not included/);
  });

  it("never reduces the distinction to 'Free analytics / Premium analytics'", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    expect(document.body.textContent).not.toMatch(/free analytics|premium analytics/i);
  });
});

describe("PT1.13 — the page keeps selling nothing it cannot deliver", () => {
  beforeEach(() => {
    getEntitlement.mockResolvedValue({ ok: true, is_pro: false });
    entitlementRpc.mockResolvedValue({ data: null, error: null });
  });

  it("has removed Matchup Cards from the hero and the page metadata", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    expect(document.body.textContent).not.toMatch(/Matchup Card/i);
    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute("content") ?? "").not.toMatch(/Matchup Card/i);
  });
});
