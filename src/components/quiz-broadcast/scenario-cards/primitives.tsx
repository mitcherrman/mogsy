import { useState } from "react";
import { motion } from "framer-motion";
import type { ScenarioEntryData, ScenarioSectionData } from "./types";

/**
 * Scenario Card primitives — the shared building blocks every scenario type
 * composes. A card answers WHO (ScenarioTitle), WHAT (ScenarioSubject),
 * UNDER WHAT CONDITIONS (ConditionChip), USING WHAT BUILD (ScenarioSection)
 * without the viewer reading a paragraph.
 *
 * Animation budget is deliberately small and lives here so every card
 * inherits it: breathing glow on the subject icon, one shimmer sweep on the
 * divider every ~9s. Background Ken Burns stays in ScenarioCardFrame.
 */

/** Card-type identity chip, pinned top-left over the artwork. */
export function ScenarioBadge({ children }: { children: string }) {
  return (
    <div className="absolute left-[5%] top-[4%] z-10 rounded-md border border-[#d4b35a]/50 bg-black/55 px-[1.6cqmin] py-[0.7cqmin] text-[0.95cqmin] font-bold uppercase tracking-[0.32em] text-[#e8c97a] backdrop-blur-sm">
      {children}
    </div>
  );
}

/** WHO — the large hero title (champion, item, team…). */
export function ScenarioTitle({ children }: { children: string }) {
  return (
    <div className="text-[2.7cqmin] font-black uppercase tracking-[0.05em] text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)]">
      {children}
    </div>
  );
}

/**
 * WHAT — the subject of the scenario: large icon with optional slot badge,
 * name, and micro-label. The icon ring breathes slowly (gold glow pulse).
 */
export function ScenarioSubject({
  iconUrl,
  slotBadge,
  title,
  subtitle,
}: {
  iconUrl?: string | null;
  slotBadge?: string;
  title: string;
  subtitle?: string;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="mt-[2.5%] flex items-center gap-[1.5cqmin]">
      {iconUrl && !errored && (
        <div className="relative shrink-0">
          {/* breathing glow */}
          <motion.div
            aria-hidden
            className="absolute -inset-[0.5cqmin] rounded-xl bg-[#f3dca0]/25 blur-md"
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <img
            src={iconUrl}
            alt={title}
            onError={() => setErrored(true)}
            className="relative h-[5.6cqmin] w-[5.6cqmin] rounded-lg border border-[#f3dca0]/70 object-cover shadow-[0_8px_22px_-6px_rgba(0,0,0,0.85)] ring-1 ring-[#f3dca0]/40"
          />
          {slotBadge && (
            <div className="absolute -bottom-[0.7cqmin] -right-[0.7cqmin] flex h-[2.1cqmin] w-[2.1cqmin] items-center justify-center rounded-md bg-[#d4b35a] text-[1.2cqmin] font-black text-[#2a1f08] shadow-[0_4px_10px_rgba(0,0,0,0.6)]">
              {slotBadge}
            </div>
          )}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-[1.7cqmin] font-bold uppercase tracking-[0.1em] text-[#f3dca0] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          {title}
        </div>
        {subtitle && (
          <div className="mt-[0.3cqmin] text-[0.95cqmin] font-semibold uppercase tracking-[0.24em] text-white/60">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hero artwork for subjects without splash art (items, runes, spells):
 * a large centered icon with a soft gold glow and gentle float, sitting in
 * the card's upper art zone.
 */
export function ScenarioHeroIcon({ iconUrl, alt }: { iconUrl?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!iconUrl || errored) return null;
  return (
    <div className="absolute inset-x-0 top-[10%] flex h-[46%] items-center justify-center">
      <motion.div
        className="relative"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          aria-hidden
          className="absolute -inset-[2cqmin] rounded-3xl bg-[#d4b35a]/20 blur-2xl"
          animate={{ opacity: [0.4, 0.75, 0.4] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <img
          src={iconUrl}
          alt={alt}
          onError={() => setErrored(true)}
          className="relative h-[13cqmin] w-[13cqmin] rounded-2xl border border-[#d4b35a]/50 object-cover shadow-[0_18px_44px_-10px_rgba(0,0,0,0.85)]"
        />
      </motion.div>
    </div>
  );
}

/** UNDER WHAT CONDITIONS — one calculation parameter as a contained chip. */
export function ConditionChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#d4b35a]/30 bg-white/[0.04] px-[1.1cqmin] py-[0.5cqmin] text-[0.95cqmin] font-semibold uppercase tracking-[0.2em] text-white/75">
      {label} <span className="font-black text-white">{value}</span>
    </div>
  );
}

/** Gold hairline separator with a soft shimmer sweep every ~9 seconds. */
export function ScenarioDivider() {
  return (
    <div className="relative mt-[3.5%] h-[2px] w-[62%] overflow-hidden bg-gradient-to-r from-[#d4b35a]/70 to-transparent">
      <motion.div
        aria-hidden
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#f3dca0]/80 to-transparent"
        initial={{ x: "-120%" }}
        animate={{ x: "340%" }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 8.5 }}
      />
    </div>
  );
}

/**
 * USING WHAT BUILD — a labeled group of scenario entries (items, runes,
 * dragons, buffs, patch…). Renders nothing when there are no entries; the
 * renderer never knows what the entries represent.
 */
export function ScenarioSection({ section }: { section: ScenarioSectionData }) {
  if (!section.entries.length) return null;
  return (
    <div className="mt-[3%]">
      <div className="text-[0.9cqmin] font-bold uppercase tracking-[0.3em] text-[#e8c97a]/75">{section.title}</div>
      <div className="mt-[1.5%] flex flex-wrap gap-[0.9cqmin]">
        {section.entries.map((entry) => (
          <ScenarioEntry key={`${section.title}-${entry.title}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

/** One equipped component: icon + title + effect subtitle + optional badge. */
export function ScenarioEntry({ entry }: { entry: ScenarioEntryData }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      className={`flex items-center gap-[0.9cqmin] rounded-lg border py-[0.5cqmin] pl-[0.5cqmin] pr-[1.2cqmin] ${
        entry.highlight
          ? "border-[#f3dca0]/70 bg-[#f3dca0]/10 ring-1 ring-[#f3dca0]/30"
          : "border-[#d4b35a]/40 bg-[#d4b35a]/[0.08]"
      }`}
    >
      {entry.icon && !errored && (
        <img
          src={entry.icon}
          alt={entry.title}
          onError={() => setErrored(true)}
          className="h-[3.2cqmin] w-[3.2cqmin] rounded-md border border-[#d4b35a]/35 object-cover"
        />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-[0.7cqmin]">
          <span className="truncate text-[1.15cqmin] font-bold uppercase tracking-[0.06em] text-white">
            {entry.title}
          </span>
          {entry.badge && (
            <span className="rounded bg-[#d4b35a]/90 px-[0.6cqmin] py-[0.1cqmin] text-[0.8cqmin] font-black uppercase text-[#2a1f08]">
              {entry.badge}
            </span>
          )}
        </div>
        {entry.subtitle && (
          <div className="mt-[0.2cqmin] truncate text-[0.85cqmin] font-semibold uppercase tracking-[0.14em] text-[#e8c97a]/85">
            {entry.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
