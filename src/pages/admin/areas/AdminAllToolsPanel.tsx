// ---------------------------------------------------------------------------
// All Tools — the complete, searchable index of every registered Admin
// destination. Successor to /admin/directory, which redirects here.
//
// Three deliberate differences from the page it replaces:
//   1. It is derived from the canonical registry, not a second hand-written
//      list — which is exactly how /admin/directory fell behind the router.
//   2. It does NOT hide development entries in production builds. It labels
//      them. The old filter meant five working tools disappeared from the only
//      place that listed them, with no other navigation source.
//   3. It lists backend-only capabilities and named future gaps as text, so an
//      invisible capability becomes visible without becoming a control.
//
// It is an escape hatch and an index of record — not the primary navigation.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AdminPanel, AdminToolCard } from "@/components/admin/shell/AdminAreaPage";
import {
  ADMIN_AREAS,
  ADMIN_TOOLS,
  dispositionCounts,
  searchAdminTools,
  type AdminAreaId,
} from "@/lib/admin/admin-registry";

const ALL = "all" as const;

export default function AdminAllToolsPanel() {
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<AdminAreaId | typeof ALL>(ALL);

  const results = useMemo(() => {
    const scoped =
      areaFilter === ALL ? ADMIN_TOOLS : ADMIN_TOOLS.filter((t) => t.area === areaFilter);
    return searchAdminTools(query, scoped);
  }, [query, areaFilter]);

  const grouped = useMemo(
    () =>
      ADMIN_AREAS.map((area) => ({
        area,
        tools: results.filter((t) => t.area === area.id),
      })).filter((g) => g.tools.length > 0),
    [results],
  );

  const counts = useMemo(() => dispositionCounts(), []);

  return (
    <div className="space-y-4" data-testid="admin-all-tools">
      <AdminPanel
        title="All Tools"
        description={`${ADMIN_TOOLS.length} registered destinations, including Developer tools and backend-only capabilities. Development entries are labelled, never hidden.`}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools, paths, old locations…"
              aria-label="Search admin tools"
              data-testid="admin-all-tools-search"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value as AdminAreaId | typeof ALL)}
            aria-label="Filter by area"
            data-testid="admin-all-tools-area-filter"
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            <option value={ALL}>All areas</option>
            {ADMIN_AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.badge ? ` (${a.badge})` : ""}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="admin-all-tools-count">
          Showing {results.length} of {ADMIN_TOOLS.length}. Ledger: {counts.KEEP} kept ·{" "}
          {counts.MOVE} moved · {counts.MERGE} merged · {counts.REDIRECT} redirected ·{" "}
          {counts.ARCHIVE} archived · {counts["DEVELOPER-ONLY"]} developer-only ·{" "}
          {counts.DEFERRED} deferred but still accessible · 0 lost.
        </p>
      </AdminPanel>

      {grouped.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No tool matches “{query}”.
        </p>
      )}

      {grouped.map(({ area, tools }) => (
        <section key={area.id} aria-label={`${area.label} tools`}>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            {area.label}
            {area.badge && (
              <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide">
                {area.badge}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tools.map((tool) => (
              <AdminToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
