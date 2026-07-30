import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";

/**
 * A castable ability control for the Combat Lab.
 *
 * Built to read as an in-game action button rather than a form control: a
 * beveled double frame around a full-bleed ability icon, a hard-edged key badge
 * (Q / W / E / R, or a variant token like QQ / Q1), and press/hover physics on
 * the frame instead of the artwork. The icon *is* the content — chrome only
 * frames it.
 *
 * `iconUrl` points at Mogzy's stored ability art (see lib/combat-lab/abilityIcons).
 * When it is absent, fails to load, or the champion has no stored art, the
 * button falls back to `glyph` so the control never renders empty.
 */

export type AbilityButtonTone = "q" | "w" | "e" | "r" | "neutral";

const TONE: Record<AbilityButtonTone, { frame: string; badge: string; glow: string }> = {
  q: {
    frame: "from-amber-300/70 via-amber-500/30 to-amber-900/40",
    badge: "text-amber-200 ring-amber-300/40",
    glow: "group-hover:shadow-[0_0_16px_-3px_rgb(251_191_36/0.65)]",
  },
  w: {
    frame: "from-sky-300/70 via-sky-500/30 to-sky-900/40",
    badge: "text-sky-200 ring-sky-300/40",
    glow: "group-hover:shadow-[0_0_16px_-3px_rgb(56_189_248/0.65)]",
  },
  e: {
    frame: "from-emerald-300/70 via-emerald-500/30 to-emerald-900/40",
    badge: "text-emerald-200 ring-emerald-300/40",
    glow: "group-hover:shadow-[0_0_16px_-3px_rgb(52_211_153/0.65)]",
  },
  r: {
    frame: "from-fuchsia-300/70 via-fuchsia-500/30 to-fuchsia-900/40",
    badge: "text-fuchsia-200 ring-fuchsia-300/40",
    glow: "group-hover:shadow-[0_0_16px_-3px_rgb(232_121_249/0.65)]",
  },
  neutral: {
    frame: "from-primary/60 via-primary/25 to-background/60",
    badge: "text-primary ring-primary/40",
    glow: "group-hover:shadow-[0_0_16px_-3px_hsl(var(--primary)/0.6)]",
  },
};

const SIZE = {
  md: { box: "h-11 w-11", badge: "text-[9px] px-1", glyph: "h-4 w-4", rank: "text-[8px]" },
  lg: { box: "h-14 w-14", badge: "text-[10px] px-1.5", glyph: "h-5 w-5", rank: "text-[9px]" },
} as const;

export default function AbilityButton({
  iconUrl,
  glyph: Glyph,
  keyLabel,
  tone = "neutral",
  size = "lg",
  rankBadge,
  locked = false,
  busy = false,
  disabled = false,
  onClick,
  title,
  ariaLabel,
}: {
  iconUrl?: string | null;
  glyph: React.ElementType;
  /** Key the player presses — "Q", "R", or a variant token such as "QQ" / "Q1". */
  keyLabel?: string;
  tone?: AbilityButtonTone;
  size?: keyof typeof SIZE;
  /** Short rank chip, e.g. "5". Omitted for actions that carry no rank. */
  rankBadge?: string;
  /** Not learned / unavailable: desaturated with a lock, and not clickable. */
  locked?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);

  const t = TONE[tone];
  const s = SIZE[size];
  const inert = locked || disabled || busy;
  const showImage = !!iconUrl && !failed;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      title={title}
      aria-label={ariaLabel}
      className={`group relative shrink-0 rounded-lg bg-gradient-to-b p-[1.5px] transition-all duration-150 ${s.box} ${t.frame} ${
        locked || disabled
          ? "cursor-not-allowed opacity-45 saturate-0"
          : `cursor-pointer ${t.glow} hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.96]`
      }`}
    >
      {/* Inner bezel — clips the art and carries the pressed-in shading. */}
      <span className="relative block h-full w-full overflow-hidden rounded-[6px] bg-background/80 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.55)]">
        {showImage ? (
          <img
            src={iconUrl as string}
            alt=""
            // Not lazy: these are ~50px icons in the first viewport and the
            // action bar is the point of the page. Deferring them only risks a
            // blank tile if the deferred load is cancelled by a navigation.
            draggable={false}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/40 to-background/70">
            <Glyph className={`${s.glyph} text-foreground/70`} />
          </span>
        )}

        {/* Glass highlight across the top half — the "pressable" read. */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
        <span className="pointer-events-none absolute inset-0 rounded-[6px] ring-1 ring-inset ring-white/10" />

        {locked && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
            <Lock className="h-3.5 w-3.5 text-foreground/70" />
          </span>
        )}
        {busy && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </span>
        )}

        {rankBadge && !locked && (
          <span
            className={`pointer-events-none absolute left-0 top-0 rounded-br-[5px] bg-background/85 px-1 font-bold leading-[1.4] text-foreground/90 ${s.rank}`}
          >
            {rankBadge}
          </span>
        )}
        {keyLabel && (
          <span
            className={`pointer-events-none absolute bottom-0 right-0 rounded-tl-[5px] bg-background/90 font-black uppercase leading-[1.5] tracking-wide ring-1 ring-inset ${s.badge} ${t.badge}`}
          >
            {keyLabel}
          </span>
        )}
      </span>
    </button>
  );
}
