// EMAIL1 — signed-in subscription actions: request, set_topics, unsubscribe,
// consume_signup_intent. The address is ALWAYS the account's own email as the
// auth server reports it; the client never supplies one.
import {
  authenticate, buildDeps, corsHeaders, reply, requestMeta,
} from "../_shared/newsletter/http.ts";
import {
  SIGNUP_INTENT_KEY, consumeSignupIntent, requestSubscription, setTopics, unsubscribeSelf,
} from "../_shared/newsletter/handlers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ status: 405, body: { error: "method_not_allowed" } });
  try {
    const caller = await authenticate(req);
    if (!caller) return reply({ status: 401, body: { error: "unauthorized" } });
    const body = (await req.json().catch(() => null)) as { action?: unknown; topics?: unknown } | null;
    const deps = buildDeps();
    const meta = requestMeta(req);
    switch (body?.action) {
      case "request":
        return reply(await requestSubscription(deps, caller, body.topics, "settings", meta));
      case "set_topics":
        return reply(await setTopics(deps, caller, body.topics, meta));
      case "unsubscribe":
        return reply(await unsubscribeSelf(deps, caller, meta));
      case "consume_signup_intent":
        return reply(await consumeSignupIntent(deps, caller, meta, async (userId, metadata) => {
          const next = { ...metadata, [SIGNUP_INTENT_KEY]: null };
          await deps.service.auth.admin.updateUserById(userId, { user_metadata: next });
        }));
      default:
        return reply({ status: 400, body: { error: "unknown_action" } });
    }
  } catch (e) {
    console.error("email-subscription error", e instanceof Error ? e.message : "unknown");
    return reply({ status: 500, body: { error: "internal_error" } });
  }
});
