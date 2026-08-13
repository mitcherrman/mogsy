import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bug,
  Check,
  Copy,
  Gamepad2,
  Lightbulb,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import SEOHead from "@/components/SEOHead";
import FeedbackForm, { type FeedbackFormValues } from "@/components/feedback/FeedbackForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import {
  ENTRY_INTENT_LABELS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS_PUBLIC_LABELS,
  type FeedbackCategory,
  type FeedbackEntryIntent,
  type FeedbackStatus,
  type MyFeedbackRow,
  categoryForRoute,
} from "@/lib/feedback/contract";
import {
  FeedbackRateLimitError,
  getMyProfileId,
  listMySubmissions,
  submitFeedback,
  uploadScreenshot,
} from "@/lib/feedback/client";
import { captureClientMeta, capturePageUrl } from "@/lib/feedback/diagnostics";

const GOLD = "#c9a84c";

/**
 * The Mogzy Feedback Center.
 *
 * Four doors, because "leave feedback" gets you a shrug and "Report a Bug" gets
 * you a bug report. The door the user picks is stored as entry_intent and never
 * rewritten; the database derives the three-way triage `type` from it.
 *
 * Reads go through list_my_feedback() — never .from("feedback").select("*") —
 * so admin_notes, client_meta and duplicate_of are unreachable from a user
 * session. See src/lib/feedback/client.ts for why that is an RPC and not a
 * column REVOKE.
 */

const ENTRY_CHOICES: {
  intent: FeedbackEntryIntent;
  Icon: LucideIcon;
  blurb: string;
}[] = [
  { intent: "bug", Icon: Bug, blurb: "Something is broken or behaving wrongly." },
  { intent: "feature", Icon: Lightbulb, blurb: "Something is missing that you want." },
  { intent: "gameplay", Icon: Gamepad2, blurb: "Difficulty, pacing, clarity, or how it felt to play." },
  { intent: "other", Icon: MessageSquare, blurb: "Anything else on your mind." },
];

type View =
  | { kind: "choose" }
  | { kind: "form"; intent: FeedbackEntryIntent }
  | { kind: "sent"; reference: string; intent: FeedbackEntryIntent };

