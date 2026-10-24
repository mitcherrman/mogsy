// ---------------------------------------------------------------------------
// PULSE-2B — the routable page: owner gate + repository choice.
//
// Integration (command center, see docs/handoffs/ACADEMY_PULSE_P2B.md):
// route `/admin/pulse` → this page inside AdminShell, plus a registry entry in
// the **Studio** area (owner decision, PR #155). NOT mounted by this PR.
//
// Storage: `VITE_PULSE_ADMIN_STORAGE=server` selects the owner-RPC repository
// once the staged migration is applied; anything else is the labelled
// in-memory prototype, which writes nothing anywhere.
// ---------------------------------------------------------------------------

import { useMemo } from "react";

import AdminRoute from "@/components/AdminRoute";
import { createMemoryPulseRepository } from "@/lib/admin/pulse/memoryRepository";
import { prototypeSeed } from "@/lib/admin/pulse/prototypeSeed";
import type { PulseAdminRepository } from "@/lib/admin/pulse/repository";
import { createServerPulseRepository } from "@/lib/admin/pulse/serverClient";

import { AdminPulseWorkspace } from "./AdminPulseWorkspace";

export function pulseStorageMode(env: Record<string, string | undefined> = import.meta.env): "server" | "prototype" {
  return env.VITE_PULSE_ADMIN_STORAGE === "server" ? "server" : "prototype";
}

export default function AdminPulsePage() {
  const repository = useMemo<PulseAdminRepository>(
    () => (pulseStorageMode() === "server" ? createServerPulseRepository() : createMemoryPulseRepository(prototypeSeed())),
    [],
  );
  return (
    <AdminRoute>
      <AdminPulseWorkspace repository={repository} />
    </AdminRoute>
  );
}
