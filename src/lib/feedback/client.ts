import { supabase } from "@/integrations/supabase/client";

import {
  FEEDBACK_RATE_LIMIT_ERROR,
  FEEDBACK_RATE_LIMIT_MESSAGE,
  type FeedbackCategory,
  type FeedbackEntryIntent,
  type FeedbackReproducibility,
  type FeedbackSeverity,
  type MyFeedbackRow,
} from "./contract";
import type { PreparedScreenshot } from "./screenshot";

/**
 * FB1 — the only module that talks to Supabase about feedback.
 *
 *
 * THE READ PATH IS AN RPC, NOT A TABLE SELECT
 * The shipped page read submissions with
 *     supabase.from("feedback").select("*")
 * which returns every column on the row, including admin_notes and — once FB1
 * added them — client_meta and duplicate_of. RLS was never the problem: it
 * correctly limits a user to their own rows. The problem is column reach
 * *within* those rows, and the column-level REVOKE that is supposed to hide
 * admin_notes is a no-op on this project, because ALTER DEFAULT PRIVILEGES
 * grants SELECT at table level and a column REVOKE cannot subtract from a
 * table-level grant (verified live and documented in
 * supabase/migrations/20260730150000_league_profiles_rpc.sql).
 *
 * So the fix is not another REVOKE. list_my_feedback() is a SECURITY DEFINER
 * RETURNS TABLE contract that names the seventeen submitter-visible columns and
 * nothing else. A caller cannot widen it — there is no select() to append to —
 * so admin-only columns stay unreachable no matter what is added to the table
 * later. That is the same reasoning the project applied to profiles in
 * 20260730150000.
 *
 * Nothing in FB1 may reintroduce .from("feedback").select(...) on a user path.
 * readPath.test.ts enforces that across the whole src tree.
 */

/** list_my_feedback and attach_feedback_screenshot are not in the generated
 *  types yet: src/integrations/supabase/types.ts must describe the live
 *  database, and these migrations are deliberately unapplied. The casts are
 *  confined to this module and follow the existing pattern for
 *  not-yet-generated RPCs (Referral.tsx, EloCheck.tsx, CustomLink.tsx). */
type UntypedRpc = Parameters<typeof supabase.rpc>[0];

export interface SubmitFeedbackInput {
  profileId: string;
  entryIntent: FeedbackEntryIntent;
  category: FeedbackCategory;
  title: string;
  body: string;
  severity?: FeedbackSeverity | null;
  reproducibility?: FeedbackReproducibility | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  evidenceUrl?: string | null;
  pageUrl?: string | null;
  clientMeta?: Record<string, string>;
}

export class FeedbackRateLimitError extends Error {
  constructor() {
    super(FEEDBACK_RATE_LIMIT_MESSAGE);
    this.name = "FeedbackRateLimitError";
  }
}

/** The trigger raises the bare token as the message; PostgREST passes it through. */
function isRateLimit(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes(FEEDBACK_RATE_LIMIT_ERROR));
}

/** Resolve the caller's profile id, which is what feedback rows are keyed on. */
export async function getMyProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

/**
 * The submitter's own submissions.
 *
 * Ordering, the archived filter and the 200-row cap all live inside the RPC, so
 * they cannot be overridden from the client.
 */
export async function listMySubmissions(): Promise<MyFeedbackRow[]> {
  const { data, error } = await supabase.rpc("list_my_feedback" as UntypedRpc);
  if (error) throw error;
  return (data ?? []) as unknown as MyFeedbackRow[];
}

/**
 * File a report. Returns the new row's id, which becomes the reference code
 * shown on the confirmation screen and the key the screenshot attaches to.
 *
 * Selects only `id` on the way back: an INSERT ... RETURNING * would hand the
 * client every column of the new row and quietly undo the read-path fix above.
 *
 * `type` is intentionally not sent. The database derives it from entry_intent
 * in normalize_feedback_submission() and overwrites whatever a client supplies,
 * so sending it would be theatre.
 */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<string> {
  const { data, error } = await supabase
    .from("feedback")
    .insert({
      profile_id: input.profileId,
      entry_intent: input.entryIntent,
      category: input.category,
      title: input.title,
      body: input.body,
      severity: input.severity ?? null,
      reproducibility: input.reproducibility ?? null,
      expected_result: input.expectedResult ?? null,
      actual_result: input.actualResult ?? null,
      evidence_url: input.evidenceUrl ?? null,
      page_url: input.pageUrl ?? null,
      client_meta: input.clientMeta ?? {},
    } as never)
    .select("id")
    .single();

  if (error) {
    if (isRateLimit(error)) throw new FeedbackRateLimitError();
    throw error;
  }
  return (data as { id: string }).id;
}

export const EVIDENCE_BUCKET = "feedback-evidence";

/**
 * Upload a prepared screenshot and bind it to a report.
 *
 * Order is load-bearing: the row exists first, so a failed upload leaves a
 * report with no screenshot (legal) rather than an orphaned object with no
 * report (garbage). The object key is `<uid>/<uuid>.webp` because every storage
 * policy on the bucket pivots on that first path segment.
 *
 * attach_feedback_screenshot() does the actual column write — users hold no
 * UPDATE policy on public.feedback, by design.
 */
export async function uploadScreenshot(
  userId: string,
  feedbackId: string,
  prepared: PreparedScreenshot,
): Promise<string> {
  const path = `${userId}/${feedbackId}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, prepared.blob, {
      contentType: prepared.contentType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: attachError } = await supabase.rpc("attach_feedback_screenshot" as UntypedRpc, {
    _feedback_id: feedbackId,
    _path: path,
  } as never);
  if (attachError) throw attachError;

  return path;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A short-lived URL for an object the caller owns. The bucket is private, so
 * this is the only way to render an attachment — there is no public URL to fall
 * back to, which is the point.
 */
export async function signedScreenshotUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
