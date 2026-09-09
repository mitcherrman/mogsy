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
  availableBenefits,
  comingSoonBenefits,
  freeBenefits,
  internalOnlyBenefits,
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

  it("lists only shipped, complete-on-Free rows under Free, forever", async () => {
    renderPage();
    await screen.findByText("Free, forever");
    const listed = Array.from(document.querySelectorAll("[data-testid^='premium-free-']"))
      .map((el) => el.getAttribute("data-testid")!.replace("premium-free-", ""));
    expect(listed).toEqual(freeBenefits().map((b) => b.id));
    for (const b of freeBenefits()) expect(b.status, b.id).toBe("shipped");
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
    const available = new Set(availableBenefits().map((b) => b.id));
    const leads = Array.from(document.querySelectorAll("[data-testid^='premium-lead-']"));
    expect(leads).toHaveLength(4);
    for (const el of leads) {
      const id = el.getAttribute("data-testid")!.replace("premium-lead-", "");
      expect(sellable.has(id), id).toBe(true);
      expect(available.has(id), id).toBe(true);
    }
  });
});

describe("PT1.13B — the checklist shows what is coming, and never as available", () => {
  beforeEach(() => {
    getEntitlement.mockResolvedValue({ ok: true, is_pro: false });
    entitlementRpc.mockResolvedValue({ data: null, error: null });
  });

  it("renders every upcoming benefit with the Coming soon treatment", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    const soon = comingSoonBenefits();
    expect(soon.length).toBeGreaterThan(0);
    for (const b of soon) {
      const cell = screen.getByTestId(`premium-soon-${b.id}`);
      expect(cell.textContent, b.id).toMatch(/Coming soon/i);
    }
  });

  it("gives an upcoming row NO available-now treatment", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    for (const b of comingSoonBenefits()) {
      // Neither the gold Premium check nor the "same on both tiers" marker.
      const row = screen.getByTestId(`premium-row-${b.id}`);
      expect(row.querySelector("svg.lucide-check"), b.id).toBeNull();
      expect(screen.queryByTestId(`premium-same-${b.id}`), b.id).toBeNull();
    }
  });

  it("gives every shipped Premium row the check, and no Coming soon pill", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    for (const b of premiumBenefits()) {
      expect(screen.queryByTestId(`premium-soon-${b.id}`), b.id).toBeNull();
      expect(screen.getByTestId(`premium-row-${b.id}`).textContent, b.id)
        .not.toMatch(/Coming soon/i);
    }
  });

  it("names Team Combat as coming, not as included", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    const row = screen.getByTestId("premium-row-team-combat");
    expect(row.textContent).toMatch(/Team Combat/);
    expect(row.textContent).toMatch(/Coming soon/i);
    expect(row.textContent).toMatch(/Not included/);
    // And it is not sold anywhere that means "you get this now".
    expect(screen.queryByTestId("premium-lead-team-combat")).toBeNull();
    expect(screen.queryByTestId("premium-free-team-combat")).toBeNull();
  });

  it("names Matchup Cards and Learning Journeys as coming, not as live", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    for (const id of ["earned-matchup-cards", "curated-learning-journeys"]) {
      const row = screen.getByTestId(`premium-row-${id}`);
      expect(row.textContent, id).toMatch(/Coming soon/i);
      expect(screen.queryByTestId(`premium-lead-${id}`), id).toBeNull();
    }
  });

  it("keeps upcoming features out of the hero and the page metadata", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    // The hero is the one block a scanner reads as the promise, so it may
    // only ever contain shipped claims.
    const hero = document.querySelector("h2")!.closest("div")!;
    const meta = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    for (const b of comingSoonBenefits()) {
      expect(hero.textContent, b.id).not.toContain(b.label);
      expect(meta, b.id).not.toContain(b.label);
    }
    expect(meta).not.toMatch(/Matchup Card/i);
  });

  it("leaks no internal-only row into the page at all", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    for (const b of internalOnlyBenefits()) {
      expect(screen.queryByTestId(`premium-row-${b.id}`), b.id).toBeNull();
      expect(document.body.textContent, b.id).not.toContain(b.label);
    }
  });

  it("does not promise to withdraw the free, unlimited 1v1 Combat Lab", async () => {
    renderPage();
    await screen.findByTestId("premium-comparison");
    const body = document.body.textContent ?? "";
    // These two were never "early" — they were false. No status brings them back.
    expect(body).not.toMatch(/Unlimited Combat Lab|Unlimited Saves/);
    expect(screen.getByTestId("premium-free-combat-lab-1v1").textContent)
      .toMatch(/free and unlimited/i);
  });

  it("says nowhere that ads exist today", async () => {
    renderPage();
    const row = await screen.findByTestId("premium-row-ad-free");
    expect(row.textContent).toMatch(/No ads run anywhere on Mogzy today/);
    expect(row.textContent).toMatch(/Coming soon/i);
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
    // PT1.13B put Matchup Cards back on the CHECKLIST as Coming soon, which
    // is a different claim from the one PT1.13 removed. What must not come
    // back is the available-now framing: it was in the hero paragraph AND
    // the meta description, so search results were advertising a feature
    // that has never existed. Both remain forbidden.
    renderPage();
    const soon = await screen.findByTestId("premium-soon-earned-matchup-cards");
    expect(soon.textContent).toMatch(/Coming soon/i);

    const hero = document.querySelector("h2")!.closest("div")!;
    expect(hero.textContent).not.toMatch(/Matchup Card/i);
    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute("content") ?? "").not.toMatch(/Matchup Card/i);
  });
});
