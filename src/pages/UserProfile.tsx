import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFriendStatus } from "@/hooks/useFriends";
import { attempt, SEND_REQUEST_MESSAGES } from "@/lib/community/social-result";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import TierBadge from "@/components/TierBadge";
import SEOHead from "@/components/SEOHead";
import {
  ArrowLeft, Crown, Calendar,
  UserPlus, UserCheck, Clock, Bookmark, BookmarkCheck, Ban,
} from "lucide-react";
import FriendActionMenu from "@/components/FriendActionMenu";
import { cn } from "@/lib/utils";
import { getThemeById } from "@/lib/profile-themes";
import ThemeOverlay from "@/components/ThemeOverlay";
import { fetchLeagueProfile } from "@/lib/league-profiles";
import { BrainCircuit } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { quizApi, resolveQuizAssetUrl } from "@/lib/quiz/api";
import LeaguePublicProfile from "@/components/profile/LeaguePublicProfile";

interface ProfileData {
  id: string;
  // No `user_id`. The League read is get_league_profiles, whose contract
  // deliberately omits it (migration 20260730150000), and nothing on this page
  // needs it any more: own-profile detection compares profile ids, and quiz
  // stats are requested only for the signed-in viewer.
  display_name: string | null;
  avatar_url: string | null;
  is_pro: boolean | null;
  is_bot: boolean | null;
  profile_frame: string | null;
  created_at: string | null;
  custom_theme: string | null;
}

/**
 * What a League-facing profile may read about ANOTHER user is now fixed by the
 * database, not by a column list here: `get_league_profiles(uuid[])` returns
 * exactly the approved contract and a caller cannot widen it.
 *
 * The legacy Mogsy profile was a dating profile: `age`, `location`, `socials`,
 * `status_message` and `profile_photos` all still exist in storage and are
 * still editable by their owner, but they never reach a League surface — UI,
 * query, metadata, JSON-LD or social preview. The former
 * LEAGUE_PROFILE_COLUMNS constant is gone with the view read it belonged to.
 *
 * LEGACY1 went further and deleted the dead branches themselves. This page used
 * to carry a full second rendering of that dating/voting profile — photos,
 * age, location, bio, socials, swipe Elo stats, league leaderboards, favorites,
 * matchups, a league comment — behind `!LEAGUE_ONLY_MODE`, which was false in
 * production and is now deleted along with the product it guarded.
 *
 * `custom_theme` WAS in that list and no longer is (PT2E). It belonged there
 * while the value was a sitewide theme, which was not profile content at all.
 * It is now this profile's own theme — the direct analogue of `profile_frame`,
 * which the contract has always published — so it is read here and rendered
 * below, and nothing about it touches the document.
 */

const frameClasses: Record<string, string> = {
  default: "",
  gold: "ring-4 ring-yellow-400/60",
  neon: "ring-4 ring-primary/60 shadow-[0_0_20px_hsl(210_80%_60%/0.4)]",
  fire: "ring-4 ring-orange-500/60 shadow-[0_0_20px_hsl(25_100%_50%/0.4)]",
  diamond: "ring-4 ring-cyan-300/60 shadow-[0_0_20px_hsl(180_80%_70%/0.4)]",
};

function SaveButton({ profileId, userId }: { profileId: string; userId: string }) {
  const [saved, setSaved] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("saved_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("saved_profile_id", profileId)
      .maybeSingle()
      .then(({ data }) => {
        setSaved(!!data);
        setLoading(false);
      });
  }, [userId, profileId]);

  const toggle = async () => {
    if (saved) {
      const removed = await attempt(() => supabase.from("saved_profiles")
        .delete().eq("user_id", userId).eq("saved_profile_id", profileId));
      if (!removed.ok) { setLoading(false); toast.error(removed.error); return; }
      setSaved(false);
    } else {
      const added = await attempt(() => supabase.from("saved_profiles")
        .insert({ user_id: userId, saved_profile_id: profileId }));
      if (!added.ok) { setLoading(false); toast.error(added.error); return; }
      setSaved(true);
    }
  };

  if (loading) return null;

  return (
    <Button variant={saved ? "outline" : "secondary"} size="sm" onClick={toggle}>
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      <span className="ml-1">{saved ? "Saved" : "Save"}</span>
    </Button>
  );
}

