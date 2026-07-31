// ---------------------------------------------------------------------------
// Admin · Platform Policies — the global access/tutorial/navigation switches.
//
// Registered under AdminRoute in App.tsx and additionally wrapped in the shared
// AdminAuthGate, exactly like /admin/directory. Neither of those is the real
// security boundary: writes go straight to `public.app_settings`, whose RLS
// policies allow INSERT/UPDATE only to has_role(auth.uid(), 'admin'). A
// non-admin who bypasses the client-side route still gets rejected by Postgres.
//
// No arbitrary key/value writes: the mutation helper only ever sends one of the
// keys declared in lib/platform-policy/policy.ts, with a `{enabled: bool}` body
// it constructs itself. Nothing here is user-supplied.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PLATFORM_POLICY,
  POLICY_KEYS,
  parsePlatformPolicy,
  type PlatformPolicy,
} from "@/lib/platform-policy/policy";

export const ADMIN_PLATFORM_POLICIES_PATH = "/admin/platform-policies";

type PolicyField =
  | "combatSimTokens"
  | "tutorialAutoPopup"
  | "tutorialCompletionRequired"
  | "globalNavbar";

const CONTROLS: {
  field: PolicyField;
  settingKey: string;
  label: string;
  description: string;
  /** Shown only when the switch is OFF — disabling is the material change. */
  offWarning: string;
}[] = [
  {
    field: "combatSimTokens",
    settingKey: POLICY_KEYS.combatSimTokensRequiredForNonPro,
    label: "Combat Sim Token Requirement",
    description: "Require non-Pro users to use Combat Sim tokens.",
    offWarning:
      "Non-Pro users get unlimited Combat Sim runs and are not charged tokens. Existing balances and history are preserved, and turning this back on resumes metering from each user's real balance. Pro is unaffected either way.",
  },
  {
    field: "tutorialAutoPopup",
    settingKey: POLICY_KEYS.tutorialAutoPopupEnabled,
    label: "Automatic Tutorial Popup",
    description: "Automatically show the tutorial when a new user enters Mogzy.",
    offWarning:
      "New users see no tutorial popup. The tutorial still exists and stays available at /quiz/tutorial, and the requirement below is unaffected — if it is on, users are still sent into the tutorial, just without the popup.",
  },
  {
    field: "tutorialCompletionRequired",
    settingKey: POLICY_KEYS.tutorialCompletionRequiredForNewUsers,
    label: "Required New-User Tutorial",
    description: "Require new users to complete the tutorial before continuing.",
    offWarning:
      "New users can enter Leaguecraft without completing the tutorial. No completion history is erased — anyone who finishes it is still recorded — so turning this back on immediately uses each account's real completion state.",
  },
  {
    field: "globalNavbar",
    settingKey: POLICY_KEYS.globalNavbarVisible,
    label: "Show global navbar",
    description:
      "Display the standard Mogzy navigation bar across public and authenticated pages.",
    offWarning:
      "This control is prepared but is not yet connected to navbar visibility. Turning it off does not hide navigation today — the value is stored and will take effect in Phase 2, once replacement access to Profile, Settings, notifications, and admin tools exists.",
  },
];

function flatten(policy: PlatformPolicy): Record<PolicyField, boolean> {
  return {
    combatSimTokens: policy.combatSim.tokensRequiredForNonPro,
    tutorialAutoPopup: policy.tutorial.autoPopupEnabled,
    tutorialCompletionRequired: policy.tutorial.completionRequiredForNewUsers,
    globalNavbar: policy.navigation.globalNavbarVisible,
  };
}

