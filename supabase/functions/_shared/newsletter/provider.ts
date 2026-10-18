// EMAIL1 — outbound email provider seam.
//
// WHY A SEAM (evidence, not preference)
//   * The project's Lovable email stack (@lovable.dev/email-js, used by
//     auth-email-hook) documents exactly one send purpose, "transactional",
//     and its unsubscribe handling is scoped to the notify.mogzy.lol sender
//     domain that carries password-reset and signup-confirmation mail. Bulk
//     promotional mail on that domain would put the reputation of the login
//     emails at risk, so it is not used for campaigns.
//   * No marketing provider account or secret exists in this repository. The
//     default provider is therefore "disabled": nothing is ever sent until the
//     owner configures one on purpose.
//   * Resend is implemented because it is a plain HTTPS API (no SDK needed in
//     Deno), accepts custom headers (List-Unsubscribe / -Post), supports an
//     Idempotency-Key, DKIM-signs a dedicated sending domain, and posts signed
//     bounce/complaint webhooks. Swapping providers means writing one more
//     object that satisfies EmailProvider.

export interface OutboundEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  /** Stable per (campaign, recipient) so a retried request cannot double-send. */
  idempotencyKey: string;
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; retryable: boolean; code: string; status?: number };

export interface EmailProvider {
  readonly name: string;
  /** False for the disabled provider: callers refuse before building recipients. */
  readonly canSend: boolean;
  send(msg: OutboundEmail): Promise<SendResult>;
}

export const disabledProvider: EmailProvider = {
  name: "disabled",
  canSend: false,
  send: async () => ({ ok: false, retryable: false, code: "provider_disabled" }),
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createResendProvider(apiKey: string, fetchImpl: FetchLike = fetch): EmailProvider {
  if (!apiKey) throw new Error("resend_api_key_missing");
  return {
    name: "resend",
    canSend: true,
    async send(msg) {
      let res: Response;
      try {
        res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": msg.idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({
            from: msg.from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            ...(msg.replyTo ? { reply_to: [msg.replyTo] } : {}),
            ...(msg.headers ? { headers: msg.headers } : {}),
            ...(msg.tags ? { tags: msg.tags } : {}),
          }),
        });
      } catch {
        return { ok: false, retryable: true, code: "network_error" };
      }
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
        return { ok: true, id: typeof body?.id === "string" ? body.id : null };
      }
      // 429 and 5xx are worth retrying; other 4xx (validation, bad domain,
      // revoked key) will fail identically every time.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, retryable, code: `http_${res.status}`, status: res.status };
    },
  };
}

export interface ProviderEnv {
  get(name: string): string | undefined;
}

/** NEWSLETTER_EMAIL_PROVIDER: "resend" | unset/"disabled". Unknown values fail closed. */
export function selectProvider(env: ProviderEnv, fetchImpl?: FetchLike): EmailProvider {
  const which = (env.get("NEWSLETTER_EMAIL_PROVIDER") ?? "disabled").trim().toLowerCase();
  if (which === "resend") {
    const key = env.get("RESEND_API_KEY");
    return key ? createResendProvider(key, fetchImpl) : disabledProvider;
  }
  return disabledProvider;
}

/** RFC 8058 one-click headers. Both are required together by Gmail/Yahoo bulk-sender rules. */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
