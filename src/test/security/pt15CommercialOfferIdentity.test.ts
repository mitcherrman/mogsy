import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * PT1.5 — contract tests over the commercial-offer migration, the checkout
 * authority and the Stripe recorders.
 *
 * These assert the *shape of authority*, which no runtime test in this repo can
 * reach (Supabase is managed by Lovable and not run locally, and no Stripe test
 * account is wired up here):
 *
 *   1. A client cannot manufacture a cheaper or privileged offer.
 *   2. Acquisition identity is write-once and survives reconciliation.
 *   3. Commercial identity is never entitlement — PT1.4 stays intact.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const FUNCTIONS = join(process.cwd(), "supabase/functions");
const SRC = join(process.cwd(), "src");

const migration = readFileSync(
  join(MIGRATIONS, "20260904130000_pt1_5_commercial_offer_identity.sql"),
  "utf8"
);
const readFn = (name: string) => readFileSync(join(FUNCTIONS, name, "index.ts"), "utf8");
const createCheckout = readFn("create-checkout");
const webhook = readFn("stripe-webhook");
const checkSubscription = readFn("check-subscription");
const offerCatalog = readFileSync(join(FUNCTIONS, "_shared/offer-catalog.ts"), "utf8");

/** Strip comments so an assertion matches executable code, not prose. */
const code = (src: string) =>
  src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const OFFER_IDS = [
  "standard_monthly", "standard_annual",
  "launch_monthly", "launch_annual", "founding_playtester",
];

describe("PT1.5 migration — schema", () => {
  it("adds acquisition identity and current billing state as separate columns", () => {
    for (const col of [
      "pro_offer", "pro_offer_acquired_at", "pro_offer_price_id",
      "stripe_customer_id", "stripe_subscription_id", "stripe_price_id",
      "stripe_billing_interval", "stripe_subscription_status", "stripe_current_period_end",
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it("constrains the offer vocabulary to the five approved ids", () => {
    expect(migration).toContain("profiles_pro_offer_check");
    for (const id of OFFER_IDS) expect(migration).toContain(`'${id}'`);
  });

  it("adds no column that could be read as an entitlement or a feature tier", () => {
    const added = [...migration.matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/g)].map((m) => m[1]);
    for (const col of added) {
      expect(col).not.toMatch(/is_pro|grant|tier|feature|entitle/i);
    }
  });

  it("indexes the acquisition offer so cohort analytics do not need a table scan", () => {
    expect(migration).toContain("profiles_pro_offer_idx");
  });

  it("seeds pricing mode to full price, never to the discount", () => {
    expect(migration).toMatch(/INSERT INTO public\.app_settings[\s\S]*'pro_pricing'/);
    expect(migration).toContain('{"mode": "standard"}');
    expect(migration).toContain("ON CONFLICT (key) DO NOTHING");
  });
});

describe("PT1.5 migration — the one commercial writer", () => {
  it("makes the acquisition offer write-once", () => {
    expect(migration).toContain("pro_offer = COALESCE(p.pro_offer, _safe_offer)");
    // The timestamp and acquisition price only move when the offer is first set.
    expect(migration).toMatch(
      /pro_offer_acquired_at = CASE\s*\n\s*WHEN p\.pro_offer IS NULL AND _safe_offer IS NOT NULL THEN now\(\)/
    );
    expect(migration).toMatch(
      /pro_offer_price_id = CASE\s*\n\s*WHEN p\.pro_offer IS NULL AND _safe_offer IS NOT NULL THEN _stripe_price_id/
    );
  });

  it("lets reconciliation move current billing state freely", () => {
    for (const col of [
      "stripe_customer_id", "stripe_subscription_id", "stripe_price_id",
      "stripe_billing_interval", "stripe_subscription_status", "stripe_current_period_end",
    ]) {
      expect(migration).toMatch(new RegExp(`${col}\\s*=\\s*COALESCE\\(_`));
    }
  });

  it("never writes entitlement", () => {
    const fn = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.record_pro_commercial_state"),
      migration.indexOf("REVOKE EXECUTE ON FUNCTION public.record_pro_commercial_state")
    );
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toMatch(/\bis_pro\s*=/);
    expect(fn).not.toMatch(/pro_grant_\w+\s*=/);
    // And the migration asserts exactly that at apply time.
    expect(migration).toContain("commercial identity must never grant entitlement");
  });

  it("stores an unrecognised offer as NULL rather than failing the webhook", () => {
    expect(migration).toMatch(/_safe_offer := CASE\s*\n\s*WHEN _offer_id IN \(/);
  });

  it("is callable by no client role", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.record_pro_commercial_state\([\s\S]*?\) FROM public, anon, authenticated;/
    );
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.record_pro_commercial_state/);
  });
});

