// PT1.5 — the server-owned offer catalog is the checkout allowlist. These run
// under vitest (see vitest.config.ts): the module is pure TypeScript with no
// Deno-only imports, and its Deno.env reads are optional-chained.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOfferCatalog,
  foundingAccessCodeMatches,
  getOffer,
  isMogzyOfferId,
  isOfferConfigured,
  MOGZY_OFFER_IDS,
  offerAllowedInMode,
  readPricingMode,
  winbackCouponId,
  __setOfferCatalogForTests,
  type MogzyOfferId,
} from "./offer-catalog";
import { PRO_OFFERS } from "../../../src/lib/pro/offers";

/** Install a fake Deno.env for the duration of a test. */
function withEnv(vars: Record<string, string>, run: () => void) {
  const g = globalThis as any;
  const prior = g.Deno;
  g.Deno = { env: { get: (k: string) => vars[k] } };
  __setOfferCatalogForTests(null);
  try {
    run();
  } finally {
    g.Deno = prior;
    __setOfferCatalogForTests(null);
  }
}

beforeEach(() => __setOfferCatalogForTests(null));

describe("approved offer vocabulary", () => {
  it("is exactly the five approved offers", () => {
    expect([...MOGZY_OFFER_IDS]).toEqual([
      "standard_monthly",
      "standard_annual",
      "launch_monthly",
      "launch_annual",
      "founding_playtester",
    ]);
  });

  it("rejects anything that is not an approved offer id", () => {
    for (const bad of [
      "", "founder", "Standard_Monthly", "standard monthly", "$7.99",
      "price_1T3Ua6D9NqEQUIGhfXFmV6V6", "admin", null, undefined, 7, {}, ["launch_annual"],
    ]) {
      expect(isMogzyOfferId(bad)).toBe(false);
      expect(getOffer(bad)).toBeNull();
    }
  });

  it("carries no offer whose identity is a price or a display string", () => {
    for (const id of MOGZY_OFFER_IDS) {
      expect(id).not.toMatch(/price_|\$|\d\.\d\d/);
    }
  });

  it("maps every offer to the right interval and amount", () => {
    const expected: Record<MogzyOfferId, ["month" | "year", number]> = {
      standard_monthly: ["month", 999],
      standard_annual: ["year", 9999],
      launch_monthly: ["month", 799],
      launch_annual: ["year", 7999],
      founding_playtester: ["year", 3999],
    };
    for (const [id, [interval, cents]] of Object.entries(expected)) {
      const offer = getOffer(id)!;
      expect(offer.interval).toBe(interval);
      expect(offer.listPriceCents).toBe(cents);
    }
  });

  it("grants one product: no offer carries any entitlement or feature field", () => {
    for (const id of MOGZY_OFFER_IDS) {
      const keys = Object.keys(getOffer(id)!);
      for (const forbidden of ["features", "tier", "isPro", "entitlement", "grant", "limits"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});

describe("client and server catalogs describe the same offers", () => {
  it("agrees on ids, intervals, amounts and visibility", () => {
    expect(Object.keys(PRO_OFFERS).sort()).toEqual([...MOGZY_OFFER_IDS].sort());
    for (const id of MOGZY_OFFER_IDS) {
      const server = getOffer(id)!;
      const client = PRO_OFFERS[id];
      expect(client.interval).toBe(server.interval);
      expect(client.priceCents).toBe(server.listPriceCents);
      expect(client.family).toBe(server.family);
      expect(client.visibility).toBe(server.visibility);
    }
  });

  it("keeps every Stripe Price ID out of the client catalog", () => {
    expect(JSON.stringify(PRO_OFFERS)).not.toMatch(/price_/);
  });
});

describe("configuration fails closed", () => {
  it("sells standard monthly out of the box at the live $9.99 price", () => {
    withEnv({}, () => {
      const offer = getOffer("standard_monthly")!;
      expect(offer.priceId).toBe("price_1T3Ua6D9NqEQUIGhfXFmV6V6");
      expect(isOfferConfigured(offer)).toBe(true);
    });
  });

  it("leaves every other offer unpurchasable until its price is configured", () => {
    withEnv({}, () => {
      for (const id of ["standard_annual", "launch_monthly", "launch_annual", "founding_playtester"] as const) {
        expect(isOfferConfigured(getOffer(id))).toBe(false);
      }
    });
  });

  it("never falls back to the historical $83.99 annual price", () => {
    withEnv({}, () => {
      const ids = [...MOGZY_OFFER_IDS].map((id) => getOffer(id)!.priceId);
      expect(ids).not.toContain("price_1TZRqtD9NqEQUIGhXUSpw5DI");
    });
  });

  it("takes each price from its own env var", () => {
    withEnv({
      STRIPE_PRICE_STANDARD_MONTHLY: "price_sm",
      STRIPE_PRICE_STANDARD_ANNUAL: "price_sa",
      STRIPE_PRICE_LAUNCH_MONTHLY: "price_lm",
      STRIPE_PRICE_LAUNCH_ANNUAL: "price_la",
      STRIPE_PRICE_FOUNDING_PLAYTESTER: "price_fp",
    }, () => {
      const c = buildOfferCatalog();
      expect(c.get("standard_monthly")!.priceId).toBe("price_sm");
      expect(c.get("standard_annual")!.priceId).toBe("price_sa");
      expect(c.get("launch_monthly")!.priceId).toBe("price_lm");
      expect(c.get("launch_annual")!.priceId).toBe("price_la");
      expect(c.get("founding_playtester")!.priceId).toBe("price_fp");
    });
  });

  it("only accepts a real Stripe price id as configuration", () => {
    withEnv({ STRIPE_PRICE_STANDARD_ANNUAL: "prod_notaprice" }, () => {
      expect(isOfferConfigured(getOffer("standard_annual"))).toBe(false);
    });
  });
});

describe("pricing mode gates the launch price list", () => {
  it("defaults to full price for anything unrecognised", () => {
    for (const value of [null, undefined, {}, { mode: "LAUNCH" }, { mode: 1 }, "launch"]) {
      expect(readPricingMode(value)).toBe("standard");
    }
    expect(readPricingMode({ mode: "launch" })).toBe("launch");
  });

  it("refuses launch offers outside launch mode", () => {
    expect(offerAllowedInMode(getOffer("launch_annual")!, "standard")).toBe(false);
    expect(offerAllowedInMode(getOffer("launch_monthly")!, "standard")).toBe(false);
    expect(offerAllowedInMode(getOffer("launch_annual")!, "launch")).toBe(true);
  });

  it("always allows standard offers", () => {
    for (const mode of ["standard", "launch"] as const) {
      expect(offerAllowedInMode(getOffer("standard_monthly")!, mode)).toBe(true);
      expect(offerAllowedInMode(getOffer("standard_annual")!, mode)).toBe(true);
    }
  });
});

describe("Founding Playtester is private and gated by a server secret", () => {
  it("is never marked public", () => {
    expect(getOffer("founding_playtester")!.visibility).toBe("private");
    expect(PRO_OFFERS.founding_playtester.visibility).toBe("private");
  });

  it("cannot be unlocked when no access code is configured", () => {
    withEnv({}, () => {
      for (const attempt of ["", "founder", "true", null, undefined, 1, {}]) {
        expect(foundingAccessCodeMatches(attempt)).toBe(false);
      }
    });
  });

  it("accepts only the exact configured code", () => {
    withEnv({ MOGZY_FOUNDING_ACCESS_CODE: "s3cret-code" }, () => {
      expect(foundingAccessCodeMatches("s3cret-code")).toBe(true);
      expect(foundingAccessCodeMatches("s3cret-cod")).toBe(false);
      expect(foundingAccessCodeMatches("s3cret-codeX")).toBe(false);
      expect(foundingAccessCodeMatches("S3CRET-CODE")).toBe(false);
      expect(foundingAccessCodeMatches(true as unknown as string)).toBe(false);
    });
  });

  it("renews on an annual price, and ships with neither price nor coupon set", () => {
    withEnv({}, () => {
      const offer = getOffer("founding_playtester")!;
      expect(offer.interval).toBe("year");
      // The renewal decision is UNRESOLVED — nothing may be assumed for it.
      expect(offer.priceId).toBe("");
      expect(offer.couponId).toBe("");
      expect(isOfferConfigured(offer)).toBe(false);
    });
  });
});

describe("coupons are server-owned", () => {
  it("has a win-back coupon that no offer carries by default", () => {
    withEnv({}, () => {
      expect(winbackCouponId()).toBe("sCkrnnuL");
      for (const id of MOGZY_OFFER_IDS) expect(getOffer(id)!.couponId).toBe("");
    });
  });

  it("takes the win-back coupon from the environment when set", () => {
    withEnv({ STRIPE_COUPON_WINBACK: "cpn_other" }, () => {
      expect(winbackCouponId()).toBe("cpn_other");
    });
  });
});
