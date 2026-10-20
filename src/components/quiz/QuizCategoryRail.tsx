/**
 * MALT/PRAC1/PM1 — the Leaguecraft category rail: QUICK STUDY.
 *
 * The full-width band of the six subjects Leaguecraft studies, directly
 * beneath the three parchment scrolls. It is the seam of the page — the last
 * thing in the first screen and the first thing in the study area below it —
 * and it is Leaguecraft's Practice chooser: a tile press starts a ten-question
 * Practice session for that subject on the spot, in the runner `/quiz`
 * already hosts. There is no intermediate chooser page.
 *
 * PM1 — THE ACADEMY TREATMENT
 * ───────────────────────────
 * The rail used to be six small icons on a translucent wash under a separate
 * heading row. It is now one ACADEMY PLATE: the same navy-and-brass the Ranked
 * arena's panels wear, with the Quick Study title folded INTO the plate's
 * leading edge from `xl` (a heading row above it cost a line of the first
 * screen's height budget — see the note at the hub's first-screen wrapper,
 * where 1280x800 leaves almost nothing), and six tiles that read as controls:
 *
 *   - each icon sits in a gilded double frame (a brass ring around a dark
 *     well), the real League art filling the well;
 *   - the tile is its own card with a hairline border, so the row reads as a
 *     set of six doors rather than a strip of sprites;
 *   - hover lifts the tile and lights its frame; keyboard focus draws a gold
 *     ring; pressing settles it back down and darkens it. Reduced motion
 *     keeps the light and drops the movement.
 *
 * Six equal cells at every width. Below `sm` they fold to two rows of three
 * rather than shrinking past the point where the art is the signal; a single
 * scrolling row was rejected, because horizontal overflow hides categories
 * behind a gesture.
 *
 * Without `onSelectCategory` each cell still renders as an inert `<li>`, so a
 * host that has no way to start practice cannot advertise a door.
 *
 * NO COUNTS, EVER — unchanged. Per-category strength is not on the wire, and
 * the standing temptation on this page is to fill a quiet space with a
 * plausible number. See `QuizCategoryStrip`, which still owns the six
 * definitions and the art.
 *
 * ACCESSIBILITY
 * ─────────────
 * The art is decorative — every category is named in text as well, with the
 * full subject name carried for assistive tech when the visible label is the
 * short word. Ordered list semantics, so a screen reader hears "6 items".
 * `focusCategoryId` puts focus back on the tile a session was started from
 * when the runner hands the page back.
 */
import { useEffect, useRef } from "react";
import { GraduationCap } from "lucide-react";
import {
  QUIZ_CATEGORY_ICONS,
  resolveCategoryIconUrl,
} from "@/components/quiz/QuizCategoryStrip";
import { isPracticeCategoryAvailable } from "@/lib/quiz/practiceCategories";

/** The cell's inner furniture — identical in every branch, so the inert, the
 *  actionable and the unavailable tile can never drift apart visually. */
