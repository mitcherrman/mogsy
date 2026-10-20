import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import type { FocusStatus } from "@/lib/notifications/focus";
import { adminNotificationPermalink } from "@/lib/notifications/policy";

/**
 * What a moderation view says when it was opened from a notification link.
 * A plain <a> (not a router Link) so the views keep rendering without a Router.
 */
export default function RecordFocusNotice({
  status,
  kind,
  fromNotification,
  resolvedLabel = null,
}: {
  status: FocusStatus;
  /** "feedback", "report", "comment", "request". */
  kind: string;
  fromNotification: string | null;
  /** When the record is already handled, how (e.g. "Report resolved"). */
  resolvedLabel?: string | null;
}) {
  if (status === "none") return null;
  const back = fromNotification ? (
    <a href={adminNotificationPermalink(fromNotification)} className="ml-1 font-medium text-primary underline-offset-2 hover:underline">
      Back to the notification
    </a>
  ) : null;

  if (status === "missing") {
    return (
      <div role="status" data-testid="record-focus-missing" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <p>
          This {kind} could not be found. It may have been deleted, or this session may not have access to it.
          {back}
        </p>
      </div>
    );
  }
  return (
    <div role="status" data-testid="record-focus-found" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-foreground">
      {resolvedLabel ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
      ) : (
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      )}
      <p>
        {resolvedLabel ? `Opened from a notification · already handled: ${resolvedLabel}.` : `Opened from a notification — the ${kind} is highlighted below.`}
        {back}
      </p>
    </div>
  );
}
