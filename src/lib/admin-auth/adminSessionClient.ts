// ---------------------------------------------------------------------------
// Typed client for GET /api/admin/session.
//
// Uses the shared admin credential helper (bearer by default, key only in
// explicit fallback). Fails CLOSED: only a 2xx body with `authorized === true`
// and a recognized shape yields "authorized". 403 → forbidden, network/5xx →
// unavailable (distinct from non-admin), any other 2xx → malformed. Never
// throws for auth outcomes; never logs a credential.
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "./adminCredentials";
import type { AdminAuthMethod, AdminSessionOutcome } from "./types";

const SESSION_PATH = "/api/admin/session";
const VALID_METHODS: readonly AdminAuthMethod[] = ["supabase_user", "admin_key"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAuthorized(body: unknown): AdminSessionOutcome {
  if (!isRecord(body)) return { kind: "malformed" };
  if (body.authorized !== true) return { kind: "malformed" };
  const method = body.auth_method;
  if (typeof method !== "string" || !VALID_METHODS.includes(method as AdminAuthMethod)) {
    return { kind: "malformed" };
  }
  const userId = body.user_id;
  const email = body.email;
  if (userId != null && typeof userId !== "string") return { kind: "malformed" };
  if (email != null && typeof email !== "string") return { kind: "malformed" };
  return {
    kind: "authorized",
    principal: {
      authMethod: method as AdminAuthMethod,
      userId: (userId as string | null) ?? null,
      email: (email as string | null) ?? null,
    },
  };
}

export async function fetchAdminSession(signal?: AbortSignal): Promise<AdminSessionOutcome> {
  const url = `${ADMIN_API_BASE_URL}${SESSION_PATH}`;
  const headers = await buildAdminHeaders(url);

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return { kind: "unavailable" }; // backend unreachable — NOT non-admin
  }

  if (res.status === 403) return { kind: "forbidden" };
  if (!res.ok) return { kind: "unavailable" }; // 5xx etc.

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "malformed" };
  }
  return parseAuthorized(body);
}
