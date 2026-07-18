/**
 * Public Ranked route (/quiz/ranked, F1.5). Entry -> class selection -> queue
 * -> matched -> live match. Requires a verified non-anonymous account; fails
 * closed on backend disabled/ineligible/pool-unavailable via typed error
 * codes (never hidden-route security). No staff token or admin control is
 * ever exposed.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { QuizRankedMatch } from "./QuizRankedMatch";
import { RankedClass, useRankedQueue } from "./useRankedQueue";

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
