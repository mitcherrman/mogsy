// EMAIL1 — provider bounce / complaint webhook (Resend, Svix-signed).
// Signature is verified over the RAW body before anything is parsed or stored.
import { serviceClient } from "../_shared/newsletter/http.ts";
import { suppressionFromEvent, verifySvixSignature } from "../_shared/newsletter/webhook.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  const id = req.headers.get("svix-id");
  const valid = await verifySvixSignature(secret, raw, {
    id, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
  });
  if (!valid) return new Response("invalid signature", { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const s = suppressionFromEvent(id, payload);
  if (!s) return new Response("ignored", { status: 200 });

  const { error } = await serviceClient().rpc("email_apply_suppression", {
    _email: s.email, _reason: s.reason, _source: "provider_webhook", _provider_event_id: s.eventId,
  });
  // 500 makes the provider retry; apply is idempotent on the event id.
  if (error) {
    console.error("email-provider-webhook rpc failed");
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
