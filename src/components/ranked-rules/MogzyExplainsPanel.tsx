/**
 * MOGZY EXPLAINS THIS MODE — the shell half of an Academy explanation.
 *
 * WHAT IT IS
 * ──────────
 * A mascot-led aside that sits at the edge of a game surface in two states:
 * an open parchment scroll, and a small collapsed tab the player can reopen it
 * from. The mode supplies the title and the body; this file owns the geometry,
 * the open/closed behaviour, the keyboard contract and the Academy skin.
 *
 * WHAT IT DELIBERATELY IS NOT
 * ───────────────────────────
 * It is not a tutorial, not a step sequence, and not a modal. Nothing here
 * traps focus, blocks the page, or covers the surface it explains on a desktop
 * width, because the surface behind it is frequently a LIVE match on a server
 * clock: reading the rules must never be an act that changes the match, and
 * the cheapest way to guarantee that is a control that is `position: fixed`,
 * owns no state but its own, and calls nothing but its own callbacks.
 *
 * Ranked is its only caller today. The seam is drawn where it is — shell here,
 * content in the mode — so a second mode can reuse the shell without either
 * mode learning what the other explains, but no other mode is converted by
 * this change and none should be converted speculatively.
 *
 * PLACEMENT. Either bottom corner, chosen by the caller through `side`.
 *
 * It was bottom-right only, because both top corners are `GlobalHud`'s chips
 * and the bottom-LEFT was the Community trigger's. FB1-4 then added a question
 * reporter beside the same live match, and the two shared the right corner —
 * which read as one crowded cluster rather than two controls with different
 * jobs. They are now a mirrored PAIR: the reporter bottom-left, the mode's
 * rules bottom-right, same insets and same tab treatment either side.
 *
 * `side` is the ONLY thing that differs. It flips three things and nothing
 * else: which dock anchor the portals target, which way the panel's entrance
 * slides, and which edge the undocked fallback pins to. Everything below —
 * sizes, skin, focus contract, Escape, the collapse/close distinction — is
 * identical on both sides, because a mirror that drifts is worse than no
 * mirror at all.
 *
 * The corner itself is `MogzyDock`: two anchors, each with a panel stack and a
 * tab row, sorting their occupants and keeping ONE panel open across both
 * sides. This component PORTALS into it when it is mounted, and falls back to
 * its original private `fixed` anchor when it is not, so a panel rendered
 * outside the app shell (every test that renders one, for instance) is
 * unchanged.
 */
import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import {
  DOCK_ORDER,
  useMogzyDockSlot,
  type MogzyDockSide,
} from "@/components/mogzy-dock/MogzyDock";

export interface MogzyExplainsPanelProps {
  /** Whether the scroll is currently unrolled. Owned by the caller. */
  open: boolean;
  /** The collapsed tab was pressed. */
  onOpen: () => void;
  /** The player dismissed the scroll — "Got it", Escape, or the close tab. */
  onClose: () => void;
  /** Plate heading, e.g. "Ranked Rules". Also names the dialog. */
  title: string;
  /** The short label on the collapsed tab, e.g. "Rules". */
  tabLabel: string;
  /** Accessible name for the collapsed tab, e.g. "View Ranked scoring rules". */
  openLabel: string;
  /**
   * Draw the collapsed tab as something still to be found.
   *
   * The caller's business, not this shell's: it exists because a layout too
   * narrow to open into cannot rely on the panel itself to introduce the
   * feature, so the tab has to do that job. Brighter frame, a slow brass
   * halo, and the mascot looking up rather than peeking — enough to be noticed
   * beside a live match, small enough not to compete with it. It changes
   * nothing else: same size, same position, same accessible name, same
   * action, and no layout of its own, so a prominent tab can no more cover a
   * question than a quiet one.
   */
  prominent?: boolean;
  /** The mode's own explanation. Rows, not paragraphs. */
  children: ReactNode;
  /** Hook prefix, so a mode's tests can address its own instance. */
  testId?: string;
  /**
   * Label on the panel's own dismiss button. "Got it" is right under an
   * explanation and wrong under a form, which is the only reason this is a
   * prop — the button's role (dismiss, and the panel's initial focus target)
   * is identical either way.
   */
  acknowledgeLabel?: string;
  /**
   * Where this panel sits among the dock's occupants. See `DOCK_ORDER`.
   * Defaults to the rules slot, which is what the only pre-dock caller was.
   */
  dockOrder?: number;
  /**
   * Which bottom corner to anchor to. Defaults to "right", which is where the
   * only pre-mirror caller (Ranked Rules) has always been and stays.
   *
   * A left-anchored panel expands rightward, inward across the viewport, so it
   * cannot run off the edge it is pinned to — the same guarantee the right side
   * has always had in the other direction.
   */
  side?: MogzyDockSide;
  /**
   * The dock asked this panel to step aside because the player opened another
   * one. Defaults to `onClose`.
   *
   * Callers whose close carries a MEANING — Ranked Rules, where dismissal is
   * the acknowledgement — must pass a collapse that does not carry it. Being
   * shoved aside is not the player saying they have read anything.
   */
  onCollapse?: () => void;
}

