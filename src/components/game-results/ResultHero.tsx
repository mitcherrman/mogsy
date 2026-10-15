/**
 * THE RESULT HERO — the payoff for finishing.
 *
 * Result word, mode, standing, score, and the two duelists if there are two.
 * One composition, so the score is a PART of the announcement rather than a
 * panel underneath it.
 *
 * It matches `MatchOverFrame`'s existing hero on purpose — the same mascot,
 * the same eyebrow, the same gold, the same result-driven styling — so a
 * player moving between Ranked and Time Trial sees one product finishing two
 * games, not two products. The arena keeps drawing its own (see
 * `GameResultsBody`'s note); this is the one the non-arena modes get.
 *
 * MPE-D — A SCORE THAT ARRIVES WHILE THE HERO IS UP
 * ─────────────────────────────────────────────────
 * The Daily's main result mounts this hero PENDING (the score row reserved,
 * `reserveScore`) and the number lands a sync later. Without help, the only
 * motion is the entrance at mount, so the score simply pops in — at the exact
 * instant the completion cue sounds. `revealScore` keys the choreography on
 * the ARRIVAL instead: the number counts up and lands with the existing
 * reward-number bump, one light sweep crosses it, the label follows, and the
 * mascot swaps from the pose it held while pending (`pendingPose`) to the
 * state's own. Both are opt-in and default off, so every other hero is
 * byte-identical. Nothing here changes height: the plates share one box, the
 * figure's width is reserved in `ch`, and the light is absolutely positioned.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import type { MogzyMascotPose } from "@/components/mascot/mascot-assets";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { ResultContestants } from "./ResultContestants";
import { GameResultsModel, ResultState, STANDING_LABEL } from "./model";
import { useCountUp } from "./useCountUp";

const DEFAULT_HEADLINE: Record<ResultState, string> = {
  victory: "Victory",
  defeat: "Defeat",
  draw: "Draw",
  complete: "Complete",
};

// Literal hex for the reason MatchOverFrame states about its own banner:
// `.ranked-panel` paints its own navy whatever the page theme is, so a theme
// token resolves to near-black on any surface outside `.theme-lol`.
const STATE_STYLE: Record<ResultState, { eyebrow: string; heading: string }> = {
  victory: { eyebrow: "text-[#f0d78c]", heading: "ranked-title text-[#f5e6b8]" },
  defeat: { eyebrow: "text-rose-300/80", heading: "text-rose-200" },
  draw: { eyebrow: "text-[#7fd6ef]", heading: "text-slate-100" },
  complete: { eyebrow: "text-[#f0d78c]", heading: "ranked-title text-[#f5e6b8]" },
};

const STATE_POSE: Record<ResultState, MogzyMascotPose> = {
  victory: "cheering",
  defeat: "defeated",
  draw: "base",
  complete: "cheering",
};

/**
 * MPE-D — THE SCORE'S OWN TIMELINE, in ms after the score arrives. One table,
 * so the count, the light, the label and a caller's cue agree about when each
 * beat is (the Daily plays its score cue at `count`).
 */
export const SCORE_REVEAL_BEATS = {
  /** The count begins. */
  count: 160,
  countDuration: 640,
  /** One light sweep begins; it crosses the figure as the count lands. */
  sheen: 520,
  /** The score's label enters, after the number has most of its digits. */
  label: 560,
} as const;

/** Time the ambient wash takes to brighten: the hero's `reward-glow`. */
const SCORE_REVEAL_REST_MS = SCORE_REVEAL_BEATS.sheen + 1100;

function delayStyle(ms: number): CSSProperties {
  return { "--reward-delay": `${ms}ms` } as CSSProperties;
}

/**
 * The counted figure, kept in its own component so the ~40 frames of a count
 * re-render this span and not the hero. Counts 0 → `value`, prints the exact
 * target on landing (`useCountUp`'s one promise), bumps once (`data-landed`,
 * the shared reward-number CSS), and tells a screen reader the final value
 * only. Reduced motion prints the final value from the first frame.
 */
