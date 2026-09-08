/**
 * "Join the Academy" — the Commons' second **supporting slip**.
 *
 * ### Revision 24 — it moved, and it kept everything
 * This section used to own the large parchment noticeboard. The Academy
 * Bulletin holds that board now: five links do not earn one of the two biggest
 * surfaces in the room. Community moved to the right of the two small painted
 * parchments, beside Premium.
 *
 * **The behaviour is untouched.** Destinations still come from
 * `@/lib/community/links`, which resolves them from the environment, accepts
 * `https:` only and fails closed. **None are configured today**, so the honest
 * render is still a Discord headline in a "not open yet" state plus a line
 * saying so — not a dead link and not a fake invite. Every per-channel
 * `if (!channel.url) return null` and the collapsed "on the way" footnote are
 * exactly as they shipped; only the surface got smaller.
 */
import { Youtube, Instagram, Twitter, ArrowUpRight } from "lucide-react";
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

/**
 * A secondary channel, as an icon-only mark on the slip. The label is carried
 * by `aria-label` and `title` rather than by visible text — the sheet is small
 * now, and four labelled chips would not fit without dropping one. The channel
 * still renders only when it has a resolved URL.
 */
function SecondaryChannel({ channel }: { channel: CommunityChannel }) {
  const Mark = CHANNEL_MARKS[channel.id];
  if (!channel.url) return null;
  return (
    <a
      href={channel.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={channel.label}
      title={channel.label}
      data-testid={`hub-community-${channel.id}`}
      className="academy-commons-support-mark inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[2px] border border-[#6d5a33]/50 bg-[#e6d9b6]/45 text-[#2c2417] transition-colors hover:bg-[#efe4c6]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230]"
    >
      <Mark className="h-4 w-4 text-[#7a6230]" />
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
      className="academy-commons-notice academy-commons-support academy-commons-support-community relative flex min-w-0 flex-col justify-center rounded-[2px] px-5 py-4 [transform:rotate(-0.28deg)]"
    >
      <span
        aria-hidden
        className="academy-commons-pin absolute left-1/2 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
      />

      <span className="academy-commons-notice-soft academy-commons-support-eyebrow text-[10px] font-bold uppercase tracking-[0.28em]">
        Community
      </span>
      <h2
        id="hub-community-heading"
        className="academy-commons-notice-ink academy-commons-support-title text-[1.05rem] font-semibold leading-tight"
        style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
      >
        Join the Academy
      </h2>
      <p className="academy-commons-notice-soft academy-commons-support-blurb mt-1.5 text-[12.5px] leading-snug">
        Talk patches, compare runs, and hear what’s coming first.
      </p>

      <div className="academy-commons-support-actions mt-3 flex flex-wrap items-center gap-2">
        {discord.url ? (
          <a
            href={discord.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="hub-community-discord"
            className="academy-commons-support-cta inline-flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#7a6230]/45 bg-[#e6d9b6]/45 px-3.5 py-1.5 text-[13px] font-semibold text-[#2c2417] transition-colors hover:bg-[#f0e5c8]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230]"
          >
            <DiscordMark className="h-4 w-4 text-[#7a6230]" />
            Join the Discord
            <ArrowUpRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </a>
        ) : (
          /* No invite exists yet. A dashed entry keeps the hierarchy the design
             calls for without pretending there is somewhere to go. */
          <div
            data-testid="hub-community-discord-pending"
            className="academy-commons-support-cta inline-flex min-h-[44px] items-center gap-2 rounded-[2px] border border-dashed border-[#7a6230]/55 bg-[#d3c19a]/40 px-3.5 py-1.5 text-[13px] font-semibold text-[#4a3d24]"
          >
            <DiscordMark className="h-4 w-4 text-[#7a6230]" />
            Discord — opening soon
          </div>
        )}

        {openSecondary.map((channel) => (
          <SecondaryChannel key={channel.id} channel={channel} />
        ))}
      </div>

      {openSecondary.length === 0 && (
        <p className="academy-commons-notice-soft academy-commons-support-footnote mt-2 text-[11.5px] leading-snug">
          YouTube, TikTok, Instagram and X are on the way.
        </p>
      )}
    </section>
  );
}
