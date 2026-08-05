import { useState } from "react";
import { motion } from "framer-motion";
import type { SubjectKind } from "./types";

/**
 * Fallback scenario cards, moved verbatim from BroadcastRenderer:
 * - CollectibleCard: premium framed icon card (item/rune/spell/objective)
 * - SubjectPlaceholderCard: neutral "?" card shown while a spoiler subject is hidden
 * - SubjectPlaceholder: bare "Mogsy" box when there is nothing to show
 * These keep their own float animation (not the Ken Burns frame).
 *
 * Sizing follows the same rules as ./primitives.tsx — `--sc-fit` floors on type
 * and icons, and vertical rhythm in `cqh` rather than `%` — so these cards are
 * unchanged on the 16:9 broadcast stage and legible in the short Ranked band,
 * where cqmin is ~1.8px and this card rendered as an empty frame around a 19px
 * icon and 2-3px labels. See that file for the derivation.
 */
const TIGHT_LEADING = "leading-[min(1.5rem,1.25em)]";

export function CollectibleCard({ iconUrl, label, kind }: { iconUrl: string; label?: string; kind: SubjectKind }) {
  const kindLabel =
    kind === "champion"
      ? "Champion"
      : kind === "item"
        ? "Item"
        : kind === "rune"
          ? "Rune"
          : kind === "spell"
            ? "Ability"
            : kind === "objective"
              ? "Objective"
              : "Subject";
  const [errored, setErrored] = useState(false);
  return (
    <motion.div
      className="relative flex h-[78%] w-[80%] flex-col items-center justify-center rounded-2xl border border-[#d4b35a]/35 bg-gradient-to-b from-black/55 via-black/40 to-black/60 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* rotating shine */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-y-1/2 -left-1/4 w-1/3 rotate-[20deg] bg-gradient-to-r from-transparent via-[#f3dca0]/15 to-transparent"
        initial={{ x: "-20%", opacity: 0 }}
        animate={{ x: "260%", opacity: [0, 0.5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 3 }}
      />
      {/* gold inner trim */}
      <div className="pointer-events-none absolute inset-[6%] rounded-xl ring-1 ring-inset ring-[#d4b35a]/35" />
      <div
        className={`mt-[14.22cqh] text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] ${TIGHT_LEADING} font-bold uppercase tracking-[0.36em] text-[#e8c97a]/90`}
      >
        {" "}
        {kindLabel}{" "}
      </div>
      <div className="relative mt-[7.11cqh] flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-[#d4b35a]/15 blur-2xl" />
        {!errored ? (
          <img
            src={iconUrl}
            alt={label || kindLabel}
            onError={() => setErrored(true)}
            className="relative h-[max(11cqmin,calc(2.5*var(--sc-fit)))] w-[max(11cqmin,calc(2.5*var(--sc-fit)))] rounded-xl border border-[#d4b35a]/40 object-cover shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <div className="relative flex h-[max(11cqmin,calc(2.5*var(--sc-fit)))] w-[max(11cqmin,calc(2.5*var(--sc-fit)))] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[max(2cqmin,calc(1.125*var(--sc-fit)))] leading-none text-white/40">
            ?
          </div>
        )}
      </div>
      {label && (
        <div className="mt-[10.67cqh] max-w-[86%] text-center">
          <div
            className={`text-[max(0.9cqmin,calc(0.625*var(--sc-fit)))] ${TIGHT_LEADING} font-bold uppercase tracking-[0.32em] text-[#e8c97a]/80`}
          >
            {kindLabel}
          </div>
          <div
            className={`mt-1 text-[max(2.05cqmin,calc(0.9375*var(--sc-fit)))] ${TIGHT_LEADING} font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]`}
          >
            {label}
          </div>
        </div>
      )}
      <div className="mt-3 h-[2px] w-[36%] bg-gradient-to-r from-transparent via-[#d4b35a]/70 to-transparent" />
    </motion.div>
  );
}

/* ── Neutral placeholder card (shown when subject would spoil the answer) ── */

export function SubjectPlaceholderCard({ kind, category }: { kind: SubjectKind; category: string }) {
  const accent =
    kind === "champion"
      ? { ring: "ring-sky-300/30", glow: "bg-sky-400/15", label: "Champion" }
      : kind === "item"
        ? { ring: "ring-[#d4b35a]/35", glow: "bg-[#d4b35a]/15", label: "Item" }
        : kind === "rune"
          ? { ring: "ring-violet-300/30", glow: "bg-violet-400/15", label: "Rune" }
          : kind === "spell"
            ? { ring: "ring-cyan-300/30", glow: "bg-cyan-400/15", label: "Ability" }
            : kind === "objective"
              ? { ring: "ring-rose-300/30", glow: "bg-rose-400/15", label: "Objective" }
              : { ring: "ring-white/15", glow: "bg-white/10", label: "Mystery" };

  return (
    <motion.div
      className={`relative flex h-[78%] w-[80%] flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#d4b35a]/30 bg-gradient-to-b from-black/55 via-black/40 to-black/60 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]`}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className={`pointer-events-none absolute inset-[6%] rounded-xl ring-1 ring-inset ${accent.ring}`} />
      <div className={`pointer-events-none absolute inset-0 rounded-2xl ${accent.glow} blur-3xl opacity-50`} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[28cqmin] font-black leading-none text-white/[0.04]"
      >
        ?
      </div>
      <div className="relative z-10 flex flex-col items-center gap-[5.33cqh] px-[8%] text-center">
        <div
          className={`text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] ${TIGHT_LEADING} font-bold uppercase tracking-[0.36em] text-[#e8c97a]/90`}
        >
          {accent.label}
        </div>
        <div
          className={`text-[max(1.4cqmin,calc(0.8125*var(--sc-fit)))] ${TIGHT_LEADING} font-semibold uppercase tracking-[0.32em] text-white/70`}
        >
          {category.replace(/_/g, " ")}
        </div>
        <div className="mt-[3.56cqh] h-[2px] w-[44%] bg-gradient-to-r from-transparent via-[#d4b35a]/60 to-transparent" />
        <div className={`mt-[5.33cqh] text-[max(1.15cqmin,calc(0.6875*var(--sc-fit)))] ${TIGHT_LEADING} uppercase tracking-[0.28em] text-white/55`}>
          Reveal incoming…
        </div>
      </div>
    </motion.div>
  );
}

export function SubjectPlaceholder() {
  return (
    <div
      className={`flex h-[78%] w-[80%] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[max(1.4cqmin,calc(0.8125*var(--sc-fit)))] ${TIGHT_LEADING} uppercase tracking-[0.3em] text-white/30`}
    >
      Mogsy
    </div>
  );
}
