/**
 * MALT — the quiz category strip on the Leaguecraft hub.
 *
 * A compact, mostly-ICON overview of the subjects Leaguecraft studies, sitting
 * at the head of the "Practice for Ranked" panel: six real League icons, one
 * short word under each, and nothing else.
 *
 * IT IS AN OVERVIEW, NOT A MENU
 * ─────────────────────────────
 * Nothing here is a button, a link or a filter, and that is a decision rather
 * than an omission. The product has no per-category entry point — practice is
 * entered by SET, which is the panel directly beneath this — and the live
 * question bank does not carry a category for every subject named here. A
 * clickable tile would therefore have to either open the wrong thing or open
 * nothing, and a category that opens nothing is worse than a category that
 * plainly never claimed to be a door. So this states what the subject matter
 * IS, at a glance, and the panel below it stays the only way in.
 *
 * NO COUNTS, EVER
 * ───────────────
 * There are deliberately no question counts, no coverage percentages and no
 * "mastered" marks on these tiles. Per-category strength is not something this
 * surface has on the wire, and the standing temptation on this page is to fill
 * a quiet space with a plausible number. If a real per-category figure ever
 * arrives, it gets added with its scope stated — not inferred here.
 *
 * ART
 * ───
 * Every icon is real League art off the backend's own `/assets` mount, so the
 * strip is anchored in the game rather than drawn in line icons. Two of the
 * six are stand-ins and are marked as such below: the asset library holds no
 * Baron, Dragon or minion art at all, so Objectives and Wave Management borrow
 * the nearest TRUE icon for their subject rather than inventing one.
 *
 * ACCESSIBILITY
 * ─────────────
 * The visible label is one short word so the strip stays mostly-icon, and each
 * item also carries its full category name for assistive tech. The art itself
 * is decorative: no category is ever communicated by picture alone.
 */
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

interface QuizCategoryIcon {
  /** Stable key — also the `data-category` hook. */
  id: string;
  /** The short word printed under the icon. Kept to one word on purpose. */
  label: string;
  /** The full category name, for assistive tech and for the hover title. */
  full: string;
  /** Backend-relative art path, resolved through the shared `/assets` mount. */
  iconPath: string;
}

/**
 * The six subjects, in the order a player meets them in a game: what you are
 * fighting over, the lane in front of you, the spells on your bars, what you
 * buy with the gold, and what you can see.
 */
export const QUIZ_CATEGORY_ICONS: readonly QuizCategoryIcon[] = [
  {
    id: "objectives",
    label: "Objectives",
    full: "Objectives",
    /* STAND-IN. There is no Baron or Dragon art anywhere in the asset
       library. Eye of the Herald is the closest thing to it that genuinely
       exists — a real neutral-objective icon — and it is a truthful picture
       of an objective rather than an invented one. Swap this the day the
       monster art lands; nothing else has to change. */
    iconPath: "assets/items/3513.png",
  },
  {
    id: "wave-management",
    label: "Waves",
    full: "Wave Management",
    /* STAND-IN, same reason: no minion art exists. Minion Dematerializer is
       real art that depicts a minion, which is the subject being named. */
    iconPath: "assets/items/2403.png",
  },
  {
    id: "summoner-spells",
    label: "Summoners",
    full: "Summoner Spells",
    iconPath: "assets/summoner_spells/Flash.png",
  },
  {
    id: "itemization",
    label: "Items",
    full: "Itemization",
    iconPath: "assets/items/3031.png",
  },
  {
    id: "abilities",
    label: "Abilities",
    full: "Abilities & Cooldowns",
    iconPath: "assets/champions/Lux/R_LuxR.png",
  },
  {
    id: "vision",
    label: "Vision",
    full: "Vision",
    iconPath: "assets/items/3340.png",
  },
];

export default function QuizCategoryStrip({ className = "" }: { className?: string }) {
  return (
    <section
      data-testid="quiz-category-strip"
      aria-label="What Leaguecraft studies"
      className={className}
    >
      {/* The count follows the PANEL's width, not the screen's. Between `sm`
          and `lg` the hub's second row is one column, so this panel is the
          full page width and all six fit on one line — which is what a strip
          should be. At `lg` the row splits and the panel narrows to five of
          twelve, so it folds back to two rows of three rather than shrinking
          six icons past the point where the art is the signal. Below `sm`
          three is simply all that fits. A single scrolling row was rejected:
          horizontal overflow hides categories behind a gesture. */}
      <ul className="grid grid-cols-3 gap-x-1 gap-y-2 sm:grid-cols-6 lg:grid-cols-3">
        {QUIZ_CATEGORY_ICONS.map((category) => {
          const src = resolveQuizAssetUrl(category.iconPath);
          return (
            <li
              key={category.id}
              data-testid="quiz-category-tile"
              data-category={category.id}
              title={category.full}
              className="flex min-w-0 flex-col items-center gap-1 text-center"
            >
              {/* The icon is the signal, so it gets the size and the label
                  gets whatever is left. Framed as a small square plate in the
                  panel's own brass rather than floated bare: League icons are
                  already square, and an unframed one on a translucent wash
                  reads as a stray sprite. */}
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-[#c9a84c]/25 bg-[#04101c]/55 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.9)] sm:h-10 sm:w-10"
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
              {/* One short word, visible. The full category name is carried
                  for assistive tech so the strip is never icon-only to a
                  reader who cannot see the art. */}
              <span className="w-full truncate text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#e2c877]/75">
                <span aria-hidden="true">{category.label}</span>
                <span className="sr-only">{category.full}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
