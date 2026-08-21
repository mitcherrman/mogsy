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
 * Each slide renders the role's own mascot from the ONE role -> art map in
 * the Mogzy registry (`MOGZY_ROLE_ASSETS`); this file lists no paths and
 * makes no per-role choices of its own. The art is presentation only: it
 * carries no class semantics, and the role NAME is still rendered on every
 * slide, so identity never depends on the picture.
 *
 * Beside the SELECTED figure — and only beside that one — sits a single small
 * champion medallion from `roleChampions.ts`: the League anchor for the role
 * on stage. It is cosmetic, it is announced to nobody, and it stays a coin at
 * the mascot's foot on purpose. The mascot is this stage's subject; five
 * champion portraits at once would make it a champion gallery instead.
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
import { getRankedRoleMascotPath } from "@/components/mascot/mascot-assets";
import { getRankedRoleChampion } from "@/lib/ranked-public/roleChampions";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

/** A real, already-tallied record for one role. Never defaulted to zeros —
 *  a role the host has no rows for is simply absent from the map. */
export interface RankedRoleRecord {
  wins: number;
  losses: number;
  draws: number;
}

/** The surface the stage is standing on. The five role hues have to be told
 *  apart on BOTH, and the same pastel cannot do it: a tint tuned to glow on
 *  navy is a pale smear on beige. Each surface gets the hue at its own depth,
 *  never a different hue. */
export type CarouselSurface = "dark" | "parchment";

/** Restrained per-role accents from the existing academy palette. Identity is
 *  carried by the NAME; this only tints the plinth and ring. */
const ROLE_ACCENTS: Record<CarouselSurface, Record<RankedRole, string>> = {
  dark: {
    top: "#d5b66f",
    jungle: "#8fd0a0",
    mid: "#7fd6ef",
    adc: "#e2a17a",
    support: "#c2a4e0",
  },
  /** The same five hues taken down into the pigment range, so a role label
   *  reads as ink on the sheet rather than washing out into it. Each one is
   *  set where it clears 4.5:1 against the parchment at its darkest point
   *  under text — rgb(209,187,158), a flank at its inner edge. They were
   *  re-derived when the ageing pass darkened the sheet; the values tuned to
   *  the bright parchment had all fallen to between 3.5 and 4.1. */
  parchment: {
    top: "#5e420a",
    jungle: "#1b5435",
    mid: "#0a4b5e",
    adc: "#723416",
    support: "#5c3585",
  },
};

