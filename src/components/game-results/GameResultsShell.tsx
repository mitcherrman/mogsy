/**
 * THE SHARED RESULT SCREEN — hero plus body, for a mode that has no arena.
 *
 * Time Trial and the practice quiz each used to own a whole end screen: their
 * own heading, their own card, their own stat list, their own buttons, in
 * their own visual language. Neither of them needed to own any of it. They
 * build a `GameResultsModel` now and this renders it, which is how a change to
 * the result experience reaches five modes instead of one.
 */
import { GameResultsBody } from "./GameResultsBody";
import { ResultHero } from "./ResultHero";
import type { GameResultsModel } from "./model";

export function GameResultsShell({ model }: { model: GameResultsModel }) {
  return (
    <section
      aria-label={`${model.mode} result`}
      data-testid="game-results"
      data-mode={model.mode}
      data-state={model.state}
      className="ranked-shell mx-auto flex w-full max-w-2xl flex-col gap-4"
    >
      <ResultHero model={model} />
      <GameResultsBody model={model} />
    </section>
  );
}
