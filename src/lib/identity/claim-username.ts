// ---------------------------------------------------------------------------
// AUTH3 — claiming a public username.
//
// THE ONE WRITE PATH. Every surface that sets a Mogzy username calls
// `claimUsername`, and `claimUsername` calls `set_display_name()`. Before this
// there were four independent `profiles.update({ display_name })` calls — the
// profile editor, the onboarding step, the Welcome adoption, and the admin bot
// RPC — none of which could see another account's name, because RLS shows a
// player only their own row. Uniqueness is a statement about rows the client
// cannot read, so it cannot be a client decision; the RPC is SECURITY DEFINER
// precisely so the check and the write happen in one place that can see all of
// them, in one statement.
//
// NO RAW ERROR EVER REACHES A USER. The RPC returns a code, this maps the code
// to one finished sentence, and an unrecognised code or a transport failure
// maps to the same generic one. A Postgres unique-violation string, a
// PostgREST envelope and a column name are all things a person should never be
// shown; there is exactly one path out of here and it goes through
// USERNAME_MESSAGES.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";

import {
  cleanUsername,
  usernameMessage,
  usernameProblem,
  type UsernameProblem,
} from "./username";

export interface ClaimResult {
  ok: boolean;
  /** The stored display form, when ok. */
  username?: string;
  /** Machine-readable outcome. */
  code: string;
  /** A complete, user-facing sentence, when not ok. */
  error?: string;
  /** True when the name belongs to somebody else. Callers offer a retry. */
  taken?: boolean;
}

/**
 * The RPC is typed by a GENERATED file (integrations/supabase/types.ts, "do not
 * edit it directly") that has not been regenerated since this migration, so
 * the call is cast — the same accommodation lib/league-profiles.ts already
 * makes for get_league_profiles. The shape is validated below rather than
 * trusted.
 */
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
const rpc = supabase as unknown as RpcClient;

interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

/**
 * The bundle is live and the migration is not.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT OPTIONAL. The frontend and the SQL ship
 * together but are APPLIED separately, and master auto-deploys. For however
 * long index-*.js is serving and 20260822120000_auth3_canonical_username.sql
 * has not been run, `set_display_name` does not exist and PostgREST answers
 * every call with PGRST202. Without a fallback that window would take out
 * EVERY name write at once: the profile rename, the onboarding step, the
 * Welcome adoption and signup's confirming claim — a person renaming
 * themselves would simply be told it did not work, with nothing wrong.
 *
 * The same accommodation, for the same reason, that
 * lib/welcome/provisional-identity.ts makes for the league_rank column.
 */
function isMissingFunction(error: unknown): boolean {
  const e = (error ?? {}) as PostgrestErrorLike;
  if (e.code === "PGRST202" || e.code === "42883") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the function") || msg.includes("schema cache");
}

/**
 * Pre-AUTH3 behaviour: write the name straight onto the caller's own profile.
 *
 * STRICTLY NO WORSE THAN WHAT IT REPLACES, and no better. Uniqueness is not
 * enforced on this path because it CANNOT be from a client that RLS shows only
 * its own row — which was exactly the situation before this change, so the gap
 * reproduces the old behaviour rather than inventing a weaker new one. Shape is
 * still enforced (the caller checked it), and every claim made through here
 * becomes subject to the real rules the moment the migration lands.
 *
 * `onlyIfUnset` has no server-side equivalent on this path, and does not need
 * one: the only caller that passes it (the Welcome adoption) has already read
 * the profile and decided the name is a placeholder before calling.
 */
async function legacyWrite(username: string): Promise<ClaimResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) return failure("unauthenticated");

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: username })
      .eq("user_id", uid);
    if (error) return failure("unavailable");

    return { ok: true, code: "set_legacy", username };
  } catch {
    return failure("unavailable");
  }
}

interface RpcEnvelope {
  ok?: boolean;
  code?: string;
  display_name?: string;
}

/** Read the RPC's jsonb defensively: anything unexpected is a failure, not a crash. */
function envelope(data: unknown): RpcEnvelope | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as RpcEnvelope;
}

function failure(code: string): ClaimResult {
  return { ok: false, code, error: usernameMessage(code), taken: code === "taken" };
}

export interface ClaimOptions {
  /**
   * First-write-wins. The Welcome adoption uses this so replaying the
   * introduction on an established account can never overwrite the name that
   * account already chose. A deliberate rename leaves it false.
   */
  onlyIfUnset?: boolean;
}

/**
 * Set the signed-in account's public username.
 *
 * Shape is checked here first so an obviously-bad name costs no round trip and
 * the user gets the same sentence they would have got from the server. Every
 * other decision — uniqueness above all — belongs to the database.
 */
export async function claimUsername(
  raw: string,
  options: ClaimOptions = {},
): Promise<ClaimResult> {
  const username = cleanUsername(raw);
  const problem: UsernameProblem | null = usernameProblem(username);
  if (problem) return failure(problem);

  try {
    const { data, error } = await rpc.rpc("set_display_name", {
      _name: username,
      _only_if_unset: options.onlyIfUnset === true,
    });
    if (error) {
      if (isMissingFunction(error)) return legacyWrite(username);
      return failure("unavailable");
    }

    const env = envelope(data);
    if (!env) return failure("unavailable");
    if (env.ok === true) {
      return { ok: true, code: env.code ?? "set", username: env.display_name ?? username };
    }
    return failure(env.code ?? "unavailable");
  } catch {
    return failure("unavailable");
  }
}

/**
 * Advisory availability check, for telling someone a name is taken BEFORE they
 * submit a form.
 *
 * ADVISORY IS THE WHOLE POINT, and the reason it is named this way. Between
 * this answering and the user pressing the button, the name can be claimed by
 * someone else; `claimUsername` is what decides. A failure here — including a
 * signed-out caller, which is the ordinary state on the signup form — resolves
 * to `ok: true` with code `unknown`, because "we could not check" must never
 * render as "that name is taken".
 */
export async function checkUsernameAvailable(raw: string): Promise<ClaimResult> {
  const username = cleanUsername(raw);
  const problem = usernameProblem(username);
  if (problem) return failure(problem);

  try {
    const { data, error } = await rpc.rpc("is_display_name_available", { _name: username });
    if (error) return { ok: true, code: "unknown", username };

    const env = envelope(data);
    if (!env) return { ok: true, code: "unknown", username };
    if (env.ok === true) return { ok: true, code: "available", username };
    // A shape problem the server disagreed with us about is still worth
    // showing; anything else at this point is only ever "taken".
    return failure(env.code ?? "taken");
  } catch {
    return { ok: true, code: "unknown", username };
  }
}