function RevealedScore({ value, testId }: { value: number; testId: string }) {
  const reducedMotion = useReducedMotionPreference();
  const count = useCountUp(value, {
    durationMs: SCORE_REVEAL_BEATS.countDuration,
    delayMs: SCORE_REVEAL_BEATS.count,
    animate: !reducedMotion,
  });
  const final = value.toLocaleString();
  return (
    <span data-testid={testId} className="reward-xp-value" data-landed={count.done ? "true" : "false"}>
      {/* Width is reserved for the final text, so the row does not shift as
          the digits grow. */}
      <span aria-hidden className="reward-xp-value__figure text-right tabular-nums"
        style={{ minWidth: `${final.length}ch` }}>
        {count.value.toLocaleString()}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

export function ResultHero({ model, reserveScore = false, revealScore = false, pendingPose }: {
  model: GameResultsModel;
  /**
   * DRS1 — a surface whose score arrives AFTER the hero is first drawn (the
   * Daily's pending stage result) asks for the score's slot to be held while
   * `model.score` is absent: an invisible, aria-hidden row in the same type as
   * the real score and its label, so the hero is the same height before and
   * after the number lands. It prints no digit and no word. Off by default, so
   * every other result is exactly what it was.
   */
  reserveScore?: boolean;
  /**
   * MPE-D — choreograph the score's ARRIVAL (see the module note): count-up,
   * landing bump, one light sweep, the label last. Meant for a hero that was
   * drawn pending (`reserveScore`) and is now settling; a hero that mounts
   * with its score plays the same sequence from mount. Off by default.
   */
  revealScore?: boolean;
  /**
   * MPE-D — the pose Mogzy holds while `reserveScore` is holding the slot.
   * When the score lands it leaves and the state's own pose arrives. Both
   * plates share one box, so the swap moves nothing. Unset: the state's pose
   * throughout, as before.
   */
  pendingPose?: MogzyMascotPose;
}) {
  const style = STATE_STYLE[model.state];
  const score = model.score ?? null;
  const contestants = model.contestants ?? null;
  // A duel prints two numbers side by side; a solo run prints one, with its
  // denominator when the mode has one. Nothing invents the other shape.
  const isDuel = score !== null && score.opponent !== null
    && score.opponent !== undefined;

  const pending = reserveScore && score === null;
  const revealing = revealScore && score !== null;
  const pose = STATE_POSE[model.state];
  // A pose swap exists only when a different pending pose was asked for.
  const swap = pendingPose !== undefined && pendingPose !== pose;
  // Did THIS mount see the pending frame? If so the pending plate leaves on
  // a fade when the score lands; a hero that mounted settled never draws it.
  const sawPending = useRef(pending);
  useEffect(() => { if (pending) sawPending.current = true; }, [pending]);
  const swapping = swap && (pending || sawPending.current);

  // The hero mascot is 80–96 CSS px: the compact plate where one exists, the
  // source where none does (`getMogzyArtAssetPath` falls back), never the
  // 1024 px PNG for a thumbnail-sized figure when a plate is available.
  const mascotClass = "absolute inset-0 h-full w-full";

  return (
    <header
      data-testid="result-hero"
      data-state={model.state}
      data-reveal={revealScore ? (revealing ? "true" : "pending") : undefined}
      // MPE — the first beat of the end screen's entrance sequence; the body's
      // sections follow it on the same `reward-enter` vocabulary.
      className="ranked-panel reward-enter space-y-3 px-4 py-6 text-center"
    >
      <div data-testid="result-mascot" data-pose={pending && swap ? pendingPose : pose}
        className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24">
        {swapping ? (
          <>
            <MogzyMascot pose={pendingPose!} scale="compact" decorative loading="eager"
              data-testid="result-mascot-pending"
              className={`${mascotClass} pointer-events-none ${pending ? "" : "reward-mascot-out"}`} />
            {/* The settled plate is in the box from the first frame (hidden),
                so it is already loaded when its moment comes. */}
            <MogzyMascot pose={pose} scale="compact" decorative loading="eager"
              data-testid="result-mascot-settled"
              className={`${mascotClass} ${pending ? "invisible" : "reward-mascot"}`} />
          </>
        ) : (
          <MogzyMascot pose={pose} scale="compact" decorative loading="eager"
            className={mascotClass} />
        )}
      </div>
      <div className={`ranked-eyebrow ${style.eyebrow}`} data-testid="result-eyebrow">
        {model.mode}
        {model.standing && (
          <>
            {" · "}
            <span data-testid={model.standingTestId ?? "result-standing"}>
              {STANDING_LABEL[model.standing]}
            </span>
          </>
        )}
      </div>
      <h2
        data-testid="result-headline"
        className={`text-3xl font-black uppercase tracking-[0.06em] ${style.heading}`}
      >
        {model.headline ?? DEFAULT_HEADLINE[model.state]}
      </h2>
      {model.subheading && (
        // MPE-D — keyed, so a subheading that CHANGES while revealing
        // ("Scoring…" → "Complete") re-enters rather than flipping in place.
        <p key={revealScore ? model.subheading : undefined}
          data-testid="result-subheading"
          className={`text-sm text-muted-foreground ${revealScore ? "reward-enter" : ""}`}>
          {model.subheading}
        </p>
      )}

      {score && (
        <div data-testid={score.testId ?? "result-score"} className="flex items-end justify-center gap-3">
          <span className="text-5xl font-black leading-none tabular-nums text-[#f5e6b8] sm:text-6xl">
            {revealing
              ? <RevealedScore value={score.you} testId={`${score.testId ?? "result-score"}-reveal`} />
              : score.you.toLocaleString()}
          </span>
          {isDuel ? (
            <>
              <span aria-hidden className="pb-1 text-2xl font-black text-muted-foreground/50">
                —
              </span>
              <span className="text-5xl font-black leading-none tabular-nums text-slate-300/80 sm:text-6xl">
                {score.opponent}
              </span>
            </>
          ) : (
            typeof score.outOf === "number" && (
              <span className="pb-1 text-xl font-medium tabular-nums text-muted-foreground">
                / {score.outOf}
              </span>
            )
          )}
        </div>
      )}
      {score?.label && (
        <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground ${
          revealing ? "reward-enter" : ""}`}
          style={revealing ? delayStyle(SCORE_REVEAL_BEATS.label) : undefined}>
          {score.label}
        </p>
      )}
      {reserveScore && !score && (
        // MPE-D — a NO-BREAK space, not a space: a span holding only
        // collapsible whitespace has no line box, so the "reserved" row and
        // label measured 0 px and the hero still grew by the score's 75 px
        // when the number landed. U+00A0 gives each the line height of the
        // real row in the same type, and still prints no digit and no word.
        <>
          <div aria-hidden data-testid="result-score-reserve"
            className="invisible flex items-end justify-center gap-3">
            <span className="text-5xl font-black leading-none sm:text-6xl">{" "}</span>
          </div>
          <p aria-hidden className="invisible text-[10px] font-semibold uppercase tracking-[0.18em]">
            {" "}
          </p>
        </>
      )}

      {contestants && (
        <div className="pt-1 text-left">
          <ResultContestants
            you={contestants.you}
            opponent={contestants.opponent ?? null}
            // The hero printed the two numbers directly above. Printing them
            // again ten pixels lower is the duplication this whole strip
            // exists to remove.
            showScores={!isDuel}
          />
        </div>
      )}

      {/* MPE-D — the light of the moment: an ambient wash at the top and one
          sweep across the figure as it lands. LAST in the panel, absolutely
          positioned (`.reward-glow` / `.reward-sheen` set their own position),
          so `space-y-3` gives them no margin that could move a sibling and the
          settled hero is exactly as tall as the pending one. Decoration only:
          aria-hidden, absent at rest and under reduced motion. */}
      {revealing && (
        <>
          <div aria-hidden className="reward-glow pointer-events-none h-28
            bg-[radial-gradient(70%_100%_at_50%_0%,rgba(240,215,140,0.18),transparent)]"
            style={delayStyle(0)} data-rest-ms={SCORE_REVEAL_REST_MS} />
          <span aria-hidden className="reward-sheen" style={delayStyle(SCORE_REVEAL_BEATS.sheen)} />
        </>
      )}
    </header>
  );
}
