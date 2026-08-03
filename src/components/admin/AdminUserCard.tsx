// ---------------------------------------------------------------------------
// One row in the master-admin user directory.
//
// Renders ONLY the fields on AdminDirectoryProfile, which by construction
// excludes `user_id`, `admin_notes`, `is_flagged_underage`, and every legacy
// dating field. There is deliberately no `{...profile}` spread and no
// `Object.entries` loop anywhere in this file — adding a field to the card has
// to be a conscious edit.
//
// This is a master-admin surface, so bot and disabled state are ALWAYS shown.
// The `show_bot_labels` platform policy governs ordinary user-facing surfaces
// only and is deliberately not read here.
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { AddToMyFriendsButton } from "@/components/admin/AddToMyFriendsButton";
import {
  profileHref,
  type AdminDirectoryProfile,
  type LinkFriendshipResult,
} from "@/lib/admin/admin-users";

function Tag({
  children,
  tone = "muted",
  testId,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "warning";
  testId?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  return (
    <span
      data-testid={testId}
      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

function stamp(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "—";
}

interface Props {
  profile: AdminDirectoryProfile;
  onFriendshipCompleted?: (result: LinkFriendshipResult) => void;
  /** Bot management affordance, injected so the card stays presentational. */
  botActions?: React.ReactNode;
}

export function AdminUserCard({ profile, onFriendshipCompleted, botActions }: Props) {
  const name = profile.displayName || "Unnamed";
  return (
    <article
      data-testid={`admin-user-${profile.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-start gap-3">
        <UserAvatar src={profile.avatarUrl} name={name} size="md" />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            {profile.isPro && <Tag tone="primary">Pro</Tag>}
            {profile.isBot && <Tag testId={`tag-bot-${profile.id}`}>Bot</Tag>}
            {profile.isBot && (
              <Tag
                tone={profile.isDisabled ? "warning" : "muted"}
                testId={`tag-botstate-${profile.id}`}
              >
                {profile.isDisabled ? "Disabled" : "Enabled"}
              </Tag>
            )}
            {profile.isAnonymous && <Tag>Anonymous</Tag>}
            {profile.roles.map((r) => (
              <Tag key={r} tone="primary">
                {r.replace("_", " ")}
              </Tag>
            ))}
          </div>

          <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <div>
              <dt className="inline">Joined </dt>
              <dd className="inline">{stamp(profile.createdAt)}</dd>
            </div>
            <div>
              <dt className="inline">Last seen </dt>
              <dd className="inline">{stamp(profile.lastSeenAt)}</dd>
            </div>
            <div>
              <dt className="inline">Onboarding </dt>
              <dd className="inline">{profile.onboardingCompleted ? "complete" : "incomplete"}</dd>
            </div>
          </dl>

          {/* The public profile id is the only identifier shown. It is already
              in the URL of the profile link, so it discloses nothing new. */}
          <p className="truncate font-mono text-[10px] text-muted-foreground/70">{profile.id}</p>
        </div>

        <Link
          to={profileHref(profile)}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          data-testid={`admin-user-link-${profile.id}`}
        >
          Profile <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <AddToMyFriendsButton
          targetProfileId={profile.id}
          targetName={name}
          disabled={profile.isBot && profile.isDisabled}
          onCompleted={onFriendshipCompleted}
        />
        {botActions}
      </div>
    </article>
  );
}

export default AdminUserCard;
