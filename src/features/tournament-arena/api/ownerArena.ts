/**
 * Organizer calls from the Admin app, through the owner step-up seam.
 *
 * The backend decides organizer authority per request from the owner's own
 * session (`owner_auth_state`). A refusal (`ARENA_ORGANIZER_REQUIRED`) can
 * mean "not the owner" or "the owner's device attestation lapsed", and the
 * client cannot tell which, so it is treated as a step-up refusal of unknown
 * level: `runOwnerAction` re-attests and retries once, then asks for MFA.
 * Every organizer call carries an `action_id` minted once per press, so any
 * re-send applies at most once on the server.
 */
import { runOwnerAction, ownerActionNotice } from "@/lib/admin-auth/ownerAction";

import { arenaErrorCopy, isArenaApiError } from "./arenaApi";

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export type OwnerArenaResult<T> =
  | { status: "done"; value: T }
  | { status: "failed"; error: unknown; notice: string }
  | { status: "not_run"; notice: string };

export async function ownerArenaCall<T>(reason: string, call: () => Promise<T>): Promise<OwnerArenaResult<T>> {
  const outcome = await runOwnerAction<Outcome<T>>(
    { level: "trusted", reason, idempotent: true },
    async () => {
      try {
        return { ok: true, value: await call() };
      } catch (error) {
        return { ok: false, error };
      }
    },
    (r) => (r.ok === false && isArenaApiError(r.error) && r.error.code === "ARENA_ORGANIZER_REQUIRED" ? "unknown" : null),
  );
  if (outcome.status !== "done") return { status: "not_run", notice: ownerActionNotice(outcome) ?? "Nothing was changed." };
  const r = outcome.result;
  if (r.ok === false) return { status: "failed", error: r.error, notice: arenaErrorCopy(r.error) };
  return { status: "done", value: r.value };
}
