// ---------------------------------------------------------------------------
// Arena (Archived) — the retired Mogsy voting product.
//
// Preserved, not removed. Every tool still works and every route still
// resolves; the area is labelled archived and separated from the live areas so
// the legacy/current boundary is structural rather than editorial. "Archived"
// is a labelling decision, not a retirement decision — no usage evidence
// exists, so nothing here may be deleted without owner approval.
//
// It mounts the legacy dashboard's product tabs (the same components, with the
// same master-only gating) and cross-links the legacy pages, which keep their
// own routes untouched.
// ---------------------------------------------------------------------------

import { useState } from "react";
import AdminCollections from "@/components/admin/AdminCollections";
import AdminBots from "@/components/admin/AdminBots";
import AdminPromotedLeagues from "@/components/admin/AdminPromotedLeagues";
import AdminThemes from "@/components/admin/AdminThemes";
import AdminRankSettings from "@/components/admin/AdminRankSettings";
import {
  AdminAreaHeader,
  AdminPanel,
  AdminToolGrid,
  useAreaSection,
} from "@/components/admin/shell/AdminAreaPage";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { ADMIN_AREAS_BY_ID, toolsForSection } from "@/lib/admin/admin-registry";
import { cn } from "@/lib/utils";

function SubTabs({
  options,
  value,
  onChange,
  testId,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  testId: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1" role="tablist" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          data-testid={`${testId}-${o.id}`}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
            value === o.id
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminArenaPage() {
  const area = ADMIN_AREAS_BY_ID.arena;
  const [section, setSection] = useAreaSection(area);
  const { isMasterAdmin } = useAdminRoles();
  const [collectionsView, setCollectionsView] = useState("collections");
  const [presentationView, setPresentationView] = useState("themes");

  return (
    <div data-testid="admin-area-arena">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />

      <div
        className="mb-4 rounded-lg border border-border bg-muted/30 p-3"
        data-testid="admin-arena-archived-notice"
      >
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Archived.</strong> These tools administer the retired
          Mogsy voting product. They are fully preserved and still work — every route resolves
          exactly as before. Archived means labelled, not removed and not scheduled for removal.
        </p>
      </div>

      {section.id === "collections" && (
        <div className="space-y-4">
          <SubTabs
            testId="arena-collections-subtabs"
            value={collectionsView}
            onChange={setCollectionsView}
            options={[
              { id: "collections", label: "Collections" },
              { id: "bots", label: "League Bots" },
              { id: "promoted", label: "Promoted Leagues" },
            ]}
          />
          {collectionsView === "collections" && (
            <div data-testid="arena-collections">
              <AdminCollections />
            </div>
          )}
          {collectionsView === "bots" && (
            <div data-testid="arena-bots">
              <AdminBots />
            </div>
          )}
          {collectionsView === "promoted" && (
            <div data-testid="arena-promoted">
              <AdminPromotedLeagues />
            </div>
          )}
          <AdminToolGrid tools={toolsForSection("arena", "collections").filter((t) => t.kind === "gap")} />
        </div>
      )}

      {section.id === "presentation" && (
        <div className="space-y-4">
          {isMasterAdmin ? (
            <>
              <SubTabs
                testId="arena-presentation-subtabs"
                value={presentationView}
                onChange={setPresentationView}
                options={[
                  { id: "themes", label: "Themes" },
                  { id: "ranks", label: "Arena Ranks" },
                ]}
              />
              {presentationView === "themes" ? (
                <div data-testid="arena-themes">
                  <AdminThemes />
                </div>
              ) : (
                <div data-testid="arena-ranks">
                  <AdminRankSettings />
                </div>
              )}
            </>
          ) : (
            <p
              className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground"
              data-testid="arena-presentation-master-only"
            >
              Themes and Arena Ranks are master-admin surfaces. They are hidden here exactly as they
              were hidden on the legacy dashboard — no permission has changed.
            </p>
          )}
        </div>
      )}

      {section.id === "operations" && (
        <div className="space-y-4">
          <AdminPanel
            title="Arena pages"
            description="These keep their own routes and their own gates. Nothing about them changed."
          >
            <AdminToolGrid tools={toolsForSection("arena", "operations")} />
          </AdminPanel>
        </div>
      )}
    </div>
  );
}
