/**
 * Scope controls — "which professional games?".
 *
 * Every option is DATA from `/api/graph1/scope-values`; nothing here is a
 * hardcoded list, and only values with qualifying professional data are
 * offered. Each control carries the exact canonical value and shows the
 * friendly label, so "LCK" on screen sends "LoL Champions Korea".
 *
 * Changing a control issues a new REQUEST. Phase E moved scoping to the
 * server, so narrowing to a tournament fetches ~2 KB instead of downloading a
 * 520 KB race and hiding 99% of it in the browser.
 *
 * Layout: the two high-value controls (All Pro / Major Pro, and league) are
 * always visible; region, tournament, patch and dates live behind "More
 * filters" so the page stays a graph rather than a form. The section opens
 * itself when a shared link arrives already using one of them.
 */
import { useEffect, useId, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isScoped, type Graph1Scope } from "@/graph1/scope";
import {
  patchesNewestFirst,
  tournamentsForLeague,
  type Graph1ScopeOption,
  type Graph1ScopeValues,
} from "@/graph1/useGraph1ScopeValues";

const FIELD =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ScopeSelect({
  label,
  value,
  options,
  placeholder,
  loading,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Graph1ScopeOption[];
  placeholder: string;
  loading?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        className={FIELD}
        // The select stays usable while its list loads: the chosen value is
        // already in the URL, so only the OPTIONS are pending, not the scope.
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{loading ? "Loading…" : placeholder}</option>
        {/* A value from a shared link that is not in the list (retired league,
            truncated dimension) still renders, rather than silently resetting
            the reader's scope to "all". */}
        {value && !options.some((o) => o.value === value) && (
          <option value={value}>{value}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.games ? ` (${option.games.toLocaleString()})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface ScopeControlsProps {
  scope: Graph1Scope;
  onChange: (next: Graph1Scope) => void;
  values?: Graph1ScopeValues;
  loading?: boolean;
  error?: boolean;
}

export default function ScopeControls({
  scope,
  onChange,
  values,
  loading,
  error,
}: ScopeControlsProps) {
  const advancedInUse = Boolean(
    scope.region || scope.tournament || scope.patch || scope.dateFrom || scope.dateTo,
  );
  const [open, setOpen] = useState(advancedInUse);
  // A shared link may land on an advanced scope; open the section so the
  // reader can see what is narrowing their graph rather than hunting for it.
  useEffect(() => {
    if (advancedInUse) setOpen(true);
  }, [advancedInUse]);

  const patch = patchesNewestFirst(values);
  const tournaments = tournamentsForLeague(values, scope.league);
  const fromId = useId();
  const toId = useId();

  return (
    <section aria-label="Scope" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label="Professional play"
          className="flex rounded-md border border-border p-0.5"
        >
          {/* "All Pro Play" is the backend's broad professional universe — a
              filtered universe already. It is NOT raw canonical data, and no
              control here can ask for that. */}
          <Button
            type="button"
            size="sm"
            variant={scope.major ? "ghost" : "secondary"}
            aria-pressed={!scope.major}
            onClick={() => onChange({ ...scope, major: false })}
          >
            All Pro Play
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope.major ? "secondary" : "ghost"}
            aria-pressed={scope.major}
            onClick={() => onChange({ ...scope, major: true })}
          >
            Major Pro
          </Button>
        </div>

        <div className="min-w-[12rem] flex-1">
          <ScopeSelect
            label="League"
            placeholder="All leagues"
            loading={loading}
            value={scope.league}
            options={values?.leagues.values ?? []}
            onChange={(league) =>
              // A tournament belongs to one league, so keeping it across a
              // league change would compose a scope with no games in it.
              onChange({ ...scope, league, tournament: undefined })
            }
          />
        </div>

        {isScoped(scope) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange({ major: false })}
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Clear scope
          </Button>
        )}
      </div>

      {error && (
        <p role="status" className="text-xs text-muted-foreground">
          Scope options are unavailable right now — the graph below still works
          across all pro play.
        </p>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="px-2">
            <ChevronDown
              className={`mr-1 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            More filters
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScopeSelect
              label="Tournament"
              placeholder={
                scope.league ? "All tournaments in this league" : "All tournaments"
              }
              loading={loading}
              value={scope.tournament}
              options={tournaments}
              onChange={(tournament) => onChange({ ...scope, tournament })}
            />
            <ScopeSelect
              label="Region"
              placeholder="All regions"
              loading={loading}
              value={scope.region}
              options={values?.regions.values ?? []}
              onChange={(region) => onChange({ ...scope, region })}
            />
            <ScopeSelect
              label="Patch"
              placeholder="All patches"
              loading={loading}
              value={scope.patch}
              options={patch}
              onChange={(p) => onChange({ ...scope, patch: p })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor={fromId} className="block text-xs text-muted-foreground">
                  From
                </label>
                <input
                  id={fromId}
                  type="date"
                  className={FIELD}
                  value={scope.dateFrom ?? ""}
                  onChange={(e) =>
                    onChange({ ...scope, dateFrom: e.target.value || undefined })
                  }
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={toId} className="block text-xs text-muted-foreground">
                  To
                </label>
                <input
                  id={toId}
                  type="date"
                  className={FIELD}
                  value={scope.dateTo ?? ""}
                  onChange={(e) =>
                    onChange({ ...scope, dateTo: e.target.value || undefined })
                  }
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
