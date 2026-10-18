// EMAIL1 — Deno wiring shared by the four email Edge Functions.
// Only this file and the index.ts files touch Deno or the network.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { loadConfig } from "./config.ts";
import { selectProvider } from "./provider.ts";
import type { Caller, Deps, Reply, RequestMeta } from "./handlers.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function reply(r: Reply): Response {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function buildDeps(): Deps & { service: ReturnType<typeof serviceClient> } {
  const service = serviceClient();
  const env = { get: (n: string) => Deno.env.get(n) };
  return { db: service, provider: selectProvider(env), cfg: loadConfig(env), service };
}

export function requestMeta(req: Request): RequestMeta {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip");
  return { ip: fwd || null, userAgent: req.headers.get("user-agent") };
}

/** Verify the bearer JWT with the auth server and describe the account. */
export async function authenticate(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await asCaller.auth.getUser();
  const u = data?.user;
  if (error || !u) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    isAnonymous: u.is_anonymous === true,
    metadata: (u.user_metadata ?? {}) as Record<string, unknown>,
  };
}
