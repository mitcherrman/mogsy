/**
 * RL2 — the selected role's Ranked record, beside the PLAY seal.
 *
 * Wins, games and win rate for the role the carousel is currently on. It sits
 * to the LEFT of the seal and re-reads on every role change, so the figure a
 * player looks at is always the figure for the role they are about to queue.
 *
 * THE SCOPE IS ON THE LABEL'S FACE, NOT IN A FOOTNOTE
 * ───────────────────────────────────────────────────
 * These counts come from the account's match-history rows, and that read is
 * bounded — `GET /api/ranked/history` caps at 50 and offers no offset, and the
 * lobby asks for 20. A LIFETIME role record is therefore not derivable, and
 * this component never claims one.
 *
 * It states that the way the rest of the lobby already states it: the heading
 * reads RECENT, and the words "total", "lifetime", "all-time" and "career"
 * appear nowhere. A "Last N ranked matches" line under the figure was tried
 * and removed — the owner ruled that footnote out for the left ledger, and a
 * second surface re-introducing it would put the lobby back in two minds
 * about how a windowed record is named.
 *
 * A ROLE WITH NO ROWS HAS NO RECORD
 * ─────────────────────────────────
 * `tallyRoleMastery` gives a role with no rows NO entry, and that is rendered
 * as an em dash, never as 0/0 or 0% — a player who has never queued Support
 * has not lost at Support. The same branch covers the pre-R1 rows whose
 * `viewerRole` is null: they are counted for no role and are not back-filled
 * from the recorded legacy class.
 */
import { LEAGUECRAFT_INK as INK } from "@/components/quiz/leaguecraft-ink";
import { RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import type { RankedRole } from "@/lib/ranked-public/roles";
import type { RoleMastery } from "@/lib/ranked-public/roleRecords";

export default function RoleQueueRecord({
  role,
  mastery,
  loading = false,
  className = "",
}: {
  role: RankedRole;
  /** Absent for a role with no rows in the window. NOT a zeroed record. */
  mastery?: RoleMastery;
  loading?: boolean;
  className?: string;
}) {
  const label = RANKED_ROLE_LABELS[role];
  const has = !loading && !!mastery && mastery.games > 0;

  return (
    <div
      className={`min-w-0 text-center lg:text-right ${className}`}
      data-testid="role-queue-record"
      data-role={role}
      data-state={loading ? "loading" : has ? "ready" : "empty"}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: INK.brass }}
      >
        Recent · {label}
      </div>

      {/* wins / games, as one figure. The slash is the whole relationship, so
          no word is needed to explain it. */}
      <div
        className="mt-0.5 whitespace-nowrap text-xl font-extrabold leading-none tracking-tight tabular-nums"
        style={{ color: INK.strong, textShadow: INK.press }}
        data-testid="role-queue-record-figure"
      >
        {has ? (
          <>
            {mastery!.wins}
            <span className="px-[0.15em] text-base font-bold" style={{ color: INK.faint }}>
              /
            </span>
            {mastery!.games}
          </>
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </div>

      <div
        className="mt-0.5 text-[11px] font-semibold tabular-nums"
        style={{ color: INK.body }}
        data-testid="role-queue-record-rate"
      >
        {has ? `${mastery!.winRatePercent}% win rate` : "No recent games"}
      </div>
    </div>
  );
}
