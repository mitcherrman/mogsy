/**
 * MALT — the STUDY RECORD, as one ledger.
 *
 * The account's completed quiz sessions off `GET /api/quiz/history`, rendered
 * once and mounted twice: by the workspace's History pane on `/quiz`, and by
 * the standalone `/lol/history` page. Same body, same states, same figures —
 * so the two surfaces cannot tell the reader different things about the same
 * record, and a future Daily/Ranked reconciliation has one file to change.
 *
 * PRESENTATION ONLY. It fetches nothing. `/quiz` already holds this payload
 * (the hub's Recent Studies preview reads the same object) and hands it
 * straight down, so opening History on the lobby costs no request at all;
 * `/lol/history` keeps its own loader and passes the result in the same shape.
 *
 * WHAT A ROW IS — AND WHAT PHASE A DOES NOT CLAIM
 * ───────────────────────────────────────────────
 * `quiz_sessions` is written from two places: a practice set (`mode:
 * "standard"`, carrying the set name as its category) and the Daily Challenge
 * (`mode: "daily"`). Older backfilled rows carry `mode: "legacy"`. The Ranked
 * duel writes NONE of them — it has its own `/api/ranked/history` contract —
 * so no row here is ever a Ranked row, and this ledger never says it is.
 *
 * `daily` is labelled DAILY and everything else is labelled by the truest
 * thing the row actually carries: its category (the practice set's own name),
 * falling back to "Practice" when there is none. That is deliberately NOT a
 * claim about the final Daily architecture — the DSA reconciliation is a later
 * phase, and until it lands a Daily session genuinely IS a quiz session in
 * this stream. Naming it plainly is the honest reading of the data we have.
 *
 * ENTITLEMENT IS PART OF THE RECORD, NOT A FOOTNOTE
 * ─────────────────────────────────────────────────
 * The endpoint serves a Free account its last `free_limit` sessions and flags
 * the truncation (`limited`, `total_count`, `upsell_message`). A ledger that
 * printed ten rows and said nothing would be telling a player with forty
 * sessions that they have ten. So the scope is stated with the rows, and when
 * the backend could not resolve entitlement at all (`entitlement_status:
 * "error"`) that is said too rather than silently read as "Free".
 */
import { useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEDGER_INK } from "@/components/quiz/leaguecraft-ink";
import { LedgerRow, WorkspaceNote } from "@/components/quiz/workspace/primitives";
import RankedMatchRow from "@/components/quiz/workspace/RankedMatchRow";
import type { QuizHistoryEntry, QuizHistoryResponse } from "@/lib/quiz/api";
import type { MatchHistoryEntryView } from "@/lib/ranked-public/contracts";

