/**
 * LC1 — the Ranked role carousel on the Leaguecraft hub.
 *
 * An RPG character-select stage for the five canonical League roles: the
 * selected role stands large and centred, its two neighbours sit smaller and
 * dimmer to either side, and moving left/right slides the ring around. The
 * roles, their order, their labels and their blurbs all come from the ONE
 * frontend definition in `@/lib/ranked-public/roles` — this file never lists
 * them itself.
 *
 * ART HONESTY
 * ───────────
 * There is no per-role character art in the Mogzy registry, and roles.ts
 * forbids deriving one from the legacy Tank/Mage/Marksman class art (a role
 * is not a class in either direction). So every slide renders the canonical
 * base Mogzy portrait and is distinguished by its NAME, its blurb and a
 * restrained per-role accent — never by a borrowed or invented character.
 * When per-role art lands, only `ROLE_ACCENTS` and the portrait source below
 * need to change.
 *
 * DATA HONESTY
 * ────────────
 * The record strip under the stage is optional and is only ever rendered
 * from a real per-role tally handed in by the host. There is no per-role
 * stats contract on the backend, so the host derives the tally from the
 * account's real Ranked match history and states that scope in
 * `recordScopeLabel`. A role with no matches on record says so; it never
 * shows a zeroed or invented win rate.
 *
 * ACCESSIBILITY (mirrors the R1 RankedRolePicker contract)
 * ───────────────────────────────────────────────────────
 *  - a real `radiogroup` with roving tabindex: one tab stop, Arrow/Home/End
 *    move and select, native activation selects;
 *  - the role NAME is rendered as text on every slide, so identity never
 *    depends on colour, portrait or position;
 *  - selection is exposed as `aria-checked`, not by styling alone;
 *  - off-stage slides are `aria-hidden` and inert, so the reading order is
 *    exactly the three visible options;
 *  - every transition is reduced-motion safe.
 *
 * Presentation only: selecting a role calls the host's `onSelect`, which owns
 * the existing R1 write. Nothing here persists, caches or validates a role.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import {
  RANKED_ROLES,
  RANKED_ROLE_BLURBS,
  RANKED_ROLE_LABELS,
  type RankedRole,
} from "@/lib/ranked-public/roles";
import { MOGZY_MASCOT_ASSETS } from "@/components/mascot/mascot-assets";

/** A real, already-tallied record for one role. Never defaulted to zeros —
 *  a role the host has no rows for is simply absent from the map. */
export interface RankedRoleRecord {
  wins: number;
  losses: number;
  draws: number;
}

/** Restrained per-role accents from the existing academy palette. Identity is
 *  carried by the NAME; this only tints the plinth and ring. */
const ROLE_ACCENTS: Record<RankedRole, string> = {
  top: "#d5b66f",
  jungle: "#8fd0a0",
  mid: "#7fd6ef",
  adc: "#e2a17a",
  support: "#c2a4e0",
};

/** The one portrait the registry actually has for a player-in-a-role. Shared
 *  by all five slides on purpose — see ART HONESTY above. */
const ROLE_PORTRAIT = MOGZY_MASCOT_ASSETS.base;

/** Signed ring distance from the selected slide, in -2..2. */
function ringOffset(index: number, selected: number, length: number): number {
  const half = Math.floor(length / 2);
  return ((index - selected + length + half) % length) - half;
}

