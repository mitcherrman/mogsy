/**
 * MISC W3A (F05) — frontend-only geometry fixture for the Daily result pages.
 *
 * Renders the REAL result components (DailyMainResult, DailyStageResult,
 * DailyCompletion, OptionalEntryBeat) inside the REAL ArenaShell + DailyStageChrome,
 * wrapped the way `Layout` and `DailyRunPage.shell` wrap them (html `dark theme-lol`,
 * header-band reservation, `main` reading column, `flex flex-1 flex-col justify-center`
 * stage frame). No auth, no backend: the discoveries read goes to
 * `/api/ranked/matches/:id/discoveries`, which the capture script answers.
 *
 * Query:  view=main|stage|optional|completion
 *         phase=pending|settled       (main, stage)      default settled
 *         flip=<ms>                   (pending → settled on the same mount)
 *         kind=standard|time_trial|survival|weak_areas|review   (stage)
 *         legacy=1                    (plan v1 day instead of plan v5)
 *         perfect=1                   (completion: a perfect day)
 *         error=1                     (an error + Try again under the actions)
 *         fonts=system                (no bundled Inter/Cinzel: the OS fallback faces)
 *         fonts=wide                  (stress: Verdana / DejaVu Sans for everything)
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@/index.css";
import { ArenaShell } from "@/components/ranked-arena/ArenaShell";
import { DailyStageChrome } from "@/pages/quiz-daily-challenge/run/DailyStageChrome";
import { DailyMainResult } from "@/pages/quiz-daily-challenge/run/DailyMainResult";
import { DailyStageResult } from "@/pages/quiz-daily-challenge/run/DailyStageResult";
import { DailyCompletion } from "@/pages/quiz-daily-challenge/run/DailyCompletion";
import { OptionalEntryBeat } from "@/pages/quiz-daily-challenge/run/DailyRunBeats";
import {
  FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, fixtureRun, fixtureV5Run, wireResult,
} from "@/lib/daily-challenge/run/fixtures";
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";

type Kind = DailyStage["kind"];
const q = new URLSearchParams(location.search);
const view = q.get("view") ?? "main";
const kind = (q.get("kind") ?? "time_trial") as Kind;
const legacy = q.get("legacy") === "1";
const perfect = q.get("perfect") === "1";
const withError = q.get("error") === "1";
const guestSave = q.get("guest") === "1";
const flipMs = Number(q.get("flip") ?? 0);
const startPhase = (q.get("phase") ?? "settled") as "pending" | "settled";

const RESULT: Record<Kind, ReturnType<typeof wireResult>> = {
  standard: wireResult({ correct: 9, answered: 10, score: 16, misses: 1 }),
  time_trial: wireResult({ correct: 14, answered: 17, score: 1180, ended_by: "time_bank_exhausted", misses: 3 }),
  survival: wireResult({ correct: 11, answered: 14, score: 940, ended_by: "strikes_exhausted", misses: 3 }),
  weak_areas: wireResult({ correct: 6, answered: 8, score: 12, misses: 2 }),
  order_forge: wireResult({ correct: 6, answered: 8, score: 12, misses: 2 }),
  review: wireResult({ correct: 2, answered: 3, score: 3, misses: 1 }),
};

const done = (k: Kind, i: number) => ({
  status: "completed", child_match_id: `m-${i}-${k}`, result: RESULT[k],
});

/** A day whose stages up to `through` are completed; `through` itself settled or not. */
function dayAt(through: number, settled: boolean): { run: DailyRun; stage: DailyStage } {
  const specs = legacy ? FOUR_STAGE_DAY : V5_ELIGIBLE_DAY;
  const over: Record<number, Record<string, unknown>> = {};
  specs.forEach((s, i) => {
    if (i < through || (i === through && settled)) over[i] = done(s.kind as Kind, i);
    else if (i === through) over[i] = { status: "in_progress", child_match_id: `m-${i}-${s.kind}` };
  });
  const last = through === specs.length - 1 && settled;
  const base = {
    current_stage_index: settled ? Math.min(through + 1, specs.length - 1) : through,
    ...(last ? { status: "completed", outcome: "reviewed" } : {}),
  };
  const run = legacy
    ? fixtureRun(specs, base, over)
    : fixtureV5Run(specs, {
      ...base,
      main_completed_at: through > 0 || settled ? "2026-10-17T12:00:00Z" : null,
      main_score: through > 0 || settled ? 1234 : null,
    }, over);
  return { run, stage: run.stages[through] };
}

