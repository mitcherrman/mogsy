import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, ClipboardList, GaugeCircle, History, LayoutDashboard, Newspaper, ShieldCheck } from "lucide-react";
import { getStrictApproval, setStrictApproval, subscribeStrictApproval } from "@/lib/knowledge-admin/strict";
import { cn } from "@/lib/utils";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { ApprovedChangesPanel } from "./ApprovedChangesPanel";

/**
 * Knowledge Admin shell.
 * Renders the left nav behind the shared account-bound AdminAuthGate — the
 * owner's Supabase session authorizes the section automatically, with the
 * admin key available only as an explicit fallback (handled by the gate).
 */
export default function KnowledgeAdminLayout() {
  const [strict, setStrict] = useState<boolean>(() => getStrictApproval());
  useEffect(() => subscribeStrictApproval(() => setStrict(getStrictApproval())), []);

  const location = useLocation();
  const isQueueRoute = location.pathname.startsWith("/admin/knowledge/queue");

  const items = [
    { to: "/admin/knowledge", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/knowledge/queue", label: "Review Queue", icon: ClipboardList },
    { to: "/admin/knowledge/health", label: "Champion Health", icon: GaugeCircle },
    { to: "/admin/knowledge/rundown", label: "Patch Intel", icon: Newspaper },
    { to: "/admin/knowledge/history", label: "Patch History", icon: History },
  ];

  return (
    <AdminAuthGate>
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-6">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-extrabold text-foreground">Mogsy Knowledge Admin</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">← Admin</Link>
            <label
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold rounded border px-2 py-1 cursor-pointer select-none",
                strict
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
              title="When ON, approvals require dry-run preview, warning acknowledgement, and typing APPLY."
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <input
                type="checkbox"
                className="h-3 w-3 accent-amber-500"
                checked={strict}
                onChange={(e) => setStrictApproval(e.target.checked)}
              />
              Strict approval
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          <div className="flex flex-col gap-3 min-w-0">
            <nav className="flex md:flex-col gap-1 overflow-x-auto">
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )
                  }
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </NavLink>
              ))}
            </nav>
            {/* Approved Changes panel — Review Queue only, below the nav. */}
            {isQueueRoute && (
              <div className="hidden md:block">
                <ApprovedChangesPanel />
              </div>
            )}
          </div>
          <main key={location.pathname} className="min-w-0">
            <Outlet />
            {/* On small screens the panel moves below the queue content. */}
            {isQueueRoute && (
              <div className="mt-4 md:hidden">
                <ApprovedChangesPanel />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
    </AdminAuthGate>
  );
}