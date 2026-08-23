/**
 * The Daily Challenge answer grid (DC1 Phase 5).
 *
 * WHY THIS IS NOT `ranked-arena/AnswerGrid`
 * ─────────────────────────────────────────
 * That grid wraps `QuizAnswerOptions`, whose disabled state is all-or-nothing:
 * a round is open or it is locked. The Daily needs a third state that Ranked
 * has no concept of — an option STRUCK OUT while the rest of the card stays
 * live — because retry-until-correct is the mode's whole shape. Adding a
 * per-option elimination to the shared grid would push a Daily-only idea into
 * the surface every rated match renders, so the elimination lives here and the
 * visual language (outline tablets, letter prefixes, option art, the same
 * spacing) is matched rather than forked.
 *
 * ELIMINATED OPTIONS ARE SHOWN, NOT REMOVED
 * ─────────────────────────────────────────
 * The backend marks rather than deletes them, and for a reason worth keeping:
 * the struck-through option the player actually chose IS the learning
 * affordance, and dropping it from the list would also renumber the letters
 * under everything below it. So an eliminated tablet keeps its position and
 * its letter, goes quiet, and leaves the focus order — `disabled` removes it
 * from tabbing, and `aria-disabled` plus the visually-hidden note tell a
 * screen reader why it is out rather than leaving it silently unreachable.
 *
 * NOTHING HERE KNOWS THE ANSWER. `revealedCorrectIndex` is accepted only from
 * a resolved card, and until one exists the component has no correctness input
 * at all — there is no field to leak and none to mis-render.
 *
 * NO MOUNT ANIMATION, DELIBERATELY
 * ────────────────────────────────
 * The quiz grid this one is modelled on staggers its tablets in with
 * framer-motion. An earlier version of this component did the same and shipped
 * a grid whose tablets were in the DOM, correctly labelled, keyboard-reachable
 * — and stuck at `opacity: 0`, because the enter animation never ran. Every
 * unit test passed: jsdom runs no animations, and `getByRole` / `toBeEnabled`
 * do not ask whether a thing can be SEEN. It was caught by looking at the page.
 *
 * A fade-in is a nicety. An answer grid that can fail closed to invisible is an
 * unplayable game, and it fails silently. So the tablets are painted at full
 * opacity on first render, and the one transition that remains — the fade as an
 * option is struck out — is plain CSS, which cannot strand the player in a
 * state they cannot see.
 */

import { Button } from "@/components/ui/button";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";

export interface DailyAnswerGridProps {
  options: AnswerOptionView[];
  /** Backend indexes already struck out on this card. */
  eliminated: number[];
  /** Positional option art (asset paths), or null when the card has none. */
  optionMedia: (string | null)[] | null;
  disabled: boolean;
  /** Post-resolution ONLY. Never pass this before the card resolves. */
  revealedCorrectIndex: number | null;
  onSelect: (optionIndex: number) => void;
}

function OptionArt({ path }: { path: string | null }) {
  const url = path ? resolveQuizAssetUrl(path) : undefined;
  return (
    // Mounted for every option of a card that has art, resolved or not, so a
    // slow or broken image cannot reflow the grid mid-window.
    <span
      aria-hidden="true"
      data-dc-option-art={path ? "present" : "empty"}
      className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center
                 overflow-hidden rounded-sm bg-black/25 ring-1 ring-white/10"
    >
      {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" />}
    </span>
  );
}

export function DailyAnswerGrid({
  options, eliminated, optionMedia, disabled, revealedCorrectIndex, onSelect,
}: DailyAnswerGridProps) {
  const struck = new Set(eliminated);
  const revealed = revealedCorrectIndex !== null;
  const media = optionMedia && optionMedia.length === options.length ? optionMedia : null;

  return (
    <div
      data-testid="dc-answer-grid"
      data-answers-state={revealed ? "revealed" : disabled ? "locked" : "open"}
      className="grid grid-cols-1 gap-2.5 [@media(max-height:480px)]:gap-2"
    >
      {options.map((option, position) => {
        const isStruck = struck.has(option.index);
        const isCorrect = revealed && option.index === revealedCorrectIndex;
        // An eliminated option is never interactive again; a revealed card is
        // over for everybody. Both are `disabled`, which is what keeps them
        // out of the tab order.
        const interactive = !disabled && !isStruck && !revealed;

        const state = isCorrect ? "correct" : isStruck ? "eliminated" : "idle";
        const variant = isCorrect ? "default" : "outline";

        return (
          <div
            key={option.id}
            // Opacity is a function of STATE, never of a mount lifecycle, so a
            // freshly rendered option is visible in the frame it appears in.
            className={`transition-opacity duration-300 motion-reduce:transition-none ${
              isStruck ? "opacity-60" : "opacity-100"}`}
          >
            <Button
              variant={variant}
              type="button"
              data-dc-choice={option.index}
              data-choice-state={state}
              aria-disabled={isStruck || undefined}
              disabled={!interactive}
              onClick={() => interactive && onSelect(option.index)}
              className={`w-full justify-start text-left h-auto py-3 px-4 whitespace-normal
                          font-medium text-sm leading-relaxed
                          ${isStruck ? "line-through" : ""}`}
            >
              {media && <OptionArt path={media[position]} />}
              <span
                data-choice-letter
                className={`mr-2 text-xs font-bold ${
                  state === "idle" ? "text-muted-foreground" : "text-current opacity-80"}`}
              >
                {String.fromCharCode(65 + position)}.
              </span>
              <span className="flex-1">{option.label}</span>
              {isStruck && (
                // The reason, for anyone who cannot see the strike-through.
                <span className="sr-only">Eliminated</span>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
