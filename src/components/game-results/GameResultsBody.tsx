/**
 * EVERYTHING BELOW THE RESULT WORD — the shared half of every end screen.
 *
 * Snapshot, progress, report, timeline, review, actions, in that order, each
 * absent when its mode has nothing to put there. Ranked, the Daily, Time Trial
 * and a practice quiz all render THIS, so the order a player learns on one
 * screen is the order they get on the other four.
 *
 * It is a separate component from `GameResultsShell` for one reason: the arena
 * modes already have a hero. `MatchOverFrame` has drawn Ranked's mascot,
 * result word and scoreline since F1, three other surfaces depend on it, and
 * replacing it to gain a shared body would be a redesign of the live arena's
 * terminal contract to fix a layout problem below it. So the arena keeps its
 * hero and mounts this; the two non-arena modes get `GameResultsShell`, which
 * is this plus `ResultHero`.
 */
import { GameResultsModel } from "./model";
import { MogzyMatchReport } from "./MogzyMatchReport";
import { ResultActions } from "./ResultActions";
import { ResultProgress } from "./ResultProgress";
import { ResultStatGrid } from "./ResultStatGrid";
import { ResultTimeline } from "./ResultTimeline";

export function GameResultsBody({ model }: { model: GameResultsModel }) {
  const snapshot = model.snapshot ?? [];
  const progress = model.progress ?? [];
  const report = model.report ?? [];
  const timeline = model.timeline ?? null;
  const hasAnything = snapshot.length > 0 || progress.length > 0 || report.length > 0
    || (timeline !== null && timeline.entries.length > 0) || model.review !== undefined
    || model.actions !== undefined;
  if (!hasAnything) return null;
  return (
    <div data-testid="game-results-body" className="space-y-4">
      <ResultStatGrid stats={snapshot} />
      <ResultProgress items={progress} />
      <MogzyMatchReport lines={report} />
      {timeline && (
        <ResultTimeline entries={timeline.entries} unitLabel={timeline.unitLabel} />
      )}
      {model.review}
      {model.actions && <ResultActions actions={model.actions} />}
    </div>
  );
}