function FriendButton({ profileId, friendStatus, friendshipId, refreshFriend, userId }: {
  profileId: string;
  friendStatus: string;
  friendshipId: string | null;
  refreshFriend: () => void;
  userId: string;
}) {
  const [acting, setActing] = useState(false);

  /**
   * COM1-1 / P0-2. Every branch here discarded its `{ error }`. The one that
   * mattered: `useFriendStatus` can only see blocks the VIEWER created — RLS
   * on `user_blocks` shows a caller nothing but their own rows — so when the
   * target had blocked the viewer this button read "Add Friend",
   * `enforce_friendship_rules` refused the insert, and the button silently
   * returned to "Add Friend". Forever, on every attempt, with no message.
   *
   * The refusal is now reported. It is reported NEUTRALLY: naming the block
   * would hand the requester the one fact the blocker withheld, so this shows
   * the same sentence for a block as for any other refusal — matching the Stat
   * Check backend, which answers `SC_INVITE_BLOCKED` with "This invite is not
   * available." rather than explaining it.
   */
  const handleAction = async () => {
    setActing(true);
    let result: { ok: boolean; error?: string } = { ok: true };

    if (friendStatus === "none") {
      const { data: myProfile } = await supabase
        .from("profiles").select("id, display_name").eq("user_id", userId).single();
      result = myProfile
        ? await attempt(
            () => supabase.from("friendships")
              .insert({ requester_id: myProfile.id, addressee_id: profileId }),
            SEND_REQUEST_MESSAGES)
        : { ok: false, error: "Sign in to add friends." };
    } else if (friendStatus === "pending_received" && friendshipId) {
      result = await attempt(() =>
        supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId));
    } else if (friendshipId) {
      result = await attempt(() =>
        supabase.from("friendships").delete().eq("id", friendshipId));
    }

    // Refresh on BOTH paths: a refusal usually means this view was the stale
    // thing, so re-reading is how the button stops offering the impossible.
    refreshFriend();
    setActing(false);
    if (!result.ok && result.error) toast.error(result.error);
  };

  const config: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "outline" | "ghost" }> = {
    none: { label: "Add Friend", icon: <UserPlus className="h-4 w-4" />, variant: "default" },
    pending_sent: { label: "Pending", icon: <Clock className="h-4 w-4" />, variant: "outline" },
    pending_received: { label: "Accept", icon: <UserCheck className="h-4 w-4" />, variant: "default" },
    friends: { label: "Friends ✓", icon: <UserCheck className="h-4 w-4" />, variant: "outline" },
  };

  const c = config[friendStatus] || config.none;

  return (
    <Button
      variant={c.variant}
      size="sm"
      onClick={handleAction}
      disabled={acting || friendStatus === "pending_sent"}
    >
      {c.icon}
      <span className="ml-1">{c.label}</span>
    </Button>
  );
}

function ProfileActions({ profileId, friendStatus, friendshipId, refreshFriend, userId }: {
  profileId: string;
  friendStatus: string;
  friendshipId: string | null;
  refreshFriend: () => void;
  userId: string;
}) {
  const [isOwnProfile, setIsOwnProfile] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("id").eq("user_id", userId).single().then(({ data }) => {
      setIsOwnProfile(data?.id === profileId);
    });
  }, [userId, profileId]);

  if (isOwnProfile === null || isOwnProfile) return null;

  if (friendStatus === "blocked") {
    return (
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Ban className="h-3.5 w-3.5" /> Blocked
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <FriendButton
        profileId={profileId}
        friendStatus={friendStatus}
        friendshipId={friendshipId}
        refreshFriend={refreshFriend}
        userId={userId}
      />
      <SaveButton profileId={profileId} userId={userId} />
      <FriendActionMenu
        targetProfileId={profileId}
        targetName="this user"
        friendshipId={friendshipId || undefined}
        onBlocked={refreshFriend}
        /* This menu also renders for strangers and pending requests, so the
           invite entry is gated on the resolved friend status rather than on
           the mere presence of a friendship row. */
        canInviteToStatCheck={friendStatus === "friends"}
      />
    </div>
  );
}

