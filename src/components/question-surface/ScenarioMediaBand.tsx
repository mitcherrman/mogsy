/**
 * The cinematic scenario band — the container-query box a Scenario Card is
 * drawn inside, and the ONE definition of that geometry.
 *
 * WHY IT IS ITS OWN COMPONENT (RR1 slice pass)
 * ────────────────────────────────────────────
 * This markup lived inside `InteractiveScenarioSurface.HeroBand` and was
 * private to it, which was fine while the surface was the only thing that drew
 * a Scenario Card. A Mastery/Matchup slice needs the same band above a
 * DIFFERENT interaction — the Mastery numeric/boolean/comparison renderers own
 * their own inputs and must keep them — so the choice was to copy fifteen lines
 * of geometry into a second place or to extract them into one.
 *
 * Copying would have forked the thing that must not fork. Every size inside a
 * Scenario Card is expressed in `cqmin`/`cqh` against THIS box, so a second
 * copy that drifted by one token would silently rescale every card drawn
 * through it, and `--qs-media-max` — the arena stage's reserved region — would
 * apply to one copy and not the other.
 *
 * Moved verbatim: same element, same classes, same style object, same
 * `data-testid`. `InteractiveScenarioSurface` now renders this, so the surface's
 * output is unchanged and the gold standard is untouched.
 */
import { MotionConfig } from "framer-motion";
import type { QuizQuestion } from "@/lib/quiz/api";
import { ScenarioCard } from "@/components/quiz-broadcast/scenario-cards/ScenarioCard";

/**
 * Cinematic band aspect ratios. The reused Broadcast cards size their
 * foreground in cqmin (min container dimension), which in this inline band is
 * the HEIGHT — so a taller band scales the subject art/labels UP. "band" was
 * 16/6; 16/7 gives the competitive/tutorial variants a noticeably larger, more
 * legible subject without tipping into an over-tall cinematic panel (weak
 * scenarios already go compact).
 *
 * QV1 Step 3B — these stay the DEFAULTS, and the Ranked desktop widens `band`
 * to 16/7.5 through `--qs-band-aspect-band` (see the style object below and
 * index.css). Widening the ratio is the lever that reaches the art: under the
 * RM1 viewport lock the media region is the only term that yields, so on most
 * desktops the band is not as tall as it would like to be — but at 1440x900 it
 * is the ASPECT that binds, not the region. Measured, the band drew 248px
 * inside a 256px region, because 567px of track at 16/7 is 248px; raising
 * `--qs-media-h` there changed nothing at all (248 -> 248), while widening the
 * ratio takes it to the region's full 256.
 *
 * It is also the only media lever that CANNOT reach a sparse card, which is
 * why it is preferred to a bigger reserve: `CompactScenarioBand` declares no
 * aspect ratio, so a plate simply fills whatever region it is given and the
 * override cannot touch it. A global token increase does the opposite —
 * measured, it grew the sparse plate 20px at 1440 while leaving the cinematic
 * band exactly where it was.
 *
 * Not wider than 7.5: the region caps the band at 16rem on a tall desktop, so
 * a taller ratio buys nothing there, and on every shorter desktop the region is
 * already the binding constraint. 7.5 is the value that reaches the cap at
 * 1440 without asking for height no viewport can give.
 *
 * The numbers here are unchanged, so a phone, the admin preview, the
 * screenshot harness, Mastery and the Broadcast stage all render exactly what
 * they rendered before.
 */
export const BAND_ASPECT = { hero: "16 / 9", band: "16 / 7" } as const;

export interface ScenarioMediaBandProps {
  /** The Quiz/Broadcast-shaped payload the card classifier reads. */
  source: QuizQuestion;
  /** Which aspect preset — `hero` for comfortable, `band` for compact. */
  aspect: keyof typeof BAND_ASPECT;
  /** Compact density caps the band harder; see the height notes below. */
  compact: boolean;
  /** `full` opts out of the reduced-motion downgrade, as the surface does. */
  motionLevel?: string;
  revealActive?: boolean;
  correctAnswer?: string | null;
}

export function ScenarioMediaBand({
  source,
  aspect,
  compact,
  motionLevel,
  revealActive = false,
  correctAnswer = null,
}: ScenarioMediaBandProps) {
  const reducedMotion: "never" | "user" = motionLevel === "full" ? "never" : "user";
  // Compact density (competitive/speed) trades band size for above-the-fold
  // room: an active Ranked round must fit question + answers + HUD in a
  // desktop viewport, so the cinematic band is capped hard while comfortable
  // surfaces keep the tall presentation.
  const bandMinHeight = compact ? "8rem" : "12.5rem";
  // QUIZ1 Phase 11 — the compact cap was set when a Ranked round had to fit
  // question + answers + ABILITY TRAY + status panel above the fold. R1
  // removed the tray and Phase 11 removed the XP row, so ~200px of that budget
  // came back and the band was left artificially short in the middle of a
  // half-empty viewport.
  //
  // The replacement is still self-limiting, and deliberately so: the cap is
  // whichever is SMALLER of a fixed ceiling and a fraction of the viewport, so
  // a short laptop screen keeps roughly the old height and only a tall desktop
  // spends the reclaimed room. The "must fit above the fold" rule the original
  // cap encoded is therefore intact — it is the fold that moved.
  const bandMaxHeight = compact ? "min(22rem, 34vh)" : "30rem";

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div
        data-testid="scenario-hero"
        className="@container relative w-full overflow-hidden rounded-xl bg-black/30"
        // minHeight floors the container-query box on narrow viewports (where the
        // band would otherwise collapse and shrink every cqmin unit into
        // illegibility); maxHeight caps it on ultra-wide columns. Between the two
        // the aspect ratio drives height, so the subject art gets more room and
        // reads larger without an over-tall panel.
        // `--qs-media-max` is the canonical question stage's reserved media
        // region (ARENA1 Phase 1). It is set to that region's OWN height, which
        // is the tallest this band reaches at any supported width, so inside the
        // arena it caps the band to the box it already fits and shrinks nothing.
        // Unset everywhere else, which is why the fallback is the value this
        // band has always had.
        style={{
          containerType: "size",
          // The ratio is a TOKEN with this preset's own value as the fallback,
          // exactly as `--qs-media-max` below is. That is what lets the Ranked
          // stage widen the competitive band on a desktop without widening it
          // on a phone: an inline `aspect-ratio` would outrank any stylesheet
          // rule, so the override has to arrive through the cascade rather than
          // fight it. Unset everywhere else — the admin preview, the screenshot
          // harness, Mastery and every narrow viewport get the preset value and
          // are byte-identical to what they rendered before.
          aspectRatio: `var(--qs-band-aspect-${aspect}, ${BAND_ASPECT[aspect]})`,
          // BOUNDED BY ITS BOX, not only by itself. `bandMinHeight` is a
          // legibility floor for a band that would otherwise collapse on a
          // narrow viewport — but as a bare `min-height` it also outranked the
          // arena's reserved media region, and a 128px floor inside a region
          // the lock had sized to 72px is exactly how the Ranked shell stayed
          // a few pixels taller than the viewport no matter what the stage
          // reserved. `min(…, 100%)` keeps the floor everywhere it was doing
          // its job and stops it overruling the box that contains it.
          minHeight: `min(${bandMinHeight}, 100%)`,
          maxHeight: `min(var(--qs-media-max, ${bandMaxHeight}), 100%)`,
        }}
      >
        <ScenarioCard question={source} revealActive={revealActive} correctAnswer={correctAnswer} />
      </div>
    </MotionConfig>
  );
}
