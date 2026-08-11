import { useState } from "react";
import { motion } from "framer-motion";
import type { ScenarioEntryData, ScenarioSectionData } from "./types";
import {
  flattenMediaEntityIcons,
  type MediaEntityRole,
  type MediaEntityStatus,
  type QuestionMediaEntities,
} from "./questionMediaEntities";

/**
 * Scenario Card primitives — the shared building blocks every scenario type
 * composes. A card answers WHO (ScenarioTitle), WHAT (ScenarioSubject),
 * UNDER WHAT CONDITIONS (ConditionChip), USING WHAT BUILD (ScenarioSection)
 * without the viewer reading a paragraph.
 *
 * Animation budget is deliberately small and lives here so every card
 * inherits it: breathing glow on the subject icon, one shimmer sweep on the
 * divider every ~9s. Background Ken Burns stays in ScenarioCardFrame.
 *
 * ── SIZING, AND WHY IT LOOKS LIKE THIS ───────────────────────────────────────
 * Every size here was authored in `cqmin` for the 16:9 broadcast stage, where
 * cqmin is ~10px and the scale reads beautifully. Reused inline in the Ranked
 * band the container is ~730×176 — cqmin is 1.76px — and the whole information
 * stack collapsed to 1.5–5px type: a champion name rendered at 4.8px. Two rules
 * fix that WITHOUT changing the broadcast card by a pixel:
 *
 *  1. TYPE AND ICONS get a floor: `max(N cqmin, calc(M * var(--sc-fit)))`. On
 *     the stage the cqmin term always wins, so nothing moves; in the band the
 *     floor wins and the element is legible. Read M like a rem multiple — 1 is
 *     16px on a band with room — and see --sc-fit in index.css for why it is a
 *     `min()` rather than a constant: on a SHORT band every floored element
 *     scales down together, so the stack that fits at 176px also fits at 130px.
 *     The floors deliberately COMPRESS the type scale (the design's 0.85→5.6
 *     cqmin range is 6.6:1; the floors are ~2.5:1) because at 176px tall there
 *     is no room for six distinct type sizes — the hierarchy survives as
 *     weight, colour and tracking instead.
 *
 *  2. VERTICAL RHYTHM is expressed in `cqh` instead of `%`. A percentage margin
 *     or padding resolves against the container's WIDTH, so in a 4:1 band the
 *     gaps between those 2px labels were 15–33px — the stack was almost entirely
 *     whitespace. `cqh` is 1% of the container's HEIGHT, and 16/9 cqh ≡ 1% of
 *     width on a 16:9 card, so each `P%` becomes `P × 1.778 cqh`: IDENTICAL on
 *     the stage, and proportional to the space that actually exists in the band.
 *     That alone returns ~40px of the band's 165px frame to the content.
 *
 *  3. LINE HEIGHT gets the same treatment from the other side. The app's body
 *     line-height is an ABSOLUTE 1.5rem, inherited unchanged by every label
 *     here — which on the stage is tighter than the type (a 29px title in a
 *     24px box, as designed) but in the band gave a 24px line box to 2px text.
 *     `min(1.5rem, 1.25em)` keeps the inherited box on the stage (every size
 *     there is ≥19.2px, so 1.25em ≥ 1.5rem and the min picks 1.5rem) and lets
 *     the band's floored type sit in a box proportional to itself.
 */

/**
 * Shared sizing tokens. Read them as "what the stage already does, with a floor
 * (type) or a ceiling (leading) that only engages in the short Ranked band".
 */
const TIGHT_LEADING = "leading-[min(1.5rem,1.25em)]";
/** Micro-label: section headings, subtitles, the badge, condition chips. */
const MICRO_TEXT = `text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] ${TIGHT_LEADING}`;

/** Card-type identity chip, pinned top-left over the artwork. */
export function ScenarioBadge({ children }: { children: string }) {
  return (
    <div
      className={`absolute left-[5%] top-[4%] z-10 rounded-md border border-[#d4b35a]/50 bg-black/70 px-[max(1.6cqmin,calc(0.5*var(--sc-fit)))] py-[max(0.7cqmin,calc(0.1875*var(--sc-fit)))] ${MICRO_TEXT} font-bold uppercase tracking-[0.32em] text-[#e8c97a] backdrop-blur-sm`}
    >
      {children}
    </div>
  );
}

