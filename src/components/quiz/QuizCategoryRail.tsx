/**
 * MALT — the Leaguecraft category rail.
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
 * to stop on, and it is where per-category practice navigation will live.
 *
 * The tiles are LAID OUT as doors already — one full-height cell each, one
 * focus ring's worth of padding, an icon plate and a label — so the day the
 * question bank can answer "give me Objectives" the only change is a handler.
 *
 * IT IS NOT A MENU YET, AND THAT IS STILL DELIBERATE
 * ──────────────────────────────────────────────────
 * `onSelectCategory` is the whole future interaction and nothing passes it
 * today. Practice is still entered by SET, and the live question bank does not
 * carry a category for every subject named here — three of the six have no
 * questions at all — so a clickable tile would open the wrong thing or open
 * nothing. Without the prop each cell renders as an inert `<li>`; with it,
 * each cell renders as a real `<button>`. One prop, one call site, no rewrite.
 *
 * NO COUNTS, EVER — unchanged from the strip. Per-category strength is not on
 * the wire, and the standing temptation on this page is to fill a quiet space
 * with a plausible number. See `QuizCategoryStrip`, which still owns the six
 * definitions and the art (including which two icons are stand-ins and why).
 *
 * ACCESSIBILITY
 * ─────────────
 * The art is decorative — every category is named in text as well, with the
 * full subject name carried for assistive tech when the visible label is the
 * short word. Ordered list semantics, so a screen reader hears "6 items".
 */
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { QUIZ_CATEGORY_ICONS } from "@/components/quiz/QuizCategoryStrip";

/** The cell's inner furniture — identical in both the inert and the future
 *  interactive branch, so the two can never drift apart visually. */
function RailTileContent({
  label,
  full,
  iconPath,
}: {
  label: string;
  full: string;
  iconPath: string;
}) {
  const src = resolveQuizAssetUrl(iconPath);
  return (
    <>
      {/* The icon is the signal. Framed as a square plate in the rail's own
          brass rather than floated bare: League icons are already square, and
          an unframed one on a translucent wash reads as a stray sprite. */}
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#c9a84c]/30 bg-[#04101c]/70 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.9)] sm:h-11 sm:w-11"
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
      <span className="w-full min-w-0 truncate text-center text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-[#e2c877]/85 sm:text-[11px] lg:w-auto lg:text-left">
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{full}</span>
      </span>
    </>
  );
}

export default function QuizCategoryRail({
  className = "",
  onSelectCategory,
}: {
  className?: string;
  /**
   * FUTURE. Turns every cell into a real button. Deliberately unpassed today —
   * see the note at the head of this file. When it arrives it receives the
   * category `id` (`objectives`, `wave-management`, …), not the label.
   */
  onSelectCategory?: (categoryId: string) => void;
}) {
  const interactive = typeof onSelectCategory === "function";

  return (
    <nav
      data-testid="quiz-category-rail"
      aria-label="Leaguecraft subjects"
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
          const inner = (
            <RailTileContent
              label={category.label}
              full={category.full}
              iconPath={category.iconPath}
            />
          );
          return (
            <li
              key={category.id}
              data-testid="quiz-category-rail-tile"
              data-category={category.id}
              title={category.full}
              className="min-w-0"
            >
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onSelectCategory!(category.id)}
                  className="flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1 py-1 transition-colors hover:border-[#c9a84c]/30 hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-row lg:gap-2.5 lg:px-1.5"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex w-full min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 lg:flex-row lg:gap-2.5 lg:px-1.5">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
