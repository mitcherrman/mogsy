/**
 * Daily three acts (V2) — the arena's progression strip, grouped by SET.
 *
 * A three-act Standard is nineteen segments. Drawn as nineteen plates it is a
 * row of 14px specks on a 320px phone; drawn as the five-slot window it hides
 * where the player is in the day. The server publishes the day's plan (six
 * E/M/H sets and one Meta Reflex sprint, `threeActsPlan.ts`), so this strip
 * draws SEVEN groups: each set is one chip with three pips (Easy · Medium ·
 * Hard), the sprint is one chip. The phone bar shows a three-group window of
 * the same groups (`windowSetTimeline`). It is still progression only — every
 * state and verdict comes from the arena's own round timeline; nothing here is
 * a result.
 *
 * Fixed geometry: equal columns (7, or 3 in the phone window), fixed height in
 * every state, so advancing a round recolours pips and never lays anything out.
 */
import type { ResultKind } from "@/lib/ranked-core/viewTypes";
import type { SetTimelineGroup, SetTimelineView } from "@/lib/daily-v2/threeActsPlan";

const OUTCOME_INK: Record<ResultKind, string> = {
  correct: "#6ee7b7",
  "both-correct": "#e8c97a",
  incorrect: "#e2757b",
  "timed-out": "#a9b3c1",
};
const OUTCOME_WORD: Record<ResultKind, string> = {
  correct: "correct",
  "both-correct": "correct",
  incorrect: "incorrect",
  "timed-out": "timed out",
};
const BAND_WORD = { E: "easy", M: "medium", H: "hard" } as const;
const ACT_INK = { early: "#9fd3a8", mid: "#e8c97a", late: "#e79a8f" } as const;

function groupLabel(group: SetTimelineGroup): string {
  const steps = group.steps.map((s) => {
    const band = s.band ? `${BAND_WORD[s.band]} ` : "";
    const what = s.state === "current" ? "current"
      : s.outcome ? OUTCOME_WORD[s.outcome] : s.state === "resolved" ? "done" : "upcoming";
    return `${band}${what}`;
  });
  return `${group.spoken}: ${steps.join(", ")}`;
}

export function SetTimeline({ view, className = "", testIdPrefix = "" }: {
  view: SetTimelineView;
  className?: string;
  testIdPrefix?: string;
}) {
  return (
    <section
      data-testid={`${testIdPrefix}daily-set-timeline`}
      data-current-group={view.currentGroupIndex === null ? "" : String(view.currentGroupIndex)}
      data-current-round={view.currentRoundNumber === null ? "" : String(view.currentRoundNumber)}
      aria-label={`Daily sets, ${view.totalSegments} segments`}
      className={`px-1 ${className}`}
    >
      <ol className="m-0 grid h-[3.4rem] w-full list-none items-center gap-[3px] p-0 sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${view.groups.length}, minmax(0, 1fr))` }}>
        {view.groups.map((group) => {
          const current = group.state === "current";
          return (
            <li key={group.key}
              data-testid={`${testIdPrefix}daily-set-${group.key}`}
              data-state={group.state}
              data-kind={group.kind}
              aria-label={groupLabel(group)}
              aria-current={current ? "step" : undefined}
              className={`flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md border
                ${current ? "border-[#f0d78c] bg-[#1d2a3d] shadow-[0_0_0_1px_rgba(240,215,140,0.45)]"
                  : group.state === "done" ? "border-white/15 bg-[#121b28]" : "border-white/10 bg-[#0d141f]"}`}
            >
              <span aria-hidden
                className="block max-w-full truncate text-[10px] font-extrabold uppercase leading-none tracking-[0.06em]"
                style={{ color: group.act ? ACT_INK[group.act] : "#7fd6ef",
                  opacity: group.state === "upcoming" ? 0.6 : 1 }}>
                {group.label}
              </span>
              <span aria-hidden className="flex items-center gap-[3px]">
                {group.steps.map((step) => (
                  <span key={step.roundNumber}
                    data-testid={`${testIdPrefix}daily-set-step-${step.roundNumber}`}
                    data-state={step.state}
                    data-outcome={step.outcome ?? ""}
                    className={`block rounded-full ${group.kind === "meta_reflex" ? "h-1.5 w-4" : "h-1.5 w-1.5"}
                      ${step.state === "current" ? "ring-1 ring-[#f0d78c]" : ""}`}
                    style={{ backgroundColor: step.outcome ? OUTCOME_INK[step.outcome]
                      : step.state === "current" ? "#f0d78c"
                        : step.state === "resolved" ? "#5d6b7e" : "#2a3646" }} />
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
