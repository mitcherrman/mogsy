// Battle detail — the central MVP experience. Every authoritative value comes
// from the server projection: lifecycle status, community split, the frozen
// result (only after reveal), and the user's own settled outcome.
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Swords } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import ArenaScoreCard from "@/components/combat-battles/ArenaScoreCard";
import CommunitySplit from "@/components/combat-battles/CommunitySplit";
import Countdown from "@/components/combat-battles/Countdown";
import PersonalResult from "@/components/combat-battles/PersonalResult";
import PredictionPanel from "@/components/combat-battles/PredictionPanel";
import RevealedResult from "@/components/combat-battles/RevealedResult";
import SideConfig from "@/components/combat-battles/SideConfig";
import StatusBadge from "@/components/combat-battles/StatusBadge";
import { useBattleDetail } from "@/hooks/useCombatBattles";
import { FORMAT_EXPLANATION, fmtDateTime, nextBoundary } from "@/lib/combat-battles/lifecycle";
import { BattlesApiError } from "@/lib/combat-battles/api";

export default function CombatBattleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error, refetch } = useBattleDetail(slug);

  useEffect(() => {
    if (data?.title) document.title = `${data.title} · Combat Sim Battles`;
  }, [data?.title]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8" aria-busy="true">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof BattlesApiError && error.isNotFound;
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" aria-hidden />
        <p className="mb-2 font-medium">
          {notFound ? "This battle isn't available." : "We couldn't load this battle."}
        </p>
        <Link to="/lol/combat-battles" className="text-sm font-medium text-primary underline">
          Back to all battles
        </Link>
      </div>
    );
  }
  if (!data) return null;

  const leftName = data.left.champion;
  const rightName = data.right.champion;
  const boundary = nextBoundary(data.status, data);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link
        to="/lol/combat-battles"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All battles
      </Link>

      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold md:text-3xl">{data.title}</h1>
          <StatusBadge status={data.status} />
        </div>
        {data.description && <p className="mt-1 text-muted-foreground">{data.description}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Opens {fmtDateTime(data.open_at)}</span>
          <span>Locks {fmtDateTime(data.lock_at)}</span>
          <span>Reveals {fmtDateTime(data.reveal_at)}</span>
        </div>
        {boundary && (
          <Countdown
            className="mt-2"
            label={boundary.label}
            targetIso={boundary.at}
            onBoundary={() => refetch()}
          />
        )}
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{FORMAT_EXPLANATION}</p>
        </div>
      </header>

      {/* Sides */}
      <div className="relative grid gap-4 md:grid-cols-2">
        <SideConfig side="left" data={data.left} highlight={data.result?.winner_side === "left"} />
        <SideConfig side="right" data={data.right} highlight={data.result?.winner_side === "right"} />
        <div className="pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 md:block">
          <div className="rounded-full border bg-background p-2">
            <Swords className="h-5 w-5 text-primary" aria-hidden />
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Prediction + community */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/30 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your prediction</CardTitle>
          </CardHeader>
          <CardContent>
            <PredictionPanel
              slug={data.slug}
              status={data.status}
              myPrediction={data.my_prediction}
              leftName={leftName}
              rightName={rightName}
              openAt={data.open_at}
              lockAt={data.lock_at}
              onServerStateChanged={() => refetch()}
            />
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Community</CardTitle>
          </CardHeader>
          <CardContent>
            <CommunitySplit summary={data.prediction_summary} leftName={leftName} rightName={rightName} />
          </CardContent>
        </Card>
      </div>

      {/* Result (only after reveal) + personal result */}
      {data.status === "revealed" && data.result && (
        <div className="mt-6 space-y-6">
          <RevealedResult
            result={data.result}
            leftName={leftName}
            rightName={rightName}
            engine={data.engine}
          />
        </div>
      )}

      <div className="mt-6 space-y-6">
        <PersonalResult
          status={data.status}
          myPrediction={data.my_prediction}
          myResult={data.my_prediction_result}
          leftName={leftName}
          rightName={rightName}
        />
        <ArenaScoreCard />
      </div>
    </div>
  );
}
