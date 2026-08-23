/**
 * MALT — RANKED MATCH RECORD.
 *
 * A Ranked duel is not a study session and should not read as one. A practice
 * row answers "how did that set go"; a Ranked row answers "who did I play,
 * what was I tested on, what did it cost me, and where did it leave me on the
 * ladder". That is more facts, and they have a hierarchy — so this is a
 * bordered UNIT rather than another line in the table, while staying inside
 * the same ledger shell, typography and ink as the study rows above it.
 *
 * WHAT B1 CHANGED, AND WHY
 * ────────────────────────
 * Phase A's design pass left a wide empty middle, and the fix was not to
 * decorate it: it was to put the record's actual payload there. The question
 * timeline (`QuestionTimeline`) now occupies the centre — one icon per round,
 * clickable, showing what the match tested. Two things were removed to make
 * room, both on the owner's call and both because they were the least
 * valuable things on the row:
 *
 * * the exact stamp and any duration — replaced by relative age ("Today",
 *   "2d ago"), which is what a reader of a record actually wants;
 * * the "5 rounds" length line — the timeline IS the length now, drawn, and
 *   printing the same count in words beside it is one fact stated twice.
 *
 * STILL NO MATCH SCORE
 * ────────────────────
 * `finalRoundNumber` is the round the match ENDED on. It is not a score, the
 * history contract carries no per-round W/L, and nothing here pairs it with a
 * second number that would let it read as one. The timeline's own marks come
 * from the REVIEW read model, which does know how each round went for the
 * viewer — that is a different fact, separately fetched, and it is never
 * summed into a scoreline.
 *
 * EVERY FIELD IS ON THE WIRE
 * ──────────────────────────
 * From `MatchHistoryEntryView` (`ranked_duel.match_history.v1`):
 * `viewerOutcome`, `opponentDisplayName`, `opponentIsBot`, `viewerRole`,
 * `completedAt`, `finalRoundNumber`, `terminalReason`, `ratingDelta`,
 * `ratingAfter`. The rating a match STARTED from is the one derived value,
 * and only when both `ratingAfter` and `ratingDelta` are present — otherwise
 * it is withheld rather than guessed.
 */
