// ---------------------------------------------------------------------------
// Post-settlement Item Cost Duel transcript (Phase B slice 4).
//
// Utilitarian by design — the owner playtest needs to READ the segment result,
// not admire it. Production presentation is Phase C.
//
// It renders only backend-supplied values. In particular the segment outcome
// uses Ranked vocabulary (win / loss / draw / timeout) and is never labelled
// CORRECT or INCORRECT: those words describe a single challenge here, not the
// head-to-head result of the segment.
// ---------------------------------------------------------------------------

import { abilityName } from "@/lib/ranked-core/abilityDisplay";
import type {
  SegmentItemView,
  SegmentResult,
  SegmentRevealView,
} from "@/lib/ranked-public/contracts";

const RESULT_LABEL: Record<SegmentResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  timeout: "Timeout",
};

function itemLabel(items: Record<string, SegmentItemView>, id: string): string {
  return items[id]?.name ?? id;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(2)}s`;
}

export interface SegmentTranscriptProps {
  reveal: SegmentRevealView;
  viewerUserId: string;
  opponentUserId: string | null;
  /** Damage the segment settled, straight from the backend. */
  damageDealt?: number | null;
  /** Revealed abilities by player id, once the segment is over. */
  abilitiesByPlayerId?: Record<string, string | null>;
}

export function SegmentTranscript({
  reveal, viewerUserId, opponentUserId, damageDealt = null,
  abilitiesByPlayerId = {},
}: SegmentTranscriptProps) {
  const you = reveal.players[viewerUserId];
  const them = opponentUserId ? reveal.players[opponentUserId] : undefined;
  if (!you) return null;
  const result = you.segmentResult;

  return (
    <section className="ranked-panel space-y-3 p-3 sm:p-4"
             data-testid="icd-transcript" aria-labelledby="icd-transcript-heading">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="icd-transcript-heading" className="font-semibold">
          Item Cost Duel — segment result
        </h4>
        <p className="text-sm font-semibold" data-testid="icd-transcript-result">
          {result ? RESULT_LABEL[result] : "—"}
          {damageDealt !== null && (
            <span className="ml-2 font-normal text-muted-foreground"
                  data-testid="icd-transcript-damage">
              {damageDealt} damage
            </span>
          )}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4"
          data-testid="icd-transcript-totals">
        <div><dt className="text-muted-foreground">Correct</dt><dd>{you.correct}</dd></div>
        <div><dt className="text-muted-foreground">Incorrect</dt><dd>{you.incorrect}</dd></div>
        <div><dt className="text-muted-foreground">Unanswered</dt><dd>{you.unanswered}</dd></div>
        <div>
          <dt className="text-muted-foreground">Total time</dt>
          <dd>{formatMs(you.totalResponseMs)}</dd>
        </div>
        {them && (
          <>
            <div>
              <dt className="text-muted-foreground">Opponent correct</dt>
              <dd>{them.correct}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Opponent unanswered</dt>
              <dd>{them.unanswered}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Opponent time</dt>
              <dd>{formatMs(them.totalResponseMs)}</dd>
            </div>
          </>
        )}
      </dl>

      {Object.keys(abilitiesByPlayerId).length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="icd-transcript-abilities">
          Abilities — you:{" "}
          {abilitiesByPlayerId[viewerUserId]
            ? abilityName(abilitiesByPlayerId[viewerUserId] as string) : "No Ability"}
          {opponentUserId && (
            <>
              {"; opponent: "}
              {abilitiesByPlayerId[opponentUserId]
                ? abilityName(abilitiesByPlayerId[opponentUserId] as string) : "No Ability"}
            </>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">
            Every challenge in this segment, with both players&apos; choices and the
            canonical item costs.
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-1 pr-3">#</th>
              <th scope="col" className="py-1 pr-3">Pair (cost)</th>
              <th scope="col" className="py-1 pr-3">More expensive</th>
              <th scope="col" className="py-1 pr-3">You</th>
              <th scope="col" className="py-1 pr-3">Time</th>
              {them && <th scope="col" className="py-1 pr-3">Opponent</th>}
            </tr>
          </thead>
          <tbody>
            {reveal.challenges.map((c, i) => {
              const yourPick = you.choices[i] ?? null;
              const theirPick = them?.choices[i] ?? null;
              const yourRight = yourPick !== null && yourPick === c.correctItemId;
              return (
                <tr key={c.challengeIndex} className="border-t border-border"
                    data-testid={`icd-transcript-row-${c.challengeIndex}`}>
                  <td className="py-1 pr-3">{c.challengeIndex + 1}</td>
                  <td className="py-1 pr-3">
                    {itemLabel(reveal.items, c.leftItemId)} ({c.leftCost}g)
                    {" vs "}
                    {itemLabel(reveal.items, c.rightItemId)} ({c.rightCost}g)
                  </td>
                  <td className="py-1 pr-3">{itemLabel(reveal.items, c.correctItemId)}</td>
                  <td className="py-1 pr-3">
                    {yourPick === null ? (
                      <span className="text-muted-foreground">No answer</span>
                    ) : (
                      <>
                        {itemLabel(reveal.items, yourPick)}{" "}
                        <span className={yourRight ? "text-emerald-600" : "text-destructive"}>
                          {yourRight ? "✓" : "✗"}
                        </span>
                        <span className="sr-only">
                          {yourRight ? " correct" : " incorrect"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    {formatMs(you.perChallengeMs[i] ?? null)}
                  </td>
                  {them && (
                    <td className="py-1 pr-3">
                      {theirPick === null
                        ? <span className="text-muted-foreground">No answer</span>
                        : itemLabel(reveal.items, theirPick)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
