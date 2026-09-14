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
 */
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import type { MogzyMascotPose } from "@/components/mascot/mascot-assets";
import { ResultContestants } from "./ResultContestants";
import { GameResultsModel, ResultState, STANDING_LABEL } from "./model";

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

export function ResultHero({ model }: { model: GameResultsModel }) {
  const style = STATE_STYLE[model.state];
  const score = model.score ?? null;
  const contestants = model.contestants ?? null;
  // A duel prints two numbers side by side; a solo run prints one, with its
  // denominator when the mode has one. Nothing invents the other shape.
  const isDuel = score !== null && score.opponent !== null
    && score.opponent !== undefined;

  return (
    <header
      data-testid="result-hero"
      data-state={model.state}
      className="ranked-panel space-y-3 px-4 py-6 text-center"
    >
      <MogzyMascot pose={STATE_POSE[model.state]} decorative
        className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
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
        <p data-testid="result-subheading" className="text-sm text-muted-foreground">
          {model.subheading}
        </p>
      )}

      {score && (
        <div data-testid={score.testId ?? "result-score"} className="flex items-end justify-center gap-3">
          <span className="text-5xl font-black leading-none tabular-nums text-[#f5e6b8] sm:text-6xl">
            {score.you.toLocaleString()}
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {score.label}
        </p>
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
    </header>
  );
}
