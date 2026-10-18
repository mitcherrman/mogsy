// @vitest-environment node
/**
 * EMAIL1 — structural guards: the properties that must keep holding as the code
 * around them changes. Each reads source or runs a pure function; none needs a
 * network, a browser or a database.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as edgeTopics from "../../../supabase/functions/_shared/newsletter/topics";
import * as webTopics from "../../lib/email/topics";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
// Comments may legitimately explain WHY Lovable is not used; code may not use it.
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

describe("consent wording: the browser and the audit trail agree", () => {
  it("topics, labels, version and wording are identical", () => {
    expect([...webTopics.EMAIL_TOPICS]).toEqual([...edgeTopics.EMAIL_TOPICS]);
    expect(webTopics.EMAIL_TOPIC_LABELS).toEqual(edgeTopics.EMAIL_TOPIC_LABELS);
    expect(webTopics.CONSENT_VERSION).toBe(edgeTopics.CONSENT_VERSION);
    expect(webTopics.CONSENT_TEXT).toEqual(edgeTopics.CONSENT_TEXT[edgeTopics.CONSENT_VERSION]);
    expect(webTopics.SIGNUP_TOPIC_GROUPS).toEqual(edgeTopics.SIGNUP_TOPIC_GROUPS);
  });
});

describe("migration is STAGED, never auto-applied", () => {
  it("lives outside the directories a deploy applies", () => {
    for (const dir of ["supabase/migrations", "drizzle/migrations"]) {
      const hits = readdirSync(join(root, dir)).filter((f) => /email1|newsletter|email_subscri/i.test(f));
      expect(hits, dir).toEqual([]);
    }
    expect(statSync(join(root, "supabase/email1-staged/migrations/01_email1_subscriptions.sql")).isFile()).toBe(true);
  });
});

describe("Edge Functions authenticate themselves (verify_jwt = false is deliberate)", () => {
  const config = read("supabase/config.toml");
  for (const fn of ["email-subscription", "email-link", "email-provider-webhook", "newsletter-admin"]) {
    it(`${fn} is declared, and its own gate is present`, () => {
      expect(config).toMatch(new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt = false`));
    });
  }

  it("email-subscription rejects an unauthenticated caller before doing anything", () => {
    const src = read("supabase/functions/email-subscription/index.ts");
    expect(src.indexOf("authenticate(req)")).toBeGreaterThan(-1);
    expect(src.indexOf("authenticate(req)")).toBeLessThan(src.indexOf("switch (body?.action)"));
    expect(src).toMatch(/if \(!caller\) return reply\(\{ status: 401/);
  });

  it("newsletter-admin resolves the canonical owner before any dispatch, and every action has a level", () => {
    const src = read("supabase/functions/newsletter-admin/index.ts");
    expect(src.indexOf("requireOwner(req, level)")).toBeGreaterThan(-1);
    expect(src.indexOf("requireOwner(req, level)")).toBeLessThan(src.indexOf("switch (action)"));
    const actions = [...src.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]).sort();
    const levels = [...src.matchAll(/^\s+([a-z_]+): "(trusted|aal2|fresh_aal2)"/gm)].map((m) => m[1]).sort();
    expect(actions).toEqual(levels);
    expect(src).toMatch(/send_start: "fresh_aal2"/);
  });

  it("the provider webhook verifies the signature over the RAW body before parsing", () => {
    const src = read("supabase/functions/email-provider-webhook/index.ts");
    expect(src.indexOf("verifySvixSignature")).toBeLessThan(src.indexOf("JSON.parse"));
    expect(src).toMatch(/status: 401/);
    expect(src).toMatch(/status: 503/); // no secret configured => refuse, not accept
  });

  it("email-link never changes state on a GET", () => {
    const src = read("supabase/functions/email-link/index.ts");
    const get = src.slice(src.indexOf('if (req.method === "GET")'), src.indexOf('if (req.method !== "POST")'));
    expect(get).toContain("status: 303");
    expect(get).not.toMatch(/confirmWithToken|unsubscribeWithToken|rpc\(/);
  });

  it("one-click unsubscribe requires the RFC 8058 form body", () => {
    expect(read("supabase/functions/email-link/index.ts")).toContain("List-Unsubscribe=One-Click");
  });
});

describe("secrets and the transactional email stack", () => {
  const secrets = ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "NEWSLETTER_TOKEN_SECRET", "SERVICE_ROLE", "service_role"];
  const clientFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !f.startsWith("src/test/"));

  it("no browser module reads a server secret or the service-role key (naming one in help text is fine)", () => {
    const offenders = clientFiles.flatMap((f) => {
      const src = read(f);
      const reads = secrets.filter((s) => new RegExp(String.raw`(Deno\.env|process\.env|import\.meta\.env)[^\n;]*` + s).test(src));
      const roleKey = /service_role|SERVICE_ROLE/.test(src) ? ["service role"] : [];
      return [...reads, ...roleKey].map((s) => `${f}: ${s}`);
    });
    expect(offenders).toEqual([]);
  });

  it("marketing mail never touches the Lovable auth/transactional email stack", () => {
    for (const f of walk("supabase/functions/_shared/newsletter")) {
      expect(code(f), f).not.toMatch(/lovable\.dev|auth-email-hook|createAuthEmailHandler|sendLovableEmail/);
    }
    for (const fn of ["email-subscription", "email-link", "email-provider-webhook", "newsletter-admin"]) {
      expect(code(`supabase/functions/${fn}/index.ts`), fn).not.toMatch(/lovable\.dev|auth-email-hook/);
    }
    expect(read("supabase/functions/auth-email-hook/index.ts")).not.toMatch(/newsletter/i);
  });

  it("the migration and the signup trigger path are not coupled", () => {
    const sql = read("supabase/email1-staged/migrations/01_email1_subscriptions.sql").replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/handle_new_user/);
    expect(sql).not.toMatch(/ON\s+auth\.users\s+FOR\s+EACH/i);
  });

  it("the sending kill-switch is documented as OFF in .env.example", () => {
    const env = read(".env.example");
    expect(env).toMatch(/VITE_EMAIL_SUBSCRIPTIONS_ENABLED=false/);
    expect(env).toMatch(/NEWSLETTER_SENDING_ENABLED/);
  });
});

describe("the browser client never sends an email address", () => {
  it("every call carries only an action (and topics)", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { result: "ok" }, error: null });
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from: vi.fn() } }));
    const client = await import("../../lib/email/subscription-client");
    await client.requestEmailSubscription(["events"]);
    await client.setEmailTopics(["events"]);
    await client.unsubscribeSelf();
    await client.consumeSignupIntent();
    const bodies = invoke.mock.calls.map((c) => c[1].body);
    expect(bodies.map((b) => Object.keys(b).sort())).toEqual([["action", "topics"], ["action", "topics"], ["action"], ["action"]]);
    expect(JSON.stringify(bodies)).not.toMatch(/@/);
    vi.doUnmock("@/integrations/supabase/client");
  });
});
