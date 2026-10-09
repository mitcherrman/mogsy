// OWN1 — MFA step-up for the owner on an unknown device (or when a sensitive
// action needs fresh aal2). Uses Supabase MFA; after verifying, the owner may
// enroll this browser as a trusted device.
import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enrollThisDevice } from "@/lib/admin-auth/ownerDevice";

interface Props {
  onVerified: () => void;
  /** Offer "trust this device" after verification. */
  offerTrust?: boolean;
  title?: string;
  /** Why MFA is being asked for (e.g. the sensitive action). */
  description?: string;
  /** Render without the full-page centring wrapper (inside a dialog). */
  embedded?: boolean;
}

export async function verifyTotp(code: string): Promise<{ ok: boolean; error?: string }> {
  const { data: factors, error: lfErr } = await supabase.auth.mfa.listFactors();
  if (lfErr) return { ok: false, error: "Couldn't load your verification methods." };
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "No authenticator app is set up on this account." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  return error ? { ok: false, error: "That code didn't work. Try the current one." } : { ok: true };
}

export function OwnerStepUp({
  onVerified,
  offerTrust = true,
  title = "Verify it's you",
  description = "Enter the code from your authenticator app to continue.",
  embedded = false,
}: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [trust, setTrust] = useState(true);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const r = await verifyTotp(code);
    setCode("");
    if (!r.ok) {
      setBusy(false);
      return setError(r.error ?? "Verification failed.");
    }
    if (offerTrust && trust) await enrollThisDevice("Owner browser");
    setBusy(false);
    setVerified(true);
    onVerified();
  };

  const body = (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-muted/20 p-5" data-testid="owner-step-up-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        aria-label="Verification code"
        data-testid="owner-step-up-code"
      />
      {offerTrust && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          Trust this browser for 30 days
        </label>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <Button size="sm" className="w-full" disabled={busy || verified} onClick={() => void submit()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Verify"}
      </Button>
    </div>
  );
  if (embedded) return <div data-testid="owner-step-up">{body}</div>;
  return (
    <div className="flex flex-1 items-center justify-center p-6" data-testid="owner-step-up">
      {body}
    </div>
  );
}
