import type { NotificationLoadError } from "@/lib/notifications/api";

/**
 * #146: the one line a failed notification read shows under "Couldn't load…".
 * Already sanitized by describeNotificationError (operation, code, short
 * message — no ids, emails or tokens), so a screenshot of it is safe to share
 * and is enough to tell an owner-session refusal from a timeout or an outage.
 */
export function NotificationErrorDetail({ error }: { error: NotificationLoadError | null }) {
  if (!error) return null;
  const text =
    error.code === "42501" && /admin role required/i.test(error.message)
      ? "Admin session needs re-verification."
      : error.code === "timeout"
        ? "The server didn’t respond in time."
        : error.message;
  return (
    <p data-testid="notification-error-detail" className="mt-0.5 break-words text-[10px] text-muted-foreground/80">
      {text} <span className="font-mono">({[error.operation, error.code].filter(Boolean).join(" · ")})</span>
    </p>
  );
}
