// ---------------------------------------------------------------------------
// Post-settlement block transcript (Phase B slice 4; QUIZ1 Phase 7).
//
// Utilitarian by design — the owner playtest needs to READ the segment result,
// not admire it. Production presentation is Phase C.
//
// It renders only backend-supplied values. In particular the segment outcome
// uses Ranked vocabulary (win / loss / draw / timeout) and is never labelled
// CORRECT or INCORRECT: those words describe a single challenge here, not the
// head-to-head result of the segment.
//
// ONE table for both card contracts. The reader has already normalised the
// v1–v3 item-cost pair and the v4 mixed card into the same settled-card shape,
// including the units, so nothing here branches on a version except the title.
// ---------------------------------------------------------------------------

import { abilityName } from "@/lib/ranked-core/abilityDisplay";
import { META_REFLEX_LABEL } from "@/lib/ranked-core/modules/metaReflexModule";
import type {
  SegmentResult,
  SegmentRevealChallenge,
  SegmentRevealView,
} from "@/lib/ranked-public/contracts";
import {
  META_REFLEX_MIXED_VERSION,
  revealChoiceEntityId,
} from "@/lib/ranked-public/contracts";

const RESULT_LABEL: Record<SegmentResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  timeout: "Timeout",
};

/**
 * The block's public name. v4 IS Meta Reflex; v1–v3 were the Item Cost Duel,
 * and a historical transcript must keep saying what it actually was.
 */
export function segmentTitle(reveal: SegmentRevealView): string {
  return reveal.moduleVersion >= META_REFLEX_MIXED_VERSION
    ? META_REFLEX_LABEL : "Item Cost Duel";
}

/**
 * A settled entity's display name. A v4 card froze its own label; a v1–v3 card
 * did not, so its name is looked up in the reveal's item metadata, falling back
 * to the id.
 */
function entityLabel(reveal: SegmentRevealView, id: string,
                     frozen: string | null): string {
  return frozen ?? reveal.items[id]?.name ?? id;
}

/** `Name (value)` where the card compared a value, `Name` where it did not —
 *  a recognition card compares nothing. */
function sideText(reveal: SegmentRevealView, id: string,
                  frozen: string | null, value: string | null): string {
  const name = entityLabel(reveal, id, frozen);
  return value === null ? name : `${name} (${value})`;
}

/** The entity a recorded choice picked, or null for no answer. */
function pickedLabel(reveal: SegmentRevealView, c: SegmentRevealChallenge,
                     choice: string | null): string | null {
  const id = revealChoiceEntityId(reveal, c, choice);
  if (id === null) return null;
  const frozen = id === c.leftId ? c.leftLabel : id === c.rightId ? c.rightLabel : null;
  return entityLabel(reveal, id, frozen);
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
          {segmentTitle(reveal)} — segment result
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
            Every card in this segment, with both players&apos; choices and the
            canonical answers.
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-1 pr-3">#</th>
              <th scope="col" className="py-1 pr-3">Pair</th>
              <th scope="col" className="py-1 pr-3">Answer</th>
              <th scope="col" className="py-1 pr-3">You</th>
              <th scope="col" className="py-1 pr-3">Time</th>
              {them && <th scope="col" className="py-1 pr-3">Opponent</th>}
            </tr>
          </thead>
          <tbody>
            {reveal.challenges.map((c, i) => {
              // The choice is compared through the ENTITY it names, never as a
              // raw string: a v4 answer is a positional card token, so
              // `"c2:left" === correctId` would be false for every card.
              const yourPickId = revealChoiceEntityId(reveal, c, you.choices[i] ?? null);
              const yourLabel = pickedLabel(reveal, c, you.choices[i] ?? null);
              const theirLabel = them ? pickedLabel(reveal, c, them.choices[i] ?? null) : null;
              const yourRight = yourPickId !== null && yourPickId === c.correctId;
              return (
                <tr key={c.challengeIndex} className="border-t border-border"
                    data-testid={`icd-transcript-row-${c.challengeIndex}`}>
                  <td className="py-1 pr-3">{c.challengeIndex + 1}</td>
                  <td className="py-1 pr-3">
                    {sideText(reveal, c.leftId, c.leftLabel, c.leftValue)}
                    {" vs "}
                    {sideText(reveal, c.rightId, c.rightLabel, c.rightValue)}
                  </td>
                  <td className="py-1 pr-3">
                    {entityLabel(reveal, c.correctId,
                      c.correctId === c.leftId ? c.leftLabel
                        : c.correctId === c.rightId ? c.rightLabel : null)}
                  </td>
                  <td className="py-1 pr-3">
                    {yourLabel === null ? (
                      <span className="text-muted-foreground">No answer</span>
                    ) : (
                      <>
                        {yourLabel}{" "}
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
                      {theirLabel === null
                        ? <span className="text-muted-foreground">No answer</span>
                        : theirLabel}
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
