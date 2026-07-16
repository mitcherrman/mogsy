/**
 * Standalone content-post slide cards (app-cta, community). These share the
 * quiz card's visual system (same Card shell, same phone composition around
 * them) but carry marketing/engagement content instead of the quiz. Rendered
 * INSIDE the phone by the harness for carousel post types.
 *
 * Recap slides reuse the quiz question composition (QuestionCard variant
 * "recap") so they stay visually identical to the real question — this module
 * only owns the two purely-promotional slides.
 *
 * HERO ART: the end/app slides lead with the supplied gold "thinking robot"
 * artwork (public/content/blitz-thinking.png), rendered as a real <img> so it
 * participates in the harness's asset-readiness wait and missing-asset QA.
 * There is deliberately NO fabricated fallback — if the asset is missing the
 * capture fails visibly through QA rather than silently substituting art.
 */
import { Instagram, Twitch, Youtube } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { RenderQuestion } from "@/lib/quiz-screenshot/types";

/** Supplied hero artwork (public asset, served from the site root). */
export const HERO_IMAGE_SRC = "/content/blitz-thinking.png";
const HERO_ALT = "Mogsy — a gold robot pondering a question";

/**
 * Configurable social platform row. Neutral platform list only — no invented
 * handles/URLs. Swap in real handles here when they are confirmed.
 */
const SOCIAL_PLATFORMS = ["TikTok", "Instagram", "YouTube", "Twitch"] as const;

/** Dominant top hero — the real supplied PNG, transparent, never cropped. */
export function HeroArt({ size = 210 }: { size?: number }) {
  return (
    <img
      data-hero-mascot
      src={HERO_IMAGE_SRC}
      alt={HERO_ALT}
      className="object-contain select-none"
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        filter: "drop-shadow(0 10px 26px rgba(0,0,0,0.55))",
      }}
    />
  );
}

/** TikTok note glyph — lucide has no TikTok icon, so this is a minimal inline
 *  SVG (currentColor fill) sized to match the lucide icons in the row. */
function TikTokIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

/** Compact social-platform row. Neutral copy — no handles/URLs invented. */
function SocialLinksRow() {
  const iconFor = (name: string) => {
    if (name === "TikTok") return <TikTokIcon />;
    if (name === "Instagram") return <Instagram className="h-3.5 w-3.5" />;
    if (name === "YouTube") return <Youtube className="h-3.5 w-3.5" />;
    if (name === "Twitch") return <Twitch className="h-3.5 w-3.5" />;
    return null;
  };
  return (
    <div
      data-social-links
      className="flex flex-col items-center gap-1"
      style={{ color: "hsl(215 20% 68%)" }}
    >
      <span className="text-xs font-semibold" style={{ letterSpacing: "0.02em" }}>
        Follow <span className="font-extrabold" style={{ color: "hsl(190 80% 70%)" }}>Mogsy</span> on
      </span>
      <div className="flex items-center gap-3 text-[11px] font-medium">
        {SOCIAL_PLATFORMS.map((name) => (
          <span key={name} className="flex items-center gap-1">
            {iconFor(name)}
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Post Type 1, slide 2 — competitive app CTA led by the gold hero.
 *  Text-led "PLAY AT / mogsy.app" hierarchy — deliberately NOT a button box. */
export function AppCtaSlide() {
  return (
    <Card data-content-slide="app-cta" className="bg-card/80 backdrop-blur-sm">
      <CardContent className="flex flex-col items-center gap-5 py-7 text-center">
        <HeroArt size={210} />
        <h2
          className="text-2xl font-extrabold uppercase leading-tight text-foreground"
          style={{ letterSpacing: "0.01em" }}
        >
          Think you know League?{" "}
          <span
            style={{
              backgroundImage: "linear-gradient(92deg, hsl(46 98% 74%), hsl(40 96% 62%))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              // The theme's h2 text-shadow would paint through transparent
              // gradient-clipped glyphs and muddy them — kill it here.
              textShadow: "none",
              filter: "drop-shadow(0 0 14px rgba(251,191,36,0.5))",
            }}
          >
            Prove it.
          </span>
        </h2>
        {/* Support line: clearly readable but still secondary — brighter
            neutral (not cyan/gold) and a step up in weight, nothing else. */}
        <p className="text-base font-semibold" style={{ color: "hsl(215 30% 86%)" }}>
          Challenge others to test your knowledge at
        </p>
        <div data-play-cta className="flex flex-col items-center py-1">
          <span
            className="text-4xl font-extrabold tracking-tight"
            style={{
              // A normal-ish line box (not leading-none): with
              // background-clip:text the gradient only paints inside the line
              // box, so a tight one leaves the g/y descenders transparent
              // (they render clipped). Keep the glyphs fully painted.
              lineHeight: 1.25,
              backgroundImage:
                "linear-gradient(92deg, hsl(190 95% 72%), hsl(196 92% 62%) 55%, hsl(43 92% 66%))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 0 18px rgba(34,211,238,0.45))",
            }}
          >
            mogsy.app
          </span>
        </div>
        <SocialLinksRow />
      </CardContent>
    </Card>
  );
}

/** Post Type 2, slide 3 — "stack up against the crowd" follow-up, led by the
 *  hero, closing with socials. */
export function CommunitySlide({ question: _question }: { question: RenderQuestion }) {
  return (
    <Card data-content-slide="community" className="bg-card/80 backdrop-blur-sm">
      <CardContent className="flex flex-col items-center gap-5 py-7 text-center">
        <HeroArt size={200} />
        <h2
          className="text-2xl font-extrabold uppercase leading-tight text-foreground"
          style={{ letterSpacing: "0.01em" }}
        >
          See how your answers{" "}
          <span
            style={{
              backgroundImage: "linear-gradient(92deg, hsl(188 98% 82%), hsl(194 95% 70%))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              // Same text-shadow suppression as the app-cta accent.
              textShadow: "none",
              filter: "drop-shadow(0 0 14px rgba(34,211,238,0.55))",
            }}
          >
            stack up
          </span>
        </h2>
        <p className="text-lg font-bold" style={{ color: "hsl(190 70% 74%)" }}>
          Check the comments and compare answers
        </p>
        <p className="text-lg font-bold" style={{ color: "hsl(43 60% 74%)" }}>
          Think they’re wrong?
        </p>
        <SocialLinksRow />
      </CardContent>
    </Card>
  );
}
