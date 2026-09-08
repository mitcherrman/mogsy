/**
 * THE ACADEMY BULLETIN — the Commons' large parchment noticeboard, right.
 *
 * Step 4 (Revision 27) turned the single static notice into a slow rotation
 * over the families in `useAcademyBulletin`. Everything about WHAT it may say
 * lives there; this file is the sheet it is pinned to and the way a reader
 * moves between pinned sheets.
 *
 * ### The geometry came first, and it is fixed
 * The painted board is 0.2440 x 0.2440 of the artwork — about 339 x 191 CSS
 * pixels at 1024x781, the tightest gated viewport. Revision 26 froze that box.
 * So the navigation had to cost no height at all:
 *
 *   * **Prev/next are on the paper's left and right margins**, vertically
 *     centred, outside the text column. They take horizontal space the copy
 *     was not using and add nothing to the stack.
 *   * **The position indicator shares the CTA's row.** The CTA is ~158px in a
 *     ~287px column, so the dots sit in the space beside it. Also free.
 *   * **Title and body are clamped** to two and three lines. A long question
 *     from the live bank cannot push the CTA off the sheet — the clamp is the
 *     guarantee that every family fits the box without measuring each one.
 *
 * There is deliberately no dedicated navigation row. A row would have cost
 * ~30px of a 191px board, which is a line of body copy on every card forever.
 *
 * ### Rotation is slow, and it yields to the reader
 * Twelve seconds — long enough to read a short notice, far too slow to be a
 * slideshow. It stops entirely on hover, on focus within the board, while the
 * tab is hidden, while the Commons is not the room on screen, and permanently
 * the moment the reader presses prev or next. Taking manual control is a
 * statement that they are reading, so autoplay does not take it back.
 *
 * Under reduced motion — the OS query or the app's own `html.reduce-motion` —
 * autoplay does not run at all and the crossfade is dropped. Manual navigation
 * still works, which is the point: the reader keeps every capability and loses
 * only the movement.
 *
 * The transition is a crossfade, never a horizontal slide. Paper pinned to a
 * board does not slide sideways.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAcademyBulletin, type BulletinNotice } from "@/components/lol/useAcademyBulletin";

/** Long enough to read a short notice; far too slow to read as a slideshow. */
const ROTATE_MS = 12000;

/**
 * True when EITHER motion preference is set: the OS-level media query or the
 * app's own accessibility setting. Same rule `LolHub` applies to its scrolling
 * — one preference, honoured identically wherever the hub moves anything.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    document.documentElement.classList.contains("reduce-motion")
  );
}

/**
 * Is the Commons the room actually on screen? `hub-commons-in-view` is set by
 * `LolHub`'s existing settle observer — reusing it costs nothing and adds no
 * second observer. Outside the hub (a test, a future embed) the hub class is
 * absent and this answers true, because there is no reason to believe
 * otherwise.
 */
function commonsOnScreen(): boolean {
  if (typeof document === "undefined") return true;
  const root = document.documentElement;
  if (!root.classList.contains("hub-two-screen")) return true;
  return root.classList.contains("hub-commons-in-view");
}

export interface AcademyBulletinProps {
  /**
   * Pin the board to one notice by id, for a deterministic screenshot or a
   * test. Internal only: nothing in the product renders a control that sets
   * it, and an id that is not on the board today is ignored rather than
   * blanking it. An unknown id falling back to the first notice is what keeps
   * a stale marketing script from producing an empty board.
   */
  initialNoticeId?: string;
  /** Off for deterministic capture. Production leaves it on. */
  autoRotate?: boolean;
  /**
   * Override the day rotation that chooses the quiz subject and the study
   * table. Same purpose as `initialNoticeId`: a test or a capture needs the
   * same board twice. Production never passes it.
   */
  daySeed?: number;
}

