// Compact Arena Score summary for signed-in accounts. No global rank, no
// comparison to other users. Guests see a brief, non-aggressive benefit note.
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useMyArenaScore } from "@/hooks/useCombatBattles";

export default function ArenaScoreCard({ className }: { className?: string }) {
  const { user } = useAuth();
  const isAccount = Boolean(user && !user.is_anonymous);
  const { data, isLoading } = useMyArenaScore(isAccount);

  if (!isAccount) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-3 py-4 text-sm">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <span className="text-muted-foreground">
            <Link to="/auth?mode=signup" className="font-medium text-primary underline">
              Sign in
            </Link>{" "}
            to predict battles and build your Arena Score.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <div className="text-xs text-muted-foreground">Your Arena Score</div>
            <div className="text-2xl font-bold tabular-nums" aria-live="polite">
              {isLoading ? "…" : (data?.arena_score ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
        {data && (
          <div className="text-right text-xs text-muted-foreground">
            <div>{data.correct_predictions} correct</div>
            <div>{data.settled_predictions} settled</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