function RailTileContent({
  label,
  full,
  iconPath,
  dimmed = false,
}: {
  label: string;
  full: string;
  iconPath: string;
  dimmed?: boolean;
}) {
  const src = resolveCategoryIconUrl(iconPath);
  return (
    <>
      {/* The gilded frame: a brass ring (the outer span's gradient, 2px of
          padding) around a dark well holding the art. The ring is what lights
          on hover and focus. */}
      <span
        aria-hidden="true"
        data-rail-frame
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] p-[2px] transition-[box-shadow,filter] duration-150 sm:h-12 sm:w-12 lg:h-10 lg:w-10 xl:h-12 xl:w-12 ${
          dimmed
            ? "opacity-45 grayscale"
            : "shadow-[0_6px_14px_-8px_rgba(0,0,0,0.95)] group-hover:shadow-[0_0_0_1px_rgba(240,215,140,0.25),0_0_18px_-2px_rgba(226,200,119,0.55)] group-focus-visible:shadow-[0_0_0_1px_rgba(240,215,140,0.25),0_0_18px_-2px_rgba(226,200,119,0.55)] group-active:brightness-90"
        }`}
        style={{ background: "linear-gradient(150deg, #f3dc94 0%, #c9a84c 38%, #6c5020 72%, #b8913f 100%)" }}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-[8px] bg-[#04101c] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.75),inset_0_0_10px_rgba(0,0,0,0.6)]">
          {src && (
            <img
              src={src}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
          )}
        </span>
      </span>
      {/* Beside the icon from `lg`, where a cell is wide enough; stacked under
          it between, where six cells share a tablet's width. Never truncated
          past one short word — the full subject name is carried for assistive
          tech whenever it differs from the printed word. */}
      <span className="flex w-full min-w-0 flex-col items-center lg:w-auto lg:items-start">
        <span
          className={`ranked-title w-full min-w-0 truncate text-center text-[10.5px] font-bold uppercase leading-tight tracking-[0.1em] transition-colors sm:text-[11.5px] lg:text-left ${
            dimmed
              ? "!text-[#e2c877]/40"
              : "!text-[#ead9a6] group-hover:!text-[#fff1c4] group-focus-visible:!text-[#fff1c4]"
          }`}
        >
          <span aria-hidden="true">{label}</span>
          <span className="sr-only">{full}</span>
        </span>
        {/* The full name as a quiet second line, only where there is room for
            it and only where it says more than the label. Decorative to
            assistive tech: the sr-only name above already carries it. */}
        {full !== label && (
          <span aria-hidden="true" className="hidden max-w-full truncate text-[10px] leading-tight text-[#9fb2c8]/70 min-[1500px]:block">
            {full}
          </span>
        )}
      </span>
    </>
  );
}

/** Shared between the actionable and the unavailable tile so the two differ
 *  only in the states they light up, never in their box. */
const CELL =
  "group relative flex w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-[#c9a84c]/15 bg-[linear-gradient(180deg,rgba(18,32,54,0.55)_0%,rgba(6,14,27,0.55)_100%)] px-1 py-1.5 lg:py-1 xl:py-1.5 transition-[transform,border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050c18] motion-reduce:transition-none lg:flex-row lg:justify-start lg:gap-2.5 lg:px-2";

export interface QuizCategoryRailHeading {
  id: string;
  title: string;
  hint: string;
}

export default function QuizCategoryRail({
  className = "",
  onSelectCategory,
  focusCategoryId = null,
  heading = null,
}: {
  className?: string;
  /**
   * Turns every cell into a real button and the rail into the Practice
   * chooser. Receives the category `id` (`objectives`, `wave-management`, …),
   * never the label.
   */
  onSelectCategory?: (categoryId: string) => void;
  /**
   * Put focus back on this tile once, on mount. The host passes the category a
   * Practice session was started from, so the page hands focus back to the
   * control the player left rather than to the top of the document.
   */
  focusCategoryId?: string | null;
  /**
   * PM1 — the section's title, drawn INSIDE the plate (its leading edge from
   * `xl`, its top row below). The host's section is labelled by `heading.id`.
   */
  heading?: QuizCategoryRailHeading | null;
}) {
  const interactive = typeof onSelectCategory === "function";
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!interactive || !focusCategoryId) return;
    const el = tileRefs.current.get(focusCategoryId);
    if (!el) return;
    el.focus({ preventScroll: true });
    // `nearest`, not `center`: the rail sits at the FOOT of the first
    // viewport, so on a normal desktop the right amount of scrolling is none.
    el.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [interactive, focusCategoryId]);

  return (
    <nav
      data-testid="quiz-category-rail"
      aria-label={interactive ? "Practice by subject" : "Leaguecraft subjects"}
      /* The Academy plate. Opaque enough to read as a surface over the
         classroom art, with a brass hairline along the top (the first span
         inside) and a cool corner glow — the same navy the arena's panels
         wear, so Practice's door and Practice itself look like one place. */
      className={`relative w-full overflow-hidden rounded-xl border border-[#c9a84c]/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(80,170,220,0.10)_0%,transparent_45%),linear-gradient(180deg,rgba(9,19,36,0.95)_0%,rgba(4,11,22,0.92)_60%,rgba(7,15,29,0.95)_100%)] p-2 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(240,215,140,0.14)] backdrop-blur-[6px] sm:p-2.5 lg:p-2 xl:p-2.5 ${className}`}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#f0d78c]/60 to-transparent" />
      <div className={heading ? "flex flex-col gap-1.5 xl:flex-row xl:items-stretch xl:gap-3" : undefined}>
        {heading && (
          <div className="flex items-baseline justify-between gap-2 px-1 xl:w-[10.5rem] xl:shrink-0 xl:flex-col xl:items-start xl:justify-center xl:gap-1 xl:border-r xl:border-[#c9a84c]/20 xl:pr-3 min-[1500px]:w-[11.5rem]">
            <h2 id={heading.id} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#f0d78c]">
              <GraduationCap className="h-3.5 w-3.5 text-[#e2c877]" aria-hidden="true" />
              {heading.title}
            </h2>
            <p className="text-right text-[10px] leading-snug text-[#9fb2c8] xl:text-left xl:text-[11px]">{heading.hint}</p>
          </div>
        )}
        <ul
          className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:grid-cols-6"
          data-interactive={interactive ? "true" : undefined}
        >
          {QUIZ_CATEGORY_ICONS.map((category) => {
            const available = isPracticeCategoryAvailable(category.id);
            const actionable = interactive && available;
            const inner = (
              <RailTileContent
                label={category.label}
                full={category.full}
                iconPath={category.iconPath}
                dimmed={interactive && !available}
              />
            );
            return (
              <li
                key={category.id}
                data-testid="quiz-category-rail-tile"
                data-category={category.id}
                data-available={interactive ? String(available) : undefined}
                title={
                  interactive && !available
                    ? `${category.full} — coming soon`
                    : category.full
                }
                className="flex min-w-0"
              >
                {interactive ? (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) tileRefs.current.set(category.id, el);
                      else tileRefs.current.delete(category.id);
                    }}
                    /* An unavailable future subject stays a focus stop with
                       aria-disabled, so a keyboard reader can still find it. */
                    aria-disabled={available ? undefined : true}
                    onClick={() => {
                      if (!available) return;
                      onSelectCategory!(category.id);
                    }}
                    className={`${CELL} ${
                      actionable
                        ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#e2c877]/55 hover:bg-[#c9a84c]/[0.08] hover:shadow-[0_12px_22px_-14px_rgba(226,200,119,0.6)] focus-visible:border-[#e2c877]/60 active:translate-y-0 active:scale-[0.98] active:border-[#c9a84c]/40 active:bg-[#020812]/60 active:shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                        : "cursor-default"
                    }`}
                  >
                    {inner}
                    {!available && (
                      <>
                        {/* Revealed on hover and keyboard focus only, and
                            absolutely positioned so it cannot move the rail. */}
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto w-fit max-w-full truncate rounded-sm border border-[#c9a84c]/30 bg-[#04101c]/95 px-1 py-[1px] text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#e2c877]/80 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                        >
                          Coming soon
                        </span>
                        <span className="sr-only">Coming soon</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className={CELL}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
