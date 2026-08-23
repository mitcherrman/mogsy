/**
 * The production quiz answer-choice grid, extracted verbatim from Quiz.tsx so
 * it can be reused by both the live quiz page and the screenshot render
 * harness (/dev/quiz-render). Visual behavior is unchanged.
 *
 * data-quiz-choice / data-choice-state are stable selectors for browser
 * automation; data-choice-state mirrors ONLY what is visually displayed
 * (idle | selected | correct | incorrect-selected), so an unanswered render
 * carries no correct-answer information in the DOM.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

export type QuizChoiceObject = { label: string; image_path?: string; champion_name?: string };
export type QuizChoice = string | QuizChoiceObject;

export function getChoiceLabel(choice: QuizChoice): string {
  return typeof choice === "string" ? choice : choice.label;
}

export function getChoiceImage(choice: QuizChoice): string | undefined {
  if (typeof choice === "string") return undefined;
  return choice.image_path || undefined;
}

export function choicesHaveImages(choices: QuizChoice[]): boolean {
  return (choices || []).some(
    (c) => typeof c === "object" && c !== null && !!(c as QuizChoiceObject).image_path,
  );
}

/** Minimal reveal shape: only the field the choice grid reads. */
export type QuizAnswerRevealResult = { correct_answer?: string | null };

/**
 * Canonical entity an option NAMES (RA6). Distinct from `QuizChoiceObject.
 * image_path`, which is the classic PICTURE-CHOICE mode (large art above the
 * label, 2-up grid). This is a small inline badge beside text that stays the
 * answer, so the two never combine — the picture-choice branch wins.
 */
export type QuizOptionMedia = { type: string; name: string; icon: string };

/** Fixed icon slot. Owns its own failure state so a dead image never escalates
 * past this box. */
