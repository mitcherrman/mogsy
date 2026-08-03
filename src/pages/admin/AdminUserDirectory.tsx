// ---------------------------------------------------------------------------
// Admin · Users — the master-admin user directory.
//
// Registered under `AdminRoute roles={["master_admin"]}` in App.tsx and
// additionally wrapped in the shared AdminAuthGate, so nothing renders before
// authorization resolves and there is no unauthorized flash. Neither is the
// real boundary: the data comes from `admin_list_profiles()`, which raises
// unless has_role(admin), and every mutation goes through a SECURITY DEFINER
// RPC that re-checks is_master_admin server-side.
//
// This page observes and links. It never deletes a user, never edits a real
// user's profile, and never changes a role.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, Search, Users } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminUserCard } from "@/components/admin/AdminUserCard";
import { BotStateToggle } from "@/components/admin/BotStateToggle";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";
import {
  ADMIN_USERS_PATH,
  DIRECTORY_FILTERS,
  DIRECTORY_FILTER_LABELS,
  applyDirectoryView,
  fetchAdminDirectory,
  type AdminDirectoryProfile,
  type DirectoryFilter,
} from "@/lib/admin/admin-users";

export { ADMIN_USERS_PATH };

export default function AdminUserDirectory() {
  const [profiles, setProfiles] = useState<AdminDirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProfiles(await fetchAdminDirectory());
    } catch {
      setLoadError("Couldn't load the user directory.");
      setProfiles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => applyDirectoryView(profiles, filter, query),
    [profiles, filter, query],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <SEOHead
        title="Mogzy Admin · Users"
        description="Private administration user directory."
        path={ADMIN_USERS_PATH}
        noindex
      />

      <AdminAuthGate>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-primary" aria-hidden />
              Users
            </h1>
            <p className="text-xs text-muted-foreground">
              Newest accounts first. Observation and friend linking only — no deletion,
              no role changes.
            </p>
          </div>
          <Link
            to="/admin/directory"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Admin directory
          </Link>
        </header>

        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by display name…"
                aria-label="Search by display name"
                data-testid="admin-users-search"
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void load()}
              disabled={loading}
              data-testid="admin-users-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter users">
            {DIRECTORY_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                data-testid={`admin-users-filter-${f}`}
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {DIRECTORY_FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="admin-users-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading users…
          </p>
        ) : loadError ? (
          <p
            role="alert"
            data-testid="admin-users-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {loadError}
          </p>
        ) : (
          <>
            <p className="mb-2 text-[11px] text-muted-foreground" data-testid="admin-users-count">
              {visible.length} of {profiles.length} profiles
            </p>
            <div className="grid grid-cols-1 gap-2">
              {visible.map((p) => (
                <AdminUserCard
                  key={p.id}
                  profile={p}
                  // A new friendship must be reflected in the drawer straight
                  // away, not on the next realtime event that may never arrive.
                  onFriendshipCompleted={(r) => {
                    if (r.ok && r.code === "created") notifyFriendsChanged();
                  }}
                  botActions={
                    p.isBot ? (
                      <BotStateToggle
                        profileId={p.id}
                        isDisabled={p.isDisabled}
                        onChanged={() => void load()}
                      />
                    ) : null
                  }
                />
              ))}
            </div>
            {visible.length === 0 && (
              <p
                className="py-8 text-center text-sm text-muted-foreground"
                data-testid="admin-users-empty"
              >
                No profiles match.
              </p>
            )}
          </>
        )}
      </AdminAuthGate>
    </div>
  );
}
