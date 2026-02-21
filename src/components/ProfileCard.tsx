import { Instagram, Youtube, Twitch, Globe, Twitter, Crown, Zap } from "lucide-react";
import TierBadge from "./TierBadge";

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
  isPro?: boolean;
  profileFrame?: string;
  isBoosted?: boolean;
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

const frameClasses: Record<string, string> = {
  default: "",
  gold: "ring-4 ring-yellow-400/60",
  neon: "ring-4 ring-primary/60 shadow-[0_0_20px_hsl(210_80%_60%/0.4)]",
  fire: "ring-4 ring-orange-500/60 shadow-[0_0_20px_hsl(25_100%_50%/0.4)]",
  diamond: "ring-4 ring-cyan-300/60 shadow-[0_0_20px_hsl(180_80%_70%/0.4)]",
};

export default function ProfileCard({ profile, side, onChoose }: ProfileCardProps) {
  const frame = profile.profileFrame && frameClasses[profile.profileFrame]
    ? frameClasses[profile.profileFrame]
    : "";

  return (
    <div
      onClick={onChoose}
      className="flex-1 cursor-pointer rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center gap-4 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className="relative">
        <div
          className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden ${
            frame || (side === "left" ? "avatar-ring" : "avatar-ring-accent")
          }`}
        >
          <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
        </div>
        {profile.isPro && (
          <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
            <Crown className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        {profile.isBoosted && (
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-yellow-500 flex items-center justify-center animate-pulse">
            <Zap className="h-3.5 w-3.5 text-yellow-950" />
          </div>
        )}
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
