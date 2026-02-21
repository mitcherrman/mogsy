import { cn } from "@/lib/utils";
import { getTierBgColor, getTierColor } from "@/lib/mock-data";

interface TierBadgeProps {
  tier: string;
  className?: string;
}

export default function TierBadge({ tier, className }: TierBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
        getTierBgColor(tier),
        getTierColor(tier),
        className
      )}
    >
      {tier}
    </span>
  );
}