describe("PT1.5 migration — self-service writes stay clamped", () => {
  it("clamps every new commercial column", () => {
    for (const col of [
      "pro_offer", "pro_offer_acquired_at", "pro_offer_price_id",
      "stripe_customer_id", "stripe_subscription_id", "stripe_price_id",
      "stripe_billing_interval", "stripe_subscription_status", "stripe_current_period_end",
    ]) {
      expect(migration).toContain(`NEW.${col} := OLD.${col}`);
    }
  });

  it("carries forward every ADM2 and PT1.4 protection", () => {
    for (const col of [
      "is_pro", "diamonds", "boost_credits", "elo_shields", "reveals", "rewinds",
      "is_bot", "is_disabled", "is_flagged_underage", "admin_notes", "ads_enabled",
      "active_boost_until", "pro_grant_kind", "pro_grant_expires_at",
      "pro_grant_reason", "pro_grant_granted_at", "pro_grant_granted_by",
    ]) {
      expect(migration).toContain(`NEW.${col} := OLD.${col}`);
    }
  });

  it("keeps the service-role guard so Stripe writes still land", () => {
    expect(migration).toContain("IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN");
  });

  it("re-asserts PT1.4's entitlement matrix so it cannot ship regressed", () => {
    expect(migration).toContain("public.pro_entitlement_is_effective(false, 'playtest', _future) = true");
    expect(migration).toContain("public.pro_entitlement_is_effective(true,  'playtest', _past)   = true");
  });
});

describe("create-checkout — no client-manufactured offer", () => {
  const src = code(createCheckout);

  it("refuses a raw Price ID for a subscription", () => {
    expect(src).toContain('code: "OFFER_REQUIRED"');
    // The only line_items price for a subscription comes from the catalog.
    expect(src).toContain("sessionConfig.line_items = [{ price: definition.priceId, quantity: 1 }]");
  });

  it("resolves the price from the server catalog and rejects unknown offers", () => {
    expect(src).toContain("const definition = getOffer(offer);");
    expect(src).toContain('code: "UNKNOWN_OFFER"');
  });

  it("names no Stripe Price ID of its own", () => {
    // A real Stripe price id, not the `stripe_price_id` column name.
    expect(src).not.toMatch(/price_[A-Za-z0-9]{12,}/);
  });

  it("allowlists one-time prices too, so no arbitrary price reaches Stripe", () => {
    expect(src).toContain("if (!resolveGiftByPriceId(priceId)) {");
    expect(src).toContain('code: "UNKNOWN_PRICE"');
  });

  it("accepts no coupon from the client", () => {
    expect(src).not.toMatch(/\bcouponId\b\s*[,}]/);
    expect(src).toContain("winbackCouponId()");
    // The win-back discount is decided from Stripe history, server side.
    expect(src).toContain("const hasActive = past.data.some((s) => [\"active\", \"trialing\"].includes(s.status));");
  });

  it("gates the private founding offer on a server-verified access code", () => {
    expect(src).toContain('definition.visibility === "private" && !foundingAccessCodeMatches(offerAccessCode)');
    expect(src).toContain('return notAvailable();');
  });

  it("answers every unsellable case identically, so probing learns nothing", () => {
    // Unconfigured price, wrong pricing mode and a rejected access code must be
    // indistinguishable from outside.
    expect(src.match(/return notAvailable\(\);/g)?.length).toBe(3);
    expect(src.match(/code: "OFFER_NOT_AVAILABLE"/g)?.length).toBe(1);
  });

  it("refuses a launch price outside launch mode, using the server's own reading", () => {
    expect(src).toContain('.eq("key", "pro_pricing")');
    expect(src).toContain("readPricingMode(pricingRow?.value)");
    expect(src).toContain("if (!offerAllowedInMode(definition, pricingMode))");
  });

  it("fails closed for an offer with no configured price", () => {
    expect(src).toContain("if (!isOfferConfigured(definition))");
  });

  it("stamps the offer onto Stripe itself, on the session and the subscription", () => {
    expect(src).toContain("sessionConfig.metadata.mogzy_offer = definition.id;");
    expect(src).toContain("metadata: { supabase_user_id: user.id, mogzy_offer: definition.id }");
  });

  it("writes no entitlement column", () => {
    expect(src).not.toMatch(/\b(is_pro|pro_grant_\w+)\s*:/);
  });
});

