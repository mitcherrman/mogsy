/**
 * MALT — RANKED MATCH RECORD (design exploration, fixture-only).
 *
 * A Ranked duel is not a study session and should not read as one. A practice
 * row answers "how did that set go"; a Ranked row answers "who did I play,
 * what did it cost me, and where did it leave me on the ladder". That is more
 * facts, and they have a hierarchy — so this is a bordered UNIT rather than
 * another line in the table, while staying inside the same ledger shell,
 * typography and ink as the study rows above it.
 *
 * NOT SHIPPED AS A PRODUCT SURFACE. `Quiz.tsx` passes no Ranked entries into
 * the record; only `/dev/lobby-preview` does, from frozen Timmy fixtures.
 * Ranked history proper is Phase B — this exists so the DESIGN can be judged
 * before the wiring is built.
 *
 * EVERY FIELD HERE IS ON THE WIRE TODAY
 * ─────────────────────────────────────
 * From `MatchHistoryEntryView` (`ranked_duel.match_history.v1`):
 * `viewerOutcome`, `opponentDisplayName`, `opponentIsBot`, `viewerRole`,
 * `completedAt`, `finalRoundNumber`, `terminalReason`, `ratingDelta`,
 * `ratingAfter`. The rating a match STARTED from is the one derived value,
 * and only when both `ratingAfter` and `ratingDelta` are present — otherwise
 * it is withheld rather than guessed.
 *
 * WHAT IS DELIBERATELY ABSENT, AND WHY
 * ────────────────────────────────────
 * No per-round W/L strip: the history contract carries `finalRoundNumber` —
 * the round the match ENDED on — and no round-by-round result, so a strip
 * would be invented. `finalRoundNumber` is therefore printed as match LENGTH
 * ("5 rounds"), never as a score like "3-2", which is a different fact the
 * backend does not send. No champion art: Ranked records a class and a role,
 * not a champion. No analytics verdicts ("DOMINANT", "COMEBACK") — nothing
 * computes them. No rank emblem or tier: the lobby's centre parchment already
 * carries the account's standing once, and once is the rule.
 *
 * NOT ACTIONABLE YET. There is no match review to open, so the unit is a
 * plain list item: no button role, no tab stop, no pointer cursor. Its hover
 * warms the border the way a record that COULD open would, which is the most
 * a surface should promise before the destination exists.
 */
import { Flag, MinusCircle, Swords } from "lucide-react";
import { LEDGER_INK } from "@/components/quiz/leaguecraft-ink";
import { RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import type { MatchHistoryEntryView } from "@/lib/ranked-public/contracts";

/** The verdict's own ink. Deep enough to sit on the dark plate, and the same
 *  jade/rose the study rows already tint accuracy with — one palette. */
const VERDICT = {
  win: { label: "Victory", text: "text-emerald-300", edge: "#1f7a52" },
  loss: { label: "Defeat", text: "text-rose-300", edge: "#8c2f3a" },
  draw: { label: "Draw", text: "text-muted-foreground", edge: "#5a6270" },
} as const;

/** How the match ended, when that is worth saying. A duel played out is the
 *  norm and says nothing; a forfeit or a void one is a fact about the record. */
const TERMINAL = {
  combat: { icon: Swords, note: null as string | null },
  forfeit: { icon: Flag, note: "forfeit" },
  no_contest: { icon: MinusCircle, note: "no contest" },
} as const;

function relativeTime(iso: string): string {
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  // A stamp at or ahead of the clock reads "just now" rather than "0m ago".
  // Server time can legitimately run a little ahead of the reader's.
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export default function RankedMatchRow({ entry }: { entry: MatchHistoryEntryView }) {
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
  const deltaTone =
    delta === null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-emerald-300"
        : "text-rose-300";

  return (
    <li
      data-testid="ranked-match-row"
      data-outcome={entry.viewerOutcome}
      className="group relative my-1.5 overflow-hidden rounded-md border py-2 pl-3 pr-2.5 transition-colors first:mt-0 last:mb-0 hover:border-[#c9a84c]/40"
      style={{ borderColor: LEDGER_INK.rule, background: LEDGER_INK.inset }}
    >
      {/* The verdict edge — the ledger's marginal mark, drawn as a rule down
          the block rather than a nib beside a line. It is what lets a column
          of matches be counted without reading any of them. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: verdict.edge }}
      />

      <div className="flex items-baseline gap-2">
        <Icon
          className={`h-3 w-3 shrink-0 self-center ${verdict.text} opacity-80`}
          aria-hidden="true"
        />
        <span
          className={`shrink-0 text-[10px] font-extrabold uppercase tracking-[0.18em] ${verdict.text}`}
        >
          {verdict.label}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/90"
          title={opponent}
        >
          {opponent}
        </span>
        {role && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[#c9a84c]/70">
            {role}
          </span>
        )}
        <span
          data-testid="ranked-match-delta"
          className={`w-[42px] shrink-0 text-right text-[14px] font-extrabold tabular-nums ${deltaTone}`}
        >
          {delta === null ? "—" : delta > 0 ? `+${delta}` : String(delta)}
        </span>
      </div>

      {/* The quiet line. Everything here is context for the line above it, so
          it is one step smaller and one step fainter — never a second headline. */}
      <div className="mt-0.5 flex items-baseline gap-2 text-[10.5px] text-muted-foreground/80">
        <span className="shrink-0 tabular-nums">
          {entry.finalRoundNumber} round{entry.finalRoundNumber === 1 ? "" : "s"}
        </span>
        {terminal.note && (
          <span className="shrink-0 text-[#c9a84c]/70">· {terminal.note}</span>
        )}
        <span className="min-w-0 flex-1" />
        {hasRating && (
          <span data-testid="ranked-match-ladder" className="shrink-0 tabular-nums">
            {ratingBefore} <span aria-hidden="true">→</span>{" "}
            <span className="font-semibold text-foreground/75">{entry.ratingAfter}</span>
          </span>
        )}
        <span className="w-[52px] shrink-0 text-right">{relativeTime(entry.completedAt)}</span>
      </div>
    </li>
  );
}
