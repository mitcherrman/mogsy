// ---------------------------------------------------------------------------
// COM1-1 / P0-2 — one outcome vocabulary for every social mutation.
//
// WHAT WAS WRONG
// Every social write went out as a bare PostgREST call whose result was
// discarded:
//
//     await supabase.from("friendships").insert({ ... });   // useFriends
//     await supabase.from("user_blocks").insert({ ... });   // useBlocks
//     await supabase.from("user_reports").insert({ ... });  // useReportUser
//
// supabase-js does not throw on a database error — it RESOLVES with
// `{ data, error }`. So a rejected write and a successful one were the same
// value, and the UI treated both as success: `blockUser` and `reportUser` sat
// inside a try/catch that could never catch anything, and their callers toasted
// "X has been blocked" / "Report submitted" unconditionally.
//
// The failures were not hypothetical. `enforce_friendship_rules`
// (migration 20260730140000) REJECTS a friend request when a block exists in
// either direction, when the requester is over 10 requests/hour, or when they
// hold 20 open requests — and `useFriendStatus` cannot see a block the other
// party created, so the button reads "Add Friend", the insert is refused, the
// error is dropped and the button silently returns to "Add Friend" forever.
//
// THE CONTRACT
// Every mutation returns a `SocialResult`. Success is a fact the database
// confirmed, never an assumption. `code` is machine-readable so a caller can
// branch; `error` is one finished sentence, and it is the ONLY thing a user is
// ever shown.
//
// NO RAW POSTGRES TEXT REACHES A USER. `classify` reads SQLSTATEs and the
// message vocabulary OUR OWN triggers raise — a controlled set, not arbitrary
// server text — and maps them to a code. An unrecognised error maps to
// `unavailable`, the same as a transport failure. This mirrors
// `lib/identity/claim-username.ts`, which established the pattern for AUTH3.
//
// ON BLOCK DISCLOSURE
// A request refused because the OTHER party blocked the caller reports the
// same neutral sentence as any other refusal. Telling someone "they blocked
// you" hands them information the blocker deliberately withheld. This matches
// the Stat Check backend, which answers `SC_INVITE_BLOCKED` with
// "This invite is not available." rather than naming the cause.
// ---------------------------------------------------------------------------

/** Machine-readable outcome. Callers branch on this, users never see it. */
export type SocialCode =
  | "ok"
  /** The requested end state already held. Idempotent, and a success. */
  | "already"
  /** Refused by policy: a block, or an authorization rule. Never explained. */
  | "refused"
  /** Refused by a rate limit or an outstanding-request cap. */
  | "rate_limited"
  /** The row is gone or was never visible — the caller's view is stale. */
  | "stale"
  /** The caller may not do this to this target. */
  | "forbidden"
  /** Network, timeout, or an unrecognised database failure. */
  | "unavailable";

export interface SocialResult {
  ok: boolean;
  code: SocialCode;
  /** A complete, user-facing sentence. Present whenever `ok` is false. */
  error?: string;
  /** True when the caller should re-read from the server before re-rendering. */
  refetch?: boolean;
}

/**
 * The only sentences these mutations may show. Deliberately short, and
 * deliberately not diagnostic.
 */
const MESSAGES: Record<SocialCode, string> = {
  ok: "",
  already: "",
  refused: "That could not be done.",
  rate_limited: "You have done that too many times. Try again later.",
  stale: "That is no longer available. Refreshing.",
  forbidden: "You do not have permission to do that.",
  unavailable: "Something went wrong. Try again.",
};

/** Per-action overrides where the generic sentence would read oddly. */
export const SEND_REQUEST_MESSAGES: Partial<Record<SocialCode, string>> = {
  refused: "That friend request could not be sent.",
  rate_limited: "You have sent too many friend requests. Try again later.",
  stale: "That profile is no longer available.",
};

export const BLOCK_MESSAGES: Partial<Record<SocialCode, string>> = {
  refused: "That user could not be blocked.",
  stale: "That profile is no longer available.",
};

