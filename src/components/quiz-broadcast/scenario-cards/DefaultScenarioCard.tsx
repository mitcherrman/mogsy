import { useState } from "react";
import { motion } from "framer-motion";
import type { SubjectKind } from "./types";

/**
 * Fallback scenario cards, moved verbatim from BroadcastRenderer:
 * - CollectibleCard: premium framed icon card (item/rune/spell/objective)
 * - SubjectPlaceholderCard: neutral "?" card shown while a spoiler subject is hidden
 * - SubjectPlaceholder: bare "Mogsy" box when there is nothing to show
 * These keep their own float animation (not the Ken Burns frame).
 */

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
      <div className="mt-[8%] text-[0.95vmin] font-bold uppercase tracking-[0.36em] text-[#e8c97a]/90">
        {" "}
        {kindLabel}{" "}
      </div>
      <div className="relative mt-[4%] flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-[#d4b35a]/15 blur-2xl" />
        {!errored ? (
          <img
            src={iconUrl}
            alt={label || kindLabel}
            onError={() => setErrored(true)}
            className="relative h-[11vmin] w-[11vmin] rounded-xl border border-[#d4b35a]/40 object-cover shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <div className="relative flex h-[11vmin] w-[11vmin] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[2vmin] text-white/40">
            ?
          </div>
        )}
      </div>
      {label && (
        <div className="mt-[6%] max-w-[86%] text-center">
          <div className="text-[0.9vmin] font-bold uppercase tracking-[0.32em] text-[#e8c97a]/80">{kindLabel}</div>
          <div className="mt-1 text-[2.05vmin] font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]">
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
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[28vmin] font-black leading-none text-white/[0.04]"
      >
        ?
      </div>
      <div className="relative z-10 flex flex-col items-center gap-[3%] px-[8%] text-center">
        <div className="text-[0.95vmin] font-bold uppercase tracking-[0.36em] text-[#e8c97a]/90">{accent.label}</div>
        <div className="text-[1.4vmin] font-semibold uppercase tracking-[0.32em] text-white/55">
          {category.replace(/_/g, " ")}
        </div>
        <div className="mt-[2%] h-[2px] w-[44%] bg-gradient-to-r from-transparent via-[#d4b35a]/60 to-transparent" />
        <div className="mt-[3%] text-[1.15vmin] uppercase tracking-[0.28em] text-white/40">Reveal incoming…</div>
      </div>
    </motion.div>
  );
}

export function SubjectPlaceholder() {
  return (
    <div className="flex h-[78%] w-[80%] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[1.4vmin] uppercase tracking-[0.3em] text-white/30">
      Mogsy
    </div>
  );
}
