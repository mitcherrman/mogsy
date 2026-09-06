import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  ACADEMY_UPDATES,
  ACADEMY_UPDATES_ENABLED,
  ACADEMY_UPDATES_VISIBLE,
  getPublishedUpdates,
  isAcademyUpdatesActive,
  resolveUpdateCta,
  type AcademyUpdate,
} from "@/lib/lol/academy-updates";
import { hasUnseenUpdate, markUpdatesSeen } from "@/lib/lol/academy-updates-seen";

/**
 * Academy Updates — the Hall's "What's New" affordance (WHATSNEW1).
 *
 * A small gilt mark beside Hall Mogzy that opens a compact parchment notice
 * listing the owner's hand-written announcements. It reads as Mogzy having
 * news, not as a site-wide notification tray.
 *
 * WHY THIS IS ITS OWN COMPONENT, NOT PART OF `MogzyHubGuide`
 * ---------------------------------------------------------
 * The guide renders inside a wrapper the Hall marks `aria-hidden` and
 * `pointer-events-none` (LolHub.tsx), because its speech bubble is decoration
 * that mirrors information already exposed to assistive tech elsewhere. A
 * focusable, labelled button cannot live in an `aria-hidden` subtree. So this
 * mounts as a SIBLING layer that copies the guide's geometry
 * (`bottom-[16%]`, centred in the lane, the same mascot width term) and lands
 * on Mogzy without the guide knowing it exists. `MogzyHubGuide` is untouched:
 * its hover glide, facing and click reaction are unchanged.
 *
 * DORMANT BY DEFAULT
 * ------------------
 * `isAcademyUpdatesActive()` gates the whole component. When the master switch
 * is off — or on with zero published entries — this returns `null` before any
 * hook does anything observable, so the Hall renders byte-identically to
 * production: no mark, no panel, no invisible hit region, no layout shift.
 */

/** Parchment fill, borrowed from the guide's speech bubble so the two notices
 *  read as the same material. Deliberately NOT the vellum texture PNG, whose
 *  baked vignette turns into a dark rim at this scale. */
const PARCHMENT =
  "linear-gradient(178deg, rgba(247,239,217,0.97) 0%, rgba(232,218,186,0.95) 46%, rgba(208,190,152,0.97) 100%)";

const SERIF = '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif';

/**
 * Academy red — the ink of the "!" while an update is UNSEEN (desktop).
 *
 * A vermilion in the manuscript family, not a notification red: it is the
 * rubricator's pigment — the colour a scribe reserved for the line that
 * matters — so on parchment it reads as an accent rather than an error state.
 * It replaced a much darker oxblood (`#7a2226`) that simply did not carry at
 * full Hall scale; this is deliberately the more noticeable of the two.
 *
 * What keeps it from becoming a notification dot is that ONLY the glyph takes
 * it. The circle keeps its parchment fill and brass border, so the mark reads
 * as a written character on paper, not as a filled badge.
 *
 * The SEEN state deliberately does NOT use it: a read notice returns to the
 * ordinary brown ink at 70% opacity, so the colour itself carries "new".
 */
const ACADEMY_RED = "#b63a35";
/** Ordinary ink — the seen state, and the mobile row in both states. */
const ACADEMY_INK = "#3a2c12";

function formatDate(iso: string): string {
  // Parsed as UTC and formatted in UTC: a date-only string is a calendar date,
  // not an instant, and local-time parsing would show the previous day to
  // anyone west of Greenwich.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function UpdateEntry({ update, first }: { update: AcademyUpdate; first: boolean }) {
  const cta = resolveUpdateCta(update);
  const ctaClass =
    "mt-1.5 inline-block rounded-[2px] border border-[#8a6a2f]/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3a2c12] transition-colors hover:bg-[#8a6a2f]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6a2f]/70";

  return (
    <li
      data-testid="academy-update-entry"
      data-update-id={update.id}
      // Older entries recede rather than disappear: the newest is the reason
      // the mark appeared, so it keeps full ink.
      className={first ? "" : "opacity-80"}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b5a33]">
        {formatDate(update.date)}
      </p>
      <h3
        className="mt-0.5 text-[13px] font-semibold leading-tight text-[#1d2b47]"
        style={{ fontFamily: SERIF }}
      >
        {update.title}
      </h3>
      <p className="mt-1 text-[12px] leading-snug text-[#3f4a63]">{update.body}</p>
      {cta &&
        (cta.external ? (
          <a href={cta.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
            {cta.label}
          </a>
        ) : (
          <Link to={cta.href} className={ctaClass}>
            {cta.label}
          </Link>
        ))}
    </li>
  );
}

