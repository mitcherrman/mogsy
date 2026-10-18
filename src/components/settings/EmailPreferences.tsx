// EMAIL1 — Settings › Email preferences. Optional Daily Challenge reminders and
// Mogzy news. Shown only while the feature flag is on.
//
// Model the copy has to be honest about: asking creates a PENDING request and
// emails a confirmation link to the account's own address; nothing is
// subscribed until that link is clicked. Changing topics on an already
// confirmed address is immediate; leaving is always one click.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { isEmailSubscriptionsEnabled } from "@/lib/email/flag";
import {
  fetchOwnSubscription, requestEmailSubscription, setEmailTopics, unsubscribeSelf, type OwnSubscription,
} from "@/lib/email/subscription-client";
import { CONSENT_TEXT, EMAIL_TOPICS, EMAIL_TOPIC_LABELS, type EmailTopic } from "@/lib/email/topics";

export default function EmailPreferences() {
  const { user } = useAuth();
  const enabled = isEmailSubscriptionsEnabled();
  const eligible = !!user && user.is_anonymous !== true && !!user.email;
  const [sub, setSub] = useState<OwnSubscription | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<EmailTopic[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.email) return;
    const s = await fetchOwnSubscription(user.id, user.email);
    setSub(s);
    setSelected(s?.status === "subscribed" ? s.topics : s?.status === "pending" ? s.pendingTopics : []);
    setLoaded(true);
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (enabled && eligible) void refresh();
  }, [enabled, eligible, refresh]);

  if (!enabled) return null;

  const status = sub?.status ?? "none";
  const toggle = (t: EmailTopic, on: boolean) =>
    setSelected((cur) => (on ? Array.from(new Set([...cur, t])) : cur.filter((x) => x !== t)));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const sendConfirmation = () =>
    run(async () => {
      const r = await requestEmailSubscription(selected);
      if (!r.ok) return void toast.error("Couldn't save your email preferences. Please try again.");
      if (r.result === "confirmation_required") {
        if (r.emailSent) toast.success("Check your inbox — click the link to confirm.");
        else toast.error("We saved your request but couldn't send the confirmation email yet. Try again in a minute.");
      } else if (r.result === "throttled") toast.message("A confirmation email was just sent. Give it a minute, then try again.");
      else if (r.result === "suppressed") toast.error("We can't email this address.");
      else if (r.result === "updated") toast.success("Email preferences updated.");
      await refresh();
    });

  const saveTopics = () =>
    run(async () => {
      const r = await setEmailTopics(selected);
      if (!r.ok) return void toast.error("Couldn't save your email preferences. Please try again.");
      toast.success(selected.length === 0 ? "You're unsubscribed." : "Email preferences saved.");
      await refresh();
    });

  const leave = () =>
    run(async () => {
      const r = await unsubscribeSelf();
      if (!r.ok) return void toast.error("Couldn't unsubscribe. Please try again.");
      toast.success("You're unsubscribed. No more emails from us.");
      await refresh();
    });

  return (
    <motion.section
      id="email-preferences"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-2xl border border-border bg-card p-5"
      data-testid="email-preferences"
    >
      <h2 className="font-bold text-foreground mb-1 flex items-center gap-2">
        <Mail className="h-4 w-4" /> Email preferences
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Optional. Mogzy never emails you about these unless you ask and confirm. Account emails
        (sign-in, password reset) are separate and always sent.
      </p>

      {!eligible ? (
        <p className="text-sm text-muted-foreground" data-testid="email-prefs-needs-account">
          Create an account to choose emails from Mogzy.
        </p>
      ) : !loaded ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : status === "suppressed" ? (
        <p className="text-sm text-muted-foreground" data-testid="email-prefs-suppressed">
          We can&apos;t send marketing email to {user!.email} (it bounced or was marked as spam). Account
          emails are unaffected.
        </p>
      ) : (
        <div className="space-y-3">
          {status === "pending" && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground" data-testid="email-prefs-pending">
              Waiting for your confirmation. We emailed a link to <strong>{user!.email}</strong> — click it to start
              receiving these emails. Nothing is sent until you do.
            </p>
          )}
          {status === "subscribed" && (
            <p className="text-xs text-muted-foreground" data-testid="email-prefs-subscribed">
              Subscribed at <strong>{user!.email}</strong>.
            </p>
          )}
          {status === "unsubscribed" && (
            <p className="text-xs text-muted-foreground" data-testid="email-prefs-unsubscribed">
              You&apos;re unsubscribed. You can choose topics again below; we&apos;ll ask you to confirm by email first.
            </p>
          )}

          <div className="space-y-2">
            {EMAIL_TOPICS.map((t) => (
              <div key={t} className="flex items-start gap-2">
                <Checkbox
                  id={`email-topic-${t}`}
                  checked={selected.includes(t)}
                  disabled={busy}
                  onCheckedChange={(c) => toggle(t, c === true)}
                  data-testid={`email-topic-${t}`}
                  className="mt-0.5"
                />
                <Label htmlFor={`email-topic-${t}`} className="text-sm font-normal leading-snug">
                  {EMAIL_TOPIC_LABELS[t]}
                  <span className="block text-[11px] text-muted-foreground">{CONSENT_TEXT[t]}</span>
                </Label>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {status === "subscribed" ? (
              <>
                <Button size="sm" onClick={saveTopics} disabled={busy} data-testid="email-prefs-save">
                  Save preferences
                </Button>
                <Button size="sm" variant="outline" onClick={leave} disabled={busy} data-testid="email-prefs-unsubscribe">
                  Unsubscribe from all
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={sendConfirmation}
                disabled={busy || selected.length === 0}
                data-testid="email-prefs-request"
              >
                {status === "pending" ? "Resend confirmation email" : "Email me a confirmation link"}
              </Button>
            )}
            {status === "pending" && (
              <Button size="sm" variant="outline" onClick={leave} disabled={busy} data-testid="email-prefs-cancel">
                Cancel request
              </Button>
            )}
          </div>
        </div>
      )}
    </motion.section>
  );
}