/** Backend timestamps are UTC without a zone suffix. */
function parseStamp(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatSessionDate(iso?: string | null): string {
  const d = parseStamp(iso);
  if (!d) return iso ?? "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(seconds?: number | null): string | null {
  if (seconds == null || seconds < 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * What the row is called.
 *
 * "Daily" and not "Daily Challenge": the lobby deliberately withholds the
 * Daily Challenge MODULE, and spelling out the module's full name in a
 * history row reads as that entrance being back on the page. The short form
 * names the session and claims nothing — it is the same label the Recent
 * Studies preview uses, so the preview and the full ledger agree.
 */
export function sessionLabel(entry: QuizHistoryEntry): string {
  if (entry.mode === "daily") return "Daily";
  return "Practice";
}

/** Good / mid / rough accuracy. Analytics tinting only — these are study
 *  sessions, never head-to-head results, so this is not a W/L colour. */
function accuracyTone(acc: number): string {
  if (acc >= 70) return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (acc >= 40) return "border-cyan-400/30 bg-cyan-400/5 text-cyan-200";
  return "border-rose-400/30 bg-rose-400/5 text-rose-300";
}

export default function StudyHistoryLedger({
  history,
  loading = false,
  error = null,
  onRetry,
  onStartPractice,
  rankedEntries,
  signInHref,
  className = "",
}: {
  history: QuizHistoryResponse | null;
  loading?: boolean;
  error?: string | null;
  /** Offer a retry. Omit where the host reloads by other means. */
  onRetry?: () => void;
  /**
   * The ONE call to action on an empty record, folded in from the Recent
   * Studies card this ledger replaced.
   *
   * It opens PRACTICE and never a Ranked match: a Ranked duel writes no row
   * into this stream, so offering one here would send the reader to the one
   * activity whose result could never fill the thing that is empty. Omit it
   * (the standalone page does) and the empty state falls back to a link to
   * the lobby, which is the only useful move from off-page.
   */
  onStartPractice?: () => void;
  /**
   * PHASE B PREVIEW — Ranked duels in the same record.
   *
   * Undefined everywhere in production: `Quiz.tsx` holds real Ranked history
   * (the centre parchment's ledger reads it) and deliberately does NOT hand it
   * here, because Ranked full history is Phase B and this is a design pass.
   * `/dev/lobby-preview` supplies frozen Timmy matches so the treatment can be
   * judged beside the study rows it has to live with.
   *
   * When absent, everything below behaves exactly as it did: no filter, no
   * Ranked rows, one stream.
   */
  rankedEntries?: readonly MatchHistoryEntryView[];
  /**
   * Where an unauthenticated reader signs in. Supplied by the lobby, whose
   * guest error ("sign-in required") is a STATE rather than a failure; the
   * standalone page omits it and shows its own retryable message, which is
   * the right reading there because that page guarantees a guest token first.
   */
  signInHref?: string;
  className?: string;
}) {
  /**
   * ONE RECORD, THREE READINGS.
   *
   * The filter only exists when there is something to filter — production
   * passes no Ranked entries, so the record renders exactly one stream and no
   * chips at all. When both are present, `all` INTERLEAVES them by time
   * rather than stacking two lists, because that is the claim the Leaguecraft
   * Record makes: one history, whatever you were doing.
   *
   * Hooks first and unconditionally — every state below this is an early
   * return, and a hook after one of them is a hook that sometimes runs.
   */
  const hasRanked = !!rankedEntries && rankedEntries.length > 0;
  const [stream, setStream] = useState<"all" | "study" | "ranked">("all");
  const studyRows = history?.results ?? [];

  const timeline = useMemo(() => {
    const study = studyRows.map((entry) => ({
      kind: "study" as const,
      key: `s-${entry.session_id}`,
      at: Date.parse(
        String(entry.completed_at || entry.started_at || entry.date).replace(" ", "T"),
      ),
      entry,
    }));
    const ranked = (rankedEntries ?? []).map((entry) => ({
      kind: "ranked" as const,
      key: `r-${entry.matchId}`,
      at: Date.parse(String(entry.completedAt).replace(" ", "T")),
      entry,
    }));
    const picked =
      stream === "study" ? study : stream === "ranked" ? ranked : [...study, ...ranked];
    // Newest first. An unparseable stamp sorts last rather than to the top,
    // so one bad row cannot claim to be the most recent thing you did.
    return picked.sort((a, b) => (Number.isNaN(b.at) ? -1 : b.at) - (Number.isNaN(a.at) ? -1 : a.at));
  }, [rankedEntries, stream, studyRows]);

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`} data-testid="study-history-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const needsAuth = !!error && !!signInHref && /401|sign.?in|session/i.test(error);
  if (needsAuth) {
    return (
      <div className={`flex flex-col items-start gap-2 py-4 ${className}`} data-testid="study-history-auth">
        <p className="text-sm text-muted-foreground">
          Sign in to save and review your study record.
        </p>
        <Button asChild size="sm" variant="outline" className="border-cyan-400/30 text-cyan-200">
          <Link to={signInHref!}>Sign in</Link>
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`py-6 text-center text-muted-foreground ${className}`} data-testid="study-history-error">
        <MogzyMascot pose="awkwardSmile" decorative className="mx-auto mb-3 h-24 w-24" />
        <p className="text-sm">{error}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const results = studyRows;

  if (results.length === 0 && !hasRanked) {
    return (
      <div className={`py-8 text-center ${className}`} data-testid="study-history-empty">
        <MogzyMascot pose="sleeping" decorative className="mx-auto mb-3 h-24 w-24" />
        <p className="text-sm text-muted-foreground">No completed quizzes yet.</p>
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          Finish a practice set to start your record.
        </p>
        {/* ONE call to action, and this is the only empty state left on the
            lobby — the Recent Studies card that used to carry a second one is
            gone. In the lobby it starts practice in place; off-page there is
            nothing to start, so it points at the lobby instead. */}
        {onStartPractice ? (
          <Button
            size="sm"
            className="mt-3"
            data-testid="study-history-start-practice"
            onClick={onStartPractice}
          >
            <GraduationCap className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Start practising
          </Button>
        ) : (
          <Button asChild size="sm" className="mt-3">
            <Link to="/quiz">Play a quiz</Link>
          </Button>
        )}
      </div>
    );
  }

  const totalCount = history?.total_count ?? results.length;
  const limited = !!history?.limited;
  const entitlementUnknown = history?.entitlement_status === "error";

  /**
   * The summary the Recent Studies card used to carry, folded in as ONE line
   * rather than re-erected as three tiles above rows that already state the
   * same numbers.
   *
   * Both figures are computed over the rows actually on screen, and the line
   * says so when that is a window rather than the whole record — the old card
   * averaged its three visible rows and labelled the result "Avg acc", which
   * read as a career average and was not one.
   */
  const accuracies = results.map((r) => Number(r.accuracy || 0));
  const avgAccuracy = accuracies.length
    ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
    : null;
  const bestAccuracy = accuracies.length ? Math.round(Math.max(...accuracies)) : null;

  return (
    <div className={className} data-testid="study-history">
      {/* The scope line. It is ABOVE the rows on purpose: a reader has to know
          what window they are looking at before they read it, not after. */}
      {/* The stream chips. Present only when the record actually holds more
          than one kind of thing — a filter over a single stream is furniture. */}
      {hasRanked && (
        <div
          role="group"
          aria-label="Filter the record"
          data-testid="history-stream-filter"
          className="mb-1.5 flex items-center gap-1"
        >
          {(["all", "study", "ranked"] as const).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`history-stream-${id}`}
              aria-pressed={stream === id}
              onClick={() => setStream(id)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                stream === id
                  ? "border-[#c9a84c]/45 bg-[#c9a84c]/12 text-[#e2c877]"
                  : "border-[#c9a84c]/15 text-muted-foreground hover:border-[#c9a84c]/35 hover:text-[#e2c877]/80"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-1">
        {stream === "ranked" ? (
          <WorkspaceNote testId="study-history-scope">
            Showing your last{" "}
            <span className="font-semibold tabular-nums text-foreground/80">
              {rankedEntries?.length ?? 0}
            </span>{" "}
            ranked duels.
          </WorkspaceNote>
        ) : (
        <WorkspaceNote testId="study-history-scope">
          {limited ? (
            <>
              Showing your last{" "}
              <span className="font-semibold tabular-nums text-foreground/80">{results.length}</span>{" "}
              of{" "}
              <span className="font-semibold tabular-nums text-foreground/80">{totalCount}</span>{" "}
              sessions
            </>
          ) : (
            <>
              <span className="font-semibold tabular-nums text-foreground/80">{totalCount}</span>{" "}
              session{totalCount === 1 ? "" : "s"} on record
            </>
          )}
          {avgAccuracy !== null && (
            <>
              {" · "}
              <span className="font-semibold tabular-nums text-foreground/80">{avgAccuracy}%</span>{" "}
              average
              {" · "}
              <span className="font-semibold tabular-nums text-foreground/80">{bestAccuracy}%</span>{" "}
              best
              {limited ? " over these" : ""}
            </>
          )}
          .
        </WorkspaceNote>
        )}
        {entitlementUnknown && (
          <WorkspaceNote testId="study-history-entitlement-unknown">
            Pro status could not be confirmed — showing the Free window.
          </WorkspaceNote>
        )}
      </div>

      {/* ONE list, whatever the rows are. The study rows stay flush and
          hairline-ruled; a Ranked unit carries its own border and buys a
          little air with a margin of its own, so the two rhythms sit together
          without either being restyled into the other. */}
      <ul className="w-full">
        {timeline.map((item) => {
          if (item.kind === "ranked") {
            return <RankedMatchRow key={item.key} entry={item.entry} />;
          }
          const entry = item.entry;
          const acc = Math.round(Number(entry.accuracy || 0));
          const duration = formatDuration(entry.duration_seconds);
          return (
            <LedgerRow key={item.key} testId="study-history-row">
              <div className="flex items-center gap-2 text-[11.5px]">
                <span
                  className={`w-[38px] shrink-0 rounded border px-1 py-px text-center text-[10px] font-bold tabular-nums ${accuracyTone(acc)}`}
                >
                  {acc}%
                </span>
                <span className="shrink-0 font-semibold text-foreground/85">
                  {sessionLabel(entry)}
                </span>
                {entry.category && (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {entry.category}
                  </span>
                )}
                {!entry.category && <span className="min-w-0 flex-1" />}
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/80">
                  {entry.score}/{entry.total_questions}
                </span>
                <span
                  className="hidden w-[52px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground/80 sm:inline"
                  title="Time taken"
                >
                  {duration ?? "—"}
                </span>
                <span className="shrink-0 text-right text-[10.5px] text-muted-foreground/70">
                  {formatSessionDate(entry.completed_at || entry.started_at || entry.date)}
                </span>
              </div>
            </LedgerRow>
          );
        })}
      </ul>

      {/* The Free cap, stated where the rows stop. Unchanged monetisation —
          the same message and the same destination the standalone page has
          always shown, printed as a ledger note rather than as a card. */}
      {limited && (
        <div
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2"
          data-testid="study-history-upsell"
          style={{ borderColor: LEDGER_INK.ruleStrong, background: LEDGER_INK.inset }}
        >
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {history?.upsell_message ||
              `Free accounts save your last ${history?.free_limit ?? 10} results. Upgrade to Mogsy Pro to unlock your full quiz history.`}
          </p>
          <Button asChild size="sm" variant="outline" className="h-7 border-[#c9a84c]/40 text-[11px] text-[#e2c877]">
            <Link to="/lol/pro">Unlock Full History</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
