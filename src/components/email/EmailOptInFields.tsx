// EMAIL1 — the two optional checkboxes on both signup surfaces (direct signup
// and guest upgrade). UNCHECKED by default and never pre-ticked by anything:
// the parent owns the state, and the only initial value it may pass is
// NO_SIGNUP_EMAIL_CHOICE. Renders nothing while the feature flag is off.

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { isEmailSubscriptionsEnabled } from "@/lib/email/flag";
import { CONSENT_TEXT, type SignupEmailChoice } from "@/lib/email/topics";

interface Props {
  idPrefix: string;
  value: SignupEmailChoice;
  /** A PATCH, so two quick clicks can never overwrite each other with a stale snapshot. */
  onChange: (patch: Partial<SignupEmailChoice>) => void;
  disabled?: boolean;
}

export default function EmailOptInFields({ idPrefix, value, onChange, disabled }: Props) {
  if (!isEmailSubscriptionsEnabled()) return null;
  return (
    <fieldset className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid="email-optin-fields">
      <legend className="px-1 text-xs font-semibold text-foreground">Emails from Mogzy (optional)</legend>
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-email-daily`}
          checked={value.daily}
          disabled={disabled}
          onCheckedChange={(c) => onChange({ daily: c === true })}
          data-testid="email-optin-daily"
          className="mt-0.5"
        />
        <Label htmlFor={`${idPrefix}-email-daily`} className="text-xs font-normal leading-snug text-foreground">
          Daily Challenge reminders
          <span className="block text-[11px] text-muted-foreground">{CONSENT_TEXT.daily_reminder}</span>
        </Label>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-email-news`}
          checked={value.news}
          disabled={disabled}
          onCheckedChange={(c) => onChange({ news: c === true })}
          data-testid="email-optin-news"
          className="mt-0.5"
        />
        <Label htmlFor={`${idPrefix}-email-news`} className="text-xs font-normal leading-snug text-foreground">
          New modes, features and events
          <span className="block text-[11px] text-muted-foreground">
            News about new Mogzy game modes and features, and Mogzy and League of Legends events.
          </span>
        </Label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        We&apos;ll email a link to confirm first — nothing is sent until you click it. Unsubscribe any time.
      </p>
    </fieldset>
  );
}
