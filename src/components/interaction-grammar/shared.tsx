/**
 * MIG — the few pieces the interaction primitives draw. Presentation only.
 */
import { useState } from "react";
import type { SubjectMedia } from "@/lib/interaction-grammar/types";

/**
 * Subject art that falls back to a monogram IN THE SAME BOX when it is absent
 * or fails, so a missing image never changes the layout (the Journey board's
 * `Art` rule).
 */
export function SubjectArt({ media, monogram, className = "" }: {
  media?: SubjectMedia | null;
  monogram: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : media?.src ?? null;
  return (
    <span className={`relative flex items-center justify-center overflow-hidden bg-[#0b1727] ${className}`}>
      {src ? (
        <img src={src} alt={media?.alt ?? ""} draggable={false} loading="lazy"
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover object-[center_22%]" />
      ) : (
        <span aria-hidden className="font-serif text-2xl font-black uppercase tracking-wider text-[#e8c97a]/85 sm:text-3xl">
          {monogram.slice(0, 3)}
        </span>
      )}
      {/* A floor shade so a label laid over bright art stays legible. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
    </span>
  );
}

/** The small uppercase metric chip above a prompt. */
export function MetricChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-[#7a6236]/45 bg-[#2c2417]/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ranked-ink-muted,#5a4a2e)]">
      {children}
    </span>
  );
}

/**
 * The evidence plate under a reveal: the authority's own sentence and where it
 * came from. Rendered only once a reveal exists, so it can never pre-empt one.
 */
export function EvidencePlate({ evidence, source, animate }: {
  evidence?: string | null;
  source?: string | null;
  animate: boolean;
}) {
  if (!evidence && !source) return null;
  return (
    <div data-testid="mig-evidence"
      className={`rounded-md border border-[#7a6236]/40 bg-[#2c2417]/[0.07] px-3 py-2 text-left ${
        animate ? "animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-both [animation-delay:350ms]" : ""}`}>
      {evidence && <p className="text-[13px] leading-snug text-[var(--ranked-ink,#2c2417)]">{evidence}</p>}
      {source && (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ranked-ink-muted,#5a4a2e)]">
          {source}
        </p>
      )}
    </div>
  );
}

/** Three dots that breathe during the suspense beat; still under reduced motion. */
export function SuspenseDots({ animate }: { animate: boolean }) {
  return (
    <span aria-hidden className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} style={animate ? { animationDelay: `${i * 160}ms` } : undefined}
          className={`h-1.5 w-1.5 rounded-full bg-current ${animate ? "animate-pulse" : "opacity-70"}`} />
      ))}
    </span>
  );
}