/** Everything on the stage that is NOT a role hue, per surface. */
const SURFACE = {
  dark: {
    /** The plinth under a portrait: a lit halo on dark. */
    plinth: (accent: string) =>
      `radial-gradient(60% 50% at 50% 78%, ${accent}38 0%, transparent 72%)`,
    /** The SELECTED figure's plinth: the same halo, brought up. */
    plinthCentre: (accent: string) =>
      `radial-gradient(64% 54% at 50% 78%, ${accent}62 0%, ${accent}1c 45%, transparent 74%)`,
    /** How an unselected figure is inked. On dark the slide's own opacity
     *  already recedes it, so nothing further is drained. */
    flankInk: "saturate(0.75)",
    /** The letterpress under the selected name. */
    press: "0 1px 0 rgba(0,0,0,0.45)",
    ring: (accent: string) =>
      `radial-gradient(50% 100% at 50% 50%, ${accent}66 0%, transparent 70%)`,
    offStageLabel: "rgba(233,220,190,0.7)",
    /** How present the two neighbours are. */
    flankOpacity: 0.42,
    blurb: "text-muted-foreground",
    dot: "rgba(233,220,190,0.25)",
    control:
      "border-[#c9a84c]/30 bg-[#060d1a]/70 text-[#e2c877] hover:border-[#c9a84c]/70 hover:bg-[#c9a84c]/10 focus-visible:ring-[#f0d78c]",
    record: "border-[#c9a84c]/18 bg-[#060d1a]/60",
    recordValue: "text-[#e2c877]",
    recordScope: "text-muted-foreground",
    recordEmpty: "text-muted-foreground",
    /** The champion medallion beside the selected figure — brass on navy. */
    champion: {
      ring: "rgba(201,168,76,0.55)",
      halo: "rgba(6,13,26,0.72)",
      shadow: "0 6px 16px -6px rgba(0,0,0,0.85)",
      /** Barely touched: on a dark stage the portrait is already contained. */
      ink: "saturate(0.95)",
    },
  },
  parchment: {
    /** On a light sheet the same slot does the opposite job: a soft warm
     *  shade, so the figure is seated on the parchment rather than lit above
     *  it. Without this the portraits float. */
    plinth: () => "radial-gradient(58% 50% at 50% 82%, rgba(84,56,20,0.24) 0%, transparent 70%)",
    /* The selected figure sits in a deeper, tighter shadow. This is the
       parchment's version of "lit": a sheet cannot glow, so the chosen role
       is the one the paper is darkest under — it reads as standing forward,
       and it costs no contrast anywhere, because it is behind the art. */
    plinthCentre: () =>
      "radial-gradient(56% 52% at 50% 84%, rgba(74,48,16,0.52) 0%, rgba(84,56,20,0.20) 46%, transparent 72%)",
    /* Unselected figures are drawn back a step in ink as well as in scale.
       Restrained on purpose — enough that the eye lands on the centre first,
       not so much that a neighbour looks broken or greyed-out. */
    flankInk: "saturate(0.62) brightness(0.96)",
    press: "0 1px 0 rgba(255, 249, 233, 0.5)",
    ring: () => "radial-gradient(50% 100% at 50% 50%, rgba(64,42,14,0.46) 0%, transparent 70%)",
    /* A pale neighbour that worked on navy disappears on beige — the flanks
       were landing near 1.4:1 once the slide's own opacity was counted, which
       is the "flattened contrast" this surface exists to avoid.
       The slide's opacity multiplies whatever colour the label picks, and no
       mid-brown survives it: at 0.72 the label has to be the DARKEST ink on
       the sheet to clear 4.5:1. Which is the right trade — the neighbours stay
       plainly recessed (that is the slide's job) while their names stay
       plainly readable (that is the label's). */
    offStageLabel: "#241708",
    flankOpacity: 0.72,
    /* The role blurb is the longest run of small copy on the sheet, so it is
       the line that decides whether the parchment reads as written or as
       washed out. Darkened a step and taken to `font-medium`: at 400 weight
       on a textured beige the stems were thin enough to shimmer. */
    blurb: "text-[#3f2c14] font-medium",
    dot: "rgba(74,52,20,0.42)",
    control:
      "border-[#5c401c7a] bg-[#5c401c24] text-[#533808] hover:border-[#5c401cd9] hover:bg-[#5c401c33] focus-visible:ring-[#533808]",
    record: "border-[#5c401c7a] bg-[#7050202b]",
    recordValue: "text-[#3f2b06]",
    recordScope: "text-[#56412a]",
    recordEmpty: "text-[#3f2c14]",
    /* The same medallion struck in the sheet's own metal. A game portrait is
       a full-saturation digital image and the parchment is not, so it is
       pulled a step toward the page's warmth — enough that the coin reads as
       INLAID in the manuscript rather than pasted onto it, and not so much
       that the champion stops being recognisable, which is the entire point
       of having it there. */
    champion: {
      ring: "rgba(74,48,16,0.62)",
      halo: "rgba(255,247,230,0.55)",
      shadow: "0 5px 12px -5px rgba(56,36,10,0.6)",
      ink: "sepia(0.22) saturate(0.88)",
    },
  },
} as const;

/**
 * How far back a neighbouring role stands.
 *
 * Named rather than inlined because TWO things have to agree on it: the
 * slide's own `scale()`, and the counter-scale on that slide's NAME. The
 * name must not shrink with the figure — see the label below — and the only
 * way to keep it at its stated size inside a scaled box is to divide it back
 * out by exactly this number.
 */
const FLANK_SCALE = 0.46;

/** Signed ring distance from the selected slide, in -2..2. */
function ringOffset(index: number, selected: number, length: number): number {
  const half = Math.floor(length / 2);
  return ((index - selected + length + half) % length) - half;
}

