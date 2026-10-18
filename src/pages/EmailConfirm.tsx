// EMAIL1 — /email/confirm?t=<token>. The landing page for the double opt-in
// link. It does NOT confirm on load: mail scanners and link prefetchers open
// every URL in a message, and an automated GET must not be able to subscribe
// someone. A person presses the button.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import { confirmEmailToken } from "@/lib/email/subscription-client";
import { EMAIL_TOPIC_LABELS } from "@/lib/email/topics";

type Phase = "ready" | "working" | "confirmed" | "already" | "expired" | "invalid" | "suppressed" | "error";

export default function EmailConfirm() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [phase, setPhase] = useState<Phase>(token ? "ready" : "invalid");
  const [masked, setMasked] = useState<string | undefined>();
  const [topics, setTopics] = useState<string[]>([]);

  const confirm = async () => {
    setPhase("working");
    const r = await confirmEmailToken(token);
    if (!r.ok) return setPhase("error");
    setMasked(r.emailMasked);
    setTopics((r.topics ?? []).map((t) => EMAIL_TOPIC_LABELS[t] ?? t));
    setPhase(
      r.result === "confirmed" ? "confirmed"
        : r.result === "already_confirmed" ? "already"
        : r.result === "expired" ? "expired"
        : r.result === "suppressed" ? "suppressed"
        : "invalid",
    );
  };

  return (
    <div className="flex min-h-dvh items-start min-[768px]:items-center justify-center px-4 py-8">
      <SEOHead title="Confirm your email preferences — Mogzy" description="Confirm optional Mogzy emails." noindex />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 text-center space-y-4" data-testid="email-confirm">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>

        {(phase === "ready" || phase === "working") && (
          <>
            <h1 className="text-xl font-bold text-foreground">Confirm your subscription</h1>
            <p className="text-sm text-muted-foreground">
              Press the button to confirm you want these optional emails from Mogzy. If you didn&apos;t ask for
              them, just close this page — you won&apos;t be subscribed.
            </p>
            <Button variant="hero" className="w-full" onClick={confirm} disabled={phase === "working"} data-testid="email-confirm-button">
              {phase === "working" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm my subscription
            </Button>
          </>
        )}
        {phase === "confirmed" && (
          <>
            <h1 className="text-xl font-bold text-foreground">You&apos;re subscribed</h1>
            <p className="text-sm text-muted-foreground" data-testid="email-confirm-done">
              {masked ? `${masked} will now get: ` : "You'll now get: "}
              {topics.join(", ")}. Every email has an unsubscribe link, and you can change this any time in Settings.
            </p>
          </>
        )}
        {phase === "already" && (
          <>
            <h1 className="text-xl font-bold text-foreground">Already confirmed</h1>
            <p className="text-sm text-muted-foreground">This subscription is already active. Nothing more to do.</p>
          </>
        )}
        {phase === "expired" && (
          <>
            <h1 className="text-xl font-bold text-foreground">This link has expired</h1>
            <p className="text-sm text-muted-foreground">Open Settings → Email preferences and ask for a new confirmation email.</p>
          </>
        )}
        {phase === "suppressed" && (
          <>
            <h1 className="text-xl font-bold text-foreground">We can&apos;t email this address</h1>
            <p className="text-sm text-muted-foreground">Marketing email to this address has been turned off.</p>
          </>
        )}
        {phase === "invalid" && (
          <>
            <h1 className="text-xl font-bold text-foreground">This link isn&apos;t valid</h1>
            <p className="text-sm text-muted-foreground">It may have been used already, or replaced by a newer email. Check Settings → Email preferences.</p>
          </>
        )}
        {phase === "error" && (
          <>
            <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">We couldn&apos;t reach the server. Please try the link again in a moment.</p>
            <Button variant="outline" onClick={() => setPhase("ready")}>Try again</Button>
          </>
        )}

        <Link to="/" className="inline-block text-xs text-primary hover:underline">Back to Mogzy</Link>
      </div>
    </div>
  );
}