function OptionMediaIcon({ media }: { media: QuizOptionMedia | null }) {
  const [failed, setFailed] = useState(false);
  const url = media && !failed ? resolveQuizAssetUrl(media.icon) : undefined;
  return (
    // The box is mounted for EVERY option of a question with media, resolved or
    // not, and its size never depends on its contents: an option that fails to
    // resolve, an image that 404s, and a loaded icon all occupy the same 1.75rem
    // square. That is what keeps the four tablets identical and keeps a slow or
    // broken image from reflowing the grid mid-round.
    //
    // aria-hidden + alt="": DECORATIVE. The adjacent label already names this
    // exact entity, so announcing it here would read it twice; the button's
    // accessible name is unchanged from the text-only grid.
    <span
      aria-hidden="true"
      data-option-media
      data-option-media-type={media?.type ?? "none"}
      data-option-media-state={media ? (failed ? "error" : "ok") : "empty"}
      className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-black/25 ring-1 ring-white/10"
    >
      {url && (
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

type QuizAnswerOptionsProps = {
  choices: QuizChoice[];
  selectedAnswer: string | null;
  /** Non-null once the answer is judged; enables reveal styling + disables buttons. */
  answerResult: QuizAnswerRevealResult | null;
  /**
   * `index` is the choice's POSITION in `choices`. Additive — every existing
   * caller ignores it — but a caller whose labels are not unique (an
   * image-only or recognition choice set) cannot map a label back to a
   * choice, and position is the only thing that always identifies one.
   */
  onSelect: (label: string, index: number) => void;
  /**
   * Column strategy. "auto" (default) is the classic quiz behaviour and is
   * unchanged. "wide-2" additionally goes 2-up from lg — for compact
   * competitive surfaces whose callers have verified the labels are short
   * enough to stay readable side by side.
   */
  columns?: "auto" | "wide-2";
  /**
   * OPTIONAL canonical media for the choices (RA6), POSITIONAL and
   * length-matched: entry i belongs to choice i. Omit for the classic
   * text-only grid — every existing caller does, and their render is
   * unchanged. Supplying it mounts a fixed icon slot on EVERY choice, so a
   * null entry costs layout space rather than shrinking its tablet.
   */
  optionMedia?: (QuizOptionMedia | null)[];
  /**
   * RG3 — positional indexes struck out by the player's own earlier wrong
   * attempts on a card that is STILL UNRESOLVED (the Daily Challenge retry
   * mechanic).
   *
   * This is not a reveal and must never be confused with one. Every index here
   * is an option the player chose and was told was wrong; nothing about the
   * remaining options is implied, and in particular the correct one is not
   * identifiable from this list until only one option is left — which is the
   * mechanic working, not a leak.
   *
   * Marked, never removed: the buttons keep their positions and their letters,
   * because the index a client submits has to keep meaning what the server
   * thinks it means, and because a struck-out choice the player can still SEE
   * is the whole learning affordance.
   *
   * Ignored once `answerResult` is set — a resolved card is a reveal, and one
   * surface must not be painted by two vocabularies at once.
   */
  eliminatedIndexes?: readonly number[];
};

export default function QuizAnswerOptions({
  choices,
  selectedAnswer,
  answerResult,
  onSelect,
  columns = "auto",
  optionMedia,
  eliminatedIndexes,
}: QuizAnswerOptionsProps) {
  const eliminated = new Set(answerResult ? [] : (eliminatedIndexes ?? []));
  const hasImages = choicesHaveImages(choices);
  // Picture-choice mode already renders large per-choice art and manages its
  // own 2-up grid; an inline badge on top of it would be two pictures for one
  // answer. Length is re-checked here so a mismatched array degrades to the
  // text-only grid instead of shifting icons onto the wrong tablets.
  const media =
    !hasImages && optionMedia && optionMedia.length === (choices || []).length
      ? optionMedia
      : null;
  return (
    <div
      data-quiz-answer-options
      data-columns={columns}
      className={hasImages
        ? "grid grid-cols-2 gap-2.5"
        : `grid grid-cols-1 gap-2.5 [@media(max-height:480px)_and_(orientation:landscape)]:grid-cols-2 [@media(max-height:480px)]:gap-2${
          columns === "wide-2" ? " lg:grid-cols-2" : ""}`}
    >
      {(choices || []).map((choice, idx) => {
        const label = getChoiceLabel(choice);
        const imgPath = getChoiceImage(choice);
        const imgUrl = imgPath ? resolveQuizAssetUrl(imgPath) : undefined;
        const isSelected = selectedAnswer === label;
        const isCorrect = answerResult?.correct_answer === label;
        const isEliminated = eliminated.has(idx);
        let btnVariant: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive" | "hero" | "accent" = "outline";
        if (answerResult) {
          if (isCorrect) btnVariant = "default";
          else if (isSelected) btnVariant = "destructive";
          else btnVariant = "outline";
        } else if (isEliminated) {
          // Deliberately NOT `destructive`: that variant is the reveal's
          // "you picked this and it was wrong, here is the right one", and an
          // unresolved card has not said the second half. An outline tablet
          // struck through and dimmed says only what is true — this one is
          // out — and leaves the reveal vocabulary unspent.
          btnVariant = "outline";
        } else if (isSelected) {
          btnVariant = "default";
        }
        const choiceState = answerResult
          ? isCorrect
            ? "correct"
            : isSelected
              ? "incorrect-selected"
              : "idle"
          : isEliminated
            ? "eliminated"
            : isSelected
              ? "selected"
              : "idle";
        // On gold/red (default/destructive) buttons the muted-grey letter is
        // hard to read — inherit the button's foreground color instead.
        const letterClass =
          choiceState === "idle"
            ? "text-muted-foreground"
            : "text-current opacity-80";

        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.07, duration: 0.35, ease: "easeOut" }}
          >
            <Button
              variant={btnVariant}
              data-quiz-choice={idx}
              data-choice-state={choiceState}
              onClick={() => onSelect(label, idx)}
              // An eliminated option is unavailable INDIVIDUALLY: the rest of
              // the grid stays live, which is what makes the retry a retry.
              disabled={!!answerResult || isEliminated}
              // `disabled` already takes the tablet out of pointer and
              // keyboard reach; `aria-disabled` plus the note below are what
              // say WHY, so it is explained rather than silently gone.
              aria-disabled={isEliminated || undefined}
              className={[
                imgUrl
                  ? "w-full h-auto flex-col items-center gap-2 py-3 px-3 whitespace-normal font-medium text-sm leading-relaxed"
                  : "w-full justify-start text-left h-auto py-3 px-4 whitespace-normal font-medium text-sm leading-relaxed",
                // `line-through` + opacity rather than a colour swap: the
                // tablet keeps its size and its place in the grid, so striking
                // one out never reflows the others.
                isEliminated
                  ? "line-through opacity-45 border-destructive/40 disabled:opacity-45"
                  : "",
              ].join(" ").trim()}
            >
              {imgUrl ? (
                <>
                  <div
                    className="relative rounded-md overflow-hidden"
                    style={{
                      padding: 2,
                      background:
                        "linear-gradient(145deg, #f0d78c 0%, #c9a84c 50%, #7a5e22 100%)",
                      boxShadow:
                        "0 0 12px rgba(201,168,76,0.35), 0 4px 12px rgba(0,0,0,0.45)",
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={label}
                      className="h-20 w-20 md:h-24 md:w-24 object-cover block rounded-sm"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 w-full justify-center">
                    <span data-choice-letter className={`text-xs font-bold ${letterClass}`}>
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span className="text-center">{label}</span>
                    {answerResult && isCorrect && (
                      <CheckCircle2 className="h-4 w-4 text-primary-foreground shrink-0" />
                    )}
                    {answerResult && isSelected && !isCorrect && (
                      <XCircle className="h-4 w-4 text-destructive-foreground shrink-0" />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span data-choice-letter className={`mr-2 shrink-0 text-xs font-bold ${letterClass}`}>
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {media && <OptionMediaIcon media={media[idx] ?? null} />}
                  <span className="flex-1">{label}</span>
                  {answerResult && isCorrect && (
                    <CheckCircle2 className="h-4 w-4 text-primary-foreground ml-2 shrink-0" />
                  )}
                  {answerResult && isSelected && !isCorrect && (
                    <XCircle className="h-4 w-4 text-destructive-foreground ml-2 shrink-0" />
                  )}
                </>
              )}
              {/* The reason, for anyone who cannot see the strike-through. */}
              {isEliminated && <span className="sr-only">Eliminated</span>}
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}