export default function RankedClassCarousel({
  value,
  onSelect,
  disabled = false,
  busyRole = null,
  records = null,
  recordScopeLabel,
  className = "",
}: {
  /** The account's role, or null when it has never chosen / is unavailable. */
  value: RankedRole | null;
  onSelect: (role: RankedRole) => void;
  /** A write is in flight, or this deployment/account has no role identity.
   *  The stage still BROWSES — a player can always look at the five roles —
   *  but nothing is selected and no write is attempted. */
  disabled?: boolean;
  busyRole?: RankedRole | null;
  /** Real per-role tallies. Absent role = no rows on record, said as much. */
  records?: Partial<Record<RankedRole, RankedRoleRecord>> | null;
  /** Truthful scope for `records`, e.g. "last 20 ranked matches". Required
   *  whenever records are supplied so the tally is never read as all-time. */
  recordScopeLabel?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion() === true;
  const length = RANKED_ROLES.length;
  // Two different things, deliberately not conflated: whether the stage can
  // MOVE (always) and whether a move SELECTS (only when the host can persist
  // one). A carousel that cannot even be looked through is worse than one
  // that is honest about being read-only.
  const selectable = !disabled;

  // The stage always shows SOMETHING; `value` drives it once there is one.
  const [viewIndex, setViewIndex] = useState(() => {
    const i = value ? RANKED_ROLES.indexOf(value) : -1;
    return i >= 0 ? i : 0;
  });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shouldFocus = useRef(false);

  useEffect(() => {
    if (!value) return;
    const i = RANKED_ROLES.indexOf(value);
    if (i >= 0) setViewIndex(i);
  }, [value]);

  // Focus moves only in response to a KEY press — never on mount, and never
  // when the host re-renders for an unrelated reason.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    refs.current[viewIndex]?.focus();
  }, [viewIndex]);

  function moveTo(index: number, viaKeyboard: boolean) {
    const next = (index + length) % length;
    if (viaKeyboard) shouldFocus.current = true;
    setViewIndex(next);
    if (selectable) onSelect(RANKED_ROLES[next]);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1, true);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1, true);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0, true);
        break;
      case "End":
        event.preventDefault();
        moveTo(length - 1, true);
        break;
      default:
        break;
    }
  }

  const activeRole = RANKED_ROLES[viewIndex];
  const activeAccent = ROLE_ACCENTS[activeRole];
  const activeRecord = records?.[activeRole] ?? null;

  return (
    <div className={`flex flex-col items-center ${className}`} data-testid="ranked-class-carousel">
      {/* ── Stage ─────────────────────────────────────────────────────────
          A fixed-height ring. Slides are absolutely positioned so the stage
          never reflows as the selection moves, and the neighbours can sit
          partly outside the column without pushing the centre off-axis. */}
      {/* A `radiogroup` only while a choice can actually be made; otherwise a
          plain group, so assistive tech is never offered a selection that
          cannot be committed. */}
      <div
        role={selectable ? "radiogroup" : "group"}
        aria-label="Ranked role"
        className="relative h-[244px] w-full overflow-hidden select-none sm:h-[288px] lg:h-[324px]"
      >
        {RANKED_ROLES.map((roleId, index) => {
          const offset = ringOffset(index, viewIndex, length);
          const onStage = Math.abs(offset) <= 1;
          const isCentre = offset === 0;
          const accent = ROLE_ACCENTS[roleId];
          const checked = value === roleId;

          return (
            <button
              key={roleId}
              type="button"
              role={selectable ? "radio" : undefined}
              ref={(el) => {
                refs.current[index] = el;
              }}
              data-testid={`ranked-class-slide-${roleId}`}
              data-stage={isCentre ? "centre" : onStage ? "flank" : "off"}
              aria-checked={selectable ? checked : undefined}
              aria-busy={busyRole === roleId}
              aria-hidden={onStage ? undefined : true}
              tabIndex={index === viewIndex ? 0 : -1}
              disabled={!onStage}
              onKeyDown={(e) => onKeyDown(e, index)}
              onClick={() => moveTo(index, false)}
              style={{
                transform: `translate(-50%, 0) translateX(${offset * 62}%) scale(${
                  isCentre ? 1 : 0.56
                })`,
                opacity: onStage ? (isCentre ? 1 : 0.42) : 0,
                zIndex: isCentre ? 2 : 1,
                transitionProperty: reducedMotion ? "opacity" : "transform, opacity",
              }}
              className="absolute left-1/2 top-0 flex h-full w-[58%] flex-col items-center justify-end rounded-2xl px-1 pb-1 duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] disabled:cursor-default motion-reduce:!transition-none"
            >
              {/* Plinth glow — decorative, tinted by the role accent. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-2 bottom-6 top-2 rounded-[999px] blur-xl"
                style={{
                  background: `radial-gradient(60% 50% at 50% 78%, ${accent}38 0%, transparent 72%)`,
                }}
              />
              <img
                src={ROLE_PORTRAIT}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="relative h-[80%] w-auto max-w-full object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.6)]"
              />
              {/* Ground ring under the portrait — reads as a character plinth. */}
              <span
                aria-hidden="true"
                className="pointer-events-none relative -mt-2 h-2 w-[64%] rounded-[999px]"
                style={{
                  background: `radial-gradient(50% 100% at 50% 50%, ${accent}66 0%, transparent 70%)`,
                }}
              />
              {/* The NAME is the identity. Nothing above it may replace it. */}
              <span
                className="relative mt-1 text-[13px] font-bold uppercase tracking-[0.26em]"
                style={{ color: isCentre ? accent : "rgba(233,220,190,0.7)" }}
              >
                {RANKED_ROLE_LABELS[roleId]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Stage controls ────────────────────────────────────────────────
          Redundant with the arrow keys on purpose: pointer users get the
          same ring movement without needing focus in the group. */}
      <div className="mt-1 flex w-full items-center justify-center gap-3">
        <StageArrow direction="previous" onClick={() => moveTo(viewIndex - 1, false)} />
        <p className="min-w-0 flex-1 text-center text-[11px] leading-snug text-muted-foreground">
          {busyRole === activeRole ? "Saving…" : RANKED_ROLE_BLURBS[activeRole]}
        </p>
        <StageArrow direction="next" onClick={() => moveTo(viewIndex + 1, false)} />
      </div>

      {/* ── Position indicators ───────────────────────────────────────────
          Decorative only — the radiogroup above already carries the real
          selection semantics, so these are hidden from assistive tech
          rather than duplicated as a second control. */}
      <div aria-hidden="true" className="mt-2 flex items-center gap-1.5">
        {RANKED_ROLES.map((roleId, index) => (
          <span
            key={roleId}
            className="h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none"
            style={{
              width: index === viewIndex ? 18 : 6,
              background: index === viewIndex ? activeAccent : "rgba(233,220,190,0.25)",
            }}
          />
        ))}
      </div>

      {/* ── Selected role record ──────────────────────────────────────────
          Real rows only, with their scope stated. No zeroed placeholder and
          no win rate is shown for a role with nothing on record. */}
      <div
        className="mt-2.5 w-full rounded-lg border border-[#c9a84c]/18 bg-[#060d1a]/60 px-3 py-2 text-center"
        data-testid="ranked-class-record"
      >
        {activeRecord ? (
          <>
            <div className="text-sm font-bold tabular-nums text-[#e2c877]">
              {activeRecord.wins}W · {activeRecord.losses}L
              {activeRecord.draws > 0 ? ` · ${activeRecord.draws}D` : ""}
            </div>
            {recordScopeLabel && (
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {recordScopeLabel}
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            No ranked matches on record as {RANKED_ROLE_LABELS[activeRole]}.
          </div>
        )}
      </div>
    </div>
  );
}

function StageArrow({
  direction,
  onClick,
}: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`ranked-class-${direction}`}
      aria-label={`${direction === "previous" ? "Previous" : "Next"} role`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/30 bg-[#060d1a]/70 text-[#e2c877] transition-colors hover:border-[#c9a84c]/70 hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
