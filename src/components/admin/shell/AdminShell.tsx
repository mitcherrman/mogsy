// ---------------------------------------------------------------------------
// AdminShell — the one canonical Admin navigation shell.
//
// Renders the area rail (Overview · People · Leaguecraft · Ranked · Simulation
// · Game Data · Studio · Operations · Developer · Arena) around an <Outlet />.
// Every /admin destination renders inside it, so navigation is identical from
// every page and depth never exceeds area → page → tab.
//
// AUTHORIZATION: the rail is a projection of the registry, not a gate. Each
// destination keeps its own <AdminRoute> / AdminAuthGate / RLS / require_admin
// exactly as before; the rail only decides what is ADVERTISED. Master-only
// areas are labelled, never granted.
// ---------------------------------------------------------------------------

import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { ADMIN_NAV_AREAS, ADMIN_TOOLS, type AdminArea } from "@/lib/admin/admin-registry";
import { cn } from "@/lib/utils";

/**
 * Which area owns the current path.
 *
 * An area page matches its own path. An EXISTING admin page — /admin/play,
 * /admin/blog, /admin/combat-battles — has no area path of its own, so the
 * registry decides: the area that adopted the tool is the one highlighted.
 * Without this the rail goes blank the moment you follow a cross-link, which
 * is precisely the "where am I?" problem the shell exists to solve.
 */
function ownerAreaId(pathname: string): string | null {
  const exact = ADMIN_NAV_AREAS.find(
    (a) => a.path !== "/admin" && (pathname === a.path || pathname.startsWith(`${a.path}/`)),
  );
  if (exact) return exact.id;
  if (pathname === "/admin" || pathname === "/admin/") return "overview";

  // Longest matching registered tool path wins, so /admin/blog/:id resolves to
  // the same area as /admin/blog rather than to nothing.
  let best: { area: string; length: number } | null = null;
  for (const tool of ADMIN_TOOLS) {
    if (!tool.path || tool.kind === "gap" || tool.kind === "backend") continue;
    const base = tool.path.split("?")[0];
    if (base === "/admin") continue;
    if (pathname !== base && !pathname.startsWith(`${base}/`)) continue;
    if (!best || base.length > best.length) best = { area: tool.area, length: base.length };
  }
  return best?.area ?? null;
}

function areaIsActive(area: AdminArea, pathname: string): boolean {
  return ownerAreaId(pathname) === area.id;
}

function AreaLink({ area, pathname }: { area: AdminArea; pathname: string }) {
  const active = areaIsActive(area, pathname);
  return (
    <NavLink
      to={area.path}
      end={area.path === "/admin"}
      data-testid={`admin-nav-${area.id}`}
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium",
        "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        active && "border-primary/40 bg-primary/10 text-foreground",
        area.kind === "archived" && !active && "text-muted-foreground/70",
      )}
    >
      <span className="truncate">{area.label}</span>
      {area.badge && (
        <span
          className={cn(
            "shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
            area.kind === "archived"
              ? "bg-muted text-muted-foreground"
              : "bg-amber-400/10 text-amber-300",
          )}
        >
          {area.badge}
        </span>
      )}
    </NavLink>
  );
}

export default function AdminShell() {
  const { pathname } = useLocation();
  const live = ADMIN_NAV_AREAS.filter((a) => a.kind === "live");
  const developer = ADMIN_NAV_AREAS.filter((a) => a.kind === "developer");
  const archived = ADMIN_NAV_AREAS.filter((a) => a.kind === "archived");

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <nav
          aria-label="Admin sections"
          data-testid="admin-shell-nav"
          className="shrink-0 lg:w-52"
        >
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold">Mogzy Admin</span>
          </div>

          {/* One flat list. Deliberately never paginated: pagination is what
              buried Feedback, Reports and Mod Config on the legacy dashboard. */}
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {live.map((area) => (
              <div key={area.id} className="shrink-0 lg:shrink">
                <AreaLink area={area} pathname={pathname} />
              </div>
            ))}

            <div className="hidden lg:my-2 lg:block lg:border-t lg:border-border" aria-hidden />

            {developer.map((area) => (
              <div key={area.id} className="shrink-0 lg:shrink">
                <AreaLink area={area} pathname={pathname} />
              </div>
            ))}

            <div className="hidden lg:my-2 lg:block lg:border-t lg:border-border" aria-hidden />

            {archived.map((area) => (
              <div key={area.id} className="shrink-0 lg:shrink">
                <AreaLink area={area} pathname={pathname} />
              </div>
            ))}
          </div>

          <NavLink
            to="/lol"
            className="mt-3 hidden items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground lg:inline-flex"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden /> Back to Mogzy
          </NavLink>
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
