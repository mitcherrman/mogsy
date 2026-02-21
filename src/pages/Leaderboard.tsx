import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { mockProfiles, mockLeagues, getTierColor } from "@/lib/mock-data";
import TierBadge from "@/components/TierBadge";

export default function Leaderboard() {
  const { leagueId } = useParams();
  const league = mockLeagues.find((l) => l.id === leagueId) || mockLeagues[0];
  const sorted = [...mockProfiles].sort((a, b) => b.elo - a.elo);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        {/* Sticky header */}
        <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-xl pb-4 mb-4 border-b border-border">
          <h1 className="text-2xl font-extrabold text-foreground">{league.name}</h1>
          <p className="text-sm text-muted-foreground">
            {league.memberCount.toLocaleString()} players · Your rank: <span className="text-primary font-bold">#3</span>
          </p>
        </div>

        {/* Scroll wheel of circles */}
        <div className="space-y-6">
          {sorted.map((profile, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const size = isTop3 ? "w-24 h-24 sm:w-32 sm:h-32" : "w-16 h-16 sm:w-20 sm:h-20";

            return (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-4"
              >
                <div className="w-8 text-right">
                  {rank === 1 ? (
                    <Crown className="h-6 w-6 text-tier-gold inline" />
                  ) : (
                    <span className={`text-lg font-black ${rank <= 3 ? "text-tier-gold" : "text-muted-foreground"}`}>
                      {rank}
                    </span>
                  )}
                </div>

                <div
                  className={`${size} rounded-full overflow-hidden flex-shrink-0 ${
                    isTop3 ? "avatar-ring" : "ring-1 ring-border"
                  } transition-all`}
                >
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground truncate">{profile.displayName}</span>
                    <TierBadge tier={profile.tier} />
                  </div>
                  <div className="text-sm text-muted-foreground">{profile.location}</div>
                </div>

                <div className="text-right">
                  <div className={`text-lg font-black ${getTierColor(profile.tier)}`}>
                    {profile.elo}
                  </div>
                  <div className="text-xs text-muted-foreground">ELO</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
