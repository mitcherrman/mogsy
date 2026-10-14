/**
 * Frontend-only geometry fixture: real ArenaShell, DailyStageChrome and
 * stage models; no API, auth, mutations or backend dependencies.
 */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@/index.css";
import { ArenaShell } from "@/components/ranked-arena/ArenaShell";
import { DailyStageChrome } from "@/pages/quiz-daily-challenge/run/DailyStageChrome";
import { V5_ELIGIBLE_DAY, fixtureV5Run } from "@/lib/daily-challenge/run/fixtures";
import type { DailyStage } from "@/lib/daily-challenge/run/contracts";

const run = fixtureV5Run(V5_ELIGIBLE_DAY);
const kind = new URLSearchParams(location.search).get("mode") ?? "standard";
const stage = run.stages.find((item) => item.kind === kind) ?? run.stages[0];
const stageWithLive: DailyStage = stage.kind === "time_trial"
  ? { ...stage, live: { timeBank: {
      totalMs: 90_000, remainingMs: 45_000,
      asOf: new Date().toISOString(), draining: false,
      answerableAt: null, deadline: null, answered: false,
    }, strikes: null } }
  : stage.kind === "survival"
    ? { ...stage, live: { timeBank: null, strikes: { used: 1, max: 3 } } }
    : stage;

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <main className="min-h-screen pt-[var(--app-header-h)]">
      <ArenaShell size="wide" header={<DailyStageChrome run={run} stage={stageWithLive} />}>
        <div data-testid="arena-first-content" className="ranked-panel h-40 rounded-md p-4">
          Arena starts here
        </div>
      </ArenaShell>
    </main>
  </MemoryRouter>,
);
