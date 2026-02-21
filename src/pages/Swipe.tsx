import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProfileCard from "@/components/ProfileCard";
import { mockProfiles } from "@/lib/mock-data";
import { calculateElo } from "@/lib/elo";

function getRandomPair(profiles: typeof mockProfiles, lastPair?: [string, string]) {
  let a: number, b: number;
  do {
    a = Math.floor(Math.random() * profiles.length);
    b = Math.floor(Math.random() * profiles.length);
  } while (
    a === b ||
    (lastPair && lastPair.includes(profiles[a].id) && lastPair.includes(profiles[b].id))
  );
  return [profiles[a], profiles[b]] as const;
}

export default function Swipe() {
  const [profiles, setProfiles] = useState(mockProfiles);
  const [pair, setPair] = useState(() => getRandomPair(profiles));
  const [lastPair, setLastPair] = useState<[string, string] | undefined>();
  const [matchCount, setMatchCount] = useState(0);

  const handleChoose = useCallback(
    (winnerIndex: 0 | 1) => {
      const winner = pair[winnerIndex];
      const loser = pair[winnerIndex === 0 ? 1 : 0];

      const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);

      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id === winner.id) return { ...p, elo: newWinnerElo };
          if (p.id === loser.id) return { ...p, elo: newLoserElo };
          return p;
        })
      );

      setMatchCount((c) => c + 1);
      setLastPair([pair[0].id, pair[1].id]);
      setPair(getRandomPair(profiles, [pair[0].id, pair[1].id]));
    },
    [pair, profiles]
  );

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-foreground mb-1">Who's Better?</h1>
          <p className="text-muted-foreground text-sm">
            Matches played: <span className="text-primary font-bold">{matchCount}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          <AnimatePresence mode="wait">
            <ProfileCard
              key={`left-${pair[0].id}`}
              profile={pair[0]}
              side="left"
              onChoose={() => handleChoose(0)}
            />
          </AnimatePresence>

          <div className="flex items-center justify-center">
            <span className="text-3xl font-black text-gradient animate-versus-pulse">VS</span>
          </div>

          <AnimatePresence mode="wait">
            <ProfileCard
              key={`right-${pair[1].id}`}
              profile={pair[1]}
              side="right"
              onChoose={() => handleChoose(1)}
            />
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Click on the profile you prefer. Elo updates instantly.
        </p>
      </div>
    </div>
  );
}
