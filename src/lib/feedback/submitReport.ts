/**
 * FB1-4 — the one submit path behind both in-product report controls.
 *
 * It is a thin composition over `submitFeedback`, and thinness is the point:
 * the rate limit, the normalisation trigger, the admin notification, the
 * submitter's history and the evidence rules are all properties of that
 * insert, so a second insert path — even a well-behaved one — would be a
 * second place for those guarantees to drift. Everything below is assembly.
 */

import {
  captureClientMeta,
  capturePageUrl,
} from "./diagnostics";
import { getMyProfileId, submitFeedback } from "./client";
import {
  buildPageReportContext,
  buildQuestionReportContext,
  categoryForReport,
  pageReportTitle,
  questionReportTitle,
  reportBody,
  serializeReportContext,
  type QuestionReportReason,
  type ReportableQuestionSnapshot,
} from "./report-context";
import { categoryForRoute } from "./contract";

/** Thrown when the caller has a session but no profile row to attribute to. */
export class MissingProfileError extends Error {
  constructor() {
    super("We couldn't find your profile. Try reloading the page.");
    this.name = "MissingProfileError";
  }
}

export interface SubmitQuestionReportInput {
  userId: string;
  snapshot: ReportableQuestionSnapshot;
  reason: QuestionReportReason;
  comment: string;
  /** `location.pathname` at the moment of submission. */
  route: string;
}

/**
 * File a report about the question currently on screen.
 *
 * Returns the new row id. It deliberately does NOT navigate, toast, close a
 * panel or touch any mode's state — the caller owns all of that, which is what
 * keeps "submitting a report" from being able to disturb a live round.
 */
export async function submitQuestionReport(
  input: SubmitQuestionReportInput,
): Promise<string> {
  const profileId = await getMyProfileId(input.userId);
  if (!profileId) throw new MissingProfileError();

  const context = buildQuestionReportContext({
    snapshot: input.snapshot,
    reason: input.reason,
    route: input.route,
  });

  return submitFeedback({
    profileId,
    entryIntent: "question_report",
    category: categoryForReport(input.snapshot, input.route),
    title: questionReportTitle(input.reason, input.snapshot.mode),
    // A reason alone is a complete report — the structured context carries the
    // question — so an empty comment falls back to the reason rather than
    // blocking submission behind a textarea nobody wants to fill in mid-match.
    body: reportBody(
      input.comment,
      `Reported from ${input.snapshot.mode} with no additional comment.`,
    ),
    pageUrl: capturePageUrl(input.route),
    clientMeta: captureClientMeta() as Record<string, string>,
    reportContext: serializeReportContext(context),
  });
}

export interface SubmitPageReportInput {
  userId: string;
  comment: string;
  route: string;
  /** `location.search`; allow-listed before anything is retained. */
  search?: string;
}

/** File a report about the current page, from the global HUD. */
export async function submitPageReport(input: SubmitPageReportInput): Promise<string> {
  const profileId = await getMyProfileId(input.userId);
  if (!profileId) throw new MissingProfileError();

  const context = buildPageReportContext({
    route: input.route,
    search: input.search,
  });

  return submitFeedback({
    profileId,
    entryIntent: "page_report",
    category: categoryForRoute(context.route),
    title: pageReportTitle(input.route),
    body: reportBody(input.comment, "No description provided."),
    pageUrl: capturePageUrl(input.route),
    clientMeta: captureClientMeta() as Record<string, string>,
    reportContext: serializeReportContext(context),
  });
}