/** WHO — the large hero title (champion, item, team…). */
export function ScenarioTitle({ children }: { children: string }) {
  return (
    <div
      className={`text-[max(2.7cqmin,calc(1.0625*var(--sc-fit)))] ${TIGHT_LEADING} font-black uppercase tracking-[0.05em] text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)]`}
    >
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
    <div className="mt-[4.44cqh] flex items-center gap-[max(1.5cqmin,calc(0.5*var(--sc-fit)))]">
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
            className="relative h-[max(5.6cqmin,calc(1.75*var(--sc-fit)))] w-[max(5.6cqmin,calc(1.75*var(--sc-fit)))] rounded-lg border border-[#f3dca0]/70 object-cover shadow-[0_8px_22px_-6px_rgba(0,0,0,0.85)] ring-1 ring-[#f3dca0]/40"
          />
          {slotBadge && (
            <div className="absolute -bottom-[max(0.7cqmin,calc(0.1875*var(--sc-fit)))] -right-[max(0.7cqmin,calc(0.1875*var(--sc-fit)))] flex h-[max(2.1cqmin,calc(0.875*var(--sc-fit)))] w-[max(2.1cqmin,calc(0.875*var(--sc-fit)))] items-center justify-center rounded-md bg-[#d4b35a] text-[max(1.2cqmin,calc(0.5*var(--sc-fit)))] font-black leading-none text-[#2a1f08] shadow-[0_4px_10px_rgba(0,0,0,0.6)]">
              {slotBadge}
            </div>
          )}
        </div>
      )}
      <div className="min-w-0">
        <div
          className={`truncate text-[max(1.7cqmin,calc(0.8125*var(--sc-fit)))] ${TIGHT_LEADING} font-bold uppercase tracking-[0.1em] text-[#f3dca0] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]`}
        >
          {title}
        </div>
        {subtitle && (
          <div className={`mt-[0.3cqmin] ${MICRO_TEXT} font-semibold uppercase tracking-[0.24em] text-white/70`}>
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

/**
 * One entity icon slot, sized in ABSOLUTE units rather than the cqmin the rest
 * of the card uses. That is deliberate. Everything inside a Scenario Card
 * scales with `cqmin` — 1% of the container's SMALLER dimension — which is the
 * band's height. Ranked's compact density caps that height at 11rem, so on a
 * wide desktop column the whole card foreground collapses (the champion title
 * renders at ~4.8px, an item row icon at ~6px). A strip whose only job is to
 * prove which entities the payload carries cannot be legible-by-luck, so it
 * opts out of that scaling.
 *
 * The slot NEVER collapses: a missing or broken image falls back to a monogram
 * tile of the same size, so a failed request cannot reflow the strip.
 */
/**
 * TEMPORARY status treatment (RA5). The backend now states what happened to
 * each premise entity; this makes the four distinctions VISIBLE so the real
 * per-family treatment can be chosen from something concrete — faded, struck
 * through, grouped, a timeline, a current-loadout strip. It is not that
 * treatment, and deliberately does not look like a finished one.
 *
 * Every rule is inside the fixed 24px slot — a tint, a border, an overlay — so
 * no status can change the strip's geometry. The word itself always reaches the
 * user through the accessible label, never as drawn text, because a legible
 * caption at this size would be a redesign.
 */
const STATUS_TREATMENT: Record<MediaEntityStatus, string> = {
  // Gone: dimmed and struck through (the strike is drawn below).
  sold: "opacity-40 grayscale",
  // Acquired: a brighter rim, the only additive-feeling state.
  purchased: "ring-1 ring-[#8fd0a0]/70",
  // Survived a stated transaction — present, but not the new thing.
  retained: "",
  // Held with no transaction stated.
  current: "",
  // Held from the start.
  starting: "opacity-80",
};

/** Human-readable tail for the accessible label, e.g. "…, sold". */
function entityLabel(name: string, kind: string, role: MediaEntityRole, status?: MediaEntityStatus) {
  const parts = [kind.replace("_", " ")];
  // Role is only informative when the premise has sides to tell apart.
  if (role === "attacker" || role === "target") parts.push(role);
  if (status) parts.push(status);
  return `${name} (${parts.join(", ")})`;
}

function EntityIconSlot({
  icon,
  name,
  kind,
  role,
  status,
}: {
  icon: string;
  name: string;
  kind: string;
  role: MediaEntityRole;
  status?: MediaEntityStatus;
}) {
  const [errored, setErrored] = useState(false);
  // Champion portraits read as people, equipment reads as objects — the only
  // visual distinction in the strip, and it carries no extra label.
  const shape = kind === "champion" ? "rounded-full" : "rounded-md";
  const treatment = status ? STATUS_TREATMENT[status] : "";
  // The other champion's entities get a cooler rim so a two-sided premise is
  // readable without a second row.
  const rim = role === "target" ? "border-[#7fb2d4]/70" : "border-[#d4b35a]/50";
  return (
    <div
      role="listitem"
      title={entityLabel(name, kind, role, status)}
      aria-label={entityLabel(name, kind, role, status)}
      data-entity-kind={kind}
      data-entity-role={role}
      {...(status ? { "data-entity-status": status } : {})}
      // The dark separation edge is an INSET SHADOW, not a `ring-*` utility:
      // `purchased` marks acquisition with `ring-1 ring-[#8fd0a0]/70`, and a
      // base ring would collide with it (same property, source order decides
      // the winner) and silently drop the RA5 status distinction.
      className={`relative flex h-[calc(2.25*var(--sc-fit))] w-[calc(2.25*var(--sc-fit))] shrink-0 items-center justify-center overflow-hidden border ${rim} bg-black/70 shadow-[0_2px_10px_rgba(0,0,0,0.85),inset_0_0_0_1px_rgba(0,0,0,0.55)] ${shape} ${treatment}`}
    >
      {errored ? (
        <span aria-hidden className="text-[calc(0.9375*var(--sc-fit))] font-black uppercase leading-none text-[#e8c97a]/80">
          {name.slice(0, 1)}
        </span>
      ) : (
        <img src={icon} alt="" onError={() => setErrored(true)} className="h-full w-full object-cover" />
      )}
      {status === "sold" && (
        // Absolutely positioned inside the slot, so the strike cannot add a
        // pixel of height or width whatever the icon does.
        <span
          aria-hidden
          data-testid="entity-sold-strike"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="h-px w-[140%] rotate-45 bg-[#ff9b9b]/90" />
        </span>
      )}
    </div>
  );
}

/**
 * Compact premise-entity strip — every entity the question STATES, as icons.
 *
 * Pinned to the card's top-right, opposite the ScenarioBadge and outside the
 * bottom information stack, so adding it cannot move the title, subject, chips,
 * divider or sections by a pixel. It exists to make the payload's completeness
 * visible (two champions, an ability, both sides' items, and since RA5 what the
 * premise says HAPPENED to each) ahead of the theme redesign that will decide
 * the real treatment — it is not that treatment.
 *
 * No labels are drawn over the artwork; every icon carries an aria-label and a
 * title tooltip instead, and its role/status are also on the element as
 * `data-entity-*` so a payload can be inspected without reading pixels.
 *
 * The strip wraps (`flex-wrap`, capped at 52% of the card width) and every slot
 * is a fixed box that never collapses, so an eight-entity premise reflows
 * inside the strip's own box and cannot move the title, subject, chips or
 * sections below it.
 *
 * That box is now 36px, not the 24px it shipped at: at the Ranked band's
 * density this strip is the only place a player can see WHICH champions and
 * items the premise names, and a 24px portrait behind a live timer is a smudge.
 * It is sized off `--sc-fit` rather than a constant, so it is still FIXED for a
 * given band (nothing here is content-sized, and no status can resize a slot)
 * while shrinking with a short band exactly as the information stack does —
 * otherwise a phone-width card would hand half its height to this strip. The
 * broadcast stage reads it at the full 36px.
 *
 * The 52% cap is deliberately NOT widened to compensate. It is what keeps a
 * wrapped row inside the card's right half, clear of the title and subject on
 * the left; widening it to preserve the old ~12-per-row would trade a guarantee
 * for a count. At 36px the strip wraps after 8 icons instead of 12 — and the
 * premise families that carry more than a handful of entities (a combat
 * relation, an item transaction) are exactly the ones RA7 now routes to a
 * family band, which never renders this strip at all.
 */
export function ScenarioEntityStrip({ entities }: { entities?: QuestionMediaEntities | null }) {
  const icons = flattenMediaEntityIcons(entities);
  if (!icons.length) return null;
  return (
    <div
      role="list"
      aria-label="Scenario entities"
      data-testid="scenario-entity-strip"
      className="absolute right-[5%] top-[4%] z-10 flex max-w-[52%] flex-wrap justify-end gap-[calc(0.375*var(--sc-fit))]"
    >
      {icons.map((entity) => (
        <EntityIconSlot
          key={entity.key}
          icon={entity.icon}
          name={entity.name}
          kind={entity.kind}
          role={entity.role}
          status={entity.status}
        />
      ))}
    </div>
  );
}

/** UNDER WHAT CONDITIONS — one calculation parameter as a contained chip. */
export function ConditionChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className={`rounded-md border border-[#d4b35a]/30 bg-black/45 px-[max(1.1cqmin,calc(0.375*var(--sc-fit)))] py-[max(0.5cqmin,calc(0.125*var(--sc-fit)))] ${MICRO_TEXT} font-semibold uppercase tracking-[0.2em] text-white/85`}
    >
      {label} <span className="font-black text-white">{value}</span>
    </div>
  );
}

