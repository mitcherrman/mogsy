/**
 * Small shared control primitives for the team-sim editor.
 *
 * Native <select> / <input> rather than the portal-based Radix Select: this is
 * an operator surface whose correctness is asserted by tests, and a native
 * control is both keyboard-typeahead friendly for a 172-entry champion list
 * and directly drivable by testing-library.
 */
import { useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const FIELD_CLASS =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm " +
  "text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  placeholder,
  allowEmpty = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="number"
          className={FIELD_CLASS}
          value={value === null ? "" : value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(allowEmpty ? null : (min ?? 0));
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isNaN(parsed) ? (allowEmpty ? null : (min ?? 0)) : parsed);
          }}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  // Memoized by options identity: React skips reconciling a children subtree
  // whose element objects are referentially unchanged, which matters for the
  // 172-entry champion list rendered four times over.
  const optionNodes = useMemo(
    () =>
      options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      )),
    [options]
  );

  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select
          id={id}
          className={FIELD_CLASS}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {optionNodes}
        </select>
      )}
    </Field>
  );
}

export type PickerEntry = {
  name: string;
  supported: boolean;
  /** Rendered next to a disabled entry so "why not" is visible. */
  reason?: string;
  group?: string;
};

/**
 * Searchable multi-select over catalog entries.
 *
 * Unsupported entries are rendered DISABLED with their backend-provided
 * reason rather than hidden: the operator can see the simulator knows the
 * name and declines to model it, and no code path can select one.
 */
export function CatalogPicker({
  label,
  entries,
  selected,
  onToggle,
  onClear,
  max,
  emptyLabel,
  testId,
}: {
  label: string;
  entries: PickerEntry[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  max: number;
  emptyLabel: string;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [showUnsupported, setShowUnsupported] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = showUnsupported ? entries : entries.filter((e) => e.supported);
    const matched = needle
      ? pool.filter((e) => e.name.toLowerCase().includes(needle))
      : pool;
    // Bounded render: a 197-item catalog behind a search box does not need to
    // paint every row, and an unbounded list makes the mobile layout unusable.
    return matched.slice(0, 60);
  }, [entries, query, showUnsupported]);

  const atLimit = selected.length >= max;

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label} ({selected.length}/{max})
        </span>
        {selected.length > 0 ? (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {selected.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="rounded bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground hover:bg-secondary/70"
                onClick={() => onToggle(name)}
                aria-label={`Remove ${name}`}
              >
                {name} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">{emptyLabel}</p>
      )}

      <input
        type="search"
        className={FIELD_CLASS}
        placeholder={`Search ${label.toLowerCase()}…`}
        value={query}
        aria-label={`Search ${label}`}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="max-h-40 overflow-auto rounded border border-border">
        <ul>
          {visible.map((entry) => {
            const isSelected = selected.includes(entry.name);
            const blocked = !entry.supported || (atLimit && !isSelected);
            return (
              <li key={entry.name}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onToggle(entry.name)}
                  title={entry.name}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs",
                    isSelected ? "bg-primary/15 font-medium" : "hover:bg-muted",
                    blocked && "cursor-not-allowed opacity-50"
                  )}
                >
                  {/* min-w-0 is load-bearing: `truncate` sets white-space:nowrap,
                      and without it this flex item's min-content width is the
                      full string. Some catalog `known_unsupported` names are
                      long CMS boilerplate ("<rarityLegendary>…"), which pushed
                      the whole combatant card past a 375px viewport. */}
                  <span className="min-w-0 truncate">{entry.name}</span>
                  <span className="max-w-[45%] shrink-0 truncate text-[10px] text-muted-foreground">
                    {!entry.supported
                      ? (entry.reason ?? "not simulated")
                      : (entry.group ?? "")}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li className="px-2 py-2 text-[11px] text-muted-foreground">No matches.</li>
          ) : null}
        </ul>
      </div>

      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={showUnsupported}
          onChange={(e) => setShowUnsupported(e.target.checked)}
        />
        Show known-but-unsupported entries
      </label>
    </div>
  );
}
