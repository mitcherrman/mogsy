/**
 * MALT/PRAC1 — the Leaguecraft category rail.
 *
 * The full-width horizontal band of the six subjects Leaguecraft studies,
 * spanning the whole composition directly beneath the three parchment scrolls.
 * It is the seam of the page: the last thing in the Ranked lobby and the first
 * thing in the study/history workspace below it.
 *
 * WHY IT IS A RAIL AND NOT A STRIP IN A PANEL
 * ───────────────────────────────────────────
 * The same six icons used to sit at the head of the "Practice for Ranked"
 * panel — five of twelve columns wide, folded into two rows of three, and
 * below the fold on every desktop. That made the subject matter of the whole
 * product a decoration inside one of the page's quietest boxes. Promoted to a
 * rail it does three things the strip could not: it names the six subjects at
 * the width they actually apply to, it gives the first viewport a bottom edge
 * to stop on, and it is where per-category practice navigation lives.
 *
 * IT IS NOW A MENU — PRAC1
 * ────────────────────────
 * `onSelectCategory` was built as the whole future interaction and nothing
 * passed it. It is passed now: the rail IS the Practice category chooser, and
 * the "Practice for Ranked" panel it replaced stays withheld. Five of the six
 * tiles open a real Practice session drawn from that subject's live question
 * categories — see `@/lib/quiz/practiceCategories` for which rows each one
 * opens and why. There is no intermediate chooser page: a tile press starts
 * the session on the spot, in the Practice runner `/quiz` already hosts.
 *
 * Without the prop each cell still renders as an inert `<li>`, unchanged, so
 * a host that has no way to start practice cannot advertise a door.
 *
 * VISION IS VISIBLY UNAVAILABLE, NOT QUIETLY BROKEN
 * ─────────────────────────────────────────────────
 * No question on the live bank resolves to Vision, so its tile is rendered
 * with `aria-disabled`, a dimmed plate, no pointer cursor and a "Coming soon"
 * note on hover and on focus. It is still a FOCUS STOP on purpose: a keyboard
 * reader tabbing the rail must be able to discover that the subject exists and
 * that it is not ready, which a removed tab stop would hide. Activating it
 * does nothing at all — no navigation, no fetch, no placeholder session.
 *
 * NO COUNTS, EVER — unchanged. Per-category strength is not on the wire, and
 * the standing temptation on this page is to fill a quiet space with a
 * plausible number. See `QuizCategoryStrip`, which still owns the six
 * definitions and the art (including which two icons are stand-ins and why).
 *
 * ACCESSIBILITY
 * ─────────────
 * The art is decorative — every category is named in text as well, with the
 * full subject name carried for assistive tech when the visible label is the
 * short word. Ordered list semantics, so a screen reader hears "6 items".
 * `focusCategoryId` puts focus back on the tile a session was started from
 * when the runner hands the page back, so returning from Practice lands on the
 * control that opened it rather than at the top of the document.
 */
