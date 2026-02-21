import { Instagram, Youtube, Twitch, Globe, Twitter } from "lucide-react";
import TierBadge from "./TierBadge";
import { getTierFromElo } from "@/lib/mock-data";

interface ProfileCardProfile {
  id: string;
  displayName: string;
  age: number;
  location: string;
  statusMessage: string;
  avatarUrl: string;
  socials: Record<string, string>;
  elo: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
}

interface ProfileCardProps {
  profile: ProfileCardProfile;
  side: "left" | "right";
  onChoose: () => void;
}

const socialIcons: Record<string, React.ElementType> = {
  instagram: Instagram,
  youtube: Youtube,
  twitch: Twitch,
  x: Twitter,
  website: Globe,
};

export default function ProfileCard({ profile, side, onChoose }: ProfileCardProps) {
  return (
    <div
      onClick={onChoose}
      className="flex-1 cursor-pointer rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center gap-4 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
    >
      <div
        className={`relative w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden ${side === "left" ? "avatar-ring" : "avatar-ring-accent"}`}
      >
        <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
      </div>

      <div className="space-y-1">
        <h3 className="text-xl font-extrabold text-foreground">{profile.displayName}</h3>
        <p className="text-sm text-muted-foreground">
          {profile.age ? `${profile.age} · ` : ""}{profile.location}
        </p>
        <TierBadge tier={profile.tier} className="mt-1" />
      </div>

      {profile.statusMessage && (
        <p className="text-sm text-foreground/80 italic">"{profile.statusMessage}"</p>
      )}

      <div className="flex gap-3">
        {Object.entries(profile.socials || {}).map(([key, value]) => {
          const Icon = socialIcons[key];
          if (!Icon || !value) return null;
          return (
            <a key={key} href={`https://${key === "x" ? "x.com" : key === "website" ? "" : key + ".com"}/${value}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors">
              <Icon className="h-4 w-4" />
            </a>
          );
        })}
      </div>

      <div className="text-xs font-bold text-muted-foreground mt-auto">
        ELO {profile.elo}
      </div>
    </div>
  );
}
