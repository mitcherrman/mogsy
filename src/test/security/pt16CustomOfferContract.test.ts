import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PT1.6b — static contracts over the custom one-time offer that no runtime test
 * can reach (Deno entry points, deploy config, migration bookkeeping). The SQL
 * and the handlers themselves are exercised in pt16CustomOfferSql / Flow.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const code = (src: string) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sqlCode = (src: string) => src.replace(/--[^\n]*/g, "");

const entry = read("supabase/functions/custom-offer-checkout/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const createCheckout = read("supabase/functions/create-checkout/index.ts");
const giftCatalog = read("supabase/functions/_shared/gift-catalog.ts");
const client = read("src/lib/pro/customOffer.ts");
const m0003 = read("drizzle/migrations/0003_pt1_6b_custom_offer_completion.sql");
const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
const config = read("supabase/config.toml");

describe("the browser cannot choose what it pays", () => {
  it("the edge entry point reads only action and token from the body", () => {
    const fields = [...code(entry).matchAll(/body\?\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(["action", "token"]);
  });

  it("the client sends only action and token", () => {
    const bodies = [...code(client).matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    expect(bodies).toEqual(['action: "status", token', 'action: "checkout", token']);
    // ...and those are its only calls into the offer's edge function.
    expect(code(client).match(/functions\.invoke\(/g)).toHaveLength(2);
  });

  it("the checkout handler never reads a request field other than action, token, user and origin", () => {
    const handler = code(read("supabase/functions/_shared/custom-offer-checkout.ts"));
    const fields = [...handler.matchAll(/\breq\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(["action", "origin", "token", "user"]);
  });
});

describe("existing subscriptions and gifting are preserved", () => {
  it("create-checkout does not know the custom offer, and its one-time allowlist cannot sell it", () => {
    expect(createCheckout).not.toMatch(/custom_one_time|CUSTOM_OFFER|custom-offer/);
    expect(giftCatalog).not.toMatch(/CUSTOM_ONE_TIME/);
  });

  it("stripe-webhook routes custom-offer sessions BEFORE the gift and subscription checks, which are unchanged", () => {
    const body = code(webhook);
    const completed = body.indexOf('case "checkout.session.completed"');
    const custom = body.indexOf("isCustomOfferSession(session)", completed);
    const gift = body.indexOf("if (session.metadata?.gift_id) {", completed);
    const subOnly = body.indexOf('if (session.mode !== "subscription") break;', completed);
    expect(completed).toBeGreaterThan(-1);
    expect(custom).toBeGreaterThan(completed);
    expect(gift).toBeGreaterThan(custom);
    expect(subOnly).toBeGreaterThan(gift);
    // PT1.7: gift sessions are verified (never granted) by the gift handler, then break.
    expect(body.slice(gift, subOnly)).toContain("await handleGiftEvent(event, giftDeps);");
    expect(body).toContain("await syncProStatus(supabase, userId, true);");
    expect(body).toContain('case "customer.subscription.deleted":');
  });

  it("the webhook never writes is_pro or a grant for the custom offer itself (SQL does, once)", () => {
    const branch = read("supabase/functions/_shared/custom-offer-webhook.ts");
    expect(code(branch)).not.toMatch(/is_pro|pro_grant_|\.from\(/);
  });
});

describe("migration 0003 bookkeeping and hygiene", () => {
  it("is journaled after 0002, which is left as applied", () => {
    const tags: string[] = journal.entries.map((e: { tag: string }) => e.tag);
    const i = tags.indexOf("0003_pt1_6b_custom_offer_completion");
    expect(tags[i - 1]).toBe("0002_pt1_6_custom_offer_one_time");
    expect(journal.entries[i].when).toBeGreaterThan(journal.entries[i - 1].when);
  });

  it("writes no admin_audit_log row (its actor column is NOT NULL — defect D1)", () => {
    expect(sqlCode(m0003)).not.toMatch(/admin_audit_log/);
  });

  it("every function pins an empty search_path", () => {
    const fns = sqlCode(m0003).split(/CREATE OR REPLACE FUNCTION/).slice(1);
    expect(fns.length).toBeGreaterThanOrEqual(13);
    for (const fn of fns) expect(fn.slice(0, fn.indexOf("AS $function$"))).toContain("SET search_path = ''");
  });

  it("minting a claim needs fresh MFA, like admin_set_pro_grant", () => {
    const mint = m0003.slice(m0003.indexOf("FUNCTION public.owner_create_custom_offer_claim"));
    expect(mint.slice(0, mint.indexOf("$function$;"))).toContain("PERFORM public.assert_owner('fresh_aal2');");
  });

  it("the edge function is declared so a repo-driven deploy reproduces it", () => {
    expect(config).toMatch(/\[functions\.custom-offer-checkout\]\n\s+verify_jwt = false/);
  });
});