export function MogzyExplainsPanel({
  open, onOpen, onClose, title, tabLabel, openLabel, children,
  prominent = false, testId = "mogzy-explains",
  dockOrder = DOCK_ORDER.rules, onCollapse, acknowledgeLabel = "Got it",
  side = "right",
}: MogzyExplainsPanelProps) {
  const headingId = useId();
  const tabRef = useRef<HTMLButtonElement | null>(null);
  const acknowledgeRef = useRef<HTMLButtonElement | null>(null);
  // Focus is only MOVED back to the tab when the player was actually working
  // in the scroll. Pulling focus on a close the player did not drive would
  // steal it from an answer tablet mid-match.
  const focusWasInside = useRef(false);

  /* Escape closes, matching every other dismissable panel in the app. Bound on
     the document rather than on the panel so it works whether or not focus
     ever entered the scroll — a player who opened it with the mouse and then
     clicked an answer still expects Escape to put it away. It is registered
     ONLY while open, so Ranked's own key handling is untouched the rest of the
     time, and it does not `preventDefault`: the press is a dismissal here, and
     whatever else Escape means on this page it still means. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /* On open, put focus on the acknowledgement. It is the panel's primary
     action and its last element, so a keyboard player lands on "Got it" and
     can leave with one press, while Shift+Tab walks back up through the rules
     themselves. Nothing is trapped: Tab continues out into the page. */
  useEffect(() => {
    if (!open) return;
    focusWasInside.current = false;
    acknowledgeRef.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    focusWasInside.current = true;
    onClose();
  }, [onClose]);

  /* A collapse is NOT a close: it never sets `focusWasInside`, so stepping
     aside for another panel does not yank focus back to this tab, and it calls
     the caller's own `onCollapse` so a meaning attached to closing (Ranked's
     acknowledgement) is not spent by a control the player never opened. */
  const collapse = useCallback(() => {
    if (onCollapse) onCollapse();
    else onClose();
  }, [onCollapse, onClose]);

  const { panelSlot, tabSlot } = useMogzyDockSlot({ id: testId, side, open, onCollapse: collapse });

  /* Returning focus to the tab after a player-driven close. Without it a
     keyboard player is dropped at the top of the document every time they
     read the rules. */
  useEffect(() => {
    if (open || !focusWasInside.current) return;
    focusWasInside.current = false;
    tabRef.current?.focus();
  }, [open]);

  const panel = open ? (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      data-testid={`${testId}-panel`}
      style={{ order: dockOrder }}
      /* Phone: an edge-to-edge sheet, clear of both screen edges. Desktop:
         a column beside the arena.
 
         HEIGHT IS THE CONTENT'S, AND THE VIEWPORT IS ONLY A CEILING.
         This was `max-h-[min(72vh,34rem)]`, and the 34rem half of that was a
         flat cap that had nothing to do with the screen: on a 1800x800 desktop
         it clamped the panel to 544px of a viewport with 688px to spare, so a
         ~600px report form grew its OWN scrollbar inside a page that was not
         scrolling. A parchment with a scrollbar down it at desktop height reads
         as broken paper.
 
         So the ceiling is now the space the dock actually leaves: the viewport
         less this panel's own bottom inset, the tab row beneath it, and the gap
         between them (~4.5rem), plus a margin so the parchment's top edge is
         never flush against the HUD. Below that the panel is `h-auto` — it is
         exactly as tall as its content, and `overflow-y: auto` (from
         `.mogzy-scroll`) engages only on a genuinely short screen, which is the
         one case where something has to give. `dvh` and not `vh`: on mobile the
         difference is the browser's own collapsing chrome, and `vh` measures the
         tallest state, which is the one where the panel does not fit.
 
         The 44rem outer cap is a READABILITY limit, not a fit one — a 900px
         column of parchment beside a live match is not a better explanation
         than a 700px one. On any viewport short enough to matter, the
         viewport-aware term is already the smaller of the two. */
      className={`pointer-events-auto mogzy-scroll
        w-[calc(100vw-1.5rem)] max-w-[21rem] sm:w-[21rem]
        max-h-[min(calc(100dvh-7rem),44rem)] overscroll-contain
        px-4 pb-4 pt-3 text-left shadow-2xl
        motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2
        ${side === "left"
          ? "motion-safe:slide-in-from-left-2"
          : "motion-safe:slide-in-from-right-2"}`}
    >
      <header className="flex items-start gap-3">
        {/* Mogzy holds the scroll rather than standing over the arena: he
            is INSIDE the panel's own header, so he cannot reach the
            question, the timer or either score at any width. */}
        <span className="mogzy-scroll-portrait -mt-0.5 block h-14 w-14 shrink-0">
          <MogzyMascot
            pose="explaining"
            decorative
            loading="eager"
            className="h-full w-full object-contain"
          />
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <h2 id={headingId} className="ranked-eyebrow !text-[#6b5220]">{title}</h2>
        </div>
        <button
          type="button"
          onClick={close}
          data-testid={`${testId}-close`}
          aria-label={`Close ${title}`}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
            text-lg leading-none text-[#6b5220]/70 transition-colors
            hover:bg-[#6b5220]/10 hover:text-[#3f3014]
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-[#8a6a26]"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="mt-2">{children}</div>

      <button
        type="button"
        ref={acknowledgeRef}
        onClick={close}
        data-testid={`${testId}-acknowledge`}
        className="mt-3 min-h-11 w-full rounded-md border border-[#8a6a26]/55
          bg-[#6b5220]/10 px-3 text-[11px] font-bold uppercase tracking-[0.22em]
          text-[#4a3818] transition-colors hover:bg-[#6b5220]/20
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-[#8a6a26]"
      >
        {acknowledgeLabel}
      </button>
    </section>
  ) : null;

  /* The tab is ALWAYS mounted, open or not — it is the thing the panel unrolls
     from, it keeps the corner's shape stable, and leaving it present is what
     lets focus return to it on close. */
  const tab = (
    <button
      type="button"
      ref={tabRef}
      onClick={open ? close : onOpen}
      aria-label={open ? `Close ${title}` : openLabel}
      aria-expanded={open}
      data-testid={`${testId}-tab`}
      data-open={open ? "true" : undefined}
      data-prominent={prominent ? "true" : undefined}
      style={{ order: dockOrder }}
      className={`mogzy-scroll-tab pointer-events-auto flex min-h-11 items-center gap-1.5
        rounded-full py-1 pl-1 pr-3 ${prominent ? "mogzy-scroll-tab--calling" : ""}
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-[#c9a84c]`}
    >
      <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-full">
        <MogzyMascot
          pose={open ? "explaining" : prominent ? "raisingHand" : "peeking"}
          decorative
          className="h-full w-full object-cover"
        />
      </span>
      <span className="ranked-eyebrow">{tabLabel}</span>
    </button>
  );

  /* Docked: the panel and the tab live in the dock's two slots, which is what
     lets a second control share the corner without either knowing about the
     other. The portals are separate because the slots are separate boxes —
     panels stack in a column, tabs sit in a row. */
  if (panelSlot && tabSlot) {
    return (
      <>
        {panel && createPortal(panel, panelSlot)}
        {createPortal(tab, tabSlot)}
      </>
    );
  }

  /* Undocked fallback: the component's original private anchor, mirrored by
     `side` so a panel rendered outside the app shell lands in the same corner
     it would have docked into. The right-hand values are byte-for-byte the
     originals, which is what keeps every pre-existing undocked caller and test
     unchanged. */
  return (
    <div
      data-testid={`${testId}-dock`}
      data-dock-side={side}
      className={`pointer-events-none fixed bottom-4 z-40 flex flex-col gap-2 sm:bottom-5
        ${side === "left"
          ? "left-3 items-start sm:left-4"
          : "right-3 items-end sm:right-4"}`}
    >
      {panel}
      {tab}
    </div>
  );
}
