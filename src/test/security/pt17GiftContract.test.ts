import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PT1.7 — static contracts the runtime suites cannot reach: Deno entry points,
 * deploy config, migration bookkeeping, and the browser's request shapes.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const code = (src: string) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sqlCode = (src: string) => src.replace(/--[^\n]*/g, "");

const entry = read("supabase/functions/gift-checkout/index.ts");
const redeemEntry = read("supabase/functions/redeem-gift/index.ts");
const verifyEntry = read("supabase/functions/verify-gift/index.ts");
const webhook = code(read("supabase/functions/stripe-webhook/index.ts"));
const createCheckout = read("supabase/functions/create-checkout/index.ts");
const client = code(read("src/lib/pro/gift.ts"));
const m0004 = read("drizzle/migrations/0004_pt1_7_annual_gift.sql");
const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
const config = read("supabase/config.toml");

describe("the browser cannot choose what it pays or what it gets", () => {
  it("gift-checkout reads only action, recipient_email, message and gift_id", () => {
    const fields = [...code(entry).matchAll(/body\?\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(["action", "gift_id", "message", "recipient_email"]);
  });

  it("redeem-gift reads only action and code", () => {
    const fields = [...code(redeemEntry).matchAll(/body\?\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(["action", "code"]);
  });

  it("the client's request bodies carry no price, amount, quantity or duration", () => {
    const bodies = [...client.matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    expect(bodies).toEqual([
      'action: "availability"',
      'action: "checkout", recipient_email: recipientEmail, message',
      'action: "status", gift_id: giftId',
      'action: "list"',
      'action: "redeem", code: code.trim()',
    ]);
  });
});

describe("payment truth comes from Stripe, never from a redirect", () => {
  it("verify-gift no longer sets status from payment_status alone", () => {
    expect(code(verifyEntry)).not.toMatch(/status:\s*"paid"/);
    expect(code(verifyEntry)).toContain("reconcileGiftPayment(");
  });

  it("the webhook verifies gift sessions instead of skipping them, before the subscription branch", () => {
    const completed = webhook.indexOf('case "checkout.session.completed"');
    const gift = webhook.indexOf("if (session.metadata?.gift_id) {", completed);
    const subOnly = webhook.indexOf('if (session.mode !== "subscription") break;', completed);
    expect(gift).toBeGreaterThan(completed);
    expect(subOnly).toBeGreaterThan(gift);
    expect(webhook).not.toContain("if (session.metadata?.gift_id) break;");
    for (const t of ["charge.refunded", "charge.dispute.created", "charge.dispute.closed", "checkout.session.expired"]) {
      expect(webhook).toContain(`case "${t}":`);
    }
    expect(webhook).toContain("constructEventAsync");
  });

  it("create-checkout's subscription and catalog-gift paths are untouched by PT1.7", () => {
    expect(createCheckout).not.toMatch(/private_offer|PRIVATE_ANNUAL_GIFT|first_customer_annual_gift/);
    expect(createCheckout).toContain("resolveGiftByPriceId(priceId)");
  });
});

describe("migration 0004 hygiene", () => {
  it("is journaled after 0003", () => {
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.slice(-2)).toEqual(["0003_pt1_6b_custom_offer_completion", "0004_pt1_7_annual_gift"]);
  });

  it("every function pins an empty search_path and none is granted to a browser role", () => {
    const fns = sqlCode(m0004).split(/CREATE OR REPLACE FUNCTION/).slice(1);
    expect(fns.length).toBe(7);
    for (const fn of fns) expect(fn.slice(0, fn.indexOf("AS $function$"))).toContain("SET search_path = ''");
    expect(sqlCode(m0004)).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*\b(anon|authenticated)\b/);
  });

  it("retires the non-atomic claim and writes no admin_audit_log row", () => {
    expect(m0004).toContain("DROP FUNCTION IF EXISTS public.redeem_gift_code(text);");
    expect(sqlCode(m0004)).not.toMatch(/admin_audit_log/);
  });

  it("declares the new edge function for repo-driven deploys", () => {
    expect(config).toMatch(/\[functions\.gift-checkout\]\n\s+verify_jwt = false/);
  });

  it("drops Lovable's hard-coded recipient and CA-tax flags in favour of TAX_MODE and a buyer allowlist", () => {
    const shared = read("supabase/functions/_shared/private-annual-gift.ts");
    expect(code(shared)).not.toMatch(/PRIVATE_ANNUAL_GIFT_RECIPIENT_EMAIL|PRIVATE_ANNUAL_GIFT_CA_TAX_APPROVED/);
    expect(shared).toContain("PRIVATE_ANNUAL_GIFT_TAX_MODE");
    expect(shared).toContain("PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS");
  });
});