import { Flag, MinusCircle, Swords } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import { RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import type { MatchHistoryEntryView, MatchReviewView } from "@/lib/ranked-public/contracts";

/**
 * The verdict's own ink, PRINTED — not lit.
 *
 * The dark-plate version used 300-weight emerald and rose, which are colours
 * for glowing on navy and wash out to highlighter marks on a sheet. These are
 * the same two hues taken to a depth that holds on vellum: every value clears
 * 4.5:1 against rgb(218,194,145), the darkest point the sheet's crop allows
 * under text (jade measures 4.56, rubric 5.62). The `edge` is the marginal
 * rule down the block — decoration rather than text, so it may be a step more
 * saturated than the label it belongs to.
 */
const VERDICT = {
  win: { label: "Victory", ink: "#1f5c3c", edge: "#2f7a52" },
  loss: { label: "Defeat", ink: LEAGUECRAFT_INK.rubric, edge: "#9c3a30" },
  draw: { label: "Draw", ink: LEAGUECRAFT_INK.faint, edge: "#8a7248" },
} as const;

/** How the match ended, when that is worth saying. A duel played out is the
 *  norm and says nothing; a forfeit or a void one is a fact about the record. */
const TERMINAL = {
  combat: { icon: Swords, note: null as string | null },
  forfeit: { icon: Flag, note: "forfeit" },
  no_contest: { icon: MinusCircle, note: "no contest" },
} as const;

/**
 * Relative age, and only relative age — for EVERY row in the record.
 *
 * The owner's call, and the right one for a record: a reader scanning their
 * history wants "how long ago", not a timestamp to date-arithmetic against
 * today. `StudyHistoryLedger` imports this exact function rather than keeping
 * its own formatter, because a ledger that dated half its rows "2d ago" and
 * the other half "Aug 20, 8:00 PM" would read as two ledgers.
 *
 * DAYS ARE THE UNIT. An earlier pass kept minutes ("just now", "40m ago");
 * they were dropped because they made the newest row speak a different
 * language from every row under it, and the question the record answers is
 * never "how many minutes". Anything inside the current calendar day is
 * simply Today.
 *
 * The day count is calendar-based, not a division: a match at 11pm yesterday
 * is "1d ago" at 1am, which is what a reader means, and what
 * `Math.round(elapsed / 86400000)` would have called "Today".
 */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function relativeMatchAge(iso: string, now: Date = new Date()): string {
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  // A stamp at or ahead of the clock is still Today. Server time can
  // legitimately run a little ahead of the reader's.
  if (days <= 0) return "Today";
  if (days < 7) return `${days}d ago`;
  if (days < 28) return `${Math.floor(days / 7)}w ago`;
  return `${Math.max(1, Math.round(days / 30))}mo ago`;
}

export default function RankedMatchRow({
  entry,
  review = null,
}: {
  entry: MatchHistoryEntryView;
  /**
   * This match's loaded review, or null while it is pending or unavailable.
   * Supplied by the ledger, which owns the ONE bounded loader for every row —
   * this component still fetches nothing.
   */
  review?: MatchReviewView | null;
}) {
  const verdict = VERDICT[entry.viewerOutcome];
  const terminal = TERMINAL[entry.terminalReason] ?? TERMINAL.combat;
  const Icon = terminal.icon;
  const opponent = entry.opponentIsBot ? "Bot" : entry.opponentDisplayName ?? "Opponent";
  const role = entry.viewerRole !== null ? RANKED_ROLE_LABELS[entry.viewerRole] : null;

  // The one derived figure, and it is only derivable when BOTH halves are on
  // the row. A pre-rating result carries neither and gets no ladder line at
  // all — an em dash over an invented number.
  const hasRating = entry.ratingAfter !== null && entry.ratingDelta !== null;
  const ratingBefore = hasRating ? entry.ratingAfter! - entry.ratingDelta! : null;

  const delta = entry.ratingDelta;
  const deltaInk =
    delta === null || delta === 0
      ? LEAGUECRAFT_INK.faint
      : delta > 0
        ? VERDICT.win.ink
        : VERDICT.loss.ink;

  return (
    <li
      data-testid="ranked-match-row"
      data-outcome={entry.viewerOutcome}
      /* A record UNIT inside the ledger: one hairline in the sheet's own
         brown and one tile a shade deeper than the page. It is more structure
         than a Study row and less than a card — the same entry, written with
         a ruled box around it because it carries more facts. */
      className="lc-ranked-row group relative my-1.5 overflow-hidden rounded border py-1.5 pl-3 pr-2.5 transition-colors first:mt-0 last:mb-0"
      style={{ borderColor: "rgba(96,68,28,0.34)", background: LEAGUECRAFT_INK.inset }}
    >
      {/* The verdict edge — the ledger's marginal mark, drawn as a rule down
          the block rather than a nib beside a line. It is what lets a column
          of matches be counted without reading any of them. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: verdict.edge }}
      />

      <div className="flex items-center gap-2">
        <Icon
          className="h-3 w-3 shrink-0"
          style={{ color: verdict.ink }}
          aria-hidden="true"
        />
        <span
          className="w-[3.9rem] shrink-0 text-[10px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: verdict.ink, textShadow: LEAGUECRAFT_INK.press }}
        >
          {verdict.label}
        </span>
        {/* FIXED widths, not intrinsic ones. A column of records is read down
            the page, and a timeline that starts at a different x on every row
            because one opponent is called "Bot" and the next "Nocturnaut"
            reads as ragged rather than as a ledger. The name still truncates
            with its full value on the title. */}
        <span
          className="w-[8.5rem] shrink-0 truncate text-[13px] font-semibold"
          style={{ color: LEAGUECRAFT_INK.strong }}
          title={opponent}
        >
          {opponent}
        </span>
        <span
          className="w-[3.25rem] shrink-0 text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ color: LEAGUECRAFT_INK.brass }}
        >
          {role}
        </span>

        {/* THE MIDDLE. What used to be empty space is the record's payload. */}
        <QuestionTimeline
          className="min-w-0 flex-1"
          matchId={entry.matchId}
          roundCount={entry.finalRoundNumber}
          review={review}
        />

        <span
          data-testid="ranked-match-delta"
          className="w-[42px] shrink-0 text-right text-[14px] font-extrabold tabular-nums"
          style={{ color: deltaInk, textShadow: LEAGUECRAFT_INK.press }}
        >
          {delta === null ? "—" : delta > 0 ? `+${delta}` : String(delta)}
        </span>
      </div>

      {/* The quiet line. Everything here is context for the line above it, so
          it is one step smaller and one step fainter — never a second headline. */}
      {/* The quiet line. Relative age on the left, the ladder move under the
          delta it belongs to on the right, and nothing else — no stamp, no
          duration, no round count. Everything here is context for the line
          above it, so it is one step smaller and one step fainter. */}
      <div
        className="mt-0.5 flex items-baseline gap-2 text-[10.5px]"
        style={{ color: LEAGUECRAFT_INK.faint }}
      >
        <span data-testid="ranked-match-age" className="shrink-0">
          {relativeMatchAge(entry.completedAt)}
        </span>
        {terminal.note && <span className="shrink-0">· {terminal.note}</span>}
        <span className="min-w-0 flex-1" />
        {hasRating && (
          <span data-testid="ranked-match-ladder" className="shrink-0 tabular-nums">
            {ratingBefore} <span aria-hidden="true">→</span>{" "}
            <span className="font-semibold" style={{ color: LEAGUECRAFT_INK.body }}>
              {entry.ratingAfter}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}
