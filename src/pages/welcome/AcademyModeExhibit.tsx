import combatMage from "@/academy/welcome/combat-mage.png";
import combatTank from "@/academy/welcome/combat-tank.png";
import statCheckFrame from "@/academy/welcome/statcheck-frame.png";
import statAttackDamage from "@/academy/welcome/stat-attack-damage.png";
import statHealth from "@/academy/welcome/stat-health.png";

import type { AcademyMode } from "./academyModes";

/**
 * The featured exhibit — one mode, shown large.
 *
 * Every exhibit shares an outer frame and a FIXED aspect box, so switching modes
 * swaps the contents without moving anything around it. That is deliberate: the
 * selector row sits directly underneath, and an exhibit that changed height
 * would shift the control the visitor is currently using.
 *
 * All artwork here is local. The introduction is the first thing a new visitor
 * sees, so nothing in it waits on the champion-assets API — a first impression
 * that renders empty because a backend is cold is worse than no artwork at all.
 */
export default function AcademyModeExhibit({
  mode,
  compact = false,
}: {
  mode: AcademyMode;
  /** Landscape phones (~360px tall) — the exhibit has to give up height. */
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-2xl",
        "border border-[#c9a84c]/25",
        "bg-gradient-to-b from-[#0c1020]/85 to-[#070a14]/85",
        "shadow-[0_18px_50px_rgba(0,0,0,0.55)]",
      ].join(" ")}
    >
      {/* Warm pool of light, as if the exhibit is under its own lamp. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(65% 55% at 50% 30%, rgba(201,168,76,0.15) 0%, rgba(127,214,239,0.05) 45%, transparent 75%)",
        }}
      />
      <div
        className={[
          "relative flex w-full items-center justify-center px-4 py-3",
          compact
            ? // A landscape phone is ~360px tall and still has to fit a heading,
              // a caption, four selectors, the CTA and the footer rail beneath
              // this. A fixed pixel cap is used rather than a vh fraction so the
              // exhibit cannot quietly reclaim the room they need.
              "aspect-[21/9] max-h-[122px]"
            : "aspect-[16/9] max-h-[38vh] sm:max-h-[42vh]",
        ].join(" ")}
      >
        {mode.visual.kind === "plate" && (
          <PlateExhibit src={mode.visual.src} focus={mode.visual.emblemFocus} />
        )}
        {mode.visual.kind === "duel" && <DuelExhibit />}
        {mode.visual.kind === "socket" && <SocketExhibit />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exhibits                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A painted Academy plate, framed as a hanging emblem.
 *
 * The source images are complete card designs — dark plate, emblem, engraved
 * name — so they are cropped to a circle around the emblem. That keeps the part
 * that carries meaning, drops the engraved name (see academyModes.ts), and
 * makes the two painted modes sit at the same visual weight as the two composed
 * ones instead of reading as "the finished cards".
 */
function PlateExhibit({ src, focus }: { src: string; focus: string }) {
  return (
    <div className="relative flex h-full items-center justify-center">
      {/* Concentric rings, echoing the ones painted into the plates themselves.
          Without them a single medallion floated in a wide panel and read as a
          small coin rather than a featured artifact. */}
      <div
        className="pointer-events-none absolute aspect-square h-full max-h-[290px] rounded-full border border-[#c9a84c]/12"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute aspect-square h-full max-h-[245px] rounded-full border border-[#c9a84c]/20"
        aria-hidden="true"
      />
      <div className="relative aspect-square h-full max-h-[200px] overflow-hidden rounded-full border border-[#c9a84c]/45 shadow-[0_0_54px_rgba(201,168,76,0.22)]">
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          // Scaled up and framed on the emblem so the engraved name at the
          // bottom of the source plate falls outside the circle entirely.
          className="h-full w-full scale-[1.55] object-cover"
          style={{ objectPosition: focus }}
        />
      </div>
    </div>
  );
}

/**
 * Combat Lab — two combatants and a damage readout.
 *
 * Uses the canonical Mogzy class characters (mage and tank), which is what the
 * product already uses to stand for combat roles. Those files are RGB with no
 * alpha channel, so they are mounted INSIDE dark portrait frames where their
 * black ground reads as the inside of the frame rather than as a bug — the same
 * trap that made the reaction poses unusable on the lit Stage 1 background.
 */
function DuelExhibit() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-3 sm:gap-6">
      <Combatant src={combatMage} />

      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="ranked-title text-[clamp(1.4rem,3.4vw,2.4rem)] leading-none text-[#ff9d6b] drop-shadow-[0_0_14px_rgba(255,120,60,0.45)]">
          1,284
        </span>
        <span className="text-[9px] uppercase tracking-[0.24em] text-[#cfc4a5]/60 sm:text-[10px]">
          damage
        </span>
        {/* Health bar draining — the Combat Lab's actual output shape. */}
        <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:w-24">
          <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-[#ff6b4a] to-[#ffb46b]" />
        </div>
      </div>

      <Combatant src={combatTank} />
    </div>
  );
}

function Combatant({ src }: { src: string }) {
  return (
    <div className="relative h-full max-h-[190px] w-[26%] max-w-[130px] overflow-hidden rounded-xl border border-[#c9a84c]/30 bg-black shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  );
}

/**
 * Stat Check — the real card socket holding a stat, against a rival value.
 *
 * `statcheck-frame.png` and the stat icons are the product's own Stat Check
 * board art (downscaled for this screen), so the preview shows the actual
 * furniture of the mode rather than a generic icon.
 */
function SocketExhibit() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-3 sm:gap-7">
      <StatSocket icon={statAttackDamage} value="64" winner />
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="ranked-title text-[clamp(0.9rem,2.2vw,1.4rem)] leading-none text-[#f0d78c]">
          vs
        </span>
        <span className="text-[9px] uppercase tracking-[0.22em] text-[#cfc4a5]/55 sm:text-[10px]">
          higher?
        </span>
      </div>
      <StatSocket icon={statHealth} value="?" />
    </div>
  );
}

function StatSocket({
  icon,
  value,
  winner = false,
}: {
  icon: string;
  value: string;
  winner?: boolean;
}) {
  return (
    <div className="relative h-full max-h-[190px] w-[28%] max-w-[132px]">
      <img
        src={statCheckFrame}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
      {/* Contents sit inside the frame's stone panel, which occupies roughly the
          top 8%–72% of the artwork — below that the gold border and its gem
          take over, so anything placed lower collides with the frame. */}
      <div className="absolute inset-x-0 top-[11%] flex h-[56%] flex-col items-center justify-center gap-1.5">
        <img
          src={icon}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-[46%] w-auto drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
        />
        <span
          className={[
            "ranked-title text-[clamp(1rem,2.4vw,1.45rem)] font-bold leading-none",
            winner ? "text-[#141826]" : "text-[#141826]/45",
          ].join(" ")}
          // The stone panel is light and mottled; a soft light halo keeps the
          // numeral readable over the cracks without darkening the artwork.
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.55)" }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
