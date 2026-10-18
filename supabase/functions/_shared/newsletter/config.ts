// EMAIL1 — configuration, read once per request from the Edge Function env.
// Nothing here has a working default for a secret: an unset secret makes the
// dependent feature refuse, never fall back.

import type { ProviderEnv } from "./provider.ts";

export interface NewsletterConfig {
  /** HMAC key for unsubscribe tokens and IP pseudonyms. >= 32 chars. */
  tokenSecret: string | null;
  /** Public site origin used in emailed links (no trailing slash). */
  siteUrl: string;
  /** Supabase functions origin for the RFC 8058 one-click URL. */
  functionsUrl: string | null;
  /** RFC 5322 From, on a dedicated sending domain. Required to send anything. */
  from: string | null;
  replyTo: string | null;
  /** Physical mailing address printed in every campaign (CAN-SPAM). */
  postalAddress: string | null;
  /** Kill-switch for CAMPAIGN sends to real subscribers. Ships OFF. */
  sendingEnabled: boolean;
  siteName: string;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export function loadConfig(env: ProviderEnv): NewsletterConfig {
  const supabaseUrl = clean(env.get("SUPABASE_URL"));
  return {
    tokenSecret: clean(env.get("NEWSLETTER_TOKEN_SECRET")),
    siteUrl: (clean(env.get("NEWSLETTER_SITE_URL")) ?? "https://mogzy.lol").replace(/\/+$/, ""),
    functionsUrl: supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1` : null,
    from: clean(env.get("NEWSLETTER_FROM")),
    replyTo: clean(env.get("NEWSLETTER_REPLY_TO")),
    postalAddress: clean(env.get("NEWSLETTER_POSTAL_ADDRESS")),
    // Strictly the string "true". "1", "yes", "TRUE " and a typo all mean off.
    sendingEnabled: env.get("NEWSLETTER_SENDING_ENABLED") === "true",
    siteName: "Mogzy",
  };
}

/** Why a real campaign send cannot proceed, or null when every prerequisite is met. */
export function sendBlocker(cfg: NewsletterConfig, providerCanSend: boolean): string | null {
  if (!cfg.sendingEnabled) return "sending_disabled";
  if (!providerCanSend) return "provider_not_configured";
  if (!cfg.tokenSecret || cfg.tokenSecret.length < 32) return "token_secret_missing";
  if (!cfg.from) return "from_address_missing";
  if (!cfg.postalAddress) return "postal_address_missing";
  if (!cfg.functionsUrl) return "functions_url_missing";
  return null;
}
