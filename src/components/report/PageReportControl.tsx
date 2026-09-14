/**
 * FB1-4 — "something's wrong with this page", from the global HUD.
 *
 * WHY IT IS NOT A LINK TO /feedback
 * ─────────────────────────────────
 * /feedback already exists, already preselects a product area from the
 * referrer, and is the right place for a considered report. It is the wrong
 * place for "this page is broken", because getting there means LEAVING the
 * broken page — losing the scroll position, the open panel, the filter, the
 * half-finished thing that made the page worth reporting. So this control
 * files from where the visitor is standing, and captures the route itself
 * rather than asking them to describe it.
 *
 * It is deliberately the smaller of the two doors: one textarea and a send.
 * Everything else — route, query, viewport, user agent, build, identity,
 * timestamp — is captured automatically by the same FB1 machinery the full
 * form uses. A bug worth a severity, a repro and a screenshot is a bug worth
 * /feedback, and the panel says so with a link the visitor may take or ignore.
 *
 * PLACEMENT. Inside the HUD's top-right cluster, between the radio and the
 * identity compound. Not the bottom-right dock: that corner belongs to
 * controls that talk about the SURFACE beneath them (the rules of this mode,
 * this question), and a page reporter that followed the visitor into a live
 * match's corner would compete with the question reporter for the one thing a
 * player is trying to read.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { FeedbackRateLimitError } from "@/lib/feedback/client";
import { FEEDBACK_LIMITS } from "@/lib/feedback/contract";
import { capturePath } from "@/lib/feedback/report-context";
import { MissingProfileError, submitPageReport } from "@/lib/feedback/submitReport";

export default function PageReportControl() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const route = capturePath(pathname);

  const close = useCallback(() => setOpen(false), []);

  /* Navigating away closes it, and resets it. A report typed about /lol/premium
     must never be sent about /quiz/ranked because the panel outlived the
     route. */
  useEffect(() => {
    setOpen(false);
    setComment("");
    setSent(false);
  }, [pathname]);

  /* Escape and outside-click dismissal, matching the identity menu beside it.
     Bound only while open, so the HUD adds no global listeners at rest. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && !sent) textareaRef.current?.focus();
  }, [open, sent]);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (!user) {
      toast.error("Sign in to report a page issue.");
      return;
    }
    if (!comment.trim()) {
      toast.error("Tell us what's wrong first.");
      return;
    }
    setSubmitting(true);
    try {
      await submitPageReport({ userId: user.id, comment, route: pathname, search });
      setSent(true);
      setComment("");
    } catch (err) {
      if (err instanceof FeedbackRateLimitError || err instanceof MissingProfileError) {
        toast.error(err.message);
      } else {
        toast.error("We couldn't send that. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, user, comment, pathname, search]);

  return (
    /* NOT `relative`, deliberately.
     *
     * The panel below is `absolute right-0`, and its positioned ancestor is
     * therefore the HUD CLUSTER, which is where `relative` already lives
     * (GlobalHud's chip box) and which is what `MogzyIdentityMenu` anchors its
     * own panel to. Giving this wrapper its own `relative` anchors the panel
     * to the 40px trigger instead — and since this control sits in the MIDDLE
     * of the cluster with the identity compound to its right, a 320px panel
     * right-aligned on a 40px button starts 47px off the left edge of a 375px
     * screen. Measured, not theorised.
     *
     * The wrapper still exists: outside-click dismissal needs a node to test
     * containment against, and that works regardless of positioning. */
    <div ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Report an issue with this page"
        title="Report an issue with this page"
        data-testid="hud-page-report"
        /* A UTILITY control by the HUD's own vocabulary (src/lib/hud/chrome.ts):
           it holds still. No pop — that belongs to the two branded marks. */
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
          text-[#c9a84c]/70 transition-colors hover:bg-white/5 hover:text-[#c9a84c]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/80"
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label="Report an issue with this page"
          data-testid="hud-page-report-panel"
          /* Same anchor geometry as the notifications panel next door:
             right-aligned on the HUD CLUSTER (see the wrapper above), below
             it, and viewport-bounded so it can run off neither edge of a
             375px screen. */
          className="absolute right-0 top-full z-50 mt-1 flex w-[calc(100vw-1.5rem)] max-w-80
            flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xl"
        >
          {sent ? (
            <div data-testid="hud-page-report-sent" className="space-y-2">
              <p className="text-sm font-bold text-foreground">Thanks — that's sent.</p>
              <p className="text-xs text-muted-foreground">
                We recorded the page and your browser details with it.
              </p>
              <button
                type="button"
                onClick={close}
                className="min-h-9 w-full rounded-md border border-border text-xs font-semibold
                  text-foreground transition-colors hover:bg-muted/50"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-bold text-foreground">Report this page</p>
                {/* The route is SHOWN, not just captured. A visitor who is
                    about to describe a problem needs to know which page the
                    report will be filed against — especially inside a modal or
                    a deep tab, where "this page" is genuinely ambiguous. */}
                <p
                  data-testid="hud-page-report-route"
                  className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                  title={route}
                >
                  {route}
                </p>
              </div>

              <textarea
                ref={textareaRef}
                data-testid="hud-page-report-comment"
                value={comment}
                onChange={event => setComment(event.target.value)}
                maxLength={FEEDBACK_LIMITS.reportComment}
                rows={4}
                placeholder="What's wrong on this page?"
                aria-label="What's wrong on this page?"
                className="w-full resize-none rounded-md border border-border bg-background px-2.5
                  py-2 text-xs text-foreground placeholder:text-muted-foreground
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
              />

              <button
                type="button"
                data-testid="hud-page-report-submit"
                onClick={() => void submit()}
                disabled={submitting || !comment.trim()}
                className="min-h-9 w-full rounded-md bg-[#c9a84c]/20 text-xs font-bold uppercase
                  tracking-[0.14em] text-[#c9a84c] transition-colors hover:bg-[#c9a84c]/30
                  disabled:cursor-not-allowed disabled:opacity-40
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/80"
              >
                {submitting ? "Sending…" : "Send"}
              </button>

              <p className="text-[10px] leading-snug text-muted-foreground">
                Reporting a specific question instead? Use the Report tab beside
                the question.{" "}
                <Link
                  to="/feedback"
                  onClick={close}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Full feedback form
                </Link>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