export const REPORT_MESSAGES: Partial<Record<SocialCode, string>> = {
  refused: "That report could not be submitted.",
  rate_limited: "You have submitted too many reports. Try again later.",
};

export function messageFor(
  code: SocialCode,
  overrides: Partial<Record<SocialCode, string>> = {},
): string {
  return overrides[code] ?? MESSAGES[code] ?? MESSAGES.unavailable;
}

export function success(code: SocialCode = "ok"): SocialResult {
  return { ok: true, code };
}

export function failure(
  code: SocialCode,
  overrides: Partial<Record<SocialCode, string>> = {},
): SocialResult {
  return {
    ok: false,
    code,
    error: messageFor(code, overrides),
    refetch: code === "stale" || code === "already",
  };
}

interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

/**
 * The message fragments `enforce_friendship_rules` raises. These are OUR
 * strings, from our own migration, so matching on them is reading a contract
 * rather than parsing arbitrary server output. They are matched, never shown.
 */
const TRIGGER_VOCABULARY: ReadonlyArray<[RegExp, SocialCode]> = [
  [/a block exists between these profiles/i, "refused"],
  [/friend request rate limit exceeded/i, "rate_limited"],
  [/too many open friend requests/i, "rate_limited"],
  [/friendship parties are immutable/i, "forbidden"],
  [/illegal friendship transition/i, "stale"],
  [/must start as pending/i, "forbidden"],
];

/**
 * Map a supabase-js error to a code.
 *
 * SQLSTATEs, in the order they are checked:
 *   23505 unique_violation      -> the end state already holds
 *   23514 check_violation       -> a trigger rule; refine via the vocabulary
 *   23503 foreign_key_violation -> the target row is gone
 *   42501 insufficient_privilege / RLS refusal
 *   PGRST116 no row matched a single-row expectation
 */
export function classify(error: unknown): SocialCode {
  if (!error) return "ok";
  const e = (error ?? {}) as PostgrestErrorLike;
  const code = (e.code ?? "").trim();
  const text = `${e.message ?? ""} ${e.details ?? ""}`;

  if (code === "23505") return "already";
  if (code === "23514" || code === "P0001") {
    for (const [pattern, mapped] of TRIGGER_VOCABULARY) {
      if (pattern.test(text)) return mapped;
    }
    return "refused";
  }
  if (code === "23503") return "stale";
  if (code === "42501" || code === "PGRST301") return "forbidden";
  if (code === "PGRST116") return "stale";
  // A trigger raised without a recognised SQLSTATE still carries our own text.
  for (const [pattern, mapped] of TRIGGER_VOCABULARY) {
    if (pattern.test(text)) return mapped;
  }
  return "unavailable";
}

/**
 * Wrap one supabase-js call.
 *
 * `run` must return the `{ error }` envelope, NOT a thrown value — that is the
 * whole shape this exists to stop people ignoring. A genuine throw (offline,
 * aborted fetch) is caught here and reported as `unavailable`.
 */
export async function attempt(
  // A PostgREST builder is a THENABLE, not a Promise (it only grows a real
  // one when awaited), so this is PromiseLike — typing it as Promise would
  // force every call site into a needless `await` or cast.
  run: () => PromiseLike<{ error: unknown } | null | undefined>,
  overrides: Partial<Record<SocialCode, string>> = {},
  options: { treatAlreadyAsSuccess?: boolean } = {},
): Promise<SocialResult> {
  let envelope: { error: unknown } | null | undefined;
  try {
    envelope = await run();
  } catch {
    return failure("unavailable", overrides);
  }
  const code = classify(envelope?.error);
  if (code === "ok") return success();
  if (code === "already" && options.treatAlreadyAsSuccess !== false) {
    // Doing it twice is not an error: the caller wanted the end state and the
    // end state holds. Flagged for refetch so a stale view catches up.
    return { ok: true, code: "already", refetch: true };
  }
  return failure(code, overrides);
}