export default function AcademyBulletin({
  initialNoticeId,
  autoRotate = true,
  daySeed,
}: AcademyBulletinProps = {}) {
  const { user } = useAuth();
  const isIdentified = !!user?.id && !(user as { is_anonymous?: boolean }).is_anonymous;
  const notices = useAcademyBulletin({ isIdentified, userId: user?.id ?? null, daySeed });

  const [index, setIndex] = useState(0);
  /** Set once the reader drives the board themselves. Never unset. */
  const [readerDriving, setReaderDriving] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduced = useMemo(prefersReducedMotion, []);

  // The pin is DERIVED, never latched into state. The board grows as its
  // families answer — the Pro Play invitation is there on the first render and
  // the quiz and mechanics notices arrive ahead of it moments later — so an
  // index captured once is an index pointing at the wrong notice a tick later.
  // Resolving the id on every render is both simpler and always correct.
  // An id the board does not carry resolves to -1 and the board behaves
  // normally, which is what stops a stale marketing script blanking it.
  const pinnedIndex = initialNoticeId
    ? notices.findIndex((n) => n.id === initialNoticeId)
    : -1;
  const isPinned = pinnedIndex >= 0;

  // A shrinking board must never leave the pointer past the end.
  useEffect(() => {
    setIndex((i) => (i < notices.length ? i : 0));
  }, [notices.length]);

  const count = notices.length;
  const go = useCallback(
    (delta: number) => {
      setReaderDriving(true);
      setIndex((i) => (count ? (i + delta + count) % count : 0));
    },
    [count],
  );

  // ---- rotation --------------------------------------------------------
  // Deliberately an interval that CHECKS rather than a chain of listeners:
  // the two "is it sensible to advance right now" questions (tab hidden, room
  // off screen) are cheap reads, and asking them on the tick is far less
  // machinery than subscribing to both.
  const rotating =
    autoRotate && !reduced && !paused && !readerDriving && count > 1 && !isPinned;
  useEffect(() => {
    if (!rotating) return;
    const id = window.setInterval(() => {
      if (document.hidden || !commonsOnScreen()) return;
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotating, count]);

  const shownIndex = isPinned ? pinnedIndex : index;
  const notice: BulletinNotice | undefined = notices[shownIndex];
  if (!notice) return null;

  return (
    <section
      data-testid="academy-bulletin"
      data-bulletin-notice={notice.id}
      data-bulletin-kind={notice.kind}
      data-bulletin-count={count}
      data-bulletin-index={shownIndex}
      data-bulletin-rotating={rotating ? "true" : "false"}
      aria-labelledby="academy-bulletin-heading"
      aria-roledescription="noticeboard"
      className="academy-commons-board academy-commons-bulletin relative flex min-w-0 flex-col justify-center rounded-[3px] border-4 border-solid p-4 sm:p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        // Only when focus has actually left the board, not on every hop
        // between the two arrows and the CTA.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {/* The pinned sheet. Auto-height and centred so real planking still shows
          all round in flow mode; under half a degree of rotation, so no line of
          type is measurably off the horizontal. Stage mode drops both — the
          painting supplies the paper and the pins. */}
      <div /* No Tailwind px-* here: the inline padding is the arrows' clearance and
            index.css owns it, in rem for flow and in `--u` inside the stage
            gate. A utility class would out-order the rule and put the chevrons
            back on the copy. */
        className="academy-commons-notice academy-commons-bill academy-commons-bulletin-bill relative flex flex-col rounded-[2px] py-5 [transform:rotate(-0.45deg)]">
        <span
          aria-hidden
          className="academy-commons-pin absolute left-4 top-2.5 h-2.5 w-2.5 rounded-full"
        />
        <span
          aria-hidden
          className="academy-commons-pin absolute right-4 top-2.5 h-2.5 w-2.5 rounded-full"
        />

        {/* ---- the notice ------------------------------------------------
            Keyed on the notice id so the crossfade actually re-runs.

            Deliberately NOT a live region. The board advances on its own, and
            an `aria-live` here would interrupt a screen-reader user every
            twelve seconds with a notice they did not ask for — the standard
            failure mode of an announced carousel. The section is labelled and
            both controls are labelled, so a reader can go to the board and
            move through it on purpose; nothing shouts at them from across the
            page. The hub asserts it carries no live region at all. */}
        <div
          key={notice.id}
          data-testid="academy-bulletin-notice"
          className={`academy-commons-bulletin-body relative flex min-w-0 flex-col ${
            reduced ? "" : "academy-commons-bulletin-enter"
          }`}
        >
          <span className="academy-commons-notice-soft academy-commons-bill-eyebrow text-[10px] font-bold uppercase tracking-[0.28em]">
            {notice.eyebrow}
          </span>
          <h2
            id="academy-bulletin-heading"
            data-testid="academy-bulletin-title"
            className="academy-commons-notice-ink academy-commons-bill-title academy-commons-bulletin-title mt-1 text-[1.35rem] font-medium leading-tight sm:text-2xl"
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            {notice.title}
          </h2>
          <p className="academy-commons-notice-soft academy-commons-bill-blurb academy-commons-bulletin-blurb mt-2 max-w-sm text-[13px] leading-relaxed">
            {notice.body}
          </p>
          {notice.meta ? (
            <p
              data-testid="academy-bulletin-meta"
              className="academy-commons-notice-soft academy-commons-bulletin-meta mt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.16em] opacity-80"
            >
              {notice.meta}
            </p>
          ) : null}
        </div>

        {/* ---- the foot: one action, and where you are on the board ------ */}
        <div className="academy-commons-bill-actions academy-commons-bulletin-foot flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
          <Link
            to={notice.ctaTo}
            data-testid="academy-bulletin-cta"
            className="academy-commons-bill-cta inline-flex min-h-[52px] items-center gap-3 rounded-[3px] bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-5 py-3 text-[15px] font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {notice.ctaLabel}
            <ArrowRight className="h-4 w-4 opacity-70" aria-hidden />
          </Link>

          {count > 1 ? (
            <span
              data-testid="academy-bulletin-dots"
              className="academy-commons-bulletin-dots flex items-center gap-1.5"
              aria-hidden
            >
              {notices.map((n, i) => (
                <span
                  key={n.id}
                  className={`academy-commons-bulletin-dot h-1.5 w-1.5 rounded-full ${
                    i === shownIndex ? "is-current" : ""
                  }`}
                />
              ))}
            </span>
          ) : null}
        </div>

        {/* ---- prev / next, on the paper's own margins -------------------
            Struck into the sheet rather than plated onto it: no fill, no
            border, ink that darkens on hover. They sit outside the text column
            and cost the stack no height, which is the only way navigation fits
            a board this size. A single-notice board has nothing to move
            between, so they are absent rather than disabled. */}
        {count > 1 ? (
          <>
            <button
              type="button"
              data-testid="academy-bulletin-prev"
              aria-label="Previous notice"
              onClick={() => go(-1)}
              className="academy-commons-bulletin-nav academy-commons-bulletin-nav-prev absolute top-1/2 flex h-9 w-7 -translate-y-1/2 items-center justify-center rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              data-testid="academy-bulletin-next"
              aria-label="Next notice"
              onClick={() => go(1)}
              className="academy-commons-bulletin-nav academy-commons-bulletin-nav-next absolute top-1/2 flex h-9 w-7 -translate-y-1/2 items-center justify-center rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230]"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