import { useEffect, useRef } from "react";
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
      {/* The icon is the signal. Framed as a square plate in the rail's own
          brass rather than floated bare: League icons are already square, and
          an unframed one on a translucent wash reads as a stray sprite.
          On an actionable tile the plate is what LIFTS on hover and focus —
          the shelf's one moving part, so the row reads as a set of controls
          without any of them growing furniture it does not need. */}
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-[#04101c]/70 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.9)] transition-[transform,border-color,box-shadow] duration-150 sm:h-11 sm:w-11 ${
          dimmed
            ? "border-[#c9a84c]/15 opacity-45 grayscale"
            : "border-[#c9a84c]/30 group-hover:-translate-y-0.5 group-hover:border-[#e2c877]/60 group-hover:shadow-[0_10px_20px_-12px_rgba(226,200,119,0.55)] group-focus-visible:-translate-y-0.5 group-focus-visible:border-[#e2c877]/60"
        }`}
      >
        {src && (
          <img
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
      </span>
      {/* The label goes BESIDE the icon only from `lg`, where a cell is ~200px
          and a stacked one would be mostly air. Between `sm` and `lg` six
          cells share a tablet's width — about 120px each — and the pair does
          not fit on one line: the word runs straight under the next tile's
          icon. So the cell stacks there and turns horizontal only once the
          rack itself is horizontal. `truncate` is the floor under both cases;
          the full subject name is carried for assistive tech whenever it
          differs from the printed word, so the rail is never icon-only to a
          reader who cannot see the art. */}
      <span
        className={`w-full min-w-0 truncate text-center text-[10px] font-bold uppercase leading-tight tracking-[0.12em] transition-colors sm:text-[11px] lg:w-auto lg:text-left ${
          dimmed
            ? "text-[#e2c877]/40"
            : "text-[#e2c877]/85 group-hover:text-[#f5e3a6] group-focus-visible:text-[#f5e3a6]"
        }`}
      >
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{full}</span>
      </span>
    </>
  );
}

/** Shared between the actionable and the unavailable tile so the two differ
 *  only in the states they light up, never in their box. */
const CELL =
  "group relative flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-row lg:gap-2.5 lg:px-1.5";

export default function QuizCategoryRail({
  className = "",
  onSelectCategory,
  focusCategoryId = null,
}: {
  className?: string;
  /**
   * Turns every cell into a real button and the rail into the Practice
   * chooser. Receives the category `id` (`objectives`, `wave-management`, …),
   * never the label. Vision never calls it — it has no content to open.
   */
  onSelectCategory?: (categoryId: string) => void;
  /**
   * Put focus back on this tile once, on mount. The host passes the category a
   * Practice session was started from, so the page hands focus back to the
   * control the player left rather than to the top of the document.
   */
  focusCategoryId?: string | null;
}) {
  const interactive = typeof onSelectCategory === "function";
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!interactive || !focusCategoryId) return;
    const el = tileRefs.current.get(focusCategoryId);
    if (!el) return;
    el.focus({ preventScroll: true });
    // `nearest`, not `center`. The rail sits at the FOOT of the first
    // viewport, so on a normal desktop it is already on screen when the page
    // remounts and the correct amount of scrolling is none — centring it there
    // hauled the whole parchment rack off the top of the window to put a 44px
    // tile in the middle. On a short screen, where the rail really is below
    // the fold, `nearest` still brings it just into view.
    el.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [interactive, focusCategoryId]);

  return (
    <nav
      data-testid="quiz-category-rail"
      aria-label={interactive ? "Practice by subject" : "Leaguecraft subjects"}
      /* The rail's own plate. Denser than the lobby's panel wash on purpose:
         it is the seam between the parchment rack and the workspace beneath,
         and — when the host makes it sticky — it is what the lower page
         scrolls UNDER, so it has to stay opaque enough to hide what passes
         behind it. Brass hairlines top and bottom rather than a full border:
         a rail is two edges and a run, not a box. */
      className={`relative w-full overflow-hidden rounded-lg border-y border-[#c9a84c]/28 bg-[linear-gradient(180deg,rgba(8,17,33,0.94)_0%,rgba(4,11,22,0.88)_55%,rgba(7,15,29,0.94)_100%)] px-2 py-2 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(240,215,140,0.10)] backdrop-blur-[6px] sm:px-3 ${className}`}
    >
      {/* Six equal cells at every width the rack exists at. Below `sm` the
          rail folds to two rows of three rather than shrinking six cells past
          the point where the art is the signal — a single scrolling row was
          rejected, because horizontal overflow hides categories behind a
          gesture. Unlike the old strip this count follows the SCREEN, because
          the rail is always the full composition's width. */}
      <ul
        className="grid grid-cols-3 gap-x-1 gap-y-1.5 sm:grid-cols-6 sm:gap-x-1.5"
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
              className="min-w-0"
            >
              {interactive ? (
                <button
                  type="button"
                  ref={(el) => {
                    if (el) tileRefs.current.set(category.id, el);
                    else tileRefs.current.delete(category.id);
                  }}
                  /* An unavailable subject stays a FOCUS STOP and stops being
                     an action: `aria-disabled` rather than `disabled`, so a
                     keyboard reader can still find out that Vision exists and
                     is not ready. The handler is the gate — activation by
                     mouse, Enter or Space all land here and all do nothing. */
                  aria-disabled={available ? undefined : true}
                  onClick={() => {
                    if (!available) return;
                    onSelectCategory!(category.id);
                  }}
                  className={`${CELL} ${
                    actionable
                      ? "cursor-pointer hover:border-[#c9a84c]/35 hover:bg-[#c9a84c]/10 active:bg-[#c9a84c]/16"
                      : "cursor-default"
                  }`}
                >
                  {inner}
                  {!available && (
                    <>
                      {/* Revealed on hover and on keyboard focus only, and
                          absolutely positioned so revealing it cannot move
                          the rail's height by a pixel. */}
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
    </nav>
  );
}
