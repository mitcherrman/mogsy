// The signed-in user's own settled prediction result. Correctness comes ONLY
// from the backend settlement row (never computed locally); before settlement
// it shows a neutral "pending" state.
import { CheckCircle2, Circle, MinusCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime, OUTCOME_LABELS, outcomeCopy, sideName, winnerLabel } from "@/lib/combat-battles/lifecycle";
import type { MyPrediction, MyPredictionResult, PublicBattleStatus } from "@/lib/combat-battles/types";

const OUTCOME_ICON = {
  correct: CheckCircle2,
  incorrect: XCircle,
  push: MinusCircle,
  void: MinusCircle,
} as const;

export default function PersonalResult({
  status,
  myPrediction,
  myResult,
  leftName,
  rightName,
}: {
  status: PublicBattleStatus;
  myPrediction: MyPrediction;
  myResult: MyPredictionResult;
  leftName: string;
  rightName: string;
}) {
  // Only meaningful once the battle is revealed (or void).
  if (status !== "revealed" && status !== "void") return null;
  // The user didn't predict this battle.
  if (!myPrediction && !myResult) return null;

  // Revealed but settlement hasn't run yet — do NOT infer correctness.
  if (!myResult) {
    return (
      <Card className="border-primary/30 bg-card/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your prediction</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground" role="status">
          You backed{" "}
          <span className="font-medium text-foreground">
            {myPrediction ? sideName(myPrediction.predicted_side, leftName, rightName) : "—"}
          </span>
          . Pending settlement — your outcome and Arena Score will appear once this battle is settled.
        </CardContent>
      </Card>
    );
  }

  const Icon = OUTCOME_ICON[myResult.outcome] ?? Circle;
  return (
    <Card className="border-primary/30 bg-card/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
          Your prediction: {OUTCOME_LABELS[myResult.outcome]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground" role="status">{outcomeCopy(myResult.outcome, myResult.score_awarded)}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">You backed</dt>
          <dd className="font-medium">{sideName(myResult.predicted_side, leftName, rightName)}</dd>
          <dt className="text-muted-foreground">Winning side</dt>
          <dd className="font-medium">
            {myResult.winner_side ? winnerLabel(myResult.winner_side, leftName, rightName) : "—"}
          </dd>
          <dt className="text-muted-foreground">Arena Score awarded</dt>
          <dd className="font-medium tabular-nums">+{myResult.score_awarded}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          Settled {fmtDateTime(myResult.settled_at)} · {myResult.scoring_version}
        </p>
      </CardContent>
    </Card>
  );
}
