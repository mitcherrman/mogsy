// ---------------------------------------------------------------------------
// Operations — configuration, health, jobs, data operations, docs, Danger Zone.
//
// Configuration is the one place all three configuration stores are visible
// together. It does NOT unify them: no setting is migrated, no fourth
// authority is created, and each store is labelled with the authority that
// actually owns it. The Supabase-owned panels are the same components the
// legacy dashboard mounted, with the same master-only gating.
//
// Danger Zone is a first-class destination rather than a styling treatment on
// scattered buttons. It documents and links destructive capabilities; it does
// not arm any that lacks a safe UI today. Navigating here executes nothing.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminOnboarding from "@/components/admin/AdminOnboarding";
import AdminTutorialTips from "@/components/admin/AdminTutorialTips";
import AdminBanners from "@/components/admin/AdminBanners";
import {
  AdminAreaHeader,
  AdminCrossLink,
  AdminPanel,
  AdminToolGrid,
  useAreaSection,
} from "@/components/admin/shell/AdminAreaPage";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { exportAdminCSV } from "@/lib/admin-csv-export";
import { AdminOpsError, fetchDbStatus, type DbStatus } from "@/lib/admin/adminOpsApi";
import { ADMIN_AREAS_BY_ID, toolsForSection } from "@/lib/admin/admin-registry";
import { cn } from "@/lib/utils";

const CONFIG_AUTHORITIES = [
  {
    id: "supabase",
    label: "Platform · Supabase / Lovable",
    detail:
      "app_settings rows, edited here and enforced by RLS. One key — combat_sim_tokens_required_for_non_pro — is also read by the Python backend, and is the only place the two systems share an authority.",
  },
  {
    id: "railway",
    label: "Backend · Railway",
    detail:
      "Environment variables on the deployed backend, including the Ranked flag set. Readable through launch-readiness; never written from Admin.",
  },
  {
    id: "patch-ops",
    label: "Patch Ops",
    detail:
      "Patch intake and apply configuration, owned by the backend pipeline and its two-directional production gate.",
  },
  {
    id: "build",
    label: "Build · Vite",
    detail: "Build-time flags baked into the deployed bundle. Changed only at deploy time.",
  },
] as const;

