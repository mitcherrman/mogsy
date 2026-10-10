/**
 * PPQ2-C — the small, shared visual vocabulary of the Pro Play arena pieces.
 *
 * Every ornament here is the Arena's existing language redrawn with
 * component-scoped utility classes (this workstream may not touch
 * `index.css`): the dark board plate with its gold top glow (Journey's board),
 * the four gold corner brackets (`--jp3-corners`), the gold hairline seam, and
 * the academy's chip tones. None of them lays anything out — brackets and
 * glows are absolutely positioned and `aria-hidden`.
 */
import type { ReactNode } from "react";

import ProPlayTooltip from "@/components/pro-play/ProPlayTooltip";
import { cn } from "@/lib/utils";

/** Four gold L-brackets inside the nearest positioned ancestor. Decorative. */
export function GoldCorners({ inset = 6, size = 9, className }: {
  inset?: number;
  size?: number;
  className?: string;
}) {
  const arm = "absolute border-[#e8c97a]/70";
  const s = { width: size, height: size };
  return (
    <span aria-hidden data-pp-corners className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn(arm, "border-l border-t")} style={{ ...s, left: inset, top: inset }} />
      <span className={cn(arm, "border-r border-t")} style={{ ...s, right: inset, top: inset }} />
      <span className={cn(arm, "border-b border-l")} style={{ ...s, left: inset, bottom: inset }} />
      <span className={cn(arm, "border-b border-r")} style={{ ...s, right: inset, bottom: inset }} />
    </span>
  );
}

/**
 * The dark board plate every anchor plate sits on: navy-black with a gold
 * top glow, a gold hairline border and the corner brackets.
 *
 * HEIGHT. Below `lg` the plate is a compact strip with a floor that grows
 * with its copy (the arena stacks there and the media region has no reserve,
 * so the page, never the plate, absorbs it). From `lg` it FILLS the media
 * region and may be given less than it would like: the canonical stage lets
 * the media region yield first, so nothing inside a plate may hold a minimum
 * height — art is absolutely positioned, copy is pinned to the bottom, and a
 * shorter plate simply shows less art.
 */
export function BoardPlate({ kind, children, className, label }: {
  kind: string;
  children: ReactNode;
  className?: string;
  /** Accessible name for the plate region. */
  label: string;
}) {
  return (
    <section
      aria-label={label}
      data-pro-play-plate={kind}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-lg border border-[#c9a84c]/35",
        "bg-[#07111f] text-[#efe8d6]",
        "shadow-[inset_0_1px_0_rgba(240,215,140,0.18),inset_0_0_0_1px_rgba(201,168,76,0.08),0_10px_24px_-16px_rgba(0,0,0,0.9)]",
        // Below lg the stage has no reserve, so the plate is a compact strip
        // that may GROW with its copy (a long league name wraps its chips);
        // from lg it fills the reserved media region and may be given less.
        "min-h-[7.5rem] sm:min-h-[8.5rem] lg:h-full lg:min-h-0",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(212,179,90,0.12), transparent 60%),"
            + " linear-gradient(180deg, #0b1727, #060d18)",
        }}
      />
      {children}
      <GoldCorners />
    </section>
  );
}

/** Small gold uppercase label (the arena eyebrow, tightened for plates). */
export function PlateEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      "block min-w-0 truncate text-[9px] font-bold uppercase leading-none tracking-[0.24em] text-[#e8c97a]/90 sm:text-[10px]",
      className,
    )}>
      {children}
    </span>
  );
}

/** Chip tones on the DARK plate. Competition identity takes the gold. */
const DARK_TONE: Record<string, string> = {
  competition: "border-[#c9a84c]/45 bg-[#c9a84c]/12 text-[#f0dcae]",
  window: "border-white/15 bg-white/[0.06] text-white/75",
  metric: "border-sky-300/35 bg-sky-300/10 text-sky-100",
  recent: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
  relationship: "border-[#c9a84c]/45 bg-[#c9a84c]/15 text-[#f0dcae]",
};

export type ChipTone = keyof typeof DARK_TONE;

/**
 * One compact chip. With a tooltip it is a focusable disclosure (the shared
 * `ProPlayTooltip`), so "LCK" → "LoL Champions Korea" is reachable by keyboard
 * and touch, not only by hover.
 */
export function PlateChip({ label, tooltip, tone, testId, dataType, className }: {
  label: string;
  tooltip?: string | null;
  tone: ChipTone;
  testId?: string;
  dataType?: string;
  className?: string;
}) {
  return (
    <ProPlayTooltip label={label} tooltip={tooltip} testId={testId} className="min-w-0 max-w-full">
      <span
        data-tag-type={dataType}
        className={cn(
          "inline-flex max-w-full items-center rounded border px-1.5 py-[3px]",
          "text-[9px] font-bold uppercase leading-none tracking-[0.12em] sm:text-[10px]",
          "truncate",
          (DARK_TONE[tone] ?? DARK_TONE.window),
          className,
        )}
      >
        {label}
      </span>
    </ProPlayTooltip>
  );
}

/** The thin gold seam between facing tablets and inside panels. */
export function GoldHairline({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none block", vertical ? "w-px" : "h-px", className)}
      style={{
        background: vertical
          ? "linear-gradient(180deg, transparent, rgba(212,179,90,0.6), transparent)"
          : "linear-gradient(90deg, transparent, rgba(212,179,90,0.6), transparent)",
      }}
    />
  );
}
