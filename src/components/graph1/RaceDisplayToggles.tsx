/**
 * Display-toggle surface — SECONDARY and collapsed by default.
 *
 * Every toggle removes a layer; none adds one. The initial state is the
 * dataset's declared defaults, which reproduce the owner-approved live
 * appearance, so opening this panel and changing nothing is a no-op.
 *
 * A toggle whose layer the dataset does not carry (secondary team/region
 * label on a race that declares none, win overlay on data without wins) is
 * hidden rather than shown inert.
 */
import type { Graph1DisplayToggles } from "@/graph1/contract";

export interface RaceDisplayTogglesProps {
  toggles: Graph1DisplayToggles;
  defaults: Graph1DisplayToggles;
  onChange: (next: Graph1DisplayToggles) => void;
  /** capabilities of the loaded dataset */
  available: { winOverlay: boolean; secondaryLabel: boolean;
               contextLine: boolean };
}

const LABELS: Array<{ key: keyof Graph1DisplayToggles; label: string }> = [
  { key: "winOverlay", label: "Win overlay" },
  { key: "eventHeader", label: "Event header" },
  { key: "contextLine", label: "Context line" },
  { key: "entityMedia", label: "Entity image" },
  { key: "rankNumber", label: "Rank number" },
  { key: "valueLabel", label: "Value label" },
  { key: "dateLabel", label: "Date label" },
  { key: "secondaryLabel", label: "Team · region label" },
];

export default function RaceDisplayToggles({
  toggles,
  defaults,
  onChange,
  available,
}: RaceDisplayTogglesProps) {
  const shown = LABELS.filter(({ key }) => {
    if (key === "winOverlay") return available.winOverlay;
    if (key === "secondaryLabel") return available.secondaryLabel;
    if (key === "contextLine") return available.contextLine;
    return true;
  });
  const changed = shown.filter(({ key }) => toggles[key] !== defaults[key]);

  return (
    <details className="rounded-md border border-border/60 text-sm">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium">
        Display
        <span className="text-[11px] font-normal text-muted-foreground">
          {changed.length === 0
            ? "default"
            : `${changed.length} changed`}
        </span>
      </summary>

      <div className="border-t border-border/60 px-3 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {shown.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={toggles[key]}
                onChange={(e) =>
                  onChange({ ...toggles, [key]: e.target.checked })
                }
                className="h-3 w-3 accent-primary"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {changed.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...defaults })}
            className="mt-3 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            Reset display
          </button>
        )}
      </div>
    </details>
  );
}
