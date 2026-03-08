import { Instagram, Youtube, Twitch, Globe, Twitter, Crown, Zap, User } from "lucide-react";
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
      className="flex-1 cursor-pointer rounded-2xl bg-card p-3 sm:p-4 flex flex-col items-center text-center gap-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] min-w-0"
    >
      <div className="relative">
        <div
          className={`w-20 h-20 sm:w-32 sm:h-32 rounded-full overflow-hidden ${
            frame || (side === "left" ? "avatar-ring" : "avatar-ring-accent")
          }`}
        >
          {profile.avatarUrl && !profile.avatarUrl.includes("dicebear") ? (
            <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-muted-foreground/30 to-muted-foreground/50 flex items-center justify-center">
              <User className="h-8 w-8 sm:h-16 sm:w-16 text-muted-foreground/70" />
            </div>
          )}
        </div>
        {profile.isPro && (
          <div className="absolute -top-1 -right-1 h-5 w-5 sm:h-7 sm:w-7 rounded-full bg-primary flex items-center justify-center">
            <Crown className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
          </div>
        )}
        {profile.isBoosted && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-yellow-500 flex items-center justify-center animate-pulse">
            <Zap className="h-3 w-3 text-yellow-950" />
          </div>
        )}
      </div>

      <div className="space-y-0.5 min-w-0 w-full">
        <h3 className="text-sm sm:text-xl font-extrabold text-foreground truncate">{profile.displayName}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground truncate">
          {profile.age ? `${profile.age} · ` : ""}{profile.location}
        </p>
        <TierBadge tier={profile.tier} className="mt-0.5" />
      </div>

      {profile.statusMessage && (
        <p className="text-xs sm:text-sm text-foreground/80 italic truncate w-full">"{profile.statusMessage}"</p>
      )}

      <div className="flex gap-2 sm:gap-3">
        {Object.entries(profile.socials || {}).map(([key, value]) => {
          const Icon = socialIcons[key];
          if (!Icon || !value) return null;
          return (
            <a key={key} href={`https://${key === "x" ? "x.com" : key === "website" ? "" : key + ".com"}/${value}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors">
              <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
            </a>
          );
        })}
      </div>

      <div className="text-[10px] sm:text-xs font-bold text-muted-foreground mt-auto">
        ELO {profile.elo}
      </div>
    </div>
  );
}
