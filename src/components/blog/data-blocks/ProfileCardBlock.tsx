import { useBlogProfile } from "@/hooks/blog/useBlogData";
import UserAvatar from "@/components/UserAvatar";
import { Link } from "react-router-dom";

export default function ProfileCardBlock({ profileId }: { profileId?: string }) {
  const { data: profile, isLoading } = useBlogProfile(profileId);
  if (!profileId) return <div className="blog-surface rounded-xl p-4 text-center blog-muted">Pick a profile</div>;
  if (isLoading) return <div className="blog-surface rounded-xl p-4 animate-pulse h-24" />;
  if (!profile) return <div className="blog-surface rounded-xl p-4 blog-muted">Profile not found</div>;
  return (
    <Link to={`/user/${profile.id}`} className="blog-surface rounded-2xl p-4 flex items-center gap-4 hover:opacity-90 transition-opacity">
      <UserAvatar src={profile.avatar_url} name={profile.display_name ?? ""} size="lg" />
      <div className="min-w-0">
        <div className="text-lg font-bold truncate">{profile.display_name ?? "Anonymous"}</div>
        {profile.is_pro && <div className="text-xs font-semibold blog-accent">PRO</div>}
      </div>
    </Link>
  );
}