export default function AdminPlatformPolicies() {
  const [values, setValues] = useState(flatten(DEFAULT_PLATFORM_POLICY));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PolicyField | null>(null);
  const [saved, setSaved] = useState<PolicyField | null>(null);
  const [saveError, setSaveError] = useState<{ field: PolicyField; message: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value, updated_at");
    if (error) {
      // Surface the failure instead of silently showing the fail-closed
      // defaults as if they were the stored values.
      setLoadError("Couldn't load the current settings. Values shown are defaults.");
      setValues(flatten(DEFAULT_PLATFORM_POLICY));
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as { key: string; value: unknown; updated_at: string | null }[];
    setValues(flatten(parsePlatformPolicy(rows)));
    setUpdatedAt(Object.fromEntries(rows.map((r) => [r.key, r.updated_at])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Write one setting. Deliberately NOT optimistic: local state changes only
   * after the server confirms, so the switch can never show a value that was
   * not actually saved.
   */
  const toggle = async (field: PolicyField, settingKey: string) => {
    if (pending) return;
    const next = !values[field];
    setPending(field);
    setSaved(null);
    setSaveError(null);

    // upsert, not update: a deployment that never ran the seed still works, and
    // the row is keyed so this can only ever touch this one known setting.
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: settingKey, value: { enabled: next } }, { onConflict: "key" });

    if (error) {
      setPending(null);
      setSaveError({
        field,
        message:
          error.code === "42501" || /policy|permission/i.test(error.message ?? "")
            ? "Not authorized to change global settings."
            : "Couldn't save. Nothing was changed.",
      });
      return;
    }

    // Re-read so the displayed state is the server's, not our assumption.
    const { data, error: readError } = await supabase
      .from("app_settings")
      .select("key, value, updated_at")
      .eq("key", settingKey)
      .maybeSingle();
    setPending(null);
    if (readError || !data) {
      setSaveError({ field, message: "Saved, but couldn't confirm. Reload to verify." });
      return;
    }
    // Merge only THIS field: parsing a single row yields defaults for the other
    // two, which would clobber their real values.
    const confirmed = flatten(
      parsePlatformPolicy([data as { key: string; value: unknown }]),
    )[field];
    setValues((prev) => ({ ...prev, [field]: confirmed }));
    setUpdatedAt((prev) => ({
      ...prev,
      [settingKey]: (data as { updated_at: string | null }).updated_at,
    }));
    setSaved(field);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <SEOHead
        title="Mogzy Admin · Platform Policies"
        description="Global platform access and tutorial policies."
        path={ADMIN_PLATFORM_POLICIES_PATH}
        noindex
      />

      <AdminAuthGate>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden />
              Platform Policies
            </h1>
            <p className="text-xs text-muted-foreground">
              These switches are <strong>global</strong> — every change applies to all
              users immediately.
            </p>
          </div>
          <Link
            to="/admin/directory"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Admin directory
          </Link>
        </header>

        {loading ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="policies-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading settings…
          </p>
        ) : (
          <div className="space-y-3">
            {loadError && (
              <p role="alert" data-testid="policies-load-error"
                 className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loadError}
              </p>
            )}

            {CONTROLS.map((control) => {
              const on = values[control.field];
              const busy = pending === control.field;
              const error = saveError?.field === control.field ? saveError.message : null;
              const stamp = updatedAt[control.settingKey];
              return (
                <section
                  key={control.field}
                  className="rounded-lg border bg-card p-4"
                  data-testid={`policy-${control.field}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`switch-${control.field}`}
                        className="text-sm font-semibold"
                      >
                        {control.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{control.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {busy && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                                 aria-hidden />
                      )}
                      <Switch
                        id={`switch-${control.field}`}
                        checked={on}
                        disabled={pending !== null}
                        onCheckedChange={() => void toggle(control.field, control.settingKey)}
                      />
                    </div>
                  </div>

                  {!on && (
                    <p
                      className="mt-3 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                      data-testid={`policy-warning-${control.field}`}
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{control.offWarning}</span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {error ? (
                      <span role="alert" className="text-destructive"
                            data-testid={`policy-error-${control.field}`}>
                        {error}
                      </span>
                    ) : saved === control.field ? (
                      <span role="status" className="text-emerald-600 dark:text-emerald-400"
                            data-testid={`policy-saved-${control.field}`}>
                        Saved.
                      </span>
                    ) : null}
                    {stamp && (
                      <span className="text-muted-foreground">
                        Last changed {new Date(stamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                </section>
              );
            })}

            <p className="flex items-start gap-2 pt-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Changes are authorized and recorded server-side. The Combat Sim
                requirement is additionally enforced by the simulation backend, which
                keeps enforcement ON if the setting cannot be read.
              </span>
            </p>
          </div>
        )}
      </AdminAuthGate>
    </div>
  );
}