/** Short, readable reference the user can quote back to us. */
function referenceCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export default function Feedback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [view, setView] = useState<View>({ kind: "choose" });
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<MyFeedbackRow[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);

  /**
   * Preselect the product area. `?area=Ranked` wins; otherwise we infer it from
   * the route the user came from. This is what lets a future "Report a problem"
   * link inside a mode be a plain <Link> — no mode's surface has to import
   * anything from FB1.
   */
  const defaultCategory = useMemo<FeedbackCategory>(() => {
    const requested = new URLSearchParams(location.search).get("area");
    if (requested && (FEEDBACK_CATEGORIES as readonly string[]).includes(requested)) {
      return requested as FeedbackCategory;
    }
    if (typeof document !== "undefined" && document.referrer) {
      try {
        const url = new URL(document.referrer);
        if (url.origin === window.location.origin) return categoryForRoute(url.pathname);
      } catch {
        /* a malformed referrer is not worth a failed render */
      }
    }
    return "General";
  }, [location.search]);

  const refresh = useCallback(async () => {
    setLoadingSubmissions(true);
    try {
      setSubmissions(await listMySubmissions());
    } catch {
      // A failed history load must not block filing something new.
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoadingSubmissions(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  const handleSubmit = async (intent: FeedbackEntryIntent, values: FeedbackFormValues) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const profileId = await getMyProfileId(user.id);
      if (!profileId) {
        toast.error("We couldn't find your profile. Try reloading the page.");
        return;
      }

      const feedbackId = await submitFeedback({
        profileId,
        entryIntent: intent,
        category: values.category,
        title: values.title,
        body: values.body,
        severity: values.severity,
        reproducibility: values.reproducibility,
        expectedResult: values.expectedResult,
        actualResult: values.actualResult,
        evidenceUrl: values.evidenceUrl,
        // The route the user came FROM, not /feedback itself.
        pageUrl: capturePageUrl(
          typeof document !== "undefined" && document.referrer
            ? safePath(document.referrer)
            : location.pathname,
        ),
        clientMeta: captureClientMeta() as Record<string, string>,
      });

      // Upload after the row exists: a failed upload leaves a report without a
      // screenshot, which is legal, rather than an orphaned object.
      if (values.screenshot) {
        try {
          await uploadScreenshot(user.id, feedbackId, values.screenshot);
        } catch {
          toast.warning("Your report was sent, but the screenshot didn't upload.");
        }
      }

      setView({ kind: "sent", reference: referenceCode(feedbackId), intent });
      void refresh();
    } catch (err) {
      if (err instanceof FeedbackRateLimitError) {
        toast.error(err.message);
      } else {
        toast.error("We couldn't send that. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <SEOHead
        title="Feedback — Mogzy"
        description="Report a bug, request a feature, or tell us how Mogzy plays."
        path="/feedback"
        noindex
      />

      <header className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 gap-1.5 text-xs text-muted-foreground"
          onClick={() => navigate("/lol")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to the Academy
        </Button>
        <div className="flex items-center gap-2" style={{ color: GOLD }}>
          <span className="text-[10px] font-bold uppercase tracking-widest">Feedback</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">
          Help improve Mogzy
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Mogzy is early, and the fastest way it gets better is you telling us what's wrong.
        </p>
      </header>

      {view.kind === "sent" && (
        <SentPanel
          reference={view.reference}
          onAnother={() => setView({ kind: "choose" })}
        />
      )}

      {view.kind === "choose" && (
        <div data-testid="feedback-entry-choices" className="grid gap-3 sm:grid-cols-2">
          {ENTRY_CHOICES.map(({ intent, Icon, blurb }) => (
            <button
              key={intent}
              type="button"
              onClick={() => setView({ kind: "form", intent })}
              className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 text-left transition-colors hover:border-[#c9a84c]/60 hover:bg-card"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {ENTRY_INTENT_LABELS[intent]}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {view.kind === "form" && (
        <FeedbackForm
          intent={view.intent}
          defaultCategory={defaultCategory}
          submitting={submitting}
          onSubmit={values => void handleSubmit(view.intent, values)}
          onCancel={() => setView({ kind: "choose" })}
        />
      )}

      {view.kind !== "form" && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Your submissions
          </h2>
          {loadingSubmissions ? (
            <div className="space-y-2">
              {[0, 1].map(i => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              Nothing yet. Anything you send will show up here with its status.
            </p>
          ) : (
            <ul data-testid="feedback-submissions" className="space-y-2">
              {submissions.map(row => (
                <li
                  key={row.id}
                  className="rounded-xl border border-border/60 bg-card/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{row.title}</span>
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {FEEDBACK_STATUS_PUBLIC_LABELS[row.status as FeedbackStatus] ?? "Received"}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {ENTRY_INTENT_LABELS[row.entry_intent] ?? row.type}
                    </Badge>
                    <span>{row.category}</span>
                    <span className="ml-auto font-mono">{referenceCode(row.id)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Same-origin pathname from a referrer, or "/" when it is external or unparseable. */
function safePath(referrer: string): string {
  try {
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname;
  } catch {
    return "/";
  }
}

function SentPanel({ reference, onAnother }: { reference: string; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — you can select the code instead.");
    }
  };

  return (
    <div
      data-testid="feedback-confirmation"
      className="rounded-2xl border border-[#c9a84c]/40 bg-card/60 p-6 text-center"
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="h-5 w-5" />
      </div>
      <h2 className="mt-3 text-lg font-bold text-foreground">Thank you — that's in.</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We read every report. Your reference code is:
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm font-bold text-foreground transition-colors hover:bg-muted"
        aria-label={`Copy reference code ${reference}`}
      >
        {reference}
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <div className="mt-5">
        <Button variant="outline" size="sm" onClick={onAnother}>
          Send another
        </Button>
      </div>
    </div>
  );
}
