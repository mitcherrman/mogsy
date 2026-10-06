import { useId, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { IMPACT_CHECKPOINTS, IMPACT_MAX_LEVEL, IMPACT_MIN_LEVEL, clampImpactLevel } from "@/lib/patch-impact/math";
import type { StatProjection } from "@/lib/patch-impact/types";
import { cn } from "@/lib/utils";
import { ShareLinkButton } from "@/components/patch-hub-share/ShareLinkButton";
import { formatDelta, formatRelative, formatStatValue, projectedStatLabel } from "./format";
import { PROVENANCE_COPY, describeProjectionInputs, impactProvenanceKind } from "./provenance";

const WRAP = "[overflow-wrap:anywhere]";

/** PageUp / PageDown move by this many levels (a native range steps more coarsely and less consistently). */
const PAGE_STEP = 3;

type Tick = { level: number; crossover: boolean };

/** 1 / 6 / 11 / 18, plus the crossover level when the domain reports one. */
function ticksFor(crossoverLevel: number | null): Tick[] {
  const levels = new Set<number>([...IMPACT_CHECKPOINTS]);
  if (crossoverLevel !== null) levels.add(crossoverLevel);
  return [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({ level, crossover: level === crossoverLevel }));
}

const tickText = ({ level, crossover }: Tick): string => {
  if (!crossover) return String(level);
  return (IMPACT_CHECKPOINTS as readonly number[]).includes(level) ? `${level} · crosses` : `Crosses at ${level}`;
};

const tickLabel = ({ level, crossover }: Tick): string =>
  crossover ? `Level ${level}, where the difference changes sign` : `Level ${level}`;

const Cell = ({ label, children, testId }: { label: string; children: ReactNode; testId: string }) => (
  <div className="min-w-0 space-y-0.5">
    <dt className="text-[11px] text-muted-foreground">{label}</dt>
    <dd data-testid={testId} className={cn("font-mono text-sm font-semibold tabular-nums text-foreground", WRAP)}>
      {children}
    </dd>
  </div>
);

/**
 * The detailed level view for one projected change. Pure presentation: every
 * number is read from `projection.levels` (already computed by the domain
 * layer); nothing here does stat math.
 */
export const PatchImpactExplore = ({
  projection,
  level,
  onLevelChange,
  shareChange,
}: {
  projection: StatProjection;
  level: number;
  onLevelChange: (level: number) => void;
  shareChange?: { url: string; title: string; label: string };
}) => {
  const labelId = useId();
  const hintId = useId();
  const statLabel = projectedStatLabel(projection.family);
  const point = projection.levels[level - 1] ?? projection.levels[projection.levels.length - 1];
  const rel = formatRelative(point.relDelta);
  const ticks = ticksFor(projection.crossoverLevel);
  const provenanceKind = impactProvenanceKind({
    status: "projected",
    family: projection.family,
    facts: [],
    projection,
  });
  const inputs = describeProjectionInputs(projection);
  const valueText = `Level ${point.level}: ${formatStatValue(point.before)} → ${formatStatValue(point.after)} ${statLabel}`;
  const baseUnchanged = projection.inputs.baseBefore.value === projection.inputs.baseAfter.value;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onLevelChange(clampImpactLevel(next));
  };

  // Native range keys already do most of this; handling them explicitly makes
  // every browser step the same way (and Home/End/Page keys identical). The
  // default is prevented so a key never steps twice.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = level + 1;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = level - 1;
        break;
      case "PageUp":
        next = level + PAGE_STEP;
        break;
      case "PageDown":
        next = level - PAGE_STEP;
        break;
      case "Home":
        next = IMPACT_MIN_LEVEL;
        break;
      case "End":
        next = IMPACT_MAX_LEVEL;
        break;
    }
    if (next === null) return;
    event.preventDefault();
    onLevelChange(clampImpactLevel(next));
  };

  return (
    <div data-testid="patch-impact-explore-body" className="min-w-0 max-w-full space-y-3 pt-2">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <label id={labelId} htmlFor={`${labelId}-range`} className="text-[11px] font-medium text-muted-foreground">
            Projected stat impact · champion level
          </label>
          <span aria-hidden className="font-mono text-sm font-semibold tabular-nums text-foreground">
            Level {point.level}
          </span>
        </div>
        <input
          id={`${labelId}-range`}
          data-testid="patch-impact-level"
          type="range"
          min={IMPACT_MIN_LEVEL}
          max={IMPACT_MAX_LEVEL}
          step={1}
          value={level}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-labelledby={labelId}
          aria-valuetext={valueText}
          aria-describedby={hintId}
          className="block h-11 w-full min-w-0 cursor-pointer accent-[#c9a84c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
        />
        <ul aria-label="Jump to level" className="flex flex-wrap gap-1.5">
          {ticks.map((tick) => (
            <li key={tick.level}>
              <button
                type="button"
                data-testid={`patch-impact-tick-${tick.level}`}
                data-crossover={tick.crossover ? "true" : undefined}
                aria-label={tickLabel(tick)}
                aria-pressed={level === tick.level}
                onClick={() => onLevelChange(tick.level)}
                className={cn(
                  "min-h-10 min-w-10 rounded-md border px-2.5 text-xs font-medium tabular-nums",
                  "transition-colors motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
                  level === tick.level
                    ? "border-[#c9a84c]/70 bg-[#c9a84c]/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {tickText(tick)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <dl
        data-testid="patch-impact-readout"
        data-level={point.level}
        className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4"
      >
        <Cell label={`Before, ${statLabel}`} testId="patch-impact-before">
          {formatStatValue(point.before)}
        </Cell>
        <Cell label={`After, ${statLabel}`} testId="patch-impact-after">
          {formatStatValue(point.after)}
        </Cell>
        <Cell label="Difference" testId="patch-impact-difference">
          {formatDelta(point.absDelta, "flat", "projected")}
        </Cell>
        <Cell label="Relative difference" testId="patch-impact-relative">
          {rel ?? (
            <>
              <span aria-hidden>{"—"}</span>
              <span className="sr-only">Not defined, the before value is 0</span>
            </>
          )}
        </Cell>
      </dl>

      <div id={hintId} className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        {projection.crossoverLevel !== null && (
          <p data-testid="patch-impact-crossover">
            The difference changes sign at level {projection.crossoverLevel}.
          </p>
        )}
        {point.level === IMPACT_MIN_LEVEL && baseUnchanged && (
          <p>This change grows with level, so there is no difference at level 1.</p>
        )}
        {point.relDelta === null && (
          <p>A relative difference is not defined when the before value is 0.</p>
        )}
      </div>

      <div data-testid="patch-impact-provenance" data-provenance={provenanceKind ?? undefined} className="space-y-1.5 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
        <p className="font-medium">Where these numbers come from</p>
        <dl className="space-y-1.5">
          {inputs.map((input) => (
            <div key={input.key} data-testid={`patch-impact-source-${input.key}`} data-mogzy-data={input.usesMogzyData ? "true" : "false"}>
              <dt className={cn("inline", WRAP)}>
                <span className="font-medium text-foreground/80">{input.label}</span>{" "}
                <span className="font-mono tabular-nums">{input.values}</span>
              </dt>{" "}
              <dd className={cn("inline", WRAP)}>
                <span aria-hidden>{"· "}</span>
                {input.source}.
              </dd>
            </div>
          ))}
        </dl>
        {projection.trust.laterVersionsChecked.length > 0 && (
          <p className={WRAP}>Later patches checked: {projection.trust.laterVersionsChecked.join(", ")}.</p>
        )}
        {provenanceKind && <p className={WRAP}>{PROVENANCE_COPY[provenanceKind].long}</p>}
      </div>

      {shareChange && (
        <ShareLinkButton
          testId="patch-impact-share"
          url={shareChange.url}
          title={shareChange.title}
          label={shareChange.label}
          text="Copy link to this change"
          className="-ml-2"
        />
      )}
    </div>
  );
};
