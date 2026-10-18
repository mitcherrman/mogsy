// EMAIL1 — owner-only newsletter operations that need server secrets:
// preview, test-send to the owner's own address, and the batched real send.
// Campaign CRUD and approval are owner-gated SQL RPCs called from the browser
// (admin_newsletter_*); this function adds only what the browser cannot do.
//
// Gate: requireOwner (OWN1) — canonical owner id, aal2 / trusted device, and
// FRESH aal2 to start a send. Every action writes admin_audit_log.
import { requireOwner, auditOwnerAction } from "../_shared/owner.ts";
import type { OwnerLevel } from "../_shared/owner-decision.ts";
import { buildDeps, corsHeaders, reply } from "../_shared/newsletter/http.ts";
import { sendBlocker } from "../_shared/newsletter/config.ts";
import { isUuid } from "../_shared/newsletter/tokens.ts";
import { parsePreview, processBatch, renderPreview, startSend, testSend } from "../_shared/newsletter/send.ts";

const LEVEL: Record<string, OwnerLevel> = {
  config_status: "trusted",
  preview: "trusted",
  test_send: "trusted",
  send_start: "fresh_aal2",
  send_continue: "trusted", // the send was already started under fresh MFA; this only drains the queue
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ status: 405, body: { error: "method_not_allowed" } });
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";
    const level = LEVEL[action];
    if (!level) return reply({ status: 400, body: { error: "unknown_action" } });

    const { decision, ctx } = await requireOwner(req, level);
    if (!decision.ok || !ctx) {
      return reply({ status: decision.ok ? 401 : decision.status, body: { error: decision.ok ? "unauthorized" : decision.code } });
    }
    const deps = buildDeps();

    switch (action) {
      case "config_status": {
        // Booleans only — never a secret, address or key.
        const blocker = sendBlocker(deps.cfg, deps.provider.canSend);
        return reply({ status: 200, body: {
          provider: deps.provider.name,
          provider_ready: deps.provider.canSend,
          sending_enabled: deps.cfg.sendingEnabled,
          send_blocker: blocker,
          postal_address_set: !!deps.cfg.postalAddress,
          from_set: !!deps.cfg.from,
        } });
      }
      case "preview": {
        const p = parsePreview({ subject: body?.subject, preheader: body?.preheader, body_markdown: body?.body_markdown, topic: body?.topic });
        if (!p.ok) return reply({ status: 400, body: { error: p.error } });
        const msg = renderPreview(deps.cfg, { subject: p.subject, preheader: p.preheader, body_markdown: p.body, topic: p.topic });
        return reply({ status: 200, body: { html: msg.html, text: msg.text } });
      }
      case "test_send": {
        const owner = await ctx.service.auth.admin.getUserById(ctx.userId);
        const r = await testSend(deps, body?.campaign_id, owner.data?.user?.email ?? null);
        await auditOwnerAction(ctx, "newsletter_test_send", r.status === 200 ? "ok" : "failed", { campaign_id: String(body?.campaign_id ?? "") });
        return reply(r);
      }
      case "send_start": {
        const r = await startSend(deps, body?.campaign_id, body?.expected_count, body?.confirm);
        await auditOwnerAction(ctx, "newsletter_send_start", r.status === 200 ? "ok" : String(r.body.error ?? "failed"), {
          campaign_id: String(body?.campaign_id ?? ""), expected_count: body?.expected_count ?? null,
        });
        return reply(r);
      }
      case "send_continue": {
        if (!isUuid(body?.campaign_id)) return reply({ status: 400, body: { error: "invalid_campaign" } });
        const r = await processBatch(deps, body.campaign_id as string);
        return reply(r);
      }
    }
    return reply({ status: 400, body: { error: "unknown_action" } });
  } catch (e) {
    console.error("newsletter-admin error", e instanceof Error ? e.message : "unknown");
    return reply({ status: 500, body: { error: "internal_error" } });
  }
});
