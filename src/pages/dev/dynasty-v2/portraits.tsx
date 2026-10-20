/**
 * VIS-F3 — esports player identity: the four-tier portrait chain
 * (vis_f2_support/02 `player.portrait`, owner decision 2026-10-19).
 *
 *   1. approved real-player portrait   — `PORTRAIT_REAL[player.id]`, needs its own rights row (05 §3)
 *   2. original fictional-player art   — `PORTRAIT_ART[player.id]`, commissioned / drawn for Dynasty
 *   3. premium placeholder             — code-drawn silhouette in the org accent (this file)
 *   4. monogram ring                   — `Monogram` from parts.tsx (passed in as `fallback`)
 *
 * Both image tiers are EMPTY in this prototype: Mogzy holds no licence to
 * real-player imagery for Dynasty, and no original art has been commissioned.
 * The chain still runs: an image that fails to load drops to the next tier,
 * and `data-tier` reports which one is showing. The same frame geometry is
 * used for all four, and the ring colour (star / academy / signed) is drawn by
 * the card, outside the portrait, in every tier. Simulated traits never
 * appear inside this frame (02: never a caption on a real person's photo).
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

const HAIR = ["crop", "swept", "long", "cap"] as const;
const SKIN = ["#f1c9a5", "#d9a57c", "#b67c56", "#8d5a3b", "#5c3a26"] as const;

/** Tier 3: the premium placeholder. A styled silhouette, seeded by the player id, lit from the top left in the org accent. */
export function PlaceholderPortrait({ p, className }: { p: Player; className?: string }) {
  const hair = pick(HAIR, `hair|${p.id}`);
  const skin = pick(SKIN, `skin|${p.id}`);
  const stripe = pick([0, 1, 2], `stripe|${p.id}`);
  const A = "var(--dyn-accent, #e3c66f)";
  const gid = `pp-${p.id.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox="0 0 64 76" aria-hidden className={className} data-slot="player.portrait">
      <defs>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A} stopOpacity="0.35" /><stop offset="1" stopColor="#07111f" stopOpacity="0.9" /></linearGradient>
        <linearGradient id={`${gid}-rim`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${gid}-jersey`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a2a44" /><stop offset="1" stopColor="#0b1727" /></linearGradient>
      </defs>
      <rect width="64" height="76" fill={`url(#${gid}-bg)`} />
      {/* spotlight */}
      <ellipse cx="32" cy="20" rx="26" ry="22" fill="#fff" opacity="0.06" />
      {/* shoulders + jersey */}
      <path d="M6 76 C6 56 16 50 26 48 L38 48 C48 50 58 56 58 76 Z" fill={`url(#${gid}-jersey)`} />
      <path d="M6 76 C6 56 16 50 26 48 L38 48 C48 50 58 56 58 76 Z" fill={`url(#${gid}-rim)`} />
      {stripe === 0 ? <path d="M26 48 L22 76 L30 76 L32 50 Z" fill={A} fillOpacity="0.75" /> : stripe === 1 ? <path d="M6 66 C14 62 50 62 58 66 L58 70 C50 66 14 66 6 70 Z" fill={A} fillOpacity="0.7" /> : <path d="M38 48 L42 76 L34 76 L32 50 Z" fill={A} fillOpacity="0.75" />}
      {/* neck + head */}
      <rect x="27" y="38" width="10" height="12" rx="3" fill={skin} />
      <ellipse cx="32" cy="28" rx="11" ry="13" fill={skin} />
      {/* hair */}
      {hair === "crop" ? <path d="M21 26 C21 14 43 14 43 26 L43 24 C40 18 24 18 21 24 Z" fill="#141a26" /> : null}
      {hair === "swept" ? <path d="M20 28 C19 14 42 10 45 24 C40 20 30 22 26 30 C24 26 22 26 20 28 Z" fill="#1d1a24" /> : null}
      {hair === "long" ? <path d="M20 28 C20 14 44 14 44 28 L46 46 L40 42 L40 30 C36 24 28 24 24 30 L24 42 L18 46 Z" fill="#241a1a" /> : null}
      {hair === "cap" ? <><path d="M19 26 C19 14 45 14 45 26 Z" fill="#0b1727" /><path d="M17 26 L47 26 L52 30 L17 30 Z" fill="#0b1727" /><rect x="26" y="19" width="12" height="4" rx="1" fill={A} fillOpacity="0.7" /></> : null}
      {/* headset */}
      <path d="M19 30 C19 16 45 16 45 30" fill="none" stroke="#2c3a52" strokeWidth="2.5" />
      <rect x="17" y="27" width="5" height="9" rx="2" fill="#2c3a52" /><rect x="42" y="27" width="5" height="9" rx="2" fill="#2c3a52" />
      <circle cx="44.5" cy="31.5" r="1.2" fill={A} />
      {/* face shadow, no features: a silhouette, never a likeness */}
      <ellipse cx="32" cy="31" rx="9" ry="8" fill="#000" opacity="0.12" />
    </svg>
  );
}

/**
 * Runs the chain and reports the tier through `data-tier`. The parent frame
 * provides the geometry; this fills it.
 */
export function PortraitSlot({ p, size, fallback, className }: { p: Player; size?: PlayerSize; fallback: ReactNode; className?: string }) {
  const real = PORTRAIT_REAL[p.id]?.src ?? null;
  const art = PORTRAIT_ART[p.id]?.src ?? null;
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const src = real && !failed.has(real) ? real : art && !failed.has(art) ? art : null;
  const tier: PortraitTier = src ? (src === real ? "real" : "art") : failed.size >= 2 ? "monogram" : "placeholder";
  if (tier === "monogram") return <span className="dyn-portrait flex h-full w-full items-center justify-center" data-tier="monogram" data-size={size}>{fallback}</span>;
  return (
    <span className="dyn-portrait absolute inset-0 overflow-hidden rounded-[inherit]" data-tier={tier} data-size={size}>
      {src ? <img src={src} alt="" decoding="async" loading="lazy" className={className ?? "h-full w-full object-cover object-top"} onError={() => setFailed((s) => new Set(s).add(src))} />
        : <PlaceholderPortrait p={p} className={className ?? "h-full w-full"} />}
      <span aria-hidden className="dyn-portrait-ring shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
    </span>
  );
}
