/** RC4 account-only Role Challenge transport. No anonymous identity minting. */
import { getExistingBackendAuthToken } from "@/lib/backend-auth";
import { RANKED_API_BASE } from "@/lib/ranked-public/client";
import { readQueueStatus, type QueueStatusView } from "@/lib/ranked-public/contracts";
import {
  readRoleChallengeCatalog, readRoleChallengeStatus, readRoleChallengeStart,
  type RoleChallengeCatalog, type RoleChallengeRole, type RoleChallengeStart,
  type RoleChallengeStatus,
} from "./contracts";

export class RoleChallengeApiError extends Error {
  constructor(
    public kind: "account_required" | "backend" | "network" | "aborted" | "invalid_response",
    public status: number,
    message: string,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "RoleChallengeApiError";
  }
}
async function request(path: string, method: "GET" | "POST", signal?: AbortSignal,
                       body?: object, publicRead = false): Promise<unknown> {
  const token = publicRead ? null : await getExistingBackendAuthToken();
  if (!publicRead && !token) {
    throw new RoleChallengeApiError("account_required", 401, "Sign in to play Role Challenge", "ACCOUNT_REQUIRED");
  }
  const headers: Record<string, string> = token ? { Authorization: "Bearer " + token } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(RANKED_API_BASE + path, {
      method, signal, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") {
      throw new RoleChallengeApiError("aborted", 0, "request aborted");
    }
    throw new RoleChallengeApiError("network", 0, "could not reach Role Challenge");
  }
  if (!response.ok) {
    let message = "request failed (" + response.status + ")";
    let code: string | null = null;
    try {
      const data: unknown = await response.json();
      const detail = data && typeof data === "object" ? (data as Record<string, unknown>).detail : null;
      if (detail && typeof detail === "object") {
        const d = detail as Record<string, unknown>;
        if (typeof d.code === "string") code = d.code;
        if (typeof d.message === "string") message = d.message;
      }
    } catch { /* retain HTTP status */ }
    throw new RoleChallengeApiError("backend", response.status, message, code);
  }
  try { return await response.json(); }
  catch { throw new RoleChallengeApiError("invalid_response", response.status, "malformed Role Challenge response"); }
}
function validated<T>(value: unknown, parser: (data: unknown) => T): T {
  try { return parser(value); }
  catch (e) {
    throw new RoleChallengeApiError("invalid_response", 200,
      e instanceof Error ? e.message : "Role Challenge contract validation failed");
  }
}
export const getRoleChallengeCatalog = async (signal?: AbortSignal): Promise<RoleChallengeCatalog> =>
  validated(await request("/api/role-challenges/catalog", "GET", signal, undefined, true), readRoleChallengeCatalog);

export const getRoleChallengeStatus = async (signal?: AbortSignal): Promise<RoleChallengeStatus> =>
  validated(await request("/api/role-challenges/status", "GET", signal), readRoleChallengeStatus);

export interface RoleChallengeStartReply extends RoleChallengeStart {
  queue: QueueStatusView;
}
/** Keep the same startKey for retries of the same user action; backend owns quota/eligibility. */
export async function startRoleChallenge(
  role: RoleChallengeRole, champion: string, startKey: string, signal?: AbortSignal,
): Promise<RoleChallengeStartReply> {
  const wire = await request("/api/role-challenges/start", "POST", signal,
    { role, champion, start_key: startKey });
  const start = validated(wire, readRoleChallengeStart);
  const queue = validated(wire, readQueueStatus);
  if (queue.status !== "matched" || queue.matchId !== start.matchId) {
    throw new RoleChallengeApiError("invalid_response", 200, "Role Challenge and Ranked match IDs disagree");
  }
  return { ...start, queue };
}