export default function AcademyUpdates({
  variant = "hall",
  updates = ACADEMY_UPDATES,
  enabled = ACADEMY_UPDATES_ENABLED,
}: {
  /** `hall` anchors the mark to desktop Mogzy; `mobile` is an inline row. */
  variant?: "hall" | "mobile";
  /** Injectable for tests; production always uses the module authority. */
  updates?: readonly AcademyUpdate[];
  enabled?: boolean;
}) {
  const active = isAcademyUpdatesActive(updates, enabled);
  const published = useMemo(
    () => (active ? getPublishedUpdates(updates) : []),
    [active, updates],
  );
  const newestId = published[0]?.id ?? null;

  const [open, setOpen] = useState(false);
  // Resolved from storage in an effect rather than during render: reading
  // localStorage in a `useState` initialiser makes the first paint depend on
  // it, which differs between server and client and between a stubbed and a
  // real Storage. Starting "seen" means the quiet state is what renders if
  // anything goes wrong.
  const [unseen, setUnseen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    setUnseen(hasUnseenUpdate(newestId));
  }, [active, newestId]);

  const close = useCallback(() => {
    setOpen(false);
    // Focus returns to the control that opened the panel, so a keyboard user
    // lands back where they were rather than at the top of the document.
    buttonRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) return false;
      // Opening IS reading. Stamp the newest id now so the nudge does not
      // survive a user who opens the panel and then navigates away.
      if (newestId) markUpdatesSeen(newestId);
      setUnseen(false);
      return true;
    });
  }, [newestId]);

  // Escape closes, and a click outside dismisses. Both are bound only while
  // open, so the Hall carries no listeners in its resting state.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, close]);

  // Move focus into the panel on open. It is a non-modal surface — the Hall
  // stays reachable behind it, which is the point: this must not behave like
  // a modal that hides the four volumes.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!active) return null;

  const shown = published.slice(0, ACADEMY_UPDATES_VISIBLE);
  const hiddenCount = published.length - shown.length;

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Academy Updates"
      tabIndex={-1}
      data-testid="academy-updates-panel"
      style={{
        backgroundImage: PARCHMENT,
        // Centred on MOGZY, not on the mark. The mark's own box sits off his
        // right shoulder (`--mogzy-w * 0.42` plus half its 44px target), so
        // the panel backs that offset out again. Hung off the mark it drifted
        // right and leaned over the Patch Report volume; centred it reads as
        // Mogzy's own notice, the way his speech bubble does, and stays
        // clear of both book columns at every width. Ignored by the mobile
        // variant, which is an ordinary block in the flow.
        ...(variant === "hall"
          ? { left: "calc(50% - var(--mogzy-w) * 0.42 - 22px)" }
          : null),
      }}
      className={
        variant === "hall"
          ? "absolute bottom-[calc(100%+10px)] z-20 w-[clamp(258px,24vw,320px)] max-h-[min(42vh,320px)] -translate-x-1/2 overflow-y-auto rounded-lg border border-[#b9934c]/60 bg-[#c6b48f] px-3.5 py-3 text-left shadow-[inset_0_0_0_1px_rgba(255,248,226,0.45),0_14px_30px_rgba(0,0,0,0.55)] focus:outline-none"
          : "mt-2 max-h-[60vh] overflow-y-auto rounded-lg border border-[#b9934c]/60 bg-[#c6b48f] px-3.5 py-3 text-left shadow-[inset_0_0_0_1px_rgba(255,248,226,0.45),0_10px_24px_rgba(0,0,0,0.45)] focus:outline-none"
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#6b5a33]"
          style={{ fontFamily: SERIF }}
        >
          Academy Updates
        </h2>
        <button
          type="button"
          onClick={close}
          className="-mr-1 rounded-[2px] px-1.5 py-0.5 text-[15px] leading-none text-[#6b5a33] hover:text-[#3a2c12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6a2f]/70"
        >
          <span aria-hidden>×</span>
          <span className="sr-only">Close Academy Updates</span>
        </button>
      </div>
      <ul className="mt-2 space-y-3">
        {shown.map((u, i) => (
          <UpdateEntry key={u.id} update={u} first={i === 0} />
        ))}
      </ul>
      {hiddenCount > 0 && (
        // No "see all" route: there is no updates page in v1, and the panel
        // scrolls. This just tells the reader the list has an end they can
        // reach by scrolling.
        <p className="mt-2.5 border-t border-[#8a6a2f]/25 pt-2 text-[10px] uppercase tracking-[0.18em] text-[#6b5a33]">
          {hiddenCount} earlier {hiddenCount === 1 ? "notice" : "notices"} below
        </p>
      )}
    </div>
  );

  const markButton = (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={
        // The "new" state is carried in the accessible name, never by the
        // pulse alone — animation is decoration here, not information.
        unseen ? "Academy Updates — new" : "Academy Updates"
      }
      data-testid="academy-updates-mark"
      data-unseen={unseen ? "true" : "false"}
      className={
        variant === "hall"
          ? // 44×44 hit target around a much smaller visual mark, per the
            // pointer-target guidance the rest of the Hall follows.
            "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70"
          : "flex min-h-[44px] w-full items-center gap-2 rounded-[3px] border border-[#b9934c]/45 bg-[#1a1410]/70 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70"
      }
    >
      {variant === "hall" ? (
        <span
          aria-hidden
          data-testid="academy-updates-glyph"
          // `academy-updates-pulse` (index.css) is a slow breathing halo that
          // is cancelled under prefers-reduced-motion; it only ever emphasises
          // the dot, and the dot itself is static.
          //
          // The glyph — and ONLY the glyph — turns Academy crimson while the
          // newest notice is unseen. Circle size, parchment fill, brass border,
          // shadow, position and the 44×44 hit target around it are unchanged
          // in both states; the seen state keeps the ordinary ink at 70%.
          // Colour is never the sole carrier of the state: the button's
          // accessible name still says "Academy Updates — new".
          // 28px circle with 17px ink, up from 22/13. The 22px mark was
          // legible up close and invisible at full Hall scale, which is the
          // only scale that matters. The glyph grew with the circle so the
          // character still fills it rather than rattling around inside a
          // bigger disc. The button around it is unchanged at 44×44 and the
          // glyph stays centred in it, so the mark's own box — and therefore
          // its position against Mogzy — does not move.
          className={`flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[#b9934c]/70 text-[17px] font-bold leading-none shadow-[0_2px_8px_rgba(0,0,0,0.5)] ${
            unseen ? "academy-updates-pulse" : "opacity-70"
          }`}
          style={{
            backgroundImage: PARCHMENT,
            fontFamily: SERIF,
            color: unseen ? ACADEMY_RED : ACADEMY_INK,
          }}
        >
          !
        </span>
      ) : (
        <>
          <span
            aria-hidden
            data-testid="academy-updates-glyph"
            // Unchanged: the crimson glyph is a desktop-only adjustment, so
            // the mobile row keeps the ordinary ink in both states.
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#b9934c]/70 text-[12px] font-bold leading-none ${
              unseen ? "academy-updates-pulse" : "opacity-70"
            }`}
            style={{ backgroundImage: PARCHMENT, fontFamily: SERIF, color: ACADEMY_INK }}
          >
            !
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfc4a5]">
            Academy Updates
          </span>
        </>
      )}
    </button>
  );

  if (variant === "mobile") {
    return (
      <div data-testid="academy-updates-mobile" className="mt-4 md:hidden">
        {markButton}
        {open && panel}
      </div>
    );
  }

  return (
    // Mirrors MogzyHubGuide's float wrapper exactly (`inset-x-0 bottom-[16%]`,
    // centred), so the mark tracks Mogzy without either component importing
    // the other. The layer ignores the pointer; only the button takes it back.
    // The outer layer repeats the guide wrapper's own offsets (LolHub gives
    // the guide `top-[3.25rem] -bottom-[3.25rem]`); carrying them here rather
    // than in the Hall is what lets the dormant component render literally
    // nothing — an empty positioned div in the Hall would be a hidden region.
    // z-20 puts an open notice above the speech bubble's z-10.
    <div
      data-testid="academy-updates-hall"
      className="pointer-events-none absolute inset-x-0 top-[3.25rem] -bottom-[3.25rem] z-20"
      style={
        {
          // Mogzy's own width term, copied from MogzyHubGuide's <img>. His PNG
          // is 1024×1536, hence the 1.5 height factor. If his size changes
          // there, change it here.
          "--mogzy-w": "clamp(97px, 9.7vw, 167px)",
          "--mogzy-h": "calc(var(--mogzy-w) * 1.5)",
        } as React.CSSProperties
      }
    >
      {/* Float layer — the same `inset-x-0 bottom-[16%] flex justify-center`
          MogzyHubGuide's root uses, so the mark tracks Mogzy without either
          component importing the other. */}
      <div className="absolute inset-x-0 bottom-[16%] flex justify-center">
        <div className="relative">
          <div
            className="absolute"
          style={{
            // Just off his right shoulder, at hat-brim height: outside the
            // silhouette, well inside the lane, and clear of the speech
            // bubble's band above him.
            left: "calc(var(--mogzy-w) * 0.42)",
            bottom: "calc(var(--mogzy-h) * 0.58)",
          }}
        >
            {markButton}
            {open && panel}
          </div>
        </div>
      </div>
    </div>
  );
}
