// ---------------------------------------------------------------------------
// Admin · Custom one-time offers (PT1.6b).
//
// The owner mints a private link for ONE customer: $50 total for 12 months of
// Premium, paid once, never renewed. The link is shown exactly once — only its
// SHA-256 is stored — so it must be copied when it is created.
//
// Authority: every call is an owner RPC that re-checks the owner server side
// (`assert_owner`). Minting is a privilege grant and needs fresh MFA, like
// admin_set_pro_grant; listing and revoking need a trusted owner session.
// Nothing here can grant Premium: only a confirmed Stripe payment does.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Loader2, RefreshCw, Ticket } from "lucide-react";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import { supabase } from "@/integrations/supabase/client";
import { ownerActionNotice, runOwnerAction } from "@/lib/admin-auth/ownerAction";
import { formatGrantExpiry } from "@/lib/pro/entitlement";
import { CLAIM_STATUS_LABELS, claimLink, type CustomOfferClaimRow } from "@/lib/pro/customOffer";

export const ADMIN_CUSTOM_OFFERS_PATH = "/admin/custom-offers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcResult<T> = { data: T | null; error: { message?: string } | null };

export default function AdminCustomOffers() {
  const [rows, setRows] = useState<CustomOfferClaimRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("14");
  const [forUser, setForUser] = useState("");
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const outcome = await runOwnerAction({ level: "trusted", reason: "Viewing custom offers", idempotent: true }, async () =>
      (await supabase.rpc("owner_list_custom_offer_claims", { _limit: 200 })) as RpcResult<CustomOfferClaimRow[]>);
    setLoading(false);
    const notice = ownerActionNotice(outcome);
    if (notice || outcome.status !== "done") { setLoadError(notice); return; }
    if (outcome.result.error) { setLoadError(outcome.result.error.message ?? "Could not load offers"); return; }
    setLoadError(null);
    setRows(outcome.result.data ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 90) { toast.error("Link lifetime must be 1–90 days"); return; }
    const target = forUser.trim();
    if (target && !UUID_RE.test(target)) { toast.error("Customer account must be a user id (UUID), or blank"); return; }
    setCreating(true);
    setMinted(null);
    const outcome = await runOwnerAction({ level: "fresh", reason: "Creating a paid one-time offer link" }, async () =>
      (await supabase.rpc("owner_create_custom_offer_claim", {
        _note: note.trim() || null,
        _expires_at: new Date(Date.now() + n * 86400000).toISOString(),
        _for_user_id: target || null,
      })) as unknown as RpcResult<{ token: string }>);
    setCreating(false);
    const notice = ownerActionNotice(outcome);
    if (notice) { toast.info(notice); return; }
    if (outcome.status !== "done") return;
    const { data, error } = outcome.result;
    if (error || !data?.token) { toast.error(error?.message ?? "Could not create the offer link"); return; }
    setMinted(claimLink(window.location.origin, data.token));
    setNote("");
    setForUser("");
    void load();
  };

  const revoke = async (claimId: string) => {
    const outcome = await runOwnerAction({ level: "trusted", reason: "Revoking an offer link", idempotent: true }, async () =>
      (await supabase.rpc("owner_revoke_custom_offer_claim", { _claim_id: claimId })) as RpcResult<string>);
    const notice = ownerActionNotice(outcome);
    if (notice) { toast.info(notice); return; }
    if (outcome.status !== "done") return;
    const { data, error } = outcome.result;
    if (error) { toast.error(error.message ?? "Could not revoke"); return; }
    toast.success(data === "revoked" ? "Link revoked" : `Not revoked: ${String(data).replace(/_/g, " ")}`);
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <SEOHead title="Mogzy Admin · Custom offers" description="Private administration." path={ADMIN_CUSTOM_OFFERS_PATH} noindex />
      <AdminAuthGate>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Ticket className="h-5 w-5 text-primary" aria-hidden /> Custom one-time offers
            </h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Private links for one customer each: $50 total for 12 months of Premium, paid once, no auto-renewal.
              Premium turns on only when Stripe confirms the payment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
            </Button>
            <Link to="/admin/users" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Users
            </Link>
          </div>
        </header>

        <div className="space-y-4">
          <AdminPanel title="Create a link" description="The link is shown once. Copy it before leaving this page." testId="custom-offer-create">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Note (who it is for)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
              <Input placeholder="Valid for days (1–90)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
              <Input placeholder="Restrict to user id (optional)" value={forUser} onChange={(e) => setForUser(e.target.value)} />
            </div>
            <Button className="mt-3" size="sm" onClick={create} disabled={creating} data-testid="custom-offer-create-button">
              {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Create link
            </Button>
            {minted && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2" data-testid="custom-offer-minted">
                <code className="break-all text-xs">{minted}</code>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { void navigator.clipboard?.writeText(minted); toast.success("Copied"); }}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                </Button>
              </div>
            )}
          </AdminPanel>

          <AdminPanel title="Links" description="Newest first. 'Needs review' means a payment arrived that was not granted automatically — resolve it in Stripe (refund) or with a manual grant.">
            {loadError ? (
              <p role="alert" className="text-sm text-destructive">{loadError}</p>
            ) : !rows ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offer links yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="custom-offer-table">
                  <thead className="text-muted-foreground">
                    <tr><th className="p-1.5">Note</th><th className="p-1.5">Status</th><th className="p-1.5">Customer</th><th className="p-1.5">Premium until</th><th className="p-1.5">Link expires</th><th className="p-1.5" /></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.claim_id} className="border-t border-border/60">
                        <td className="p-1.5">{r.note ?? "—"}</td>
                        <td className="p-1.5">
                          {CLAIM_STATUS_LABELS[r.status] ?? r.status}
                          {r.review_reason ? ` (${r.review_reason.replace(/_/g, " ")})` : ""}
                        </td>
                        <td className="p-1.5">{r.customer_display_name ?? (r.customer_user_id ? r.customer_user_id.slice(0, 8) : "—")}</td>
                        <td className="p-1.5">{formatGrantExpiry(r.entitlement_ends_at) ?? "—"}</td>
                        <td className="p-1.5">{formatGrantExpiry(r.expires_at)}</td>
                        <td className="p-1.5 text-right">
                          {["unclaimed", "claimed", "checkout_open"].includes(r.status) && (
                            <Button size="sm" variant="ghost" onClick={() => void revoke(r.claim_id)}>Revoke</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        </div>
      </AdminAuthGate>
    </div>
  );
}
