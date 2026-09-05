import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PT1.5B — the reachable billing-portal entry point.
 *
 * Before this, `customer-portal` had exactly one caller, `src/pages/Shop.tsx`,
 * and `/shop` is unreachable under LEAGUE_ONLY_MODE — so a subscriber had no
 * way to manage or cancel from anywhere in the app.
 *
 * These are contract tests over the shape of authority. No Stripe test account
 * is wired up here and no genuine paid subscriber exists to smoke against, so
 * live portal creation is deliberately NOT claimed.
 */
const SRC = join(process.cwd(), "src");
const FUNCTIONS = join(process.cwd(), "supabase/functions");

const portalFn = readFileSync(join(FUNCTIONS, "customer-portal/index.ts"), "utf8");
const clientCheckout = readFileSync(join(SRC, "lib/pro/checkout.ts"), "utf8");
const lolPremium = readFileSync(join(SRC, "pages/LolPremium.tsx"), "utf8");
const entitlement = readFileSync(join(SRC, "lib/pro/entitlement.ts"), "utf8");

/** Strip comments so an assertion matches executable code, not prose. */
const code = (src: string) =>
  src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("customer-portal — authority is server-side and unchanged", () => {
  it("stays authenticated: no Authorization header is a hard failure", () => {
    expect(portalFn).toContain('const authHeader = req.headers.get("Authorization")');
    expect(portalFn).toContain('if (!authHeader) throw new Error("No authorization header")');
    expect(portalFn).toContain("if (!user?.email) throw new Error");
  });

  it("derives the Stripe customer from the authenticated user's own email", () => {
    expect(code(portalFn)).toContain("stripe.customers.list({ email: user.email, limit: 1 })");
    expect(code(portalFn)).toContain("customer: customers.data[0].id");
  });

  it("accepts NO customer id, price id or any other identifier from the client", () => {
    // The function never parses a request body at all, so there is no field a
    // caller could use to name another account's Stripe customer.
    expect(code(portalFn)).not.toContain("req.json()");
    expect(code(portalFn)).not.toMatch(/body\.|customerId|customer_id/);
  });

  it("exposes no admin authority", () => {
    // The service-role client exists only to validate the caller's own token.
    expect(code(portalFn)).not.toMatch(/has_role|is_admin|admin_/);
  });

  it("answers the comped account plainly instead of failing", () => {
    expect(portalFn).toContain('code: "NO_STRIPE_CUSTOMER"');
    // 200-with-a-code, because supabase-js collapses non-2xx into a generic
    // error and a comped account is not an error.
    expect(portalFn).toMatch(/NO_STRIPE_CUSTOMER[\s\S]{0,200}status: 200/);
  });

  it("returns the buyer to /lol/premium, not the unreachable /shop", () => {
    expect(code(portalFn)).toContain("return_url: `${origin}/lol/premium`");
    expect(code(portalFn)).not.toContain("return_url: `${origin}/shop`");
  });

  it("keeps the return-origin allowlist", () => {
    expect(portalFn).toContain('allowedOrigins.includes(requestOrigin)');
    expect(portalFn).toContain('"https://mogzy.lol"');
  });
});

describe("the client sends nothing and cannot forge a portal", () => {
  it("invokes customer-portal with no body", () => {
    expect(clientCheckout).toContain(
      'const { data, error } = await supabase.functions.invoke("customer-portal");'
    );
  });

  it("treats NO_STRIPE_CUSTOMER as a plain message, never as a portal", () => {
    const fn = clientCheckout.slice(clientCheckout.indexOf("export async function openBillingPortal"));
    expect(fn).toContain('data?.code === "NO_STRIPE_CUSTOMER"');
    expect(fn).toContain('if (!data?.url) throw new Error');
  });
});

describe("/lol/premium offers the right action for the right entitlement source", () => {
  it("offers Manage billing ONLY when the account is billed through Stripe", () => {
    expect(lolPremium).toContain("{provenance?.stripePro && (");
    expect(lolPremium).toContain('data-testid="premium-manage-billing"');
    // The button lives inside that branch, so a grant-only member never sees it.
    const stripeBranch = lolPremium.slice(
      lolPremium.indexOf("{provenance?.stripePro && ("),
      lolPremium.indexOf("{provenance && !provenance.stripePro")
    );
    expect(stripeBranch).toContain('data-testid="premium-manage-billing"');
  });

  it("tells a comped member the truth and offers no billing action", () => {
    const grantBranch = lolPremium.slice(
      lolPremium.indexOf("{provenance && !provenance.stripePro"),
      lolPremium.indexOf("        ) : (")
    );
    expect(grantBranch).toContain("Complimentary Premium");
    expect(grantBranch).toContain("nothing to manage");
    expect(grantBranch).not.toContain("premium-manage-billing");
    expect(grantBranch).not.toContain("openBillingPortal");
    expect(grantBranch).not.toContain("handleManageBilling");
  });

  it("renders neither action while provenance is unresolved", () => {
    // `provenance` starts null and both branches require a non-null value, so
    // an unresolved read shows no action rather than the wrong one.
    expect(lolPremium).toContain("const [provenance, setProvenance] = useState<ProEntitlement | null>(null);");
    expect(lolPremium).toContain("{provenance && !provenance.stripePro && provenance.grantKind && (");
  });

  it("shows the membership area only to an effective-Premium caller", () => {
    // The whole block is the `isPremium ?` arm; a Free user gets the purchase
    // arm, so client state cannot reveal a portal action to a non-member — and
    // the function would refuse them anyway, having no Stripe customer.
    expect(lolPremium).toContain('data-testid="premium-membership"');
    const before = lolPremium.slice(0, lolPremium.indexOf('data-testid="premium-membership"'));
    expect(before.lastIndexOf("{isPremium ? (")).toBeGreaterThan(-1);
  });

  it("resolves provenance from the self-scoped PT1.4 RPC, never a raw column read", () => {
    expect(lolPremium).toContain("fetchProEntitlement().then((e) => { if (!cancelled) setProvenance(e); });");
    expect(entitlement).toContain('rpc("my_pro_entitlement")');
  });

  it("does not fetch provenance for a Free user", () => {
    expect(lolPremium).toContain("if (!isPremium) { setProvenance(null); return; }");
  });
});

describe("no regression to entitlement, purchase states or the Builder", () => {
  it("leaves PT1.4 composition as the entitlement authority", () => {
    // The portal decides an ACTION, never access. `stripePro` is provenance.
    expect(entitlement).toContain("effective_pro = stripe_pro OR valid_manual_grant");
    expect(code(lolPremium)).not.toMatch(/setIsPremium\(\s*!!?\s*\w+\.stripePro/);
  });

  it("keeps the purchase arm and its availability states intact", () => {
    expect(lolPremium).toContain("disabled={checkingOut || authLoading || !offerPurchasable}");
    expect(lolPremium).toContain("billing isn’t available yet");
  });

  it("changes nothing about the PT1.7B Builder", () => {
    const builder = readFileSync(
      join(SRC, "components/quiz/builder/PracticeBuilderPanel.tsx"), "utf8"
    );
    expect(builder).toContain('href="/lol/premium"');
    expect(builder).not.toContain("customer-portal");
    expect(builder).not.toContain("openBillingPortal");
  });
});
