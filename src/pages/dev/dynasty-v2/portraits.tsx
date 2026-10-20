/**
 * VIS-F3/F4 — esports player identity: the four-tier portrait chain
 * (vis_f2_support/02 `player.portrait`, owner decision 2026-10-19).
 *
 *   1. approved real-player portrait   — `PORTRAIT_REAL[player.id]`, needs its own rights row (05 §3)
 *   2. original fictional-player art   — `PORTRAIT_ART[player.id]`, commissioned / drawn for Dynasty
 *   3. premium placeholder             — code-drawn character portrait (this file)
 *   4. monogram ring                   — `Monogram` from parts.tsx (passed in as `fallback`)
 *
 * Both image tiers are EMPTY in this prototype: Mogzy holds no licence to
 * real-player imagery for Dynasty, and no original art has been commissioned.
 * The chain still runs: an image that fails to load drops to the next tier,
 * and `data-tier` reports which one is showing. The same frame geometry is
 * used for all four, and the ring colour (star / academy / signed) is drawn by
 * the card, outside the portrait, in every tier. Simulated traits never
 * appear inside this frame (02: never a caption on a real person's photo).
 *
 * VIS-F4 makes tier 3 a character: three poses (front, three-quarter, arms
 * crossed), seeded hair, skin, jersey cut and number, the org patch on the
 * chest, a headset with the mic boom, rim light from the stage. Still no
 * facial features — a designed silhouette, never a likeness.
 */
import { useState, type ReactNode } from "react";
import type { Player } from "./fixtures";
import { pick } from "./media";
import type { PlayerSize } from "./cards";

/** Tier 1: approved real portraits. Empty on purpose (no licence, 05 §3). Key = player id. */
export const PORTRAIT_REAL: Readonly<Record<string, { src: string; rights: string }>> = {};
/** Tier 2: original fictional-player artwork. Empty on purpose (none commissioned). Key = player id. */
export const PORTRAIT_ART: Readonly<Record<string, { src: string; artist: string }>> = {};

export type PortraitTier = "real" | "art" | "placeholder" | "monogram";

const HAIR = ["crop", "swept", "long", "cap", "bun", "fade"] as const;
const SKIN = ["#f1c9a5", "#d9a57c", "#b67c56", "#8d5a3b", "#5c3a26"] as const;
const POSE = ["front", "quarter", "crossed"] as const;

