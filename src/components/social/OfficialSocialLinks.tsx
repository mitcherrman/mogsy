import { Facebook, Instagram, Music2, MessageCircle, Twitter, Youtube } from "lucide-react";
import { track } from "@/lib/analytics";
import { OFFICIAL_SOCIALS, type OfficialSocialId } from "@/lib/official-socials";

const icons = { youtube: Youtube, tiktok: Music2, instagram: Instagram, x: Twitter, facebook: Facebook, discord: MessageCircle };

export function OfficialSocialLinks({ placement, compact = false, label = "Follow MOGZY" }: {
  placement: "home_hub" | "daily_main_result" | "daily_completion" | "footer";
  compact?: boolean;
  label?: string;
}) {
  return (
    <nav data-testid={`official-socials-${placement}`} aria-label={label} className={compact ? "flex flex-wrap items-center justify-center gap-1.5" : "flex flex-wrap items-center justify-center gap-2"}>
      {!compact && <span className="w-full text-center text-xs font-semibold tracking-wide text-current/80">{label}</span>}
      {OFFICIAL_SOCIALS.map(({ id, label: name, href }) => {
        const Icon = icons[id as OfficialSocialId];
        return (
          <a key={id} href={href} target="_blank" rel="noopener noreferrer"
            aria-label={`MOGZY on ${name} (opens in new tab)`} title={name}
            onClick={() => track("official_social_clicked", { metadata: { placement, platform: id } })}
            className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-current/20 bg-black/15 px-2 text-current hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {!compact && <span className="text-xs">{name}</span>}
          </a>
        );
      })}
    </nav>
  );
}
