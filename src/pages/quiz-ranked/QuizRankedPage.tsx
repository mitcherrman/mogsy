/**
 * Public Ranked route (/quiz/ranked, F1.5). Entry -> class selection -> queue
 * -> matched -> live match. Requires a verified non-anonymous account; fails
 * closed on backend disabled/ineligible/pool-unavailable via typed error
 * codes (never hidden-route security). No staff token or admin control is
 * ever exposed.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  BotDifficulty, createBotMatch, getActiveMatch, isAborted, RankedApiError,
} from "@/lib/ranked-public/client";
import { QuizRankedMatch } from "./QuizRankedMatch";
import { RankedMatchHistory } from "./RankedMatchHistory";
import { RankedClass, useRankedQueue } from "./useRankedQueue";

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "standard", label: "Standard" },
  { id: "hard", label: "Hard" },
];

const CLASSES: { id: RankedClass; label: string; blurb: string }[] = [
  { id: "tank", label: "Tank", blurb: "Durable — forgiving abilities and extra HP." },
  { id: "mage", label: "Mage", blurb: "Offensive burst — amplify your damage." },
  { id: "marksman", label: "Marksman", blurb: "Tempo — pressure the opponent's clock." },
];

function Frame({ children, size = "default" }: { children: React.ReactNode; size?: "default" | "wide" }) {
  return (
    <div className={`ranked-shell mx-auto p-4 space-y-4 ${size === "wide" ? "max-w-6xl" : "max-w-3xl"}`}
      data-testid="quiz-ranked">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="ranked-eyebrow">Competitive Mode</div>
          <h1 className="ranked-title text-2xl font-bold">Ranked Duel</h1>
        </div>
        <Link to="/quiz" className="text-sm text-muted-foreground underline">Back to Quiz</Link>
      </header>
      {children}
    </div>
  );
}

export default function QuizRankedPage() {
  const { user } = useAuth();
  const account = user && !(user as { is_anonymous?: boolean }).is_anonymous ? user : null;

  if (!account) {
    return (
      <Frame>
        <section data-testid="ranked-account-required" className="ranked-panel p-5">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Account required</div>
          <h2 className="mt-1 font-semibold">Sign in to play Ranked</h2>
          <p className="text-sm text-muted-foreground">Ranked Duel requires a signed-in account.</p>
          <Button asChild className="mt-3"><Link to="/auth">Sign in</Link></Button>
        </section>
      </Frame>
    );
  }
  return <RankedQueueGate viewerUserId={account.id} />;
}

function RankedQueueGate({ viewerUserId }: { viewerUserId: string }) {
  const q = useRankedQueue();
  const [botMatchId, setBotMatchId] = useState<string | null>(null);
  const [recoveredMatchId, setRecoveredMatchId] = useState<string | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("standard");
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);

  // Reconnect after a full page reload: an active bot match is NOT in the queue,
  // so queue recovery alone loses it. Account-bound discovery rediscovers the
  // caller's own active match (bot or human) and re-enters the same live view.
  // Best-effort: a disabled/ineligible backend just leaves the user at the menu.
  useEffect(() => {
    const controller = new AbortController();
    getActiveMatch(controller.signal)
      .then((found) => { if (found) setRecoveredMatchId(found.matchId); })
      .catch(() => { /* not recoverable — fall through to the normal menu */ })
      .finally(() => setRecoveryChecked(true));
    return () => controller.abort();
  }, []);

  // A freshly created bot match wins; otherwise re-enter a rediscovered active
  // match (bot or human), then a live queue match.
  const liveMatchId = botMatchId ?? recoveredMatchId
    ?? (q.state === "matched" ? q.matchId : null);

  async function startBotMatch() {
    setBotBusy(true);
    setBotError(null);
    try {
      const created = await createBotMatch(q.selectedClass ?? "tank", botDifficulty);
      setBotMatchId(created.matchId);
    } catch (e) {
      if (isAborted(e)) return;
      const msg = e instanceof RankedApiError
        ? (e.code === "RANKED_BOT_NOT_ELIGIBLE"
            ? "Bot playtest is limited to the ranked allowlist."
            : e.code === "RANKED_BOT_DISABLED"
              ? "Bot playtest is not currently enabled."
              : e.message)
        : "Could not start a bot match.";
      setBotError(msg);
    } finally {
      setBotBusy(false);
    }
  }

  // A launched / recovered / queued match reuses the exact live-match view.
  if (liveMatchId) {
    return <Frame size="wide"><QuizRankedMatch matchId={liveMatchId} viewerUserId={viewerUserId} /></Frame>;
  }

  // Don't flash the menu before the account-bound active-match check resolves.
  if (!recoveryChecked) {
    return (
      <Frame>
        <p data-testid="ranked-loading" className="text-sm text-muted-foreground">Loading Ranked…</p>
      </Frame>
    );
  }

  return (
    <Frame>
      {q.state === "recovering" && (
        <p data-testid="ranked-loading" className="text-sm text-muted-foreground">Loading Ranked…</p>
      )}

      {q.state === "unavailable" && (
        <section data-testid="ranked-unavailable" className="ranked-panel p-5">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Ranked</div>
          <h2 className="mt-1 font-semibold">Ranked is unavailable</h2>
          <p className="text-sm text-muted-foreground">{q.unavailableReason ?? "Not available right now."}</p>
        </section>
      )}

      {q.state === "fatal" && (
        <section data-testid="ranked-fatal-queue" className="rounded-lg border border-destructive bg-card p-4">
          <p className="text-sm text-destructive">{q.error}</p>
        </section>
      )}

      {(q.state === "selecting_class" || q.state === "joining") && (
        <section data-testid="ranked-class-select" className="ranked-panel p-4 space-y-4">
          <div className="space-y-1">
            <div className="ranked-eyebrow">Choose your class</div>
            <p className="text-xs text-muted-foreground">
              Your class sets your abilities and combat identity for the duel.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {CLASSES.map((c) => (
              <button key={c.id} type="button"
                data-testid={`ranked-class-${c.id}`}
                aria-pressed={q.selectedClass === c.id}
                onClick={() => q.setSelectedClass(c.id)}
                className={`min-h-[44px] rounded-lg border-2 p-3 text-left transition-colors motion-reduce:transition-none ${
                  q.selectedClass === c.id
                    ? "border-[#c9a84c] bg-[#c9a84c]/10 shadow-[0_0_18px_-6px_rgba(201,168,76,0.6)]"
                    : "border-white/10 bg-white/[0.03] hover:border-[#c9a84c]/40"}`}>
                <div className="font-semibold">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.blurb}</div>
              </button>
            ))}
          </div>

          {/* Ranked queue — real matchmaking. */}
          <div className="space-y-1.5">
            <Button data-testid="ranked-join" disabled={q.state === "joining"} onClick={q.join}
              className="w-full min-h-[44px]">
              {q.state === "joining" ? "Joining…" : "Join Ranked queue"}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Matches you against another player.
            </p>
            {q.error && <p className="text-xs text-destructive">{q.error}</p>}
          </div>

          {/* Distinct, clearly-labeled owner playtest path (bot). */}
          <div className="relative flex items-center gap-3 pt-1" aria-hidden>
            <span className="h-px flex-1 bg-white/10" />
            <span className="ranked-eyebrow ranked-eyebrow--cyan">or practice</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div data-testid="ranked-playtest-bot" className="ranked-subpanel p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[#e8c97a]">Play vs Bot</span>
              <span className="rounded border border-[#7fd6ef]/30 bg-[#7fd6ef]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#7fd6ef]">
                Playtest
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Practice the full duel against a deterministic bot. Placeholder questions.
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bot difficulty">
              {BOT_DIFFICULTIES.map((d) => (
                <button key={d.id} type="button"
                  data-testid={`ranked-bot-difficulty-${d.id}`}
                  aria-pressed={botDifficulty === d.id}
                  onClick={() => setBotDifficulty(d.id)}
                  className={`min-h-[36px] rounded-md border px-3 text-xs transition-colors motion-reduce:transition-none ${
                    botDifficulty === d.id
                      ? "border-[#7fd6ef]/60 bg-[#7fd6ef]/10 text-[#cdeefb]"
                      : "border-white/10 bg-white/[0.03] hover:border-[#7fd6ef]/40"}`}>
                  {d.label}
                </button>
              ))}
            </div>
            <Button variant="outline" data-testid="ranked-play-vs-bot"
              disabled={botBusy} onClick={startBotMatch} className="w-full min-h-[44px]">
              {botBusy ? "Starting…" : "Play vs Bot"}
            </Button>
            {botError && <p data-testid="ranked-bot-error" className="text-xs text-destructive">{botError}</p>}
          </div>

          {/* Best-effort recent results; renders nothing when empty/unavailable. */}
          <RankedMatchHistory />
        </section>
      )}

      {(q.state === "waiting" || q.state === "cancelling") && (
        <section data-testid="ranked-waiting" className="ranked-panel p-5 space-y-3">
          <div role="status" className="space-y-1">
            <div className="ranked-eyebrow ranked-eyebrow--cyan animate-pulse motion-reduce:animate-none">
              Matchmaking
            </div>
            <h2 className="font-semibold">Searching for an opponent…</h2>
            <p className="text-sm text-muted-foreground">
              Queued as {q.status?.classId ?? q.selectedClass}. You'll be matched with another player.
            </p>
          </div>
          <Button variant="outline" data-testid="ranked-cancel" disabled={q.state === "cancelling"}
            onClick={q.cancel} className="min-h-[44px]">
            {q.state === "cancelling" ? "Cancelling…" : "Cancel"}
          </Button>
        </section>
      )}
    </Frame>
  );
}