function completeDay(): DailyRun {
  const specs = legacy ? FOUR_STAGE_DAY : V5_ELIGIBLE_DAY;
  const over: Record<number, Record<string, unknown>> = {};
  specs.forEach((s, i) => {
    if (perfect && s.kind === "review") over[i] = { status: "skipped", result: null };
    else over[i] = done(s.kind as Kind, i);
  });
  const base = {
    status: "completed", outcome: perfect ? "perfect" : "reviewed",
    current_stage_index: specs.length - 1,
  };
  return legacy ? fixtureRun(specs, base, over)
    : fixtureV5Run(specs, { ...base, main_completed_at: "2026-10-17T12:00:00Z", main_score: 1234 }, over);
}

const noop = () => {};

function Scene() {
  const [phase, setPhase] = useState(startPhase);
  useEffect(() => {
    if (!flipMs) return;
    const t = window.setTimeout(() => setPhase("settled"), flipMs);
    return () => window.clearTimeout(t);
  }, []);
  const settled = phase === "settled";
  const err = withError ? "We couldn't reach the server. Try again." : null;

  let run: DailyRun;
  let stage: DailyStage | null = null;
  let node: JSX.Element;
  if (view === "completion") {
    run = completeDay();
    node = <DailyCompletion run={run} saveRequired={guestSave} />;
  } else if (view === "optional") {
    ({ run, stage } = dayAt(0, true));
    node = <OptionalEntryBeat run={run} stage={run.stages[1]} onPlayOptional={noop} onDone={noop} />;
    stage = null;
  } else if (view === "stage") {
    const specs = legacy ? FOUR_STAGE_DAY : V5_ELIGIBLE_DAY;
    const idx = Math.max(0, specs.findIndex((s) => s.kind === kind));
    ({ run, stage } = dayAt(idx, settled));
    node = (
      <DailyStageResult run={run} stage={stage} error={err} onRetry={noop}
        onProceed={settled ? noop : undefined} onDone={legacy ? undefined : noop}
        onMoreChallenges={legacy || !settled ? undefined : noop}
        onReviewDiscoveries={noop} />
    );
  } else {
    ({ run, stage } = dayAt(0, settled));
    node = (
      <DailyMainResult run={run} stage={stage} error={err} onRetry={noop}
        onProceed={settled ? noop : undefined} onDone={noop}
        onMoreChallenges={settled ? noop : undefined} onReviewDiscoveries={noop}
        guestSaveEligible={guestSave} onSaveScore={noop} />
    );
  }
  const header = <DailyStageChrome run={run} stage={view === "stage" || view === "main" ? stage : null} />;
  return (
    <MemoryRouter>
      <div className="min-h-dvh relative pt-[var(--app-header-h)] pb-bottom-nav">
        <main className="relative z-20 w-full max-w-7xl mx-auto px-0 md:px-4 lg:px-8">
          <ArenaShell size="wide" header={header}>
            <div data-testid="daily-run" className="flex flex-1 flex-col justify-center">
              {node}
            </div>
          </ArenaShell>
        </main>
      </div>
    </MemoryRouter>
  );
}

// The app's real faces (see fonts/fonts.css) are loaded BEFORE first paint, so
// every measurement sees real glyph widths; `fonts=system` drops them to measure
// the OS fallback instead (how a platform difference is diagnosed).
async function start() {
  if (q.get("fonts") === "system" || q.get("fonts") === "wide") {
    document.getElementById("w3a-fonts")?.remove();
    if (q.get("fonts") === "wide") {
      // Stress mode: one wide humanist face everywhere (Verdana, or DejaVu Sans on
      // Linux), to prove the settlement frame and tiles hold for a face wider than Inter.
      const st = document.createElement("style");
      st.textContent = '*{font-family:Verdana,"DejaVu Sans",sans-serif !important}';
      document.head.appendChild(st);
    }
  } else {
    await Promise.all([
      "400 16px Inter", "500 16px Inter", "600 16px Inter", "700 16px Inter", "900 16px Inter",
      "500 16px Cinzel", "700 16px Cinzel", "900 16px Cinzel",
    ].map((f) => document.fonts.load(f)));
  }
  createRoot(document.getElementById("root")!).render(<Scene />);
}
void start();
