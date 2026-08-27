// ---------------------------------------------------------------------------
// Settings → Account Connections.
//
// Verified Discord and Riot identities attached to the Mogzy account. These are
// LINKED identities, not sign-in methods: nothing on this surface changes the
// Supabase session, and the Mogzy account remains primary.
//
// THE CONFIRMATION STEP IS NOT DECORATION
// A ticket returning from the provider is redeemed only after the user sees
// which account it belongs to and explicitly confirms. Redemption is atomic
// and irreversible, a person may be signed into the wrong Discord account, and
// without a confirm step merely reopening a URL from history would re-link.
//
// THE TICKET LIVES IN COMPONENT STATE AND NOWHERE ELSE
// It is read from the query string once, the address bar is cleaned in the same
// tick, and it is never written to localStorage, sessionStorage, a database,
// telemetry or a log. Stripping the URL is also what stops a reload from
// replaying the flow and looping a toast.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Gamepad2,
  Link2,
  Loader2,
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import {
  confirmationPrompt,
  disconnectIdentityLink,
  fetchIdentityLinks,
  fetchProviderAvailability,
  identityLabel,
  previewIdentityLink,
  readCallbackParams,
  redeemIdentityLink,
  setIdentityPreference,
  startIdentityLink,
  stripCallbackParams,
  type IdentityLink,
  type IdentityProvider,
  type PreviewIdentity,
  type ProviderAvailability,
} from "@/lib/identity/connections";

type Notice = { tone: "success" | "error"; text: string } | null;

const PROVIDER_NAME: Record<IdentityProvider, string> = {
  discord: "Discord",
  riot: "Riot",
};

/** One message per return, chosen from the callback's status field. */
export function statusNotice(provider: IdentityProvider, status: string | null): Notice {
  const name = PROVIDER_NAME[provider];
  switch (status) {
    case "denied":
      return { tone: "error", text: `${name} connection cancelled.` };
    case "already_linked":
      return { tone: "error", text: `That ${name} account is already linked to another Mogzy account.` };
    case "unavailable":
      return { tone: "error", text: `${name} verification is not available right now.` };
    default:
      return { tone: "error", text: `${name} connection could not be completed.` };
  }
}

function stamp(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : null;
}