export default function UserProfile() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  // The VIEWER's own public profile id, read from their own `profiles` row —
  // which RLS permits. This is how own-profile detection works now: compare
  // profile ids, never the viewed profile's user_id (which is no longer read).
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const { status: friendStatus, friendshipId, refresh: refreshFriend } = useFriendStatus(profileId);

  useEffect(() => {
    if (!user) {
      setMyProfileId(null);
      return;
    }
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setMyProfileId(data?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (!profileId) return;
    loadProfile();
  }, [profileId]);

  const loadProfile = async () => {
    setLoading(true);

    // The restricted RPC is the only path that can see another user's row at
    // all (public_profiles is security_invoker, so RLS resolves it to zero rows
    // and this page 404'd for everyone but yourself). LEGACY1 deleted the
    // second branch, which read the full view for the retired dating profile.
    const profileData = await fetchLeagueProfile(profileId);

    if (!profileData) {
      setLoading(false);
      return;
    }
    setProfile(profileData as unknown as ProfileData);
    setLoading(false);
  };

  // LEGACY1 deleted ~200 lines of unreachable loading here: profile photos,
  // league_memberships ranked by Elo, the per-league leaderboard, a comments
  // lookup and the profile_favorites / matches favorites reader. All of it ran
  // only after the early return above, which production never reached. A League
  // profile is identity plus LeaguePublicProfile, and always was.
  //
  // profile_photos, profile_favorites, league_memberships and preset_items keep
  // their rows; nothing on this page reads them any more.

  const frame = profile?.profile_frame && frameClasses[profile.profile_frame] ? frameClasses[profile.profile_frame] : "";
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
  const theme = getThemeById(profile?.custom_theme || "default");

  // Own-profile detection: the viewer's own profile id vs the route's.
  const isOwnProfile = !!myProfileId && myProfileId === profileId;

  // League identity: quiz rank pill in the hero. Same query key as
  // LeaguePublicProfile below, so react-query dedupes the fetch.
  //
  // Requested ONLY for your own profile, and sourced from the session rather
  // than from the viewed profile row. /api/quiz/* resolves a verified caller to
  // their OWN subject regardless of the id passed, and /user/:profileId is
  // behind ProtectedRoute — so asking for someone else's stats returned the
  // VIEWER's numbers, rendered as if they were the profile owner's. Passing
  // null disables the query here and the three inside LeaguePublicProfile, so
  // rank, category progress and achievements are hidden on other people's
  // profiles and unchanged on your own. Restoring them cross-user needs a
  // profile-id-keyed public-stats endpoint; deliberately not added here.
  const targetUserId = isOwnProfile ? user?.id ?? null : null;
  const { data: quizProgress } = useQuery({
    queryKey: ["quiz-progress", targetUserId],
    queryFn: () => quizApi.getProgress(targetUserId!),
    enabled: !!targetUserId,
  });
  const quizRankObj = (quizProgress?.rank && typeof quizProgress.rank === "object" ? quizProgress.rank : null) as any;
  const quizRankName =
    quizProgress?.rank_name ||
    quizRankObj?.rank_name ||
    (typeof quizProgress?.rank === "string" ? quizProgress.rank : null);
  const quizRankIcon =
    resolveQuizAssetUrl(quizProgress?.rank_icon) ||
    resolveQuizAssetUrl(quizRankObj?.small_icon_path) ||
    resolveQuizAssetUrl(quizRankObj?.icon_path);
  const showQuizRank = !!quizRankName && (quizProgress?.attempts ?? 0) > 0;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Profile not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh relative" style={theme.styles.pageBg ? { background: theme.styles.pageBg } : undefined}>
      <ThemeOverlay themeId={theme.id} />
      {/* Thin-profile rule: bot-generated and unnamed profiles are templated
          near-duplicates at scale — keep them out of the index. Named human
          profiles with real public stats stay indexable. */}
      {/* League metadata carries identity only. `status_message` (a legacy
          dating bio) and `location` are deliberately absent from the
          description, the JSON-LD and therefore every social preview — a
          self-reported location must never be published as structured data. */}
      <SEOHead
        noindex={!!profile.is_bot || !profile.display_name}
        title={`${profile.display_name || "User"} — Mogzy`}
        description={`View ${profile.display_name}'s Mogzy League profile. League quiz, Combat Lab and game knowledge.`}
        image={profile.avatar_url || undefined}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            name: profile.display_name || "User",
            image: profile.avatar_url || undefined,
          },
        }}
      />

      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className={cn("absolute inset-0", theme.styles.heroBg)} />
        <div className="relative container mx-auto max-w-2xl lg:max-w-3xl px-4 pt-6 pb-8 z-20">
            <Button
            variant="ghost"
            size="icon" aria-label="Go back"
            onClick={() => navigate(-1)}
            className={cn("mb-4", theme.styles.mutedColor || "text-muted-foreground", "hover:opacity-80")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center"
          >
            {/* Avatar / Photo circles */}
            <div className="relative mb-4">
              <div
                className={cn(
                  "w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden",
                  frame || cn("ring-4", theme.styles.accentRing)
                )}
              >
                {profile.avatar_url && !profile.avatar_url.includes("dicebear") ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || ""}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserAvatar name={profile.display_name || ""} size="xl" />
                )}
              </div>
            </div>

            {/* Name with crown */}
            <div className="flex items-center gap-2 justify-center">
              {profile.is_pro && (
                <Crown className={cn("h-5 w-5", theme.styles.iconAccent || "text-primary")} />
              )}
              <h1 className={cn("text-2xl sm:text-3xl font-extrabold", theme.styles.nameColor || "text-foreground")}>
                {profile.display_name || "Anonymous"}
              </h1>
            </div>

            {/* Prominent rank badge */}
            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              {showQuizRank && (
                <div className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider border-2",
                  "border-[#c9a84c]/50 bg-[#c9a84c]/10 text-[#f0d78c]"
                )}>
                  {quizRankIcon && (
                    <img
                      src={quizRankIcon}
                      alt=""
                      className="h-5 w-5 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <span>{quizRankName}</span>
                  <BrainCircuit className="h-3.5 w-3.5" />
                </div>
              )}
              {profile.is_pro && (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", theme.styles.textAccent || "text-primary", "bg-primary/10 border border-primary/30")}>
                  <Crown className="h-3 w-3" /> PRO
                </span>
              )}
            </div>

            {/* Friend & Save Buttons */}
            {user && profileId && (
              <ProfileActions
                profileId={profileId}
                friendStatus={friendStatus}
                friendshipId={friendshipId}
                refreshFriend={refreshFriend}
                userId={user.id}
              />
            )}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto max-w-2xl px-4 pb-12 space-y-5 relative z-20">

        {/* The public League profile: stats, badges, takes and the CTA. */}
        <LeaguePublicProfile
          userId={targetUserId}
          displayName={profile.display_name || "This player"}
          isOwnProfile={isOwnProfile}
          themeStyles={theme.styles}
        />

        {/* LEGACY1 removed four blocks that could not render: Recent Matchups,
            the swipe-Elo quick stats row, the per-league leaderboard and the
            legacy socials list. Each was gated on the retired product's flag. */}


        {/* Member since */}
        {memberSince && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className={cn("flex items-center justify-center gap-1.5 text-xs pt-2", theme.styles.mutedColor || "text-muted-foreground")}
          >
            <Calendar className="h-3 w-3" />
            Member since {memberSince}
          </motion.div>
        )}
      </div>

    </div>
  );
}
