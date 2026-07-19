/**
 * Public Ranked route (/quiz/ranked, F1.5). Entry -> class selection -> queue
 * -> matched -> live match. Requires a verified non-anonymous account; fails
 * closed on backend disabled/ineligible/pool-unavailable via typed error
 * codes (never hidden-route security). No staff token or admin control is
 * ever exposed.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  BotDifficulty, createBotMatch, isAborted, RankedApiError,
} from "@/lib/ranked-public/client";
import { QuizRankedMatch } from "./QuizRankedMatch";
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

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4" data-testid="quiz-ranked">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ranked Duel</h1>
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
        <section data-testid="ranked-account-required" className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Sign in to play Ranked</h2>
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
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("standard");
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);

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

  // A launched bot match reuses the exact live-match view (no separate UI).
  if (botMatchId) {
    return <Frame><QuizRankedMatch matchId={botMatchId} viewerUserId={viewerUserId} /></Frame>;
  }

  if (q.state === "matched" && q.matchId) {
    return <Frame><QuizRankedMatch matchId={q.matchId} viewerUserId={viewerUserId} /></Frame>;
  }

  return (
    <Frame>
      {q.state === "recovering" && (
        <p data-testid="ranked-loading" className="text-sm text-muted-foreground">Loading Ranked…</p>
      )}

      {q.state === "unavailable" && (
        <section data-testid="ranked-unavailable" className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Ranked is unavailable</h2>
          <p className="text-sm text-muted-foreground">{q.unavailableReason ?? "Not available right now."}</p>
        </section>
      )}

      {q.state === "fatal" && (
        <section data-testid="ranked-fatal-queue" className="rounded-lg border border-destructive bg-card p-4">
          <p className="text-sm text-destructive">{q.error}</p>
        </section>
      )}

      {(q.state === "selecting_class" || q.state === "joining") && (
        <section data-testid="ranked-class-select" className="space-y-3">
          <h2 className="font-semibold">Choose your class</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {CLASSES.map((c) => (
              <button key={c.id} type="button"
                data-testid={`ranked-class-${c.id}`}
                aria-pressed={q.selectedClass === c.id}
                onClick={() => q.setSelectedClass(c.id)}
                className={`min-h-[44px] rounded-lg border-2 p-3 text-left ${
                  q.selectedClass === c.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                <div className="font-semibold">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.blurb}</div>
              </button>
            ))}
          </div>
          <Button data-testid="ranked-join" disabled={q.state === "joining"} onClick={q.join} className="w-full min-h-[44px]">
            {q.state === "joining" ? "Joining…" : "Join queue"}
          </Button>
          {q.error && <p className="text-xs text-destructive">{q.error}</p>}

          <div data-testid="ranked-playtest-bot"
            className="rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Playtest vs Bot</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Playtest · Placeholder questions
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bot difficulty">
              {BOT_DIFFICULTIES.map((d) => (
                <button key={d.id} type="button"
                  data-testid={`ranked-bot-difficulty-${d.id}`}
                  aria-pressed={botDifficulty === d.id}
                  onClick={() => setBotDifficulty(d.id)}
                  className={`min-h-[36px] rounded-md border px-3 text-xs ${
                    botDifficulty === d.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                  {d.label}
                </button>
              ))}
            </div>
            <Button variant="outline" data-testid="ranked-play-vs-bot"
              disabled={botBusy} onClick={startBotMatch} className="w-full min-h-[44px]">
              {botBusy ? "Starting…" : "Play vs Bot — Playtest"}
            </Button>
            {botError && <p data-testid="ranked-bot-error" className="text-xs text-destructive">{botError}</p>}
          </div>
        </section>
      )}

      {(q.state === "waiting" || q.state === "cancelling") && (
        <section data-testid="ranked-waiting" className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div role="status" className="space-y-1">
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