describe("Stripe reconciliation records commercial state without touching entitlement", () => {
  it("records from the webhook on checkout and on every subscription event", () => {
    const src = code(webhook);
    expect(src).toContain('supabase.rpc("record_pro_commercial_state"');
    expect(src).toContain("_offer_id: subscription.metadata?.mogzy_offer ?? null");
    // Both branches record.
    expect(src.match(/await recordCommercialState\(/g)?.length).toBe(2);
  });

  it("keeps is_pro as the webhook's only entitlement write", () => {
    const src = code(webhook);
    const written = new Set([...src.matchAll(/\b(is_pro|pro_grant_\w+)\s*:/g)].map((m) => m[1]));
    expect([...written]).toEqual(["is_pro"]);
  });

  it("keeps webhook signature verification and the status mapping intact", () => {
    expect(webhook).toContain("stripe.webhooks.constructEventAsync(body, signature, webhookSecret");
    expect(webhook).toContain('["active", "trialing"].includes(subscription.status)');
    expect(webhook).toContain('return new Response("Invalid signature", { status: 400 });');
  });

  it("never fails an event because commercial bookkeeping failed", () => {
    // A thrown error would make Stripe retry an event whose is_pro half already
    // succeeded; the recorder logs instead.
    const recorder = webhook.slice(
      webhook.indexOf("async function recordCommercialState"),
      webhook.indexOf("serve(async (req)")
    );
    expect(recorder).toContain("console.error(\"record_pro_commercial_state failed\"");
    expect(recorder).not.toMatch(/\bthrow\b/);
  });

  it("reconciles from check-subscription as a backstop, without writing entitlement there either", () => {
    const src = code(checkSubscription);
    expect(src).toContain('supabaseClient.rpc("record_pro_commercial_state"');
    expect(src).toContain("_offer_id: sub.metadata?.mogzy_offer ?? null");
    const written = new Set([...src.matchAll(/\b(is_pro|pro_grant_\w+)\s*:/g)].map((m) => m[1]));
    expect([...written]).toEqual(["is_pro"]);
  });

  it("leaves the PT1.4 Stripe ownership comments in place on both functions", () => {
    for (const src of [webhook, checkSubscription]) {
      expect(src).toContain("STRIPE-DERIVED");
      expect(src).toContain("pro_grant_");
    }
  });
});

describe("gift and invite entitlement paths are untouched by PT1.5", () => {
  it("still grants a gift as an expiring pro_grant, never is_pro", () => {
    const src = code(readFn("redeem-gift"));
    expect(src).toContain('pro_grant_kind: "gift"');
    expect(src).not.toMatch(/\bis_pro\s*:/);
    expect(src).not.toContain("record_pro_commercial_state");
  });

  it("records no acquisition offer for a gift recipient, who chose no offer", () => {
    expect(createCheckout).toContain("no pro_offer is recorded for them");
  });

  it("leaves the invite promo grant migration alone", () => {
    const files = readdirSync(MIGRATIONS);
    expect(files).toContain("20260903130000_pt1_4_invite_promo_grant.sql");
    // PT1.5 must not redefine either PT1.4 grant path. `apply_pro_grant` is
    // named once, in a prose comment about EXECUTE grants — never created here.
    expect(migration).not.toMatch(/FUNCTION public\.(redeem_invite_link|apply_pro_grant)/);
    expect(migration).not.toMatch(/(REVOKE|GRANT) EXECUTE[^;]*?(redeem_invite_link|apply_pro_grant)/);
  });
});

describe("the frontend ships no subscription price, coupon or founder claim", () => {
  /** Every non-test file under src/, so a new leak cannot appear unnoticed. */
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
      return [full];
    });
  const files = walk(SRC);

  it("has no subscription Stripe Price ID anywhere in src/", () => {
    const subscriptionPrices = ["price_1T3Ua6D9NqEQUIGhfXFmV6V6", "price_1TZRqtD9NqEQUIGhXUSpw5DI"];
    const leaks = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return subscriptionPrices.some((p) => src.includes(p));
    });
    expect(leaks).toEqual([]);
  });

  it("ships no Stripe coupon id", () => {
    const leaks = files.filter((f) => /sCkrnnuL|couponId/.test(readFileSync(f, "utf8")));
    expect(leaks).toEqual([]);
  });

  it("sends only an offer id to create-checkout for subscriptions", () => {
    const checkout = readFileSync(join(SRC, "lib/pro/checkout.ts"), "utf8");
    expect(checkout).toContain("offer: offerId,");
    expect(code(checkout)).not.toMatch(/priceId|mode:\s*"subscription"/);
  });

  it("keeps the client offer catalog free of prices and of entitlement", () => {
    const offers = readFileSync(join(SRC, "lib/pro/offers.ts"), "utf8");
    expect(offers).not.toMatch(/price_[A-Za-z0-9]/);
    expect(offers).not.toContain("is_pro");
    expect(offers).not.toContain("pro_grant");
  });

  it("resolves the Shop's Pro state through the PT1.4 rule, not raw is_pro", () => {
    const shop = readFileSync(join(SRC, "pages/Shop.tsx"), "utf8");
    expect(shop).toContain("const effectivePro = isEffectivePro(profile);");
    expect(code(shop)).not.toContain("profile?.is_pro");
  });

  it("never renders a private offer", () => {
    const offers = readFileSync(join(SRC, "lib/pro/offers.ts"), "utf8");
    expect(offers).toMatch(/founding_playtester[\s\S]*?visibility: "private"/);
    const surfaces = ["pages/Shop.tsx", "pages/LolPremium.tsx"];
    for (const s of surfaces) {
      expect(readFileSync(join(SRC, s), "utf8")).not.toContain("founding_playtester");
    }
  });
});

