/**
 * "Join the Academy" — the Commons' **noticeboard**.
 *
 * Second in the room's hierarchy, under the membership plaque: a walnut
 * planked board with a parchment bill pinned to it. Quieter than the plaque by
 * construction — the bill carries ink on paper, not gilt, and the board's own
 * wood is the same `--shelf-*` walnut as the hall's shelving.
 *
 * Destinations come from `@/lib/community/links`, which resolves them from the
 * environment and fails closed. **None are configured today**, so the honest
 * render is a Discord headline in a "not open yet" state plus a line saying so
 * — not a dead link and not a fake invite. Solving the Discord/social
 * configuration is explicitly out of scope for the two-screen redesign; this
 * component's behaviour is unchanged from 2026-09-04 and only its surface moved.
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

/** A brass pin. Decorative only — the notice is held to the board by these. */
function Pin({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`academy-commons-pin absolute h-2.5 w-2.5 rounded-full ${className ?? ""}`}
    />
  );
}

function SecondaryChannel({ channel }: { channel: CommunityChannel }) {
  const Mark = CHANNEL_MARKS[channel.id];
  if (!channel.url) return null;
  return (
    <a
      href={channel.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`hub-community-${channel.id}`}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#6d5a33]/50 bg-[#e6d9b6]/45 px-3 py-1.5 text-[13px] font-semibold text-[#2c2417] transition-colors hover:bg-[#efe4c6]/70"
    >
      <Mark className="h-3.5 w-3.5 text-[#7a6230]" />
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
      className="academy-commons-board relative flex min-w-0 flex-col justify-center rounded-[3px] border-4 border-solid p-4 sm:p-5"
    >
      {/* The pinned bill. Deliberately NOT stretched to the board: a sheet that
          fills its board is just a card with a brown outline, and stretching it
          opened a large void down the middle. Auto-height and centred, it
          leaves real planking showing all round — which is the whole reason the
          board is here.

          The rotation is what stops it reading as a rectangle inside a
          rectangle; it is under half a degree, so no line of type is measurably
          off the horizontal. */}
      <div className="academy-commons-notice relative flex flex-col rounded-[2px] px-5 py-5 [transform:rotate(-0.45deg)] sm:px-6">
        <Pin className="left-4 top-2.5" />
        <Pin className="right-4 top-2.5" />

        <span className="academy-commons-notice-soft text-[10px] font-bold uppercase tracking-[0.28em]">
          Notice Board
        </span>
        <h2
          id="hub-community-heading"
          className="academy-commons-notice-ink mt-1 text-[1.35rem] font-medium leading-tight sm:text-2xl"
          style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
        >
          Join the Academy
        </h2>
        <p className="academy-commons-notice-soft mt-2 max-w-sm text-[13px] leading-relaxed">
          Talk patches, compare runs, and hear about what’s coming to Mogzy
          before anyone else.
        </p>

        <div className="pt-5">
          {discord.url ? (
            <a
              href={discord.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hub-community-discord"
              className="group inline-flex min-h-[52px] items-center gap-3 rounded-[3px] bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-5 py-3 text-[15px] font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <DiscordMark className="h-5 w-5" />
              Join the Discord
              <ArrowUpRight className="h-4 w-4 opacity-70" aria-hidden />
            </a>
          ) : (
            /* No invite exists yet. A struck-through entry on the bill keeps
               the hierarchy the design calls for without pretending there is
               somewhere to go. */
            <div
              data-testid="hub-community-discord-pending"
              className="inline-flex min-h-[52px] items-center gap-3 rounded-[2px] border border-dashed border-[#7a6230]/55 bg-[#d3c19a]/40 px-5 py-3 text-[15px] font-semibold text-[#4a3d24]"
            >
              <DiscordMark className="h-5 w-5 text-[#7a6230]" />
              Discord — opening soon
            </div>
          )}

          {openSecondary.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {openSecondary.map((channel) => (
                <SecondaryChannel key={channel.id} channel={channel} />
              ))}
            </div>
          ) : (
            <p className="academy-commons-notice-soft mt-3 text-[11.5px] leading-snug">
              YouTube, TikTok, Instagram and X are on the way.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
