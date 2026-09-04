/**
 * "Join the Academy" — the hub's below-the-fold community area.
 *
 * The loudest thing on the lower page, but deliberately quieter than the
 * painted library above it: flat navy plates, one gold accent, no illustration.
 *
 * Destinations come from `@/lib/community/links`, which resolves them from the
 * environment and fails closed. None are configured today, so the honest render
 * is a Discord headline in a "not open yet" state plus a line saying so — not a
 * dead link and not a fake invite.
 */
import { Youtube, Instagram, Twitter, Users, ArrowUpRight } from "lucide-react";
import {
  COMMUNITY_CHANNELS,
  secondaryCommunityChannels,
  type CommunityChannel,
  type CommunityChannelId,
} from "@/lib/community/links";

/** Brand marks lucide does not carry. Sized by the caller's `className`. */
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.437 3a13.9 13.9 0 0 0-.63 1.287 18.27 18.27 0 0 0-5.61 0A13.6 13.6 0 0 0 8.56 3a19.74 19.74 0 0 0-4.885 1.372C.554 9.045-.32 13.6.113 18.09a19.9 19.9 0 0 0 6.026 3.05 14.6 14.6 0 0 0 1.29-2.1 13 13 0 0 1-2.03-.978c.171-.125.338-.255.5-.388a14.21 14.21 0 0 0 12.2 0c.164.135.331.265.5.388a13 13 0 0 1-2.034.98c.375.729.808 1.424 1.29 2.098a19.9 19.9 0 0 0 6.03-3.05c.5-5.177-.838-9.69-3.568-13.72M8.02 15.331c-1.183 0-2.157-1.086-2.157-2.42s.955-2.42 2.157-2.42 2.176 1.087 2.156 2.42c0 1.334-.954 2.42-2.156 2.42m7.96 0c-1.183 0-2.157-1.086-2.157-2.42s.955-2.42 2.157-2.42 2.176 1.087 2.156 2.42c0 1.334-.954 2.42-2.156 2.42" />
    </svg>
  );
}

function TikTokMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07" />
    </svg>
  );
}

const CHANNEL_MARKS: Record<CommunityChannelId, (p: { className?: string }) => JSX.Element> = {
  discord: DiscordMark,
  youtube: (p) => <Youtube {...p} aria-hidden />,
  tiktok: TikTokMark,
  instagram: (p) => <Instagram {...p} aria-hidden />,
  // Lucide has no X mark; its Twitter bird is the closest available and reads
  // correctly next to the "X" label.
  x: (p) => <Twitter {...p} aria-hidden />,
};

function SecondaryChannel({ channel }: { channel: CommunityChannel }) {
  const Mark = CHANNEL_MARKS[channel.id];
  if (!channel.url) return null;
  return (
    <a
      href={channel.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`hub-community-${channel.id}`}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[#c9a84c]/20 bg-[#0b1220]/70 px-3.5 py-2 text-sm font-medium text-foreground/85 transition-colors hover:border-[#c9a84c]/45 hover:text-foreground"
    >
      <Mark className="h-4 w-4 text-[#c9a84c]" />
      {channel.label}
    </a>
  );
}

export default function HubCommunitySection() {
  const discord = COMMUNITY_CHANNELS.find((c) => c.id === "discord")!;
  const secondary = secondaryCommunityChannels(COMMUNITY_CHANNELS);
  const openSecondary = secondary.filter((c) => c.url);

  return (
    <section
      data-testid="hub-community-section"
      aria-labelledby="hub-community-heading"
      className="rounded-lg border border-[#c9a84c]/20 bg-[#080d18]/80 px-5 py-7 sm:px-7 sm:py-8"
    >
      <div className="flex items-center gap-2 text-[#c9a84c]">
        <Users className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-widest">Community</span>
      </div>
      <h2
        id="hub-community-heading"
        className="mt-1.5 text-xl font-bold text-foreground sm:text-2xl"
      >
        Join the Academy
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Talk patches, compare runs, and hear about what’s coming to Mogzy before
        anyone else.
      </p>

      {/* Real channels sit opposite the Discord plate; the "on the way" note
          does not — pushed to the far edge of a wide row it reads as stranded
          rather than as a pair with the plate it belongs to. */}
      <div
        className={`mt-6 flex flex-col gap-5 lg:flex-row lg:items-center ${
          openSecondary.length > 0 ? "lg:justify-between" : "lg:gap-6"
        }`}
      >
        {discord.url ? (
          <a
            href={discord.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="hub-community-discord"
            className="group inline-flex min-h-[52px] items-center gap-3 self-start rounded-md bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-6 py-3.5 text-base font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform hover:-translate-y-0.5"
          >
            <DiscordMark className="h-5 w-5" />
            Join the Discord
            <ArrowUpRight className="h-4 w-4 opacity-70" aria-hidden />
          </a>
        ) : (
          /* No invite exists yet. A disabled plate keeps the hierarchy the
             design calls for without pretending there is somewhere to go. */
          <div
            data-testid="hub-community-discord-pending"
            className="inline-flex min-h-[52px] items-center gap-3 self-start rounded-md border border-dashed border-[#c9a84c]/35 bg-[#0b1220]/60 px-6 py-3.5 text-base font-semibold text-muted-foreground"
          >
            <DiscordMark className="h-5 w-5 text-[#c9a84c]/70" />
            Discord — opening soon
          </div>
        )}

        {openSecondary.length > 0 ? (
          <div className="flex flex-wrap gap-2.5">
            {openSecondary.map((channel) => (
              <SecondaryChannel key={channel.id} channel={channel} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            YouTube, TikTok, Instagram and X are on the way.
          </p>
        )}
      </div>
    </section>
  );
}
