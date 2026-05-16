import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Factor = { id: string; status: string; friendly_name?: string };

export default function TwoFactorAuth() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast.error(error.message);
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setEnrolling(false);
    if (error) { toast.error(error.message); return; }
    if (data) {
      setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    }
  };

  const verifyEnroll = async () => {
    if (!pending || code.length < 6) return;
    setVerifying(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: pending.factorId });
    if (cErr || !challenge) { setVerifying(false); toast.error(cErr?.message || "Challenge failed"); return; }
    const { error } = await supabase.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: challenge.id,
      code,
    });
    setVerifying(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Two-factor authentication enabled");
    setPending(null); setCode("");
    load();
  };

  const cancelEnroll = async () => {
    if (pending) await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    setPending(null); setCode("");
  };

  const removeFactor = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) { toast.error(error.message); return; }
    toast.success("Two-factor authentication disabled");
    load();
  };

  const verified = factors.filter((f) => f.status === "verified");

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-3">
      {verified.length > 0 ? (
        <div className="space-y-2">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.friendly_name || "Authenticator app"}</p>
                  <p className="text-xs text-muted-foreground">TOTP · Active</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => removeFactor(f.id)}>
                <ShieldOff className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No second factor enabled. Add an authenticator app (Google Authenticator, 1Password, Authy, etc.) for extra protection.</p>
      )}

      {!pending ? (
        <Button onClick={startEnroll} disabled={enrolling} variant={verified.length ? "outline" : "default"} className="w-full sm:w-auto">
          {enrolling ? "Preparing…" : verified.length ? "Add another authenticator" : "Enable authenticator app"}
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">Scan this QR code</p>
            <p className="text-xs text-muted-foreground">Open your authenticator app and scan the code, or paste the secret manually.</p>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <img src={pending.qr} alt="2FA QR code" className="h-40 w-40 rounded-md bg-white p-2" />
              <div className="flex-1 space-y-1 w-full">
                <Label className="text-xs">Secret</Label>
                <code className="block text-xs font-mono break-all bg-muted/30 rounded p-2 select-all">{pending.secret}</code>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Enter the 6-digit code from your app</Label>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={verifyEnroll} disabled={verifying || code.length < 6}>
              {verifying ? "Verifying…" : "Verify & enable"}
            </Button>
            <Button onClick={cancelEnroll} variant="ghost">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