/** Gold hairline separator with a soft shimmer sweep every ~9 seconds. */
export function ScenarioDivider() {
  return (
    <div className="relative mt-[6.22cqh] h-[2px] w-[62%] overflow-hidden bg-gradient-to-r from-[#d4b35a]/70 to-transparent">
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
    <div className="mt-[5.33cqh]">
      <div className={`${MICRO_TEXT} font-bold uppercase tracking-[0.3em] text-[#e8c97a]/90`}>{section.title}</div>
      <div className="mt-[2.67cqh] flex flex-wrap gap-[max(0.9cqmin,calc(0.3125*var(--sc-fit)))]">
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
      className={`flex items-center gap-[max(0.9cqmin,calc(0.3125*var(--sc-fit)))] rounded-lg border py-[max(0.5cqmin,calc(0.125*var(--sc-fit)))] pl-[max(0.5cqmin,calc(0.125*var(--sc-fit)))] pr-[max(1.2cqmin,calc(0.375*var(--sc-fit)))] ${
        entry.highlight
          ? "border-[#f3dca0]/70 bg-[#f3dca0]/10 ring-1 ring-[#f3dca0]/30"
          : "border-[#d4b35a]/40 bg-black/40"
      }`}
    >
      {entry.icon && !errored && (
        <img
          src={entry.icon}
          alt={entry.title}
          onError={() => setErrored(true)}
          className="h-[max(3.2cqmin,calc(1.125*var(--sc-fit)))] w-[max(3.2cqmin,calc(1.125*var(--sc-fit)))] rounded-md border border-[#d4b35a]/35 object-cover"
        />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-[max(0.7cqmin,calc(0.25*var(--sc-fit)))]">
          <span
            className={`truncate text-[max(1.15cqmin,calc(0.75*var(--sc-fit)))] ${TIGHT_LEADING} font-bold uppercase tracking-[0.06em] text-white`}
          >
            {entry.title}
          </span>
          {entry.badge && (
            <span
              className={`rounded bg-[#d4b35a]/90 px-[max(0.6cqmin,calc(0.1875*var(--sc-fit)))] py-[max(0.1cqmin,calc(0.0625*var(--sc-fit)))] text-[max(0.8cqmin,calc(0.5625*var(--sc-fit)))] ${TIGHT_LEADING} font-black uppercase text-[#2a1f08]`}
            >
              {entry.badge}
            </span>
          )}
        </div>
        {entry.subtitle && (
          <div
            className={`mt-[0.2cqmin] truncate ${MICRO_TEXT} font-semibold uppercase tracking-[0.14em] text-[#e8c97a]/90`}
          >
            {entry.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
