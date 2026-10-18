// EMAIL1 — /email/unsubscribe?t=<token>. Reached from the footer link of every
// campaign. Works signed out and with the feature flag off: anyone holding an
// email must always be able to leave. A GET only SHOWS the page; the button
// does the unsubscribing (scanners follow links). Mail clients that support
// RFC 8058 one-click POST straight to the email-link function instead.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import { previewUnsubscribe, unsubscribeWithToken } from "@/lib/email/subscription-client";

type Phase = "loading" | "ready" | "working" | "done" | "invalid" | "error";

export default function EmailUnsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [phase, setPhase] = useState<Phase>(token ? "loading" : "invalid");
  const [masked, setMasked] = useState<string | undefined>();
  const [alreadyOut, setAlreadyOut] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    void previewUnsubscribe(token).then((r) => {
      if (!live) return;
      if (!r.ok) return setPhase("error");
      if (r.result !== "ok") return setPhase("invalid");
      setMasked(r.emailMasked);
      setPhase("ready");
    });
    return () => { live = false; };
  }, [token]);

  const leave = async () => {
    setPhase("working");
    const r = await unsubscribeWithToken(token);
    if (!r.ok) return setPhase("error");
    if (r.result === "invalid") return setPhase("invalid");
    setAlreadyOut(r.result === "already_unsubscribed");
    setMasked(r.emailMasked ?? masked);
    setPhase("done");
  };

  return (
    <div className="flex min-h-dvh items-start min-[768px]:items-center justify-center px-4 py-8">
      <SEOHead title="Unsubscribe — Mogzy" description="Unsubscribe from optional Mogzy emails." noindex />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 text-center space-y-4" data-testid="email-unsubscribe">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <MailX className="h-7 w-7 text-primary" />
        </div>

        {phase === "loading" && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />}
        {(phase === "ready" || phase === "working") && (
          <>
            <h1 className="text-xl font-bold text-foreground">Unsubscribe from Mogzy emails?</h1>
            <p className="text-sm text-muted-foreground">
              {masked ? <><strong>{masked}</strong> will stop receiving</> : "You will stop receiving"} Daily Challenge
              reminders, news, events and offers from Mogzy. Account emails (sign-in, password reset) are not affected.
            </p>
            <Button variant="hero" className="w-full" onClick={leave} disabled={phase === "working"} data-testid="email-unsubscribe-button">
              {phase === "working" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Unsubscribe
            </Button>
          </>
        )}
        {phase === "done" && (
          <>
            <h1 className="text-xl font-bold text-foreground">{alreadyOut ? "You were already unsubscribed" : "You're unsubscribed"}</h1>
            <p className="text-sm text-muted-foreground" data-testid="email-unsubscribe-done">
              {masked ? `${masked} won't get` : "You won't get"} any more marketing emails from Mogzy. You can opt back in any time in Settings.
            </p>
          </>
        )}
        {phase === "invalid" && (
          <>
            <h1 className="text-xl font-bold text-foreground">This link isn&apos;t valid</h1>
            <p className="text-sm text-muted-foreground">
              Sign in and use Settings → Email preferences to unsubscribe, or reply to the email and we&apos;ll take care of it.
            </p>
          </>
        )}
        {phase === "error" && (
          <>
            <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">We couldn&apos;t reach the server. Please try the link again in a moment.</p>
          </>
        )}

        <Link to="/" className="inline-block text-xs text-primary hover:underline">Back to Mogzy</Link>
      </div>
    </div>
  );
}
