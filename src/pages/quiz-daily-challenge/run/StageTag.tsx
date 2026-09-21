/**
 * DCMOD-E — the stage's NAME, everywhere it appears, and the day's ladder.
 *
 * `StageTag` is the one way a stage's mode is written: the lineup, the stage
 * intro, the in-match header, the stage result and the final recap all use it,
 * so "TIME TRIAL" looks the same every time a player meets it. Reusable
 * ruleset stages and the Daily's special stages are told apart by treatment;
 * Review wears the closing (gold) treatment wherever it shows.
 */
import type { DailyRun, DailyStage } from "@/lib/daily-challenge/run/contracts";
import { specialStageRulesetLabel, stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";

export function StageTag({ stage, size = "sm" }: {
  stage: Pick<DailyStage, "kind" | "ruleset">;
  size?: "sm" | "lg";
}) {
  const id = stageIdentity(stage);
  const extra = specialStageRulesetLabel(stage);
  const closing = stage.kind === "review";
  const tone = closing
    ? "border-amber-300/70 bg-amber-300/15 text-amber-200"
    : id.family === "special"
      ? "border-sky-300/60 bg-sky-300/10 text-sky-200"
      : "border-[rgba(240,215,140,0.55)] bg-black/30 text-[var(--ranked-vellum,#f1e6c8)]";
  const scale = size === "lg"
    ? "px-3.5 py-1 text-sm tracking-[0.22em]" : "px-2 py-0.5 text-[0.6875rem] tracking-[0.18em]";
  return (
    <span data-testid="daily-stage-tag" data-stage-kind={stage.kind}
      data-stage-family={id.family} data-closing={closing ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-sm border font-semibold uppercase ${tone} ${scale}`}>
      {id.label}
      {extra && (
        <span data-testid="daily-stage-ruleset-tag" className="opacity-80">· {extra}</span>
      )}
    </span>
  );
}

/**
 * The day's stages, in order, with where the player is. Pure: status comes
 * off the snapshot. `highlight` marks the stage a beat is about.
 */
export function StageLadder({ run, highlight = null }: {
  run: DailyRun;
  highlight?: string | null;
}) {
  return (
    <ol data-testid="daily-stage-ladder" aria-label="Today's stages"
      className="flex flex-wrap items-center justify-center gap-2">
      {run.stages.map((s) => {
        const id = stageIdentity(s);
        const done = s.status === "completed";
        const skipped = s.status === "skipped";
        const current = run.currentStageIndex === s.index;
        return (
          <li key={s.id} data-testid={`daily-ladder-${s.index}`}
            data-stage-kind={s.kind} data-stage-status={s.status}
            data-current={current ? "true" : undefined}
            data-highlight={highlight === s.id ? "true" : undefined}
            className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[0.6875rem] uppercase tracking-[0.16em] ${
              highlight === s.id || current
                ? "border-[rgba(240,215,140,0.8)] text-[var(--ranked-vellum,#f1e6c8)]"
                : "border-white/15 text-[var(--ranked-muted,#a8a29e)]"} ${
              skipped ? "line-through opacity-60" : ""}`}>
            <span aria-hidden className="tabular-nums opacity-70">{s.index + 1}</span>
            <span>{id.label}</span>
            {done && <span aria-label="complete">✓</span>}
          </li>
        );
      })}
    </ol>
  );
}