/** Tier 3: the premium placeholder. A styled character portrait, seeded by the player id, lit from the top left in the org accent. */
export function PlaceholderPortrait({ p, className, mono }: { p: Player; className?: string; mono?: string }) {
  const hair = pick(HAIR, `hair|${p.id}`);
  const skin = pick(SKIN, `skin|${p.id}`);
  const stripe = pick([0, 1, 2], `stripe|${p.id}`);
  const pose = pick(POSE, `pose|${p.id}`);
  const num = 1 + (pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], `num|${p.id}`) * 7 + pick([1, 2, 3], `n2|${p.id}`)) % 98;
  const A = "var(--dyn-accent, #e3c66f)";
  const gid = `pp-${p.id.replace(/[^a-z0-9]/gi, "")}`;
  const tilt = pose === "quarter" ? -6 : 0;
  return (
    <svg viewBox="0 0 64 76" aria-hidden className={className} data-slot="player.portrait" data-pose={pose}>
      <defs>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A} stopOpacity="0.4" /><stop offset="1" stopColor="#07111f" stopOpacity="0.95" /></linearGradient>
        <linearGradient id={`${gid}-rim`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.4" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${gid}-jersey`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#223656" /><stop offset="1" stopColor="#0b1727" /></linearGradient>
        <radialGradient id={`${gid}-spot`} cx="50%" cy="0%" r="70%"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.28" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="64" height="76" fill={`url(#${gid}-bg)`} />
      <rect width="64" height="76" fill={`url(#${gid}-spot)`} />
      <path d="M0 76 L0 60 Q32 50 64 60 L64 76 Z" fill="#000" opacity="0.2" />
      <g transform={`rotate(${tilt} 32 40)`}>
        {/* shoulders + jersey */}
        <path d="M4 76 C4 56 16 49 26 47 L38 47 C48 49 60 56 60 76 Z" fill={`url(#${gid}-jersey)`} />
        <path d="M4 76 C4 56 16 49 26 47 L38 47 C48 49 60 56 60 76 Z" fill={`url(#${gid}-rim)`} />
        {stripe === 0 ? <path d="M26 47 L22 76 L30 76 L32 49 Z" fill={A} fillOpacity="0.8" /> : stripe === 1 ? <path d="M4 66 C14 61 50 61 60 66 L60 70 C50 65 14 65 4 70 Z" fill={A} fillOpacity="0.75" /> : <><path d="M38 47 L42 76 L34 76 L32 49 Z" fill={A} fillOpacity="0.8" /><path d="M4 70 L60 70 L60 73 L4 73 Z" fill={A} fillOpacity="0.5" /></>}
        {/* org patch + number */}
        <path d="M14 58 L19 61 V67 L14 70 L9 67 V61 Z" fill="#07111f" stroke={A} strokeWidth="1" />
        <text x="14" y="66.5" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="5" fill="#f5ecd3">{(mono ?? "WD").slice(0, 2)}</text>
        <text x="48" y="68" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="9" fill="#f5ecd3" fillOpacity="0.85">{num}</text>
        {pose === "crossed" ? <><path d="M12 66 C20 60 30 62 36 68" fill="none" stroke="#1a2a44" strokeWidth="6" strokeLinecap="round" /><path d="M52 66 C44 60 34 62 28 68" fill="none" stroke="#1a2a44" strokeWidth="6" strokeLinecap="round" /><circle cx="36" cy="68" r="3.4" fill={skin} /><circle cx="28" cy="68" r="3.4" fill={skin} /></> : null}
        {/* neck + head */}
        <rect x="27" y="37" width="10" height="12" rx="3" fill={skin} />
        <ellipse cx="32" cy="27" rx="11" ry="13" fill={skin} />
        <path d="M21 27 C21 20 24 14 32 14 C40 14 43 20 43 27" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1" />
        {/* hair */}
        {hair === "crop" ? <path d="M21 25 C21 13 43 13 43 25 L43 23 C40 17 24 17 21 23 Z" fill="#141a26" /> : null}
        {hair === "swept" ? <path d="M20 27 C19 13 42 9 45 23 C40 19 30 21 26 29 C24 25 22 25 20 27 Z" fill="#1d1a24" /> : null}
        {hair === "long" ? <path d="M20 27 C20 13 44 13 44 27 L46 46 L40 42 L40 29 C36 23 28 23 24 29 L24 42 L18 46 Z" fill="#241a1a" /> : null}
        {hair === "cap" ? <><path d="M19 25 C19 13 45 13 45 25 Z" fill="#0b1727" /><path d="M17 25 L47 25 L52 29 L17 29 Z" fill="#0b1727" /><rect x="26" y="18" width="12" height="4" rx="1" fill={A} fillOpacity="0.8" /></> : null}
        {hair === "bun" ? <><path d="M21 25 C21 13 43 13 43 25 L43 23 C40 17 24 17 21 23 Z" fill="#2a1c14" /><circle cx="32" cy="12" r="5" fill="#2a1c14" /></> : null}
        {hair === "fade" ? <path d="M22 24 C22 14 42 14 42 24 L42 21 C39 16 25 16 22 21 Z" fill="#0f1218" /> : null}
        {/* headset + mic boom */}
        <path d="M19 29 C19 15 45 15 45 29" fill="none" stroke="#2c3a52" strokeWidth="2.6" />
        <rect x="17" y="26" width="5" height="9" rx="2" fill="#2c3a52" /><rect x="42" y="26" width="5" height="9" rx="2" fill="#2c3a52" />
        <path d="M44 34 C44 40 40 42 36 42" fill="none" stroke="#2c3a52" strokeWidth="1.6" /><circle cx="35.5" cy="42" r="1.6" fill="#2c3a52" />
        <circle cx="44.5" cy="30.5" r="1.3" fill={A} />
        {/* face shadow, no features: a silhouette, never a likeness */}
        <ellipse cx="32" cy="30" rx="9" ry="8" fill="#000" opacity="0.12" />
      </g>
    </svg>
  );
}

/**
 * Runs the chain and reports the tier through `data-tier`. The parent frame
 * provides the geometry; this fills it.
 */
export function PortraitSlot({ p, size, fallback, className, mono }: { p: Player; size?: PlayerSize | "spotlight"; fallback: ReactNode; className?: string; mono?: string }) {
  const real = PORTRAIT_REAL[p.id]?.src ?? null;
  const art = PORTRAIT_ART[p.id]?.src ?? null;
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const src = real && !failed.has(real) ? real : art && !failed.has(art) ? art : null;
  const tier: PortraitTier = src ? (src === real ? "real" : "art") : failed.size >= 2 ? "monogram" : "placeholder";
  if (tier === "monogram") return <span className="dyn-portrait flex h-full w-full items-center justify-center" data-tier="monogram" data-size={size}>{fallback}</span>;
  return (
    <span className="dyn-portrait absolute inset-0 overflow-hidden rounded-[inherit]" data-tier={tier} data-size={size}>
      {src ? <img src={src} alt="" decoding="async" loading="lazy" className={className ?? "h-full w-full object-cover object-top"} onError={() => setFailed((s) => new Set(s).add(src))} />
        : <PlaceholderPortrait p={p} className={className ?? "h-full w-full"} mono={mono} />}
      <span aria-hidden className="dyn-portrait-ring shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
    </span>
  );
}
