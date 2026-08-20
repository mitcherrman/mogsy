// ---------------------------------------------------------------------------
// Admin Overview — the control room and the canonical Admin home.
//
// Reuses what already exists: AdminStats for platform counts, and a view over
// the review queues that already have canonical domain pages. It invents no
// metric: where no source exists, it links to the area instead of fabricating
// a number.
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";
import { ArrowUpRight, ListChecks, Wrench } from "lucide-react";
import AdminStats from "@/components/admin/AdminStats";
import { AdminAreaHeader, AdminPanel, useAreaSection } from "@/components/admin/shell/AdminAreaPage";
import { useAdminAttention } from "@/lib/admin/useAdminAttention";
import {
  ADMIN_AREAS,
  ADMIN_AREAS_BY_ID,
  ADMIN_ALL_TOOLS_PATH,
} from "@/lib/admin/admin-registry";
function AttentionQueue() {
  const entries = useAdminAttention();
  return (
    <AdminPanel
      title="Needs attention"
      description="A view over the review queues that already exist. Each row opens its canonical domain page — no new approval semantics are created here."
      testId="admin-attention-queue"
    >
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <Link
                to={entry.to}
                className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                {entry.label}
              </Link>
              <p className="text-[11px] text-muted-foreground">{entry.hint}</p>
            </div>
            <span
              className="shrink-0 rounded border border-border px-2 py-0.5 text-xs font-semibold tabular-nums"
              data-testid={`admin-attention-${entry.id}`}
            >
              {entry.count === null ? "…" : entry.count === "error" ? "unavailable" : entry.count}
            </span>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}

function AreaShortcuts() {
  return (
    <AdminPanel
      title="Areas"
      description="Every top-level area of the Admin application."
      testId="admin-overview-areas"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_AREAS.filter((a) => a.id !== "overview").map((area) => (
          <Link
            key={area.id}
            to={area.path}
            data-testid={`admin-overview-area-${area.id}`}
            className="rounded-md border border-border bg-muted/20 p-3 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{area.label}</span>
              {area.badge && (
                <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {area.badge}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {area.description}
            </p>
          </Link>
        ))}
      </div>
    </AdminPanel>
  );
}

export default function AdminOverviewPage() {
  const area = ADMIN_AREAS_BY_ID.overview;
  const [section, setSection] = useAreaSection(area);

  return (
    <div data-testid="admin-area-overview">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />

      <div className="space-y-4">
          <AdminStats />
          <AttentionQueue />
          <AreaShortcuts />
        <AdminPanel
          title="Escape hatches"
          description="Two surfaces that are deliberately not part of the navigation architecture."
        >
            <div className="flex flex-col gap-2">
              <Link
                to={ADMIN_ALL_TOOLS_PATH}
                className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                All Tools — every registered destination, searchable
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
              <Link
                to="/admin/legacy-dashboard"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                data-testid="admin-overview-legacy-dashboard"
              >
                <Wrench className="h-3.5 w-3.5" aria-hidden />
                Legacy Admin Dashboard — the original 17-tab shell, preserved unchanged
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
        </AdminPanel>
      </div>
    </div>
  );
}
