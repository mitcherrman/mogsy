import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, ClipboardList, GaugeCircle, KeyRound, LayoutDashboard, LogOut, Newspaper } from "lucide-react";
import { clearAdminKey, getAdminKey, setAdminKey, subscribeAdminKey } from "@/lib/knowledge-admin/key";
import { cn } from "@/lib/utils";

/**
 * Knowledge Admin shell.
 * Renders the left nav + key-gate overlay. Every child page runs behind
 * a valid X-Admin-Key; without one, we block the entire section with a
 * key-entry screen (docs/admin_ui_wireframes.md §Global assumptions).
 */
export default function KnowledgeAdminLayout() {
  const [hasKey, setHasKey] = useState<boolean>(() => !!getAdminKey());
  useEffect(() => subscribeAdminKey(() => setHasKey(!!getAdminKey())), []);

  const [keyInput, setKeyInput] = useState("");
  const location = useLocation();

  if (!hasKey) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-extrabold text-foreground">Knowledge Admin</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter the KNOWLEDGE_ADMIN_KEY. Stored in this browser tab only —
            cleared on tab close.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (keyInput.trim()) setAdminKey(keyInput.trim());
            }}
            className="space-y-3"
          >
            <input
              type="password"
              autoFocus
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="X-Admin-Key value"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={!keyInput.trim()}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-bold disabled:opacity-50"
            >
              Unlock
            </button>
          </form>
          <Link to="/admin" className="block text-xs text-muted-foreground hover:text-foreground text-center">
            ← Back to Admin
          </Link>
        </div>
      </div>
    );
  }

  const items = [
    { to: "/admin/knowledge", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/knowledge/queue", label: "Review Queue", icon: ClipboardList },
    { to: "/admin/knowledge/health", label: "Champion Health", icon: GaugeCircle },
    { to: "/admin/knowledge/rundown", label: "Patch Rundown", icon: Newspaper },
  ];

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-6">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-extrabold text-foreground">Mogsy Knowledge Admin</h1>
          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded" title="X-Admin-Key present">
            KEY OK
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">← Admin</Link>
            <button
              onClick={() => clearAdminKey()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              title="Forget admin key (this tab)"
            >
              <LogOut className="h-3.5 w-3.5" /> Forget key
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
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
          <main key={location.pathname} className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}