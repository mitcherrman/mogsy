// Prediction interaction for every lifecycle state. Verified accounts can pick a
// side and change it while open; guests/anonymous are gated to sign-in without
// losing their intended pick; locked/revealed/void are read-only. The backend
// response is the source of truth (including lock-race 409 handling).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSubmitPrediction } from "@/hooks/useCombatBattles";
import { BattlesApiError } from "@/lib/combat-battles/api";
import { fmtDateTime, sideName } from "@/lib/combat-battles/lifecycle";
import type { MyPrediction, PublicBattleStatus, Side } from "@/lib/combat-battles/types";

type Props = {
  slug: string;
  status: PublicBattleStatus;
  myPrediction: MyPrediction;
  leftName: string;
  rightName: string;
  openAt: string | null;
  lockAt: string | null;
  onServerStateChanged: () => void;
};

export default function PredictionPanel(props: Props) {
  const { slug, status, myPrediction, leftName, rightName, openAt, lockAt, onServerStateChanged } = props;
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAccount = Boolean(user && !user.is_anonymous);
  const [pending, setPending] = useState<Side | null>(null);
  const submit = useSubmitPrediction(slug);

  const current = myPrediction?.predicted_side ?? null;

  async function choose(side: Side) {
    if (!isAccount) {
      navigate(`/auth?mode=signup&returnTo=${encodeURIComponent(`/lol/combat-battles/${slug}`)}`);
      return;
    }
    setPending(side);
    try {
      const res = await submit.mutateAsync(side);
      const msg =
        res.outcome === "created" ? "Prediction placed"
          : res.outcome === "changed" ? "Prediction updated"
            : "Prediction unchanged";
      toast({ title: msg, description: `You backed ${sideName(side, leftName, rightName)}.` });
    } catch (err) {
      if (err instanceof BattlesApiError && err.isWindowClosed) {
        toast({
          title: "Predictions have locked",
          description: "This battle just locked — your pick wasn't recorded.",
          variant: "destructive",
        });
        onServerStateChanged();
      } else {
        toast({
          title: "Couldn't save prediction",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setPending(null);
    }
  }

  // --- non-open states ---------------------------------------------------- //
  if (status === "scheduled") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Predictions open {openAt ? `on ${fmtDateTime(openAt)}` : "soon"}.
      </p>
    );
  }
  if (status === "locked") {
    return (
      <div className="space-y-1" role="status">
        <p className="text-sm font-medium">Predictions are locked.</p>
        <p className="text-sm text-muted-foreground">
          {current
            ? `Your pick: ${sideName(current, leftName, rightName)}. `
            : "You didn't predict this battle. "}
          The result hasn't been revealed yet.
        </p>
      </div>
    );
  }
  if (status === "revealed" || status === "void") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {current
          ? `You backed ${sideName(current, leftName, rightName)}.`
          : "You didn't predict this battle."}
      </p>
    );
  }

  // --- open ---------------------------------------------------------------- //
  return (
    <div className="space-y-3">
      {!isAccount && (
        <p className="text-sm text-muted-foreground">
          <Link to="/auth?mode=signup" className="font-medium text-primary underline">
            Create a free account
          </Link>{" "}
          to back a side and earn Arena Score.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Choose a side to predict">
        {(["left", "right"] as Side[]).map((side) => {
          const selected = current === side;
          const isPending = pending === side;
          return (
            <Button
              key={side}
              type="button"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              disabled={pending !== null}
              onClick={() => choose(side)}
              className="h-auto flex-col gap-1 py-3"
            >
              <span className="text-xs uppercase text-muted-foreground">{side}</span>
              <span className="flex items-center gap-1.5 font-semibold">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {sideName(side, leftName, rightName)}
              </span>
              {selected && <span className="text-xs">Your pick</span>}
            </Button>
          );
        })}
      </div>
      {lockAt && (
        <p className="text-xs text-muted-foreground">
          You can change your pick until predictions lock on {fmtDateTime(lockAt)}.
        </p>
      )}
    </div>
  );
}