function ConfigurationSection({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  return (
    <div className="space-y-4">
      <AdminPanel
        title="Configuration authorities"
        description="Four stores, listed by who owns them. Nothing is migrated between them and no store is declared authoritative — that is an owner decision, not a navigation one."
        testId="operations-config-authorities"
      >
        <ul className="space-y-2">
          {CONFIG_AUTHORITIES.map((a) => (
            <li key={a.id} className="rounded-md border border-border bg-muted/20 p-2.5">
              <p className="text-[11px] font-semibold">{a.label}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{a.detail}</p>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <AdminPanel
        title="Onboarding stores"
        description="Three live onboarding configurations exist in three places. They are shown together for the first time; none is migrated and none is made authoritative here."
        testId="operations-onboarding-stores"
      >
        <ul className="space-y-1.5 text-[11px] text-muted-foreground">
          <li>
            <code>quiz_onboarding_config</code> — gates the Leaguecraft quiz. Edited at{" "}
            <AdminCrossLink to="/quiz/admin" label="Quiz Reports & Overrides" />.
          </li>
          <li>
            <code>onboarding_config</code> — legacy Mogsy onboarding. Edited below (master only).
          </li>
          <li>
            <code>tutorial_auto_popup_enabled</code> / <code>tutorial_completion_required_for_new_users</code>{" "}
            — the current policy layer. Edited at{" "}
            <AdminCrossLink to="/admin/platform-policies" label="Platform Policies" />.
          </li>
        </ul>
      </AdminPanel>

      <AdminPanel
        title="Banners"
        description="Home and navbar banner configuration. Appears site-wide immediately."
      >
        <AdminBanners />
      </AdminPanel>

      <AdminPanel
        title="Tutorial tips"
        description="In-product tutorial tip content. The Ranked tutorial and onboarding flows are out of scope and untouched."
      >
        <AdminTutorialTips />
      </AdminPanel>

      {isMasterAdmin ? (
        <>
          <AdminPanel
            title="App settings"
            description="maintenance_mode, nav_tab_mode, favorites_mode and shop_ad_config. Master-only in the UI, exactly as before."
            testId="operations-app-settings"
          >
            <AdminSettings />
          </AdminPanel>
          <AdminPanel
            title="Onboarding config (legacy)"
            description="The legacy Mogsy onboarding_config store. Master-only in the UI, exactly as before."
            testId="operations-onboarding-config"
          >
            <AdminOnboarding />
          </AdminPanel>
        </>
      ) : (
        <p
          className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground"
          data-testid="operations-master-only-note"
        >
          App settings and the legacy onboarding config are master-admin surfaces. They are hidden
          here exactly as they were hidden on the legacy dashboard — no permission has changed.
        </p>
      )}

      <AdminToolGrid tools={toolsForSection("operations", "configuration")} />
    </div>
  );
}

function DbStatusPanel() {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<
    { state: "loading" } | { state: "ok"; data: DbStatus } | { state: "error"; message: string }
  >({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    setResult({ state: "loading" });
    void fetchDbStatus()
      .then((data) => !cancelled && setResult({ state: "ok", data }))
      .catch(
        (err: unknown) =>
          !cancelled &&
          setResult({
            state: "error",
            message: err instanceof AdminOpsError ? err.message : "Unexpected error.",
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return (
    <AdminPanel
      title="Database status"
      description="GET /api/admin/db/status — what the running backend sees at its database path. Read-only; the restore endpoint on the same router is not armed here."
      testId="operations-db-status"
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={() => setNonce((n) => n + 1)}
        >
          <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
        </Button>
      }
    >
      {result.state === "loading" && (
        <p className="text-[11px] text-muted-foreground">Reading database status…</p>
      )}
      {result.state === "error" && (
        <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
          {result.message}
        </p>
      )}
      {result.state === "ok" && (
        <div className="space-y-2 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              healthy: <strong>{String(result.data.healthy ?? false)}</strong>
            </span>
            <span>size: {result.data.size_bytes.toLocaleString()} bytes</span>
            {result.data.identity_db && (
              <span>identity DB present: {String(result.data.identity_db.present)}</span>
            )}
          </div>
          <ul className="flex flex-wrap gap-2">
            {Object.entries(result.data.row_counts ?? {}).map(([table, count]) => (
              <li key={table} className="rounded border border-border px-2 py-0.5 tabular-nums">
                {table}: <strong>{count}</strong>
              </li>
            ))}
          </ul>
          {result.data.restore_limits && (
            <p className="text-muted-foreground">
              Restore limits in force: max {result.data.restore_limits.max_upload_bytes.toLocaleString()}{" "}
              bytes; destinations confined to{" "}
              {result.data.restore_limits.allowed_destination_dirs.join(", ") || "(the process DB path)"}.
            </p>
          )}
        </div>
      )}
    </AdminPanel>
  );
}

function DangerZone({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  return (
    <div className="space-y-4" data-testid="operations-danger-zone">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden />
          <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          High-impact and destructive capabilities, gathered so they can be seen — not so they can
          be triggered faster. Nothing on this page executes anything by navigation alone. Where a
          capability has no safe UI today, it is documented rather than given a button: a one-click
          control is a different risk profile than a deliberate command, and every existing backend
          safeguard is preserved untouched.
        </p>
      </div>

      <AdminToolGrid tools={toolsForSection("operations", "danger-zone")} />

      <AdminPanel
        title="Where the destructive controls actually live"
        description="Each is reached at its existing home with its existing confirmation. Nothing is duplicated as a second trigger."
      >
        <ul className="space-y-1.5 text-[11px] text-muted-foreground">
          <li>
            Purge anonymous users —{" "}
            <AdminCrossLink to="/admin/people?section=users" label="People › Users" />, master-only
            button, unchanged. {!isMasterAdmin && "(Hidden for your role, exactly as before.)"}
          </li>
          <li>
            Database restore — backend only. <code>POST /api/admin/db/restore</code>, behind
            require_admin, with its force interlock, optional content digest, destination allow-list
            and size ceiling all unchanged. No browser trigger exists and none is added.
          </li>
          <li>
            Profile deletion — inside the per-user Account Actions menu, behind the confirmation
            step shipped with Admin Users Phase 1, unchanged.
          </li>
        </ul>
      </AdminPanel>
    </div>
  );
}

function DataOps({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      await exportAdminCSV();
    } catch {
      toast.error("CSV export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {isMasterAdmin && (
        <AdminPanel
          title="Admin CSV export"
          description="Downloads production user data to your machine. Master-only, exactly as it was on the legacy dashboard header."
          testId="operations-csv-export"
        >
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            disabled={exporting}
            onClick={() => void runExport()}
          >
            <Download className="h-3 w-3" aria-hidden />
            {exporting ? "Exporting…" : "Export admin CSV"}
          </Button>
        </AdminPanel>
      )}
      <AdminToolGrid tools={toolsForSection("operations", "data-ops")} />
    </div>
  );
}

export default function AdminOperationsPage() {
  const area = ADMIN_AREAS_BY_ID.operations;
  const [section, setSection] = useAreaSection(area);
  const { isMasterAdmin } = useAdminRoles();

  return (
    <div data-testid="admin-area-operations">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />

      {section.id === "configuration" && <ConfigurationSection isMasterAdmin={isMasterAdmin} />}

      {section.id === "health" && (
        <div className="space-y-4">
          <DbStatusPanel />
          <AdminToolGrid tools={toolsForSection("operations", "health")} />
        </div>
      )}

      {section.id === "patch-ops" && (
        <div className="space-y-4">
          <AdminPanel
            title="Patch Operations"
            description="Backend-owned. Its published output is public; its controls are not in the browser."
          >
            <div className="flex flex-col gap-1.5">
              <AdminCrossLink to="/lol/patch-reports" label="Published patch reports" note="public output" />
              <AdminCrossLink
                to="/admin/game-data?section=knowledge"
                label="Champion Knowledge"
                note="patch analytics, intelligence and rundown"
              />
            </div>
          </AdminPanel>
          <AdminToolGrid tools={toolsForSection("operations", "patch-ops")} />
        </div>
      )}

      {section.id === "data-ops" && <DataOps isMasterAdmin={isMasterAdmin} />}

      {section.id === "docs" && (
        <div className="space-y-4">
          <AdminToolGrid tools={toolsForSection("operations", "docs")} />
          <p className={cn("text-[11px] text-muted-foreground")}>
            The hand-written inventory in Internal Docs is stale and omits ten current admin pages.
            The derived inventory of record is now{" "}
            <Link to="/admin/all-tools" className="text-primary underline-offset-2 hover:underline">
              All Tools
            </Link>
            .
          </p>
        </div>
      )}

      {section.id === "danger-zone" && <DangerZone isMasterAdmin={isMasterAdmin} />}
    </div>
  );
}
