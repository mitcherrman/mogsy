import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  profileFrame?: string | null;
}

const sizeClasses = {
  xs: "w-5 h-5",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-16 h-16 sm:w-20 sm:h-20",
  xl: "w-24 h-24 sm:w-32 sm:h-32",
};

const iconSizes = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

const frameClassMap: Record<string, string> = {
  vines: "frame-vines",
  inferno: "frame-inferno",
  frost: "frame-frost",
  holiday: "frame-holiday",
  patriot: "frame-patriot",
  royal: "frame-royal",
  neon: "frame-neon",
};

export default function UserAvatar({ src, name, size = "sm", className = "", profileFrame }: UserAvatarProps) {
  const hasValidSrc = src && !src.includes("dicebear.com") && !src.includes("api.dicebear");
  const frameStyle = profileFrame && profileFrame !== "default" ? frameClassMap[profileFrame] : "";

  return (
    <div className={cn(sizeClasses[size], "rounded-full overflow-hidden flex-shrink-0 bg-muted", frameStyle, className)}>
      {hasValidSrc ? (
        <img src={src} alt={name || ""} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-muted-foreground/30 to-muted-foreground/50 flex items-center justify-center">
          <User className={`${iconSizes[size]} text-muted-foreground/70`} />
        </div>
      )}
    </div>
  );
}
