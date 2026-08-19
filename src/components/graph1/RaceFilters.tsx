/**
 * Filter surface — SECONDARY and collapsed by default.
 *
 * Playback stays immediately accessible above; filters live behind a
 * disclosure so the approved visual is not cluttered. Which filters exist is
 * decided by the dataset's declared control schema, not by conditionals in
 * here, and the value domains come from facets derived over the loaded
 * events.
 *
 * Built on native <details>/<summary>, <select> and <input> so it matches the
 * existing RaceControls language, stays keyboard-operable for free, and adds
 * no bundle weight.
 */
import { useMemo, useState } from "react";

import type { Graph1FilterSpec } from "@/graph1/contract";
import {
  isFilterActive,
  partitionFilterSpecs,
  type Graph1Facets,
  type Graph1FilterState,
} from "@/graph1/filters";

export interface RaceFiltersProps {
  specs: Graph1FilterSpec[] | undefined;
  facets: Graph1Facets;
  state: Graph1FilterState;
  onChange: (next: Graph1FilterState) => void;
  /** events surviving the current filter, for the summary line */
  matchedCount: number;
  totalCount: number;
}

const MAX_COMBOBOX_ROWS = 40;

function YearRange({
  facets,
  state,
  onChange,
}: Pick<RaceFiltersProps, "facets" | "state" | "onChange">) {
  if (facets.years.length === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">Year</span>
      <select
        aria-label="First year"
        value={state.yearFrom ?? ""}
        onChange={(e) =>
          onChange({
            ...state,
            yearFrom: e.target.value ? Number(e.target.value) : null,
          })
        }
        className="rounded border border-border bg-background px-1.5 py-1 text-xs"
      >
        <option value="">Earliest</option>
        {facets.years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">to</span>
      <select
        aria-label="Last year"
        value={state.yearTo ?? ""}
        onChange={(e) =>
          onChange({
            ...state,
            yearTo: e.target.value ? Number(e.target.value) : null,
          })
        }
        className="rounded border border-border bg-background px-1.5 py-1 text-xs"
      >
        <option value="">Latest</option>
        {facets.years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxFacet({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  const chosen = new Set(selected);
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 shrink-0 pt-1 text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-1 whitespace-nowrap"
          >
            <input
              type="checkbox"
              checked={chosen.has(option.value)}
              onChange={() => onToggle(option.value)}
              className="h-3 w-3 accent-primary"
            />
            <span>{option.value}</span>
            <span className="tabular-nums text-muted-foreground">
              {option.count.toLocaleString()}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Searchable facet — the Azir race carries 301 leagues, so a flat list of
 * checkboxes is not navigable. Selected values always stay visible. */
function SearchableFacet({
  label,
  plural,
  options,
  selected,
  onToggle,
}: {
  label: string;
  plural: string;
  options: { value: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = new Set(selected);
  const selectedKey = selected.join("|");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? options.filter((o) => o.value.toLowerCase().includes(needle))
      : options;
    // selected values are pinned so they never scroll out of reach
    const pinned = options.filter((o) => chosen.has(o.value));
    const rest = matches.filter((o) => !chosen.has(o.value));
    return [...pinned, ...rest.slice(0, MAX_COMBOBOX_ROWS)];
  }, [options, query, selectedKey]);

  if (options.length === 0) return null;
  const hiddenCount = Math.max(0, options.length - visible.length);

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 shrink-0 pt-1 text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${options.length.toLocaleString()} ${plural}…`}
          aria-label={`Search ${label}`}
          className="w-full max-w-xs rounded border border-border bg-background px-1.5 py-1 text-xs"
        />
        <div className="flex max-h-40 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
          {visible.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              <input
                type="checkbox"
                checked={chosen.has(option.value)}
                onChange={() => onToggle(option.value)}
                className="h-3 w-3 accent-primary"
              />
              <span>{option.value}</span>
              <span className="tabular-nums text-muted-foreground">
                {option.count.toLocaleString()}
              </span>
            </label>
          ))}
        </div>
        {hiddenCount > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {hiddenCount.toLocaleString()} more — refine the search to see them
          </p>
        )}
      </div>
    </div>
  );
}

export default function RaceFilters({
  specs,
  facets,
  state,
  onChange,
  matchedCount,
  totalCount,
}: RaceFiltersProps) {
  const declared = new Set((specs ?? []).map((s) => s.id));
  const { advanced } = partitionFilterSpecs(specs);
  const advancedIds = new Set(advanced.map((s) => s.id));
  const active = isFilterActive(state);

  if (declared.size === 0) return null;

  const toggleValue = (
    key: "regions" | "leagues",
    value: string,
  ) => {
    const current = state[key];
    onChange({
      ...state,
      [key]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    });
  };

  return (
    <details className="rounded-md border border-border/60 text-sm">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium">
        Filters
        {active ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">
            {matchedCount.toLocaleString()} of {totalCount.toLocaleString()} games
          </span>
        ) : (
          <span className="text-[11px] font-normal text-muted-foreground">
            all {totalCount.toLocaleString()} games
          </span>
        )}
      </summary>

      <div className="space-y-3 border-t border-border/60 px-3 py-3">
        {declared.has("year") && (
          <YearRange facets={facets} state={state} onChange={onChange} />
        )}
        {declared.has("region") && !advancedIds.has("region") && (
          <CheckboxFacet
            label="Region"
            options={facets.regions}
            selected={state.regions}
            onToggle={(v) => toggleValue("regions", v)}
          />
        )}
        {declared.has("league") && (
          <SearchableFacet
            label="League"
            plural="leagues"
            options={facets.leagues}
            selected={state.leagues}
            onToggle={(v) => toggleValue("leagues", v)}
          />
        )}

        {active && (
          <button
            type="button"
            onClick={() =>
              onChange({
                yearFrom: null,
                yearTo: null,
                regions: [],
                leagues: [],
              })
            }
            className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            Clear filters
          </button>
        )}
      </div>
    </details>
  );
}
