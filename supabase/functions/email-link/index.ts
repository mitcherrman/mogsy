// EMAIL1 — token-authorised actions reached from an email, with no login:
//   POST {action:"confirm", token}               double opt-in confirmation
//   POST {action:"unsubscribe_preview", token}   what the unsubscribe page shows
//   POST {action:"unsubscribe", token}           the page's button
//   POST ?a=unsubscribe&t=<token>                RFC 8058 one-click (mail client)
//   GET  ?a=unsubscribe&t=<token>                redirect to the human page; NEVER acts
//
// A GET never changes state: link scanners and prefetchers follow every URL in a
// message, and they must not be able to subscribe or unsubscribe anyone.
import { buildDeps, corsHeaders, reply, requestMeta } from "../_shared/newsletter/http.ts";
import { confirmWithToken, previewUnsubscribe, unsubscribeWithToken } from "../_shared/newsletter/handlers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const deps = buildDeps();
    const meta = requestMeta(req);

    if (req.method === "GET") {
      const t = url.searchParams.get("t") ?? "";
      const target = `${deps.cfg.siteUrl}/email/unsubscribe${t ? `?t=${encodeURIComponent(t)}` : ""}`;
      return new Response(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store" } });
    }
    if (req.method !== "POST") return reply({ status: 405, body: { error: "method_not_allowed" } });

    // One-click: the token is in the query string, the body is form-encoded.
    if (url.searchParams.get("a") === "unsubscribe") {
      const form = await req.text().catch(() => "");
      if (!/(^|&)List-Unsubscribe=One-Click(&|$)/.test(form)) return reply({ status: 400, body: { error: "not_one_click" } });
      return reply(await unsubscribeWithToken(deps, url.searchParams.get("t"), "one_click", meta));
    }

    const body = (await req.json().catch(() => null)) as { action?: unknown; token?: unknown } | null;
    switch (body?.action) {
      case "confirm":
        return reply(await confirmWithToken(deps, body.token, meta));
      case "unsubscribe_preview":
        return reply(await previewUnsubscribe(deps, body.token));
      case "unsubscribe":
        return reply(await unsubscribeWithToken(deps, body.token, "unsubscribe_link", meta));
      default:
        return reply({ status: 400, body: { error: "unknown_action" } });
    }
  } catch (e) {
    console.error("email-link error", e instanceof Error ? e.message : "unknown");
    return reply({ status: 500, body: { error: "internal_error" } });
  }
});
