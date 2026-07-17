/**
 * Pre-run entry surfaces: metadata summary, official/practice start
 * buttons, the signed-out official gate, and the cosmetic countdown.
 */

import { DsaSession } from "./dailyScoreAttackMachine";
import { DsaToday } from "./dailyScoreAttackTypes";

type EntryProps = {
  meta: DsaToday;
  session: DsaSession;
  onStartOfficial: () => void;
  onStartPractice: () => void;
};

export function DailyScoreAttackEntry({
  meta,
  session,
  onStartOfficial,
  onStartPractice,
}: EntryProps) {
  const official = meta.official_run;
  const officialConsumed = official !== null && official.status !== "active";
  const officialActive = official !== null && official.status === "active";
  const isAccount = session === "account";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Daily Score Attack — {meta.challenge_date}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta.question_count} questions · {meta.run_duration_seconds} second global timer ·
          one official run per day (UTC reset in{" "}
          {Math.floor(meta.seconds_until_reset / 3600)}h{" "}
          {Math.floor((meta.seconds_until_reset % 3600) / 60)}m)
        </p>
      </div>

      {isAccount ? (
        <>
          {officialConsumed && (
            <p className="text-sm text-muted-foreground" data-testid="dsa-official-consumed">
              Today's official run is complete (score {official?.score.toLocaleString()}).
            </p>
          )}
          <button
            type="button"
            data-testid="dsa-start-official"
            onClick={onStartOfficial}
            className="min-h-12 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {officialActive
              ? "Resume official run"
              : officialConsumed
                ? "View official results"
                : "Start official run"}
          </button>
          <button
            type="button"
            data-testid="dsa-start-practice"
            onClick={onStartPractice}
            disabled={!officialConsumed}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-accent disabled:opacity-50"
          >
            Practice run {officialConsumed ? "" : "(finish the official run first)"}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm" data-testid="dsa-signin-gate">
            <p className="font-medium">Sign in required for the official scored run</p>
            <p className="mt-1 text-muted-foreground">
              The one-per-day official attempt is tied to your account. Sign in before
              starting to keep your score, streak, and XP.
            </p>
          </div>
          <button
            type="button"
            data-testid="dsa-start-practice"
            onClick={onStartPractice}
            className="min-h-12 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            Play a practice run
          </button>
        </>
      )}
    </div>
  );
}

export function DailyScoreAttackCountdown({
  value,
  reducedMotion,
}: {
  value: number;
  reducedMotion: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-16" role="status">
      <div
        data-testid="dsa-countdown"
        className={`text-7xl font-black tabular-nums ${
          reducedMotion ? "" : "animate-in zoom-in duration-200"
        }`}
        key={value}
      >
        {value}
      </div>
      <p className="text-sm text-muted-foreground">Get ready — the timer starts at 0</p>
    </div>
  );
}