export default function RankedClassCarousel({
  value,
  onSelect,
  onViewChange,
  disabled = false,
  busyRole = null,
  records = null,
  recordScopeLabel,
  showRecord = true,
  surface = "dark",
  className = "",
}: {
  /** The account's role, or null when it has never chosen / is unavailable. */
  value: RankedRole | null;
  onSelect: (role: RankedRole) => void;
  /**
   * The role currently STANDING ON STAGE, whether or not it has been
   * selected. `onSelect` fires only when the host can persist a choice;
   * this fires on every move, including the first paint and including a
   * read-only stage, so a host rendering the browsed role's record beside
   * the ring stays in step with what the reader is actually looking at.
   *
   * Never a write signal. Reporting where the ring is pointing is not the
   * same as choosing, and a host must not persist from it.
   */
  onViewChange?: (role: RankedRole) => void;
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
  /**
   * Whether the stage draws its own record strip beneath the ring.
   *
   * MALT: the Leaguecraft lobby now owns a full Role Mastery Record ledger
   * under this stage — games, win rate, rating movement and last played —
   * which is the same tally at more depth. Two record strips one above the
   * other would state the W-L twice and disagree about which is the summary,
   * so the host turns this one OFF and renders the ledger instead. Every
   * other caller keeps the strip: `true` is the default, and this prop
   * changes nothing about selection, records, or the stage itself.
   */
  showRecord?: boolean;
  /** Which lobby surface the stage is mounted on. Colour only — no role, no
   *  ordering and no behaviour changes with it. */
  surface?: CarouselSurface;
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

  // Report where the ring is pointing, including on the first paint, so a
  // host ledger beside the stage is never a frame behind it.
  useEffect(() => {
    onViewChange?.(RANKED_ROLES[viewIndex]);
    // `onViewChange` is deliberately out of the dependency list: an inline
    // arrow from the host is a new function every render, and depending on
    // it would re-fire this on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIndex]);

  // Focus moves only in response to a KEY press — never on mount, and never
  // when the host re-renders for an unrelated reason.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    refs.current[viewIndex]?.focus();
  }, [viewIndex]);

  function moveTo(index: number, viaKeyboard: boolean) {
    const next = (index + length) % length;
    const nextRole = RANKED_ROLES[next];
    if (viaKeyboard) shouldFocus.current = true;
    setViewIndex(next);
    // A move only SELECTS when it lands somewhere the account is not already
    // stored as. `onSelect` is a SERVER WRITE (PUT /api/ranked/role), and this
    // used to fire on every move including the one that changes nothing — so
    // clicking the mascot that was already chosen spent one of the account's
    // ten `role_set` writes per minute per click, and the eleventh click was
    // answered 429 "too many requests" for a role it already had.
    //
    // The test is against the SAVED role, not against the ring position:
    //  - an account with no role yet (`value === null`) still writes on its
    //    first click, because null is never the role it lands on;
    //  - a move BACK to the saved role after browsing away is not a change and
    //    is not written either — the stage is free to be looked through;
    //  - a write the backend REFUSED leaves `value` where it was, so clicking
    //    the refused role again is still a change and still retries.
    // Browsing itself is unaffected: `setViewIndex` above always runs, and
    // `onViewChange` still reports every move.
    if (selectable && nextRole !== value) onSelect(nextRole);
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

  const accents = ROLE_ACCENTS[surface];
  const skin = SURFACE[surface];
  const activeRole = RANKED_ROLES[viewIndex];
  const activeAccent = accents[activeRole];
  const activeRecord = records?.[activeRole] ?? null;
  // The League anchor for the role ON STAGE — exactly one, resolved here and
  // rendered once below, so "only the selected role's champion is shown" is a
  // property of the structure rather than a rule someone has to remember.
  const activeChampion = getRankedRoleChampion(activeRole);
  const championIconUrl = resolveQuizAssetUrl(activeChampion.iconPath);

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      data-testid="ranked-class-carousel"
      data-surface={surface}
    >
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
        className="relative h-[252px] w-full overflow-hidden select-none sm:h-[300px] lg:h-[340px]"
      >
        {RANKED_ROLES.map((roleId, index) => {
          const offset = ringOffset(index, viewIndex, length);
          const onStage = Math.abs(offset) <= 1;
          const isCentre = offset === 0;
          const accent = accents[roleId];
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
                /* The flanks are taken down a step harder than before, because
                   the centre figure is now much larger and the neighbours have
                   to recede further to stay neighbours rather than becoming a
                   crowd. `0.46` is where a flank reads as "the next role along"
                   instead of "a second option of equal weight".
                   The ring offset came DOWN when the scale did, which is not
                   the obvious direction: a flank's NAME is counter-scaled back
                   to full size (see the label), so it is far wider than the
                   shrunken figure it sits under, and at the old 66% the longer
                   role names ran off the stage and were clipped by its own
                   overflow. 54% keeps the widest of them — SUPPORT — inside
                   the sheet at every width. The centre still reads as the one
                   in front: it holds `zIndex: 2` and twice the height. */
                transform: `translate(-50%, 0) translateX(${offset * 54}%) scale(${
                  isCentre ? 1 : FLANK_SCALE
                })`,
                /* Scale from the FOOT of the slide, not its middle. With the
                   default centre origin a recessed neighbour shrank inward
                   from both ends and ended up floating halfway up the stage,
                   which read as three figures at three different distances
                   from the camera. From the foot they all stand on the same
                   ground line, which is what makes this a character-select
                   stage rather than three portraits of different sizes. */
                transformOrigin: "50% 100%",
                opacity: onStage ? (isCentre ? 1 : skin.flankOpacity) : 0,
                zIndex: isCentre ? 2 : 1,
                transitionProperty: reducedMotion ? "opacity" : "transform, opacity",
              }}
              /* `pb-7` reserves the name's line at the foot of the slide so the
                 figure above it can take the WHOLE remaining height instead of
                 a percentage of the stage. That is where the size came from:
                 the art used to be capped at 80% of the stage and then had a
                 ring and a label stacked under it in flow, which spent a fifth
                 of the parchment on spacing. Both of those are positioned
                 absolutely now, so the only thing between the figure and the
                 stage's full height is the label's own line. */
              className="absolute left-1/2 top-0 flex h-full w-[70%] flex-col items-center justify-end rounded-2xl px-1 pb-7 duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] disabled:cursor-default motion-reduce:!transition-none"
            >
              {/* Plinth — decorative, tinted by the role accent. The centre
                  gets its own deeper one: on parchment a selection cannot be
                  announced with light, so it is announced with WEIGHT, and a
                  figure seated in a darker shadow reads as the one standing
                  forward on the sheet. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1 bottom-6 top-1 rounded-[999px] blur-xl"
                style={{ background: isCentre ? skin.plinthCentre(accent) : skin.plinth(accent) }}
              />
              <img
                src={getRankedRoleMascotPath(roleId)}
                alt=""
                aria-hidden="true"
                draggable={false}
                /* The flanks are additionally drained of a little colour, so
                   the selected role is the only fully-inked figure on the
                   stage. Scale says "further away"; ink says "not chosen". */
                className="relative h-full w-auto max-w-full object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.6)] motion-reduce:!transition-none"
                style={{
                  filter: isCentre ? undefined : skin.flankInk,
                  transition: reducedMotion ? "none" : "filter 300ms ease-out",
                }}
              />
              {/* Ground ring under the figure — reads as a character plinth.
                  Positioned, not in flow, so it costs the art no height. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[22px] h-2 rounded-[999px]"
                style={{
                  background: skin.ring(accent),
                  width: isCentre ? "72%" : "60%",
                }}
              />
              {/* The NAME is the identity. Nothing above it may replace it —
                  which is why the selected one is marked by SIZE and by a
                  ruled underline rather than by colour alone. */}
              <span
                className={`absolute bottom-0 whitespace-nowrap font-extrabold uppercase ${
                  isCentre ? "text-[15px] tracking-[0.3em]" : "text-[10px] tracking-[0.1em]"
                }`}
                style={{
                  color: isCentre ? accent : skin.offStageLabel,
                  textShadow: isCentre ? skin.press : undefined,
                  /* The name is counter-scaled out of the slide's own
                     transform. A role must be identifiable by TEXT and never
                     by its picture alone, and a label that inherits a 0.46
                     shrink renders at about five pixels — which is not a
                     label, it is a smudge. The figure recedes; the name it is
                     labelled with does not. */
                  transform: isCentre ? undefined : `scale(${1 / FLANK_SCALE})`,
                  transformOrigin: isCentre ? undefined : "50% 100%",
                  /* The selected role's name is underscored the way a
                     manuscript marks an entry — the rule is drawn in the
                     role's own ink and fades at both ends, so it reads as
                     penned under the word rather than as a UI underline. */
                  paddingBottom: isCentre ? 4 : undefined,
                  borderBottom: isCentre ? `1.5px solid ${accent}` : undefined,
                  borderImage: isCentre
                    ? `linear-gradient(90deg, transparent 0%, ${accent} 22%, ${accent} 78%, transparent 100%) 1`
                    : undefined,
                }}
              >
                {RANKED_ROLE_LABELS[roleId]}
              </span>
            </button>
          );
        })}

        {/* ── League anchor ──────────────────────────────────────────────
            ONE champion medallion, for the role standing on stage.

            It is mounted on the STAGE, not inside a slide. That is what makes
            "only the selected role's champion is visible" structural: there is
            a single element and it is outside the five-slide map, so a second
            one cannot appear and the stage can never become a champion
            gallery. Being outside the buttons also keeps it out of every
            radio's accessible name — a role option is named by its ROLE.

            Decorative, and deliberately small. The Mogzy mascot is the subject
            of this stage; the champion is the note in the margin saying which
            game the stage belongs to, so it is sized as a coin at the selected
            figure's foot rather than as a second portrait. */}
        {championIconUrl && (
          <span
            aria-hidden="true"
            data-testid="ranked-class-champion"
            data-role={activeRole}
            data-champion={activeChampion.name}
            /* WHERE, and why it is not at the figure's foot.
               The obvious place — down beside the selected mascot's feet — is
               the one part of the stage that is already occupied: the two
               neighbours are scaled from their FOOT line, so they stand in the
               lower half and the coin landed squarely on top of the right-hand
               one. It reads as a third, half-sized character rather than as an
               emblem. Everything above ~54% of the stage height is free of
               flanks by construction, so the medallion hangs at the selected
               figure's shoulder instead: clear of the neighbours at every
               width, and still beside the one mascot it belongs to. */
            className="pointer-events-none absolute right-[2%] top-[22%] z-[3] flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border sm:h-11 sm:w-11 lg:h-12 lg:w-12"
            style={{
              borderColor: skin.champion.ring,
              background: skin.champion.halo,
              boxShadow: skin.champion.shadow,
            }}
          >
            <img
              src={championIconUrl}
              alt=""
              draggable={false}
              className="h-full w-full rounded-full object-cover"
              style={{ filter: skin.champion.ink }}
            />
          </span>
        )}
      </div>

      {/* ── Stage controls ────────────────────────────────────────────────
          Redundant with the arrow keys on purpose: pointer users get the
          same ring movement without needing focus in the group. */}
      <div className="mt-1 flex w-full items-center justify-center gap-3">
        <StageArrow
          direction="previous"
          onClick={() => moveTo(viewIndex - 1, false)}
          tone={skin.control}
        />
        <p className={`min-w-0 flex-1 text-center text-[12px] leading-snug ${skin.blurb}`}>
          {busyRole === activeRole ? "Saving…" : RANKED_ROLE_BLURBS[activeRole]}
        </p>
        <StageArrow direction="next" onClick={() => moveTo(viewIndex + 1, false)} tone={skin.control} />
      </div>

      {/* ── Position indicators ───────────────────────────────────────────
          Decorative only — the radiogroup above already carries the real
          selection semantics, so these are hidden from assistive tech
          rather than duplicated as a second control.

          Ruled ticks with a lozenge on the active one, rather than five
          rounded pills: a pill row is the one piece of stock app furniture
          left on this sheet, and a marker set against ruled marks is how a
          manuscript points at a place in a list. */}
      <div aria-hidden="true" className="mt-2 flex items-center gap-2">
        {RANKED_ROLES.map((roleId, index) => {
          const active = index === viewIndex;
          return (
            <span
              key={roleId}
              className="transition-all duration-200 motion-reduce:transition-none"
              style={{
                width: active ? 7 : 5,
                height: active ? 7 : 1.5,
                transform: active ? "rotate(45deg)" : undefined,
                background: active ? activeAccent : skin.dot,
              }}
            />
          );
        })}
      </div>

      {/* ── Selected role record ──────────────────────────────────────────
          Real rows only, with their scope stated. No zeroed placeholder and
          no win rate is shown for a role with nothing on record. */}
      {showRecord && (
      <div
        className={`mt-2.5 w-full rounded-lg border px-3 py-2 text-center ${skin.record}`}
        data-testid="ranked-class-record"
      >
        {activeRecord ? (
          <>
            <div className={`text-[15px] font-extrabold tabular-nums ${skin.recordValue}`}>
              {activeRecord.wins}W · {activeRecord.losses}L
              {activeRecord.draws > 0 ? ` · ${activeRecord.draws}D` : ""}
            </div>
            {recordScopeLabel && (
              <div
                className={`mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] ${skin.recordScope}`}
              >
                {recordScopeLabel}
              </div>
            )}
          </>
        ) : (
          <div className={`text-[12px] font-medium ${skin.recordEmpty}`}>
            No ranked matches on record as {RANKED_ROLE_LABELS[activeRole]}.
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function StageArrow({
  direction,
  onClick,
  tone,
}: {
  direction: "previous" | "next";
  onClick: () => void;
  /** Surface-matched border/fill/text classes from `SURFACE`. */
  tone: string;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`ranked-class-${direction}`}
      aria-label={`${direction === "previous" ? "Previous" : "Next"} role`}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${tone}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
