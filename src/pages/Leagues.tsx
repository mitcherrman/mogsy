import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Users } from "lucide-react";
import { mockLeagues } from "@/lib/mock-data";
import TierBadge from "@/components/TierBadge";

export default function Leagues() {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" /> Your Leagues
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track your rank across leagues</p>
        </div>

        <div className="space-y-4">
          {mockLeagues.map((league, i) => (
            <motion.div
              key={league.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                to={`/leaderboard/${league.id}`}
                className="block rounded-2xl border border-border bg-card p-6 card-hover"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{league.name}</h3>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {league.memberCount.toLocaleString()}</span>
                      <TierBadge tier="gold" />
                      <span>ELO 1,340</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-primary">#24</div>
                    <div className="text-xs text-muted-foreground">Current Rank</div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
