// ---------------------------------------------------------------------------
// /admin/all-tools — the index of record. Successor to /admin/directory.
//
// Keeps that page's exact gate: AdminRoute (applied by the shell route) plus
// AdminAuthGate, so nothing renders before the backend-verified admin session
// resolves. This page only navigates; it never mutates.
// ---------------------------------------------------------------------------

import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminAreaHeader, useAreaSection } from "@/components/admin/shell/AdminAreaPage";
import { ADMIN_AREAS_BY_ID } from "@/lib/admin/admin-registry";
import AdminAllToolsPanel from "./AdminAllToolsPanel";

export default function AdminAllToolsPage() {
  const area = ADMIN_AREAS_BY_ID.overview;
  const [, setSection] = useAreaSection(area);
  const active = area.sections.find((s) => s.id === "all-tools")!;

  return (
    <div data-testid="admin-area-all-tools">
      <AdminAreaHeader area={area} active={active} onSelect={setSection} />
      <AdminAuthGate>
        <AdminAllToolsPanel />
      </AdminAuthGate>
    </div>
  );
}