export default function AccountConnections() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isGuest = !user || user.is_anonymous === true;

  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [links, setLinks] = useState<IdentityLink[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<IdentityProvider | null>(null);

  // The in-flight ceremony. Ticket held here only.
  const [ticket, setTicket] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<IdentityProvider | null>(null);
  const [preview, setPreview] = useState<PreviewIdentity | null>(null);
  const [confirming, setConfirming] = useState(false);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    const [avail, list] = await Promise.all([
      fetchProviderAvailability(),
      userId ? fetchIdentityLinks(userId).catch(() => [] as IdentityLink[]) : Promise.resolve([]),
    ]);
    setAvailability(avail);
    setLinks(list);
  }, [userId]);

  // Mount: consume the callback query, clean the address bar, then load state.
  useEffect(() => {
    if (isGuest) {
      setAvailability({ discord: false, riot: false });
      setLinks([]);
      return;
    }
    const params = readCallbackParams(window.location.search);
    if (params.provider) {
      // Strip BEFORE anything async, so the ticket cannot survive a reload.
      window.history.replaceState({}, "", stripCallbackParams(window.location.href));
      if (params.status === "pending" && params.ticket) {
        setPendingProvider(params.provider);
        setTicket(params.ticket);
      } else {
        setNotice(statusNotice(params.provider, params.status));
      }
    }
    void load();
  }, [isGuest, load]);

  // Resolve which account the ticket refers to. Consumes nothing.
  useEffect(() => {
    if (!ticket) return;
    let cancelled = false;
    previewIdentityLink(ticket)
      .then((identity) => {
        if (!cancelled) setPreview(identity);
      })
      .catch(() => {
        if (cancelled) return;
        setTicket(null);
        setPendingProvider(null);
        setPreview(null);
        setNotice({ tone: "error", text: "That connection request has expired. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [ticket]);

  const abandon = () => {
    setTicket(null);
    setPendingProvider(null);
    setPreview(null);
    setConfirming(false);
  };

  const handleConfirm = async () => {
    if (!ticket || !preview) return;
    setConfirming(true);
    try {
      await redeemIdentityLink(ticket);
      abandon();
      await load();
      setNotice({ tone: "success", text: `${PROVIDER_NAME[preview.provider]} account connected.` });
    } catch {
      const provider = preview.provider;
      abandon();
      setNotice(statusNotice(provider, "error"));
    }
  };

  const handleConnect = async (provider: IdentityProvider) => {
    setBusy(provider);
    setNotice(null);
    try {
      const url = await startIdentityLink(provider);
      window.location.assign(url);
    } catch {
      setBusy(null);
      setNotice(statusNotice(provider, "unavailable"));
    }
  };

  const handleDisconnect = async (provider: IdentityProvider) => {
    setBusy(provider);
    try {
      await disconnectIdentityLink(provider);
      await load();
      setNotice({ tone: "success", text: `${PROVIDER_NAME[provider]} account disconnected.` });
    } catch {
      setNotice({ tone: "error", text: `Could not disconnect ${PROVIDER_NAME[provider]}.` });
    } finally {
      setBusy(null);
    }
  };

  const handlePreference = async (
    provider: IdentityProvider,
    patch: { contactConsent?: boolean; publicOnProfile?: boolean },
  ) => {
    // Optimistic, reverted by a reload if the write is refused.
    setLinks((current) =>
      (current ?? []).map((l) =>
        l.provider !== provider
          ? l
          : {
              ...l,
              contactConsent: patch.contactConsent ?? l.contactConsent,
              publicOnProfile: patch.publicOnProfile ?? l.publicOnProfile,
            },
      ),
    );
    try {
      if (!userId) throw new Error("no_user");
      await setIdentityPreference(userId, provider, patch);
    } catch {
      setNotice({ tone: "error", text: "That preference could not be saved." });
      await load();
    }
  };

  const linkFor = (provider: IdentityProvider) =>
    (links ?? []).find((l) => l.provider === provider) ?? null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.09 }}
      className="rounded-2xl border border-border bg-card p-6 mb-6"
      data-testid="account-connections"
    >
      <h2 className="font-bold text-foreground mb-1 flex items-center gap-2">
        <Link2 className="h-4 w-4" /> Account Connections
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Verify that you own an external account and attach it to Mogzy. These are linked
        identities — you still sign in with your Mogzy account.
      </p>

      {notice && (
        <p
          data-testid="connections-notice"
          role="status"
          className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
            notice.tone === "success"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {notice.text}
        </p>
      )}

      {isGuest ? (
        <div data-testid="connections-guest" className="rounded-xl border border-border bg-background/40 p-4">
          <p className="text-sm text-muted-foreground mb-3">
            Connecting a Discord or Riot account needs a saved Mogzy account.
          </p>
          <Button
            variant="default"
            className="w-full sm:w-auto"
            data-testid="connections-create-account"
            onClick={() => navigate("/auth?mode=signup&returnTo=%2Fsettings")}
          >
            <UserPlus className="h-4 w-4 mr-2" /> Save progress / Create account
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <ProviderRow
            provider="discord"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            available={availability?.discord ?? null}
            link={linkFor("discord")}
            busy={busy === "discord"}
            pending={pendingProvider === "discord" ? preview : null}
            confirming={confirming}
            onConnect={() => handleConnect("discord")}
            onDisconnect={() => handleDisconnect("discord")}
            onConfirm={handleConfirm}
            onCancel={abandon}
            onPreference={(patch) => handlePreference("discord", patch)}
          />
          <ProviderRow
            provider="riot"
            icon={<Gamepad2 className="h-3.5 w-3.5" />}
            available={availability?.riot ?? null}
            link={linkFor("riot")}
            busy={busy === "riot"}
            pending={pendingProvider === "riot" ? preview : null}
            confirming={confirming}
            onConnect={() => handleConnect("riot")}
            onDisconnect={() => handleDisconnect("riot")}
            onConfirm={handleConfirm}
            onCancel={abandon}
            onPreference={(patch) => handlePreference("riot", patch)}
          />
        </div>
      )}
    </motion.section>
  );
}

interface RowProps {
  provider: IdentityProvider;
  icon: React.ReactNode;
  /** null while availability is still loading. */
  available: boolean | null;
  link: IdentityLink | null;
  busy: boolean;
  /** The identity awaiting confirmation, when the ceremony is for this row. */
  pending: PreviewIdentity | null;
  confirming: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onPreference: (patch: { contactConsent?: boolean; publicOnProfile?: boolean }) => void;
}

function ProviderRow({
  provider,
  icon,
  available,
  link,
  busy,
  pending,
  confirming,
  onConnect,
  onDisconnect,
  onConfirm,
  onCancel,
  onPreference,
}: RowProps) {
  const name = PROVIDER_NAME[provider];
  const verifiedOn = stamp(link?.verifiedAt ?? null);

  return (
    <div
      className="rounded-xl border border-border bg-background/40 p-4"
      data-testid={`connection-${provider}`}
    >
      <div className="flex items-center justify-between gap-4">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          {name}
        </Label>
        {link && (
          <span
            data-testid={`connection-${provider}-verified`}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary"
          >
            <BadgeCheck className="h-3 w-3" /> Verified
          </span>
        )}
      </div>

      {/* --- confirmation takes precedence over every other state ---------- */}
      {pending ? (
        <div className="mt-3" data-testid={`connection-${provider}-confirm`}>
          <p className="text-sm text-foreground">{confirmationPrompt(pending)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            This attaches the account to Mogzy. Nothing is saved until you confirm.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={confirming}
              onClick={onConfirm}
              data-testid={`connection-${provider}-confirm-button`}
            >
              {confirming ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4 mr-2" />
              )}
              Confirm {name} Connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={confirming}
              onClick={onCancel}
              data-testid={`connection-${provider}-cancel-button`}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : available === null ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid={`connection-${provider}-loading`}>
          <Loader2 className="inline h-3 w-3 mr-1 animate-spin" /> Checking availability…
        </p>
      ) : !available && !link ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid={`connection-${provider}-unavailable`}>
          {provider === "riot"
            ? "Riot account verification is not available yet."
            : "Discord account verification is not available yet."}
        </p>
      ) : link ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            {link.avatarUrl && (
              <img
                src={link.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-6 w-6 rounded-full"
              />
            )}
            <span className="text-sm text-foreground" data-testid={`connection-${provider}-identity`}>
              {identityLabel(link)}
            </span>
          </div>
          {verifiedOn && (
            <p className="mt-1 text-[11px] text-muted-foreground">Verified {verifiedOn}</p>
          )}

          <div className="mt-3 space-y-2">
            {/* Discord only. Riot has no contact channel we would use. */}
            {provider === "discord" && (
              <SwitchRow
                testId="connection-discord-consent"
                label="Allow Mogzy to contact me on Discord for playtests, feedback, or account follow-up"
                checked={link.contactConsent}
                onChange={(v) => onPreference({ contactConsent: v })}
              />
            )}
            <SwitchRow
              testId={`connection-${provider}-public`}
              label={`Show my verified ${name} account on my public Mogzy profile`}
              hint="Saved now. Public profiles do not display connected accounts yet."
              checked={link.publicOnProfile}
              onChange={(v) => onPreference({ publicOnProfile: v })}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !available}
              onClick={onConnect}
              data-testid={`connection-${provider}-reconnect`}
            >
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={onDisconnect}
              data-testid={`connection-${provider}-disconnect`}
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">Not connected.</p>
          <Button
            size="sm"
            disabled={busy}
            onClick={onConnect}
            data-testid={`connection-${provider}-connect`}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Connect {name}
          </Button>
        </div>
      )}
    </div>
  );
}

function SwitchRow({
  testId,
  label,
  hint,
  checked,
  onChange,
}: {
  testId: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>}
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}
