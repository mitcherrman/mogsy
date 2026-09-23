// ---------------------------------------------------------------------------
// People — accounts, access, moderation, feedback and notifications.
//
// The canonical home for the people-facing tabs of the dissolved 17-tab
// dashboard. It MOUNTS the same components those tabs mounted, with the same
// props: there is exactly one Users destination in the product and this is it.
// FUNNEL1C/ADMIN2 folded the master-only identity directory (/admin/users) in
// as the third view of Users rather than leaving a second account browser in
// navigation; that path now redirects to ?section=users&view=identities.
// The deployed Admin Users Phase 1 UX (read-first inspection, Account Actions,
// delete confirmation, per-user Feedback) is untouched.
//
// AUTHORIZATION: unchanged throughout. `isMasterAdmin` is read with the same
// user_roles query the legacy dashboard used and is passed to AdminUsers
// exactly as before, so role editing and the anonymous purge keep their
// existing master-only gate. No RLS, RPC or edge function is modified.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminUserDirectory from "@/pages/admin/AdminUserDirectory";
import AdminProfileDirectory from "@/components/admin/AdminProfileDirectory";
import AdminInviteLinks from "@/components/admin/AdminInviteLinks";
import AdminComments from "@/components/admin/AdminComments";
import AdminUserReports from "@/components/admin/AdminUserReports";
import AdminModeratorConfig from "@/components/admin/AdminModeratorConfig";
import AdminFeedback from "@/components/admin/AdminFeedback";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminPushNotifications from "@/components/admin/AdminPushNotifications";
import {
  AdminAreaHeader,
  AdminCrossLink,
  AdminPanel,
  AdminToolGrid,
  useAreaSection,
} from "@/components/admin/shell/AdminAreaPage";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { ADMIN_AREAS_BY_ID, toolsForSection } from "@/lib/admin/admin-registry";
import { cn } from "@/lib/utils";

/** A minimal in-section switch for two views of one concept. */
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

export default function AdminPeoplePage() {
  const area = ADMIN_AREAS_BY_ID.people;
  const [section, setSection] = useAreaSection(area);
  const { isMasterAdmin } = useAdminRoles();
  // URL-backed so the identity view keeps a deep link of its own — it is what
  // /admin/users redirects to, and what the registry advertises.
  const [params, setParams] = useSearchParams();
  const usersView = params.get("view") ?? "accounts";
  const setUsersView = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("view", id);
    setParams(next, { replace: false });
  };
  const [modView, setModView] = useState("comments");
  const [notifView, setNotifView] = useState("inbox");

  return (
    <div data-testid="admin-area-people">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />

      {section.id === "users" && (
        <div className="space-y-4">
          <SubTabs
            testId="people-users-subtabs"
            value={usersView}
            onChange={setUsersView}
            options={[
              { id: "accounts", label: "Accounts" },
              { id: "browser", label: "Profile browser" },
              // Master-only, exactly as /admin/users was. Advertised only to
              // the role that can use it; the RPCs re-check server-side.
              ...(isMasterAdmin ? [{ id: "identities", label: "Identities" }] : []),
            ]}
          />
          {usersView === "browser" && (
            <div data-testid="people-users-browser">
              <AdminProfileDirectory />
            </div>
          )}
          {usersView === "identities" && isMasterAdmin && (
            <div data-testid="people-users-identities">
              <AdminUserDirectory embedded />
            </div>
          )}
          {usersView !== "browser" && !(usersView === "identities" && isMasterAdmin) && (
            <div data-testid="people-users-accounts">
              <AdminUsers isMasterAdmin={isMasterAdmin} />
            </div>
          )}
          <AdminPanel
            title="Admin controls that live outside this page"
            description="Contextual affordances embedded in user-facing pages. Kept where they are; recorded so they are no longer invisible to an inventory."
          >
            <AdminToolGrid tools={toolsForSection("people", "users").filter((t) => t.kind === "embedded")} />
          </AdminPanel>
        </div>
      )}

      {section.id === "roles-access" && (
        <div className="space-y-4" data-testid="people-roles-access">
          <AdminPanel
            title="Invite links"
            description="Role-granting invites promote whoever redeems them. redeem_invite_link writes to user_roles — this is a real role-assignment path, alongside the master-only editor inside Users."
          >
            <AdminInviteLinks />
          </AdminPanel>
          <p className="text-[11px] text-muted-foreground">
            Direct role grant and revoke live in{" "}
            <AdminCrossLink to="/admin/people?section=users" label="People › Users" />, which is
            master-gated exactly as before.
          </p>
        </div>
      )}

      {section.id === "moderation" && (
        <div className="space-y-4">
          <SubTabs
            testId="people-moderation-subtabs"
            value={modView}
            onChange={setModView}
            options={[
              { id: "comments", label: "Comments" },
              { id: "reports", label: "User reports" },
              { id: "mod-config", label: "Moderator roster" },
            ]}
          />
          {modView === "comments" && (
            <div data-testid="people-moderation-comments">
              <AdminComments />
            </div>
          )}
          {modView === "reports" && (
            <div data-testid="people-moderation-reports">
              <AdminUserReports />
            </div>
          )}
          {modView === "mod-config" && (
            <div data-testid="people-moderation-mod-config">
              <AdminModeratorConfig />
            </div>
          )}
        </div>
      )}

      {section.id === "feedback" && (
        <div data-testid="people-feedback">
          <AdminFeedback />
        </div>
      )}

      {section.id === "notifications" && (
        <div className="space-y-4">
          <SubTabs
            testId="people-notifications-subtabs"
            value={notifView}
            onChange={setNotifView}
            options={[
              { id: "inbox", label: "Admin inbox (inbound)" },
              { id: "push", label: "Push campaigns (outbound)" },
            ]}
          />
          {notifView === "inbox" ? (
            <div data-testid="people-notifications-inbox">
              <AdminNotifications />
            </div>
          ) : (
            <div data-testid="people-notifications-push">
              <AdminPushNotifications />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
