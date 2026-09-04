// ---------------------------------------------------------------------------
// COM1-2 — Community · Users. An admin ENTRY POINT, not a second admin system.
//
// Every capability on this tab is an existing one, mounted here:
//
//   fetchAdminDirectory()   — the hardened `admin_list_profiles()` projection
//                             (src/lib/admin/admin-users.ts). It already drops
//                             `user_id`, `admin_notes`, `is_flagged_underage`
//                             and the legacy dating fields by allow-list.
//   applyDirectoryView()    — the same filter + search + sort as /admin/users
//   AdminUserCard           — the same card, with the same tags
//   AddToMyFriendsButton    — `admin_link_friendship` (master_admin, audited)
//   BotStateToggle          — `admin_update_bot_profile` (master_admin, audited)
//
// Nothing new is authorised here and no admin business logic is duplicated.
// Anything this tab does not do — admin notes, roles, ban/unban, account
// actions, notifications, reports — lives in ONE place, `/admin/people`, and
// this tab links a selected user straight into it rather than growing a second
// implementation that could drift from the first.
//
// AUTHORIZATION
// This component is not the boundary. `admin_list_profiles()` raises unless
// has_role(admin) and every mutation re-checks `is_master_admin` server-side.
// What the gate below buys is that an ordinary user's client never ISSUES the
// privileged read at all: the parent renders this component only for a resolved
// master admin, and the fetch lives inside it, so there is no request to fail
// and no directory in a non-admin's memory. Both properties are tested.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminUserCard } from "@/components/admin/AdminUserCard";
import { BotStateToggle } from "@/components/admin/BotStateToggle";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";
import {
  DEFAULT_DIRECTORY_FILTER,
  DIRECTORY_FILTERS,
  DIRECTORY_FILTER_LABELS,
  applyDirectoryView,
  cappedSlice,
  fetchAdminDirectory,
  formatDirectoryCount,
  type AdminDirectoryProfile,
  type DirectoryFilter,
} from "@/lib/admin/admin-users";

/**
 * The Community drawer is a 70vh sheet, not a page. It renders fewer cards than
 * `/admin/users` (whose own cap is 100) because scrolling a thousand rows in a
 * bottom sheet is not a workflow — the search box is. Filter and search still
 * run across the FULL fetched set, so a match is never missed because it sorted
 * past the cap.
 */
export const COMMUNITY_USERS_PAGE_SIZE = 25;

/** The canonical full user-management surface for one selected profile. */
export function adminPeopleHref(profileId: string): string {
  return `/admin/people?section=users&user=${encodeURIComponent(profileId)}`;
}

interface Props {
  /** Render cap and "Show more" increment. Overridable for tests. */
  pageSize?: number;
}

export default function CommunityUsersTab({
  pageSize = COMMUNITY_USERS_PAGE_SIZE,
}: Props) {
  const [profiles, setProfiles] = useState<AdminDirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>(DEFAULT_DIRECTORY_FILTER);
  const [cap, setCap] = useState(pageSize);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProfiles(await fetchAdminDirectory());
    } catch {
      setLoadError("Couldn't load users.");
      setProfiles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matched = useMemo(
    () => applyDirectoryView(profiles, filter, query),
    [profiles, filter, query],
  );
  const visible = useMemo(() => cappedSlice(matched, cap), [matched, cap]);
  const remaining = matched.length - visible.length;
  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const changeFilter = (next: DirectoryFilter) => {
    setFilter(next);
    setCap(pageSize);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    setCap(pageSize);
  };

  return (
    <div className="space-y-3" data-testid="community-users-tab">
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          Admin view. Inspection, friend linking and bot state only — notes, roles, account
          actions and moderation stay in{" "}
          <Link to="/admin/people?section=users" className="underline underline-offset-2">
            Admin · People
          </Link>
          .
        </span>
      </p>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="Search by display name…"
            aria-label="Search users by display name"
            data-testid="community-users-search"
            autoComplete="off"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5"
          onClick={() => void load()}
          disabled={loading}
          data-testid="community-users-refresh"
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
            data-testid={`community-users-filter-${f}`}
            onClick={() => changeFilter(f)}
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

      {loading ? (
        <p
          className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
          data-testid="community-users-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading users…
        </p>
      ) : loadError ? (
        <p
          role="alert"
          data-testid="community-users-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {loadError}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground" data-testid="community-users-count">
            {formatDirectoryCount(visible.length, matched.length, profiles.length)}
          </p>

          {selected && (
            <section
              className="rounded-xl border border-primary/40 bg-primary/5 p-3"
              data-testid="community-users-selected"
              aria-label={`Selected user ${selected.displayName ?? selected.id}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-primary">
                  Selected
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  data-testid="community-users-clear-selection"
                  onClick={() => setSelectedId(null)}
                >
                  Clear
                </Button>
              </div>
              {/* The same card, so a selected user is described by exactly the
                  same allow-listed fields as an unselected one. */}
              <AdminUserCard
                profile={selected}
                onFriendshipCompleted={(r) => {
                  if (r.ok && r.code === "created") notifyFriendsChanged();
                  void load();
                }}
                botActions={
                  selected.isBot ? (
                    <BotStateToggle
                      profileId={selected.id}
                      isDisabled={selected.isDisabled}
                      onChanged={() => void load()}
                    />
                  ) : null
                }
              />
              <Link
                to={adminPeopleHref(selected.id)}
                data-testid="community-users-manage-link"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
              >
                Manage in Admin · People
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            </section>
          )}

          <div className="space-y-1.5" data-testid="community-users-list">
            {visible.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={selectedId === p.id}
                data-testid={`community-user-${p.id}`}
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                  selectedId === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-secondary"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {p.displayName || "Unnamed"}
                  </span>
                  {/* Bot and guest are always distinguished here: this is an
                      admin surface, so the `show_bot_labels` platform policy —
                      which governs user-facing surfaces — is not consulted. */}
                  <span className="block text-[10px] text-muted-foreground">
                    {p.isBot
                      ? p.isDisabled
                        ? "Bot · disabled"
                        : "Bot"
                      : p.isAnonymous
                        ? "Guest"
                        : "Registered"}
                    {p.roles.length > 0 && ` · ${p.roles.map((r) => r.replace("_", " ")).join(", ")}`}
                    {p.isPro && " · Premium"}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {remaining > 0 && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                data-testid="community-users-show-more"
                onClick={() => setCap((c) => c + pageSize)}
              >
                Show {Math.min(pageSize, remaining).toLocaleString("en-US")} more
              </Button>
            </div>
          )}

          {visible.length === 0 && (
            <p
              className="py-6 text-center text-sm text-muted-foreground"
              data-testid="community-users-empty"
            >
              No profiles match.
            </p>
          )}
        </>
      )}
    </div>
  );
}