// ---------------------------------------------------------------------------
// PT1.5 was written against a pre-Premium, pre-PT1.7 baseline and paused. The
// blocks below fence the port onto today's code: they fail if the Premium
// rename, the PT1.7A free surface or the PT1.7B Builder is undone by a future
// rebase of this work, and they cover the availability probe, which PT1.5 did
// not have.
// ---------------------------------------------------------------------------

const lolPremium = readFileSync(join(SRC, "pages/LolPremium.tsx"), "utf8");
const clientCheckout = readFileSync(join(SRC, "lib/pro/checkout.ts"), "utf8");
const premiumRoutes = readFileSync(join(SRC, "lib/premium-routes.ts"), "utf8");

describe("create-checkout — the availability probe tells the truth and leaks nothing", () => {
  const cc = code(createCheckout);

  it("answers an availability probe without requiring a signed-in user", () => {
    // The probe must be reachable before the auth check: an anonymous visitor
    // reads the sales page, and a page that cannot ask would have to guess.
    const probeAt = cc.indexOf('action === "offer_availability"');
    const authAt = cc.indexOf("auth.getUser(token)");
    expect(probeAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(-1);
    expect(probeAt).toBeLessThan(authAt);
  });

  it("reports availability with the same three rules checkout itself applies", () => {
    const probe = cc.slice(
      cc.indexOf('action === "offer_availability"'),
      cc.indexOf("const authHeader")
    );
    expect(probe).toContain('visibility === "public"');
    expect(probe).toContain("offerAllowedInMode(");
    expect(probe).toContain("isOfferConfigured(");
  });

  it("returns no Stripe Price ID, coupon or secret", () => {
    const probe = cc.slice(
      cc.indexOf('action === "offer_availability"'),
      cc.indexOf("const authHeader")
    );
    expect(probe).not.toMatch(/priceId|price_|coupon|ACCESS_CODE/i);
    // Only the offer ids and the mode leave the function.
    expect(probe).toContain("json({ mode: pricingMode, available }, 200)");
  });

  it("can never surface the private founding offer, configured or not", () => {
    // `visibility === "public"` is the gate, and founding is private in both
    // catalogs — asserted here and in offer-catalog.test.ts.
    expect(offerCatalog).toMatch(/id: "founding_playtester"[\s\S]*?visibility: "private"/);
    const probe = cc.slice(
      cc.indexOf('action === "offer_availability"'),
      cc.indexOf("const authHeader")
    );
    expect(probe).not.toContain("founding");
  });

  it("creates no Stripe Checkout Session on the probe path", () => {
    const probe = cc.slice(
      cc.indexOf('action === "offer_availability"'),
      cc.indexOf("const authHeader")
    );
    expect(probe).not.toContain("checkout.sessions.create");
  });

  it("fails SAFE on an unknown answer: only offers that need no config are sellable", () => {
    // The static bundle can ship before create-checkout knows the availability
    // action — that happened on the 2026-09-05 publish, and an "unknown means
    // purchasable" fallback put a live $99.99 button under a price that does
    // not exist. Unknown now falls back to the offers with a server-side price
    // fallback, which is standard_monthly and nothing else.
    expect(clientCheckout).toContain("return OFFERS_SELLABLE_WITHOUT_CONFIG.includes(offerId);");
    const offersMod = readFileSync(join(SRC, "lib/pro/offers.ts"), "utf8");
    expect(offersMod).toMatch(
      /OFFERS_SELLABLE_WITHOUT_CONFIG: readonly MogzyOfferId\[\] = \[\s*"standard_monthly",\s*\]/
    );
  });

  it("keeps that fallback list honest: only standard_monthly has an in-code price", () => {
    // The server catalog is the reason the list is what it is.
    expect(offerCatalog).toContain('env("STRIPE_PRICE_STANDARD_MONTHLY", LIVE_STANDARD_MONTHLY_PRICE_ID)');
    for (const id of ["STANDARD_ANNUAL", "LAUNCH_MONTHLY", "LAUNCH_ANNUAL", "FOUNDING_PLAYTESTER"]) {
      expect(offerCatalog).toContain(`env("STRIPE_PRICE_${id}")`);
    }
  });

  it("falls back to standard pricing, never to the discount, when the probe fails", () => {
    const fn = clientCheckout.slice(clientCheckout.indexOf("export async function fetchOfferAvailability"));
    expect(fn).toContain('data.mode === "launch" ? "launch" : "standard"');
    expect(fn).toContain('return { mode: "standard", available: null };');
  });
});

describe("the Premium sales page states an honest availability", () => {
  it("disables the purchase button for an offer the server cannot sell", () => {
    expect(lolPremium).toContain("disabled={checkingOut || authLoading || !offerPurchasable}");
  });

  it("says which plan is unavailable rather than claiming checkout is closed", () => {
    // With Standard Annual unconfigured and Standard Monthly live, "checkout is
    // coming soon" would be false about monthly. The copy names the interval.
    expect(lolPremium).toContain("billing isn’t available yet");
    expect(lolPremium).toContain("Mogzy Premium checkout isn’t open yet.");
  });

  it("no longer carries the pre-PT1.5 unconditional coming-soon gate", () => {
    expect(lolPremium).not.toContain("Mogzy Premium checkout is coming soon.");
    expect(lolPremium).not.toContain("isLolProCheckoutAvailable");
  });

  it("reads pricing mode from the server answer, never from a local default", () => {
    expect(lolPremium).toContain("const pricingMode: PricingMode = availability.mode;");
  });
});

describe("the Premium rename and the PT1.7 surfaces survive the PT1.5 port", () => {
  it("keeps /lol/premium canonical and /lol/pro redirect-only", () => {
    expect(premiumRoutes).toContain('export const PREMIUM_ROUTE = "/lol/premium"');
    expect(premiumRoutes).toContain('export const LEGACY_PREMIUM_ROUTES = ["/lol/pro", "/pro"]');
  });

  it("sends the buyer back to /lol/premium from Stripe, not to the retired route", () => {
    expect(clientCheckout).toContain('"/lol/premium?success=true"');
    expect(clientCheckout).toContain('"/lol/premium?canceled=true"');
    expect(clientCheckout).not.toContain('"/lol/pro?');
  });

  it("says Premium, not Pro, on every commercial surface PT1.5 rewrote", () => {
    for (const src of [lolPremium, clientCheckout, offerCatalog, migration, createCheckout]) {
      expect(src).not.toMatch(/\bMog[sz]y Pro\b/);
    }
    // The offer labels reach admin tooling and logs; they are user-facing too.
    expect(offerCatalog).toContain('label: "Mogzy Premium — Monthly"');
    expect(offerCatalog).toContain('label: "Mogzy Premium — Annual"');
  });

  it("keeps PT1.7B's truthful capability copy on the sales page", () => {
    // PT1.7A made per-category accuracy free, so PT1.7B rewrote these two
    // bullets. A PT1.5 rebase that restored the old page would re-promise a
    // capability players already have for nothing.
    expect(lolPremium).toContain("Weakness Targeting");
    expect(lolPremium).toContain("Turn your weakest categories into a practice set, on demand.");
    expect(lolPremium).toContain("Custom Practice Filters");
    expect(lolPremium).toContain(
      "Build practice sets by category, subject, difficulty and length — and save them."
    );
    // The old bullet may survive in the comment that explains why it went.
    expect(code(lolPremium)).not.toContain("Advanced Category Stats");
  });

  it("keeps PT1.7A's free baseline visible on the same page", () => {
    expect(lolPremium).toContain("Free, forever");
    expect(lolPremium).toContain("Play quizzes as a guest — no account needed");
  });

  it("leaves the PT1.7B Builder and its own boundary suite in place", () => {
    const builder = readFileSync(
      join(SRC, "components/quiz/builder/PracticeBuilderPanel.tsx"), "utf8"
    );
    // The Builder's Premium CTA points at the canonical route, and PT1.5
    // changed neither its gate nor its copy.
    expect(builder).toContain('href="/lol/premium"');
    expect(readdirSync(join(SRC, "test/security"))).toContain("pt17bBuilderBoundaries.test.ts");
  });

  it("routes no user TO /lol/pro — it is a destination nowhere, only a redirect", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
      );
    // A navigation TARGET, not a mention: `to=`, `href=` and navigate() are how
    // this codebase sends someone somewhere. Ad policy, the sitemap filter and
    // the redirect's own tests legitimately name the legacy URL without
    // pointing anyone at it.
    const target = /(?:\bto=|\bhref=|navigate\(|Navigate to=)\s*\{?\s*"\/lol\/pro"/;
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      if (target.test(readFileSync(file, "utf8"))) offenders.push(file.slice(SRC.length + 1));
    }
    expect(offenders).toEqual([]);
  });
});
