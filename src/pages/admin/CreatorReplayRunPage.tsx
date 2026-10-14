import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { DailyRunPage } from "@/pages/quiz-daily-challenge/run/DailyRunPage";
import { httpDailyRunTransport, type DailyRunTransport } from "@/lib/daily-challenge/run/client";
export default function CreatorReplayRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const transport = useMemo<DailyRunTransport>(() => ({
    ...httpDailyRunTransport,
    readToday: () => httpDailyRunTransport.readRun(runId || ""),
    startToday: () => httpDailyRunTransport.readRun(runId || ""),
  }), [runId]);
  if (!runId || !/^dr_[a-f0-9]{24}$/.test(runId)) {
    return <main className="p-6" role="alert">Invalid filming run. <Link to="/admin/creator-replay">Back to Creator Replay</Link></main>;
  }
  return <div data-testid="creator-replay-run">
    <div className="relative z-20 flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
      <span className="text-sm font-semibold">Creator Replay · Non-official</span>
      <Link className="text-sm underline" to="/admin/creator-replay">New take</Link>
    </div>
    <DailyRunPage transport={transport} />
  </div>;
}
