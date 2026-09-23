// ---------------------------------------------------------------------------
// The default area page: a registry-driven hub.
//
// Areas whose capabilities already live on their own working pages render as
// a hub of cross-links rather than re-mounting those pages. That is principle
// one — one home per capability, everything else a cross-link, never a second
// mount. Re-mounting a working workspace inside an area page would create the
// exact duplication this reorganization exists to remove.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import {
  AdminAreaHeader,
  AdminToolGrid,
  useAreaSection,
} from "@/components/admin/shell/AdminAreaPage";
import {
  ADMIN_AREAS_BY_ID,
  toolsForSection,
  type AdminAreaId,
} from "@/lib/admin/admin-registry";

export default function AdminRegistryAreaPage({
  areaId,
  /** Extra content rendered above the tool grid, per section id. */
  sectionExtras,
  /**
   * Sections whose extra content already renders its own tool grids, so the
   * hub must not render them a second time. Ranked is the one case: it groups
   * its eleven tools by view, and a flat grid beside them would list every
   * tool twice with less information.
   */
  sectionsWithOwnTools,
}: {
  areaId: AdminAreaId;
  sectionExtras?: Partial<Record<string, ReactNode>>;
  sectionsWithOwnTools?: string[];
}) {
  const area = ADMIN_AREAS_BY_ID[areaId];
  const [section, setSection] = useAreaSection(area);
  const ownsTools = sectionsWithOwnTools?.includes(section.id) ?? false;
  const tools = ownsTools ? [] : toolsForSection(areaId, section.id);

  return (
    <div data-testid={`admin-area-${areaId}`}>
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />
      <div className="space-y-4">
        {sectionExtras?.[section.id]}
        <AdminToolGrid tools={tools} />
        {tools.length === 0 && !sectionExtras?.[section.id] && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No registered tools in this section yet.
          </p>
        )}
      </div>
    </div>
  );
}
